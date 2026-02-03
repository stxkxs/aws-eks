import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

/**
 * Endpoint configuration for ServiceMonitor
 */
export interface ServiceMonitorEndpoint {
  /** Port name or number to scrape */
  readonly port: string;

  /** HTTP path to scrape (default: /metrics) */
  readonly path?: string;

  /** Scrape interval (e.g., "30s") */
  readonly interval?: string;

  /** Scrape timeout (e.g., "10s") */
  readonly scrapeTimeout?: string;

  /** HTTP scheme (http or https) */
  readonly scheme?: 'http' | 'https';

  /** Metric relabeling configs */
  readonly metricRelabelings?: MetricRelabeling[];

  /** Relabeling configs */
  readonly relabelings?: MetricRelabeling[];
}

/**
 * Metric relabeling configuration
 */
export interface MetricRelabeling {
  /** Source labels to select */
  readonly sourceLabels?: string[];

  /** Regular expression to match */
  readonly regex?: string;

  /** Target label for the matched value */
  readonly targetLabel?: string;

  /** Replacement value */
  readonly replacement?: string;

  /** Action to perform (replace, keep, drop, labelmap, labeldrop, labelkeep) */
  readonly action?: 'replace' | 'keep' | 'drop' | 'labelmap' | 'labeldrop' | 'labelkeep';
}

/**
 * Properties for ServiceMonitor construct
 */
export interface ServiceMonitorProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** ServiceMonitor name */
  readonly name: string;

  /** Kubernetes namespace for the ServiceMonitor */
  readonly namespace: string;

  /** Label selector to match services */
  readonly selector: Record<string, string>;

  /** Namespaces to select services from (defaults to same namespace) */
  readonly namespaceSelector?: {
    /** Match all namespaces */
    any?: boolean;
    /** Match specific namespaces */
    matchNames?: string[];
  };

  /** Endpoints to scrape */
  readonly endpoints: ServiceMonitorEndpoint[];

  /** Additional labels for the ServiceMonitor */
  readonly labels?: Record<string, string>;

  /** Job label to use */
  readonly jobLabel?: string;

  /** Target labels to transfer from service */
  readonly targetLabels?: string[];
}

/**
 * A construct that deploys a Prometheus ServiceMonitor CRD.
 *
 * ServiceMonitors define how Prometheus should scrape metrics from
 * Kubernetes Services.
 *
 * @remarks
 * Use a **ServiceMonitor** when your application exposes metrics through a
 * Kubernetes `Service` object. The ServiceMonitor discovers scrape targets
 * by matching `Service` labels, meaning Prometheus automatically picks up
 * new pods behind the service without manual configuration.
 *
 * Use a **PodMonitor** instead when:
 * - The application does not have a `Service` (e.g., batch jobs, DaemonSets
 *   with host-network ports).
 * - You need to scrape individual pod endpoints that are not load-balanced
 *   through a service.
 * - The metrics port is not exposed in the service definition.
 *
 * In most cases, ServiceMonitor is the preferred choice because it aligns
 * with the standard Kubernetes service discovery model and works seamlessly
 * with rolling deployments.
 *
 * @example
 * new ServiceMonitor(this, 'AppMonitor', {
 *   cluster: props.cluster,
 *   name: 'my-app',
 *   namespace: 'monitoring',
 *   selector: { app: 'my-app' },
 *   endpoints: [{
 *     port: 'metrics',
 *     interval: '30s',
 *   }],
 * });
 */
export class ServiceMonitor extends Construct {
  /** The Kubernetes manifest */
  public readonly manifest: eks.KubernetesManifest;

