/**
 * Validation types for AWS EKS Infrastructure
 *
 * These types support configuration validation, policy enforcement,
 * and Helm chart validation across the infrastructure.
 */

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Categories of validation checks
 */
export type ValidationCategory = 'security' | 'compliance' | 'cost' | 'performance' | 'reliability' | 'configuration';

/**
 * A single validation error or warning
 *
 * @example
 * ```typescript
 * const error: ValidationError = {
 *   code: 'INVALID_CIDR',
 *   message: 'VPC CIDR block is invalid',
 *   field: 'network.vpcCidr',
 *   severity: 'error',
 *   category: 'configuration',
 * };
 * ```
 */
export interface ValidationError {
  /** Unique error code for programmatic handling */
  readonly code: string;

  /** Human-readable error message */
  readonly message: string;

  /** The configuration field that failed validation */
  readonly field: string;

  /** Severity of the validation issue */
  readonly severity: ValidationSeverity;

  /** Category of the validation check */
  readonly category: ValidationCategory;

  /** The actual value that failed validation */
  readonly value?: unknown;

  /** Suggested fix for the issue */
  readonly suggestion?: string;

  /** Documentation link for more information */
  readonly documentationUrl?: string;
}

/**
 * Result of a validation operation
 *
 * Contains all errors, warnings, and metadata about the validation run.
 *
 * @example
 * ```typescript
 * const result: ValidationResult = {
 *   valid: false,
 *   errors: [{ code: 'MISSING_FIELD', ... }],
 *   warnings: [{ code: 'INSECURE_CONFIG', ... }],
 *   metadata: {
 *     validatedAt: new Date(),
 *     configVersion: '1.0.0',
 *     environment: 'production',
 *   },
 * };
 * ```
 */
export interface ValidationResult {
  /** Whether the configuration is valid (no errors) */
  readonly valid: boolean;

  /** List of validation errors (blocking issues) */
  readonly errors: ValidationError[];

  /** List of validation warnings (non-blocking issues) */
  readonly warnings: ValidationError[];

  /** Metadata about the validation run */
  readonly metadata?: {
    /** When the validation was performed */
    readonly validatedAt: Date;
    /** Version of the configuration being validated */
    readonly configVersion?: string;
    /** Environment being validated */
    readonly environment?: string;
    /** Duration of validation in milliseconds */
    readonly durationMs?: number;
  };
}

/**
 * Policy violation from Kyverno or admission controller
 *
 * Represents a policy check failure during deployment or audit.
 *
 * @example
 * ```typescript
 * const violation: PolicyViolation = {
 *   policy: 'require-labels',
 *   rule: 'check-for-team-label',
 *   resource: {
 *     kind: 'Deployment',
 *     namespace: 'default',
 *     name: 'my-app',
 *   },
 *   message: 'Deployment must have team label',
 *   severity: 'error',
 *   action: 'deny',
 * };
 * ```
 */
export interface PolicyViolation {
  /** Name of the policy that was violated */
  readonly policy: string;

  /** Specific rule within the policy */
  readonly rule: string;

  /** The resource that violated the policy */
  readonly resource: {
    /** Kubernetes resource kind */
    readonly kind: string;
    /** Resource namespace (empty for cluster-scoped) */
    readonly namespace?: string;
    /** Resource name */
    readonly name: string;
    /** API version */
    readonly apiVersion?: string;
  };

  /** Human-readable violation message */
  readonly message: string;

  /** Severity of the violation */
  readonly severity: ValidationSeverity;

  /** Action taken (audit = log only, deny = blocked) */
  readonly action: 'audit' | 'deny' | 'warn';

  /** Timestamp of the violation */
  readonly timestamp?: Date;

  /** Additional context about the violation */
  readonly context?: Record<string, unknown>;
}

/**
 * Policy validation result aggregating multiple violations
 */
export interface PolicyValidationResult {
  /** Whether all policies passed */
  readonly compliant: boolean;

  /** Total number of violations */
  readonly violationCount: number;

