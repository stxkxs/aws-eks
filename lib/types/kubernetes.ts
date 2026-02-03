/**
 * Kubernetes resource type definitions
 *
 * These types mirror Kubernetes API specs for use in CDK constructs
 * and configuration validation. They enable type-safe resource creation.
 */

/**
 * Label selector for Kubernetes resources
 *
 * @example
 * ```typescript
 * const selector: LabelSelector = {
 *   matchLabels: { app: 'my-app', tier: 'frontend' },
 *   matchExpressions: [
 *     { key: 'environment', operator: 'In', values: ['prod', 'staging'] },
 *   ],
 * };
 * ```
 */
export interface LabelSelector {
  /** Equality-based label requirements */
  readonly matchLabels?: Record<string, string>;

  /** Set-based label requirements */
  readonly matchExpressions?: LabelSelectorRequirement[];
}

/**
 * A single label selector requirement (set-based)
 */
export interface LabelSelectorRequirement {
  /** Label key to match */
  readonly key: string;

  /** Operator for the requirement */
  readonly operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';

  /** Values to match (for In/NotIn operators) */
  readonly values?: string[];
}

/**
 * PodDisruptionBudget specification
 *
 * Limits the number of pods that can be disrupted simultaneously
 * during voluntary disruptions (node drains, upgrades, etc.).
 *
 * @see https://kubernetes.io/docs/tasks/run-application/configure-pdb/
 *
 * @example
 * ```typescript
 * const pdbSpec: PodDisruptionBudgetSpec = {
 *   selector: { matchLabels: { app: 'critical-service' } },
 *   minAvailable: '50%',  // or use an integer like 2
 * };
 * ```
 */
export interface PodDisruptionBudgetSpec {
  /** Label selector to identify pods covered by this PDB */
  readonly selector: LabelSelector;

  /**
   * Minimum number/percentage of pods that must remain available.
   * Can be an integer (e.g., 2) or percentage string (e.g., "50%").
   * Mutually exclusive with maxUnavailable.
   */
  readonly minAvailable?: number | string;

  /**
   * Maximum number/percentage of pods that can be unavailable.
   * Can be an integer (e.g., 1) or percentage string (e.g., "25%").
   * Mutually exclusive with minAvailable.
   */
  readonly maxUnavailable?: number | string;

  /**
   * UnhealthyPodEvictionPolicy defines the criteria for when
   * unhealthy pods should be considered for eviction.
   * @default 'IfHealthyBudget'
   */
  readonly unhealthyPodEvictionPolicy?: 'IfHealthyBudget' | 'AlwaysAllow';
}

/**
 * Full PodDisruptionBudget resource definition.
 *
 * @see {@link PodDisruptionBudgetSpec} for the spec fields
 */
export interface PodDisruptionBudget {
  readonly apiVersion: 'policy/v1';
  readonly kind: 'PodDisruptionBudget';
  readonly metadata: {
    readonly name: string;
    readonly namespace?: string;
    readonly labels?: Record<string, string>;
    readonly annotations?: Record<string, string>;
  };
  readonly spec: PodDisruptionBudgetSpec;
}

/**
 * Resource quantity (CPU, memory, storage)
 *
 * @example
 * ```typescript
 * const resources: ResourceList = {
 *   'cpu': '100m',
 *   'memory': '256Mi',
 *   'ephemeral-storage': '1Gi',
 * };
 * ```
 */
export type ResourceList = Record<string, string>;

/**
 * Scope selector for ResourceQuota
 */
export interface ScopeSelector {
  /** List of scope selector requirements */
  readonly matchExpressions?: ScopeSelectorRequirement[];
}

/**
 * A single scope selector requirement
 */
export interface ScopeSelectorRequirement {
  /** Name of the scope */
  readonly scopeName:
    | 'Terminating'
    | 'NotTerminating'
    | 'BestEffort'
    | 'NotBestEffort'
    | 'PriorityClass'
    | 'CrossNamespacePodAffinity';

  /** Operator for the requirement */
  readonly operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';

  /** Values to match */
  readonly values?: string[];
}

