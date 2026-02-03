import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ArgoCDBootstrap } from '../../lib/constructs/argocd-bootstrap';
import { createTestCluster, getTestConfig, manifestContains } from '../helpers';

describe('ArgoCDBootstrap', () => {
  test('deploys ArgoCD Helm chart', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);
    const config = getTestConfig('dev');

    new ArgoCDBootstrap(stack, 'ArgoCD', {
      cluster,
      config,
      version: 'v7.8.2',
      gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
    });

    const template = Template.fromStack(stack);
    const charts = template.findResources('Custom::AWSCDK-EKS-HelmChart');
    const hasArgocd = Object.values(charts).some((chart: any) => {
      return chart.Properties.Chart === 'argo-cd';
    });
    expect(hasArgocd).toBe(true);
  });

  test('creates platform AppProject', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);
    const config = getTestConfig('dev');

    new ArgoCDBootstrap(stack, 'ArgoCD', {
      cluster,
      config,
      version: 'v7.8.2',
      gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasAppProject = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('AppProject') && manifest.includes('platform');
    });
    expect(hasAppProject).toBe(true);
  });

  test('creates App-of-Apps Application', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);
    const config = getTestConfig('dev');

    new ArgoCDBootstrap(stack, 'ArgoCD', {
      cluster,
      config,
      version: 'v7.8.2',
      gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasAppOfApps = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('"kind":"Application"') && manifest.includes('platform-addons');
    });
    expect(hasAppOfApps).toBe(true);
  });

  test('creates cluster config ConfigMap', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);
    const config = getTestConfig('dev');

    new ArgoCDBootstrap(stack, 'ArgoCD', {
      cluster,
      config,
      version: 'v7.8.2',
      gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasConfigMap = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifestContains(manifest, 'ConfigMap') && manifestContains(manifest, 'cluster-config');
    });
    expect(hasConfigMap).toBe(true);
  });

  test('includes SSO config when ssoEnabled', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);
    const config = getTestConfig('dev');

    new ArgoCDBootstrap(stack, 'ArgoCD', {
      cluster,
      config,
      version: 'v7.8.2',
      gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
      ssoEnabled: true,
      githubOrg: 'my-org',
      oauthSecretName: 'argocd/github-oauth',
      hostname: 'argocd.example.com',
    });

    const template = Template.fromStack(stack);
    const charts = template.findResources('Custom::AWSCDK-EKS-HelmChart');
    const argoChart = Object.values(charts).find((chart: any) => chart.Properties.Chart === 'argo-cd');
    expect(argoChart).toBeDefined();
    const values = JSON.parse((argoChart as any).Properties.Values);
    expect(values.dex?.enabled).toBe(true);
  });

  test('adds sync windows for production', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    const cluster = createTestCluster(stack);
    const config = getTestConfig('production');

    new ArgoCDBootstrap(stack, 'ArgoCD', {
      cluster,
      config,
      version: 'v7.8.2',
      gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
    });

    const template = Template.fromStack(stack);
    const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const hasSyncWindows = Object.values(resources).some((resource: any) => {
      const manifest = resource.Properties.Manifest;
      return manifest && manifest.includes('AppProject') && manifest.includes('syncWindows');
    });
    expect(hasSyncWindows).toBe(true);
  });
});
