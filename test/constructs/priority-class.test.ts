import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PriorityClassConstruct, StandardPriorityClasses } from '../../lib/constructs/priority-class';
import { createTestCluster } from '../helpers';

describe('PriorityClassConstruct', () => {
  test('creates PriorityClass with correct value', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const pc = new PriorityClassConstruct(stack, 'TestPc', {
      cluster,
      name: 'test-priority',
      spec: {
        value: 100000,
        description: 'Test priority class',
      },
    });

    expect(pc.priorityClassName).toBe('test-priority');

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPc = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('PriorityClass') && manifest.includes('test-priority');
    });
    expect(hasPc).toBe(true);
  });
});

describe('StandardPriorityClasses', () => {
  test('creates 6 priority classes by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const spc = new StandardPriorityClasses(stack, 'Standards', {
      cluster,
    });

    expect(spc.priorityClasses.size).toBe(6);
  });

  test('workload-standard has globalDefault true', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardPriorityClasses(stack, 'Standards', { cluster });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasGlobalDefault = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('workload-standard') && manifest.includes('"globalDefault":true');
    });
    expect(hasGlobalDefault).toBe(true);
  });

  test('workload-preemptible has Never preemption policy', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new StandardPriorityClasses(stack, 'Standards', { cluster });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasNever = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('workload-preemptible') && manifest.includes('"preemptionPolicy":"Never"');
    });
    expect(hasNever).toBe(true);
  });

  test('respects createPlatformClasses flag', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const spc = new StandardPriorityClasses(stack, 'Standards', {
      cluster,
      createPlatformClasses: false,
    });

    expect(spc.priorityClasses.size).toBe(4);
    expect(spc.priorityClasses.has('platform-critical')).toBe(false);
    expect(spc.priorityClasses.has('platform-standard')).toBe(false);
  });

  test('respects createWorkloadClasses flag', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const spc = new StandardPriorityClasses(stack, 'Standards', {
      cluster,
      createWorkloadClasses: false,
    });

    expect(spc.priorityClasses.size).toBe(2);
    expect(spc.priorityClasses.has('workload-critical')).toBe(false);
  });
});
