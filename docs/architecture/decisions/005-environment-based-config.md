# ADR-005: Environment-based Configuration System

## Status

Accepted

## Date

2024-01-15

## Context

We need a configuration system that:

- Supports multiple environments (dev, staging, production)
- Provides type safety and validation
- Allows environment-specific overrides
- Maintains a single source of truth for defaults
- Is easy to extend and maintain

Options considered:

1. **TypeScript configuration** with deep merge
2. **Environment variables** only
3. **JSON/YAML** configuration files
4. **AWS SSM Parameter Store** for all config

## Decision

We will use a **TypeScript-based configuration system** with:

- `config/base.ts` - Shared defaults
- `config/dev.ts` - Development overrides
- `config/staging.ts` - Staging overrides
- `config/production.ts` - Production overrides

Configuration merging uses deep merge to combine base with environment-specific overrides.

## Consequences

### Positive

- **Type safety**: TypeScript interfaces catch errors at compile time
- **IDE support**: Full autocomplete and validation
- **Single source of truth**: Base config reduces duplication
- **Clarity**: Environment differences are explicit in override files
- **Testable**: Configuration can be unit tested
- **Refactorable**: IDE refactoring works across configs
- **Documentation**: Types serve as documentation

### Negative

- **Rebuild required**: Config changes require rebuild (mitigated: fast builds)
- **Not runtime configurable**: Can't change without redeployment
- **Learning curve**: Developers need to understand merge behavior

### Neutral

- Sensitive values still come from environment variables or Secrets Manager
- Feature flags enable/disable functionality per environment
- Helm values are included in config for consistency

## Implementation

### Configuration Interface

```typescript
// lib/types/config.ts
export interface EnvironmentConfig {
  readonly environment: 'dev' | 'staging' | 'production';
  readonly aws: {
    readonly accountId: string;
    readonly region: string;
  };
  readonly features: FeatureFlags;
  readonly network: NetworkConfig;
  readonly cluster: ClusterConfig;
  readonly helmConfigs: HelmConfigs;
  // ...
}
```

### Base Configuration

```typescript
// config/base.ts
export const baseConfig: Omit<EnvironmentConfig, 'environment' | 'aws'> = {
  features: {
    multiAzNat: true,
    hubbleUi: true,
    // ... defaults
  },
  // ...
};
```

### Environment Override

```typescript
// config/dev.ts
const devOverrides = {
  features: {
    multiAzNat: false,  // Override for cost savings
  },
};

export function getDevConfig(accountId: string, region: string): EnvironmentConfig {
  return {
    environment: 'dev',
    aws: { accountId, region },
    ...deepMerge(baseConfig, devOverrides),
  } as EnvironmentConfig;
}
```

### Deep Merge Function

```typescript
// lib/utils.ts
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    if (isObject(source[key]) && isObject(target[key])) {
      result[key] = deepMerge(target[key] as object, source[key] as object) as T[keyof T];
    } else if (source[key] !== undefined) {
      result[key] = source[key] as T[keyof T];
    }
  }
  return result;
}
```

## Alternatives Considered

### Alternative 1: Environment Variables Only

All configuration via environment variables.

**Pros:**
- 12-factor app compliant
- Easy runtime changes
- Platform agnostic

**Cons:**
- No type safety
- Complex nested structures difficult
- Easy to miss required variables
- Documentation burden

**Why rejected:** Too error-prone for complex configurations. No compile-time validation.

### Alternative 2: JSON/YAML Configuration Files

External configuration files.

**Pros:**
- Familiar format
- Easy to read
- Can be validated with JSON Schema

**Cons:**
- No IDE autocomplete without setup
- Schema maintenance overhead
- Type coercion issues
- No refactoring support

**Why rejected:** TypeScript provides better developer experience and catches more errors.

### Alternative 3: AWS SSM Parameter Store

All configuration in SSM.

**Pros:**
- Centralized configuration
- Runtime changes without deploy
- Built-in encryption
- Audit trail

**Cons:**
- Network dependency for config
- Additional AWS costs
- Slower startup (API calls)
- Complex local development

**Why rejected:** Adds complexity and latency. Infrastructure config rarely changes at runtime.

### Alternative 4: CDK Context

Using CDK's built-in context system.

**Pros:**
- Native CDK feature
- JSON-based
- Cached in cdk.context.json

**Cons:**
- Limited type safety
- Flat structure
- Context pollution
- Not ideal for complex configs

**Why rejected:** Not designed for complex, typed configuration. Better suited for simple values.

## References

- [AWS CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [TypeScript Configuration Patterns](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
- [12-Factor App Config](https://12factor.net/config)
