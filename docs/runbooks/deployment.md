# Runbook: Deployment

## Overview

This runbook covers procedures for deploying the EKS infrastructure to different environments.

## Prerequisites

- [ ] AWS CLI configured with appropriate credentials
- [ ] Node.js 20+ installed
- [ ] AWS CDK CLI installed (`npm install -g aws-cdk`)
- [ ] kubectl installed
- [ ] Sufficient IAM permissions for deployment

## Environment Configuration

### Available Environments

| Environment | Config File | Purpose |
|-------------|-------------|---------|
| dev | `config/dev.ts` | Development, cost-optimized |
| staging | `config/staging.ts` | Pre-production testing |
| production | `config/production.ts` | Production workloads |

### Pre-Deployment Checklist

- [ ] Verify AWS account and region in config
- [ ] Confirm VPC CIDR doesn't conflict with existing networks
- [ ] Ensure Route53 hosted zone exists (if using External DNS)
- [ ] Verify S3 bucket names are globally unique

## Procedure

### Step 1: Install Dependencies

```bash
cd /path/to/aws-eks
npm install
```

### Step 2: Build the Project

```bash
npm run build
```

Verify no TypeScript compilation errors.

### Step 3: Bootstrap CDK (First Time Only)

If this is the first CDK deployment to the account/region:

```bash
# Bootstrap the target account/region
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

### Step 4: Synthesize CloudFormation Templates

```bash
# For dev environment
npm run synth:dev

# For staging
npm run synth:staging

# For production
npm run synth:prod
```

Review the generated templates in `cdk.out/`.

### Step 5: Review Changes (Diff)

```bash
# Compare with existing infrastructure
npm run diff:dev
```

Review all changes before proceeding. Pay attention to:
- Resources being replaced (potential downtime)
- Security group changes
- IAM policy modifications

### Step 6: Deploy Infrastructure

```bash
# Deploy to dev
npm run deploy:dev

# Deploy to staging
npm run deploy:staging

# Deploy to production (requires approval)
npm run deploy:prod
```

**For production deployments:**
- Ensure change management approval is obtained
- Schedule during maintenance window if possible
- Have rollback plan ready

### Step 7: Configure kubectl Access

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --name <environment>-eks \
  --region <region>

# Verify access
kubectl get nodes
kubectl get pods -A
```

### Step 8: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -A | grep -v Running | grep -v Completed

# Verify system components
kubectl get pods -n kube-system
kubectl get pods -n monitoring
kubectl get pods -n falco-system
kubectl get pods -n kyverno

# Check Karpenter
kubectl get nodepools
kubectl get ec2nodeclasses

# Verify Cilium
cilium status
```

## Stack Deployment Order

Stacks are deployed in dependency order:

```
1. NetworkStack
   └── 2. ClusterStack
       ├── 3. CoreAddonsStack
       │   ├── 4. NetworkingAddonsStack
       │   ├── 5. SecurityAddonsStack
       │   ├── 6. ObservabilityAddonsStack
       │   └── 7. OperationsAddonsStack
```

CDK handles this automatically, but for manual stack deployments:

```bash
# Deploy specific stack
cdk deploy dev-network
cdk deploy dev-cluster
cdk deploy dev-addons-core
# ... etc
```

## Deploying Updates

### Minor Updates (Configuration Changes)

```bash
# 1. Make configuration changes
# 2. Build and diff
npm run build
npm run diff:dev

# 3. Deploy
npm run deploy:dev
```

### Helm Chart Updates

```bash
# 1. Update version in config/base.ts
helmVersions: {
  cilium: '1.17.2',  # Updated version
  ...
}

# 2. Build and deploy
npm run build
npm run deploy:dev
```

### Kubernetes Version Upgrade

See [Upgrades Runbook](./upgrades.md) for detailed procedure.

## Verification

### Check Cluster Health

```bash
# Node status
kubectl get nodes -o wide

# All pods running
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded

# Events (look for errors)
kubectl get events -A --sort-by='.lastTimestamp' | tail -20
```

### Check Networking

```bash
# Cilium status
kubectl -n kube-system exec -it ds/cilium -- cilium status

# Hubble status (if enabled)
kubectl -n kube-system exec -it ds/cilium -- hubble status

# Test DNS
kubectl run test-dns --image=busybox:1.28 --rm -it --restart=Never -- nslookup kubernetes
```

### Check Security Components

```bash
# Falco
kubectl logs -n falco-system -l app.kubernetes.io/name=falco --tail=20

# Kyverno
kubectl get clusterpolicies
kubectl get policyreports -A

# Trivy
kubectl get vulnerabilityreports -A
```

### Check Observability

```bash
# Loki
kubectl logs -n monitoring -l app.kubernetes.io/name=loki --tail=10

# Grafana Agent
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana-agent --tail=10

# Verify AMP connectivity
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana-agent | grep -i "remote_write"
```

## Rollback

### Rollback CDK Deployment

CDK doesn't have built-in rollback. Options:

1. **Redeploy previous version:**
   ```bash
   git checkout <previous-commit>
   npm install
   npm run build
   npm run deploy:dev
   ```

2. **Use CloudFormation rollback:**
   ```bash
   # In AWS Console or CLI
   aws cloudformation cancel-update-stack --stack-name <stack-name>
   ```

### Rollback Helm Release

```bash
# List release history
helm history <release-name> -n <namespace>

# Rollback to previous revision
helm rollback <release-name> <revision> -n <namespace>
```

## Troubleshooting

### Deployment Stuck

```bash
# Check CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name <stack-name> \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`]'
```

### Pod Not Starting

```bash
# Describe pod for events
kubectl describe pod <pod-name> -n <namespace>

# Check logs
kubectl logs <pod-name> -n <namespace> --previous
```

### IRSA Not Working

```bash
# Verify service account annotation
kubectl get sa <sa-name> -n <namespace> -o yaml | grep eks.amazonaws.com

# Check OIDC provider
aws eks describe-cluster --name <cluster-name> --query 'cluster.identity.oidc'
```

## Related

- [Troubleshooting Runbook](./troubleshooting.md)
- [Upgrades Runbook](./upgrades.md)
- [Architecture Overview](../architecture/overview.md)
