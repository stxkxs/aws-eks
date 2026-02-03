# Multi-Agent Development

## Overview

This project supports parallel development using 8 Claude agents orchestrated via the orchestra system. This enables concurrent work on different components while managing dependencies.

## Agent Roles

| ID | Name | Role | Focus Areas |
|----|------|------|-------------|
| 1 | ARCH | Architect | Types, config schema, project structure |
| 2 | PLAT | Platform Engineer | VPC, EKS cluster, managed node groups |
| 3 | SEC | Security Engineer | Falco, Trivy, Kyverno, security policies |
| 4 | OBS | Observability Engineer | AMP, Loki, Tempo, dashboards |
| 5 | NET | Networking Engineer | Cilium, ALB controller, External DNS |
| 6 | OPS | Operations Engineer | Velero, Goldilocks, CI/CD |
| 7 | QA | QA Engineer | Unit tests, integration tests |
| 8 | DOCS | Tech Writer | README, runbooks, documentation |

## Dependency Graph

```
        ┌─────┐
        │ARCH │ (1)
        └──┬──┘
           │
    ┌──────┼──────┐
    │      │      │
    ▼      ▼      ▼
┌─────┐ ┌─────┐ ┌─────┐
│PLAT │ │ SEC │ │ OBS │
│ (2) │ │ (3) │ │ (4) │
└──┬──┘ └──┬──┘ └──┬──┘
   │       │      │
   ├───────┼──────┘
   │       │
   ▼       ▼
┌─────┐ ┌─────┐
│ NET │ │ OPS │
│ (5) │ │ (6) │
└──┬──┘ └──┬──┘
   │       │
   └───┬───┘
       │
       ▼
    ┌─────┐
    │ QA  │ (7)
    └──┬──┘
       │
       ▼
    ┌─────┐
    │DOCS │ (8)
    └─────┘
```

## Development Phases

### Phase 1: Foundation
- **Agents:** ARCH (1)
- **Parallel:** No
- **Output:** Types, config schema, project structure

### Phase 2: Core Infrastructure
- **Agents:** PLAT (2), SEC (3), OBS (4)
- **Parallel:** Yes
- **Output:** VPC, EKS, security and observability addons

### Phase 3: Integration
- **Agents:** NET (5), OPS (6)
- **Parallel:** Yes
- **Output:** Networking addons, CI/CD pipelines

### Phase 4: Validation
- **Agents:** QA (7), DOCS (8)
- **Parallel:** Yes
- **Output:** Tests, documentation

## Orchestra System

### Directory Structure

```
.claude/orchestra/
├── configs/
│   └── aws-eks-dev.json     # Agent configuration
├── templates/
│   └── agents/              # Agent CLAUDE.md templates
├── sessions/
│   └── sprint-1/            # Active session
│       ├── config.json
│       ├── session.json
│       ├── agents/
│       │   └── {AGENT}/
│       │       └── CLAUDE.md
│       └── state/
│           └── {AGENT}.json
├── scripts/
│   ├── orch                 # Main CLI
│   ├── init.sh
│   ├── start-agent.sh
│   └── monitor.sh
├── layouts/
│   └── 8-agents.kdl         # Zellij layout
└── mcp-server/              # MCP server for coordination
```

### CLI Commands

```bash
# Initialize a new session
.claude/orchestra/scripts/orch init <config> <session-name>

# Start the session (opens Zellij with all agents)
.claude/orchestra/scripts/orch start <session-name>

# Check session status
.claude/orchestra/scripts/orch status <session-name>

# Stop session
.claude/orchestra/scripts/orch stop <session-name>
```

### Starting a Session

```bash
# 1. Make CLI executable
chmod +x .claude/orchestra/scripts/orch

# 2. Initialize session
.claude/orchestra/scripts/orch init aws-eks-dev sprint-1

# 3. Start session (opens Zellij terminal multiplexer)
.claude/orchestra/scripts/orch start sprint-1
```

## Agent Configuration

### Configuration File

```json
// .claude/orchestra/configs/aws-eks-dev.json
{
  "name": "aws-eks-dev",
  "description": "8-agent configuration for AWS EKS development",
  "layout": "8-agents.kdl",
  "agents": [
    {
      "id": 1,
      "name": "ARCH",
      "role": "Architect",
      "description": "System design, types, config schema",
      "focus": ["lib/types/", "config/", "bin/app.ts"],
      "branch": "agent-1-arch",
      "dependencies": [],
      "blocks": [2, 3, 4, 5, 6]
    }
    // ... more agents
  ],
  "phases": [
    {
      "name": "Foundation",
      "agents": [1],
      "parallel": false
    }
    // ... more phases
  ]
}
```

