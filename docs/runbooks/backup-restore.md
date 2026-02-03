# Runbook: Backup and Restore

## Overview

This runbook covers backup and restore procedures using Velero for cluster resources and EBS snapshots.

## Prerequisites

- [ ] Velero installed (`features.veleroBackups: true`)
- [ ] kubectl access to the cluster
- [ ] AWS CLI configured
- [ ] Velero CLI installed (optional, for advanced operations)

## Backup Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    EKS Cluster                          │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │
│  │ Deployments │    │   Secrets   │    │    PVCs    │  │
│  └─────────────┘    └─────────────┘    └────────────┘  │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    Velero     │
                    └───────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │  S3 Bucket    │               │ EBS Snapshots │
    │  (Resources)  │               │  (Volumes)    │
    └───────────────┘               └───────────────┘
```

## Scheduled Backups

### Default Schedule

Velero is configured with a daily backup schedule:

| Schedule | Time (UTC) | Retention | Scope |
|----------|------------|-----------|-------|
| Daily | 03:00 | 30 days | All namespaces |

### Check Backup Schedules

```bash
# List schedules
kubectl get schedules -n velero

# Describe schedule
kubectl describe schedule daily -n velero
```

### Check Backup Status

```bash
# List recent backups
kubectl get backups -n velero --sort-by=.metadata.creationTimestamp

# Get backup details
kubectl describe backup <backup-name> -n velero

# Check backup logs
velero backup logs <backup-name>
```

## Manual Backup

### Procedure: Full Cluster Backup

```bash
# 1. Create backup of all namespaces
velero backup create manual-backup-$(date +%Y%m%d) \
  --include-namespaces '*' \
  --snapshot-volumes=true

# 2. Monitor progress
velero backup describe manual-backup-$(date +%Y%m%d) --details

# 3. Wait for completion
kubectl wait --for=jsonpath='{.status.phase}'=Completed \
  backup/manual-backup-$(date +%Y%m%d) -n velero --timeout=30m
```

### Procedure: Namespace Backup

```bash
# Backup specific namespace
velero backup create ns-backup-<namespace>-$(date +%Y%m%d) \
  --include-namespaces <namespace> \
  --snapshot-volumes=true

# Example: Backup production workloads
velero backup create prod-backup-$(date +%Y%m%d) \
  --include-namespaces production \
  --snapshot-volumes=true
```

### Procedure: Backup by Label

```bash
# Backup resources with specific label
velero backup create labeled-backup-$(date +%Y%m%d) \
  --selector app=critical \
  --snapshot-volumes=true
```

## Restore Procedures

### Procedure: Restore to Same Cluster

**Use Case:** Recover accidentally deleted resources

```bash
# 1. List available backups
velero backup get

# 2. Preview what will be restored
velero restore create --from-backup <backup-name> --dry-run

# 3. Perform restore
velero restore create restore-$(date +%Y%m%d-%H%M) \
  --from-backup <backup-name>

# 4. Monitor progress
velero restore describe restore-$(date +%Y%m%d-%H%M)

# 5. Verify restored resources
kubectl get all -n <namespace>
```

### Procedure: Partial Restore (Specific Namespace)

```bash
# Restore only specific namespace from full backup
velero restore create ns-restore-$(date +%Y%m%d-%H%M) \
  --from-backup <backup-name> \
  --include-namespaces <namespace>
```

### Procedure: Restore Specific Resources

```bash
# Restore only specific resource types
velero restore create selective-restore-$(date +%Y%m%d-%H%M) \
  --from-backup <backup-name> \
  --include-resources deployments,services,configmaps
```

### Procedure: Restore to Different Namespace

```bash
# Restore to a different namespace (for testing)
velero restore create test-restore-$(date +%Y%m%d-%H%M) \
  --from-backup <backup-name> \
  --include-namespaces production \
  --namespace-mappings production:production-restore
```

## Disaster Recovery

### Procedure: Restore to New Cluster

**Use Case:** Complete cluster recreation after disaster

**Prerequisites:**
- New EKS cluster deployed with same configuration
- Velero installed with access to same S3 bucket

```bash
# 1. On new cluster, verify Velero can see backups
velero backup get

# 2. Restore cluster-scoped resources first
velero restore create dr-cluster-$(date +%Y%m%d) \
  --from-backup <backup-name> \
  --include-cluster-resources=true \
  --exclude-namespaces '*'

