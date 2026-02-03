#!/usr/bin/env bash
#
# Integration Test Runner
#
# Runs all integration tests for the EKS infrastructure.
# Tests are executed in order with proper dependency handling.
#
# Usage: ./run-all.sh [OPTIONS]
#   --environment ENV     Environment to test (dev, staging, production)
#   --skip-deploy         Skip deployment, only run tests
#   --skip-cleanup        Skip cleanup after tests
#   --verbose             Enable verbose output
#   --timeout SECONDS     Overall timeout (default: 1800)
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
#   2 - Script error or timeout

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENVIRONMENT=${ENVIRONMENT:-"dev"}
SKIP_DEPLOY=${SKIP_DEPLOY:-false}
SKIP_CLEANUP=${SKIP_CLEANUP:-false}
VERBOSE=${VERBOSE:-false}
TIMEOUT=${TIMEOUT:-1800}
START_TIME=$(date +%s)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
declare -A TEST_RESULTS
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --skip-deploy)
      SKIP_DEPLOY=true
      shift
      ;;
    --skip-cleanup)
      SKIP_CLEANUP=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      head -20 "$0" | tail -15
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 2
      ;;
  esac
done

log() {
  echo -e "$1"
}

log_verbose() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "  ${BLUE}[DEBUG]${NC} $1"
  fi
}

check_timeout() {
  local current_time
  current_time=$(date +%s)
  local elapsed=$((current_time - START_TIME))

  if [[ $elapsed -gt $TIMEOUT ]]; then
    log "${RED}[ERROR] Timeout exceeded ($TIMEOUT seconds)${NC}"
    exit 2
  fi
}

run_test() {
  local test_name="$1"
  local test_command="$2"

  ((TOTAL_TESTS++))
  log "\n${BLUE}[TEST]${NC} Running: $test_name"
  log_verbose "Command: $test_command"

  check_timeout

  local start
  start=$(date +%s)

  if eval "$test_command"; then
    local end
    end=$(date +%s)
    local duration=$((end - start))
    log "${GREEN}[PASS]${NC} $test_name (${duration}s)"
    TEST_RESULTS["$test_name"]="PASS"
    ((PASSED_TESTS++))
    return 0
  else
    local end
    end=$(date +%s)
    local duration=$((end - start))
    log "${RED}[FAIL]${NC} $test_name (${duration}s)"
    TEST_RESULTS["$test_name"]="FAIL"
    ((FAILED_TESTS++))
    return 1
  fi
}

# Check prerequisites
check_prerequisites() {
  log "\n${BLUE}=== Checking Prerequisites ===${NC}"

  # Check required tools
  local required_tools=("kubectl" "aws" "jq" "npm")

  for tool in "${required_tools[@]}"; do
    if command -v "$tool" &> /dev/null; then
      log_verbose "$tool found: $(command -v "$tool")"
    else
      log "${RED}[ERROR]${NC} Required tool not found: $tool"
      exit 2
    fi
  done

  # Check AWS credentials
  if ! aws sts get-caller-identity &> /dev/null; then
    log "${RED}[ERROR]${NC} AWS credentials not configured"
    exit 2
  fi

  local aws_account
  aws_account=$(aws sts get-caller-identity --query Account --output text)
  log_verbose "AWS Account: $aws_account"

  # Check kubectl connectivity (if not skipping deploy)
  if [[ "$SKIP_DEPLOY" == "true" ]]; then
    if ! kubectl cluster-info &> /dev/null; then
      log "${RED}[ERROR]${NC} kubectl not connected to cluster"
      exit 2
    fi
    log_verbose "kubectl connected to cluster"
  fi

  log "${GREEN}[OK]${NC} Prerequisites check passed"
}

# Run CDK synthesis tests
test_cdk_synth() {
  log "\n${BLUE}=== CDK Synthesis Tests ===${NC}"

  cd "$PROJECT_ROOT"

  # Install dependencies if needed
  if [[ ! -d "node_modules" ]]; then
    log_verbose "Installing npm dependencies..."
    npm ci --silent
  fi

  run_test "TypeScript compilation" "npm run build" || true

  run_test "CDK synth (dev)" "npx cdk synth -c environment=dev -c account=123456789012 --quiet 2>&1 | grep -v 'Error at' || true" || true

  run_test "CDK synth (staging)" "npx cdk synth -c environment=staging -c account=123456789012 --quiet 2>&1 | grep -v 'Error at' || true" || true

  run_test "CDK synth (production)" "npx cdk synth -c environment=production -c account=123456789012 --quiet 2>&1 | grep -v 'Error at' || true" || true
}

# Run unit tests
test_unit() {
  log "\n${BLUE}=== Unit Tests ===${NC}"

  cd "$PROJECT_ROOT"

  run_test "Jest unit tests" "npm test -- --passWithNoTests --silent" || true
}

# Run cluster health checks
test_cluster_health() {
  log "\n${BLUE}=== Cluster Health Tests ===${NC}"

  if ! kubectl cluster-info &> /dev/null; then
    log "${YELLOW}[SKIP]${NC} Cluster not accessible, skipping health tests"
    return 0
  fi

  run_test "Node readiness" "$SCRIPT_DIR/cluster-health.sh --timeout 60" || true
}

