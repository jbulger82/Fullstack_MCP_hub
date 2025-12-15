# FullStack MCP Hub

This repo bundles the MCP hub/gateway plus a browser UI for discovering and running MCP tools.

## What’s here
- `hub/`: connects to configured MCP servers, lists tools, executes calls.
- `gateway/`: HTTP/SSE surface for the hub (`/tools`, `/gemini/v1/execute`, etc.) and serves the built UI.
- `gateway/ui/`: React UI (Vite) for browsing tools, editing descriptions, adding servers, running calls, saving presets, and managing blocked tools.
- `tool-registry/master.json`: MCP server registry (stdio/SSE).  
  `tool-registry/tool-overrides.json`: description overrides.  
  `tool-registry/tool-blocklist.json`: persisted blocklist (managed via UI Blocked tab).
- `servers/`: bundled servers (local_rag, sqlite, python_repl with venv, research incl. Wikipedia/ArXiv/Wikimedia images, scrape, pollinations, coingecko, advanced web search clone).
  - Key shipped servers:
    - `local_rag`: chunked search, fuzzy/filters, `save_chat`, `save_image`.
    - `sqlite`
    - `python_repl` (with its own venv; use `pip_install` to add packages like pandas/numpy without touching system Python)
    - `research` (Wikipedia, ArXiv, Wikimedia Commons images)
    - `scrape` (HTML→text)
    - `pollinations` (image URL + models)
    - `coingecko` (SSE, curated 4-tool allowlist: search, price, markets, range chart)
    - `websearch` (fast DDG)
    - `websearch_adv` (deep multi-engine search + single-page extract, local clone)
    - `playwright`, `shell`, `filesystem`

## Why (intent)
- Make MCP approachable: start the gateway, open the UI, add servers with a guided form, test, and go.
- Serve ops/dev workflows (LLM ops / “llmOPS” vibes) with a single pane to discover, run, and tune tools.
- No-required-API-key defaults: ships with stdio-friendly examples like Playwright for browser/search.

## Contact / collab
- Built by Jeff Bulger — https://jeffbulger.dev | admin@jeffbulger.dev | GitHub: https://github.com/jbulger82
- Looking for collaborators who want to build/extend open LLM OPS tooling (MCP servers, local-first flows, RAG, search, automation).

## Prereqs
- Node 18+ (gateway/UI), npm.
- The MCP servers you want to run (stdio commands or SSE endpoints).

## Start everything
```bash
export MCP_ROOT=/path/to/Fullstack_MCP_hub   # set to your clone path
cd gateway
npm start
# UI served at http://localhost:3333
```

First-time setup (deps + UI build):
```bash
cd gateway && npm install
cd ui && npm install && npm run build
```

One-shot setup helper (does the installs/builds/playwright browsers):
```bash
export MCP_ROOT=/path/to/Fullstack_MCP_hub   # set to your clone path
./setup.sh
```

Quick start after setup:
```bash
export MCP_ROOT=/path/to/Fullstack_MCP_hub
./start.sh
```

If port 3333 is busy: `lsof -i :3333` then `kill <pid>` and retry.

## Using the UI
Open `http://localhost:3333`.

- **Add MCP server (guided)**  
  - Click “Open form” under Servers (left pane).  
  - Choose transport:
    - `stdio`: fill Command (e.g., `npx`), Args (e.g., `-y @automatalabs/mcp-server-playwright`), optional CWD.
    - `sse`: fill full SSE URL (e.g., `http://localhost:4000/sse`).  
  - Click **Test connection** (runs a lightweight connect + tools/list).  
  - On success, click **Add server** to persist to `tool-registry/master.json` and connect live. Tools appear in the list.

- **Block/restore tools**  
  - Tools tab: “Block tool” hides the selected tool (persisted to `tool-blocklist.json`).  
  - Blocked tab: view/restore blocked tools.

- **Browse & run tools**  
  - Select a tool in the left list; right pane shows description + input schema.  
  - Enter JSON payload (or keep `{}`) and click **Run tool**.  
  - Responses show in “Result”; status chip shows timing.

