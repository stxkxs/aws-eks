/**
 * Reusable L3 constructs for EKS addon deployment
 *
 * This module exports the following constructs:
 * - {@link HelmRelease} - Deploy Helm charts to EKS
 * - {@link IrsaRole} / {@link PodIdentityRole} - IAM roles for service accounts
 * - {@link KyvernoPolicy} - Kyverno policy management
 * - {@link GrafanaDashboard} / {@link StandardDashboards} - Grafana dashboard deployment
 * - {@link ServiceMonitor} / {@link PodMonitor} / {@link PrometheusRuleConstruct} - Prometheus monitoring
 * - {@link PriorityClassConstruct} / {@link StandardPriorityClasses} - Pod scheduling priority
 * - {@link ResourceQuotaConstruct} / {@link NamespaceResourceQuota} - Namespace resource limits
 * - {@link PodDisruptionBudgetConstruct} / {@link SystemPodDisruptionBudgets} - Disruption protection
 * - {@link AppServiceMonitor} - Simplified ServiceMonitor for custom applications
 * - {@link CiliumNetworkPolicy} / {@link DefaultDenyPolicy} / {@link NetworkPolicyTemplates} - Network policies
 * - {@link NodeLocalDns} - NodeLocal DNSCache for improved DNS performance
 * - {@link LimitRange} - Default container limits
 * - {@link ArgoCDBootstrap} - ArgoCD GitOps bootstrap with App-of-Apps pattern
 *
 * @module constructs
 */
export * from './helm-release';
export * from './irsa-role';
export * from './kyverno-policy';
export * from './grafana-dashboard';
export * from './service-monitor';
export * from './priority-class';
export * from './resource-quota';
export * from './pdb';
export * from './network-policy';
export * from './nodelocal-dns';
export * from './access-management';
export * from './argocd-bootstrap';
// Note: platform.ts exports are superseded by priority-class.ts, pdb.ts, resource-quota.ts
