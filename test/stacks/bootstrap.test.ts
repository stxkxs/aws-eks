import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { BootstrapAddonsStack } from '../../lib/stacks/addons/bootstrap';
import {
  createTestVpc,
  createTestCluster,
  getTestConfig,
  getHelmChartValues,
  hasHelmChart,
  hasKubernetesResource,
  findKubernetesResources,
  manifestContains,
} from '../helpers';

describe('BootstrapAddonsStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'ParentStack');
    const vpc = createTestVpc(stack);
    const cluster = createTestCluster(stack, vpc);
    const config = getTestConfig('dev');

    const bootstrapStack = new BootstrapAddonsStack(app, 'TestBootstrap', {
      config,
      cluster,
      vpc,
    });

    template = Template.fromStack(bootstrapStack);
  });

  // ── Chart existence tests ────────────────────────────────────────────

  test('deploys EBS CSI driver Helm chart', () => {
    expect(hasHelmChart(template, 'aws-ebs-csi-driver')).toBe(true);
  });

  test('deploys AWS Load Balancer Controller Helm chart', () => {
    expect(hasHelmChart(template, 'aws-load-balancer-controller')).toBe(true);
  });

  test('deploys cert-manager Helm chart', () => {
    expect(hasHelmChart(template, 'cert-manager')).toBe(true);
  });

  test('deploys external-secrets Helm chart', () => {
    expect(hasHelmChart(template, 'external-secrets')).toBe(true);
  });

  test('deploys external-dns Helm chart', () => {
    expect(hasHelmChart(template, 'external-dns')).toBe(true);
  });

  test('deploys metrics-server Helm chart', () => {
    expect(hasHelmChart(template, 'metrics-server')).toBe(true);
  });

  test('deploys reloader Helm chart', () => {
    expect(hasHelmChart(template, 'reloader')).toBe(true);
  });

  test('deploys prometheus-operator-crds Helm chart', () => {
    expect(hasHelmChart(template, 'prometheus-operator-crds')).toBe(true);
  });

  // ── Helm values validation ───────────────────────────────────────────

  test('cert-manager has installCRDs enabled', () => {
    const values = getHelmChartValues(template, 'cert-manager');
    expect(values).not.toBeNull();
    expect(values!.installCRDs).toBe(true);
  });

  test('cert-manager uses pre-created service account', () => {
    const values = getHelmChartValues(template, 'cert-manager');
    expect(values).not.toBeNull();
    expect(values!.serviceAccount).toEqual(expect.objectContaining({ create: false, name: 'cert-manager' }));
  });

  test('ALB controller has clusterName and vpcId set', () => {
    const values = getHelmChartValues(template, 'aws-load-balancer-controller');
    expect(values).not.toBeNull();
    // clusterName and vpcId may be CDK tokens replaced with __CDK_TOKEN__
    const json = JSON.stringify(values);
    expect(json).toContain('clusterName');
    expect(json).toContain('vpcId');
  });

  test('ALB controller uses pre-created service account', () => {
    const values = getHelmChartValues(template, 'aws-load-balancer-controller');
    expect(values).not.toBeNull();
    const sa = values!.serviceAccount as Record<string, unknown>;
    expect(sa).toBeDefined();
    expect(sa.create).toBe(false);
    expect(sa.name).toBe('aws-load-balancer-controller');
  });

  test('external-dns has aws provider configured', () => {
    const values = getHelmChartValues(template, 'external-dns');
    expect(values).not.toBeNull();
    expect(values!.provider).toBe('aws');
  });

  test('external-dns uses pre-created service account', () => {
    const values = getHelmChartValues(template, 'external-dns');
    expect(values).not.toBeNull();
    const sa = values!.serviceAccount as Record<string, unknown>;
    expect(sa).toBeDefined();
    expect(sa.create).toBe(false);
    expect(sa.name).toBe('external-dns');
  });

  test('external-secrets uses pre-created service account', () => {
    const values = getHelmChartValues(template, 'external-secrets');
    expect(values).not.toBeNull();
    expect(values!.serviceAccount).toEqual(expect.objectContaining({ create: false, name: 'external-secrets' }));
  });

  // ── CriticalAddonsOnly tolerations ───────────────────────────────────

  const chartsRequiringTolerations = [
    'cert-manager',
    'aws-load-balancer-controller',
    'external-dns',
    'external-secrets',
    'metrics-server',
  ];

  test.each(chartsRequiringTolerations)('%s has CriticalAddonsOnly toleration', (chartName) => {
    const values = getHelmChartValues(template, chartName);
    expect(values).not.toBeNull();
    const json = JSON.stringify(values);
    expect(json).toContain('CriticalAddonsOnly');
  });

  // ── IRSA service account bindings ────────────────────────────────────

  test('creates multiple IRSA service accounts', () => {
    const k8sResources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const serviceAccounts = Object.values(k8sResources).filter((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifestContains(manifest, 'ServiceAccount');
    });
    expect(serviceAccounts.length).toBeGreaterThanOrEqual(4);
  });

  // ── Namespace pre-creation ───────────────────────────────────────────

  test('creates bootstrap namespaces', () => {
    expect(hasKubernetesResource(template, 'Namespace', 'cert-manager')).toBe(true);
  });

  test('creates external-secrets namespace', () => {
    expect(hasKubernetesResource(template, 'Namespace', 'external-secrets')).toBe(true);
  });

  test('creates external-dns namespace', () => {
    expect(hasKubernetesResource(template, 'Namespace', 'external-dns')).toBe(true);
  });

  test('creates monitoring namespace', () => {
    expect(hasKubernetesResource(template, 'Namespace', 'monitoring')).toBe(true);
  });

  // ── gp3 StorageClass ─────────────────────────────────────────────────

  test('creates gp3 StorageClass', () => {
    expect(hasKubernetesResource(template, 'StorageClass', 'gp3')).toBe(true);
  });

  test('gp3 StorageClass is marked as default', () => {
    const resources = findKubernetesResources(template);
    const gp3 = Object.values(resources).find((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifestContains(manifest, 'StorageClass') && manifestContains(manifest, 'gp3');
    });
    expect(gp3).toBeDefined();
    const manifest = (gp3 as any).Properties.Manifest;
    expect(manifestContains(manifest, 'storageclass.kubernetes.io/is-default-class')).toBe(true);
  });

  // ── Let's Encrypt + ClusterSecretStore ───────────────────────────────

  test("creates ClusterIssuer manifests for Let's Encrypt", () => {
    expect(hasKubernetesResource(template, 'ClusterIssuer', 'letsencrypt-prod')).toBe(true);
    expect(hasKubernetesResource(template, 'ClusterIssuer', 'letsencrypt-staging')).toBe(true);
  });

  test('creates ClusterSecretStore manifests', () => {
    expect(hasKubernetesResource(template, 'ClusterSecretStore', 'aws-secrets-manager')).toBe(true);
    expect(hasKubernetesResource(template, 'ClusterSecretStore', 'aws-parameter-store')).toBe(true);
  });
});
