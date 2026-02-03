# Runbook: Orchestra Setup and Execution

## Overview

Step-by-step guide to initialize and run the multi-agent orchestra system for parallel development.

## Prerequisites

- [ ] Node.js 20+ installed
- [ ] Zellij terminal multiplexer installed (`brew install zellij`)
- [ ] Git configured
- [ ] Claude CLI installed and authenticated

## Procedure

### Step 1: Verify Orchestra Installation

```bash
# Check orchestra directory exists
ls -la <project-root>/.claude/orchestra/

# Expected output should show:
# configs/  layouts/  mcp-server/  scripts/  templates/
```

### Step 2: Build MCP Server (if needed)

```bash
cd <project-root>/.claude/orchestra/mcp-server
npm install
npm run build
```

### Step 3: Initialize Session

```bash
# Set environment variables
export ORCH_ROOT=<project-root>/.claude/orchestra
export CONFIG_NAME=aws-eks-dev
export SESSION_NAME=sprint-1
export TARGET_REPO=<project-root>
export USE_WORKTREES=true

# Run initialization
$ORCH_ROOT/scripts/init.sh
```

**Expected output:**
```
Initializing session: sprint-1
  Config: aws-eks-dev
  Target: <project-root>
  Worktrees: true
  Created agent 1: ARCH
  Created agent 2: PLAT
  ...
Session initialized: sprint-1
  State directory: ~/.claude/orchestration/sessions/sprint-1
  Agents: 8
```

### Step 4: Smoke Test (first time only)

Before your first real session, validate the full pipeline:

```bash
bash scripts/smoke-test-orchestra.sh
```

