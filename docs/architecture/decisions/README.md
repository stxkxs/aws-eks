# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) documenting significant architectural decisions made in this project.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision along with its context and consequences. ADRs provide a historical record of why certain decisions were made, helping future maintainers understand the rationale.

## ADR Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [001](./001-cdk-over-terraform.md) | Use CDK over Terraform | Accepted | 2024-01-15 |
| [002](./002-cilium-cni.md) | Use Cilium as CNI | Accepted | 2024-01-15 |
| [003](./003-karpenter-over-cluster-autoscaler.md) | Use Karpenter over Cluster Autoscaler | Accepted | 2024-01-15 |
| [004](./004-bottlerocket-ami.md) | Use Bottlerocket AMI | Accepted | 2024-01-15 |
| [005](./005-environment-based-config.md) | Environment-based Configuration | Accepted | 2024-01-15 |

## ADR Template

Use [000-template.md](./000-template.md) when creating new ADRs.

## Status Definitions

- **Proposed**: Under discussion, not yet accepted
- **Accepted**: Decision has been made and is in effect
- **Deprecated**: Decision is no longer valid, superseded by another
- **Superseded**: Replaced by a newer ADR (link to replacement)

## Creating a New ADR

1. Copy `000-template.md` to `NNN-title.md`
2. Fill in all sections
3. Submit for review via PR
4. Update this index after acceptance
