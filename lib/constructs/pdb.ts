import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';
import { PodDisruptionBudgetSpec, PodDisruptionBudget as PDBResource, LabelSelector } from '../types/kubernetes';

/**
 * Properties for creating a {@link PodDisruptionBudgetConstruct}.
 *
 * @remarks
 * Exactly one of {@link PodDisruptionBudgetProps.spec | spec.minAvailable} or
 * {@link PodDisruptionBudgetProps.spec | spec.maxUnavailable} must be provided.
 * Supplying both or neither will cause a validation error at construction time.
 */
export interface PodDisruptionBudgetProps {
  /** EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Name of the PodDisruptionBudget */
  readonly name: string;

  /** Namespace for the PDB */
  readonly namespace: string;

  /** PodDisruptionBudget specification */
  readonly spec: PodDisruptionBudgetSpec;

  /** Labels to apply to the resource */
  readonly labels?: Record<string, string>;

  /** Annotations to apply to the resource */
  readonly annotations?: Record<string, string>;
}

/**
 * CDK construct for creating Kubernetes PodDisruptionBudget resources.
 *
 * PDBs limit the number of pods that can be disrupted simultaneously
 * during voluntary disruptions like node drains, upgrades, or scaling.
 *
 * @remarks
 * A PodDisruptionBudget guarantees that a minimum number (or percentage) of pods
 * matching the selector remain available during **voluntary** disruptions such as
 * `kubectl drain`, cluster autoscaler scale-downs, or rolling upgrades. PDBs do
 * **not** protect against involuntary disruptions (e.g., hardware failures or
 * OOM kills). The Kubernetes eviction API will block eviction requests that would
 * violate the budget, so workloads maintain the specified availability level
 * throughout the disruption window.
 *
 * Use `minAvailable` when you need an absolute availability floor (e.g., quorum-based
 * systems). Use `maxUnavailable` when you want to control the pace of disruption
 * (e.g., rolling restarts of stateless services).
 *
 * @throws {Error} If both `minAvailable` and `maxUnavailable` are specified in the spec.
 * @throws {Error} If neither `minAvailable` nor `maxUnavailable` is specified in the spec.
 *
 * @example
 * ```typescript
 * new PodDisruptionBudgetConstruct(this, 'ApiPdb', {
 *   cluster,
 *   name: 'api-pdb',
 *   namespace: 'production',
 *   spec: {
 *     selector: { matchLabels: { app: 'api' } },
 *     minAvailable: '50%',
 *   },
 * });
 * ```
 */
export class PodDisruptionBudgetConstruct extends Construct {
  /** The underlying Kubernetes manifest */
  public readonly manifest: eks.KubernetesManifest;

  /** The name of the PDB */
  public readonly pdbName: string;

  /** The namespace of the PDB */
  public readonly namespace: string;

  /**
   * @param scope - The CDK construct scope.
   * @param id - The construct id.
   * @param props - Configuration properties for the PodDisruptionBudget.
   */
  constructor(scope: Construct, id: string, props: PodDisruptionBudgetProps) {
    super(scope, id);

    this.pdbName = props.name;
    this.namespace = props.namespace;

    // Validate that either minAvailable or maxUnavailable is set (not both)
    if (props.spec.minAvailable !== undefined && props.spec.maxUnavailable !== undefined) {
      throw new Error('Cannot specify both minAvailable and maxUnavailable in PodDisruptionBudget');
    }
    if (props.spec.minAvailable === undefined && props.spec.maxUnavailable === undefined) {
      throw new Error('Must specify either minAvailable or maxUnavailable in PodDisruptionBudget');
    }

    const pdb: PDBResource = {
      apiVersion: 'policy/v1',
      kind: 'PodDisruptionBudget',
      metadata: {
        name: props.name,
        namespace: props.namespace,
        labels: {
          'app.kubernetes.io/managed-by': 'cdk',
          ...props.labels,
        },
        annotations: props.annotations,
      },
      spec: props.spec,
    };

    this.manifest = new eks.KubernetesManifest(this, 'Resource', {
      cluster: props.cluster,
      manifest: [pdb],
    });
  }
}

