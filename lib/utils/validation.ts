/**
 * Runtime validation using Zod schemas.
 *
 * Provides runtime validation for configuration objects that complements
 * TypeScript's compile-time type checking. Use these schemas to validate
 * external inputs, configuration files, and API responses.
 *
 * Each schema mirrors a corresponding TypeScript interface from
 * {@link "types/config" | lib/types/config.ts} and can be used independently
 * or composed into the full {@link EnvironmentConfigSchema}.
 *
 * @see {@link EnvironmentConfig} for the TypeScript interface these schemas validate
 * @see {@link validateEnvironmentConfig} for the primary validation entry point
 *
 * @module utils/validation
 */

import { z } from 'zod';

// =============================================================================
// Primitive Schemas
// =============================================================================

/**
 * AWS Account ID schema - must be exactly 12 digits.
 *
 * @see {@link AwsConfig.accountId}
 */
export const AwsAccountIdSchema = z.string().regex(/^\d{12}$/, 'AWS account ID must be exactly 12 digits');

/**
 * AWS Region schema - standard region format (e.g., `us-west-2`).
 *
 * @see {@link AwsConfig.region}
 */
export const AwsRegionSchema = z.string().regex(/^[a-z]{2}-[a-z]+-\d$/, 'Invalid AWS region format (e.g., us-west-2)');

/**
 * CIDR block schema (e.g., `10.0.0.0/16`).
 *
 * @see {@link NetworkConfig.vpcCidr}
 */
export const CidrBlockSchema = z
  .string()
  .regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/, 'Invalid CIDR block format');

/**
 * Kubernetes version schema (e.g., `1.31`).
 *
 * @see {@link ClusterConfig.version}
 */
export const KubernetesVersionSchema = z.string().regex(/^1\.\d+$/, 'Kubernetes version must be in format 1.XX');

/**
 * Semver version schema (e.g., `v1.17.1`, `0.31.0`).
 */
export const SemverSchema = z.string().regex(/^v?\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/, 'Invalid semver version');

/**
 * Helm chart version schema (more permissive than strict semver).
 *
 * Requires a non-empty string; does not enforce semver format since
 * Helm charts may use non-standard versioning.
 *
 * @see {@link HelmChartConfig.version}
 */
export const HelmVersionSchema = z.string().min(1, 'Helm version is required');

// =============================================================================
// Environment Schema
// =============================================================================

/**
 * Environment type schema.
 *
 * @see {@link Environment}
 */
export const EnvironmentSchema = z.enum(['dev', 'staging', 'production']);

// =============================================================================
// Feature Flags Schema
// =============================================================================

/**
 * Feature flags schema with all boolean options.
 *
 * @see {@link FeatureFlags}
 */
export const FeatureFlagsSchema = z.object({
  multiAzNat: z.boolean().describe('Multi-AZ NAT gateways'),
  trivyAdmission: z.boolean().describe('Trivy admission controller'),
  veleroBackups: z.boolean().describe('Velero backups'),
  goldilocks: z.boolean().describe('Goldilocks resource recommendations'),
  costAllocationTags: z.boolean().describe('Cost allocation tags'),
  vpcEndpoints: z.boolean().describe('VPC endpoints'),
  nodeLocalDns: z.boolean().describe('Node-local DNS cache'),
  defaultNetworkPolicies: z.boolean().describe('Default network policies'),
  priorityClasses: z.boolean().describe('Priority classes'),
  resourceQuotas: z.boolean().describe('Resource quotas'),
  argocdEnabled: z.boolean().describe('ArgoCD GitOps'),
  backstageEnabled: z.boolean().describe('Backstage Developer Portal'),
});

// =============================================================================
// Network Configuration Schema
// =============================================================================

/**
 * Network configuration schema.
 *
 * @see {@link NetworkConfig}
 */
export const NetworkConfigSchema = z.object({
  vpcCidr: CidrBlockSchema,
  natGateways: z.number().int().min(1).max(6),
  maxAzs: z.number().int().min(1).max(6),
  flowLogs: z.boolean(),
});

