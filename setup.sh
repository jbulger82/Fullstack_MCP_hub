#!/usr/bin/env bash
set -e

# Simple first-run helper for FullStack MCP Hub (portable clone).
# - Verifies prerequisites
# - Installs dependencies for gateway + UI
# - Installs Playwright browsers
# - Builds advanced websearch (if present)
# - Creates data directories
#
# Usage:
#   MCP_ROOT=/path/to/Fullstack_MCP_hub ./setup.sh
# or run from repo root after export MCP_ROOT.

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_ROOT="${MCP_ROOT:-$REPO_DIR}"

echo "MCP_ROOT set to: $MCP_ROOT"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd node
require_cmd npm
require_cmd python3

echo "Checking Node version..."
node -v
echo "Checking npm version..."
npm -v
echo "Checking Python version..."
python3 --version

echo "Creating data directories..."
mkdir -p "$MCP_ROOT/data/rag/uploads" "$MCP_ROOT/data/rag/saved_chats" "$MCP_ROOT/data/rag/indexes" "$MCP_ROOT/data/rag/images"

echo "Installing gateway deps..."
cd "$MCP_ROOT/gateway"
npm install

echo "Installing UI deps..."
cd "$MCP_ROOT/gateway/ui"
npm install
npm run build

echo "Installing Playwright browsers (may download chromium/firefox)..."
cd "$MCP_ROOT"
npx -y @automatalabs/mcp-server-playwright --browser-install || true

if [ -d "$MCP_ROOT/servers/web-search-mcp" ]; then
  echo "Building advanced web search..."
  cd "$MCP_ROOT/servers/web-search-mcp"
  npm install
  npm run build || true
fi

echo "Setup complete. To start:"
echo "  export MCP_ROOT=\"$MCP_ROOT\""
echo "  cd gateway && npm start"
