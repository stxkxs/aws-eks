/**
 * Typed error classes for AWS EKS Infrastructure
 *
 * Provides structured error handling with rich context for debugging,
 * logging, and programmatic error handling.
 *
 * @module types/errors
 */

/**
 * Error codes for categorizing infrastructure errors.
 *
 * Codes are grouped by domain:
 * - `CONFIG_*` -- Configuration validation errors
 * - `AWS_*` -- AWS API and credential errors
 * - `HELM_*` -- Helm chart deployment errors
 * - `K8S_*` -- Kubernetes resource errors
 * - `POLICY_*` -- Policy violation errors
 * - `NETWORK_*` -- Network configuration errors
 * - `STACK_*` -- CDK stack deployment errors
 */
export const ErrorCode = {
  // Configuration errors (1xxx)
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_MISSING_REQUIRED: 'CONFIG_MISSING_REQUIRED',
  CONFIG_TYPE_MISMATCH: 'CONFIG_TYPE_MISMATCH',
  CONFIG_VALUE_OUT_OF_RANGE: 'CONFIG_VALUE_OUT_OF_RANGE',
  CONFIG_VALIDATION_FAILED: 'CONFIG_VALIDATION_FAILED',
  CONFIG_MERGE_FAILED: 'CONFIG_MERGE_FAILED',

  // AWS errors (2xxx)
  AWS_ACCOUNT_INVALID: 'AWS_ACCOUNT_INVALID',
  AWS_REGION_INVALID: 'AWS_REGION_INVALID',
  AWS_CREDENTIALS_MISSING: 'AWS_CREDENTIALS_MISSING',
  AWS_PERMISSION_DENIED: 'AWS_PERMISSION_DENIED',
  AWS_RESOURCE_NOT_FOUND: 'AWS_RESOURCE_NOT_FOUND',
  AWS_QUOTA_EXCEEDED: 'AWS_QUOTA_EXCEEDED',

  // Helm errors (3xxx)
  HELM_CHART_NOT_FOUND: 'HELM_CHART_NOT_FOUND',
  HELM_VERSION_INVALID: 'HELM_VERSION_INVALID',
  HELM_VALUES_INVALID: 'HELM_VALUES_INVALID',
  HELM_RELEASE_FAILED: 'HELM_RELEASE_FAILED',
  HELM_UPGRADE_FAILED: 'HELM_UPGRADE_FAILED',
  HELM_ROLLBACK_FAILED: 'HELM_ROLLBACK_FAILED',

  // Kubernetes errors (4xxx)
  K8S_RESOURCE_INVALID: 'K8S_RESOURCE_INVALID',
  K8S_MANIFEST_INVALID: 'K8S_MANIFEST_INVALID',
  K8S_NAMESPACE_NOT_FOUND: 'K8S_NAMESPACE_NOT_FOUND',
  K8S_RESOURCE_CONFLICT: 'K8S_RESOURCE_CONFLICT',
  K8S_ADMISSION_DENIED: 'K8S_ADMISSION_DENIED',

  // Policy errors (5xxx)
  POLICY_VIOLATION: 'POLICY_VIOLATION',
  POLICY_INVALID: 'POLICY_INVALID',
  POLICY_NOT_FOUND: 'POLICY_NOT_FOUND',

  // Network errors (6xxx)
  NETWORK_CIDR_INVALID: 'NETWORK_CIDR_INVALID',
  NETWORK_CIDR_OVERLAP: 'NETWORK_CIDR_OVERLAP',
  NETWORK_SUBNET_EXHAUSTED: 'NETWORK_SUBNET_EXHAUSTED',

  // Stack errors (7xxx)
  STACK_DEPLOY_FAILED: 'STACK_DEPLOY_FAILED',
  STACK_DESTROY_FAILED: 'STACK_DESTROY_FAILED',
  STACK_DEPENDENCY_FAILED: 'STACK_DEPENDENCY_FAILED',
  STACK_CIRCULAR_DEPENDENCY: 'STACK_CIRCULAR_DEPENDENCY',

  // Unknown
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Error severity levels
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * Context information for debugging
 */
export interface ErrorContext {
  /** The component or module where the error occurred */
  readonly component?: string;
  /** The operation being performed */
  readonly operation?: string;
  /** The resource involved (e.g., stack name, helm chart) */
  readonly resource?: string;
  /** The environment (dev, staging, production) */
  readonly environment?: string;
  /** Additional key-value context */
  readonly metadata?: Record<string, unknown>;
  /** Stack trace from original error */
  readonly originalStack?: string;
}

/**
 * Base class for all infrastructure errors
 *
 * Provides structured error information including error codes,
 * severity levels, and rich context for debugging.
 *
 * @example
 * ```typescript
 * throw new InfrastructureError(
 *   'Invalid configuration value',
 *   ErrorCode.CONFIG_INVALID,
 *   'error',
 *   {
 *     component: 'NetworkStack',
 *     operation: 'validate',
 *     metadata: { field: 'vpcCidr', value: 'invalid' },
 *   }
 * );
 * ```
 */
export class InfrastructureError extends Error {
  /** Unique error code for programmatic handling */
  public readonly code: ErrorCode;

  /** Severity level of the error */
  public readonly severity: ErrorSeverity;

  /** Contextual information for debugging */
  public readonly context: ErrorContext;

  /** Timestamp when error occurred */
  public readonly timestamp: Date;

  /** Whether this error is retryable */
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    severity: ErrorSeverity = 'error',
    context: ErrorContext = {},
    retryable = false,
  ) {
    super(message);
    this.name = 'InfrastructureError';
    this.code = code;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date();
    this.retryable = retryable;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InfrastructureError);
    }
  }

  /**
   * Create a formatted string for logging.
   *
   * @returns A single-line log string in the format `[SEVERITY] [CODE] message component=... operation=... resource=...`
   */
  toLogString(): string {
    const parts = [`[${this.severity.toUpperCase()}]`, `[${this.code}]`, this.message];

    if (this.context.component) {
      parts.push(`component=${this.context.component}`);
    }
    if (this.context.operation) {
      parts.push(`operation=${this.context.operation}`);
    }
    if (this.context.resource) {
      parts.push(`resource=${this.context.resource}`);
    }

    return parts.join(' ');
  }

  /**
   * Convert to a structured object for JSON logging.
   *
   * @returns A plain object suitable for `JSON.stringify` with all error fields
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      retryable: this.retryable,
      stack: this.stack,
    };
  }

  /**
   * Wrap an unknown error into an InfrastructureError.
   *
   * If the error is already an InfrastructureError, it is returned as-is.
   * Otherwise, the error message (or string representation) is extracted
   * and wrapped in a new InfrastructureError with `UNKNOWN` code.
   *
   * @param error - The unknown error to wrap
   * @param context - Optional context to attach to the wrapped error
   * @returns An InfrastructureError instance
   */
  static wrap(error: unknown, context?: ErrorContext): InfrastructureError {
    if (error instanceof InfrastructureError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const originalStack = error instanceof Error ? error.stack : undefined;

    return new InfrastructureError(message, ErrorCode.UNKNOWN, 'error', { ...context, originalStack }, false);
  }
}

