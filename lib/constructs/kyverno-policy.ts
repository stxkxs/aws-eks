import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Environment } from '../types/config';

/**
 * Validation failure action for Kyverno policies
 */
export type ValidationFailureAction = 'Enforce' | 'Audit';

/**
 * Resource kinds that can be matched by Kyverno policies
 */
export type ResourceKind =
  | 'Pod'
  | 'Deployment'
  | 'StatefulSet'
  | 'DaemonSet'
  | 'ReplicaSet'
  | 'Job'
  | 'CronJob'
  | 'Service'
  | 'ConfigMap'
  | 'Secret'
  | 'Namespace';

/**
 * Match configuration for Kyverno rules
 */
export interface KyvernoMatch {
  /** Resource kinds to match */
  readonly kinds: ResourceKind[];
  /** Namespaces to include (empty = all) */
  readonly namespaces?: string[];
}

/**
 * Exclude configuration for Kyverno rules
 */
export interface KyvernoExclude {
  /** Namespaces to exclude from the policy */
  readonly namespaces?: string[];
  /** Labels to exclude (pods with these labels are skipped) */
  readonly labels?: Record<string, string>;
}

/**
 * Rule definition for validation policies
 */
export interface KyvernoValidationRule {
  /** Rule name */
  readonly name: string;
  /** Match configuration */
  readonly match: KyvernoMatch;
  /** Exclude configuration */
  readonly exclude?: KyvernoExclude;
  /** Validation failure message */
  readonly message: string;
  /** Pattern to validate against (uses Kyverno pattern syntax) */
  readonly pattern?: Record<string, unknown>;
  /** Deny conditions (alternative to pattern) */
  readonly deny?: {
    readonly conditions: {
      readonly all?: Array<{
        readonly key: string;
        readonly operator: 'Equals' | 'NotEquals' | 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
        readonly value?: unknown;
      }>;
      readonly any?: Array<{
        readonly key: string;
        readonly operator: 'Equals' | 'NotEquals' | 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
        readonly value?: unknown;
      }>;
    };
  };
  /** Pod security context validation (shorthand for common patterns) */
  readonly podSecurity?: {
    /** Require non-root user */
    readonly runAsNonRoot?: boolean;
    /** Require read-only root filesystem */
    readonly readOnlyRootFilesystem?: boolean;
    /** Disallow privilege escalation */
    readonly allowPrivilegeEscalation?: boolean;
    /** Required capabilities to drop */
    readonly dropCapabilities?: string[];
  };
}

/**
 * Properties for KyvernoPolicy construct
 */
export interface KyvernoPolicyProps {
  /** The EKS cluster to deploy the policy to */
  readonly cluster: eks.ICluster;

  /** Policy name (must be unique cluster-wide) */
  readonly name: string;

  /** Policy description */
  readonly description?: string;

  /** Validation failure action */
  readonly validationFailureAction: ValidationFailureAction;

  /** Enable background scanning */
  readonly background?: boolean;

  /** Validation rules */
  readonly rules: KyvernoValidationRule[];

  /** Policy category for organization */
  readonly category?: 'security' | 'best-practices' | 'compliance' | 'operational';

  /** Compliance frameworks this policy supports */
  readonly compliance?: ('SOC2' | 'HIPAA' | 'PCI-DSS')[];
}

/**
 * Properties for environment-aware policy creation
 */
export interface KyvernoPolicyEnvironmentProps extends Omit<KyvernoPolicyProps, 'validationFailureAction'> {
  /** Current environment */
  readonly environment: Environment;

  /** Override to always enforce regardless of environment */
  readonly alwaysEnforce?: boolean;

  /** Override to always audit regardless of environment */
  readonly alwaysAudit?: boolean;
}

/**
 * Default system namespaces to exclude from policies
 */
export const DEFAULT_EXCLUDED_NAMESPACES = ['kube-system', 'kube-public', 'kube-node-lease'];

/**
 * Security addon namespaces to exclude from some policies
 */
export const SECURITY_NAMESPACES = ['falco-system', 'trivy-system', 'kyverno'];

