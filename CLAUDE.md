# AWS EKS Infrastructure

A production-grade, environment-based EKS deployment using AWS CDK v2 (TypeScript).

## Project Overview

This is a **reusable reference architecture** for deploying EKS clusters with:
- Environment-based configuration (dev, staging, production)
- Cost optimization for lower environments
- SOC2, HIPAA, PCI-DSS compliance ready
- Full observability stack (AMP, AMG, Loki, Tempo, Hubble)
- Security-first approach (Falco, Trivy, Kyverno, Cilium)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      EKS Cluster                            │
├─────────────────────────────────────────────────────────────┤
│  Managed Node Group (system)    │    Karpenter (workloads)  │
│  - CoreDNS, CNI, Karpenter      │    - Spot + On-demand     │
│  - 2 nodes min (on-demand)      │    - Auto-scaling         │
├─────────────────────────────────────────────────────────────┤
│  Cilium CNI + Service Mesh + Network Policies + Hubble      │
├─────────────────────────────────────────────────────────────┤
│  Security: Falco (kill mode) │ Trivy │ Kyverno │ mTLS      │
├─────────────────────────────────────────────────────────────┤
│  Observability: AMP │ AMG │ Loki │ Tempo │ Hubble UI       │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
aws-eks/
├── bin/app.ts                 # CDK app entry point
├── config/                    # Environment configurations
│   ├── base.ts               # Shared defaults
│   ├── dev.ts                # Dev overrides (cost-optimized)
│   ├── staging.ts            # Staging overrides
│   └── production.ts         # Production (full security)
├── lib/
│   ├── stacks/               # CDK stacks
│   │   ├── network.ts        # VPC, subnets
│   │   ├── cluster.ts        # EKS cluster, node groups
│   │   └── addons/           # Helm chart deployments
│   │       ├── core.ts       # cert-manager, external-secrets
│   │       ├── networking.ts # Cilium, ALB, DNS, Hubble
│   │       ├── security.ts   # Falco, Trivy, Kyverno
│   │       ├── observability.ts # AMP, AMG, Loki, Tempo
│   │       └── operations.ts # Velero, Karpenter, Goldilocks
│   ├── constructs/           # Reusable L3 constructs
│   └── types/                # TypeScript interfaces
├── test/                     # Jest tests
└── docs/                     # Documentation
```

## Configuration System

All configuration is TypeScript-based with full type safety:

```typescript
// Example: config/dev.ts
import { baseConfig } from './base';
import { deepMerge } from '../lib/utils';

export const devConfig = deepMerge(baseConfig, {
  environment: 'dev',
  network: {
    natGateways: 1,  // Cost optimization
  },
  features: {
    multiAzNat: false,
    hubbleUi: true,
  },
});
```

## Feature Flags

| Flag | Description | Dev | Staging | Prod |
|------|-------------|-----|---------|------|
| `multiAzNat` | Multi-AZ NAT gateways | ❌ | ✅ | ✅ |
| `hubbleUi` | Deploy Hubble UI | ✅ | ✅ | ✅ |
| `falcoKillMode` | Kill suspicious pods | ❌ | ❌ | ✅ |
| `trivyAdmission` | Block unscanned images | ❌ | ✅ | ✅ |

## Helm Charts (16 total)

### Core
- cert-manager, external-secrets, reloader

### Networking
- cilium, hubble, aws-load-balancer-controller, external-dns

### Security
- falco, trivy-operator, kyverno

### Observability
- grafana-agent (for AMP/AMG), loki, tempo, hubble-ui

### Operations
- karpenter, velero, goldilocks, metrics-server, aws-node-termination-handler

## Development Workflow

### Prerequisites
- Node.js 20+
- AWS CLI configured
- kubectl

### Commands
```bash
npm run build          # Compile TypeScript
npm run test           # Run tests
npm run synth          # Synthesize CloudFormation
npm run deploy:dev     # Deploy to dev
npm run deploy:staging # Deploy to staging
npm run deploy:prod    # Deploy to production
```

## Code Conventions

### Stack Naming
- Use descriptive names: `NetworkStack`, `ClusterStack`, `SecurityAddonsStack`
- Nested stacks for isolation

### Construct Patterns
```typescript
// Always use Props interfaces
interface MyConstructProps {
  readonly vpc: ec2.IVpc;
  readonly cluster: eks.ICluster;
  readonly config: ClusterConfig;
}

// Export construct class
export class MyConstruct extends Construct {
  constructor(scope: Construct, id: string, props: MyConstructProps) {
    super(scope, id);
    // Implementation
  }
}
```

### Helm Release Pattern
```typescript
// Use the HelmRelease construct for consistency
new HelmRelease(this, 'CertManager', {
  cluster: props.cluster,
  chart: 'cert-manager',
  repository: 'https://charts.jetstack.io',
  version: props.config.helm.certManager.version,
  namespace: 'cert-manager',
  createNamespace: true,
  values: props.config.helm.certManager.values,
});
```

### IRSA Pattern
```typescript
// Use the IrsaRole construct for Pod Identity
new IrsaRole(this, 'ExternalDnsRole', {
  cluster: props.cluster,
  serviceAccount: 'external-dns',
  namespace: 'external-dns',
  policyStatements: [
    new iam.PolicyStatement({
      actions: ['route53:ChangeResourceRecordSets'],
      resources: ['arn:aws:route53:::hostedzone/*'],
    }),
  ],
});
```

## Operational Rules

### What NOT to Do
- **Never hardcode AWS account IDs** — they come from context/env vars via `getConfig()`
- **Never commit `cdk.context.json`** — it's gitignored and account-specific
- **Never deploy without tests** — use `/validate` or `npm test` first
- **Never modify stack dependency order** in `bin/app.ts` without understanding the full chain
- **Never add Helm values directly in stack code** — all values go through `config/base.ts` → `HelmConfigs`

### Common Pitfalls
- **CDK tokens in Helm values** → use `getHelmChartValues()` from `test/helpers/index.ts`
- **ESLint v9** → all lint commands need `ESLINT_USE_FLAT_CONFIG=false` prefix
- **`strictPropertyInitialization`** → use `!` definite assignment assertion for conditionally-set properties
- **`noUnusedParameters`** → prefix unused params with `_`
- **ts-jest 29 + Jest 30** → coverage thresholds are intentionally disabled
- **Kubernetes manifest assertions** → use `manifestContains()` helper, not `.includes()`

### Preferred Patterns When Making Changes
- **Adding a Helm chart**: type → config → stack → test
- **Adding a construct**: `lib/constructs/` with Props interface → export → test
- **Adding a feature flag**: `FeatureFlags` type → `config/base.ts` → per-env overrides

## Testing

```typescript
// test/stacks/network.test.ts
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../../lib/stacks/network';

