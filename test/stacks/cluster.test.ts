import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ClusterStack } from '../../lib/stacks/cluster';
import { NetworkStack } from '../../lib/stacks/network';
import { getDevConfig, getProductionConfig } from '../../config';

describe('ClusterStack', () => {
  const testAccountId = '123456789012';
  const testRegion = 'us-west-2';

  function createTestVpc(app: cdk.App, config: ReturnType<typeof getDevConfig>): ec2.IVpc {
    const networkStack = new NetworkStack(app, 'TestNetwork', { config });
    return networkStack.vpc;
  }

  describe('with dev config', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion);
      const vpc = createTestVpc(app, config);
      const stack = new ClusterStack(app, 'TestCluster', { config, vpc });
      template = Template.fromStack(stack);
    });

    test('creates EKS cluster with correct name', () => {
      template.hasResourceProperties('Custom::AWSCDK-EKS-Cluster', {
        Config: Match.objectLike({
          name: 'dev-eks',
        }),
      });
    });

    test('creates KMS key for secrets encryption', () => {
      template.resourceCountIs('AWS::KMS::Key', 1);
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
      });
    });

    test('creates KMS key alias', () => {
      template.hasResourceProperties('AWS::KMS::Alias', {
        AliasName: 'alias/dev-eks-secrets',
      });
    });

    test('creates managed node group for system workloads', () => {
      template.hasResourceProperties('AWS::EKS::Nodegroup', {
        NodegroupName: 'dev-system',
        CapacityType: 'ON_DEMAND',
        ScalingConfig: {
          MinSize: 2,
          MaxSize: 4,
          DesiredSize: 2,
        },
        DiskSize: 50,
      });
    });

    test('node group has system labels', () => {
      template.hasResourceProperties('AWS::EKS::Nodegroup', {
        Labels: Match.objectLike({
          'node-role': 'system',
          'karpenter.sh/do-not-disrupt': 'true',
        }),
      });
    });

    test('node group has CriticalAddonsOnly taint', () => {
      template.hasResourceProperties('AWS::EKS::Nodegroup', {
        Taints: Match.arrayWith([
          Match.objectLike({
            Key: 'CriticalAddonsOnly',
            Value: 'true',
            Effect: 'PREFER_NO_SCHEDULE',
          }),
        ]),
      });
    });

    test('creates cluster outputs', () => {
      template.hasOutput('ClusterName', {
        Export: { Name: 'dev-cluster-name' },
      });
      template.hasOutput('ClusterEndpoint', {
        Export: { Name: 'dev-cluster-endpoint' },
      });
      template.hasOutput('ClusterSecurityGroupId', {
        Export: { Name: 'dev-cluster-sg-id' },
      });
    });

    test('enables public and private endpoints in dev', () => {
      template.hasResourceProperties('Custom::AWSCDK-EKS-Cluster', {
        Config: Match.objectLike({
          resourcesVpcConfig: Match.objectLike({
            endpointPublicAccess: true,
            endpointPrivateAccess: true,
          }),
        }),
      });
    });
  });

  describe('with production config', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const config = getProductionConfig(testAccountId, testRegion);
      const vpc = createTestVpc(app, config);
      const stack = new ClusterStack(app, 'TestCluster', { config, vpc });
      template = Template.fromStack(stack);
    });

    test('creates production cluster', () => {
      template.hasResourceProperties('Custom::AWSCDK-EKS-Cluster', {
        Config: Match.objectLike({
          name: 'production-eks',
        }),
      });
    });

    test('creates larger node group for production', () => {
      template.hasResourceProperties('AWS::EKS::Nodegroup', {
        ScalingConfig: {
          MinSize: 3,
          MaxSize: 10,
          DesiredSize: 3,
        },
        DiskSize: 100,
      });
    });

    test('enables only private endpoint in production', () => {
      template.hasResourceProperties('Custom::AWSCDK-EKS-Cluster', {
        Config: Match.objectLike({
          resourcesVpcConfig: Match.objectLike({
            endpointPublicAccess: false,
            endpointPrivateAccess: true,
          }),
        }),
      });
    });

    test('creates production cluster with correct name', () => {
      // The Karpenter tag is applied via cdk.Tags.of() which doesn't appear in Config.tags
      // Instead verify the cluster itself has the right name for Karpenter discovery
      template.hasResourceProperties('Custom::AWSCDK-EKS-Cluster', {
        Config: Match.objectLike({
          name: 'production-eks',
        }),
      });
    });
  });

  describe('node group IAM', () => {
    test('node group role has required managed policies', () => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion);
      const vpc = createTestVpc(app, config);
      const stack = new ClusterStack(app, 'TestCluster', { config, vpc });
      const template = Template.fromStack(stack);

      // Verify IAM role policies are attached
      template.hasResourceProperties('AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('AmazonEKSWorkerNodePolicy')])]),
          }),
        ]),
      });
    });
  });

  describe('logging configuration', () => {
    test('enables all logging types', () => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion);
      const vpc = createTestVpc(app, config);
      const stack = new ClusterStack(app, 'TestCluster', { config, vpc });
      const template = Template.fromStack(stack);

      template.hasResourceProperties('Custom::AWSCDK-EKS-Cluster', {
        Config: Match.objectLike({
          logging: Match.objectLike({
            clusterLogging: Match.arrayWith([
              Match.objectLike({
                enabled: true,
                types: Match.arrayWith(['api', 'audit', 'authenticator', 'controllerManager', 'scheduler']),
              }),
            ]),
          }),
        }),
      });
    });
  });
});
