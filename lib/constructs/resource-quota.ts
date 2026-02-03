import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';
import { ResourceQuotaSpec, ResourceQuota as ResourceQuotaResource, ResourceList } from '../types/kubernetes';

/**
 * Properties for creating a {@link ResourceQuotaConstruct}.
 */
export interface ResourceQuotaProps {
  /** EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Name of the ResourceQuota */
  readonly name: string;

  /** Namespace to apply the quota to */
  readonly namespace: string;

  /** ResourceQuota specification */
  readonly spec: ResourceQuotaSpec;

  /** Labels to apply to the resource */
  readonly labels?: Record<string, string>;

  /** Annotations to apply to the resource */
  readonly annotations?: Record<string, string>;

  /**
   * Whether to create the namespace if it doesn't exist
   * @default false
   */
  readonly createNamespace?: boolean;
}

/**
 * CDK construct for creating Kubernetes ResourceQuota resources.
 *
 * ResourceQuotas limit aggregate resource consumption in a namespace,
 * preventing any single namespace from consuming too many cluster resources.
 *
 * @remarks
 * Once a ResourceQuota is active in a namespace, the Kubernetes API server
 * rejects any pod or resource creation that would exceed the declared hard
 * limits. This provides a hard ceiling on per-namespace consumption and
 * prevents "noisy neighbour" problems in multi-tenant clusters. Pair with
 * {@link LimitRangeConstruct} to set default requests/limits so that every
 * container counts toward the quota.
 *
 * @example
 * ```typescript
 * new ResourceQuotaConstruct(this, 'TeamQuota', {
 *   cluster,
 *   name: 'team-quota',
 *   namespace: 'team-a',
 *   spec: {
 *     hard: {
 *       'requests.cpu': '10',
 *       'requests.memory': '20Gi',
 *       'limits.cpu': '20',
 *       'limits.memory': '40Gi',
 *       'pods': '50',
 *     },
 *   },
 * });
 * ```
 */
export class ResourceQuotaConstruct extends Construct {
  /** The underlying Kubernetes manifest */
  public readonly manifest: eks.KubernetesManifest;

  /** The name of the ResourceQuota */
  public readonly quotaName: string;

  /** The namespace the quota applies to */
  public readonly namespace: string;

  /**
   * @param scope - The CDK construct scope.
   * @param id - The construct id.
   * @param props - Configuration properties for the ResourceQuota.
   */
  constructor(scope: Construct, id: string, props: ResourceQuotaProps) {
    super(scope, id);

    this.quotaName = props.name;
    this.namespace = props.namespace;

    // Create namespace if requested
    if (props.createNamespace) {
      new eks.KubernetesManifest(this, 'Namespace', {
        cluster: props.cluster,
        manifest: [
          {
            apiVersion: 'v1',
            kind: 'Namespace',
            metadata: {
              name: props.namespace,
              labels: {
                'app.kubernetes.io/managed-by': 'cdk',
              },
            },
          },
        ],
      });
    }

    const quota: ResourceQuotaResource = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
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
      manifest: [quota],
    });
  }
}

/**
 * Describes a single preset resource quota tier.
 *
 * @see {@link StandardQuotaTiers} for the built-in tiers.
 */
export interface ResourceQuotaTier {
  /** Human-readable name for the tier */
  readonly name: string;

  /** Hard limits for the tier */
  readonly limits: ResourceList;
}

