# Helm Values Reference

## Overview

This document provides reference for Helm chart configurations deployed by the infrastructure.

## Chart Versions

All chart versions are centralized in `config/base.ts`:

```typescript
helmConfigs: {
  // Core
  certManager: { version: 'v1.19.3', ... },
  externalSecrets: { version: '0.17.0', ... },
  reloader: { version: '2.2.5', ... },
  metricsServer: { version: '3.13.0', ... },

  // Networking
  cilium: { version: '1.18.6', ... },
  awsLoadBalancerController: { version: '1.14.1', ... },
  externalDns: { version: '1.17.0', ... },

  // Security
  falco: { version: '8.0.0', ... },
  trivyOperator: { version: '0.31.0', ... },
  kyverno: { version: '3.5.0', ... },

  // Observability
  grafanaAgent: { version: '0.50.0', ... },
  loki: { version: '6.29.0', ... },
  tempo: { version: '1.21.0', ... },
  promtail: { version: '6.20.0', ... },

  // Operations
  karpenter: { version: '1.8.6', ... },
  velero: { version: '11.3.2', ... },
  goldilocks: { version: '9.2.0', ... },
  awsNodeTerminationHandler: { version: '0.28.0', ... },
}
```

## Chart Configurations

### Cilium

**Repository:** `https://helm.cilium.io`

```yaml
# Key values
eni:
  enabled: true
ipam:
  mode: eni
tunnel: disabled

# Hubble
hubble:
  enabled: true
  relay:
    enabled: true
  ui:
    enabled: true  # Controlled by features.hubbleUi
  metrics:
    enabled:
      - dns
      - drop
      - tcp
      - flow
      - port-distribution
      - icmp
      - httpV2:exemplars=true;labelsContext=source_ip,source_namespace,...

# Encryption
encryption:
  enabled: true
  type: wireguard

# Policy
policyEnforcementMode: default
```

**Customization:**
- Hubble metrics can be extended for application-specific monitoring
- Additional network policies can be added via CiliumNetworkPolicy CRs

### AWS Load Balancer Controller

**Repository:** `https://aws.github.io/eks-charts`

```yaml
clusterName: ${cluster.clusterName}
serviceAccount:
  create: false
  name: aws-load-balancer-controller
tolerations:
  - key: CriticalAddonsOnly
    operator: Exists
```

**Customization:**
- Ingress annotations control ALB behavior
- See [AWS ALB Controller docs](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)

### External DNS

**Repository:** `https://kubernetes-sigs.github.io/external-dns/`

```yaml
serviceAccount:
  create: false
  name: external-dns
provider: aws
domainFilters:
  - ${config.dns.domainName}
txtOwnerId: ${cluster.clusterName}
policy: sync  # Create and delete records
```

**Customization:**
- Add domain filters for multi-domain setups
- Change policy to `upsert-only` to prevent record deletion

### Falco

**Repository:** `https://falcosecurity.github.io/charts`

```yaml
falco:
  rules_file:
    - /etc/falco/falco_rules.yaml
    - /etc/falco/falco_rules.local.yaml
    - /etc/falco/rules.d
  json_output: true
  json_include_output_property: true

driver:
  kind: modern_ebpf

falcosidekick:
  enabled: true
  config:
    webhook:
      address: http://falco-talon...  # When kill mode enabled

tolerations:
  - operator: Exists

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 256Mi
```

**Customization:**
- Add custom rules via `/etc/falco/rules.d`
- Configure additional outputs (Slack, PagerDuty, etc.)

### Trivy Operator

**Repository:** `https://aquasecurity.github.io/helm-charts`

```yaml
operator:
  scanJobTimeout: 10m
  excludeNamespaces: kube-system,kube-public,...

trivy:
  severity: ${config.security.trivySeverityThreshold}
  ignoreUnfixed: true
```

**Customization:**
- Add private registry credentials
- Configure vulnerability ignore policies

### Kyverno

**Repository:** `https://kyverno.github.io/kyverno/`

```yaml
replicaCount: 3  # Production

admissionController:
  replicas: 3  # Production
  tolerations:
    - key: CriticalAddonsOnly
      operator: Exists

backgroundController:
  replicas: 1

reportsController:
  replicas: 1

cleanupController:
  replicas: 1
```

**Customization:**
- Policies are deployed separately via CDK constructs
- Add PolicyExceptions for specific workloads

### Grafana Agent

**Repository:** `https://grafana.github.io/helm-charts`

