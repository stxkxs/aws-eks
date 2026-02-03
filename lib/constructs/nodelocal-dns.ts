import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

/**
 * Properties for the {@link NodeLocalDns} construct.
 */
export interface NodeLocalDnsProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Local DNS IP address (default: 169.254.20.10) */
  readonly localDnsIp?: string;

  /** CoreDNS cluster IP (typically the kube-dns service IP) */
  readonly clusterDnsIp: string;

  /** DNS domain (default: cluster.local) */
  readonly dnsDomain?: string;

  /** Enable DNS caching (default: true) */
  readonly cacheEnabled?: boolean;

  /** Cache TTL for successful responses in seconds (default: 30) */
  readonly cacheTtl?: number;

  /** Cache TTL for negative responses in seconds (default: 5) */
  readonly cacheNegativeTtl?: number;

  /** Enable node-level metrics (default: true) */
  readonly metricsEnabled?: boolean;

  /** Memory limit for the DNS cache container */
  readonly memoryLimit?: string;

  /** CPU limit for the DNS cache container */
  readonly cpuLimit?: string;
}

/**
 * A construct that deploys NodeLocal DNSCache for improved DNS performance.
 *
 * NodeLocal DNSCache runs a DNS caching agent on each cluster node as a DaemonSet.
 * This reduces DNS lookup latency, improves cluster DNS reliability, and helps
 * avoid conntrack race conditions.
 *
 * Benefits:
 * - Reduced DNS latency by serving from local cache
 * - Decreased load on kube-dns/CoreDNS
 * - Avoids conntrack table exhaustion issues
 * - Improves DNS reliability during node or CoreDNS failures
 *
 * @remarks
 * **Cilium compatibility:** NodeLocal DNS works alongside Cilium CNI but requires
 * specific configuration. Because Cilium replaces `kube-proxy` and manages iptables
 * rules itself, the DaemonSet is deployed with `-setupinterface=false` and
 * `-setupiptables=false` so that it does not conflict with Cilium's eBPF datapath.
 * The node-cache container still binds to both the `localDnsIp` (link-local) and
 * the `clusterDnsIp`, and forwards cache misses to the upstream CoreDNS service via
 * TCP (forced by the `force_tcp` directive in the Corefile). If you run Cilium in
 * `kube-proxy-replacement=strict` mode, ensure that the `clusterDnsIp` provided
 * here matches the `kube-dns` ClusterIP assigned by Kubernetes, as Cilium will
 * intercept traffic to that VIP at the socket level.
 *
 * The construct creates three Kubernetes resources in `kube-system`:
 * 1. A ServiceAccount for the DaemonSet pods.
 * 2. A ConfigMap containing the generated Corefile.
 * 3. A DaemonSet with `hostNetwork: true` and `system-node-critical` priority.
 *
 * @see https://kubernetes.io/docs/tasks/administer-cluster/nodelocaldns/
 *
 * @example
 * ```typescript
 * new NodeLocalDns(this, 'NodeLocalDns', {
 *   cluster: props.cluster,
 *   clusterDnsIp: '172.20.0.10',
 *   cacheTtl: 30,
 * });
 * ```
 */
export class NodeLocalDns extends Construct {
  /** The ConfigMap for nodelocaldns configuration */
  public readonly configMap: eks.KubernetesManifest;

  /** The DaemonSet running the DNS cache */
  public readonly daemonSet: eks.KubernetesManifest;

  /** The ServiceAccount for nodelocaldns */
  public readonly serviceAccount: eks.KubernetesManifest;