// =============================================================================
// Cluster Configuration Schema
// =============================================================================

/**
 * Cluster logging types schema.
 *
 * @see {@link ClusterConfig.logging}
 */
export const ClusterLoggingTypeSchema = z.enum(['api', 'audit', 'authenticator', 'controllerManager', 'scheduler']);

/**
 * Cluster configuration schema with cross-field validation
 * (at least one endpoint must be enabled).
 *
 * @see {@link ClusterConfig}
 */
export const ClusterConfigSchema = z
  .object({
    version: KubernetesVersionSchema,
    name: z.string().min(1).max(63),
    privateEndpoint: z.boolean(),
    publicEndpoint: z.boolean(),
    logging: z.array(ClusterLoggingTypeSchema),
    secretsEncryption: z.boolean(),
  })
  .refine((data) => data.privateEndpoint || data.publicEndpoint, {
    message: 'At least one endpoint (private or public) must be enabled',
  });

// =============================================================================
// Node Group Schemas
// =============================================================================

/**
 * AMI type schema.
 *
 * @see {@link SystemNodeGroupConfig.amiType}
 */
export const AmiTypeSchema = z.enum(['AL2_x86_64', 'AL2_ARM_64', 'BOTTLEROCKET_x86_64', 'BOTTLEROCKET_ARM_64']);

/**
 * System node group configuration schema with cross-field validation
 * (minSize <= maxSize, desiredSize within range).
 *
 * @see {@link SystemNodeGroupConfig}
 */
export const SystemNodeGroupConfigSchema = z
  .object({
    instanceTypes: z.array(z.string()).min(1),
    minSize: z.number().int().min(0),
    maxSize: z.number().int().min(1),
    desiredSize: z.number().int().min(0),
    diskSize: z.number().int().min(20),
    amiType: AmiTypeSchema,
  })
  .refine((data) => data.minSize <= data.maxSize, { message: 'minSize must be <= maxSize' })
  .refine((data) => data.desiredSize >= data.minSize && data.desiredSize <= data.maxSize, {
    message: 'desiredSize must be between minSize and maxSize',
  });

// =============================================================================
// Karpenter Configuration Schema
// =============================================================================

/**
 * Consolidation policy schema.
 *
 * @see {@link KarpenterConfig.consolidationPolicy}
 */
export const ConsolidationPolicySchema = z.enum(['WhenEmpty', 'WhenEmptyOrUnderutilized']);

/**
 * Karpenter configuration schema.
 *
 * @see {@link KarpenterConfig}
 */
export const KarpenterConfigSchema = z.object({
  nodePoolName: z.string().min(1),
  instanceCategories: z.array(z.string()).min(1),
  instanceSizes: z.array(z.string()).min(1),
  spotEnabled: z.boolean(),
  cpuLimit: z.number().int().min(1),
  memoryLimitGi: z.number().int().min(1),
  consolidationPolicy: ConsolidationPolicySchema,
  consolidateAfter: z.string(),
});

// =============================================================================
// Helm Chart Configuration Schema
// =============================================================================

/**
 * Single Helm chart configuration schema.
 *
 * @see {@link HelmChartConfig}
 */
export const HelmChartConfigSchema = z.object({
  version: HelmVersionSchema,
  values: z.record(z.string(), z.unknown()).optional(),
});

/**
 * All Helm configurations schema.
 *
 * @see {@link HelmConfigs}
 */
export const HelmConfigsSchema = z.object({
  certManager: HelmChartConfigSchema,
  karpenter: HelmChartConfigSchema,
  awsLoadBalancerController: HelmChartConfigSchema,
  metricsServer: HelmChartConfigSchema,
  externalDns: HelmChartConfigSchema,
  externalSecrets: HelmChartConfigSchema,
  reloader: HelmChartConfigSchema,
  kyverno: HelmChartConfigSchema,
  velero: HelmChartConfigSchema,
  goldilocks: HelmChartConfigSchema,
  awsNodeTerminationHandler: HelmChartConfigSchema,
  cilium: HelmChartConfigSchema,
  argocd: HelmChartConfigSchema,
  trivyOperator: HelmChartConfigSchema,
  loki: HelmChartConfigSchema,
  tempo: HelmChartConfigSchema,
  grafanaAgent: HelmChartConfigSchema,
  promtail: HelmChartConfigSchema,
});

