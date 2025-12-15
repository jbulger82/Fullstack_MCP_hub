# FullStack MCP Hub

**FullStack MCP Hub — complete MCP toolkit with built-in RAG, GUI and 50+ free tools (no paid APIs) that runs out-of-the-box.**  

Works with:

- OpenAI / ChatGPT **Codex CLI**
- **Gemini CLI**
- **ChatGPT (Dev Mode)** via custom connector
- **Claude** (desktop / MCP)
- **Local LLMs** (llama.cpp, LM Studio, etc.)
- Basically *anything* that can connect to an MCP server over **stdio** or **SSE**

Instead of every model having its own isolated tools and half-memory, FullStack MCP Hub gives you **one central MCP stack**:

- A **gateway + hub** that connects to multiple MCP servers, discovers tools, and exposes them through a single endpoint.
- A **graphical UI** where you can:
  - browse tools from all connected servers,
  - edit tool descriptions,
  - block tools you don’t want used,
  - save payload presets,
  - and run tools live with JSON inputs and real responses.
- A **built-in RAG system** with its own tab:
  - drag & drop files directly into the UI,
  - browse your RAG folders (`uploads`, `saved_chats`, `images`, `indexes`, profiles),
  - create named indexes from directories,
  - search using keyword + fuzzy match + filters,
  - and wire that context into any model you’re using.

Out of the box you get a **solid, free MCP tool stack** (no paid APIs required):

- Filesystem, shell, Python REPL (with its own venv)
- Local RAG (chunked search, filters, `save_chat`, `save_image`)
- Playwright (browser automation, screenshots, interactive browsing)
- SQLite (read/write, schema, insights)
- Web search (fast DuckDuckGo + deeper multi-engine clone)
- Research (Wikipedia, arXiv, Wikimedia images)
- Scraper (HTML → text)
- Image generation via Pollinations (URL-based)
- CoinGecko market data (curated, SSE-based)
- Clock/time utilities

The goal: **make MCP server integration easy**, and give you a reusable tool + RAG layer you can plug into any LLM workflow—cloud, local, or hybrid.

---

## Screenshots
<img width="1920" height="1080" alt="gemss" src="https://github.com/user-attachments/assets/9cc0806c-ce99-4753-80b6-f60201d72aca" />
<img width="654" height="935" alt="openss" src="https://github.com/user-attachments/assets/30089751-fbd2-404b-9133-68820fede375" />
<img width="1920" height="1080" alt="ui1" src="https://github.com/user-attachments/assets/80289d58-6dac-4a4c-b612-34f9bbf10d78" />
<img width="1920" height="1080" alt="ui2" src="https://github.com/user-attachments/assets/50411040-cb24-410f-a256-b3ee1d566a48" />
<img width="1920" height="1080" alt="ui3" src="https://github.com/user-attachments/assets/0f6fca44-105c-4cfb-9f4a-1fceda471b06" />
<img width="1920" height="1080" alt="ui4" src="https://github.com/user-attachments/assets/cf88e509-0688-4c2e-8641-a5418914891f" />
<img width="1920" height="1080" alt="chat1" src="https://github.com/user-attachments/assets/7eec1f78-10b3-418b-aa8c-7b7bcc3c7711" />
<img width="1903" height="988" alt="gpt2" src="https://github.com/user-attachments/assets/4fc89146-abfb-4efa-86ed-e5ffeac60e67" />
<img width="1894" height="1081" alt="gpt4" src="https://github.com/user-attachments/assets/f82174f7-9cc0-4f3f-9e99-174cf71ba40e" />
<img width="1933" height="1048" alt="gpt3" src="https://github.com/user-attachments/assets/124c8547-c449-418b-88ad-3beede3a94b5" />



---

## Quick install & first run

The idea:  
**clone → run one script → open the UI → start adding MCP servers.**

### Requirements

- Node.js **18+**
- `npm`
- Linux/macOS shell (bash/zsh) or WSL on Windows

> You do *not* need any paid API keys to get started.  
> All bundled MCP servers run locally and use free/public data sources.

---

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/FullStack_MCP_Hub.git
cd FullStack_MCP_Hub
````

Set the root path (used by helper scripts):

```bash
export MCP_ROOT="$(pwd)"
```

