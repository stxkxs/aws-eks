#!/usr/bin/env bash
#
# Network Policy Integration Test Script
#
# This script verifies that network policies are correctly enforced in the cluster.
# It creates test pods and validates that traffic flows according to policy rules.
#
# Usage:
#   ./scripts/integration/network-policy.sh [--namespace <ns>] [--cleanup]
#
# Requirements:
#   - kubectl configured with cluster access
#   - Cilium CNI installed and running
#   - jq for JSON parsing

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-network-policy-test}"
CLEANUP_ONLY="${CLEANUP_ONLY:-false}"
TIMEOUT="${TIMEOUT:-60}"
TEST_IMAGE="${TEST_IMAGE:-nicolaka/netshoot:latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_test() { echo -e "\n${YELLOW}[TEST]${NC} $1"; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --cleanup)
            CLEANUP_ONLY="true"
            shift
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--namespace <ns>] [--cleanup] [--timeout <seconds>]"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Cleanup function
cleanup() {
    log_info "Cleaning up test resources..."
    kubectl delete namespace "$NAMESPACE" --ignore-not-found --timeout=60s || true
}

# Trap for cleanup on exit
trap cleanup EXIT

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        exit 1
    fi

    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    # Check if Cilium is running
    if ! kubectl get pods -n kube-system -l k8s-app=cilium -o json | jq -e '.items | length > 0' &> /dev/null; then
        log_warn "Cilium pods not found - network policies may not be enforced"
    fi

    log_info "Prerequisites check passed"
}

# Create test namespace
create_namespace() {
    log_info "Creating test namespace: $NAMESPACE"
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

    # Label namespace for network policy testing
    kubectl label namespace "$NAMESPACE" \
        "network-policy-test=true" \
        "kubernetes.io/metadata.name=$NAMESPACE" \
        --overwrite
}

# Create test pods
create_test_pods() {
    log_info "Creating test pods..."

    # Frontend pod (simulates web frontend)
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: frontend
  namespace: $NAMESPACE
  labels:
    app: frontend
    tier: web
spec:
  containers:
  - name: netshoot
    image: $TEST_IMAGE
    command: ["sleep", "infinity"]
EOF

    # Backend pod (simulates API backend)
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: backend
  namespace: $NAMESPACE
  labels:
    app: backend
    tier: api
spec:
  containers:
  - name: netshoot
    image: $TEST_IMAGE
    command: ["sleep", "infinity"]
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: $NAMESPACE
spec:
  selector:
    app: backend
  ports:
  - port: 8080
    targetPort: 8080
EOF

    # Database pod (simulates database)
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: database
  namespace: $NAMESPACE
  labels:
    app: database
    tier: data
spec:
  containers:
  - name: netshoot
    image: $TEST_IMAGE
    command: ["sleep", "infinity"]
---
apiVersion: v1
kind: Service
metadata:
  name: database
  namespace: $NAMESPACE
spec:
  selector:
    app: database
  ports:
  - port: 5432
    targetPort: 5432
EOF

    # External pod (simulates external traffic source)
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: external
  namespace: $NAMESPACE
  labels:
    app: external
    tier: external
spec:
  containers:
  - name: netshoot
    image: $TEST_IMAGE
    command: ["sleep", "infinity"]
EOF

    # Wait for pods to be ready
    log_info "Waiting for pods to be ready..."
    kubectl wait --for=condition=Ready pod --all -n "$NAMESPACE" --timeout="${TIMEOUT}s"
}

# Create default-deny policy
create_default_deny_policy() {
    log_info "Creating default-deny network policy..."

    kubectl apply -f - <<EOF
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: $NAMESPACE
spec:
  endpointSelector: {}
  ingress:
  - {}
---
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: default-deny-egress
  namespace: $NAMESPACE
spec:
  endpointSelector: {}
  egress:
  - toEndpoints:
    - matchLabels:
        k8s:io.kubernetes.pod.namespace: kube-system
        k8s-app: kube-dns
    toPorts:
    - ports:
      - port: "53"
        protocol: UDP
      - port: "53"
        protocol: TCP
EOF
}

