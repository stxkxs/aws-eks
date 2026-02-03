import { EnvironmentConfig, DeepPartial } from '../lib/types/config';
import { baseConfig } from './base';
import { deepMerge } from '../lib/utils';

/**
 * Staging environment configuration.
 *
 * Mirrors production as closely as possible so that deployments,
 * security policies, and operational procedures can be validated
 * before reaching production. Key differences from production:
 * - Slightly smaller resource limits and replica counts
 * - Shorter log/trace retention periods (14/7 days vs 90/30)
 * - Moderate Karpenter CPU/memory limits
 *
 * All security features are enabled (Trivy admission, network policies,
 * resource quotas, priority classes) to catch issues early.
 *
 * @see {@link baseConfig} for inherited defaults
 * @see {@link deepMerge} for how overrides are applied
 */
const stagingOverrides: DeepPartial<Omit<EnvironmentConfig, 'environment' | 'aws'>> = {
  features: {
    multiAzNat: true, // Production-like
    trivyAdmission: true, // Block unscanned images
    veleroBackups: true, // Enable backups
    goldilocks: true,
    nodeLocalDns: true, // Production-like
    defaultNetworkPolicies: true, // Test policies before prod
    priorityClasses: true, // Production-like
    resourceQuotas: true, // Test quotas before prod
    argocdEnabled: true, // GitOps enabled
    backstageEnabled: false, // Optional developer portal
  },

  // ArgoCD GitOps configuration
  argocd: {
    enabled: true,
    gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git', // TODO: Set your repo
    gitOpsRevision: 'main',
    gitOpsPath: 'applicationsets',
    platformProjectName: 'platform',
    ssoEnabled: false,
  },

  network: {
    natGateways: 2, // Multi-AZ
    flowLogs: true,
  },

  systemNodeGroup: {
    minSize: 2,
    maxSize: 6,
    desiredSize: 2,
    diskSize: 100,
  },

  karpenter: {
    cpuLimit: 75, // Moderate limits
    memoryLimitGi: 150,
    spotEnabled: true, // Use spot for cost
  },

  // Staging: moderate settings between dev and production
  helmConfigs: {
    certManager: {
      values: {
        replicaCount: 2,
        webhook: { replicaCount: 2 },
        cainjector: { replicaCount: 1 },
      },
    },
    karpenter: {
      values: {
        replicas: 2,
      },
    },
    kyverno: {
      values: {
        admissionController: { replicas: 2 },
        backgroundController: { replicas: 1 },
        reportsController: { replicas: 1 },
      },
    },
    loki: {
      values: {
        loki: {
          commonConfig: { replication_factor: 2 },
        },
        singleBinary: { replicas: 2 },
      },
    },
  },

  observability: {
    lokiRetentionDays: 14,
    tempoRetentionDays: 7,
    containerInsights: true,
  },

  backup: {
    bucketName: 'aws-eks-staging-backups',
    dailyRetentionDays: 14,
    weeklyRetentionDays: 30,
  },

  dns: {
    hostedZoneId: 'ZXXXXXXXXXXXXX', // TODO: Set your Route53 zone
    domainName: 'staging.example.com', // TODO: Set your domain
  },

  security: {
    allowedRegistries: [
      // TODO: Add your ECR account IDs
    ],
    trivySeverityThreshold: 'HIGH',
  },

  tags: {
    environment: 'staging',
    'cost-center': 'staging',
  },
};

/**
 * Export the merged staging configuration.
 *
 * @param accountId - AWS account ID (12 digits)
 * @param region - AWS region (e.g., `us-west-2`)
 * @returns A complete {@link EnvironmentConfig} with staging overrides applied to {@link baseConfig}
 */
export function getStagingConfig(accountId: string, region: string): EnvironmentConfig {
  return {
    environment: 'staging',
    aws: {
      accountId,
      region,
    },
    ...deepMerge(baseConfig, stagingOverrides),
  } as EnvironmentConfig;
}
