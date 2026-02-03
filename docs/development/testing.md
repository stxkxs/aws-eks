# Testing Guide

## Overview

This guide covers testing practices, patterns, and tools for the AWS EKS infrastructure project.

## Test Stack

- **Framework:** Jest
- **Assertions:** AWS CDK Assertions library
- **Language:** TypeScript

## Running Tests

```bash
# Run all tests
npm run test

# Run with coverage
npm run test -- --coverage

# Run specific test file
npm run test -- test/stacks/network.test.ts

# Run tests matching pattern
npm run test -- --testNamePattern="creates VPC"

# Watch mode
npm run test -- --watch
```

## Test Structure

```
test/
├── config/
│   └── config.test.ts          # Configuration tests
├── constructs/
│   ├── helm-release.test.ts    # HelmRelease construct tests
│   ├── irsa-role.test.ts       # IrsaRole construct tests
│   └── kyverno-policy.test.ts  # KyvernoPolicy construct tests
└── stacks/
    ├── network.test.ts         # NetworkStack tests
    ├── cluster.test.ts         # ClusterStack tests
    └── addons/
        ├── security.test.ts    # SecurityAddonsStack tests
        └── operations.test.ts  # OperationsAddonsStack tests
```

## Test Patterns

### Stack Testing

```typescript
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../../lib/stacks/network';
import { getDevConfig } from '../../config';

describe('NetworkStack', () => {
  const testAccountId = '123456789012';
  const testRegion = 'us-west-2';

  describe('with dev config', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion);
      const stack = new NetworkStack(app, 'TestNetwork', { config });
      template = Template.fromStack(stack);
    });

    test('creates VPC with correct CIDR', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.0.0.0/16',
      });
    });

    test('creates single NAT gateway for cost optimization', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });
  });
});
```

### Construct Testing

```typescript
import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Template } from 'aws-cdk-lib/assertions';
import { HelmRelease } from '../../lib/constructs/helm-release';

describe('HelmRelease', () => {
  test('creates helm chart with correct properties', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    // Mock cluster
    const cluster = {
      clusterName: 'test-cluster',
      addHelmChart: jest.fn(),
    } as unknown as eks.ICluster;

    new HelmRelease(stack, 'TestRelease', {
      cluster,
      chart: 'nginx',
      repository: 'https://charts.bitnami.com/bitnami',
      version: '1.0.0',
      namespace: 'default',
    });

    expect(cluster.addHelmChart).toHaveBeenCalledWith(
      'TestRelease',
      expect.objectContaining({
        chart: 'nginx',
        version: '1.0.0',
      })
    );
  });
});
```

### Configuration Testing

```typescript
import { getDevConfig, getProductionConfig } from '../../config';

describe('Configuration', () => {
  const accountId = '123456789012';
  const region = 'us-west-2';

  describe('dev config', () => {
    const config = getDevConfig(accountId, region);

    test('has correct environment', () => {
      expect(config.environment).toBe('dev');
    });

    test('uses single NAT gateway', () => {
      expect(config.network.natGateways).toBe(1);
    });

    test('disables falco kill mode', () => {
      expect(config.features.falcoKillMode).toBe(false);
    });
  });

  describe('production config', () => {
    const config = getProductionConfig(accountId, region);

    test('enables falco kill mode', () => {
      expect(config.features.falcoKillMode).toBe(true);
    });

    test('uses multiple NAT gateways', () => {
      expect(config.network.natGateways).toBeGreaterThanOrEqual(2);
    });
  });
});
```

## Assertion Patterns

### Resource Existence

```typescript
// Check resource exists
template.hasResource('AWS::EC2::VPC', {});

// Check exact count
template.resourceCountIs('AWS::EC2::NatGateway', 3);

// Check resource with specific properties
template.hasResourceProperties('AWS::EC2::VPC', {
  CidrBlock: '10.0.0.0/16',
});
```

### Property Matching

```typescript
import { Match } from 'aws-cdk-lib/assertions';

// Exact match
template.hasResourceProperties('AWS::EC2::VPC', {
  CidrBlock: '10.0.0.0/16',
});

// Partial match (array contains)
template.hasResourceProperties('AWS::EC2::Subnet', {
  Tags: Match.arrayWith([
    Match.objectLike({ Key: 'kubernetes.io/role/elb', Value: '1' }),
  ]),
});

// Any value
template.hasResourceProperties('AWS::EC2::VPC', {
  CidrBlock: Match.anyValue(),
});

// Not present
template.hasResourceProperties('AWS::EC2::Subnet', {
  MapPublicIpOnLaunch: Match.absent(),
});
```

### Output Testing

