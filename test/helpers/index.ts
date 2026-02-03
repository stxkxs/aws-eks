/**
 * Test Helper Functions
 *
 * Common utilities for testing CDK constructs and stacks.
 */
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Template } from 'aws-cdk-lib/assertions';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';
import { getDevConfig, getProductionConfig, getStagingConfig } from '../../config';
import { EnvironmentConfig, Environment } from '../../lib/types/config';

/**
 * Standard test account ID for unit tests
 */
export const TEST_ACCOUNT_ID = '123456789012';

/**
 * Standard test region for unit tests
 */
export const TEST_REGION = 'us-west-2';

/**
 * Create a test app with default context
 */
export function createTestApp(): cdk.App {
  return new cdk.App({
    context: {
      '@aws-cdk/core:stackRelativeExports': true,
    },
  });
}

/**
 * Create a test stack within an app
 */
export function createTestStack(app?: cdk.App, id: string = 'TestStack'): cdk.Stack {
  const testApp = app ?? createTestApp();
  return new cdk.Stack(testApp, id, {
    env: {
      account: TEST_ACCOUNT_ID,
      region: TEST_REGION,
    },
  });
}

/**
 * Create a test VPC for cluster tests
 */
export function createTestVpc(stack: cdk.Stack, id: string = 'Vpc'): ec2.Vpc {
  return new ec2.Vpc(stack, id, {
    maxAzs: 2,
    natGateways: 1,
  });
}

/**
 * Create a test EKS cluster
 */
export function createTestCluster(stack: cdk.Stack, vpc?: ec2.IVpc, id: string = 'Cluster'): eks.Cluster {
  const testVpc = vpc ?? createTestVpc(stack);
  return new eks.Cluster(stack, id, {
    vpc: testVpc,
    version: eks.KubernetesVersion.V1_31,
    defaultCapacity: 0,
    kubectlLayer: new KubectlV31Layer(stack, `${id}KubectlLayer`),
  });
}

/**
 * Get test configuration for an environment
 */
export function getTestConfig(
  environment: Environment = 'dev',
  accountId: string = TEST_ACCOUNT_ID,
  region: string = TEST_REGION,
): EnvironmentConfig {
  switch (environment) {
    case 'dev':
      return getDevConfig(accountId, region);
    case 'staging':
      return getStagingConfig(accountId, region);
    case 'production':
      return getProductionConfig(accountId, region);
    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
}

/**
 * Helper to check if a CloudFormation manifest contains a string.
 * Handles both string manifests and Fn::Join format.
 */
export function manifestContains(manifest: unknown, searchString: string): boolean {
  if (typeof manifest === 'string') {
    return manifest.includes(searchString);
  }

  // Handle Fn::Join format: { "Fn::Join": ["", [...]] }
  if (manifest && typeof manifest === 'object') {
    const obj = manifest as Record<string, unknown>;
    if (obj['Fn::Join']) {
      return JSON.stringify(obj['Fn::Join']).includes(searchString);
    }
  }

  return JSON.stringify(manifest).includes(searchString);
}

/**
 * Find all Kubernetes manifest resources in a template
 */
export function findKubernetesResources(template: Template): Record<string, any> {
  return template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
}

/**
 * Find all Helm chart resources in a template
 */
export function findHelmCharts(template: Template): Record<string, any> {
  return template.findResources('Custom::AWSCDK-EKS-HelmChart');
}

/**
 * Check if a Kubernetes resource with specific kind and name exists
 */
export function hasKubernetesResource(template: Template, kind: string, name: string): boolean {
  const resources = findKubernetesResources(template);
  return Object.values(resources).some((resource: any) => {
    const manifest = resource.Properties.Manifest;
    return manifestContains(manifest, kind) && manifestContains(manifest, name);
  });
}

/**
 * Check if a Helm chart is deployed
 */
export function hasHelmChart(template: Template, chartName: string, namespace?: string): boolean {
  const charts = findHelmCharts(template);
  return Object.values(charts).some((chart: any) => {
    const props = chart.Properties;
    const chartMatches = props.Chart === chartName;
    const namespaceMatches = !namespace || props.Namespace === namespace;
    return chartMatches && namespaceMatches;
  });
}

/**
 * Get Helm chart values from a template.
 *
 * CDK Helm charts with token references (e.g. cluster name, VPC ID) produce
 * Fn::Join intrinsic functions instead of plain JSON strings. This helper
 * handles both formats: it parses plain JSON strings directly and extracts
 * a best-effort JSON parse from Fn::Join arrays by joining the string parts.
 */
export function getHelmChartValues(template: Template, chartName: string): Record<string, unknown> | null {
  const charts = findHelmCharts(template);
  for (const chart of Object.values(charts) as any[]) {
    if (chart.Properties.Chart === chartName) {
      const values = chart.Properties.Values;
      if (typeof values === 'string') {
        try {
          return JSON.parse(values);
        } catch {
          return null;
        }
      }
      // Handle Fn::Join format: { "Fn::Join": ["", [...parts]] }
      if (values && typeof values === 'object' && values['Fn::Join']) {
        const parts = values['Fn::Join'][1];
        if (Array.isArray(parts)) {
          // Join string parts, replacing object refs (CDK tokens) with a placeholder.
          // The surrounding string parts already include quotes, so the placeholder
          // must NOT include extra quotes (e.g. ..."clusterName":"<token>","vpcId":...)
          const joined = parts.map((p: unknown) => (typeof p === 'string' ? p : '__CDK_TOKEN__')).join('');
          try {
            return JSON.parse(joined);
          } catch {
            return null;
          }
        }
      }
      return values;
    }
  }
  return null;
}

/**
 * Count resources of a specific type
 */
export function countResources(template: Template, resourceType: string): number {
  const resources = template.findResources(resourceType);
  return Object.keys(resources).length;
}

/**
 * Sanitize a CloudFormation template for snapshot testing.
 * Removes volatile elements like asset hashes and UUIDs.
 */
export function sanitizeTemplate(template: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(template);

  const sanitized = json
    // Replace asset hashes (64 char hex strings)
    .replace(/[a-f0-9]{64}/gi, 'ASSET_HASH')
    // Replace UUIDs
    .replace(/[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}/gi, 'UUID')
    // Replace Lambda code S3 keys
    .replace(/"S3Key":\s*"[^"]+\.zip"/g, '"S3Key": "LAMBDA_CODE.zip"')
    // Replace timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP');

  return JSON.parse(sanitized);
}

/**
 * Assert that a stack synthesizes without errors
 */
export function assertStackSynthesizes(stack: cdk.Stack): Template {
  const template = Template.fromStack(stack);
  expect(template.toJSON()).toBeDefined();
  return template;
}

/**
 * Test fixture for common stack setup
 */
export interface TestStackFixture {
  app: cdk.App;
  stack: cdk.Stack;
  vpc: ec2.Vpc;
  cluster: eks.Cluster;
  config: EnvironmentConfig;
}

/**
 * Create a complete test fixture with app, stack, VPC, cluster, and config
 */
export function createTestFixture(environment: Environment = 'dev', stackId: string = 'TestStack'): TestStackFixture {
  const app = createTestApp();
  const stack = new cdk.Stack(app, stackId);
  const vpc = createTestVpc(stack);
  const cluster = createTestCluster(stack, vpc);
  const config = getTestConfig(environment);

  return { app, stack, vpc, cluster, config };
}
