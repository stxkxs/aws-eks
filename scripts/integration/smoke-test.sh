#!/usr/bin/env bash
#
# EKS Post-Deploy Smoke Test
#
# Validates all components of the EKS cluster are healthy after deployment.
# Covers: cluster basics, ArgoCD, addons, Karpenter, storage, security,
# networking, observability, and certificates/secrets.
#
# Usage: ./smoke-test.sh [OPTIONS]
#   --environment ENV     Environment name for display (default: from kubectl context)
#   --verbose             Show details for all checks, not just failures
#   --json                Output results as JSON (for CI)
#   --strict              Treat warnings as failures
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#   2 - Script error

set -euo pipefail

# Configuration
ENVIRONMENT=""
VERBOSE=${VERBOSE:-false}
JSON_OUTPUT=${JSON_OUTPUT:-false}
STRICT=${STRICT:-false}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# JSON results collector
JSON_RESULTS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --environment)
      ENVIRONMENT="$2"
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
    --strict)
      STRICT=true
      shift
      ;;
    -h|--help)
      head -18 "$0" | tail -14
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
    # Prefix each line with [INFO] for consistent multiline formatting
    while IFS= read -r line; do
      echo -e "  ${BLUE}[INFO]${NC} $line"
    done <<< "$1"
  fi
}

pass() {
  PASSED=$((PASSED + 1))
  log "${GREEN}[PASS]${NC} $1"
  JSON_RESULTS+=("{\"check\":\"$1\",\"status\":\"pass\"}")
}

fail() {
  FAILED=$((FAILED + 1))
  log "${RED}[FAIL]${NC} $1"
  JSON_RESULTS+=("{\"check\":\"$1\",\"status\":\"fail\"}")
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  log "${YELLOW}[WARN]${NC} $1"
  JSON_RESULTS+=("{\"check\":\"$1\",\"status\":\"warn\"}")
}

section() {
  log "\n${BOLD}=== $1 ===${NC}"
}

_pad() { printf "%-46s" "$1"; }

# Detect environment from kubectl context if not specified
detect_environment() {
  if [[ -z "$ENVIRONMENT" ]]; then
    ENVIRONMENT=$(kubectl config current-context 2>/dev/null | sed 's/.*\///' || echo "unknown")
  fi
}

# ─── 1. Cluster Basics ──────────────────────────────────────────────────────

check_cluster_basics() {
  section "Cluster Basics"

  # API server reachable
  if kubectl cluster-info &> /dev/null; then
    pass "API server reachable"
  else
    fail "API server unreachable"
    return 1
  fi

  # Node readiness
  local nodes_json
  nodes_json=$(kubectl get nodes -o json)
  local total_nodes
  total_nodes=$(echo "$nodes_json" | jq '.items | length')
  local ready_nodes
  ready_nodes=$(echo "$nodes_json" | jq '[.items[] | select(.status.conditions[] | select(.type == "Ready" and .status == "True"))] | length')

  if [[ "$ready_nodes" -eq "$total_nodes" ]] && [[ "$total_nodes" -gt 0 ]]; then
    pass "${ready_nodes}/${total_nodes} nodes Ready"
  else
    fail "${ready_nodes}/${total_nodes} nodes Ready"
  fi

  # Node conditions (MemoryPressure, DiskPressure, PIDPressure)
  local pressure_issues=0
  for condition in "MemoryPressure" "DiskPressure" "PIDPressure"; do
    local affected
    affected=$(echo "$nodes_json" | jq "[.items[] | select(.status.conditions[] | select(.type == \"$condition\" and .status == \"True\"))] | length")
    if [[ "$affected" -gt 0 ]]; then
      pressure_issues=$((pressure_issues + affected))
      log_verbose "$affected node(s) with $condition"
    fi
  done

  if [[ "$pressure_issues" -eq 0 ]]; then
    pass "No node pressure conditions"
  else
    fail "${pressure_issues} node pressure condition(s) detected"
  fi

  # Kubernetes version
  local k8s_version
  k8s_version=$(kubectl version -o json 2>/dev/null | jq -r '.serverVersion.minor // "unknown"')
  log_verbose "Kubernetes minor version: $k8s_version"
  pass "Kubernetes version v1.${k8s_version}"
}

