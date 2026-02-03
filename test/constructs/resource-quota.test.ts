import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  ResourceQuotaConstruct,
  NamespaceResourceQuota,
  LimitRangeConstruct,
} from '../../lib/constructs/resource-quota';
import { createTestCluster } from '../helpers';

describe('ResourceQuotaConstruct', () => {
  test('creates ResourceQuota with correct spec', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const rq = new ResourceQuotaConstruct(stack, 'TestQuota', {
      cluster,
      name: 'test-quota',
      namespace: 'team-a',
      spec: {
        hard: {
          'requests.cpu': '10',
          'requests.memory': '20Gi',
          pods: '50',
        },
      },
    });

    expect(rq.quotaName).toBe('test-quota');
    expect(rq.namespace).toBe('team-a');

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasQuota = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('ResourceQuota') && manifest.includes('test-quota');
    });
    expect(hasQuota).toBe(true);
  });

  test('creates namespace when createNamespace is true', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new ResourceQuotaConstruct(stack, 'TestQuota', {
      cluster,
      name: 'test-quota',
      namespace: 'new-ns',
      spec: { hard: { pods: '10' } },
      createNamespace: true,
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasNamespace = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('"kind":"Namespace"') && manifest.includes('new-ns');
    });
    expect(hasNamespace).toBe(true);
  });
});

describe('NamespaceResourceQuota', () => {
  test('uses medium tier by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new NamespaceResourceQuota(stack, 'TestQuota', {
      cluster,
      namespace: 'team-a',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasQuota = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('ResourceQuota') && manifest.includes('"requests.cpu":"16"');
    });
    expect(hasQuota).toBe(true);
  });

  test('merges custom limits over tier defaults', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new NamespaceResourceQuota(stack, 'TestQuota', {
      cluster,
      namespace: 'team-a',
      tier: 'medium',
      customLimits: { pods: '75' },
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasCustomPods = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('ResourceQuota') && manifest.includes('"pods":"75"');
    });
    expect(hasCustomPods).toBe(true);
  });
});

describe('LimitRangeConstruct', () => {
  test('creates LimitRange with default values', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new LimitRangeConstruct(stack, 'TestLimits', {
      cluster,
      namespace: 'team-a',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasLimitRange = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('LimitRange') && manifest.includes('500m') && manifest.includes('512Mi');
    });
    expect(hasLimitRange).toBe(true);
  });

  test('respects custom default values', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new LimitRangeConstruct(stack, 'TestLimits', {
      cluster,
      namespace: 'team-a',
      defaultCpuLimit: '1',
      defaultMemoryLimit: '1Gi',
      defaultCpuRequest: '200m',
      defaultMemoryRequest: '256Mi',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasCustom = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('LimitRange') && manifest.includes('1Gi') && manifest.includes('256Mi');
    });
    expect(hasCustom).toBe(true);
  });
});
