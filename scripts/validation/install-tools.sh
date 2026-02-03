#!/usr/bin/env bash
#
# Install Kubernetes validation tools
#
# Tools installed:
#   - kubeconform: Kubernetes manifest validation
#   - kube-linter: Kubernetes linter for best practices
#   - pluto: Detect deprecated Kubernetes APIs
#   - conftest: Policy testing with OPA
#
set -euo pipefail

KUBECONFORM_VERSION="${KUBECONFORM_VERSION:-0.6.7}"
KUBE_LINTER_VERSION="${KUBE_LINTER_VERSION:-0.7.1}"
PLUTO_VERSION="${PLUTO_VERSION:-5.21.0}"
CONFTEST_VERSION="${CONFTEST_VERSION:-0.55.0}"

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Normalize architecture
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

echo "Installing Kubernetes validation tools..."
echo "OS: $OS, ARCH: $ARCH"
echo "Install directory: $INSTALL_DIR"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT
cd "$TEMP_DIR"

# Install kubeconform
echo "Installing kubeconform v${KUBECONFORM_VERSION}..."
KUBECONFORM_URL="https://github.com/yannh/kubeconform/releases/download/v${KUBECONFORM_VERSION}/kubeconform-${OS}-${ARCH}.tar.gz"
curl -sSL "$KUBECONFORM_URL" | tar xz
sudo mv kubeconform "$INSTALL_DIR/"
echo "  kubeconform installed: $(kubeconform -v)"

# Install kube-linter
echo "Installing kube-linter v${KUBE_LINTER_VERSION}..."
KUBE_LINTER_URL="https://github.com/stackrox/kube-linter/releases/download/v${KUBE_LINTER_VERSION}/kube-linter-${OS}"
if [ "$ARCH" = "arm64" ]; then
  KUBE_LINTER_URL="https://github.com/stackrox/kube-linter/releases/download/v${KUBE_LINTER_VERSION}/kube-linter-${OS}-arm64"
fi
curl -sSL "$KUBE_LINTER_URL" -o kube-linter
chmod +x kube-linter
sudo mv kube-linter "$INSTALL_DIR/"
echo "  kube-linter installed: $(kube-linter version 2>/dev/null || echo 'v${KUBE_LINTER_VERSION}')"

# Install pluto
echo "Installing pluto v${PLUTO_VERSION}..."
PLUTO_URL="https://github.com/FairwindsOps/pluto/releases/download/v${PLUTO_VERSION}/pluto_${PLUTO_VERSION}_${OS}_${ARCH}.tar.gz"
curl -sSL "$PLUTO_URL" | tar xz
sudo mv pluto "$INSTALL_DIR/"
echo "  pluto installed: $(pluto version 2>/dev/null | head -1 || echo 'v${PLUTO_VERSION}')"

# Install conftest
echo "Installing conftest v${CONFTEST_VERSION}..."
CONFTEST_URL="https://github.com/open-policy-agent/conftest/releases/download/v${CONFTEST_VERSION}/conftest_${CONFTEST_VERSION}_${OS^}_${ARCH}.tar.gz"
# Handle case sensitivity in URL
if [ "$OS" = "linux" ]; then
  CONFTEST_URL="https://github.com/open-policy-agent/conftest/releases/download/v${CONFTEST_VERSION}/conftest_${CONFTEST_VERSION}_Linux_${ARCH}.tar.gz"
elif [ "$OS" = "darwin" ]; then
  CONFTEST_URL="https://github.com/open-policy-agent/conftest/releases/download/v${CONFTEST_VERSION}/conftest_${CONFTEST_VERSION}_Darwin_${ARCH}.tar.gz"
fi
curl -sSL "$CONFTEST_URL" | tar xz
sudo mv conftest "$INSTALL_DIR/"
echo "  conftest installed: $(conftest --version)"

echo ""
echo "All tools installed successfully!"
echo ""
echo "Installed tools:"
echo "  - kubeconform: Kubernetes manifest validation"
echo "  - kube-linter: Kubernetes best practices linter"
echo "  - pluto: Deprecated API detection"
echo "  - conftest: OPA policy testing"
