# Network Topology

Detailed network architecture diagrams for the AWS EKS infrastructure.

## VPC Architecture

```mermaid
graph TB
    subgraph Internet
        Users[Internet Users]
        AWS[AWS APIs]
    end

    subgraph VPC["VPC: 10.0.0.0/16"]
        subgraph AZ1["Availability Zone 1"]
            subgraph Public1["Public Subnet: 10.0.0.0/20"]
                NAT1[NAT Gateway 1]
                ALB1[ALB Node]
            end
            subgraph Private1["Private Subnet: 10.0.128.0/20"]
                Node1A[System Node 1]
                Node1B[Karpenter Node]
            end
        end

        subgraph AZ2["Availability Zone 2"]
            subgraph Public2["Public Subnet: 10.0.16.0/20"]
                NAT2[NAT Gateway 2]
                ALB2[ALB Node]
            end
            subgraph Private2["Private Subnet: 10.0.144.0/20"]
                Node2A[System Node 2]
                Node2B[Karpenter Node]
            end
        end

        subgraph AZ3["Availability Zone 3"]
            subgraph Public3["Public Subnet: 10.0.32.0/20"]
                NAT3[NAT Gateway 3]
                ALB3[ALB Node]
            end
            subgraph Private3["Private Subnet: 10.0.160.0/20"]
                Node3B[Karpenter Node]
            end
        end

        IGW[Internet Gateway]
    end

    Users --> IGW
    IGW --> ALB1 & ALB2 & ALB3
    ALB1 --> Node1A & Node1B
    ALB2 --> Node2A & Node2B
    ALB3 --> Node3B

    Node1A & Node1B --> NAT1
    Node2A & Node2B --> NAT2
    Node3B --> NAT3

    NAT1 & NAT2 & NAT3 --> IGW --> AWS
```

## Subnet Layout

| Subnet Type | AZ | CIDR Block | Size | Purpose |
|-------------|-----|------------|------|---------|
| Public | 1 | 10.0.0.0/20 | 4,096 IPs | NAT Gateway, ALB |
| Public | 2 | 10.0.16.0/20 | 4,096 IPs | NAT Gateway, ALB |
| Public | 3 | 10.0.32.0/20 | 4,096 IPs | NAT Gateway, ALB |
| Private | 1 | 10.0.128.0/20 | 4,096 IPs | EKS Nodes, Pods |
| Private | 2 | 10.0.144.0/20 | 4,096 IPs | EKS Nodes, Pods |
| Private | 3 | 10.0.160.0/20 | 4,096 IPs | EKS Nodes, Pods |

**Reserved ranges:** 10.0.48.0/20 - 10.0.112.0/20 for future use (isolated subnets, additional environments).

## Traffic Flows

### Ingress Flow (External to Pod)

```mermaid
sequenceDiagram
    participant User as Internet User
    participant R53 as Route 53
    participant ALB as Application Load Balancer
    participant Cilium as Cilium (Node)
    participant Pod as Application Pod

    User->>R53: DNS lookup (app.example.com)
    R53-->>User: ALB IP address
    User->>ALB: HTTPS request
    ALB->>ALB: TLS termination
    ALB->>Cilium: Forward to node (HTTP)
    Cilium->>Cilium: Network policy check
    Cilium->>Pod: Deliver to pod
    Pod-->>Cilium: Response
    Cilium-->>ALB: Response
    ALB-->>User: HTTPS response
```

### Egress Flow (Pod to Internet)

```mermaid
sequenceDiagram
    participant Pod as Application Pod
    participant Cilium as Cilium (Node)
    participant NAT as NAT Gateway
    participant Internet as Internet

    Pod->>Cilium: Outbound request
    Cilium->>Cilium: Network policy check
    Cilium->>Cilium: SNAT to node IP
    Cilium->>NAT: Forward via route table
    NAT->>NAT: SNAT to public IP
    NAT->>Internet: Request
    Internet-->>NAT: Response
    NAT-->>Cilium: Response
    Cilium-->>Pod: Response
```

### Pod-to-Pod Flow (Same Cluster)

```mermaid
sequenceDiagram
    participant PodA as Pod A (10.0.128.x)
    participant CiliumA as Cilium (Node A)
    participant CiliumB as Cilium (Node B)
    participant PodB as Pod B (10.0.144.x)

    PodA->>CiliumA: Request to PodB
    CiliumA->>CiliumA: Network policy check
    CiliumA->>CiliumA: WireGuard encrypt (mTLS)
    CiliumA->>CiliumB: Encrypted packet
    CiliumB->>CiliumB: WireGuard decrypt
    CiliumB->>CiliumB: Network policy check
    CiliumB->>PodB: Deliver to pod
    PodB-->>CiliumB: Response
    CiliumB-->>CiliumA: Encrypted response
    CiliumA-->>PodA: Response
```

### AWS API Flow (via VPC Endpoints)

```mermaid
sequenceDiagram
    participant Pod as Application Pod
    participant Cilium as Cilium
    participant VPCE as VPC Endpoint
    participant AWS as AWS Service (S3, ECR, etc.)

    Pod->>Cilium: AWS API call
    Cilium->>VPCE: Route via private DNS
    VPCE->>AWS: Private connection
    AWS-->>VPCE: Response
    VPCE-->>Cilium: Response
    Cilium-->>Pod: Response

    Note over Pod,AWS: Traffic stays within AWS network<br/>No NAT Gateway charges
```

## Security Groups

### Cluster Security Group

