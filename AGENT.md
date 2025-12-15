# AGENT.MD: FullStack MCP Hub snapshot (2025-12-15)

## 1) Progress summary
- Gateway + UI stable on :3333 (tools, blocklist, RAG browser, presets, editable descriptions).
- Tool stack ~53 tools across 12 servers: filesystem, shell, Playwright, sqlite, local_rag, websearch, websearch_adv (deep search + advanced extract), scrape, research (wiki/arXiv/Wikimedia images), python_repl (venv), pollinations, coingecko.
- local_rag scoped to `data/rag`; `save_chat` writes raw+summary without overwriting; `list_indexes` added.
- Python REPL owns its venv and `pip_install`; research adds Wikimedia Commons image search.
- Scraper server for fast HTML→text; blocklist persisted (`tool-blocklist.json`) and managed via UI.
- Allowlists: pollinations (generateImageUrl/listImageModels), coingecko (4 tools), websearch_adv (deep search + single-page extract).

---

## 2. Project Vision

To create a **universal, model-agnostic, and extensible tool-use architecture**. This system will allow any AI model (Gemini, OpenAI's GPT, Anthropic's Claude, Grok, etc.) and any custom interface (like the Francine GUI) to seamlessly access a single, powerful, and ever-growing stack of tools.

The core principle is **"Write a tool once, use it from any model."**

## 3. Core Architecture

The system is composed of three primary layers, ensuring maximum separation of concerns and scalability.

```
+----------------+      +----------------+      +----------------+
|   Gemini API   |      |   OpenAI API   |      |  Francine GUI  |
+----------------+      +----------------+      +----------------+
        |                       |                       |
        +-----------------------+-----------------------+
                                |
                 +------------------------------+
                 |   Universal API Gateway      |  <-- THE KEY TO UNIVERSALITY
                 | (Google Cloud Run/Function)  |
                 +------------------------------+
                 | - /gemini/v1/execute         |  (Gemini Tool Spec)
                 | - /openai/v1/openapi.json    |  (OpenAI Plugin Spec)
                 | - /anthropic/v1/execute      |  (Anthropic Tool Spec)
                 | - /francine/v1/mcp           |  (Custom MCP Spec)
                 +------------------------------+
                                |
                                | (Standardized Internal Request)
                                v
                   +--------------------------+
                   |         MCP Hub          |  (Borrowed from Fran1)
                   +--------------------------+
                   | - Tool Registry          |
                   | - Connection Manager     |
                   | - Execution Router       |
                   +--------------------------+
                      |          |         |
    (stdio/sse)       |          |         |
+-----------------+ +----------------+ +-----------------+
| RAG MCP Server  | | Finch MCP Serv | | Playwright MCP  |
| (Python)        | | (Node.js)      | | Server (OSS)    |
+-----------------+ +----------------+ +-----------------+

```

### 3.1. Layer 1: Tool Servers (The "Hands")

-   **Standard:** Each tool is an independent process that communicates using the **Model Context Protocol (MCP)** over `stdio` (for local tools) or `sse` (for networked tools), just like in `Fran1`.
-   **Responsibilities:** A tool server is responsible for one thing only: exposing its capabilities (`tools/list`) and executing them (`tools/call`).
-   **Examples:** A server for browsing the web with Playwright, a server for reading local files (our RAG tool), a server for interacting with APIs.

### 3.2. Layer 2: The MCP Hub (The "Brainstem")

-   **Logic:** We will adopt the robust logic from your `Fran1` project.
-   **Responsibilities:**
    1.  **Registry:** Reads a `master.json` file to discover all available tool servers.
    2.  **Connection:** Manages the lifecycle of connections to these tool servers.
    3.  **Routing:** Provides a single internal endpoint to execute any registered tool by name.

### 3.3. Layer 3: The Universal API Gateway (The "Translator")

-   **This is the most critical new component for universal compatibility.** It is a public-facing API that acts as a multi-headed adaptor.
-   **Responsibilities:**
    1.  **Expose Model-Specific Endpoints:** It will have different endpoints that conform to the *exact* tool-use specifications of different AI providers.
    2.  **Translate and Delegate:** When a request comes in from a specific model (e.g., Gemini), the gateway translates the model-specific request into a standardized call to the **MCP Hub**.
    3.  **Format and Return:** It receives the result from the MCP Hub and formats it back into the response structure the original AI model expects.
-   **Deployment:** This gateway is the perfect candidate for deployment as a serverless **Google Cloud Run** service, integrating it directly with the environment we've set up.

## 4. Development Roadmap

This plan is designed for parallel work. Different agents can tackle different MCP servers simultaneously once the core is in place.

1.  **Setup Core Infrastructure:**
    -   `[✅]` Initialize the `MASTER_MCP` project structure (e.g., `/servers`, `/hub`, `/gateway`).
    -   `[✅]` Port the `McpHub` logic from `Fran1` into this new project.
    -   `[✅]` Port the `master.json` registry and create a directory for tool server configurations.

2.  **Integrate First Tool (Proof of Concept):**
    -   `[✅]` Find and integrate an existing open-source MCP-compatible tool (e.g., for Playwright or a similar web browser tool).
    -   `[✅]` Register it in `master.json` and confirm the `McpHub` can connect to and list its tools.

3.  **Build the Local RAG Tool:**
    -   `[✅]` Create the new `rag_mcp_server.py`.
    -   `[✅]` Implement `list_directory`, `read_file`, and `search_files` functions.
    -   `[✅]` Implement `create_index` and `search_index` with **named collection support**.
    -   `[✅]` Register it with the `McpHub`.

4.  **Build the Universal Gateway (Gemini First):**
    -   `[✅]` Create the initial API Gateway project (e.g., using Node.js/Express or Python/FastAPI).
    -   `[✅]` Implement the `/gemini/v1/execute` endpoint. This endpoint will accept a request body matching the Gemini API's `FunctionCall` format.
    -   **Status:** Fully functional and tested.

5.  **Expand and Integrate:**
    -   `[✅]` Integrate **Shell MCP** (`mcp-server-commands`) for command-line access.
    -   `[✅]` Integrate **Playwright MCP** (`mcp-server-playwright`) for browser automation.
    -   `[✅]` Integrate **SQLite MCP** (`mcp-server-sqlite`) for persistent memory.
    -   `[✅]` Initialize `tool_runs` logging table in SQLite.
    -   `[✅]` Organize documentation into `~/.master_mcp/data/raw/mcp_docs` and create RAG index.

---

## 5. System Status (Live)

Approx tools: 53

| Server | Transport | Tools | Notes |
| :--- | :--- | :--- | :--- |
| filesystem | stdio (npx) | 14 | sandbox `/home/jeff` |
| local_rag | stdio (python) | 6 | save_chat, list_indexes; sandbox `data/rag` |
| shell | stdio (node) | 1 | commands |
| playwright | stdio (npx) | 10 | browser automation |
| sqlite | stdio (python venv) | 6 | db ops |
| websearch | stdio (node) | 1 | fast DDG |
| websearch_adv | stdio (node) | 2 | deep search + single-page extract (allowlisted) |
| scrape | stdio (node) | 1 | fast HTML→text |
| research | stdio (python) | 3 | wiki, arxiv, Commons images |
| python_repl | stdio (python) | 3 | exec/reset/pip (venv) |
| pollinations | stdio (npx) | 2 | image URL + list models |
| coingecko | sse | 4 | allowlisted to search/price/markets/range |
