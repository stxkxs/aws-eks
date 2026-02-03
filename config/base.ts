import { EnvironmentConfig } from '../lib/types/config';

/**
 * Base configuration shared across all environments.
 *
 * Environment-specific configs (dev, staging, production) override these
 * values using {@link deepMerge}. The merge strategy is:
 * - Objects are recursively merged (nested keys are preserved unless overridden)
 * - Arrays are **replaced** entirely (not concatenated)
 * - Primitive values are overridden by the environment config
 * - `undefined` values in overrides are ignored (base value is kept)
 *
 * This means you only need to specify the fields you want to change in
 * each environment config -- everything else inherits from this base.
 *
 * @remarks
 * The `environment` and `aws` fields are omitted from the base config
 * because they are always set per-environment in the `get*Config()` functions.
 *
 * @see {@link deepMerge} for the merge implementation
 * @see {@link DeepPartial} for the type used by environment overrides
 * @see {@link EnvironmentConfig} for the full configuration interface
 */
export const baseConfig: Omit<EnvironmentConfig, 'environment' | 'aws'> = {
  features: {
    multiAzNat: true,
    trivyAdmission: true,
    veleroBackups: true,
    goldilocks: true,
    costAllocationTags: true,
    vpcEndpoints: true,
    nodeLocalDns: true,
    defaultNetworkPolicies: true,
    priorityClasses: true,
    resourceQuotas: true,
    // ArgoCD GitOps
    argocdEnabled: true,
    // Backstage Developer Portal (optional)
    backstageEnabled: false,
  },

  network: {
    vpcCidr: '10.0.0.0/16',
    natGateways: 2,
    maxAzs: 3,
    flowLogs: true,
  },

  cluster: {
    version: '1.35',
    name: 'eks',
    privateEndpoint: true,
    publicEndpoint: true,
    logging: ['api', 'audit', 'authenticator', 'controllerManager', 'scheduler'],
    secretsEncryption: true,
  },

  systemNodeGroup: {
    instanceTypes: ['m5a.large', 'm5.large'],
    minSize: 2,
    maxSize: 6,
    desiredSize: 2,
    diskSize: 100,
    amiType: 'BOTTLEROCKET_x86_64',
  },

  karpenter: {
    nodePoolName: 'default',
    instanceCategories: ['m', 'c', 'r'],
    instanceSizes: ['medium', 'large', 'xlarge', '2xlarge'],
    spotEnabled: true,
    cpuLimit: 100,
    memoryLimitGi: 200,
    consolidationPolicy: 'WhenEmptyOrUnderutilized',
    consolidateAfter: '1m',
  },

  helmConfigs: {
    certManager: {
      version: 'v1.19.3',
      values: {
        replicaCount: 2,
        webhook: {
          replicaCount: 3,
        },
        cainjector: {
          replicaCount: 2,
        },
        resources: {
          requests: { cpu: '50m', memory: '64Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
        podDisruptionBudget: {
          enabled: true,
          minAvailable: 1,
        },
        global: {
          priorityClassName: 'system-cluster-critical',
        },
      },
    },
    karpenter: {
      version: '1.8.6',
      values: {
        replicas: 2,
        resources: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
      },
    },
    awsLoadBalancerController: {
      version: '1.14.1',
      values: {
        replicaCount: 2,
        enableServiceMutatorWebhook: true,
        resources: {
          requests: { cpu: '50m', memory: '128Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
        podDisruptionBudget: {
          minAvailable: 1,
        },
      },
    },
    metricsServer: {
      version: '3.13.0',
      values: {
        replicas: 2,
        resources: {
          requests: { cpu: '50m', memory: '64Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
        podDisruptionBudget: {
          enabled: true,
          minAvailable: 1,
        },
      },
    },
    externalDns: {
      version: '1.17.0',
      values: {
        policy: 'sync',
        interval: '1m',
        registry: 'txt',
        resources: {
          requests: { cpu: '50m', memory: '64Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
      },
    },
    externalSecrets: {
      version: '0.17.0',
      values: {
        replicaCount: 2,
        resources: {
          requests: { cpu: '50m', memory: '64Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
        webhook: {
          replicaCount: 2,
          resources: {
            requests: { cpu: '50m', memory: '64Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
        certController: {
          resources: {
            requests: { cpu: '50m', memory: '64Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
      },
    },
    reloader: {
      version: '2.2.5',
      values: {
        reloader: {
          watchGlobally: true,
          resources: {
            requests: { cpu: '50m', memory: '64Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
      },
    },
    kyverno: {
      version: '3.5.0',
      values: {
        admissionController: {
          replicas: 3,
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
        },
        backgroundController: {
          replicas: 2,
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
        },
        reportsController: {
          replicas: 2,
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
        },
        cleanupController: {
          replicas: 1,
          resources: {
            requests: { cpu: '50m', memory: '128Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
      },
    },
    velero: {
      version: '11.3.2',
      values: {
        resources: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
        deployNodeAgent: true,
        nodeAgent: {
          resources: {
            requests: { cpu: '50m', memory: '128Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
      },
    },
    goldilocks: {
      version: '9.2.0',
      values: {
        controller: {
          resources: {
            requests: { cpu: '50m', memory: '64Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
        dashboard: {
          resources: {
            requests: { cpu: '50m', memory: '64Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
      },
    },
    awsNodeTerminationHandler: {
      version: '0.21.0',
      values: {
        resources: {
          requests: { cpu: '50m', memory: '64Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
        enableSpotInterruptionDraining: true,
        enableRebalanceMonitoring: true,
        enableScheduledEventDraining: true,
      },
    },
    cilium: {
      version: '1.18.6',
      values: {
        bpf: {
          preallocateMaps: true,
        },
        hubble: {
          tls: {
            enabled: true,
            auto: {
              enabled: true,
              method: 'helm',
            },
          },
          relay: {
            enabled: true,
            resources: {
              requests: { cpu: '50m', memory: '64Mi' },
              limits: { cpu: '200m', memory: '256Mi' },
            },
          },
        },
        operator: {
          replicas: 2,
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
        },
        resources: {
          requests: { cpu: '100m', memory: '128Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
      },
    },
    // ArgoCD for GitOps
    argocd: {
      version: '7.8.2',
      values: {
        server: {
          replicas: 2,
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
        },
        controller: {
          replicas: 1,
          resources: {
            requests: { cpu: '250m', memory: '512Mi' },
            limits: { cpu: '1000m', memory: '1Gi' },
          },
        },
        repoServer: {
          replicas: 2,
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
        },
        applicationSet: {
          replicas: 2,
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
      },
    },
    trivyOperator: {
      version: '0.31.0',
      values: {
        operator: {
          scanJobTimeout: '10m',
          scannerReportTTL: '24h',
        },
        resources: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
      },
    },
    loki: {
      version: '6.29.0',
      values: {
        loki: {
          commonConfig: {
            replication_factor: 3,
          },
          schemaConfig: {
            configs: [
              {
                from: '2024-01-01',
                store: 'tsdb',
                object_store: 's3',
                schema: 'v13',
                index: {
                  prefix: 'loki_index_',
                  period: '24h',
                },
              },
            ],
          },
        },
        singleBinary: {
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
        },
      },
    },
    tempo: {
      version: '1.21.0',
      values: {
        tempo: {
          ingester: {
            trace_idle_period: '10s',
            max_block_bytes: 100_000_000,
            max_block_duration: '5m',
          },
        },
        resources: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
      },
    },
    grafanaAgent: {
      version: '0.44.2',
      values: {
        agent: {
          mode: 'flow',
        },
        resources: {
          requests: { cpu: '50m', memory: '128Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
      },
    },
    promtail: {
      version: '6.17.1',
      values: {
        config: {
          snippets: {
            pipelineStages: [{ cri: {} }],
          },
        },
        resources: {
          requests: { cpu: '100m', memory: '128Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
      },
    },
    ebsCsiDriver: {
      version: '2.37.0',
      values: {
        controller: {
          replicaCount: 2,
          resources: {
            requests: { cpu: '50m', memory: '128Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
        node: {
          resources: {
            requests: { cpu: '25m', memory: '64Mi' },
            limits: { cpu: '100m', memory: '128Mi' },
          },
        },
      },
    },
  },

  observability: {
    lokiRetentionDays: 30,
    tempoRetentionDays: 7,
    containerInsights: true,
  },

  backup: {
    bucketName: '', // Set per environment
    dailyRetentionDays: 30,
    weeklyRetentionDays: 90,
    includedNamespaces: [], // Empty = all namespaces
  },

  dns: {
    hostedZoneId: '', // Set per environment
    domainName: '', // Set per environment
    wildcardCert: true,
  },

  security: {
    allowedRegistries: [], // Set per environment (ECR account IDs)
    trivySeverityThreshold: 'HIGH',
    clusterAccess: {
      // Use both API and ConfigMap for compatibility during migration
      authenticationMode: 'API_AND_CONFIG_MAP',
      // Automatically add the CDK deploying role as cluster admin
      addDeployerAsAdmin: true,
      // Add admin/developer/viewer roles per environment
      // admins: [{ arn: 'arn:aws:iam::ACCOUNT:role/AdminRole', name: 'admin' }],
      // developers: [{ arn: 'arn:aws:iam::ACCOUNT:role/DevRole', name: 'dev' }],
      // viewers: [{ arn: 'arn:aws:iam::ACCOUNT:role/ViewerRole', name: 'viewer' }],
    },
  },

  tags: {
    'managed-by': 'cdk',
    project: 'aws-eks',
  },
};
