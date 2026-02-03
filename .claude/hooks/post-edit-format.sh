#!/usr/bin/env bash
# PostToolUse hook: auto-formats TypeScript files after Write/Edit.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == *.ts ]]; then
  npx prettier --write "$FILE_PATH" 2>/dev/null || true
fi

exit 0
