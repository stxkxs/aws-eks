#!/bin/bash
#
# start-agent.sh - Start a single Claude agent
#
# Usage: start-agent.sh <agent-num>
#
# Required environment variables:
#   ORCH_SESSION_DIR - Path to session directory
#   ORCH_ROOT        - Path to orchestra root
#

set -e

AGENT_NUM="${1:-0}"

# Validate environment
if [[ -z "$ORCH_SESSION_DIR" ]]; then
    echo "Error: ORCH_SESSION_DIR not set" >&2
    exit 1
fi

if [[ -z "$ORCH_ROOT" ]]; then
    echo "Error: ORCH_ROOT not set" >&2
    exit 1
fi

# Load session config
SESSION_JSON="$ORCH_SESSION_DIR/session.json"
CONFIG_JSON="$ORCH_SESSION_DIR/config.json"

if [[ ! -f "$SESSION_JSON" ]]; then
    echo "Error: Session not found: $ORCH_SESSION_DIR" >&2
    exit 1
fi

# Agent 0 is the orchestrator (you)
if [[ "$AGENT_NUM" -eq 0 ]]; then
    SESSION_NAME=$(jq -r '.name' "$SESSION_JSON")
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║             AWS EKS Orchestra - Orchestrator                  ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Session: $SESSION_NAME"
    echo "║  State:   $ORCH_SESSION_DIR"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Commands:                                                    ║"
    echo "║    orch status $SESSION_NAME      Show agent status           ║"
    echo "║    orch query $SESSION_NAME AGENT 'msg'  Send task            ║"
    echo "║    orch logs $SESSION_NAME [agent]       View logs            ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    exec bash
fi

# Get agent info from config
AGENT_JSON=$(jq ".agents[$((AGENT_NUM-1))]" "$CONFIG_JSON")
AGENT_NAME=$(echo "$AGENT_JSON" | jq -r '.name')

# Paths
# - Session agent dir: contains CLAUDE.md and metadata (safe to write)
# - Worktree dir: contains the actual code (may be symlink to main repo)
SESSION_AGENT_DIR="$ORCH_SESSION_DIR/agents/$AGENT_NAME"
WORKTREE_DIR="$ORCH_SESSION_DIR/worktrees/$AGENT_NAME"

# Validate paths exist
if [[ ! -d "$SESSION_AGENT_DIR" ]]; then
    echo "Error: Session agent directory not found: $SESSION_AGENT_DIR" >&2
    exit 1
fi

if [[ ! -d "$WORKTREE_DIR" && ! -L "$WORKTREE_DIR" ]]; then
    echo "Error: Worktree not found: $WORKTREE_DIR" >&2
    exit 1
fi

# CLAUDE.md is in the session agent directory
CLAUDE_MD="$SESSION_AGENT_DIR/CLAUDE.md"
if [[ ! -f "$CLAUDE_MD" ]]; then
    echo "Error: CLAUDE.md not found: $CLAUDE_MD" >&2
    exit 1
fi

# Resolve worktree to real path (in case it's a symlink)
WORKING_DIR=$(cd "$WORKTREE_DIR" && pwd -P)

# Export for Claude
export ORCH_AGENT_NUM="$AGENT_NUM"
export ORCH_AGENT_NAME="$AGENT_NAME"

# Files
QUERY_FILE="$ORCH_SESSION_DIR/agent-${AGENT_NUM}-query.md"
STATE_FILE="$ORCH_SESSION_DIR/agent-${AGENT_NUM}-state.json"
LOG_FILE="$ORCH_SESSION_DIR/logs/agent-${AGENT_NUM}.log"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Agent $AGENT_NUM: $AGENT_NAME"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Role:       $(echo "$AGENT_JSON" | jq -r '.role')"
echo "║  Working:    $WORKING_DIR"
echo "║  CLAUDE.md:  $CLAUDE_MD"
echo "║  Query:      $QUERY_FILE"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Change to working directory
cd "$WORKING_DIR"

# Update state to running
if [[ -f "$STATE_FILE" ]]; then
    jq '.status = "running" | .lastActive = now' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && \
        mv "${STATE_FILE}.tmp" "$STATE_FILE" || true
fi

# Simple prompt - tell agent to read their CLAUDE.md file
SIMPLE_PROMPT="Read the file $CLAUDE_MD to understand your role and responsibilities. Then check $QUERY_FILE for any pending tasks. Start working on assigned tasks or wait for instructions."

# Check if expect is available for auto-prompt
if command -v expect &> /dev/null; then
    # Use expect to auto-send initial prompt after Claude initializes
    expect -c "
        set timeout -1
        log_file -a \"$LOG_FILE\"

        spawn claude --dangerously-skip-permissions

        # Wait for Claude to initialize (8 seconds)
        sleep 8

        # Send simple prompt (no special characters)
        send \"$SIMPLE_PROMPT\r\"

        # Enter interactive mode - user can now interact
        interact
    " 2>&1
else
    # Fallback: print instructions and start Claude
    echo "Note: Install 'expect' for auto-prompt feature (brew install expect)"
    echo ""
    echo "Start prompt:"
    echo "  $SIMPLE_PROMPT"
    echo ""
    claude --dangerously-skip-permissions 2>&1 | tee -a "$LOG_FILE"
fi

# Update state when done
if [[ -f "$STATE_FILE" ]]; then
    jq '.status = "stopped" | .lastActive = now' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && \
        mv "${STATE_FILE}.tmp" "$STATE_FILE" || true
fi
