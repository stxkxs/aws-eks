import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../../lib/stacks/network';
import { getDevConfig, getProductionConfig } from '../../config';
import { TEST_EXTERNAL_VALUES } from '../helpers';

describe('NetworkStack', () => {
  const testAccountId = '123456789012';
  const testRegion = 'us-west-2';

  describe('with dev config', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion, TEST_EXTERNAL_VALUES);
      const stack = new NetworkStack(app, 'TestNetwork', { config });
      template = Template.fromStack(stack);
    });

    test('creates VPC with correct CIDR', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.0.0.0/16',
      });
    });

    test('creates single NAT gateway for cost optimization', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    test('creates public and private subnets', () => {
      // CDK creates subnets based on available AZs in the region (usually 2-3)
      // Check that we have at least 4 subnets (2 AZs x 2 types minimum)
      const subnets = template.findResources('AWS::EC2::Subnet');
      expect(Object.keys(subnets).length).toBeGreaterThanOrEqual(4);
    });

    test('does not create flow logs in dev', () => {
      template.resourceCountIs('AWS::EC2::FlowLog', 0);
    });

    test('tags subnets for Karpenter discovery', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'karpenter.sh/discovery', Value: 'dev-eks' })]),
      });
    });

    test('tags public subnets for ELB', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'kubernetes.io/role/elb', Value: '1' })]),
      });
    });

    test('tags private subnets for internal ELB', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'kubernetes.io/role/internal-elb', Value: '1' })]),
      });
    });

    test('creates VPC ID output', () => {
      template.hasOutput('VpcId', {
        Export: { Name: 'dev-vpc-id' },
      });
    });

    test('applies environment tags', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'environment', Value: 'dev' })]),
      });
    });
  });

  describe('with production config', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const config = getProductionConfig(testAccountId, testRegion, TEST_EXTERNAL_VALUES);
      const stack = new NetworkStack(app, 'TestNetwork', { config });
      template = Template.fromStack(stack);
    });

    test('creates NAT gateways for high availability', () => {
      // Production config requests 3 NAT gateways, but actual count depends on available AZs
      // In a test environment, CDK may create fewer based on the synthetic environment
      const natGateways = template.findResources('AWS::EC2::NatGateway');
      expect(Object.keys(natGateways).length).toBeGreaterThanOrEqual(2);
    });

    test('creates VPC flow logs for compliance', () => {
      template.resourceCountIs('AWS::EC2::FlowLog', 1);
    });

    test('flow logs go to CloudWatch', () => {
      template.hasResourceProperties('AWS::EC2::FlowLog', {
        LogDestinationType: 'cloud-watch-logs',
        TrafficType: 'ALL',
      });
    });

    test('tags subnets for production cluster', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'karpenter.sh/discovery', Value: 'production-eks' })]),
      });
    });

    test('applies production tags', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'environment', Value: 'production' })]),
      });
    });

    test('creates VPC ID output with production prefix', () => {
      template.hasOutput('VpcId', {
        Export: { Name: 'production-vpc-id' },
      });
    });
  });

  describe('VPC configuration', () => {
    test('disables public IP mapping on launch', () => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion, TEST_EXTERNAL_VALUES);
      const stack = new NetworkStack(app, 'TestNetwork', { config });
      const template = Template.fromStack(stack);

      // All subnets should have MapPublicIpOnLaunch: false
      const subnets = template.findResources('AWS::EC2::Subnet');
      for (const [_, subnet] of Object.entries(subnets)) {
        expect((subnet as any).Properties.MapPublicIpOnLaunch).toBe(false);
      }
    });
  });
});
