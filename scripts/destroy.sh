#!/usr/bin/env bash
#
# EKS Graceful Destroy Script
#
# Tears down the entire EKS cluster cleanly by handling Kubernetes resources
# first (ArgoCD, Karpenter nodes, load balancers, PVCs), then CDK stacks in
# reverse dependency order, with orphaned AWS resource detection at the end.
#
# Usage: ./scripts/destroy.sh [OPTIONS]
#   --environment ENV    Environment to destroy (default: dev)
#   --region REGION      AWS region (default: us-west-2)
#   --auto-approve       Skip confirmation prompts
#   --skip-cdk           Only clean Kubernetes resources, don't destroy stacks
#   --dry-run            Show what would be done without executing
#
# Exit codes:
#   0 - Destroy completed successfully
#   1 - Destroy failed
#   2 - Script error or user abort

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────────

ENVIRONMENT="dev"
REGION="us-west-2"
AUTO_APPROVE=false
SKIP_CDK=false
DRY_RUN=false

CLUSTER_NAME=""
K8S_TIMEOUT=120   # seconds to wait for k8s resource deletion
NODE_TIMEOUT=300  # seconds to wait for node termination
LB_TIMEOUT=120    # seconds to wait for load balancer cleanup
TOTAL_ERRORS=0    # global error counter
START_TIME=0

# ─── Colors ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Parse Arguments ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --auto-approve)
      AUTO_APPROVE=true
      shift
      ;;
    --skip-cdk)
      SKIP_CDK=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      head -16 "$0" | tail -12
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 2
      ;;
  esac
done

# ─── Logging ───────────────────────────────────────────────────────────────────

log()      { echo -e "$1"; }
info()     { log "${BLUE}[INFO]${NC}  $1"; }
ok()       { log "${GREEN}[OK]${NC}    $1"; }
warn()     { log "${YELLOW}[WARN]${NC}  $1"; }
err()      { log "${RED}[ERROR]${NC} $1"; }
phase()    { log "\n${BOLD}━━━ Phase $1 ━━━${NC}"; }
step()     { log "  ${BLUE}▸${NC} $1"; }
dry()      { log "  ${YELLOW}[DRY-RUN]${NC} $1"; }
_pad()     { printf "%-58s" "$1"; }

elapsed() {
  local now; now=$(date +%s)
  local secs=$((now - START_TIME))
  printf '%dm%02ds' $((secs / 60)) $((secs % 60))
}

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    dry "$*"
    return 0
  fi
  "$@"
}

# Run a command, suppress stderr, return true/false
quiet() {
  "$@" 2>/dev/null
}

# ─── Phase 0: Safety Checks ──────────────────────────────────────────────────

preflight_checks() {
  phase "0: Safety Checks"

  # Validate environment
  if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    err "Invalid environment: $ENVIRONMENT (must be dev, staging, or production)"
    exit 2
  fi

  CLUSTER_NAME="${ENVIRONMENT}-eks"

  # Warn for production
  if [[ "$ENVIRONMENT" == "production" ]]; then
    log ""
    log "  ${RED}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
    log "  ${RED}${BOLD}║$(_pad "   WARNING: You are about to destroy PRODUCTION")║${NC}"
    log "  ${RED}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
    log ""
  fi

  # Verify AWS credentials
  step "Checking AWS credentials..."
  if ! aws sts get-caller-identity --region "$REGION" &>/dev/null; then
    err "AWS credentials not valid. Run 'aws configure' or set credentials."
    exit 2
  fi
  local caller_identity
  caller_identity=$(aws sts get-caller-identity --region "$REGION" --output json)
  local account_id
  account_id=$(echo "$caller_identity" | jq -r '.Account')
  local caller_arn
  caller_arn=$(echo "$caller_identity" | jq -r '.Arn')
  ok "AWS credentials valid (account: ${account_id})"

  # Verify kubectl connectivity
  step "Checking kubectl connectivity to cluster ${CLUSTER_NAME}..."
  if ! kubectl cluster-info &>/dev/null; then
    warn "kubectl cannot reach cluster — Kubernetes cleanup phases will be skipped"
    warn "CDK destroy will still proceed (stacks may fail if k8s resources block deletion)"
    KUBECTL_AVAILABLE=false
  else
    ok "kubectl connected"
    KUBECTL_AVAILABLE=true
  fi

  # Summary and confirmation
  log ""
  log "  ${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
  log "  ${BLUE}║${NC}${BOLD}$(_pad "   Destroy Plan")${NC}${BLUE}║${NC}"
  log "  ${BLUE}╠══════════════════════════════════════════════════════════╣${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Environment:  ${ENVIRONMENT}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Region:       ${REGION}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Cluster:      ${CLUSTER_NAME}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Account:      ${account_id}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Identity:     ${caller_arn}")${BLUE}║${NC}"
  log "  ${BLUE}╠══════════════════════════════════════════════════════════╣${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Dry Run:      ${DRY_RUN}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Skip CDK:     ${SKIP_CDK}")${BLUE}║${NC}"
  log "  ${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
  log ""

  if [[ "$AUTO_APPROVE" != "true" ]]; then
    log "  ${RED}This will permanently destroy all resources.${NC}"
    read -rp "  Type the environment name to confirm: " confirm
    if [[ "$confirm" != "$ENVIRONMENT" ]]; then
      err "Confirmation failed — aborting"
      exit 2
    fi
    log ""
  fi
}

# ─── Phase 1: ArgoCD Cleanup ─────────────────────────────────────────────────