/**
 * Properties for creating multiple PDBs for system components via
 * {@link SystemPodDisruptionBudgets}.
 */
export interface SystemPodDisruptionBudgetsProps {
  /** EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /**
   * Whether to create PDBs for CoreDNS
   * @default true
   */
  readonly coreDns?: boolean;

  /**
   * Whether to create PDBs for Cilium
   * @default true
   */
  readonly cilium?: boolean;

  /**
   * Whether to create PDBs for Karpenter
   * @default true
   */
  readonly karpenter?: boolean;

  /**
   * Whether to create PDBs for monitoring stack
   * @default true
   */
  readonly monitoring?: boolean;
}

/**
 * Creates PodDisruptionBudgets for critical system components.
 *
 * This ensures that system components maintain availability during
 * node drains, upgrades, and other voluntary disruptions.
 *
 * @remarks
 * Each system component is given a sensible default disruption budget:
 * - **CoreDNS** (`minAvailable: 1`) -- ensures DNS resolution is never fully
 *   interrupted during node drains.
 * - **Cilium operator / Hubble relay** (`minAvailable: 1`) -- maintains CNI
 *   control-plane availability.
 * - **Karpenter** (`minAvailable: 1`) -- keeps the autoscaler operational so
 *   new nodes can be provisioned during disruptions.
 * - **Monitoring** (Prometheus/Loki `minAvailable: 1`, Grafana Agent
 *   `maxUnavailable: 25%`) -- balances observability continuity with the
 *   ability to roll large DaemonSet fleets quickly.
 *
 * All flags default to `true`; set a flag to `false` to skip creation
 * of PDBs for that component.
 *
 * @example
 * ```typescript
 * new SystemPodDisruptionBudgets(this, 'SystemPdbs', {
 *   cluster,
 *   coreDns: true,
 *   cilium: true,
 *   karpenter: true,
 *   monitoring: true,
 * });
 * ```
 */
export class SystemPodDisruptionBudgets extends Construct {
  /** Map of component names to their PDB constructs */
  public readonly pdbs: Map<string, PodDisruptionBudgetConstruct>;

  /**
   * @param scope - The CDK construct scope.
   * @param id - The construct id.
   * @param props - Flags controlling which system-component PDBs to create.
   */
  constructor(scope: Construct, id: string, props: SystemPodDisruptionBudgetsProps) {
    super(scope, id);

    this.pdbs = new Map();

    // CoreDNS PDB
    if (props.coreDns ?? true) {
      this.pdbs.set(
        'coredns',
        new PodDisruptionBudgetConstruct(this, 'CoreDns', {
          cluster: props.cluster,
          name: 'coredns-pdb',
          namespace: 'kube-system',
          spec: {
            selector: { matchLabels: { 'k8s-app': 'kube-dns' } },
            minAvailable: 1,
          },
          labels: {
            component: 'coredns',
          },
        }),
      );
    }

    // Cilium PDBs
    if (props.cilium ?? true) {
      this.pdbs.set(
        'cilium-operator',
        new PodDisruptionBudgetConstruct(this, 'CiliumOperator', {
          cluster: props.cluster,
          name: 'cilium-operator-pdb',
          namespace: 'kube-system',
          spec: {
            selector: { matchLabels: { name: 'cilium-operator' } },
            minAvailable: 1,
          },
          labels: {
            component: 'cilium',
          },
        }),
      );

      this.pdbs.set(
        'hubble-relay',
        new PodDisruptionBudgetConstruct(this, 'HubbleRelay', {
          cluster: props.cluster,
          name: 'hubble-relay-pdb',
          namespace: 'kube-system',
          spec: {
            selector: { matchLabels: { 'k8s-app': 'hubble-relay' } },
            minAvailable: 1,
          },
          labels: {
            component: 'cilium',
          },
        }),
      );
    }

    // Karpenter PDB
    if (props.karpenter ?? true) {
      this.pdbs.set(
        'karpenter',
        new PodDisruptionBudgetConstruct(this, 'Karpenter', {
          cluster: props.cluster,
          name: 'karpenter-pdb',
          namespace: 'kube-system',
          spec: {
            selector: { matchLabels: { 'app.kubernetes.io/name': 'karpenter' } },
            minAvailable: 1,
          },
          labels: {
            component: 'karpenter',
          },
        }),
      );
    }

    // Monitoring PDBs
    if (props.monitoring ?? true) {
      this.pdbs.set(
        'prometheus',
        new PodDisruptionBudgetConstruct(this, 'Prometheus', {
          cluster: props.cluster,
          name: 'prometheus-pdb',
          namespace: 'monitoring',
          spec: {
            selector: { matchLabels: { 'app.kubernetes.io/name': 'prometheus' } },
            minAvailable: 1,
          },
          labels: {
            component: 'monitoring',
          },
        }),
      );

      this.pdbs.set(
        'grafana-agent',
        new PodDisruptionBudgetConstruct(this, 'GrafanaAgent', {
          cluster: props.cluster,
          name: 'grafana-agent-pdb',
          namespace: 'monitoring',
          spec: {
            selector: { matchLabels: { 'app.kubernetes.io/name': 'grafana-agent' } },
            maxUnavailable: '25%',
          },
          labels: {
            component: 'monitoring',
          },
        }),
      );

      this.pdbs.set(
        'loki',
        new PodDisruptionBudgetConstruct(this, 'Loki', {
          cluster: props.cluster,
          name: 'loki-pdb',
          namespace: 'monitoring',
          spec: {
            selector: { matchLabels: { 'app.kubernetes.io/name': 'loki' } },
            minAvailable: 1,
          },
          labels: {
            component: 'monitoring',
          },
        }),
      );
    }
  }
}

