# Multi-Agent Orchestra

A system for coordinating multiple Claude agents working in parallel on the AWS EKS infrastructure project.

## Overview

The Orchestra system enables 8 specialized Claude agents to work simultaneously on different aspects of the codebase, each with their own git worktree and dedicated focus area.

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR (You)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Phase 1: Foundation                                            │
│   ┌─────────┐                                                    │
│   │  ARCH   │ Types, config, structure                           │
│   └────┬────┘                                                    │
│        │                                                         │
│   Phase 2: Core Infrastructure (parallel)                        │
│   ┌────┴────┬─────────┬─────────┐                               │
│   │  PLAT   │   SEC   │   OBS   │                               │
│   │ Platform│Security │  Obsv.  │                               │
│   └────┬────┴────┬────┴────┬────┘                               │
│        │         │         │                                     │
│   Phase 3: Integration (parallel)                                │
│   ┌────┴─────────┴─────────┴────┐                               │
│   │    NET     │      OPS       │                               │
│   │ Networking │  Operations    │                               │
│   └────────────┴───────┬────────┘                               │
│                        │                                         │
│   Phase 4: Validation (parallel)                                 │
│   ┌────────────────────┴────────┐                               │
│   │     QA      │     DOCS      │                               │
│   │   Testing   │Documentation  │                               │
│   └─────────────┴───────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Initialize Session

```bash
export ORCH_ROOT=<project-root>/.claude/orchestra
export CONFIG_NAME=aws-eks-dev
export SESSION_NAME=sprint-1
export TARGET_REPO=<project-root>
export USE_WORKTREES=true

$ORCH_ROOT/scripts/init.sh
```

### 2. Start Zellij Session

```bash
export ORCH_SESSION_DIR=$HOME/.claude/orchestration/sessions/sprint-1
zellij --layout $ORCH_SESSION_DIR/layout.kdl
```

### 3. Execute Agents in Order

| Phase | Tab | Agents | Wait For |
|-------|-----|--------|----------|
| 1 | Infrastructure | ARCH | - |
| 2 | Infrastructure + Addons | PLAT, SEC, OBS | ARCH complete |
| 3 | Addons | NET, OPS | PLAT complete |
| 4 | Validation | QA, DOCS | All above complete |

## Architecture

### Directory Structure

```
.claude/orchestra/
├── configs/                    # Session configurations
│   └── aws-eks-dev.json       # 8-agent config with dependencies
├── layouts/                    # Zellij terminal layouts
│   └── 8-agents.kdl           # 5-tab layout for 8 agents
├── mcp-server/                 # Inter-agent communication
│   ├── src/index.ts           # MCP server source
│   ├── dist/index.js          # Compiled server
│   └── package.json
├── scripts/                    # Orchestration scripts
│   ├── init.sh                # Initialize new session
│   ├── start-agent.sh         # Start individual agent
│   ├── monitor.sh             # Real-time status dashboard
│   └── generate-layout.sh     # Dynamic layout generation
├── templates/                  # Agent instruction templates
│   └── agents/                # Role-specific CLAUDE.md templates
│       ├── arch.md
│       ├── plat.md
│       ├── sec.md
│       ├── obs.md
│       ├── net.md
│       ├── ops.md
│       ├── qa.md
│       └── docs.md
└── sessions/                   # Session data (gitignored)
```

### Session Structure (created by init.sh)

```
~/.claude/orchestration/sessions/{SESSION_NAME}/
├── session.json               # Session metadata
├── config.json                # Copy of configuration
├── layout.kdl                 # Zellij layout
├── agents/                    # Per-agent CLAUDE.md files
│   ├── ARCH/CLAUDE.md
│   ├── PLAT/CLAUDE.md
│   └── ...
├── worktrees/                 # Git worktrees (isolated branches)
│   ├── ARCH/                  # branch: agent-1-arch
│   ├── PLAT/                  # branch: agent-2-plat
│   └── ...
├── logs/                      # Agent logs
│   ├── agent-1.log
│   └── ...
├── agent-1-state.json         # Agent state files
├── agent-1-query.md           # Incoming task queue
├── agent-1-response.md        # Completion reports
└── ...
```

## The 8 Agents