/**
 * Configuration-related errors
 *
 * Thrown when configuration validation fails or configuration
 * values are invalid.
 *
 * @example
 * ```typescript
 * throw new ConfigurationError(
 *   'VPC CIDR is invalid',
 *   'network.vpcCidr',
 *   'invalid-cidr',
 *   ErrorCode.CONFIG_INVALID
 * );
 * ```
 */
export class ConfigurationError extends InfrastructureError {
  /** The configuration field that caused the error */
  public readonly field: string;

  /** The invalid value */
  public readonly value: unknown;

  constructor(
    message: string,
    field: string,
    value: unknown,
    code: ErrorCode = ErrorCode.CONFIG_INVALID,
    context: ErrorContext = {},
  ) {
    super(message, code, 'error', {
      ...context,
      component: context.component ?? 'Configuration',
      metadata: { ...context.metadata, field, value },
    });
    this.name = 'ConfigurationError';
    this.field = field;
    this.value = value;
  }

  /**
   * Create error for missing required field.
   *
   * @param field - Dot-notation path to the missing field (e.g., `network.vpcCidr`)
   * @param context - Optional additional context
   * @returns A ConfigurationError with `CONFIG_MISSING_REQUIRED` code
   */
  static missingRequired(field: string, context?: ErrorContext): ConfigurationError {
    return new ConfigurationError(
      `Missing required configuration field: ${field}`,
      field,
      undefined,
      ErrorCode.CONFIG_MISSING_REQUIRED,
      context,
    );
  }

