import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import EventSource from 'eventsource';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { z } from 'zod';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force the eventsource polyfill so we can send headers (Node 18+ native EventSource does not support headers)
global.EventSource = EventSource;

export class McpHub {
  constructor(options = {}) {
    this.registryPath = options.registryPath || path.join(__dirname, 'master.json');
    this.overridePath = options.overridePath || path.join(__dirname, 'tool-overrides.json');
    this.blocklistPath = options.blocklistPath || path.join(__dirname, 'tool-blocklist.json');
    this.serverConfigs = [];
    this.clients = new Map();
    this.toolIndex = new Map();
    this.status = new Map();
    this.toolOverrides = {};
    this.blocklist = new Set();
  }

  async initialize() {
    await this.loadRegistry();
    await this.loadOverrides();
    await this.loadBlocklist();
    await this.connectAll();
  }

  replaceEnvVars(config) {
    const str = JSON.stringify(config);
    const replaced = str.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '');
    return JSON.parse(replaced);
  }

  async loadRegistry() {
    try {
      if (!fs.existsSync(this.registryPath)) {
        console.warn(`[MCP] Registry not found at ${this.registryPath}`);
        return;
      }
      const raw = await fs.promises.readFile(this.registryPath, 'utf8');
      const parsed = JSON.parse(raw);

      let configs = [];
      if (parsed?.servers) {
        configs = Array.isArray(parsed.servers)
          ? parsed.servers
          : Object.entries(parsed.servers).map(([name, cfg]) => ({ name, ...cfg }));
      }

      this.serverConfigs = configs.map(cfg => this.replaceEnvVars(cfg));
    } catch (error) {
      console.warn('[MCP] Error loading registry:', error.message);
    }
  }

  async loadOverrides() {
    try {
      if (!fs.existsSync(this.overridePath)) {
        this.toolOverrides = {};
        return;
      }
      const raw = await fs.promises.readFile(this.overridePath, 'utf8');
      this.toolOverrides = JSON.parse(raw) || {};
    } catch (error) {
      console.warn('[MCP] Error loading tool overrides:', error.message);
      this.toolOverrides = {};
    }
  }

  async saveOverrides() {
    try {
      const payload = JSON.stringify(this.toolOverrides, null, 2);
      await fs.promises.writeFile(this.overridePath, payload, 'utf8');
    } catch (error) {
      console.error('[MCP] Failed to persist tool overrides:', error.message);
    }
  }

  async loadBlocklist() {
    try {
      if (!fs.existsSync(this.blocklistPath)) {
        this.blocklist = new Set();
        return;
      }
      const raw = await fs.promises.readFile(this.blocklistPath, 'utf8');
      const arr = JSON.parse(raw);
      this.blocklist = new Set(Array.isArray(arr) ? arr : []);
    } catch (error) {
      console.warn('[MCP] Error loading tool blocklist:', error.message);
      this.blocklist = new Set();
    }
  }

  async saveBlocklist() {
    try {
      const payload = JSON.stringify(Array.from(this.blocklist), null, 2);
      await fs.promises.writeFile(this.blocklistPath, payload, 'utf8');
    } catch (error) {
      console.error('[MCP] Failed to persist tool blocklist:', error.message);
    }
  }

  serializeRegistry() {
    const servers = {};
    for (const cfg of this.serverConfigs) {
      const entry = { ...cfg };
      delete entry.name;
      servers[cfg.name] = entry;
    }
    return { servers };
  }

  async saveRegistry() {
    const payload = JSON.stringify(this.serializeRegistry(), null, 2);
    await fs.promises.writeFile(this.registryPath, payload, 'utf8');
  }

  async connectAll() {
    this.toolIndex.clear();
    for (const cfg of this.serverConfigs) {
      await this.connectToServer(cfg);
    }
  }

  setStatus(name, status, error) {
    this.status.set(name, { status, error });
  }

  async connectToServer(config) {
    if (!config?.name || (!config?.type && !config?.transport)) return;
    if (config.enabled === false) return;

    // Drop any stale tool entries for this server before reconnecting
    for (const [key, value] of this.toolIndex.entries()) {
      if (value.serverName === config.name) {
        this.toolIndex.delete(key);
      }
    }

    try {
      const client = new Client({ name: 'francine-proxy', version: '1.0.0' }, { capabilities: {} });

      // Ensure param casing is correct
      if (config.name === 'tavily' && config.url) {
        config.url = config.url.replace('tavilyApikey', 'tavilyApiKey');
      }

      const transport = this.buildTransport(config);
      if (!transport) {
        this.setStatus(config.name, 'error', 'Unsupported transport');
        return;
      }

      const timeoutMs = 15000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      console.log(`[MCP] Attempting connection to ${config.name}...`);
      await Promise.race([client.connect(transport), timeoutPromise]);

      let tools = [];
      try {
        const result = await client.listTools();
        tools = result.tools;
      } catch (validationError) {
        console.warn(`[MCP] Schema validation failed for ${config.name}, using raw fallback...`);
        const rawResult = await client.request({ method: 'tools/list' }, z.any());
        tools = rawResult.tools || [];
      }

      this.clients.set(config.name, { client, transport });
      this.setStatus(config.name, 'connected');

      // Optional allowlist for specific servers
      if (config.name === 'pollinations') {
        const allow = new Set(['generateImageUrl', 'listImageModels']);
        tools = tools.filter(t => allow.has(t.name));
      }
      if (config.name === 'coingecko') {
        const allow = new Set([
          'get_search',
          'get_simple_price',
          'get_coins_markets',
          'get_range_coins_market_chart',
        ]);
        tools = tools.filter(t => allow.has(t.name));
      }
      if (config.name === 'websearch_adv') {
        const allow = new Set([
          'full-web-search',
          'get-single-web-page-content',
        ]);
        tools = tools.filter(t => allow.has(t.name));
      }

      // Global blocklist filter
      tools = tools.filter(t => !this.blocklist.has(`${config.name}__${t.name}`));

      tools.forEach(tool => {
        const namespacedName = `${config.name}__${tool.name}`;
        if (tool.inputSchema && !tool.inputSchema.type) {
          tool.inputSchema.type = 'object';
        }
        const override = this.toolOverrides[namespacedName] || {};
        this.toolIndex.set(namespacedName, {
          serverName: config.name,
          toolName: tool.name,
          baseDescription: tool.description || '',
          definition: {
            name: namespacedName,
            server: config.name,
            description: override.description ?? tool.description ?? '',
            defaultDescription: tool.description ?? '',
            inputSchema: tool.inputSchema || {},
          },
        });
      });

      console.log(`[MCP] ✅ Connected to ${config.name} (${tools.length} tools)`);
    } catch (error) {
      console.error(`[MCP] ❌ Failed to connect to ${config.name}:`, error.message);
      this.setStatus(config.name, 'error', error.message);
    }
  }

  buildTransport(config) {
    const transportType = config.type || config.transport;

    if (transportType === 'sse' && config.url) {
      return new SSEClientTransport(new URL(config.url), {
        requestInit: {
          headers: {
            'User-Agent': 'Francine-Client/1.0',
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          fetch,
        },
        eventSourceInit: {
          https: { rejectUnauthorized: false },
        },
      });
    }

    if (transportType === 'stdio' && config.command) {
      const env = { ...process.env, ...config.env };
      return new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        cwd: config.cwd || process.cwd(),
        env,
        stderr: 'inherit',
      });
    }
    return null;
  }

  async getStatus() {
    return this.serverConfigs.map(server => ({
      name: server.name,
      status: this.status.get(server.name)?.status || 'disconnected',
      error: this.status.get(server.name)?.error,
      toolCount: Array.from(this.toolIndex.values()).filter(t => t.serverName === server.name).length,
    }));
  }

  async getServers() {
    return this.serverConfigs.map(cfg => ({
      ...cfg,
      status: this.status.get(cfg.name)?.status || 'disconnected',
      error: this.status.get(cfg.name)?.error,
      toolCount: Array.from(this.toolIndex.values()).filter(t => t.serverName === cfg.name).length,
    }));
  }

  async addServer(config) {
    const name = (config?.name || '').trim();
    const transport = config.transport || config.type;

    if (!name) throw new Error('name is required');
    if (!transport) throw new Error('transport/type is required');
    if (this.serverConfigs.some(c => c.name === name)) {
      throw new Error(`Server '${name}' already exists`);
    }

    const normalized = {
      ...config,
      name,
      transport,
      enabled: config.enabled !== false,
    };

    if (transport === 'stdio') {
      if (!normalized.command) throw new Error('command is required for stdio transport');
      if (normalized.args && !Array.isArray(normalized.args)) {
        throw new Error('args must be an array if provided');
      }
    } else if (transport === 'sse') {
      if (!normalized.url) throw new Error('url is required for sse transport');
    }

    this.serverConfigs.push(normalized);
    await this.saveRegistry();
    await this.connectToServer(normalized);
    return normalized;
  }

  async testServer(config) {
    const name = (config?.name || '').trim() || 'temp';
    const transport = config.transport || config.type;
    if (!transport) throw new Error('transport/type is required');

    const normalized = {
      ...config,
      name,
      transport,
      enabled: true,
    };

    if (transport === 'stdio') {
      if (!normalized.command) throw new Error('command is required for stdio transport');
      if (normalized.args && !Array.isArray(normalized.args)) {
        throw new Error('args must be an array if provided');
      }
    } else if (transport === 'sse') {
      if (!normalized.url) throw new Error('url is required for sse transport');
    }

    const client = new Client({ name: 'mcp-test', version: '1.0.0' }, { capabilities: {} });
    const transportInstance = this.buildTransport(normalized);
    if (!transportInstance) throw new Error('Unsupported transport');

    const timeoutMs = 10000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    await Promise.race([client.connect(transportInstance), timeoutPromise]);
    const result = await client.listTools();
    if (transportInstance?.close) {
      try {
        await transportInstance.close();
      } catch {
        // ignore close errors
      }
    }
    return { tools: result.tools || [], toolCount: (result.tools || []).length };
  }

  async getTools() {
    return Array.from(this.toolIndex.values()).map(entry => entry.definition);
  }

  async updateToolDescription(toolName, description = '') {
    if (!this.toolIndex.has(toolName)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    const entry = this.toolIndex.get(toolName);
    entry.definition.description = description;
    this.toolIndex.set(toolName, entry);
    this.toolOverrides[toolName] = { description };
    await this.saveOverrides();
    return entry.definition;
  }

  async resetToolDescription(toolName) {
    if (!this.toolIndex.has(toolName)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    const entry = this.toolIndex.get(toolName);
    entry.definition.description = entry.baseDescription;
    this.toolIndex.set(toolName, entry);
    delete this.toolOverrides[toolName];
    await this.saveOverrides();
    return entry.definition;
  }

  async execute(toolName, args = {}) {
    const mapping = this.toolIndex.get(toolName);
    if (!mapping) throw new Error(`Unknown tool: ${toolName}`);

    const clientBundle = this.clients.get(mapping.serverName);
    if (!clientBundle) throw new Error(`Server not connected: ${mapping.serverName}`);

    // Ensure arguments are an object for MCP calls
    let callArgs = args;
    if (typeof args === 'string') {
      try {
        callArgs = JSON.parse(args);
      } catch {
        // heuristic: map searches to query, otherwise wrap as arg
        if (toolName.toLowerCase().includes('search')) {
          callArgs = { query: args };
        } else {
          callArgs = { arg: args };
        }
      }
    }
    if (callArgs == null || typeof callArgs !== 'object' || Array.isArray(callArgs)) {
      callArgs = { arg: String(args) };
    }

    // Normalize common fields for Playwright tools
    const lowerTool = mapping.toolName.toLowerCase();
    if (callArgs.arg && !callArgs.url && (lowerTool.includes('screenshot') || lowerTool.includes('browse'))) {
      callArgs.url = callArgs.arg;
    }
    if (callArgs.arg && !callArgs.query && lowerTool.includes('search')) {
      callArgs.query = callArgs.arg;
    }
    // Trim URLs/queries if present
    if (callArgs.url && typeof callArgs.url === 'string') callArgs.url = callArgs.url.trim();
    if (callArgs.query && typeof callArgs.query === 'string') callArgs.query = callArgs.query.trim();

    console.log(`[MCP Hub] calling ${toolName} with args:`, callArgs);

    let result;
    try {
      result = await clientBundle.client.callTool({
        name: mapping.toolName,
        arguments: callArgs,
      });
    } catch (error) {
      // Some servers have schema mismatches; retry with a raw request to bypass validation.
      console.warn(`[MCP Hub] callTool failed for ${toolName}: ${error.message}. Retrying with raw tools/call.`);
      const raw = await clientBundle.client.request(
        { method: 'tools/call', params: { name: mapping.toolName, arguments: callArgs } },
        z.any()
      );
      result = raw?.result ?? raw;
    }

    let message = null;
    if (result?.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter(item => item?.type === 'text' && item.text)
        .map(item => item.text);
      if (textParts.length) {
        message = textParts.join('\n');
      }
    }

    const ok = !result?.isError;
    return {
      ok,
      content: result?.content || null,
      structuredContent: result?.content || null,
      isError: result?.isError || false,
      message: message || (ok ? 'Completed.' : result?.message || null),
    };
  }

  async blockTool(toolName) {
    this.blocklist.add(toolName);
    await this.saveBlocklist();
    // Drop from current index
    if (this.toolIndex.has(toolName)) {
      this.toolIndex.delete(toolName);
    }
    return { blocked: toolName };
  }

  async unblockTool(toolName) {
    if (this.blocklist.has(toolName)) {
      this.blocklist.delete(toolName);
      await this.saveBlocklist();
      // Attempt to rehydrate by reconnecting its server if known
      const parts = toolName.split('__');
      const serverName = parts[0];
      const cfg = this.serverConfigs.find(c => c.name === serverName);
      if (cfg) {
        await this.connectToServer(cfg);
      }
    }
    return { unblocked: toolName };
  }

  async getBlocked() {
    return Array.from(this.blocklist);
  }
}
