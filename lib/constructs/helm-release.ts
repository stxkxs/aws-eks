import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';
import { deepMerge } from '../utils';

/**
 * Properties for HelmRelease construct
 */
export interface HelmReleaseProps {
  /** The EKS cluster to deploy to */
  readonly cluster: eks.ICluster;

  /** Helm chart name */
  readonly chart: string;

  /** Helm repository URL */
  readonly repository: string;

  /** Chart version */
  readonly version: string;

  /** Kubernetes namespace */
  readonly namespace: string;

  /** Create namespace if it doesn't exist */
  readonly createNamespace?: boolean;

  /** Release name (defaults to chart name) */
  readonly releaseName?: string;

  /**
   * Base Helm values from configuration (production-ready defaults).
   * These are merged with stack-specific values.
   */
  readonly baseValues?: Record<string, unknown>;

  /**
   * Stack-specific Helm values.
   * These take precedence over baseValues.
   */
  readonly values?: Record<string, unknown>;

  /** Wait for resources to be ready */
  readonly wait?: boolean;

  /** Timeout for helm operations */
  readonly timeout?: string;
}

/**
 * A construct that deploys a Helm chart to an EKS cluster.
 *
 * Wraps eks.HelmChart with sensible defaults and consistent patterns.
 *
 * @example
 * new HelmRelease(this, 'CertManager', {
 *   cluster: props.cluster,
 *   chart: 'cert-manager',
 *   repository: 'https://charts.jetstack.io',
 *   version: 'v1.17.1',
 *   namespace: 'cert-manager',
 *   createNamespace: true,
 *   values: {
 *     installCRDs: true,
 *   },
 * });
 */
export class HelmRelease extends Construct {
  /** The underlying Helm chart resource */
  public readonly chart: eks.HelmChart;

  /**
   * Creates a new HelmRelease.
   *
   * When both `baseValues` and `values` are provided, they are deep-merged
   * with `values` taking precedence over `baseValues`.
   *
   * @param scope - The CDK construct scope
   * @param id - The construct identifier
   * @param props - Configuration properties for the Helm release
   */
  constructor(scope: Construct, id: string, props: HelmReleaseProps) {
    super(scope, id);

    // Merge baseValues with values, where values takes precedence
    let mergedValues: Record<string, unknown> | undefined;
    if (props.baseValues && props.values) {
      mergedValues = deepMerge(props.baseValues, props.values);
    } else if (props.baseValues) {
      mergedValues = props.baseValues;
    } else {
      mergedValues = props.values;
    }

    this.chart = new eks.HelmChart(this, 'Chart', {
      cluster: props.cluster,
      chart: props.chart,
      repository: props.repository,
      version: props.version,
      namespace: props.namespace,
      createNamespace: props.createNamespace ?? true,
      release: props.releaseName ?? props.chart,
      values: mergedValues,
      wait: props.wait ?? true,
      timeout: props.timeout ? parseDuration(props.timeout) : undefined,
    });
  }
}

/**
 * Parse a duration string like "5m" or "10m" to CDK Duration.
 *
 * @param duration - Duration string in the format `<number><unit>` where unit is `s`, `m`, or `h`
 * @returns A CDK Duration object
 * @throws Error if the duration format is invalid
 */
function parseDuration(duration: string): cdk.Duration {
  const match = duration.match(/^(\d+)(s|m|h)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return cdk.Duration.seconds(value);
    case 'm':
      return cdk.Duration.minutes(value);
    case 'h':
      return cdk.Duration.hours(value);
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}
