import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../../types';
import { HelmRelease } from '../../constructs/helm-release';
import { IrsaRole } from '../../constructs/irsa-role';
import { CRITICAL_ADDONS_TOLERATION } from '../../utils';

/**
 * Properties for KarpenterStack
 */
export interface KarpenterStackProps extends cdk.StackProps {
  /** Environment configuration */
  readonly config: EnvironmentConfig;

  /** EKS cluster */
  readonly cluster: eks.ICluster;

  /** VPC for security groups */
  readonly vpc: ec2.IVpc;
}

/**
 * Karpenter stack that deploys the Karpenter controller.
 *
 * This stack deploys ONLY the Karpenter controller and its dependencies:
 * - SQS queue for interruption handling
 * - EventBridge rules for spot interruption events
 * - IRSA role for Karpenter
 * - Node IAM role and instance profile
 * - Karpenter Helm chart
 *
 * @remarks
 * NodePools and EC2NodeClasses are intentionally **not** managed by this stack.
 * They are managed by ArgoCD GitOps (see the `aws-eks-gitops` repository).
 * This separation:
 * 1. Prevents Karpenter finalizer issues during `cdk destroy` (nodes must be
 *    drained before the controller is removed)
 * 2. Allows application teams to manage their own node configurations
 *    through pull requests to the GitOps repo
 * 3. Keeps the CDK stack focused on infrastructure-level concerns
 *
 * The node role name and instance profile name are exported as CloudFormation
 * outputs so the GitOps repo can reference them in EC2NodeClass manifests.
 *
 * @see {@link EnvironmentConfig.karpenter} for Karpenter configuration options
 */
export class KarpenterStack extends cdk.Stack {
  /** SQS queue for interruption handling */
  public readonly interruptionQueue: sqs.Queue;

  /** IAM role for Karpenter-managed nodes */
  public readonly nodeRole: iam.Role;

  /** Instance profile for Karpenter-managed nodes */
  public readonly instanceProfile: iam.CfnInstanceProfile;

  constructor(scope: Construct, id: string, props: KarpenterStackProps) {
    super(scope, id, props);

    const { config, cluster } = props;
    const clusterName = `${config.environment}-${config.cluster.name}`;

    // Create SQS queue for interruption handling
    this.interruptionQueue = new sqs.Queue(this, 'KarpenterInterruptionQueue', {
      queueName: `${clusterName}-karpenter`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.minutes(5),
    });

    // EventBridge rules for interruption events
    const eventRule = new events.Rule(this, 'KarpenterInterruptionRule', {
      eventPattern: {
        source: ['aws.ec2', 'aws.health'],
        detailType: [
          'EC2 Spot Instance Interruption Warning',
          'EC2 Instance Rebalance Recommendation',
          'EC2 Instance State-change Notification',
          'AWS Health Event',
        ],
      },
    });
    eventRule.addTarget(new targets.SqsQueue(this.interruptionQueue));

    // Create IRSA role for Karpenter
    new IrsaRole(this, 'KarpenterRole', {
      cluster,
      serviceAccount: 'karpenter',
      namespace: 'kube-system',
      policyStatements: this.getKarpenterPolicyStatements(config, clusterName),
    });

    // Create node IAM role for Karpenter-managed nodes
    this.nodeRole = new iam.Role(this, 'KarpenterNodeRole', {
      roleName: `${clusterName}-karpenter-node`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
      ],
    });

    // Create instance profile
    this.instanceProfile = new iam.CfnInstanceProfile(this, 'KarpenterInstanceProfile', {
      instanceProfileName: `${clusterName}-karpenter-node`,
      roles: [this.nodeRole.roleName],
    });

