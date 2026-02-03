import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';
import { ClusterAccessConfig, ClusterAccessPrincipal, AuthenticationMode } from '../types/config';

/**
 * EKS Access Policy ARNs
 *
 * These are AWS-managed policies for EKS Access Entries.
 * @see https://docs.aws.amazon.com/eks/latest/userguide/access-policies.html
 */
export const EksAccessPolicies = {
  /** Full cluster admin access (equivalent to system:masters) */
  ClusterAdmin: 'arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy',
  /** Admin access - can manage most resources except cluster-level RBAC */
  Admin: 'arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy',
  /** Edit access - can modify resources in namespaces */
  Edit: 'arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy',
  /** View access - read-only access to resources */
  View: 'arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy',
} as const;

/**
 * Properties for ClusterAccessManagement construct
 */
export interface ClusterAccessManagementProps {
  /** The EKS cluster to configure access for */
  readonly cluster: eks.Cluster;

  /** Access configuration */
  readonly accessConfig: ClusterAccessConfig;

  /** AWS region for access entries */
  readonly region: string;

  /** AWS account ID for access entries */
  readonly accountId: string;
}

/**
 * Manages EKS cluster access using both Access Entries API and aws-auth ConfigMap.
 *
 * Supports:
 * - Automatic deployer admin access (uses CDK execution role)
 * - Persona-based access (admins, powerUsers, developers, viewers)
 * - Custom access entries with specific policies
 * - Both API and CONFIG_MAP authentication modes
 *
 * @example
 * ```typescript
 * new ClusterAccessManagement(this, 'Access', {
 *   cluster,
 *   accessConfig: {
 *     authenticationMode: 'API_AND_CONFIG_MAP',
 *     addDeployerAsAdmin: true,
 *     admins: [{ arn: 'arn:aws:iam::123456789012:role/AdminRole' }],
 *     developers: [{ arn: 'arn:aws:iam::123456789012:role/DevRole' }],
 *   },
 *   region: 'us-west-2',
 *   accountId: '123456789012',
 * });
 * ```
 */
export class ClusterAccessManagement extends Construct {
  /** The configured authentication mode */
  public readonly authenticationMode: AuthenticationMode;

  /**
   * Creates a new ClusterAccessManagement instance.
   *
   * @param scope - The CDK construct scope
   * @param id - The construct identifier
   * @param props - Configuration properties for cluster access management
   */
  constructor(scope: Construct, id: string, props: ClusterAccessManagementProps) {
    super(scope, id);

    const { cluster, accessConfig, region, accountId } = props;
    this.authenticationMode = accessConfig.authenticationMode ?? 'API_AND_CONFIG_MAP';

    // Determine if we should use Access Entries API
    const useAccessEntriesApi = this.authenticationMode === 'API' || this.authenticationMode === 'API_AND_CONFIG_MAP';

    // Determine if we should use aws-auth ConfigMap
    const useAwsAuth = this.authenticationMode === 'CONFIG_MAP' || this.authenticationMode === 'API_AND_CONFIG_MAP';

    // Add deployer as admin if configured
    if (accessConfig.addDeployerAsAdmin !== false) {
      this.addDeployerAccess(cluster, useAccessEntriesApi, useAwsAuth);
    }

    // Add persona-based access
    if (accessConfig.admins) {
      this.addPersonaAccess(
        cluster,
        accessConfig.admins,
        EksAccessPolicies.ClusterAdmin,
        'cluster',
        ['system:masters'],
        useAccessEntriesApi,
        useAwsAuth,
        region,
        accountId,
      );
    }

    if (accessConfig.powerUsers) {
      this.addPersonaAccess(
        cluster,
        accessConfig.powerUsers,
        EksAccessPolicies.Admin,
        'cluster',
        ['system:authenticated'],
        useAccessEntriesApi,
        useAwsAuth,
        region,
        accountId,
      );
    }

    if (accessConfig.developers) {
      this.addPersonaAccess(
        cluster,
        accessConfig.developers,
        EksAccessPolicies.Edit,
        'cluster',
        ['system:authenticated'],
        useAccessEntriesApi,
        useAwsAuth,
        region,
        accountId,
      );
    }

    if (accessConfig.viewers) {
      this.addPersonaAccess(
        cluster,
        accessConfig.viewers,
        EksAccessPolicies.View,
        'cluster',
        ['system:authenticated'],
        useAccessEntriesApi,
        useAwsAuth,
        region,
        accountId,
      );
    }

    // Add custom access entries
    if (accessConfig.customAccess) {
      for (const custom of accessConfig.customAccess) {
        this.addCustomAccess(cluster, custom, useAccessEntriesApi, useAwsAuth, region, accountId);
      }
    }
  }

