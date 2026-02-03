import { getDevConfig, getProductionConfig, getConfig, isValidEnvironment, baseConfig } from '../../config';
import { deepMerge } from '../../lib/utils';
import { DeepPartial } from '../../lib/types/config';

describe('Configuration System', () => {
  const testAccountId = '123456789012';
  const testRegion = 'us-west-2';

  describe('deepMerge', () => {
    test('merges simple objects', () => {
      const base = { a: 1, b: 2 };
      const override = { b: 3 };
      const result = deepMerge(base, override);
      expect(result).toEqual({ a: 1, b: 3 });
    });

    test('merges nested objects', () => {
      const base = { a: { b: 1, c: 2 }, d: 3 };
      const override: DeepPartial<typeof base> = { a: { b: 10 } };
      const result = deepMerge(base, override);
      expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3 });
    });

    test('preserves unmodified nested values', () => {
      const base = {
        level1: {
          level2: {
            value1: 'original',
            value2: 'also-original',
          },
        },
      };
      const override: DeepPartial<typeof base> = {
        level1: { level2: { value1: 'changed' } },
      };
      const result = deepMerge(base, override);
      expect(result.level1.level2.value1).toBe('changed');
      expect(result.level1.level2.value2).toBe('also-original');
    });

    test('replaces arrays instead of merging', () => {
      const base = { items: [1, 2, 3] };
      const override: DeepPartial<typeof base> = { items: [4, 5] };
      const result = deepMerge(base, override);
      expect(result.items).toEqual([4, 5]);
    });

    test('handles undefined values in override', () => {
      const base = { a: 1, b: 2 };
      const override: DeepPartial<typeof base> = { a: undefined };
      const result = deepMerge(base, override);
      expect(result.a).toBe(1); // undefined doesn't override
      expect(result.b).toBe(2);
    });

    test('handles null values in override', () => {
      const base = { a: 1, b: 'test' as string | null };
      const override: DeepPartial<typeof base> = { b: null };
      const result = deepMerge(base, override);
      expect(result.b).toBeNull();
    });
  });

  describe('baseConfig', () => {
    test('has all required feature flags', () => {
      expect(baseConfig.features).toHaveProperty('multiAzNat');
      expect(baseConfig.features).toHaveProperty('trivyAdmission');
      expect(baseConfig.features).toHaveProperty('veleroBackups');
      expect(baseConfig.features).toHaveProperty('goldilocks');
      expect(baseConfig.features).toHaveProperty('costAllocationTags');
      expect(baseConfig.features).toHaveProperty('argocdEnabled');
      expect(baseConfig.features).toHaveProperty('backstageEnabled');
    });

    test('has valid network configuration', () => {
      expect(baseConfig.network.vpcCidr).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
      expect(baseConfig.network.natGateways).toBeGreaterThanOrEqual(1);
      expect(baseConfig.network.maxAzs).toBeGreaterThanOrEqual(1);
    });

    test('has valid cluster configuration', () => {
      expect(baseConfig.cluster.version).toMatch(/^\d+\.\d+$/);
      expect(baseConfig.cluster.logging).toContain('api');
      expect(baseConfig.cluster.logging).toContain('audit');
    });

    test('has all required helm configs with versions', () => {
      expect(baseConfig.helmConfigs.certManager.version).toBeDefined();
      expect(baseConfig.helmConfigs.karpenter.version).toBeDefined();
      expect(baseConfig.helmConfigs.cilium.version).toBeDefined();
      expect(baseConfig.helmConfigs.argocd.version).toBeDefined();
      expect(baseConfig.helmConfigs.kyverno.version).toBeDefined();
      expect(baseConfig.helmConfigs.loki.version).toBeDefined();
      expect(baseConfig.helmConfigs.tempo.version).toBeDefined();
    });

    test('has production-ready defaults for helm configs', () => {
      // cert-manager should have HA replicas
      expect(baseConfig.helmConfigs.certManager.values?.replicaCount).toBe(2);
      // karpenter should have replicas
      expect(baseConfig.helmConfigs.karpenter.values?.replicas).toBe(2);
      // kyverno should have HA for admission controller
      expect((baseConfig.helmConfigs.kyverno.values?.admissionController as any)?.replicas).toBe(3);
    });
  });

  describe('devConfig', () => {
    const devConfig = getDevConfig(testAccountId, testRegion);

    test('sets environment to dev', () => {
      expect(devConfig.environment).toBe('dev');
    });

    test('sets AWS account and region', () => {
      expect(devConfig.aws.accountId).toBe(testAccountId);
      expect(devConfig.aws.region).toBe(testRegion);
    });

    test('has cost optimizations', () => {
      expect(devConfig.network.natGateways).toBe(1);
      expect(devConfig.features.multiAzNat).toBe(false);
      expect(devConfig.features.veleroBackups).toBe(false);
      expect(devConfig.network.flowLogs).toBe(false);
    });

    test('has relaxed security settings', () => {
      expect(devConfig.features.trivyAdmission).toBe(false);
    });

    test('has smaller node group', () => {
      expect(devConfig.systemNodeGroup.maxSize).toBeLessThanOrEqual(4);
      expect(devConfig.systemNodeGroup.diskSize).toBeLessThan(100);
    });

    test('has shorter retention periods', () => {
      expect(devConfig.observability.lokiRetentionDays).toBeLessThan(30);
      expect(devConfig.observability.tempoRetentionDays).toBeLessThan(7);
    });

    test('has lower karpenter limits', () => {
      expect(devConfig.karpenter.cpuLimit).toBe(50);
      expect(devConfig.karpenter.memoryLimitGi).toBe(100);
    });
  });

  describe('productionConfig', () => {
    const prodConfig = getProductionConfig(testAccountId, testRegion);

    test('sets environment to production', () => {
      expect(prodConfig.environment).toBe('production');
    });

    test('has full redundancy', () => {
      expect(prodConfig.network.natGateways).toBe(3);
      expect(prodConfig.features.multiAzNat).toBe(true);
      expect(prodConfig.network.flowLogs).toBe(true);
    });

    test('has full security enabled', () => {
      expect(prodConfig.features.trivyAdmission).toBe(true);
      expect(prodConfig.features.argocdEnabled).toBe(true);
    });

    test('has private-only cluster endpoint', () => {
      expect(prodConfig.cluster.publicEndpoint).toBe(false);
      expect(prodConfig.cluster.privateEndpoint).toBe(true);
    });

    test('has larger node group', () => {
      expect(prodConfig.systemNodeGroup.minSize).toBeGreaterThanOrEqual(3);
      expect(prodConfig.systemNodeGroup.maxSize).toBeGreaterThanOrEqual(10);
    });

    test('has longer retention periods', () => {
      expect(prodConfig.observability.lokiRetentionDays).toBe(90);
      expect(prodConfig.observability.tempoRetentionDays).toBe(30);
    });

    test('has compliance tags', () => {
      expect(prodConfig.tags).toHaveProperty('compliance');
      expect(prodConfig.tags.compliance).toContain('soc2');
    });

    test('has higher karpenter limits', () => {
      expect(prodConfig.karpenter.cpuLimit).toBe(200);
      expect(prodConfig.karpenter.memoryLimitGi).toBe(400);
    });
  });

  describe('getConfig', () => {
    test('returns dev config for dev environment', () => {
      const config = getConfig('dev', testAccountId, testRegion);
      expect(config.environment).toBe('dev');
    });

    test('returns staging config for staging environment', () => {
      const config = getConfig('staging', testAccountId, testRegion);
      expect(config.environment).toBe('staging');
    });

    test('returns production config for production environment', () => {
      const config = getConfig('production', testAccountId, testRegion);
      expect(config.environment).toBe('production');
    });

    test('throws for unknown environment', () => {
      expect(() => getConfig('unknown' as any, testAccountId, testRegion)).toThrow();
    });
  });

  describe('isValidEnvironment', () => {
    test('returns true for valid environments', () => {
      expect(isValidEnvironment('dev')).toBe(true);
      expect(isValidEnvironment('staging')).toBe(true);
      expect(isValidEnvironment('production')).toBe(true);
    });

    test('returns false for invalid environments', () => {
      expect(isValidEnvironment('test')).toBe(false);
      expect(isValidEnvironment('prod')).toBe(false);
      expect(isValidEnvironment('')).toBe(false);
    });
  });
});
