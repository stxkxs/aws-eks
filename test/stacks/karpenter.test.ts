import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { KarpenterStack } from '../../lib/stacks/addons/karpenter';
import { createTestVpc, createTestCluster, getTestConfig, hasHelmChart, getHelmChartValues } from '../helpers';

describe('KarpenterStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'ParentStack');
    const vpc = createTestVpc(stack);
    const cluster = createTestCluster(stack, vpc);
    const config = getTestConfig('dev');

    const karpenterStack = new KarpenterStack(app, 'TestKarpenter', {
      config,
      cluster,
      vpc,
    });

    template = Template.fromStack(karpenterStack);
  });

  // ── SQS queue ────────────────────────────────────────────────────────

  test('creates SQS queue with SQS managed encryption', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      SqsManagedSseEnabled: true,
    });
  });

  test('SQS queue has 5-minute retention period', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      MessageRetentionPeriod: 300,
    });
  });

  // ── EventBridge ──────────────────────────────────────────────────────

  test('creates EventBridge rule for EC2 and health events', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: Match.objectLike({
        source: ['aws.ec2', 'aws.health'],
      }),
    });
  });

  test('EventBridge rule targets the SQS queue', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: Match.anyValue(),
        }),
      ]),
    });
  });

  // ── Node IAM role ────────────────────────────────────────────────────

  test('creates node IAM role with managed policies', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({
          'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('AmazonEKSWorkerNodePolicy')])]),
        }),
      ]),
    });
  });

  test('node IAM role has deterministic name', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: Match.stringLikeRegexp('.*-karpenter-node$'),
    });
  });

  // ── Instance profile ─────────────────────────────────────────────────

  test('creates instance profile', () => {
    template.resourceCountIs('AWS::IAM::InstanceProfile', 1);
  });

  test('instance profile has deterministic name', () => {
    template.hasResourceProperties('AWS::IAM::InstanceProfile', {
      InstanceProfileName: Match.stringLikeRegexp('.*-karpenter-node$'),
    });
  });

  // ── Karpenter Helm chart ─────────────────────────────────────────────

  test('creates Karpenter Helm chart', () => {
    expect(hasHelmChart(template, 'karpenter')).toBe(true);
  });

  test('Karpenter values include clusterName and clusterEndpoint', () => {
    const values = getHelmChartValues(template, 'karpenter');
    expect(values).not.toBeNull();
    // Values may contain CDK token placeholders for clusterName/clusterEndpoint
    const json = JSON.stringify(values);
    expect(json).toContain('clusterName');
    expect(json).toContain('clusterEndpoint');
  });

  test('Karpenter values include interruptionQueue', () => {
    const values = getHelmChartValues(template, 'karpenter');
    expect(values).not.toBeNull();
    const json = JSON.stringify(values);
    expect(json).toContain('interruptionQueue');
  });

  test('Karpenter uses pre-created service account', () => {
    const values = getHelmChartValues(template, 'karpenter');
    expect(values).not.toBeNull();
    const sa = values!.serviceAccount as Record<string, unknown>;
    expect(sa).toBeDefined();
    expect(sa.create).toBe(false);
    expect(sa.name).toBe('karpenter');
  });

  test('Karpenter has CriticalAddonsOnly tolerations', () => {
    const values = getHelmChartValues(template, 'karpenter');
    expect(values).not.toBeNull();
    const json = JSON.stringify(values);
    expect(json).toContain('CriticalAddonsOnly');
  });

  test('Karpenter has system node affinity', () => {
    const values = getHelmChartValues(template, 'karpenter');
    expect(values).not.toBeNull();
    const json = JSON.stringify(values);
    expect(json).toContain('node-role');
    expect(json).toContain('system');
  });

  // ── Outputs ──────────────────────────────────────────────────────────

  test('creates CfnOutputs for node role and instance profile', () => {
    template.hasOutput('KarpenterNodeRoleName', {});
    template.hasOutput('KarpenterInstanceProfileName', {});
  });
});
