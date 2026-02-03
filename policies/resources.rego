# Resource Policies for Kubernetes
# These policies enforce resource management best practices
#
# Usage with Gatekeeper:
#   kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/master/deploy/gatekeeper.yaml
#   kubectl apply -f policies/templates/
#
# Usage with Conftest:
#   conftest test deployment.yaml --policy policies/

package kubernetes.resources

import future.keywords.in
import future.keywords.contains
import future.keywords.if
import future.keywords.every

# =============================================================================
# Resource Limits Policy
# =============================================================================

# Deny containers without CPU limits
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not container.resources.limits.cpu
    msg := sprintf("Container '%s' must have CPU limits. Add resources.limits.cpu.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not container.resources.limits.cpu
    msg := sprintf("Container '%s' must have CPU limits. Add resources.limits.cpu.", [container.name])
}

# Deny containers without memory limits
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not container.resources.limits.memory
    msg := sprintf("Container '%s' must have memory limits. Add resources.limits.memory.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not container.resources.limits.memory
    msg := sprintf("Container '%s' must have memory limits. Add resources.limits.memory.", [container.name])
}

# =============================================================================
# Resource Requests Policy
# =============================================================================

# Deny containers without CPU requests
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not container.resources.requests.cpu
    msg := sprintf("Container '%s' must have CPU requests. Add resources.requests.cpu.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not container.resources.requests.cpu
    msg := sprintf("Container '%s' must have CPU requests. Add resources.requests.cpu.", [container.name])
}

# Deny containers without memory requests
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not container.resources.requests.memory
    msg := sprintf("Container '%s' must have memory requests. Add resources.requests.memory.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not container.resources.requests.memory
    msg := sprintf("Container '%s' must have memory requests. Add resources.requests.memory.", [container.name])
}

# =============================================================================
# Resource Ratio Policy (Limits should not exceed 2x requests)
# =============================================================================

# Parse CPU value to millicores
parse_cpu(cpu) := result if {
    endswith(cpu, "m")
    result := to_number(trim_suffix(cpu, "m"))
}

parse_cpu(cpu) := result if {
    not endswith(cpu, "m")
    result := to_number(cpu) * 1000
}

# Parse memory value to Mi
parse_memory(mem) := result if {
    endswith(mem, "Mi")
    result := to_number(trim_suffix(mem, "Mi"))
}

parse_memory(mem) := result if {
    endswith(mem, "Gi")
    result := to_number(trim_suffix(mem, "Gi")) * 1024
}

parse_memory(mem) := result if {
    endswith(mem, "Ki")
    result := to_number(trim_suffix(mem, "Ki")) / 1024
}

parse_memory(mem) := result if {
    endswith(mem, "M")
    result := to_number(trim_suffix(mem, "M"))
}

parse_memory(mem) := result if {
    endswith(mem, "G")
    result := to_number(trim_suffix(mem, "G")) * 1024
}

# Warn if CPU limit exceeds 4x request (excessive overcommit)
warn contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    container.resources.limits.cpu
    container.resources.requests.cpu
    cpu_limit := parse_cpu(container.resources.limits.cpu)
    cpu_request := parse_cpu(container.resources.requests.cpu)
    cpu_limit > cpu_request * 4
    msg := sprintf("Container '%s' CPU limit (%s) is more than 4x the request (%s). Consider reducing the limit.", [container.name, container.resources.limits.cpu, container.resources.requests.cpu])
}

warn contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    container.resources.limits.cpu
    container.resources.requests.cpu
    cpu_limit := parse_cpu(container.resources.limits.cpu)
    cpu_request := parse_cpu(container.resources.requests.cpu)
    cpu_limit > cpu_request * 4
    msg := sprintf("Container '%s' CPU limit (%s) is more than 4x the request (%s). Consider reducing the limit.", [container.name, container.resources.limits.cpu, container.resources.requests.cpu])
}

# =============================================================================
# Required Labels Policy
# =============================================================================

required_labels := ["owner", "team", "environment"]

# Deny workloads without required labels
deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "CronJob"]
    some label in required_labels
    not input.metadata.labels[label]
    msg := sprintf("Missing required label '%s' on %s/%s", [label, input.kind, input.metadata.name])
}

