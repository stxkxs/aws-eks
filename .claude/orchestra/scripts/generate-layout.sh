#!/bin/bash
#
# generate-layout.sh - Generate Zellij layout for N agents
#
# Usage: generate-layout.sh <agent-count>
#

AGENT_COUNT="${1:-8}"

# Calculate grid dimensions
if [[ $AGENT_COUNT -le 4 ]]; then
    TABS=1
    AGENTS_PER_TAB=$AGENT_COUNT
else
    TABS=$(( (AGENT_COUNT + 3) / 4 ))
    AGENTS_PER_TAB=4
fi

cat <<'HEADER'
// Auto-generated Zellij layout for multi-agent orchestration
layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="compact-bar"
        }
        children
    }

    // Tab 1: Orchestrator
    tab name="Orchestrator" focus=true {
        pane name="orchestrator" {
            command "bash"
            args "-c" "$ORCH_ROOT/scripts/start-agent.sh 0"
        }
    }

HEADER

# Generate agent tabs
agent_num=1
for tab in $(seq 1 $TABS); do
    if [[ $TABS -eq 1 ]]; then
        tab_name="Agents"
    elif [[ $tab -eq 1 ]]; then
        tab_name="Infrastructure"
    elif [[ $tab -eq 2 ]]; then
        tab_name="Addons"
    else
        tab_name="Agents-$tab"
    fi

    echo "    // Tab $((tab+1)): $tab_name"
    echo "    tab name=\"$tab_name\" {"
    echo "        pane split_direction=\"vertical\" {"

    # Calculate agents for this tab
    remaining=$((AGENT_COUNT - agent_num + 1))
    agents_this_tab=$AGENTS_PER_TAB
    if [[ $remaining -lt $AGENTS_PER_TAB ]]; then
        agents_this_tab=$remaining
    fi

    # Create 2x2 grid or appropriate layout
    if [[ $agents_this_tab -ge 2 ]]; then
        echo "            pane split_direction=\"horizontal\" size=\"50%\" {"
    fi

    for i in $(seq 1 $agents_this_tab); do
        if [[ $i -eq 3 && $agents_this_tab -ge 3 ]]; then
            echo "            }"
            echo "            pane split_direction=\"horizontal\" size=\"50%\" {"
        fi

        echo "                pane name=\"[*] Agent-$agent_num\" {"
        echo "                    command \"bash\""
        echo "                    args \"-c\" \"\$ORCH_ROOT/scripts/start-agent.sh $agent_num\""
        echo "                }"

        agent_num=$((agent_num + 1))
        if [[ $agent_num -gt $AGENT_COUNT ]]; then
            break
        fi
    done

    if [[ $agents_this_tab -ge 2 ]]; then
        echo "            }"
    fi

    echo "        }"
    echo "    }"
    echo ""

    if [[ $agent_num -gt $AGENT_COUNT ]]; then
        break
    fi
done

cat <<'FOOTER'
    // Monitor tab
    tab name="Monitor" {
        pane name="monitor" {
            command "bash"
            args "-c" "$ORCH_ROOT/scripts/monitor.sh"
        }
    }
}
FOOTER