| ID | Name | Role | Focus Areas | Dependencies |
|----|------|------|-------------|--------------|
| 1 | ARCH | Architect | `lib/types/`, `config/`, `bin/app.ts` | None |
| 2 | PLAT | Platform Engineer | `lib/stacks/network.ts`, `cluster.ts` | ARCH |
| 3 | SEC | Security Engineer | `lib/stacks/addons/security.ts` | ARCH |
| 4 | OBS | Observability Engineer | `lib/stacks/addons/observability.ts` | ARCH |
| 5 | NET | Networking Engineer | `lib/stacks/addons/networking.ts` | ARCH, PLAT |
| 6 | OPS | Operations Engineer | `lib/stacks/addons/operations.ts`, `.github/` | ARCH, PLAT |
| 7 | QA | QA Engineer | `test/` | PLAT, SEC, OBS, NET, OPS |
| 8 | DOCS | Tech Writer | `docs/`, `README.md` | QA |

## MCP Server

The MCP (Model Context Protocol) server enables inter-agent communication. It's auto-configured in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "orchestra": {
      "command": "node",
      "args": [".claude/orchestra/mcp-server/dist/index.js"]
    }
  }
}
```

### Available Tools

| Tool | Description | Usage |
|------|-------------|-------|
| `check_queries()` | Check for pending tasks | Agent polls for incoming work |
| `send_query(to, message, priority)` | Send task to another agent | Request work or ask questions |
| `update_status(status, task)` | Update agent status | Report progress |
| `list_agents()` | List all agents and status | See who's available |
| `mark_complete(summary)` | Mark task complete | Signal completion |

### Status Values

| Status | Icon | Meaning |
|--------|------|---------|
| `pending` | `[.]` | Waiting to start |
| `running` | `[*]` | Actively working |
| `idle` | `[ ]` | Ready for tasks |
| `blocked` | `[X]` | Waiting on dependency |
| `complete` | `[+]` | Finished all work |
| `stopped` | `[-]` | Agent terminated |

## Zellij Layout

The `8-agents.kdl` layout creates 5 tabs:

| Tab | Panes | Purpose |
|-----|-------|---------|
| **Orchestrator** | 1 | Your control terminal |
| **Infrastructure** | 2 | ARCH (left), PLAT (right) |
| **Addons** | 4 | SEC, OBS, NET, OPS in 2x2 grid |
| **Validation** | 2 | QA (left), DOCS (right) |
| **Monitor** | 1 | Real-time status dashboard |

### Keyboard Navigation

| Keys | Action |
|------|--------|
| `Ctrl+t` then `n` | Next tab |
| `Ctrl+t` then `p` | Previous tab |
| `Ctrl+t` then `1-5` | Jump to tab |
| `Ctrl+p` then arrows | Switch panes |
| `Ctrl+q` | Quit zellij |

## Git Worktrees

Each agent works on an isolated branch via git worktrees:

```bash
# View all worktrees
git worktree list

# Example output:
<project-root>                         1b1c6aa [main]
~/.claude/orchestration/.../worktrees/ARCH      1b1c6aa [agent-1-arch]
~/.claude/orchestration/.../worktrees/PLAT      1b1c6aa [agent-2-plat]
...
```

### Merging Agent Work

After agents complete their work:

```bash
# Switch to main
cd <project-root>
git checkout main

# Merge each agent's branch
git merge agent-1-arch --no-ff -m "feat(arch): types and config from ARCH agent"
git merge agent-2-plat --no-ff -m "feat(platform): VPC and cluster from PLAT agent"
# ... continue for all agents

# Or cherry-pick specific commits
git cherry-pick <commit-hash>
```

## Scripts Reference

### init.sh

Initializes a new orchestration session.

**Environment Variables:**
| Variable | Required | Description |
|----------|----------|-------------|
| `ORCH_ROOT` | Yes | Path to orchestra directory |
| `CONFIG_NAME` | Yes | Config file name (without .json) |
| `SESSION_NAME` | Yes | Session identifier |
| `TARGET_REPO` | Yes | Path to target repository |
| `USE_WORKTREES` | No | `true` for git worktrees, `false` for symlinks |

**Creates:**
- Session directory in `~/.claude/orchestration/sessions/`
- CLAUDE.md for each agent
- Git worktrees or symlinks
- State files for monitoring

### start-agent.sh

Starts an individual agent.

```bash
# Usage
$ORCH_ROOT/scripts/start-agent.sh <agent-num>