  /**
   * Creates a new ServiceMonitor construct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Configuration properties for the ServiceMonitor. The `selector` field
   *   must match the labels on the target Kubernetes `Service` resources.
   */
  constructor(scope: Construct, id: string, props: ServiceMonitorProps) {
    super(scope, id);

    const endpoints = props.endpoints.map((ep) => ({
      port: ep.port,
      path: ep.path ?? '/metrics',
      interval: ep.interval ?? '30s',
      scrapeTimeout: ep.scrapeTimeout,
      scheme: ep.scheme ?? 'http',
      metricRelabelings: ep.metricRelabelings,
      relabelings: ep.relabelings,
    }));

    const spec: Record<string, unknown> = {
      selector: {
        matchLabels: props.selector,
      },
      endpoints,
    };

    if (props.namespaceSelector) {
      spec.namespaceSelector = props.namespaceSelector;
    }

    if (props.jobLabel) {
      spec.jobLabel = props.jobLabel;
    }

    if (props.targetLabels) {
      spec.targetLabels = props.targetLabels;
    }

    this.manifest = new eks.KubernetesManifest(this, 'ServiceMonitor', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'monitoring.coreos.com/v1',
          kind: 'ServiceMonitor',
          metadata: {
            name: props.name,
            namespace: props.namespace,
            labels: {
              'app.kubernetes.io/name': props.name,
              ...props.labels,
            },
          },
          spec,
        },
      ],
    });
  }
}

/**
 * Properties for PodMonitor construct
 */
export interface PodMonitorProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** PodMonitor name */
  readonly name: string;

  /** Kubernetes namespace for the PodMonitor */
  readonly namespace: string;

  /** Label selector to match pods */
  readonly selector: Record<string, string>;

  /** Namespaces to select pods from (defaults to same namespace) */
  readonly namespaceSelector?: {
    /** Match all namespaces */
    any?: boolean;
    /** Match specific namespaces */
    matchNames?: string[];
  };

  /** Pod metrics endpoints to scrape */
  readonly podMetricsEndpoints: ServiceMonitorEndpoint[];

  /** Additional labels for the PodMonitor */
  readonly labels?: Record<string, string>;

  /** Job label to use */
  readonly jobLabel?: string;
}

/**
 * A construct that deploys a Prometheus PodMonitor CRD.
 *
 * PodMonitors define how Prometheus should scrape metrics directly
 * from pods (without a Service).
 *
 * @remarks
 * PodMonitor discovers scrape targets by matching pod labels directly,
 * bypassing the Kubernetes `Service` abstraction. This is useful for
 * workloads that expose metrics on sidecar containers, DaemonSets with
 * `hostNetwork`, or short-lived batch jobs where creating a service would
 * be unnecessary overhead.
 *
 * For long-running services that already have a `Service` resource, prefer
 * using {@link ServiceMonitor} instead, as it integrates more naturally
 * with Kubernetes service discovery and rolling updates.
 *
 * @example
 * new PodMonitor(this, 'AgentMonitor', {
 *   cluster: props.cluster,
 *   name: 'node-agent',
 *   namespace: 'monitoring',
 *   selector: { app: 'node-agent' },
 *   podMetricsEndpoints: [{
 *     port: 'metrics',
 *     interval: '15s',
 *   }],
 * });
 */
export class PodMonitor extends Construct {
  /** The Kubernetes manifest */
  public readonly manifest: eks.KubernetesManifest;

  /**
   * Creates a new PodMonitor construct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Configuration properties for the PodMonitor. The `selector` field
   *   must match the labels on the target pods.
   */
  constructor(scope: Construct, id: string, props: PodMonitorProps) {
    super(scope, id);

    const podMetricsEndpoints = props.podMetricsEndpoints.map((ep) => ({
      port: ep.port,
      path: ep.path ?? '/metrics',
      interval: ep.interval ?? '30s',
      scrapeTimeout: ep.scrapeTimeout,
      scheme: ep.scheme ?? 'http',
      metricRelabelings: ep.metricRelabelings,
      relabelings: ep.relabelings,
    }));

    const spec: Record<string, unknown> = {
      selector: {
        matchLabels: props.selector,
      },
      podMetricsEndpoints,
    };

    if (props.namespaceSelector) {
      spec.namespaceSelector = props.namespaceSelector;
    }

    if (props.jobLabel) {
      spec.jobLabel = props.jobLabel;
    }

    this.manifest = new eks.KubernetesManifest(this, 'PodMonitor', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'monitoring.coreos.com/v1',
          kind: 'PodMonitor',
          metadata: {
            name: props.name,
            namespace: props.namespace,
            labels: {
              'app.kubernetes.io/name': props.name,
              ...props.labels,
            },
          },
          spec,
        },
      ],
    });
  }
}