/**
 * A construct that creates a Kyverno ClusterPolicy.
 *
 * Provides type-safe policy creation with sensible defaults and
 * environment-aware enforcement modes.
 *
 * @remarks
 * Kyverno policies support environment-aware enforcement through the
 * {@link KyvernoPolicy.createEnvironmentAware} factory method. In
 * non-production environments policies default to `Audit` mode, which
 * logs violations without blocking workloads, while production environments
 * default to `Enforce` mode. This graduated approach lets teams iterate
 * quickly in dev/staging while maintaining strict compliance in production.
 *
 * Policies are deployed as `ClusterPolicy` resources, meaning they apply
 * cluster-wide. Use the `exclude` field on individual rules to skip
 * system namespaces or security tooling.
 *
 * @example
 * new KyvernoPolicy(this, 'RequireLimits', {
 *   cluster: props.cluster,
 *   name: 'require-limits',
 *   validationFailureAction: 'Enforce',
 *   rules: [{
 *     name: 'require-cpu-memory-limits',
 *     match: { kinds: ['Pod'] },
 *     exclude: { namespaces: ['kube-system'] },
 *     message: 'CPU and memory limits are required',
 *     pattern: {
 *       spec: {
 *         containers: [{
 *           resources: {
 *             limits: { cpu: '?*', memory: '?*' },
 *           },
 *         }],
 *       },
 *     },
 *   }],
 * });
 */
export class KyvernoPolicy extends Construct {
  /** The policy name */
  public readonly policyName: string;

  /** The underlying Kubernetes manifest (for adding dependencies) */
  public readonly manifest: eks.KubernetesManifest;

