import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const clean = (s) =>
  (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const decodeDuckUrl = (raw) => {
  try {
    const full = raw.startsWith('http') ? raw : `https:${raw}`;
    const u = new URL(full);
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return full;
  } catch {
    return raw;
  }
};

async function fetchDuckDuckGoLite(query, limit = 5) {
  if (!query || typeof query !== 'string') return [];
  const capped = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 10);
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await res.text();
  const items = [];
  const rowRegex = /<tr class="result">([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRegex.exec(html)) && items.length < capped) {
    const chunk = row[1];
    const linkMatch = chunk.match(/<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = decodeDuckUrl(linkMatch[1]);
    const title = clean(linkMatch[2]);
    const snippetMatch = chunk.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i);
    const snippet = clean(snippetMatch ? snippetMatch[1] : '');
    items.push({ title, url: href, snippet });
  }
  // Very loose fallback: grab any result-link anchors if rows failed
  if (!items.length) {
    const loose = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = loose.exec(html)) && items.length < capped) {
      items.push({ title: clean(m[2]), url: decodeDuckUrl(m[1]), snippet: '' });
    }
  }
  return items;
}

async function fetchDuckDuckGoHtml(query, limit = 5) {
  if (!query || typeof query !== 'string') return [];
  const capped = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 10);
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&t=h_&ia=web`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await res.text();
  const items = [];
  const regex =
    /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi;
  let m;
  while ((m = regex.exec(html)) && items.length < capped) {
    const href = decodeDuckUrl(m[1]);
    const title = clean(m[2]);
    const snippet = clean(m[3]);
    if (title || snippet) {
      items.push({ title, url: href, snippet });
    }
  }
  // Loose fallback on HTML if snippets missing
  if (!items.length) {
    const loose = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m2;
    while ((m2 = loose.exec(html)) && items.length < capped) {
      items.push({ title: clean(m2[2]), url: decodeDuckUrl(m2[1]), snippet: '' });
    }
  }
  return items;
}

async function fetchCoindeskBTC() {
  try {
    const res = await fetch('https://api.coindesk.com/v1/bpi/currentprice/BTC.json', {
      headers: { 'User-Agent': 'FullStack-MCP/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const usd = data?.bpi?.USD?.rate || '';
    const updated = data?.time?.updated || '';
    if (!usd) return null;
    return [
      {
        title: 'Bitcoin price (Coindesk)',
        url: 'https://www.coindesk.com/price/bitcoin/',
        snippet: `BTC/USD: ${usd} — updated ${updated}`,
      },
    ];
  } catch {
    return null;
  }
}

async function fetchPageText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FullStack-MCP/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    const html = await res.text();

    // meta descriptions
    const metaDesc = (() => {
      const m =
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
      return m ? clean(m[1]) : '';
    })();

    const paras = [];
    const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = regex.exec(html)) && paras.length < 10) {
      const txt = clean(m[1]);
      if (txt.length > 50) paras.push(txt);
    }
    const bodyText = paras.find(p => p.length > 100) || paras[0] || '';
    return metaDesc || bodyText.slice(0, 800);
  } catch {
    return '';
  }
}

const server = new Server({ name: 'websearch-duckduckgo', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'web_search',
        description: 'Search the web via DuckDuckGo (no API key). Returns snippets and optional page fetch for quick answers.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query terms' },
            limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Number of results to return (default 5, max 10)' },
            fetchPages: { type: 'integer', minimum: 0, maximum: 3, description: 'Fetch and extract text from first N result pages (default 2)' },
            hideLinks: { type: 'boolean', description: 'If true, omit URLs from the text summary (JSON still includes URLs).' }
          },
          required: ['query'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'web_search') {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }
  const query = req.params.arguments?.query || '';
  const limit = req.params.arguments?.limit;
  const fetchPages = Math.min(Math.max(parseInt(req.params.arguments?.fetchPages, 10) || 2, 0), 3);
  const hideLinks = Boolean(req.params.arguments?.hideLinks);

  let results = await fetchDuckDuckGoLite(query, limit);
  if (!results.length) {
    results = await fetchDuckDuckGoHtml(query, limit);
  }
  // Dedicated fallback for BTC price queries
  if (!results.length && /bitcoin/i.test(query) && /price/i.test(query)) {
    const btc = await fetchCoindeskBTC();
    if (btc) results = btc;
  }

  // Optional page fetch for extra context / snippet fill
  if (fetchPages > 0) {
    for (let i = 0; i < Math.min(fetchPages, results.length); i++) {
      try {
        const text = await fetchPageText(results[i].url);
        if (text && !results[i].snippet) {
          results[i].snippet = text.slice(0, 240);
        } else if (text) {
          results[i].pageText = text;
        }
      } catch {
        // ignore fetch failures; keep basic result
      }
    }
  }

  if (!results.length) {
    results = [
      {
        title: 'No results from DuckDuckGo',
        url: '',
        snippet: 'Try a more specific query or lower fetchPages.',
      },
    ];
  }

  const snippets = results
    .map(r => r.snippet || r.pageText || '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 800);
  const summary = snippets
    ? `Summary: ${snippets}`
    : 'Summary: No snippets available; consider increasing fetchPages.';

  const text = results.length
    ? `${summary}\n\nTop results:\n${results
        .map((r, i) => {
          const lines = [
            `${i + 1}. ${r.title}`,
            hideLinks ? '' : r.url,
            r.snippet || (r.pageText ? r.pageText.slice(0, 200) + '...' : ''),
          ].filter(Boolean);
          return lines.join('\n');
        })
        .join('\n\n')}`
    : 'No results.';

  return {
    content: [
      {
        type: 'text',
        text,
      },
      { type: 'text', text: JSON.stringify(results, null, 2) },
    ],
  };
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Websearch MCP server failed:', err);
  process.exit(1);
});
