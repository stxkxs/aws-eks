#!/bin/bash
#
# monitor.sh - Real-time agent status dashboard
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get session directory
SESSION_DIR="${ORCH_SESSION_DIR:-}"

if [[ -z "$SESSION_DIR" ]]; then
    echo "Error: ORCH_SESSION_DIR not set"
    exit 1
fi

SESSION_JSON="$SESSION_DIR/session.json"
CONFIG_JSON="$SESSION_DIR/config.json"

if [[ ! -f "$SESSION_JSON" ]]; then
    echo "Error: Session not found"
    exit 1
fi

SESSION_NAME=$(jq -r '.name' "$SESSION_JSON")
AGENT_COUNT=$(jq -r '.agentCount' "$SESSION_JSON")

clear_screen() {
    printf '\033[2J\033[H'
}

status_icon() {
    case "$1" in
        running)  echo -e "${GREEN}[*]${NC}" ;;
        idle)     echo -e "${BLUE}[ ]${NC}" ;;
        blocked)  echo -e "${RED}[X]${NC}" ;;
        complete) echo -e "${GREEN}[+]${NC}" ;;
        pending)  echo -e "${YELLOW}[.]${NC}" ;;
        stopped)  echo -e "${YELLOW}[-]${NC}" ;;
        *)        echo -e "${RED}[?]${NC}" ;;
    esac
}

while true; do
    clear_screen

    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}           AWS EKS Orchestra - Session: ${GREEN}$SESSION_NAME${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  Agent    Status      Role                     Last Active  ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"

    for i in $(seq 1 "$AGENT_COUNT"); do
        state_file="$SESSION_DIR/agent-${i}-state.json"

        if [[ -f "$state_file" ]]; then
            name=$(jq -r '.agentName // "Agent-'$i'"' "$state_file")
            status=$(jq -r '.status // "unknown"' "$state_file")

            # Get role from config
            role=$(jq -r ".agents[$((i-1))].role // \"\"" "$CONFIG_JSON" | cut -c1-24)

            # Calculate time since last active
            last_active=$(jq -r '.lastActive // null' "$state_file")
            if [[ "$last_active" != "null" && -n "$last_active" ]]; then
                # Just show "active" for now
                time_str="active"
            else
                time_str="never"
            fi

            icon=$(status_icon "$status")
            printf "${CYAN}║${NC}  %-8s %s %-10s %-24s %-11s ${CYAN}║${NC}\n" \
                "$name" "$icon" "$status" "$role" "$time_str"
        fi
    done

    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Legend:${NC} [*] running  [ ] idle  [X] blocked  [+] complete  [.] pending"
    echo ""
    echo -e "${CYAN}Press Ctrl+C to exit${NC}"

    sleep 5
done