  /**
   * Creates a new KyvernoPolicy construct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Configuration properties for the Kyverno cluster policy.
   */
  constructor(scope: Construct, id: string, props: KyvernoPolicyProps) {
    super(scope, id);

    this.policyName = props.name;

    const annotations: Record<string, string> = {};
    if (props.category) {
      annotations['policies.kyverno.io/category'] = props.category;
    }
    if (props.description) {
      annotations['policies.kyverno.io/description'] = props.description;
    }
    if (props.compliance && props.compliance.length > 0) {
      annotations['policies.kyverno.io/compliance'] = props.compliance.join(', ');
    }

    // Use KubernetesManifest in current construct scope to avoid cross-stack dependency cycles
    this.manifest = new eks.KubernetesManifest(this, 'Policy', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'kyverno.io/v1',
          kind: 'ClusterPolicy',
          metadata: {
            name: props.name,
            annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
          },
          spec: {
            validationFailureAction: props.validationFailureAction,
            background: props.background ?? true,
            rules: props.rules.map((rule) => this.buildRule(rule)),
          },
        },
      ],
    });
  }

  /** Converts a typed KyvernoValidationRule into the raw Kyverno manifest format. */
  private buildRule(rule: KyvernoValidationRule): Record<string, unknown> {
    const kyvernoRule: Record<string, unknown> = {
      name: rule.name,
      match: {
        any: [
          {
            resources: {
              kinds: rule.match.kinds,
              ...(rule.match.namespaces &&
                rule.match.namespaces.length > 0 && {
                  namespaces: rule.match.namespaces,
                }),
            },
          },
        ],
      },
    };

    // Add exclude configuration
    if (rule.exclude) {
      const excludeAny: Array<Record<string, unknown>> = [];

      if (rule.exclude.namespaces && rule.exclude.namespaces.length > 0) {
        excludeAny.push({
          resources: { namespaces: rule.exclude.namespaces },
        });
      }

      if (rule.exclude.labels && Object.keys(rule.exclude.labels).length > 0) {
        excludeAny.push({
          resources: {
            selector: { matchLabels: rule.exclude.labels },
          },
        });
      }

      if (excludeAny.length > 0) {
        kyvernoRule.exclude = { any: excludeAny };
      }
    }

    // Build validation section
    if (rule.pattern) {
      kyvernoRule.validate = {
        message: rule.message,
        pattern: rule.pattern,
      };
    } else if (rule.deny) {
      kyvernoRule.validate = {
        message: rule.message,
        deny: rule.deny,
      };
    } else if (rule.podSecurity) {
      // Build pattern from podSecurity shorthand
      kyvernoRule.validate = {
        message: rule.message,
        pattern: this.buildPodSecurityPattern(rule.podSecurity),
      };
    }

    return kyvernoRule;
  }

  /** Expands the podSecurity shorthand into a full Kyverno pattern object. */
  private buildPodSecurityPattern(
    security: NonNullable<KyvernoValidationRule['podSecurity']>,
  ): Record<string, unknown> {
    const securityContext: Record<string, unknown> = {};

    if (security.runAsNonRoot !== undefined) {
      securityContext.runAsNonRoot = security.runAsNonRoot;
    }

    if (security.readOnlyRootFilesystem !== undefined) {
      securityContext.readOnlyRootFilesystem = security.readOnlyRootFilesystem;
    }

    if (security.allowPrivilegeEscalation !== undefined) {
      securityContext.allowPrivilegeEscalation = security.allowPrivilegeEscalation;
    }

    if (security.dropCapabilities && security.dropCapabilities.length > 0) {
      securityContext.capabilities = {
        drop: security.dropCapabilities,
      };
    }

    return {
      spec: {
        containers: [
          {
            securityContext,
          },
        ],
      },
    };
  }

  /**
   * Factory method that creates an environment-aware policy.
   *
   * @remarks
   * Enforcement is determined by the following precedence:
   * 1. If `alwaysEnforce` is `true`, the action is `Enforce` regardless of environment.
   * 2. If `alwaysAudit` is `true`, the action is `Audit` regardless of environment.
   * 3. Otherwise, `production` environments use `Enforce` and all other
   *    environments (`dev`, `staging`) use `Audit`.
   *
   * This graduated enforcement model lets teams develop and test freely in
   * lower environments while ensuring strict policy compliance in production.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param props - Environment-aware policy properties (extends standard props with environment and override flags).
   * @returns A new {@link KyvernoPolicy} with the resolved validation failure action.
   *
   * @example
   * KyvernoPolicy.createEnvironmentAware(this, 'RequireProbes', {
   *   cluster,
   *   environment: 'staging',
   *   name: 'require-probes',
   *   rules: [{ ... }],
   * });
   * // Results in validationFailureAction: 'Audit'
   */
  static createEnvironmentAware(scope: Construct, id: string, props: KyvernoPolicyEnvironmentProps): KyvernoPolicy {
    let action: ValidationFailureAction;

    if (props.alwaysEnforce) {
      action = 'Enforce';
    } else if (props.alwaysAudit) {
      action = 'Audit';
    } else {
      // Default: Enforce in production, Audit elsewhere
      action = props.environment === 'production' ? 'Enforce' : 'Audit';
    }

    return new KyvernoPolicy(scope, id, {
      ...props,
      validationFailureAction: action,
    });
  }
}

/**
 * Pre-built security policies for common compliance requirements.
 *
 * @remarks
 * Each method in this class produces a fully configured {@link KyvernoPolicy}
 * targeting a specific security or best-practice concern (e.g., disallow
 * privileged containers, require non-root). Policies that are
 * environment-sensitive (such as `disallowLatestTag` or `requireRunAsNonRoot`)
 * use {@link KyvernoPolicy.createEnvironmentAware} internally, so they
 * automatically switch between `Audit` and `Enforce` based on the
 * provided environment.
 *
 * All factory methods accept an optional `excludeNamespaces` parameter that
 * defaults to a sensible set of system and security namespaces
 * ({@link DEFAULT_EXCLUDED_NAMESPACES}, {@link SECURITY_NAMESPACES}).
 */
