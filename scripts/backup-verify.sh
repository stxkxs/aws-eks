#!/usr/bin/env bash
#
# Velero Backup Verification Script
#
# Verifies that Velero backups are working correctly by:
# 1. Checking Velero deployment status
# 2. Listing recent backups
# 3. Checking backup storage location status
# 4. Verifying backup schedules
# 5. Optionally running a test backup
#
# Usage: ./backup-verify.sh [--test] [--namespace <namespace>]
#
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Defaults
VELERO_NAMESPACE="${VELERO_NAMESPACE:-velero}"
RUN_TEST_BACKUP=false
TEST_NAMESPACE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --test)
      RUN_TEST_BACKUP=true
      shift
      ;;
    --namespace)
      TEST_NAMESPACE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--test] [--namespace <namespace>]"
      echo ""
      echo "Options:"
      echo "  --test              Run a test backup"
      echo "  --namespace <ns>    Namespace to backup (default: velero-test)"
      echo ""
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=========================================="
echo "  Velero Backup Verification"
echo "=========================================="
echo ""

# Check if velero CLI is installed
if ! command -v velero &> /dev/null; then
  echo -e "${RED}Error: velero CLI is not installed${NC}"
  echo "Install it from: https://velero.io/docs/main/basic-install/#install-the-cli"
  exit 1
fi

# Check if kubectl is configured
if ! kubectl cluster-info &> /dev/null; then
  echo -e "${RED}Error: kubectl is not configured or cluster is not accessible${NC}"
  exit 1
fi

FAILED=0

# 1. Check Velero deployment
echo -e "${BLUE}1. Checking Velero deployment...${NC}"
echo "----------------------------------------"
if kubectl get deployment velero -n "$VELERO_NAMESPACE" &> /dev/null; then
  READY=$(kubectl get deployment velero -n "$VELERO_NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
  DESIRED=$(kubectl get deployment velero -n "$VELERO_NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

  if [ "$READY" = "$DESIRED" ] && [ "$READY" != "0" ]; then
    echo -e "${GREEN}PASSED${NC} - Velero deployment ready ($READY/$DESIRED replicas)"
  else
    echo -e "${RED}FAILED${NC} - Velero deployment not ready ($READY/$DESIRED replicas)"
    FAILED=$((FAILED + 1))
  fi
else
  echo -e "${RED}FAILED${NC} - Velero deployment not found"
  FAILED=$((FAILED + 1))
fi
echo ""

# 2. Check Backup Storage Locations
echo -e "${BLUE}2. Checking Backup Storage Locations...${NC}"
echo "----------------------------------------"
BSL_STATUS=$(velero backup-location get -o json 2>/dev/null | jq -r '.items[0].status.phase // "Unknown"')
BSL_NAME=$(velero backup-location get -o json 2>/dev/null | jq -r '.items[0].metadata.name // "N/A"')
BSL_BUCKET=$(velero backup-location get -o json 2>/dev/null | jq -r '.items[0].spec.objectStorage.bucket // "N/A"')

if [ "$BSL_STATUS" = "Available" ]; then
  echo -e "${GREEN}PASSED${NC} - BSL '$BSL_NAME' is available"
  echo "  Bucket: $BSL_BUCKET"
else
  echo -e "${RED}FAILED${NC} - BSL status: $BSL_STATUS"
  FAILED=$((FAILED + 1))
fi
echo ""

# 3. Check Volume Snapshot Locations
echo -e "${BLUE}3. Checking Volume Snapshot Locations...${NC}"
echo "----------------------------------------"
VSL_COUNT=$(velero snapshot-location get -o json 2>/dev/null | jq -r '.items | length')
if [ "$VSL_COUNT" -gt 0 ]; then
  echo -e "${GREEN}PASSED${NC} - Found $VSL_COUNT volume snapshot location(s)"
  velero snapshot-location get 2>/dev/null | head -5
else
  echo -e "${YELLOW}WARNING${NC} - No volume snapshot locations configured"
fi
echo ""

# 4. List backup schedules
echo -e "${BLUE}4. Checking Backup Schedules...${NC}"
echo "----------------------------------------"
SCHEDULE_COUNT=$(velero schedule get -o json 2>/dev/null | jq -r '.items | length')
if [ "$SCHEDULE_COUNT" -gt 0 ]; then
  echo -e "${GREEN}PASSED${NC} - Found $SCHEDULE_COUNT backup schedule(s)"
  velero schedule get 2>/dev/null
else
  echo -e "${YELLOW}WARNING${NC} - No backup schedules configured"
fi
echo ""

# 5. List recent backups
echo -e "${BLUE}5. Recent Backups...${NC}"
echo "----------------------------------------"
BACKUP_COUNT=$(velero backup get -o json 2>/dev/null | jq -r '.items | length')
if [ "$BACKUP_COUNT" -gt 0 ]; then
  echo "Found $BACKUP_COUNT backup(s):"
  velero backup get 2>/dev/null | head -10

  # Check for failed backups
  FAILED_BACKUPS=$(velero backup get -o json 2>/dev/null | jq -r '[.items[] | select(.status.phase == "Failed")] | length')
  if [ "$FAILED_BACKUPS" -gt 0 ]; then
    echo -e "${RED}WARNING${NC} - $FAILED_BACKUPS backup(s) in Failed state"
  fi
else
  echo -e "${YELLOW}WARNING${NC} - No backups found"
fi
echo ""

# 6. Run test backup (optional)
if [ "$RUN_TEST_BACKUP" = true ]; then
  echo -e "${BLUE}6. Running Test Backup...${NC}"
  echo "----------------------------------------"

  TEST_NAMESPACE="${TEST_NAMESPACE:-velero-test}"
  BACKUP_NAME="test-backup-$(date +%Y%m%d%H%M%S)"

  # Create test namespace if it doesn't exist
  if ! kubectl get namespace "$TEST_NAMESPACE" &> /dev/null; then
    echo "Creating test namespace: $TEST_NAMESPACE"
    kubectl create namespace "$TEST_NAMESPACE"

    # Create a simple test deployment
    kubectl create deployment nginx --image=nginx:alpine -n "$TEST_NAMESPACE"
    kubectl create configmap test-config --from-literal=key=value -n "$TEST_NAMESPACE"

    echo "Waiting for deployment to be ready..."
    kubectl rollout status deployment/nginx -n "$TEST_NAMESPACE" --timeout=60s
  fi

  echo "Creating backup: $BACKUP_NAME"
  velero backup create "$BACKUP_NAME" \
    --include-namespaces "$TEST_NAMESPACE" \
    --wait

  # Check backup status
  BACKUP_STATUS=$(velero backup get "$BACKUP_NAME" -o json 2>/dev/null | jq -r '.status.phase')
  if [ "$BACKUP_STATUS" = "Completed" ]; then
    echo -e "${GREEN}PASSED${NC} - Test backup completed successfully"

    # Get backup details
    echo ""
    echo "Backup details:"
    velero backup describe "$BACKUP_NAME" 2>/dev/null | grep -E "^(Name|Namespaces|Phase|Items|Started|Completed):"
  else
    echo -e "${RED}FAILED${NC} - Test backup status: $BACKUP_STATUS"
    velero backup logs "$BACKUP_NAME" 2>/dev/null | tail -20
    FAILED=$((FAILED + 1))
  fi
  echo ""
fi

# Summary
echo "=========================================="
echo "  Verification Summary"
echo "=========================================="
echo ""
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}FAILED: $FAILED check(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}ALL CHECKS PASSED${NC}"
  exit 0
fi