// =============================================================================
// Observability Configuration Schema
// =============================================================================

/**
 * Observability configuration schema.
 *
 * @see {@link ObservabilityConfig}
 */
export const ObservabilityConfigSchema = z.object({
  ampWorkspaceArn: z.string().optional(),
  amgWorkspaceArn: z.string().optional(),
  lokiRetentionDays: z.number().int().min(1),
  tempoRetentionDays: z.number().int().min(1),
  containerInsights: z.boolean(),
});

// =============================================================================
// Backup Configuration Schema
// =============================================================================

/**
 * Backup configuration schema with cross-field validation
 * (weeklyRetentionDays >= dailyRetentionDays).
 *
 * @see {@link BackupConfig}
 */
export const BackupConfigSchema = z
  .object({
    bucketName: z.string(),
    dailyRetentionDays: z.number().int().min(1),
    weeklyRetentionDays: z.number().int().min(1),
    includedNamespaces: z.array(z.string()),
  })
  .refine((data) => data.weeklyRetentionDays >= data.dailyRetentionDays, {
    message: 'weeklyRetentionDays should be >= dailyRetentionDays',
  });

// =============================================================================
// DNS Configuration Schema
// =============================================================================

/**
 * DNS configuration schema.
 *
 * @see {@link DnsConfig}
 */
export const DnsConfigSchema = z.object({
  hostedZoneId: z.string(),
  domainName: z.string(),
  wildcardCert: z.boolean(),
});

// =============================================================================
// Security Configuration Schema
// =============================================================================

/**
 * Trivy severity threshold schema.
 *
 * @see {@link SecurityConfig.trivySeverityThreshold}
 */
export const TrivySeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

/**
 * Security configuration schema.
 *
 * @see {@link SecurityConfig}
 */
export const SecurityConfigSchema = z.object({
  adminSsoArn: z.string().optional(),
  githubOidcArn: z.string().optional(),
  allowedRegistries: z.array(z.string()),
  trivySeverityThreshold: TrivySeveritySchema,
});

// =============================================================================
// AWS Configuration Schema
// =============================================================================

/**
 * AWS account and region configuration schema.
 *
 * @see {@link AwsConfig}
 */
export const AwsConfigSchema = z.object({
  accountId: AwsAccountIdSchema,
  region: AwsRegionSchema,
});

// =============================================================================
// Complete Environment Configuration Schema
// =============================================================================

/**
 * Complete environment configuration schema
 *
 * Use this schema to validate the entire configuration object at runtime.
 *
 * @example
 * ```typescript
 * import { EnvironmentConfigSchema } from './utils/validation';
 *
 * const result = EnvironmentConfigSchema.safeParse(config);
 * if (!result.success) {
 *   console.error('Invalid config:', result.error.format());
 * }
 * ```
 */
export const EnvironmentConfigSchema = z.object({
  environment: EnvironmentSchema,
  aws: AwsConfigSchema,
  features: FeatureFlagsSchema,
  network: NetworkConfigSchema,
  cluster: ClusterConfigSchema,
  systemNodeGroup: SystemNodeGroupConfigSchema,
  karpenter: KarpenterConfigSchema,
  helmConfigs: HelmConfigsSchema,
  observability: ObservabilityConfigSchema,
  backup: BackupConfigSchema,
  dns: DnsConfigSchema,
  security: SecurityConfigSchema,
  tags: z.record(z.string(), z.string()),
});

// =============================================================================
// Type Inference
// =============================================================================

/**
 * Inferred type from EnvironmentConfigSchema
 * Should match the EnvironmentConfig interface
 */
