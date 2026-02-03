import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Template } from 'aws-cdk-lib/assertions';
import {
  ServiceMonitor,
  PodMonitor,
  PrometheusRuleConstruct,
  AppServiceMonitor,
} from '../../lib/constructs/service-monitor';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';

// Helper to check if manifest contains a string (handles both string and object formats)
function manifestContains(manifest: any, searchString: string): boolean {
  if (typeof manifest === 'string') {
    return manifest.includes(searchString);
  }
  if (manifest && manifest['Fn::Join']) {
    return JSON.stringify(manifest['Fn::Join']).includes(searchString);
  }
  return JSON.stringify(manifest).includes(searchString);
}

describe('ServiceMonitor', () => {
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
    test('creates ServiceMonitor resource', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const monitor = new ServiceMonitor(stack, 'TestMonitor', {
        cluster,
        name: 'my-app-monitor',
        namespace: 'monitoring',
        selector: { app: 'my-app' },
        endpoints: [{ port: 'metrics' }],
      });

      expect(monitor.manifest).toBeDefined();
      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasMonitor = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifestContains(manifest, 'ServiceMonitor') && manifestContains(manifest, 'my-app-monitor');
      });
      expect(hasMonitor).toBe(true);
    });

    test('sets default scrape path to /metrics', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new ServiceMonitor(stack, 'TestMonitor', {
        cluster,
        name: 'test-monitor',
        namespace: 'monitoring',
        selector: { app: 'test' },
        endpoints: [{ port: 'http' }],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasPath = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifestContains(manifest, '/metrics');
      });
      expect(hasPath).toBe(true);
    });

    test('sets default scrape interval to 30s', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new ServiceMonitor(stack, 'TestMonitor', {
        cluster,
        name: 'test-monitor',
        namespace: 'monitoring',
        selector: { app: 'test' },
        endpoints: [{ port: 'http' }],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasInterval = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifestContains(manifest, '30s');
      });
      expect(hasInterval).toBe(true);
    });

    test('allows custom scrape configuration', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new ServiceMonitor(stack, 'TestMonitor', {
        cluster,
        name: 'custom-monitor',
        namespace: 'monitoring',
        selector: { app: 'custom' },
        endpoints: [
          {
            port: 'metrics',
            path: '/custom-metrics',
            interval: '60s',
            scheme: 'https',
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasCustomConfig = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return (
          manifestContains(manifest, '/custom-metrics') &&
          manifestContains(manifest, '60s') &&
          manifestContains(manifest, 'https')
        );
      });
      expect(hasCustomConfig).toBe(true);
    });

    test('adds labels to ServiceMonitor', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new ServiceMonitor(stack, 'TestMonitor', {
        cluster,
        name: 'labeled-monitor',
        namespace: 'monitoring',
        selector: { app: 'test' },
        endpoints: [{ port: 'metrics' }],
        labels: { team: 'platform' },
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasLabels = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifestContains(manifest, 'team') && manifestContains(manifest, 'platform');
      });
      expect(hasLabels).toBe(true);
    });

    test('supports namespaceSelector', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new ServiceMonitor(stack, 'TestMonitor', {
        cluster,
        name: 'multi-ns-monitor',
        namespace: 'monitoring',
        selector: { app: 'test' },
        endpoints: [{ port: 'metrics' }],
        namespaceSelector: { matchNames: ['app-ns-1', 'app-ns-2'] },
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasNsSelector = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifestContains(manifest, 'namespaceSelector');
      });
      expect(hasNsSelector).toBe(true);
    });
  });
});

describe('PodMonitor', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  test('creates PodMonitor resource', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const monitor = new PodMonitor(stack, 'TestPodMonitor', {
      cluster,
      name: 'my-pod-monitor',
      namespace: 'monitoring',
      selector: { app: 'my-app' },
      podMetricsEndpoints: [{ port: 'metrics' }],
    });

    expect(monitor.manifest).toBeDefined();
    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasMonitor = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifestContains(manifest, 'PodMonitor') && manifestContains(manifest, 'my-pod-monitor');
    });
    expect(hasMonitor).toBe(true);
  });

  test('sets default path and interval', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new PodMonitor(stack, 'TestPodMonitor', {
      cluster,
      name: 'test-pod-monitor',
      namespace: 'monitoring',
      selector: { app: 'test' },
      podMetricsEndpoints: [{ port: 'metrics' }],
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasDefaults = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifestContains(manifest, '/metrics') && manifestContains(manifest, '30s');
    });
    expect(hasDefaults).toBe(true);
  });
});