    // Deploy Karpenter controller
    new HelmRelease(this, 'Karpenter', {
      cluster,
      chart: 'karpenter',
      repository: 'oci://public.ecr.aws/karpenter/karpenter',
      version: config.helmConfigs.karpenter.version,
      namespace: 'kube-system',
      baseValues: config.helmConfigs.karpenter.values,
      values: {
        settings: {
          clusterName,
          clusterEndpoint: cluster.clusterEndpoint,
          interruptionQueue: this.interruptionQueue.queueName,
        },
        serviceAccount: {
          create: false,
          name: 'karpenter',
        },
        tolerations: [CRITICAL_ADDONS_TOLERATION],
        // Affinity to run on system nodes (managed node group)
        affinity: {
          nodeAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    {
                      key: 'node-role',
                      operator: 'In',
                      values: ['system'],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    });

    // Export values for GitOps
    new cdk.CfnOutput(this, 'KarpenterNodeRoleName', {
      value: this.nodeRole.roleName,
      description: 'IAM role name for Karpenter-managed nodes',
      exportName: `${clusterName}-karpenter-node-role`,
    });

    new cdk.CfnOutput(this, 'KarpenterInstanceProfileName', {
      value: this.instanceProfile.instanceProfileName!,
      description: 'Instance profile name for Karpenter-managed nodes',
      exportName: `${clusterName}-karpenter-instance-profile`,
    });

    // Apply tags
    for (const [key, value] of Object.entries(config.tags)) {
      cdk.Tags.of(this).add(key, value);
    }
  }

  /**
   * Get IAM policy statements for Karpenter.
   *
   * Grants permissions for EC2 fleet management, IAM instance profile
   * operations, SQS interruption queue, EKS cluster describe, pricing
   * API, and SSM parameter reads for AMI discovery.
   *
   * @param config - Environment configuration with AWS account/region details
   * @param clusterName - Fully qualified cluster name (`{environment}-{cluster.name}`)
   * @returns Array of IAM policy statements for the Karpenter controller IRSA role
   */
  private getKarpenterPolicyStatements(config: EnvironmentConfig, clusterName: string): iam.PolicyStatement[] {
    return [
      // EC2 permissions
      new iam.PolicyStatement({
        actions: [
          'ec2:CreateFleet',
          'ec2:CreateLaunchTemplate',
          'ec2:CreateTags',
          'ec2:DeleteLaunchTemplate',
          'ec2:DescribeAvailabilityZones',
          'ec2:DescribeImages',
          'ec2:DescribeInstances',
          'ec2:DescribeInstanceTypeOfferings',
          'ec2:DescribeInstanceTypes',
          'ec2:DescribeLaunchTemplates',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeSpotPriceHistory',
          'ec2:DescribeSubnets',
          'ec2:RunInstances',
          'ec2:TerminateInstances',
        ],
        resources: ['*'],
      }),
      // IAM permissions for node role and instance profile management
      new iam.PolicyStatement({
        actions: [
          'iam:PassRole',
          'iam:CreateInstanceProfile',
          'iam:DeleteInstanceProfile',
          'iam:GetInstanceProfile',
          'iam:TagInstanceProfile',
          'iam:AddRoleToInstanceProfile',
          'iam:RemoveRoleFromInstanceProfile',
        ],
        resources: [
          `arn:aws:iam::${config.aws.accountId}:role/${clusterName}-karpenter-node`,
          `arn:aws:iam::${config.aws.accountId}:instance-profile/*`,
        ],
      }),
      // SQS permissions
      new iam.PolicyStatement({
        actions: ['sqs:DeleteMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:ReceiveMessage'],
        resources: [`arn:aws:sqs:${config.aws.region}:${config.aws.accountId}:${clusterName}-karpenter`],
      }),
      // EKS permissions
      new iam.PolicyStatement({
        actions: ['eks:DescribeCluster'],
        resources: [`arn:aws:eks:${config.aws.region}:${config.aws.accountId}:cluster/${clusterName}`],
      }),
      // Pricing permissions
      new iam.PolicyStatement({
        actions: ['pricing:GetProducts'],
        resources: ['*'],
      }),
      // SSM permissions for AMI discovery
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: ['arn:aws:ssm:*:*:parameter/aws/service/*'],
      }),
    ];
  }
}