# Deny workloads without app.kubernetes.io/name label
deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "CronJob"]
    not input.metadata.labels["app.kubernetes.io/name"]
    msg := sprintf("Missing required label 'app.kubernetes.io/name' on %s/%s", [input.kind, input.metadata.name])
}

# =============================================================================
# Liveness and Readiness Probes Policy
# =============================================================================

# Deny containers without liveness probe
deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet"]
    some container in input.spec.template.spec.containers
    not container.livenessProbe
    msg := sprintf("Container '%s' must have a liveness probe. Add livenessProbe configuration.", [container.name])
}

# Deny containers without readiness probe
deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet"]
    some container in input.spec.template.spec.containers
    not container.readinessProbe
    msg := sprintf("Container '%s' must have a readiness probe. Add readinessProbe configuration.", [container.name])
}

# =============================================================================
# Replica Count Policy
# =============================================================================

# Warn if production deployment has fewer than 2 replicas
warn contains msg if {
    input.kind == "Deployment"
    input.metadata.labels.environment == "production"
    input.spec.replicas < 2
    msg := sprintf("Production deployment '%s' should have at least 2 replicas for high availability.", [input.metadata.name])
}

# =============================================================================
# Pod Disruption Budget Policy
# =============================================================================

# Warn if production deployment doesn't have a PDB
# Note: This would need to check for PDB existence separately

# =============================================================================
# Resource Quota Enforcement
# =============================================================================

# Maximum CPU limit per container (4 cores)
max_cpu_limit := 4000  # millicores

deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    container.resources.limits.cpu
    cpu_limit := parse_cpu(container.resources.limits.cpu)
    cpu_limit > max_cpu_limit
    msg := sprintf("Container '%s' CPU limit (%s) exceeds maximum allowed (%dm). Reduce the limit.", [container.name, container.resources.limits.cpu, max_cpu_limit])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    container.resources.limits.cpu
    cpu_limit := parse_cpu(container.resources.limits.cpu)
    cpu_limit > max_cpu_limit
    msg := sprintf("Container '%s' CPU limit (%s) exceeds maximum allowed (%dm). Reduce the limit.", [container.name, container.resources.limits.cpu, max_cpu_limit])
}

# Maximum memory limit per container (8Gi)
max_memory_limit := 8192  # Mi

deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    container.resources.limits.memory
    mem_limit := parse_memory(container.resources.limits.memory)
    mem_limit > max_memory_limit
    msg := sprintf("Container '%s' memory limit (%s) exceeds maximum allowed (%dMi). Reduce the limit.", [container.name, container.resources.limits.memory, max_memory_limit])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    container.resources.limits.memory
    mem_limit := parse_memory(container.resources.limits.memory)
    mem_limit > max_memory_limit
    msg := sprintf("Container '%s' memory limit (%s) exceeds maximum allowed (%dMi). Reduce the limit.", [container.name, container.resources.limits.memory, max_memory_limit])
}

# =============================================================================
# Ephemeral Storage Policy
# =============================================================================

# Warn if ephemeral storage limits are not set
warn contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not container.resources.limits["ephemeral-storage"]
    msg := sprintf("Container '%s' should have ephemeral-storage limits to prevent disk exhaustion.", [container.name])
}

warn contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not container.resources.limits["ephemeral-storage"]
    msg := sprintf("Container '%s' should have ephemeral-storage limits to prevent disk exhaustion.", [container.name])
}

# =============================================================================
# Init Container Resources Policy
# =============================================================================

# Deny init containers without resource limits
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.initContainers
    not container.resources.limits.cpu
    msg := sprintf("Init container '%s' must have CPU limits.", [container.name])
}

deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.initContainers
    not container.resources.limits.memory
    msg := sprintf("Init container '%s' must have memory limits.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.initContainers
    not container.resources.limits.cpu
    msg := sprintf("Init container '%s' must have CPU limits.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.initContainers
    not container.resources.limits.memory
    msg := sprintf("Init container '%s' must have memory limits.", [container.name])
}