# ─── 2. ArgoCD Health ───────────────────────────────────────────────────────

check_argocd() {
  section "ArgoCD Health"

  # ArgoCD namespace exists
  if ! kubectl get namespace argocd &> /dev/null; then
    fail "ArgoCD namespace does not exist"
    return
  fi

  # ArgoCD pods running
  local argocd_pods
  argocd_pods=$(kubectl get pods -n argocd -o json 2>/dev/null)
  local total_pods
  total_pods=$(echo "$argocd_pods" | jq '.items | length')
  local running_pods
  running_pods=$(echo "$argocd_pods" | jq '[.items[] | select(.status.phase == "Running")] | length')

  if [[ "$running_pods" -eq "$total_pods" ]] && [[ "$total_pods" -gt 0 ]]; then
    pass "ArgoCD pods: ${running_pods}/${total_pods} Running"
  else
    fail "ArgoCD pods: ${running_pods}/${total_pods} Running"
    if [[ "$VERBOSE" == "true" ]]; then
      local not_running
      not_running=$(echo "$argocd_pods" | jq -r '.items[] | select(.status.phase != "Running") | "       - \(.metadata.name): \(.status.phase)"')
      [[ -n "$not_running" ]] && log_verbose "$not_running"
    fi
  fi

  # ArgoCD Applications health
  if kubectl get crd applications.argoproj.io &> /dev/null; then
    local apps_json
    apps_json=$(kubectl get applications -n argocd -o json 2>/dev/null)
    local total_apps
    total_apps=$(echo "$apps_json" | jq '.items | length')

    if [[ "$total_apps" -eq 0 ]]; then
      warn "No ArgoCD Applications found"
      return
    fi

    local healthy_apps
    healthy_apps=$(echo "$apps_json" | jq '[.items[] | select(.status.health.status == "Healthy")] | length')
    local synced_apps
    synced_apps=$(echo "$apps_json" | jq '[.items[] | select(.status.sync.status == "Synced")] | length')
    local outofsync_apps
    outofsync_apps=$((total_apps - synced_apps))

    if [[ "$healthy_apps" -eq "$total_apps" ]]; then
      pass "${healthy_apps}/${total_apps} applications Healthy"
    else
      fail "$((total_apps - healthy_apps))/${total_apps} applications not Healthy"
      if [[ "$VERBOSE" == "true" ]]; then
        local unhealthy_details
        unhealthy_details=$(echo "$apps_json" | jq -r '.items[] | select(.status.health.status != "Healthy") | "       - \(.metadata.name): health=\(.status.health.status) sync=\(.status.sync.status)"')
        [[ -n "$unhealthy_details" ]] && log_verbose "$unhealthy_details"
      fi
    fi

    if [[ "$outofsync_apps" -gt 0 ]]; then
      warn "${outofsync_apps} application(s) OutOfSync"
      if [[ "$VERBOSE" == "true" ]]; then
        local outofsync_details
        outofsync_details=$(echo "$apps_json" | jq -r '.items[] | select(.status.sync.status != "Synced") | "       - \(.metadata.name): \(.status.sync.status)"')
        [[ -n "$outofsync_details" ]] && log_verbose "$outofsync_details"
      fi
    else
      pass "All applications Synced"
    fi

    # App-of-Apps check
    local aoa_exists
    aoa_exists=$(echo "$apps_json" | jq '[.items[] | select(.metadata.name == "platform-addons")] | length')
    if [[ "$aoa_exists" -gt 0 ]]; then
      pass "App-of-Apps present (platform-addons)"
    else
      warn "No App-of-Apps application found (platform-addons)"
    fi
  else
    warn "ArgoCD Application CRD not found"
  fi
}

# ─── 3. Addon Namespaces & Deployments ──────────────────────────────────────

