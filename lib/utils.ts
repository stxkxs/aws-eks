import { DeepPartial, EnvironmentConfig } from './types/config';

/**
 * Standard toleration for scheduling on system nodes tainted with CriticalAddonsOnly.
 *
 * Applied to all platform controllers (cert-manager, external-secrets,
 * ALB controller, Karpenter, etc.) so they can run on the managed node group
 * that carries the `CriticalAddonsOnly` taint.
 */
export const CRITICAL_ADDONS_TOLERATION = {
  key: 'CriticalAddonsOnly',
  operator: 'Exists',
} as const;

/**
 * Configuration validation error.
 *
 * Thrown when a specific configuration field fails validation.
 *
 * @see {@link validateConfig} for the function that produces these errors
 */
export class ConfigValidationError extends Error {
  /**
   * @param message - Human-readable description of the validation failure
   * @param field - Dot-notation path to the invalid field (e.g., `network.vpcCidr`)
   * @param value - The actual invalid value
   */
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
  ) {
    super(`Config validation failed for '${field}': ${message}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validation result containing all errors found.
 *
 * @see {@link validateConfig} for the function that returns this type
 */
export interface ValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
}

/**
 * Validates an EnvironmentConfig at runtime
 *
 * Checks for:
 * - Required fields are present and non-empty
 * - Numeric values are within valid ranges
 * - Cross-field consistency (e.g., minSize <= maxSize)
 * - Format validation (CIDR blocks, Kubernetes versions)
 *
 * @param config - The configuration to validate
 * @returns ValidationResult with all errors found
 *
 * @example
 * ```typescript
 * const result = validateConfig(config);
 * if (!result.valid) {
 *   result.errors.forEach(e => console.error(e.message));
 *   throw new Error('Invalid configuration');
 * }
 * ```
 */
export function validateConfig(config: EnvironmentConfig): ValidationResult {
  const errors: ConfigValidationError[] = [];

  // Helper to add validation errors
  const addError = (field: string, message: string, value: unknown) => {
    errors.push(new ConfigValidationError(message, field, value));
  };

  // Validate AWS config
  if (!config.aws.accountId || !/^\d{12}$/.test(config.aws.accountId)) {
    addError('aws.accountId', 'Must be a 12-digit AWS account ID', config.aws.accountId);
  }
  if (!config.aws.region || !/^[a-z]{2}-[a-z]+-\d$/.test(config.aws.region)) {
    addError('aws.region', 'Must be a valid AWS region (e.g., us-west-2)', config.aws.region);
  }

  // Validate network config
  if (!config.network.vpcCidr || !/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(config.network.vpcCidr)) {
    addError('network.vpcCidr', 'Must be a valid CIDR block (e.g., 10.0.0.0/16)', config.network.vpcCidr);
  }
  if (config.network.natGateways < 1) {
    addError('network.natGateways', 'Must be at least 1', config.network.natGateways);
  }
  if (config.network.maxAzs < 1 || config.network.maxAzs > 6) {
    addError('network.maxAzs', 'Must be between 1 and 6', config.network.maxAzs);
  }

  // Validate cluster config
  if (!config.cluster.version || !/^1\.\d+$/.test(config.cluster.version)) {
    addError('cluster.version', 'Must be a valid Kubernetes version (e.g., 1.31)', config.cluster.version);
  }
  if (!config.cluster.name || config.cluster.name.length === 0) {
    addError('cluster.name', 'Cluster name is required', config.cluster.name);
  }
  if (!config.cluster.privateEndpoint && !config.cluster.publicEndpoint) {
    addError('cluster', 'At least one endpoint (private or public) must be enabled', {
      privateEndpoint: config.cluster.privateEndpoint,
      publicEndpoint: config.cluster.publicEndpoint,
    });
  }

  // Validate system node group
  if (config.systemNodeGroup.minSize < 0) {
    addError('systemNodeGroup.minSize', 'Cannot be negative', config.systemNodeGroup.minSize);
  }
  if (config.systemNodeGroup.maxSize < config.systemNodeGroup.minSize) {
    addError('systemNodeGroup.maxSize', 'Must be >= minSize', config.systemNodeGroup.maxSize);
  }
  if (config.systemNodeGroup.desiredSize < config.systemNodeGroup.minSize) {
    addError('systemNodeGroup.desiredSize', 'Must be >= minSize', config.systemNodeGroup.desiredSize);
  }
  if (config.systemNodeGroup.desiredSize > config.systemNodeGroup.maxSize) {
    addError('systemNodeGroup.desiredSize', 'Must be <= maxSize', config.systemNodeGroup.desiredSize);
  }
  if (config.systemNodeGroup.diskSize < 20) {
    addError('systemNodeGroup.diskSize', 'Must be at least 20 GB', config.systemNodeGroup.diskSize);
  }
  if (config.systemNodeGroup.instanceTypes.length === 0) {
    addError(
      'systemNodeGroup.instanceTypes',
      'At least one instance type is required',
      config.systemNodeGroup.instanceTypes,
    );
  }

  // Validate Karpenter config
  if (config.karpenter.cpuLimit < 1) {
    addError('karpenter.cpuLimit', 'Must be at least 1', config.karpenter.cpuLimit);
  }
  if (config.karpenter.memoryLimitGi < 1) {
    addError('karpenter.memoryLimitGi', 'Must be at least 1 Gi', config.karpenter.memoryLimitGi);
  }
  if (config.karpenter.instanceCategories.length === 0) {
    addError(
      'karpenter.instanceCategories',
      'At least one instance category is required',
      config.karpenter.instanceCategories,
    );
  }

  // Validate observability config
  if (config.observability.lokiRetentionDays < 1) {
    addError('observability.lokiRetentionDays', 'Must be at least 1 day', config.observability.lokiRetentionDays);
  }
  if (config.observability.tempoRetentionDays < 1) {
    addError('observability.tempoRetentionDays', 'Must be at least 1 day', config.observability.tempoRetentionDays);
  }

  // Validate backup config (if backups enabled)
  if (config.features.veleroBackups) {
    if (config.backup.dailyRetentionDays < 1) {
      addError(
        'backup.dailyRetentionDays',
        'Must be at least 1 day when backups are enabled',
        config.backup.dailyRetentionDays,
      );
    }
    if (config.backup.weeklyRetentionDays < config.backup.dailyRetentionDays) {
      addError('backup.weeklyRetentionDays', 'Should be >= dailyRetentionDays', config.backup.weeklyRetentionDays);
    }
  }

  // Cross-field validation: production should have multi-AZ NAT
  if (config.environment === 'production' && !config.features.multiAzNat) {
    addError('features.multiAzNat', 'Multi-AZ NAT is recommended for production', config.features.multiAzNat);
  }

  // Cross-field validation: production should have private endpoint only
  if (config.environment === 'production' && config.cluster.publicEndpoint) {
    // Warning level - not blocking but worth noting
    // We don't add this as an error, just a consideration
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates config and throws if invalid
 *
 * @param config - The configuration to validate
 * @throws {ConfigValidationError} If validation fails (throws the first error)
 */
export function assertValidConfig(config: EnvironmentConfig): void {
  const result = validateConfig(config);
  if (!result.valid) {
    throw result.errors[0];
  }
}

/**
 * Deep merge two objects, with the override taking precedence.
 *
 * Objects are recursively merged. Arrays and primitives in the override
 * replace the base value entirely. `undefined` values in the override
 * are ignored (the base value is preserved).
 *
 * @param base - The base object providing default values
 * @param override - Partial object whose defined values take precedence
 * @returns A new object with the merged result (neither input is mutated)
 *
 * @example
 * ```typescript
 * const merged = deepMerge(baseConfig, { network: { natGateways: 1 } });
 * ```
 */
export function deepMerge<T extends object>(base: T, override: DeepPartial<T>): T {
  const result = { ...base } as T;

  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideValue = override[key];
    const baseValue = base[key];

    if (
      overrideValue !== undefined &&
      typeof overrideValue === 'object' &&
      overrideValue !== null &&
      !Array.isArray(overrideValue) &&
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMerge(baseValue as object, overrideValue as object) as T[keyof T];
    } else if (overrideValue !== undefined) {
      result[key] = overrideValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Get the environment from CDK context or default to `dev`.
 *
 * Reads the `environment` context key (set via `-c environment=staging`).
 *
 * @param app - CDK App or any construct with a `node.tryGetContext` method
 * @returns The environment string, or `'dev'` if not set
 */
export function getEnvironment(app: { node: { tryGetContext: (key: string) => string | undefined } }): string {
  return app.node.tryGetContext('environment') ?? 'dev';
}

// =============================================================================
// Exhaustive Type Checking Utilities
// =============================================================================

/**
 * Assert that a value is never reached (exhaustive check)
 *
 * Use this function in switch statements and if-else chains to ensure
 * all possible values of a discriminated union are handled. If a case
 * is missed, TypeScript will produce a compile-time error.
 *
 * @param value - The value that should never be reached
 * @param message - Optional custom error message
 * @throws Error if called at runtime (indicates a bug)
 *
 * @example
 * ```typescript
 * type Status = 'pending' | 'running' | 'completed';
 *
 * function handleStatus(status: Status): string {
 *   switch (status) {
 *     case 'pending':
 *       return 'Waiting...';
 *     case 'running':
 *       return 'In progress...';
 *     case 'completed':
 *       return 'Done!';
 *     default:
 *       // If a new status is added to the union, TypeScript will
 *       // error here because the new status won't be assignable to never
 *       return assertNever(status);
 *   }
 * }
 * ```
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}. This should never happen.`);
}

