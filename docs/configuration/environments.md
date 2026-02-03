# Environment Configuration

## Overview

The infrastructure supports three environments with TypeScript-based configuration providing full type safety and IDE support.

## Configuration Architecture

```
config/
├── base.ts        # Shared defaults (all environments inherit)
├── dev.ts         # Development overrides
├── staging.ts     # Staging overrides
└── production.ts  # Production overrides
```

### Configuration Merging

Environment configs use deep merge to override base settings:

```typescript
import { baseConfig } from './base';
import { deepMerge } from '../lib/utils';

const devOverrides = {
  features: {
    multiAzNat: false,  // Override base setting
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

## Environment Comparison

### Cost & Resources

| Setting | Dev | Staging | Production |
|---------|-----|---------|------------|
| NAT Gateways | 1 | 2 | 3 |
| VPC Flow Logs | No | Yes | Yes |
| System Nodes Min | 2 | 2 | 3 |
| System Nodes Max | 4 | 6 | 10 |
| Disk Size | 50GB | 100GB | 100GB |
| Karpenter CPU Limit | 50 | 100 | 200 |
| Karpenter Memory Limit | 100Gi | 200Gi | 400Gi |

### Security

| Setting | Dev | Staging | Production |
|---------|-----|---------|------------|
| Falco Kill Mode | No | No | Yes |
| Trivy Admission | No | Yes | Yes |
| Trivy Threshold | CRITICAL | HIGH | HIGH |
| Public Endpoint | Yes | Yes | No |
| Kyverno Mode | Audit | Mixed | Enforce |

### Observability

| Setting | Dev | Staging | Production |
|---------|-----|---------|------------|
| Loki Retention | 7 days | 30 days | 90 days |
| Tempo Retention | 3 days | 7 days | 30 days |
| Container Insights | No | Yes | Yes |
| Hubble UI | Yes | Yes | Yes |

### Backup

| Setting | Dev | Staging | Production |
|---------|-----|---------|------------|
| Velero Backups | No | Yes | Yes |
| Daily Retention | 7 days | 30 days | 30 days |
| Weekly Retention | 14 days | 60 days | 90 days |

## Development Environment

**Purpose:** Fast iteration, cost optimization, minimal restrictions

```typescript
// config/dev.ts highlights
const devOverrides = {
  features: {
    multiAzNat: false,           // Single NAT gateway
    falcoKillMode: false,        // Alert only
    trivyAdmission: false,       // Don't block deployments
    veleroBackups: false,        // No backups
  },
  network: {
    natGateways: 1,
    flowLogs: false,
  },
  security: {
    trivySeverityThreshold: 'CRITICAL',  // Only block critical
  },
};
```

### When to Use Dev

- Local development testing
- Feature branch validation
- Cost-sensitive experiments
- Learning and exploration

### Dev Limitations

- No HA (single NAT, minimal nodes)
- Security policies in audit mode
- Short retention periods
- No automated backups

## Staging Environment

**Purpose:** Production-like testing, pre-release validation

```typescript
// config/staging.ts highlights
const stagingOverrides = {
  features: {
    multiAzNat: true,
    trivyAdmission: true,        // Block vulnerable images
    veleroBackups: true,
  },
  network: {
    natGateways: 2,
    flowLogs: true,
  },
  security: {
    trivySeverityThreshold: 'HIGH',
  },
};
```

### When to Use Staging

- Integration testing
- Performance testing
- Security validation
- Release candidates

### Staging Characteristics

- Production-like security
- Multi-AZ redundancy
- Full observability
- Backup enabled

## Production Environment

**Purpose:** Live workloads, full security, compliance

```typescript
// config/production.ts highlights
const productionOverrides = {
  features: {
    multiAzNat: true,
    falcoKillMode: true,         // Kill suspicious pods
    trivyAdmission: true,
    veleroBackups: true,
    costAllocationTags: true,
  },
  cluster: {
    publicEndpoint: false,       // Private only
  },
  network: {
    natGateways: 3,              // One per AZ
    flowLogs: true,
  },
  tags: {
    'compliance': 'soc2,hipaa,pci-dss',
    'data-classification': 'confidential',
  },
};
```

### Production Characteristics

- Maximum security (kill mode active)
- Full redundancy (3 AZs)
- Private API endpoint only
- Long retention for compliance
- Full backup strategy

## Required Configuration

Before deployment, update these values per environment:

### AWS Account

```typescript
// Set via CLI context or environment
aws: {
  accountId: '123456789012',  // Your AWS account
  region: 'us-west-2',        // Target region
}
```

### DNS

```typescript
dns: {
  hostedZoneId: 'ZXXXXXXXXXXXXX',  // Route53 hosted zone ID
  domainName: 'example.com',       // Your domain
}
```

### Security

```typescript
security: {
  allowedRegistries: [
    '123456789012.dkr.ecr.us-west-2.amazonaws.com',  // Your ECR
    'public.ecr.aws',                                 // Public ECR
  ],
}
```

## Using Configurations

### CLI Context

Pass environment via CDK context:

```bash
# Synthesize for dev
cdk synth -c environment=dev

