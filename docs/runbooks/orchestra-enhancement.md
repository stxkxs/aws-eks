# Runbook: Orchestra Enhancement Phase

## Overview

After initial implementation, use these prompts to have agents enhance their work with production-ready improvements, edge cases, and polish.

---

## Claude Orchestrator Prompt

**Use this prompt to have Claude orchestrate the entire enhancement phase:**

```
I have 8 Claude agents that have completed their initial implementation in the AWS EKS orchestra. I need you to orchestrate the enhancement phase.

The orchestra is running in zellij with these agents on their respective branches:
- ARCH (agent-1-arch): Types, config, structure
- PLAT (agent-2-plat): VPC, EKS cluster, Karpenter
- SEC (agent-3-sec): Falco, Trivy, Kyverno
- OBS (agent-4-obs): AMP, Loki, Tempo, Hubble
- NET (agent-5-net): Cilium, ALB, External DNS
- OPS (agent-6-ops): Velero, CI/CD, GitHub Actions
- QA (agent-7-qa): Unit tests, integration tests
- DOCS (agent-8-docs): Documentation, runbooks

Please orchestrate the enhancement phase:

1. **Review current state**: Check what each agent has committed on their branch
2. **Generate enhancement prompts**: Create specific prompts for each agent based on:
   - What they've already implemented
   - Gaps in their implementation
   - Production-ready improvements needed
   - Quick wins specific to their domain
3. **Provide execution order**: Which agents should enhance first (dependencies)
4. **Track progress**: Help me monitor which agents have completed enhancements
5. **Verify quality**: After enhancements, validate:
   - Build passes: `npm run build`
   - Tests pass: `npm test`
   - Manifests valid: `npm run validate:all`
   - CDK synths: `npm run synth`
6. **Coordinate merges**: Guide me through merging enhanced branches to main

Enhancement focus areas:
- Security hardening
- Error handling and validation
- Test coverage
- Documentation completeness
- Production readiness (PDBs, resource limits, probes)
- Observability (metrics, logs, traces)

Session info:
- ORCH_ROOT: <project-root>/.claude/orchestra
- SESSION_DIR: $HOME/.claude/orchestration/sessions/sprint-1
- Docs: docs/runbooks/orchestra-enhancement.md

Start by checking the git branches to see what each agent has implemented.
```

---

## Universal Enhancement Prompt

Use this in any agent pane to trigger self-improvement:

```
Review your completed work and enhance it with production-ready improvements:

1. **Audit your changes**: List all files you created or modified
2. **Identify gaps**: What edge cases, error handling, or validation is missing?
3. **Add hardening**:
   - Input validation
   - Error handling with meaningful messages
   - Defensive coding patterns
   - Comments for complex logic
4. **Improve types**: Are all TypeScript types strict? Any `any` to eliminate?
5. **Add tests**: What test cases are missing for your code?
6. **Check dependencies**: Are you using the latest stable versions?
7. **Security review**: Any potential vulnerabilities in your code?
8. **Documentation**: Are your changes documented? JSDoc comments?

After reviewing, implement the top 3-5 most impactful improvements.
Commit your enhancements with a clear message describing what was improved.
```

---

## Agent-Specific Enhancement Prompts

### ARCH (Agent 1) - Architect

```
You are the ARCH agent. Review and enhance your foundation work:

## Type System Audit
- [ ] All interfaces have JSDoc comments
- [ ] No `any` types remain
- [ ] Strict null checks pass
- [ ] All exported types are documented

## Configuration Enhancements
- [ ] Add JSON Schema validation for config files
- [ ] Add runtime config validation with Zod or similar
- [ ] Ensure all feature flags have sensible defaults
- [ ] Add config diffing utility for environment comparison

## Cross-Cutting Concerns
- [ ] Error types are comprehensive
- [ ] Logging patterns are consistent
- [ ] Retry/backoff utilities exist
- [ ] Environment detection is robust

## Quick Wins
1. Add `config/schema.json` for IDE autocomplete
2. Add `lib/utils/validation.ts` for runtime checks
3. Add exhaustive type checks for discriminated unions
4. Create `lib/types/errors.ts` with typed error classes

Implement the most impactful improvements and commit.
```

### PLAT (Agent 2) - Platform Engineer

