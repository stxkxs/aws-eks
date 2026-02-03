# Constructs API Reference

Reusable L3 constructs for EKS addon deployment. All constructs are exported from `lib/constructs/index.ts`.

## HelmRelease

Deploy Helm charts to an EKS cluster with deep-merge value support.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster to deploy to |
| `chart` | `string` | Yes | Helm chart name |
| `repository` | `string` | Yes | Helm chart repository URL |
| `version` | `string` | Yes | Chart version |
| `namespace` | `string` | Yes | Kubernetes namespace |
| `createNamespace` | `boolean` | No | Create namespace if missing (default: `false`) |
| `timeout` | `string` | No | Helm install timeout |
| `baseValues` | `Record<string, unknown>` | No | Base values (merged under `values`) |
| `values` | `Record<string, unknown>` | No | Helm values (takes precedence over `baseValues`) |

```typescript
new HelmRelease(this, 'CertManager', {
  cluster,
  chart: 'cert-manager',
  repository: 'https://charts.jetstack.io',
  version: 'v1.16.3',
  namespace: 'cert-manager',
  createNamespace: true,
  values: { installCRDs: true },
});
```

## IrsaRole

Create an IAM Role for Service Accounts (IRSA) with a Kubernetes ServiceAccount.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `serviceAccount` | `string` | Yes | ServiceAccount name |
| `namespace` | `string` | Yes | Kubernetes namespace |
| `policyStatements` | `iam.PolicyStatement[]` | Yes | IAM policy statements |

```typescript
new IrsaRole(this, 'ExternalDnsRole', {
  cluster,
  serviceAccount: 'external-dns',
  namespace: 'external-dns',
  policyStatements: [
    new iam.PolicyStatement({
      actions: ['route53:ChangeResourceRecordSets'],
      resources: ['arn:aws:route53:::hostedzone/*'],
    }),
  ],
});
```

## KyvernoPolicy

Create Kyverno ClusterPolicy resources with environment-aware enforcement.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `name` | `string` | Yes | Policy name |
| `validationFailureAction` | `'Audit' \| 'Enforce'` | Yes | Action on validation failure |
| `rules` | `KyvernoPolicyRule[]` | Yes | Policy rules |
| `category` | `string` | No | Policy category annotation |
| `compliance` | `string[]` | No | Compliance frameworks |

**Static methods:**
- `KyvernoPolicy.createEnvironmentAware()` — Automatically sets Enforce in production, Audit in dev/staging
- `KyvernoSecurityPolicies.disallowPrivileged()` — Disallow privileged containers
- `KyvernoSecurityPolicies.requireRunAsNonRoot()` — Require non-root containers

## CiliumNetworkPolicy

Create Cilium-enhanced network policies with L7 filtering and FQDN support.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `name` | `string` | Yes | Policy name |
| `namespace` | `string` | Yes | Target namespace |
| `description` | `string` | No | Policy description |
| `endpointSelector` | `EndpointSelector` | Yes | Target pod selector |
| `ingress` | `IngressRule[]` | No | Ingress rules |
| `egress` | `EgressRule[]` | No | Egress rules |

## DefaultDenyPolicy

Create default-deny network policies with DNS and kube-system exceptions.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `namespace` | `string` | Yes | Target namespace |
| `direction` | `'ingress' \| 'egress' \| 'both'` | No | Direction (default: `'both'`) |
| `allowDns` | `boolean` | No | Allow DNS egress (default: `true`) |
| `allowKubeSystem` | `boolean` | No | Allow kube-system access (default: `true`) |

## NetworkPolicyTemplates

Static helper methods for common network policy patterns.

- `allowNamespaceIngress(scope, id, cluster, targetNs, sourceNs, ports?)` — Cross-namespace ingress
- `allowFqdnEgress(scope, id, cluster, ns, fqdns, selector, ports?)` — External API egress via FQDN
- `databaseAccess(scope, id, cluster, dbNs, dbSelector, allowedNs, port?)` — Database access pattern

## ArgoCDBootstrap

