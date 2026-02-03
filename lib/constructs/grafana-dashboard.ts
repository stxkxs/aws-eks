import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

/**
 * Properties for the {@link GrafanaDashboard} construct.
 */
export interface GrafanaDashboardProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Dashboard name (used for ConfigMap name) */
  readonly name: string;

  /** Kubernetes namespace for the ConfigMap */
  readonly namespace: string;

  /** Dashboard JSON content */
  readonly dashboardJson: string;

  /** Folder to place dashboard in (optional) */
  readonly folder?: string;

  /** Additional labels for the ConfigMap */
  readonly labels?: Record<string, string>;
}

/**
 * A construct that deploys a Grafana dashboard as a Kubernetes ConfigMap.
 *
 * Uses the Grafana sidecar pattern where dashboards are discovered
 * via ConfigMap labels.
 *
 * @remarks
 * Grafana's sidecar container (typically deployed as part of the `kube-prometheus-stack`
 * or standalone Grafana Helm chart) continuously watches for ConfigMaps that carry the
 * label `grafana_dashboard: "true"`. When a matching ConfigMap is created or updated,
 * the sidecar reads the JSON data key and provisions the dashboard in Grafana
 * automatically -- no manual import or API call required.
 *
 * The optional `folder` prop is mapped to the `grafana_folder` annotation on the
 * ConfigMap. The sidecar uses this annotation to place the dashboard into the
 * corresponding Grafana folder (creating the folder if it does not exist).
 *
 * The resulting ConfigMap is named `grafana-dashboard-<name>` and stores the
 * dashboard JSON under the key `<name>.json`.
 *
 * @see https://github.com/grafana/helm-charts/tree/main/charts/grafana#sidecar-for-dashboards
 *
 * @example
 * ```typescript
 * new GrafanaDashboard(this, 'ClusterOverview', {
 *   cluster: props.cluster,
 *   name: 'cluster-overview',
 *   namespace: 'monitoring',
 *   dashboardJson: JSON.stringify(clusterDashboard),
 *   folder: 'kubernetes',
 * });
 * ```
 */
export class GrafanaDashboard extends Construct {
  /** The Kubernetes ConfigMap manifest */
  public readonly manifest: eks.KubernetesManifest;

  /**
   * @param scope - The CDK construct scope.
   * @param id - The construct id.
   * @param props - Dashboard name, JSON content, and optional folder placement.
   */
  constructor(scope: Construct, id: string, props: GrafanaDashboardProps) {
    super(scope, id);

    const labels: Record<string, string> = {
      grafana_dashboard: 'true',
      ...props.labels,
    };

    // Add folder annotation if specified
    const annotations: Record<string, string> = {};
    if (props.folder) {
      annotations['grafana_folder'] = props.folder;
    }

    this.manifest = new eks.KubernetesManifest(this, 'ConfigMap', {
      cluster: props.cluster,
      manifest: [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            name: `grafana-dashboard-${props.name}`,
            namespace: props.namespace,
            labels,
            annotations,
          },
          data: {
            [`${props.name}.json`]: props.dashboardJson,
          },
        },
      ],
    });
  }
}

/**
 * Properties for the {@link StandardDashboards} collection.
 */
export interface StandardDashboardsProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Kubernetes namespace for the dashboards */
  readonly namespace: string;

  /** Enable cluster overview dashboard */
  readonly clusterOverview?: boolean;

  /** Enable node health dashboard */
  readonly nodeHealth?: boolean;

  /** Enable pod metrics dashboard */
  readonly podMetrics?: boolean;

  /** Enable network flows dashboard (Hubble) */
  readonly networkFlows?: boolean;
}

/**
 * Deploys a collection of standard Grafana dashboards for Kubernetes monitoring.
 *
 * @remarks
 * All dashboards except `networkFlows` are enabled by default. The `networkFlows`
 * dashboard requires Hubble (Cilium's observability layer) to be running in the
 * cluster and is opt-in via the `networkFlows` flag.
 *
 * Each dashboard is provisioned via {@link GrafanaDashboard}, which uses the
 * ConfigMap sidecar discovery mechanism described in that construct's documentation.
 *
 * @example
 * ```typescript
 * new StandardDashboards(this, 'Dashboards', {
 *   cluster,
 *   namespace: 'monitoring',
 *   networkFlows: true,
 * });
 * ```
 */