```
You are the PLAT agent. Review and enhance your platform work:

## Cluster Hardening
- [ ] Pod Security Standards enforced (restricted)
- [ ] API server audit logging configured
- [ ] Secrets encryption at rest (KMS)
- [ ] IRSA for all AWS-accessing pods

## Node Group Enhancements
- [ ] Spot instance termination handling
- [ ] Node taints for workload isolation
- [ ] Instance metadata service v2 only
- [ ] Custom AMI with CIS benchmarks (optional)

## Karpenter Improvements
- [ ] Consolidation policies defined
- [ ] Spot/on-demand ratio configured
- [ ] Node pool limits set
- [ ] Drift detection enabled

## Quick Wins
1. Add PodDisruptionBudgets for system components
2. Add ResourceQuotas per namespace
3. Add LimitRanges with sensible defaults
4. Add PriorityClasses (system-critical, high, default)
5. Enable control plane logging (api, audit, authenticator)

Implement the most impactful improvements and commit.
```

### SEC (Agent 3) - Security Engineer

```
You are the SEC agent. Review and enhance your security work:

## Policy Hardening
- [ ] Kyverno policies cover OWASP top 10
- [ ] Default deny network policies exist
- [ ] Pod security policies are restrictive
- [ ] Image signing/verification configured

## Runtime Security
- [ ] Falco rules cover container escapes
- [ ] Falco alerts integrate with alerting system
- [ ] Trivy scans run on admission
- [ ] Trivy vulnerability thresholds defined

## Compliance Checks
- [ ] CIS Kubernetes Benchmark policies
- [ ] SOC2 relevant controls documented
- [ ] HIPAA safeguards if applicable
- [ ] Audit trail for security events

## Quick Wins
1. Add policy for blocking privileged containers
2. Add policy for requiring resource limits
3. Add policy for allowed registries only
4. Add policy for required labels (owner, team)
5. Add Falco rule for crypto mining detection
6. Add OPA/Rego policies in `policies/` directory

Implement the most impactful improvements and commit.
```

### OBS (Agent 4) - Observability Engineer

```
You are the OBS agent. Review and enhance your observability work:

## Metrics Completeness
- [ ] Golden signals covered (latency, traffic, errors, saturation)
- [ ] Kubernetes metrics exported (kube-state-metrics)
- [ ] Node metrics exported (node-exporter)
- [ ] Custom application metrics patterns documented

## Logging Improvements
- [ ] Structured logging enforced (JSON)
- [ ] Log levels standardized
- [ ] Sensitive data scrubbing configured
- [ ] Log retention policies set

## Tracing Enhancements
- [ ] Trace sampling configured appropriately
- [ ] Service mesh traces integrated
- [ ] Trace-to-log correlation working
- [ ] Trace retention policies set

## Alerting
- [ ] SLO-based alerts defined
- [ ] Runbook links in alert annotations
- [ ] Alert routing configured
- [ ] PagerDuty/Slack integration ready

## Quick Wins
1. Add Grafana dashboards for cluster overview
2. Add alerting rules for node pressure
3. Add alerting rules for pod crashloops
4. Add log-based alerts for error spikes
5. Configure Hubble UI for network observability
6. Add distributed tracing examples

Implement the most impactful improvements and commit.
```

### NET (Agent 5) - Networking Engineer

```
You are the NET agent. Review and enhance your networking work:

## Network Policy Hardening
- [ ] Default deny policies in place
- [ ] Explicit allow policies documented
- [ ] Egress controls for external access
- [ ] DNS policies (allow kube-dns only)

## Cilium Enhancements
- [ ] L7 policies for HTTP filtering
- [ ] mTLS enabled between services
- [ ] Hubble metrics exported
- [ ] Network policy editor/visualizer

## DNS Performance
- [ ] NodeLocal DNSCache deployed
- [ ] DNS caching configured
- [ ] DNS query logging (optional)
- [ ] External DNS for Route53

## Load Balancing
- [ ] ALB ingress patterns documented
- [ ] SSL/TLS termination configured
- [ ] WAF integration (optional)
- [ ] Health check paths standardized

## Quick Wins
1. Add CiliumNetworkPolicy templates
2. Add DNS troubleshooting runbook
3. Add network policy testing scripts
4. Add Hubble CLI examples for debugging
5. Document ingress patterns with examples

Implement the most impactful improvements and commit.
```

### OPS (Agent 6) - Operations Engineer

```
You are the OPS agent. Review and enhance your operations work:

## CI/CD Hardening
- [ ] Pipeline secrets use OIDC, not long-lived keys
- [ ] Branch protection rules documented
- [ ] Required status checks configured
- [ ] Deployment approvals for production

## Backup & Recovery
- [ ] Velero schedules configured
- [ ] Backup verification automated
- [ ] Restore procedures tested
- [ ] Disaster recovery runbook exists

## GitOps Readiness
- [ ] Helm values are environment-specific
- [ ] Kustomize overlays if needed
- [ ] ArgoCD/Flux ready (optional)
- [ ] Drift detection configured

## Operational Tooling
- [ ] Goldilocks recommendations reviewed
- [ ] Resource right-sizing documented
- [ ] Cost optimization strategies
- [ ] Capacity planning guidelines

## Quick Wins
1. Add GitHub Actions workflow for PR validation
2. Add scheduled backup verification job
3. Add Makefile targets for common operations
4. Add cost estimation in CI (infracost)
5. Add deployment notification to Slack
6. Add rollback procedures

Implement the most impactful improvements and commit.
```

