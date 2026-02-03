# ADR-001: Use AWS CDK over Terraform

## Status

Accepted

## Date

2024-01-15

## Context

We need to choose an Infrastructure as Code (IaC) tool for deploying and managing the EKS infrastructure. The main contenders are:

1. **AWS CDK** - AWS's own IaC framework using programming languages
2. **Terraform** - HashiCorp's declarative IaC tool with HCL
3. **Pulumi** - Multi-cloud IaC using programming languages
4. **CloudFormation** - AWS's native declarative IaC

Key considerations:

- Team expertise (strong TypeScript skills)
- AWS-native focus (not multi-cloud)
- Need for complex logic and abstractions
- Type safety for configuration
- Maintainability of Helm chart deployments
- Integration with existing CDK constructs

## Decision

We will use **AWS CDK v2 with TypeScript** as our Infrastructure as Code tool.

## Consequences

### Positive

- **Type safety**: TypeScript interfaces catch configuration errors at compile time
- **IDE support**: Full autocomplete, refactoring, and error detection
- **Abstraction**: L3 constructs encapsulate complex patterns (HelmRelease, IrsaRole)
- **Reusability**: Constructs are easily shared and extended
- **Native EKS support**: `aws-cdk-lib/aws-eks` has excellent EKS integration
- **Helm integration**: Built-in HelmChart construct simplifies deployments
- **Team productivity**: Existing TypeScript expertise reduces learning curve
- **Testing**: Jest integration for unit testing infrastructure

### Negative

- **AWS lock-in**: CDK is AWS-specific (mitigated: we're AWS-only anyway)
- **CloudFormation limits**: Subject to CFN stack size and resource limits
- **Drift detection**: Less mature than Terraform's drift detection
- **State management**: CloudFormation state is less portable
- **Community**: Smaller community than Terraform (but growing)

### Neutral

- Deployment still uses CloudFormation under the hood
- Existing Terraform modules cannot be directly reused

## Alternatives Considered

### Alternative 1: Terraform with HCL

The most popular IaC tool with extensive provider support.

**Pros:**
- Largest community and module ecosystem
- Mature state management
- Excellent drift detection
- Multi-cloud support

**Cons:**
- HCL is less expressive than TypeScript
- No compile-time type checking
- Complex logic requires workarounds
- Helm provider less integrated than CDK

**Why rejected:** Team has stronger TypeScript skills, and CDK's type safety and abstraction capabilities better suit our complex EKS deployment with 16+ Helm charts.

### Alternative 2: Pulumi

Modern IaC using real programming languages.

**Pros:**
- Programming language support (TypeScript, Python, Go)
- Type safety similar to CDK
- Multi-cloud support
- Drift detection

**Cons:**
- Smaller AWS-specific ecosystem
- Requires Pulumi service or self-hosted backend
- Less mature EKS constructs
- Additional cost for team features

**Why rejected:** CDK's native AWS integration and mature EKS constructs provide better out-of-box experience for AWS-only deployments.

### Alternative 3: CloudFormation (Native)

AWS's native declarative IaC.

**Pros:**
- No additional tooling
- Direct AWS support
- No abstraction layer

**Cons:**
- YAML/JSON is verbose and error-prone
- No type safety
- Difficult to create reusable abstractions
- Manual Helm integration

**Why rejected:** Too verbose for our needs, lacks the abstraction capabilities required for maintainable complex deployments.

## References

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [CDK EKS Module](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_eks-readme.html)
- [CDK Patterns](https://cdkpatterns.com/)