/**
 * Exhaustive switch helper that returns a value
 *
 * Provides compile-time exhaustiveness checking for discriminated unions
 * while allowing you to return a computed value.
 *
 * @param value - The discriminant value to switch on
 * @param handlers - Object mapping each possible value to a handler function
 * @returns The result of calling the matching handler
 *
 * @example
 * ```typescript
 * type Environment = 'dev' | 'staging' | 'production';
 *
 * const maxReplicas = exhaustiveSwitch(env, {
 *   dev: () => 1,
 *   staging: () => 2,
 *   production: () => 3,
 * });
 * ```
 */
export function exhaustiveSwitch<T extends string | number, R>(value: T, handlers: { [K in T]: () => R }): R {
  const handler = handlers[value];
  if (handler === undefined) {
    throw new Error(`No handler for value: ${String(value)}`);
  }
  return handler();
}

/**
 * Type-safe object keys
 *
 * Returns the keys of an object with proper typing instead of string[].
 *
 * @param obj - The object to get keys from
 * @returns Array of keys with proper type
 *
 * @example
 * ```typescript
 * const config = { host: 'localhost', port: 3000 };
 * const keys = typedKeys(config); // ('host' | 'port')[]
 * ```
 */
export function typedKeys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

/**
 * Type-safe object entries
 *
 * Returns the entries of an object with proper typing.
 *
 * @param obj - The object to get entries from
 * @returns Array of [key, value] tuples with proper types
 *
 * @example
 * ```typescript
 * const config = { host: 'localhost', port: 3000 };
 * const entries = typedEntries(config); // ['host', string] | ['port', number][]
 * ```
 */