### QA (Agent 7) - QA Engineer

```
You are the QA agent. Review and enhance your testing work:

## Test Coverage
- [ ] Unit tests for all constructs
- [ ] Integration tests for stack synthesis
- [ ] Snapshot tests for CloudFormation
- [ ] Config validation tests

## Test Quality
- [ ] Edge cases covered
- [ ] Error conditions tested
- [ ] Mocks are realistic
- [ ] Test data is representative

## Validation Scripts
- [ ] Helm chart validation (kubeconform)
- [ ] Policy validation (conftest/OPA)
- [ ] API deprecation checks (pluto)
- [ ] Best practices linting (kube-linter)

## E2E Testing
- [ ] Cluster health checks
- [ ] Addon connectivity tests
- [ ] Network policy verification
- [ ] Backup/restore validation

## Quick Wins
1. Add test coverage reporting
2. Add mutation testing (optional)
3. Add performance benchmarks
4. Add chaos testing scenarios (optional)
5. Add security scanning in tests
6. Create test fixtures for common scenarios

Implement the most impactful improvements and commit.
```

### DOCS (Agent 8) - Tech Writer

```
You are the DOCS agent. Review and enhance your documentation:

## Documentation Completeness
- [ ] README covers quick start
- [ ] Architecture diagrams are current
- [ ] All config options documented
- [ ] API reference is complete

## Runbook Quality
- [ ] Step-by-step procedures
- [ ] Verification steps included
- [ ] Rollback procedures
- [ ] Troubleshooting sections

## Diagram Updates
- [ ] Mermaid diagrams render correctly
- [ ] Network topology documented
- [ ] Data flow diagrams exist
- [ ] Security boundaries visualized

## Developer Experience
- [ ] Contributing guide exists
- [ ] Local development setup
- [ ] Testing instructions
- [ ] PR template with checklist

## Quick Wins
1. Add troubleshooting FAQ
2. Add architecture decision records (ADRs)
3. Add changelog/release notes template
4. Add runbook for common incidents
5. Add glossary of terms
6. Add links between related docs

Implement the most impactful improvements and commit.
```

---

## Execution

### Option 1: Broadcast to All Agents

In the **Orchestrator** tab, use MCP to send enhancement prompts:

```bash
# In each agent pane, paste the relevant prompt above
# Or use the universal prompt for all agents
```

### Option 2: Sequential Enhancement

1. Start with ARCH (types/config improvements ripple to others)
2. Then PLAT, SEC, OBS in parallel
3. Then NET, OPS in parallel
4. Finally QA, DOCS to capture all changes

### Option 3: Targeted Enhancement

Focus on specific areas:
- **Security hardening**: SEC, NET, PLAT
- **Observability**: OBS, DOCS
- **Testing**: QA, OPS
- **Documentation**: DOCS, ARCH

---

## Verification

After enhancement phase:

```bash
# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Validate manifests
npm run validate:all

# Synthesize
npm run synth
```

---

## Commit Convention

Each agent should commit enhancements with:

```
feat(<agent>): enhance <area>

- Added <improvement 1>
- Added <improvement 2>
- Fixed <issue>

Part of orchestra enhancement phase.
```

Example:
```
feat(sec): enhance security policies

- Added Kyverno policy for required labels
- Added Falco rule for crypto mining detection
- Added OPA policies for image registry validation

Part of orchestra enhancement phase.
```

---

## Wrap-Up Phase

After all agents complete their enhancements, finalize their work for PR creation.

### Wrap-Up Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. PASTE WRAP-UP PROMPTS IN ALL AGENT PANES               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2. WAIT FOR ALL AGENTS TO REPORT "READY FOR MERGE"        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3. GIVE ORCHESTRATOR THE REVIEW PROMPT                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  4. ORCHESTRATOR MERGES & CREATES PR                       │
└─────────────────────────────────────────────────────────────┘
```

### Universal Wrap-Up Prompt (for all agents)

```
WRAP-UP PHASE: Prepare your branch for PR merge.

1. **Review your changes**:
   git diff main --stat
   git log main..HEAD --oneline

2. **Ensure no uncommitted work**:
   git status
   (If any, commit now with a descriptive message)

3. **Squash into a single clean commit**:
   git reset --soft $(git merge-base main HEAD)
   git commit -m "feat(<your-agent>): <summary>

   - <bullet 1>
   - <bullet 2>
   - <bullet 3>

   Part of orchestra sprint-1"

