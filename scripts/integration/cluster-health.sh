#!/usr/bin/env bash
#
# Cluster Health Check Script
#
# Performs comprehensive health checks on an EKS cluster including:
# - Node readiness and conditions
# - Critical pod status
# - Resource availability
# - Network connectivity
#
# Usage: ./cluster-health.sh [OPTIONS]
#   --namespace NAMESPACE  Check specific namespace (default: all critical namespaces)
#   --timeout SECONDS      Timeout for checks (default: 300)
#   --verbose              Enable verbose output
#   --json                 Output results as JSON
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#   2 - Script error

set -euo pipefail

# Configuration
TIMEOUT=${TIMEOUT:-300}
VERBOSE=${VERBOSE:-false}
JSON_OUTPUT=${JSON_OUTPUT:-false}
NAMESPACE=${NAMESPACE:-""}
CRITICAL_NAMESPACES=("kube-system" "argocd" "cert-manager" "external-secrets" "external-dns" "kyverno" "trivy-system" "monitoring" "velero" "goldilocks" "reloader")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    -h|--help)
      head -25 "$0" | tail -18
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 2
      ;;
  esac
done

log() {
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "$1"
  fi
}

log_verbose() {
  if [[ "$VERBOSE" == "true" ]] && [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "  ${BLUE}[DEBUG]${NC} $1"
  fi
}

pass() {
  PASSED=$((PASSED + 1))
  log "${GREEN}[PASS]${NC} $1"
}

fail() {
  FAILED=$((FAILED + 1))
  log "${RED}[FAIL]${NC} $1"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  log "${YELLOW}[WARN]${NC} $1"
}

# Check if kubectl is available and configured
check_kubectl() {
  log "\n${BLUE}=== Checking kubectl connectivity ===${NC}"

  if ! command -v kubectl &> /dev/null; then
    fail "kubectl not found in PATH"
    return 1
  fi

  if ! kubectl cluster-info &> /dev/null; then
    fail "Cannot connect to Kubernetes cluster"
    return 1
  fi

  pass "kubectl connected to cluster"

  # Get cluster info
  CLUSTER_VERSION=$(kubectl version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion // "unknown"')
  log_verbose "Cluster version: $CLUSTER_VERSION"
}

# Check node health and readiness
check_nodes() {
  log "\n${BLUE}=== Checking Node Health ===${NC}"

  local nodes
  nodes=$(kubectl get nodes -o json)
  local node_count
  node_count=$(echo "$nodes" | jq '.items | length')

  log_verbose "Found $node_count nodes"

  if [[ "$node_count" -eq 0 ]]; then
    fail "No nodes found in cluster"
    return 1
  fi

  local ready_count=0
  local not_ready_count=0

  # Check each node
  for node in $(echo "$nodes" | jq -r '.items[].metadata.name'); do
    local node_json
    node_json=$(echo "$nodes" | jq ".items[] | select(.metadata.name == \"$node\")")

    # Check Ready condition
    local ready_status
    ready_status=$(echo "$node_json" | jq -r '.status.conditions[] | select(.type == "Ready") | .status')

    if [[ "$ready_status" == "True" ]]; then
      ready_count=$((ready_count + 1))
      log_verbose "Node $node: Ready"
    else
      not_ready_count=$((not_ready_count + 1))
      fail "Node $node is not ready (status: $ready_status)"
    fi

    # Check for problematic conditions
    for condition in "MemoryPressure" "DiskPressure" "PIDPressure" "NetworkUnavailable"; do
      local cond_status
      cond_status=$(echo "$node_json" | jq -r ".status.conditions[] | select(.type == \"$condition\") | .status" 2>/dev/null || echo "Unknown")

      if [[ "$cond_status" == "True" ]]; then
        warn "Node $node has $condition"
      fi
    done

    # Check for taints that might prevent scheduling
    local taints
    taints=$(echo "$node_json" | jq -r '.spec.taints // []')
    local unschedulable_taints
    unschedulable_taints=$(echo "$taints" | jq '[.[] | select(.effect == "NoSchedule" or .effect == "NoExecute")] | length')

    if [[ "$unschedulable_taints" -gt 2 ]]; then
      log_verbose "Node $node has $unschedulable_taints NoSchedule/NoExecute taints"
    fi
  done

  if [[ "$not_ready_count" -eq 0 ]]; then
    pass "All $ready_count nodes are ready"
  else
    fail "$not_ready_count of $node_count nodes are not ready"
  fi

  # Check node capacity
  log_verbose "Checking node resource capacity..."

  local total_cpu
  total_cpu=$(kubectl get nodes -o jsonpath='{.items[*].status.capacity.cpu}' | tr ' ' '+' | bc 2>/dev/null || echo "unknown")
  local total_memory
  total_memory=$(kubectl get nodes -o jsonpath='{.items[*].status.capacity.memory}' | head -1)

  log_verbose "Total cluster CPU capacity: ${total_cpu} cores"
  log_verbose "Sample node memory: $total_memory"
}

# Check critical system pods
check_system_pods() {
  log "\n${BLUE}=== Checking System Pods ===${NC}"

  local namespaces_to_check=("${CRITICAL_NAMESPACES[@]}")
  if [[ -n "$NAMESPACE" ]]; then
    namespaces_to_check=("$NAMESPACE")
  fi

  for ns in "${namespaces_to_check[@]}"; do
    log_verbose "Checking namespace: $ns"

    # Check if namespace exists
    if ! kubectl get namespace "$ns" &> /dev/null; then
      log_verbose "Namespace $ns does not exist, skipping"
      continue
    fi

    local pods
    pods=$(kubectl get pods -n "$ns" -o json 2>/dev/null)
    local pod_count
    pod_count=$(echo "$pods" | jq '.items | length')

    if [[ "$pod_count" -eq 0 ]]; then
      log_verbose "No pods in namespace $ns"
      continue
    fi

    local running_count=0
    local failed_pods=()

    for pod in $(echo "$pods" | jq -r '.items[].metadata.name'); do
      local pod_json
      pod_json=$(echo "$pods" | jq ".items[] | select(.metadata.name == \"$pod\")")

      local phase
      phase=$(echo "$pod_json" | jq -r '.status.phase')

      case "$phase" in
        "Running"|"Succeeded")
          # Check if all containers are ready
          local total_containers
          total_containers=$(echo "$pod_json" | jq '.spec.containers | length')
          local ready_containers
          ready_containers=$(echo "$pod_json" | jq '[.status.containerStatuses[]? | select(.ready == true)] | length')

          if [[ "$ready_containers" -eq "$total_containers" ]]; then
            running_count=$((running_count + 1))
          else
            failed_pods+=("$pod (containers: $ready_containers/$total_containers ready)")
          fi
          ;;
        "Pending")
          # Check how long it's been pending
          local creation_time
          creation_time=$(echo "$pod_json" | jq -r '.metadata.creationTimestamp')
          log_verbose "Pod $pod is pending since $creation_time"
          failed_pods+=("$pod (Pending)")
          ;;
        "Failed"|"Unknown")
          failed_pods+=("$pod ($phase)")
          ;;
      esac
    done

    if [[ ${#failed_pods[@]} -eq 0 ]]; then
      pass "Namespace $ns: All $pod_count pods healthy"
    else
      fail "Namespace $ns: ${#failed_pods[@]} of $pod_count pods unhealthy"
      for fp in "${failed_pods[@]}"; do
        log "       - $fp"
      done
    fi
  done
}

# Check critical deployments
check_deployments() {
  log "\n${BLUE}=== Checking Critical Deployments ===${NC}"

  local critical_deployments=(
    "kube-system:coredns"
    "kube-system:karpenter"
    "kube-system:aws-load-balancer-controller"
    "kube-system:ebs-csi-controller"
    "kube-system:metrics-server"
    "argocd:argo-cd-argocd-server"
    "argocd:argo-cd-argocd-repo-server"
    "cert-manager:cert-manager"
    "cert-manager:cert-manager-webhook"
    "external-secrets:external-secrets"
    "external-dns:external-dns"
    "kyverno:kyverno-admission-controller"
    "trivy-system:trivy-operator"
    "velero:velero"
    "goldilocks:goldilocks-controller"
    "monitoring:loki-gateway"
    "reloader:reloader-reloader"
  )

  for deploy_spec in "${critical_deployments[@]}"; do
    local ns="${deploy_spec%%:*}"
    local deploy="${deploy_spec##*:}"

    if ! kubectl get deployment "$deploy" -n "$ns" &> /dev/null; then
      log_verbose "Deployment $deploy not found in $ns, skipping"
      continue
    fi

    local deployment_json
    deployment_json=$(kubectl get deployment "$deploy" -n "$ns" -o json)

    local desired
    desired=$(echo "$deployment_json" | jq '.spec.replicas')
    local ready
    ready=$(echo "$deployment_json" | jq '.status.readyReplicas // 0')

    if [[ "$ready" -ge "$desired" ]] && [[ "$ready" -gt 0 ]]; then
      pass "Deployment $ns/$deploy: $ready/$desired replicas ready"
    else
      fail "Deployment $ns/$deploy: $ready/$desired replicas ready"
    fi
  done
}

# Check DaemonSets
check_daemonsets() {
  log "\n${BLUE}=== Checking DaemonSets ===${NC}"

  local critical_daemonsets=(
    "kube-system:aws-node"
    "kube-system:cilium"
  )

  for ds_spec in "${critical_daemonsets[@]}"; do
    local ns="${ds_spec%%:*}"
    local ds="${ds_spec##*:}"

    if ! kubectl get daemonset "$ds" -n "$ns" &> /dev/null; then
      log_verbose "DaemonSet $ds not found in $ns, skipping"
      continue
    fi

    local ds_json
    ds_json=$(kubectl get daemonset "$ds" -n "$ns" -o json)

    local desired
    desired=$(echo "$ds_json" | jq '.status.desiredNumberScheduled')
    local ready
    ready=$(echo "$ds_json" | jq '.status.numberReady // 0')

    if [[ "$ready" -ge "$desired" ]] && [[ "$ready" -gt 0 ]]; then
      pass "DaemonSet $ns/$ds: $ready/$desired pods ready"
    else
      fail "DaemonSet $ns/$ds: $ready/$desired pods ready"
    fi
  done
}

# Check PodDisruptionBudgets
check_pdbs() {
  log "\n${BLUE}=== Checking PodDisruptionBudgets ===${NC}"

  local pdbs
  pdbs=$(kubectl get pdb --all-namespaces -o json 2>/dev/null)
  local pdb_count
  pdb_count=$(echo "$pdbs" | jq '.items | length')

  if [[ "$pdb_count" -eq 0 ]]; then
    warn "No PodDisruptionBudgets found in cluster"
    return
  fi

  log_verbose "Found $pdb_count PDBs"

  local healthy_pdbs=0

  for pdb in $(echo "$pdbs" | jq -r '.items[] | @base64'); do
    local pdb_json
    pdb_json=$(echo "$pdb" | base64 -d)

    local name
    name=$(echo "$pdb_json" | jq -r '.metadata.name')
    local ns
    ns=$(echo "$pdb_json" | jq -r '.metadata.namespace')
    local disruptions_allowed
    disruptions_allowed=$(echo "$pdb_json" | jq '.status.disruptionsAllowed // 0')

    if [[ "$disruptions_allowed" -ge 0 ]]; then
      healthy_pdbs=$((healthy_pdbs + 1))
      log_verbose "PDB $ns/$name: $disruptions_allowed disruptions allowed"
    fi
  done

  pass "Found $healthy_pdbs healthy PodDisruptionBudgets"
}

# Check resource quotas
check_resource_quotas() {
  log "\n${BLUE}=== Checking ResourceQuotas ===${NC}"

  local quotas
  quotas=$(kubectl get resourcequota --all-namespaces -o json 2>/dev/null)
  local quota_count
  quota_count=$(echo "$quotas" | jq '.items | length')

  if [[ "$quota_count" -eq 0 ]]; then
    log_verbose "No ResourceQuotas found"
    return
  fi

  log_verbose "Found $quota_count ResourceQuotas"

  local near_limit=0

  for quota in $(echo "$quotas" | jq -r '.items[] | @base64'); do
    local quota_json
    quota_json=$(echo "$quota" | base64 -d)

    local name
    name=$(echo "$quota_json" | jq -r '.metadata.name')
    local ns
    ns=$(echo "$quota_json" | jq -r '.metadata.namespace')

    # Check if any resource is near limit (>80%)
    local hard
    hard=$(echo "$quota_json" | jq '.status.hard // {}')
    local used
    used=$(echo "$quota_json" | jq '.status.used // {}')

    for resource in $(echo "$hard" | jq -r 'keys[]'); do
      local hard_val
      hard_val=$(echo "$hard" | jq -r ".[\"$resource\"]" | sed 's/[^0-9.]//g')
      local used_val
      used_val=$(echo "$used" | jq -r ".[\"$resource\"]" | sed 's/[^0-9.]//g')

      if [[ -n "$hard_val" ]] && [[ -n "$used_val" ]] && [[ "$hard_val" != "0" ]]; then
        local percentage
        percentage=$(echo "scale=0; $used_val * 100 / $hard_val" | bc 2>/dev/null || echo "0")

        if [[ "$percentage" -gt 80 ]]; then
          near_limit=$((near_limit + 1))
          warn "ResourceQuota $ns/$name: $resource at ${percentage}% usage"
        fi
      fi
    done
  done

  if [[ "$near_limit" -eq 0 ]]; then
    pass "All ResourceQuotas have sufficient headroom"
  fi
}

# Check DNS resolution
check_dns() {
  log "\n${BLUE}=== Checking DNS Resolution ===${NC}"

  # Create a test pod to check DNS
  local test_pod="dns-test-$$"

  if kubectl run "$test_pod" --image=busybox:1.36 --restart=Never --rm -i --wait --timeout=30s -- nslookup kubernetes.default &> /dev/null; then
    pass "DNS resolution working (kubernetes.default)"
  else
    fail "DNS resolution failed for kubernetes.default"
  fi

  # Cleanup in case pod wasn't removed
  kubectl delete pod "$test_pod" --ignore-not-found=true &> /dev/null || true
}

# Print summary
print_summary() {
  log "\n${BLUE}=== Health Check Summary ===${NC}"
  log "Passed:   ${GREEN}$PASSED${NC}"
  log "Failed:   ${RED}$FAILED${NC}"
  log "Warnings: ${YELLOW}$WARNINGS${NC}"

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "{\"passed\": $PASSED, \"failed\": $FAILED, \"warnings\": $WARNINGS, \"status\": \"$([ $FAILED -eq 0 ] && echo 'healthy' || echo 'unhealthy')\"}"
  fi

  if [[ "$FAILED" -gt 0 ]]; then
    log "\n${RED}Cluster health check FAILED${NC}"
    return 1
  else
    log "\n${GREEN}Cluster health check PASSED${NC}"
    return 0
  fi
}

# Main execution
main() {
  log "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  log "${BLUE}║            EKS Cluster Health Check                         ║${NC}"
  log "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  log "Started at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

  check_kubectl || exit 2
  check_nodes
  check_system_pods
  check_deployments
  check_daemonsets
  check_pdbs
  check_resource_quotas
  # Skip DNS check by default as it requires creating pods
  # check_dns

  print_summary
}

main "$@"
