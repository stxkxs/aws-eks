import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';
import { HelmRelease } from './helm-release';
import { EnvironmentConfig } from '../types';

/**
 * Properties for ArgoCDBootstrap construct
 */
export interface ArgoCDBootstrapProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Environment configuration */
  readonly config: EnvironmentConfig;

  /** ArgoCD Helm chart version */
  readonly version: string;

  /** ArgoCD Helm values */
  readonly values?: Record<string, unknown>;

  /** GitOps repository URL */
  readonly gitOpsRepoUrl: string;

  /** Git revision (branch, tag, or commit) */
  readonly gitOpsRevision?: string;

  /** Path within the GitOps repository to the app-of-apps */
  readonly gitOpsPath?: string;

  /** ArgoCD hostname for ingress */
  readonly hostname?: string;

  /** AppProject name for platform addons */
  readonly platformProjectName?: string;

  /** Enable SSO via Dex */
  readonly ssoEnabled?: boolean;

  /** GitHub organization for SSO group mappings */
  readonly githubOrg?: string;

  /** AWS Secrets Manager secret name for GitHub OAuth credentials */
  readonly oauthSecretName?: string;

  /** RBAC default policy (e.g., 'role:readonly', 'role:admin') */
  readonly rbacDefaultPolicy?: string;

  /** ACM certificate ARN for ALB HTTPS (omit to let ALB auto-discover) */
  readonly certificateArn?: string;
}

/**
 * A construct that bootstraps ArgoCD with an App-of-Apps pattern.
 *
 * This construct:
 * 1. Deploys ArgoCD Helm chart
 * 2. Creates a platform AppProject for addon management
 * 3. Creates an App-of-Apps Application that points to the GitOps repository
 *
 * The App-of-Apps pattern allows ArgoCD to manage itself and all other
 * cluster addons through GitOps.
 *
 * @remarks
 * **Sync Windows:** In production environments, the construct automatically
 * configures ArgoCD sync windows on the platform `AppProject`. A deny window
 * is applied during weekday business hours (Mon--Fri 09:00--17:00 UTC) to
 * prevent automated syncs from triggering during peak traffic. Manual syncs
 * are still permitted during deny windows so operators can push urgent fixes.
 * Non-production environments have no sync restrictions, allowing continuous
 * delivery at all times.
 *
 * **SSO via Dex:** When `ssoEnabled` is true (along with `githubOrg` and
 * `oauthSecretName`), the construct configures Dex as a GitHub OAuth connector
 * and provisions an `ExternalSecret` to pull OAuth credentials from AWS
 * Secrets Manager.
 *
 * @see https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/
 * @see https://argo-cd.readthedocs.io/en/stable/user-guide/sync-windows/
 * @see https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/
 *
 * @example
 * new ArgoCDBootstrap(this, 'ArgoCD', {
 *   cluster: props.cluster,
 *   config: props.config,
 *   version: 'v7.8.2',
 *   gitOpsRepoUrl: 'https://github.com/example/aws-eks-gitops.git',
 *   gitOpsRevision: 'main',
 *   gitOpsPath: 'applicationsets',
 * });
 */
export class ArgoCDBootstrap extends Construct {
  /** The ArgoCD Helm release */
  public readonly argocdRelease: HelmRelease;