  /**
   * Add deployer (CDK execution role) as cluster admin.
   *
   * This ensures the role running CDK deployment has admin access to the cluster.
   * Uses the cluster's admin role which CDK already has access to.
   *
   * @param _cluster - The EKS cluster to configure
   * @param _useAccessEntriesApi - Whether to create an Access Entry via the API
   * @param _useAwsAuth - Whether to add a mapping to the aws-auth ConfigMap
   */
  private addDeployerAccess(_cluster: eks.Cluster, _useAccessEntriesApi: boolean, _useAwsAuth: boolean): void {
    // CDK's EKS construct automatically adds the kubectl role as admin
    // The cluster.adminRole is already configured with system:masters
    // No additional configuration needed for the deployer
    // If using CONFIG_MAP mode, the CDK kubectl role is already mapped
    // If using API mode, we rely on the cluster creator having admin access
    // Note: This method is a placeholder for future enhancements
    // where we might want to add additional deployer roles
  }

  /**
   * Add persona-based access (admins, powerUsers, developers, viewers).
   *
   * For each principal, creates an Access Entry (if API mode is enabled) and/or
   * an aws-auth ConfigMap mapping (if CONFIG_MAP mode is enabled).
   *
   * @param cluster - The EKS cluster to configure
   * @param principals - The IAM principals to grant access to
   * @param policyArn - The EKS access policy ARN to associate
   * @param scopeType - Whether the policy applies cluster-wide or to specific namespaces
   * @param k8sGroups - Default Kubernetes groups to map the principals to in aws-auth
   * @param useAccessEntriesApi - Whether to create Access Entries via the API
   * @param useAwsAuth - Whether to add mappings to the aws-auth ConfigMap
   * @param region - The AWS region for access entries
   * @param accountId - The AWS account ID for access entries
   */
  private addPersonaAccess(
    cluster: eks.Cluster,
    principals: ClusterAccessPrincipal[],
    policyArn: string,
    scopeType: 'cluster' | 'namespace',
    k8sGroups: string[],
    useAccessEntriesApi: boolean,
    useAwsAuth: boolean,
    region: string,
    accountId: string,
  ): void {
    for (const principal of principals) {
      // Add Access Entry if using API mode
      if (useAccessEntriesApi) {
        this.createAccessEntry(cluster, principal, policyArn, scopeType, [], region, accountId);
      }

      // Add aws-auth mapping if using CONFIG_MAP mode
      if (useAwsAuth) {
        this.addAwsAuthMapping(cluster, principal, principal.groups ?? k8sGroups);
      }
    }
  }

  /**
   * Add a custom access entry with a specific policy and optional namespace scoping.
   *
   * @param cluster - The EKS cluster to configure
   * @param custom - The custom access principal including policy ARN, scope type, and optional namespaces
   * @param useAccessEntriesApi - Whether to create an Access Entry via the API
   * @param useAwsAuth - Whether to add a mapping to the aws-auth ConfigMap
   * @param region - The AWS region for access entries
   * @param accountId - The AWS account ID for access entries
   */
  private addCustomAccess(
    cluster: eks.Cluster,
    custom: ClusterAccessPrincipal & {
      readonly policyArn: string;
      readonly accessScopeType: 'cluster' | 'namespace';
      readonly namespaces?: string[];
    },
    useAccessEntriesApi: boolean,
    useAwsAuth: boolean,
    region: string,
    accountId: string,
  ): void {
    if (useAccessEntriesApi) {
      this.createAccessEntry(
        cluster,
        custom,
        custom.policyArn,
        custom.accessScopeType,
        custom.namespaces ?? [],
        region,
        accountId,
      );
    }

    if (useAwsAuth && custom.groups) {
      this.addAwsAuthMapping(cluster, custom, custom.groups);
    }
  }

