
import sys
import json
import logging
import os
import traceback
import pickle
import base64
from datetime import datetime
from difflib import SequenceMatcher

CHUNK_WORDS = 500
CHUNK_OVERLAP = 50

# =============================================================================
# 1. MCP Server Framework
# =============================================================================

logging.basicConfig(level=logging.INFO, format='[RAG-MCP-PY] %(levelname)s: %(message)s')

# ... (StdioComms, Tool, ToolManager classes remain the same) ...

class StdioComms:
    """Handles JSON-RPC communication over stdin/stdout."""
    def read_message(self):
        line = sys.stdin.readline()
        if not line:
            return None
        return json.loads(line)

    def write_message(self, message):
        serialized = json.dumps(message)
        sys.stdout.write(serialized + '\n')
        sys.stdout.flush()

class Tool:
    def __init__(self, name, description, func, input_schema=None):
        self.name = name
        self.description = description
        self.func = func
        self.input_schema = input_schema or {"type": "object", "properties": {}}

    def to_dict(self):
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
        }

class ToolManager:
    def __init__(self):
        self._tools = {}

    def register_tool(self, tool):
        self._tools[tool.name] = tool
        logging.info(f"Tool '{tool.name}' registered.")

    def get_tool(self, name):
        return self._tools.get(name)

    def get_all_tools(self):
        return list(self._tools.values())

class Server:
    """A simple MCP Server for RAG capabilities."""
    def __init__(self):
        self._comms = StdioComms()
        self._tool_manager = ToolManager()
        # Path sandboxing is disabled by default in dev; set RAG_ALLOWED_BASE_PATH to re-enable.
        env_base = os.environ.get('RAG_ALLOWED_BASE_PATH')
        self.allowed_base_path = os.path.abspath(env_base) if env_base else BASE_DATA_DIR
        if self.allowed_base_path:
            logging.info(f"Security: Operations are restricted to '{self.allowed_base_path}' and its subdirectories.")
        
        # Load persisted indexes on startup
        load_state()


    def register_tool(self, name, description, func, input_schema=None):
        tool = Tool(name, description, func, input_schema)
        self._tool_manager.register_tool(tool)

    def serve_forever(self):
        logging.info("RAG Server listening for messages...")
        while True:
            try:
                request = self._comms.read_message()
                if request is None:
                    break
                self.handle_request(request)
            except json.JSONDecodeError:
                logging.error("Failed to decode JSON message.")
                continue
            except Exception as e:
                logging.error(f"Critical error in server loop: {e}")
                break
        logging.info("RAG Server shutting down.")
        
    def _is_path_safe(self, path_to_check):
        """Checks if the provided path is within the allowed base directory."""
        if not self.allowed_base_path:
            return True
        abs_path_to_check = normalize_path(path_to_check)
        return os.path.commonpath([self.allowed_base_path, abs_path_to_check]) == self.allowed_base_path

    def handle_request(self, request):
        msg_id = request.get('id')
        method = request.get('method')
        params = request.get('params', {})

        response = {
            "jsonrpc": "2.0",
            "id": msg_id
        }
        
        # Add a security check wrapper around tool calls
        if method == 'tools/call':
            tool_name = params.get('name')
            args = params.get('arguments', {})
            
            # Check paths in arguments
            for key, value in args.items():
                if 'path' in key and isinstance(value, str):
                    value = normalize_path(value)
                    if not self._is_path_safe(value):
                        response['error'] = {"code": -32001, "message": f"Security Error: Access to path '{value}' is not allowed."}
                        self._comms.write_message(response)
                        return
            
            tool = self._tool_manager.get_tool(tool_name)
            if not tool:
                response['error'] = {"code": -32601, "message": f"Tool '{tool_name}' not found."}
                self._comms.write_message(response)
                return
            
            try:
                result_content = tool.func(**args)
                response['result'] = {"content": result_content}
            except Exception as e:
                tb_str = traceback.format_exc()
                logging.error(f"Error calling tool '{tool_name}': {e}\n{tb_str}")
                response['error'] = {"code": -32000, "message": f"Error executing tool: {e}"}
            
            self._comms.write_message(response)

        elif method == 'initialize':
            response['result'] = {
                "protocolVersion": "2025-06-18",
                "serverInfo": { "name": "local_rag_server", "version": "0.1.0" },
                "capabilities": {} 
            }
            self._comms.write_message(response)

        elif method == 'tools/list':
            tools = self._tool_manager.get_all_tools()
            response['result'] = {"tools": [t.to_dict() for t in tools]}
            self._comms.write_message(response)

        else:
            response['error'] = {"code": -32601, "message": f"Method '{method}' not found."}
            self._comms.write_message(response)

