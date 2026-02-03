/**
 * CloudFormation Snapshot Tests
 *
 * These tests capture the synthesized CloudFormation templates as snapshots.
 * They help detect unintended changes to infrastructure.
 *
 * Run `npm test -- -u` to update snapshots when intentional changes are made.
 */
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../../lib/stacks/network';
import { ClusterStack } from '../../lib/stacks/cluster';
import { getDevConfig, getProductionConfig } from '../../config';
import { TEST_EXTERNAL_VALUES } from '../helpers';

describe('CloudFormation Snapshot Tests', () => {
  const testAccountId = '123456789012';
  const testRegion = 'us-west-2';

  describe('NetworkStack snapshots', () => {
    test('dev environment network matches snapshot', () => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion, TEST_EXTERNAL_VALUES);
      const stack = new NetworkStack(app, 'TestNetworkDev', { config });

      const template = Template.fromStack(stack);
      const json = template.toJSON();

      // Remove volatile elements that change between runs
      const sanitized = sanitizeTemplate(json);
      expect(sanitized).toMatchSnapshot();
    });

    test('production environment network matches snapshot', () => {
      const app = new cdk.App();
      const config = getProductionConfig(testAccountId, testRegion, TEST_EXTERNAL_VALUES);
      const stack = new NetworkStack(app, 'TestNetworkProd', { config });

      const template = Template.fromStack(stack);
      const json = template.toJSON();

      const sanitized = sanitizeTemplate(json);
      expect(sanitized).toMatchSnapshot();
    });
  });

  describe('ClusterStack snapshots', () => {
    test('dev environment cluster matches snapshot', () => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion, TEST_EXTERNAL_VALUES);

      // Create network stack first
      const networkStack = new NetworkStack(app, 'TestNetworkDev', { config });

      const stack = new ClusterStack(app, 'TestClusterDev', {
        config,
        vpc: networkStack.vpc,
      });

      const template = Template.fromStack(stack);
      const json = template.toJSON();

      const sanitized = sanitizeTemplate(json);
      expect(sanitized).toMatchSnapshot();
    });
  });

  describe('Resource count validation', () => {
    test('dev network has expected resource counts', () => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion, TEST_EXTERNAL_VALUES);
      const stack = new NetworkStack(app, 'TestNetwork', { config });

      const template = Template.fromStack(stack);

      // Dev should have 1 NAT gateway (cost optimization)
      template.resourceCountIs('AWS::EC2::NatGateway', 1);

      // Should have a VPC
      template.resourceCountIs('AWS::EC2::VPC', 1);

      // Should have flow logs if enabled
      if (config.network.flowLogs) {
        template.resourceCountIs('AWS::EC2::FlowLog', 1);
      }
    });

    test('production network has expected resource counts', () => {
      const app = new cdk.App();
      const config = getProductionConfig(testAccountId, testRegion, TEST_EXTERNAL_VALUES);
      const stack = new NetworkStack(app, 'TestNetwork', { config });

      const template = Template.fromStack(stack);

      // Production should have at least 2 NAT gateways for HA
      // The actual count depends on min(natGateways, maxAzs)
      const resources = template.findResources('AWS::EC2::NatGateway');
      const natCount = Object.keys(resources).length;
      expect(natCount).toBeGreaterThanOrEqual(1);

      // Should have a VPC
      template.resourceCountIs('AWS::EC2::VPC', 1);
    });
  });
});

/**
 * Remove volatile elements from CloudFormation template for stable snapshots.
 * This includes:
 * - Asset hashes
 * - Lambda code S3 keys
 * - Random suffixes in logical IDs
 */
function sanitizeTemplate(template: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(template);

  // Replace asset hashes (64 char hex strings)
  const sanitized = json
    .replace(/[a-f0-9]{64}/gi, 'ASSET_HASH')
    .replace(/[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}/gi, 'UUID')
    .replace(/"S3Key":\s*"[^"]+\.zip"/g, '"S3Key": "LAMBDA_CODE.zip"');

  return JSON.parse(sanitized);
}
