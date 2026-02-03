import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

/**
 * Traffic direction for network policies.
 *
 * @see https://docs.cilium.io/en/stable/network/kubernetes/policy/
 */
export type PolicyDirection = 'ingress' | 'egress' | 'both';

/**
 * Port specification for network policies
 */
export interface NetworkPolicyPort {
  /** Port number or name */
  readonly port: string | number;
  /** Protocol (TCP, UDP, SCTP) */
  readonly protocol?: 'TCP' | 'UDP' | 'SCTP';
}

/**
 * Endpoint selector for matching pods
 */
export interface EndpointSelector {
  /** Label selector for matching pods */
  readonly matchLabels?: Record<string, string>;
  /** Match pods by namespace labels */
  readonly matchNamespaceLabels?: Record<string, string>;
}

/**
 * Ingress rule specification
 */
export interface IngressRule {
  /** Source endpoints that are allowed */
  readonly fromEndpoints?: EndpointSelector[];
  /** Source CIDRs that are allowed */
  readonly fromCIDR?: string[];
  /** Ports that are allowed */
  readonly toPorts?: NetworkPolicyPort[];
}

/**
 * Egress rule specification
 */
export interface EgressRule {
  /** Destination endpoints that are allowed */
  readonly toEndpoints?: EndpointSelector[];
  /** Destination CIDRs that are allowed */
  readonly toCIDR?: string[];
  /** Destination FQDNs that are allowed (Cilium-specific) */
  readonly toFQDNs?: string[];
  /** Ports that are allowed */
  readonly toPorts?: NetworkPolicyPort[];
}

/**
 * Properties for CiliumNetworkPolicy construct
 */
export interface CiliumNetworkPolicyProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Policy name */
  readonly name: string;

  /** Namespace for the policy */
  readonly namespace: string;

  /** Optional description for the policy */
  readonly description?: string;

  /** Endpoint selector to identify target pods */
  readonly endpointSelector: EndpointSelector;

  /** Ingress rules */
  readonly ingress?: IngressRule[];

  /** Egress rules */
  readonly egress?: EgressRule[];
}

/**
 * Properties for DefaultDenyPolicy construct
 */
export interface DefaultDenyPolicyProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Namespace for the policy */
  readonly namespace: string;

  /** Direction to deny (ingress, egress, or both) */
  readonly direction?: PolicyDirection;

  /** Allow DNS egress (port 53) even with egress deny */
  readonly allowDns?: boolean;

  /** Allow kube-system namespace access */
  readonly allowKubeSystem?: boolean;
}

/**
 * A construct that creates a CiliumNetworkPolicy.
 *
 * CiliumNetworkPolicy extends Kubernetes NetworkPolicy with additional features:
 * - L7 filtering (HTTP, gRPC, Kafka)
 * - FQDN-based egress rules
 * - DNS-aware policies
 * - Host-level policies
 *
 * @remarks
 * Cilium network policies are applied as custom resources (`cilium.io/v2`) and
 * require the Cilium CNI to be installed on the cluster. They offer a superset
 * of standard Kubernetes NetworkPolicy capabilities, including identity-aware
 * enforcement and FQDN-based egress filtering.
 *
 * @see https://docs.cilium.io/en/stable/network/kubernetes/policy/
 *
 * @example
 * new CiliumNetworkPolicy(this, 'BackendPolicy', {
 *   cluster: props.cluster,
 *   name: 'allow-frontend-to-backend',
 *   namespace: 'production',
 *   endpointSelector: { matchLabels: { app: 'backend' } },
 *   ingress: [{
 *     fromEndpoints: [{ matchLabels: { app: 'frontend' } }],
 *     toPorts: [{ port: 8080, protocol: 'TCP' }],
 *   }],
 * });
 */
export class CiliumNetworkPolicy extends Construct {
  /** The Kubernetes manifest resource */
  public readonly manifest: eks.KubernetesManifest;