```typescript
// Check output exists
template.hasOutput('VpcId', {});

// Check output with export name
template.hasOutput('VpcId', {
  Export: { Name: 'dev-vpc-id' },
});
```

### Finding Resources

```typescript
// Find all resources of type
const vpcs = template.findResources('AWS::EC2::VPC');

// Iterate and check
for (const [id, vpc] of Object.entries(vpcs)) {
  expect((vpc as any).Properties.EnableDnsHostnames).toBe(true);
}
```

## Testing Environment Differences

```typescript
describe('NetworkStack', () => {
  describe('with dev config', () => {
    let template: Template;

    beforeAll(() => {
      const config = getDevConfig(accountId, region);
      const stack = new NetworkStack(app, 'Test', { config });
      template = Template.fromStack(stack);
    });

    test('creates single NAT gateway', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    test('does not create flow logs', () => {
      template.resourceCountIs('AWS::EC2::FlowLog', 0);
    });
  });

  describe('with production config', () => {
    let template: Template;

    beforeAll(() => {
      const config = getProductionConfig(accountId, region);
      const stack = new NetworkStack(app, 'Test', { config });
      template = Template.fromStack(stack);
    });

    test('creates multiple NAT gateways', () => {
      const natGateways = template.findResources('AWS::EC2::NatGateway');
      expect(Object.keys(natGateways).length).toBeGreaterThanOrEqual(2);
    });

    test('creates flow logs', () => {
      template.resourceCountIs('AWS::EC2::FlowLog', 1);
    });
  });
});
```

## Testing Helm Charts

```typescript
describe('SecurityAddonsStack', () => {
  test('deploys Falco', () => {
    template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Chart: 'falco',
      Repository: 'https://falcosecurity.github.io/charts',
      Namespace: 'falco-system',
    });
  });

  test('deploys Kyverno with correct replicas', () => {
    // For production config
    template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Chart: 'kyverno',
      Values: Match.serializedJson(
        Match.objectLike({
          replicaCount: 3,
        })
      ),
    });
  });
});
```

## Testing Kubernetes Manifests

```typescript
describe('KyvernoPolicy', () => {
  test('creates ClusterPolicy', () => {
    template.hasResourceProperties('Custom::AWSCDK-EKS-KubernetesResource', {
      Manifest: Match.serializedJson(
        Match.arrayWith([
          Match.objectLike({
            apiVersion: 'kyverno.io/v1',
            kind: 'ClusterPolicy',
            metadata: {
              name: 'require-limits',
            },
          }),
        ])
      ),
    });
  });
});
```

## Mocking

### Mocking EKS Cluster

```typescript
const mockCluster = {
  clusterName: 'test-cluster',
  clusterEndpoint: 'https://test.eks.amazonaws.com',
  clusterSecurityGroupId: 'sg-12345',
  openIdConnectProvider: {
    openIdConnectProviderArn: 'arn:aws:iam::123456789012:oidc-provider/...',
  },
  addHelmChart: jest.fn(),
  addManifest: jest.fn(),
} as unknown as eks.ICluster;
```

### Mocking VPC

```typescript
const mockVpc = ec2.Vpc.fromVpcAttributes(stack, 'MockVpc', {
  vpcId: 'vpc-12345',
  availabilityZones: ['us-west-2a', 'us-west-2b'],
  privateSubnetIds: ['subnet-1', 'subnet-2'],
  publicSubnetIds: ['subnet-3', 'subnet-4'],
});
```

## Test Coverage

### Running Coverage Report

```bash
npm run test -- --coverage
```

### Coverage Thresholds

Configure in `jest.config.js`:

```javascript
module.exports = {
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Coverage Reports

Coverage reports are generated in `coverage/` directory:
- `coverage/lcov-report/index.html` - HTML report
- `coverage/lcov.info` - LCOV format

## Debugging Tests

### VS Code Launch Configuration

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Jest: Current File",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["${fileBasename}", "--config", "jest.config.js"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Verbose Output

```bash
npm run test -- --verbose
```

### Debug Single Test

```bash
npm run test -- --testNamePattern="creates VPC" --verbose
```

## Best Practices

1. **Test environment differences** - Ensure dev/staging/prod behave correctly
2. **Test resource counts** - Verify expected number of resources
3. **Test properties** - Ensure critical properties are set correctly
4. **Test outputs** - Verify stack outputs for cross-stack references
5. **Use beforeAll** - Create template once per describe block
6. **Descriptive names** - Test names should describe expected behavior
7. **Arrange-Act-Assert** - Structure tests clearly
8. **Independent tests** - Tests should not depend on each other

## Related

- [Contributing Guide](./contributing.md)
- [Multi-Agent Development](./multi-agent.md)
