import { EnvironmentConfig, Environment } from '../lib/types/config';
import { getDevConfig } from './dev';
import { getStagingConfig } from './staging';
import { getProductionConfig } from './production';

export { baseConfig } from './base';
export { getDevConfig } from './dev';
export { getStagingConfig } from './staging';
export { getProductionConfig } from './production';

/**
 * Get configuration for the specified environment
 */
export function getConfig(environment: Environment, accountId: string, region: string): EnvironmentConfig {
  switch (environment) {
    case 'dev':
      return getDevConfig(accountId, region);
    case 'staging':
      return getStagingConfig(accountId, region);
    case 'production':
      return getProductionConfig(accountId, region);
    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
}

/**
 * Validate environment string
 */
export function isValidEnvironment(env: string): env is Environment {
  return ['dev', 'staging', 'production'].includes(env);
}
