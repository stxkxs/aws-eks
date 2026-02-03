# Troubleshooting FAQ

Common issues and solutions for the AWS EKS infrastructure.

## Table of Contents

- [Deployment Issues](#deployment-issues)
- [Networking Issues](#networking-issues)
- [Security Issues](#security-issues)
- [Observability Issues](#observability-issues)
- [Performance Issues](#performance-issues)
- [Cost Issues](#cost-issues)

---

## Deployment Issues

### Q: CDK deployment fails with "Resource already exists"

**Cause:** A resource with the same name was created outside of CDK or from a failed deployment.

**Solution:**
```bash
# Option 1: Import existing resource
cdk import <stack-name>

# Option 2: Delete the resource manually and retry
aws cloudformation delete-stack --stack-name <stack-name>

# Option 3: Use a different resource name in config
```

### Q: Helm chart fails to deploy with timeout

**Cause:** The chart is waiting for resources that won't become ready.

**Solution:**
```bash
# Check what's blocking
kubectl get pods -n <namespace> -o wide
kubectl describe pod <pod-name> -n <namespace>

# Common causes:
# - Image pull errors (check registry access)
# - Resource constraints (check node capacity)
# - PVC not bound (check storage class)

# Force redeploy via CDK
cdk deploy <stack-name> --force
```

### Q: "No space left on device" during node provisioning

**Cause:** EBS volume is too small for container images.

**Solution:**
```typescript
// Increase disk size in config/base.ts
systemNodeGroup: {
  diskSize: 100,  // Increase from default
}
```

### Q: Deployment stuck at "Waiting for CloudFormation"

**Cause:** CloudFormation is waiting for a resource or custom resource.

**Solution:**
```bash
# Check CloudFormation events
aws cloudformation describe-stack-events --stack-name <stack-name> | head -50

# Check for Lambda custom resource issues
aws logs tail /aws/lambda/<function-name> --follow
```

---

## Networking Issues

### Q: Pods can't reach the internet

**Cause:** NAT Gateway, security groups, or network policies blocking traffic.

**Solution:**
```bash
# 1. Verify NAT Gateway exists
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=<vpc-id>"

# 2. Check route tables
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=<vpc-id>"

# 3. Check security groups
kubectl get pod <pod> -o jsonpath='{.spec.nodeName}' | xargs -I{} \
  aws ec2 describe-instances --filters "Name=private-dns-name,Values={}" \
  --query 'Reservations[].Instances[].SecurityGroups'

# 4. Check Cilium network policies
kubectl get ciliumnetworkpolicies -A
kubectl -n kube-system exec -it ds/cilium -- cilium policy get
```

### Q: Service not accessible via LoadBalancer

**Cause:** ALB controller not configured, missing annotations, or subnet tags.

**Solution:**
```bash
# 1. Check ALB controller is running
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# 2. Check controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# 3. Verify subnet tags exist
aws ec2 describe-subnets --filters "Name=tag:kubernetes.io/role/elb,Values=1"

# 4. Check Ingress/Service annotations
kubectl describe ingress <name> -n <namespace>
```

### Q: Cross-namespace communication blocked

**Cause:** Network policies restricting traffic.

**Solution:**
```bash
# Check existing policies
kubectl get networkpolicies -A
kubectl get ciliumnetworkpolicies -A

# Check Hubble for dropped traffic
kubectl -n kube-system exec -it ds/cilium -- hubble observe --verdict DROPPED

# Create allow policy if needed
cat <<EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-from-namespace
  namespace: target-namespace
spec:
  ingress:
  - fromEndpoints:
    - matchLabels:
        k8s:io.kubernetes.pod.namespace: source-namespace
EOF
```

### Q: DNS resolution intermittently fails

**Cause:** CoreDNS overloaded or ndots causing excessive lookups.

**Solution:**
```bash
# 1. Check CoreDNS pods and resources
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl top pods -n kube-system -l k8s-app=kube-dns

# 2. Scale CoreDNS if needed
kubectl scale deployment coredns -n kube-system --replicas=3

# 3. Optimize pod DNS config
# Add to pod spec:
dnsConfig:
  options:
  - name: ndots
    value: "2"
```

---

## Security Issues

### Q: Kyverno blocking my deployment

**Cause:** Deployment violates a cluster policy.

**Solution:**
```bash
# 1. Check which policy is blocking
kubectl get events -A | grep -i kyverno

# 2. See policy details
kubectl get clusterpolicies
kubectl describe clusterpolicy <policy-name>

# 3. Check policy report
kubectl get policyreports -n <namespace>

# 4. Fix the violation (common fixes):
# - Add resource limits
# - Add required labels
# - Set runAsNonRoot: true
# - Set readOnlyRootFilesystem: true

# 5. Or create exception (if justified)
kubectl apply -f - <<EOF
apiVersion: kyverno.io/v2beta1
kind: PolicyException
metadata:
  name: allow-my-app
  namespace: kyverno
spec:
  exceptions:
  - policyName: <policy-name>
    ruleNames:
    - <rule-name>
  match:
    any:
    - resources:
        kinds:
        - Pod
        namespaces:
        - <namespace>
        names:
        - <pod-name-pattern>*
EOF
```

### Q: Falco generating too many alerts (false positives)

**Cause:** Default rules too strict for your workload.

**Solution:**
```bash
# 1. Check recent alerts
kubectl logs -n falco-system -l app.kubernetes.io/name=falco --tail=100 | jq

# 2. Identify the rule triggering
# Look for "rule" field in output

# 3. Create custom rule override
# Add to Falco ConfigMap or custom rules file:
- rule: <rule-name>
  enabled: false
  # Or tune with exceptions:
  exceptions:
  - name: known_binaries
    fields: [proc.name]
    values:
    - [[my-binary]]
```

### Q: Trivy blocking image deployment

**Cause:** Image has vulnerabilities above threshold.

**Solution:**
```bash
# 1. Check vulnerability report
kubectl get vulnerabilityreports -n <namespace> -o yaml

# 2. Options:
# a) Fix vulnerabilities by updating base image
# b) Lower severity threshold (not recommended for prod)
# c) Create policy exception for specific image

# 3. Re-scan after image update
kubectl delete vulnerabilityreport <report-name> -n <namespace>
# Trivy will automatically rescan
```

### Q: IRSA not working - "AccessDenied" from AWS API

**Cause:** Service account annotation missing or IAM role misconfigured.

**Solution:**
```bash
# 1. Verify service account has annotation
kubectl get sa <sa-name> -n <namespace> -o yaml | grep eks.amazonaws.com

# 2. Verify OIDC provider exists
aws eks describe-cluster --name <cluster> --query 'cluster.identity.oidc'

# 3. Check IAM role trust policy includes the OIDC provider
aws iam get-role --role-name <role-name> --query 'Role.AssumeRolePolicyDocument'

# 4. Verify pod is using the service account
kubectl get pod <pod> -n <namespace> -o jsonpath='{.spec.serviceAccountName}'

# 5. Check environment variables in pod
kubectl exec <pod> -n <namespace> -- env | grep AWS
```

---

## Observability Issues

### Q: No metrics in Grafana/AMP

**Cause:** Grafana Agent not scraping or not pushing to AMP.

**Solution:**
```bash
# 1. Check Grafana Agent is running
kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana-agent

# 2. Check logs for errors
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana-agent | grep -i error

# 3. Verify IRSA for AMP access
kubectl get sa grafana-agent -n monitoring -o yaml

# 4. Test AMP connectivity from pod
kubectl exec -n monitoring <grafana-agent-pod> -- \
  curl -s https://aps-workspaces.<region>.amazonaws.com/workspaces/<workspace-id>/api/v1/labels
```

### Q: Logs not appearing in Loki

**Cause:** Promtail not collecting or Loki not ingesting.

**Solution:**
```bash
# 1. Check Promtail is running on all nodes
kubectl get pods -n monitoring -l app.kubernetes.io/name=promtail -o wide

# 2. Check Promtail logs
kubectl logs -n monitoring -l app.kubernetes.io/name=promtail --tail=50

# 3. Check Loki health
kubectl exec -n monitoring <loki-pod> -- wget -qO- http://localhost:3100/ready

# 4. Verify S3 bucket access
kubectl logs -n monitoring -l app.kubernetes.io/name=loki | grep -i s3

# 5. Check Loki ingestion
kubectl exec -n monitoring <loki-pod> -- \
  wget -qO- 'http://localhost:3100/loki/api/v1/labels' | jq
```

### Q: Traces missing in Tempo

**Cause:** Application not instrumented or Tempo not receiving traces.

**Solution:**
```bash
# 1. Check Tempo is running
kubectl get pods -n monitoring -l app.kubernetes.io/name=tempo

# 2. Verify OTLP endpoint accessible
kubectl run test-otlp --image=curlimages/curl --rm -it -- \
  curl -v tempo.monitoring.svc:4317

# 3. Check application is sending traces
# Verify OTEL_EXPORTER_OTLP_ENDPOINT is set in your app

# 4. Check Tempo logs
kubectl logs -n monitoring -l app.kubernetes.io/name=tempo | grep -i error
```

### Q: Hubble UI not showing flows

**Cause:** Hubble relay not connected or flows not enabled.

**Solution:**
```bash
# 1. Check Hubble status
kubectl -n kube-system exec -it ds/cilium -- hubble status

# 2. Check Hubble relay
kubectl get pods -n kube-system -l app.kubernetes.io/name=hubble-relay

# 3. Verify Hubble UI service
kubectl get svc -n kube-system hubble-ui

# 4. Port forward and access
kubectl port-forward -n kube-system svc/hubble-ui 12000:80
# Open http://localhost:12000
```

---

## Performance Issues

### Q: Pods slow to start

**Cause:** Image pull, scheduling, or resource allocation delays.

**Solution:**
```bash
# 1. Check event timeline
kubectl describe pod <pod> -n <namespace> | grep -A20 Events

# 2. Common causes:
# - Large image: Use smaller base images, multi-stage builds
# - Image pull: Pre-pull images or use local cache
# - Scheduling: Check node resources and affinity rules
# - Init containers: Optimize init container performance

# 3. For image pull issues
kubectl get events -n <namespace> | grep -i pull

# 4. Consider image caching with Karpenter
# Images are cached on warm nodes
```

### Q: High memory usage on nodes

**Cause:** Memory leaks, incorrect limits, or too many pods.

**Solution:**
```bash
# 1. Check node memory
kubectl top nodes

# 2. Find memory-hungry pods
kubectl top pods -A --sort-by=memory | head -20

# 3. Check for pods without limits
kubectl get pods -A -o json | jq -r \
  '.items[] | select(.spec.containers[].resources.limits.memory == null) |
   "\(.metadata.namespace)/\(.metadata.name)"'

# 4. Use Goldilocks for recommendations
kubectl get vpa -A
# Or access Goldilocks dashboard
kubectl port-forward -n goldilocks svc/goldilocks-dashboard 8080:80
```

### Q: Karpenter not scaling up fast enough

**Cause:** Provisioner constraints or instance availability.

**Solution:**
```bash
# 1. Check Karpenter logs
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter | grep -i provision

# 2. Check pending pods
kubectl get pods -A --field-selector=status.phase=Pending

# 3. Review NodePool constraints
kubectl get nodepool default -o yaml

# 4. Check EC2 capacity
# Karpenter logs will show "insufficient capacity" errors
# Consider adding more instance types to the NodePool
```

---

## Cost Issues

### Q: Unexpected AWS costs

**Cause:** Resources not cleaned up, oversized instances, or NAT traffic.

**Solution:**
```bash
# 1. Check for orphaned resources
# Load balancers
aws elbv2 describe-load-balancers --query 'LoadBalancers[?starts_with(LoadBalancerName, `k8s-`)]'

# EBS volumes
aws ec2 describe-volumes --filters "Name=status,Values=available"

# 2. Review instance sizing with Goldilocks
kubectl port-forward -n goldilocks svc/goldilocks-dashboard 8080:80

# 3. Check NAT Gateway data transfer
# In AWS Console: VPC > NAT Gateways > Monitoring

# 4. Verify Spot usage
kubectl get nodes -l karpenter.sh/capacity-type=spot
```

### Q: Too many NAT Gateway charges

**Cause:** Excessive egress traffic or cross-AZ traffic.

**Solution:**
```bash
# 1. Use VPC endpoints for AWS services
# Already enabled via features.vpcEndpoints in config

# 2. Check cross-AZ traffic
# Ensure pods communicate within same AZ when possible

# 3. Review what's generating traffic
# Use VPC Flow Logs or Hubble to identify chattiest services

# 4. For dev environment, use single NAT
# config/dev.ts: natGateways: 1
```

---

## Quick Reference Commands

### Health Check Script

```bash
#!/bin/bash
echo "=== Cluster Health Check ==="

echo -e "\n--- Nodes ---"
kubectl get nodes

echo -e "\n--- Unhealthy Pods ---"
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded | head -20

echo -e "\n--- Recent Events (Warnings) ---"
kubectl get events -A --field-selector type=Warning --sort-by='.lastTimestamp' | tail -10

echo -e "\n--- Resource Usage ---"
kubectl top nodes
kubectl top pods -A --sort-by=cpu | head -10

echo -e "\n--- Cilium Status ---"
kubectl -n kube-system exec -it ds/cilium -- cilium status --brief

echo -e "\n--- Karpenter Status ---"
kubectl get nodepools
kubectl get nodes -l karpenter.sh/nodepool
```

### Component Status

```bash
# All-in-one status check
for ns in kube-system monitoring falco-system kyverno; do
  echo "=== $ns ==="
  kubectl get pods -n $ns --no-headers | awk '{print $1, $3}'
done
```

---

## Related Documentation

- [Troubleshooting Runbook](./troubleshooting.md) - Detailed procedures
- [Incident Response](./incident-response.md) - Security incident handling
- [Deployment Runbook](./deployment.md) - Deployment procedures
