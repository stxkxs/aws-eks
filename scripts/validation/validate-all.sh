#!/usr/bin/env bash
#
# Run all Kubernetes manifest validation checks
#
# Usage: ./validate-all.sh [CDK_OUT_DIR]
#
set -euo pipefail

CDK_OUT_DIR="${1:-cdk.out}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0
WARNINGS=0

echo "=========================================="
echo "  Kubernetes Manifest Validation"
echo "=========================================="
echo ""
echo "CDK Output Directory: $CDK_OUT_DIR"
echo ""

# Check if directory exists
if [ ! -d "$CDK_OUT_DIR" ]; then
  echo -e "${RED}Error: Directory $CDK_OUT_DIR does not exist${NC}"
  exit 1
fi

# Find all YAML/JSON files
MANIFESTS=$(find "$CDK_OUT_DIR" -name "*.yaml" -o -name "*.json" 2>/dev/null | grep -v "manifest.json" | grep -v "tree.json" || true)

if [ -z "$MANIFESTS" ]; then
  echo -e "${YELLOW}Warning: No manifest files found in $CDK_OUT_DIR${NC}"
  exit 0
fi

MANIFEST_COUNT=$(echo "$MANIFESTS" | wc -l | tr -d ' ')
echo "Found $MANIFEST_COUNT manifest files to validate"
echo ""

# 1. kubeconform - Schema validation
echo "----------------------------------------"
echo "1. kubeconform - Schema Validation"
echo "----------------------------------------"
if command -v kubeconform &> /dev/null; then
  set +e
  KUBECONFORM_OUTPUT=$(echo "$MANIFESTS" | xargs kubeconform \
    -strict \
    -ignore-missing-schemas \
    -kubernetes-version 1.31.0 \
    -summary 2>&1)
  KUBECONFORM_EXIT=$?
  set -e

  if [ $KUBECONFORM_EXIT -ne 0 ]; then
    echo -e "${RED}FAILED${NC}"
    echo "$KUBECONFORM_OUTPUT"
    FAILED=$((FAILED + 1))
  else
    echo -e "${GREEN}PASSED${NC}"
    echo "$KUBECONFORM_OUTPUT" | tail -3
  fi
else
  echo -e "${YELLOW}SKIPPED (kubeconform not installed)${NC}"
  WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 2. kube-linter - Best practices
echo "----------------------------------------"
echo "2. kube-linter - Best Practices"
echo "----------------------------------------"
if command -v kube-linter &> /dev/null; then
  set +e
  KUBE_LINTER_OUTPUT=$(kube-linter lint "$CDK_OUT_DIR" \
    --config "$REPO_ROOT/.kube-linter.yaml" 2>&1 || true)
  KUBE_LINTER_EXIT=$?
  set -e

  # kube-linter returns non-zero if there are warnings
  ERROR_COUNT=$(echo "$KUBE_LINTER_OUTPUT" | grep -c "Error:" || true)
  WARNING_COUNT=$(echo "$KUBE_LINTER_OUTPUT" | grep -c "Warning:" || true)

  if [ "$ERROR_COUNT" -gt 0 ]; then
    echo -e "${RED}FAILED ($ERROR_COUNT errors, $WARNING_COUNT warnings)${NC}"
    echo "$KUBE_LINTER_OUTPUT" | head -20
    FAILED=$((FAILED + 1))
  elif [ "$WARNING_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}PASSED with warnings ($WARNING_COUNT warnings)${NC}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "${GREEN}PASSED${NC}"
  fi
else
  echo -e "${YELLOW}SKIPPED (kube-linter not installed)${NC}"
  WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 3. pluto - Deprecated API detection
echo "----------------------------------------"
echo "3. pluto - Deprecated API Detection"
echo "----------------------------------------"
if command -v pluto &> /dev/null; then
  set +e
  PLUTO_OUTPUT=$(pluto detect-files -d "$CDK_OUT_DIR" \
    --target-versions k8s=v1.31.0 \
    -o wide 2>&1)
  PLUTO_EXIT=$?
  set -e

  if [ $PLUTO_EXIT -ne 0 ] && echo "$PLUTO_OUTPUT" | grep -q "REMOVED\|DEPRECATED"; then
    echo -e "${RED}FAILED - Deprecated APIs detected${NC}"
    echo "$PLUTO_OUTPUT"
    FAILED=$((FAILED + 1))
  elif echo "$PLUTO_OUTPUT" | grep -q "DEPRECATED"; then
    echo -e "${YELLOW}PASSED with deprecation warnings${NC}"
    echo "$PLUTO_OUTPUT"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "${GREEN}PASSED - No deprecated APIs found${NC}"
  fi
else
  echo -e "${YELLOW}SKIPPED (pluto not installed)${NC}"
  WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 4. conftest - OPA policy validation (if policies exist)
echo "----------------------------------------"
echo "4. conftest - OPA Policy Validation"
echo "----------------------------------------"
POLICY_DIR="$REPO_ROOT/policies"
if command -v conftest &> /dev/null && [ -d "$POLICY_DIR" ]; then
  set +e
  CONFTEST_OUTPUT=$(echo "$MANIFESTS" | xargs conftest test \
    --policy "$POLICY_DIR" \
    --all-namespaces 2>&1)
  CONFTEST_EXIT=$?
  set -e

  if [ $CONFTEST_EXIT -ne 0 ]; then
    echo -e "${RED}FAILED${NC}"
    echo "$CONFTEST_OUTPUT" | head -20
    FAILED=$((FAILED + 1))
  else
    echo -e "${GREEN}PASSED${NC}"
  fi
elif ! command -v conftest &> /dev/null; then
  echo -e "${YELLOW}SKIPPED (conftest not installed)${NC}"
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${YELLOW}SKIPPED (no policy directory at $POLICY_DIR)${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo "  Validation Summary"
echo "=========================================="
echo ""
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}FAILED: $FAILED check(s) failed${NC}"
  if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}WARNINGS: $WARNINGS warning(s)${NC}"
  fi
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}PASSED with $WARNINGS warning(s)${NC}"
  exit 0
else
  echo -e "${GREEN}ALL CHECKS PASSED${NC}"
  exit 0
fi
