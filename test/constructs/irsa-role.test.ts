import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { IrsaRole, PodIdentityRole } from '../../lib/constructs/irsa-role';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';

describe('IrsaRole', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  describe('basic functionality', () => {
    test('creates service account', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new IrsaRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'my-service-account',
        namespace: 'my-namespace',
      });

      const template = Template.fromStack(stack);
      // Check that a KubernetesResource is created for the service account
      const resources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
      expect(Object.keys(resources).length).toBeGreaterThanOrEqual(1);
    });

    test('creates IAM role', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new IrsaRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'my-sa',
        namespace: 'default',
      });

      const template = Template.fromStack(stack);
      // Service account creates an IAM role - check that at least one exists
      const roles = template.findResources('AWS::IAM::Role');
      expect(Object.keys(roles).length).toBeGreaterThanOrEqual(1);
    });

    test('exposes role property', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const irsaRole = new IrsaRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'my-sa',
        namespace: 'default',
      });

      expect(irsaRole.role).toBeDefined();
    });

    test('exposes service account property', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const irsaRole = new IrsaRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'my-sa',
        namespace: 'default',
      });

      expect(irsaRole.serviceAccount).toBeDefined();
      expect(irsaRole.serviceAccount).toBeInstanceOf(eks.ServiceAccount);
    });
  });

  describe('policy statements', () => {
    test('adds inline policy statements', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new IrsaRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'external-dns',
        namespace: 'external-dns',
        policyStatements: [
          new iam.PolicyStatement({
            actions: ['route53:ChangeResourceRecordSets'],
            resources: ['arn:aws:route53:::hostedzone/*'],
          }),
          new iam.PolicyStatement({
            actions: ['route53:ListHostedZones', 'route53:ListResourceRecordSets'],
            resources: ['*'],
          }),
        ],
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'route53:ChangeResourceRecordSets',
              Resource: 'arn:aws:route53:::hostedzone/*',
            }),
          ]),
        },
      });
    });

    test('adds multiple policy statements', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new IrsaRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 's3-reader',
        namespace: 'default',
        policyStatements: [
          new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: ['arn:aws:s3:::my-bucket/*'],
          }),
          new iam.PolicyStatement({
            actions: ['s3:ListBucket'],
            resources: ['arn:aws:s3:::my-bucket'],
          }),
        ],
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 's3:GetObject',
            }),
            Match.objectLike({
              Action: 's3:ListBucket',
            }),
          ]),
        },
      });
    });
  });

  describe('managed policies', () => {
    test('adds managed policies', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new IrsaRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'node-role',
        namespace: 'kube-system',
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess')],
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('AmazonS3ReadOnlyAccess')])]),
          }),
        ]),
      });
    });
  });
});

describe('PodIdentityRole', () => {
  function createTestCluster(stack: cdk.Stack): eks.Cluster {
    const vpc = new ec2.Vpc(stack, 'Vpc');
    return new eks.Cluster(stack, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31,
      defaultCapacity: 0,
      kubectlLayer: new KubectlV31Layer(stack, 'KubectlLayer'),
    });
  }

  describe('basic functionality', () => {
    test('creates IAM role with Pod Identity trust policy', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new PodIdentityRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'my-sa',
        namespace: 'default',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: 'pods.eks.amazonaws.com',
              },
              Action: Match.arrayWith(['sts:AssumeRole', 'sts:TagSession']),
            }),
          ]),
        }),
      });
    });

    test('creates Pod Identity Association', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new PodIdentityRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'my-sa',
        namespace: 'my-namespace',
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::EKS::PodIdentityAssociation', {
        Namespace: 'my-namespace',
        ServiceAccount: 'my-sa',
      });
    });

    test('exposes role property', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      const podRole = new PodIdentityRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'my-sa',
        namespace: 'default',
      });

      expect(podRole.role).toBeDefined();
      expect(podRole.role).toBeInstanceOf(iam.Role);
    });
  });

  describe('policy statements', () => {
    test('adds inline policy with statements', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new PodIdentityRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'secrets-reader',
        namespace: 'app',
        policyStatements: [
          new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['arn:aws:secretsmanager:*:*:secret:app/*'],
          }),
        ],
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'secretsmanager:GetSecretValue',
              Resource: 'arn:aws:secretsmanager:*:*:secret:app/*',
            }),
          ]),
        },
      });
    });
  });

  describe('managed policies', () => {
    test('attaches managed policies', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const cluster = createTestCluster(stack);

      new PodIdentityRole(stack, 'TestRole', {
        cluster,
        serviceAccount: 'my-sa',
        namespace: 'default',
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBReadOnlyAccess')],
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('AmazonDynamoDBReadOnlyAccess')])]),
          }),
        ]),
      });
    });
  });
});