# =============================================================================
# 2. RAG Tool Implementations
# =============================================================================

# In-memory storage for multiple, named file indexes.
file_indexes = {}
# Base data directory inside repo: ../data/rag
BASE_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "rag"))
PERSISTENCE_FILE = os.path.join(BASE_DATA_DIR, "indexes.pkl")

def normalize_path(p: str) -> str:
    if not p:
        return p
    if not os.path.isabs(p):
        p = os.path.join(BASE_DATA_DIR, p)
    return os.path.abspath(p)

def ensure_persistence_dir():
    """Makes sure the vector persistence directory exists before reading/writing."""
    os.makedirs(os.path.dirname(PERSISTENCE_FILE), exist_ok=True)
    # Ensure common subfolders exist for future use (uploads, saved_chats, indexes, images)
    for sub in ("uploads", "saved_chats", "indexes", "images"):
        os.makedirs(os.path.join(BASE_DATA_DIR, sub), exist_ok=True)


def chunk_text(text: str, max_words: int = CHUNK_WORDS, overlap: int = CHUNK_OVERLAP):
    """
    Split text into word-based chunks with overlap.
    """
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = min(len(words), start + max_words)
        chunk_words = words[start:end]
        chunks.append(" ".join(chunk_words))
        if end == len(words):
            break
        start = max(0, end - overlap)
    return chunks


def extract_tags(text: str):
    """
    Look for a tags line in the first few lines, e.g., '#tags: tag1, tag2'
    """
    tags = []
    for line in text.splitlines()[:5]:
        lower = line.lower()
        if lower.startswith("#tags:") or lower.startswith("tags:"):
            parts = line.split(":", 1)[1]
            tags = [t.strip().lower() for t in parts.split(",") if t.strip()]
            break
    return tags


def fuzzy_match(query: str, text: str, threshold: float = 0.45):
    """
    Fuzzy match that tolerates short misspellings by checking sliding word windows.
    """
    q = (query or "").lower()
    t = (text or "").lower()
    if not q or not t:
        return False
    if q in t:
        return True
    if len(q) < 3:
        return False

    # Sliding window over words near the query length to avoid ratio dilution on long chunks
    q_words = q.split()
    tokens = t.split()
    if tokens and q_words:
        win = max(1, min(len(tokens), len(q_words) + 2))
        for i in range(0, max(1, len(tokens) - win + 1)):
            segment = " ".join(tokens[i : i + win])
            if SequenceMatcher(None, q, segment).ratio() >= threshold:
                return True

    # Fallback on full text ratio
    return SequenceMatcher(None, q, t).ratio() >= threshold

def save_state():
    """Saves the current file_indexes to disk using an atomic write."""
    ensure_persistence_dir()
    tmp_file = PERSISTENCE_FILE + ".tmp"
    try:
        # Write to a temporary file first
        with open(tmp_file, 'wb') as f:
            pickle.dump(file_indexes, f)
        
        # Atomic rename: this guarantees the target file is either the old valid version
        # or the new valid version, never a half-written corrupted version.
        os.replace(tmp_file, PERSISTENCE_FILE)
        logging.info(f"Indexes saved to {PERSISTENCE_FILE}")
    except Exception as e:
        logging.error(f"Failed to save indexes: {e}")
        # Clean up temp file if it exists
        if os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except OSError:
                pass

