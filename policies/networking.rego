# OPA Policies for Kubernetes Networking Validation
# These policies validate Ingress resources for security and compliance
#
# Usage with conftest:
#   conftest test ingress.yaml --policy policies/networking.rego
#
# Usage with Gatekeeper:
#   Create ConstraintTemplate and Constraint resources

package networking

import future.keywords.contains
import future.keywords.if
import future.keywords.in

# Default deny - all rules must pass
default allow := false

# Main validation entry point
allow if {
    count(deny) == 0
}

# Collect all violations
violations contains msg if {
    some msg in deny
}

#
# Ingress Validation Rules
#

# Rule: Ingress must have TLS configured for production
deny contains msg if {
    input.kind == "Ingress"
    is_production_namespace
    not has_tls_configured
    msg := sprintf("Ingress '%s' in namespace '%s' must have TLS configured for production workloads", [input.metadata.name, input.metadata.namespace])
}

# Rule: Ingress must use approved ingress classes
deny contains msg if {
    input.kind == "Ingress"
    ingress_class := get_ingress_class
    not ingress_class in approved_ingress_classes
    msg := sprintf("Ingress '%s' uses unapproved ingress class '%s'. Approved classes: %v", [input.metadata.name, ingress_class, approved_ingress_classes])
}

# Rule: Ingress hosts must be in allowed domains
deny contains msg if {
    input.kind == "Ingress"
    some rule in input.spec.rules
    host := rule.host
    host != ""
    not host_in_allowed_domains(host)
    msg := sprintf("Ingress '%s' host '%s' is not in allowed domains: %v", [input.metadata.name, host, allowed_domains])
}

# Rule: Ingress must have health check annotations for ALB
deny contains msg if {
    input.kind == "Ingress"
    is_alb_ingress
    not has_health_check_annotation
    msg := sprintf("ALB Ingress '%s' should have health check annotations configured", [input.metadata.name])
}

# Rule: Public-facing Ingress must have WAF enabled
deny contains msg if {
    input.kind == "Ingress"
    is_internet_facing_alb
    not has_waf_annotation
    msg := sprintf("Internet-facing Ingress '%s' must have WAF enabled for security", [input.metadata.name])
}

# Rule: Ingress must not expose sensitive paths
deny contains msg if {
    input.kind == "Ingress"
    some rule in input.spec.rules
    some path in rule.http.paths
    is_sensitive_path(path.path)
    msg := sprintf("Ingress '%s' exposes sensitive path '%s'. Use network policies instead.", [input.metadata.name, path.path])
}

# Rule: Backend services must specify port name or number
deny contains msg if {
    input.kind == "Ingress"
    some rule in input.spec.rules
    some path in rule.http.paths
    not valid_backend_port(path.backend)
    msg := sprintf("Ingress '%s' has backend without valid port specification", [input.metadata.name])
}

#
# Network Policy Validation Rules
#

# Rule: NetworkPolicy must have pod selector
deny contains msg if {
    input.kind == "NetworkPolicy"
    not input.spec.podSelector
    msg := sprintf("NetworkPolicy '%s' must have a podSelector defined", [input.metadata.name])
}

# Rule: NetworkPolicy should not allow all ingress from anywhere
deny contains msg if {
    input.kind == "NetworkPolicy"
    is_production_namespace
    allows_all_ingress
    msg := sprintf("NetworkPolicy '%s' in production allows unrestricted ingress. Use specific selectors.", [input.metadata.name])
}

# Rule: CiliumNetworkPolicy egress to external should specify FQDNs or CIDRs
deny contains msg if {
    input.kind == "CiliumNetworkPolicy"
    some rule in input.spec.egress
    has_external_egress(rule)
    not has_specific_destination(rule)
    msg := sprintf("CiliumNetworkPolicy '%s' has external egress without specific FQDN or CIDR restrictions", [input.metadata.name])
}

#
# Service Validation Rules
#

# Rule: LoadBalancer services should be internal by default
deny contains msg if {
    input.kind == "Service"
    input.spec.type == "LoadBalancer"
    not has_internal_annotation
    not is_explicitly_external
    msg := sprintf("Service '%s' of type LoadBalancer should specify internal/external annotation", [input.metadata.name])
}

