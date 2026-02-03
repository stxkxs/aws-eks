import { EnvironmentConfig, ExternalValues } from '../lib/types/config';

/**
 * Apply external values (from CDK context or env vars) onto a merged config.
 *
 * This centralizes the logic for injecting org-specific values that should
 * not be hardcoded in config files. Values are only applied when provided;
 * missing values leave the config unchanged (enabling dry-run/CI without them).
 */
export function applyExternalValues(config: EnvironmentConfig, external?: ExternalValues): EnvironmentConfig {
  if (!external) return config;

  let result = config;

  // Apply DNS values
  if (external.hostedZoneId || external.domainName) {
    result = {
      ...result,
      dns: {
        ...result.dns,
        ...(external.hostedZoneId && { hostedZoneId: external.hostedZoneId }),
        ...(external.domainName && { domainName: external.domainName }),
      },
    };
  }

  // Apply ArgoCD values
  if (external.gitOpsRepoUrl || external.githubOrg || external.domainName) {
    const argocd = result.argocd ?? { enabled: false, gitOpsRepoUrl: '' };
    result = {
      ...result,
      argocd: {
        ...argocd,
        ...(external.gitOpsRepoUrl && { gitOpsRepoUrl: external.gitOpsRepoUrl }),
        ...(external.githubOrg && { githubOrg: external.githubOrg }),
        // Derive hostname from domainName if not already set in static overrides
        ...(!argocd.hostname && external.domainName && { hostname: `argocd.${external.domainName}` }),
        // Derive oauthSecretName from environment if not already set
        ...(!argocd.oauthSecretName && { oauthSecretName: `${result.environment}-argocd-github-oauth` }),
      },
    };
  }

  // Apply admin role ARN
  if (external.adminRoleArn) {
    result = {
      ...result,
      security: {
        ...result.security,
        clusterAccess: {
          ...result.security.clusterAccess,
          admins: [
            {
              arn: external.adminRoleArn,
              name: 'admin',
            },
          ],
        },
      },
    };
  }

  return result;
}