/**
 * Standard resource quota tiers for common namespace sizing.
 *
 * @remarks
 * The tier hierarchy is designed for multi-tenant EKS clusters and provides
 * four preset levels of resource allocation:
 *
 * | Tier       | CPU (req/lim) | Memory (req/lim) | Pods | PVCs |
 * |------------|---------------|------------------|------|------|
 * | `small`    | 4 / 8         | 8Gi / 16Gi       | 20   | 5    |
 * | `medium`   | 16 / 32       | 32Gi / 64Gi      | 50   | 15   |
 * | `large`    | 64 / 128      | 128Gi / 256Gi    | 200  | 50   |
 * | `platform` | 32 / 64       | 64Gi / 128Gi     | 100  | 20   |
 *
 * - **small** -- suitable for individual developer sandboxes or lightweight
 *   microservices.
 * - **medium** -- the default tier; fits most team workloads.
 * - **large** -- for data-intensive or high-throughput services that need
 *   generous headroom.
 * - **platform** -- reserved for infrastructure namespaces (e.g., monitoring,
 *   CI runners) that need elevated object counts and moderate compute.
 *
 * Use {@link NamespaceResourceQuota} to apply a tier with optional per-field
 * overrides via `customLimits`.
 */
export const StandardQuotaTiers: Record<string, ResourceQuotaTier> = {
  /** Small team/project - limited resources */
  small: {
    name: 'small',
    limits: {
      'requests.cpu': '4',
      'requests.memory': '8Gi',
      'limits.cpu': '8',
      'limits.memory': '16Gi',
      pods: '20',
      services: '5',
      secrets: '20',
      configmaps: '20',
      persistentvolumeclaims: '5',
    },
  },

  /** Medium team/project - moderate resources */
  medium: {
    name: 'medium',
    limits: {
      'requests.cpu': '16',
      'requests.memory': '32Gi',
      'limits.cpu': '32',
      'limits.memory': '64Gi',
      pods: '50',
      services: '15',
      secrets: '50',
      configmaps: '50',
      persistentvolumeclaims: '15',
    },
  },

  /** Large team/project - generous resources */
  large: {
    name: 'large',
    limits: {
      'requests.cpu': '64',
      'requests.memory': '128Gi',
      'limits.cpu': '128',
      'limits.memory': '256Gi',
      pods: '200',
      services: '50',
      secrets: '100',
      configmaps: '100',
      persistentvolumeclaims: '50',
    },
  },

  /** Platform namespace - for infrastructure components */
  platform: {
    name: 'platform',
    limits: {
      'requests.cpu': '32',
      'requests.memory': '64Gi',
      'limits.cpu': '64',
      'limits.memory': '128Gi',
      pods: '100',
      services: '30',
      secrets: '100',
      configmaps: '100',
      persistentvolumeclaims: '20',
    },
  },
};

/**
 * Properties for {@link NamespaceResourceQuota}.
 */
export interface NamespaceResourceQuotaProps {
  /** EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Namespace to apply the quota to */
  readonly namespace: string;

  /**
   * Quota tier to apply
   * @default 'medium'
   */
  readonly tier?: 'small' | 'medium' | 'large' | 'platform';

  /**
   * Custom limits to merge with or override the tier defaults
   */
  readonly customLimits?: ResourceList;

  /**
   * Whether to create the namespace if it doesn't exist
   * @default false
   */
  readonly createNamespace?: boolean;
}

/**
 * Convenience construct for applying a standard quota tier to a namespace.
 *
 * @remarks
 * This construct merges the chosen {@link StandardQuotaTiers | tier} defaults
 * with any `customLimits` you provide (custom values win). It also names the
 * resulting ResourceQuota `<namespace>-quota` and labels it with the tier name
 * for easy identification via `kubectl get resourcequota -l quota-tier=medium`.
 *
 * @example
 * ```typescript
 * new NamespaceResourceQuota(this, 'TeamAQuota', {
 *   cluster,
 *   namespace: 'team-a',
 *   tier: 'medium',
 *   customLimits: {
 *     pods: '75', // Override the medium tier's pod limit
 *   },
 *   createNamespace: true,
 * });
 * ```
 */
export class NamespaceResourceQuota extends Construct {
  /** The underlying ResourceQuotaConstruct */
  public readonly quota: ResourceQuotaConstruct;

