import readline from 'node:readline';
import { stdout as output } from 'node:process';

function send(msg) {
  output.write(JSON.stringify(msg) + '\n');
}

function stripScriptsStyles(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ');
}

function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

function extractParagraphs(html, maxChars) {
  const matches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  const texts = matches.map((m) => stripTags(m[1]).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const combined = texts.join(' ');
  return combined.slice(0, maxChars);
}

async function scrape_page(url, max_chars = 12000) {
  if (!url) return [{ type: 'text', text: 'URL is required.' }];
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FullStack-MCP-Scraper/0.1',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = await res.text();
    const title = extractTitle(html);
    const metaDesc = extractMeta(html, 'description') || extractMeta(html, 'og:description');
    const cleaned = stripTags(stripScriptsStyles(html))
      .replace(/\s+/g, ' ')
      .trim();
    let body = cleaned.slice(0, max_chars);
    // If we got almost nothing, try paragraphs directly
    if (body.length < 200) {
      const paraText = extractParagraphs(html, max_chars);
      if (paraText.length > body.length) body = paraText;
    }
    // If still thin, include meta description
    if (body.length < 200 && metaDesc) {
      body = `${metaDesc}\n\n${body}`.trim();
    }
    const meta = `Title: ${title || '(none)'}\nURL: ${url}\nLength: ${cleaned.length} chars`;
    return [{ type: 'text', text: `${meta}\n\n${body}` }];
  } catch (e) {
    return [{ type: 'text', text: `Fetch failed: ${e.message}` }];
  }
}

function toolsList() {
  return [
    {
      name: 'scrape_page',
      description: 'Fetch a URL and return cleaned text + title (basic, no JS execution).',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Page URL' },
          max_chars: { type: 'integer', description: 'Max characters of text to return', default: 12000 },
        },
        required: ['url'],
      },
    },
  ];
}

async function handle(req) {
  const { id, method, params = {} } = req;
  const resp = { jsonrpc: '2.0', id };
  try {
    if (method === 'initialize') {
      resp.result = {
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'scrape', version: '0.1.0' },
        capabilities: {},
      };
    } else if (method === 'tools/list') {
      resp.result = { tools: toolsList() };
    } else if (method === 'tools/call') {
      const name = params.name;
      const args = params.arguments || {};
      if (name === 'scrape_page') {
        const content = await scrape_page(args.url, args.max_chars);
        resp.result = { content };
      } else {
        resp.error = { code: -32601, message: `Unknown tool '${name}'` };
      }
    } else {
      resp.error = { code: -32601, message: `Unknown method '${method}'` };
    }
  } catch (err) {
    resp.error = { code: -32000, message: err.message || String(err) };
  }
  send(resp);
}

function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      handle(msg);
    } catch (e) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  });
}

main();
