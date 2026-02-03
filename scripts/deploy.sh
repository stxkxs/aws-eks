#!/usr/bin/env bash
#
# EKS Deploy Script
#
# Deploys the full EKS cluster via CDK with pre-flight checks, build,
# test, diff preview, and post-deploy health validation.
#
# Usage: ./scripts/deploy.sh [OPTIONS]
#   --environment ENV    Environment to deploy (default: dev)
#   --region REGION      AWS region (default: us-west-2)
#   --auto-approve       Skip confirmation prompts
#   --skip-tests         Skip Jest test suite
#   --dry-run            Preview only
#   --profile PROFILE    AWS CLI profile
#
# Exit codes:
#   0 - Deploy completed successfully
#   1 - Deploy failed
#   2 - Script error or user abort

set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ─── Configuration ─────────────────────────────────────────────────────────────

ENVIRONMENT="dev"
REGION="us-west-2"
AUTO_APPROVE=false
SKIP_TESTS=false
DRY_RUN=false
AWS_PROFILE_FLAG=""
TOTAL_ERRORS=0
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
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --profile)
      AWS_PROFILE_FLAG="$2"
      export AWS_PROFILE="$2"
      shift 2
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

quiet() {
  "$@" 2>/dev/null
}

# ─── Phase 0: Pre-flight Checks ──────────────────────────────────────────────

preflight_checks() {
  phase "0: Pre-flight Checks"

  # Validate environment
  if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    err "Invalid environment: $ENVIRONMENT (must be dev, staging, or production)"
    exit 2
  fi

  # Production warning
  if [[ "$ENVIRONMENT" == "production" ]]; then
    log ""
    log "  ${RED}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
    log "  ${RED}${BOLD}║$(_pad "   WARNING: You are about to deploy to PRODUCTION")║${NC}"
    log "  ${RED}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
    log ""
  fi

  local preflight_ok=true

  # Node.js
  step "Checking Node.js..."
  if command -v node &>/dev/null; then
    ok "Node.js $(node --version)"
  else
    err "Node.js not found — install Node.js 20+"
    preflight_ok=false
  fi

  # npm
  step "Checking npm..."
  if command -v npm &>/dev/null; then
    ok "npm $(npm --version)"
  else
    err "npm not found"
    preflight_ok=false
  fi

  # CDK CLI
  step "Checking AWS CDK CLI..."
  if npx cdk --version &>/dev/null; then
    ok "CDK $(npx cdk --version 2>/dev/null | head -1)"
  else
    err "AWS CDK CLI not found — run 'npm install -g aws-cdk'"
    preflight_ok=false
  fi

  # AWS credentials
  step "Checking AWS credentials..."
  if aws sts get-caller-identity --region "$REGION" &>/dev/null; then
    local caller_identity
    caller_identity=$(aws sts get-caller-identity --region "$REGION" --output json)
    local account_id
    account_id=$(echo "$caller_identity" | jq -r '.Account')
    local caller_arn
    caller_arn=$(echo "$caller_identity" | jq -r '.Arn')
    ok "AWS credentials valid (account: ${account_id})"
  else
    err "AWS credentials not valid. Run 'aws configure' or set credentials."
    preflight_ok=false
  fi

  # npm dependencies
  step "Checking npm dependencies..."
  if [[ -d "${PROJECT_DIR}/node_modules" ]]; then
    ok "node_modules present"
  else
    info "Installing npm dependencies..."
    if run npm --prefix "${PROJECT_DIR}" install; then
      ok "npm install complete"
    else
      err "npm install failed"
      preflight_ok=false
    fi
  fi

  if [[ "$preflight_ok" != "true" ]]; then
    err "Pre-flight checks failed — aborting"
    exit 2
  fi

  # Deploy plan summary
  log ""
  log "  ${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
  log "  ${BLUE}║${NC}${BOLD}$(_pad "   Deploy Plan")${NC}${BLUE}║${NC}"
  log "  ${BLUE}╠══════════════════════════════════════════════════════════╣${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Environment:  ${ENVIRONMENT}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Region:       ${REGION}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Account:      ${account_id:-unknown}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Identity:     ${caller_arn:-unknown}")${BLUE}║${NC}"
  log "  ${BLUE}╠══════════════════════════════════════════════════════════╣${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Dry Run:      ${DRY_RUN}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Skip Tests:   ${SKIP_TESTS}")${BLUE}║${NC}"
  log "  ${BLUE}║${NC}$(_pad "   Profile:      ${AWS_PROFILE_FLAG:-default}")${BLUE}║${NC}"
  log "  ${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
  log ""

  # Confirmation
  if [[ "$AUTO_APPROVE" != "true" && "$DRY_RUN" != "true" ]]; then
    read -rp "  Deploy ${ENVIRONMENT} cluster? [y/N]: " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      err "User aborted"
      exit 2
    fi
    log ""
  fi
}