export class KyvernoSecurityPolicies {
  /**
   * Creates a policy that disallows privileged containers.
   *
   * @remarks
   * Always enforced regardless of environment because privileged containers
   * have full host access and pose a critical security risk.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system namespaces plus `falco-system`.
   * @returns A new {@link KyvernoPolicy} that blocks privileged containers.
   */
  static disallowPrivileged(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    excludeNamespaces: string[] = [...DEFAULT_EXCLUDED_NAMESPACES, 'falco-system'],
  ): KyvernoPolicy {
    return new KyvernoPolicy(scope, id, {
      cluster,
      name: 'disallow-privileged',
      description: 'Privileged containers can access host resources and should be blocked',
      category: 'security',
      compliance: ['SOC2', 'PCI-DSS'],
      validationFailureAction: 'Enforce',
      rules: [
        {
          name: 'disallow-privileged',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Privileged containers are not allowed. Set securityContext.privileged to false.',
          pattern: {
            spec: {
              containers: [
                {
                  '=(securityContext)': {
                    '=(privileged)': false,
                  },
                },
              ],
            },
          },
        },
      ],
    });
  }

  /**
   * Creates a policy that disallows host path volumes.
   *
   * @remarks
   * Always enforced. HostPath volumes grant containers direct access to
   * the host filesystem, which can lead to data exfiltration or privilege
   * escalation. Compliant with SOC2, HIPAA, and PCI-DSS.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system and security namespaces.
   * @returns A new {@link KyvernoPolicy} that blocks host path volumes.
   */
  static disallowHostPath(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    excludeNamespaces: string[] = [...DEFAULT_EXCLUDED_NAMESPACES, ...SECURITY_NAMESPACES],
  ): KyvernoPolicy {
    return new KyvernoPolicy(scope, id, {
      cluster,
      name: 'disallow-host-path',
      description: 'Host path volumes can access the host filesystem and should be blocked',
      category: 'security',
      compliance: ['SOC2', 'HIPAA', 'PCI-DSS'],
      validationFailureAction: 'Enforce',
      rules: [
        {
          name: 'disallow-host-path',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'HostPath volumes are not allowed. Use persistent volumes instead.',
          pattern: {
            spec: {
              '=(volumes)': [
                {
                  'X(hostPath)': null,
                },
              ],
            },
          },
        },
      ],
    });
  }