check_addon_deployments() {
  section "Addon Deployments"

  # Deployments to check: "namespace:name"
  local deployments=(
    "argocd:argo-cd-argocd-server"
    "argocd:argo-cd-argocd-repo-server"
    "argocd:argo-cd-argocd-applicationset-controller"
    "argocd:argo-cd-argocd-dex-server"
    "argocd:argo-cd-argocd-notifications-controller"
    "argocd:argo-cd-argocd-redis"
    "cert-manager:cert-manager"
    "cert-manager:cert-manager-webhook"
    "cert-manager:cert-manager-cainjector"
    "external-secrets:external-secrets"
    "external-secrets:external-secrets-cert-controller"
    "external-secrets:external-secrets-webhook"
    "kube-system:karpenter"
    "kube-system:coredns"
    "kube-system:aws-load-balancer-controller"
    "kube-system:ebs-csi-controller"
    "kube-system:metrics-server"
    "external-dns:external-dns"
    "kyverno:kyverno-admission-controller"
    "kyverno:kyverno-background-controller"
    "kyverno:kyverno-cleanup-controller"
    "kyverno:kyverno-reports-controller"
    "trivy-system:trivy-operator"
    "velero:velero"
    "goldilocks:goldilocks-controller"
    "goldilocks:goldilocks-dashboard"
    "monitoring:loki-gateway"
    "reloader:reloader-reloader"
  )

  for spec in "${deployments[@]}"; do
    local ns="${spec%%:*}"
    local name="${spec##*:}"

    if ! kubectl get namespace "$ns" &> /dev/null; then
      log_verbose "Namespace $ns not found, skipping $name"
      continue
    fi

    local deploy_json
    deploy_json=$(kubectl get deployment "$name" -n "$ns" -o json 2>/dev/null) || true

    if [[ -z "$deploy_json" ]] || [[ "$deploy_json" == "" ]]; then
      warn "Deployment $ns/$name not found"
      continue
    fi

    local desired
    desired=$(echo "$deploy_json" | jq '.spec.replicas // 1')
    local ready
    ready=$(echo "$deploy_json" | jq '.status.readyReplicas // 0')

    if [[ "$ready" -ge "$desired" ]] && [[ "$ready" -gt 0 ]]; then
      pass "Deployment $ns/$name: ${ready}/${desired} ready"
    else
      fail "Deployment $ns/$name: ${ready}/${desired} ready"
    fi
  done

  # StatefulSets to check
  local statefulsets=(
    "argocd:argo-cd-argocd-application-controller"
    "monitoring:loki"
    "monitoring:loki-chunks-cache"
    "monitoring:loki-results-cache"
    "monitoring:tempo"
  )

  for spec in "${statefulsets[@]}"; do
    local ns="${spec%%:*}"
    local name="${spec##*:}"

    if ! kubectl get namespace "$ns" &> /dev/null; then
      log_verbose "Namespace $ns not found, skipping $name"
      continue
    fi

    local sts_json
    sts_json=$(kubectl get statefulset "$name" -n "$ns" -o json 2>/dev/null) || true

    if [[ -z "$sts_json" ]] || [[ "$sts_json" == "" ]]; then
      warn "StatefulSet $ns/$name not found"
      continue
    fi

    local desired
    desired=$(echo "$sts_json" | jq '.spec.replicas // 1')
    local ready
    ready=$(echo "$sts_json" | jq '.status.readyReplicas // 0')

    if [[ "$ready" -ge "$desired" ]] && [[ "$ready" -gt 0 ]]; then
      pass "StatefulSet $ns/$name: ${ready}/${desired} ready"
    else
      fail "StatefulSet $ns/$name: ${ready}/${desired} ready"
    fi
  done
}

# ─── 4. Karpenter Validation ────────────────────────────────────────────────