export class StandardDashboards extends Construct {
  /**
   * @param scope - The CDK construct scope.
   * @param id - The construct id.
   * @param props - Feature flags controlling which dashboards to deploy.
   */
  constructor(scope: Construct, id: string, props: StandardDashboardsProps) {
    super(scope, id);

    if (props.clusterOverview !== false) {
      new GrafanaDashboard(this, 'ClusterOverview', {
        cluster: props.cluster,
        name: 'cluster-overview',
        namespace: props.namespace,
        folder: 'kubernetes',
        dashboardJson: JSON.stringify(createClusterOverviewDashboard()),
      });
    }

    if (props.nodeHealth !== false) {
      new GrafanaDashboard(this, 'NodeHealth', {
        cluster: props.cluster,
        name: 'node-health',
        namespace: props.namespace,
        folder: 'kubernetes',
        dashboardJson: JSON.stringify(createNodeHealthDashboard()),
      });
    }

    if (props.podMetrics !== false) {
      new GrafanaDashboard(this, 'PodMetrics', {
        cluster: props.cluster,
        name: 'pod-metrics',
        namespace: props.namespace,
        folder: 'kubernetes',
        dashboardJson: JSON.stringify(createPodMetricsDashboard()),
      });
    }

    if (props.networkFlows) {
      new GrafanaDashboard(this, 'NetworkFlows', {
        cluster: props.cluster,
        name: 'network-flows',
        namespace: props.namespace,
        folder: 'cilium',
        dashboardJson: JSON.stringify(createNetworkFlowsDashboard()),
      });
    }
  }
}

/**
 * Creates a comprehensive cluster overview dashboard definition.
 *
 * @returns A Grafana dashboard JSON object with panels for node count, pod
 *   status, CPU/memory/disk gauges, and per-node time-series charts.
 */
