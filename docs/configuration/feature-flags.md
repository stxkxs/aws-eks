# Feature Flags

## Overview

Feature flags control optional functionality across environments. They enable cost optimization in development while ensuring full security in production.

## Available Feature Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `multiAzNat` | boolean | true | Deploy NAT gateways in multiple AZs |
| `hubbleUi` | boolean | true | Deploy Hubble UI for network visualization |
| `falcoKillMode` | boolean | false | Enable Falco Talon to kill suspicious pods |
| `trivyAdmission` | boolean | true | Block deployment of vulnerable images |
| `veleroBackups` | boolean | true | Enable Velero backup schedules |
| `goldilocks` | boolean | true | Deploy Goldilocks for resource recommendations |
| `costAllocationTags` | boolean | true | Add cost allocation tags to resources |

## Flag Details

### multiAzNat

Controls NAT Gateway redundancy.

```typescript
features: {
  multiAzNat: true,  // 3 NAT gateways (one per AZ)
  // or
  multiAzNat: false, // 1 NAT gateway (cost savings)
}
```

**Impact:**
- `true`: High availability, ~$100/month per additional gateway
- `false`: Single point of failure for egress traffic

**Recommendations:**
| Environment | Setting | Rationale |
|-------------|---------|-----------|
| Dev | false | Cost optimization |
| Staging | true | Test HA configuration |
| Production | true | Required for HA |

### hubbleUi

Deploys Hubble UI for Cilium network observability.

```typescript
features: {
  hubbleUi: true,  // Deploy Hubble UI
}
```

**Impact:**
- Provides visual service map
- Real-time network flow monitoring
- Minimal resource overhead

**Recommendations:**
| Environment | Setting | Rationale |
|-------------|---------|-----------|
| Dev | true | Debug networking |
| Staging | true | Validate policies |
| Production | true | Operational visibility |

### falcoKillMode

Enables automated response to security threats via Falco Talon.

```typescript
features: {
  falcoKillMode: true,  // Auto-terminate suspicious pods
}
```

**Impact:**
- `true`: Falco Talon deployed, automatically terminates pods triggering critical alerts
- `false`: Falco alerts only, no automated response

**Response Actions (when enabled):**

| Alert | Action |
|-------|--------|
| Container Escape Attempt | Immediate termination |
| Shell Spawned in Container | Termination (5s grace) |
| Sensitive File Access | Immediate termination |
| C2 Server Connection | Network isolation |

**Recommendations:**
| Environment | Setting | Rationale |
|-------------|---------|-----------|
| Dev | false | Avoid disrupting development |
| Staging | false | Test detection, not response |
| Production | true | Active threat mitigation |

### trivyAdmission

Blocks deployment of images with vulnerabilities via Kyverno policy.

```typescript
features: {
  trivyAdmission: true,  // Block vulnerable images
}
```

**Impact:**
- `true`: Kyverno policy enforces Trivy scan results
- `false`: Vulnerabilities logged but not blocked

**Behavior:**
1. Trivy Operator scans images
2. Creates VulnerabilityReport CR
3. Kyverno policy checks report before allowing pod creation
4. Blocks if vulnerabilities exceed `trivySeverityThreshold`

**Recommendations:**
| Environment | Setting | Rationale |
|-------------|---------|-----------|
| Dev | false | Don't block development |
| Staging | true | Catch issues before production |
| Production | true | Security enforcement |

### veleroBackups

Enables Velero deployment and backup schedules.

```typescript
features: {
  veleroBackups: true,  // Deploy Velero with daily backups
}
```

**Impact:**
- `true`: Velero deployed, daily backups scheduled
- `false`: No Velero, no backups

**Resources Created (when enabled):**
- S3 bucket for backup storage
- Velero deployment
- Daily backup schedule
- IRSA role for S3 access

**Recommendations:**
| Environment | Setting | Rationale |
|-------------|---------|-----------|
| Dev | false | No critical data |
| Staging | true | Test backup/restore |
| Production | true | Disaster recovery |

### goldilocks

Deploys Goldilocks for resource recommendation.

```typescript
features: {
  goldilocks: true,  // Deploy Goldilocks
}
```

**Impact:**
- Creates VPA objects for namespaces
- Provides resource recommendations dashboard
- Helps right-size workloads

**Usage:**
1. Label namespace: `goldilocks.fairwinds.com/enabled=true`
2. Access Goldilocks dashboard
3. Review recommendations
4. Update resource requests/limits

**Recommendations:**
| Environment | Setting | Rationale |
|-------------|---------|-----------|
| Dev | true | Tune resource settings |
| Staging | true | Validate production sizing |
| Production | true | Ongoing optimization |

### costAllocationTags

Adds tags for AWS cost tracking.

```typescript
features: {
  costAllocationTags: true,
}

tags: {
  'cost-center': 'development',
  'project': 'aws-eks',
}
```

**Impact:**
- Tags applied to all AWS resources
- Enables Cost Explorer filtering
- Supports chargeback/showback

**Recommendations:**
| Environment | Setting | Rationale |
|-------------|---------|-----------|
| Dev | true | Track dev costs |
| Staging | true | Track staging costs |
| Production | true | Required for cost management |

## Configuration by Environment

### Development

```typescript
features: {
  multiAzNat: false,      // Cost savings
  hubbleUi: true,         // Debug networking
  falcoKillMode: false,   // Don't disrupt dev
  trivyAdmission: false,  // Don't block dev
  veleroBackups: false,   // No critical data
  goldilocks: true,       // Resource tuning
  costAllocationTags: true,
}
```

### Staging

```typescript
features: {
  multiAzNat: true,       // Test HA
  hubbleUi: true,         // Validate policies
  falcoKillMode: false,   // Alert only
  trivyAdmission: true,   // Catch issues
  veleroBackups: true,    // Test backups
  goldilocks: true,       // Validate sizing
  costAllocationTags: true,
}
```

### Production

```typescript
features: {
  multiAzNat: true,       // Required HA
  hubbleUi: true,         // Operational visibility
  falcoKillMode: true,    // Active defense
  trivyAdmission: true,   // Security gate
  veleroBackups: true,    // DR requirement
  goldilocks: true,       // Cost optimization
  costAllocationTags: true,
}
```

## Runtime Feature Checks

Features are checked during stack synthesis:

```typescript
// Example: Conditional Velero deployment
if (config.features.veleroBackups) {
  this.veleroBucket = this.deployVelero(cluster, config);
}

// Example: Conditional Falco Talon
if (config.features.falcoKillMode) {
  this.deployFalcoTalon(cluster, config);
}
```

## Adding New Feature Flags

1. **Add to type definition:**

```typescript
// lib/types/config.ts
export interface FeatureFlags {
  // ... existing flags
  readonly newFeature: boolean;
}
```

2. **Set default in base config:**

```typescript
// config/base.ts
features: {
  // ... existing defaults
  newFeature: false,  // Conservative default
}
```

3. **Override per environment:**

```typescript
// config/production.ts
features: {
  newFeature: true,
}
```

4. **Use in stack code:**

```typescript
if (config.features.newFeature) {
  // Deploy feature
}
```

## Related

- [Environments](./environments.md)
- [Helm Values](./helm-values.md)
- [Security Architecture](../architecture/security.md)