  /**
   * Create error for type mismatch.
   *
   * @param field - Dot-notation path to the mismatched field
   * @param expected - Expected type name (e.g., `string`, `number`)
   * @param actual - The actual value that has the wrong type
   * @param context - Optional additional context
   * @returns A ConfigurationError with `CONFIG_TYPE_MISMATCH` code
   */
  static typeMismatch(field: string, expected: string, actual: unknown, context?: ErrorContext): ConfigurationError {
    return new ConfigurationError(
      `Type mismatch for ${field}: expected ${expected}, got ${typeof actual}`,
      field,
      actual,
      ErrorCode.CONFIG_TYPE_MISMATCH,
      context,
    );
  }

  /**
   * Create error for value out of range.
   *
   * @param field - Dot-notation path to the out-of-range field
   * @param value - The actual numeric value
   * @param min - Minimum allowed value (inclusive)
   * @param max - Maximum allowed value (inclusive)
   * @param context - Optional additional context
   * @returns A ConfigurationError with `CONFIG_VALUE_OUT_OF_RANGE` code
   */
  static outOfRange(
    field: string,
    value: number,
    min: number,
    max: number,
    context?: ErrorContext,
  ): ConfigurationError {
    return new ConfigurationError(
      `Value for ${field} is out of range: ${value} (must be between ${min} and ${max})`,
      field,
      value,
      ErrorCode.CONFIG_VALUE_OUT_OF_RANGE,
      context,
    );
  }
}

/**
 * Helm chart deployment errors
 *
 * Thrown when Helm chart operations fail.
 *
 * @example
 * ```typescript
 * throw new HelmError(
 *   'Failed to install cert-manager',
 *   'cert-manager',
 *   'v1.14.0',
 *   ErrorCode.HELM_RELEASE_FAILED
 * );
 * ```
 */
export class HelmError extends InfrastructureError {
  /** Name of the Helm chart */
  public readonly chart: string;

  /** Version of the chart */
  public readonly version?: string;

  /** Release name */
  public readonly releaseName?: string;

  /** Namespace */
  public readonly namespace?: string;

  constructor(
    message: string,
    chart: string,
    version?: string,
    code: ErrorCode = ErrorCode.HELM_RELEASE_FAILED,
    context: ErrorContext = {},
  ) {
    super(message, code, 'error', {
      ...context,
      component: context.component ?? 'Helm',
      resource: chart,
      metadata: { ...context.metadata, chart, version },
    });
    this.name = 'HelmError';
    this.chart = chart;
    this.version = version;
  }

  /**
   * Create error for chart not found.
   *
   * @param chart - Name of the Helm chart that was not found
   * @param repository - Repository URL that was searched
   * @returns A HelmError with `HELM_CHART_NOT_FOUND` code
   */
  static chartNotFound(chart: string, repository: string): HelmError {
    return new HelmError(
      `Helm chart '${chart}' not found in repository '${repository}'`,
      chart,
      undefined,
      ErrorCode.HELM_CHART_NOT_FOUND,
    );
  }