function createClusterOverviewDashboard(): object {
  const timeseriesDefaults = {
    axisBorderShow: false,
    axisCenteredZero: false,
    axisColorMode: 'text',
    axisLabel: '',
    axisPlacement: 'auto',
    barAlignment: 0,
    drawStyle: 'line',
    fillOpacity: 10,
    gradientMode: 'none',
    hideFrom: { legend: false, tooltip: false, viz: false },
    insertNulls: false,
    lineInterpolation: 'linear',
    lineWidth: 1,
    pointSize: 5,
    scaleDistribution: { type: 'linear' },
    showPoints: 'never',
    spanNulls: false,
    stacking: { group: 'A', mode: 'none' },
    thresholdsStyle: { mode: 'off' },
  };

  return {
    annotations: { list: [] },
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 1,
    id: null,
    links: [],
    panels: [
      // Row 1: Key metrics (y: 0)
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 4, x: 0, y: 0 },
        id: 1,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_node_info)', refId: 'A' }],
        title: 'Nodes',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 4, x: 4, y: 0 },
        id: 2,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_pod_info)', refId: 'A' }],
        title: 'Total Pods',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 4, x: 8, y: 0 },
        id: 3,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_pod_status_phase{phase="Running"})', refId: 'A' }],
        title: 'Running Pods',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 1 },
                { color: 'red', value: 5 },
              ],
            },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 4, x: 12, y: 0 },
        id: 4,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_pod_status_phase{phase="Pending"})', refId: 'A' }],
        title: 'Pending Pods',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'red', value: 1 },
              ],
            },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 4, x: 16, y: 0 },
        id: 5,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_pod_status_phase{phase="Failed"})', refId: 'A' }],
        title: 'Failed Pods',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 5 },
                { color: 'red', value: 20 },
              ],
            },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 4, x: 20, y: 0 },
        id: 6,
        options: {
          colorMode: 'value',
          graphMode: 'area',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'sum(increase(kube_pod_container_status_restarts_total[1h]))', refId: 'A' }],
        title: 'Restarts (1h)',
        type: 'stat',
      },
      // Row 2: Resource gauges (y: 4)
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 70 },
                { color: 'red', value: 85 },
              ],
            },
            unit: 'percent',
            min: 0,
            max: 100,
          },
        },
        gridPos: { h: 5, w: 6, x: 0, y: 4 },
        id: 7,
        options: {
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          showThresholdLabels: false,
          showThresholdMarkers: true,
        },
        targets: [{ expr: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', refId: 'A' }],
        title: 'Cluster CPU',
        type: 'gauge',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 70 },
                { color: 'red', value: 85 },
              ],
            },
            unit: 'percent',
            min: 0,
            max: 100,
          },
        },
        gridPos: { h: 5, w: 6, x: 6, y: 4 },
        id: 8,
        options: {
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          showThresholdLabels: false,
          showThresholdMarkers: true,
        },
        targets: [
          { expr: '100 * (1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)))', refId: 'A' },
        ],
        title: 'Cluster Memory',
        type: 'gauge',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 70 },
                { color: 'red', value: 85 },
              ],
            },
            unit: 'percent',
            min: 0,
            max: 100,
          },
        },
        gridPos: { h: 5, w: 6, x: 12, y: 4 },
        id: 9,
        options: {
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          showThresholdLabels: false,
          showThresholdMarkers: true,
        },
        targets: [
          {
            expr: '100 * (1 - (avg(node_filesystem_avail_bytes{mountpoint="/"}) / avg(node_filesystem_size_bytes{mountpoint="/"})))',
            refId: 'A',
          },
        ],
        title: 'Cluster Disk',
        type: 'gauge',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
          },
        },
        gridPos: { h: 5, w: 6, x: 18, y: 4 },
        id: 10,
        options: {
          legend: { displayMode: 'list', placement: 'right', showLegend: true },
          pieType: 'pie',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          tooltip: { mode: 'single', sort: 'none' },
        },
        targets: [{ expr: 'sum by (phase) (kube_pod_status_phase)', legendFormat: '{{phase}}', refId: 'A' }],
        title: 'Pod Status',
        type: 'piechart',
      },
      // Row 3: CPU and Memory over time (y: 9)
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: timeseriesDefaults,
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'percent',
          },
        },
        gridPos: { h: 8, w: 12, x: 0, y: 9 },
        id: 11,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'sum by (node) (rate(node_cpu_seconds_total{mode!="idle"}[5m])) / sum by (node) (rate(node_cpu_seconds_total[5m])) * 100',
            legendFormat: '{{node}}',
            refId: 'A',
          },
        ],
        title: 'CPU Usage by Node',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: timeseriesDefaults,
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'percent',
          },
        },
        gridPos: { h: 8, w: 12, x: 12, y: 9 },
        id: 12,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))',
            legendFormat: '{{node}}',
            refId: 'A',
          },
        ],
        title: 'Memory Usage by Node',
        type: 'timeseries',
      },
      // Row 4: Disk and Network (y: 17)
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: timeseriesDefaults,
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'percent',
          },
        },
        gridPos: { h: 8, w: 12, x: 0, y: 17 },
        id: 13,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: '100 * (1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}))',
            legendFormat: '{{node}}',
            refId: 'A',
          },
        ],
        title: 'Disk Usage by Node',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: timeseriesDefaults,
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'Bps',
          },
        },
        gridPos: { h: 8, w: 12, x: 12, y: 17 },
        id: 14,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'sum by (node) (rate(node_network_receive_bytes_total{device!~"lo|veth.*"}[5m]))',
            legendFormat: '{{node}} rx',
            refId: 'A',
          },
          {
            expr: '-sum by (node) (rate(node_network_transmit_bytes_total{device!~"lo|veth.*"}[5m]))',
            legendFormat: '{{node}} tx',
            refId: 'B',
          },
        ],
        title: 'Network I/O by Node',
        type: 'timeseries',
      },
      // Row 5: Container restarts and Top namespaces (y: 25)
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: timeseriesDefaults,
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 8, w: 12, x: 0, y: 25 },
        id: 15,
        options: {
          legend: { calcs: ['sum'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'sum by (namespace) (increase(kube_pod_container_status_restarts_total[1h])) > 0',
            legendFormat: '{{namespace}}',
            refId: 'A',
          },
        ],
        title: 'Container Restarts by Namespace (1h)',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: { ...timeseriesDefaults, stacking: { group: 'A', mode: 'normal' } },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 8, w: 12, x: 12, y: 25 },
        id: 16,
        options: {
          legend: { calcs: ['mean'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'topk(10, sum by (namespace) (rate(container_cpu_usage_seconds_total{container!=""}[5m])))',
            legendFormat: '{{namespace}}',
            refId: 'A',
          },
        ],
        title: 'Top 10 Namespaces by CPU',
        type: 'timeseries',
      },
    ],
    schemaVersion: 39,
    tags: ['kubernetes', 'cluster', 'overview'],
    templating: {
      list: [
        {
          current: {},
          hide: 0,
          includeAll: false,
          label: 'Datasource',
          multi: false,
          name: 'datasource',
          options: [],
          query: 'prometheus',
          queryValue: '',
          refresh: 1,
          regex: '',
          skipUrlSync: false,
          type: 'datasource',
        },
      ],
    },
    time: { from: 'now-1h', to: 'now' },
    timepicker: {},
    timezone: 'browser',
    title: 'Cluster Overview',
    uid: 'cluster-overview',
    version: 1,
    weekStart: '',
  };
}