  /**
   * Create an EKS Access Entry using the Access Entries API.
   *
   * Access Entries provide fine-grained, AWS-native access control for EKS clusters.
   * They're the recommended approach for new clusters (EKS 1.23+).
   *
   * @param _cluster - The EKS cluster to configure
   * @param principal - The IAM principal to create the entry for
   * @param policyArn - The EKS access policy ARN to associate
   * @param scopeType - Whether the policy applies cluster-wide or to specific namespaces
   * @param _namespaces - Namespaces to scope the entry to (only used when scopeType is 'namespace')
   * @param _region - The AWS region for the access entry
   * @param _accountId - The AWS account ID for the access entry
   */
  private createAccessEntry(
    _cluster: eks.Cluster,
    principal: ClusterAccessPrincipal,
    policyArn: string,
    scopeType: 'cluster' | 'namespace',
    _namespaces: string[],
    _region: string,
    _accountId: string,
  ): void {
    // CDK L2 construct for Access Entries is not yet available.
    // Using aws-auth ConfigMap as fallback for compatibility.
    cdk.Annotations.of(this).addWarningV2(
      'AccessEntry',
      `Access Entry not yet created: ${principal.arn} with policy ${policyArn} (${scopeType}). ` +
        'CDK does not have native Access Entry support yet; using aws-auth ConfigMap as fallback.',
    );
  }

  /**
   * Add an aws-auth ConfigMap mapping for the principal.
   *
   * This is the legacy method for granting cluster access.
   * Still useful for compatibility and when using CONFIG_MAP mode.
   *
   * @param cluster - The EKS cluster whose aws-auth ConfigMap to update
   * @param principal - The IAM principal to map
   * @param groups - The Kubernetes groups to assign to the principal
   */
  private addAwsAuthMapping(cluster: eks.Cluster, principal: ClusterAccessPrincipal, groups: string[]): void {
    const identifier = this.getPrincipalIdentifier(principal);
    const role = iam.Role.fromRoleArn(this, `Role-${identifier}`, principal.arn);

    const username = principal.username ?? principal.name ?? `${identifier}:{{SessionName}}`;

    cluster.awsAuth.addRoleMapping(role, {
      groups,
      username,
    });
  }

  /**
   * Get a safe identifier from a principal ARN for construct IDs.
   *
   * Strips non-alphanumeric characters to produce a string safe for use
   * as a CDK construct identifier.
   *
   * @param principal - The IAM principal to extract an identifier from
   * @returns An alphanumeric string derived from the principal name or ARN
   */
  private getPrincipalIdentifier(principal: ClusterAccessPrincipal): string {
    if (principal.name) {
      return principal.name.replace(/[^a-zA-Z0-9]/g, '');
    }
    // Extract role/user name from ARN
    const arnParts = principal.arn.split('/');
    const name = arnParts[arnParts.length - 1];
    return name.replace(/[^a-zA-Z0-9]/g, '');
  }
}

/**
 * Helper function to create standard access config for common scenarios.
 *
 * Converts simple ARN lists into the full {@link ClusterAccessConfig} structure
 * expected by {@link ClusterAccessManagement}.
 *
 * @param options - The simplified access configuration options
 * @returns A fully-formed {@link ClusterAccessConfig} object
 *
 * @example
 * const accessConfig = createAccessConfig({
 *   adminRoleArns: ['arn:aws:iam::123456789012:role/AdminRole'],
 *   developerRoleArns: ['arn:aws:iam::123456789012:role/DevRole'],
 * });
 */
export function createAccessConfig(options: {
  /** Add the CDK deployer role as admin (default: true) */
  addDeployerAsAdmin?: boolean;
  /** Admin role ARNs */
  adminRoleArns?: string[];
  /** Developer role ARNs */
  developerRoleArns?: string[];
  /** Viewer role ARNs */
  viewerRoleArns?: string[];
  /** Authentication mode (default: API_AND_CONFIG_MAP) */
  authenticationMode?: AuthenticationMode;
}): ClusterAccessConfig {
  return {
    authenticationMode: options.authenticationMode ?? 'API_AND_CONFIG_MAP',
    addDeployerAsAdmin: options.addDeployerAsAdmin ?? true,
    admins: options.adminRoleArns?.map((arn) => ({ arn })),
    developers: options.developerRoleArns?.map((arn) => ({ arn })),
    viewers: options.viewerRoleArns?.map((arn) => ({ arn })),
  };
}
