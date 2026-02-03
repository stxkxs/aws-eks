import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ArgoCDStack } from '../../lib/stacks/addons/argocd';
import {
  createTestVpc,
  createTestCluster,
  getTestConfig,
  hasHelmChart,
  getHelmChartValues,
  hasKubernetesResource,
  findHelmCharts,
  findKubernetesResources,
} from '../helpers';
import { EnvironmentConfig } from '../../lib/types/config';

describe('ArgoCDStack', () => {
  describe('with argocdEnabled', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'ParentStack');
      const vpc = createTestVpc(stack);
      const cluster = createTestCluster(stack, vpc);
      const config = getTestConfig('dev');

      const argocdStack = new ArgoCDStack(app, 'TestArgoCD', {
        config,
        cluster,
      });

      template = Template.fromStack(argocdStack);
    });

    test('deploys ArgoCD Helm chart', () => {
      expect(hasHelmChart(template, 'argo-cd')).toBe(true);
    });

    test('deploys ArgoCD to argocd namespace', () => {
      expect(hasHelmChart(template, 'argo-cd', 'argocd')).toBe(true);
    });

    test('uses correct Helm repository', () => {
      const charts = findHelmCharts(template);
      const argoChart = Object.values(charts).find((chart: any) => {
        return chart.Properties.Chart === 'argo-cd';
      });
      expect(argoChart).toBeDefined();
      expect((argoChart as any).Properties.Repository).toContain('argoproj');
    });

    test('creates AppProject manifest', () => {
      expect(hasKubernetesResource(template, 'AppProject', 'platform')).toBe(true);
    });

    test('creates App-of-Apps Application', () => {
      const resources = findKubernetesResources(template);
      const hasAppOfApps = Object.values(resources).some((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('"kind":"Application"') && manifest.includes('platform-addons');
      });
      expect(hasAppOfApps).toBe(true);
    });

    test('App-of-Apps has automated sync policy', () => {
      const resources = findKubernetesResources(template);
      const appOfApps = Object.values(resources).find((resource: any) => {
        const manifest = resource.Properties.Manifest;
        return manifest && manifest.includes('"kind":"Application"') && manifest.includes('platform-addons');
      });
      expect(appOfApps).toBeDefined();
      const manifest = (appOfApps as any).Properties.Manifest;
      expect(manifest).toContain('selfHeal');
      expect(manifest).toContain('prune');
    });

    test('creates cluster-config ConfigMap', () => {
      expect(hasKubernetesResource(template, 'ConfigMap', 'cluster-config')).toBe(true);
    });

    test('ArgoCD Helm values include CriticalAddonsOnly tolerations', () => {
      const values = getHelmChartValues(template, 'argo-cd');
      expect(values).not.toBeNull();
      const json = JSON.stringify(values);
      expect(json).toContain('CriticalAddonsOnly');
    });

    test('creates CfnOutputs', () => {
      template.hasOutput('ArgoCDUrl', {});
      template.hasOutput('ArgoCDAdminPasswordCommand', {});
    });
  });

  describe('with SSO enabled', () => {
    test('creates SSO callback URL output', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'ParentStack');
      const vpc = createTestVpc(stack);
      const cluster = createTestCluster(stack, vpc);

      const config = getTestConfig('dev');
      const ssoConfig: EnvironmentConfig = {
        ...config,
        argocd: {
          ...(config.argocd || {
            enabled: true,
            gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
            gitOpsRevision: 'main',
            gitOpsPath: 'applicationsets',
          }),
          ssoEnabled: true,
          githubOrg: 'my-org',
          oauthSecretName: 'argocd/github-oauth',
          hostname: 'argocd.example.com',
        },
      };

      const argocdStack = new ArgoCDStack(app, 'TestArgoCDSso', {
        config: ssoConfig,
        cluster,
      });

      const template = Template.fromStack(argocdStack);
      template.hasOutput('ArgoCDSSOCallbackUrl', {});
    });

    test('SSO config includes Dex connector settings', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'ParentStack');
      const vpc = createTestVpc(stack);
      const cluster = createTestCluster(stack, vpc);

      const config = getTestConfig('dev');
      const ssoConfig: EnvironmentConfig = {
        ...config,
        argocd: {
          ...(config.argocd || {
            enabled: true,
            gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
            gitOpsRevision: 'main',
            gitOpsPath: 'applicationsets',
          }),
          ssoEnabled: true,
          githubOrg: 'my-org',
          oauthSecretName: 'argocd/github-oauth',
          hostname: 'argocd.example.com',
        },
      };

      const argocdStack = new ArgoCDStack(app, 'TestArgoCDSsoDex', {
        config: ssoConfig,
        cluster,
      });

      const template = Template.fromStack(argocdStack);
      const values = getHelmChartValues(template, 'argo-cd');
      expect(values).not.toBeNull();
      const json = JSON.stringify(values);
      expect(json).toContain('dex');
    });
  });

  describe('with argocdEnabled=false', () => {
    test('does not create any resources', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'ParentStack');
      const vpc = createTestVpc(stack);
      const cluster = createTestCluster(stack, vpc);
      const config = getTestConfig('dev');

      const disabledConfig: EnvironmentConfig = {
        ...config,
        features: {
          ...config.features,
          argocdEnabled: false,
        },
      };

      const argocdStack = new ArgoCDStack(app, 'TestArgoCDDisabled', {
        config: disabledConfig,
        cluster,
      });

      const template = Template.fromStack(argocdStack);
      const helmCharts = template.findResources('Custom::AWSCDK-EKS-HelmChart');
      expect(Object.keys(helmCharts).length).toBe(0);
    });
  });
});