/**
 * Creates a node health dashboard definition.
 *
 * @returns A Grafana dashboard JSON object with per-node CPU, memory, disk,
 *   and network I/O panels, plus a node-readiness status row.
 */
function createNodeHealthDashboard(): object {
  return {
    annotations: { list: [] },
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 0,
    id: null,
    links: [],
    panels: [
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [
              {
                options: {
                  '0': { color: 'red', index: 1, text: 'NotReady' },
                  '1': { color: 'green', index: 0, text: 'Ready' },
                },
                type: 'value',
              },
            ],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'red', value: null },
                { color: 'green', value: 1 },
              ],
            },
          },
        },
        gridPos: { h: 6, w: 24, x: 0, y: 0 },
        id: 1,
        options: {
          colorMode: 'background',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'horizontal',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'value_and_name',
        },
        targets: [
          { expr: 'kube_node_status_condition{condition="Ready",status="true"}', legendFormat: '{{node}}', refId: 'A' },
        ],
        title: 'Node Status',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'percent',
          },
        },
        gridPos: { h: 8, w: 12, x: 0, y: 6 },
        id: 2,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle",node="$node"}[5m])) * 100)',
            legendFormat: '{{instance}}',
            refId: 'A',
          },
        ],
        title: 'CPU Usage',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'bytes',
          },
        },
        gridPos: { h: 8, w: 12, x: 12, y: 6 },
        id: 3,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          { expr: 'node_memory_MemTotal_bytes{node="$node"}', legendFormat: 'Total', refId: 'A' },
          {
            expr: 'node_memory_MemTotal_bytes{node="$node"} - node_memory_MemAvailable_bytes{node="$node"}',
            legendFormat: 'Used',
            refId: 'B',
          },
        ],
        title: 'Memory Usage',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'bytes',
          },
        },
        gridPos: { h: 8, w: 12, x: 0, y: 14 },
        id: 4,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          { expr: 'node_filesystem_size_bytes{node="$node",mountpoint="/"}', legendFormat: 'Total', refId: 'A' },
          {
            expr: 'node_filesystem_size_bytes{node="$node",mountpoint="/"} - node_filesystem_avail_bytes{node="$node",mountpoint="/"}',
            legendFormat: 'Used',
            refId: 'B',
          },
        ],
        title: 'Disk Usage',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'Bps',
          },
        },
        gridPos: { h: 8, w: 12, x: 12, y: 14 },
        id: 5,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'rate(node_network_receive_bytes_total{node="$node",device!~"lo|veth.*|docker.*|br.*"}[5m])',
            legendFormat: 'Receive {{device}}',
            refId: 'A',
          },
          {
            expr: '-rate(node_network_transmit_bytes_total{node="$node",device!~"lo|veth.*|docker.*|br.*"}[5m])',
            legendFormat: 'Transmit {{device}}',
            refId: 'B',
          },
        ],
        title: 'Network I/O',
        type: 'timeseries',
      },
    ],
    schemaVersion: 39,
    tags: ['kubernetes', 'node'],
    templating: {
      list: [
        {
          current: {},
          hide: 0,
          includeAll: false,
          label: 'Datasource',
          multi: false,
          name: 'datasource',
          options: [],
          query: 'prometheus',
          queryValue: '',
          refresh: 1,
          regex: '',
          skipUrlSync: false,
          type: 'datasource',
        },
        {
          current: {},
          datasource: { type: 'prometheus', uid: '${datasource}' },
          definition: 'label_values(kube_node_info, node)',
          hide: 0,
          includeAll: false,
          label: 'Node',
          multi: false,
          name: 'node',
          options: [],
          query: { query: 'label_values(kube_node_info, node)', refId: 'StandardVariableQuery' },
          refresh: 1,
          regex: '',
          skipUrlSync: false,
          sort: 1,
          type: 'query',
        },
      ],
    },
    time: { from: 'now-1h', to: 'now' },
    timepicker: {},
    timezone: 'browser',
    title: 'Node Health',
    uid: 'node-health',
    version: 1,
    weekStart: '',
  };
}