/**
 * Properties for PrometheusRule construct
 */
export interface PrometheusRuleProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** PrometheusRule name */
  readonly name: string;

  /** Kubernetes namespace for the PrometheusRule */
  readonly namespace: string;

  /** Rule groups */
  readonly groups: PrometheusRuleGroup[];

  /** Additional labels for the PrometheusRule */
  readonly labels?: Record<string, string>;
}

/**
 * Prometheus rule group
 */
export interface PrometheusRuleGroup {
  /** Group name */
  readonly name: string;

  /** Evaluation interval */
  readonly interval?: string;

  /** Rules in the group */
  readonly rules: PrometheusRule[];
}

/**
 * Prometheus rule (recording or alerting)
 */
export interface PrometheusRule {
  /** Recording rule name (for recording rules) */
  readonly record?: string;

  /** Alert name (for alerting rules) */
  readonly alert?: string;

  /** PromQL expression */
  readonly expr: string;

  /** Duration before alerting (for alerting rules) */
  readonly for?: string;

  /** Labels to add */
  readonly labels?: Record<string, string>;

  /** Annotations (for alerting rules) */
  readonly annotations?: Record<string, string>;
}

/**
 * A construct that deploys a PrometheusRule CRD.
 *
 * PrometheusRules define recording rules and alerting rules that Prometheus
 * evaluates periodically.
 *
 * @remarks
 * Recording rules pre-compute frequently used or expensive PromQL expressions
 * and store the result as a new time series. Alerting rules define conditions
 * under which Prometheus fires alerts to Alertmanager.
 *
 * @example
 * new PrometheusRuleConstruct(this, 'HighErrorRate', {
 *   cluster: props.cluster,
 *   name: 'app-alerts',
 *   namespace: 'monitoring',
 *   groups: [{
 *     name: 'app.rules',
 *     rules: [{
 *       alert: 'HighErrorRate',
 *       expr: 'rate(http_requests_total{status=~"5.."}[5m]) > 0.1',
 *       for: '10m',
 *       labels: { severity: 'critical' },
 *       annotations: { summary: 'High 5xx error rate detected' },
 *     }],
 *   }],
 * });
 */
export class PrometheusRuleConstruct extends Construct {
  /** The Kubernetes manifest */
  public readonly manifest: eks.KubernetesManifest;

  /**
   * Creates a new PrometheusRuleConstruct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Configuration properties including rule groups and their recording/alerting rules.
   */
  constructor(scope: Construct, id: string, props: PrometheusRuleProps) {
    super(scope, id);

    const groups = props.groups.map((group) => ({
      name: group.name,
      interval: group.interval,
      rules: group.rules.map((rule) => {
        const ruleObj: Record<string, unknown> = {
          expr: rule.expr,
        };
        if (rule.record) ruleObj.record = rule.record;
        if (rule.alert) ruleObj.alert = rule.alert;
        if (rule.for) ruleObj.for = rule.for;
        if (rule.labels) ruleObj.labels = rule.labels;
        if (rule.annotations) ruleObj.annotations = rule.annotations;
        return ruleObj;
      }),
    }));

    this.manifest = new eks.KubernetesManifest(this, 'PrometheusRule', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'monitoring.coreos.com/v1',
          kind: 'PrometheusRule',
          metadata: {
            name: props.name,
            namespace: props.namespace,
            labels: {
              'app.kubernetes.io/name': props.name,
              ...props.labels,
            },
          },
          spec: {
            groups,
          },
        },
      ],
    });
  }
}

/**
 * Properties for AppServiceMonitor construct - simplified interface for custom apps
 */
