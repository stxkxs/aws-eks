# Unit tests for resources.rego
# Run with: opa test policies/ -v

package kubernetes.resources

import future.keywords.in

# =============================================================================
# Test: Resource Limits Policy
# =============================================================================

test_deny_missing_cpu_limit if {
    deny["Container 'test' must have CPU limits. Add resources.limits.cpu."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"memory": "128Mi"},
                    "requests": {"cpu": "100m", "memory": "64Mi"}
                }
            }]
        }
    }
}

test_deny_missing_memory_limit if {
    deny["Container 'test' must have memory limits. Add resources.limits.memory."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "500m"},
                    "requests": {"cpu": "100m", "memory": "64Mi"}
                }
            }]
        }
    }
}

test_allow_complete_resources if {
    result := deny with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "500m", "memory": "128Mi"},
                    "requests": {"cpu": "100m", "memory": "64Mi"}
                },
                "livenessProbe": {"httpGet": {"path": "/", "port": 80}},
                "readinessProbe": {"httpGet": {"path": "/", "port": 80}}
            }]
        }
    }
    not "Container 'test' must have CPU limits. Add resources.limits.cpu." in result
    not "Container 'test' must have memory limits. Add resources.limits.memory." in result
}

# =============================================================================
# Test: Resource Requests Policy
# =============================================================================

test_deny_missing_cpu_request if {
    deny["Container 'test' must have CPU requests. Add resources.requests.cpu."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "500m", "memory": "128Mi"},
                    "requests": {"memory": "64Mi"}
                }
            }]
        }
    }
}

test_deny_missing_memory_request if {
    deny["Container 'test' must have memory requests. Add resources.requests.memory."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "500m", "memory": "128Mi"},
                    "requests": {"cpu": "100m"}
                }
            }]
        }
    }
}

# =============================================================================
# Test: Deployment Resource Limits
# =============================================================================

test_deny_deployment_missing_cpu_limit if {
    deny["Container 'app' must have CPU limits. Add resources.limits.cpu."] with input as {
        "kind": "Deployment",
        "metadata": {"name": "test-deploy"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "resources": {
                            "limits": {"memory": "128Mi"}
                        }
                    }]
                }
            }
        }
    }
}

test_deny_statefulset_missing_memory_limit if {
    deny["Container 'db' must have memory limits. Add resources.limits.memory."] with input as {
        "kind": "StatefulSet",
        "metadata": {"name": "test-ss"},
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "db",
                        "image": "postgres:14",
                        "resources": {
                            "limits": {"cpu": "1000m"}
                        }
                    }]
                }
            }
        }
    }
}

# =============================================================================
# Test: Required Labels Policy
# =============================================================================

test_deny_missing_owner_label if {
    deny["Missing required label 'owner' on Deployment/test-deploy"] with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "team": "platform",
                "environment": "dev",
                "app.kubernetes.io/name": "test-app"
            }
        },
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "resources": {
                            "limits": {"cpu": "500m", "memory": "128Mi"},
                            "requests": {"cpu": "100m", "memory": "64Mi"}
                        },
                        "livenessProbe": {"httpGet": {"path": "/", "port": 80}},
                        "readinessProbe": {"httpGet": {"path": "/", "port": 80}}
                    }]
                }
            }
        }
    }
}

test_deny_missing_team_label if {
    deny["Missing required label 'team' on Deployment/test-deploy"] with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "owner": "john@example.com",
                "environment": "dev",
                "app.kubernetes.io/name": "test-app"
            }
        },
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "resources": {
                            "limits": {"cpu": "500m", "memory": "128Mi"},
                            "requests": {"cpu": "100m", "memory": "64Mi"}
                        },
                        "livenessProbe": {"httpGet": {"path": "/", "port": 80}},
                        "readinessProbe": {"httpGet": {"path": "/", "port": 80}}
                    }]
                }
            }
        }
    }
}

test_deny_missing_environment_label if {
    deny["Missing required label 'environment' on Deployment/test-deploy"] with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "owner": "john@example.com",
                "team": "platform",
                "app.kubernetes.io/name": "test-app"
            }
        },
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "resources": {
                            "limits": {"cpu": "500m", "memory": "128Mi"},
                            "requests": {"cpu": "100m", "memory": "64Mi"}
                        },
                        "livenessProbe": {"httpGet": {"path": "/", "port": 80}},
                        "readinessProbe": {"httpGet": {"path": "/", "port": 80}}
                    }]
                }
            }
        }
    }
}

test_deny_missing_app_name_label if {
    deny["Missing required label 'app.kubernetes.io/name' on Deployment/test-deploy"] with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "owner": "john@example.com",
                "team": "platform",
                "environment": "dev"
            }
        },
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "resources": {
                            "limits": {"cpu": "500m", "memory": "128Mi"},
                            "requests": {"cpu": "100m", "memory": "64Mi"}
                        },
                        "livenessProbe": {"httpGet": {"path": "/", "port": 80}},
                        "readinessProbe": {"httpGet": {"path": "/", "port": 80}}
                    }]
                }
            }
        }
    }
}

