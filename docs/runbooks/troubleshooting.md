# Runbook: Troubleshooting

## Overview

This runbook provides troubleshooting procedures for common issues with the EKS infrastructure.

## Prerequisites

- [ ] kubectl access to the cluster
- [ ] AWS CLI configured
- [ ] Appropriate RBAC permissions

## Quick Diagnostics

### Cluster Health Check

```bash
#!/bin/bash
# Quick health check script

echo "=== Node Status ==="
kubectl get nodes

echo -e "\n=== Unhealthy Pods ==="
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded

echo -e "\n=== Recent Events ==="
kubectl get events -A --sort-by='.lastTimestamp' | tail -10

echo -e "\n=== Resource Usage ==="
kubectl top nodes
```

## Common Issues

### 1. Pods Pending - No Nodes Available

**Symptoms:**
- Pods stuck in `Pending` state
- Events show "no nodes available to schedule pods"

**Diagnosis:**

```bash
# Check pending pods
kubectl get pods -A --field-selector=status.phase=Pending

# Check pod events
kubectl describe pod <pod-name> -n <namespace>

# Check Karpenter logs
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter --tail=50

# Check node pools
kubectl get nodepools
kubectl describe nodepool default
```

**Resolution:**

1. **Karpenter not provisioning:**
   ```bash
   # Check Karpenter controller
   kubectl get pods -n kube-system -l app.kubernetes.io/name=karpenter

   # Check EC2NodeClass
   kubectl get ec2nodeclasses
   kubectl describe ec2nodeclass default

   # Verify subnet tags
   aws ec2 describe-subnets --filters "Name=tag:karpenter.sh/discovery,Values=<cluster-name>"
   ```

2. **Resource limits reached:**
   ```bash
   # Check node pool limits
   kubectl get nodepool default -o yaml | grep -A5 limits

   # Check current usage
   kubectl get nodes --show-labels | grep karpenter
   ```

3. **Instance type unavailable:**
   ```bash
   # Check Karpenter logs for capacity errors
   kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter | grep -i "insufficient capacity"
   ```

### 2. Pods CrashLoopBackOff

**Symptoms:**
- Pods repeatedly crashing
- Status shows `CrashLoopBackOff`

**Diagnosis:**

```bash
# Check pod status
kubectl get pod <pod-name> -n <namespace>

# Check logs (current)
kubectl logs <pod-name> -n <namespace>

# Check logs (previous crash)
kubectl logs <pod-name> -n <namespace> --previous

# Check events
kubectl describe pod <pod-name> -n <namespace>
```

**Resolution:**

1. **Application error:** Fix application code/configuration
2. **Missing config/secrets:**
   ```bash
   kubectl get configmap -n <namespace>
   kubectl get secrets -n <namespace>
   ```
3. **Resource constraints:**
   ```bash
   # Check if OOMKilled
   kubectl describe pod <pod-name> -n <namespace> | grep -i oom

   # Increase limits in deployment
   ```

### 3. DNS Resolution Failing

**Symptoms:**
- Pods can't resolve service names
- `nslookup` fails inside pods

**Diagnosis:**

```bash
# Test DNS from a pod
kubectl run test-dns --image=busybox:1.28 --rm -it --restart=Never -- nslookup kubernetes

# Check CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns

# Check CoreDNS logs
kubectl logs -n kube-system -l k8s-app=kube-dns

# Check DNS service
kubectl get svc -n kube-system kube-dns
```

**Resolution:**

1. **CoreDNS not running:**
   ```bash
   kubectl rollout restart deployment coredns -n kube-system
   ```

2. **Network policy blocking DNS:**
   ```bash
   # Check network policies
   kubectl get networkpolicies -A

   # Ensure DNS is allowed
   kubectl get ciliumnetworkpolicies -A
   ```

### 4. Network Connectivity Issues

**Symptoms:**
- Pods can't communicate with each other
- Services unreachable

**Diagnosis:**

```bash
# Check Cilium status
kubectl -n kube-system exec -it ds/cilium -- cilium status

# Check Cilium connectivity
kubectl -n kube-system exec -it ds/cilium -- cilium connectivity test

# Check Hubble flows
kubectl -n kube-system exec -it ds/cilium -- hubble observe --last 50
```

**Resolution:**

1. **Cilium agent issues:**
   ```bash
   # Restart Cilium
   kubectl rollout restart ds/cilium -n kube-system
   ```

2. **Network policy blocking:**
   ```bash
   # List policies
   kubectl get networkpolicies -n <namespace>
   kubectl get ciliumnetworkpolicies -n <namespace>

   # Check policy drops
   kubectl -n kube-system exec -it ds/cilium -- hubble observe --verdict DROPPED
   ```

3. **Security group issues:**
   ```bash
   # Check node security groups in AWS Console
   # Verify cluster security group allows node communication
   ```

### 5. Load Balancer Not Created

**Symptoms:**
- Ingress has no ADDRESS
- Service type LoadBalancer pending

**Diagnosis:**

```bash
# Check Ingress status
kubectl get ingress -A

# Check ALB controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check service account
kubectl get sa aws-load-balancer-controller -n kube-system -o yaml
```

**Resolution:**

1. **IRSA not configured:**
   ```bash
   # Verify annotation
   kubectl get sa aws-load-balancer-controller -n kube-system -o yaml | grep eks.amazonaws.com
   ```

