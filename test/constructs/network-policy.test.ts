import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CiliumNetworkPolicy, DefaultDenyPolicy, NetworkPolicyTemplates } from '../../lib/constructs/network-policy';
import { createTestCluster } from '../helpers';

describe('CiliumNetworkPolicy', () => {
  test('creates CiliumNetworkPolicy manifest', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new CiliumNetworkPolicy(stack, 'TestPolicy', {
      cluster,
      name: 'test-policy',
      namespace: 'default',
      endpointSelector: { matchLabels: { app: 'web' } },
      ingress: [
        {
          fromEndpoints: [{ matchLabels: { app: 'frontend' } }],
          toPorts: [{ port: 8080, protocol: 'TCP' }],
        },
      ],
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPolicy = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('CiliumNetworkPolicy') && manifest.includes('test-policy');
    });
    expect(hasPolicy).toBe(true);
  });

  test('handles egress rules with FQDN', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new CiliumNetworkPolicy(stack, 'TestPolicy', {
      cluster,
      name: 'fqdn-egress',
      namespace: 'default',
      endpointSelector: { matchLabels: { app: 'backend' } },
      egress: [
        {
          toFQDNs: ['api.example.com'],
          toPorts: [{ port: 443, protocol: 'TCP' }],
        },
      ],
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasFqdn = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('api.example.com') && manifest.includes('matchPattern');
    });
    expect(hasFqdn).toBe(true);
  });

  test('adds description annotation', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new CiliumNetworkPolicy(stack, 'TestPolicy', {
      cluster,
      name: 'described-policy',
      namespace: 'default',
      description: 'Allow frontend to backend',
      endpointSelector: {},
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasDescription = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('Allow frontend to backend');
    });
    expect(hasDescription).toBe(true);
  });
});

describe('DefaultDenyPolicy', () => {
  test('creates ingress deny policy', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new DefaultDenyPolicy(stack, 'DenyPolicy', {
      cluster,
      namespace: 'production',
      direction: 'ingress',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasIngressDeny = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('default-deny-ingress');
    });
    expect(hasIngressDeny).toBe(true);
  });

  test('creates egress deny policy', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new DefaultDenyPolicy(stack, 'DenyPolicy', {
      cluster,
      namespace: 'production',
      direction: 'egress',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasEgressDeny = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('default-deny-egress');
    });
    expect(hasEgressDeny).toBe(true);
  });

  test('creates both ingress and egress policies by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new DefaultDenyPolicy(stack, 'DenyPolicy', {
      cluster,
      namespace: 'production',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const manifests = Object.values(resources).map((r: any) => r.Properties.Manifest);
    const hasIngress = manifests.some((m) => m && m.includes('default-deny-ingress'));
    const hasEgress = manifests.some((m) => m && m.includes('default-deny-egress'));
    expect(hasIngress).toBe(true);
    expect(hasEgress).toBe(true);
  });

  test('egress deny includes DNS exception when allowDns is true', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new DefaultDenyPolicy(stack, 'DenyPolicy', {
      cluster,
      namespace: 'production',
      direction: 'egress',
      allowDns: true,
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasDnsException = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('kube-dns') && manifest.includes('"53"');
    });
    expect(hasDnsException).toBe(true);
  });

  test('egress deny includes kube-system exception when allowKubeSystem is true', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    new DefaultDenyPolicy(stack, 'DenyPolicy', {
      cluster,
      namespace: 'production',
      direction: 'egress',
      allowKubeSystem: true,
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasKubeSystemException = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('k8s:io.kubernetes.pod.namespace') && manifest.includes('kube-system');
    });
    expect(hasKubeSystemException).toBe(true);
  });
});

describe('NetworkPolicyTemplates', () => {
  test('allowNamespaceIngress creates correct policy', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    NetworkPolicyTemplates.allowNamespaceIngress(stack, 'AllowIngress', cluster, 'backend', 'frontend');

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPolicy = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('allow-from-frontend') && manifest.includes('backend');
    });
    expect(hasPolicy).toBe(true);
  });

  test('allowFqdnEgress creates FQDN egress policy', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    NetworkPolicyTemplates.allowFqdnEgress(
      stack,
      'AllowEgress',
      cluster,
      'backend',
      ['api.stripe.com', 'api.github.com'],
      { matchLabels: { app: 'payment-service' } },
    );

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPolicy = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('api.stripe.com') && manifest.includes('api.github.com');
    });
    expect(hasPolicy).toBe(true);
  });

  test('databaseAccess creates database access policy', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);

    NetworkPolicyTemplates.databaseAccess(
      stack,
      'DbAccess',
      cluster,
      'database',
      { matchLabels: { app: 'postgresql' } },
      ['backend', 'analytics'],
      5432,
    );

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasPolicy = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('database-access') && manifest.includes('5432');
    });
    expect(hasPolicy).toBe(true);
  });
});