test_allow_all_required_labels if {
    result := deny with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "owner": "john@example.com",
                "team": "platform",
                "environment": "production",
                "app.kubernetes.io/name": "test-app"
            }
        },
        "spec": {
            "replicas": 2,
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "resources": {
                            "limits": {"cpu": "500m", "memory": "128Mi"},
                            "requests": {"cpu": "100m", "memory": "64Mi"}
                        },
                        "livenessProbe": {"httpGet": {"path": "/", "port": 80}},
                        "readinessProbe": {"httpGet": {"path": "/", "port": 80}}
                    }]
                }
            }
        }
    }
    not "Missing required label 'owner' on Deployment/test-deploy" in result
    not "Missing required label 'team' on Deployment/test-deploy" in result
    not "Missing required label 'environment' on Deployment/test-deploy" in result
    not "Missing required label 'app.kubernetes.io/name' on Deployment/test-deploy" in result
}

# =============================================================================
# Test: Liveness and Readiness Probes Policy
# =============================================================================

test_deny_missing_liveness_probe if {
    deny["Container 'app' must have a liveness probe. Add livenessProbe configuration."] with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "owner": "john@example.com",
                "team": "platform",
                "environment": "dev",
                "app.kubernetes.io/name": "test-app"
            }
        },
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "resources": {
                            "limits": {"cpu": "500m", "memory": "128Mi"},
                            "requests": {"cpu": "100m", "memory": "64Mi"}
                        },
                        "readinessProbe": {"httpGet": {"path": "/", "port": 80}}
                    }]
                }
            }
        }
    }
}

test_deny_missing_readiness_probe if {
    deny["Container 'app' must have a readiness probe. Add readinessProbe configuration."] with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "owner": "john@example.com",
                "team": "platform",
                "environment": "dev",
                "app.kubernetes.io/name": "test-app"
            }
        },
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "app",
                        "image": "nginx:1.21",
                        "resources": {
                            "limits": {"cpu": "500m", "memory": "128Mi"},
                            "requests": {"cpu": "100m", "memory": "64Mi"}
                        },
                        "livenessProbe": {"httpGet": {"path": "/", "port": 80}}
                    }]
                }
            }
        }
    }
}

# =============================================================================
# Test: Resource Quota Enforcement
# =============================================================================

test_deny_excessive_cpu_limit if {
    deny["Container 'test' CPU limit (8000m) exceeds maximum allowed (4000m). Reduce the limit."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "8000m", "memory": "128Mi"},
                    "requests": {"cpu": "100m", "memory": "64Mi"}
                }
            }]
        }
    }
}

test_deny_excessive_cpu_limit_cores if {
    deny["Container 'test' CPU limit (8) exceeds maximum allowed (4000m). Reduce the limit."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "8", "memory": "128Mi"},
                    "requests": {"cpu": "100m", "memory": "64Mi"}
                }
            }]
        }
    }
}

test_deny_excessive_memory_limit if {
    deny["Container 'test' memory limit (16Gi) exceeds maximum allowed (8192Mi). Reduce the limit."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "500m", "memory": "16Gi"},
                    "requests": {"cpu": "100m", "memory": "64Mi"}
                }
            }]
        }
    }
}

test_allow_within_quota if {
    result := deny with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "containers": [{
                "name": "test",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "2000m", "memory": "4Gi"},
                    "requests": {"cpu": "1000m", "memory": "2Gi"}
                }
            }]
        }
    }
    not "Container 'test' CPU limit (2000m) exceeds maximum allowed (4000m). Reduce the limit." in result
    not "Container 'test' memory limit (4Gi) exceeds maximum allowed (8192Mi). Reduce the limit." in result
}

# =============================================================================
# Test: Replica Count Policy (warnings)
# =============================================================================

test_warn_single_replica_production if {
    warn["Production deployment 'test-deploy' should have at least 2 replicas for high availability."] with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "environment": "production"
            }
        },
        "spec": {
            "replicas": 1,
            "template": {
                "spec": {
                    "containers": [{"name": "app", "image": "nginx:1.21"}]
                }
            }
        }
    }
}

test_no_warn_multiple_replicas_production if {
    result := warn with input as {
        "kind": "Deployment",
        "metadata": {
            "name": "test-deploy",
            "labels": {
                "environment": "production"
            }
        },
        "spec": {
            "replicas": 3,
            "template": {
                "spec": {
                    "containers": [{"name": "app", "image": "nginx:1.21"}]
                }
            }
        }
    }
    not "Production deployment 'test-deploy' should have at least 2 replicas for high availability." in result
}

# =============================================================================
# Test: Init Container Resources Policy
# =============================================================================

test_deny_init_container_missing_cpu_limit if {
    deny["Init container 'init' must have CPU limits."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "initContainers": [{
                "name": "init",
                "image": "busybox:1.35",
                "resources": {
                    "limits": {"memory": "64Mi"}
                }
            }],
            "containers": [{
                "name": "app",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "500m", "memory": "128Mi"},
                    "requests": {"cpu": "100m", "memory": "64Mi"}
                }
            }]
        }
    }
}

test_deny_init_container_missing_memory_limit if {
    deny["Init container 'init' must have memory limits."] with input as {
        "kind": "Pod",
        "metadata": {"name": "test-pod"},
        "spec": {
            "initContainers": [{
                "name": "init",
                "image": "busybox:1.35",
                "resources": {
                    "limits": {"cpu": "100m"}
                }
            }],
            "containers": [{
                "name": "app",
                "image": "nginx:1.21",
                "resources": {
                    "limits": {"cpu": "500m", "memory": "128Mi"},
                    "requests": {"cpu": "100m", "memory": "64Mi"}
                }
            }]
        }
    }
}