  /**
   * Create error for invalid version.
   *
   * @param chart - Name of the Helm chart
   * @param version - The invalid version string
   * @param constraint - Optional semver constraint that was violated
   * @returns A HelmError with `HELM_VERSION_INVALID` code
   */
  static invalidVersion(chart: string, version: string, constraint?: string): HelmError {
    const constraintMsg = constraint ? ` (constraint: ${constraint})` : '';
    return new HelmError(
      `Invalid version '${version}' for chart '${chart}'${constraintMsg}`,
      chart,
      version,
      ErrorCode.HELM_VERSION_INVALID,
    );
  }

  /**
   * Create error for values validation failure.
   *
   * @param chart - Name of the Helm chart
   * @param errors - List of validation error messages
   * @returns A HelmError with `HELM_VALUES_INVALID` code
   */
  static invalidValues(chart: string, errors: string[]): HelmError {
    return new HelmError(
      `Invalid values for chart '${chart}': ${errors.join(', ')}`,
      chart,
      undefined,
      ErrorCode.HELM_VALUES_INVALID,
    );
  }
}

/**
 * Kubernetes resource errors.
 *
 * Thrown when Kubernetes resource operations fail (invalid manifests,
 * namespace not found, admission denials, etc.).
 *
 * @example
 * ```typescript
 * throw new KubernetesError(
 *   'Service already exists',
 *   'Service',
 *   'my-service',
 *   'default',
 *   ErrorCode.K8S_RESOURCE_CONFLICT
 * );
 * ```
 */
export class KubernetesError extends InfrastructureError {
  /** Resource kind (e.g., Deployment, Service) */
  public readonly kind: string;

  /** Resource name */
  public readonly resourceName: string;

  /** Resource namespace */
  public readonly namespace?: string;

  constructor(
    message: string,
    kind: string,
    resourceName: string,
    namespace?: string,
    code: ErrorCode = ErrorCode.K8S_RESOURCE_INVALID,
    context: ErrorContext = {},
  ) {
    super(message, code, 'error', {
      ...context,
      component: context.component ?? 'Kubernetes',
      resource: `${kind}/${resourceName}`,
      metadata: { ...context.metadata, kind, resourceName, namespace },
    });
    this.name = 'KubernetesError';
    this.kind = kind;
    this.resourceName = resourceName;
    this.namespace = namespace;
  }

  /**
   * Create error for admission denial.
   *
   * @param kind - Kubernetes resource kind (e.g., `Deployment`)
   * @param name - Resource name
   * @param namespace - Resource namespace
   * @param reason - Human-readable denial reason from the admission controller
   * @returns A KubernetesError with `K8S_ADMISSION_DENIED` code
   */
  static admissionDenied(kind: string, name: string, namespace: string, reason: string): KubernetesError {
    return new KubernetesError(
      `Admission denied for ${kind}/${name} in ${namespace}: ${reason}`,
      kind,
      name,
      namespace,
      ErrorCode.K8S_ADMISSION_DENIED,
    );
  }
}

/**
 * Policy violation errors.
 *
 * Thrown when security or compliance policies are violated
 * (e.g., Kyverno admission denials, image policy violations).
 *
 * @example
 * ```typescript
 * throw new PolicyError(
 *   'Pod does not have required labels',
 *   'require-labels',
 *   'check-team-label',
 *   'deny'
 * );
 * ```
 */
export class PolicyError extends InfrastructureError {
  /** Policy name that was violated */
  public readonly policy: string;

  /** Rule within the policy */
  public readonly rule?: string;

  /** Action taken (audit, deny, warn) */
  public readonly action: 'audit' | 'deny' | 'warn';

  constructor(
    message: string,
    policy: string,
    rule?: string,
    action: 'audit' | 'deny' | 'warn' = 'deny',
    context: ErrorContext = {},
  ) {
    const severity: ErrorSeverity = action === 'deny' ? 'error' : 'warning';
    super(message, ErrorCode.POLICY_VIOLATION, severity, {
      ...context,
      component: context.component ?? 'Policy',
      metadata: { ...context.metadata, policy, rule, action },
    });
    this.name = 'PolicyError';
    this.policy = policy;
    this.rule = rule;
    this.action = action;
  }
}

