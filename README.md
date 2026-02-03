# AWS EKS Infrastructure

Production-grade, environment-based EKS deployment using AWS CDK v2 (TypeScript).

## Features

- **Environment-based configuration** - dev, staging, production with cost optimization
- **Complete observability** - AMP, AMG, Loki, Tempo, Hubble UI
- **Security-first** - Falco, Trivy, Kyverno, Cilium mTLS
- **Compliance ready** - SOC2, HIPAA, PCI-DSS
- **Cost optimized** - Karpenter with Spot instances, configurable feature flags

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
│  Security: Falco │ Trivy │ Kyverno │ mTLS                   │
├─────────────────────────────────────────────────────────────┤
│  Observability: AMP │ AMG │ Loki │ Tempo │ Hubble UI        │
└─────────────────────────────────────────────────────────────┘
```

## Companion Repository

This repository contains the CDK infrastructure code. The GitOps configurations for ArgoCD-managed addons are in a separate repository:

- **aws-eks-gitops** — Kustomize overlays, Helm value overrides, Kyverno policies, and ArgoCD ApplicationSets (set `GITOPS_REPO_URL` to your repo)

After deploying the CDK infrastructure, ArgoCD automatically syncs addon configurations from the GitOps repository.

## Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS CDK CLI (`npm install -g aws-cdk`)

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Synthesize CloudFormation (dev environment)
npm run synth:dev

# Deploy to dev
npm run deploy:dev
```

## Configuration

Edit the environment configs in `config/`:

| File | Description |
|------|-------------|
| `base.ts` | Shared defaults |
| `dev.ts` | Development (cost-optimized) |
| `staging.ts` | Staging (production-like) |
| `production.ts` | Production (full security) |

### Key Configuration Options

```typescript
// config/dev.ts
const devOverrides = {
  features: {
    multiAzNat: false,      // Cost optimization
    falcoKillMode: false,   // Alert only
    trivyAdmission: false,  // Don't block
  },
  network: {
    natGateways: 1,         // Single NAT
  },
};
```

## Stacks

| Stack | Description |
|-------|-------------|
| `{env}-network` | VPC, subnets, NAT gateways |
| `{env}-cluster` | EKS cluster, managed node group |
| `{env}-bootstrap` | cert-manager, external-secrets, ALB controller, External DNS, metrics-server, reloader |
| `{env}-karpenter` | Karpenter controller, SQS interruption queue, node IAM role |
| `{env}-argocd` | ArgoCD GitOps controller, App-of-Apps pattern |

## Helm Charts (16 total)

### Core
- cert-manager, external-secrets, reloader, metrics-server

### Networking
- cilium, hubble, aws-load-balancer-controller, external-dns

### Security
- falco, trivy-operator, kyverno

### Observability
- grafana-agent, loki, tempo

### Operations
- karpenter, velero, goldilocks, aws-node-termination-handler

## Multi-Agent Development

This project supports parallel development using 8 Claude agents via the orchestra system.

### Initialize a Session

```bash
# Make the orch CLI executable
chmod +x .claude/orchestra/scripts/orch

# Initialize a new session
.claude/orchestra/scripts/orch init aws-eks-dev sprint-1 --worktrees

# Start the session in Zellij
.claude/orchestra/scripts/orch start sprint-1
```

### Agent Roles

| Agent | Role | Focus |
|-------|------|-------|
| ARCH | Architect | Types, config, structure |
| PLAT | Platform | Network, cluster, Karpenter |
| SEC | Security | Falco, Trivy, Kyverno |
| OBS | Observability | AMP, AMG, Loki, Tempo |
| NET | Networking | Cilium, ALB, DNS |
| OPS | Operations | Velero, Goldilocks, CI/CD |
| QA | Testing | Unit tests, integration tests |
| DOCS | Documentation | README, runbooks |

See `.claude/orchestra/` for details.

## Commands

```bash
npm run build          # Compile TypeScript
npm run test           # Run tests
npm run synth:dev      # Synthesize dev CloudFormation
npm run diff:dev       # Show changes for dev
npm run deploy:dev     # Deploy to dev
npm run destroy:dev    # Destroy dev environment
```

## Validation Commands

### Pre-Deployment Validation

```bash
# Compile and type-check
npm run build

# Run all tests
npm run test

# Synthesize and validate CloudFormation templates
npm run synth:dev

# Check for security issues in generated templates
npm run synth:dev && cdk acknowledge
```

### Post-Deployment Validation

```bash
# Update kubeconfig
aws eks update-kubeconfig --name <env>-eks --region <region>

# Verify cluster access
kubectl get nodes

# Check all pods are healthy
kubectl get pods -A | grep -v Running | grep -v Completed

# Verify Cilium networking
kubectl -n kube-system exec -it ds/cilium -- cilium status

# Check security components
kubectl get pods -n falco-system
kubectl get pods -n kyverno
kubectl get clusterpolicies

# Verify observability
kubectl get pods -n monitoring
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana-agent --tail=5

# Check Karpenter
kubectl get nodepools
kubectl get ec2nodeclasses
```

### Health Check Script

```bash
#!/bin/bash
# Quick cluster health check
echo "=== Nodes ===" && kubectl get nodes
echo "=== Unhealthy Pods ===" && kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded | head -10
echo "=== Recent Events ===" && kubectl get events -A --field-selector type=Warning --sort-by='.lastTimestamp' | tail -5
```

## Documentation

- [Architecture Overview](./docs/architecture/overview.md)
- [Network Topology](./docs/architecture/network-topology.md)
- [Security Architecture](./docs/architecture/security.md)
- [Deployment Runbook](./docs/runbooks/deployment.md)
- [Troubleshooting FAQ](./docs/runbooks/troubleshooting-faq.md)
- [Configuration Reference](./docs/configuration/environments.md)
- [Architecture Decisions](./docs/architecture/decisions/)
- [Glossary](./docs/glossary.md)

## License

MIT