describe('PrometheusRuleConstruct', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  test('creates PrometheusRule with alerting rule', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const rule = new PrometheusRuleConstruct(stack, 'TestRule', {
      cluster,
      name: 'my-alerts',
      namespace: 'monitoring',
      groups: [
        {
          name: 'pod-alerts',
          rules: [
            {
              alert: 'HighCPU',
              expr: 'container_cpu_usage_seconds_total > 0.9',
              for: '5m',
              labels: { severity: 'warning' },
              annotations: { summary: 'High CPU usage detected' },
            },
          ],
        },
      ],
    });

    expect(rule.manifest).toBeDefined();
    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasRule = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifestContains(manifest, 'PrometheusRule') && manifestContains(manifest, 'HighCPU');
    });
    expect(hasRule).toBe(true);
  });

  test('creates PrometheusRule with recording rule', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new PrometheusRuleConstruct(stack, 'TestRule', {
      cluster,
      name: 'my-recordings',
      namespace: 'monitoring',
      groups: [
        {
          name: 'aggregations',
          interval: '1m',
          rules: [
            {
              record: 'namespace:pod_cpu:sum',
              expr: 'sum by (namespace) (rate(container_cpu_usage_seconds_total[5m]))',
            },
          ],
        },
      ],
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasRecording = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifestContains(manifest, 'namespace:pod_cpu:sum');
    });
    expect(hasRecording).toBe(true);
  });

  test('supports multiple rule groups', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new PrometheusRuleConstruct(stack, 'TestRule', {
      cluster,
      name: 'multi-group-rules',
      namespace: 'monitoring',
      groups: [
        {
          name: 'group1',
          rules: [{ alert: 'Alert1', expr: 'up == 0' }],
        },
        {
          name: 'group2',
          rules: [{ record: 'record:metric', expr: 'sum(metric)' }],
        },
      ],
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasGroups = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifestContains(manifest, 'group1') && manifestContains(manifest, 'group2');
    });
    expect(hasGroups).toBe(true);
  });
});

describe('AppServiceMonitor', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  test('creates ServiceMonitor with defaults', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const monitor = new AppServiceMonitor(stack, 'TestAppMonitor', {
      cluster,
      appName: 'my-app',
      appNamespace: 'default',
    });

    expect(monitor.monitor).toBeDefined();
    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasServiceMonitor = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return (
        manifest &&
        manifest.includes('ServiceMonitor') &&
        manifest.includes('my-app') &&
        manifest.includes('monitoring')
      ); // deployed to monitoring namespace
    });
    expect(hasServiceMonitor).toBe(true);
  });

  test('uses default metrics port and path', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new AppServiceMonitor(stack, 'TestAppMonitor', {
      cluster,
      appName: 'my-app',
      appNamespace: 'default',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasDefaults = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return (
        manifest && manifest.includes('"port":"metrics"') && manifest.includes('/metrics') && manifest.includes('30s')
      );
    });
    expect(hasDefaults).toBe(true);
  });

  test('allows custom metrics configuration', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new AppServiceMonitor(stack, 'TestAppMonitor', {
      cluster,
      appName: 'api-server',
      appNamespace: 'production',
      metricsPort: '8080',
      metricsPath: '/actuator/prometheus',
      scrapeInterval: '15s',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasCustomConfig = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return (
        manifest &&
        manifest.includes('"port":"8080"') &&
        manifest.includes('/actuator/prometheus') &&
        manifest.includes('15s')
      );
    });
    expect(hasCustomConfig).toBe(true);
  });

  test('creates PodMonitor when scrapePodsDirectly is true', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const monitor = new AppServiceMonitor(stack, 'TestAppMonitor', {
      cluster,
      appName: 'my-app',
      appNamespace: 'default',
      scrapePodsDirectly: true,
    });

    expect(monitor.monitor).toBeDefined();
    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPodMonitor = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('PodMonitor') && manifest.includes('my-app-pods');
    });
    expect(hasPodMonitor).toBe(true);
  });

  test('uses app.kubernetes.io/name label for selector', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new AppServiceMonitor(stack, 'TestAppMonitor', {
      cluster,
      appName: 'my-app',
      appNamespace: 'default',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasLabel = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('app.kubernetes.io/name');
    });
    expect(hasLabel).toBe(true);
  });

  test('allows custom monitor namespace', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new AppServiceMonitor(stack, 'TestAppMonitor', {
      cluster,
      appName: 'my-app',
      appNamespace: 'default',
      monitorNamespace: 'observability',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasNamespace = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('ServiceMonitor') && manifest.includes('"namespace":"observability"');
    });
    expect(hasNamespace).toBe(true);
  });
});