```mermaid
graph LR
    subgraph ClusterSG["Cluster Security Group"]
        direction TB
        In1[Inbound: Self - All traffic]
        In2[Inbound: Node SG - 443/tcp]
        Out1[Outbound: 0.0.0.0/0 - All]
    end
```

| Direction | Port | Protocol | Source/Dest | Purpose |
|-----------|------|----------|-------------|---------|
| Inbound | All | All | Self | Cluster internal |
| Inbound | 443 | TCP | Node SG | API server access |
| Outbound | All | All | 0.0.0.0/0 | Internet access |

### Node Security Group

| Direction | Port | Protocol | Source/Dest | Purpose |
|-----------|------|----------|-------------|---------|
| Inbound | All | All | Self | Node-to-node |
| Inbound | All | All | Cluster SG | From control plane |
| Inbound | 443 | TCP | ALB SG | Webhook callbacks |
| Inbound | 10250 | TCP | Cluster SG | Kubelet API |
| Outbound | All | All | 0.0.0.0/0 | Internet access |

### ALB Security Group

| Direction | Port | Protocol | Source/Dest | Purpose |
|-----------|------|----------|-------------|---------|
| Inbound | 80 | TCP | 0.0.0.0/0 | HTTP (redirect) |
| Inbound | 443 | TCP | 0.0.0.0/0 | HTTPS |
| Outbound | All | All | Node SG | To nodes |

## VPC Endpoints

VPC endpoints provide private connectivity to AWS services:

```mermaid
graph LR
    subgraph VPC
        Pods[Pods]
    end

    subgraph Endpoints["VPC Endpoints"]
        S3[S3 Gateway]
        ECR[ECR Interface]
        ECRAPI[ECR API Interface]
        STS[STS Interface]
        SSM[SSM Interface]
        Logs[CloudWatch Logs Interface]
    end

    subgraph AWS["AWS Services"]
        S3Svc[Amazon S3]
        ECRSvc[Amazon ECR]
        STSSvc[AWS STS]
        SSMSvc[AWS SSM]
        CWLSvc[CloudWatch Logs]
    end

    Pods --> S3 --> S3Svc
    Pods --> ECR --> ECRSvc
    Pods --> ECRAPI --> ECRSvc
    Pods --> STS --> STSSvc
    Pods --> SSM --> SSMSvc
    Pods --> Logs --> CWLSvc
```

| Endpoint | Type | Service | Purpose |
|----------|------|---------|---------|
| S3 | Gateway | com.amazonaws.region.s3 | Loki, Tempo, Velero storage |
| ECR DKR | Interface | com.amazonaws.region.ecr.dkr | Container image pulls |
| ECR API | Interface | com.amazonaws.region.ecr.api | ECR API calls |
| STS | Interface | com.amazonaws.region.sts | IRSA token exchange |
| SSM | Interface | com.amazonaws.region.ssm | Systems Manager |
| Logs | Interface | com.amazonaws.region.logs | CloudWatch Logs |

## DNS Architecture

```mermaid
graph TB
    subgraph External["External DNS"]
        R53[Route 53]
    end

    subgraph Cluster["EKS Cluster"]
        CoreDNS[CoreDNS]
        ExtDNS[External DNS Controller]

        subgraph Pods
            App[Application Pod]
        end
    end

    App -->|1. Internal DNS| CoreDNS
    CoreDNS -->|2. External queries| R53
    ExtDNS -->|3. Sync records| R53

    subgraph DNSRecords["Route 53 Records"]
        A1["app.example.com → ALB"]
        A2["api.example.com → ALB"]
    end
```

### DNS Resolution Flow

1. **Cluster-internal names** (e.g., `service.namespace.svc.cluster.local`):
   - Resolved by CoreDNS directly
   - No external DNS query

2. **External names** (e.g., `api.example.com`):
   - CoreDNS forwards to Route 53 resolver
   - Cached according to TTL

3. **AWS service endpoints** (e.g., `s3.us-west-2.amazonaws.com`):
   - Resolved to VPC endpoint private IPs
   - Via Route 53 Resolver inbound endpoint

## Network Policies

### Default Deny (Recommended)

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: default-deny
  namespace: production
spec:
  endpointSelector: {}
  ingress:
  - {}
  egress:
  - {}
```

### Allow DNS

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-dns
  namespace: production
spec:
  endpointSelector: {}
  egress:
  - toEndpoints:
    - matchLabels:
        k8s:io.kubernetes.pod.namespace: kube-system
        k8s-app: kube-dns
    toPorts:
    - ports:
      - port: "53"
        protocol: UDP
      - port: "53"
        protocol: TCP
```

### Allow Ingress from ALB

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-alb-ingress
  namespace: production
spec:
  endpointSelector:
    matchLabels:
      app: web
  ingress:
  - fromEntities:
    - world
    toPorts:
    - ports:
      - port: "8080"
        protocol: TCP
```

## Environment Variations

| Component | Dev | Staging | Production |
|-----------|-----|---------|------------|
| NAT Gateways | 1 (single AZ) | 2 (multi-AZ) | 3 (all AZs) |
| VPC Endpoints | S3 only | All | All |
| Flow Logs | Disabled | Enabled | Enabled |
| Public API Endpoint | Yes | Yes | No |
| WireGuard Encryption | Yes | Yes | Yes |

## Related Documentation

- [Architecture Overview](./overview.md)
- [Networking Architecture](./networking.md)
- [Security Architecture](./security.md)