/**
 * ResourceQuota specification
 *
 * Limits aggregate resource consumption in a namespace.
 *
 * @see https://kubernetes.io/docs/concepts/policy/resource-quotas/
 *
 * @example
 * ```typescript
 * const quotaSpec: ResourceQuotaSpec = {
 *   hard: {
 *     'requests.cpu': '10',
 *     'requests.memory': '20Gi',
 *     'limits.cpu': '20',
 *     'limits.memory': '40Gi',
 *     'pods': '50',
 *     'services': '10',
 *     'persistentvolumeclaims': '5',
 *   },
 * };
 * ```
 */
export interface ResourceQuotaSpec {
  /**
   * Hard limits for resources.
   * Common keys:
   * - requests.cpu, requests.memory, requests.storage
   * - limits.cpu, limits.memory
   * - pods, services, secrets, configmaps
   * - persistentvolumeclaims, services.loadbalancers
   */
  readonly hard: ResourceList;

  /**
   * Scopes that the quota applies to.
   * If specified, only resources matching the scope are counted.
   */
  readonly scopes?: (
    | 'Terminating'
    | 'NotTerminating'
    | 'BestEffort'
    | 'NotBestEffort'
    | 'PriorityClass'
    | 'CrossNamespacePodAffinity'
  )[];

  /**
   * More granular scope selection using expressions
   */
  readonly scopeSelector?: ScopeSelector;
}

/**
 * Full ResourceQuota resource definition.
 *
 * @see {@link ResourceQuotaSpec} for the spec fields
 */
export interface ResourceQuota {
  readonly apiVersion: 'v1';
  readonly kind: 'ResourceQuota';
  readonly metadata: {
    readonly name: string;
    readonly namespace: string;
    readonly labels?: Record<string, string>;
    readonly annotations?: Record<string, string>;
  };
  readonly spec: ResourceQuotaSpec;
}

/**
 * PriorityClass specification
 *
 * Defines scheduling priority for pods. Higher values = higher priority.
 *
 * @see https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/
 *
 * @example
 * ```typescript
 * const prioritySpec: PriorityClassSpec = {
 *   value: 1000000,
 *   globalDefault: false,
 *   preemptionPolicy: 'PreemptLowerPriority',
 *   description: 'High priority class for critical workloads',
 * };
 * ```
 */
export interface PriorityClassSpec {
  /**
   * Priority value. Higher = more important.
   * System-critical pods use values >= 1000000000.
   * User pods should use values < 1000000000.
   */
  readonly value: number;

  /**
   * Whether this is the default priority class for pods
   * that don't specify one. Only one can be default.
   * @default false
   */
  readonly globalDefault?: boolean;

  /**
   * Policy for preempting lower-priority pods.
   * - PreemptLowerPriority: can preempt lower priority pods
   * - Never: cannot preempt other pods
   * @default 'PreemptLowerPriority'
   */
  readonly preemptionPolicy?: 'PreemptLowerPriority' | 'Never';

  /**
   * Human-readable description of the priority class
   */
  readonly description?: string;
}

/**
 * Full PriorityClass resource definition.
 *
 * @see {@link PriorityClassSpec} for the spec fields
 * @see {@link StandardPriorityValues} for recommended priority values
 */
export interface PriorityClass {
  readonly apiVersion: 'scheduling.k8s.io/v1';
  readonly kind: 'PriorityClass';
  readonly metadata: {
    readonly name: string;
    readonly labels?: Record<string, string>;
    readonly annotations?: Record<string, string>;
  };
  /** Priority value */
  readonly value: number;
  /** Whether this is the default */
  readonly globalDefault?: boolean;
  /** Preemption policy */
  readonly preemptionPolicy?: 'PreemptLowerPriority' | 'Never';
  /** Description */
  readonly description?: string;
}

/**
 * Standard priority class values for common use cases
 */
