import { EnvironmentConfig, DeepPartial, ExternalValues } from '../lib/types/config';
import { baseConfig } from './base';
import { deepMerge } from '../lib/utils';
import { applyExternalValues } from './external';

/**
 * Production environment configuration.
 *
 * Full security, compliance, and high availability:
 * - All security features enabled (Trivy admission, network policies,
 *   resource quotas, priority classes)
 * - Private-only API endpoint (no public access)
 * - Maximum redundancy: 3 NAT gateways (one per AZ), 3+ system nodes
 * - Extended retention periods (90-day logs, 30-day traces) for compliance
 * - Higher Karpenter limits and broader instance type selection
 * - Velero backup schedules (daily and weekly)
 * - Backstage developer portal enabled
 * - Compliance-ready tagging (SOC2, HIPAA, PCI-DSS)
 *
 * @remarks
 * The production config inherits most Helm chart values from {@link baseConfig},
 * which is already tuned for production-grade replica counts and resource limits.
 * Only values that differ (e.g., Velero schedules) are overridden here.
 *
 * @see {@link baseConfig} for inherited defaults
 * @see {@link deepMerge} for how overrides are applied
 */
const productionOverrides: DeepPartial<Omit<EnvironmentConfig, 'environment' | 'aws'>> = {
  features: {
    multiAzNat: true, // Full redundancy
    trivyAdmission: true, // Block unscanned images
    veleroBackups: true, // Full backup strategy
    goldilocks: true, // Resource optimization
    costAllocationTags: true, // Cost tracking
    argocdEnabled: true, // GitOps enabled
    backstageEnabled: true, // Developer portal in production
  },

  // ArgoCD GitOps configuration (org-specific values come from externalValues)
  argocd: {
    enabled: true,
    gitOpsRevision: 'main',
    gitOpsPath: 'applicationsets',
    platformProjectName: 'platform',
    ssoEnabled: false,
  },

  // Backstage developer portal configuration
  backstage: {
    enabled: true,
    database: {
      instanceClass: 'db.t3.small',
      storageGb: 20,
      multiAz: true,
    },
  },

  network: {
    natGateways: 3, // One per AZ
    flowLogs: true, // Required for compliance
  },

  cluster: {
    publicEndpoint: false, // Private-only in production
  },

  systemNodeGroup: {
    minSize: 3, // Higher availability
    maxSize: 10,
    desiredSize: 3,
    diskSize: 100,
  },

  karpenter: {
    cpuLimit: 200, // Higher limits
    memoryLimitGi: 400,
    spotEnabled: true, // Spot with on-demand fallback
    instanceCategories: ['m', 'c', 'r', 'i'], // More options
    instanceSizes: ['large', 'xlarge', '2xlarge', '4xlarge'],
  },

  // Production: full HA with strict resources (inherits base defaults)
  // Only override values that differ from base production-ready config
  helmConfigs: {
    velero: {
      values: {
        schedules: {
          daily: {
            disabled: false,
            schedule: '0 3 * * *',
            useOwnerReferencesInBackup: false,
          },
          weekly: {
            disabled: false,
            schedule: '0 1 * * 0',
            useOwnerReferencesInBackup: false,
          },
        },
      },
    },
  },

  observability: {
    lokiRetentionDays: 90, // Compliance retention
    tempoRetentionDays: 30,
    containerInsights: true,
  },

  backup: {
    bucketName: 'aws-eks-production-backups',
    dailyRetentionDays: 30,
    weeklyRetentionDays: 90,
    includedNamespaces: [], // Backup everything
  },

  dns: {
    wildcardCert: true,
  },

  security: {
    allowedRegistries: [
      // TODO: Add your ECR account IDs
    ],
    trivySeverityThreshold: 'HIGH', // Block HIGH and CRITICAL
  },

  tags: {
    environment: 'production',
    'cost-center': 'production',
    compliance: 'soc2,hipaa,pci-dss',
    'data-classification': 'confidential',
  },
};

/**
 * Export the merged production configuration.
 *
 * @param accountId - AWS account ID (12 digits)
 * @param region - AWS region (e.g., `us-west-2`)
 * @param externalValues - Optional org-specific values from CDK context or env vars
 * @returns A complete {@link EnvironmentConfig} with production overrides applied to {@link baseConfig}
 */
export function getProductionConfig(
  accountId: string,
  region: string,
  externalValues?: ExternalValues,
): EnvironmentConfig {
  const config = {
    environment: 'production',
    aws: {
      accountId,
      region,
    },
    ...deepMerge(baseConfig, productionOverrides),
  } as EnvironmentConfig;

  return applyExternalValues(config, externalValues);
}
