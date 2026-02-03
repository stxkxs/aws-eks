import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../types';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';
import { ClusterAccessManagement } from '../constructs/access-management';

/**
 * Properties for ClusterStack
 */
export interface ClusterStackProps extends cdk.StackProps {
  /** Environment configuration */
  readonly config: EnvironmentConfig;

  /** VPC to deploy cluster into */
  readonly vpc: ec2.IVpc;
}

/**
 * EKS Cluster stack that creates the Kubernetes cluster and managed node groups.
 *
 * Creates:
 * - EKS cluster with proper IAM roles
 * - KMS key for secrets encryption
 * - Managed node group for system workloads
 * - OIDC provider for IRSA
 */
export class ClusterStack extends cdk.Stack {
  /** The EKS cluster */
  public readonly cluster: eks.Cluster;

  /** KMS key for secrets encryption */
  public readonly secretsKey: kms.IKey;

  constructor(scope: Construct, id: string, props: ClusterStackProps) {
    super(scope, id, props);

    const { config, vpc } = props;

    const clusterName = `${config.environment}-${config.cluster.name}`;

    // Create KMS key for secrets encryption
    this.secretsKey = new kms.Key(this, 'SecretsKey', {
      alias: `${clusterName}-secrets`,
      description: `KMS key for EKS secrets encryption - ${clusterName}`,
      enableKeyRotation: true,
    });

    // Create the EKS cluster
    this.cluster = new eks.Cluster(this, 'Cluster', {
      clusterName,
      vpc,
      version: eks.KubernetesVersion.of(config.cluster.version),
      defaultCapacity: 0, // We'll create managed node groups separately
      endpointAccess: this.getEndpointAccess(config),
      secretsEncryptionKey: config.cluster.secretsEncryption ? this.secretsKey : undefined,
      clusterLogging: config.cluster.logging.map(this.mapLoggingType),
      kubectlLayer: new KubectlV31Layer(this, 'KubectlLayer'),
      // Enable OIDC provider for IRSA
      // Note: This is created automatically by CDK
    });

    // Create managed node group for system workloads
    this.createSystemNodeGroup(config);

    // Add security group rules for Cilium VXLAN overlay networking
    this.configureCiliumSecurityGroup();

    // Configure cluster access (supports both Access Entries API and aws-auth ConfigMap)
    this.configureClusterAccess(config);

    // Map Karpenter node role in aws-auth so Karpenter-launched nodes can join.
    // Use fromRoleName with a deterministic name to avoid circular cross-stack
    // dependency (the actual role is created in the Karpenter stack).
    const karpenterNodeRole = iam.Role.fromRoleName(this, 'KarpenterNodeRoleRef', `${clusterName}-karpenter-node`);
    this.cluster.awsAuth.addRoleMapping(karpenterNodeRole, {
      username: 'system:node:{{EC2PrivateDNSName}}',
      groups: ['system:bootstrappers', 'system:nodes'],
    });

    // Apply tags
    for (const [key, value] of Object.entries(config.tags)) {
      cdk.Tags.of(this).add(key, value);
    }

    // Tag the cluster for Karpenter
    cdk.Tags.of(this.cluster).add('karpenter.sh/discovery', clusterName);

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'EKS Cluster Name',
      exportName: `${config.environment}-cluster-name`,
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS Cluster Endpoint',
      exportName: `${config.environment}-cluster-endpoint`,
    });

    new cdk.CfnOutput(this, 'ClusterSecurityGroupId', {
      value: this.cluster.clusterSecurityGroupId,
      description: 'EKS Cluster Security Group ID',
      exportName: `${config.environment}-cluster-sg-id`,
    });
  }

  /**
   * Create the system managed node group for critical workloads.
   *
   * System nodes run on-demand instances with the `CriticalAddonsOnly` taint
   * to ensure only essential controllers (CoreDNS, Karpenter, etc.) are scheduled.
   *
   * @param config - Environment configuration containing node group sizing and instance types
   */
  private createSystemNodeGroup(config: EnvironmentConfig): void {
    const nodeGroup = this.cluster.addNodegroupCapacity('SystemNodeGroup', {
      nodegroupName: `${config.environment}-system`,
      instanceTypes: config.systemNodeGroup.instanceTypes.map((type) => new ec2.InstanceType(type)),
      minSize: config.systemNodeGroup.minSize,
      maxSize: config.systemNodeGroup.maxSize,
      desiredSize: config.systemNodeGroup.desiredSize,
      diskSize: config.systemNodeGroup.diskSize,
      amiType: this.mapAmiType(config.systemNodeGroup.amiType),
      capacityType: eks.CapacityType.ON_DEMAND, // System nodes always on-demand
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      labels: {
        'node-role': 'system',
        'karpenter.sh/do-not-disrupt': 'true',
      },
      taints: [
        {
          key: 'CriticalAddonsOnly',
          value: 'true',
          effect: eks.TaintEffect.PREFER_NO_SCHEDULE,
        },
      ],
    });

    // Add required policies for system node group
    nodeGroup.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'));
    nodeGroup.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'));
    nodeGroup.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
  }

  /**
   * Get endpoint access configuration based on private/public endpoint settings.
   *
   * @param config - Environment configuration with cluster endpoint settings
   * @returns The CDK EndpointAccess enum value matching the desired access mode
   */
  private getEndpointAccess(config: EnvironmentConfig): eks.EndpointAccess {
    if (config.cluster.privateEndpoint && !config.cluster.publicEndpoint) {
      return eks.EndpointAccess.PRIVATE;
    }
    if (config.cluster.privateEndpoint && config.cluster.publicEndpoint) {
      return eks.EndpointAccess.PUBLIC_AND_PRIVATE;
    }
    return eks.EndpointAccess.PUBLIC;
  }

  /**
   * Map logging type string to ClusterLoggingTypes.
   *
   * @param type - One of `api`, `audit`, `authenticator`, `controllerManager`, `scheduler`
   * @returns The corresponding CDK ClusterLoggingTypes enum value
   * @throws Error if the type is not a recognised logging type
   */
  private mapLoggingType(type: string): eks.ClusterLoggingTypes {
    const mapping: Record<string, eks.ClusterLoggingTypes> = {
      api: eks.ClusterLoggingTypes.API,
      audit: eks.ClusterLoggingTypes.AUDIT,
      authenticator: eks.ClusterLoggingTypes.AUTHENTICATOR,
      controllerManager: eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
      scheduler: eks.ClusterLoggingTypes.SCHEDULER,
    };
    const result = mapping[type];
    if (!result) {
      throw new Error(`Unknown logging type: '${type}'. Valid types: ${Object.keys(mapping).join(', ')}`);
    }
    return result;
  }

  /**
   * Map AMI type string to NodegroupAmiType.
   *
   * @param type - One of `AL2_x86_64`, `AL2_ARM_64`, `BOTTLEROCKET_x86_64`, `BOTTLEROCKET_ARM_64`
   * @returns The corresponding CDK NodegroupAmiType enum value
   * @throws Error if the type is not a recognised AMI type
   */
  private mapAmiType(type: string): eks.NodegroupAmiType {
    const mapping: Record<string, eks.NodegroupAmiType> = {
      AL2_x86_64: eks.NodegroupAmiType.AL2_X86_64,
      AL2_ARM_64: eks.NodegroupAmiType.AL2_ARM_64,
      BOTTLEROCKET_x86_64: eks.NodegroupAmiType.BOTTLEROCKET_X86_64,
      BOTTLEROCKET_ARM_64: eks.NodegroupAmiType.BOTTLEROCKET_ARM_64,
    };
    const result = mapping[type];
    if (!result) {
      throw new Error(`Unknown AMI type: '${type}'. Valid types: ${Object.keys(mapping).join(', ')}`);
    }
    return result;
  }

  /**
   * Configure security group rules for Cilium VXLAN overlay networking.
   *
   * Cilium uses VXLAN (UDP 8472) for pod-to-pod communication across nodes.
   * Without this rule, cross-node pod communication will fail.
   *
   * Opens the following ports within the cluster security group:
   * - UDP 8472 -- Cilium VXLAN overlay
   * - TCP 4240 -- Cilium health checks
   * - TCP 4245 -- Hubble Relay gRPC
   */
  private configureCiliumSecurityGroup(): void {
    const clusterSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ClusterSecurityGroup',
      this.cluster.clusterSecurityGroupId,
    );

    // Allow VXLAN traffic (UDP 8472) between nodes for Cilium overlay
    clusterSg.addIngressRule(clusterSg, ec2.Port.udp(8472), 'Cilium VXLAN overlay networking');

    // Allow Cilium health checks (TCP 4240)
    clusterSg.addIngressRule(clusterSg, ec2.Port.tcp(4240), 'Cilium health checks');

    // Allow Hubble Relay (TCP 4245) for observability
    clusterSg.addIngressRule(clusterSg, ec2.Port.tcp(4245), 'Hubble Relay gRPC');
  }

  /**
   * Configure cluster access using the new ClusterAccessManagement construct.
   *
   * Supports:
   * - EKS Access Entries API (recommended for new clusters)
   * - aws-auth ConfigMap (legacy, for compatibility)
   * - Persona-based access (admins, powerUsers, developers, viewers)
   * - Automatic deployer admin access
   *
   * Also handles legacy adminSsoArn/githubOidcArn for backwards compatibility.
   *
   * @param config - Environment configuration with security and cluster access settings
   */
  private configureClusterAccess(config: EnvironmentConfig): void {
    // Build access config from new and legacy settings
    const accessConfig = config.security.clusterAccess ?? {
      authenticationMode: 'API_AND_CONFIG_MAP',
      addDeployerAsAdmin: true,
    };

    // Handle legacy adminSsoArn - add to admins list
    const admins = [...(accessConfig.admins ?? [])];
    if (config.security.adminSsoArn) {
      admins.push({
        arn: config.security.adminSsoArn,
        name: 'admin-sso',
        username: 'admin:{{SessionName}}',
      });
    }

    // Handle legacy githubOidcArn - add to admins list for deployment
    if (config.security.githubOidcArn) {
      admins.push({
        arn: config.security.githubOidcArn,
        name: 'github-actions',
        username: 'github-actions',
      });
    }

    // Only create access management if there's something to configure
    if (
      admins.length > 0 ||
      accessConfig.powerUsers?.length ||
      accessConfig.developers?.length ||
      accessConfig.viewers?.length ||
      accessConfig.customAccess?.length ||
      accessConfig.addDeployerAsAdmin
    ) {
      new ClusterAccessManagement(this, 'ClusterAccess', {
        cluster: this.cluster,
        accessConfig: {
          ...accessConfig,
          admins: admins.length > 0 ? admins : undefined,
        },
        region: config.aws.region,
        accountId: config.aws.accountId,
      });
    }
  }
}