2. **Subnet tags missing:**
   ```bash
   # Public subnets need
   aws ec2 describe-subnets --filters "Name=tag:kubernetes.io/role/elb,Values=1"

   # Private subnets need
   aws ec2 describe-subnets --filters "Name=tag:kubernetes.io/role/internal-elb,Values=1"
   ```

3. **Invalid Ingress annotations:**
   ```bash
   kubectl describe ingress <ingress-name> -n <namespace>
   ```

### 6. Kyverno Blocking Deployments

**Symptoms:**
- Deployments rejected
- Error mentioning Kyverno policy

**Diagnosis:**

```bash
# Check policy reports
kubectl get policyreports -A

# Check cluster policies
kubectl get clusterpolicies

# Check specific policy
kubectl describe clusterpolicy <policy-name>

# Check admission events
kubectl get events -A | grep -i kyverno
```

**Resolution:**

1. **Fix the violation:**
   ```bash
   # Common fixes:
   # - Add resource limits
   # - Add required labels
   # - Use non-root user
   # - Set readOnlyRootFilesystem
   ```

2. **Add exception (if justified):**
   ```yaml
   # Add exclude to policy or use PolicyException
   apiVersion: kyverno.io/v2beta1
   kind: PolicyException
   metadata:
     name: allow-specific-deployment
   spec:
     exceptions:
     - policyName: require-limits
       ruleNames:
       - require-cpu-memory-limits
     match:
       any:
       - resources:
           kinds:
           - Pod
           namespaces:
           - my-namespace
   ```

### 7. Falco Alerts Firing

**Symptoms:**
- Falco generating alerts
- Pods being terminated (if kill mode enabled)

**Diagnosis:**

```bash
# Check Falco logs
kubectl logs -n falco-system -l app.kubernetes.io/name=falco --tail=100

# Check Falcosidekick
kubectl logs -n falco-system -l app.kubernetes.io/name=falcosidekick --tail=50

# If kill mode enabled, check Talon
kubectl logs -n falco-talon -l app.kubernetes.io/name=falco-talon --tail=50
```

**Resolution:**

1. **Investigate the alert:**
   - Review the triggered rule
   - Check if legitimate activity or threat

2. **Tune rules (if false positive):**
   ```bash
   # Add custom rules to /etc/falco/rules.d/
   # Use macros and lists to exclude known-good behavior
   ```

3. **If compromised:**
   - Follow [Incident Response Runbook](./incident-response.md)

### 8. Observability Data Missing

**Symptoms:**
- No metrics in Grafana
- Logs not appearing in Loki
- Traces missing in Tempo

**Diagnosis:**

```bash
# Check Grafana Agent
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana-agent --tail=50

# Check Promtail
kubectl logs -n monitoring -l app.kubernetes.io/name=promtail --tail=50

# Check Loki
kubectl logs -n monitoring -l app.kubernetes.io/name=loki --tail=50

# Check Tempo
kubectl logs -n monitoring -l app.kubernetes.io/name=tempo --tail=50
```

**Resolution:**

1. **IRSA issues (for AMP/S3):**
   ```bash
   # Check service account annotations
   kubectl get sa grafana-agent -n monitoring -o yaml
   kubectl get sa loki -n monitoring -o yaml
   kubectl get sa tempo -n monitoring -o yaml
   ```

2. **S3 bucket issues:**
   ```bash
   # Verify bucket exists
   aws s3 ls | grep loki
   aws s3 ls | grep tempo
   ```

3. **Network issues:**
   ```bash
   # Check if pods can reach AWS endpoints
   kubectl run test --image=amazonlinux:2 --rm -it -- curl -I https://s3.<region>.amazonaws.com
   ```

### 9. External DNS Not Updating Records

**Symptoms:**
- DNS records not created/updated
- Ingress hostname not resolving

**Diagnosis:**

```bash
# Check External DNS logs
kubectl logs -n external-dns -l app.kubernetes.io/name=external-dns --tail=50

# Check IRSA
kubectl get sa external-dns -n external-dns -o yaml
```

**Resolution:**

1. **IRSA permissions:**
   ```bash
   # Verify IAM role has Route53 permissions
   ```

2. **Domain filter mismatch:**
   ```bash
   # Check domainFilters in deployment
   kubectl get deployment external-dns -n external-dns -o yaml | grep -A5 domainFilters
   ```

3. **Hosted zone ID incorrect:**
   ```bash
   # Verify hosted zone exists
   aws route53 list-hosted-zones
   ```

## Useful Commands Reference

### Pod Debugging

```bash
# Execute into pod
kubectl exec -it <pod> -n <namespace> -- /bin/sh

# Copy files from pod
kubectl cp <namespace>/<pod>:/path/to/file ./local-file

# Port forward
kubectl port-forward <pod> -n <namespace> 8080:80
```

### Log Collection

```bash
# All logs for a deployment
kubectl logs -n <namespace> -l app=<app-name> --all-containers

# Follow logs
kubectl logs -f <pod> -n <namespace>

# Logs with timestamps
kubectl logs <pod> -n <namespace> --timestamps
```

### Resource Inspection

```bash
# Get all resources in namespace
kubectl get all -n <namespace>

# Describe with events
kubectl describe <resource> <name> -n <namespace>

# Get YAML
kubectl get <resource> <name> -n <namespace> -o yaml
```

## Related

- [Deployment Runbook](./deployment.md)
- [Incident Response Runbook](./incident-response.md)
- [Upgrades Runbook](./upgrades.md)
