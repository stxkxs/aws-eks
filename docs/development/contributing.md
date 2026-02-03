# Contributing Guide

## Overview

This guide covers development workflow, code standards, and contribution process for the AWS EKS infrastructure project.

## Prerequisites

- Node.js 20+
- AWS CLI configured
- Git
- TypeScript knowledge
- Familiarity with AWS CDK

## Getting Started

### Clone and Setup

```bash
# Clone repository
git clone <repository-url>
cd aws-eks

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm run test
```

### IDE Setup

**VS Code (Recommended):**

Install extensions:
- ESLint
- Prettier
- AWS Toolkit

Settings (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

## Project Structure

```
aws-eks/
├── bin/
│   └── app.ts              # CDK app entry point
├── config/
│   ├── base.ts             # Shared defaults
│   ├── dev.ts              # Dev overrides
│   ├── staging.ts          # Staging overrides
│   └── production.ts       # Production overrides
├── lib/
│   ├── types/
│   │   └── config.ts       # TypeScript interfaces
│   ├── constructs/
│   │   ├── helm-release.ts # Helm deployment construct
│   │   ├── irsa-role.ts    # IRSA construct
│   │   └── ...
│   ├── stacks/
│   │   ├── network.ts      # VPC stack
│   │   ├── cluster.ts      # EKS stack
│   │   └── addons/
│   │       ├── core.ts
│   │       ├── networking.ts
│   │       ├── security.ts
│   │       ├── observability.ts
│   │       └── operations.ts
│   └── utils.ts            # Utility functions
├── test/
│   ├── stacks/
│   └── constructs/
└── docs/
```

## Development Workflow

### Feature Development

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes
# Edit files...

# 3. Build and test
npm run build
npm run test

# 4. Synthesize to verify
npm run synth:dev

# 5. Commit changes
git add .
git commit -m "feat: add my feature"

# 6. Push and create PR
git push -u origin feature/my-feature
```

### Branch Naming

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New functionality | `feature/add-istio` |
| `fix/` | Bug fixes | `fix/karpenter-permissions` |
| `docs/` | Documentation | `docs/update-runbooks` |
| `refactor/` | Code refactoring | `refactor/consolidate-constructs` |
| `test/` | Test additions | `test/add-security-tests` |

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Maintenance

**Examples:**
```
feat(security): add Falco Talon for automated response
fix(networking): correct ALB controller IAM permissions
docs(runbooks): add incident response procedures
```

## Code Standards

### TypeScript Style

```typescript
// Use readonly for immutable properties
interface MyConstructProps {
  readonly cluster: eks.ICluster;
  readonly config: EnvironmentConfig;
}

// Export construct classes
export class MyConstruct extends Construct {
  // Public properties first
  public readonly resource: Resource;

  // Constructor
  constructor(scope: Construct, id: string, props: MyConstructProps) {
    super(scope, id);
    // Implementation
  }

  // Private methods last
  private helperMethod(): void {
    // ...
  }
}
```

### CDK Patterns

**Stack Pattern:**
```typescript
export interface MyStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly cluster: eks.ICluster;
}

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);

    const { config, cluster } = props;

    // Deploy resources
    this.deployComponent(cluster, config);

    // Apply tags
    for (const [key, value] of Object.entries(config.tags)) {
      cdk.Tags.of(this).add(key, value);
    }
  }

  private deployComponent(cluster: eks.ICluster, config: EnvironmentConfig): void {
    // Implementation
  }
}
```

**Helm Release Pattern:**
```typescript
new HelmRelease(this, 'MyChart', {
  cluster,
  chart: 'my-chart',
  repository: 'https://charts.example.com',
  version: config.helmVersions.myChart,
  namespace: 'my-namespace',
  createNamespace: true,
  values: {
    // Chart values
  },
});
```

**IRSA Pattern:**
```typescript
new IrsaRole(this, 'MyRole', {
  cluster,
  serviceAccount: 'my-sa',
  namespace: 'my-namespace',
  policyStatements: [
    new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: ['arn:aws:s3:::bucket/*'],
    }),
  ],
});
```

### Testing Standards

See [Testing Guide](./testing.md) for detailed testing information.

**Test Structure:**
```typescript
describe('MyStack', () => {
  describe('with dev config', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const config = getDevConfig(testAccountId, testRegion);
      const stack = new MyStack(app, 'Test', { config });
      template = Template.fromStack(stack);
    });

    test('creates expected resource', () => {
      template.hasResourceProperties('AWS::Resource::Type', {
        Property: 'value',
      });
    });
  });
});
```

## Adding New Components

### New Helm Chart

1. **Add version to config:**
   ```typescript
   // lib/types/config.ts
   export interface HelmVersions {
     readonly newChart: string;
   }

   // config/base.ts
   helmVersions: {
     newChart: '1.0.0',
   }
   ```

2. **Create deployment in appropriate addon stack:**
   ```typescript
   // lib/stacks/addons/[category].ts
   private deployNewChart(cluster: eks.ICluster, config: EnvironmentConfig): void {
     new HelmRelease(this, 'NewChart', {
       cluster,
       chart: 'new-chart',
       repository: 'https://charts.example.com',
       version: config.helmVersions.newChart,
       namespace: 'new-namespace',
       createNamespace: true,
       values: { /* ... */ },
     });
   }
   ```

3. **Add tests:**
   ```typescript
   // test/stacks/addons/[category].test.ts
   test('deploys new chart', () => {
     template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
       Chart: 'new-chart',
     });
   });
   ```

### New Construct

1. **Create construct file:**
   ```typescript
   // lib/constructs/my-construct.ts
   export interface MyConstructProps {
     readonly cluster: eks.ICluster;
     // ...
   }

   export class MyConstruct extends Construct {
     constructor(scope: Construct, id: string, props: MyConstructProps) {
       super(scope, id);
       // Implementation
     }
   }
   ```

2. **Export from index:**
   ```typescript
   // lib/constructs/index.ts
   export * from './my-construct';
   ```

3. **Add tests:**
   ```typescript
   // test/constructs/my-construct.test.ts
   ```

### New Feature Flag

1. **Add to interface:**
   ```typescript
   // lib/types/config.ts
   export interface FeatureFlags {
     readonly newFeature: boolean;
   }
   ```

2. **Set default:**
   ```typescript
   // config/base.ts
   features: {
     newFeature: false,
   }
   ```

3. **Override per environment:**
   ```typescript
   // config/production.ts
   features: {
     newFeature: true,
   }
   ```

4. **Use conditionally:**
   ```typescript
   if (config.features.newFeature) {
     this.deployNewFeature(cluster, config);
   }
   ```

## Code Review Checklist

**Before Submitting PR:**

- [ ] Code builds without errors (`npm run build`)
- [ ] All tests pass (`npm run test`)
- [ ] CDK synthesizes successfully (`npm run synth:dev`)
- [ ] Documentation updated if needed
- [ ] Follows code standards
- [ ] Commit messages follow convention

**Reviewer Checklist:**

- [ ] Code is readable and well-organized
- [ ] No security vulnerabilities introduced
- [ ] Tests cover new functionality
- [ ] No breaking changes (or documented if intentional)
- [ ] IAM permissions follow least privilege

## Release Process

1. All changes merged to `main`
2. Version bump in `package.json`
3. Update CHANGELOG
4. Create release tag
5. Deploy to environments in order: dev → staging → production

## Getting Help

- Check existing documentation in `docs/`
- Review similar code in the codebase
- Ask in team chat
- Create an issue for bugs or feature requests

## Related

- [Testing Guide](./testing.md)
- [Multi-Agent Development](./multi-agent.md)
- [Architecture Overview](../architecture/overview.md)