### Agent CLAUDE.md

Each agent has a customized CLAUDE.md defining its responsibilities:

```markdown
# PLAT - Platform Engineer Agent

## Your Mission
Build the VPC and EKS cluster infrastructure.

## Focus Areas
- `lib/stacks/network.ts`
- `lib/stacks/cluster.ts`
- `lib/stacks/addons/operations.ts`

## Responsibilities
1. VPC with public/private subnets
2. EKS cluster with managed node group
3. Karpenter node provisioner

## Dependencies
- ARCH: Types and configuration must be complete

## Blocks
- NET: Needs cluster for networking addons
- OPS: Needs cluster for operations addons
```

## Coordination Patterns

### File Ownership

Each agent owns specific files to avoid conflicts:

| Agent | Owned Files |
|-------|-------------|
| ARCH | `lib/types/`, `config/`, `bin/app.ts` |
| PLAT | `lib/stacks/network.ts`, `lib/stacks/cluster.ts` |
| SEC | `lib/stacks/addons/security.ts`, `lib/constructs/kyverno-policy.ts` |
| OBS | `lib/stacks/addons/observability.ts`, `lib/constructs/grafana-dashboard.ts` |
| NET | `lib/stacks/addons/networking.ts`, `lib/stacks/addons/core.ts` |
| OPS | `lib/stacks/addons/operations.ts`, `.github/workflows/` |
| QA | `test/` |
| DOCS | `docs/`, `README.md` |

### Dependency Management

1. **Wait for dependencies:** Agents check their dependencies are complete before starting
2. **Signal completion:** Agents update state when their work is done
3. **Avoid conflicts:** Only modify owned files

### Communication

Agents communicate through:
1. **State files:** `sessions/{session}/state/{AGENT}.json`
2. **MCP server:** Real-time coordination (optional)
3. **Git commits:** Work preserved in branches

## Working with Agents

### Sending Tasks to Agents

Each agent monitors a query file for incoming tasks:

```bash
# Write task to agent
echo "Implement the VPC stack with 3 AZs" > \
  .claude/orchestra/sessions/sprint-1/agent-2-query.md
```

### Checking Agent Status

```bash
# Check state files
cat .claude/orchestra/sessions/sprint-1/state/PLAT.json

# View agent logs
tail -f .claude/orchestra/sessions/sprint-1/logs/agent-2.log
```

### Merging Agent Work

After agents complete their tasks:

```bash
# Review each agent's branch
git log --oneline agent-1-arch
git log --oneline agent-2-plat

# Merge in dependency order
git checkout main
git merge agent-1-arch
git merge agent-2-plat
git merge agent-3-sec
# ... etc
```

## Best Practices

### For Session Management

1. **Clear phase completion** - Ensure one phase completes before starting next
2. **Regular syncs** - Merge completed work frequently
3. **Conflict resolution** - Address file conflicts immediately
4. **State monitoring** - Watch for stuck agents

### For Agents

1. **Stay in scope** - Only modify owned files
2. **Clear completion signals** - Update state when done
3. **Document blockers** - Log any issues preventing progress
4. **Test changes** - Run relevant tests before signaling completion

### For Project Leads

1. **Define clear boundaries** - File ownership must be unambiguous
2. **Order dependencies correctly** - Ensure dependency graph is accurate
3. **Monitor progress** - Check agent states regularly
4. **Handle exceptions** - Be ready to intervene for stuck agents

## Troubleshooting

### Agent Not Starting

```bash
# Check session configuration
cat .claude/orchestra/sessions/sprint-1/config.json

# Verify agent state
cat .claude/orchestra/sessions/sprint-1/state/{AGENT}.json

# Check for errors in logs
tail -100 .claude/orchestra/sessions/sprint-1/logs/agent-{N}.log
```

### Merge Conflicts

```bash
# If conflicts occur during merge
git status
git diff

# Resolve conflicts manually
# Then commit
git add .
git commit -m "resolve: merge conflicts between agents"
```

### Agent Stuck

1. Check dependency status - is upstream complete?
2. Review query file - is task clear?
3. Check logs for errors
4. Restart agent if needed

## Session Deliverables

At the end of a successful session:

- [ ] Working CDK synth for all 3 environments
- [ ] All 16 Helm charts configured
- [ ] 80% test coverage
- [ ] Complete documentation with runbooks
- [ ] CI/CD pipelines for GitHub Actions

## Related

- [Contributing Guide](./contributing.md)
- [Testing Guide](./testing.md)
- [Architecture Overview](../architecture/overview.md)
