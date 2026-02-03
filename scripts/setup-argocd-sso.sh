#!/usr/bin/env bash
set -euo pipefail

# Setup script for ArgoCD GitHub OAuth SSO prerequisites.
#
# This script creates the AWS Secrets Manager secret needed for ArgoCD Dex
# GitHub OAuth integration. You must first create a GitHub OAuth App manually.
#
# Prerequisites:
#   1. Create a GitHub OAuth App at https://github.com/settings/developers
#      - Name: ArgoCD <environment>
#      - Homepage URL: https://<argocd-hostname>
#      - Callback URL: https://<argocd-hostname>/api/dex/callback
#   2. Note the Client ID and Client Secret from the OAuth App
#   3. AWS CLI configured with appropriate permissions
#
# Usage:
#   ./scripts/setup-argocd-sso.sh \
#     --secret-name dev-argocd-github-oauth \
#     --client-id <GITHUB_CLIENT_ID> \
#     --client-secret <GITHUB_CLIENT_SECRET> \
#     --region us-west-2 \
#     --profile my-profile

SECRET_NAME=""
CLIENT_ID=""
CLIENT_SECRET=""
REGION="us-west-2"
PROFILE=""

usage() {
  echo "Usage: $0 --secret-name NAME --client-id ID --client-secret SECRET [--region REGION] [--profile PROFILE]"
  echo ""
  echo "Options:"
  echo "  --secret-name     AWS Secrets Manager secret name (e.g., dev-argocd-github-oauth)"
  echo "  --client-id       GitHub OAuth App Client ID"
  echo "  --client-secret   GitHub OAuth App Client Secret"
  echo "  --region          AWS region (default: us-west-2)"
  echo "  --profile         AWS CLI profile (optional)"
  echo ""
  echo "Example:"
  echo "  $0 --secret-name dev-argocd-github-oauth --client-id Iv1.abc123 --client-secret abc123secret --profile my-profile"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --secret-name) SECRET_NAME="$2"; shift 2 ;;
    --client-id) CLIENT_ID="$2"; shift 2 ;;
    --client-secret) CLIENT_SECRET="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$SECRET_NAME" || -z "$CLIENT_ID" || -z "$CLIENT_SECRET" ]]; then
  echo "Error: --secret-name, --client-id, and --client-secret are required."
  usage
fi

PROFILE_FLAG=""
if [[ -n "$PROFILE" ]]; then
  PROFILE_FLAG="--profile $PROFILE"
fi

# Generate server secret key
SERVER_SECRET_KEY=$(openssl rand -base64 32)

echo "Creating AWS Secrets Manager secret: $SECRET_NAME"
echo "  Region: $REGION"
echo "  Client ID: ${CLIENT_ID:0:8}..."
echo "  Server Secret Key: (generated)"

SECRET_STRING=$(cat <<EOF
{"client_id":"${CLIENT_ID}","client_secret":"${CLIENT_SECRET}","server_secretkey":"${SERVER_SECRET_KEY}"}
EOF
)

# shellcheck disable=SC2086
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" $PROFILE_FLAG >/dev/null 2>&1; then
  echo "Secret already exists. Updating..."
  # shellcheck disable=SC2086
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_STRING" \
    --region "$REGION" \
    $PROFILE_FLAG
else
  echo "Creating new secret..."
  # shellcheck disable=SC2086
  aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --description "GitHub OAuth credentials for ArgoCD Dex SSO" \
    --secret-string "$SECRET_STRING" \
    --region "$REGION" \
    $PROFILE_FLAG
fi

echo ""
echo "Secret created/updated successfully."
echo ""
echo "Next steps:"
echo "  1. Ensure your GitHub OAuth App callback URL is set to:"
echo "     https://<argocd-hostname>/api/dex/callback"
echo "  2. Deploy the CDK stack:"
echo "     npx cdk deploy --all -c environment=dev --profile my-profile"
echo "  3. Verify ExternalSecret synced:"
echo "     kubectl get externalsecrets -n argocd"
