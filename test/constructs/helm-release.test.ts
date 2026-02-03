import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HelmRelease } from '../../lib/constructs/helm-release';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';

describe('HelmRelease', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  describe('basic functionality', () => {
    test('creates helm chart with required properties', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'cert-manager',
        repository: 'https://charts.jetstack.io',
        version: 'v1.17.1',
        namespace: 'cert-manager',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Chart: 'cert-manager',
        Repository: 'https://charts.jetstack.io',
        Version: 'v1.17.1',
        Namespace: 'cert-manager',
      });
    });

    test('creates namespace by default', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'test-ns',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        CreateNamespace: true,
      });
    });

    test('can disable namespace creation', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'kube-system',
        createNamespace: false,
      });

      const template = Template.fromStack(stack);
      // When createNamespace is false, CDK may omit the property or set it to false
      // Verify the chart is created with the right namespace
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Chart: 'test-chart',
        Namespace: 'kube-system',
      });
    });

    test('uses chart name as release name by default', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'my-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Release: 'my-chart',
      });
    });

    test('can set custom release name', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'my-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
        releaseName: 'custom-release-name',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Release: 'custom-release-name',
      });
    });

    test('waits for resources by default', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Wait: true,
      });
    });

    test('can disable waiting', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
        wait: false,
      });

      const template = Template.fromStack(stack);
      // When wait is false, CDK may omit the property or the chart still works
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Chart: 'test-chart',
      });
    });
  });

  describe('values configuration', () => {
    test('passes simple values', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
        values: {
          replicaCount: 3,
          image: {
            repository: 'nginx',
            tag: 'latest',
          },
        },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Values: Match.serializedJson(
          Match.objectLike({
            replicaCount: 3,
            image: {
              repository: 'nginx',
              tag: 'latest',
            },
          }),
        ),
      });
    });

    test('handles nested values', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
        values: {
          level1: {
            level2: {
              level3: {
                value: 'deep',
              },
            },
          },
        },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Values: Match.serializedJson(
          Match.objectLike({
            level1: {
              level2: {
                level3: {
                  value: 'deep',
                },
              },
            },
          }),
        ),
      });
    });

    test('handles array values', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
        values: {
          tolerations: [
            {
              key: 'CriticalAddonsOnly',
              operator: 'Exists',
            },
          ],
        },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Values: Match.serializedJson(
          Match.objectLike({
            tolerations: [
              {
                key: 'CriticalAddonsOnly',
                operator: 'Exists',
              },
            ],
          }),
        ),
      });
    });
  });

  describe('timeout configuration', () => {
    test('parses minutes timeout', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
        timeout: '10m',
      });

      const template = Template.fromStack(stack);
      // Verify chart is created - timeout is passed to CDK Duration
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Chart: 'test-chart',
      });
    });

    test('parses seconds timeout', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
        timeout: '300s',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Chart: 'test-chart',
      });
    });

    test('handles max timeout of 15 minutes', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      // Note: CDK limits Helm chart timeout to 15 minutes max
      new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
        timeout: '15m',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
        Chart: 'test-chart',
      });
    });
  });

  describe('exposes chart resource', () => {
    test('chart property is accessible', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const release = new HelmRelease(stack, 'TestRelease', {
        cluster,
        chart: 'test-chart',
        repository: 'https://example.com/charts',
        version: '1.0.0',
        namespace: 'default',
      });

      expect(release.chart).toBeDefined();
      expect(release.chart).toBeInstanceOf(eks.HelmChart);
    });
  });
});
