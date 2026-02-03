import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  PodDisruptionBudgetConstruct,
  SystemPodDisruptionBudgets,
  createApplicationPdb,
} from '../../lib/constructs/pdb';
import { createTestCluster } from '../helpers';

describe('PodDisruptionBudgetConstruct', () => {
  test('creates PDB with minAvailable', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new PodDisruptionBudgetConstruct(stack, 'TestPdb', {
      cluster,
      name: 'test-pdb',
      namespace: 'default',
      spec: {
        selector: { matchLabels: { app: 'test' } },
        minAvailable: 1,
      },
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPdb = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('PodDisruptionBudget') && manifest.includes('test-pdb');
    });
    expect(hasPdb).toBe(true);
  });

  test('creates PDB with maxUnavailable', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new PodDisruptionBudgetConstruct(stack, 'TestPdb', {
      cluster,
      name: 'test-pdb',
      namespace: 'default',
      spec: {
        selector: { matchLabels: { app: 'test' } },
        maxUnavailable: '25%',
      },
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPdb = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('PodDisruptionBudget') && manifest.includes('25%');
    });
    expect(hasPdb).toBe(true);
  });

  test('throws if both minAvailable and maxUnavailable set', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    expect(() => {
      new PodDisruptionBudgetConstruct(stack, 'TestPdb', {
        cluster,
        name: 'test-pdb',
        namespace: 'default',
        spec: {
          selector: { matchLabels: { app: 'test' } },
          minAvailable: 1,
          maxUnavailable: 1,
        },
      });
    }).toThrow('Cannot specify both minAvailable and maxUnavailable');
  });

  test('throws if neither minAvailable nor maxUnavailable set', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    expect(() => {
      new PodDisruptionBudgetConstruct(stack, 'TestPdb', {
        cluster,
        name: 'test-pdb',
        namespace: 'default',
        spec: {
          selector: { matchLabels: { app: 'test' } },
        },
      });
    }).toThrow('Must specify either minAvailable or maxUnavailable');
  });
});

describe('SystemPodDisruptionBudgets', () => {
  test('creates PDBs for all components by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const pdbs = new SystemPodDisruptionBudgets(stack, 'SystemPdbs', {
      cluster,
    });

    expect(pdbs.pdbs.size).toBe(7);
    expect(pdbs.pdbs.has('coredns')).toBe(true);
    expect(pdbs.pdbs.has('cilium-operator')).toBe(true);
    expect(pdbs.pdbs.has('hubble-relay')).toBe(true);
    expect(pdbs.pdbs.has('karpenter')).toBe(true);
    expect(pdbs.pdbs.has('prometheus')).toBe(true);
    expect(pdbs.pdbs.has('grafana-agent')).toBe(true);
    expect(pdbs.pdbs.has('loki')).toBe(true);
  });

  test('skips CoreDNS PDB when disabled', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const pdbs = new SystemPodDisruptionBudgets(stack, 'SystemPdbs', {
      cluster,
      coreDns: false,
    });

    expect(pdbs.pdbs.has('coredns')).toBe(false);
  });

  test('skips Cilium PDBs when disabled', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const pdbs = new SystemPodDisruptionBudgets(stack, 'SystemPdbs', {
      cluster,
      cilium: false,
    });

    expect(pdbs.pdbs.has('cilium-operator')).toBe(false);
    expect(pdbs.pdbs.has('hubble-relay')).toBe(false);
  });
});

describe('createApplicationPdb', () => {
  test('creates PDB with app label', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    const pdb = createApplicationPdb(stack, 'AppPdb', cluster, {
      name: 'my-app-pdb',
      namespace: 'production',
      appLabel: 'my-app',
      minAvailable: 2,
    });

    expect(pdb.pdbName).toBe('my-app-pdb');

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPdb = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('my-app-pdb') && manifest.includes('my-app');
    });
    expect(hasPdb).toBe(true);
  });
});