def load_state():
    """Loads file_indexes from disk if available."""
    global file_indexes
    ensure_persistence_dir()
    if os.path.exists(PERSISTENCE_FILE):
        try:
            with open(PERSISTENCE_FILE, 'rb') as f:
                file_indexes = pickle.load(f)
            logging.info(f"Loaded {len(file_indexes)} indexes from {PERSISTENCE_FILE}: {list(file_indexes.keys())}")
        except Exception as e:
            logging.error(f"Failed to load indexes: {e}")
            file_indexes = {}
    else:
        logging.info(f"No persistence file found at {PERSISTENCE_FILE}. Starting with empty indexes.")

def create_index(index_name: str, directory_path: str):
    """
    Scans a directory recursively, reads all text files (.txt, .md),
    and stores chunked content in a named in-memory index for searching.
    """
    global file_indexes
    directory_path = normalize_path(directory_path)
    if not os.path.isdir(directory_path):
        raise FileNotFoundError(f"The directory '{directory_path}' does not exist.")

    current_index = []
    indexed_files = 0
    skipped_count = 0

    for root, _, files in os.walk(directory_path):
        for file in files:
            if file.endswith(('.txt', '.md')):
                file_path = os.path.join(root, file)
                try:
                    mtime = os.path.getmtime(file_path)
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    tags = extract_tags(content)
                    chunks = chunk_text(content)
                    for idx, chunk in enumerate(chunks):
                        current_index.append({
                            "file": file_path,
                            "chunk_id": idx + 1,
                            "text": chunk,
                            "mtime": mtime,
                            "tags": tags,
                        })
                    indexed_files += 1
                except Exception as e:
                    # Log the specific error and increment skipped count
                    logging.warning(f"Skipping file '{file_path}': {e}")
                    skipped_count += 1

    file_indexes[index_name] = current_index
    save_state() # Persist changes

    summary = f"Successfully created index '{index_name}'. {indexed_files} files indexed, {len(current_index)} chunks."
    if skipped_count > 0:
        summary += f"\nWarning: {skipped_count} files could not be read and were skipped (check server logs for details)."

    return [{"type": "text", "text": summary}]

def search_index(index_name: str, query: str, fuzzy: bool = False, threshold: float = 0.5, path_contains: str = "", tag: str = "", min_mtime: float = None, max_mtime: float = None):
    """
    Search a chunked index with optional fuzzy matching and basic filters.
    """
    if index_name not in file_indexes:
        raise RuntimeError(f"Index '{index_name}' not found. Please run 'create_index' first.")

    current_index = file_indexes[index_name]
    # Backward compatibility: old dict format path->content
    if isinstance(current_index, dict):
        upgraded = []
        for fp, content in current_index.items():
            upgraded.append({"file": fp, "chunk_id": 1, "text": content, "mtime": 0, "tags": []})
        current_index = upgraded
        file_indexes[index_name] = upgraded

    q_lower = (query or "").lower()
    path_filter = (path_contains or "").lower()
    tag_filter = (tag or "").lower()
    results = []

    def passes_filters(entry):
        if path_filter and path_filter not in entry.get("file", "").lower():
            return False
        if tag_filter and tag_filter not in (entry.get("tags") or []):
            return False
        mt = entry.get("mtime")
        if min_mtime is not None and mt and mt < min_mtime:
            return False
        if max_mtime is not None and mt and mt > max_mtime:
            return False
        return True

    for entry in current_index:
        if not passes_filters(entry):
            continue
        text = entry.get("text", "")
        matched = False
        if q_lower and q_lower in text.lower():
            matched = True
        elif fuzzy and q_lower:
            matched = fuzzy_match(query, text, threshold or 0.6)
        if matched:
            snippet = text[:300]
            results.append(f"[{entry.get('file')}] chunk {entry.get('chunk_id')}\n{snippet}\n")

    if not results:
        return [{"type": "text", "text": f"No results found for query: '{query}' in index '{index_name}'"}]

    return [{"type": "text", "text": "\n\n".join(results)}]

