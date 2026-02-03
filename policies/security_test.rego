# Unit tests for security.rego
# Run with: opa test policies/ -v

package kubernetes.security

import future.keywords.in

# =============================================================================
# Test: Privileged Container Policy
# =============================================================================

test_deny_privileged_pod if {
    deny["Container 'test' is privileged. Privileged containers are not allowed."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {"privileged": true}
            }]
        }
    }
}

test_allow_non_privileged_pod if {
    count(deny) == 0 with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {
                    "privileged": false,
                    "runAsNonRoot": true,
                    "readOnlyRootFilesystem": true,
                    "allowPrivilegeEscalation": false,
                    "capabilities": {"drop": ["ALL"]}
                }
            }]
        }
    }
}

test_deny_privileged_deployment if {
    deny["Container 'app' is privileged. Privileged containers are not allowed."] with input as {
        "kind": "Deployment",
        "metadata": {"name": "test-deploy"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "securityContext": {"privileged": true}
                    }]
                }
            }
        }
    }
}

# =============================================================================
# Test: Privilege Escalation Policy
# =============================================================================

test_deny_privilege_escalation if {
    deny["Container 'test' allows privilege escalation. Set allowPrivilegeEscalation to false."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {"allowPrivilegeEscalation": true}
            }]
        }
    }
}

# =============================================================================
# Test: Run as Non-Root Policy
# =============================================================================

test_deny_run_as_root if {
    deny["Container 'test' must run as non-root. Set runAsNonRoot to true."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {}
            }]
        }
    }
}

test_allow_run_as_non_root if {
    result := deny with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {
                    "runAsNonRoot": true,
                    "readOnlyRootFilesystem": true,
                    "allowPrivilegeEscalation": false,
                    "capabilities": {"drop": ["ALL"]}
                }
            }]
        }
    }
    not "Container 'test' must run as non-root. Set runAsNonRoot to true." in result
}

# =============================================================================
# Test: Read-Only Root Filesystem Policy
# =============================================================================

test_deny_writable_rootfs if {
    deny["Container 'test' must have a read-only root filesystem. Set readOnlyRootFilesystem to true."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {}
            }]
        }
    }
}

# =============================================================================
# Test: Capabilities Policy
# =============================================================================

test_deny_missing_drop_all if {
    deny["Container 'test' must drop ALL capabilities. Add 'ALL' to securityContext.capabilities.drop."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {
                    "capabilities": {"drop": ["NET_RAW"]}
                }
            }]
        }
    }
}

test_allow_drop_all_capabilities if {
    result := deny with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {
                    "runAsNonRoot": true,
                    "readOnlyRootFilesystem": true,
                    "allowPrivilegeEscalation": false,
                    "capabilities": {"drop": ["ALL"]}
                }
            }]
        }
    }
    not "Container 'test' must drop ALL capabilities. Add 'ALL' to securityContext.capabilities.drop." in result
}

test_deny_dangerous_capability if {
    deny["Container 'test' adds dangerous capability 'SYS_ADMIN'. This capability is not allowed."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {
                    "capabilities": {
                        "add": ["SYS_ADMIN"],
                        "drop": ["ALL"]
                    }
                }
            }]
        }
    }
}

test_deny_net_admin_capability if {
    deny["Container 'test' adds dangerous capability 'NET_ADMIN'. This capability is not allowed."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "securityContext": {
                    "capabilities": {
                        "add": ["NET_ADMIN"],
                        "drop": ["ALL"]
                    }
                }
            }]
        }
    }
}

# =============================================================================
# Test: Host Namespace Policies
# =============================================================================

test_deny_host_network if {
    deny["Host network is not allowed. Set spec.hostNetwork to false."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "hostNetwork": true,
            "containers": [{
                "name": "test",
                "image": "nginx:1.21"
            }]
        }
    }
}

test_deny_host_pid if {
    deny["Host PID namespace is not allowed. Set spec.hostPID to false."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "hostPID": true,
            "containers": [{
                "name": "test",
                "image": "nginx:1.21"
            }]
        }
    }
}

test_deny_host_ipc if {
    deny["Host IPC namespace is not allowed. Set spec.hostIPC to false."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "hostIPC": true,
            "containers": [{
                "name": "test",
                "image": "nginx:1.21"
            }]
        }
    }
}

# =============================================================================
# Test: Host Path Volumes Policy
# =============================================================================

test_deny_host_path_volume if {
    deny["Host path volume 'host-vol' is not allowed. Use persistent volumes instead."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "volumes": [{
                "name": "host-vol",
                "hostPath": {"path": "/var/log"}
            }],
            "containers": [{
                "name": "test",
                "image": "nginx:1.21"
            }]
        }
    }
}

# =============================================================================
# Test: Host Ports Policy
# =============================================================================

test_deny_host_port if {
    deny["Container 'test' uses host port 80. Host ports are not allowed."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "ports": [{
                    "containerPort": 80,
                    "hostPort": 80
                }]
            }]
        }
    }
}

# =============================================================================
# Test: Image Policy (Latest Tag)
# =============================================================================

test_deny_latest_tag_explicit if {
    deny["Container 'test' uses 'latest' tag. Use a specific version tag instead."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:latest"
            }]
        }
    }
}

test_deny_latest_tag_implicit if {
    deny["Container 'test' uses 'latest' tag. Use a specific version tag instead."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx"
            }]
        }
    }
}

test_allow_specific_tag if {
    result := deny with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21.0",
                "securityContext": {
                    "runAsNonRoot": true,
                    "readOnlyRootFilesystem": true,
                    "allowPrivilegeEscalation": false,
                    "capabilities": {"drop": ["ALL"]}
                }
            }]
        }
    }
    not "Container 'test' uses 'latest' tag. Use a specific version tag instead." in result
}

# =============================================================================
# Test: Approved Registries Policy (warnings)
# =============================================================================

test_warn_unapproved_registry if {
    warn["Container 'test' uses image from unapproved registry: custom-registry.io/nginx:1.21"] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "custom-registry.io/nginx:1.21"
            }]
        }
    }
}

test_no_warn_approved_registry if {
    count(warn) == 0 with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "gcr.io/my-project/nginx:1.21"
            }]
        }
    }
}

# =============================================================================
# Test: Deployment-specific tests
# =============================================================================

test_deny_privileged_statefulset if {
    deny["Container 'db' is privileged. Privileged containers are not allowed."] with input as {
        "kind": "StatefulSet",
        "metadata": {"name": "test-ss"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "db",
                        "image": "postgres:14",
                        "securityContext": {"privileged": true}
                    }]
                }
            }
        }
    }
}

test_deny_host_network_daemonset if {
    deny["Host network is not allowed. Set spec.template.spec.hostNetwork to false."] with input as {
        "kind": "DaemonSet",
        "metadata": {"name": "test-ds"},
        "spec": {
            "template": {
                "spec": {
                    "hostNetwork": true,
                    "containers": [{
                        "name": "agent",
                        "image": "agent:1.0"
                    }]
                }
            }
        }
    }
}
