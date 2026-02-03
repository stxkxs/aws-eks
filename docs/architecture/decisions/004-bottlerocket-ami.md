# ADR-004: Use Bottlerocket AMI

## Status

Accepted

## Date

2024-01-15

## Context

We need to select an operating system for EKS worker nodes. Options include:

1. **Bottlerocket** - AWS-purpose-built container OS
2. **Amazon Linux 2023** - General-purpose AWS Linux
3. **Ubuntu** - Popular Linux distribution

Security and compliance requirements:

- Minimal attack surface
- Automated security updates
- Compliance with SOC2, HIPAA, PCI-DSS
- Immutable infrastructure principles

## Decision

We will use **Bottlerocket** as the AMI for all EKS nodes (both managed node groups and Karpenter-provisioned nodes).

## Consequences

### Positive

- **Minimal attack surface**: Only container runtime and required components
- **No shell by default**: Reduces risk of shell-based attacks
- **Atomic updates**: OS updates applied atomically, easy rollback
- **Immutable**: Read-only root filesystem
- **Security hardening**: SELinux enforcing, kernel hardening
- **Faster boot**: Optimized for container workloads
- **Automatic updates**: Can be configured for automatic security updates
- **AWS integration**: Native EKS and SSM support

### Negative

- **No SSH by default**: Debugging requires SSM Session Manager
- **Limited customization**: Can't install arbitrary packages
- **Learning curve**: Different from traditional Linux administration
- **Troubleshooting**: Some traditional tools not available

### Neutral

- Node access via SSM Session Manager (admin container)
- Logs still accessible via kubectl and observability stack
- Container images unchanged

## Alternatives Considered

### Alternative 1: Amazon Linux 2023

AWS's general-purpose Linux distribution.

**Pros:**
- Familiar Linux environment
- Full package manager (dnf)
- SSH access
- Extensive documentation

**Cons:**
- Larger attack surface
- More packages to patch
- Not container-optimized
- Requires hardening for compliance

**Why rejected:** Requires significant hardening to meet security requirements. Larger attack surface increases maintenance burden.

### Alternative 2: Ubuntu

Popular Linux distribution with EKS support.

**Pros:**
- Very familiar to developers
- Large package ecosystem
- Strong community support
- Regular security updates

**Cons:**
- Not AWS-optimized
- Larger attack surface
- Requires manual hardening
- Additional licensing considerations

**Why rejected:** Would require extensive hardening. Not purpose-built for containers.

### Alternative 3: Flatcar Container Linux

Successor to CoreOS Container Linux.

**Pros:**
- Container-optimized
- Immutable infrastructure
- Automatic updates
- Open source

**Cons:**
- Smaller community than Bottlerocket
- Less AWS integration
- Different update mechanism

**Why rejected:** Bottlerocket has better AWS/EKS native integration and AWS support.

## Operational Considerations

### Accessing Nodes

```bash
# Enable admin container (one-time)
# Via EC2 user data or SSM

# Connect via SSM
aws ssm start-session --target i-1234567890abcdef0

# Inside admin container
enter-admin-container

# Access host filesystem
# /host is the root filesystem
```

### Troubleshooting

```bash
# View container runtime logs
journalctl -u containerd

# Check kubelet
journalctl -u kubelet

# System logs
journalctl -b
```

## References

- [Bottlerocket Documentation](https://bottlerocket.dev/)
- [Bottlerocket on EKS](https://docs.aws.amazon.com/eks/latest/userguide/eks-optimized-ami-bottlerocket.html)
- [Bottlerocket Security](https://github.com/bottlerocket-os/bottlerocket/blob/develop/SECURITY_FEATURES.md)
- [Bottlerocket Admin Container](https://github.com/bottlerocket-os/bottlerocket-admin-container)
