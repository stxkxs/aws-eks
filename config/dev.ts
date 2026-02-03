import { EnvironmentConfig, DeepPartial } from '../lib/types/config';
import { baseConfig } from './base';
import { deepMerge } from '../lib/utils';

/**
 * Development environment configuration.
 *
 * Optimized for cost while retaining a functional development experience.
 * Key cost optimizations:
 * - Single NAT gateway (instead of one per AZ)
 * - Smaller node group with reduced disk size
 * - Lower replica counts for all controllers
 * - Reduced resource requests/limits across Helm charts
 * - Shorter log and trace retention periods
 * - VPC flow logs disabled
 *
 * Security is intentionally relaxed:
 * - Trivy admission controller does not block deployments
 * - Default network policies disabled for easier debugging
 * - Resource quotas disabled for flexibility
 *
 * @see {@link baseConfig} for inherited defaults
 * @see {@link deepMerge} for how overrides are applied
 */
const devOverrides: DeepPartial<Omit<EnvironmentConfig, 'environment' | 'aws'>> = {
  features: {
    multiAzNat: false, // Cost optimization
    trivyAdmission: false, // Don't block in dev
    veleroBackups: false, // No backups in dev
    goldilocks: true, // Keep for resource tuning
    nodeLocalDns: true, // Keep for testing
    defaultNetworkPolicies: false, // Relaxed networking in dev
    priorityClasses: true, // Keep for testing
    resourceQuotas: false, // No quotas in dev for flexibility
    argocdEnabled: true, // GitOps enabled
    backstageEnabled: false, // Optional developer portal
  },

  // ArgoCD GitOps configuration
  argocd: {
    enabled: true,
    gitOpsRepoUrl: 'https://github.com/stxkxs/aws-eks-gitops.git',
    gitOpsRevision: 'main',
    gitOpsPath: 'applicationsets',
    platformProjectName: 'platform',
    hostname: 'argocd.devops.stxkxs.io',
    ssoEnabled: true,
    githubOrg: 'stxkxs',
    oauthSecretName: 'dev-argocd-github-oauth',
    rbacDefaultPolicy: 'role:admin',
  },

  network: {
    natGateways: 1, // Single NAT for cost
    flowLogs: false, // Disable in dev
  },

  systemNodeGroup: {
    minSize: 2,
    maxSize: 4,
    desiredSize: 2,
    diskSize: 50, // Smaller disk
  },

  karpenter: {
    cpuLimit: 50, // Lower limits for dev
    memoryLimitGi: 100,
    spotEnabled: true, // Always use spot in dev
  },

  // Dev: lower replicas and relaxed resources for cost optimization
  helmConfigs: {
    certManager: {
      values: {
        replicaCount: 1,
        webhook: { replicaCount: 1 },
        cainjector: { replicaCount: 1 },
        resources: {
          requests: { cpu: '25m', memory: '32Mi' },
          limits: { cpu: '100m', memory: '128Mi' },
        },
        podDisruptionBudget: { enabled: false },
      },
    },
    karpenter: {
      values: {
        replicas: 1,
        resources: {
          requests: { cpu: '50m', memory: '128Mi' },
          limits: { cpu: '250m', memory: '256Mi' },
        },
      },
    },
    awsLoadBalancerController: {
      values: {
        replicaCount: 1,
        resources: {
          requests: { cpu: '25m', memory: '64Mi' },
          limits: { cpu: '100m', memory: '128Mi' },
        },
      },
    },
    metricsServer: {
      values: {
        replicas: 1,
        resources: {
          requests: { cpu: '25m', memory: '32Mi' },
          limits: { cpu: '100m', memory: '128Mi' },
        },
        podDisruptionBudget: { enabled: false },
      },
    },
    externalSecrets: {
      values: {
        replicaCount: 1,
        webhook: { replicaCount: 1 },
      },
    },
    kyverno: {
      values: {
        admissionController: { replicas: 1 },
        backgroundController: { replicas: 1 },
        reportsController: { replicas: 1 },
      },
    },
    cilium: {
      values: {
        operator: { replicas: 1 },
      },
    },
    loki: {
      values: {
        loki: {
          commonConfig: { replication_factor: 1 },
        },
        singleBinary: { replicas: 1 },
      },
    },
    ebsCsiDriver: {
      values: {
        controller: {
          replicaCount: 1,
          resources: {
            requests: { cpu: '25m', memory: '64Mi' },
            limits: { cpu: '100m', memory: '128Mi' },
          },
        },
      },
    },
  },

  observability: {
    lokiRetentionDays: 7, // Shorter retention
    tempoRetentionDays: 3,
    containerInsights: false, // Disable for cost
  },

  backup: {
    bucketName: 'aws-eks-dev-backups',
    dailyRetentionDays: 7,
    weeklyRetentionDays: 14,
  },

  dns: {
    hostedZoneId: 'Z104442997TGHIFJF63B',
    domainName: 'devops.stxkxs.io',
  },

  security: {
    allowedRegistries: [
      // TODO: Add your ECR account IDs
    ],
    trivySeverityThreshold: 'CRITICAL', // Only block critical in dev
    clusterAccess: {
      authenticationMode: 'API_AND_CONFIG_MAP',
      addDeployerAsAdmin: true, // CDK deployer gets admin access
      admins: [
        {
          arn: 'arn:aws:iam::351619759866:role/AWSReservedSSO_AdministratorAccess_5377f4150a5a6bfe',
          name: 'sso-admin',
        },
      ],
      // developers: [
      //   { arn: 'arn:aws:iam::ACCOUNT_ID:role/DeveloperRole', name: 'dev' },
      // ],
    },
  },

  tags: {
    environment: 'dev',
    'cost-center': 'development',
  },
};

/**
 * Export the merged dev configuration.
 *
 * @param accountId - AWS account ID (12 digits)
 * @param region - AWS region (e.g., `us-west-2`)
 * @returns A complete {@link EnvironmentConfig} with dev overrides applied to {@link baseConfig}
 */
export function getDevConfig(accountId: string, region: string): EnvironmentConfig {
  return {
    environment: 'dev',
    aws: {
      accountId,
      region,
    },
    ...deepMerge(baseConfig, devOverrides),
  } as EnvironmentConfig;
}