  /**
   * Creates a new ArgoCDBootstrap instance and deploys all ArgoCD resources.
   *
   * @param scope - The CDK construct scope
   * @param id - The construct identifier
   * @param props - Configuration properties for the ArgoCD bootstrap
   */
  constructor(scope: Construct, id: string, props: ArgoCDBootstrapProps) {
    super(scope, id);

    const {
      cluster,
      config,
      version,
      values,
      gitOpsRepoUrl,
      gitOpsRevision = 'main',
      gitOpsPath = 'applicationsets',
      hostname,
      platformProjectName = 'platform',
      ssoEnabled,
      githubOrg,
      oauthSecretName,
      rbacDefaultPolicy = 'role:readonly',
      certificateArn,
    } = props;

    // Build SSO-specific Helm values when enabled
    const ssoValues =
      ssoEnabled && githubOrg && oauthSecretName
        ? {
            configs: {
              cm: {
                'kustomize.buildOptions': '--enable-helm',
                'resource.customizations.ignoreDifferences.apps_Deployment': 'jqPathExpressions:\n- .status\n',
                'resource.customizations.ignoreDifferences.apps_StatefulSet':
                  'jqPathExpressions:\n- .status\n- .spec.volumeClaimTemplates[]?.spec\n',
                url: `https://${hostname}`,
                'dex.config': [
                  'connectors:',
                  '  - type: github',
                  '    id: github',
                  '    name: GitHub',
                  '    config:',
                  '      clientID: $dex.github.clientID',
                  '      clientSecret: $dex.github.clientSecret',
                  '      loadAllGroups: true',
                ].join('\n'),
              },
              rbac: {
                'policy.default': rbacDefaultPolicy,
                'policy.csv': `g, ${githubOrg}, role:admin`,
                scopes: '[groups, email]',
              },
            },
            dex: {
              enabled: true,
              tolerations: [
                {
                  key: 'CriticalAddonsOnly',
                  operator: 'Exists',
                },
              ],
            },
            extraObjects: [
              {
                apiVersion: 'external-secrets.io/v1',
                kind: 'ExternalSecret',
                metadata: {
                  name: 'argocd-secret',
                  namespace: 'argocd',
                },
                spec: {
                  refreshInterval: '1h',
                  secretStoreRef: {
                    name: 'aws-secrets-manager',
                    kind: 'ClusterSecretStore',
                  },
                  target: {
                    name: 'argocd-secret',
                    creationPolicy: 'Merge',
                  },
                  data: [
                    {
                      secretKey: 'dex.github.clientID',
                      remoteRef: { key: oauthSecretName, property: 'client_id' },
                    },
                    {
                      secretKey: 'dex.github.clientSecret',
                      remoteRef: { key: oauthSecretName, property: 'client_secret' },
                    },
                    {
                      secretKey: 'server.secretkey',
                      remoteRef: { key: oauthSecretName, property: 'server_secretkey' },
                    },
                  ],
                },
              },
            ],
          }
        : {};

    // Deploy ArgoCD
    this.argocdRelease = new HelmRelease(this, 'ArgoCD', {
      cluster,
      chart: 'argo-cd',
      repository: 'https://argoproj.github.io/argo-helm',
      version,
      namespace: 'argocd',
      createNamespace: true,
      timeout: '15m',
      baseValues: values,
      values: {
        // Global settings
        global: {
          domain: hostname || `argocd.${config.dns.domainName}`,
        },

        // Enable Helm in Kustomize for GitOps addons
        // Ignore known-drifting fields:
        //   - .status on Deployments/StatefulSets (K8s 1.35+ terminatingReplicas)
        //   - volumeClaimTemplates storageClassName on StatefulSets (immutable after creation)
        configs: {
          cm: {
            'kustomize.buildOptions': '--enable-helm',
            'resource.customizations.ignoreDifferences.apps_Deployment': 'jqPathExpressions:\n- .status\n',
            'resource.customizations.ignoreDifferences.apps_StatefulSet':
              'jqPathExpressions:\n- .status\n- .spec.volumeClaimTemplates[]?.spec\n',
          },
        },

        // Server configuration
        server: {
          // Ingress configuration
          ingress: {
            enabled: !!hostname,
            ingressClassName: 'alb',
            hostname: hostname || `argocd.${config.dns.domainName}`,
            annotations: {
              'alb.ingress.kubernetes.io/scheme': 'internet-facing',
              'alb.ingress.kubernetes.io/target-type': 'ip',
              'alb.ingress.kubernetes.io/backend-protocol': 'HTTP',
              'alb.ingress.kubernetes.io/listen-ports': '[{"HTTPS":443}]',
              'alb.ingress.kubernetes.io/ssl-redirect': '443',
              ...(certificateArn && {
                'alb.ingress.kubernetes.io/certificate-arn': certificateArn,
              }),
            },
          },
          // Extra args to disable TLS on server (ALB handles TLS)
          extraArgs: ['--insecure'],
          tolerations: [
            {
              key: 'CriticalAddonsOnly',
              operator: 'Exists',
            },
          ],
        },

        // Controller configuration
        controller: {
          tolerations: [
            {
              key: 'CriticalAddonsOnly',
              operator: 'Exists',
            },
          ],
        },

        // Repo server configuration
        repoServer: {
          tolerations: [
            {
              key: 'CriticalAddonsOnly',
              operator: 'Exists',
            },
          ],
        },

        // ApplicationSet controller
        applicationSet: {
          tolerations: [
            {
              key: 'CriticalAddonsOnly',
              operator: 'Exists',
            },
          ],
        },

        // Redis
        redis: {
          tolerations: [
            {
              key: 'CriticalAddonsOnly',
              operator: 'Exists',
            },
          ],
        },

        // Notifications controller
        notifications: {
          tolerations: [
            {
              key: 'CriticalAddonsOnly',
              operator: 'Exists',
            },
          ],
        },

        // SSO/Dex configuration (merged when enabled)
        ...ssoValues,
      },
    });

    // Create the platform AppProject
    const appProject = new eks.KubernetesManifest(this, 'PlatformAppProject', {
      cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'AppProject',
          metadata: {
            name: platformProjectName,
            namespace: 'argocd',
            // Finalizer to prevent accidental deletion
            finalizers: ['resources-finalizer.argocd.argoproj.io'],
          },
          spec: {
            description: 'Platform addons managed by ArgoCD',
            // Source repositories
            sourceRepos: [gitOpsRepoUrl],
            // Destination clusters and namespaces
            destinations: [
              {
                server: 'https://kubernetes.default.svc',
                namespace: '*',
              },
            ],
            // Cluster-scoped resources that this project can manage
            clusterResourceWhitelist: [{ group: '*', kind: '*' }],
            // Namespace-scoped resources that this project can manage
            namespaceResourceWhitelist: [{ group: '*', kind: '*' }],
            // Orphaned resources monitoring
            orphanedResources: {
              warn: true,
            },
            // Sync windows for production (optional)
            ...(config.environment === 'production' && {
              syncWindows: [
                {
                  kind: 'deny',
                  schedule: '0 9 * * 1-5', // No syncs during business hours
                  duration: '8h',
                  applications: ['*'],
                  manualSync: true,
                },
              ],
            }),
          },
        },
      ],
    });
    appProject.node.addDependency(this.argocdRelease.chart);

    // Create the App-of-Apps Application
    const appOfApps = new eks.KubernetesManifest(this, 'AppOfApps', {
      cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'Application',
          metadata: {
            name: 'platform-addons',
            namespace: 'argocd',
            // Finalizer for cleanup
            finalizers: ['resources-finalizer.argocd.argoproj.io'],
            // Annotations for sync waves
            annotations: {
              'argocd.argoproj.io/sync-wave': '-1',
            },
          },
          spec: {
            project: platformProjectName,
            source: {
              repoURL: gitOpsRepoUrl,
              targetRevision: gitOpsRevision,
              path: gitOpsPath,
            },
            destination: {
              server: 'https://kubernetes.default.svc',
              namespace: 'argocd',
            },
            syncPolicy: {
              automated: {
                prune: true,
                selfHeal: true,
                allowEmpty: false,
              },
              syncOptions: ['CreateNamespace=true', 'PrunePropagationPolicy=foreground', 'PruneLast=true'],
              retry: {
                limit: 5,
                backoff: {
                  duration: '5s',
                  factor: 2,
                  maxDuration: '3m',
                },
              },
            },
          },
        },
      ],
    });
    appOfApps.node.addDependency(appProject);

    // Create ConfigMap with cluster information for GitOps
    // This allows ApplicationSets to use cluster-specific values
    const clusterConfig = new eks.KubernetesManifest(this, 'ClusterConfig', {
      cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            name: 'cluster-config',
            namespace: 'argocd',
            labels: {
              'app.kubernetes.io/part-of': 'argocd',
            },
          },
          data: {
            environment: config.environment,
            region: config.aws.region,
            accountId: config.aws.accountId,
            clusterName: cluster.clusterName,
            vpcCidr: config.network.vpcCidr,
            domainName: config.dns.domainName,
            // Karpenter configuration for NodePools
            karpenterNodePoolName: config.karpenter.nodePoolName,
            karpenterInstanceCategories: config.karpenter.instanceCategories.join(','),
            karpenterInstanceSizes: config.karpenter.instanceSizes.join(','),
            karpenterSpotEnabled: String(config.karpenter.spotEnabled),
            karpenterCpuLimit: String(config.karpenter.cpuLimit),
            karpenterMemoryLimitGi: String(config.karpenter.memoryLimitGi),
            // Feature flags for conditional deployment
            veleroEnabled: String(config.features.veleroBackups),
            goldilocksEnabled: String(config.features.goldilocks),
            trivyAdmissionEnabled: String(config.features.trivyAdmission),
          },
        },
      ],
    });
    clusterConfig.node.addDependency(this.argocdRelease.chart);
  }
}
