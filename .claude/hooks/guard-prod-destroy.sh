#!/usr/bin/env bash
# PreToolUse hook: blocks direct `cdk destroy` on production.
# Use the /destroy command with safety checks instead.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$CMD" | grep -qiE '(npx |npx\.cmd )?cdk destroy.*production|cdk destroy.*-c environment=production'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Direct cdk destroy on production is blocked. Use /destroy command with safety checks."
    }
  }'
  exit 0
fi

exit 0