export interface AppServiceMonitorProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Application name */
  readonly appName: string;

  /** Application namespace */
  readonly appNamespace: string;

  /** Metrics port name or number (default: 'metrics') */
  readonly metricsPort?: string;

  /** Metrics path (default: '/metrics') */
  readonly metricsPath?: string;

  /** Scrape interval (default: '30s') */
  readonly scrapeInterval?: string;

  /** Additional labels to select the service (merged with app.kubernetes.io/name) */
  readonly additionalSelector?: Record<string, string>;

  /** Whether to scrape all pods directly instead of through service (default: false) */
  readonly scrapePodsDirectly?: boolean;

  /** Namespace where ServiceMonitor is created (default: 'monitoring') */
  readonly monitorNamespace?: string;
}

/**
 * Simplified construct for monitoring custom applications.
 *
 * Creates a {@link ServiceMonitor} (or {@link PodMonitor}) with sensible defaults for
 * monitoring custom applications deployed to Kubernetes.
 *
 * @remarks
 * This is a higher-level abstraction over ServiceMonitor and PodMonitor that
 * reduces boilerplate for the most common monitoring pattern: a single metrics
 * endpoint on an application service. It automatically selects pods using the
 * `app.kubernetes.io/name` label and places the monitor in the `monitoring`
 * namespace by default.
 *
 * Set `scrapePodsDirectly: true` to create a PodMonitor instead of a
 * ServiceMonitor. See the {@link ServiceMonitor} and {@link PodMonitor}
 * documentation for guidance on when to use each approach.
 *
 * @example
 * // Basic usage - monitor an app that exposes /metrics on port 'metrics'
 * new AppServiceMonitor(this, 'MyAppMonitor', {
 *   cluster: props.cluster,
 *   appName: 'my-app',
 *   appNamespace: 'default',
 * });
 *
 * @example
 * // Custom configuration
 * new AppServiceMonitor(this, 'ApiMonitor', {
 *   cluster: props.cluster,
 *   appName: 'api-server',
 *   appNamespace: 'production',
 *   metricsPort: '8080',
 *   metricsPath: '/actuator/prometheus',
 *   scrapeInterval: '15s',
 * });
 */
export class AppServiceMonitor extends Construct {
  /** The underlying ServiceMonitor or PodMonitor */
  public readonly monitor: ServiceMonitor | PodMonitor;

  /**
   * Creates a new AppServiceMonitor construct.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The scoped construct ID. Must be unique amongst siblings in the same scope.
   * @param props - Simplified monitoring configuration. Only `cluster`, `appName`, and
   *   `appNamespace` are required; all other options have sensible defaults.
   */
  constructor(scope: Construct, id: string, props: AppServiceMonitorProps) {
    super(scope, id);

    const metricsPort = props.metricsPort ?? 'metrics';
    const metricsPath = props.metricsPath ?? '/metrics';
    const scrapeInterval = props.scrapeInterval ?? '30s';
    const monitorNamespace = props.monitorNamespace ?? 'monitoring';

    const selector: Record<string, string> = {
      'app.kubernetes.io/name': props.appName,
      ...props.additionalSelector,
    };

    const endpoints: ServiceMonitorEndpoint[] = [
      {
        port: metricsPort,
        path: metricsPath,
        interval: scrapeInterval,
      },
    ];

    if (props.scrapePodsDirectly) {
      this.monitor = new PodMonitor(this, 'PodMonitor', {
        cluster: props.cluster,
        name: `${props.appName}-pods`,
        namespace: monitorNamespace,
        selector,
        namespaceSelector: { matchNames: [props.appNamespace] },
        podMetricsEndpoints: endpoints,
        labels: {
          'app.kubernetes.io/part-of': props.appName,
          'monitoring.coreos.com/source': 'app-service-monitor',
        },
      });
    } else {
      this.monitor = new ServiceMonitor(this, 'ServiceMonitor', {
        cluster: props.cluster,
        name: props.appName,
        namespace: monitorNamespace,
        selector,
        namespaceSelector: { matchNames: [props.appNamespace] },
        endpoints,
        labels: {
          'app.kubernetes.io/part-of': props.appName,
          'monitoring.coreos.com/source': 'app-service-monitor',
        },
      });
    }
  }
}