check_karpenter() {
  section "Karpenter"

  # Karpenter controller running
  local karpenter_ready
  karpenter_ready=$(kubectl get deployment karpenter -n kube-system -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

  if [[ "$karpenter_ready" -gt 0 ]]; then
    pass "Karpenter controller: ${karpenter_ready} ready replica(s)"
  else
    fail "Karpenter controller not ready"
    return
  fi

  # NodePool CRD (v1) or Provisioner CRD (legacy) and default resource
  if kubectl get crd nodepools.karpenter.sh &> /dev/null; then
    pass "NodePool CRD exists"
    if kubectl get nodepool default &> /dev/null; then
      pass "Default NodePool present"
    else
      warn "Default NodePool not found"
    fi
  elif kubectl get crd provisioners.karpenter.sh &> /dev/null; then
    pass "Provisioner CRD exists (legacy)"
    if kubectl get provisioner default &> /dev/null; then
      pass "Default Provisioner present"
    else
      warn "Default Provisioner not found"
    fi
  else
    warn "No Karpenter scheduling CRD found (NodePool or Provisioner)"
  fi

  # EC2NodeClass CRD (v1) or AWSNodeTemplate CRD (legacy)
  if kubectl get crd ec2nodeclasses.karpenter.k8s.aws &> /dev/null; then
    pass "EC2NodeClass CRD exists"
    if kubectl get ec2nodeclass default &> /dev/null; then
      pass "Default EC2NodeClass present"
    else
      warn "Default EC2NodeClass not found"
    fi
  elif kubectl get crd awsnodetemplates.karpenter.k8s.aws &> /dev/null; then
    pass "AWSNodeTemplate CRD exists (legacy)"
    if kubectl get awsnodetemplate default &> /dev/null; then
      pass "Default AWSNodeTemplate present"
    else
      warn "Default AWSNodeTemplate not found"
    fi
  else
    warn "No Karpenter node class CRD found (EC2NodeClass or AWSNodeTemplate)"
  fi

  # Check for Karpenter-provisioned nodes
  local karpenter_nodes
  karpenter_nodes=$(kubectl get nodes -l 'karpenter.sh/registered=true' -o name 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$karpenter_nodes" -gt 0 ]]; then
    pass "${karpenter_nodes} Karpenter-provisioned node(s)"
  else
    log_verbose "No Karpenter-provisioned nodes (may be expected if no workloads scheduled)"
    warn "No Karpenter-provisioned nodes found"
  fi
}

# ─── 5. Storage & CSI ───────────────────────────────────────────────────────

check_storage() {
  section "Storage & CSI"

  # StorageClass
  if kubectl get storageclass gp2 &> /dev/null; then
    pass "StorageClass gp2 exists"
  elif kubectl get storageclass gp3 &> /dev/null; then
    pass "StorageClass gp3 exists"
  else
    warn "No gp2/gp3 StorageClass found"
  fi

  # CSIDriver
  if kubectl get csidriver ebs.csi.aws.com &> /dev/null; then
    pass "EBS CSI driver present"
  else
    fail "EBS CSI driver (ebs.csi.aws.com) not found"
  fi

  # EBS CSI controller pods
  local ebs_ready
  ebs_ready=$(kubectl get deployment ebs-csi-controller -n kube-system -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

  if [[ "$ebs_ready" -gt 0 ]]; then
    pass "EBS CSI controller: ${ebs_ready} ready replica(s)"
  else
    fail "EBS CSI controller not ready"
  fi

  # PVC check — all PVCs should be Bound
  local pvcs_json
  pvcs_json=$(kubectl get pvc --all-namespaces -o json 2>/dev/null)
  local total_pvcs
  total_pvcs=$(echo "$pvcs_json" | jq '.items | length')

  if [[ "$total_pvcs" -eq 0 ]]; then
    log_verbose "No PVCs found in cluster"
  else
    local pending_pvcs
    pending_pvcs=$(echo "$pvcs_json" | jq '[.items[] | select(.status.phase != "Bound")] | length')

    if [[ "$pending_pvcs" -eq 0 ]]; then
      pass "All ${total_pvcs} PVC(s) are Bound"
    else
      fail "${pending_pvcs}/${total_pvcs} PVC(s) not Bound"
      if [[ "$VERBOSE" == "true" ]]; then
        local unbound_details
        unbound_details=$(echo "$pvcs_json" | jq -r '.items[] | select(.status.phase != "Bound") | "       - \(.metadata.namespace)/\(.metadata.name): \(.status.phase)"')
        [[ -n "$unbound_details" ]] && log_verbose "$unbound_details"
      fi
    fi
  fi
}

# ─── 6. Security (Kyverno + Trivy) ──────────────────────────────────────────

check_security() {
  section "Security"

  # Kyverno pods (only check Deployment-managed pods, skip Helm hook Jobs)
  if kubectl get namespace kyverno &> /dev/null; then
    local kyverno_pods
    kyverno_pods=$(kubectl get pods -n kyverno -o json 2>/dev/null)

    # Filter to only pods owned by ReplicaSets (i.e. managed by Deployments)
    local managed_total
    managed_total=$(echo "$kyverno_pods" | jq '[.items[] | select(.metadata.ownerReferences[]?.kind == "ReplicaSet")] | length')
    local managed_running
    managed_running=$(echo "$kyverno_pods" | jq '[.items[] | select(.metadata.ownerReferences[]?.kind == "ReplicaSet") | select(.status.phase == "Running")] | length')

    if [[ "$managed_running" -eq "$managed_total" ]] && [[ "$managed_total" -gt 0 ]]; then
      pass "Kyverno pods: ${managed_running}/${managed_total} Running"
    else
      fail "Kyverno pods: ${managed_running}/${managed_total} Running"
    fi

    # Separately warn about stuck Job pods (Helm hooks)
    local stuck_jobs
    stuck_jobs=$(echo "$kyverno_pods" | jq -r '[.items[] | select(.metadata.ownerReferences[]?.kind == "Job") | select(.status.phase != "Succeeded")] | length')
    if [[ "$stuck_jobs" -gt 0 ]]; then
      local stuck_details
      stuck_details=$(echo "$kyverno_pods" | jq -r '.items[] | select(.metadata.ownerReferences[]?.kind == "Job") | select(.status.phase != "Succeeded") | "  \(.metadata.name): \(.status.phase)"')
      warn "${stuck_jobs} Helm hook Job pod(s) stuck"
      log_verbose "$stuck_details"
    fi
  else
    warn "Kyverno namespace not found"
  fi

  # ClusterPolicies
  if kubectl get crd clusterpolicies.kyverno.io &> /dev/null; then
    local policy_count
    policy_count=$(kubectl get clusterpolicies -o name 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$policy_count" -gt 0 ]]; then
      pass "${policy_count} ClusterPolicy(s) found"
    else
      warn "No ClusterPolicies defined"
    fi
  else
    warn "ClusterPolicy CRD not found"
  fi

  # Trivy operator
  if kubectl get namespace trivy-system &> /dev/null; then
    local trivy_ready
    trivy_ready=$(kubectl get deployment trivy-operator -n trivy-system -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

    if [[ "$trivy_ready" -gt 0 ]]; then
      pass "Trivy operator: ${trivy_ready} ready replica(s)"
    else
      fail "Trivy operator not ready"
    fi
  else
    warn "trivy-system namespace not found"
  fi

  # VulnerabilityReports CRD
  if kubectl get crd vulnerabilityreports.aquasecurity.github.io &> /dev/null; then
    pass "VulnerabilityReports CRD exists"
  else
    warn "VulnerabilityReports CRD not found"
  fi
}

# ─── 7. Networking ──────────────────────────────────────────────────────────

check_networking() {
  section "Networking"

  # Detect CNI — check for Cilium or AWS VPC CNI (aws-node)
  local cni_detected=""
  local cilium_ns="kube-system"
  if kubectl get namespace cilium &> /dev/null; then
    cilium_ns="cilium"
  fi

  local cilium_json
  cilium_json=$(kubectl get daemonset cilium -n "$cilium_ns" -o json 2>/dev/null) || true

  if [[ -n "$cilium_json" ]] && [[ "$cilium_json" != "" ]]; then
    cni_detected="cilium"
    local desired
    desired=$(echo "$cilium_json" | jq '.status.desiredNumberScheduled')
    local ready
    ready=$(echo "$cilium_json" | jq '.status.numberReady // 0')

    if [[ "$ready" -ge "$desired" ]] && [[ "$ready" -gt 0 ]]; then
      pass "Cilium DaemonSet: ${ready}/${desired} ready"
    else
      fail "Cilium DaemonSet: ${ready}/${desired} ready"
    fi

    # Hubble relay (only relevant with Cilium)
    local hubble_ready
    hubble_ready=$(kubectl get deployment hubble-relay -n "$cilium_ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

    if [[ "$hubble_ready" -gt 0 ]]; then
      pass "Hubble relay: ${hubble_ready} ready replica(s)"
    else
      warn "Hubble relay not ready"
    fi
  fi

  # Check AWS VPC CNI if Cilium not found
  if [[ -z "$cni_detected" ]]; then
    local awsnode_json
    awsnode_json=$(kubectl get daemonset aws-node -n kube-system -o json 2>/dev/null) || true

    if [[ -n "$awsnode_json" ]] && [[ "$awsnode_json" != "" ]]; then
      cni_detected="vpc-cni"
      local desired
      desired=$(echo "$awsnode_json" | jq '.status.desiredNumberScheduled')
      local ready
      ready=$(echo "$awsnode_json" | jq '.status.numberReady // 0')

      if [[ "$ready" -ge "$desired" ]] && [[ "$ready" -gt 0 ]]; then
        pass "AWS VPC CNI (aws-node): ${ready}/${desired} ready"
      else
        fail "AWS VPC CNI (aws-node): ${ready}/${desired} ready"
      fi
    fi
  fi

  if [[ -z "$cni_detected" ]]; then
    warn "No CNI detected (neither Cilium nor AWS VPC CNI)"
  else
    log_verbose "CNI in use: $cni_detected"
  fi

  # AWS Load Balancer Controller
  local alb_ready
  alb_ready=$(kubectl get deployment aws-load-balancer-controller -n kube-system -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

  if [[ "$alb_ready" -gt 0 ]]; then
    pass "AWS LB Controller: ${alb_ready} ready replica(s)"
  else
    fail "AWS Load Balancer Controller not ready"
  fi

  # External DNS
  if kubectl get namespace external-dns &> /dev/null; then
    local extdns_ready
    extdns_ready=$(kubectl get deployment external-dns -n external-dns -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

    if [[ "$extdns_ready" -gt 0 ]]; then
      pass "External DNS: ${extdns_ready} ready replica(s)"
    else
      fail "External DNS not ready"
    fi
  else
    warn "external-dns namespace not found"
  fi

  # CoreDNS
  local coredns_ready
  coredns_ready=$(kubectl get deployment coredns -n kube-system -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

  if [[ "$coredns_ready" -gt 0 ]]; then
    pass "CoreDNS: ${coredns_ready} ready replica(s)"
  else
    fail "CoreDNS not ready"
  fi

  # DNS resolution — verify kube-dns service has endpoints (no pod creation needed)
  local dns_endpoints
  dns_endpoints=$(kubectl get endpoints kube-dns -n kube-system -o json 2>/dev/null) || true

  if [[ -n "$dns_endpoints" ]] && [[ "$dns_endpoints" != "" ]]; then
    local dns_addresses
    dns_addresses=$(echo "$dns_endpoints" | jq '[.subsets[]?.addresses // [] | length] | add // 0')

    if [[ "$dns_addresses" -gt 0 ]]; then
      pass "DNS service endpoints: ${dns_addresses} address(es) ready"
    else
      fail "DNS service has no ready endpoints"
    fi
  else
    fail "kube-dns service endpoints not found"
  fi
}

# ─── 8. Observability ───────────────────────────────────────────────────────

check_observability() {
  section "Observability"

  # Loki (in monitoring namespace)
  if kubectl get namespace monitoring &> /dev/null; then
    for component in "loki" "loki-chunks-cache" "loki-results-cache"; do
      local sts_json
      sts_json=$(kubectl get statefulset "$component" -n monitoring -o json 2>/dev/null) || true

      if [[ -n "$sts_json" ]] && [[ "$sts_json" != "" ]]; then
        local desired
        desired=$(echo "$sts_json" | jq '.spec.replicas // 1')
        local ready
        ready=$(echo "$sts_json" | jq '.status.readyReplicas // 0')

        if [[ "$ready" -ge "$desired" ]] && [[ "$ready" -gt 0 ]]; then
          pass "Loki $component: ${ready}/${desired} ready"
        else
          fail "Loki $component: ${ready}/${desired} ready"
        fi
      else
        warn "Loki $component StatefulSet not found"
      fi
    done

    # Loki gateway deployment
    local loki_gw_ready
    loki_gw_ready=$(kubectl get deployment loki-gateway -n monitoring -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    if [[ "$loki_gw_ready" -gt 0 ]]; then
      pass "Loki gateway: ${loki_gw_ready} ready replica(s)"
    else
      warn "Loki gateway not ready"
    fi
  else
    warn "monitoring namespace not found"
  fi

  # Tempo (in monitoring namespace)
  if kubectl get namespace monitoring &> /dev/null; then
    local tempo_json
    tempo_json=$(kubectl get statefulset tempo -n monitoring -o json 2>/dev/null) || true

    if [[ -n "$tempo_json" ]] && [[ "$tempo_json" != "" ]]; then
      local desired
      desired=$(echo "$tempo_json" | jq '.spec.replicas // 1')
      local ready
      ready=$(echo "$tempo_json" | jq '.status.readyReplicas // 0')

      if [[ "$ready" -ge "$desired" ]] && [[ "$ready" -gt 0 ]]; then
        pass "Tempo: ${ready}/${desired} ready"
      else
        fail "Tempo: ${ready}/${desired} ready"
      fi
    else
      warn "Tempo StatefulSet not found"
    fi
  fi

  # Grafana Agent (optional — DaemonSet or Deployment)
  local grafana_agent_found=false
  for ns in "monitoring" "grafana" "kube-system"; do
    if kubectl get daemonset grafana-agent -n "$ns" &> /dev/null; then
      local desired
      desired=$(kubectl get daemonset grafana-agent -n "$ns" -o jsonpath='{.status.desiredNumberScheduled}')
      local ready
      ready=$(kubectl get daemonset grafana-agent -n "$ns" -o jsonpath='{.status.numberReady}')
      pass "Grafana Agent DaemonSet ($ns): ${ready}/${desired} ready"
      grafana_agent_found=true
      break
    elif kubectl get deployment grafana-agent -n "$ns" &> /dev/null; then
      local ready
      ready=$(kubectl get deployment grafana-agent -n "$ns" -o jsonpath='{.status.readyReplicas}')
      pass "Grafana Agent Deployment ($ns): ${ready} ready"
      grafana_agent_found=true
      break
    fi
  done
  if [[ "$grafana_agent_found" == "false" ]]; then
    log_verbose "Grafana Agent not found in common namespaces"
  fi

  # PVC check for monitoring namespace (Loki + Tempo)
  if kubectl get namespace monitoring &> /dev/null; then
    local pvcs_json
    pvcs_json=$(kubectl get pvc -n monitoring -o json 2>/dev/null)
    local total
    total=$(echo "$pvcs_json" | jq '.items | length')
    local pending
    pending=$(echo "$pvcs_json" | jq '[.items[] | select(.status.phase != "Bound")] | length')

    if [[ "$total" -gt 0 ]]; then
      if [[ "$pending" -eq 0 ]]; then
        pass "PVCs in monitoring: all ${total} Bound"
      else
        fail "PVCs in monitoring: ${pending}/${total} not Bound"
      fi
    fi
  fi
}

# ─── 9. Certificates & Secrets ──────────────────────────────────────────────

check_certs_and_secrets() {
  section "Certificates & Secrets"

  # cert-manager pods
  if kubectl get namespace cert-manager &> /dev/null; then
    local cm_pods
    cm_pods=$(kubectl get pods -n cert-manager -o json 2>/dev/null)
    local cm_running
    cm_running=$(echo "$cm_pods" | jq '[.items[] | select(.status.phase == "Running")] | length')
    local cm_total
    cm_total=$(echo "$cm_pods" | jq '.items | length')

    if [[ "$cm_running" -eq "$cm_total" ]] && [[ "$cm_total" -gt 0 ]]; then
      pass "cert-manager pods: ${cm_running}/${cm_total} Running"
    else
      fail "cert-manager pods: ${cm_running}/${cm_total} Running"
    fi

    # cert-manager webhook (already checked in addon deployments, verify reachability)
    local webhook_ready
    webhook_ready=$(kubectl get deployment cert-manager-webhook -n cert-manager -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

    if [[ "$webhook_ready" -gt 0 ]]; then
      pass "cert-manager webhook reachable"
    else
      fail "cert-manager webhook not ready"
    fi
  else
    warn "cert-manager namespace not found"
  fi

  # External Secrets operator
  if kubectl get namespace external-secrets &> /dev/null; then
    local es_ready
    es_ready=$(kubectl get deployment external-secrets -n external-secrets -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

    if [[ "$es_ready" -gt 0 ]]; then
      pass "External Secrets operator: ${es_ready} ready replica(s)"
    else
      fail "External Secrets operator not ready"
    fi
  else
    warn "external-secrets namespace not found"
  fi

  # ClusterSecretStore
  if kubectl get crd clustersecretstores.external-secrets.io &> /dev/null; then
    local css_count
    css_count=$(kubectl get clustersecretstore -o name 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$css_count" -gt 0 ]]; then
      pass "${css_count} ClusterSecretStore(s) available"
    else
      warn "No ClusterSecretStore defined"
    fi
  else
    log_verbose "ClusterSecretStore CRD not found"
  fi

  # ExternalSecrets in argocd namespace
  if kubectl get crd externalsecrets.external-secrets.io &> /dev/null; then
    local es_json
    es_json=$(kubectl get externalsecret -n argocd -o json 2>/dev/null) || true

    if [[ -n "$es_json" ]] && [[ "$es_json" != "" ]]; then
      local es_total
      es_total=$(echo "$es_json" | jq '.items | length')
      local es_synced
      es_synced=$(echo "$es_json" | jq '[.items[] | select(.status.conditions[]? | select(.type == "Ready" and .status == "True"))] | length')

      if [[ "$es_total" -gt 0 ]]; then
        if [[ "$es_synced" -eq "$es_total" ]]; then
          pass "ExternalSecrets in argocd: ${es_synced}/${es_total} synced"
        else
          warn "ExternalSecrets in argocd: ${es_synced}/${es_total} synced"
        fi
      fi
    fi
  fi
}

# ─── Summary ─────────────────────────────────────────────────────────────────

print_summary() {
  local total=$((PASSED + FAILED + WARNINGS))

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    local results_array="[]"
    if [[ ${#JSON_RESULTS[@]} -gt 0 ]]; then
      results_array=$(printf '%s,' "${JSON_RESULTS[@]}")
      results_array="[${results_array%,}]"
    fi
    local status="healthy"
    if [[ $FAILED -gt 0 ]]; then
      status="unhealthy"
    elif [[ "$STRICT" == "true" ]] && [[ $WARNINGS -gt 0 ]]; then
      status="unhealthy"
    fi
    echo "{\"environment\":\"$ENVIRONMENT\",\"passed\":$PASSED,\"failed\":$FAILED,\"warnings\":$WARNINGS,\"total\":$total,\"status\":\"$status\",\"results\":$results_array}"
    if [[ "$status" == "unhealthy" ]]; then
      return 1
    fi
    return 0
  fi

  local summary_text="  Summary: ${PASSED} passed, ${FAILED} failed, ${WARNINGS} warnings"
  log "\n${BLUE}╔══════════════════════════════════════════════╗${NC}"
  if [[ $FAILED -eq 0 ]]; then
    log "${BLUE}║${NC}${GREEN}$(_pad "$summary_text")${NC}${BLUE}║${NC}"
  else
    log "${BLUE}║${NC}${RED}$(_pad "$summary_text")${NC}${BLUE}║${NC}"
  fi
  log "${BLUE}╚══════════════════════════════════════════════╝${NC}"

  if [[ "$STRICT" == "true" ]] && [[ $WARNINGS -gt 0 ]]; then
    log "\n${RED}Smoke test FAILED (strict mode: warnings treated as failures)${NC}"
    return 1
  fi

  if [[ $FAILED -gt 0 ]]; then
    log "\n${RED}Smoke test FAILED${NC}"
    return 1
  else
    log "\n${GREEN}Smoke test PASSED${NC}"
    return 0
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  detect_environment

  if [[ "$JSON_OUTPUT" != "true" ]]; then
    log "${BLUE}╔══════════════════════════════════════════════╗${NC}"
    log "${BLUE}║${NC}${BOLD}$(_pad "   EKS Smoke Test — ${ENVIRONMENT}")${NC}${BLUE}║${NC}"
    log "${BLUE}╚══════════════════════════════════════════════╝${NC}"
  fi

  # Cluster basics must succeed to continue
  check_cluster_basics || { print_summary; exit 1; }

  check_argocd
  check_addon_deployments
  check_karpenter
  check_storage
  check_security
  check_networking
  check_observability
  check_certs_and_secrets

  print_summary
}

main "$@"
