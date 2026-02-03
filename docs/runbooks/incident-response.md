# Runbook: Incident Response

## Overview

This runbook provides procedures for responding to security incidents and operational emergencies in the EKS cluster.

## Prerequisites

- [ ] kubectl access with admin permissions
- [ ] AWS CLI with appropriate credentials
- [ ] Access to monitoring dashboards (Grafana)
- [ ] Contact list for escalation

## Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| SEV1 | Critical | Immediate | Cluster down, data breach, complete outage |
| SEV2 | High | < 1 hour | Partial outage, security alert, data loss risk |
| SEV3 | Medium | < 4 hours | Degraded performance, non-critical component failure |
| SEV4 | Low | < 24 hours | Minor issues, warnings, maintenance needed |

## Incident Response Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Detect    │────►│   Assess    │────►│   Contain   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
┌─────────────┐     ┌─────────────┐           │
│  Post-      │◄────│  Recover    │◄──────────┘
│  Mortem     │     └─────────────┘
└─────────────┘
```

## Security Incidents

### 1. Falco Critical Alert

**Trigger:** Falco detects suspicious activity (container escape, shell spawn, etc.)

**Immediate Actions:**

```bash
# 1. Check Falco alerts
kubectl logs -n falco-system -l app.kubernetes.io/name=falco --tail=100 | grep -i critical

# 2. Identify affected pod
# Look for pod name in Falco output

# 3. If kill mode NOT enabled, manually isolate
kubectl cordon <node-name>
kubectl delete pod <pod-name> -n <namespace>

# 4. Check if Talon already responded (if kill mode enabled)
kubectl logs -n falco-talon -l app.kubernetes.io/name=falco-talon --tail=50
```

**Investigation:**

```bash
# Get pod details before deletion (if still running)
kubectl get pod <pod-name> -n <namespace> -o yaml > pod-evidence.yaml

# Check recent events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'

# Check network flows (Hubble)
kubectl -n kube-system exec -it ds/cilium -- hubble observe \
  --namespace <namespace> \
  --pod <pod-name> \
  --last 100

# Export Falco logs
kubectl logs -n falco-system -l app.kubernetes.io/name=falco > falco-logs.txt
```

**Containment:**

```bash
# 1. Isolate the namespace with network policy
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: emergency-isolate
  namespace: <affected-namespace>
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
EOF

# 2. Scale down affected deployment
kubectl scale deployment <deployment-name> -n <namespace> --replicas=0

# 3. If node compromised, drain and isolate
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
aws ec2 stop-instances --instance-ids <instance-id>
```

### 2. Vulnerability Detected (Trivy)

**Trigger:** Critical vulnerability found in running container

**Immediate Actions:**

```bash
# 1. Check vulnerability reports
kubectl get vulnerabilityreports -A -o wide

# 2. Get details on critical vulnerabilities
kubectl get vulnerabilityreports -A -o json | \
  jq '.items[] | select(.report.summary.criticalCount > 0) |
      {namespace: .metadata.namespace, name: .metadata.name, critical: .report.summary.criticalCount}'

# 3. Identify affected images
kubectl get vulnerabilityreports <report-name> -n <namespace> -o yaml
```

**Response:**

```bash
# 1. If exploitable and in production, scale down
kubectl scale deployment <deployment> -n <namespace> --replicas=0

# 2. Update image to patched version
kubectl set image deployment/<deployment> <container>=<new-image>:<patched-tag> -n <namespace>

# 3. Force rescan
kubectl delete vulnerabilityreport <report-name> -n <namespace>
```

### 3. Unauthorized Access Attempt

**Trigger:** Suspicious API server access, failed auth attempts

**Investigation:**

```bash
# 1. Check audit logs (if enabled)
# In CloudWatch Logs or via kubectl

# 2. Check recent RBAC events
kubectl get events -A | grep -i "forbidden\|unauthorized"

# 3. List recent cluster role bindings
kubectl get clusterrolebindings -o wide

# 4. Check service accounts
kubectl get serviceaccounts -A
```

**Response:**

```bash
# 1. Revoke suspicious tokens
kubectl delete secret <service-account-token-secret> -n <namespace>

# 2. Rotate cluster credentials (if master compromise suspected)
aws eks update-cluster-config --name <cluster-name> \
  --resources-vpc-config endpointPublicAccess=false

# 3. Review and restrict RBAC
kubectl auth can-i --list --as=system:serviceaccount:<namespace>:<sa-name>
```

## Operational Incidents

### 4. Cluster Unresponsive

**Symptoms:** kubectl commands timeout, pods not scheduling

**Diagnosis:**

```bash
# 1. Check API server from AWS Console
aws eks describe-cluster --name <cluster-name>

