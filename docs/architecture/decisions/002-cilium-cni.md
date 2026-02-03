# ADR-002: Use Cilium as CNI

## Status

Accepted

## Date

2024-01-15

## Context

EKS requires a Container Network Interface (CNI) plugin for pod networking. The default is AWS VPC CNI, but alternatives offer different feature sets.

Key requirements:

- Network policy enforcement
- Transparent encryption (mTLS)
- Observability (network flows, metrics)
- Service mesh capabilities (without sidecar overhead)
- Performance at scale

## Decision

We will use **Cilium** as the CNI plugin, replacing the default AWS VPC CNI.

Cilium will be deployed with:
- ENI mode for native AWS networking
- WireGuard encryption for pod-to-pod traffic
- Hubble for network observability
- L7 policy capabilities

## Consequences

### Positive

- **eBPF performance**: Kernel-level networking without iptables overhead
- **Native encryption**: WireGuard mTLS without sidecar proxies
- **Hubble observability**: Real-time network flow visibility
- **Advanced policies**: L7-aware network policies (HTTP, gRPC, Kafka)
- **Service mesh lite**: mTLS and observability without full mesh complexity
- **Kubernetes Network Policies**: Full support plus CiliumNetworkPolicy extensions
- **Identity-based security**: Policies based on Kubernetes labels, not IPs

### Negative

- **Complexity**: More complex than default VPC CNI
- **Learning curve**: Team needs to learn Cilium concepts
- **Troubleshooting**: Different debugging approach than traditional CNI
- **AWS integration**: Some features require careful ENI mode configuration
- **Upgrade care**: CNI upgrades require careful planning

### Neutral

- Replaces VPC CNI but uses ENI mode for AWS-native IP allocation
- Hubble UI provides new observability capabilities
- Network policies migrate from Kubernetes to CiliumNetworkPolicy

## Alternatives Considered

### Alternative 1: AWS VPC CNI (Default)

The default EKS networking solution.

**Pros:**
- Native AWS integration
- Simple setup
- AWS support
- No additional components

**Cons:**
- No built-in encryption
- Limited to Kubernetes NetworkPolicy
- No L7 visibility
- Requires service mesh for mTLS

**Why rejected:** Lacks encryption and observability features. Would require additional components (Istio, Linkerd) for mTLS, adding complexity.

### Alternative 2: Calico

Popular CNI with strong network policy support.

**Pros:**
- Mature and well-tested
- Strong network policy support
- eBPF dataplane option
- Good documentation

**Cons:**
- WireGuard encryption less integrated
- Observability requires additional tools
- No native L7 policy support
- Commercial features require license

**Why rejected:** Cilium's integrated Hubble observability and native WireGuard encryption provide better out-of-box experience.

### Alternative 3: Istio Service Mesh

Full-featured service mesh.

**Pros:**
- Comprehensive mTLS
- Advanced traffic management
- Rich observability
- Large community

**Cons:**
- Sidecar overhead (CPU, memory, latency)
- Significant complexity
- Resource intensive
- Steep learning curve

**Why rejected:** Sidecar architecture adds overhead. Cilium provides needed features (mTLS, observability) without sidecars via eBPF.

## References

- [Cilium Documentation](https://docs.cilium.io/)
- [Cilium on EKS](https://docs.cilium.io/en/stable/installation/k8s-install-eks/)
- [Hubble Documentation](https://docs.cilium.io/en/stable/observability/hubble/)
- [Cilium vs Other CNIs](https://cilium.io/blog/2021/05/20/cilium-110/)