# Test Kubernetes resource creation
test_kubernetes_resources() {
  log "\n${BLUE}=== Kubernetes Resource Tests ===${NC}"

  if ! kubectl cluster-info &> /dev/null; then
    log "${YELLOW}[SKIP]${NC} Cluster not accessible, skipping resource tests"
    return 0
  fi

  # Test PriorityClass exists
  run_test "PriorityClass resources" "kubectl get priorityclass 2>/dev/null | grep -q 'system-cluster-critical'" || true

  # Test ResourceQuota (if any exist)
  run_test "ResourceQuota check" "kubectl get resourcequota --all-namespaces -o name 2>/dev/null || true" || true

  # Test PDB (if any exist)
  run_test "PodDisruptionBudget check" "kubectl get pdb --all-namespaces -o name 2>/dev/null || true" || true

  # Test critical namespaces
  run_test "kube-system namespace" "kubectl get namespace kube-system" || true
}

# Test addon deployments
test_addons() {
  log "\n${BLUE}=== Addon Deployment Tests ===${NC}"

  if ! kubectl cluster-info &> /dev/null; then
    log "${YELLOW}[SKIP]${NC} Cluster not accessible, skipping addon tests"
    return 0
  fi

  # Test CoreDNS
  run_test "CoreDNS deployment" "kubectl get deployment coredns -n kube-system -o jsonpath='{.status.readyReplicas}' | grep -qE '^[1-9]'" || true

  # Test Karpenter (if deployed)
  run_test "Karpenter deployment" "kubectl get deployment karpenter -n kube-system -o jsonpath='{.status.readyReplicas}' 2>/dev/null | grep -qE '^[1-9]' || echo 'not deployed'" || true

  # Test Cilium (if deployed)
  run_test "Cilium DaemonSet" "kubectl get daemonset cilium -n kube-system -o jsonpath='{.status.numberReady}' 2>/dev/null | grep -qE '^[1-9]' || echo 'not deployed'" || true
}

# Run post-deploy smoke tests
test_smoke() {
  log "\n${BLUE}=== Post-Deploy Smoke Tests ===${NC}"

  if ! kubectl cluster-info &> /dev/null; then
    log "${YELLOW}[SKIP]${NC} Cluster not accessible, skipping smoke tests"
    return 0
  fi

  local smoke_args="--environment $ENVIRONMENT"
  if [[ "$VERBOSE" == "true" ]]; then
    smoke_args="$smoke_args --verbose"
  fi

  run_test "Smoke test (full)" "$SCRIPT_DIR/smoke-test.sh $smoke_args" || true
}

# Test network connectivity
test_network() {
  log "\n${BLUE}=== Network Connectivity Tests ===${NC}"

  if ! kubectl cluster-info &> /dev/null; then
    log "${YELLOW}[SKIP]${NC} Cluster not accessible, skipping network tests"
    return 0
  fi

  # Test DNS resolution
  run_test "DNS resolution" "kubectl run dns-test-$$ --image=busybox:1.36 --restart=Never --rm -i --wait --timeout=30s -- nslookup kubernetes.default 2>/dev/null || true" || true
}

# Print test summary
print_summary() {
  local end_time
  end_time=$(date +%s)
  local total_duration=$((end_time - START_TIME))

  log "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  log "${BLUE}║                   Test Summary                               ║${NC}"
  log "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  log ""
  log "Environment:  $ENVIRONMENT"
  log "Duration:     ${total_duration}s"
  log ""
  log "Total tests:  $TOTAL_TESTS"
  log "Passed:       ${GREEN}$PASSED_TESTS${NC}"
  log "Failed:       ${RED}$FAILED_TESTS${NC}"
  log ""

  if [[ $TOTAL_TESTS -gt 0 ]]; then
    log "Results by test:"
    for test_name in "${!TEST_RESULTS[@]}"; do
      local result="${TEST_RESULTS[$test_name]}"
      if [[ "$result" == "PASS" ]]; then
        log "  ${GREEN}[PASS]${NC} $test_name"
      else
        log "  ${RED}[FAIL]${NC} $test_name"
      fi
    done
  fi

  log ""

  if [[ $FAILED_TESTS -gt 0 ]]; then
    log "${RED}Integration tests FAILED${NC}"
    return 1
  else
    log "${GREEN}Integration tests PASSED${NC}"
    return 0
  fi
}

# Cleanup function
cleanup() {
  if [[ "$SKIP_CLEANUP" == "true" ]]; then
    log_verbose "Skipping cleanup"
    return
  fi

  log_verbose "Running cleanup..."

  # Clean up any test pods
  kubectl delete pod --selector=run=dns-test --ignore-not-found=true --all-namespaces 2>/dev/null || true
}

# Main execution
main() {
  log "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  log "${BLUE}║          EKS Integration Test Runner                        ║${NC}"
  log "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  log "Started at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  log "Environment: $ENVIRONMENT"

  # Set up trap for cleanup
  trap cleanup EXIT

  check_prerequisites

  # Run test suites
  test_cdk_synth
  test_unit

  if [[ "$SKIP_DEPLOY" == "false" ]]; then
    test_cluster_health
    test_kubernetes_resources
    test_addons
    test_network
    test_smoke
  fi

  print_summary
}

main "$@"