4. **Verify your branch builds**:
   npm run build

5. **Report completion**:
   Echo: "AGENT <NAME> READY FOR MERGE"
   git log -1 --oneline
```

### Agent-Specific Wrap-Up Prompts

**ARCH:**
```
git reset --soft $(git merge-base main HEAD)
git commit -m "feat(arch): foundation types and runtime validation

- Add TypeScript interfaces for Kubernetes resources
- Add Zod runtime validation
- Add JSON Schema for config IDE autocomplete
- Update config with new feature flags

Part of orchestra sprint-1"
npm run build && echo "ARCH READY FOR MERGE"
```

**PLAT:**
```
git reset --soft $(git merge-base main HEAD)
git commit -m "feat(plat): cluster hardening constructs

- Add PodDisruptionBudget construct
- Add PriorityClass construct
- Add ResourceQuota construct
- Add integration test scripts

Part of orchestra sprint-1"
npm run build && echo "PLAT READY FOR MERGE"
```

**SEC:**
```
git reset --soft $(git merge-base main HEAD)
git commit -m "feat(sec): security policies and hardening

- Add Kyverno policies (labels, no-latest, resource limits)
- Add Falco rules for threat detection
- Add OPA/Rego security policies

Part of orchestra sprint-1"
npm run build && echo "SEC READY FOR MERGE"
```

**OBS:**
```
git reset --soft $(git merge-base main HEAD)
git commit -m "feat(obs): observability dashboards and alerting

- Add Grafana dashboards
- Add alerting rules for node pressure and crashloops
- Add ServiceMonitor construct

Part of orchestra sprint-1"
npm run build && echo "OBS READY FOR MERGE"
```

**NET:**
```
git reset --soft $(git merge-base main HEAD)
git commit -m "feat(net): network policies and DNS performance

- Add CiliumNetworkPolicy construct
- Add NodeLocal DNSCache construct
- Add OPA networking policies

Part of orchestra sprint-1"
npm run build && echo "NET READY FOR MERGE"
```

**OPS:**
```
git reset --soft $(git merge-base main HEAD)
git commit -m "feat(ops): CI/CD and validation tooling

- Add GitHub Actions workflows
- Add validation scripts
- Add Makefile for operations

Part of orchestra sprint-1"
npm run build && echo "OPS READY FOR MERGE"
```

**QA:**
```
git reset --soft $(git merge-base main HEAD)
git commit -m "test: comprehensive validation and coverage

- Add snapshot tests
- Add config validation tests
- Add construct tests

Part of orchestra sprint-1"
npm run build && echo "QA READY FOR MERGE"
```

**DOCS:**
```
git reset --soft $(git merge-base main HEAD)
git commit -m "docs: comprehensive documentation

- Add troubleshooting FAQ
- Add ADRs
- Add architecture diagrams

Part of orchestra sprint-1"
npm run build && echo "DOCS READY FOR MERGE"
```

### Orchestrator Review Prompt

After all agents report ready, give this to Claude to review and merge:

```
Orchestra wrap-up complete. Please review all agent branches before merge:

1. **Verify all branches are ready**:
   - Check each branch has exactly 1 squashed commit
   - Check no uncommitted changes remain

2. **Review each agent's changes**:
   - List files changed per branch
   - Check for conflicts between branches
   - Identify overlapping file modifications

3. **Validate merge order** (dependencies):
   - ARCH first (types)
   - PLAT second (constructs)
   - SEC, OBS, NET, OPS (parallel)
   - QA (tests)
   - DOCS (final)

4. **Check for issues**:
   - Files modified by multiple agents?
   - Missing exports or imports?
   - Test files without implementation?

5. **Generate merge commands** with conflict resolution

6. **Draft PR description** summarizing all contributions

Session: $HOME/.claude/orchestration/sessions/sprint-1
```

### Merge Order

```bash
git checkout main
git merge agent-1-arch --no-ff -m "feat(arch): foundation types and validation"
git merge agent-2-plat --no-ff -m "feat(plat): cluster hardening constructs"
git merge agent-3-sec --no-ff -m "feat(sec): security policies"
git merge agent-4-obs --no-ff -m "feat(obs): observability and alerting"
git merge agent-5-net --no-ff -m "feat(net): network policies"
git merge agent-6-ops --no-ff -m "feat(ops): CI/CD and validation"
git merge agent-7-qa --no-ff -m "test: comprehensive coverage"
git merge agent-8-docs --no-ff -m "docs: documentation"
```

---

## Related

- [Orchestra Documentation](../development/orchestra.md)
- [Orchestra Setup Runbook](orchestra-setup.md)