/**
 * Creates a pod metrics dashboard definition.
 *
 * @returns A Grafana dashboard JSON object with per-pod CPU, memory, and
 *   container restart panels, filterable by namespace and pod name.
 */
function createPodMetricsDashboard(): object {
  return {
    annotations: { list: [] },
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 0,
    id: null,
    links: [],
    panels: [
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 6, x: 0, y: 0 },
        id: 1,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_pod_info{namespace="$namespace"})', refId: 'A' }],
        title: 'Total Pods',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 6, x: 6, y: 0 },
        id: 2,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_pod_status_phase{namespace="$namespace",phase="Running"})', refId: 'A' }],
        title: 'Running Pods',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'red', value: 1 },
              ],
            },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 6, x: 12, y: 0 },
        id: 3,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_pod_status_phase{namespace="$namespace",phase="Failed"})', refId: 'A' }],
        title: 'Failed Pods',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'thresholds' },
            mappings: [],
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'yellow', value: 1 },
              ],
            },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 6, x: 18, y: 0 },
        id: 4,
        options: {
          colorMode: 'value',
          graphMode: 'none',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'count(kube_pod_status_phase{namespace="$namespace",phase="Pending"})', refId: 'A' }],
        title: 'Pending Pods',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 8, w: 12, x: 0, y: 4 },
        id: 5,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="$namespace",pod=~"$pod",container!=""}[5m]))',
            legendFormat: '{{pod}}',
            refId: 'A',
          },
        ],
        title: 'CPU Usage by Pod',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'bytes',
          },
        },
        gridPos: { h: 8, w: 12, x: 12, y: 4 },
        id: 6,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'sum by (pod) (container_memory_working_set_bytes{namespace="$namespace",pod=~"$pod",container!=""})',
            legendFormat: '{{pod}}',
            refId: 'A',
          },
        ],
        title: 'Memory Usage by Pod',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 8, w: 24, x: 0, y: 12 },
        id: 7,
        options: {
          legend: { calcs: [], displayMode: 'list', placement: 'bottom', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'sum by (pod) (increase(kube_pod_container_status_restarts_total{namespace="$namespace",pod=~"$pod"}[1h]))',
            legendFormat: '{{pod}}',
            refId: 'A',
          },
        ],
        title: 'Container Restarts (1h)',
        type: 'timeseries',
      },
    ],
    schemaVersion: 39,
    tags: ['kubernetes', 'pods'],
    templating: {
      list: [
        {
          current: {},
          hide: 0,
          includeAll: false,
          label: 'Datasource',
          multi: false,
          name: 'datasource',
          options: [],
          query: 'prometheus',
          queryValue: '',
          refresh: 1,
          regex: '',
          skipUrlSync: false,
          type: 'datasource',
        },
        {
          current: {},
          datasource: { type: 'prometheus', uid: '${datasource}' },
          definition: 'label_values(kube_namespace_labels, namespace)',
          hide: 0,
          includeAll: false,
          label: 'Namespace',
          multi: false,
          name: 'namespace',
          options: [],
          query: { query: 'label_values(kube_namespace_labels, namespace)', refId: 'StandardVariableQuery' },
          refresh: 1,
          regex: '',
          skipUrlSync: false,
          sort: 1,
          type: 'query',
        },
        {
          current: {},
          datasource: { type: 'prometheus', uid: '${datasource}' },
          definition: 'label_values(kube_pod_info{namespace="$namespace"}, pod)',
          hide: 0,
          includeAll: true,
          label: 'Pod',
          multi: true,
          name: 'pod',
          options: [],
          query: { query: 'label_values(kube_pod_info{namespace="$namespace"}, pod)', refId: 'StandardVariableQuery' },
          refresh: 1,
          regex: '',
          skipUrlSync: false,
          sort: 1,
          type: 'query',
        },
      ],
    },
    time: { from: 'now-1h', to: 'now' },
    timepicker: {},
    timezone: 'browser',
    title: 'Pod Metrics',
    uid: 'pod-metrics',
    version: 1,
    weekStart: '',
  };
}