export type ValidatedEnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validation result with detailed error information.
 *
 * @typeParam T - The validated data type (inferred from the Zod schema)
 */
export interface ZodValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
}

/**
 * Validate environment configuration with detailed error reporting
 *
 * @param config - The configuration object to validate
 * @returns Validation result with either data or errors
 *
 * @example
 * ```typescript
 * const result = validateEnvironmentConfig(config);
 * if (result.success) {
 *   console.log('Valid config:', result.data);
 * } else {
 *   result.errors?.forEach(e => console.error(`${e.path}: ${e.message}`));
 * }
 * ```
 */
export function validateEnvironmentConfig(config: unknown): ZodValidationResult<ValidatedEnvironmentConfig> {
  const result = EnvironmentConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}

/**
 * Validate and throw on error.
 *
 * @param config - The configuration object to validate
 * @returns The validated configuration with Zod-inferred types
 * @throws {z.ZodError} If validation fails, with detailed issue descriptions
 */
export function parseEnvironmentConfig(config: unknown): ValidatedEnvironmentConfig {
  return EnvironmentConfigSchema.parse(config);
}

/**
 * Validate feature flags against the {@link FeatureFlagsSchema}.
 *
 * @param flags - The feature flags object to validate
 * @returns Validation result with either the validated data or an array of errors
 */
export function validateFeatureFlags(flags: unknown): ZodValidationResult<z.infer<typeof FeatureFlagsSchema>> {
  const result = FeatureFlagsSchema.safeParse(flags);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}

/**
 * Validate network configuration against the {@link NetworkConfigSchema}.
 *
 * @param network - The network configuration object to validate
 * @returns Validation result with either the validated data or an array of errors
 */
export function validateNetworkConfig(network: unknown): ZodValidationResult<z.infer<typeof NetworkConfigSchema>> {
  const result = NetworkConfigSchema.safeParse(network);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}

/**
 * Validate a single Helm chart configuration against the {@link HelmChartConfigSchema}.
 *
 * @param helm - The Helm chart configuration object to validate
 * @returns Validation result with either the validated data or an array of errors
 */
export function validateHelmConfig(helm: unknown): ZodValidationResult<z.infer<typeof HelmChartConfigSchema>> {
  const result = HelmChartConfigSchema.safeParse(helm);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}

// =============================================================================
// Schema Exports for External Use
// =============================================================================

/**
 * All schemas exported for external validation needs.
 *
 * Provides a single namespace for accessing any individual schema
 * without importing each one separately.
 *
 * @example
 * ```typescript
 * import { Schemas } from './utils/validation';
 * const result = Schemas.NetworkConfig.safeParse(data);
 * ```
 */
export const Schemas = {
  // Primitives
  AwsAccountId: AwsAccountIdSchema,
  AwsRegion: AwsRegionSchema,
  CidrBlock: CidrBlockSchema,
  KubernetesVersion: KubernetesVersionSchema,
  Semver: SemverSchema,
  HelmVersion: HelmVersionSchema,

  // Enums
  Environment: EnvironmentSchema,
  AmiType: AmiTypeSchema,
  ConsolidationPolicy: ConsolidationPolicySchema,
  TrivySeverity: TrivySeveritySchema,
  ClusterLoggingType: ClusterLoggingTypeSchema,

  // Configuration objects
  FeatureFlags: FeatureFlagsSchema,
  NetworkConfig: NetworkConfigSchema,
  ClusterConfig: ClusterConfigSchema,
  SystemNodeGroup: SystemNodeGroupConfigSchema,
  Karpenter: KarpenterConfigSchema,
  HelmChartConfig: HelmChartConfigSchema,
  HelmConfigs: HelmConfigsSchema,
  Observability: ObservabilityConfigSchema,
  Backup: BackupConfigSchema,
  Dns: DnsConfigSchema,
  Security: SecurityConfigSchema,
  Aws: AwsConfigSchema,
  EnvironmentConfig: EnvironmentConfigSchema,
} as const;
