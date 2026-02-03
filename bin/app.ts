#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getConfig, isValidEnvironment } from '../config';
import { NetworkStack } from '../lib/stacks/network';
import { ClusterStack } from '../lib/stacks/cluster';
import { BootstrapAddonsStack } from '../lib/stacks/addons/bootstrap';
import { KarpenterStack } from '../lib/stacks/addons/karpenter';
import { ArgoCDStack } from '../lib/stacks/addons/argocd';

const app = new cdk.App();

// Get environment from context (default to dev)
const envName = app.node.tryGetContext('environment') ?? 'dev';

if (!isValidEnvironment(envName)) {
  throw new Error(`Invalid environment: ${envName}. Must be one of: dev, staging, production`);
}

// Get AWS account and region from context or environment variables
const accountId = app.node.tryGetContext('account') ?? process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID;

const region =
  app.node.tryGetContext('region') ?? process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-west-2';

if (!accountId) {
  throw new Error('AWS account ID is required. Set via context (-c account=xxx) or AWS_ACCOUNT_ID env var');
}

// Read external values from context or environment variables
const externalValues = {
  hostedZoneId: app.node.tryGetContext('hostedZoneId') ?? process.env.HOSTED_ZONE_ID ?? undefined,
  domainName: app.node.tryGetContext('domainName') ?? process.env.DOMAIN_NAME ?? undefined,
  adminRoleArn: app.node.tryGetContext('adminRoleArn') ?? process.env.ADMIN_ROLE_ARN ?? undefined,
  gitOpsRepoUrl: app.node.tryGetContext('gitOpsRepoUrl') ?? process.env.GITOPS_REPO_URL ?? undefined,
  githubOrg: app.node.tryGetContext('githubOrg') ?? process.env.GITHUB_ORG ?? undefined,
};

// Load environment configuration
const config = getConfig(envName, accountId, region, externalValues);

// Common stack props
const stackProps: cdk.StackProps = {
  env: {
    account: config.aws.accountId,
    region: config.aws.region,
  },
  tags: config.tags,
};

// Stack naming convention: {environment}-{component}
const prefix = config.environment;

// =============================================================================
// Network Stack
// =============================================================================
// Creates VPC with public/private subnets, NAT gateways, and VPC endpoints
const networkStack = new NetworkStack(app, `${prefix}-network`, {
  ...stackProps,
  config,
  description: `VPC and networking for ${config.environment} EKS cluster`,
});

// =============================================================================
// Cluster Stack
// =============================================================================
// Creates EKS cluster with managed node group for system workloads
const clusterStack = new ClusterStack(app, `${prefix}-cluster`, {
  ...stackProps,
  config,
  vpc: networkStack.vpc,
  description: `EKS cluster for ${config.environment}`,
});
clusterStack.addDependency(networkStack);

// =============================================================================
// Bootstrap Addons Stack
// =============================================================================
// Deploys essential infrastructure controllers that must exist before ArgoCD:
// - cert-manager (TLS certificates)
// - external-secrets (AWS Secrets Manager integration)
// - ClusterSecretStore (for AWS secrets)
// - AWS Load Balancer Controller (ALB/NLB ingress)
// - External DNS (Route53 integration)
const bootstrapStack = new BootstrapAddonsStack(app, `${prefix}-bootstrap`, {
  ...stackProps,
  config,
  cluster: clusterStack.cluster,
  vpc: networkStack.vpc,
  description: `Bootstrap addons (cert-manager, external-secrets, ALB, DNS) for ${config.environment}`,
});
bootstrapStack.addDependency(clusterStack);

// =============================================================================
// Karpenter Stack
// =============================================================================
// Deploys Karpenter controller for node autoscaling.
// NOTE: NodePools and EC2NodeClasses are managed by ArgoCD GitOps, not CDK.
// This separation prevents finalizer issues during cluster deletion.
const karpenterStack = new KarpenterStack(app, `${prefix}-karpenter`, {
  ...stackProps,
  config,
  cluster: clusterStack.cluster,
  vpc: networkStack.vpc,
  description: `Karpenter node autoscaling for ${config.environment}`,
});
karpenterStack.addDependency(bootstrapStack);

// =============================================================================
// ArgoCD Stack
// =============================================================================
// Deploys ArgoCD and bootstraps GitOps with App-of-Apps pattern.
// After deployment, ArgoCD manages:
// - Cilium CNI configuration
// - Hubble UI
// - Kyverno and policies
// - Trivy Operator
// - Observability stack (Loki, Tempo, Grafana Agent)
// - Operations tools (Velero, Goldilocks)
// - Karpenter NodePools and EC2NodeClasses
// - Backstage (optional)
const argocdStack = new ArgoCDStack(app, `${prefix}-argocd`, {
  ...stackProps,
  config,
  cluster: clusterStack.cluster,
  certificateArn: bootstrapStack.certificate?.certificateArn,
  description: `ArgoCD GitOps for ${config.environment}`,
});
argocdStack.addDependency(karpenterStack);

// Output summary
console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                     AWS EKS Infrastructure                                  ║
║                     ArgoCD + GitOps Architecture                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Environment:  ${config.environment.padEnd(57)}║
║  Account:      ${config.aws.accountId.padEnd(57)}║
║  Region:       ${config.aws.region.padEnd(57)}║
╠════════════════════════════════════════════════════════════════════════════╣
║  CDK Stacks (5):                                                            ║
║    1. ${prefix}-network          VPC, subnets, NAT
║    2. ${prefix}-cluster          EKS cluster, managed node group
║    3. ${prefix}-bootstrap        cert-manager, external-secrets, ALB, DNS
║    4. ${prefix}-karpenter        Karpenter controller, SQS, EventBridge
║    5. ${prefix}-argocd           ArgoCD, App-of-Apps, GitOps bootstrap
╠════════════════════════════════════════════════════════════════════════════╣
║  ArgoCD Manages (via GitOps):                                               ║
║    - Cilium CNI + Hubble UI                                                 ║
║    - Kyverno policies                                                       ║
║    - Trivy Operator                                                         ║
║    - Observability (Loki, Tempo, Grafana Agent)                            ║
║    - Operations (Velero, Goldilocks)                                        ║
║    - Karpenter NodePools + EC2NodeClasses                                   ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