- **Presets**  
  - Save current payload (“Save current”); apply or delete per tool. Stored locally in browser storage.

- **Edit descriptions**  
  - Tool detail pane has an editable description. **Save** writes to `tool-registry/tool-overrides.json`. **Restore default** removes the override.

- **RAG tab**  
  - Browse `data/rag/uploads`, `saved_chats`, `indexes`; drag/drop “ADD FILE”; search filenames/paths; delete with confirm. Uploads auto-refresh the `uploads` index.
  - Indexing: text files are chunked (~500 words + overlap); indexes persist to disk (`indexes.pkl`) so they survive restarts. `search_index` supports `fuzzy`, `path_contains`, `tag` (from a `#tags:` line), and mtime filters. Results return matching chunks (with file/chunk info).
  - Save tools: `save_chat` writes raw+summary to `data/rag/saved_chats` (no overwrites); `save_image` writes base64 images to `data/rag/images`.
  - Profiles: a starter template lives at `data/rag/profile_template/profile_public.md`. Copy/rename to your own folder (e.g., `data/rag/profile_me/profile_public.md`) and edit with your details; use `#tags:` if you want tag filtering.

## Common stdio examples (no API key)
- Playwright (browser automation/search/screenshot):  
  - Command: `npx`  
  - Args: `-y @automatalabs/mcp-server-playwright`  
  - CWD: `servers`
- DuckDuckGo Websearch (included):  
  - Command: `node`  
  - Args: `servers/websearch/server.js`  
  - CWD: repo root (`MASTER_MCP`)
- Python REPL (persistent session + its own venv):  
  - Command: `python3`  
  - Args: `python_repl_mcp.py`  
  - CWD: `servers`
- Research (Wikipedia, ArXiv, Wikimedia Commons images):  
  - Command: `python3`  
  - Args: `research_mcp_server.py`  
  - CWD: `servers`
- Scraper (fast HTML fetch/clean):  
  - Command: `node`  
  - Args: `scrape_mcp_server.js`  
  - CWD: `servers`
- Advanced web search (multi-engine + extraction; cloned locally):  
  - Command: `node`  
  - Args: `dist/index.js`  
  - CWD: `servers/web-search-mcp`
- Coingecko (SSE):  
  - Transport: `sse`  
  - URL: `https://mcp.api.coingecko.com/sse`

## Project scripts
Gateway (`/gateway`):
- `npm start` – start gateway + serve built UI.
- `npm run build:ui` – build UI assets into `gateway/ui/dist`.
- `npm run dev:ui` – UI dev server with proxy to gateway.

UI (`/gateway/ui`):
- `npm run dev` – Vite dev server (proxies to 3333).
- `npm run build` – production build.

## Paths of interest
- Gateway entry: `gateway/server.js`
- Hub logic: `hub/McpHub.js`
- UI entry: `gateway/ui/src/App.jsx`
- Registry: `tool-registry/master.json`
- Description overrides: `tool-registry/tool-overrides.json`
- Blocklist: `tool-registry/tool-blocklist.json`
- RAG data: `data/rag/` (uploads, saved_chats, indexes)
  - Includes `data/rag/images` for saved screenshots via `local_rag__save_image`.
- Advanced search clone: `servers/web-search-mcp/`

## Troubleshooting
- Port in use: `lsof -i :3333` → `kill <pid>` → restart.
- Test fails when adding server: check command/args or SSE URL; rerun **Test connection** to see error.
- No tools after add: refresh tools (left pane Refresh) or restart gateway after fixing registry.
- If a server keeps failing: check paths/CWD, block noisy tools via Blocked tab, then reconnect.
- Connecting from hosted UIs (e.g., ChatGPT dev mode): if the local URL is marked unsafe, tunnel with ngrok (e.g., ngrok v3/stable 3.34.1) to expose `http://localhost:3333` over HTTPS, then use the ngrok URL.
