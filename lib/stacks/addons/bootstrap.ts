import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../../types';
import { HelmRelease } from '../../constructs/helm-release';
import { IrsaRole } from '../../constructs/irsa-role';
import { CRITICAL_ADDONS_TOLERATION } from '../../utils';

/**
 * Properties for BootstrapAddonsStack
 */
export interface BootstrapAddonsStackProps extends cdk.StackProps {
  /** Environment configuration */
  readonly config: EnvironmentConfig;

  /** EKS cluster */
  readonly cluster: eks.ICluster;

  /** VPC for networking configuration */
  readonly vpc: ec2.IVpc;
}

/**
 * Bootstrap addons stack that deploys essential pre-ArgoCD components.
 *
 * This stack deploys the minimum required infrastructure controllers
 * that must be present before ArgoCD can manage the rest of the cluster.
 *
 * Deploys:
 * - cert-manager (TLS certificate management)
 * - external-secrets (AWS Secrets Manager integration)
 * - ClusterSecretStore (for AWS Secrets Manager and Parameter Store)
 * - AWS Load Balancer Controller (ALB/NLB ingress)
 * - External DNS (Route53 integration)
 * - Prometheus Operator CRDs (ServiceMonitor, PodMonitor, PrometheusRule)
 * - metrics-server (Kubernetes metrics API for HPA/VPA)
 * - reloader (automatic pod restarts on config changes)
 *
 * These components are deployed via CDK rather than ArgoCD because:
 * 1. ArgoCD itself needs TLS certificates (cert-manager)
 * 2. ArgoCD needs secrets from AWS (external-secrets)
 * 3. ArgoCD ingress needs the ALB controller
 * 4. ArgoCD DNS needs external-dns
 * 5. ServiceMonitor CRDs are needed even with AWS Managed Prometheus
 */
export class BootstrapAddonsStack extends cdk.Stack {
  /** Wildcard ACM certificate (if dns.wildcardCert is enabled) */
  public readonly certificate?: acm.ICertificate;