  /**
   * @param scope - The CDK construct scope.
   * @param id - The construct id.
   * @param props - Configuration for the NodeLocal DNS cache, including cluster
   *   DNS IP and caching behaviour.
   */
  constructor(scope: Construct, id: string, props: NodeLocalDnsProps) {
    super(scope, id);

    const localDnsIp = props.localDnsIp ?? '169.254.20.10';
    const dnsDomain = props.dnsDomain ?? 'cluster.local';
    const cacheEnabled = props.cacheEnabled ?? true;
    const cacheTtl = props.cacheTtl ?? 30;
    const cacheNegativeTtl = props.cacheNegativeTtl ?? 5;
    const metricsEnabled = props.metricsEnabled ?? true;
    const memoryLimit = props.memoryLimit ?? '100Mi';
    const cpuLimit = props.cpuLimit ?? '100m';

    // Create ServiceAccount
    this.serviceAccount = new eks.KubernetesManifest(this, 'ServiceAccount', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'v1',
          kind: 'ServiceAccount',
          metadata: {
            name: 'node-local-dns',
            namespace: 'kube-system',
            labels: {
              'app.kubernetes.io/name': 'node-local-dns',
              'app.kubernetes.io/component': 'dns-cache',
            },
          },
        },
      ],
    });

    // Create ConfigMap with Corefile
    const corefileContent = this.generateCorefile({
      localDnsIp,
      clusterDnsIp: props.clusterDnsIp,
      dnsDomain,
      cacheEnabled,
      cacheTtl,
      cacheNegativeTtl,
      metricsEnabled,
    });

    this.configMap = new eks.KubernetesManifest(this, 'ConfigMap', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            name: 'node-local-dns',
            namespace: 'kube-system',
            labels: {
              'app.kubernetes.io/name': 'node-local-dns',
            },
          },
          data: {
            Corefile: corefileContent,
          },
        },
      ],
    });

    // Create DaemonSet
    this.daemonSet = new eks.KubernetesManifest(this, 'DaemonSet', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'apps/v1',
          kind: 'DaemonSet',
          metadata: {
            name: 'node-local-dns',
            namespace: 'kube-system',
            labels: {
              'app.kubernetes.io/name': 'node-local-dns',
              'app.kubernetes.io/component': 'dns-cache',
            },
          },
          spec: {
            selector: {
              matchLabels: {
                'app.kubernetes.io/name': 'node-local-dns',
              },
            },
            updateStrategy: {
              type: 'RollingUpdate',
              rollingUpdate: {
                maxUnavailable: '10%',
              },
            },
            template: {
              metadata: {
                labels: {
                  'app.kubernetes.io/name': 'node-local-dns',
                  'app.kubernetes.io/component': 'dns-cache',
                },
                annotations: {
                  'prometheus.io/scrape': String(metricsEnabled),
                  'prometheus.io/port': '9253',
                },
              },
              spec: {
                serviceAccountName: 'node-local-dns',
                hostNetwork: true,
                dnsPolicy: 'Default',
                priorityClassName: 'system-node-critical',
                tolerations: [{ operator: 'Exists' }],
                containers: [
                  {
                    name: 'node-cache',
                    image: 'registry.k8s.io/dns/k8s-dns-node-cache:1.23.1',
                    args: [
                      '-localip',
                      `${localDnsIp},${props.clusterDnsIp}`,
                      '-conf',
                      '/etc/Corefile',
                      '-upstreamsvc',
                      'kube-dns',
                      '-skipteardown=true',
                      '-setupinterface=false',
                      '-setupiptables=false',
                    ],
                    securityContext: {
                      capabilities: {
                        add: ['NET_ADMIN'],
                      },
                    },
                    ports: [
                      { containerPort: 53, name: 'dns', protocol: 'UDP' },
                      { containerPort: 53, name: 'dns-tcp', protocol: 'TCP' },
                      { containerPort: 9253, name: 'metrics', protocol: 'TCP' },
                    ],
                    livenessProbe: {
                      httpGet: {
                        host: localDnsIp,
                        path: '/health',
                        port: 8080,
                        scheme: 'HTTP',
                      },
                      initialDelaySeconds: 60,
                      periodSeconds: 10,
                      timeoutSeconds: 5,
                    },
                    readinessProbe: {
                      httpGet: {
                        host: localDnsIp,
                        path: '/health',
                        port: 8080,
                        scheme: 'HTTP',
                      },
                      initialDelaySeconds: 3,
                      periodSeconds: 10,
                      timeoutSeconds: 5,
                    },
                    resources: {
                      requests: {
                        cpu: '25m',
                        memory: '30Mi',
                      },
                      limits: {
                        cpu: cpuLimit,
                        memory: memoryLimit,
                      },
                    },
                    volumeMounts: [
                      {
                        name: 'config-volume',
                        mountPath: '/etc/Corefile',
                        subPath: 'Corefile',
                        readOnly: true,
                      },
                    ],
                  },
                ],
                volumes: [
                  {
                    name: 'config-volume',
                    configMap: {
                      name: 'node-local-dns',
                      items: [
                        {
                          key: 'Corefile',
                          path: 'Corefile',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    });

    this.daemonSet.node.addDependency(this.serviceAccount);
    this.daemonSet.node.addDependency(this.configMap);
  }

  /** Builds the CoreDNS Corefile content from the resolved options. */
  private generateCorefile(opts: {
    localDnsIp: string;
    clusterDnsIp: string;
    dnsDomain: string;
    cacheEnabled: boolean;
    cacheTtl: number;
    cacheNegativeTtl: number;
    metricsEnabled: boolean;
  }): string {
    const cacheBlock = opts.cacheEnabled
      ? `cache ${opts.cacheTtl} {
        denial ${opts.cacheNegativeTtl}
      }`
      : '';

    const metricsBlock = opts.metricsEnabled ? 'prometheus :9253' : '';

    return `${opts.dnsDomain}:53 {
    errors
    ${cacheBlock}
    reload
    loop
    bind ${opts.localDnsIp} ${opts.clusterDnsIp}
    forward . ${opts.clusterDnsIp} {
      force_tcp
    }
    ${metricsBlock}
    health ${opts.localDnsIp}:8080
}
in-addr.arpa:53 {
    errors
    ${cacheBlock}
    reload
    loop
    bind ${opts.localDnsIp} ${opts.clusterDnsIp}
    forward . ${opts.clusterDnsIp} {
      force_tcp
    }
    ${metricsBlock}
}
ip6.arpa:53 {
    errors
    ${cacheBlock}
    reload
    loop
    bind ${opts.localDnsIp} ${opts.clusterDnsIp}
    forward . ${opts.clusterDnsIp} {
      force_tcp
    }
    ${metricsBlock}
}
.:53 {
    errors
    ${cacheBlock}
    reload
    loop
    bind ${opts.localDnsIp} ${opts.clusterDnsIp}
    forward . /etc/resolv.conf
    ${metricsBlock}
}
`;
  }
}