def list_indexes():
    """Lists all available index names."""
    names = list(file_indexes.keys())
    if not names:
        return [{"type": "text", "text": "No indexes available. Create one with create_index."}]
    return [{"type": "text", "text": "Indexes:\n- " + "\n- ".join(names)}]


def list_files(directory_path: str):
    """
    Lists all files and subdirectories in a given directory.
    """
    directory_path = normalize_path(directory_path)
    if not os.path.isdir(directory_path):
        raise FileNotFoundError(f"The directory '{directory_path}' does not exist.")
    
    try:
        entries = os.listdir(directory_path)
        if not entries:
            return [{"type": "text", "text": f"The directory '{directory_path}' is empty."}]
        
        # Annotate entries with [D] for directory and [F] for file
        annotated_entries = []
        for entry in sorted(entries):
            entry_path = os.path.join(directory_path, entry)
            if os.path.isdir(entry_path):
                annotated_entries.append(f"[D] {entry}")
            else:
                annotated_entries.append(f"[F] {entry}")
        
        content = f"Contents of '{directory_path}':\n" + "\n".join(annotated_entries)
        return [{"type": "text", "text": content}]
    except Exception as e:
        raise RuntimeError(f"An error occurred while listing the directory: {e}")

def read_file(file_path: str):
    """
    Reads the content of a specific file from the filesystem.
    """
    file_path = normalize_path(file_path)
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"The file '{file_path}' does not exist.")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return [{"type": "text", "text": content}]
    except Exception as e:
        raise RuntimeError(f"An error occurred while reading the file: {e}")


def save_chat(transcript: str, model: str, summarize: bool = False, summary: str = "", session_id: str = ""):
    """
    Save a chat transcript (and optional caller-provided summary) into saved_chats.
    - Always writes a new file; never overwrites existing logs.
    - Filename format: YYYY-MM-DD_HH-MM_<model>[_sessionid]_raw.txt and/or _summary.txt
    """
    base_dir = os.path.join(BASE_DATA_DIR, "saved_chats")
    os.makedirs(base_dir, exist_ok=True)
    now = datetime.utcnow()
    timestamp = now.strftime("%Y-%m-%d_%H-%M")
    model_slug = model.replace(" ", "_") if model else "unknown"
    session_slug = session_id.replace(" ", "_") if session_id else ""

    parts = [timestamp, model_slug]
    if session_slug:
        parts.append(session_slug)

    def write_file(content: str, is_summary: bool):
        suffix = "summary" if is_summary else "raw"
        fname = "_".join(parts + [suffix]) + ".txt"
        path = os.path.join(base_dir, fname)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    saved_paths = []
    if transcript:
        saved_paths.append(write_file(transcript, is_summary=False))
    if summarize and summary:
        saved_paths.append(write_file(summary, is_summary=True))

    details = [
        f"Saved {len(saved_paths)} file(s):",
        *[f"- {p}" for p in saved_paths],
        f"timestamp_utc: {timestamp}",
        f"model: {model_slug}",
    ]
    if session_slug:
        details.append(f"session_id: {session_slug}")

    return [{"type": "text", "text": "\n".join(details)}]


def save_image(base64_content: str, filename: str):
    """
    Save a base64-encoded image into data/rag/images. Does not overwrite existing files.
    Strips data URL prefixes if present.
    """
    if not base64_content or not filename:
        raise ValueError("base64_content and filename are required.")
    images_dir = os.path.join(BASE_DATA_DIR, "images")
    os.makedirs(images_dir, exist_ok=True)
    safe_name = os.path.basename(filename)
    target_path = os.path.join(images_dir, safe_name)
    if os.path.exists(target_path):
        raise FileExistsError(f"File '{safe_name}' already exists.")

    content = base64_content
    if "," in base64_content and base64_content.lower().startswith("data:"):
        content = base64_content.split(",", 1)[1]
    try:
        data = base64.b64decode(content)
    except Exception as e:
        raise ValueError(f"Invalid base64 content: {e}")

    with open(target_path, "wb") as f:
        f.write(data)

    return [{"type": "text", "text": f"Saved image to {target_path}"}]