cleanup_argocd() {
  phase "1: ArgoCD Cleanup"

  if [[ "$KUBECTL_AVAILABLE" != "true" ]]; then
    warn "kubectl not available — skipping ArgoCD cleanup"
    return 0
  fi

  # Check if ArgoCD CRDs exist
  if ! quiet kubectl get crd applications.argoproj.io; then
    info "ArgoCD CRDs not found — skipping"
    return 0
  fi

  local argocd_errors=0

  # Strategy: strip finalizers first so deletes return immediately.
  # Finalizers cause ArgoCD to cascade-delete child resources, which deadlocks
  # when the target namespace controllers are already gone.

  # 1. Remove finalizers from all ApplicationSets, then delete
  step "Removing finalizers from ApplicationSets..."
  local appsets
  appsets=$(kubectl get applicationsets -n argocd -o name 2>/dev/null || true)
  if [[ -n "$appsets" ]]; then
    while IFS= read -r appset; do
      [[ -z "$appset" ]] && continue
      run kubectl patch "$appset" -n argocd --type=merge \
        -p='{"metadata":{"finalizers":null}}' 2>/dev/null || true
    done <<< "$appsets"
    step "Deleting ApplicationSets..."
    run kubectl delete applicationsets --all -n argocd --wait=false 2>&1 || true
    ok "ApplicationSets removed"
  else
    info "No ApplicationSets found"
  fi

  # 2. Remove finalizers from all Applications, then delete
  step "Removing finalizers from Applications..."
  local apps
  apps=$(kubectl get applications -n argocd -o name 2>/dev/null || true)
  if [[ -n "$apps" ]]; then
    while IFS= read -r app; do
      [[ -z "$app" ]] && continue
      info "Stripping finalizers from $app"
      run kubectl patch "$app" -n argocd --type=merge \
        -p='{"metadata":{"finalizers":null}}' 2>/dev/null || true
    done <<< "$apps"
    step "Deleting all Applications..."
    run kubectl delete applications --all -n argocd --wait=false 2>&1 || true
  else
    info "No ArgoCD Applications found"
  fi

  # 3. Verify Applications are gone (should be immediate after finalizer removal)
  if [[ "$DRY_RUN" != "true" ]]; then
    step "Verifying Applications are gone..."
    local waited=0
    while [[ $waited -lt 30 ]]; do
      local remaining
      remaining=$(kubectl get applications -n argocd -o name 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$remaining" -eq 0 ]]; then
        ok "All Applications removed"
        break
      fi
      info "${remaining} Application(s) remaining... (${waited}s/30s)"
      sleep 5
      waited=$((waited + 5))
    done
    if [[ $waited -ge 30 ]]; then
      local still
      still=$(kubectl get applications -n argocd -o name 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$still" -gt 0 ]]; then
        err "${still} Application(s) could not be removed"
        argocd_errors=$((argocd_errors + 1))
      fi
    fi
  fi

  # 4. Remove finalizers from AppProjects and delete
  step "Cleaning up AppProjects..."
  local projects
  projects=$(kubectl get appprojects -n argocd -o name 2>/dev/null || true)
  if [[ -n "$projects" ]]; then
    while IFS= read -r project; do
      [[ -z "$project" ]] && continue
      [[ "$project" == "appproject/default" ]] && continue
      run kubectl patch "$project" -n argocd --type=merge \
        -p='{"metadata":{"finalizers":null}}' 2>/dev/null || true
      run kubectl delete "$project" -n argocd --wait=false 2>&1 || true
    done <<< "$projects"
  fi

  if [[ "$argocd_errors" -gt 0 ]]; then
    warn "ArgoCD cleanup finished with ${argocd_errors} error(s)"
    TOTAL_ERRORS=$((TOTAL_ERRORS + argocd_errors))
  else
    ok "ArgoCD cleanup complete"
  fi
}

# ─── Phase 2: Karpenter Node Drain ───────────────────────────────────────────

cleanup_karpenter_nodes() {
  phase "2: Karpenter Node Drain"

  if [[ "$KUBECTL_AVAILABLE" != "true" ]]; then
    warn "kubectl not available — skipping Karpenter cleanup"
    return 0
  fi

  local karpenter_errors=0

  # Strategy: strip finalizers first, then delete with --wait=false.
  # Karpenter finalizers block deletion while the controller tries to
  # terminate EC2 instances — if the controller is unhealthy, this deadlocks.

  # 1. NodePools: strip finalizers, delete, then wait for nodes to drain
  step "Deleting Karpenter NodePools..."
  if quiet kubectl get crd nodepools.karpenter.sh; then
    local nodepools
    nodepools=$(kubectl get nodepools -o name 2>/dev/null || true)
    if [[ -n "$nodepools" ]]; then
      # First try graceful delete (gives Karpenter a chance to drain nodes)
      run kubectl delete nodepools --all --wait=false 2>&1 || true

      # Give Karpenter 30s to start draining
      if [[ "$DRY_RUN" != "true" ]]; then
        info "Waiting 30s for Karpenter to initiate node drain..."
        sleep 30

        local remaining_nps
        remaining_nps=$(kubectl get nodepools -o name 2>/dev/null | wc -l | tr -d ' ')
        if [[ "$remaining_nps" -gt 0 ]]; then
          warn "${remaining_nps} NodePool(s) stuck — stripping finalizers"
          local stuck_nps
          stuck_nps=$(kubectl get nodepools -o name 2>/dev/null || true)
          while IFS= read -r np; do
            [[ -z "$np" ]] && continue
            kubectl patch "$np" --type=merge \
              -p='{"metadata":{"finalizers":null}}' 2>/dev/null || true
          done <<< "$stuck_nps"
          sleep 3
        fi

        remaining_nps=$(kubectl get nodepools -o name 2>/dev/null | wc -l | tr -d ' ')
        if [[ "$remaining_nps" -gt 0 ]]; then
          err "${remaining_nps} NodePool(s) could not be deleted"
          karpenter_errors=$((karpenter_errors + 1))
        else
          ok "NodePools deleted"
        fi
      fi
    else
      info "No NodePools found"
    fi
  else
    info "NodePool CRD not found — skipping"
  fi

  # 2. EC2NodeClasses: strip finalizers, then delete
  step "Deleting Karpenter EC2NodeClasses..."
  if quiet kubectl get crd ec2nodeclasses.karpenter.k8s.aws; then
    local nodeclasses
    nodeclasses=$(kubectl get ec2nodeclasses -o name 2>/dev/null || true)
    if [[ -n "$nodeclasses" ]]; then
      # Strip finalizers first
      while IFS= read -r nc; do
        [[ -z "$nc" ]] && continue
        run kubectl patch "$nc" --type=merge \
          -p='{"metadata":{"finalizers":null}}' 2>/dev/null || true
      done <<< "$nodeclasses"

      run kubectl delete ec2nodeclasses --all --wait=false 2>&1 || true

      if [[ "$DRY_RUN" != "true" ]]; then
        sleep 5
        local remaining_ncs
        remaining_ncs=$(kubectl get ec2nodeclasses -o name 2>/dev/null | wc -l | tr -d ' ')
        if [[ "$remaining_ncs" -gt 0 ]]; then
          err "${remaining_ncs} EC2NodeClass(es) could not be deleted"
          karpenter_errors=$((karpenter_errors + 1))
        else
          ok "EC2NodeClasses deleted"
        fi
      fi
    else
      info "No EC2NodeClasses found"
    fi
  else
    info "EC2NodeClass CRD not found — skipping"
  fi

  # 3. NodeClaims: strip finalizers so nodes can be released
  if quiet kubectl get crd nodeclaims.karpenter.sh; then
    local nodeclaims
    nodeclaims=$(kubectl get nodeclaims -o name 2>/dev/null || true)
    if [[ -n "$nodeclaims" ]]; then
      step "Stripping finalizers from NodeClaims..."
      while IFS= read -r claim; do
        [[ -z "$claim" ]] && continue
        run kubectl patch "$claim" --type=merge \
          -p='{"metadata":{"finalizers":null}}' 2>/dev/null || true
      done <<< "$nodeclaims"
      run kubectl delete nodeclaims --all --wait=false 2>&1 || true
    fi
  fi

  # 4. Wait for Karpenter-provisioned nodes to terminate
  step "Waiting for Karpenter nodes to terminate..."
  if [[ "$DRY_RUN" != "true" ]]; then
    local waited=0
    while [[ $waited -lt $NODE_TIMEOUT ]]; do
      # Check both Karpenter-labeled nodes and nodes provisioned by Karpenter nodeclaims
      local karpenter_nodes
      karpenter_nodes=$(kubectl get nodes -l 'karpenter.sh/registered=true' -o name 2>/dev/null | wc -l | tr -d ' ')

      # Also check for nodeclaims that haven't been cleaned up
      local nodeclaims=0
      if quiet kubectl get crd nodeclaims.karpenter.sh; then
        nodeclaims=$(kubectl get nodeclaims -o name 2>/dev/null | wc -l | tr -d ' ')
      fi

      if [[ "$karpenter_nodes" -eq 0 && "$nodeclaims" -eq 0 ]]; then
        ok "All Karpenter nodes terminated"
        break
      fi
      info "${karpenter_nodes} Karpenter node(s), ${nodeclaims} nodeclaim(s) remaining... (${waited}s/${NODE_TIMEOUT}s)"
      sleep 15
      waited=$((waited + 15))
    done
    if [[ $waited -ge $NODE_TIMEOUT ]]; then
      err "Timeout waiting for Karpenter nodes — ${karpenter_nodes} node(s) may be orphaned"
      karpenter_errors=$((karpenter_errors + 1))

      # Force-delete remaining nodeclaims by removing finalizers
      if quiet kubectl get crd nodeclaims.karpenter.sh; then
        local stuck_claims
        stuck_claims=$(kubectl get nodeclaims -o name 2>/dev/null || true)
        if [[ -n "$stuck_claims" ]]; then
          warn "Removing finalizers from stuck NodeClaims"
          while IFS= read -r claim; do
            [[ -z "$claim" ]] && continue
            kubectl patch "$claim" --type=merge \
              -p='{"metadata":{"finalizers":null}}' 2>/dev/null || true
          done <<< "$stuck_claims"
        fi
      fi
    fi
  fi

  if [[ "$karpenter_errors" -gt 0 ]]; then
    warn "Karpenter cleanup finished with ${karpenter_errors} error(s)"
    TOTAL_ERRORS=$((TOTAL_ERRORS + karpenter_errors))
  else
    ok "Karpenter cleanup complete"
  fi
}

# ─── Phase 3: Load Balancer & DNS Cleanup ─────────────────────────────────────

cleanup_load_balancers() {
  phase "3: Load Balancer & DNS Cleanup"

  if [[ "$KUBECTL_AVAILABLE" != "true" ]]; then
    warn "kubectl not available — skipping LB cleanup"
    return 0
  fi

  # 1. Delete all Ingress resources
  step "Deleting all Ingress resources..."
  local ingresses
  ingresses=$(kubectl get ingress --all-namespaces -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}' 2>/dev/null || true)
  if [[ -n "$ingresses" ]]; then
    while IFS= read -r ingress; do
      [[ -z "$ingress" ]] && continue
      local ns="${ingress%%/*}"
      local name="${ingress##*/}"
      info "Deleting ingress ${ns}/${name}"
      run kubectl delete ingress "$name" -n "$ns" --timeout="${K8S_TIMEOUT}s" 2>/dev/null || true
    done <<< "$ingresses"
    ok "Ingress resources deleted"
  else
    info "No Ingress resources found"
  fi

  # 2. Delete all LoadBalancer Services
  step "Deleting all LoadBalancer Services..."
  local lb_services
  lb_services=$(kubectl get services --all-namespaces -o json 2>/dev/null | \
    jq -r '.items[] | select(.spec.type == "LoadBalancer") | "\(.metadata.namespace)/\(.metadata.name)"' || true)
  if [[ -n "$lb_services" ]]; then
    while IFS= read -r svc; do
      [[ -z "$svc" ]] && continue
      local ns="${svc%%/*}"
      local name="${svc##*/}"
      info "Deleting LoadBalancer service ${ns}/${name}"
      run kubectl delete service "$name" -n "$ns" --timeout="${K8S_TIMEOUT}s" 2>/dev/null || true
    done <<< "$lb_services"
    ok "LoadBalancer services deleted"
  else
    info "No LoadBalancer services found"
  fi

  # 3. Wait for ALBs/NLBs to deregister
  step "Waiting for AWS load balancers to deregister..."
  if [[ "$DRY_RUN" != "true" ]]; then
    local waited=0
    while [[ $waited -lt $LB_TIMEOUT ]]; do
      local tagged_lbs
      tagged_lbs=$(aws elbv2 describe-load-balancers --region "$REGION" --output json 2>/dev/null | \
        jq -r ".LoadBalancers[].LoadBalancerArn" || true)

      if [[ -z "$tagged_lbs" ]]; then
        ok "No load balancers found"
        break
      fi

      # Check for LBs tagged with our cluster
      local cluster_lbs=0
      while IFS= read -r lb_arn; do
        [[ -z "$lb_arn" ]] && continue
        local tags
        tags=$(aws elbv2 describe-tags --region "$REGION" --resource-arns "$lb_arn" --output json 2>/dev/null || true)
        if echo "$tags" | jq -e ".TagDescriptions[].Tags[] | select(.Key == \"elbv2.k8s.aws/cluster\" and .Value == \"${CLUSTER_NAME}\")" &>/dev/null; then
          cluster_lbs=$((cluster_lbs + 1))
        fi
      done <<< "$tagged_lbs"

      if [[ "$cluster_lbs" -eq 0 ]]; then
        ok "All cluster load balancers deregistered"
        break
      fi

      info "${cluster_lbs} cluster load balancer(s) remaining... (${waited}s/${LB_TIMEOUT}s)"
      sleep 10
      waited=$((waited + 10))
    done
    if [[ $waited -ge $LB_TIMEOUT ]]; then
      warn "Timeout waiting for load balancers — they may block VPC deletion"
    fi
  fi

  ok "Load balancer cleanup complete"
}

# ─── Phase 4: PVC & Storage Cleanup ──────────────────────────────────────────

cleanup_storage() {
  phase "4: PVC & Storage Cleanup"

  if [[ "$KUBECTL_AVAILABLE" != "true" ]]; then
    warn "kubectl not available — skipping storage cleanup"
    return 0
  fi

  step "Deleting PVCs across all namespaces..."
  local pvcs
  pvcs=$(kubectl get pvc --all-namespaces -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}' 2>/dev/null || true)
  if [[ -n "$pvcs" ]]; then
    while IFS= read -r pvc; do
      [[ -z "$pvc" ]] && continue
      local ns="${pvc%%/*}"
      local name="${pvc##*/}"
      info "Deleting PVC ${ns}/${name}"
      run kubectl delete pvc "$name" -n "$ns" --timeout="${K8S_TIMEOUT}s" 2>/dev/null || true
    done <<< "$pvcs"
    ok "PVCs deleted"
  else
    info "No PVCs found"
  fi

  # Wait for PV cleanup
  step "Waiting for PersistentVolumes to release..."
  if [[ "$DRY_RUN" != "true" ]]; then
    local waited=0
    while [[ $waited -lt 60 ]]; do
      local pv_count
      pv_count=$(kubectl get pv -o name 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$pv_count" -eq 0 ]]; then
        ok "All PersistentVolumes released"
        break
      fi
      info "${pv_count} PV(s) remaining... (${waited}s/60s)"
      sleep 10
      waited=$((waited + 10))
    done
    if [[ $waited -ge 60 ]]; then
      warn "Some PVs may remain — EBS volumes will be checked in orphan cleanup"
    fi
  fi

  ok "Storage cleanup complete"
}

# ─── Phase 5: IAM Instance Profile Cleanup ────────────────────────────────────

cleanup_instance_profiles() {
  phase "5: IAM Instance Profile Cleanup"

  # Karpenter creates instance profiles at runtime (via EC2NodeClass) that
  # reference the CDK-managed node role. CloudFormation can't delete the role
  # while these instance profiles still reference it.
  #
  # Two strategies:
  # 1. Find profiles attached to the known Karpenter node role (works when role exists)
  # 2. Find profiles by name pattern (works even after role is deleted)

  local node_role="${CLUSTER_NAME}-karpenter-node"
  local cleaned_profiles=()

  # Strategy 1: Find profiles by role attachment
  step "Finding instance profiles for role ${node_role}..."
  local profiles
  profiles=$(aws iam list-instance-profiles-for-role \
    --role-name "$node_role" \
    --query 'InstanceProfiles[*].InstanceProfileName' \
    --output text --region "$REGION" 2>/dev/null || true)

  if [[ -n "$profiles" && "$profiles" != "None" ]]; then
    for profile in $profiles; do
      step "Removing role ${node_role} from instance profile ${profile}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws iam remove-role-from-instance-profile --instance-profile-name ${profile} --role-name ${node_role}"
      else
        if aws iam remove-role-from-instance-profile \
          --instance-profile-name "$profile" \
          --role-name "$node_role" \
          --region "$REGION" 2>&1; then
          ok "Removed role from ${profile}"
        else
          warn "Failed to remove role from ${profile}"
        fi
      fi

      # Delete the instance profile if it was created by Karpenter (not CDK)
      if [[ "$profile" != "$node_role" ]]; then
        step "Deleting Karpenter-created instance profile ${profile}..."
        if [[ "$DRY_RUN" == "true" ]]; then
          dry "aws iam delete-instance-profile --instance-profile-name ${profile}"
        else
          aws iam delete-instance-profile \
            --instance-profile-name "$profile" \
            --region "$REGION" 2>&1 || warn "Failed to delete instance profile ${profile}"
          ok "Deleted instance profile ${profile}"
        fi
      fi
      cleaned_profiles+=("$profile")
    done
  else
    info "No instance profiles found via role lookup (role may already be deleted)"
  fi

  # Strategy 2: Find orphaned profiles by name pattern (covers post-role-deletion)
  step "Scanning for orphaned instance profiles matching ${CLUSTER_NAME}*..."
  local all_profiles
  all_profiles=$(aws iam list-instance-profiles \
    --query 'InstanceProfiles[*].InstanceProfileName' \
    --output text --region "$REGION" 2>/dev/null || true)

  if [[ -n "$all_profiles" ]]; then
    for profile in $all_profiles; do
      # Match profiles created by Karpenter or CDK for this cluster
      if [[ "$profile" == "${CLUSTER_NAME}"_* || "$profile" == "${CLUSTER_NAME}-karpenter"* ]]; then
        # Skip if already cleaned in Strategy 1
        local already_cleaned=false
        for cleaned in "${cleaned_profiles[@]+"${cleaned_profiles[@]}"}"; do
          if [[ "$cleaned" == "$profile" ]]; then
            already_cleaned=true
            break
          fi
        done
        if [[ "$already_cleaned" == "true" ]]; then
          continue
        fi

        info "Found orphaned instance profile: ${profile}"

        # Remove any attached roles first
        local attached_roles
        attached_roles=$(aws iam get-instance-profile \
          --instance-profile-name "$profile" \
          --query 'InstanceProfile.Roles[*].RoleName' \
          --output text --region "$REGION" 2>/dev/null || true)

        if [[ -n "$attached_roles" && "$attached_roles" != "None" ]]; then
          for role in $attached_roles; do
            step "Removing role ${role} from orphaned profile ${profile}..."
            run aws iam remove-role-from-instance-profile \
              --instance-profile-name "$profile" \
              --role-name "$role" \
              --region "$REGION" 2>&1 || true
          done
        fi

        step "Deleting orphaned instance profile ${profile}..."
        if [[ "$DRY_RUN" == "true" ]]; then
          dry "aws iam delete-instance-profile --instance-profile-name ${profile}"
        else
          if aws iam delete-instance-profile \
            --instance-profile-name "$profile" \
            --region "$REGION" 2>&1; then
            ok "Deleted orphaned instance profile ${profile}"
          else
            warn "Failed to delete instance profile ${profile}"
          fi
        fi
      fi
    done
  fi

  ok "Instance profile cleanup complete"
}

# ─── Phase 6: CDK Stack Destroy ──────────────────────────────────────────────

destroy_cdk_stacks() {
  phase "6: CDK Stack Destroy (reverse dependency order)"

  if [[ "$SKIP_CDK" == "true" ]]; then
    info "Skipping CDK destroy (--skip-cdk flag)"
    return 0
  fi

  local stacks=(
    "${ENVIRONMENT}-argocd"
    "${ENVIRONMENT}-karpenter"
    "${ENVIRONMENT}-bootstrap"
    "${ENVIRONMENT}-cluster"
    "${ENVIRONMENT}-network"
  )

  local cdk_errors=0
  for stack in "${stacks[@]}"; do
    step "Destroying stack: ${stack}"
    if [[ "$DRY_RUN" == "true" ]]; then
      dry "npx cdk destroy ${stack} --force -c environment=${ENVIRONMENT} -c region=${REGION}"
    else
      if npx cdk destroy "$stack" --force \
        -c "environment=${ENVIRONMENT}" \
        -c "region=${REGION}" 2>&1; then
        ok "Stack ${stack} destroyed"
      else
        warn "Stack ${stack} failed — checking if DELETE_FAILED..."
        # If stack is in DELETE_FAILED, retry via CloudFormation directly
        local stack_status
        stack_status=$(aws cloudformation describe-stacks \
          --stack-name "$stack" --region "$REGION" \
          --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")

        if [[ "$stack_status" == "DELETE_FAILED" ]]; then
          info "Stack in DELETE_FAILED — retrying with CloudFormation delete (skip failed resources)"
          # Get the resources that failed to delete
          local failed_resources
          failed_resources=$(aws cloudformation describe-stack-events \
            --stack-name "$stack" --region "$REGION" \
            --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`].LogicalResourceId' \
            --output text 2>/dev/null || true)

          if [[ -n "$failed_resources" ]]; then
            local retain_args=()
            for resource in $failed_resources; do
              retain_args+=(--retain-resources "$resource")
            done
            info "Retaining failed resources: ${failed_resources}"
            if aws cloudformation delete-stack \
              --stack-name "$stack" --region "$REGION" \
              "${retain_args[@]}" 2>&1; then
              info "Waiting for stack deletion..."
              aws cloudformation wait stack-delete-complete \
                --stack-name "$stack" --region "$REGION" 2>&1 || true
              # Verify
              local new_status
              new_status=$(aws cloudformation describe-stacks \
                --stack-name "$stack" --region "$REGION" \
                --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
              if [[ "$new_status" == "NOT_FOUND" ]]; then
                ok "Stack ${stack} destroyed (retained failed resources for manual cleanup)"
                continue
              fi
            fi
          fi
        fi

        err "Failed to destroy stack ${stack} (status: ${stack_status})"
        cdk_errors=$((cdk_errors + 1))
        warn "Continuing with remaining stacks..."
      fi
    fi
  done

  if [[ "$cdk_errors" -gt 0 ]]; then
    warn "CDK destroy finished with ${cdk_errors} failed stack(s)"
    TOTAL_ERRORS=$((TOTAL_ERRORS + cdk_errors))
  else
    ok "CDK stack destroy complete"
  fi
}

# ─── Phase 7: VPC Cleanup (retained resources) ──────────────────────────────

cleanup_vpc_resources() {
  phase "7: VPC Cleanup (retained resources)"

  # When the network stack fails to delete (e.g., subnet has dependencies),
  # CDK retries with --retain-resources. This leaves behind VPC endpoints,
  # ENIs, subnets, security groups, and the VPC itself. Clean them up.

  # Find the VPC by cluster tag
  step "Finding VPC for cluster ${CLUSTER_NAME}..."
  local vpc_id
  vpc_id=$(aws ec2 describe-vpcs --region "$REGION" \
    --filters "Name=tag:Name,Values=${CLUSTER_NAME}*" \
    --query 'Vpcs[0].VpcId' --output text 2>/dev/null || echo "None")

  # Also try the environment-prefixed name
  if [[ "$vpc_id" == "None" || -z "$vpc_id" ]]; then
    vpc_id=$(aws ec2 describe-vpcs --region "$REGION" \
      --filters "Name=tag:Name,Values=${ENVIRONMENT}*" \
      --query 'Vpcs[0].VpcId' --output text 2>/dev/null || echo "None")
  fi

  if [[ "$vpc_id" == "None" || -z "$vpc_id" ]]; then
    ok "No orphaned VPC found for cluster ${CLUSTER_NAME}"
    return 0
  fi

  info "Found VPC: ${vpc_id}"

  # 1. Delete VPC Endpoints (they create ENIs that block subnet deletion)
  step "Deleting VPC endpoints in ${vpc_id}..."
  local endpoints
  endpoints=$(aws ec2 describe-vpc-endpoints --region "$REGION" \
    --filters "Name=vpc-id,Values=${vpc_id}" \
    --query 'VpcEndpoints[*].VpcEndpointId' --output text 2>/dev/null || true)

  if [[ -n "$endpoints" && "$endpoints" != "None" ]]; then
    for endpoint_id in $endpoints; do
      [[ -z "$endpoint_id" ]] && continue
      info "Deleting VPC endpoint ${endpoint_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 delete-vpc-endpoints --vpc-endpoint-ids ${endpoint_id}"
      else
        aws ec2 delete-vpc-endpoints --region "$REGION" \
          --vpc-endpoint-ids "$endpoint_id" 2>&1 || warn "Failed to delete endpoint ${endpoint_id}"
      fi
    done

    # Wait for endpoint ENIs to be released
    if [[ "$DRY_RUN" != "true" ]]; then
      step "Waiting for VPC endpoint ENIs to release..."
      local waited=0
      while [[ $waited -lt 120 ]]; do
        local eni_count
        eni_count=$(aws ec2 describe-network-interfaces --region "$REGION" \
          --filters "Name=vpc-id,Values=${vpc_id}" "Name=interface-type,Values=vpc_endpoint" \
          --query 'length(NetworkInterfaces)' --output text 2>/dev/null || echo "0")
        if [[ "$eni_count" -eq 0 ]]; then
          ok "VPC endpoint ENIs released"
          break
        fi
        info "${eni_count} endpoint ENI(s) remaining... (${waited}s/120s)"
        sleep 10
        waited=$((waited + 10))
      done
      if [[ $waited -ge 120 ]]; then
        warn "Timeout waiting for endpoint ENIs to release"
      fi
    fi
  else
    info "No VPC endpoints found"
  fi

  # 2. Delete orphaned ENIs (available status only)
  step "Deleting orphaned ENIs in ${vpc_id}..."
  local enis
  enis=$(aws ec2 describe-network-interfaces --region "$REGION" \
    --filters "Name=vpc-id,Values=${vpc_id}" "Name=status,Values=available" \
    --query 'NetworkInterfaces[*].NetworkInterfaceId' --output text 2>/dev/null || true)

  if [[ -n "$enis" && "$enis" != "None" ]]; then
    for eni_id in $enis; do
      [[ -z "$eni_id" ]] && continue
      info "Deleting ENI ${eni_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 delete-network-interface --network-interface-id ${eni_id}"
      else
        aws ec2 delete-network-interface --region "$REGION" \
          --network-interface-id "$eni_id" 2>&1 || warn "Failed to delete ENI ${eni_id}"
      fi
    done
  else
    info "No orphaned ENIs found"
  fi

  # Check for in-use ENIs that might block deletion
  local in_use_enis
  in_use_enis=$(aws ec2 describe-network-interfaces --region "$REGION" \
    --filters "Name=vpc-id,Values=${vpc_id}" \
    --query 'length(NetworkInterfaces)' --output text 2>/dev/null || echo "0")
  if [[ "$in_use_enis" -gt 0 ]]; then
    warn "${in_use_enis} ENI(s) still in use in VPC — these may block deletion"
  fi

  # 3. Delete security groups (non-default)
  step "Deleting security groups in ${vpc_id}..."
  local sgs
  sgs=$(aws ec2 describe-security-groups --region "$REGION" \
    --filters "Name=vpc-id,Values=${vpc_id}" \
    --query 'SecurityGroups[?GroupName!=`default`].[GroupId,GroupName]' --output text 2>/dev/null || true)

  if [[ -n "$sgs" ]]; then
    # First pass: remove all ingress/egress rules that reference other SGs in this VPC
    # (cross-references block SG deletion)
    while IFS=$'\t' read -r sg_id sg_name; do
      [[ -z "$sg_id" ]] && continue
      if [[ "$DRY_RUN" != "true" ]]; then
        # Remove ingress rules referencing other SGs
        aws ec2 describe-security-group-rules --region "$REGION" \
          --filters "Name=group-id,Values=${sg_id}" \
          --query 'SecurityGroupRules[?ReferencedGroupInfo!=null].SecurityGroupRuleId' \
          --output text 2>/dev/null | tr '\t' '\n' | while IFS= read -r rule_id; do
          [[ -z "$rule_id" ]] && continue
          aws ec2 revoke-security-group-ingress --region "$REGION" \
            --group-id "$sg_id" --security-group-rule-ids "$rule_id" 2>/dev/null || true
          aws ec2 revoke-security-group-egress --region "$REGION" \
            --group-id "$sg_id" --security-group-rule-ids "$rule_id" 2>/dev/null || true
        done
      fi
    done <<< "$sgs"

    # Second pass: delete the SGs
    while IFS=$'\t' read -r sg_id sg_name; do
      [[ -z "$sg_id" ]] && continue
      info "Deleting security group ${sg_name} (${sg_id})..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 delete-security-group --group-id ${sg_id}"
      else
        aws ec2 delete-security-group --region "$REGION" \
          --group-id "$sg_id" 2>&1 || warn "Failed to delete SG ${sg_id}"
      fi
    done <<< "$sgs"
  else
    info "No non-default security groups found"
  fi

  # 4. Delete subnets
  step "Deleting subnets in ${vpc_id}..."
  local subnets
  subnets=$(aws ec2 describe-subnets --region "$REGION" \
    --filters "Name=vpc-id,Values=${vpc_id}" \
    --query 'Subnets[*].SubnetId' --output text 2>/dev/null || true)

  if [[ -n "$subnets" && "$subnets" != "None" ]]; then
    for subnet_id in $subnets; do
      [[ -z "$subnet_id" ]] && continue
      info "Deleting subnet ${subnet_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 delete-subnet --subnet-id ${subnet_id}"
      else
        aws ec2 delete-subnet --region "$REGION" \
          --subnet-id "$subnet_id" 2>&1 || warn "Failed to delete subnet ${subnet_id}"
      fi
    done
  else
    info "No subnets found"
  fi

  # 5. Detach and delete internet gateways
  step "Deleting internet gateways in ${vpc_id}..."
  local igws
  igws=$(aws ec2 describe-internet-gateways --region "$REGION" \
    --filters "Name=attachment.vpc-id,Values=${vpc_id}" \
    --query 'InternetGateways[*].InternetGatewayId' --output text 2>/dev/null || true)

  if [[ -n "$igws" && "$igws" != "None" ]]; then
    for igw_id in $igws; do
      [[ -z "$igw_id" ]] && continue
      info "Detaching and deleting IGW ${igw_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 detach-internet-gateway --internet-gateway-id ${igw_id} --vpc-id ${vpc_id}"
        dry "aws ec2 delete-internet-gateway --internet-gateway-id ${igw_id}"
      else
        aws ec2 detach-internet-gateway --region "$REGION" \
          --internet-gateway-id "$igw_id" --vpc-id "$vpc_id" 2>&1 || true
        aws ec2 delete-internet-gateway --region "$REGION" \
          --internet-gateway-id "$igw_id" 2>&1 || warn "Failed to delete IGW ${igw_id}"
      fi
    done
  fi

  # 6. Delete route tables (non-main)
  step "Deleting route tables in ${vpc_id}..."
  local rtbs
  rtbs=$(aws ec2 describe-route-tables --region "$REGION" \
    --filters "Name=vpc-id,Values=${vpc_id}" \
    --query 'RouteTables[?Associations[?Main!=`true`]].RouteTableId' --output text 2>/dev/null || true)

  if [[ -n "$rtbs" && "$rtbs" != "None" ]]; then
    for rtb_id in $rtbs; do
      [[ -z "$rtb_id" ]] && continue
      # Disassociate first
      local assoc_ids
      assoc_ids=$(aws ec2 describe-route-tables --region "$REGION" \
        --route-table-ids "$rtb_id" \
        --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId' --output text 2>/dev/null || true)
      if [[ -n "$assoc_ids" && "$assoc_ids" != "None" ]]; then
        for assoc_id in $assoc_ids; do
          [[ -z "$assoc_id" ]] && continue
          run aws ec2 disassociate-route-table --region "$REGION" \
            --association-id "$assoc_id" 2>&1 || true
        done
      fi
      info "Deleting route table ${rtb_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 delete-route-table --route-table-id ${rtb_id}"
      else
        aws ec2 delete-route-table --region "$REGION" \
          --route-table-id "$rtb_id" 2>&1 || warn "Failed to delete route table ${rtb_id}"
      fi
    done
  fi

  # 7. Delete NAT gateways
  step "Deleting NAT gateways in ${vpc_id}..."
  local nat_gws
  nat_gws=$(aws ec2 describe-nat-gateways --region "$REGION" \
    --filter "Name=vpc-id,Values=${vpc_id}" "Name=state,Values=available" \
    --query 'NatGateways[*].NatGatewayId' --output text 2>/dev/null || true)

  if [[ -n "$nat_gws" && "$nat_gws" != "None" ]]; then
    for nat_id in $nat_gws; do
      [[ -z "$nat_id" ]] && continue
      info "Deleting NAT gateway ${nat_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 delete-nat-gateway --nat-gateway-id ${nat_id}"
      else
        aws ec2 delete-nat-gateway --region "$REGION" \
          --nat-gateway-id "$nat_id" 2>&1 || warn "Failed to delete NAT GW ${nat_id}"
      fi
    done

    # Wait for NAT gateways to delete (releases EIPs and ENIs)
    if [[ "$DRY_RUN" != "true" ]]; then
      step "Waiting for NAT gateways to delete..."
      local waited=0
      while [[ $waited -lt 120 ]]; do
        local active_nats
        active_nats=$(aws ec2 describe-nat-gateways --region "$REGION" \
          --filter "Name=vpc-id,Values=${vpc_id}" "Name=state,Values=available,deleting" \
          --query 'length(NatGateways)' --output text 2>/dev/null || echo "0")
        if [[ "$active_nats" -eq 0 ]]; then
          ok "NAT gateways deleted"
          break
        fi
        info "${active_nats} NAT gateway(s) still deleting... (${waited}s/120s)"
        sleep 10
        waited=$((waited + 10))
      done
    fi
  fi

  # 8. Release Elastic IPs tagged with our cluster
  step "Releasing Elastic IPs for cluster..."
  local eips
  eips=$(aws ec2 describe-addresses --region "$REGION" \
    --filters "Name=tag:Name,Values=*${CLUSTER_NAME}*" \
    --query 'Addresses[?AssociationId==null].AllocationId' --output text 2>/dev/null || true)

  if [[ -n "$eips" && "$eips" != "None" ]]; then
    for eip_id in $eips; do
      [[ -z "$eip_id" ]] && continue
      info "Releasing EIP ${eip_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 release-address --allocation-id ${eip_id}"
      else
        aws ec2 release-address --region "$REGION" \
          --allocation-id "$eip_id" 2>&1 || warn "Failed to release EIP ${eip_id}"
      fi
    done
  fi

  # Also try environment-prefixed EIPs
  local env_eips
  env_eips=$(aws ec2 describe-addresses --region "$REGION" \
    --filters "Name=tag:Name,Values=*${ENVIRONMENT}*" \
    --query 'Addresses[?AssociationId==null].AllocationId' --output text 2>/dev/null || true)

  if [[ -n "$env_eips" && "$env_eips" != "None" ]]; then
    for eip_id in $env_eips; do
      [[ -z "$eip_id" ]] && continue
      # Skip if already released above
      if [[ -n "$eips" ]] && echo "$eips" | grep -q "$eip_id"; then
        continue
      fi
      info "Releasing EIP ${eip_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 release-address --allocation-id ${eip_id}"
      else
        aws ec2 release-address --region "$REGION" \
          --allocation-id "$eip_id" 2>&1 || warn "Failed to release EIP ${eip_id}"
      fi
    done
  fi

  # 9. Finally, delete the VPC itself
  step "Deleting VPC ${vpc_id}..."
  if [[ "$DRY_RUN" == "true" ]]; then
    dry "aws ec2 delete-vpc --vpc-id ${vpc_id}"
  else
    if aws ec2 delete-vpc --region "$REGION" --vpc-id "$vpc_id" 2>&1; then
      ok "VPC ${vpc_id} deleted"
    else
      warn "Failed to delete VPC ${vpc_id} — some resources may still be attached"
      TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
  fi

  ok "VPC cleanup complete"
}

# ─── Phase 8: Orphan Cleanup ─────────────────────────────────────────────────

check_orphaned_resources() {
  phase "8: Orphan Resource Cleanup (best-effort)"

  local orphans_found=false
  local orphan_errors=0

  # 1. Orphaned Load Balancers — find and delete
  step "Checking for orphaned load balancers..."
  local tagged_lbs
  tagged_lbs=$(aws elbv2 describe-load-balancers --region "$REGION" --output json 2>/dev/null || true)
  if [[ -n "$tagged_lbs" ]]; then
    local lb_arns
    lb_arns=$(echo "$tagged_lbs" | jq -r '.LoadBalancers[].LoadBalancerArn' || true)
    while IFS= read -r lb_arn; do
      [[ -z "$lb_arn" ]] && continue
      local tags
      tags=$(aws elbv2 describe-tags --region "$REGION" --resource-arns "$lb_arn" --output json 2>/dev/null || true)
      if echo "$tags" | jq -e ".TagDescriptions[].Tags[] | select(.Key == \"elbv2.k8s.aws/cluster\" and .Value == \"${CLUSTER_NAME}\")" &>/dev/null; then
        local lb_name
        lb_name=$(echo "$tagged_lbs" | jq -r ".LoadBalancers[] | select(.LoadBalancerArn == \"$lb_arn\") | .LoadBalancerName")
        warn "Orphaned Load Balancer: ${lb_name} (${lb_arn})"
        orphans_found=true

        # Delete listeners first, then the LB
        if [[ "$DRY_RUN" == "true" ]]; then
          dry "aws elbv2 delete-load-balancer --load-balancer-arn ${lb_arn}"
        else
          info "Deleting orphaned load balancer ${lb_name}..."
          aws elbv2 delete-load-balancer --region "$REGION" \
            --load-balancer-arn "$lb_arn" 2>&1 || {
            warn "Failed to delete LB ${lb_name}"
            orphan_errors=$((orphan_errors + 1))
          }
        fi
      fi
    done <<< "$lb_arns"
  fi
  if [[ "$orphans_found" != "true" ]]; then
    ok "No orphaned load balancers"
  fi

  # Wait for LBs to finish deleting (they release ENIs/SGs)
  if [[ "$orphans_found" == "true" && "$DRY_RUN" != "true" ]]; then
    step "Waiting for orphaned LBs to finish deleting..."
    sleep 15
  fi

  # 2. Orphaned Target Groups
  step "Checking for orphaned target groups..."
  local tgs
  tgs=$(aws elbv2 describe-target-groups --region "$REGION" \
    --query 'TargetGroups[?length(LoadBalancerArns)==`0`].[TargetGroupArn,TargetGroupName]' \
    --output text 2>/dev/null || true)
  if [[ -n "$tgs" ]]; then
    while IFS=$'\t' read -r tg_arn tg_name; do
      [[ -z "$tg_arn" ]] && continue
      # Check if tagged with our cluster
      local tg_tags
      tg_tags=$(aws elbv2 describe-tags --region "$REGION" --resource-arns "$tg_arn" --output json 2>/dev/null || true)
      if echo "$tg_tags" | jq -e ".TagDescriptions[].Tags[] | select(.Key == \"elbv2.k8s.aws/cluster\" and .Value == \"${CLUSTER_NAME}\")" &>/dev/null; then
        info "Deleting orphaned target group ${tg_name}..."
        if [[ "$DRY_RUN" == "true" ]]; then
          dry "aws elbv2 delete-target-group --target-group-arn ${tg_arn}"
        else
          aws elbv2 delete-target-group --region "$REGION" \
            --target-group-arn "$tg_arn" 2>&1 || warn "Failed to delete TG ${tg_name}"
        fi
      fi
    done <<< "$tgs"
  fi

  # 3. Orphaned Security Groups — find and delete
  orphans_found=false
  step "Checking for orphaned security groups..."
  local all_orphan_sgs=()

  local sgs
  sgs=$(aws ec2 describe-security-groups --region "$REGION" \
    --filters "Name=tag:kubernetes.io/cluster/${CLUSTER_NAME},Values=owned" \
    --query 'SecurityGroups[*].[GroupId,GroupName]' --output text 2>/dev/null || true)
  if [[ -n "$sgs" ]]; then
    while IFS=$'\t' read -r sg_id sg_name; do
      [[ -z "$sg_id" ]] && continue
      warn "Orphaned Security Group: ${sg_name} (${sg_id})"
      all_orphan_sgs+=("$sg_id")
      orphans_found=true
    done <<< "$sgs"
  fi

  local eks_sgs
  eks_sgs=$(aws ec2 describe-security-groups --region "$REGION" \
    --filters "Name=tag:elbv2.k8s.aws/cluster,Values=${CLUSTER_NAME}" \
    --query 'SecurityGroups[*].[GroupId,GroupName]' --output text 2>/dev/null || true)
  if [[ -n "$eks_sgs" ]]; then
    while IFS=$'\t' read -r sg_id sg_name; do
      [[ -z "$sg_id" ]] && continue
      # Avoid duplicates
      local is_dup=false
      for existing in "${all_orphan_sgs[@]+"${all_orphan_sgs[@]}"}"; do
        [[ "$existing" == "$sg_id" ]] && is_dup=true && break
      done
      if [[ "$is_dup" == "false" ]]; then
        warn "Orphaned Security Group (LB): ${sg_name} (${sg_id})"
        all_orphan_sgs+=("$sg_id")
        orphans_found=true
      fi
    done <<< "$eks_sgs"
  fi

  # Delete orphaned SGs (remove cross-references first)
  if [[ "${#all_orphan_sgs[@]}" -gt 0 ]]; then
    for sg_id in "${all_orphan_sgs[@]}"; do
      if [[ "$DRY_RUN" != "true" ]]; then
        # Remove ingress/egress rules referencing other SGs
        aws ec2 describe-security-group-rules --region "$REGION" \
          --filters "Name=group-id,Values=${sg_id}" \
          --query 'SecurityGroupRules[?ReferencedGroupInfo!=null].SecurityGroupRuleId' \
          --output text 2>/dev/null | tr '\t' '\n' | while IFS= read -r rule_id; do
          [[ -z "$rule_id" ]] && continue
          aws ec2 revoke-security-group-ingress --region "$REGION" \
            --group-id "$sg_id" --security-group-rule-ids "$rule_id" 2>/dev/null || true
          aws ec2 revoke-security-group-egress --region "$REGION" \
            --group-id "$sg_id" --security-group-rule-ids "$rule_id" 2>/dev/null || true
        done
      fi
    done
    for sg_id in "${all_orphan_sgs[@]}"; do
      info "Deleting orphaned SG ${sg_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 delete-security-group --group-id ${sg_id}"
      else
        aws ec2 delete-security-group --region "$REGION" \
          --group-id "$sg_id" 2>&1 || {
          warn "Failed to delete SG ${sg_id}"
          orphan_errors=$((orphan_errors + 1))
        }
      fi
    done
  fi

  if [[ "$orphans_found" != "true" ]]; then
    ok "No orphaned security groups"
  fi

  # 4. Orphaned EBS Volumes — find and delete
  orphans_found=false
  step "Checking for orphaned EBS volumes..."
  local volumes
  volumes=$(aws ec2 describe-volumes --region "$REGION" \
    --filters "Name=tag:kubernetes.io/cluster/${CLUSTER_NAME},Values=owned" "Name=status,Values=available" \
    --query 'Volumes[*].[VolumeId,Size,Tags[?Key==`kubernetes.io/created-for/pvc/name`].Value|[0]]' \
    --output text 2>/dev/null || true)

  # Also check for CSI driver tagged volumes
  local csi_volumes
  csi_volumes=$(aws ec2 describe-volumes --region "$REGION" \
    --filters "Name=tag:ebs.csi.aws.com/cluster,Values=true" "Name=status,Values=available" \
    --query 'Volumes[*].[VolumeId,Size,Tags[?Key==`kubernetes.io/created-for/pvc/name`].Value|[0]]' \
    --output text 2>/dev/null || true)

  local all_volumes=""
  [[ -n "$volumes" ]] && all_volumes="$volumes"
  [[ -n "$csi_volumes" ]] && all_volumes="${all_volumes}${all_volumes:+$'\n'}${csi_volumes}"

  if [[ -n "$all_volumes" ]]; then
    local deleted_vols=()
    while IFS=$'\t' read -r vol_id size pvc_name; do
      [[ -z "$vol_id" ]] && continue
      # Avoid duplicates
      local is_dup=false
      for existing in "${deleted_vols[@]+"${deleted_vols[@]}"}"; do
        [[ "$existing" == "$vol_id" ]] && is_dup=true && break
      done
      [[ "$is_dup" == "true" ]] && continue

      warn "Orphaned EBS Volume: ${vol_id} (${size}GiB, pvc: ${pvc_name:-unknown})"
      orphans_found=true
      deleted_vols+=("$vol_id")

      info "Deleting orphaned volume ${vol_id}..."
      if [[ "$DRY_RUN" == "true" ]]; then
        dry "aws ec2 delete-volume --volume-id ${vol_id}"
      else
        aws ec2 delete-volume --region "$REGION" \
          --volume-id "$vol_id" 2>&1 || {
          warn "Failed to delete volume ${vol_id}"
          orphan_errors=$((orphan_errors + 1))
        }
      fi
    done <<< "$all_volumes"
  fi
  if [[ "$orphans_found" != "true" ]]; then
    ok "No orphaned EBS volumes"
  fi

  # 5. Orphaned ENIs — find and delete
  orphans_found=false
  step "Checking for orphaned ENIs..."
  local all_orphan_enis=()

  local enis
  enis=$(aws ec2 describe-network-interfaces --region "$REGION" \
    --filters "Name=tag:cluster.k8s.amazonaws.com/name,Values=${CLUSTER_NAME}" "Name=status,Values=available" \
    --query 'NetworkInterfaces[*].[NetworkInterfaceId,Description]' \
    --output text 2>/dev/null || true)
  if [[ -n "$enis" ]]; then
    while IFS=$'\t' read -r eni_id description; do
      [[ -z "$eni_id" ]] && continue
      warn "Orphaned ENI: ${eni_id} (${description})"
      all_orphan_enis+=("$eni_id")
      orphans_found=true
    done <<< "$enis"
  fi

  local eks_enis
  eks_enis=$(aws ec2 describe-network-interfaces --region "$REGION" \
    --filters "Name=tag:kubernetes.io/cluster/${CLUSTER_NAME},Values=owned" "Name=status,Values=available" \
    --query 'NetworkInterfaces[*].[NetworkInterfaceId,Description]' \
    --output text 2>/dev/null || true)
  if [[ -n "$eks_enis" ]]; then
    while IFS=$'\t' read -r eni_id description; do
      [[ -z "$eni_id" ]] && continue
      local is_dup=false
      for existing in "${all_orphan_enis[@]+"${all_orphan_enis[@]}"}"; do
        [[ "$existing" == "$eni_id" ]] && is_dup=true && break
      done
      if [[ "$is_dup" == "false" ]]; then
        warn "Orphaned ENI: ${eni_id} (${description})"
        all_orphan_enis+=("$eni_id")
        orphans_found=true
      fi
    done <<< "$eks_enis"
  fi

  # Delete orphaned ENIs
  for eni_id in "${all_orphan_enis[@]+"${all_orphan_enis[@]}"}"; do
    info "Deleting orphaned ENI ${eni_id}..."
    if [[ "$DRY_RUN" == "true" ]]; then
      dry "aws ec2 delete-network-interface --network-interface-id ${eni_id}"
    else
      aws ec2 delete-network-interface --region "$REGION" \
        --network-interface-id "$eni_id" 2>&1 || {
        warn "Failed to delete ENI ${eni_id}"
        orphan_errors=$((orphan_errors + 1))
      }
    fi
  done

  if [[ "$orphans_found" != "true" ]]; then
    ok "No orphaned ENIs"
  fi

  # 6. Orphaned Instance Profiles (final sweep)
  step "Final sweep for orphaned instance profiles..."
  local all_profiles
  all_profiles=$(aws iam list-instance-profiles \
    --query 'InstanceProfiles[*].InstanceProfileName' \
    --output text --region "$REGION" 2>/dev/null || true)
  if [[ -n "$all_profiles" ]]; then
    for profile in $all_profiles; do
      if [[ "$profile" == "${CLUSTER_NAME}"_* || "$profile" == "${CLUSTER_NAME}-karpenter"* ]]; then
        warn "Orphaned Instance Profile: ${profile}"
        local attached_roles
        attached_roles=$(aws iam get-instance-profile \
          --instance-profile-name "$profile" \
          --query 'InstanceProfile.Roles[*].RoleName' \
          --output text --region "$REGION" 2>/dev/null || true)
        if [[ -n "$attached_roles" && "$attached_roles" != "None" ]]; then
          for role in $attached_roles; do
            run aws iam remove-role-from-instance-profile \
              --instance-profile-name "$profile" --role-name "$role" \
              --region "$REGION" 2>&1 || true
          done
        fi
        if [[ "$DRY_RUN" == "true" ]]; then
          dry "aws iam delete-instance-profile --instance-profile-name ${profile}"
        else
          aws iam delete-instance-profile --instance-profile-name "$profile" \
            --region "$REGION" 2>&1 || warn "Failed to delete profile ${profile}"
        fi
      fi
    done
  fi

  if [[ "$orphan_errors" -gt 0 ]]; then
    warn "Orphan cleanup finished with ${orphan_errors} error(s)"
    TOTAL_ERRORS=$((TOTAL_ERRORS + orphan_errors))
  else
    ok "Orphan cleanup complete"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  START_TIME=$(date +%s)

  log "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
  log "${BLUE}║${NC}${BOLD}$(_pad "     EKS Graceful Destroy — ${ENVIRONMENT}")${NC}${BLUE}║${NC}"
  log "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

  KUBECTL_AVAILABLE=true

  preflight_checks
  cleanup_argocd
  cleanup_karpenter_nodes
  cleanup_load_balancers
  cleanup_storage
  cleanup_instance_profiles
  destroy_cdk_stacks
  cleanup_vpc_resources
  check_orphaned_resources

  log ""
  if [[ "$TOTAL_ERRORS" -gt 0 ]]; then
    local dur; dur=$(elapsed)
    log "${RED}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
    log "${RED}${BOLD}║$(_pad "   Destroy completed with ${TOTAL_ERRORS} error(s) — ${ENVIRONMENT}")║${NC}"
    log "${RED}${BOLD}║$(_pad "   Duration: ${dur}")║${NC}"
    log "${RED}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
    exit 1
  else
    local dur; dur=$(elapsed)
    log "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
    log "${GREEN}${BOLD}║$(_pad "   Destroy complete — ${ENVIRONMENT}")║${NC}"
    log "${GREEN}${BOLD}║$(_pad "   Duration: ${dur}")║${NC}"
    log "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  fi
}

main "$@"
