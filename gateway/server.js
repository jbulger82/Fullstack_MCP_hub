import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { McpHub } from '../hub/McpHub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RAG_BASE = path.resolve(__dirname, '../data/rag');
const RAG_UPLOADS = path.join(RAG_BASE, 'uploads');
const RAG_SAVED = path.join(RAG_BASE, 'saved_chats');
const RAG_INDEXES = path.join(RAG_BASE, 'indexes');
const isUnder = (parent, target) => {
  const p = path.resolve(parent);
  const t = path.resolve(target);
  return t.startsWith(p);
};

const app = express();
app.use(cors());
app.use(express.json()); 
const port = Number(process.env.PORT) || 3333;

// --- Initialize MCP Hub ---
console.log("Initializing MCP Hub for the Gateway...");
const registryPath = path.join(__dirname, '../tool-registry/master.json');
const overridePath = path.join(__dirname, '../tool-registry/tool-overrides.json');
const hub = new McpHub({ registryPath, overridePath });

// Store active SSE connections
const clients = new Map();

// Handle MCP JSON-RPC for a given session
async function handleMcpMessage(sessionId, message, send) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'master-mcp-gateway', version: '1.0.0' }
      }
    });
  } else if (message.method === 'tools/list') {
    const tools = await hub.getTools();
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { tools: tools }
    });
  } else if (message.method === 'tools/call') {
    const result = await hub.execute(message.params.name, message.params.arguments);
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: result.content || [{ type: "text", text: result.message }],
        isError: result.isError
      }
    });
  } else {
    console.log(`[Gateway/MCP] Unhandled method: ${message.method} (session ${sessionId})`);
  }
}