# =============================================================================
# 3. Server Main Entrypoint
# =============================================================================

if __name__ == "__main__":
    mcp_server = Server()

    mcp_server.register_tool(
        name="create_index",
        description="Scans a directory and builds a named, in-memory search index of its text files.",
        func=create_index,
        input_schema={
            "type": "object",
            "properties": {
                "index_name": {"type": "string", "description": "A unique name for this index collection."},
                "directory_path": {"type": "string", "description": "The directory to index."}
            },
            "required": ["index_name", "directory_path"]
        }
    )

    mcp_server.register_tool(
        name="search_index",
        description="Searches a named in-memory index (chunked) for a keyword; supports fuzzy and filters.",
        func=search_index,
        input_schema={
            "type": "object",
            "properties": {
                "index_name": {"type": "string", "description": "The name of the index collection to search."},
                "query": {"type": "string", "description": "The keyword to search for."},
                "fuzzy": {"type": "boolean", "description": "Enable fuzzy match.", "default": False},
                "threshold": {"type": "number", "description": "Fuzzy match threshold (0-1).", "default": 0.6},
                "path_contains": {"type": "string", "description": "Filter: path contains substring."},
                "tag": {"type": "string", "description": "Filter: tag must match (from #tags line)."},
                "min_mtime": {"type": "number", "description": "Filter: minimum modified time (epoch seconds)."},
                "max_mtime": {"type": "number", "description": "Filter: maximum modified time (epoch seconds)."}
            },
            "required": ["index_name", "query"]
        }
    )

    mcp_server.register_tool(
        name="list_files",
        description="Lists all files and subdirectories within a specified directory on the local filesystem.",
        func=list_files,
        input_schema={
            "type": "object",
            "properties": {
                "directory_path": {"type": "string", "description": "The absolute or relative path to the directory."}
            },
            "required": ["directory_path"]
        }
    )

    mcp_server.register_tool(
        name="list_indexes",
        description="Lists all available in-memory indexes.",
        func=list_indexes,
        input_schema={
            "type": "object",
            "properties": {},
            "required": []
        }
    )

    mcp_server.register_tool(
        name="read_file",
        description="Reads the entire content of a specified text file.",
        func=read_file,
        input_schema={
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "The absolute or relative path to the file."}
            },
            "required": ["file_path"]
        }
    )

    mcp_server.register_tool(
        name="save_chat",
        description="Save a chat transcript (and optional summary) to data/rag/saved_chats/. Always writes a new file.",
        func=save_chat,
        input_schema={
            "type": "object",
            "properties": {
                "transcript": {"type": "string", "description": "Full chat text to save."},
                "model": {"type": "string", "description": "Model name used for the chat (for filename tagging)."},
                "summarize": {"type": "boolean", "description": "If true, also save the provided summary text."},
                "summary": {"type": "string", "description": "Optional caller-provided summary text."},
                "session_id": {"type": "string", "description": "Optional session identifier to include in filename."}
            },
            "required": ["transcript", "model"]
        }
    )

    mcp_server.register_tool(
        name="save_image",
        description="Save a base64-encoded image to data/rag/images. Does not overwrite existing files.",
        func=save_image,
        input_schema={
            "type": "object",
            "properties": {
                "base64_content": {"type": "string", "description": "Image data, base64 (data URL prefix allowed)."},
                "filename": {"type": "string", "description": "Target filename (will be placed in data/rag/images)."}
            },
            "required": ["base64_content", "filename"]
        }
    )

    mcp_server.serve_forever()
