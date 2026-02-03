import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network';
import { ClusterStack } from '../lib/stacks/cluster';
import { getDevConfig, getConfig, isValidEnvironment } from '../config';

describe('AWS EKS Infrastructure', () => {
  const testAccountId = '123456789012';
  const testRegion = 'us-west-2';

  describe('CDK synth', () => {
    test('synthesizes dev environment successfully', () => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion);

      const networkStack = new NetworkStack(app, 'DevNetwork', {
        config,
        env: { account: testAccountId, region: testRegion },
      });

      const clusterStack = new ClusterStack(app, 'DevCluster', {
        config,
        vpc: networkStack.vpc,
        env: { account: testAccountId, region: testRegion },
      });

      // Verify both stacks synthesize without errors
      const networkTemplate = Template.fromStack(networkStack);
      const clusterTemplate = Template.fromStack(clusterStack);

      expect(networkTemplate.toJSON()).toBeDefined();
      expect(clusterTemplate.toJSON()).toBeDefined();
    });

    test('synthesizes staging environment successfully', () => {
      const app = new cdk.App();
      const config = getConfig('staging', testAccountId, testRegion);

      const networkStack = new NetworkStack(app, 'StagingNetwork', {
        config,
        env: { account: testAccountId, region: testRegion },
      });

      const clusterStack = new ClusterStack(app, 'StagingCluster', {
        config,
        vpc: networkStack.vpc,
        env: { account: testAccountId, region: testRegion },
      });

      const networkTemplate = Template.fromStack(networkStack);
      const clusterTemplate = Template.fromStack(clusterStack);

      expect(networkTemplate.toJSON()).toBeDefined();
      expect(clusterTemplate.toJSON()).toBeDefined();
    });

    test('synthesizes production environment successfully', () => {
      const app = new cdk.App();
      const config = getConfig('production', testAccountId, testRegion);

      const networkStack = new NetworkStack(app, 'ProdNetwork', {
        config,
        env: { account: testAccountId, region: testRegion },
      });

      const clusterStack = new ClusterStack(app, 'ProdCluster', {
        config,
        vpc: networkStack.vpc,
        env: { account: testAccountId, region: testRegion },
      });

      const networkTemplate = Template.fromStack(networkStack);
      const clusterTemplate = Template.fromStack(clusterStack);

      expect(networkTemplate.toJSON()).toBeDefined();
      expect(clusterTemplate.toJSON()).toBeDefined();
    });
  });

  describe('environment validation', () => {
    test('validates correct environments', () => {
      expect(isValidEnvironment('dev')).toBe(true);
      expect(isValidEnvironment('staging')).toBe(true);
      expect(isValidEnvironment('production')).toBe(true);
    });

    test('rejects invalid environments', () => {
      expect(isValidEnvironment('invalid')).toBe(false);
      expect(isValidEnvironment('')).toBe(false);
    });
  });
});