  /**
   * Creates a policy that disallows host network and host ports.
   *
   * @remarks
   * Always enforced. Host networking exposes the full host network stack
   * to the container, bypassing Kubernetes network policies. The
   * `cilium-system` namespace is excluded by default because Cilium requires
   * host networking for its agent pods.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system namespaces plus `cilium-system`.
   * @returns A new {@link KyvernoPolicy} that blocks host network and host port usage.
   */
  static disallowHostNetwork(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    excludeNamespaces: string[] = [...DEFAULT_EXCLUDED_NAMESPACES, 'cilium-system'],
  ): KyvernoPolicy {
    return new KyvernoPolicy(scope, id, {
      cluster,
      name: 'disallow-host-network',
      description: 'Host networking provides access to the host network stack and should be blocked',
      category: 'security',
      compliance: ['SOC2', 'PCI-DSS'],
      validationFailureAction: 'Enforce',
      rules: [
        {
          name: 'disallow-host-network',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Host network is not allowed. Set spec.hostNetwork to false.',
          pattern: {
            spec: {
              '=(hostNetwork)': false,
            },
          },
        },
        {
          name: 'disallow-host-ports',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Host ports are not allowed. Remove hostPort from container ports.',
          pattern: {
            spec: {
              containers: [
                {
                  '=(ports)': [
                    {
                      '=(hostPort)': null,
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    });
  }

  /**
   * Creates a policy that blocks container images tagged with `:latest`.
   *
   * @remarks
   * Environment-aware: audits in dev/staging, enforces in production.
   * The `:latest` tag is mutable and non-deterministic, making rollbacks
   * unreliable and audit trails incomplete.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param environment - The current deployment environment, used to determine enforcement mode.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system namespaces.
   * @returns A new {@link KyvernoPolicy} that blocks the `:latest` image tag.
   */
  static disallowLatestTag(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    environment: Environment,
    excludeNamespaces: string[] = DEFAULT_EXCLUDED_NAMESPACES,
  ): KyvernoPolicy {
    return KyvernoPolicy.createEnvironmentAware(scope, id, {
      cluster,
      environment,
      name: 'disallow-latest-tag',
      description: 'Images with latest tag are mutable and can cause deployment issues',
      category: 'best-practices',
      rules: [
        {
          name: 'disallow-latest-tag',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Images with :latest tag are not allowed. Use a specific version tag.',
          pattern: {
            spec: {
              containers: [
                {
                  image: '!*:latest',
                },
              ],
            },
          },
        },
      ],
    });
  }

  /**
   * Creates a policy that requires containers to run as a non-root user.
   *
   * @remarks
   * Environment-aware: audits in dev/staging, enforces in production.
   * Running as non-root follows the principle of least privilege and
   * is required by SOC2, HIPAA, and PCI-DSS frameworks.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param environment - The current deployment environment, used to determine enforcement mode.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system and security namespaces.
   * @returns A new {@link KyvernoPolicy} requiring `securityContext.runAsNonRoot: true`.
   */
  static requireRunAsNonRoot(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    environment: Environment,
    excludeNamespaces: string[] = [...DEFAULT_EXCLUDED_NAMESPACES, ...SECURITY_NAMESPACES],
  ): KyvernoPolicy {
    return KyvernoPolicy.createEnvironmentAware(scope, id, {
      cluster,
      environment,
      name: 'require-run-as-non-root',
      description: 'Containers should run as non-root to follow least privilege',
      category: 'security',
      compliance: ['SOC2', 'HIPAA', 'PCI-DSS'],
      rules: [
        {
          name: 'require-run-as-non-root',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Containers must run as non-root. Set securityContext.runAsNonRoot to true.',
          pattern: {
            spec: {
              containers: [
                {
                  securityContext: {
                    runAsNonRoot: true,
                  },
                },
              ],
            },
          },
        },
      ],
    });
  }

  /**
   * Creates a policy that disallows privilege escalation.
   *
   * @remarks
   * Always enforced. Privilege escalation allows a child process to gain
   * more privileges than its parent, which can be exploited to break out
   * of container isolation. Compliant with SOC2, HIPAA, and PCI-DSS.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system and security namespaces.
   * @returns A new {@link KyvernoPolicy} requiring `allowPrivilegeEscalation: false`.
   */
  static disallowPrivilegeEscalation(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    excludeNamespaces: string[] = [...DEFAULT_EXCLUDED_NAMESPACES, ...SECURITY_NAMESPACES],
  ): KyvernoPolicy {
    return new KyvernoPolicy(scope, id, {
      cluster,
      name: 'disallow-privilege-escalation',
      description: 'Privilege escalation allows processes to gain more privileges than their parent',
      category: 'security',
      compliance: ['SOC2', 'HIPAA', 'PCI-DSS'],
      validationFailureAction: 'Enforce',
      rules: [
        {
          name: 'disallow-privilege-escalation',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Privilege escalation is not allowed. Set securityContext.allowPrivilegeEscalation to false.',
          pattern: {
            spec: {
              containers: [
                {
                  securityContext: {
                    allowPrivilegeEscalation: false,
                  },
                },
              ],
            },
          },
        },
      ],
    });
  }

  /**
   * Creates a policy that requires a read-only root filesystem.
   *
   * @remarks
   * Environment-aware: audits in dev/staging, enforces in production.
   * A read-only root filesystem prevents attackers from modifying
   * application binaries or injecting malicious code at runtime.
   * Applications needing writable storage should use `emptyDir` or
   * persistent volume mounts.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param environment - The current deployment environment, used to determine enforcement mode.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system and security namespaces.
   * @returns A new {@link KyvernoPolicy} requiring `readOnlyRootFilesystem: true`.
   */
  static requireReadOnlyRootFilesystem(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    environment: Environment,
    excludeNamespaces: string[] = [...DEFAULT_EXCLUDED_NAMESPACES, ...SECURITY_NAMESPACES],
  ): KyvernoPolicy {
    return KyvernoPolicy.createEnvironmentAware(scope, id, {
      cluster,
      environment,
      name: 'require-ro-rootfs',
      description: 'Read-only root filesystem prevents modifications to the container filesystem',
      category: 'security',
      compliance: ['SOC2', 'HIPAA'],
      rules: [
        {
          name: 'require-ro-rootfs',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Root filesystem must be read-only. Set securityContext.readOnlyRootFilesystem to true.',
          pattern: {
            spec: {
              containers: [
                {
                  securityContext: {
                    readOnlyRootFilesystem: true,
                  },
                },
              ],
            },
          },
        },
      ],
    });
  }

  /**
   * Creates a policy that requires containers to drop all Linux capabilities.
   *
   * @remarks
   * Environment-aware: audits in dev/staging, enforces in production.
   * Containers should drop all capabilities and only add back the specific
   * ones they need (`capabilities.add`). This follows the principle of
   * least privilege and is required by SOC2 and PCI-DSS.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param environment - The current deployment environment, used to determine enforcement mode.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system and security namespaces.
   * @returns A new {@link KyvernoPolicy} requiring `capabilities.drop: ["ALL"]`.
   */
  static requireDropCapabilities(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    environment: Environment,
    excludeNamespaces: string[] = [...DEFAULT_EXCLUDED_NAMESPACES, ...SECURITY_NAMESPACES],
  ): KyvernoPolicy {
    return KyvernoPolicy.createEnvironmentAware(scope, id, {
      cluster,
      environment,
      name: 'require-drop-capabilities',
      description: 'Containers should drop all capabilities and only add required ones',
      category: 'security',
      compliance: ['SOC2', 'PCI-DSS'],
      rules: [
        {
          name: 'require-drop-all',
          match: { kinds: ['Pod'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Containers must drop all capabilities. Add securityContext.capabilities.drop: ["ALL"].',
          pattern: {
            spec: {
              containers: [
                {
                  securityContext: {
                    capabilities: {
                      drop: ['ALL'],
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    });
  }

  /**
   * Creates a policy that requires readiness and liveness probes on workload controllers.
   *
   * @remarks
   * Environment-aware: audits in dev/staging, enforces in production.
   * Readiness probes ensure traffic is only routed to healthy pods, while
   * liveness probes enable automatic restart of unhealthy containers.
   * This policy targets `Deployment`, `StatefulSet`, and `DaemonSet` resources
   * rather than bare `Pod` resources.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param environment - The current deployment environment, used to determine enforcement mode.
   * @param excludeNamespaces - Namespaces to exclude. Defaults to system and security namespaces.
   * @returns A new {@link KyvernoPolicy} requiring both readiness and liveness probes.
   */
  static requirePodProbes(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    environment: Environment,
    excludeNamespaces: string[] = [...DEFAULT_EXCLUDED_NAMESPACES, ...SECURITY_NAMESPACES],
  ): KyvernoPolicy {
    return KyvernoPolicy.createEnvironmentAware(scope, id, {
      cluster,
      environment,
      name: 'require-pod-probes',
      description: 'Require readiness and liveness probes for proper health checking and load balancing',
      category: 'best-practices',
      rules: [
        {
          name: 'require-readiness-probe',
          match: { kinds: ['Deployment', 'StatefulSet', 'DaemonSet'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Readiness probe is required for proper load balancing. Add spec.containers[*].readinessProbe.',
          pattern: {
            spec: {
              template: {
                spec: {
                  containers: [
                    {
                      readinessProbe: {
                        '=(httpGet)': { path: '?*', port: '?*' },
                        '=(tcpSocket)': { port: '?*' },
                        '=(exec)': { command: '?*' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        {
          name: 'require-liveness-probe',
          match: { kinds: ['Deployment', 'StatefulSet', 'DaemonSet'] },
          exclude: { namespaces: excludeNamespaces },
          message: 'Liveness probe is required for automatic recovery. Add spec.containers[*].livenessProbe.',
          pattern: {
            spec: {
              template: {
                spec: {
                  containers: [
                    {
                      livenessProbe: {
                        '=(httpGet)': { path: '?*', port: '?*' },
                        '=(tcpSocket)': { port: '?*' },
                        '=(exec)': { command: '?*' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    });
  }
}
