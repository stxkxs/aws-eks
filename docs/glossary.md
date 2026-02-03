# Glossary

Terms and definitions used in the AWS EKS infrastructure project.

---

## A

### ADR (Architecture Decision Record)
A document capturing an important architectural decision along with its context and consequences. See [Architecture Decisions](./architecture/decisions/).

### ALB (Application Load Balancer)
AWS Layer 7 load balancer that routes HTTP/HTTPS traffic. Managed by the AWS Load Balancer Controller in this infrastructure.

### AMP (Amazon Managed Prometheus)
AWS-managed Prometheus-compatible monitoring service. Used for metrics storage and querying.

### AMG (Amazon Managed Grafana)
AWS-managed Grafana service for visualization. Connects to AMP for metrics dashboards.

---

## B

### Bottlerocket
AWS-purpose-built Linux distribution optimized for running containers. Used as the AMI for all nodes in this infrastructure for security hardening.

---

## C

### CDK (AWS Cloud Development Kit)
Infrastructure as Code framework using programming languages. This project uses CDK v2 with TypeScript.

### Cilium
eBPF-based CNI (Container Network Interface) plugin providing networking, security, and observability. Replaces the default AWS VPC CNI in this infrastructure.

### CiliumNetworkPolicy
Kubernetes custom resource for defining network policies using Cilium's extended capabilities.

### CNI (Container Network Interface)
Specification for configuring network interfaces in Linux containers. Cilium is the CNI used in this infrastructure.

### Consolidation
Karpenter feature that automatically removes underutilized nodes to reduce costs.

### Construct
CDK building block that represents a cloud component. Can be L1 (CloudFormation), L2 (curated), or L3 (patterns).

---

## D

### DaemonSet
Kubernetes workload that runs one pod per node. Used for node-level agents like Cilium, Falco, and Promtail.

---

## E

### eBPF (Extended Berkeley Packet Filter)
Linux kernel technology enabling efficient networking, security, and observability. Used by Cilium and Falco.

### EC2NodeClass
Karpenter custom resource defining EC2 instance configuration (AMI, subnets, security groups).

### EKS (Elastic Kubernetes Service)
AWS managed Kubernetes service. The core of this infrastructure.

### External DNS
Kubernetes controller that synchronizes Ingress/Service hostnames with DNS providers (Route 53).

### External Secrets Operator
Kubernetes operator that synchronizes secrets from external providers (AWS Secrets Manager, SSM Parameter Store).

---

## F

### Falco
Runtime security tool that detects anomalous behavior in containers using eBPF syscall monitoring.

### Falco Talon
Response engine that can automatically respond to Falco alerts (e.g., kill malicious pods).

### Falcosidekick
Falco output router that forwards alerts to various destinations (Slack, webhooks, Loki).

### Feature Flag
Configuration option that enables/disables functionality per environment. Defined in `config/*.ts`.

### Flow Logs
VPC feature capturing network traffic metadata. Enabled for security and troubleshooting.

---

## G

### Goldilocks
Tool that provides resource recommendations based on VPA (Vertical Pod Autoscaler) analysis.

### Grafana Agent
Telemetry collector that scrapes metrics and sends them to Prometheus/AMP.

---

## H

### Helm
Kubernetes package manager. Charts are deployed via the HelmRelease construct.

### HelmRelease
Custom CDK construct for deploying Helm charts to EKS clusters.

### HIPAA
Health Insurance Portability and Accountability Act. US healthcare data protection regulation.

### Hubble
Cilium's observability platform providing network flow visibility.

### Hubble UI
Web interface for visualizing Hubble network flows and service dependencies.

---

## I

### IAM (Identity and Access Management)
AWS service for managing access to AWS resources.

### IRSA (IAM Roles for Service Accounts)
EKS feature enabling Kubernetes service accounts to assume IAM roles. Preferred over node-level IAM roles.

### IrsaRole
Custom CDK construct for creating IRSA configurations.

---

## K

### Karpenter
Kubernetes node autoscaler that provisions right-sized compute capacity. Replaces Cluster Autoscaler.

