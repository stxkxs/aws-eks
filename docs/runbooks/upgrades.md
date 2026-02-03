# Runbook: Upgrades

## Overview

This runbook covers procedures for upgrading the EKS cluster, Kubernetes version, and add-on components.

## Prerequisites

- [ ] kubectl access with admin permissions
- [ ] AWS CLI configured
- [ ] Current cluster backup (see [Backup and Restore](./backup-restore.md))
- [ ] Change management approval (for production)
- [ ] Maintenance window scheduled

## Upgrade Types

| Type | Frequency | Downtime | Risk |
|------|-----------|----------|------|
| Helm Chart Updates | Monthly | None | Low |
| EKS Add-on Updates | Quarterly | None | Low |
| Kubernetes Minor Version | Quarterly | Brief | Medium |
| Kubernetes Major Version | Yearly | Brief | High |

## Pre-Upgrade Checklist

- [ ] Review release notes for target versions
- [ ] Check compatibility matrix
- [ ] Backup cluster (Velero)
- [ ] Test upgrade in dev/staging first
- [ ] Document rollback procedure
- [ ] Notify stakeholders
- [ ] Schedule maintenance window (production)

## Helm Chart Upgrades

### Procedure: Update Chart Versions

```bash
# 1. Update versions in config/base.ts
vi config/base.ts

# Example change in helmConfigs section:
helmConfigs: {
  cilium: { version: '1.18.7', ... },   # Updated from 1.18.6
  kyverno: { version: '3.5.1', ... },   # Updated from 3.5.0
  ...
}

# 2. Build and diff
npm run build
npm run diff:dev

# 3. Review changes carefully
# Look for:
# - CRD changes
# - Breaking configuration changes
# - New required values

# 4. Deploy to dev first
npm run deploy:dev

# 5. Verify
kubectl get pods -A | grep -v Running | grep -v Completed
```

### Procedure: Update Single Chart

```bash
# For urgent security updates, update single chart
# 1. Find the Helm release
helm list -A

# 2. Update directly (if needed before CDK deployment)
helm upgrade <release-name> <chart> \
  --namespace <namespace> \
  --version <new-version> \
  --reuse-values

# 3. Update CDK config to match for consistency
```

## EKS Add-on Upgrades

### Check Available Updates

```bash
# List current add-on versions
aws eks describe-addon-versions --kubernetes-version 1.35 --addon-name vpc-cni
aws eks describe-addon-versions --kubernetes-version 1.35 --addon-name coredns
aws eks describe-addon-versions --kubernetes-version 1.35 --addon-name kube-proxy

# Check current installed versions
aws eks list-addons --cluster-name <cluster-name>
aws eks describe-addon --cluster-name <cluster-name> --addon-name vpc-cni
```

### Procedure: Update EKS Add-on

```bash
# Update via AWS CLI
aws eks update-addon \
  --cluster-name <cluster-name> \
  --addon-name <addon-name> \
  --addon-version <version> \
  --resolve-conflicts PRESERVE

# Monitor update
aws eks describe-addon \
  --cluster-name <cluster-name> \
  --addon-name <addon-name> \
  --query 'addon.status'
```

## Kubernetes Version Upgrade

### Version Upgrade Path

EKS supports upgrading one minor version at a time:
- 1.33 → 1.34 → 1.35 ✓
- 1.33 → 1.35 ✗ (not supported)

### Pre-Upgrade Checks

```bash
# 1. Check current version
kubectl version --short

# 2. Check API deprecations
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis

# 3. Check for deprecated API usage
# Install pluto: https://github.com/FairwindsOps/pluto
pluto detect-all-in-cluster

# 4. Check node compatibility
kubectl get nodes -o wide
```

### Procedure: Upgrade Kubernetes Version

**Phase 1: Update Control Plane**

```bash
# 1. Update config to new version
vi config/base.ts
# Change: cluster.version: '1.36'

# 2. Build and diff
npm run build
npm run diff:dev

# 3. Deploy control plane update
npm run deploy:dev

# Note: Control plane upgrade takes 15-30 minutes
# Monitor in AWS Console or:
aws eks describe-update \
  --name <cluster-name> \
  --update-id <update-id>
```

**Phase 2: Update Managed Node Group**

```bash
# CDK will handle node group update
# Nodes are replaced using rolling update

# Monitor node replacement
watch kubectl get nodes

# Verify all nodes on new version
kubectl get nodes -o wide
```

**Phase 3: Update Karpenter Nodes**

