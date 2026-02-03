import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';
import { PriorityClassSpec, PriorityClass as PriorityClassResource, StandardPriorityValues } from '../types/kubernetes';

/**
 * Properties for creating a PriorityClass
 */
export interface PriorityClassProps {
  /** EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Name of the PriorityClass */
  readonly name: string;

  /** PriorityClass specification */
  readonly spec: PriorityClassSpec;

  /** Labels to apply to the resource */
  readonly labels?: Record<string, string>;

  /** Annotations to apply to the resource */
  readonly annotations?: Record<string, string>;
}

/**
 * CDK construct for creating Kubernetes PriorityClass resources.
 *
 * PriorityClasses define scheduling priority for pods. Pods reference a
 * PriorityClass by name to get their priority value. Higher values mean
 * higher priority for scheduling.
 *
 * @remarks
 * A PriorityClass is a cluster-scoped resource. When the scheduler cannot
 * place a high-priority pod due to insufficient resources, it will preempt
 * (evict) lower-priority pods to make room, unless the `preemptionPolicy`
 * is set to `Never`. Only one PriorityClass may set `globalDefault: true`;
 * pods without an explicit `priorityClassName` receive that default.
 *
 * @see {@link StandardPriorityClasses} for a pre-built hierarchy of priority classes.
 *
 * @example
 * ```typescript
 * new PriorityClassConstruct(this, 'CriticalPriority', {
 *   cluster,
 *   name: 'platform-critical',
 *   spec: {
 *     value: 1000000,
 *     globalDefault: false,
 *     preemptionPolicy: 'PreemptLowerPriority',
 *     description: 'Critical platform services',
 *   },
 * });
 * ```
 */
export class PriorityClassConstruct extends Construct {
  /** The underlying Kubernetes manifest */
  public readonly manifest: eks.KubernetesManifest;

  /** The name of the PriorityClass */
  public readonly priorityClassName: string;

  /**
   * Creates a new PriorityClassConstruct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Configuration properties including the priority class name and spec.
   */
  constructor(scope: Construct, id: string, props: PriorityClassProps) {
    super(scope, id);

    this.priorityClassName = props.name;

    const priorityClass: PriorityClassResource = {
      apiVersion: 'scheduling.k8s.io/v1',
      kind: 'PriorityClass',
      metadata: {
        name: props.name,
        labels: {
          'app.kubernetes.io/managed-by': 'cdk',
          ...props.labels,
        },
        annotations: props.annotations,
      },
      value: props.spec.value,
      globalDefault: props.spec.globalDefault ?? false,
      preemptionPolicy: props.spec.preemptionPolicy ?? 'PreemptLowerPriority',
      description: props.spec.description,
    };

    this.manifest = new eks.KubernetesManifest(this, 'Resource', {
      cluster: props.cluster,
      manifest: [priorityClass],
    });
  }
}

/**
 * Properties for StandardPriorityClasses
 */
export interface StandardPriorityClassesProps {
  /** EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /**
   * Whether to create the platform priority classes
   * @default true
   */
  readonly createPlatformClasses?: boolean;

  /**
   * Whether to create the workload priority classes
   * @default true
   */
  readonly createWorkloadClasses?: boolean;
}

