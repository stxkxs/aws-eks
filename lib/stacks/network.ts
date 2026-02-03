import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../types';

/**
 * Properties for NetworkStack
 */
export interface NetworkStackProps extends cdk.StackProps {
  /** Environment configuration */
  readonly config: EnvironmentConfig;
}

/**
 * Network stack that creates the VPC and related networking resources.
 *
 * Creates:
 * - VPC with public and private subnets
 * - NAT gateways (configurable count for cost optimization)
 * - VPC flow logs (optional)
 * - Proper tagging for Karpenter discovery
 *
 * @remarks
 * Both public and private subnets are tagged with `karpenter.sh/discovery`
 * so that Karpenter can discover them when launching EC2 instances. The
 * tag value is set to the cluster name (`{environment}-{cluster.name}`).
 * Without these tags, Karpenter NodePools will fail to provision nodes.
 *
 * @see {@link EnvironmentConfig.network} for network configuration options
 */
export class NetworkStack extends cdk.Stack {
  /** The VPC */
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create VPC
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(config.network.vpcCidr),
      maxAzs: config.network.maxAzs,
      natGateways: config.network.natGateways,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
          mapPublicIpOnLaunch: false,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Tag subnets for Karpenter discovery
    const clusterName = `${config.environment}-${config.cluster.name}`;

    for (const subnet of this.vpc.publicSubnets) {
      cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1');
      cdk.Tags.of(subnet).add(`kubernetes.io/cluster/${clusterName}`, 'shared');
      cdk.Tags.of(subnet).add('karpenter.sh/discovery', clusterName);
    }

    for (const subnet of this.vpc.privateSubnets) {
      cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1');
      cdk.Tags.of(subnet).add(`kubernetes.io/cluster/${clusterName}`, 'shared');
      cdk.Tags.of(subnet).add('karpenter.sh/discovery', clusterName);
    }

    // Enable VPC flow logs if configured
    if (config.network.flowLogs) {
      this.vpc.addFlowLog('FlowLog', {
        destination: ec2.FlowLogDestination.toCloudWatchLogs(),
        trafficType: ec2.FlowLogTrafficType.ALL,
      });
    }

    // Add VPC endpoints to reduce NAT gateway costs
    if (config.features.vpcEndpoints) {
      this.addVpcEndpoints(config);
    }

    // Apply tags
    for (const [key, value] of Object.entries(config.tags)) {
      cdk.Tags.of(this).add(key, value);
    }

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${config.environment}-vpc-id`,
    });
  }

  /**
   * Add VPC endpoints to reduce NAT gateway costs.
   *
   * Adds endpoints for:
   * - S3 (Gateway endpoint - free)
   * - ECR API and DKR (Interface endpoints - for pulling images)
   * - SSM, SSM Messages, EC2 Messages (Interface endpoints - for node management)
   * - STS (Interface endpoint - for IAM authentication)
   * - CloudWatch Logs (Interface endpoint - for logging)
   *
   * @param _config - Environment configuration (currently unused; reserved for
   *   future per-environment endpoint customization)
   */
  private addVpcEndpoints(_config: EnvironmentConfig): void {
    const vpc = this.vpc as ec2.Vpc;

    // S3 Gateway Endpoint (free - no hourly charge)
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // ECR API Endpoint (for ECR API calls)
    vpc.addInterfaceEndpoint('EcrApiEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      privateDnsEnabled: true,
    });

    // ECR Docker Endpoint (for pulling images)
    vpc.addInterfaceEndpoint('EcrDkrEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      privateDnsEnabled: true,
    });

    // SSM Endpoints (for Systems Manager access to nodes)
    vpc.addInterfaceEndpoint('SsmEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      privateDnsEnabled: true,
    });

    vpc.addInterfaceEndpoint('SsmMessagesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      privateDnsEnabled: true,
    });

    vpc.addInterfaceEndpoint('Ec2MessagesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      privateDnsEnabled: true,
    });

    // STS Endpoint (for IAM role authentication)
    vpc.addInterfaceEndpoint('StsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.STS,
      privateDnsEnabled: true,
    });

    // CloudWatch Logs Endpoint (for log shipping)
    vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
    });
  }
}