async function startServer() {
  await hub.initialize();
  console.log("\nHub Initialized. Discovered tools are now available via the gateway.");

  // --- Gemini Adaptor Endpoints ---

  app.get('/tools', async (req, res) => {
    try {
      const tools = await hub.getTools();
      res.json({
        ok: true,
        tool_count: tools.length,
        tools: tools,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: 'Failed to get tools from hub.' });
    }
  });

  // --- Tool metadata editing (description only) ---
  app.patch('/tools/:name', async (req, res) => {
    const toolName = req.params.name;
    const { description } = req.body || {};
    if (typeof description !== 'string') {
      return res.status(400).json({ error: 'description must be a string' });
    }
    try {
      const updated = await hub.updateToolDescription(toolName, description);
      res.json({ ok: true, tool: updated });
    } catch (error) {
      res.status(404).json({ ok: false, error: error.message });
    }
  });

  app.post('/tools/:name/reset', async (req, res) => {
    const toolName = req.params.name;
    try {
      const updated = await hub.resetToolDescription(toolName);
      res.json({ ok: true, tool: updated });
    } catch (error) {
      res.status(404).json({ ok: false, error: error.message });
    }
  });

  app.post('/gemini/v1/execute', async (req, res) => {
    // Accept both raw FunctionCall payloads and nested shapes (functionCall/function_call)
    const body = req.body || {};
    const functionCall = body.functionCall || body.function_call || body;
    const name = functionCall?.name;
    let args = functionCall?.args ?? functionCall?.arguments ?? {};
    if (!name) {
      return res.status(400).json({
        error: "Invalid request. Body must include a function call with a 'name' field."
      });
    }

    // Try to normalize args if provided as a string
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = { arg: args };
      }
    }

    try {
      console.log(`[Gateway/Gemini] Received tool call for: ${name}`);
      const result = await hub.execute(name, args);
      const responsePayload = {
        name,
        response: {
          content: JSON.stringify(result.structuredContent || result.message || "Execution complete.")
        }
      };
      res.json({ functionResponse: responsePayload });
    } catch (error) {
      console.error(`[Gateway/Gemini] Error executing tool '${name}':`, error);
      res.status(500).json({ error: `An error occurred while executing tool: ${error.message}` });
    }
  });

  // --- Server registry: list/add ---
  app.get('/servers', async (req, res) => {
    try {
      const servers = await hub.getServers();
      res.json({ ok: true, servers });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/servers', async (req, res) => {
    try {
      const server = await hub.addServer(req.body || {});
      res.json({ ok: true, server });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post('/servers/test', async (req, res) => {
    try {
      const preview = await hub.testServer(req.body || {});
      res.json({ ok: true, ...preview });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.get('/tools/blocked', async (_req, res) => {
    try {
      const blocked = await hub.getBlocked();
      res.json({ ok: true, blocked });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/tools/:name/block', async (req, res) => {
    const toolName = req.params.name;
    try {
      const result = await hub.blockTool(toolName);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post('/tools/:name/unblock', async (req, res) => {
    const toolName = req.params.name;
    try {
      const result = await hub.unblockTool(toolName);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // --- Simple RAG file upload (writes into data/rag/uploads) ---
  app.post('/rag/upload', async (req, res) => {
    try {
      const { filename, content, subdir = 'uploads' } = req.body || {};
      if (!filename || !content) {
        return res.status(400).json({ ok: false, error: 'filename and content (base64) required' });
      }
      const targetDir = path.join(RAG_BASE, subdir);
      const targetPath = path.join(targetDir, path.basename(filename));
      await fs.promises.mkdir(targetDir, { recursive: true });
      await fs.promises.writeFile(targetPath, Buffer.from(content, 'base64'));
      // Best-effort auto-reindex for uploads to keep local_rag in sync
      let indexRefresh = null;
      if (subdir === 'uploads') {
        try {
          const idxResult = await hub.execute('local_rag__create_index', {
            index_name: 'uploads',
            directory_path: targetDir,
          });
          indexRefresh = idxResult?.message || 'refreshed';
        } catch (err) {
          // ignore indexing failures in response, but surface minimal info
          indexRefresh = `index refresh failed: ${err?.message || err}`;
        }
      }
      res.json({ ok: true, path: targetPath, indexRefresh });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // List files in RAG uploads (non-recursive with size)
  app.get('/rag/uploads', async (_req, res) => {
    try {
      await fs.promises.mkdir(RAG_UPLOADS, { recursive: true });
      const entries = await fs.promises.readdir(RAG_UPLOADS, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const full = path.join(RAG_UPLOADS, entry.name);
          const stat = await fs.promises.stat(full);
          return {
            name: entry.name,
            path: full,
            size: stat.size,
            isDir: entry.isDirectory(),
          };
        })
      );
      res.json({ ok: true, files });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.delete('/rag/uploads', async (req, res) => {
    try {
      const { filename } = req.body || {};
      if (!filename) return res.status(400).json({ ok: false, error: 'filename required' });
      const targetPath = path.join(RAG_UPLOADS, path.basename(filename));
      if (!isUnder(RAG_UPLOADS, targetPath)) {
        return res.status(400).json({ ok: false, error: 'Invalid path' });
      }
      await fs.promises.unlink(targetPath);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  const listDir = async (targetDir) => {
    await fs.promises.mkdir(targetDir, { recursive: true });
    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry) => {
        const full = path.join(targetDir, entry.name);
        const stat = await fs.promises.stat(full);
        return { name: entry.name, path: full, size: stat.size, isDir: entry.isDirectory() };
      })
    );
  };

  app.get('/rag/saved', async (_req, res) => {
    try {
      const files = await listDir(RAG_SAVED);
      res.json({ ok: true, files });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/rag/indexes', async (_req, res) => {
    try {
      const files = await listDir(RAG_INDEXES);
      res.json({ ok: true, files });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // --- Standard MCP SSE Endpoints (Universal Compatibility) ---

  // 1. SSE Endpoint for establishing connection
  app.get('/sse', (req, res) => {
    const sessionId = uuidv4();
    console.log(`[Gateway/SSE] New client connected: ${sessionId}`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'x-mcp-session-id': sessionId,
    });

    // Attach session id as an SSE event for streamable HTTP clients
    res.write(`event: session\n`);
    res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);

    const send = (message) => {
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    };

    // Save client connection
    clients.set(sessionId, send);

    // Send endpoint URL for messages
    res.write(`event: endpoint\n`);
    res.write(`data: http://localhost:${port}/message?sessionId=${sessionId}\n\n`);

    req.on('close', () => {
      console.log(`[Gateway/SSE] Client disconnected: ${sessionId}`);
      clients.delete(sessionId);
    });
  });

  // 2. Message Endpoint for JSON-RPC requests
  app.post('/message', async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId || !clients.has(sessionId)) {
      return res.status(404).send('Session not found');
    }

    const message = req.body;
    const send = clients.get(sessionId);

    try {
      await handleMcpMessage(sessionId, message, send);
      res.status(202).send('Accepted');

    } catch (error) {
      console.error(`[Gateway/MCP] Error processing message: ${error}`);
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32000, message: error.message }
      });
      res.status(500).send(error.message);
    }
  });

  // 3. Streamable HTTP compatibility: accept POSTs to /sse with session header
  app.post('/sse', async (req, res) => {
    let sessionId = req.headers['mcp-session-id'] || req.query.sessionId;

    // Streamable HTTP compatibility: no session yet means handle inline and return response directly.
    if (!sessionId) {
      try {
        const responses = [];
        const send = (msg) => responses.push(msg);
        await handleMcpMessage('inline', req.body, send);
        if (!responses.length) return res.status(204).end();
        if (responses.length === 1) return res.json(responses[0]);
        res.setHeader('Content-Type', 'application/json');
        return res.send(responses.map(r => JSON.stringify(r)).join('\n'));
      } catch (error) {
        console.error(`[Gateway/MCP] Error processing inline /sse message: ${error}`);
        return res.status(500).json({ error: error.message });
      }
    }

    if (!clients.has(sessionId)) {
      return res.status(404).send('Session not found');
    }
    const send = clients.get(sessionId);
    try {
      await handleMcpMessage(sessionId, req.body, send);
      res.status(202).send('Accepted');
    } catch (error) {
      console.error(`[Gateway/MCP] Error processing streamable /sse message: ${error}`);
      send({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: { code: -32000, message: error.message }
      });
      res.status(500).send(error.message);
    }
  });

  // --- Serve built web UI if present ---
  const uiPath = path.join(__dirname, 'ui', 'dist');
  if (fs.existsSync(uiPath)) {
    app.use(express.static(uiPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(uiPath, 'index.html'));
    });
    console.log(`UI assets served from ${uiPath}`);
  } else {
    console.log('UI build not found. Run "npm run build:ui" inside gateway to generate it.');
  }

  // --- Start Server ---
  app.listen(port, () => {
    console.log(`\n🚀 MASTER_MCP Gateway is running!`);
    console.log(`   - Gemini Adaptor: http://localhost:${port}/gemini/v1/execute`);
    console.log(`   - Universal MCP (SSE): http://localhost:${port}/sse`);
    console.log(`\nPress Ctrl+C to stop the server.`);
  });
}

startServer().catch(error => {
  console.error("Failed to start gateway server:", error);
});
