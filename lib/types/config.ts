/**
 * Configuration types for AWS EKS Infrastructure.
 *
 * All configuration is strongly typed for safety and IDE support.
 *
 * @see {@link "config/base" | config/base.ts} for production-ready default values
 * @see {@link "config/dev" | config/dev.ts} for dev overrides
 * @see {@link "config/staging" | config/staging.ts} for staging overrides
 * @see {@link "config/production" | config/production.ts} for production overrides
 *
 * @module types/config
 */

/**
 * Environment identifier
 */
export type Environment = 'dev' | 'staging' | 'production';

/**
 * Feature flags for optional components.
 *
 * Each flag controls whether a specific addon or capability is deployed.
 * Flags are set per-environment to balance cost, security, and functionality.
 *
 * @see {@link "config/base" | config/base.ts} for default values across all environments
 */
export interface FeatureFlags {
  /** Multi-AZ NAT gateways (cost optimization: disable in dev) */
  readonly multiAzNat: boolean;

  /** Trivy admission controller - block unscanned images */
  readonly trivyAdmission: boolean;

  /** Enable Velero backups */
  readonly veleroBackups: boolean;

  /** Enable Goldilocks resource recommendations */
  readonly goldilocks: boolean;

  /** Enable cost allocation tags */
  readonly costAllocationTags: boolean;

  /** Enable VPC endpoints for ECR, S3, SSM to reduce NAT costs */
  readonly vpcEndpoints: boolean;

  /** Enable node-local DNS cache for improved DNS performance */
  readonly nodeLocalDns: boolean;

  /** Deploy default network policies for namespace isolation */
  readonly defaultNetworkPolicies: boolean;

  /** Deploy priority classes for workload scheduling */
  readonly priorityClasses: boolean;

  /** Deploy resource quotas for namespace resource limits */
  readonly resourceQuotas: boolean;

  /** Enable ArgoCD for GitOps-based addon management */
  readonly argocdEnabled: boolean;

  /** Enable Backstage Developer Portal (optional) */
  readonly backstageEnabled: boolean;
}

/**
 * Network configuration for the VPC and subnets.
 *
 * @see {@link NetworkStack} for the stack that consumes this configuration
 */
export interface NetworkConfig {
  /** VPC CIDR block */
  readonly vpcCidr: string;

  /** Number of NAT gateways (1 for dev, 2+ for prod) */
  readonly natGateways: number;

  /** Number of availability zones */
  readonly maxAzs: number;

  /** Enable VPC flow logs */
  readonly flowLogs: boolean;
}

/**
 * EKS cluster configuration.
 *
 * @see {@link ClusterStack} for the stack that consumes this configuration
 */
export interface ClusterConfig {
  /** Kubernetes version */
  readonly version: string;

  /** Cluster name suffix (full name: {environment}-{name}) */
  readonly name: string;

  /** Enable private endpoint */
  readonly privateEndpoint: boolean;

  /** Enable public endpoint */
  readonly publicEndpoint: boolean;

  /** Cluster logging types */
  readonly logging: ('api' | 'audit' | 'authenticator' | 'controllerManager' | 'scheduler')[];

  /** Envelope encryption with KMS */
  readonly secretsEncryption: boolean;
}

/**
 * Managed node group configuration (for system workloads)
 */
export interface SystemNodeGroupConfig {
  /** Instance types */
  readonly instanceTypes: string[];

  /** Minimum number of nodes */
  readonly minSize: number;

  /** Maximum number of nodes */
  readonly maxSize: number;

  /** Desired number of nodes */
  readonly desiredSize: number;

  /** Disk size in GB */
  readonly diskSize: number;

  /** AMI type */
  readonly amiType: 'AL2_x86_64' | 'AL2_ARM_64' | 'BOTTLEROCKET_x86_64' | 'BOTTLEROCKET_ARM_64';
}

/**
 * Karpenter configuration (for workload autoscaling).
 *
 * @see {@link KarpenterStack} for the stack that deploys the Karpenter controller
 */
export interface KarpenterConfig {
  /** Node pool name */
  readonly nodePoolName: string;