describe('NetworkStack', () => {
  test('creates VPC with correct CIDR', () => {
    // Arrange
    const app = new cdk.App();
    const stack = new NetworkStack(app, 'Test', { config: testConfig });

    // Act
    const template = Template.fromStack(stack);

    // Assert
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
    });
  });
});
```

## Multi-Agent Orchestra

This project supports parallel development using 8 Claude agents coordinated via the Orchestra system.

### Agents

| Agent | Role | Focus |
|-------|------|-------|
| ARCH | Architect | Types, config, structure |
| PLAT | Platform | Network, cluster, Karpenter |
| SEC | Security | Falco, Trivy, Kyverno |
| OBS | Observability | AMP, AMG, Loki, Tempo, Hubble |
| NET | Networking | Cilium, ALB, DNS |
| OPS | Operations | Velero, Goldilocks, CI/CD |
| QA | Testing | Unit tests, integration tests |
| DOCS | Documentation | README, runbooks |

### Execution Order (Dependencies)

```
Phase 1: ARCH (foundation) ─────────────────────────────►
              │
Phase 2:     ├─► PLAT ──────────────────────────────────►
              │        │
              ├─► SEC ──┼──────────────────────────────────►
              │        │
              └─► OBS ──┼──────────────────────────────────►
                       │
Phase 3:              ├─► NET ─────────────────────────────►
                       │        │
                       └─► OPS ──┼────────────────────────────►
                                │
Phase 4:                       ├─► QA ───────────────────────►
                                │
                                └─► DOCS ─────────────────────►
```

### Quick Setup

```bash
# 1. Set environment (run from project root)
export ORCH_ROOT=$PWD/.claude/orchestra
export CONFIG_NAME=aws-eks-dev
export SESSION_NAME=sprint-1
export TARGET_REPO=$PWD
export USE_WORKTREES=true

# 2. Initialize (creates worktrees and CLAUDE.md files)
$ORCH_ROOT/scripts/init.sh

# 3. Start zellij session
export ORCH_SESSION_DIR=$HOME/.claude/orchestration/sessions/sprint-1
zellij --layout $ORCH_SESSION_DIR/layout.kdl
```

### Cleanup

```bash
# Remove worktrees
git worktree list | grep $SESSION_NAME | awk '{print $1}' | \
  xargs -I{} git worktree remove {} --force

# Remove session
rm -rf ~/.claude/orchestration/sessions/$SESSION_NAME

# Prune git
git worktree prune
```

### Documentation

- **Full Guide**: `docs/development/orchestra.md`
- **Setup Runbook**: `docs/runbooks/orchestra-setup.md`
- **Config**: `.claude/orchestra/configs/aws-eks-dev.json`

## Quick Reference

### Validation Workflow
```bash
npm run build && npm test && npx cdk synth -c environment=dev
```

### File Ownership

| Area | Files | Owner |
|------|-------|-------|
| Types & config | `lib/types/`, `config/` | ARCH |
| VPC & cluster | `lib/stacks/network.ts`, `cluster.ts` | PLAT |
| Security addons | `lib/stacks/addons/security.ts` | SEC |
| Observability | `lib/stacks/addons/observability.ts` | OBS |
| Networking addons | `lib/stacks/addons/networking.ts` | NET |
| Operations addons | `lib/stacks/addons/operations.ts` | OPS |
| Tests | `test/` | QA |
| Docs | `docs/`, `CLAUDE.md` | DOCS |

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/validate` | Full validation (build + test + synth) |
| `/deploy <env>` | Deploy to environment |
| `/destroy <env>` | Safe destroy with dry-run |
| `/diff [env]` | Show infrastructure changes |
| `/synth [env]` | Synthesize CDK templates |
| `/test [pattern]` | Run tests |
| `/lint [--fix]` | Lint and format |
| `/status [env]` | Stack and cluster status |
| `/docs` | Generate API documentation |
| `/review-pr [base]` | CDK-aware PR review |

## Compliance

### SOC2
- Audit logging via CloudTrail + Kubernetes audit logs
- Falco runtime monitoring
- Access controls via RBAC + AWS SSO

### HIPAA
- Encryption at rest (KMS for EBS, etcd)
- Encryption in transit (mTLS via Cilium)
- Access logging and monitoring

### PCI-DSS
- Network segmentation via Cilium network policies
- Vulnerability scanning via Trivy
- WAF via ALB (optional)