export const StandardPriorityValues = {
  /** System critical pods (kubelet, CNI, etc.) */
  SYSTEM_CLUSTER_CRITICAL: 2000000000,
  /** Node critical pods (must run on every node) */
  SYSTEM_NODE_CRITICAL: 2000001000,
  /** Platform services (monitoring, logging, etc.) */
  PLATFORM_HIGH: 1000000,
  /** Platform services with lower priority */
  PLATFORM_MEDIUM: 500000,
  /** Business critical workloads */
  WORKLOAD_HIGH: 100000,
  /** Standard workloads */
  WORKLOAD_MEDIUM: 50000,
  /** Low priority/batch workloads */
  WORKLOAD_LOW: 10000,
  /** Best-effort/preemptible workloads */
  WORKLOAD_BEST_EFFORT: 1000,
} as const;

/**
 * Network policy port specification
 */
export interface NetworkPolicyPort {
  /** Protocol (TCP, UDP, SCTP) */
  readonly protocol?: 'TCP' | 'UDP' | 'SCTP';

  /** Port number or named port */
  readonly port?: number | string;

  /**
   * End of port range (if specifying a range).
   * Port must be a number when using endPort.
   */
  readonly endPort?: number;
}

/**
 * IP block for network policy rules
 */
export interface IPBlock {
  /** CIDR block (e.g., "10.0.0.0/8") */
  readonly cidr: string;

  /** CIDRs to exclude from the block */
  readonly except?: string[];
}

/**
 * Peer selector for network policy rules
 */
export interface NetworkPolicyPeer {
  /** Pod selector (pods in the policy's namespace) */
  readonly podSelector?: LabelSelector;

  /** Namespace selector (for cross-namespace rules) */
  readonly namespaceSelector?: LabelSelector;

  /** IP block (for external traffic) */
  readonly ipBlock?: IPBlock;
}

/**
 * Ingress rule for NetworkPolicy
 */
export interface NetworkPolicyIngressRule {
  /** Ports to allow (empty = all ports) */
  readonly ports?: NetworkPolicyPort[];

  /** Sources to allow (empty = all sources matching podSelector) */
  readonly from?: NetworkPolicyPeer[];
}

/**
 * Egress rule for NetworkPolicy
 */
export interface NetworkPolicyEgressRule {
  /** Ports to allow (empty = all ports) */
  readonly ports?: NetworkPolicyPort[];

  /** Destinations to allow (empty = all destinations) */
  readonly to?: NetworkPolicyPeer[];
}

/**
 * NetworkPolicy specification
 *
 * Controls traffic flow to/from pods. By default, pods accept all traffic.
 * NetworkPolicies are additive - if any policy selects a pod, that pod
 * is isolated and only traffic allowed by policies is permitted.
 *
 * @see https://kubernetes.io/docs/concepts/services-networking/network-policies/
 *
 * @example
 * ```typescript
 * const policySpec: NetworkPolicySpec = {
 *   podSelector: { matchLabels: { app: 'web' } },
 *   policyTypes: ['Ingress', 'Egress'],
 *   ingress: [
 *     {
 *       from: [
 *         { namespaceSelector: { matchLabels: { name: 'frontend' } } },
 *       ],
 *       ports: [{ protocol: 'TCP', port: 8080 }],
 *     },
 *   ],
 *   egress: [
 *     {
 *       to: [
 *         { namespaceSelector: { matchLabels: { name: 'database' } } },
 *       ],
 *       ports: [{ protocol: 'TCP', port: 5432 }],
 *     },
 *   ],
 * };
 * ```
 */
export interface NetworkPolicySpec {
  /**
   * Pods to which this policy applies.
   * Empty selector ({}) selects all pods in the namespace.
   */
  readonly podSelector: LabelSelector;

  /**
   * Types of traffic affected by this policy.
   * If not specified, Ingress is assumed if ingress rules exist,
   * and Egress is assumed if egress rules exist.
   */
  readonly policyTypes?: ('Ingress' | 'Egress')[];

  /**
   * Ingress rules (traffic coming into pods).
   * Empty array = deny all ingress.
   * Omitting this field = allow all ingress (unless policyTypes includes Ingress).
   */
  readonly ingress?: NetworkPolicyIngressRule[];

  /**
   * Egress rules (traffic going out from pods).
   * Empty array = deny all egress.
   * Omitting this field = allow all egress (unless policyTypes includes Egress).
   */
  readonly egress?: NetworkPolicyEgressRule[];
}

