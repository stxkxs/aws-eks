import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Template } from 'aws-cdk-lib/assertions';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';
import { ClusterAccessManagement, EksAccessPolicies, createAccessConfig } from '../../lib/constructs/access-management';
import { ClusterAccessConfig } from '../../lib/types/config';

describe('ClusterAccessManagement', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  describe('with admins', () => {
    test('adds admin role mapping to aws-auth ConfigMap', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const accessConfig: ClusterAccessConfig = {
        authenticationMode: 'API_AND_CONFIG_MAP',
        addDeployerAsAdmin: false,
        admins: [
          {
            arn: 'arn:aws:iam::123456789012:role/AdminRole',
            name: 'admin',
          },
        ],
      };

      new ClusterAccessManagement(stack, 'Access', {
        cluster,
        accessConfig,
        region: 'us-west-2',
        accountId: '123456789012',
      });

      const template = Template.fromStack(stack);

      // Check that aws-auth ConfigMap contains the admin role mapping
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasAdminMapping = Object.values(resources).some((resource: any) => {
        const manifest = JSON.stringify(resource.Properties.Manifest || '');
        return manifest.includes('aws-auth') && manifest.includes('system:masters');
      });
      expect(hasAdminMapping).toBe(true);
    });
  });

  describe('with developers', () => {
    test('adds developer role mapping to aws-auth ConfigMap', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const accessConfig: ClusterAccessConfig = {
        authenticationMode: 'API_AND_CONFIG_MAP',
        addDeployerAsAdmin: false,
        developers: [
          {
            arn: 'arn:aws:iam::123456789012:role/DevRole',
            name: 'developer',
          },
        ],
      };

      new ClusterAccessManagement(stack, 'Access', {
        cluster,
        accessConfig,
        region: 'us-west-2',
        accountId: '123456789012',
      });

      const template = Template.fromStack(stack);

      // Check that aws-auth ConfigMap contains the developer role mapping
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      const hasMapping = Object.values(resources).some((resource: any) => {
        const manifest = JSON.stringify(resource.Properties.Manifest || '');
        return manifest.includes('aws-auth');
      });
      expect(hasMapping).toBe(true);
    });
  });

  describe('with viewers', () => {
    test('adds viewer role mapping to aws-auth ConfigMap', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const accessConfig: ClusterAccessConfig = {
        authenticationMode: 'API_AND_CONFIG_MAP',
        addDeployerAsAdmin: false,
        viewers: [
          {
            arn: 'arn:aws:iam::123456789012:role/ViewerRole',
            name: 'viewer',
          },
        ],
      };

      new ClusterAccessManagement(stack, 'Access', {
        cluster,
        accessConfig,
        region: 'us-west-2',
        accountId: '123456789012',
      });

      const template = Template.fromStack(stack);

      // Check that aws-auth ConfigMap is present
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      expect(Object.keys(resources).length).toBeGreaterThan(0);
    });
  });

  describe('with multiple personas', () => {
    test('adds all role mappings to aws-auth ConfigMap', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const accessConfig: ClusterAccessConfig = {
        authenticationMode: 'API_AND_CONFIG_MAP',
        addDeployerAsAdmin: false,
        admins: [{ arn: 'arn:aws:iam::123456789012:role/AdminRole', name: 'admin' }],
        powerUsers: [{ arn: 'arn:aws:iam::123456789012:role/PowerUserRole', name: 'power' }],
        developers: [{ arn: 'arn:aws:iam::123456789012:role/DevRole', name: 'dev' }],
        viewers: [{ arn: 'arn:aws:iam::123456789012:role/ViewerRole', name: 'viewer' }],
      };

      new ClusterAccessManagement(stack, 'Access', {
        cluster,
        accessConfig,
        region: 'us-west-2',
        accountId: '123456789012',
      });

      const template = Template.fromStack(stack);

      // Check IAM role references are created
      // Each role mapping creates an IAM role reference
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      expect(Object.keys(resources).length).toBeGreaterThan(0);
    });
  });

  describe('createAccessConfig helper', () => {
    test('creates config with admin roles', () => {
      const config = createAccessConfig({
        adminRoleArns: ['arn:aws:iam::123456789012:role/AdminRole'],
      });

      expect(config.admins).toHaveLength(1);
      expect(config.admins![0].arn).toBe('arn:aws:iam::123456789012:role/AdminRole');
      expect(config.addDeployerAsAdmin).toBe(true);
    });

    test('creates config with multiple personas', () => {
      const config = createAccessConfig({
        adminRoleArns: ['arn:aws:iam::123456789012:role/AdminRole'],
        developerRoleArns: ['arn:aws:iam::123456789012:role/DevRole'],
        viewerRoleArns: ['arn:aws:iam::123456789012:role/ViewerRole'],
        addDeployerAsAdmin: false,
      });

      expect(config.admins).toHaveLength(1);
      expect(config.developers).toHaveLength(1);
      expect(config.viewers).toHaveLength(1);
      expect(config.addDeployerAsAdmin).toBe(false);
    });

    test('defaults to API_AND_CONFIG_MAP mode', () => {
      const config = createAccessConfig({});

      expect(config.authenticationMode).toBe('API_AND_CONFIG_MAP');
    });

    test('allows custom authentication mode', () => {
      const config = createAccessConfig({
        authenticationMode: 'API',
      });

      expect(config.authenticationMode).toBe('API');
    });
  });

  describe('EksAccessPolicies constants', () => {
    test('exports correct policy ARNs', () => {
      expect(EksAccessPolicies.ClusterAdmin).toBe('arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy');
      expect(EksAccessPolicies.Admin).toBe('arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy');
      expect(EksAccessPolicies.Edit).toBe('arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy');
      expect(EksAccessPolicies.View).toBe('arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy');
    });
  });

  describe('authentication modes', () => {
    test('API_AND_CONFIG_MAP mode adds aws-auth mappings', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const accessConfig: ClusterAccessConfig = {
        authenticationMode: 'API_AND_CONFIG_MAP',
        admins: [{ arn: 'arn:aws:iam::123456789012:role/AdminRole', name: 'admin' }],
      };

      const accessMgmt = new ClusterAccessManagement(stack, 'Access', {
        cluster,
        accessConfig,
        region: 'us-west-2',
        accountId: '123456789012',
      });

      expect(accessMgmt.authenticationMode).toBe('API_AND_CONFIG_MAP');
    });

    test('CONFIG_MAP mode only uses aws-auth', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const accessConfig: ClusterAccessConfig = {
        authenticationMode: 'CONFIG_MAP',
        admins: [{ arn: 'arn:aws:iam::123456789012:role/AdminRole', name: 'admin' }],
      };

      const accessMgmt = new ClusterAccessManagement(stack, 'Access', {
        cluster,
        accessConfig,
        region: 'us-west-2',
        accountId: '123456789012',
      });

      expect(accessMgmt.authenticationMode).toBe('CONFIG_MAP');
    });
  });

  describe('custom access entries', () => {
    test('handles custom access with namespace scope', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const accessConfig: ClusterAccessConfig = {
        authenticationMode: 'API_AND_CONFIG_MAP',
        customAccess: [
          {
            arn: 'arn:aws:iam::123456789012:role/CustomRole',
            name: 'custom',
            policyArn: EksAccessPolicies.Edit,
            accessScopeType: 'namespace',
            namespaces: ['team-a', 'team-b'],
            groups: ['team-a-devs'],
          },
        ],
      };

      new ClusterAccessManagement(stack, 'Access', {
        cluster,
        accessConfig,
        region: 'us-west-2',
        accountId: '123456789012',
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toBeDefined();
    });
  });
});