# 3. Restore namespace resources
velero restore create dr-namespaces-$(date +%Y%m%d) \
  --from-backup <backup-name> \
  --include-namespaces '*' \
  --exclude-namespaces kube-system,velero,monitoring

# 4. Verify restoration
kubectl get all -A
kubectl get pvc -A
```

### Procedure: Cross-Region Restore

**Prerequisites:**
- S3 bucket replicated to target region OR
- Copy backup to target region bucket

```bash
# 1. Copy S3 backup data to target region
aws s3 sync s3://<source-bucket> s3://<target-bucket> --source-region <source> --region <target>

# 2. Update Velero BSL to point to new bucket (or create new BSL)
velero backup-location create dr-location \
  --provider aws \
  --bucket <target-bucket> \
  --config region=<target-region>

# 3. Restore using the new location
velero restore create cross-region-restore \
  --from-backup <backup-name> \
  --backup-location dr-location
```

## Verification

### Verify Backup Integrity

```bash
# 1. Check backup status
velero backup describe <backup-name> --details

# 2. Verify backup contents
velero backup contents <backup-name>

# 3. Check for errors/warnings
velero backup logs <backup-name> | grep -i "error\|warning"
```

### Verify Restore Success

```bash
# 1. Check restore status
velero restore describe <restore-name>

# 2. Check for partial failures
velero restore logs <restore-name> | grep -i "error\|warning"

# 3. Verify workloads running
kubectl get pods -A | grep -v Running | grep -v Completed

# 4. Verify PVCs bound
kubectl get pvc -A
```

## Troubleshooting

### Backup Failing

```bash
# Check Velero logs
kubectl logs -n velero -l app.kubernetes.io/name=velero --tail=100

# Check backup logs
velero backup logs <backup-name>

# Common issues:
# - IRSA permissions (check S3 access)
# - Volume snapshot issues (check EBS CSI driver)
# - Resource timeout (increase --ttl)
```

### Restore Failing

```bash
# Check restore logs
velero restore logs <restore-name>

# Common issues:
# - Namespace already exists (delete first or use --existing-resource-policy=update)
# - PVC already exists
# - RBAC conflicts
```

### S3 Access Issues

```bash
# Verify IRSA configuration
kubectl get sa velero -n velero -o yaml | grep eks.amazonaws.com

# Test S3 access
kubectl exec -it -n velero deploy/velero -- aws s3 ls s3://<bucket-name>
```

### Volume Snapshot Issues

```bash
# Check VolumeSnapshotContents
kubectl get volumesnapshotcontents

# Check EBS snapshots in AWS
aws ec2 describe-snapshots --owner-ids self --filters "Name=tag:velero.io/backup,Values=*"
```

## Retention Management

### View Backup Retention

```bash
# Check backup TTL
kubectl get backups -n velero -o custom-columns=NAME:.metadata.name,TTL:.spec.ttl,EXPIRES:.status.expiration
```

### Manually Delete Old Backups

```bash
# Delete specific backup
velero backup delete <backup-name>

# Delete backups older than date
velero backup delete --confirm --selector 'velero.io/schedule-name=daily' --older-than 60d
```

### Update Retention Policy

Modify the schedule in the Helm values or CDK configuration:

```typescript
schedules: {
  daily: {
    schedule: '0 3 * * *',
    template: {
      ttl: `${config.backup.dailyRetentionDays * 24}h0m0s`,
    },
  },
}
```

## S3 Bucket Management

### Check Bucket Contents

```bash
# List backups in S3
aws s3 ls s3://<bucket-name>/backups/

# Check bucket size
aws s3 ls s3://<bucket-name> --recursive --summarize
```

### Bucket Lifecycle

The Velero S3 bucket has lifecycle rules configured:
- Objects expire after `weeklyRetentionDays` (default: 90 days)

## Best Practices

1. **Test restores regularly** - Don't wait for disaster to verify backups work
2. **Use labels** - Label critical resources for selective backup/restore
3. **Exclude unnecessary resources** - Don't backup node-specific or temporary resources
4. **Document RPO/RTO** - Define recovery point and recovery time objectives
5. **Monitor backup jobs** - Set up alerts for backup failures
6. **Encrypt sensitive data** - S3 bucket encryption is enabled by default

## Related

- [Incident Response Runbook](./incident-response.md)
- [Deployment Runbook](./deployment.md)
- [Architecture Overview](../architecture/overview.md)