  /**
   * Creates a new CiliumNetworkPolicy construct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Configuration properties for the Cilium network policy.
   */
  constructor(scope: Construct, id: string, props: CiliumNetworkPolicyProps) {
    super(scope, id);

    const policySpec: Record<string, unknown> = {
      endpointSelector: this.buildEndpointSelector(props.endpointSelector),
    };

    if (props.ingress && props.ingress.length > 0) {
      policySpec.ingress = props.ingress.map((rule) => this.buildIngressRule(rule));
    }

    if (props.egress && props.egress.length > 0) {
      policySpec.egress = props.egress.map((rule) => this.buildEgressRule(rule));
    }

    const metadata: Record<string, unknown> = {
      name: props.name,
      namespace: props.namespace,
    };

    if (props.description) {
      metadata.annotations = {
        description: props.description,
      };
    }

    this.manifest = new eks.KubernetesManifest(this, 'Policy', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'cilium.io/v2',
          kind: 'CiliumNetworkPolicy',
          metadata,
          spec: policySpec,
        },
      ],
    });
  }

  /** Converts an EndpointSelector into the Cilium manifest format. */
  private buildEndpointSelector(selector: EndpointSelector): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (selector.matchLabels && Object.keys(selector.matchLabels).length > 0) {
      result.matchLabels = selector.matchLabels;
    }

    return result;
  }

  /** Converts an IngressRule into the Cilium manifest format. */
  private buildIngressRule(rule: IngressRule): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (rule.fromEndpoints && rule.fromEndpoints.length > 0) {
      result.fromEndpoints = rule.fromEndpoints.map((ep) => this.buildEndpointSelector(ep));
    }

    if (rule.fromCIDR && rule.fromCIDR.length > 0) {
      result.fromCIDR = rule.fromCIDR;
    }

    if (rule.toPorts && rule.toPorts.length > 0) {
      result.toPorts = [
        {
          ports: rule.toPorts.map((port) => ({
            port: String(port.port),
            protocol: port.protocol ?? 'TCP',
          })),
        },
      ];
    }

    return result;
  }

  /** Converts an EgressRule into the Cilium manifest format. */
  private buildEgressRule(rule: EgressRule): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (rule.toEndpoints && rule.toEndpoints.length > 0) {
      result.toEndpoints = rule.toEndpoints.map((ep) => this.buildEndpointSelector(ep));
    }

    if (rule.toCIDR && rule.toCIDR.length > 0) {
      result.toCIDR = rule.toCIDR;
    }

    if (rule.toFQDNs && rule.toFQDNs.length > 0) {
      result.toFQDNs = rule.toFQDNs.map((fqdn) => ({ matchPattern: fqdn }));
    }

    if (rule.toPorts && rule.toPorts.length > 0) {
      result.toPorts = [
        {
          ports: rule.toPorts.map((port) => ({
            port: String(port.port),
            protocol: port.protocol ?? 'TCP',
          })),
        },
      ];
    }

    return result;
  }
}

/**
 * A construct that creates a default-deny network policy for a namespace.
 *
 * This is a security best practice that ensures all traffic is explicitly
 * allowed before it can flow. Traffic not matching any allow rule is dropped.
 *
 * @remarks
 * Default-deny policies should be the first policies applied to every namespace.
 * They establish a zero-trust baseline where all traffic is blocked unless
 * explicitly permitted by other CiliumNetworkPolicy resources. The optional
 * DNS and kube-system exceptions prevent breaking core cluster functionality.
 *
 * @see https://docs.cilium.io/en/stable/network/kubernetes/policy/
 *
 * @example
 * // Deny all ingress and egress except DNS
 * new DefaultDenyPolicy(this, 'DefaultDeny', {
 *   cluster: props.cluster,
 *   namespace: 'production',
 *   direction: 'both',
 *   allowDns: true,
 * });
 */
export class DefaultDenyPolicy extends Construct {
  /** The Kubernetes manifest resources */
  public readonly manifests: eks.KubernetesManifest[];