```bash
# 1. Update EC2NodeClass AMI selector (if needed)
kubectl edit ec2nodeclass default
# Ensure amiSelectorTerms matches new version

# 2. Drain old nodes (optional - Karpenter will handle via drift)
kubectl drain <old-node> --ignore-daemonsets --delete-emptydir-data

# Or force Karpenter to replace:
kubectl delete node <old-node>

# 3. Verify new nodes
kubectl get nodes --show-labels | grep karpenter
```

**Phase 4: Update Add-ons**

After control plane upgrade, update EKS-managed add-ons to compatible versions:

```bash
# Update each add-on
for addon in vpc-cni coredns kube-proxy; do
  aws eks update-addon \
    --cluster-name <cluster-name> \
    --addon-name $addon \
    --resolve-conflicts PRESERVE
done
```

### Post-Upgrade Verification

```bash
# 1. Check cluster version
kubectl version

# 2. Check all nodes
kubectl get nodes

# 3. Check all pods
kubectl get pods -A | grep -v Running | grep -v Completed

# 4. Check core components
kubectl get pods -n kube-system

# 5. Run smoke tests
# - Deploy test pod
# - Test DNS
# - Test networking
# - Test storage
```

## Cilium Upgrades

### Special Considerations

Cilium upgrades require careful planning due to CNI criticality.

### Procedure: Upgrade Cilium

```bash
# 1. Check current version
cilium version

# 2. Review upgrade notes
# https://docs.cilium.io/en/stable/operations/upgrade/

# 3. Pre-flight check
cilium connectivity test

# 4. Update version in config
vi config/base.ts
# helmConfigs.cilium.version: '1.18.7'

# 5. Deploy update
npm run deploy:dev

# 6. Monitor rollout
kubectl rollout status daemonset/cilium -n kube-system

# 7. Verify connectivity
cilium connectivity test
```

## Karpenter Upgrades

### Special Considerations

Karpenter upgrades may change node provisioning behavior.

### Procedure: Upgrade Karpenter

```bash
# 1. Check current version
kubectl get deployment karpenter -n kube-system -o jsonpath='{.spec.template.spec.containers[0].image}'

# 2. Review release notes
# https://github.com/aws/karpenter-provider-aws/releases

# 3. Update version
vi config/base.ts
# helmConfigs.karpenter.version: '1.8.7'

# 4. Check for CRD changes
# May need to update NodePool/EC2NodeClass specs

# 5. Deploy
npm run deploy:dev

# 6. Verify provisioning works
kubectl scale deployment test-app --replicas=10
kubectl get nodes -w
```

## Rollback Procedures

### Rollback Helm Release

```bash
# List revision history
helm history <release-name> -n <namespace>

# Rollback to previous version
helm rollback <release-name> <revision> -n <namespace>
```

### Rollback CDK Deployment

```bash
# Redeploy previous version
git checkout <previous-commit>
npm install
npm run build
npm run deploy:dev
```

### Rollback Kubernetes Version

**Warning:** Kubernetes version rollback is NOT supported by EKS. Always test in lower environments first.

If rollback is critical:
1. Restore from Velero backup to new cluster running older version
2. Update DNS/load balancers to point to new cluster

## Upgrade Schedule Template

| Component | Current | Target | Date | Owner | Status |
|-----------|---------|--------|------|-------|--------|
| EKS | 1.34 | 1.35 | TBD | | Planned |
| Cilium | 1.18.5 | 1.18.6 | TBD | | Planned |
| Karpenter | 1.8.5 | 1.8.6 | TBD | | Planned |

## Monitoring During Upgrades

### Key Metrics to Watch

```bash
# Node status
watch kubectl get nodes

# Pod health
watch "kubectl get pods -A | grep -v Running | grep -v Completed | head -20"

# Events
kubectl get events -A --sort-by='.lastTimestamp' -w

# Karpenter provisioning
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter -f
```

### Alerts to Monitor

- Node NotReady
- Pod CrashLoopBackOff
- API server latency
- etcd latency

## Compatibility Matrix

### Kubernetes Version Compatibility

| EKS Version | Cilium | Karpenter | Velero | Kyverno |
|-------------|--------|-----------|--------|---------|
| 1.35 | 1.18+ | 1.5+ | 1.15+ | 1.13+ |
| 1.34 | 1.17+ | 1.3+ | 1.14+ | 1.12+ |
| 1.33 | 1.16+ | 1.0+ | 1.13+ | 1.11+ |

### Always Check

- Helm chart release notes
- AWS EKS release notes
- Add-on compatibility documentation

## Related

- [Deployment Runbook](./deployment.md)
- [Backup and Restore Runbook](./backup-restore.md)
- [Troubleshooting Runbook](./troubleshooting.md)
