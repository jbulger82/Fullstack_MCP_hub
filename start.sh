#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export MCP_ROOT="${MCP_ROOT:-$REPO_DIR}"

echo "Using MCP_ROOT=$MCP_ROOT"
cd "$MCP_ROOT/gateway"

# Optional: free port 3333 if needed (uncomment to auto-kill)
# lsof -ti :3333 | xargs kill || true

npm start
