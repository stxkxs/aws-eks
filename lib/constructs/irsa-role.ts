import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';

/**
 * Properties for IrsaRole construct
 */
export interface IrsaRoleProps {
  /** The EKS cluster */
  readonly cluster: eks.ICluster;

  /** Service account name */
  readonly serviceAccount: string;

  /** Kubernetes namespace */
  readonly namespace: string;

  /** IAM policy statements to attach */
  readonly policyStatements?: iam.PolicyStatement[];

  /** Managed policy ARNs to attach */
  readonly managedPolicies?: iam.IManagedPolicy[];

  /** Role description */
  readonly description?: string;
}

/**
 * A construct that creates an IAM role for Kubernetes service accounts (IRSA).
 *
 * Uses the OIDC-based IAM Roles for Service Accounts (IRSA) mechanism to
 * associate an IAM role with a Kubernetes service account via the cluster's
 * OIDC provider.
 *
 * @remarks
 * **IRSA vs Pod Identity tradeoffs:**
 *
 * - **IRSA** (this construct) uses the cluster's OIDC provider to federate
 *   Kubernetes service account tokens into IAM. It is widely supported across
 *   all EKS versions and does not require an additional addon. However, it
 *   has a tighter coupling to the cluster OIDC issuer URL, making cross-cluster
 *   role sharing more complex, and the trust policy size can become a limiting
 *   factor when many service accounts share the same role.
 *
 * - **Pod Identity** ({@link PodIdentityRole}) uses the EKS Pod Identity Agent
 *   addon (available on EKS 1.24+). It simplifies trust policies by using a
 *   single service principal (`pods.eks.amazonaws.com`) and supports
 *   `sts:TagSession` for attribute-based access control. It requires the
 *   `eks-pod-identity-agent` addon to be installed on the cluster.
 *
 * Use `IrsaRole` when you need broad compatibility or do not want to install
 * the Pod Identity Agent addon. Use `PodIdentityRole` on EKS 1.24+ for
 * simpler IAM trust policies and ABAC support.
 *
 * @see https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html
 * @see {@link PodIdentityRole} for the modern Pod Identity alternative
 *
 * @example
 * const role = new IrsaRole(this, 'ExternalDnsRole', {
 *   cluster: props.cluster,
 *   serviceAccount: 'external-dns',
 *   namespace: 'external-dns',
 *   policyStatements: [
 *     new iam.PolicyStatement({
 *       actions: ['route53:ChangeResourceRecordSets'],
 *       resources: ['arn:aws:route53:::hostedzone/*'],
 *     }),
 *   ],
 * });
 */
export class IrsaRole extends Construct {
  /** The IAM role */
  public readonly role: iam.IRole;

  /** The service account */
  public readonly serviceAccount: eks.ServiceAccount;

  /**
   * Creates a new IRSA role and its associated Kubernetes service account.
   *
   * @param scope - The CDK construct scope
   * @param id - The construct identifier
   * @param props - Configuration properties for the IRSA role
   */
  constructor(scope: Construct, id: string, props: IrsaRoleProps) {
    super(scope, id);

    // Create the service account with IRSA
    this.serviceAccount = new eks.ServiceAccount(this, 'ServiceAccount', {
      cluster: props.cluster,
      name: props.serviceAccount,
      namespace: props.namespace,
    });

    this.role = this.serviceAccount.role;

    // Add policy statements
    if (props.policyStatements) {
      for (const statement of props.policyStatements) {
        this.role.addToPrincipalPolicy(statement);
      }
    }

    // Add managed policies
    if (props.managedPolicies) {
      for (const policy of props.managedPolicies) {
        this.role.addManagedPolicy(policy);
      }
    }
  }
}

/**
 * Properties for creating an IRSA role with Pod Identity
 */
export interface PodIdentityRoleProps {
  /** The EKS cluster */
  readonly cluster: eks.ICluster;

  /** Service account name */
  readonly serviceAccount: string;

  /** Kubernetes namespace */
  readonly namespace: string;

  /** IAM policy statements to attach */
  readonly policyStatements?: iam.PolicyStatement[];

  /** Managed policy ARNs to attach */
  readonly managedPolicies?: iam.IManagedPolicy[];
}

/**
 * Creates an IAM role using EKS Pod Identity (modern IRSA replacement).
 *
 * Pod Identity is the recommended approach for EKS 1.24+. It creates the
 * IAM role with a `pods.eks.amazonaws.com` trust principal and registers
 * a `PodIdentityAssociation` CloudFormation resource to bind it to a
 * specific namespace and service account.
 *
 * @remarks
 * This construct requires the **EKS Pod Identity Agent** addon to be installed
 * on the target cluster. Without it, pods will not be able to assume the role.
 *
 * Pod Identity offers several advantages over OIDC-based IRSA:
 * - Simpler trust policies (no per-cluster OIDC issuer in the condition).
 * - Native `sts:TagSession` support for attribute-based access control (ABAC).
 * - Easier cross-account role sharing.
 *
 * @see https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html
 * @see {@link IrsaRole} for the OIDC-based alternative
 *
 * @example
 * const role = new PodIdentityRole(this, 'S3AccessRole', {
 *   cluster: props.cluster,
 *   serviceAccount: 'my-app',
 *   namespace: 'default',
 *   policyStatements: [
 *     new iam.PolicyStatement({
 *       actions: ['s3:GetObject'],
 *       resources: ['arn:aws:s3:::my-bucket/*'],
 *     }),
 *   ],
 * });
 */
export class PodIdentityRole extends Construct {
  /** The IAM role */
  public readonly role: iam.Role;

  /**
   * Creates a new Pod Identity role and registers the association with EKS.
   *
   * @param scope - The CDK construct scope
   * @param id - The construct identifier
   * @param props - Configuration properties for the Pod Identity role
   */
  constructor(scope: Construct, id: string, props: PodIdentityRoleProps) {
    super(scope, id);

    // Create role with Pod Identity trust policy
    this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('pods.eks.amazonaws.com'),
      description: `Pod Identity role for ${props.namespace}/${props.serviceAccount}`,
    });

    // Add trust policy for the specific service account
    this.role.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('pods.eks.amazonaws.com')],
        actions: ['sts:AssumeRole', 'sts:TagSession'],
      }),
    );

    // Add policy statements
    if (props.policyStatements) {
      const policy = new iam.Policy(this, 'Policy', {
        statements: props.policyStatements,
      });
      this.role.attachInlinePolicy(policy);
    }

    // Add managed policies
    if (props.managedPolicies) {
      for (const policy of props.managedPolicies) {
        this.role.addManagedPolicy(policy);
      }
    }

    // Create the Pod Identity association
    // Note: This requires the EKS Pod Identity Agent addon to be installed
    new cdk.CfnResource(this, 'PodIdentityAssociation', {
      type: 'AWS::EKS::PodIdentityAssociation',
      properties: {
        ClusterName: props.cluster.clusterName,
        Namespace: props.namespace,
        ServiceAccount: props.serviceAccount,
        RoleArn: this.role.roleArn,
      },
    });
  }
}
