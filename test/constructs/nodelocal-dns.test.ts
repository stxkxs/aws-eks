import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NodeLocalDns } from '../../lib/constructs/nodelocal-dns';
import { createTestCluster } from '../helpers';

describe('NodeLocalDns', () => {
  test('creates ServiceAccount in kube-system', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new NodeLocalDns(stack, 'NodeLocalDns', {
      cluster,
      clusterDnsIp: '172.20.0.10',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasSa = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('"kind":"ServiceAccount"') && manifest.includes('node-local-dns');
    });
    expect(hasSa).toBe(true);
  });

  test('creates ConfigMap with Corefile', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new NodeLocalDns(stack, 'NodeLocalDns', {
      cluster,
      clusterDnsIp: '172.20.0.10',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasConfigMap = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('"kind":"ConfigMap"') && manifest.includes('Corefile');
    });
    expect(hasConfigMap).toBe(true);
  });

  test('creates DaemonSet in kube-system', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new NodeLocalDns(stack, 'NodeLocalDns', {
      cluster,
      clusterDnsIp: '172.20.0.10',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasDaemonSet = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('"kind":"DaemonSet"') && manifest.includes('node-local-dns');
    });
    expect(hasDaemonSet).toBe(true);
  });

  test('Corefile includes cache block by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new NodeLocalDns(stack, 'NodeLocalDns', {
      cluster,
      clusterDnsIp: '172.20.0.10',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasCache = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('ConfigMap') && manifest.includes('cache 30');
    });
    expect(hasCache).toBe(true);
  });

  test('Corefile includes prometheus metrics by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new NodeLocalDns(stack, 'NodeLocalDns', {
      cluster,
      clusterDnsIp: '172.20.0.10',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasMetrics = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('ConfigMap') && manifest.includes('prometheus :9253');
    });
    expect(hasMetrics).toBe(true);
  });

  test('DaemonSet uses hostNetwork', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new NodeLocalDns(stack, 'NodeLocalDns', {
      cluster,
      clusterDnsIp: '172.20.0.10',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasHostNetwork = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('DaemonSet') && manifest.includes('"hostNetwork":true');
    });
    expect(hasHostNetwork).toBe(true);
  });
});