  /**
   * Creates a new DefaultDenyPolicy construct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Configuration properties for the default-deny policy.
   */
  constructor(scope: Construct, id: string, props: DefaultDenyPolicyProps) {
    super(scope, id);

    const direction = props.direction ?? 'both';
    const allowDns = props.allowDns ?? true;
    const allowKubeSystem = props.allowKubeSystem ?? true;

    this.manifests = [];

    // Default deny ingress
    if (direction === 'ingress' || direction === 'both') {
      const ingressPolicy = new eks.KubernetesManifest(this, 'DenyIngress', {
        cluster: props.cluster,
        manifest: [
          {
            apiVersion: 'cilium.io/v2',
            kind: 'CiliumNetworkPolicy',
            metadata: {
              name: 'default-deny-ingress',
              namespace: props.namespace,
              annotations: {
                description: 'Default deny all ingress traffic',
              },
            },
            spec: {
              endpointSelector: {},
              ingress: [{}], // Empty rule = deny all
            },
          },
        ],
      });
      this.manifests.push(ingressPolicy);
    }

    // Default deny egress (with optional DNS and kube-system exceptions)
    if (direction === 'egress' || direction === 'both') {
      const egressRules: Record<string, unknown>[] = [];

      if (allowDns) {
        // Allow DNS to kube-system
        egressRules.push({
          toEndpoints: [
            {
              matchLabels: {
                'k8s:io.kubernetes.pod.namespace': 'kube-system',
                'k8s-app': 'kube-dns',
              },
            },
          ],
          toPorts: [
            {
              ports: [
                { port: '53', protocol: 'UDP' },
                { port: '53', protocol: 'TCP' },
              ],
            },
          ],
        });
      }

      if (allowKubeSystem) {
        // Allow egress to kube-system services
        egressRules.push({
          toEndpoints: [
            {
              matchLabels: {
                'k8s:io.kubernetes.pod.namespace': 'kube-system',
              },
            },
          ],
        });
      }

      const egressPolicy = new eks.KubernetesManifest(this, 'DenyEgress', {
        cluster: props.cluster,
        manifest: [
          {
            apiVersion: 'cilium.io/v2',
            kind: 'CiliumNetworkPolicy',
            metadata: {
              name: 'default-deny-egress',
              namespace: props.namespace,
              annotations: {
                description: 'Default deny egress with DNS and kube-system exceptions',
              },
            },
            spec: {
              endpointSelector: {},
              egress: egressRules.length > 0 ? egressRules : [{}],
            },
          },
        ],
      });
      this.manifests.push(egressPolicy);
    }
  }
}

/**
 * Factory class providing pre-built network policy templates for common patterns.
 *
 * @remarks
 * These templates encapsulate security best practices and reduce boilerplate
 * when creating frequently needed policies such as namespace-to-namespace
 * ingress, FQDN-based egress, and database access controls.
 *
 * @see https://docs.cilium.io/en/stable/network/kubernetes/policy/
 */
export class NetworkPolicyTemplates {
  /**
   * Creates a policy allowing ingress from a specific namespace to all
   * pods in the target namespace, optionally restricted to certain ports.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param targetNamespace - The namespace whose pods will receive ingress traffic.
   * @param sourceNamespace - The namespace from which ingress traffic is allowed.
   * @param ports - Optional list of ports to restrict ingress to. If omitted, all ports are allowed.
   * @returns A new {@link CiliumNetworkPolicy} allowing the specified namespace ingress.
   *
   * @example
   * NetworkPolicyTemplates.allowNamespaceIngress(
   *   this, 'AllowFrontend', cluster,
   *   'backend', 'frontend',
   *   [{ port: 8080, protocol: 'TCP' }],
   * );
   */
  static allowNamespaceIngress(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    targetNamespace: string,
    sourceNamespace: string,
    ports?: NetworkPolicyPort[],
  ): CiliumNetworkPolicy {
    return new CiliumNetworkPolicy(scope, id, {
      cluster,
      name: `allow-from-${sourceNamespace}`,
      namespace: targetNamespace,
      description: `Allow ingress from ${sourceNamespace} namespace`,
      endpointSelector: {},
      ingress: [
        {
          fromEndpoints: [
            {
              matchNamespaceLabels: {
                'kubernetes.io/metadata.name': sourceNamespace,
              },
            },
          ],
          toPorts: ports,
        },
      ],
    });
  }