  /** Violations by severity */
  readonly violationsBySeverity: {
    readonly error: number;
    readonly warning: number;
    readonly info: number;
  };

  /** List of all violations */
  readonly violations: PolicyViolation[];

  /** Policies that were checked */
  readonly policiesChecked: string[];
}

/**
 * Helm chart validation configuration
 *
 * Defines validation rules for Helm releases including
 * version constraints, required values, and security checks.
 *
 * @example
 * ```typescript
 * const config: HelmValidationConfig = {
 *   chart: 'cert-manager',
 *   repository: 'https://charts.jetstack.io',
 *   versionConstraint: '>=1.13.0 <2.0.0',
 *   requiredValues: ['installCRDs', 'replicaCount'],
 *   securityChecks: {
 *     requireResourceLimits: true,
 *     requireSecurityContext: true,
 *     disallowPrivileged: true,
 *   },
 * };
 * ```
 */
export interface HelmValidationConfig {
  /** Helm chart name */
  readonly chart: string;

  /** Helm repository URL */
  readonly repository: string;

  /** Semver version constraint (e.g., ">=1.0.0 <2.0.0") */
  readonly versionConstraint?: string;

  /** Minimum required version */
  readonly minVersion?: string;

  /** Maximum allowed version */
  readonly maxVersion?: string;

  /** List of required values that must be set */
  readonly requiredValues?: string[];

  /** List of forbidden values that must not be set */
  readonly forbiddenValues?: string[];

  /** Default values to apply if not set */
  readonly defaultValues?: Record<string, unknown>;

  /** Security-related validation checks */
  readonly securityChecks?: HelmSecurityChecks;

  /** Whether to allow pre-release versions */
  readonly allowPrerelease?: boolean;

  /** Custom validation function name */
  readonly customValidator?: string;
}

/**
 * Security checks for Helm chart validation
 */
export interface HelmSecurityChecks {
  /** Require resource limits on all containers */
  readonly requireResourceLimits?: boolean;

  /** Require resource requests on all containers */
  readonly requireResourceRequests?: boolean;

  /** Require security context on pods/containers */
  readonly requireSecurityContext?: boolean;

  /** Disallow privileged containers */
  readonly disallowPrivileged?: boolean;

  /** Disallow host network access */
  readonly disallowHostNetwork?: boolean;

  /** Disallow host PID namespace */
  readonly disallowHostPID?: boolean;

  /** Disallow host IPC namespace */
  readonly disallowHostIPC?: boolean;

  /** Require non-root user */
  readonly requireNonRoot?: boolean;

  /** Require read-only root filesystem */
  readonly requireReadOnlyRootFilesystem?: boolean;

  /** Disallow privilege escalation */
  readonly disallowPrivilegeEscalation?: boolean;

  /** Allowed capabilities (empty = none allowed) */
  readonly allowedCapabilities?: string[];

  /** Required dropped capabilities */
  readonly requiredDropCapabilities?: string[];

  /** Allowed volume types */
  readonly allowedVolumeTypes?: string[];

  /** Allowed host paths (if hostPath volumes allowed) */
  readonly allowedHostPaths?: string[];
}

/**
 * Result of Helm chart validation
 */
export interface HelmValidationResult {
  /** Chart that was validated */
  readonly chart: string;

  /** Version that was validated */
  readonly version: string;

  /** Whether validation passed */
  readonly valid: boolean;

  /** Validation errors */
  readonly errors: ValidationError[];

  /** Validation warnings */
  readonly warnings: ValidationError[];

  /** Security check results */
  readonly securityResults?: {
    readonly passed: string[];
    readonly failed: string[];
    readonly skipped: string[];
  };
}

/**
 * Aggregate validation result for all Helm charts
 */
export interface HelmChartValidationSummary {
  /** Total charts validated */
  readonly totalCharts: number;

  /** Charts that passed validation */
  readonly passedCharts: number;

  /** Charts that failed validation */
  readonly failedCharts: number;

  /** Individual chart results */
  readonly results: HelmValidationResult[];

  /** Overall validation status */
  readonly status: 'passed' | 'failed' | 'partial';
}