# 2. Check node status (if reachable)
kubectl get nodes

# 3. Check CloudWatch metrics for control plane
# - API server latency
# - etcd metrics
```

**Response:**

```bash
# 1. If API server overloaded, check for API abuse
kubectl get --raw /metrics | grep apiserver_request

# 2. Check for stuck finalizers
kubectl get namespaces | grep Terminating
kubectl api-resources --verbs=list -o name | xargs -n1 kubectl get -A -o name 2>/dev/null | wc -l

# 3. Contact AWS Support for control plane issues
```

### 5. Node Failure

**Symptoms:** Node NotReady, pods evicted

**Immediate Actions:**

```bash
# 1. Check node status
kubectl get nodes
kubectl describe node <node-name>

# 2. Check EC2 instance status
aws ec2 describe-instance-status --instance-ids <instance-id>

# 3. For system nodes, verify critical pods moved
kubectl get pods -n kube-system -o wide
```

**Response:**

```bash
# 1. If Karpenter node, let Karpenter handle replacement
kubectl get nodes -l karpenter.sh/nodepool

# 2. If system node, check managed node group
aws eks describe-nodegroup --cluster-name <cluster> --nodegroup-name <nodegroup>

# 3. Force node replacement if stuck
kubectl delete node <node-name>
# For managed node group, AWS will provision replacement
```

### 6. Storage Issues

**Symptoms:** PVCs pending, pods can't mount volumes

**Diagnosis:**

```bash
# 1. Check PVC status
kubectl get pvc -A

# 2. Check PV status
kubectl get pv

# 3. Check storage class
kubectl get storageclass

# 4. Check EBS CSI driver
kubectl get pods -n kube-system -l app=ebs-csi-controller
```

**Response:**

```bash
# 1. For stuck PVCs, check events
kubectl describe pvc <pvc-name> -n <namespace>

# 2. Check if AZ mismatch
kubectl get pv <pv-name> -o yaml | grep -i zone

# 3. Force volume detach (if stuck)
aws ec2 detach-volume --volume-id <vol-id> --force
```

## Evidence Collection

### Before Taking Action

Always collect evidence before destructive actions:

```bash
#!/bin/bash
# Evidence collection script
INCIDENT_ID=$(date +%Y%m%d-%H%M%S)
mkdir -p /tmp/incident-$INCIDENT_ID

# Cluster state
kubectl get all -A > /tmp/incident-$INCIDENT_ID/all-resources.txt
kubectl get events -A --sort-by='.lastTimestamp' > /tmp/incident-$INCIDENT_ID/events.txt
kubectl get nodes -o yaml > /tmp/incident-$INCIDENT_ID/nodes.yaml

# Affected namespace
kubectl get all -n <namespace> -o yaml > /tmp/incident-$INCIDENT_ID/namespace-resources.yaml

# Logs
kubectl logs -n falco-system -l app.kubernetes.io/name=falco > /tmp/incident-$INCIDENT_ID/falco.log

# Network flows
kubectl -n kube-system exec -it ds/cilium -- hubble observe --last 1000 -o json \
  > /tmp/incident-$INCIDENT_ID/hubble-flows.json

# Compress
tar -czvf incident-$INCIDENT_ID.tar.gz /tmp/incident-$INCIDENT_ID/
```

## Communication Template

### Internal Notification

```
Subject: [SEV<X>] <Brief Description>

Incident ID: INC-<YYYYMMDD-HHMMSS>
Severity: SEV<X>
Status: Investigating / Contained / Resolved

Summary:
<Brief description of the incident>

Impact:
<What services/users are affected>

Current Actions:
- <Action 1>
- <Action 2>

Next Update: <Time>
Incident Commander: <Name>
```

## Post-Incident

### Checklist

- [ ] Incident fully resolved
- [ ] All affected services restored
- [ ] Evidence preserved
- [ ] Temporary mitigations removed (if appropriate)
- [ ] Post-mortem scheduled
- [ ] Timeline documented

### Post-Mortem Template

```markdown
# Incident Post-Mortem: <Title>

## Summary
Brief description of what happened.

## Timeline
- HH:MM - Alert triggered
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Incident resolved

## Root Cause
Detailed explanation of what caused the incident.

## Impact
- Duration: X hours
- Users affected: X
- Services affected: X

## What Went Well
- Item 1
- Item 2

## What Could Be Improved
- Item 1
- Item 2

## Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| Action 1 | Name | Date |
| Action 2 | Name | Date |
```

## Related

- [Troubleshooting Runbook](./troubleshooting.md)
- [Backup and Restore Runbook](./backup-restore.md)
- [Security Architecture](../architecture/security.md)
