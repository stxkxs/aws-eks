import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../../types';
import { ArgoCDBootstrap } from '../../constructs/argocd-bootstrap';

/**
 * Properties for ArgoCDStack
 */
export interface ArgoCDStackProps extends cdk.StackProps {
  /** Environment configuration */
  readonly config: EnvironmentConfig;

  /** EKS cluster */
  readonly cluster: eks.ICluster;

  /** ACM certificate ARN for ALB HTTPS (optional, auto-discovers if omitted) */
  readonly certificateArn?: string;
}

/**
 * ArgoCD stack that deploys ArgoCD and bootstraps GitOps.
 *
 * This stack:
 * 1. Deploys ArgoCD Helm chart
 * 2. Creates the platform AppProject
 * 3. Creates the App-of-Apps Application pointing to aws-eks-gitops
 *
 * After deployment, ArgoCD will automatically sync and deploy:
 * - Cilium configuration
 * - Hubble UI
 * - Kyverno and policies
 * - Trivy Operator
 * - Observability stack (Loki, Tempo, Grafana Agent)
 * - Operations tools (Velero, Goldilocks)
 * - Karpenter NodePools and EC2NodeClasses
 *
 * Prerequisites (deployed by BootstrapStack):
 * - cert-manager (for TLS)
 * - external-secrets (for secrets)
 * - AWS Load Balancer Controller (for ingress)
 * - External DNS (for DNS records)
 *
 * @remarks
 * Deployment is gated by the {@link FeatureFlags.argocdEnabled} feature flag.
 * When `config.features.argocdEnabled` is `false`, the constructor returns
 * early and no resources are created. This allows environments to opt out
 * of GitOps (e.g., for isolated testing) while keeping the stack in the
 * CDK app definition.
 *
 * @see {@link ArgoCDBootstrap} for the underlying construct
 * @see {@link EnvironmentConfig.argocd} for ArgoCD configuration options
 */
export class ArgoCDStack extends cdk.Stack {
  /** The ArgoCD bootstrap construct (only set when `argocdEnabled` is true) */
  public readonly argocd!: ArgoCDBootstrap;

  /**
   * @param scope - CDK scope (typically the App)
   * @param id - Construct ID for this stack
   * @param props - Stack properties including cluster, config, and optional certificate ARN
   */
  constructor(scope: Construct, id: string, props: ArgoCDStackProps) {
    super(scope, id, props);

    const { config, cluster } = props;

    // Only deploy ArgoCD if enabled
    if (!config.features.argocdEnabled) {
      return;
    }

    // Get ArgoCD configuration
    const argocdConfig = config.argocd || {
      enabled: true,
      gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
      gitOpsRevision: 'main',
      gitOpsPath: 'applicationsets',
    };

    // Deploy ArgoCD with App-of-Apps bootstrap
    this.argocd = new ArgoCDBootstrap(this, 'ArgoCD', {
      cluster,
      config,
      version: config.helmConfigs.argocd.version,
      values: config.helmConfigs.argocd.values,
      gitOpsRepoUrl: argocdConfig.gitOpsRepoUrl ?? 'https://github.com/example/aws-eks-gitops.git',
      gitOpsRevision: argocdConfig.gitOpsRevision,
      gitOpsPath: argocdConfig.gitOpsPath,
      hostname: argocdConfig.hostname,
      platformProjectName: argocdConfig.platformProjectName,
      ssoEnabled: argocdConfig.ssoEnabled,
      githubOrg: argocdConfig.githubOrg,
      oauthSecretName: argocdConfig.oauthSecretName,
      rbacDefaultPolicy: argocdConfig.rbacDefaultPolicy,
      certificateArn: props.certificateArn,
    });

    // Output ArgoCD URL
    new cdk.CfnOutput(this, 'ArgoCDUrl', {
      value: argocdConfig.hostname ? `https://${argocdConfig.hostname}` : `https://argocd.${config.dns.domainName}`,
      description: 'ArgoCD UI URL',
    });

    // Output initial admin password retrieval command
    new cdk.CfnOutput(this, 'ArgoCDAdminPasswordCommand', {
      value: 'kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d',
      description: 'Command to retrieve ArgoCD initial admin password',
    });

    // Output SSO callback URL when SSO is enabled
    if (argocdConfig.ssoEnabled && argocdConfig.hostname) {
      new cdk.CfnOutput(this, 'ArgoCDSSOCallbackUrl', {
        value: `https://${argocdConfig.hostname}/api/dex/callback`,
        description: 'ArgoCD Dex SSO callback URL (set this in your GitHub OAuth App)',
      });
    }

    // Apply tags
    for (const [key, value] of Object.entries(config.tags)) {
      cdk.Tags.of(this).add(key, value);
    }
  }
}
