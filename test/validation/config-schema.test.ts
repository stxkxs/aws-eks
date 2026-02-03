/**
 * Configuration Schema Validation Tests
 *
 * These tests ensure configuration objects are valid and properly structured.
 * They catch configuration errors at test time rather than deployment time.
 */
import {
  getDevConfig,
  getStagingConfig,
  getProductionConfig,
  getConfig,
  isValidEnvironment,
  baseConfig,
} from '../../config';
import { EnvironmentConfig, Environment } from '../../lib/types/config';

describe('Configuration Schema Validation', () => {
  const testAccountId = '123456789012';
  const testRegion = 'us-west-2';

  describe('Environment validation', () => {
    test('validates known environments', () => {
      expect(isValidEnvironment('dev')).toBe(true);
      expect(isValidEnvironment('staging')).toBe(true);
      expect(isValidEnvironment('production')).toBe(true);
    });

    test('rejects unknown environments', () => {
      expect(isValidEnvironment('unknown')).toBe(false);
      expect(isValidEnvironment('')).toBe(false);
      expect(isValidEnvironment('PRODUCTION')).toBe(false);
    });

    test('getConfig returns correct environment config', () => {
      const devConfig = getConfig('dev', testAccountId, testRegion);
      expect(devConfig.environment).toBe('dev');

      const stagingConfig = getConfig('staging', testAccountId, testRegion);
      expect(stagingConfig.environment).toBe('staging');

      const prodConfig = getConfig('production', testAccountId, testRegion);
      expect(prodConfig.environment).toBe('production');
    });

    test('getConfig throws for invalid environment', () => {
      expect(() => getConfig('invalid' as Environment, testAccountId, testRegion)).toThrow('Unknown environment');
    });
  });

  describe('Base configuration', () => {
    test('has all required Helm chart configs', () => {
      const requiredCharts = [
        'certManager',
        'karpenter',
        'awsLoadBalancerController',
        'metricsServer',
        'externalDns',
        'externalSecrets',
        'reloader',
        'kyverno',
        'velero',
        'goldilocks',
        'awsNodeTerminationHandler',
        'cilium',
        'argocd', // Replaced falco with argocd
        'trivyOperator',
        'loki',
        'tempo',
        'grafanaAgent',
        'promtail',
        'ebsCsiDriver',
      ];

      for (const chart of requiredCharts) {
        expect(baseConfig.helmConfigs).toHaveProperty(chart);
        expect(baseConfig.helmConfigs[chart as keyof typeof baseConfig.helmConfigs]).toHaveProperty('version');
      }
    });

    test('has valid Helm chart versions', () => {
      for (const [_name, config] of Object.entries(baseConfig.helmConfigs)) {
        expect(config.version).toBeDefined();
        expect(typeof config.version).toBe('string');
        expect(config.version.length).toBeGreaterThan(0);
      }
    });

    test('has valid network configuration', () => {
      expect(baseConfig.network.vpcCidr).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/);
      expect(baseConfig.network.natGateways).toBeGreaterThanOrEqual(1);
      expect(baseConfig.network.maxAzs).toBeGreaterThanOrEqual(1);
      expect(baseConfig.network.maxAzs).toBeLessThanOrEqual(6);
    });

    test('has valid cluster configuration', () => {
      expect(baseConfig.cluster.version).toMatch(/^\d+\.\d+$/);
      expect(baseConfig.cluster.name).toBeDefined();
      expect(baseConfig.cluster.logging).toContain('api');
      expect(baseConfig.cluster.logging).toContain('audit');
    });

    test('has valid system node group configuration', () => {
      expect(baseConfig.systemNodeGroup.instanceTypes.length).toBeGreaterThan(0);
      expect(baseConfig.systemNodeGroup.minSize).toBeLessThanOrEqual(baseConfig.systemNodeGroup.desiredSize);
      expect(baseConfig.systemNodeGroup.desiredSize).toBeLessThanOrEqual(baseConfig.systemNodeGroup.maxSize);
      expect(baseConfig.systemNodeGroup.diskSize).toBeGreaterThanOrEqual(20);
    });

    test('has valid Karpenter configuration', () => {
      expect(baseConfig.karpenter.nodePoolName).toBeDefined();
      expect(baseConfig.karpenter.instanceCategories.length).toBeGreaterThan(0);
      expect(baseConfig.karpenter.instanceSizes.length).toBeGreaterThan(0);
      expect(baseConfig.karpenter.cpuLimit).toBeGreaterThan(0);
      expect(baseConfig.karpenter.memoryLimitGi).toBeGreaterThan(0);
      expect(['WhenEmpty', 'WhenEmptyOrUnderutilized']).toContain(baseConfig.karpenter.consolidationPolicy);
    });
  });

  describe('Dev configuration', () => {
    let config: EnvironmentConfig;

    beforeEach(() => {
      config = getDevConfig(testAccountId, testRegion);
    });

    test('has correct environment identifier', () => {
      expect(config.environment).toBe('dev');
    });

    test('has correct AWS configuration', () => {
      expect(config.aws.accountId).toBe(testAccountId);
      expect(config.aws.region).toBe(testRegion);
    });

    test('has cost-optimized settings', () => {
      // Dev should have fewer NAT gateways
      expect(config.network.natGateways).toBeLessThanOrEqual(1);

      // Dev should have multi-AZ NAT disabled
      expect(config.features.multiAzNat).toBe(false);

      // Dev should have Velero backups disabled
      expect(config.features.veleroBackups).toBe(false);

      // Dev should have ArgoCD enabled
      expect(config.features.argocdEnabled).toBe(true);
    });

    test('has reduced replicas for development', () => {
      // Kyverno should have reduced replicas in dev
      const kyvernoValues = config.helmConfigs.kyverno.values as Record<string, any> | undefined;
      const admissionController = kyvernoValues?.admissionController as Record<string, any> | undefined;
      expect(admissionController?.replicas).toBeLessThanOrEqual(2);
    });

    test('has environment tag', () => {
      expect(config.tags.environment).toBe('dev');
    });
  });

  describe('Staging configuration', () => {
    let config: EnvironmentConfig;

    beforeEach(() => {
      config = getStagingConfig(testAccountId, testRegion);
    });

    test('has correct environment identifier', () => {
      expect(config.environment).toBe('staging');
    });

    test('has production-like settings', () => {
      // Staging should have multi-AZ NAT
      expect(config.features.multiAzNat).toBe(true);

      // Staging should have Trivy admission
      expect(config.features.trivyAdmission).toBe(true);
    });

    test('has environment tag', () => {
      expect(config.tags.environment).toBe('staging');
    });
  });

  describe('Production configuration', () => {
    let config: EnvironmentConfig;

    beforeEach(() => {
      config = getProductionConfig(testAccountId, testRegion);
    });

    test('has correct environment identifier', () => {
      expect(config.environment).toBe('production');
    });

    test('has full security settings', () => {
      // Production should have Trivy admission
      expect(config.features.trivyAdmission).toBe(true);

      // Production should have ArgoCD enabled
      expect(config.features.argocdEnabled).toBe(true);

      // Production should have private endpoint only
      expect(config.cluster.privateEndpoint).toBe(true);
    });

    test('has high availability settings', () => {
      // Production should have multiple NAT gateways
      expect(config.network.natGateways).toBeGreaterThanOrEqual(2);

      // Production should have multi-AZ NAT
      expect(config.features.multiAzNat).toBe(true);

      // Production should have backups enabled
      expect(config.features.veleroBackups).toBe(true);
    });

    test('has environment tag', () => {
      expect(config.tags.environment).toBe('production');
    });
  });

  describe('Configuration consistency', () => {
    const configs = [
      { name: 'dev', config: getDevConfig(testAccountId, testRegion) },
      { name: 'staging', config: getStagingConfig(testAccountId, testRegion) },
      { name: 'production', config: getProductionConfig(testAccountId, testRegion) },
    ];

    test.each(configs)('$name has all required properties', ({ config }) => {
      // Required top-level properties
      expect(config).toHaveProperty('environment');
      expect(config).toHaveProperty('aws');
      expect(config).toHaveProperty('features');
      expect(config).toHaveProperty('network');
      expect(config).toHaveProperty('cluster');
      expect(config).toHaveProperty('systemNodeGroup');
      expect(config).toHaveProperty('karpenter');
      expect(config).toHaveProperty('helmConfigs');
      expect(config).toHaveProperty('observability');
      expect(config).toHaveProperty('backup');
      expect(config).toHaveProperty('dns');
      expect(config).toHaveProperty('security');
      expect(config).toHaveProperty('tags');
    });

    test.each(configs)('$name has valid VPC CIDR', ({ config }) => {
      const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
      expect(config.network.vpcCidr).toMatch(cidrRegex);
    });

    test.each(configs)('$name has valid Kubernetes version', ({ config }) => {
      const versionRegex = /^\d+\.\d+$/;
      expect(config.cluster.version).toMatch(versionRegex);
    });

    test.each(configs)('$name has valid observability retention', ({ config }) => {
      expect(config.observability.lokiRetentionDays).toBeGreaterThan(0);
      expect(config.observability.tempoRetentionDays).toBeGreaterThan(0);
    });
  });

  describe('Security configuration validation', () => {
    test.each([
      ['dev', getDevConfig(testAccountId, testRegion)],
      ['staging', getStagingConfig(testAccountId, testRegion)],
      ['production', getProductionConfig(testAccountId, testRegion)],
    ])('%s has valid severity threshold', (_, config) => {
      const validThresholds = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      expect(validThresholds).toContain(config.security.trivySeverityThreshold);
    });

    test('production has stricter severity threshold', () => {
      const prodConfig = getProductionConfig(testAccountId, testRegion);
      expect(['CRITICAL', 'HIGH']).toContain(prodConfig.security.trivySeverityThreshold);
    });
  });

  describe('ArgoCD SSO configuration', () => {
    test('dev has SSO enabled with required fields', () => {
      const config = getDevConfig(testAccountId, testRegion);
      expect(config.argocd?.ssoEnabled).toBe(true);
      expect(config.argocd?.githubOrg).toBeDefined();
      expect(config.argocd?.oauthSecretName).toBeDefined();
      expect(config.argocd?.hostname).toBeDefined();
      expect(config.argocd?.rbacDefaultPolicy).toBe('role:admin');
    });

    test('staging has SSO disabled', () => {
      const config = getStagingConfig(testAccountId, testRegion);
      expect(config.argocd?.ssoEnabled).toBe(false);
    });

    test('production has SSO disabled', () => {
      const config = getProductionConfig(testAccountId, testRegion);
      expect(config.argocd?.ssoEnabled).toBe(false);
    });

    test('SSO requires hostname when enabled', () => {
      const config = getDevConfig(testAccountId, testRegion);
      if (config.argocd?.ssoEnabled) {
        expect(config.argocd.hostname).toBeTruthy();
      }
    });

    test('SSO requires githubOrg and oauthSecretName when enabled', () => {
      const config = getDevConfig(testAccountId, testRegion);
      if (config.argocd?.ssoEnabled) {
        expect(config.argocd.githubOrg).toBeTruthy();
        expect(config.argocd.oauthSecretName).toBeTruthy();
      }
    });
  });

  describe('Helm version format validation', () => {
    const config = getDevConfig(testAccountId, testRegion);

    test('all Helm charts have semver-like versions', () => {
      // Semver or semver with v prefix
      const semverRegex = /^v?\d+\.\d+\.\d+(-[\w.]+)?$/;

      for (const [_name, chartConfig] of Object.entries(config.helmConfigs)) {
        expect(chartConfig.version).toMatch(semverRegex);
      }
    });
  });
});
