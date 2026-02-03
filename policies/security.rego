# Security Policies for Kubernetes
# These policies enforce security best practices for containers and pods
#
# Usage with Gatekeeper:
#   kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/master/deploy/gatekeeper.yaml
#   kubectl apply -f policies/templates/
#
# Usage with Conftest:
#   conftest test deployment.yaml --policy policies/

package kubernetes.security

import future.keywords.in
import future.keywords.contains
import future.keywords.if
import future.keywords.every

# =============================================================================
# Privileged Container Policy
# =============================================================================

# Deny privileged containers
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    container.securityContext.privileged == true
    msg := sprintf("Container '%s' is privileged. Privileged containers are not allowed.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    container.securityContext.privileged == true
    msg := sprintf("Container '%s' is privileged. Privileged containers are not allowed.", [container.name])
}

# =============================================================================
# Privilege Escalation Policy
# =============================================================================

# Deny containers that allow privilege escalation
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    container.securityContext.allowPrivilegeEscalation == true
    msg := sprintf("Container '%s' allows privilege escalation. Set allowPrivilegeEscalation to false.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    container.securityContext.allowPrivilegeEscalation == true
    msg := sprintf("Container '%s' allows privilege escalation. Set allowPrivilegeEscalation to false.", [container.name])
}

# =============================================================================
# Run as Non-Root Policy
# =============================================================================

# Deny containers running as root
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not container.securityContext.runAsNonRoot
    msg := sprintf("Container '%s' must run as non-root. Set runAsNonRoot to true.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not container.securityContext.runAsNonRoot
    msg := sprintf("Container '%s' must run as non-root. Set runAsNonRoot to true.", [container.name])
}

# =============================================================================
# Read-Only Root Filesystem Policy
# =============================================================================

# Deny containers without read-only root filesystem
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not container.securityContext.readOnlyRootFilesystem
    msg := sprintf("Container '%s' must have a read-only root filesystem. Set readOnlyRootFilesystem to true.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not container.securityContext.readOnlyRootFilesystem
    msg := sprintf("Container '%s' must have a read-only root filesystem. Set readOnlyRootFilesystem to true.", [container.name])
}

# =============================================================================
# Capabilities Policy
# =============================================================================

# Deny containers that don't drop ALL capabilities
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not capabilities_dropped_all(container)
    msg := sprintf("Container '%s' must drop ALL capabilities. Add 'ALL' to securityContext.capabilities.drop.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not capabilities_dropped_all(container)
    msg := sprintf("Container '%s' must drop ALL capabilities. Add 'ALL' to securityContext.capabilities.drop.", [container.name])
}

capabilities_dropped_all(container) if {
    "ALL" in container.securityContext.capabilities.drop
}

# Deny dangerous capabilities
dangerous_capabilities := [
    "CAP_SYS_ADMIN",
    "CAP_NET_ADMIN",
    "CAP_SYS_PTRACE",
    "CAP_SYS_MODULE",
    "CAP_SYS_RAWIO",
    "CAP_SYS_BOOT",
    "CAP_MKNOD",
    "CAP_NET_RAW",
    "SYS_ADMIN",
    "NET_ADMIN",
    "SYS_PTRACE",
    "SYS_MODULE",
    "SYS_RAWIO",
    "SYS_BOOT",
    "MKNOD",
    "NET_RAW"
]

deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    some cap in container.securityContext.capabilities.add
    cap in dangerous_capabilities
    msg := sprintf("Container '%s' adds dangerous capability '%s'. This capability is not allowed.", [container.name, cap])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    some cap in container.securityContext.capabilities.add
    cap in dangerous_capabilities
    msg := sprintf("Container '%s' adds dangerous capability '%s'. This capability is not allowed.", [container.name, cap])
}

# =============================================================================
# Host Namespace Policies
# =============================================================================

# Deny host network
deny contains msg if {
    input.kind == "Pod"
    input.spec.hostNetwork == true
    msg := "Host network is not allowed. Set spec.hostNetwork to false."
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    input.spec.template.spec.hostNetwork == true
    msg := "Host network is not allowed. Set spec.template.spec.hostNetwork to false."
}

# Deny host PID
deny contains msg if {
    input.kind == "Pod"
    input.spec.hostPID == true
    msg := "Host PID namespace is not allowed. Set spec.hostPID to false."
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    input.spec.template.spec.hostPID == true
    msg := "Host PID namespace is not allowed. Set spec.template.spec.hostPID to false."
}

# Deny host IPC
deny contains msg if {
    input.kind == "Pod"
    input.spec.hostIPC == true
    msg := "Host IPC namespace is not allowed. Set spec.hostIPC to false."
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    input.spec.template.spec.hostIPC == true
    msg := "Host IPC namespace is not allowed. Set spec.template.spec.hostIPC to false."
}

# =============================================================================
# Host Path Volumes Policy
# =============================================================================

# Deny host path volumes
deny contains msg if {
    input.kind == "Pod"
    some volume in input.spec.volumes
    volume.hostPath
    msg := sprintf("Host path volume '%s' is not allowed. Use persistent volumes instead.", [volume.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some volume in input.spec.template.spec.volumes
    volume.hostPath
    msg := sprintf("Host path volume '%s' is not allowed. Use persistent volumes instead.", [volume.name])
}

# =============================================================================
# Host Ports Policy
# =============================================================================

# Deny host ports
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    some port in container.ports
    port.hostPort
    msg := sprintf("Container '%s' uses host port %d. Host ports are not allowed.", [container.name, port.hostPort])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    some port in container.ports
    port.hostPort
    msg := sprintf("Container '%s' uses host port %d. Host ports are not allowed.", [container.name, port.hostPort])
}

# =============================================================================
# Image Policy
# =============================================================================

# Deny latest tag
deny contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    image_uses_latest_tag(container.image)
    msg := sprintf("Container '%s' uses 'latest' tag. Use a specific version tag instead.", [container.name])
}

deny contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    image_uses_latest_tag(container.image)
    msg := sprintf("Container '%s' uses 'latest' tag. Use a specific version tag instead.", [container.name])
}

image_uses_latest_tag(image) if {
    endswith(image, ":latest")
}

image_uses_latest_tag(image) if {
    not contains(image, ":")
}

# =============================================================================
# Approved Registries Policy
# =============================================================================

# Define approved registries
approved_registries := [
    "gcr.io",
    "docker.io/library",
    "quay.io",
    "ghcr.io",
    "public.ecr.aws",
    "registry.k8s.io"
]

warn contains msg if {
    input.kind == "Pod"
    some container in input.spec.containers
    not image_from_approved_registry(container.image)
    msg := sprintf("Container '%s' uses image from unapproved registry: %s", [container.name, container.image])
}

warn contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    some container in input.spec.template.spec.containers
    not image_from_approved_registry(container.image)
    msg := sprintf("Container '%s' uses image from unapproved registry: %s", [container.name, container.image])
}

image_from_approved_registry(image) if {
    some registry in approved_registries
    startswith(image, registry)
}

# =============================================================================
# Seccomp Profile Policy
# =============================================================================

# Warn if seccomp profile is not set
warn contains msg if {
    input.kind == "Pod"
    not input.spec.securityContext.seccompProfile
    msg := "Pod should have a seccomp profile. Set spec.securityContext.seccompProfile."
}

warn contains msg if {
    input.kind in ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"]
    not input.spec.template.spec.securityContext.seccompProfile
    msg := "Pod template should have a seccomp profile. Set spec.template.spec.securityContext.seccompProfile."
}