# Rule: Service must not expose NodePort in production
deny contains msg if {
    input.kind == "Service"
    input.spec.type == "NodePort"
    is_production_namespace
    msg := sprintf("Service '%s' uses NodePort in production namespace. Use LoadBalancer or ClusterIP with Ingress.", [input.metadata.name])
}

#
# Helper Functions
#

# Check if namespace is production-like
is_production_namespace if {
    input.metadata.namespace in ["production", "prod", "prd"]
}

is_production_namespace if {
    startswith(input.metadata.namespace, "prod-")
}

# Check if TLS is configured
has_tls_configured if {
    count(input.spec.tls) > 0
}

# Get ingress class
get_ingress_class := class if {
    class := input.spec.ingressClassName
}

get_ingress_class := class if {
    class := input.metadata.annotations["kubernetes.io/ingress.class"]
}

get_ingress_class := "default" if {
    not input.spec.ingressClassName
    not input.metadata.annotations["kubernetes.io/ingress.class"]
}

# Approved ingress classes
approved_ingress_classes := ["alb", "nginx", "cilium"]

# Allowed domains for ingress hosts
allowed_domains := data.config.allowed_domains if {
    data.config.allowed_domains
}

allowed_domains := ["example.com", "internal.example.com"] if {
    not data.config.allowed_domains
}

# Check if host is in allowed domains
host_in_allowed_domains(host) if {
    some domain in allowed_domains
    endswith(host, domain)
}

# Check if this is an ALB ingress
is_alb_ingress if {
    get_ingress_class == "alb"
}

# Check if ingress is internet-facing
is_internet_facing_alb if {
    is_alb_ingress
    input.metadata.annotations["alb.ingress.kubernetes.io/scheme"] == "internet-facing"
}

# Check for health check annotation
has_health_check_annotation if {
    input.metadata.annotations["alb.ingress.kubernetes.io/healthcheck-path"]
}

# Check for WAF annotation
has_waf_annotation if {
    input.metadata.annotations["alb.ingress.kubernetes.io/wafv2-acl-arn"]
}

# Sensitive paths that should not be exposed via ingress
sensitive_paths := [
    "/admin",
    "/actuator",
    "/metrics",
    "/debug",
    "/healthz",
    "/readyz",
    "/.well-known/",
    "/api/internal",
]

is_sensitive_path(path) if {
    some sensitive in sensitive_paths
    startswith(path, sensitive)
}

# Check if backend port is valid
valid_backend_port(backend) if {
    backend.service.port.number
}

valid_backend_port(backend) if {
    backend.service.port.name
}

# Check if NetworkPolicy allows all ingress
allows_all_ingress if {
    some rule in input.spec.ingress
    count(rule) == 0
}

allows_all_ingress if {
    some rule in input.spec.ingress
    not rule.from
}

# Check if egress rule targets external destinations
has_external_egress(rule) if {
    rule.toCIDR
}

has_external_egress(rule) if {
    rule.toCIDRSet
}

# Check if egress has specific destination
has_specific_destination(rule) if {
    count(rule.toCIDR) > 0
    some cidr in rule.toCIDR
    cidr != "0.0.0.0/0"
}

has_specific_destination(rule) if {
    count(rule.toFQDNs) > 0
}

# Check if service has internal annotation
has_internal_annotation if {
    input.metadata.annotations["service.beta.kubernetes.io/aws-load-balancer-internal"] == "true"
}

has_internal_annotation if {
    input.metadata.annotations["service.beta.kubernetes.io/aws-load-balancer-scheme"] == "internal"
}

# Check if service is explicitly external
is_explicitly_external if {
    input.metadata.annotations["service.beta.kubernetes.io/aws-load-balancer-scheme"] == "internet-facing"
}

#
# Warn Rules (non-blocking recommendations)
#

warn contains msg if {
    input.kind == "Ingress"
    not input.metadata.annotations["alb.ingress.kubernetes.io/target-type"]
    is_alb_ingress
    msg := sprintf("Recommendation: Ingress '%s' should specify target-type (ip or instance)", [input.metadata.name])
}

warn contains msg if {
    input.kind == "Ingress"
    is_alb_ingress
    not input.metadata.annotations["alb.ingress.kubernetes.io/ssl-policy"]
    msg := sprintf("Recommendation: Ingress '%s' should specify an SSL policy for better security", [input.metadata.name])
}