(Optional) Add this to your shell rc (`~/.bashrc` or `~/.zshrc`) so it’s always set:

```bash
echo "export MCP_ROOT=/full/path/to/FullStack_MCP_Hub" >> ~/.bashrc
```

Reload your shell or open a new terminal after adding it.

---

### 2. One-shot setup (recommended)

This will:

* install gateway and UI dependencies,
* build the React UI,
* install Playwright browsers for the Playwright MCP server.

From the repo root:

```bash
cd "$MCP_ROOT"
chmod +x setup.sh start.sh
./setup.sh
```

Run this once. If it finishes without errors, you’re ready to start the hub.

---

### 3. Start the hub + UI

From the repo root:

```bash
cd "$MCP_ROOT"
./start.sh
```

This will:

* start the MCP gateway on **[http://localhost:3333](http://localhost:3333)**
* expose:

  * `GET  /tools` – list tools
  * `GET  /sse` – universal MCP SSE endpoint
  * `POST /gemini/v1/execute` – Gemini-style adapter
* serve the **web UI** at **[http://localhost:3333](http://localhost:3333)**

Open your browser:

```text
http://localhost:3333
```

If port **3333** is already in use:

```bash
lsof -i :3333
kill <pid>
./start.sh
```

---

### 4. Manual setup (if you don’t want to use setup.sh)

If you prefer to see the individual steps:

1. Install gateway deps:

   ```bash
   cd "$MCP_ROOT/gateway"
   npm install
   ```

2. Install UI deps and build:

   ```bash
   cd "$MCP_ROOT/gateway/ui"
   npm install
   npm run build
   ```

3. Start the gateway:

   ```bash
   cd "$MCP_ROOT/gateway"
   npm start
   ```

4. Open the UI:

   ```text
   http://localhost:3333
   ```

---

### 5. First MCP server (Playwright example)

Once the UI is open:

1. Go to the **Servers** section (left sidebar).

2. Click **“Open form”**.

3. Fill the form:

   * **Transport:** `stdio`
   * **Command:** `npx`
   * **Args:** `-y @automatalabs/mcp-server-playwright`
   * **CWD:** `servers` (relative to repo root)

4. Click **Test connection**.

5. On success, click **Add server**.

You should now see a group of `playwright__*` tools in the list.

For a quick sanity check, select `playwright__browser_navigate` and run:

```json
{ "url": "https://example.com" }
```

Then run `playwright__browser_screenshot`:

```json
{ "name": "example_full", "fullPage": true }
```

You should see a screenshot file appear in your configured Playwright output path.

At this point, the hub is working and ready to be plugged into:

* OpenAI / ChatGPT **Codex CLI**
* **Gemini CLI**
* **ChatGPT Dev Mode**
* **Claude** or any other MCP-aware client.

---

## Architecture & repo layout

FullStack MCP Hub is three main layers: **hub**, **gateway**, and **UI**, plus a set of bundled MCP servers and a RAG data directory.

### Repo layout

* `hub/`
  MCP hub core:

  * connects to configured MCP servers,
  * lists tools across all servers,
  * executes calls,
  * merges tool metadata,
  * applies description overrides and blocklist.

* `gateway/`
  HTTP/SSE front door:

  * exposes:

    * `GET  /tools` – enumerate tools
    * `GET  /sse` – universal MCP endpoint
    * `POST /gemini/v1/execute` – Gemini-style adapter
  * serves built UI from `gateway/ui/dist`.

* `gateway/ui/`
  React + Vite UI:

  * Tools list & detail pane
  * Servers management (add/test/remove)
  * Blocked tools view
  * Tool payload presets
  * RAG tab (drag/drop uploads, browse folders, search indexes)

* `tool-registry/master.json`

  * registry of MCP servers (stdio + SSE) and their config.

* `tool-registry/tool-overrides.json`

  * per-tool description overrides (editable in the UI).

* `tool-registry/tool-blocklist.json`

  * persistent tool blocklist (managed from the UI’s Blocked tab).

* `servers/`

  * bundled MCP servers that require **no** paid APIs:

    * `local_rag`
    * `sqlite`
    * `python_repl`
    * `research`
    * `scrape`
    * `pollinations`
    * `coingecko`
    * `websearch`
    * `web-search-mcp` (advanced)
    * `playwright`
    * `shell`
    * `filesystem`

* `data/rag/`

  * Local RAG storage:

    * `uploads/` – arbitrary files you import via the UI.
    * `saved_chats/` – raw + summary chat logs.
    * `images/` – saved images from `local_rag__save_image`.
    * `profile_*` – profile folders (e.g. `profile_jeff`).
    * `indexes/` – per-index folders if used.
    * `indexes.pkl` – a persisted, global index metadata file.

---

## RAG system (“Generation 1.5”)

The built-in RAG system is designed to be:

* **lightweight** (no embeddings required),
* **chunked** (about 500-word chunks),
* **fuzzy-searchable**,
* and **filterable** (path, tags, time).

### How it works (high-level)

1. You drop files into `data/rag/` (usually via the RAG tab in the UI).
2. You point `local_rag__create_index` at a directory and give the index a name.
3. The server:

   * walks that directory,
   * extracts text,
   * splits each file into ~500-word chunks with overlap,
   * stores chunks + metadata,
   * and persists the structure into **`indexes.pkl`**.
4. When you use `local_rag__search_index`:

   * it looks up the chosen index,
   * runs keyword + fuzzy search over chunks,
   * applies optional filters (like `path_contains`, `tag`, or mtime),
   * and returns matching chunks with enough context to feed into a model.

### “Generation 1.5” upgrades

The “Generation 1.5” RAG upgrades improved a few key things:

1. **Path handling**

   * `local_rag__create_index` and `local_rag__search_index` now handle **relative paths correctly**, so you can point indexes at directories under `data/rag/` without hard-coding absolute paths.

2. **Chunked indexing**

   * `local_rag__create_index` splits content into **~500-word chunks with overlap**, instead of indexing whole files.
   * This improves relevance and keeps the amount of text passed back to models manageable.

3. **Fuzzy search**

   * `local_rag__search_index` supports **fuzzy matches**, so minor typos or wording changes won’t break recall.
   * It uses a sliding-window + similarity scoring approach over pre-chunked text.

4. **Filters**

   * `path_contains` is confirmed working.
   * Other filters (`tag`, mtime filters) are implemented and behave as expected:

     * `tag` comes from lines like `#tags: project, profile` in your markdown.
     * time filters use file modified times to narrow which chunks are searched.

Overall, this gives you a RAG system that sits between:

* **plain keyword search** (too dumb, no chunking, no fuzzy), and
* **full vector/embedding RAG** (heavier, needs extra models + infra),

while staying simple and fast for personal / local knowledge bases.

You (or contributors) can later add an optional vector layer on top, without breaking the existing API.

---

## RAG folders & workflows

### Folder layout

Under `data/rag/` you’ll typically see:

* `uploads/`

  * Files you drag/drop in via the RAG tab.

* `saved_chats/`

  * Files created by `local_rag__save_chat`, usually:

    * a full raw transcript file,
    * a summary file,
    * filenames encoded with timestamp + model name.

* `images/`

  * Files created by `local_rag__save_image` from base64 payloads.

* `profile_template/`

  * Template profile file: `profile_public.md`.

* `profile_*` (e.g. `profile_jeff/`)

  * Your actual profile data:

    * `profile_public.md` (name, prefs, projects, etc.).

* `indexes/`

  * Optional per-index structure if you store extra metadata per index.

* `indexes.pkl`

  * Single persisted file that tracks all indexes and cached text.

### Typical RAG flow

1. **Create a personal profile**

   * Copy the template:

     ```bash
     mkdir -p data/rag/profile_jeff
     cp data/rag/profile_template/profile_public.md data/rag/profile_jeff/
     ```

   * Edit `profile_public.md` with your personal details and preferences.

   * Optionally add a tag line near the top:

     ```text
     #tags: profile, persona
     ```

   * Create an index for it:

     ```json
     {
       "index_name": "profile_jeff",
       "directory": "data/rag/profile_jeff"
     }
     ```

     via `local_rag__create_index`.

2. **Use your profile in new chats**

   * In any client connected to this hub, ask it to call `local_rag__search_index` with:

     ```json
     {
       "index_name": "profile_jeff",
       "query": "profile persona",
       "max_results": 5
     }
     ```

   * Then tell the model to keep that profile in mind for the rest of the session.

3. **Save chats**

   * When a conversation is important, call `local_rag__save_chat` with:

     * full transcript,
     * optional summary,
     * model/client name.
   * The file will get dropped into `data/rag/saved_chats/` with a timestamped name.

4. **Index & search project folders**

   * Put a project folder under `data/rag/uploads/my_project/`.

   * Create an index:

     ```json
     {
       "index_name": "my_project",
       "directory": "data/rag/uploads/my_project"
     }
     ```

   * Later, search it via `local_rag__search_index` for quick recall.

---

## Tool reference (56 bundled tools)

All tools are exposed via the MCP hub once their servers are connected.

### Filesystem (14 tools)

* `filesystem__create_directory`
* `filesystem__directory_tree`
* `filesystem__edit_file`
* `filesystem__get_file_info`
* `filesystem__list_allowed_directories`
* `filesystem__list_directory`
* `filesystem__list_directory_with_sizes`
* `filesystem__move_file`
* `filesystem__read_file`
* `filesystem__read_media_file`
* `filesystem__read_multiple_files`
* `filesystem__read_text_file`
* `filesystem__search_files`
* `filesystem__write_file`

Use these for inspecting, reading, writing, and organizing files and directories under the allowed roots (configured on the filesystem MCP server).

---

### Local RAG (6 tools)

* `local_rag__create_index`
  Build a named index from a directory of text files (chunked).

* `local_rag__search_index`
  Search a named index with keyword + fuzzy match and optional filters.

* `local_rag__list_files`
  List files inside RAG directories.

* `local_rag__list_indexes`
  List all available indexes.

* `local_rag__read_file`
  Read a file managed by local_rag.

* `local_rag__save_chat`
  Save raw + summary chats into `data/rag/saved_chats/`.

* `local_rag__save_image`
  Save base64 images into `data/rag/images/`.

---

### Shell (1 tool)

* `shell__run_command`
  Execute shell commands on the host machine.
  Powerful and potentially dangerous—intended for trusted, local setups.

---

### Playwright (10 tools)

* `playwright__browser_navigate`
* `playwright__browser_screenshot`
* `playwright__browser_click`
* `playwright__browser_click_text`
* `playwright__browser_fill`
* `playwright__browser_select`
* `playwright__browser_select_text`
* `playwright__browser_hover`
* `playwright__browser_hover_text`
* `playwright__browser_evaluate`

Use these for full browser automation:

* open pages,
* fill forms,
* click buttons/links,
* run JS,
* and capture screenshots.

---

### SQLite (6 tools)

* `sqlite__read_query`
* `sqlite__write_query`
* `sqlite__create_table`
* `sqlite__list_tables`
* `sqlite__describe_table`
* `sqlite__append_insight`

Great for storing structured logs, metrics, and notes directly from LLM runs.

---

### Web search (basic + advanced, 3 tools)

* `websearch__web_search`
  Fast DuckDuckGo search with snippets.

* `websearch_adv__full-web-search`
  Multi-engine deep search with full-page extraction.

* `websearch_adv__get-single-web-page-content`
  Robust content extractor for a single page.

---

### Research (3 tools)

* `research__wikipedia_search`
* `research__arxiv_search`
* `research__images_search_commons`

These provide high-signal reference material for technical/academic questions and image lookups.

---

### Python REPL (3 tools)

* `python_repl__exec`
* `python_repl__reset`
* `python_repl__pip_install`

Persistent Python process with its own venv:

* run analysis code,
* parse/transform data,
* install packages like `pandas`, `numpy`, etc., without touching system Python.

---

### Scraper (1 tool)

* `scrape__scrape_page`
  Fetch a URL and return cleaned text and title.
  Good when you want fast HTML→text without running a full browser.

---

### Pollinations (2 tools)

* `pollinations__generateImageUrl`
  Generate an image URL from a text prompt (no paid API key).

* `pollinations__listImageModels`
  Discover which models are available.

---

### CoinGecko (4 tools)

Curated subset of the CoinGecko MCP server (SSE-based):

* `coingecko__get_simple_price`
* `coingecko__get_coins_markets`
* `coingecko__get_range_coins_market_chart`
* `coingecko__get_search`

Use these for quick price lookups, market lists, and basic charts.

---

### Clock (2 tools)

* `clock__now`
  Current time (UTC + local) and ISO formats.

* `clock__add_delta`
  Add or subtract a time delta (days/hours/minutes) from now.

---

## Using this hub from other LLM clients

### Gem‍ini CLI

* Point your Gemini MCP config at:

  ```text
  http://localhost:3333/sse
  ```

* Or, use the `POST /gemini/v1/execute` endpoint as a Gemini-style adapter in your scripts.

Once connected, Gemini CLI can:

* list tools,
* call any of the 50+ tools,
* use your RAG indexes as context.

### OpenAI / ChatGPT Codex CLI

* Configure a custom MCP endpoint pointing at:

  ```text
  http://localhost:3333/sse
  ```

* Use the Codex CLI’s MCP integration (server name of your choice) to access the same tools and RAG as the UI.

### ChatGPT (Dev Mode)

* Add a **custom MCP connector** in Dev Mode.
* If `http://localhost:3333` is blocked by the environment:

  * use `ngrok` (or similar) to expose it:

    ```bash
    ngrok http 3333
    ```

  * use the generated **HTTPS** URL as the MCP endpoint.

Then you can use this same tool/RAG stack inside Dev Mode chats.

### Claude (desktop / MCP-aware apps)

* Add an MCP server pointing at the same SSE endpoint:

  ```text
  http://localhost:3333/sse
  ```
* Claude will see the tools defined in the hub and can call them just like the UI does.

---

## Security / safety notes

This stack is **powerful**. It exposes:

* full filesystem access (read/write/move/delete within allowed roots),
* system shell execution,
* browser automation,
* SQLite writes.

Recommended basics:

* Run the hub on **localhost** or behind a VPN.
* Only connect LLM clients you trust.
* Be careful with prompts that encourage arbitrary shell commands.
* Use the **Blocked** tab to disable tools you don’t want a particular client to use.
* Consider separate hub instances or separate tool registries for “safe” vs “full-power” environments.

---

## Troubleshooting

* **Port in use (`EADDRINUSE`)**

  * Check what’s on `:3333`:

    ```bash
    lsof -i :3333
    ```
  * Kill it:

    ```bash
    kill <pid>
    ```
  * Restart:

    ```bash
    ./start.sh
    ```

* **“Test connection” fails when adding a server**

  * Double-check:

    * `Command` exists on your PATH (`node`, `python3`, `npx`, etc.).
    * `Args` are correct for that MCP server.
    * `CWD` points to the right folder.
    * For SSE: the URL ends with `/sse` and the server is actually running.
  * Try again and read the returned error in the UI.

* **No tools show up after adding a server**

  * Click **Refresh tools** in the UI.
  * If still empty:

    * check `tool-registry/master.json` for typos,
    * restart the gateway (`Ctrl+C` then `./start.sh`).

* **One server keeps failing / spamming errors**

  * Make sure its dependencies are installed.
  * Temporarily disable it in the registry, or block specific tools via the **Blocked** tab.
  * Re-add it once things are fixed.

* **Hosted UIs can’t reach localhost**

  * Use `ngrok` (or similar) to expose your hub:

    ```bash
    ngrok http 3333
    ```
  * Use the HTTPS URL as the MCP endpoint in that client.

---

## Roadmap / ideas

Some directions this project can grow:

* Optional **vector-based RAG** layer (embeddings + vector store).
* Per-index metadata instead of a single `indexes.pkl`.
* Built-in **scheduler** MCP server for time-based jobs (run tools on a schedule).
* Higher-level “notes” and “projects” APIs on top of RAG + SQLite.
* Per-client profiles and presets (e.g. different defaults for different LLMs).
* More bundled servers:

  * email/calendar/contact integrations,
  * additional search/scraping utilities,
  * specialized dev tools.

---

## Contact & collaboration

Created by **Jeff Bulger**

* Website: [https://jeffbulger.dev](https://jeffbulger.dev)
* Email: `admin@jeffbulger.dev`
* GitHub: [https://github.com/jbulger82](https://github.com/jbulger82)

If you’re interested in:

* MCP tools and servers,
* LLM “full stack” workflows,
* RAG + search,
* automation / “LLM Ops”,

issues, PRs, and ideas are all welcome.

---

## License

license (MIT, Apache-2.0, etc.) .

