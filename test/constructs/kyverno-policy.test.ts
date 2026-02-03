import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Template } from 'aws-cdk-lib/assertions';
import {
  KyvernoPolicy,
  KyvernoSecurityPolicies,
  DEFAULT_EXCLUDED_NAMESPACES,
} from '../../lib/constructs/kyverno-policy';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';

describe('KyvernoPolicy', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  describe('basic policy creation', () => {
    test('creates ClusterPolicy with correct name', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = new KyvernoPolicy(stack, 'TestPolicy', {
        cluster,
        name: 'my-test-policy',
        validationFailureAction: 'Audit',
        rules: [
          {
            name: 'test-rule',
            match: { kinds: ['Pod'] },
            message: 'Test message',
            pattern: { spec: { containers: [{ name: '?*' }] } },
          },
        ],
      });

      expect(policy.policyName).toBe('my-test-policy');
      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasPolicy = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('my-test-policy');
      });
      expect(hasPolicy).toBe(true);
    });

    test('creates policy with Audit action', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new KyvernoPolicy(stack, 'TestPolicy', {
        cluster,
        name: 'audit-policy',
        validationFailureAction: 'Audit',
        rules: [
          {
            name: 'test-rule',
            match: { kinds: ['Pod'] },
            message: 'Test message',
            pattern: {},
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasAuditPolicy = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('Audit');
      });
      expect(hasAuditPolicy).toBe(true);
    });

    test('creates policy with Enforce action', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new KyvernoPolicy(stack, 'TestPolicy', {
        cluster,
        name: 'enforce-policy',
        validationFailureAction: 'Enforce',
        rules: [
          {
            name: 'test-rule',
            match: { kinds: ['Pod'] },
            message: 'Test message',
            pattern: {},
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasEnforcePolicy = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('Enforce');
      });
      expect(hasEnforcePolicy).toBe(true);
    });

    test('adds category annotation', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new KyvernoPolicy(stack, 'TestPolicy', {
        cluster,
        name: 'categorized-policy',
        validationFailureAction: 'Audit',
        category: 'security',
        rules: [
          {
            name: 'test-rule',
            match: { kinds: ['Pod'] },
            message: 'Test message',
            pattern: {},
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasCategory = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('policies.kyverno.io/category');
      });
      expect(hasCategory).toBe(true);
    });

    test('adds compliance annotation', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new KyvernoPolicy(stack, 'TestPolicy', {
        cluster,
        name: 'compliant-policy',
        validationFailureAction: 'Enforce',
        compliance: ['SOC2', 'HIPAA'],
        rules: [
          {
            name: 'test-rule',
            match: { kinds: ['Pod'] },
            message: 'Test message',
            pattern: {},
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasCompliance = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('policies.kyverno.io/compliance');
      });
      expect(hasCompliance).toBe(true);
    });
  });

  describe('environment-aware policy creation', () => {
    test('enforces in production', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      KyvernoPolicy.createEnvironmentAware(stack, 'TestPolicy', {
        cluster,
        environment: 'production',
        name: 'env-aware-policy',
        rules: [
          {
            name: 'test-rule',
            match: { kinds: ['Pod'] },
            message: 'Test message',
            pattern: {},
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasEnforce = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('"validationFailureAction":"Enforce"');
      });
      expect(hasEnforce).toBe(true);
    });

    test('audits in dev', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      KyvernoPolicy.createEnvironmentAware(stack, 'TestPolicy', {
        cluster,
        environment: 'dev',
        name: 'env-aware-policy',
        rules: [
          {
            name: 'test-rule',
            match: { kinds: ['Pod'] },
            message: 'Test message',
            pattern: {},
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasAudit = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('"validationFailureAction":"Audit"');
      });
      expect(hasAudit).toBe(true);
    });

    test('always enforce overrides environment', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      KyvernoPolicy.createEnvironmentAware(stack, 'TestPolicy', {
        cluster,
        environment: 'dev',
        name: 'always-enforce-policy',
        alwaysEnforce: true,
        rules: [
          {
            name: 'test-rule',
            match: { kinds: ['Pod'] },
            message: 'Test message',
            pattern: {},
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasEnforce = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('"validationFailureAction":"Enforce"');
      });
      expect(hasEnforce).toBe(true);
    });
  });
});

describe('KyvernoSecurityPolicies', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  describe('disallowPrivileged', () => {
    test('creates disallow-privileged policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = KyvernoSecurityPolicies.disallowPrivileged(stack, 'TestPolicy', cluster);

      expect(policy.policyName).toBe('disallow-privileged');
    });

    test('always enforces privileged policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      KyvernoSecurityPolicies.disallowPrivileged(stack, 'TestPolicy', cluster);

      const template = Template.fromStack(stack);
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasEnforce = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('disallow-privileged') && manifest.includes('Enforce');
      });
      expect(hasEnforce).toBe(true);
    });
  });

  describe('disallowHostPath', () => {
    test('creates disallow-host-path policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = KyvernoSecurityPolicies.disallowHostPath(stack, 'TestPolicy', cluster);

      expect(policy.policyName).toBe('disallow-host-path');
    });
  });

  describe('disallowHostNetwork', () => {
    test('creates disallow-host-network policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = KyvernoSecurityPolicies.disallowHostNetwork(stack, 'TestPolicy', cluster);

      expect(policy.policyName).toBe('disallow-host-network');
    });
  });

  describe('disallowLatestTag', () => {
    test('creates disallow-latest-tag policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = KyvernoSecurityPolicies.disallowLatestTag(stack, 'TestPolicy', cluster, 'dev');

      expect(policy.policyName).toBe('disallow-latest-tag');
    });
  });

  describe('requireRunAsNonRoot', () => {
    test('creates require-run-as-non-root policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = KyvernoSecurityPolicies.requireRunAsNonRoot(stack, 'TestPolicy', cluster, 'production');

      expect(policy.policyName).toBe('require-run-as-non-root');
    });
  });

  describe('disallowPrivilegeEscalation', () => {
    test('creates disallow-privilege-escalation policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = KyvernoSecurityPolicies.disallowPrivilegeEscalation(stack, 'TestPolicy', cluster);

      expect(policy.policyName).toBe('disallow-privilege-escalation');
    });
  });

  describe('requireReadOnlyRootFilesystem', () => {
    test('creates require-ro-rootfs policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = KyvernoSecurityPolicies.requireReadOnlyRootFilesystem(stack, 'TestPolicy', cluster, 'staging');

      expect(policy.policyName).toBe('require-ro-rootfs');
    });
  });

  describe('requireDropCapabilities', () => {
    test('creates require-drop-capabilities policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const policy = KyvernoSecurityPolicies.requireDropCapabilities(stack, 'TestPolicy', cluster, 'production');

      expect(policy.policyName).toBe('require-drop-capabilities');
    });
  });
});

describe('DEFAULT_EXCLUDED_NAMESPACES', () => {
  test('includes kube-system', () => {
    expect(DEFAULT_EXCLUDED_NAMESPACES).toContain('kube-system');
  });

  test('includes kube-public', () => {
    expect(DEFAULT_EXCLUDED_NAMESPACES).toContain('kube-public');
  });

  test('includes kube-node-lease', () => {
    expect(DEFAULT_EXCLUDED_NAMESPACES).toContain('kube-node-lease');
  });
});