This launches all 8 agents with trivial read-only tasks. Each reads files in their focus area and calls `mark_complete` via MCP. Takes ~2 minutes. See [Smoke Testing](../development/orchestra.md#smoke-testing) for details on what it validates and how to check results.

Cleanup after: `rm -rf ~/.claude/orchestration/sessions/smoke-test`

### Step 5: Start Zellij Session

```bash
export ORCH_SESSION_DIR=$HOME/.claude/orchestration/sessions/sprint-1
zellij --layout $ORCH_SESSION_DIR/layout.kdl
```

### Step 6: Execute Agents in Dependency Order

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXECUTION ORDER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 1: Foundation (Sequential)                                │
│  ════════════════════════════════                                │
│  Tab: Infrastructure                                             │
│  ┌─────────┐                                                     │
│  │  ARCH   │ ← START FIRST                                       │
│  │ Agent 1 │   Types, config, structure                          │
│  └────┬────┘                                                     │
│       │ WAIT until ARCH reports complete                         │
│       ▼                                                          │
│  PHASE 2: Core Infrastructure (Parallel)                         │
│  ═══════════════════════════════════════                         │
│  Tab: Infrastructure + Addons                                    │
│  ┌─────────┬─────────┬─────────┐                                │
│  │  PLAT   │   SEC   │   OBS   │ ← START ALL THREE              │
│  │ Agent 2 │ Agent 3 │ Agent 4 │   Can run in parallel          │
│  └────┬────┴────┬────┴────┬────┘                                │
│       │         │         │                                      │
│       │ WAIT until PLAT reports complete                         │
│       ▼         ▼         ▼                                      │
│  PHASE 3: Integration (Parallel)                                 │
│  ══════════════════════════════                                  │
│  Tab: Addons                                                     │
│  ┌─────────┬─────────┐                                          │
│  │   NET   │   OPS   │ ← START BOTH                             │
│  │ Agent 5 │ Agent 6 │   Can run in parallel                    │
│  └────┬────┴────┬────┘                                          │
│       │         │                                                │
│       │ WAIT until NET and OPS report complete                   │
│       ▼         ▼                                                │
│  PHASE 4: Validation (Parallel)                                  │
│  ══════════════════════════════                                  │
│  Tab: Validation                                                 │
│  ┌─────────┬─────────┐                                          │
│  │   QA    │  DOCS   │ ← START BOTH                             │
│  │ Agent 7 │ Agent 8 │   Can run in parallel                    │
│  └─────────┴─────────┘                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Step 7: Monitor Progress

Switch to the **Monitor** tab to see real-time status:

```
╔══════════════════════════════════════════════════════════════╗
║           AWS EKS Orchestra - Session: sprint-1
╠══════════════════════════════════════════════════════════════╣
║  Agent    Status      Role                     Last Active   ║
╠══════════════════════════════════════════════════════════════╣
║  ARCH     [*] running  Architect               active        ║
║  PLAT     [.] pending  Platform Engineer       never         ║
║  SEC      [.] pending  Security Engineer       never         ║
║  OBS      [.] pending  Observability Engineer  never         ║
║  NET      [.] pending  Networking Engineer     never         ║
║  OPS      [.] pending  Operations Engineer     never         ║
║  QA       [.] pending  QA Engineer             never         ║
║  DOCS     [.] pending  Tech Writer             never         ║
╚══════════════════════════════════════════════════════════════╝
```

### Step 8: Merge Completed Work

After all agents complete:

```bash
cd <project-root>
git checkout main

# Merge in dependency order
git merge agent-1-arch --no-ff -m "feat(arch): foundation types and config"
git merge agent-2-plat --no-ff -m "feat(platform): VPC and EKS cluster"
git merge agent-3-sec --no-ff -m "feat(security): Falco, Trivy, Kyverno"
git merge agent-4-obs --no-ff -m "feat(observability): AMP, Loki, Tempo"
git merge agent-5-net --no-ff -m "feat(networking): Cilium, ALB, DNS"
git merge agent-6-ops --no-ff -m "feat(operations): Velero, CI/CD"
git merge agent-7-qa --no-ff -m "test: comprehensive test coverage"
git merge agent-8-docs --no-ff -m "docs: documentation and runbooks"
```

## Verification

- [ ] All 8 agents show `[+] complete` in monitor
- [ ] Each agent branch has commits
- [ ] All branches merge cleanly to main
- [ ] `npm run build` succeeds after merge
- [ ] `npm test` passes after merge

## Rollback

If a session is broken:

```bash
# Clean up worktrees
git worktree list | grep sprint-1 | awk '{print $1}' | \
  xargs -I{} git worktree remove {} --force

# Remove session
rm -rf ~/.claude/orchestration/sessions/sprint-1

# Prune git references
git worktree prune

# Re-initialize
$ORCH_ROOT/scripts/init.sh
```

## Related

- [Orchestra Documentation](../development/orchestra.md) - Full reference (smoke testing, extending, query format)
- [Orchestra Enhancement Runbook](orchestra-enhancement.md) - Enhancement phase prompts
- [Multi-Agent Development](../development/multi-agent.md)

---

## Claude Setup Prompt

Use this prompt when asking Claude to help set up the orchestra:

```
I need help setting up and running the multi-agent orchestra for the AWS EKS project.

The orchestra system is at: <project-root>/.claude/orchestra/

Please help me:
1. Initialize a new session with git worktrees (USE_WORKTREES=true)
2. Start the zellij session with all 8 agents
3. Guide me through the execution order based on dependencies:
   - Phase 1: ARCH (foundation) - must complete first
   - Phase 2: PLAT, SEC, OBS (parallel) - after ARCH
   - Phase 3: NET, OPS (parallel) - after PLAT
   - Phase 4: QA, DOCS (parallel) - after all above
4. Help me monitor progress and troubleshoot any issues
5. Merge all agent branches back to main when complete

Configuration: aws-eks-dev (8 agents)
Session name: sprint-1

Environment variables needed:
- ORCH_ROOT=<project-root>/.claude/orchestra
- ORCH_SESSION_DIR=$HOME/.claude/orchestration/sessions/sprint-1

If the session already exists, clean it up first by removing worktrees and the session directory.
```