  /** Instance categories (e.g., ['m', 'c', 'r']) */
  readonly instanceCategories: string[];

  /** Instance sizes (e.g., ['medium', 'large', 'xlarge']) */
  readonly instanceSizes: string[];

  /** Enable spot instances */
  readonly spotEnabled: boolean;

  /** CPU limit for the node pool */
  readonly cpuLimit: number;

  /** Memory limit in Gi for the node pool */
  readonly memoryLimitGi: number;

  /** Consolidation policy */
  readonly consolidationPolicy: 'WhenEmpty' | 'WhenEmptyOrUnderutilized';

  /** Consolidation delay */
  readonly consolidateAfter: string;
}

/**
 * Configuration for a single Helm chart
 *
 * Combines version with optional values for production-ready defaults.
 *
 * @example
 * ```typescript
 * certManager: {
 *   version: 'v1.17.1',
 *   values: {
 *     replicaCount: 2,
 *     resources: { limits: { cpu: '100m', memory: '128Mi' } },
 *   },
 * }
 * ```
 */
export interface HelmChartConfig {
  /** Chart version - should be pinned to specific releases */
  readonly version: string;
  /** Optional Helm values to merge with stack defaults */
  readonly values?: Record<string, unknown>;
}

/**
 * Helm chart configuration for all deployed charts
 *
 * Each chart has a version and optional production-ready values.
 * Environment configs can override these values.
 *
 * @example
 * ```typescript
 * helmConfigs: {
 *   certManager: {
 *     version: 'v1.17.1',
 *     values: { replicaCount: 2 },
 *   },
 *   // ...
 * }
 * ```
 */
export interface HelmConfigs {
  /** cert-manager - TLS certificate management */
  readonly certManager: HelmChartConfig;
  /** Karpenter - Node autoscaling */
  readonly karpenter: HelmChartConfig;
  /** AWS Load Balancer Controller - ALB/NLB ingress */
  readonly awsLoadBalancerController: HelmChartConfig;
  /** Metrics Server - Kubernetes metrics API */
  readonly metricsServer: HelmChartConfig;
  /** External DNS - Route53 DNS management */
  readonly externalDns: HelmChartConfig;
  /** External Secrets - AWS Secrets Manager integration */
  readonly externalSecrets: HelmChartConfig;
  /** Reloader - Automatic pod restart on config changes */
  readonly reloader: HelmChartConfig;
  /** Kyverno - Policy engine */
  readonly kyverno: HelmChartConfig;
  /** Velero - Backup and restore */
  readonly velero: HelmChartConfig;
  /** Goldilocks - Resource recommendations */
  readonly goldilocks: HelmChartConfig;
  /** AWS Node Termination Handler - Graceful spot termination */
  readonly awsNodeTerminationHandler: HelmChartConfig;
  /** Cilium - CNI and service mesh */
  readonly cilium: HelmChartConfig;
  /** ArgoCD - GitOps continuous delivery */
  readonly argocd: HelmChartConfig;
  /** Trivy Operator - Vulnerability scanning */
  readonly trivyOperator: HelmChartConfig;
  /** Loki - Log aggregation */
  readonly loki: HelmChartConfig;
  /** Tempo - Distributed tracing */
  readonly tempo: HelmChartConfig;
  /** Grafana Agent - Metrics/logs collection */
  readonly grafanaAgent: HelmChartConfig;
  /** Promtail - Log shipping to Loki */
  readonly promtail: HelmChartConfig;
  /** AWS EBS CSI Driver - EBS volume provisioning */
  readonly ebsCsiDriver: HelmChartConfig;
}

/**
 * Observability configuration for metrics, logs, and traces.
 */
export interface ObservabilityConfig {
  /** AWS Managed Prometheus workspace ARN (if using AMP) */
  readonly ampWorkspaceArn?: string;

  /** AWS Managed Grafana workspace ARN (if using AMG) */
  readonly amgWorkspaceArn?: string;

  /** Loki retention period */
  readonly lokiRetentionDays: number;

  /** Tempo retention period */
  readonly tempoRetentionDays: number;

