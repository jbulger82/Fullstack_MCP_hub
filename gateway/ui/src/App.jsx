import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import './App.css';

const TOOLS_ENDPOINT = '/tools';
const EXECUTE_ENDPOINT = '/gemini/v1/execute';
const fetchBlocked = async () => {
  const res = await fetch('/tools/blocked');
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load blocked tools');
  return data.blocked || [];
};

const fetchTools = async () => {
  const res = await fetch(TOOLS_ENDPOINT);
  if (!res.ok) throw new Error('Failed to load tools');
  return res.json();
};

const fetchUploads = async () => {
  const res = await fetch('/rag/uploads');
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to list uploads');
  return data.files || [];
};

const fetchSaved = async () => {
  const res = await fetch('/rag/saved');
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to list saved chats');
  return data.files || [];
};

const fetchIndexes = async () => {
  const res = await fetch('/rag/indexes');
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to list indexes');
  return data.files || [];
};

function ToolList({ tools, selected, onSelect, onRefresh, isFetching, filter, setFilter }) {
  return (
    <div className="card sidebar">
      <div className="section-header">
        <div>
          <p className="eyebrow">Tools</p>
          <h3>Discovery</h3>
        </div>
        <button className="ghost-btn" onClick={onRefresh}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <input className="input" placeholder="Search by name or server…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="tool-list">
        {tools.length === 0 && <p className="muted">No tools available.</p>}
        {tools.map((t) => (
          <button key={t.name} className={`tool-row ${selected === t.name ? 'active' : ''}`} onClick={() => onSelect(t.name)}>
            <div>
              <div className="tool-name">{t.name}</div>
              <div className="tool-meta">
                <span className="pill">{t.server}</span>
                {t.description && <span className="muted-small">{t.description.slice(0, 80)}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [filter, setFilter] = useState('');
  const [selectedTool, setSelectedTool] = useState(null);
  const [argText, setArgText] = useState('{}');
  const [runState, setRunState] = useState({ status: 'idle', result: null, error: null, durationMs: 0 });
  const [tab, setTab] = useState('tools'); // tools | rag | info | servers | blocked
  const [descriptionText, setDescriptionText] = useState('');
  const [descStatus, setDescStatus] = useState({ status: 'idle', message: '' });

  const [uploads, setUploads] = useState([]);
  const [savedChats, setSavedChats] = useState([]);
  const [indexes, setIndexes] = useState([]);
  const [uploadState, setUploadState] = useState({ status: 'idle', message: '' });
  const [ragSearch, setRagSearch] = useState('');

  const [serverForm, setServerForm] = useState({
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    cwd: '',
    url: '',
    envEntries: [{ key: '', value: '' }],
  });
  const [serverState, setServerState] = useState({ status: 'idle', message: '' });
  const [testState, setTestState] = useState({ status: 'idle', message: '', toolCount: null });
  const [blockedTools, setBlockedTools] = useState([]);

  const toolsQuery = useQuery({
    queryKey: ['tools'],
    queryFn: fetchTools,
    refetchInterval: 30000,
  });
  const blockedQuery = useQuery({
    queryKey: ['blocked-tools'],
    queryFn: fetchBlocked,
    refetchInterval: 30000,
  });

  const tools = useMemo(() => {
    const list = toolsQuery.data?.tools || [];
    if (!filter.trim()) return list;
    const term = filter.toLowerCase();
    return list.filter(
      (t) =>
        t.name?.toLowerCase().includes(term) ||
        t.server?.toLowerCase().includes(term) ||
        t.description?.toLowerCase().includes(term)
    );
  }, [toolsQuery.data, filter]);

  useEffect(() => {
    if (tools.length && !selectedTool) {
      setSelectedTool(tools[0]);
    } else if (selectedTool) {
      const updated = tools.find((t) => t.name === selectedTool.name);
      if (updated) setSelectedTool(updated);
    }
  }, [tools, selectedTool]);

  useEffect(() => {
    if (selectedTool) {
      setDescriptionText(selectedTool.description || '');
      setDescStatus({ status: 'idle', message: '' });
    }
  }, [selectedTool]);

  const handleRun = async () => {
    if (!selectedTool) return;
    let parsed = {};
    if (argText.trim()) {
      try {
        parsed = JSON.parse(argText);
      } catch {
        setRunState({ status: 'error', error: 'Invalid JSON', result: null, durationMs: 0 });
        return;
      }
    }
    const payload = { functionCall: { name: selectedTool.name, arguments: parsed } };
    const started = performance.now();
    setRunState({ status: 'running', error: null, result: null, durationMs: 0 });
    try {
      const res = await fetch(EXECUTE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setRunState({
        status: res.ok ? 'success' : 'error',
        result: data,
        error: res.ok ? null : data?.error || 'Execution failed',
        durationMs: Math.round(performance.now() - started),
      });
    } catch (err) {
      setRunState({ status: 'error', error: err.message, result: null, durationMs: 0 });
    }
  };

  const loadRag = async () => {
    try {
      const [u, s, i] = await Promise.all([
        fetch('/rag/uploads').then((r) => r.json()),
        fetch('/rag/saved').then((r) => r.json()),
        fetch('/rag/indexes').then((r) => r.json()),
      ]);
      if (u.ok) setUploads(u.files || []);
      if (s.ok) setSavedChats(s.files || []);
      if (i.ok) setIndexes(i.files || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadRag();
  }, []);

  useEffect(() => {
    if (blockedQuery.data) setBlockedTools(blockedQuery.data);
  }, [blockedQuery.data]);

  const handleUpload = async (file, subdir = 'uploads') => {
    setUploadState({ status: 'running', message: '' });
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = btoa(reader.result);
        const res = await fetch('/rag/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content: base64, subdir }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setUploadState({ status: 'error', message: data?.error || 'Upload failed' });
          return;
        }
        setUploadState({ status: 'success', message: `Uploaded ${file.name}` });
        loadRag();
      } catch (err) {
        setUploadState({ status: 'error', message: err.message });
      }
    };
    reader.readAsBinaryString(file);
  };

  const deleteUpload = async (name) => {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    await fetch('/rag/uploads', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: name }),
    });
    loadRag();
  };

  const saveDescription = async () => {
    if (!selectedTool) return;
    setDescStatus({ status: 'saving', message: '' });
    try {
      const res = await fetch(`/tools/${encodeURIComponent(selectedTool.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descriptionText }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Save failed');
      setDescStatus({ status: 'success', message: 'Saved' });
      toolsQuery.refetch();
    } catch (err) {
      setDescStatus({ status: 'error', message: err.message });
    }
  };

  const resetDescription = async () => {
    if (!selectedTool) return;
    setDescStatus({ status: 'saving', message: '' });
    try {
      const res = await fetch(`/tools/${encodeURIComponent(selectedTool.name)}/reset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Reset failed');
      const newDesc = data.tool?.description || '';
      setDescriptionText(newDesc);
      setDescStatus({ status: 'success', message: 'Restored default' });
      toolsQuery.refetch();
    } catch (err) {
      setDescStatus({ status: 'error', message: err.message });
    }
  };

  const testServer = async () => {
    setTestState({ status: 'testing', message: '', toolCount: null });
    const env = Object.fromEntries(
      (serverForm.envEntries || [])
        .filter((e) => e.key.trim())
        .map((e) => [e.key.trim(), e.value])
    );
    const payload = serverForm.transport === 'stdio'
      ? {
          name: serverForm.name || 'temp',
          transport: 'stdio',
          command: serverForm.command,
          args: serverForm.args ? serverForm.args.match(/\S+/g) || [] : [],
          cwd: serverForm.cwd || undefined,
          env: Object.keys(env).length ? env : undefined,
        }
      : { name: serverForm.name || 'temp', transport: 'sse', url: serverForm.url };
    try {
      const res = await fetch('/servers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTestState({ status: 'error', message: data?.error || 'Test failed', toolCount: null });
        return;
      }
      const tc = data.toolCount ?? null;
      const msg = tc != null ? `Connected: ${tc} tool${tc === 1 ? '' : 's'} found` : 'Connection OK';
      setTestState({ status: 'success', message: msg, toolCount: tc });
    } catch (err) {
      setTestState({ status: 'error', message: err.message, toolCount: null });
    }
  };

  const addServer = async () => {
    setServerState({ status: 'saving', message: '' });
    const env = Object.fromEntries(
      (serverForm.envEntries || [])
        .filter((e) => e.key.trim())
        .map((e) => [e.key.trim(), e.value])
    );
    const payload = serverForm.transport === 'stdio'
      ? {
          name: serverForm.name,
          transport: 'stdio',
          command: serverForm.command,
          args: serverForm.args ? serverForm.args.match(/\S+/g) || [] : [],
          cwd: serverForm.cwd || undefined,
          env: Object.keys(env).length ? env : undefined,
        }
      : { name: serverForm.name, transport: 'sse', url: serverForm.url };
    try {
      const res = await fetch('/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setServerState({ status: 'error', message: data?.error || 'Add failed' });
        return;
      }
      const tc = data.toolCount ?? null;
      const msg = tc != null ? `Added: ${tc} tool${tc === 1 ? '' : 's'} found` : 'Added';
      setServerState({ status: 'success', message: msg });
    } catch (err) {
      setServerState({ status: 'error', message: err.message });
    }
  };

  const ragTerm = ragSearch.trim().toLowerCase();
  const searchResults = ragTerm
    ? [...uploads.map((f) => ({ ...f, source: 'uploads' })), ...savedChats.map((f) => ({ ...f, source: 'saved_chats' })), ...indexes.map((f) => ({ ...f, source: 'indexes' }))]
        .filter((f) => f.name.toLowerCase().includes(ragTerm) || f.path.toLowerCase().includes(ragTerm))
    : [];

  const applyPreset = (preset) => {
    if (preset === 'node') {
      setServerForm((s) => ({ ...s, transport: 'stdio', command: 'node', args: '', cwd: s.cwd }));
    } else if (preset === 'python') {
      setServerForm((s) => ({ ...s, transport: 'stdio', command: 'python3', args: '', cwd: s.cwd }));
    } else if (preset === 'docker') {
      setServerForm((s) => ({ ...s, transport: 'stdio', command: 'docker', args: 'run -i', cwd: s.cwd }));
    } else if (preset === 'pyrepl') {
      setServerForm((s) => ({
        ...s,
        name: 'python_repl',
        transport: 'stdio',
        command: 'python3',
        args: 'python_repl_mcp.py',
        cwd: '/home/jeff/Desktop/MAIN_DEV_OPS/MASTER_MCP/servers',
      }));
    } else if (preset === 'research') {
      setServerForm((s) => ({
        ...s,
        name: 'research',
        transport: 'stdio',
        command: 'python3',
        args: 'research_mcp_server.py',
        cwd: '/home/jeff/Desktop/MAIN_DEV_OPS/MASTER_MCP/servers',
      }));
    }
  };

  const handleFileDrop = (file) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.js')) {
      setServerForm((s) => ({
        ...s,
        transport: 'stdio',
        command: s.command || 'node',
        args: file.name,
        name: s.name || file.name.replace(/\\.js$/i, ''),
      }));
    } else if (lower.endsWith('.py')) {
      setServerForm((s) => ({
        ...s,
        transport: 'stdio',
        command: s.command || 'python3',
        args: file.name,
        name: s.name || file.name.replace(/\\.py$/i, ''),
      }));
    } else {
      setServerForm((s) => ({ ...s, args: file.name, name: s.name || file.name }));
    }
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">FullStack MCP_HUB</p>
          <h1>FullStack MCP_HUB</h1>
          <p className="muted">Gateway at http://localhost:3333</p>
        </div>
        <div className="stat-block">
          <span className="stat-number">{toolsQuery.data?.tool_count ?? 0}</span>
          <span className="stat-label">Tools discovered</span>
        </div>
      </header>

      <div className="tab-row">
        <button className={`tab-btn ${tab === 'tools' ? 'active' : ''}`} onClick={() => setTab('tools')}>
          Tools
        </button>
        <button className={`tab-btn ${tab === 'servers' ? 'active' : ''}`} onClick={() => setTab('servers')}>
          Add server
        </button>
        <button className={`tab-btn ${tab === 'rag' ? 'active' : ''}`} onClick={() => setTab('rag')}>
          RAG
        </button>
        <button className={`tab-btn ${tab === 'blocked' ? 'active' : ''}`} onClick={() => setTab('blocked')}>
          Blocked
        </button>
        <button className={`tab-btn ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
          How to
        </button>
      </div>

      {tab === 'tools' && (
        <>
          {toolsQuery.isLoading && <div className="card">Loading tools…</div>}
          {toolsQuery.isError && <div className="card error">Failed to load tools: {toolsQuery.error?.message}</div>}
          {!toolsQuery.isLoading && !toolsQuery.isError && (
            <div className="layout">
              <ToolList
                tools={tools}
                selected={selectedTool?.name}
                onSelect={(name) => setSelectedTool(tools.find((t) => t.name === name))}
                onRefresh={toolsQuery.refetch}
                isFetching={toolsQuery.isFetching}
                filter={filter}
                setFilter={setFilter}
              />
              <div className="content">
                {!selectedTool ? (
                  <div className="card">Select a tool to see details.</div>
                ) : (
                  <>
                    <div className="card section">
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">{selectedTool.server}</p>
                          <h2>{selectedTool.name}</h2>
                        </div>
                      </div>
                      <div className="field-group">
                        <p className="eyebrow">Description (editable)</p>
                        <textarea
                          className="code-input"
                          style={{ minHeight: '90px' }}
                          value={descriptionText}
                          onChange={(e) => setDescriptionText(e.target.value)}
                          spellCheck={false}
                        />
                        <div className="section-header" style={{ gap: '10px' }}>
                          <button className="secondary-btn" onClick={saveDescription} disabled={descStatus.status === 'saving'}>
                            {descStatus.status === 'saving' ? 'Saving…' : 'Save description'}
                          </button>
                          <button className="ghost-btn" onClick={resetDescription} disabled={descStatus.status === 'saving'}>
                            Restore default
                          </button>
                          <button
                            className="ghost-btn"
                            onClick={async () => {
                              if (!selectedTool) return;
                              await fetch(`/tools/${encodeURIComponent(selectedTool.name)}/block`, { method: 'POST' });
                              toolsQuery.refetch();
                              blockedQuery.refetch();
                              setSelectedTool(null);
                            }}
                          >
                            Block tool
                          </button>
                          <span className="muted-small">
                            {descStatus.status === 'success' && descStatus.message}
                            {descStatus.status === 'error' && `Error: ${descStatus.message}`}
                          </span>
                        </div>
                      </div>
                      <div className="schema-block">
                        <div className="schema-head">
                          <p className="eyebrow">Input schema</p>
                        </div>
                        <pre className="code-block">{JSON.stringify(selectedTool.inputSchema || {}, null, 2)}</pre>
                      </div>
                    </div>

                    <div className="card section">
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">Run</p>
                          <h3>Send a payload</h3>
                        </div>
                        <div className="run-controls">
                          <button className="secondary-btn" onClick={() => setArgText('{}')}>Clear</button>
                          <button className="primary-btn" onClick={handleRun} disabled={runState.status === 'running'}>
                            {runState.status === 'running' ? 'Running…' : 'Run tool'}
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="code-input"
                        value={argText}
                        onChange={(e) => setArgText(e.target.value)}
                        spellCheck={false}
                        placeholder='{ "query": "..." }'
                      />
                      <div className="run-status">
                        <span className={`status-dot ${runState.status}`}></span>
                        <span className="muted-small">
                          {runState.status === 'idle' && 'Idle'}
                          {runState.status === 'running' && 'Running…'}
                          {runState.status === 'success' && `Completed in ${runState.durationMs} ms`}
                          {runState.status === 'error' && 'Error'}
                        </span>
                      </div>
                      {runState.error && <div className="alert error">Error: {runState.error}</div>}
                      {runState.result && (
                        <div className="result-block">
                          <div className="schema-head">
                            <p className="eyebrow">Result</p>
                            <span className="muted-small">Raw response</span>
                          </div>
                          <pre className="code-block">{JSON.stringify(runState.result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'servers' && (
        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Add MCP server</p>
              <h2>Register & connect</h2>
            </div>
          </div>
          <div className="field-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="secondary-btn" onClick={() => applyPreset('node')}>Preset: Node script</button>
            <button className="secondary-btn" onClick={() => applyPreset('python')}>Preset: Python script</button>
            <button className="secondary-btn" onClick={() => applyPreset('docker')}>Preset: Docker run</button>
            <button className="secondary-btn" onClick={() => applyPreset('pyrepl')}>Preset: Python REPL server</button>
            <button className="secondary-btn" onClick={() => applyPreset('research')}>Preset: Research (Wiki/ArXiv)</button>
          </div>
          <div className="field-group">
            <p className="eyebrow">Name</p>
            <input className="input" value={serverForm.name} onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })} />
          </div>
          <div className="field-group">
            <p className="eyebrow">Transport</p>
            <select
              className="select"
              value={serverForm.transport}
              onChange={(e) => setServerForm({ ...serverForm, transport: e.target.value })}
            >
              <option value="stdio">stdio (local process)</option>
              <option value="sse">sse (remote URL)</option>
            </select>
          </div>
          {serverForm.transport === 'stdio' ? (
            <>
              <div className="field-group">
                <p className="eyebrow">Command</p>
                <input className="input" value={serverForm.command} onChange={(e) => setServerForm({ ...serverForm, command: e.target.value })} />
              </div>
              <div className="field-group">
                <p className="eyebrow">Args</p>
                <input className="input" value={serverForm.args} onChange={(e) => setServerForm({ ...serverForm, args: e.target.value })} />
              </div>
              <div className="field-group">
                <p className="eyebrow">CWD</p>
                <input className="input" value={serverForm.cwd} onChange={(e) => setServerForm({ ...serverForm, cwd: e.target.value })} />
                <p className="muted-small">Tip: drag a .js/.py file into the box below to auto-fill command/args (set CWD manually).</p>
                <div
                  className="tool-row drop-zone"
                  style={{ textAlign: 'center', marginTop: '8px' }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    handleFileDrop(file);
                  }}
                >
                  Drag & drop a script here to prefill (browser can't read full path; set CWD yourself).
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    id="server-file-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      handleFileDrop(file);
                    }}
                  />
                </div>
                <button
                  className="ghost-btn"
                  style={{ marginTop: '6px' }}
                  onClick={() => document.getElementById('server-file-input')?.click()}
                >
                  Browse file
                </button>
              </div>
            </>
          ) : (
            <div className="field-group">
              <p className="eyebrow">SSE URL</p>
              <input className="input" value={serverForm.url} onChange={(e) => setServerForm({ ...serverForm, url: e.target.value })} />
            </div>
          )}
          <div className="field-group">
            <p className="eyebrow">Env vars (optional)</p>
            {(serverForm.envEntries || []).map((row, idx) => (
              <div key={idx} className="field-row">
                <input
                  className="input"
                  placeholder="KEY"
                  value={row.key}
                  onChange={(e) => {
                    const next = [...serverForm.envEntries];
                    next[idx] = { ...next[idx], key: e.target.value };
                    setServerForm({ ...serverForm, envEntries: next });
                  }}
                />
                <input
                  className="input"
                  placeholder="value"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...serverForm.envEntries];
                    next[idx] = { ...next[idx], value: e.target.value };
                    setServerForm({ ...serverForm, envEntries: next });
                  }}
                />
                <button
                  className="icon-btn"
                  onClick={() => {
                    const next = serverForm.envEntries.filter((_, i) => i !== idx);
                    setServerForm({ ...serverForm, envEntries: next.length ? next : [{ key: '', value: '' }] });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="secondary-btn"
              style={{ marginTop: '6px' }}
              onClick={() => setServerForm({ ...serverForm, envEntries: [...serverForm.envEntries, { key: '', value: '' }] })}
            >
              Add env var
            </button>
            <p className="muted-small">These are sent to the process (stdio) at launch.</p>
          </div>
          <div className="section-header" style={{ gap: '10px' }}>
            <button className="secondary-btn" onClick={testServer} disabled={testState.status === 'testing'}>
              {testState.status === 'testing' ? 'Testing…' : 'Test'}
            </button>
            <button className="primary-btn" onClick={addServer} disabled={serverState.status === 'saving'}>
              {serverState.status === 'saving' ? 'Adding…' : 'Add server'}
            </button>
            <div className="muted-small">
              {testState.status === 'success' && (testState.message || `OK${testState.toolCount != null ? ` (${testState.toolCount} tools)` : ''}`)}
              {testState.status === 'error' && `Test failed: ${testState.message}`}
              {serverState.status === 'error' && `Add failed: ${serverState.message}`}
              {serverState.status === 'success' && (serverState.message || 'Added')}
            </div>
          </div>
        </div>
      )}

      {tab === 'rag' && (
      <div className="card section">
        <div className="section-header">
          <div>
            <p className="eyebrow">RAG Storage</p>
            <h2>data/rag</h2>
            <p className="muted-small">Browse uploads, saved chats, and index files.</p>
          </div>
        </div>
        <div className="field-group">
          <p className="eyebrow">Search all (name/path)</p>
          <input
            className="input"
            placeholder="Type to filter files across uploads, saved_chats, indexes…"
            value={ragSearch}
            onChange={(e) => setRagSearch(e.target.value)}
          />
        </div>
        {ragTerm && (
          <div className="field-group">
            <p className="eyebrow">Search results</p>
            <div className="tool-list" style={{ maxHeight: '180px' }}>
              {searchResults.length === 0 && <p className="muted-small">No matches.</p>}
              {searchResults.map((f) => (
                <div key={`${f.source}-${f.path}`} className="tool-row">
                  <div>
                    <div className="tool-name">{f.name}</div>
                    <div className="tool-meta">
                      <span className="pill subtle">{f.source}</span>
                      <span className="muted-small">{f.isDir ? 'dir' : `${f.size} bytes`}</span>
                      <span className="muted-small">{f.path}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="field-group">
          <p className="eyebrow">uploads/</p>
            <div
              className="tool-list drop-zone"
              style={{ maxHeight: '200px' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleUpload(file, 'uploads');
              }}
            >
              {uploads.length === 0 && <p className="muted-small">No uploads yet.</p>}
              {uploads.map((f) => (
                <div key={f.path} className="tool-row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div className="tool-name">{f.name}</div>
                    <div className="tool-meta">
                      <span className="muted-small">{f.isDir ? 'dir' : `${f.size} bytes`}</span>
                      <span className="muted-small">{f.path}</span>
                    </div>
                  </div>
                  {!f.isDir && (
                    <button className="icon-btn" onClick={() => deleteUpload(f.name)} title="Delete file">
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px' }}>
              <label className="secondary-btn" style={{ cursor: 'pointer' }}>
                ADD FILE
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file, 'uploads');
                  }}
                />
              </label>
              <button className="secondary-btn" onClick={loadRag}>
                Refresh
              </button>
              <p className="muted-small">
                {uploadState.status === 'running' && 'Uploading...'}
                {uploadState.status === 'success' && uploadState.message}
                {uploadState.status === 'error' && `Upload error: ${uploadState.message}`}
              </p>
            </div>
          </div>

          <div className="field-group">
            <p className="eyebrow">saved_chats/</p>
            <div
              className="tool-list drop-zone"
              style={{ maxHeight: '160px' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleUpload(file, 'saved_chats');
              }}
            >
              {savedChats.length === 0 && <p className="muted-small">No saved chats.</p>}
              {savedChats.map((f) => (
                <div key={f.path} className="tool-row">
                  <div>
                    <div className="tool-name">{f.name}</div>
                    <div className="tool-meta">
                      <span className="muted-small">{f.isDir ? 'dir' : `${f.size} bytes`}</span>
                      <span className="muted-small">{f.path}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px' }}>
              <label className="secondary-btn" style={{ cursor: 'pointer' }}>
                ADD FILE
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file, 'saved_chats');
                  }}
                />
              </label>
              <button className="secondary-btn" onClick={loadRag}>
                Refresh
              </button>
            </div>
          </div>

          <div className="field-group">
            <p className="eyebrow">indexes/</p>
            <div
              className="tool-list drop-zone"
              style={{ maxHeight: '160px' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleUpload(file, 'indexes');
              }}
            >
              {indexes.length === 0 && <p className="muted-small">No index files.</p>}
              {indexes.map((f) => (
                <div key={f.path} className="tool-row">
                  <div>
                    <div className="tool-name">{f.name}</div>
                    <div className="tool-meta">
                      <span className="muted-small">{f.isDir ? 'dir' : `${f.size} bytes`}</span>
                      <span className="muted-small">{f.path}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px' }}>
              <label className="secondary-btn" style={{ cursor: 'pointer' }}>
                ADD FILE
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file, 'indexes');
                  }}
                />
              </label>
              <button className="secondary-btn" onClick={loadRag}>
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'blocked' && (
        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Blocked tools</p>
              <h2>Restore or inspect</h2>
            </div>
            <button className="ghost-btn" onClick={() => blockedQuery.refetch()}>
              {blockedQuery.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {blockedQuery.isLoading && <p className="muted-small">Loading…</p>}
          {blockedQuery.isError && <p className="muted-small">Failed to load blocked list.</p>}
          <div className="tool-list">
            {blockedTools.length === 0 && <p className="muted-small">No blocked tools.</p>}
            {blockedTools.map((name) => (
              <div key={name} className="tool-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div className="tool-name">{name}</div>
                </div>
                <button
                  className="secondary-btn"
                  onClick={async () => {
                    await fetch(`/tools/${encodeURIComponent(name)}/unblock`, { method: 'POST' });
                    blockedQuery.refetch();
                    toolsQuery.refetch();
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'info' && (
        <div className="card section">
          <div className="section-header">
            <div>
              <p className="eyebrow">How to</p>
              <h2>FullStack MCP_HUB guide</h2>
            </div>
          </div>
          <div className="field-group">
            <p className="eyebrow">Start</p>
            <p className="muted-small">
              Run: <code>cd gateway && npm start</code>, then open <code>http://localhost:3333</code>. The UI served is this FullStack MCP_HUB.
            </p>
          </div>
          <div className="field-group">
            <p className="eyebrow">Add a server</p>
            <p className="muted-small">Use the Add server tab.</p>
            <p className="muted-small">- stdio: Command + Args + CWD. Presets (Node/Python/Docker) and drag-drop help you fill these.</p>
            <p className="muted-small">- sse: full SSE URL.</p>
            <p className="muted-small">- Env vars: add key/value rows for API keys, etc.</p>
            <p className="muted-small">Test → you should see “Connected: N tools found.” Then Add to persist to <code>tool-registry/master.json</code>.</p>
          </div>
          <div className="field-group">
            <p className="eyebrow">RAG data</p>
            <p className="muted-small">Everything RAG lives under <code>data/rag</code> (uploads, saved_chats, indexes). RAG tab lets you browse, search filenames/paths, and add files via click or drag-drop.</p>
          </div>
          <div className="field-group">
            <p className="eyebrow">Save chat tool</p>
            <p className="muted-small">Tool: <code>local_rag__save_chat</code>. Inputs: transcript (string), model (string), optional summarize+summary+session_id. It writes fresh files into <code>data/rag/saved_chats/</code> without overwriting.</p>
          </div>
          <div className="field-group">
            <p className="eyebrow">Tool text</p>
            <p className="muted-small">Edit a tool description in the Tools tab and Save; Restore default reverts to registry text. Useful for quick helper notes.</p>
          </div>
          <div className="field-group">
            <p className="eyebrow">Intent / contact</p>
            <p className="muted-small">Goal: a universal MCP hub that stays simple, works with any LLM (hosted or local), and keeps RAG data on disk for future semantic search.</p>
            <p className="muted-small">Questions or issues: admin@jeffbulger.dev</p>
          </div>
        </div>
      )}
    </div>
  );
}