```yaml
agent:
  mode: flow
  configMap:
    create: true
    content: |
      prometheus.scrape "pods" { ... }
      prometheus.scrape "hubble" { ... }
      prometheus.remote_write "amp" { ... }

serviceAccount:
  create: false
  name: grafana-agent
```

**Customization:**
- Add additional scrape targets
- Configure custom relabeling rules

### Loki

**Repository:** `https://grafana.github.io/helm-charts`

```yaml
loki:
  auth_enabled: false
  storage:
    type: s3
    s3:
      region: ${config.aws.region}
      bucketNames:
        chunks: ${bucket.bucketName}
        ruler: ${bucket.bucketName}
  limits_config:
    retention_period: ${config.observability.lokiRetentionDays * 24}h

singleBinary:
  replicas: 3  # Production
```

**Customization:**
- Enable multi-tenancy with `auth_enabled: true`
- Configure per-tenant limits

### Tempo

**Repository:** `https://grafana.github.io/helm-charts`

```yaml
tempo:
  storage:
    trace:
      backend: s3
      s3:
        bucket: ${bucket.bucketName}
        endpoint: s3.${region}.amazonaws.com
        region: ${region}
  retention: ${config.observability.tempoRetentionDays * 24}h

traces:
  otlp:
    grpc:
      enabled: true
    http:
      enabled: true
```

**Customization:**
- Add sampling strategies
- Configure search and metrics generation

### Promtail

**Repository:** `https://grafana.github.io/helm-charts`

```yaml
config:
  clients:
    - url: http://loki:3100/loki/api/v1/push

  snippets:
    pipelineStages:
      - cri: {}
      - multiline:
          firstline: '^\d{4}-\d{2}-\d{2}|^\[\d{4}'
          max_wait_time: 3s

    extraRelabelConfigs:
      - action: replace
        source_labels: [__meta_kubernetes_pod_node_name]
        target_label: node
      # ... additional labels

tolerations:
  - effect: NoSchedule
    operator: Exists
  - effect: NoExecute
    operator: Exists

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 128Mi
```

**Customization:**
- Add application-specific pipeline stages
- Configure drop rules for high-volume logs

### Karpenter

**Repository:** `oci://public.ecr.aws/karpenter/karpenter`

```yaml
settings:
  clusterName: ${clusterName}
  clusterEndpoint: ${cluster.clusterEndpoint}
  interruptionQueue: ${queue.queueName}

serviceAccount:
  create: false
  name: karpenter

affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: node-role
              operator: In
              values: [system]
```

**Customization:**
- NodePool and EC2NodeClass are managed via Kubernetes manifests
- See Karpenter documentation for advanced scheduling

### Velero

**Repository:** `https://vmware-tanzu.github.io/helm-charts`

```yaml
credentials:
  useSecret: false  # Using IRSA

serviceAccount:
  server:
    create: false
    name: velero

configuration:
  backupStorageLocation:
    - name: aws
      provider: aws
      bucket: ${bucket.bucketName}
      config:
        region: ${region}

  volumeSnapshotLocation:
    - name: aws
      provider: aws
      config:
        region: ${region}

schedules:
  daily:
    disabled: false
    schedule: "0 3 * * *"
    template:
      ttl: ${retention}h0m0s
      includedNamespaces:
        - "*"
```

**Customization:**
- Add pre/post backup hooks
- Configure excluded resources

### Goldilocks

**Repository:** `https://fairwindsops.github.io/charts/stable`

```yaml
dashboard:
  enabled: true
controller:
  enabled: true
```

**Customization:**
- Label namespaces with `goldilocks.fairwinds.com/enabled=true`
- Configure VPA update mode

## Overriding Helm Values

### Via CDK Config

Add custom values to the appropriate addon stack:

```typescript
// lib/stacks/addons/networking.ts
new HelmRelease(this, 'Cilium', {
  cluster,
  chart: 'cilium',
  values: {
    // Default values
    ...defaultValues,
    // Custom overrides
    customSetting: 'value',
  },
});
```

### Via Config Files

For environment-specific overrides:

```typescript
// config/production.ts
const productionOverrides = {
  // Add helm value overrides structure if needed
};
```

## Updating Chart Versions

1. Update version in `config/base.ts`
2. Review release notes for breaking changes
3. Test in dev environment
4. Deploy to staging
5. Deploy to production

See [Upgrades Runbook](../runbooks/upgrades.md) for detailed procedure.

## Related

- [Environments](./environments.md)
- [Feature Flags](./feature-flags.md)
- [Upgrades Runbook](../runbooks/upgrades.md)