/**
 * Network configuration errors.
 *
 * Thrown when network-related configuration fails (invalid CIDRs,
 * overlapping subnets, exhausted address space).
 *
 * @example
 * ```typescript
 * throw NetworkError.invalidCidr('999.0.0.0/16');
 * throw NetworkError.cidrOverlap('10.0.0.0/16', '10.0.0.0/24');
 * ```
 */
export class NetworkError extends InfrastructureError {
  /** CIDR block involved (if applicable) */
  public readonly cidr?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NETWORK_CIDR_INVALID,
    cidr?: string,
    context: ErrorContext = {},
  ) {
    super(message, code, 'error', {
      ...context,
      component: context.component ?? 'Network',
      metadata: { ...context.metadata, cidr },
    });
    this.name = 'NetworkError';
    this.cidr = cidr;
  }

  /**
   * Create error for invalid CIDR.
   *
   * @param cidr - The invalid CIDR string
   * @returns A NetworkError with `NETWORK_CIDR_INVALID` code
   */
  static invalidCidr(cidr: string): NetworkError {
    return new NetworkError(`Invalid CIDR block: ${cidr}`, ErrorCode.NETWORK_CIDR_INVALID, cidr);
  }

  /**
   * Create error for overlapping CIDRs.
   *
   * @param cidr1 - First CIDR block
   * @param cidr2 - Second CIDR block that overlaps with the first
   * @returns A NetworkError with `NETWORK_CIDR_OVERLAP` code
   */
  static cidrOverlap(cidr1: string, cidr2: string): NetworkError {
    return new NetworkError(`CIDR blocks overlap: ${cidr1} and ${cidr2}`, ErrorCode.NETWORK_CIDR_OVERLAP, cidr1);
  }
}

/**
 * CDK Stack deployment errors.
 *
 * Thrown when CDK stack operations fail (deployment, destruction,
 * dependency resolution).
 *
 * @example
 * ```typescript
 * throw StackError.deployFailed('NetworkStack', 'VPC limit exceeded');
 * throw StackError.dependencyFailed('ClusterStack', 'NetworkStack');
 * ```
 */
export class StackError extends InfrastructureError {
  /** Stack name */
  public readonly stackName: string;

  constructor(
    message: string,
    stackName: string,
    code: ErrorCode = ErrorCode.STACK_DEPLOY_FAILED,
    context: ErrorContext = {},
  ) {
    super(message, code, 'error', {
      ...context,
      component: context.component ?? 'CDK',
      resource: stackName,
      metadata: { ...context.metadata, stackName },
    });
    this.name = 'StackError';
    this.stackName = stackName;
  }

  /**
   * Create error for deployment failure.
   *
   * @param stackName - Name of the stack that failed to deploy
   * @param reason - Human-readable failure reason
   * @returns A StackError with `STACK_DEPLOY_FAILED` code
   */
  static deployFailed(stackName: string, reason: string): StackError {
    return new StackError(`Failed to deploy stack '${stackName}': ${reason}`, stackName, ErrorCode.STACK_DEPLOY_FAILED);
  }

  /**
   * Create error for dependency failure.
   *
   * @param stackName - Name of the stack that cannot proceed
   * @param dependency - Name of the failed dependency stack
   * @returns A StackError with `STACK_DEPENDENCY_FAILED` code
   */
  static dependencyFailed(stackName: string, dependency: string): StackError {
    return new StackError(
      `Stack '${stackName}' failed because dependency '${dependency}' failed`,
      stackName,
      ErrorCode.STACK_DEPENDENCY_FAILED,
    );
  }
}

/**
 * Type guard to check if an error is an InfrastructureError.
 *
 * @param error - The unknown value to check
 * @returns `true` if the error is an instance of {@link InfrastructureError}
 */
export function isInfrastructureError(error: unknown): error is InfrastructureError {
  return error instanceof InfrastructureError;
}

/**
 * Type guard to check if an error has a specific error code.
 *
 * @param error - The unknown value to check
 * @param code - The error code to match against
 * @returns `true` if the error is an InfrastructureError with the given code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isInfrastructureError(error) && error.code === code;
}
