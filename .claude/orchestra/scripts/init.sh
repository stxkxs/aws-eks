#!/bin/bash
#
# init.sh - Initialize an orchestration session
#
# Required environment variables:
#   ORCH_ROOT       - Path to orchestra directory
#   CONFIG_NAME     - Configuration file name (without .json)
#   SESSION_NAME    - Session name
#   TARGET_REPO     - Path to the target repository
#   USE_WORKTREES   - "true" or "false"
#

set -e

# Validate required environment
for var in ORCH_ROOT CONFIG_NAME SESSION_NAME TARGET_REPO; do
    if [[ -z "${!var}" ]]; then
        echo "Error: $var is not set" >&2
        exit 1
    fi
done

USE_WORKTREES="${USE_WORKTREES:-false}"

# Paths
CONFIG_FILE="$ORCH_ROOT/configs/${CONFIG_NAME}.json"
STATE_DIR="${HOME}/.claude/orchestration/sessions/${SESSION_NAME}"
TEMPLATES_DIR="$ORCH_ROOT/templates"
LAYOUTS_DIR="$ORCH_ROOT/layouts"

# Validate config exists
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "Error: Config file not found: $CONFIG_FILE" >&2
    exit 1
fi

# Check if session already exists
if [[ -d "$STATE_DIR" ]]; then
    echo "Error: Session already exists: $SESSION_NAME" >&2
    echo "Run: orch cleanup $SESSION_NAME" >&2
    exit 1
fi

echo "Initializing session: $SESSION_NAME"
echo "  Config: $CONFIG_NAME"
echo "  Target: $TARGET_REPO"
echo "  Worktrees: $USE_WORKTREES"

# Create session directory structure
mkdir -p "$STATE_DIR"/{logs,worktrees,agents}

# Copy config
cp "$CONFIG_FILE" "$STATE_DIR/config.json"

# Get agent count
AGENT_COUNT=$(jq '.agents | length' "$CONFIG_FILE")

# Save session metadata
cat > "$STATE_DIR/session.json" <<EOF
{
  "name": "$SESSION_NAME",
  "config": "$CONFIG_NAME",
  "targetRepo": "$TARGET_REPO",
  "worktrees": $USE_WORKTREES,
  "agentCount": $AGENT_COUNT,
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "initialized"
}
EOF

# Generate CLAUDE.md for each agent (stored in session agents/ directory, NOT in repo)
generate_claude_md() {
    local agent_id=$1
    local session_agent_dir=$2

    local agent_json=$(jq ".agents[] | select(.id == $agent_id)" "$CONFIG_FILE")
    local name=$(echo "$agent_json" | jq -r '.name')
    local role=$(echo "$agent_json" | jq -r '.role')
    local description=$(echo "$agent_json" | jq -r '.description')
    local focus=$(echo "$agent_json" | jq -r '.focus | join("\n- ")')
    local deps=$(echo "$agent_json" | jq -r '.dependencies | if length > 0 then map(tostring) | join(", ") else "none" end')

    local query_file="$STATE_DIR/agent-${agent_id}-query.md"
    local response_file="$STATE_DIR/agent-${agent_id}-response.md"
    local state_file="$STATE_DIR/agent-${agent_id}-state.json"

    # Check for agent-specific template
    local template_file="$TEMPLATES_DIR/agents/$(echo "$name" | tr '[:upper:]' '[:lower:]').md"

    if [[ -f "$template_file" ]]; then
        # Use agent-specific template with variable substitution
        sed -e "s|{{AGENT_ID}}|$agent_id|g" \
            -e "s|{{AGENT_NAME}}|$name|g" \
            -e "s|{{SESSION_NAME}}|$SESSION_NAME|g" \
            -e "s|{{QUERY_FILE}}|$query_file|g" \
            -e "s|{{RESPONSE_FILE}}|$response_file|g" \
            -e "s|{{STATE_FILE}}|$state_file|g" \
            -e "s|{{TARGET_REPO}}|$TARGET_REPO|g" \
            "$template_file" > "$session_agent_dir/CLAUDE.md"
    else
        # Generate generic CLAUDE.md
        cat > "$session_agent_dir/CLAUDE.md" <<CLAUDE_EOF
# $name - Agent $agent_id

You are the **$role** for the AWS EKS infrastructure project.

## Your Responsibilities
$description

## Focus Areas
- $focus

## Dependencies
Depends on agents: $deps

## Communication

### Check for Tasks
Look for pending tasks in: \`$query_file\`

### Report Status
Update your status by telling me when you start, complete, or get blocked.

### Working Directory
$TARGET_REPO

## Current Task
Check your query file for pending tasks. Read the main CLAUDE.md in the project root to understand conventions. Start working on any assigned tasks.

## Code Conventions
Follow the patterns in the main CLAUDE.md at the project root.
CLAUDE_EOF
    fi

    # Initialize agent state
    cat > "$state_file" <<STATE_EOF
{
  "agentId": $agent_id,
  "agentName": "$name",
  "status": "pending",
  "lastActive": null,
  "currentTask": null,
  "restarts": 0
}
STATE_EOF

    echo "  Created agent $agent_id: $name"
}

# Create worktree or symlink for each agent, plus agent metadata directory
for i in $(seq 1 "$AGENT_COUNT"); do
    agent_json=$(jq ".agents[$((i-1))]" "$CONFIG_FILE")
    agent_name=$(echo "$agent_json" | jq -r '.name')
    agent_branch=$(echo "$agent_json" | jq -r '.branch // empty')

    # Session agent directory (for CLAUDE.md and metadata)
    session_agent_dir="$STATE_DIR/agents/$agent_name"
    mkdir -p "$session_agent_dir"

    # Worktree directory (for actual code work)
    worktree_dir="$STATE_DIR/worktrees/$agent_name"

    if [[ "$USE_WORKTREES" == "true" && -n "$agent_branch" ]]; then
        # Create git worktree for isolated branch work
        # Create branch if it doesn't exist
        git -C "$TARGET_REPO" branch "$agent_branch" 2>/dev/null || true

        # Create worktree
        git -C "$TARGET_REPO" worktree add "$worktree_dir" "$agent_branch" 2>/dev/null || {
            echo "  Warning: Could not create worktree for $agent_name, using symlink"
            ln -sf "$TARGET_REPO" "$worktree_dir"
        }
    else
        # Create symlink to main repo (all agents work on same codebase)
        ln -sf "$TARGET_REPO" "$worktree_dir"
    fi

    # Generate CLAUDE.md in the session agent directory (not in the repo!)
    generate_claude_md "$i" "$session_agent_dir"
done

# Copy or generate layout
layout_name=$(jq -r '.layout // "8-agents.kdl"' "$CONFIG_FILE")
layout_file="$LAYOUTS_DIR/$layout_name"

if [[ -f "$layout_file" ]]; then
    cp "$layout_file" "$STATE_DIR/layout.kdl"
elif [[ -f "$ORCH_ROOT/scripts/generate-layout.sh" ]]; then
    "$ORCH_ROOT/scripts/generate-layout.sh" "$AGENT_COUNT" > "$STATE_DIR/layout.kdl"
else
    echo "Warning: No layout file found, using default"
    cp "$LAYOUTS_DIR/8-agents.kdl" "$STATE_DIR/layout.kdl" 2>/dev/null || true
fi

echo ""
echo "Session initialized: $SESSION_NAME"
echo "  State directory: $STATE_DIR"
echo "  Agents: $AGENT_COUNT"
echo ""
echo "Next: orch start $SESSION_NAME"