# Agent 0 = orchestrator shell
# Agents 1-8 = Claude instances
```

**Environment Variables:**
| Variable | Required | Description |
|----------|----------|-------------|
| `ORCH_ROOT` | Yes | Path to orchestra directory |
| `ORCH_SESSION_DIR` | Yes | Path to session directory |

### monitor.sh

Real-time status dashboard showing all agents.

```bash
$ORCH_ROOT/scripts/monitor.sh
```

Displays:
- Agent names and roles
- Current status with color-coded icons
- Last active timestamp

## Configuration

### aws-eks-dev.json

The configuration defines agents, dependencies, and phases:

```json
{
  "name": "aws-eks-dev",
  "agents": [
    {
      "id": 1,
      "name": "ARCH",
      "role": "Architect",
      "focus": ["lib/types/", "config/"],
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

## Troubleshooting

### Session already exists

```bash
rm -rf ~/.claude/orchestration/sessions/sprint-1
# Then re-run init.sh
```

### Worktree not found

```bash
# Check existing worktrees
git worktree list

# Remove stale worktrees
git worktree prune

# Re-run init.sh with USE_WORKTREES=true
```

### Monitor shows "null" for agent count

Session was created incorrectly. Fix session.json:

```bash
# Ensure session.json has agentCount
cat ~/.claude/orchestration/sessions/sprint-1/session.json
# Should have: "agentCount": 8
```

### MCP tools not available

Verify `.claude/settings.json` has the orchestra MCP server configured:

```json
{
  "mcpServers": {
    "orchestra": {
      "command": "node",
      "args": [".claude/orchestra/mcp-server/dist/index.js"]
    }
  }
}
```

### Agent can't find CLAUDE.md

The CLAUDE.md files are in the session's `agents/` directory, not in the worktree:

```
~/.claude/orchestration/sessions/sprint-1/agents/ARCH/CLAUDE.md
```

## Cleanup

### Remove a session

```bash
SESSION_NAME=sprint-1
SESSION_DIR=~/.claude/orchestration/sessions/$SESSION_NAME

# Remove worktrees first
git worktree list | grep $SESSION_NAME | awk '{print $1}' | \
  xargs -I{} git worktree remove {} --force

# Remove session directory
rm -rf $SESSION_DIR

# Prune worktree references
git worktree prune
```

### Remove agent branches

```bash
git branch -D agent-1-arch agent-2-plat agent-3-sec agent-4-obs \
  agent-5-net agent-6-ops agent-7-qa agent-8-docs
```

## Best Practices

1. **Start ARCH first** - It establishes types and config that others depend on
2. **Watch the monitor** - Keep the Monitor tab visible to track progress
3. **Don't rush phases** - Wait for dependencies to complete before starting next phase
4. **Commit frequently** - Each agent should commit their work regularly
5. **Review before merge** - Check each branch before merging to main
6. **Use meaningful commits** - Agents should write clear commit messages

## Workflow Phases

### 1. Setup Phase
Initialize session with `init.sh`, start zellij layout.

### 2. Implementation Phase
Agents work on their assigned tasks in dependency order.

### 3. Enhancement Phase
After initial implementation, agents enhance with production hardening.
See [Enhancement Runbook](../runbooks/orchestra-enhancement.md).

### 4. Wrap-Up Phase
Agents squash commits, verify builds, report ready for merge.

### 5. Review & Merge Phase
Orchestrator reviews all branches, resolves conflicts, merges to main, creates PR.

```
Setup → Implementation → Enhancement → Wrap-Up → Review & Merge → PR
```

## Related Documentation

- [Orchestra Setup Runbook](../runbooks/orchestra-setup.md) - Step-by-step setup guide
- [Orchestra Enhancement Runbook](../runbooks/orchestra-enhancement.md) - Enhancement phase prompts
- [Multi-Agent Development](multi-agent.md) - General multi-agent patterns
- [Contributing](contributing.md) - Code contribution guidelines
- [Testing](testing.md) - Testing standards
