import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Template } from 'aws-cdk-lib/assertions';
import { GrafanaDashboard, StandardDashboards } from '../../lib/constructs/grafana-dashboard';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';

describe('GrafanaDashboard', () => {
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
    test('creates ConfigMap with dashboard JSON', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const dashboardJson = JSON.stringify({
        title: 'My Dashboard',
        panels: [],
      });

      const dashboard = new GrafanaDashboard(stack, 'TestDashboard', {
        cluster,
        name: 'my-dashboard',
        namespace: 'monitoring',
        dashboardJson,
      });

      expect(dashboard.manifest).toBeDefined();
      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasConfigMap = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('ConfigMap') && manifest.includes('grafana-dashboard-my-dashboard');
      });
      expect(hasConfigMap).toBe(true);
    });

    test('adds grafana_dashboard label', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new GrafanaDashboard(stack, 'TestDashboard', {
        cluster,
        name: 'labeled-dashboard',
        namespace: 'monitoring',
        dashboardJson: '{}',
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasLabel = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('grafana_dashboard');
      });
      expect(hasLabel).toBe(true);
    });

    test('adds folder annotation when specified', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new GrafanaDashboard(stack, 'TestDashboard', {
        cluster,
        name: 'folder-dashboard',
        namespace: 'monitoring',
        dashboardJson: '{}',
        folder: 'kubernetes',
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasFolder = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('grafana_folder');
      });
      expect(hasFolder).toBe(true);
    });

    test('includes custom labels', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new GrafanaDashboard(stack, 'TestDashboard', {
        cluster,
        name: 'custom-labeled',
        namespace: 'monitoring',
        dashboardJson: '{}',
        labels: { team: 'ops', environment: 'prod' },
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasCustomLabels = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('"team":"ops"') && manifest.includes('"environment":"prod"');
      });
      expect(hasCustomLabels).toBe(true);
    });

    test('stores dashboard JSON in correct file name', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new GrafanaDashboard(stack, 'TestDashboard', {
        cluster,
        name: 'test-dash',
        namespace: 'monitoring',
        dashboardJson: '{"title":"Test"}',
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasCorrectKey = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('test-dash.json');
      });
      expect(hasCorrectKey).toBe(true);
    });
  });
});

describe('StandardDashboards', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  test('creates cluster overview dashboard by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardDashboards(stack, 'TestDashboards', {
      cluster,
      namespace: 'monitoring',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasClusterOverview = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('cluster-overview');
    });
    expect(hasClusterOverview).toBe(true);
  });

  test('creates node health dashboard by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardDashboards(stack, 'TestDashboards', {
      cluster,
      namespace: 'monitoring',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasNodeHealth = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('node-health');
    });
    expect(hasNodeHealth).toBe(true);
  });

  test('creates pod metrics dashboard by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardDashboards(stack, 'TestDashboards', {
      cluster,
      namespace: 'monitoring',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPodMetrics = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('pod-metrics');
    });
    expect(hasPodMetrics).toBe(true);
  });

  test('does not create network flows dashboard by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardDashboards(stack, 'TestDashboards', {
      cluster,
      namespace: 'monitoring',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasNetworkFlows = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('network-flows');
    });
    expect(hasNetworkFlows).toBe(false);
  });

  test('creates network flows dashboard when enabled', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardDashboards(stack, 'TestDashboards', {
      cluster,
      namespace: 'monitoring',
      networkFlows: true,
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasNetworkFlows = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('network-flows');
    });
    expect(hasNetworkFlows).toBe(true);
  });

  test('can disable individual dashboards', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardDashboards(stack, 'TestDashboards', {
      cluster,
      namespace: 'monitoring',
      clusterOverview: false,
      nodeHealth: false,
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');

    const hasClusterOverview = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('cluster-overview');
    });
    expect(hasClusterOverview).toBe(false);

    const hasNodeHealth = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('node-health');
    });
    expect(hasNodeHealth).toBe(false);

    // Pod metrics should still be present
    const hasPodMetrics = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('pod-metrics');
    });
    expect(hasPodMetrics).toBe(true);
  });

  test('places dashboards in kubernetes folder', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardDashboards(stack, 'TestDashboards', {
      cluster,
      namespace: 'monitoring',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasKubernetesFolder = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('"grafana_folder":"kubernetes"');
    });
    expect(hasKubernetesFolder).toBe(true);
  });
});