# Deploy to production
cdk deploy --all -c environment=production
```

### npm Scripts

Convenience scripts in package.json:

```bash
npm run synth:dev      # Synthesize dev
npm run synth:staging  # Synthesize staging
npm run synth:prod     # Synthesize production

npm run deploy:dev     # Deploy to dev
npm run deploy:staging # Deploy to staging
npm run deploy:prod    # Deploy to production

npm run diff:dev       # Show changes for dev
```

## Creating Custom Environments

To create a new environment (e.g., `sandbox`):

1. **Create config file:**

```typescript
// config/sandbox.ts
import { EnvironmentConfig, DeepPartial } from '../lib/types/config';
import { baseConfig } from './base';
import { deepMerge } from '../lib/utils';

const sandboxOverrides: DeepPartial<...> = {
  // Your overrides
};

export function getSandboxConfig(accountId: string, region: string): EnvironmentConfig {
  return {
    environment: 'sandbox' as any,  // Add to Environment type
    aws: { accountId, region },
    ...deepMerge(baseConfig, sandboxOverrides),
  } as EnvironmentConfig;
}
```

2. **Update type definition:**

```typescript
// lib/types/config.ts
export type Environment = 'dev' | 'staging' | 'production' | 'sandbox';
```

3. **Update app entry point:**

```typescript
// bin/app.ts
import { getSandboxConfig } from '../config/sandbox';

// Add case for sandbox
```

4. **Add npm scripts:**

```json
{
  "scripts": {
    "synth:sandbox": "npm run build && cdk synth -c environment=sandbox",
    "deploy:sandbox": "npm run build && cdk deploy --all -c environment=sandbox"
  }
}
```

## ArgoCD SSO Configuration

ArgoCD SSO uses Dex with the GitHub connector. The configuration differs depending on whether you're using a **GitHub Organization** or a **personal GitHub account**.

### Personal GitHub Account

When `githubOrg` is set to a personal GitHub username (e.g., `my-username`):

- **Dex connector**: Uses `loadAllGroups: true` (no `orgs` filter)
- **Authentication**: Any GitHub user can authenticate via the OAuth consent screen
- **Authorization**: Controlled entirely by `rbacDefaultPolicy` and RBAC `policy.csv`
- **RBAC mapping**: `g, <username>, role:admin` grants your GitHub user admin access

```typescript
// config/dev.ts - personal account
argocd: {
  ssoEnabled: true,
  githubOrg: 'my-username',       // GitHub username, not an org
  rbacDefaultPolicy: 'role:admin', // Dev: everyone is admin
  oauthSecretName: 'dev-argocd-github-oauth',
},
```

**OAuth App callback URL:** `https://<argocd-hostname>/api/dex/callback`

### GitHub Organization

When `githubOrg` is a real GitHub Organization:

- **Dex connector**: Add an `orgs` filter to restrict to org members only
- **Authentication**: Only org members can authenticate
- **Authorization**: Map org teams to ArgoCD roles via `policy.csv`
- **RBAC mapping**: `g, <org>:<team>, role:admin` grants a team admin access

To switch from personal to org-based SSO, update `argocd-bootstrap.ts` to add the `orgs` filter to the Dex config:

```yaml
# Dex connector config with org filter
connectors:
  - type: github
    config:
      orgs:
        - name: my-org
          teams:
            - admins
            - engineers
```

And update RBAC policy:
```
g, my-org:admins, role:admin
g, my-org:engineers, role:admin
g, my-org:readonly, role:readonly
```

### RBAC Default Policy by Environment

| Environment | `rbacDefaultPolicy` | Behavior |
|-------------|---------------------|----------|
| Dev | `role:admin` | All authenticated users get full access |
| Staging | `role:readonly` | Authenticated users can view, explicit mapping for write |
| Production | `role:readonly` | Strictest — explicit team/user mapping required |

### Prerequisites

1. **GitHub OAuth App** — create at GitHub Settings > Developer settings > OAuth Apps
2. **AWS Secrets Manager secret** — store `client_id`, `client_secret`, `server_secretkey`
3. **Setup script**: `./scripts/setup-argocd-sso.sh`

## Best Practices

1. **Never commit secrets** - Use environment variables or AWS Secrets Manager
2. **Use separate AWS accounts** - One account per environment for isolation
3. **Review production changes** - Always diff before deploying to production
4. **Test in order** - Dev → Staging → Production
5. **Keep base config conservative** - Safer defaults, override for flexibility

## Related

- [Feature Flags](./feature-flags.md)
- [Helm Values](./helm-values.md)
- [Deployment Runbook](../runbooks/deployment.md)