/**
 * Creates a standard set of PriorityClasses for the cluster.
 *
 * This construct creates a consistent hierarchy of priority classes:
 * - Platform: For infrastructure components (monitoring, logging, etc.)
 * - Workload: For application workloads (high, medium, low, best-effort)
 *
 * @remarks
 * The priority hierarchy from highest to lowest is:
 *
 * | Name                  | Value     | Preemption | Use case                                           |
 * |-----------------------|-----------|------------|----------------------------------------------------|
 * | `platform-critical`   | 1,000,000 | Yes        | CNI, monitoring agents, core platform services     |
 * | `platform-standard`   | 500,000   | Yes        | Dashboards, optional platform components           |
 * | `workload-critical`   | 100,000   | Yes        | Business-critical, high-availability applications  |
 * | `workload-standard`   | 50,000    | Yes        | Standard workloads (**global default**)             |
 * | `workload-low`        | 10,000    | Yes        | Low-priority batch and background jobs             |
 * | `workload-preemptible`| 1,000     | **Never**  | Best-effort workloads safe to evict at any time    |
 *
 * The `workload-standard` class is marked as the `globalDefault`, so any pod
 * that does not specify a `priorityClassName` will receive priority value
 * `50,000`. Only `workload-preemptible` has `preemptionPolicy: Never`,
 * meaning it will not evict other pods to be scheduled but can itself be
 * evicted by any higher-priority pod.
 *
 * Platform classes sit above workload classes to ensure infrastructure
 * components (Cilium, Prometheus, Falco) are never preempted by application
 * workloads. Kubernetes system-level priority classes (`system-cluster-critical`
 * and `system-node-critical`) are built-in and remain above all custom classes.
 *
 * @example
 * ```typescript
 * new StandardPriorityClasses(this, 'PriorityClasses', {
 *   cluster,
 *   createPlatformClasses: true,
 *   createWorkloadClasses: true,
 * });
 * ```
 */
export class StandardPriorityClasses extends Construct {
  /** Map of priority class names to their constructs */
  public readonly priorityClasses: Map<string, PriorityClassConstruct>;

  /**
   * Creates a new StandardPriorityClasses construct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Configuration properties controlling which tiers of priority classes to create.
   */
  constructor(scope: Construct, id: string, props: StandardPriorityClassesProps) {
    super(scope, id);

    this.priorityClasses = new Map();

    const createPlatform = props.createPlatformClasses ?? true;
    const createWorkload = props.createWorkloadClasses ?? true;

    if (createPlatform) {
      this.priorityClasses.set(
        'platform-critical',
        new PriorityClassConstruct(this, 'PlatformCritical', {
          cluster: props.cluster,
          name: 'platform-critical',
          spec: {
            value: StandardPriorityValues.PLATFORM_HIGH,
            preemptionPolicy: 'PreemptLowerPriority',
            description: 'Critical platform services (CNI, monitoring agents, etc.)',
          },
        }),
      );

      this.priorityClasses.set(
        'platform-standard',
        new PriorityClassConstruct(this, 'PlatformStandard', {
          cluster: props.cluster,
          name: 'platform-standard',
          spec: {
            value: StandardPriorityValues.PLATFORM_MEDIUM,
            preemptionPolicy: 'PreemptLowerPriority',
            description: 'Standard platform services (dashboards, optional components)',
          },
        }),
      );
    }

    if (createWorkload) {
      this.priorityClasses.set(
        'workload-critical',
        new PriorityClassConstruct(this, 'WorkloadCritical', {
          cluster: props.cluster,
          name: 'workload-critical',
          spec: {
            value: StandardPriorityValues.WORKLOAD_HIGH,
            preemptionPolicy: 'PreemptLowerPriority',
            description: 'Business-critical workloads requiring high availability',
          },
        }),
      );

      this.priorityClasses.set(
        'workload-standard',
        new PriorityClassConstruct(this, 'WorkloadStandard', {
          cluster: props.cluster,
          name: 'workload-standard',
          spec: {
            value: StandardPriorityValues.WORKLOAD_MEDIUM,
            globalDefault: true,
            preemptionPolicy: 'PreemptLowerPriority',
            description: 'Standard workloads (default priority class)',
          },
        }),
      );

      this.priorityClasses.set(
        'workload-low',
        new PriorityClassConstruct(this, 'WorkloadLow', {
          cluster: props.cluster,
          name: 'workload-low',
          spec: {
            value: StandardPriorityValues.WORKLOAD_LOW,
            preemptionPolicy: 'PreemptLowerPriority',
            description: 'Low-priority batch workloads',
          },
        }),
      );

      this.priorityClasses.set(
        'workload-preemptible',
        new PriorityClassConstruct(this, 'WorkloadPreemptible', {
          cluster: props.cluster,
          name: 'workload-preemptible',
          spec: {
            value: StandardPriorityValues.WORKLOAD_BEST_EFFORT,
            preemptionPolicy: 'Never',
            description: 'Best-effort workloads that can be preempted',
          },
        }),
      );
    }
  }
}