/**
 * Factory function that creates a simple PDB for an application workload.
 *
 * Uses the `app` label key as the pod selector. If neither `minAvailable` nor
 * `maxUnavailable` is provided, defaults to `maxUnavailable: 1`, which allows
 * one pod to be disrupted at a time.
 *
 * @remarks
 * This is a convenience wrapper around {@link PodDisruptionBudgetConstruct} for the
 * common case where pods are selected by a single `app` label. For more complex
 * selectors (e.g., `matchExpressions`), use {@link PodDisruptionBudgetConstruct}
 * directly.
 *
 * @param scope - The CDK construct scope.
 * @param id - The construct id.
 * @param cluster - The EKS cluster to deploy to.
 * @param options - PDB configuration options.
 * @param options.name - Kubernetes name for the PDB resource.
 * @param options.namespace - Kubernetes namespace for the PDB.
 * @param options.appLabel - Value for the `app` label used in the pod selector.
 * @param options.minAvailable - Minimum pods that must remain available. Mutually
 *   exclusive with `maxUnavailable`.
 * @param options.maxUnavailable - Maximum pods that can be unavailable. Defaults
 *   to `1` when `minAvailable` is not set.
 * @returns A configured {@link PodDisruptionBudgetConstruct} instance.
 *
 * @example
 * ```typescript
 * const pdb = createApplicationPdb(this, 'MyAppPdb', cluster, {
 *   name: 'my-app-pdb',
 *   namespace: 'production',
 *   appLabel: 'my-app',
 *   minAvailable: '50%',
 * });
 * ```
 */
export function createApplicationPdb(
  scope: Construct,
  id: string,
  cluster: eks.ICluster,
  options: {
    name: string;
    namespace: string;
    appLabel: string;
    minAvailable?: number | string;
    maxUnavailable?: number | string;
  },
): PodDisruptionBudgetConstruct {
  const selector: LabelSelector = {
    matchLabels: { app: options.appLabel },
  };

  const spec: PodDisruptionBudgetSpec = {
    selector,
    ...(options.minAvailable !== undefined
      ? { minAvailable: options.minAvailable }
      : { maxUnavailable: options.maxUnavailable ?? 1 }),
  };

  return new PodDisruptionBudgetConstruct(scope, id, {
    cluster,
    name: options.name,
    namespace: options.namespace,
    spec,
    labels: {
      app: options.appLabel,
    },
  });
}