/**
 * Full NetworkPolicy resource definition.
 *
 * @see {@link NetworkPolicySpec} for the spec fields
 * @see {@link createDenyAllIngressPolicy} for a deny-all ingress factory
 * @see {@link createDenyAllEgressPolicy} for a deny-all egress factory
 * @see {@link createAllowDnsEgressPolicy} for a DNS allow factory
 */
export interface NetworkPolicy {
  readonly apiVersion: 'networking.k8s.io/v1';
  readonly kind: 'NetworkPolicy';
  readonly metadata: {
    readonly name: string;
    readonly namespace: string;
    readonly labels?: Record<string, string>;
    readonly annotations?: Record<string, string>;
  };
  readonly spec: NetworkPolicySpec;
}

/**
 * Common network policy templates for namespace isolation.
 *
 * @see {@link createDenyAllIngressPolicy} for creating deny-all ingress policies
 * @see {@link createDenyAllEgressPolicy} for creating deny-all egress policies
 * @see {@link createAllowDnsEgressPolicy} for creating DNS allow policies
 */
export interface DefaultNetworkPolicies {
  /** Deny all ingress traffic to a namespace */
  readonly denyAllIngress: NetworkPolicySpec;
  /** Deny all egress traffic from a namespace */
  readonly denyAllEgress: NetworkPolicySpec;
  /** Allow DNS egress (required for most workloads) */
  readonly allowDnsEgress: NetworkPolicySpec;
  /** Allow traffic from same namespace */
  readonly allowSameNamespace: NetworkPolicySpec;
  /** Allow traffic from monitoring namespace */
  readonly allowMonitoring: NetworkPolicySpec;
}

/**
 * Generates a default deny-all ingress NetworkPolicy for a namespace.
 *
 * Selects all pods in the namespace and denies all incoming traffic.
 * Typically paired with {@link createAllowDnsEgressPolicy} and
 * more specific allow rules.
 *
 * @param namespace - The Kubernetes namespace to apply the policy to
 * @returns A complete NetworkPolicy resource manifest
 */
export function createDenyAllIngressPolicy(namespace: string): NetworkPolicy {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'deny-all-ingress',
      namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'cdk',
        'policy-type': 'default',
      },
    },
    spec: {
      podSelector: {},
      policyTypes: ['Ingress'],
      ingress: [],
    },
  };
}

/**
 * Generates a default deny-all egress NetworkPolicy for a namespace.
 *
 * Selects all pods in the namespace and denies all outgoing traffic.
 * Use alongside {@link createAllowDnsEgressPolicy} to permit DNS
 * resolution while blocking everything else by default.
 *
 * @param namespace - The Kubernetes namespace to apply the policy to
 * @returns A complete NetworkPolicy resource manifest
 */
export function createDenyAllEgressPolicy(namespace: string): NetworkPolicy {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'deny-all-egress',
      namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'cdk',
        'policy-type': 'default',
      },
    },
    spec: {
      podSelector: {},
      policyTypes: ['Egress'],
      egress: [],
    },
  };
}

/**
 * Generates a NetworkPolicy allowing DNS egress to kube-dns/CoreDNS.
 *
 * Most workloads require DNS resolution. This policy allows UDP and TCP
 * port 53 traffic to the `kube-dns` pods in `kube-system`, and should
 * be applied alongside {@link createDenyAllEgressPolicy}.
 *
 * @param namespace - The Kubernetes namespace to apply the policy to
 * @returns A complete NetworkPolicy resource manifest
 */
export function createAllowDnsEgressPolicy(namespace: string): NetworkPolicy {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'allow-dns-egress',
      namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'cdk',
        'policy-type': 'default',
      },
    },
    spec: {
      podSelector: {},
      policyTypes: ['Egress'],
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' },
              },
              podSelector: {
                matchLabels: { 'k8s-app': 'kube-dns' },
              },
            },
          ],
          ports: [
            { protocol: 'UDP', port: 53 },
            { protocol: 'TCP', port: 53 },
          ],
        },
      ],
    },
  };
}