### KMS (Key Management Service)
AWS service for creating and managing encryption keys. Used for EKS secrets encryption.

### Kyverno
Kubernetes policy engine for validating, mutating, and generating resources.

---

## L

### L3 Construct
CDK pattern construct that encapsulates best practices for deploying multiple resources together.

### Loki
Log aggregation system by Grafana. Stores logs in S3 with a Prometheus-like query language.

---

## M

### Managed Node Group
EKS feature for AWS-managed worker node lifecycle. Used for system nodes.

### mTLS (Mutual TLS)
Two-way TLS where both client and server authenticate. Enabled via Cilium's WireGuard encryption.

---

## N

### NAT Gateway
AWS managed network address translation service enabling private subnet internet access.

### Network Policy
Kubernetes resource controlling pod-to-pod traffic. Extended by CiliumNetworkPolicy.

### NodePool
Karpenter custom resource defining node provisioning constraints (instance types, capacity types).

---

## O

### OIDC (OpenID Connect)
Identity layer on OAuth 2.0. EKS uses OIDC for IRSA authentication.

### OTLP (OpenTelemetry Protocol)
Protocol for transmitting telemetry data. Used by Tempo for trace ingestion.

---

## P

### PCI-DSS
Payment Card Industry Data Security Standard. Credit card data protection requirements.

### PDB (Pod Disruption Budget)
Kubernetes resource limiting voluntary disruptions to maintain availability.

### Policy Exception
Kyverno resource allowing specific workloads to bypass policy enforcement.

### Promtail
Log collector agent that ships logs to Loki. Runs as a DaemonSet.

---

## R

### RBAC (Role-Based Access Control)
Kubernetes authorization mechanism using Roles and RoleBindings.

### Reloader
Kubernetes controller that triggers rolling updates when ConfigMaps or Secrets change.

---

## S

### Service Account
Kubernetes identity for pods. Used with IRSA for AWS API access.

### ServiceMonitor
Prometheus Operator resource defining scrape targets. Used by Grafana Agent.

### SOC2
Service Organization Control 2. Security compliance framework.

### Spot Instance
AWS EC2 capacity at up to 90% discount with possible interruption. Used by Karpenter for cost savings.

### Stack
CDK unit of deployment corresponding to a CloudFormation stack.

---

## T

### Talon
See Falco Talon.

### Tempo
Distributed tracing backend by Grafana. Stores traces in S3.

### Trivy
Vulnerability scanner for containers, filesystems, and IaC.

### Trivy Operator
Kubernetes operator that continuously scans workloads with Trivy.

---

## V

### Velero
Kubernetes backup and restore tool. Backs up to S3.

### VPA (Vertical Pod Autoscaler)
Kubernetes component that recommends or sets resource requests/limits. Used by Goldilocks.

### VPC (Virtual Private Cloud)
AWS isolated network environment containing the EKS cluster.

### VPC Endpoint
AWS PrivateLink endpoint enabling private connectivity to AWS services without NAT.

---

## W

### WireGuard
Modern VPN protocol. Used by Cilium for transparent pod-to-pod encryption.

---

## Acronym Quick Reference

| Acronym | Full Name |
|---------|-----------|
| ADR | Architecture Decision Record |
| ALB | Application Load Balancer |
| AMP | Amazon Managed Prometheus |
| AMG | Amazon Managed Grafana |
| CDK | Cloud Development Kit |
| CNI | Container Network Interface |
| eBPF | Extended Berkeley Packet Filter |
| EKS | Elastic Kubernetes Service |
| IAM | Identity and Access Management |
| IRSA | IAM Roles for Service Accounts |
| KMS | Key Management Service |
| mTLS | Mutual TLS |
| NAT | Network Address Translation |
| OIDC | OpenID Connect |
| OTLP | OpenTelemetry Protocol |
| PCI-DSS | Payment Card Industry Data Security Standard |
| PDB | Pod Disruption Budget |
| RBAC | Role-Based Access Control |
| SOC2 | Service Organization Control 2 |
| VPA | Vertical Pod Autoscaler |
| VPC | Virtual Private Cloud |
