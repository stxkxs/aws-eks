# ADR-003: Use Karpenter over Cluster Autoscaler

## Status

Accepted

## Date

2024-01-15

## Context

We need automatic node provisioning to handle variable workload demands efficiently. The primary options are:

1. **Karpenter** - AWS-native, pod-aware node provisioner
2. **Cluster Autoscaler** - Kubernetes SIG project for node scaling

Key requirements:

- Fast node provisioning (< 2 minutes)
- Cost optimization (Spot instances, right-sizing)
- Multi-architecture support (AMD64, ARM64)
- Consolidation of underutilized nodes
- Integration with EKS

## Decision

We will use **Karpenter** for dynamic node provisioning instead of Cluster Autoscaler.

Configuration:
- NodePool with Spot + On-Demand capacity types
- Instance categories: m (general), c (compute), r (memory)
- Bottlerocket AMI for security
- WhenEmptyOrUnderutilized consolidation policy

## Consequences

### Positive

- **Faster provisioning**: Direct EC2 API calls vs ASG scaling (60s vs 3-5min)
- **Right-sizing**: Provisions exactly what pods need, not predefined instance types
- **Cost savings**: Better Spot utilization, automatic consolidation
- **Simplicity**: No ASG/Launch Template management
- **Flexibility**: Any instance type without pre-configuration
- **Bin-packing**: Intelligent pod placement across nodes
- **Drift detection**: Automatically replaces outdated nodes

### Negative

- **AWS-specific**: Only works with AWS (acceptable for this project)
- **Newer tool**: Less battle-tested than Cluster Autoscaler
- **Learning curve**: Different mental model than ASG-based scaling
- **CRD management**: NodePool and EC2NodeClass require understanding

### Neutral

- Managed node group still used for system components (stability)
- Karpenter manages workload nodes only
- Spot interruptions handled by AWS Node Termination Handler

## Alternatives Considered

### Alternative 1: Cluster Autoscaler

The standard Kubernetes node autoscaler.

**Pros:**
- Mature and widely used
- Well-documented
- Multi-cloud support
- Large community

**Cons:**
- Slow scaling (ASG-bound, 3-5 minutes)
- Requires ASG per instance type combination
- Less efficient bin-packing
- No native consolidation

**Why rejected:** Slower provisioning and less cost-efficient. ASG management overhead increases with instance diversity.

### Alternative 2: KEDA + Cluster Autoscaler

Event-driven autoscaling with Cluster Autoscaler.

**Pros:**
- Event-driven pod scaling
- Scales based on external metrics
- Works with Cluster Autoscaler

**Cons:**
- Still has Cluster Autoscaler limitations
- Additional complexity
- Doesn't address node-level issues

**Why rejected:** Addresses pod scaling but not node provisioning efficiency. Still subject to Cluster Autoscaler's slow scaling.

### Alternative 3: Managed Node Groups Only

Using only EKS Managed Node Groups with scaling policies.

**Pros:**
- Fully managed by AWS
- Simple setup
- AWS support

**Cons:**
- Limited instance type flexibility
- Slower scaling
- Less cost optimization
- No intelligent bin-packing

**Why rejected:** Insufficient flexibility and cost optimization for diverse workload requirements.

## References

- [Karpenter Documentation](https://karpenter.sh/)
- [Karpenter Best Practices](https://aws.github.io/aws-eks-best-practices/karpenter/)
- [Karpenter vs Cluster Autoscaler](https://karpenter.sh/docs/concepts/cluster-autoscaler/)
- [AWS Karpenter Workshop](https://www.eksworkshop.com/docs/autoscaling/compute/karpenter/)