export function typedEntries<T extends object>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][];
}

/**
 * Type guard for checking if a value is defined (not null or undefined)
 *
 * Useful for filtering arrays and narrowing types.
 *
 * @param value - The value to check
 * @returns True if the value is defined
 *
 * @example
 * ```typescript
 * const values = [1, null, 2, undefined, 3];
 * const defined = values.filter(isDefined); // number[]
 * ```
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for checking if a value is a non-empty string
 *
 * @param value - The value to check
 * @returns True if the value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard for checking if a value is a positive integer
 *
 * @param value - The value to check
 * @returns True if the value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Branded type helper for nominal typing
 *
 * Creates a unique branded type to prevent mixing up values of the same
 * primitive type (e.g., user IDs vs. order IDs).
 *
 * @example
 * ```typescript
 * type UserId = Brand<string, 'UserId'>;
 * type OrderId = Brand<string, 'OrderId'>;
 *
 * function getUser(id: UserId): User { ... }
 *
 * const userId = 'user-123' as UserId;
 * const orderId = 'order-456' as OrderId;
 *
 * getUser(userId); // OK
 * getUser(orderId); // Type error!
 * ```
 */
export type Brand<T, B> = T & { readonly __brand: B };

/**
 * Create a branded value
 *
 * @param value - The value to brand
 * @returns The branded value
 */
export function brand<T, B>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}

/**
 * Environment type for use with exhaustive checking
 */
export type EnvironmentType = 'dev' | 'staging' | 'production';

/**
 * Get environment-specific value with exhaustive checking
 *
 * Ensures all environments are handled when getting environment-specific values.
 *
 * @param env - The environment
 * @param values - Object with values for each environment
 * @returns The value for the specified environment
 *
 * @example
 * ```typescript
 * const replicas = forEnvironment(config.environment, {
 *   dev: 1,
 *   staging: 2,
 *   production: 3,
 * });
 * ```
 */
export function forEnvironment<T>(env: EnvironmentType, values: Record<EnvironmentType, T>): T {
  return values[env];
}