  constructor(scope: Construct, id: string, props: BootstrapAddonsStackProps) {
    super(scope, id, props);

    const { config, cluster, vpc } = props;

    // Create wildcard ACM certificate with DNS validation
    if (config.dns.wildcardCert && config.dns.hostedZoneId && config.dns.domainName) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: config.dns.hostedZoneId,
        zoneName: config.dns.domainName,
      });

      this.certificate = new acm.Certificate(this, 'AcmWildcardCertificate', {
        domainName: `*.${config.dns.domainName}`,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    // Pre-create namespaces that IRSA ServiceAccounts and Helm charts both need.
    // Without this, the IRSA SA creation races with the Helm chart's createNamespace
    // and fails with "namespace not found".
    const namespaces = this.createNamespaces(cluster, [
      'cert-manager',
      'external-secrets',
      'external-dns',
      'monitoring',
      'reloader',
    ]);

    // Deploy EBS CSI driver (required for gp3 StorageClass)
    const ebsCsiDriver = this.deployEbsCsiDriver(cluster, config);

    // Create gp3 StorageClass and make it the default
    // EKS ships with gp2 as the default, but gp3 is better:
    //   - 20% cheaper per GB
    //   - 3,000 IOPS baseline (vs gp2 burstable)
    //   - 125 MiB/s throughput baseline
    this.createGp3StorageClass(cluster, ebsCsiDriver);

    // Deploy Prometheus Operator CRDs first (ServiceMonitor, PodMonitor, PrometheusRule)
    // These are needed for observability even when using AWS Managed Prometheus
    const promCrds = this.deployPrometheusOperatorCrds(cluster, config);
    promCrds.node.addDependency(namespaces);

    // Deploy AWS Load Balancer Controller FIRST
    // Its mutating webhook (mservice.elbv2.k8s.aws) intercepts Service creation,
    // so it must be ready before other Helm charts create Services.
    const albController = this.deployAlbController(cluster, config, vpc);

    // Deploy cert-manager (depends on ALB controller webhook being ready + namespaces)
    const certManager = this.deployCertManager(cluster, config);
    certManager.chart.node.addDependency(albController.chart);

    // Deploy external-secrets (depends on ALB controller webhook being ready + namespaces)
    const externalSecrets = this.deployExternalSecrets(cluster, config);
    externalSecrets.chart.node.addDependency(albController.chart);

    // Deploy ClusterSecretStores (depends on external-secrets CRDs)
    this.deployClusterSecretStores(cluster, config, externalSecrets);

    // Deploy External DNS
    this.deployExternalDns(cluster, config);

    // Deploy metrics-server (required for HPA/VPA)
    this.deployMetricsServer(cluster, config);

    // Deploy reloader for automatic pod restarts on config changes
    this.deployReloader(cluster, config);

    // Wire namespace dependencies for IRSA roles that target non-kube-system namespaces.
    // The IrsaRole construct creates a K8s ServiceAccount which needs the namespace to exist.
    for (const id of ['CertManagerRole', 'ExternalSecretsRole', 'ExternalDnsRole']) {
      this.node.findChild(id).node.addDependency(namespaces);
    }

    // Apply tags
    for (const [key, value] of Object.entries(config.tags)) {
      cdk.Tags.of(this).add(key, value);
    }
  }

  /**
   * Pre-create namespaces so that both IRSA ServiceAccounts and Helm charts
   * can reference them without racing. Returns a manifest that other resources
   * can depend on.
   *
   * @param cluster - The EKS cluster to create namespaces in
   * @param names - List of namespace names to create
   * @returns A KubernetesManifest that other resources can declare as a dependency
   */
  private createNamespaces(cluster: eks.ICluster, names: string[]): eks.KubernetesManifest {
    return new eks.KubernetesManifest(this, 'BootstrapNamespaces', {
      cluster,
      overwrite: true,
      manifest: names.map((name) => ({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name },
      })),
    });
  }

  /**
   * Deploy AWS EBS CSI Driver for dynamic EBS volume provisioning.
   *
   * Required for the gp3 StorageClass which uses the ebs.csi.aws.com provisioner.
   * Without this driver, PVCs for workloads like Loki and Tempo will not bind.
   *
   * @param cluster - The EKS cluster to deploy the driver into
   * @param config - Environment configuration with Helm chart version and values
   * @returns The HelmRelease for dependency wiring (e.g., gp3 StorageClass depends on this)
   */
  private deployEbsCsiDriver(cluster: eks.ICluster, config: EnvironmentConfig): HelmRelease {
    // Create IRSA role for EBS CSI driver
    new IrsaRole(this, 'EbsCsiDriverRole', {
      cluster,
      serviceAccount: 'ebs-csi-controller-sa',
      namespace: 'kube-system',
      policyStatements: [
        new iam.PolicyStatement({
          actions: [
            'ec2:CreateSnapshot',
            'ec2:AttachVolume',
            'ec2:DetachVolume',
            'ec2:ModifyVolume',
            'ec2:DescribeAvailabilityZones',
            'ec2:DescribeInstances',
            'ec2:DescribeSnapshots',
            'ec2:DescribeTags',
            'ec2:DescribeVolumes',
            'ec2:DescribeVolumesModifications',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['ec2:CreateTags'],
          resources: ['arn:aws:ec2:*:*:volume/*', 'arn:aws:ec2:*:*:snapshot/*'],
          conditions: {
            StringEquals: {
              'ec2:CreateAction': ['CreateVolume', 'CreateSnapshot'],
            },
          },
        }),
        new iam.PolicyStatement({
          actions: ['ec2:DeleteTags'],
          resources: ['arn:aws:ec2:*:*:volume/*', 'arn:aws:ec2:*:*:snapshot/*'],
        }),
        new iam.PolicyStatement({
          actions: ['ec2:CreateVolume'],
          resources: ['*'],
          conditions: {
            StringLike: {
              'aws:RequestTag/ebs.csi.aws.com/cluster': 'true',
            },
          },
        }),
        new iam.PolicyStatement({
          actions: ['ec2:DeleteVolume'],
          resources: ['*'],
          conditions: {
            StringLike: {
              'ec2:ResourceTag/ebs.csi.aws.com/cluster': 'true',
            },
          },
        }),
        new iam.PolicyStatement({
          actions: ['ec2:DeleteSnapshot'],
          resources: ['*'],
          conditions: {
            StringLike: {
              'ec2:ResourceTag/CSIVolumeSnapshotName': '*',
            },
          },
        }),
      ],
    });

    return new HelmRelease(this, 'EbsCsiDriver', {
      cluster,
      chart: 'aws-ebs-csi-driver',
      repository: 'https://kubernetes-sigs.github.io/aws-ebs-csi-driver',
      version: config.helmConfigs.ebsCsiDriver.version,
      namespace: 'kube-system',
      baseValues: config.helmConfigs.ebsCsiDriver.values,
      values: {
        controller: {
          serviceAccount: {
            create: false,
            name: 'ebs-csi-controller-sa',
          },
          tolerations: [CRITICAL_ADDONS_TOLERATION],
        },
        node: {
          tolerations: [CRITICAL_ADDONS_TOLERATION],
        },
      },
    });
  }

  /**
   * Create gp3 StorageClass as the cluster default.
   *
   * EKS ships with gp2 as the default StorageClass but gp3 is superior:
   * - 20% cheaper per GB ($0.08/GB vs $0.10/GB)
   * - 3,000 IOPS baseline (vs gp2 burstable)
   * - 125 MiB/s throughput baseline
   *
   * This method:
   * 1. Creates a gp3 StorageClass marked as default
   * 2. Patches the existing gp2 StorageClass to remove its default annotation
   *
   * @param cluster - The EKS cluster to create the StorageClass in
   * @param ebsCsiDriver - The EBS CSI driver HelmRelease (used as a dependency)
   */
  private createGp3StorageClass(cluster: eks.ICluster, ebsCsiDriver: HelmRelease): void {
    // Create gp3 StorageClass as the new default
    const gp3StorageClass = new eks.KubernetesManifest(this, 'Gp3StorageClass', {
      cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: 'storage.k8s.io/v1',
          kind: 'StorageClass',
          metadata: {
            name: 'gp3',
            annotations: {
              'storageclass.kubernetes.io/is-default-class': 'true',
            },
          },
          provisioner: 'ebs.csi.aws.com',
          parameters: {
            type: 'gp3',
            fsType: 'ext4',
            encrypted: 'true',
          },
          reclaimPolicy: 'Delete',
          volumeBindingMode: 'WaitForFirstConsumer',
          allowVolumeExpansion: true,
        },
      ],
    });

    gp3StorageClass.node.addDependency(ebsCsiDriver.chart);

    // Remove default annotation from the built-in gp2 StorageClass
    const gp2Patch = new eks.KubernetesPatch(this, 'Gp2RemoveDefault', {
      cluster,
      resourceName: 'storageclass/gp2',
      applyPatch: {
        metadata: {
          annotations: {
            'storageclass.kubernetes.io/is-default-class': 'false',
          },
        },
      },
      restorePatch: {
        metadata: {
          annotations: {
            'storageclass.kubernetes.io/is-default-class': 'true',
          },
        },
      },
    });
    gp2Patch.node.addDependency(gp3StorageClass);
  }

  /**
   * Deploy Prometheus Operator CRDs
   *
   * We deploy only the CRDs (not the full operator) because:
   * - We use AWS Managed Prometheus for the backend
   * - Grafana Agent handles scraping and remote_write to AMP
   * - But we still need ServiceMonitor/PodMonitor CRDs for standard k8s monitoring
   *
   * The CRDs are deployed via the prometheus-operator-crds chart which is
   * maintained by the prometheus-community and contains only CRDs.
   *
   * @param cluster - The EKS cluster to deploy CRDs into
   * @param _config - Environment configuration (reserved for future version override)
   * @returns The HelmRelease for dependency wiring
   */
  private deployPrometheusOperatorCrds(cluster: eks.ICluster, _config: EnvironmentConfig): HelmRelease {
    return new HelmRelease(this, 'PrometheusOperatorCrds', {
      cluster,
      chart: 'prometheus-operator-crds',
      repository: 'https://prometheus-community.github.io/helm-charts',
      version: '19.1.0', // CRD-only chart version
      namespace: 'monitoring',
      createNamespace: true,
      values: {},
    });
  }

  /**
   * Deploy metrics-server for Kubernetes metrics API.
   *
   * Required for:
   * - Horizontal Pod Autoscaler (HPA)
   * - Vertical Pod Autoscaler (VPA)
   * - kubectl top commands
   *
   * @param cluster - The EKS cluster to deploy metrics-server into
   * @param config - Environment configuration with Helm chart version and values
   */
  private deployMetricsServer(cluster: eks.ICluster, config: EnvironmentConfig): void {
    new HelmRelease(this, 'MetricsServer', {
      cluster,
      chart: 'metrics-server',
      repository: 'https://kubernetes-sigs.github.io/metrics-server/',
      version: config.helmConfigs.metricsServer.version,
      namespace: 'kube-system',
      baseValues: config.helmConfigs.metricsServer.values,
      values: {
        args: [
          '--kubelet-preferred-address-types=InternalIP,Hostname,InternalDNS,ExternalDNS,ExternalIP',
          '--kubelet-use-node-status-port',
          '--metric-resolution=15s',
        ],
        tolerations: [CRITICAL_ADDONS_TOLERATION],
      },
    });
  }

  /**
   * Deploy reloader for automatic pod restarts on ConfigMap/Secret changes.
   *
   * @param cluster - The EKS cluster to deploy reloader into
   * @param config - Environment configuration with Helm chart version and values
   */
  private deployReloader(cluster: eks.ICluster, config: EnvironmentConfig): void {
    new HelmRelease(this, 'Reloader', {
      cluster,
      chart: 'reloader',
      repository: 'https://stakater.github.io/stakater-charts',
      version: config.helmConfigs.reloader.version,
      namespace: 'reloader',
      createNamespace: true,
      baseValues: config.helmConfigs.reloader.values,
      values: {
        reloader: {
          watchGlobally: true,
          deployment: {
            tolerations: [CRITICAL_ADDONS_TOLERATION],
          },
        },
      },
    });
  }

  /**
   * Deploy cert-manager for TLS certificate management.
   *
   * Also creates Let's Encrypt ClusterIssuers (production and staging)
   * and an optional wildcard Certificate resource.
   *
   * @param cluster - The EKS cluster to deploy cert-manager into
   * @param config - Environment configuration with Helm chart version, DNS, and AWS settings
   * @returns The HelmRelease for dependency wiring (ClusterIssuers depend on this)
   */
  private deployCertManager(cluster: eks.ICluster, config: EnvironmentConfig): HelmRelease {
    // Create IRSA role for cert-manager (DNS01 challenge with Route53)
    new IrsaRole(this, 'CertManagerRole', {
      cluster,
      serviceAccount: 'cert-manager',
      namespace: 'cert-manager',
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['route53:GetChange'],
          resources: ['arn:aws:route53:::change/*'],
        }),
        new iam.PolicyStatement({
          actions: ['route53:ChangeResourceRecordSets', 'route53:ListResourceRecordSets'],
          resources: [`arn:aws:route53:::hostedzone/${config.dns.hostedZoneId}`],
        }),
        new iam.PolicyStatement({
          actions: ['route53:ListHostedZonesByName'],
          resources: ['*'],
        }),
      ],
    });

    const helmRelease = new HelmRelease(this, 'CertManager', {
      cluster,
      chart: 'cert-manager',
      repository: 'https://charts.jetstack.io',
      version: config.helmConfigs.certManager.version,
      namespace: 'cert-manager',
      createNamespace: true,
      baseValues: config.helmConfigs.certManager.values,
      values: {
        installCRDs: true,
        serviceAccount: {
          create: false,
          name: 'cert-manager',
        },
        prometheus: {
          enabled: true,
          servicemonitor: {
            enabled: false,
          },
        },
        tolerations: [CRITICAL_ADDONS_TOLERATION],
        webhook: {
          tolerations: [CRITICAL_ADDONS_TOLERATION],
        },
        cainjector: {
          tolerations: [CRITICAL_ADDONS_TOLERATION],
        },
      },
    });

    // Add ClusterIssuer for Let's Encrypt (production)
    const letsencryptProd = new eks.KubernetesManifest(this, 'LetsEncryptProdIssuer', {
      cluster,
      skipValidation: true,
      manifest: [
        {
          apiVersion: 'cert-manager.io/v1',
          kind: 'ClusterIssuer',
          metadata: { name: 'letsencrypt-prod' },
          spec: {
            acme: {
              server: 'https://acme-v02.api.letsencrypt.org/directory',
              email: `admin@${config.dns.domainName}`,
              privateKeySecretRef: { name: 'letsencrypt-prod-account-key' },
              solvers: [
                {
                  dns01: {
                    route53: {
                      region: config.aws.region,
                      hostedZoneID: config.dns.hostedZoneId,
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    });
    letsencryptProd.node.addDependency(helmRelease.chart);

    // Add ClusterIssuer for Let's Encrypt (staging - for testing)
    const letsencryptStaging = new eks.KubernetesManifest(this, 'LetsEncryptStagingIssuer', {
      cluster,
      skipValidation: true,
      manifest: [
        {
          apiVersion: 'cert-manager.io/v1',
          kind: 'ClusterIssuer',
          metadata: { name: 'letsencrypt-staging' },
          spec: {
            acme: {
              server: 'https://acme-staging-v02.api.letsencrypt.org/directory',
              email: `admin@${config.dns.domainName}`,
              privateKeySecretRef: { name: 'letsencrypt-staging-account-key' },
              solvers: [
                {
                  dns01: {
                    route53: {
                      region: config.aws.region,
                      hostedZoneID: config.dns.hostedZoneId,
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    });
    letsencryptStaging.node.addDependency(helmRelease.chart);

    // Add wildcard certificate if enabled
    if (config.dns.wildcardCert && config.dns.domainName) {
      const wildcardCert = new eks.KubernetesManifest(this, 'WildcardCertificate', {
        cluster,
        skipValidation: true,
        manifest: [
          {
            apiVersion: 'cert-manager.io/v1',
            kind: 'Certificate',
            metadata: {
              name: 'wildcard-certificate',
              namespace: 'cert-manager',
            },
            spec: {
              secretName: 'wildcard-tls',
              issuerRef: {
                name: 'letsencrypt-prod',
                kind: 'ClusterIssuer',
              },
              commonName: `*.${config.dns.domainName}`,
              dnsNames: [config.dns.domainName, `*.${config.dns.domainName}`],
            },
          },
        ],
      });
      wildcardCert.node.addDependency(letsencryptProd);
    }

    return helmRelease;
  }

  /**
   * Deploy external-secrets for AWS Secrets Manager integration.
   *
   * Creates an IRSA role with permissions for Secrets Manager,
   * SSM Parameter Store, and KMS decryption.
   *
   * @param cluster - The EKS cluster to deploy external-secrets into
   * @param config - Environment configuration with Helm chart version and AWS settings
   * @returns The HelmRelease for dependency wiring (ClusterSecretStores depend on this)
   */
  private deployExternalSecrets(cluster: eks.ICluster, config: EnvironmentConfig): HelmRelease {
    // Create IRSA role for external-secrets
    new IrsaRole(this, 'ExternalSecretsRole', {
      cluster,
      serviceAccount: 'external-secrets',
      namespace: 'external-secrets',
      policyStatements: [
        // AWS Secrets Manager permissions
        new iam.PolicyStatement({
          actions: [
            'secretsmanager:GetResourcePolicy',
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
            'secretsmanager:ListSecretVersionIds',
          ],
          resources: [`arn:aws:secretsmanager:${config.aws.region}:${config.aws.accountId}:secret:*`],
        }),
        // AWS SSM Parameter Store permissions
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath', 'ssm:DescribeParameters'],
          resources: [`arn:aws:ssm:${config.aws.region}:${config.aws.accountId}:parameter/*`],
        }),
        // KMS permissions for decrypting secrets
        new iam.PolicyStatement({
          actions: ['kms:Decrypt'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'kms:ViaService': [
                `secretsmanager.${config.aws.region}.amazonaws.com`,
                `ssm.${config.aws.region}.amazonaws.com`,
              ],
            },
          },
        }),
      ],
    });

    return new HelmRelease(this, 'ExternalSecrets', {
      cluster,
      chart: 'external-secrets',
      repository: 'https://charts.external-secrets.io',
      version: config.helmConfigs.externalSecrets.version,
      namespace: 'external-secrets',
      createNamespace: true,
      baseValues: config.helmConfigs.externalSecrets.values,
      values: {
        installCRDs: true,
        serviceAccount: {
          create: false,
          name: 'external-secrets',
        },
        tolerations: [CRITICAL_ADDONS_TOLERATION],
      },
    });
  }

  /**
   * Deploy ClusterSecretStores for AWS Secrets Manager and Parameter Store.
   *
   * Creates two cluster-scoped secret stores that any namespace can reference
   * when creating ExternalSecret resources.
   *
   * @param cluster - The EKS cluster to deploy ClusterSecretStores into
   * @param config - Environment configuration with AWS region
   * @param externalSecretsRelease - The external-secrets HelmRelease (CRD dependency)
   */
  private deployClusterSecretStores(
    cluster: eks.ICluster,
    config: EnvironmentConfig,
    externalSecretsRelease: HelmRelease,
  ): void {
    // Create ClusterSecretStore for AWS Secrets Manager
    const secretsManagerStore = new eks.KubernetesManifest(this, 'SecretsManagerClusterSecretStore', {
      cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: 'external-secrets.io/v1',
          kind: 'ClusterSecretStore',
          metadata: {
            name: 'aws-secrets-manager',
          },
          spec: {
            provider: {
              aws: {
                service: 'SecretsManager',
                region: config.aws.region,
                auth: {
                  jwt: {
                    serviceAccountRef: {
                      name: 'external-secrets',
                      namespace: 'external-secrets',
                    },
                  },
                },
              },
            },
          },
        },
      ],
    });
    secretsManagerStore.node.addDependency(externalSecretsRelease.chart);

    // Create ClusterSecretStore for AWS Parameter Store
    const parameterStore = new eks.KubernetesManifest(this, 'ParameterStoreClusterSecretStore', {
      cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: 'external-secrets.io/v1',
          kind: 'ClusterSecretStore',
          metadata: {
            name: 'aws-parameter-store',
          },
          spec: {
            provider: {
              aws: {
                service: 'ParameterStore',
                region: config.aws.region,
                auth: {
                  jwt: {
                    serviceAccountRef: {
                      name: 'external-secrets',
                      namespace: 'external-secrets',
                    },
                  },
                },
              },
            },
          },
        },
      ],
    });
    parameterStore.node.addDependency(externalSecretsRelease.chart);
  }

  /**
   * Deploy AWS Load Balancer Controller for ALB/NLB ingress.
   *
   * Deployed first because its mutating webhook (`mservice.elbv2.k8s.aws`)
   * intercepts Service creation, so it must be ready before other Helm
   * charts create Services.
   *
   * @param cluster - The EKS cluster to deploy the controller into
   * @param config - Environment configuration with Helm chart version and AWS settings
   * @param vpc - The VPC (used for VPC ID in controller configuration)
   * @returns The HelmRelease for dependency wiring (cert-manager and external-secrets depend on this)
   */
  private deployAlbController(cluster: eks.ICluster, config: EnvironmentConfig, vpc: ec2.IVpc): HelmRelease {
    // Create IRSA role
    new IrsaRole(this, 'AlbControllerRole', {
      cluster,
      serviceAccount: 'aws-load-balancer-controller',
      namespace: 'kube-system',
      policyStatements: this.getAlbControllerPolicyStatements(),
    });

    return new HelmRelease(this, 'AwsLoadBalancerController', {
      cluster,
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      version: config.helmConfigs.awsLoadBalancerController.version,
      namespace: 'kube-system',
      baseValues: config.helmConfigs.awsLoadBalancerController.values,
      values: {
        clusterName: cluster.clusterName,
        vpcId: vpc.vpcId,
        region: config.aws.region,
        serviceAccount: {
          create: false,
          name: 'aws-load-balancer-controller',
        },
        tolerations: [CRITICAL_ADDONS_TOLERATION],
      },
    });
  }

  /**
   * Deploy External DNS for Route53 integration.
   *
   * Automatically creates DNS records in Route53 for Kubernetes
   * Ingress and Service resources annotated with external-dns.
   *
   * @param cluster - The EKS cluster to deploy external-dns into
   * @param config - Environment configuration with Helm chart version and DNS settings
   */
  private deployExternalDns(cluster: eks.ICluster, config: EnvironmentConfig): void {
    // Create IRSA role for external-dns
    new IrsaRole(this, 'ExternalDnsRole', {
      cluster,
      serviceAccount: 'external-dns',
      namespace: 'external-dns',
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['route53:ChangeResourceRecordSets'],
          resources: [`arn:aws:route53:::hostedzone/${config.dns.hostedZoneId}`],
        }),
        new iam.PolicyStatement({
          actions: ['route53:ListHostedZones', 'route53:ListResourceRecordSets'],
          resources: ['*'],
        }),
      ],
    });

    new HelmRelease(this, 'ExternalDns', {
      cluster,
      chart: 'external-dns',
      repository: 'https://kubernetes-sigs.github.io/external-dns/',
      version: config.helmConfigs.externalDns.version,
      namespace: 'external-dns',
      createNamespace: true,
      baseValues: config.helmConfigs.externalDns.values,
      values: {
        serviceAccount: {
          create: false,
          name: 'external-dns',
        },
        provider: 'aws',
        domainFilters: [config.dns.domainName],
        txtOwnerId: cluster.clusterName,
        tolerations: [CRITICAL_ADDONS_TOLERATION],
      },
    });
  }

  /**
   * Get IAM policy statements for ALB controller.
   *
   * @returns Array of IAM policy statements granting EC2, ELB, ACM, WAF, and Shield permissions
   */
  private getAlbControllerPolicyStatements(): iam.PolicyStatement[] {
    return [
      new iam.PolicyStatement({
        actions: [
          'ec2:DescribeAccountAttributes',
          'ec2:DescribeAddresses',
          'ec2:DescribeAvailabilityZones',
          'ec2:DescribeInternetGateways',
          'ec2:DescribeVpcs',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeInstances',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DescribeTags',
          'ec2:GetCoipPoolUsage',
          'ec2:DescribeCoipPools',
          'elasticloadbalancing:*',
          'cognito-idp:DescribeUserPoolClient',
          'acm:ListCertificates',
          'acm:DescribeCertificate',
          'iam:ListServerCertificates',
          'iam:GetServerCertificate',
          'waf-regional:*',
          'wafv2:*',
          'shield:*',
        ],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        actions: [
          'ec2:AuthorizeSecurityGroupIngress',
          'ec2:RevokeSecurityGroupIngress',
          'ec2:CreateSecurityGroup',
          'ec2:DeleteSecurityGroup',
        ],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        actions: ['ec2:CreateTags'],
        resources: ['arn:aws:ec2:*:*:security-group/*'],
        conditions: {
          StringEquals: {
            'ec2:CreateAction': 'CreateSecurityGroup',
          },
        },
      }),
      new iam.PolicyStatement({
        actions: ['ec2:CreateTags', 'ec2:DeleteTags'],
        resources: ['arn:aws:ec2:*:*:security-group/*'],
        conditions: {
          Null: {
            'aws:ResourceTag/kubernetes.io/cluster-name': 'false',
          },
        },
      }),
    ];
  }
}