# Create allow policies
create_allow_policies() {
    log_info "Creating allow network policies..."

    # Allow frontend to backend
    kubectl apply -f - <<EOF
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: $NAMESPACE
spec:
  endpointSelector:
    matchLabels:
      app: backend
  ingress:
  - fromEndpoints:
    - matchLabels:
        app: frontend
    toPorts:
    - ports:
      - port: "8080"
        protocol: TCP
EOF

    # Allow backend to database
    kubectl apply -f - <<EOF
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-backend-to-database
  namespace: $NAMESPACE
spec:
  endpointSelector:
    matchLabels:
      app: database
  ingress:
  - fromEndpoints:
    - matchLabels:
        app: backend
    toPorts:
    - ports:
      - port: "5432"
        protocol: TCP
EOF

    # Give policies time to propagate
    sleep 5
}

# Test connectivity between pods
test_connectivity() {
    local from_pod=$1
    local to_pod=$2
    local port=$3
    local expected=$4  # "allow" or "deny"

    local to_ip
    to_ip=$(kubectl get pod "$to_pod" -n "$NAMESPACE" -o jsonpath='{.status.podIP}')

    log_info "Testing: $from_pod -> $to_pod:$port (expected: $expected)"

    local result
    if kubectl exec -n "$NAMESPACE" "$from_pod" -- timeout 5 bash -c "echo >/dev/tcp/$to_ip/$port" 2>/dev/null; then
        result="allow"
    else
        result="deny"
    fi

    if [[ "$result" == "$expected" ]]; then
        log_info "  PASS: Connection $result as expected"
        return 0
    else
        log_error "  FAIL: Connection was $result, expected $expected"
        return 1
    fi
}

# Run all tests
run_tests() {
    local failed=0

    log_test "Testing default-deny (all connections should be blocked)"

    # Test without policies first
    test_connectivity "frontend" "backend" "8080" "deny" || ((failed++))
    test_connectivity "frontend" "database" "5432" "deny" || ((failed++))
    test_connectivity "backend" "database" "5432" "deny" || ((failed++))
    test_connectivity "external" "backend" "8080" "deny" || ((failed++))

    log_test "Creating allow policies..."
    create_allow_policies

    log_test "Testing with allow policies"

    # Test allowed connections
    test_connectivity "frontend" "backend" "8080" "allow" || ((failed++))
    test_connectivity "backend" "database" "5432" "allow" || ((failed++))

    # Test still-denied connections
    test_connectivity "frontend" "database" "5432" "deny" || ((failed++))
    test_connectivity "external" "backend" "8080" "deny" || ((failed++))
    test_connectivity "external" "database" "5432" "deny" || ((failed++))

    log_test "Testing DNS resolution"
    if kubectl exec -n "$NAMESPACE" "frontend" -- nslookup kubernetes.default.svc.cluster.local &>/dev/null; then
        log_info "  PASS: DNS resolution works"
    else
        log_error "  FAIL: DNS resolution failed"
        ((failed++))
    fi

    return $failed
}

# Generate test report
generate_report() {
    local failed=$1

    echo ""
    echo "=========================================="
    echo "       Network Policy Test Report        "
    echo "=========================================="
    echo ""
    echo "Namespace: $NAMESPACE"
    echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo ""

    if [[ $failed -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
    else
        echo -e "${RED}$failed test(s) failed${NC}"
    fi

    echo ""
    echo "Network Policies in namespace:"
    kubectl get ciliumnetworkpolicies -n "$NAMESPACE" -o wide 2>/dev/null || \
        kubectl get networkpolicies -n "$NAMESPACE" -o wide

    echo ""
    echo "Cilium endpoint status:"
    kubectl get ciliumendpoints -n "$NAMESPACE" 2>/dev/null || echo "Cilium endpoints not available"
}

# Main execution
main() {
    if [[ "$CLEANUP_ONLY" == "true" ]]; then
        cleanup
        exit 0
    fi

    check_prerequisites
    create_namespace
    create_test_pods
    create_default_deny_policy

    # Give policies time to be enforced
    log_info "Waiting for policies to be enforced..."
    sleep 10

    local failed=0
    run_tests || failed=$?

    generate_report $failed

    if [[ $failed -gt 0 ]]; then
        exit 1
    fi
}

main "$@"