/**
 * Creates a network flows dashboard definition (Hubble/Cilium).
 *
 * @returns A Grafana dashboard JSON object with flow rate, drop rate, active
 *   policy count, verdict breakdown, and top namespace-to-namespace traffic.
 */
function createNetworkFlowsDashboard(): object {
  return {
    annotations: { list: [] },
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 0,
    id: null,
    links: [],
    panels: [
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 8, x: 0, y: 0 },
        id: 1,
        options: {
          colorMode: 'value',
          graphMode: 'area',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'sum(rate(hubble_flows_processed_total[5m]))', refId: 'A' }],
        title: 'Flows/sec',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 8, x: 8, y: 0 },
        id: 2,
        options: {
          colorMode: 'value',
          graphMode: 'area',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'sum(rate(hubble_drop_total[5m]))', refId: 'A' }],
        title: 'Drops/sec',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 4, w: 8, x: 16, y: 0 },
        id: 3,
        options: {
          colorMode: 'value',
          graphMode: 'area',
          justifyMode: 'auto',
          orientation: 'auto',
          reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
          textMode: 'auto',
        },
        targets: [{ expr: 'sum(cilium_policy_count)', refId: 'A' }],
        title: 'Active Policies',
        type: 'stat',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 8, w: 12, x: 0, y: 4 },
        id: 4,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'sum by (verdict) (rate(hubble_flows_processed_total[5m]))',
            legendFormat: '{{verdict}}',
            refId: 'A',
          },
        ],
        title: 'Flow Verdicts',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 8, w: 12, x: 12, y: 4 },
        id: 5,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [{ expr: 'sum by (reason) (rate(hubble_drop_total[5m]))', legendFormat: '{{reason}}', refId: 'A' }],
        title: 'Drop Reasons',
        type: 'timeseries',
      },
      {
        datasource: { type: 'prometheus', uid: '${datasource}' },
        fieldConfig: {
          defaults: {
            color: { mode: 'palette-classic' },
            custom: {
              axisBorderShow: false,
              axisCenteredZero: false,
              axisColorMode: 'text',
              axisLabel: '',
              axisPlacement: 'auto',
              barAlignment: 0,
              drawStyle: 'line',
              fillOpacity: 10,
              gradientMode: 'none',
              hideFrom: { legend: false, tooltip: false, viz: false },
              insertNulls: false,
              lineInterpolation: 'linear',
              lineWidth: 1,
              pointSize: 5,
              scaleDistribution: { type: 'linear' },
              showPoints: 'never',
              spanNulls: false,
              stacking: { group: 'A', mode: 'none' },
              thresholdsStyle: { mode: 'off' },
            },
            mappings: [],
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
            unit: 'short',
          },
        },
        gridPos: { h: 8, w: 24, x: 0, y: 12 },
        id: 6,
        options: {
          legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'right', showLegend: true },
          tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets: [
          {
            expr: 'topk(10, sum by (source_namespace, destination_namespace) (rate(hubble_flows_processed_total[5m])))',
            legendFormat: '{{source_namespace}} -> {{destination_namespace}}',
            refId: 'A',
          },
        ],
        title: 'Top Traffic by Namespace',
        type: 'timeseries',
      },
    ],
    schemaVersion: 39,
    tags: ['cilium', 'hubble', 'network'],
    templating: {
      list: [
        {
          current: {},
          hide: 0,
          includeAll: false,
          label: 'Datasource',
          multi: false,
          name: 'datasource',
          options: [],
          query: 'prometheus',
          queryValue: '',
          refresh: 1,
          regex: '',
          skipUrlSync: false,
          type: 'datasource',
        },
      ],
    },
    time: { from: 'now-1h', to: 'now' },
    timepicker: {},
    timezone: 'browser',
    title: 'Network Flows (Hubble)',
    uid: 'network-flows',
    version: 1,
    weekStart: '',
  };
}