Bootstrap ArgoCD with the App-of-Apps pattern for GitOps.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `config` | `EnvironmentConfig` | Yes | Environment configuration |
| `version` | `string` | Yes | ArgoCD Helm chart version |
| `gitOpsRepoUrl` | `string` | Yes | GitOps repository URL |
| `gitOpsRevision` | `string` | No | Git revision (default: `'main'`) |
| `gitOpsPath` | `string` | No | Path to ApplicationSets (default: `'applicationsets'`) |
| `hostname` | `string` | No | ArgoCD hostname for ingress |
| `ssoEnabled` | `boolean` | No | Enable SSO via Dex |
| `githubOrg` | `string` | No | GitHub org for SSO |
| `oauthSecretName` | `string` | No | AWS secret name for OAuth credentials |

## NodeLocalDns

Deploy NodeLocal DNSCache as a DaemonSet for improved DNS performance.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `clusterDnsIp` | `string` | Yes | CoreDNS cluster IP |
| `localDnsIp` | `string` | No | Local DNS IP (default: `'169.254.20.10'`) |
| `cacheEnabled` | `boolean` | No | Enable caching (default: `true`) |
| `cacheTtl` | `number` | No | Cache TTL seconds (default: `30`) |
| `metricsEnabled` | `boolean` | No | Enable Prometheus metrics (default: `true`) |

## PriorityClassConstruct

Create Kubernetes PriorityClass resources for pod scheduling priority.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `name` | `string` | Yes | PriorityClass name |
| `spec.value` | `number` | Yes | Priority value |
| `spec.globalDefault` | `boolean` | No | Default priority class (default: `false`) |
| `spec.preemptionPolicy` | `string` | No | Preemption policy (default: `'PreemptLowerPriority'`) |

## StandardPriorityClasses

Create a standard hierarchy of priority classes.

| Priority Class | Value | Description |
|---------------|-------|-------------|
| `platform-critical` | 1,000,000 | Critical platform services |
| `platform-standard` | 500,000 | Standard platform services |
| `workload-critical` | 100,000 | Business-critical workloads |
| `workload-standard` | 50,000 | Default workload priority (globalDefault) |
| `workload-low` | 10,000 | Low-priority batch workloads |
| `workload-preemptible` | 1,000 | Best-effort, non-preempting |

## PodDisruptionBudgetConstruct

Create PodDisruptionBudget resources to protect pod availability.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `name` | `string` | Yes | PDB name |
| `namespace` | `string` | Yes | Kubernetes namespace |
| `spec.selector` | `LabelSelector` | Yes | Pod selector |
| `spec.minAvailable` | `number \| string` | No | Min available (mutually exclusive with maxUnavailable) |
| `spec.maxUnavailable` | `number \| string` | No | Max unavailable (mutually exclusive with minAvailable) |

## SystemPodDisruptionBudgets

Create PDBs for critical system components (CoreDNS, Cilium, Karpenter, monitoring).

## ResourceQuotaConstruct

Create Kubernetes ResourceQuota resources for namespace resource limits.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cluster` | `eks.ICluster` | Yes | EKS cluster |
| `name` | `string` | Yes | Quota name |
| `namespace` | `string` | Yes | Target namespace |
| `spec.hard` | `ResourceList` | Yes | Hard resource limits |
| `createNamespace` | `boolean` | No | Create namespace (default: `false`) |

## NamespaceResourceQuota

Apply a standard quota tier to a namespace.

| Tier | CPU Requests | Memory Requests | Pods |
|------|-------------|-----------------|------|
| `small` | 4 | 8Gi | 20 |
| `medium` | 16 | 32Gi | 50 |
| `large` | 64 | 128Gi | 200 |
| `platform` | 32 | 64Gi | 100 |

## LimitRangeConstruct

Set default resource requests/limits for containers in a namespace.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `defaultCpuRequest` | `string` | `'100m'` | Default CPU request |
| `defaultMemoryRequest` | `string` | `'128Mi'` | Default memory request |
| `defaultCpuLimit` | `string` | `'500m'` | Default CPU limit |
| `defaultMemoryLimit` | `string` | `'512Mi'` | Default memory limit |

## GrafanaDashboard

Deploy Grafana dashboards as ConfigMaps.

## ServiceMonitor / PodMonitor / PrometheusRuleConstruct

Create Prometheus monitoring resources (ServiceMonitor, PodMonitor, PrometheusRule).

## AccessManagement

Manage Kubernetes RBAC and AWS IAM access mappings for the EKS cluster.