# ─── Phase 1: TypeScript Build ────────────────────────────────────────────────

typescript_build() {
  phase "1: TypeScript Build"

  step "Compiling TypeScript..."
  if [[ "$DRY_RUN" == "true" ]]; then
    dry "npm run build"
  else
    if npm --prefix "${PROJECT_DIR}" run build 2>&1; then
      ok "TypeScript compiled successfully"
    else
      err "TypeScript compilation failed"
      exit 1
    fi
  fi
}

# ─── Phase 2: Test Suite ──────────────────────────────────────────────────────

test_suite() {
  phase "2: Test Suite"

  if [[ "$SKIP_TESTS" == "true" ]]; then
    warn "Tests skipped (--skip-tests flag)"
    return 0
  fi

  step "Running Jest tests..."
  if [[ "$DRY_RUN" == "true" ]]; then
    dry "npm test"
  else
    if npm --prefix "${PROJECT_DIR}" test -- --ci --silent 2>&1; then
      ok "All tests passed"
    else
      err "Tests failed — fix before deploying"
      exit 1
    fi
  fi
}

# ─── Phase 3: CDK Diff ───────────────────────────────────────────────────────

cdk_diff() {
  phase "3: CDK Diff"

  step "Running CDK diff..."
  if [[ "$DRY_RUN" == "true" ]]; then
    dry "npx cdk diff --all -c environment=${ENVIRONMENT} -c region=${REGION}"
    return 0
  fi

  local diff_output
  diff_output=$(npx cdk diff --all \
    -c "environment=${ENVIRONMENT}" \
    -c "region=${REGION}" 2>&1 || true)

  if [[ -n "$diff_output" ]]; then
    echo ""
    echo "$diff_output"
    echo ""
  fi

  ok "Diff computed"

  # Confirm before deploy
  if [[ "$AUTO_APPROVE" != "true" ]]; then
    read -rp "  Proceed with deploy? [y/N]: " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      err "User aborted after diff review"
      exit 2
    fi
  fi
}

# ─── Phase 4: Deploy Infrastructure ──────────────────────────────────────────

deploy_infrastructure() {
  phase "4: Deploy Infrastructure"

  local infra_stacks=(
    "${ENVIRONMENT}-network"
    "${ENVIRONMENT}-cluster"
  )

  for stack in "${infra_stacks[@]}"; do
    step "Deploying stack: ${stack}..."
    if [[ "$DRY_RUN" == "true" ]]; then
      dry "npx cdk deploy ${stack} --require-approval never -c environment=${ENVIRONMENT} -c region=${REGION}"
    else
      if npx cdk deploy "$stack" \
        --require-approval never \
        -c "environment=${ENVIRONMENT}" \
        -c "region=${REGION}" 2>&1; then
        ok "Stack ${stack} deployed"
      else
        err "Stack ${stack} failed — cannot continue without infrastructure"
        exit 1
      fi
    fi
  done
}

# ─── Phase 5: Deploy Addons ──────────────────────────────────────────────────

deploy_addons() {
  phase "5: Deploy Addons"

  local addon_stacks=(
    "${ENVIRONMENT}-bootstrap"
    "${ENVIRONMENT}-karpenter"
    "${ENVIRONMENT}-argocd"
  )

  local addon_errors=0
  for stack in "${addon_stacks[@]}"; do
    step "Deploying stack: ${stack}..."
    if [[ "$DRY_RUN" == "true" ]]; then
      dry "npx cdk deploy ${stack} --require-approval never -c environment=${ENVIRONMENT} -c region=${REGION}"
    else
      if npx cdk deploy "$stack" \
        --require-approval never \
        -c "environment=${ENVIRONMENT}" \
        -c "region=${REGION}" 2>&1; then
        ok "Stack ${stack} deployed"
      else
        warn "Stack ${stack} failed — continuing with remaining addons"
        addon_errors=$((addon_errors + 1))
      fi
    fi
  done

  if [[ "$addon_errors" -gt 0 ]]; then
    warn "Addon deployment finished with ${addon_errors} error(s)"
    TOTAL_ERRORS=$((TOTAL_ERRORS + addon_errors))
  fi
}