  /**
   * Creates a policy allowing egress to external APIs via FQDN matching.
   *
   * @remarks
   * FQDN-based egress is a Cilium-specific feature that resolves domain names
   * at the policy enforcement layer. Cilium intercepts DNS responses to learn
   * the IP addresses associated with allowed FQDNs, enabling domain-based
   * filtering without relying on static IP lists.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param namespace - The namespace for the policy.
   * @param fqdns - List of fully qualified domain names to allow (supports wildcard patterns, e.g. `"*.amazonaws.com"`).
   * @param selector - Endpoint selector identifying which pods this policy applies to.
   * @param ports - Optional port restrictions. Defaults to TCP/443 (HTTPS) if omitted.
   * @returns A new {@link CiliumNetworkPolicy} allowing FQDN-based egress.
   *
   * @see https://docs.cilium.io/en/stable/network/kubernetes/policy/
   *
   * @example
   * NetworkPolicyTemplates.allowFqdnEgress(
   *   this, 'AllowAwsApis', cluster, 'production',
   *   ['*.amazonaws.com', 'sts.amazonaws.com'],
   *   { matchLabels: { app: 'backend' } },
   * );
   */
  static allowFqdnEgress(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    namespace: string,
    fqdns: string[],
    selector: EndpointSelector,
    ports?: NetworkPolicyPort[],
  ): CiliumNetworkPolicy {
    return new CiliumNetworkPolicy(scope, id, {
      cluster,
      name: 'allow-external-apis',
      namespace,
      description: `Allow egress to external APIs: ${fqdns.join(', ')}`,
      endpointSelector: selector,
      egress: [
        {
          toFQDNs: fqdns,
          toPorts: ports ?? [{ port: 443, protocol: 'TCP' }],
        },
      ],
    });
  }

  /**
   * Creates a policy restricting database access to specific namespaces.
   *
   * @remarks
   * This template creates an ingress policy on the database pods, allowing
   * connections only from the listed namespaces on the specified port. It is
   * designed for use alongside a default-deny policy to ensure that only
   * explicitly authorized services can reach the database.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID.
   * @param cluster - The EKS cluster to deploy the policy to.
   * @param dbNamespace - The namespace where the database pods reside.
   * @param dbSelector - Endpoint selector identifying the database pods.
   * @param allowedNamespaces - Namespaces that are permitted to connect to the database.
   * @param port - The database port to allow. Defaults to `5432` (PostgreSQL).
   * @returns A new {@link CiliumNetworkPolicy} restricting database ingress.
   *
   * @see https://docs.cilium.io/en/stable/network/kubernetes/policy/
   *
   * @example
   * NetworkPolicyTemplates.databaseAccess(
   *   this, 'DbAccess', cluster, 'database',
   *   { matchLabels: { app: 'postgres' } },
   *   ['backend', 'worker'],
   *   5432,
   * );
   */
  static databaseAccess(
    scope: Construct,
    id: string,
    cluster: eks.ICluster,
    dbNamespace: string,
    dbSelector: EndpointSelector,
    allowedNamespaces: string[],
    port: number = 5432,
  ): CiliumNetworkPolicy {
    return new CiliumNetworkPolicy(scope, id, {
      cluster,
      name: 'database-access',
      namespace: dbNamespace,
      description: `Allow database access from: ${allowedNamespaces.join(', ')}`,
      endpointSelector: dbSelector,
      ingress: allowedNamespaces.map((ns) => ({
        fromEndpoints: [
          {
            matchNamespaceLabels: {
              'kubernetes.io/metadata.name': ns,
            },
          },
        ],
        toPorts: [{ port, protocol: 'TCP' }],
      })),
    });
  }
}