  /** Enable Container Insights */
  readonly containerInsights: boolean;
}

/**
 * Backup configuration (Velero)
 */
export interface BackupConfig {
  /** S3 bucket name for backups */
  readonly bucketName: string;

  /** Daily backup retention in days */
  readonly dailyRetentionDays: number;

  /** Weekly backup retention in days */
  readonly weeklyRetentionDays: number;

  /** Namespaces to backup (empty = all) */
  readonly includedNamespaces: string[];
}

/**
 * DNS configuration
 */
export interface DnsConfig {
  /** Route53 hosted zone ID */
  readonly hostedZoneId: string;

  /** Domain name */
  readonly domainName: string;

  /** Create wildcard certificate */
  readonly wildcardCert: boolean;
}

/**
 * EKS authentication mode
 * - CONFIG_MAP: Use aws-auth ConfigMap only (legacy)
 * - API: Use EKS Access Entries only (recommended)
 * - API_AND_CONFIG_MAP: Use both (migration)
 */
export type AuthenticationMode = 'CONFIG_MAP' | 'API' | 'API_AND_CONFIG_MAP';

/**
 * Access entry type for EKS Access Entries API
 */
export type AccessEntryType = 'STANDARD' | 'FARGATE_LINUX' | 'EC2_LINUX' | 'EC2_WINDOWS';

/**
 * Principal for cluster access (IAM role or user)
 */
export interface ClusterAccessPrincipal {
  /** ARN of the IAM role or user */
  readonly arn: string;

  /** Human-readable name for this principal */
  readonly name?: string;

  /** Type of access entry (default: STANDARD) */
  readonly type?: AccessEntryType;

  /** Kubernetes username (optional, defaults to principal name) */
  readonly username?: string;

  /** Kubernetes groups (for CONFIG_MAP mode) */
  readonly groups?: string[];
}

/**
 * Cluster access configuration with persona-based access
 */
export interface ClusterAccessConfig {
  /**
   * Authentication mode for the cluster
   * @default 'API_AND_CONFIG_MAP' for compatibility
   */
  readonly authenticationMode?: AuthenticationMode;

  /**
   * Automatically add the CDK deploying role as cluster admin
   * This uses the current credentials' role/user
   * @default true
   */
  readonly addDeployerAsAdmin?: boolean;

  /**
   * Cluster administrators - full access (system:masters equivalent)
   * Uses AmazonEKSClusterAdminPolicy
   */
  readonly admins?: ClusterAccessPrincipal[];

  /**
   * Power users - can manage workloads but not cluster-level resources
   * Uses AmazonEKSAdminPolicy
   */
  readonly powerUsers?: ClusterAccessPrincipal[];

  /**
   * Developers - can view and edit resources in specific namespaces
   * Uses AmazonEKSEditPolicy
   */
  readonly developers?: ClusterAccessPrincipal[];

  /**
   * Read-only users - view access only
   * Uses AmazonEKSViewPolicy
   */
  readonly viewers?: ClusterAccessPrincipal[];

  /**
   * Custom access entries with specific policies
   */
  readonly customAccess?: Array<
    ClusterAccessPrincipal & {
      /** EKS access policy ARN */
      readonly policyArn: string;
      /** Access scope type */
      readonly accessScopeType: 'cluster' | 'namespace';
      /** Namespaces for namespace-scoped access */
      readonly namespaces?: string[];
    }
  >;
}

/**
 * Security configuration for cluster access, image scanning, and registry policies.
 *
 * @see {@link ClusterAccessConfig} for detailed access management options
 */
export interface SecurityConfig {
  /**
   * Cluster access configuration
   * Supports both legacy aws-auth and modern EKS Access Entries
   */
  readonly clusterAccess?: ClusterAccessConfig;

  /** @deprecated Use clusterAccess.admins instead */
  readonly adminSsoArn?: string;

  /** @deprecated Use clusterAccess.admins instead */
  readonly githubOidcArn?: string;

  /** Allowed ECR registries (for image policy) */
  readonly allowedRegistries: string[];