# ─── Phase 6: Post-Deploy Health ──────────────────────────────────────────────

post_deploy_health() {
  phase "6: Post-Deploy Health Check"

  local cluster_name="${ENVIRONMENT}-eks"

  # Update kubeconfig
  step "Updating kubeconfig for ${cluster_name}..."
  if [[ "$DRY_RUN" == "true" ]]; then
    dry "aws eks update-kubeconfig --name ${cluster_name} --region ${REGION}"
  else
    if aws eks update-kubeconfig --name "$cluster_name" --region "$REGION" 2>&1; then
      ok "kubeconfig updated"
    else
      warn "Failed to update kubeconfig — skipping health checks"
      return 0
    fi
  fi

  # Wait for nodes to be Ready
  step "Waiting for nodes to be Ready..."
  if [[ "$DRY_RUN" != "true" ]]; then
    local waited=0
    local node_timeout=300
    while [[ $waited -lt $node_timeout ]]; do
      local total_nodes
      total_nodes=$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')
      local ready_nodes
      ready_nodes=$(kubectl get nodes --no-headers 2>/dev/null | grep -c ' Ready' || echo "0")

      if [[ "$total_nodes" -gt 0 && "$total_nodes" -eq "$ready_nodes" ]]; then
        ok "${ready_nodes} node(s) Ready"
        break
      fi

      info "${ready_nodes}/${total_nodes} nodes ready... (${waited}s/${node_timeout}s)"
      sleep 15
      waited=$((waited + 15))
    done

    if [[ $waited -ge $node_timeout ]]; then
      warn "Timeout waiting for nodes — some may not be Ready"
    fi
  else
    dry "kubectl get nodes"
  fi

  # Check critical pods
  local namespaces=("kube-system" "cert-manager" "external-secrets" "argocd")
  step "Checking critical namespaces..."

  for ns in "${namespaces[@]}"; do
    if [[ "$DRY_RUN" == "true" ]]; then
      dry "kubectl get pods -n ${ns}"
      continue
    fi

    if kubectl get namespace "$ns" &>/dev/null; then
      local total_pods
      total_pods=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
      local running_pods
      running_pods=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null | grep -cE 'Running|Completed' || echo "0")

      if [[ "$total_pods" -eq 0 ]]; then
        info "Namespace ${ns}: no pods yet"
      elif [[ "$total_pods" -eq "$running_pods" ]]; then
        ok "Namespace ${ns}: ${running_pods}/${total_pods} pods healthy"
      else
        warn "Namespace ${ns}: ${running_pods}/${total_pods} pods healthy"
      fi
    else
      info "Namespace ${ns}: not found (may deploy via ArgoCD)"
    fi
  done

  # Let the cluster settle before smoke tests
  local settle_secs=30
  step "Waiting ${settle_secs}s for cluster to settle..."
  if [[ "$DRY_RUN" != "true" ]]; then
    sleep "$settle_secs"
    ok "Settle period complete"
  else
    dry "sleep ${settle_secs}"
  fi

  # Smoke test if available
  local smoke_test="${SCRIPT_DIR}/integration/smoke-test.sh"
  if [[ -x "$smoke_test" && "$DRY_RUN" != "true" ]]; then
    step "Running smoke test..."
    if "$smoke_test" 2>&1; then
      ok "Smoke test passed"
    else
      warn "Smoke test failed — cluster may still be initializing"
    fi
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  START_TIME=$(date +%s)

  log "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
  log "${BLUE}║${NC}${BOLD}$(_pad "     EKS Deploy — ${ENVIRONMENT}")${NC}${BLUE}║${NC}"
  log "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

  preflight_checks
  typescript_build
  test_suite
  cdk_diff
  deploy_infrastructure
  deploy_addons
  post_deploy_health

  log ""
  if [[ "$TOTAL_ERRORS" -gt 0 ]]; then
    log "${RED}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
    log "${RED}${BOLD}║$(_pad "   Deploy completed with ${TOTAL_ERRORS} error(s) — ${ENVIRONMENT}")║${NC}"
    log "${RED}${BOLD}║$(_pad "   Duration: $(elapsed)")║${NC}"
    log "${RED}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
    exit 1
  else
    log "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
    log "${GREEN}${BOLD}║$(_pad "   Deploy complete — ${ENVIRONMENT}")║${NC}"
    log "${GREEN}${BOLD}║$(_pad "   Duration: $(elapsed)")║${NC}"
    log "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  fi
}

main "$@"
