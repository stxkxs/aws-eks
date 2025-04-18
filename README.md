# aws-eks

<div align="center">

*A complete AWS CDK application for provisioning production-ready EKS clusters*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Java](https://img.shields.io/badge/Java-17%2B-blue.svg)](https://www.oracle.com/java/)
[![AWS CDK](https://img.shields.io/badge/AWS%20CDK-latest-orange.svg)](https://aws.amazon.com/cdk/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-Enabled-blueviolet.svg)](https://opentelemetry.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Observability-F46800.svg)](https://grafana.com/)

</div>

AWS CDK application written in Java that provisions an Amazon EKS (Elastic Kubernetes
Service) cluster with managed addons, custom helm charts, observability integration, and node groups.

## 📋 Overview

The application creates:

- An EKS cluster with RBAC configuration
- AWS Managed EKS addons (VPC CNI, EBS CSI Driver, CoreDNS, Kube Proxy, Pod Identity Agent, CloudWatch Container
  Insights)
- Helm chart-based addons (cert-manager, AWS Load Balancer Controller, Karpenter, CSI Secrets Store)
- Grafana Cloud observability integration
- Managed node groups with Bottlerocket AMIs
- SQS queue for node interruption handling

## 🚀 Prerequisites

- Java 17 or higher
- AWS CLI configured with appropriate credentials
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Maven installed

## 📝 Useful Commands

```bash
mvn package          # Compile and run tests
cdk ls               # List all stacks in the app
cdk synth            # Emit synthesized CloudFormation template
cdk deploy           # Deploy this stack to your default AWS account/region
cdk diff             # Compare deployed stack with current state
cdk docs             # Open CDK documentation
```

## ⚙️ Configuration

### CDK Context Configuration

The application uses CDK context for configuration. A template file `cdk.context.template.json` is provided which needs
to be copied to `cdk.context.json` and configured with your specific values.

To set up your configuration:

```bash
cp cdk.context.template.json cdk.context.json
```

Then edit `cdk.context.json` with your specific values.

### Understanding the Context Configuration

The context configuration is divided into several sections:

#### 1. Host and Hosted Environment Configuration

```json
"host:id": "xyz",
"host:organization": "stxkxs",
"host:account": "000000000000",
"host:region": "us-west-2",
"host:name": "vanilla",
"host:alias": "eks",
"host:environment": "prototype",
"host:version": "v1",
"host:domain": "stxkxs.io",
"hosted:id": "fff",
"hosted:organization": "data",
"hosted:account": "000000000000",
"hosted:region": "us-west-2",
"hosted:name": "data",
"hosted:alias": "analytics",
"hosted:environment": "prototype",
"hosted:version": "v1",
"hosted:domain": "data.stxkxs.io",
```

These values define your infrastructure organization:

- **Account and Region**: `hosted:account` and `hosted:region` must correspond to a valid AWS account and region where
  resources will be deployed.
- **Environment and Version**: `hosted:environment` and `hosted:version` map to resource configurations in the project
  structure at `resources/environment/version/`. This allows for flexible environment configurations by pointing to
  different configuration files based on the environment and version values (e.g., `resources/prototype/v1/` will
  contain configurations for a prototype v1 environment).
- **IDs and Names**: These are used for resource naming and tagging throughout the deployment.
- **Domains**: Used for DNS configuration, labeling, and tagging purposes.

#### 2. Grafana Cloud Integration

```json
"hosted:eks:grafana:instanceId":"000000",
"hosted:eks:grafana:key": "glc_xyz",
"hosted:eks:grafana:lokiHost": "https://logs-prod-000.grafana.net",
"hosted:eks:grafana:lokiUsername": "000000",
"hosted:eks:grafana:prometheusHost": "https://prometheus-prod-000-prod-us-west-0.grafana.net",
"hosted:eks:grafana:prometheusUsername":"0000000",
"hosted:eks:grafana:tempoHost": "https://tempo-prod-000-prod-us-west-0.grafana.net/tempo",
"hosted:eks:grafana:tempoUsername": "000000",
"hosted:eks:grafana:pyroscopeHost": "https://profiles-prod-000.grafana.net:443",
"hosted:eks:grafana:fleetManagementHost": "https://fleet-management-prod-000.grafana.net",
```

These configuration values integrate your EKS cluster with Grafana Cloud for comprehensive observability:

1. **Setting up Grafana Cloud**:
    - Sign up for a Grafana Cloud account at https://grafana.com/
    - Create a new stack
    - Navigate to your stack settings

2. **Retrieving Grafana Cloud values**:
    - `instanceId`: Found in your Grafana Cloud stack details page. This is a unique identifier for your Grafana
      instance.
    - `key`: Create an API key with appropriate permissions in the "API Keys" section of your Grafana Cloud account.
      This key is used for authentication and should start with "glc_".
    - `lokiHost` and `lokiUsername`: In Grafana Cloud UI, navigate to Logs > Data Sources > Loki details. The lokiHost
      is the endpoint URL for sending logs, and the lokiUsername is your account identifier.
    - `prometheusHost` and `prometheusUsername`: In Grafana Cloud UI, navigate to Metrics > Data Sources > Prometheus
      details. Similar to Loki, these are endpoint and authentication details for metrics.
    - `tempoHost` and `tempoUsername`: In Grafana Cloud UI, navigate to Traces > Data Sources > Tempo details. These
      values configure the trace collection endpoint.
    - `pyroscopeHost`: In Grafana Cloud UI, navigate to Profiles > Connect a data source. This endpoint is used for
      continuous profiling.
    - `fleetManagementHost`: Available in your stack settings, this is used for managing agents.

These values are used by the Grafana Kubernetes Monitoring Helm chart (k8s-monitoring) to configure the Grafana Agent
properly for sending metrics, logs, and traces to your Grafana Cloud instance.

#### 3. Cluster Access Configuration

```json
"hosted:eks:administrators": [
    {
        "username": "administrator001",
        "role": "arn:aws:iam::000000000000:role/AWSReservedSSO_AdministratorAccess_abc",
        "email": "user@aol.com"
    }
],
"hosted:eks:users": [],
```

This section configures cluster access through AWS IAM roles:

- **Administrators**: IAM roles that will have full admin access to the cluster
    - `username`: Used for identifying the user in Kubernetes RBAC
    - `role`: AWS IAM role ARN (typically from AWS SSO) that will be mapped to admin permissions through aws-auth
      configmap
    - `email`: For identification and traceability purposes

- **Users**: Similar structure for regular users with read-only access (currently empty)
    - When populated, users will be granted the "eks:read-only" RBAC role in the cluster

This setup implements a multi-tenant approach where different users can have different levels of access to the cluster
based on their AWS IAM roles.

## 🧰 Project Structure

The application follows a modular structure:

```
project-root/
├── src/main/java/io/stxkxs/infrastructure/
│   ├── stack/             # CDK stack definitions
│   │   └── Eks.java       # Main EKS stack
│   ├── construct/         # CDK constructs for different components
│   │   └── eks/           # EKS-specific constructs
│   │       ├── AddonsConstruct.java
│   │       ├── ManagedAddonsConstruct.java
│   │       ├── NodeGroupsConstruct.java
│   │       └── ObservabilityConstruct.java
│   ├── model/             # Model classes
│   ├── conf/              # Configuration classes
│   └── serialization/     # Serialization utilities
├── resources/
│   └── environment/       # Environment-specific configurations
│       └── version/       # Version-specific configurations
└── cdk.context.template.json
```

## 🏗️ Building and Deployment

To build and deploy the stack:

1. Configure your `cdk.context.json` file as described above

2. Build the project:
   ```bash
   mvn package
   ```

3. Synthesize the CloudFormation template (optional but recommended to verify):
   ```bash
   cdk synth
   ```

4. Deploy the stack:
   ```bash
   cdk deploy
   ```

## 🔌 Detailed Addon Information

The EKS cluster comes equipped with a comprehensive set of addons and features:

### AWS Managed Add-ons

These are managed by AWS EKS and deployed through the ManagedAddonsConstruct:

| Addon                  | Version            | Purpose                                                                                                                                                                                |
|------------------------|--------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **VPC CNI**            | v1.19.3-eksbuild.1 | Provides networking for pods using Amazon VPC networking. Configures pod networking with AWS IAM role for service account. IAM policy: AmazonEKS_CNI_Policy                            |
| **EBS CSI Driver**     | v1.41.0-eksbuild.1 | Manages Amazon EBS volumes for persistent storage. Includes KMS integration for volume encryption. IAM policy: AmazonEBSCSIDriverPolicy. Creates a custom storage class as the default |
| **CoreDNS**            | v1.11.4-eksbuild.2 | Kubernetes cluster DNS for service discovery. Manages internal DNS resolution within the cluster                                                                                       |
| **Kube Proxy**         | v1.32.0-eksbuild.2 | Network proxy that maintains network rules on nodes. Handles internal Kubernetes networking for services                                                                               |
| **Pod Identity Agent** | v1.3.5-eksbuild.2  | Enables IAM Roles for Service Accounts (IRSA). Provides IAM credentials to pods based on service account                                                                               |
| **Container Insights** | v3.6.0-eksbuild.2  | AWS CloudWatch integration for container monitoring. Collects metrics, logs, and traces for AWS X-Ray. IAM policies: CloudWatchAgentServerPolicy, AWSXrayWriteOnlyAccess               |

### Helm Chart Add-ons

Deployed through the AddonsConstruct:

| Chart                            | Version | Namespace         | Purpose                                                                                                                                                |
|----------------------------------|---------|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| **cert-manager**                 | v1.17.1 | cert-manager      | Automates certificate management within Kubernetes. Handles TLS certificate issuance and renewal                                                       |
| **CSI Secrets Store**            | 1.4.8   | aws-secrets-store | Interface between CSI volume and secrets stores. Allows mounting secrets, keys, and certs                                                              |
| **AWS Secrets Store Provider**   | 0.3.11  | aws-secrets-store | AWS provider for CSI Secrets Store. Enables pods to access AWS Secrets Manager and SSM Parameter Store                                                 |
| **Karpenter**                    | 1.3.2   | kube-system       | Advanced Kubernetes autoscaler. Manages node provisioning and termination. Scales nodes based on pending pods. Uses SQS for node interruption handling |
| **AWS Load Balancer Controller** | 1.11.0  | aws-load-balancer | Manages AWS Elastic Load Balancers for Kubernetes services. Handles AWS ALB and NLB resources. Provides support for Ingress and Service resources      |
| **Grafana k8s-monitoring**       | 2.0.18  | monitoring        | Deploys Grafana Agent for complete observability. Collects metrics, logs, and traces. Integrates with Grafana Cloud                                    |

## 💻 Node Groups

The cluster includes a managed node group with the following configuration:

- **Name**: {hosted:id}-core-node
- **AMI Type**: Bottlerocket AMI (bottlerocket_x86_64)
    - Bottlerocket is a purpose-built container OS with improved security and reduced management overhead
- **Instance Type**: m5a.large
- **Capacity Type**: On-demand instances
- **Scaling**:
    - Initial Size: 2 nodes
    - Minimum: 2 nodes
    - Maximum: 6 nodes
- **IAM Policies**:
    - AmazonEKSWorkerNodePolicy
    - AmazonEC2ContainerRegistryReadOnly
    - AmazonSSMManagedInstanceCore
- **Labels**:
    - Resource type, category, component, and part-of labels
    - Karpenter discovery label for autoscaling

## 🔄 Working with the EKS Cluster

After deployment, you can interact with your EKS cluster using kubectl:

```bash
aws eks update-kubeconfig --name fff-eks --region us-west-2
kubectl get nodes
kubectl get pods -A
```

Verify the addons are deployed:

```bash
kubectl get pods -n kube-system
kubectl get pods -n cert-manager
kubectl get pods -n aws-load-balancer
kubectl get pods -n monitoring
```

## 🛠️ Customization

To customize the deployment:

1. Modify the appropriate template files:
    - `addons.mustache` for add-on configurations (Helm charts, managed addons)
    - `node-groups.mustache` for node group configurations

2. Update the environment-specific configurations in the `resources/environment/version/` directory

3. For example, to modify the addon versions, edit the version fields in `addons.mustache`

## 🚀 Karpenter Node Autoscaling

This EKS cluster includes Karpenter v1.3.2, a flexible and high-performance Kubernetes node autoscaler designed to
improve application availability and cluster efficiency.

### Karpenter Configuration

The deployed Karpenter configuration includes:

```yaml
nodeSelector:
  "eks.amazonaws.com/nodegroup": {{hosted:id}}-core-node
settings:
  clusterName: {{hosted:id}}-eks
  interruptionQueue: {{hosted:id}}-karpenter
serviceAccount:
  create: false
  name: {{hosted:id}}-karpenter-sa
logLevel: debug
```

### SQS Interruption Queue

The stack creates an SQS queue (`{{hosted:id}}-karpenter`) that handles node interruption events:

- EC2 health events
- Spot instance interruption warnings
- Instance rebalance recommendations
- EC2 instance state changes

### Leveraging Karpenter with Your VPC

To effectively use Karpenter with this deployment:

#### 1. Create NodePools

After deployment, create Karpenter NodePools to define the EC2 instance types and configurations for dynamic scaling:

```yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      nodeClassRef:
        name: default
      requirements:
        - key: "karpenter.sh/capacity-type"
          operator: In
          values: [ "spot", "on-demand" ]
        - key: "kubernetes.io/arch"
          operator: In
          values: [ "amd64" ]
        - key: "karpenter.k8s.aws/instance-category"
          operator: In
          values: [ "c", "m", "r" ]
        - key: "karpenter.k8s.aws/instance-generation"
          operator: Gt
          values: [ "4" ]
  disruption:
    consolidationPolicy: WhenEmpty
    consolidateAfter: 30s
  limits:
    cpu: "1000"
    memory: 1000Gi
  weight: 10
```

```yaml
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: Bottlerocket
  role: {{hosted:id}}-core-node
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: {{hosted:id}}-vpc
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: {{hosted:id}}-vpc
  tags:
    karpenter.sh/discovery: {{hosted:id}}-vpc
```

#### 2. VPC Integration

The VPC configuration already includes necessary tagging for Karpenter:

- The VPC has a tag `karpenter.sh/discovery: {{hosted:id}}-vpc`
- Both public and private subnets have the tag `karpenter.sh/discovery: {{hosted:id}}-vpc`

These tags enable Karpenter to discover the appropriate networking resources when provisioning nodes.

##### Public vs. Private Subnet Configuration

When configuring Karpenter's `EC2NodeClass`, you can choose which subnets to use based on your requirements:

- **Private Subnets (Recommended)**: For most production workloads, use only private subnets for enhanced security
  ```yaml
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: {{hosted:id}}-vpc
        aws-cdk:subnet-type: Private
  ```

- **Public Subnets**: Only use when nodes need direct internet access (rarely needed)
  ```yaml
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: {{hosted:id}}-vpc
        aws-cdk:subnet-type: Public
  ```

- **Both Subnet Types**: Not recommended for most deployments
  ```yaml
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: {{hosted:id}}-vpc
  ```

**Important**: If you're only going to use one subnet type, always prefer private subnets for security best practices.
Nodes in private subnets can still access the internet via NAT gateways while remaining protected from direct inbound
traffic.

#### 3. Understanding Karpenter's Scaling Behavior

With this deployment, Karpenter will:

- Monitor for pods that cannot be scheduled
- Provision right-sized nodes based on pod requirements
- Use the interruption queue to gracefully handle node disruptions
- Respect the NodePool constraints for instance selection
- Run on the core nodes (via the nodeSelector configuration)

#### 4. Optimizing Cost and Performance

To optimize for both cost and performance:

- Use mixed instance types in your NodePools
- Specify both spot and on-demand capacity types
- Set appropriate resource limits in NodePools
- Use consolidation to remove underutilized nodes

#### 5. Monitoring Karpenter

Monitor Karpenter's behavior using:

```bash
# view karpenter logs
kubectl logs -n kube-system deployment/karpenter

# view current nodepools
kubectl get nodepool

# view nodeclaims (provisioned/provisioning nodes)
kubectl get nodeclaim

# check sqs interruption queue metrics in cloudwatch
```

#### 6. Karpenter IAM Permissions

The deployment configures comprehensive IAM permissions for Karpenter, allowing it to:

- Create, modify, and terminate EC2 instances
- Create and manage launch templates
- Discover and use subnets, security groups, and AMIs
- Access the interruption queue
- Describe the EKS cluster endpoint

These permissions are scoped to resources with specific tags, following security best practices.

#### 7. Integration with Core Node Group

The core managed node group (`{{hosted:id}}-core-node`) serves as the foundation for running Karpenter and other
critical cluster components, while Karpenter dynamically provisions additional nodes as needed for workloads.

This hybrid approach provides both stability for system components and flexibility for application scaling.

## 📊 CloudWatch Dashboard

The EKS CDK application automatically creates an AWS CloudWatch dashboard to monitor your EKS cluster. This dashboard
provides visibility into various metrics and operational data from your cluster.

### Dashboard Features

The dashboard includes several key sections:

- Cluster-level metrics (CPU, memory utilization)
- Node group metrics
- Pod metrics
- Container insights data
- Alarm status

### Accessing the Dashboard

To access the CloudWatch dashboard for your EKS cluster:

1. Log in to the AWS Management Console
2. Navigate to the CloudWatch service
3. In the left navigation pane, select "Dashboards"
4. Find and select the dashboard named `{{hosted:id}}-eks-dashboard` (will be something like `fff-eks-dashboard` based
   on your configuration)

Alternatively, you can access it directly via URL:

```
https://{{hosted:region}}.console.aws.amazon.com/cloudwatch/home?region={{hosted:region}}#dashboards:name={{hosted:id}}-eks-monitoring
```

For example, with your configuration it would be:

```
https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#dashboards:name={{hosted:id}}-eks-monitoring
```

### Using the Dashboard

The dashboard offers a consolidated view of your cluster's health and performance. You can:

- Monitor resource utilization trends
- Identify performance bottlenecks
- Track the health of your EKS components
- Set up additional alarms based on the metrics displayed

The metrics collected by Container Insights are automatically populated in this dashboard, providing you with a
comprehensive monitoring solution without additional configuration.

## 🔧 Troubleshooting

Common issues:

1. **Deployment fails due to IAM permissions**:
    - Error: "User: XYZ is not authorized to perform: iam:CreateRole"
    - Solution: Ensure your AWS credentials have sufficient permissions

2. **EKS cluster creation timeout**:
    - EKS cluster creation can take 15-20 minutes
    - Check CloudFormation console for detailed status

3. **Node group fails to join cluster**:
    - Check the instance role has the necessary permissions
    - Review the CloudWatch logs for the node bootstrap process

4. **Grafana integration fails**:
    - Verify your Grafana Cloud credentials in the context file
    - Check the Grafana Agent pods in the monitoring namespace
    - Review logs: `kubectl logs -n monitoring deployment/k8s-monitoring-grafana-agent`

5. **AWS Load Balancer Controller issues**:
    - Check controller logs: `kubectl logs -n aws-load-balancer deployment/aws-load-balancer-controller`
    - Verify IAM permissions for the controller

## 🧪 Building and Running Locally

To build and run locally:

```bash
# Build the project
mvn clean package

# Run the main application (synthesizes CloudFormation template)
mvn exec:java -Dexec.mainClass="io.stxkxs.infrastructure.Launch"

# Deploy using CDK
cdk deploy
```

## 📜 License

This project is licensed under the [MIT License](LICENSE).

For your convenience, you can find the full MIT License text at:

- [https://opensource.org/license/mit/](https://opensource.org/license/mit/) (Official OSI website)
- [https://choosealicense.com/licenses/mit/](https://choosealicense.com/licenses/mit/) (Choose a License website)

To apply this license to your project, create a file named `LICENSE` in your project's root directory with the MIT
License text, replacing `[year]` with the current year and `[fullname]` with your name or organization.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.