  /** Trivy severity threshold for blocking */
  readonly trivySeverityThreshold: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * AWS account and region configuration
 */
export interface AwsConfig {
  /** AWS account ID */
  readonly accountId: string;

  /** AWS region */
  readonly region: string;
}

/**
 * Complete environment configuration
 *
 * This is the main configuration interface that contains all settings for
 * deploying an EKS cluster with its full addon stack.
 *
 * @see {@link getConfig} for loading environment-specific configurations
 *
 * @example
 * ```typescript
 * const config: EnvironmentConfig = getConfig('production', accountId, region);
 * new NetworkStack(app, 'network', { config });
 * ```
 */
export interface EnvironmentConfig {
  /** Environment name */
  readonly environment: Environment;

  /** AWS account and region */
  readonly aws: AwsConfig;

  /** Feature flags */
  readonly features: FeatureFlags;

  /** Network configuration */
  readonly network: NetworkConfig;

  /** EKS cluster configuration */
  readonly cluster: ClusterConfig;

  /** System node group configuration */
  readonly systemNodeGroup: SystemNodeGroupConfig;

  /** Karpenter configuration */
  readonly karpenter: KarpenterConfig;

  /** Helm chart configurations (versions and values) */
  readonly helmConfigs: HelmConfigs;

  /** Observability configuration */
  readonly observability: ObservabilityConfig;

  /** Backup configuration */
  readonly backup: BackupConfig;

  /** DNS configuration */
  readonly dns: DnsConfig;

  /** Security configuration */
  readonly security: SecurityConfig;

  /** Resource tags */
  readonly tags: Record<string, string>;

  /** ArgoCD GitOps configuration (optional) */
  readonly argocd?: ArgoCDConfig;

  /** Backstage Developer Portal configuration (optional) */
  readonly backstage?: BackstageConfig;
}

/**
 * ArgoCD GitOps configuration.
 *
 * @see {@link ArgoCDStack} for the stack that consumes this configuration
 * @see {@link FeatureFlags.argocdEnabled} for the feature flag that gates deployment
 */
export interface ArgoCDConfig {
  /** Whether ArgoCD is enabled */
  readonly enabled: boolean;

  /** GitOps repository URL for addon management */
  readonly gitOpsRepoUrl: string;

  /** Git revision (branch, tag, or commit) to use */
  readonly gitOpsRevision?: string;

  /** Path within the GitOps repository */
  readonly gitOpsPath?: string;

  /** ArgoCD server hostname (for ingress) */
  readonly hostname?: string;

  /** Enable SSO via Dex */
  readonly ssoEnabled?: boolean;

  /** AppProject name for platform addons */
  readonly platformProjectName?: string;

  /** GitHub organization for SSO group mappings */
  readonly githubOrg?: string;

  /** AWS Secrets Manager secret name for GitHub OAuth credentials */
  readonly oauthSecretName?: string;

  /** RBAC default policy (e.g., 'role:readonly', 'role:admin') */
  readonly rbacDefaultPolicy?: string;
}

/**
 * Backstage Developer Portal configuration
 */
export interface BackstageConfig {
  /** Whether Backstage is enabled */
  readonly enabled: boolean;

  /** Backstage hostname (for ingress) */
  readonly hostname?: string;

  /** PostgreSQL RDS configuration */
  readonly database?: {
    /** Instance class */
    readonly instanceClass?: string;
    /** Storage size in GB */
    readonly storageGb?: number;
    /** Multi-AZ deployment */
    readonly multiAz?: boolean;
  };

  /** S3 bucket for TechDocs */
  readonly techDocsBucket?: string;

  /** GitHub integration */
  readonly github?: {
    /** GitHub App ID */
    readonly appId?: string;
    /** GitHub organization */
    readonly org?: string;
  };

  /** Catalog locations */
  readonly catalogLocations?: string[];
}

/**
 * Deep merge utility type for partial configuration overrides
 *
 * Used to type environment-specific overrides that merge with base config.
 *
 * @example
 * ```typescript
 * const devOverrides: DeepPartial<EnvironmentConfig> = {
 *   network: {
 *     natGateways: 1,  // Only override this field
 *   },
 * };
 * ```
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