  /**
   * @param scope - The CDK construct scope.
   * @param id - The construct id.
   * @param props - Tier selection, namespace, and optional overrides.
   */
  constructor(scope: Construct, id: string, props: NamespaceResourceQuotaProps) {
    super(scope, id);

    const tierName = props.tier ?? 'medium';
    const tier = StandardQuotaTiers[tierName];

    const limits: ResourceList = {
      ...tier.limits,
      ...props.customLimits,
    };

    this.quota = new ResourceQuotaConstruct(this, 'Quota', {
      cluster: props.cluster,
      name: `${props.namespace}-quota`,
      namespace: props.namespace,
      spec: {
        hard: limits,
      },
      labels: {
        'quota-tier': tierName,
      },
      createNamespace: props.createNamespace,
    });
  }
}

/**
 * Properties for {@link LimitRangeConstruct}.
 *
 * @remarks
 * A LimitRange complements a ResourceQuota by injecting default requests and
 * limits into containers that omit them, and by enforcing per-container min/max
 * boundaries. Without a LimitRange, containers without explicit resource specs
 * would not count toward the ResourceQuota.
 */
export interface LimitRangeProps {
  /** EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Namespace to apply the limit range to */
  readonly namespace: string;

  /** Default CPU request for containers */
  readonly defaultCpuRequest?: string;

  /** Default memory request for containers */
  readonly defaultMemoryRequest?: string;

  /** Default CPU limit for containers */
  readonly defaultCpuLimit?: string;

  /** Default memory limit for containers */
  readonly defaultMemoryLimit?: string;

  /** Maximum CPU per container */
  readonly maxCpu?: string;

  /** Maximum memory per container */
  readonly maxMemory?: string;

  /** Minimum CPU per container */
  readonly minCpu?: string;

  /** Minimum memory per container */
  readonly minMemory?: string;
}

/**
 * CDK construct for creating LimitRange resources.
 *
 * LimitRanges set default resource requests/limits for containers
 * that don't specify them, and enforce min/max constraints.
 *
 * @example
 * ```typescript
 * new LimitRangeConstruct(this, 'Limits', {
 *   cluster,
 *   namespace: 'team-a',
 *   defaultCpuRequest: '100m',
 *   defaultMemoryRequest: '128Mi',
 *   defaultCpuLimit: '500m',
 *   defaultMemoryLimit: '512Mi',
 *   maxCpu: '4',
 *   maxMemory: '8Gi',
 * });
 * ```
 */
export class LimitRangeConstruct extends Construct {
  /** The underlying Kubernetes manifest */
  public readonly manifest: eks.KubernetesManifest;

  /**
   * @param scope - The CDK construct scope.
   * @param id - The construct id.
   * @param props - Default and max/min resource constraints for the namespace.
   */
  constructor(scope: Construct, id: string, props: LimitRangeProps) {
    super(scope, id);

    const limits: Record<string, unknown>[] = [
      {
        type: 'Container',
        default: {
          cpu: props.defaultCpuLimit ?? '500m',
          memory: props.defaultMemoryLimit ?? '512Mi',
        },
        defaultRequest: {
          cpu: props.defaultCpuRequest ?? '100m',
          memory: props.defaultMemoryRequest ?? '128Mi',
        },
        ...(props.maxCpu || props.maxMemory
          ? {
              max: {
                ...(props.maxCpu && { cpu: props.maxCpu }),
                ...(props.maxMemory && { memory: props.maxMemory }),
              },
            }
          : {}),
        ...(props.minCpu || props.minMemory
          ? {
              min: {
                ...(props.minCpu && { cpu: props.minCpu }),
                ...(props.minMemory && { memory: props.minMemory }),
              },
            }
          : {}),
      },
    ];

    this.manifest = new eks.KubernetesManifest(this, 'Resource', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'v1',
          kind: 'LimitRange',
          metadata: {
            name: 'default-limits',
            namespace: props.namespace,
            labels: {
              'app.kubernetes.io/managed-by': 'cdk',
            },
          },
          spec: {
            limits,
          },
        },
      ],
    });
  }
}
