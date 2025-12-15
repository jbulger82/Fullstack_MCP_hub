import sys
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import traceback


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def read():
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)


def tools_list():
    return [
        {
            "name": "wikipedia_search",
            "description": "Search Wikipedia and return titles/summaries/links.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "limit": {"type": "integer", "description": "Max results", "default": 5},
                    "lang": {"type": "string", "description": "Language code (default en)", "default": "en"},
                },
                "required": ["query"],
            },
        },
        {
            "name": "arxiv_search",
            "description": "Search arXiv for papers (title/abstract/link).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "limit": {"type": "integer", "description": "Max results (<=25)", "default": 5},
                },
                "required": ["query"],
            },
        },
        {
            "name": "images_search_commons",
            "description": "Search Wikimedia Commons for existing images. Returns URLs, thumbnails, and basic attribution.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query (e.g., 'Eiffel Tower')"},
                    "limit": {"type": "integer", "description": "Max results (1-25)", "minimum": 1, "maximum": 25, "default": 8},
                    "thumb_width": {"type": "integer", "description": "Thumbnail width (64-2048px)", "minimum": 64, "maximum": 2048, "default": 640},
                },
                "required": ["query"],
            },
        },
    ]


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "FullStack-MCP-Research/0.1"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wikipedia_search(query, limit=5, lang="en"):
    limit = max(1, min(int(limit or 5), 20))
    lang = lang or "en"
    base = f"https://{lang}.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "format": "json",
        "srlimit": limit,
    }
    url = base + "?" + urllib.parse.urlencode(params)
    try:
        data = fetch_json(url)
    except Exception as e:
        return [{"type": "text", "text": f"Wikipedia request failed: {e}"}]
    hits = data.get("query", {}).get("search", []) if isinstance(data, dict) else []
    results = []
    for h in hits:
        title = h.get("title", "")
        snippet = h.get("snippet", "").replace("<span class=\"searchmatch\">", "").replace("</span>", "")
        page_url = f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"
        results.append({"title": title, "summary": snippet, "url": page_url})
    if not results:
        return [{"type": "text", "text": "No results."}]
    lines = [f"{r['title']} - {r['url']}\n{r.get('summary','')}".strip() for r in results]
    return [{"type": "text", "text": "\n\n".join(lines)}]


def arxiv_search(query, limit=5):
    limit = max(1, min(int(limit or 5), 25))
    params = urllib.parse.urlencode({"search_query": query, "start": 0, "max_results": limit})
    url = f"https://export.arxiv.org/api/query?{params}"
    with urllib.request.urlopen(url) as resp:
        xml_text = resp.read().decode("utf-8")
    root = ET.fromstring(xml_text)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entries = root.findall("a:entry", ns)
    results = []
    for e in entries:
        title = (e.find("a:title", ns).text or "").strip() if e.find("a:title", ns) is not None else ""
        summary = (e.find("a:summary", ns).text or "").strip() if e.find("a:summary", ns) is not None else ""
        link_el = e.find("a:link[@rel='alternate']", ns)
        link = link_el.attrib.get("href") if link_el is not None else ""
        results.append({"title": title, "summary": summary, "url": link})
    if not results:
        return [{"type": "text", "text": "No results."}]
    lines = [f"{r['title']} - {r['url']}\n{r.get('summary','')}".strip() for r in results]
    return [{"type": "text", "text": "\n\n".join(lines)}]


def images_search_commons(query, limit=8, thumb_width=640):
    limit = max(1, min(int(limit or 8), 25))
    thumb_width = max(64, min(int(thumb_width or 640), 2048))
    params = {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": 6,  # File namespace
        "gsrlimit": limit,
        "iiprop": "url|extmetadata",
        "iiurlwidth": thumb_width,
    }
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "FullStack-MCP-Research/0.1"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return [{"type": "text", "text": f"Wikimedia request failed: {e}"}]

    pages = data.get("query", {}).get("pages", {})
    results = []
    for _, page in pages.items():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        url_full = info.get("url", "")
        thumb = info.get("thumburl", "")
        meta = info.get("extmetadata", {}) or {}
        license_name = meta.get("LicenseShortName", {}).get("value", "")
        artist = meta.get("Artist", {}).get("value", "")
        title = page.get("title", "")
        results.append({
            "title": title,
            "url": url_full,
            "thumb": thumb,
            "license": license_name,
            "artist": artist,
        })
    if not results:
        return [{"type": "text", "text": "No results."}]
    lines = []
    for r in results:
        lines.append(
            f"{r['title']}\nfull: {r['url']}\nthumb: {r['thumb']}\nlicense: {r['license']}\nartist: {r['artist']}"
        )
    return [{"type": "text", "text": "\n\n".join(lines)}]


def main():
    while True:
        req = read()
        if req is None:
            break
        msg_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        resp = {"jsonrpc": "2.0", "id": msg_id}
        try:
            if method == "initialize":
                resp["result"] = {
                    "protocolVersion": "2025-06-18",
                    "serverInfo": {"name": "research", "version": "0.1.0"},
                    "capabilities": {},
                }
            elif method == "tools/list":
                resp["result"] = {"tools": tools_list()}
            elif method == "tools/call":
                name = params.get("name")
                arguments = params.get("arguments", {})
                if name == "wikipedia_search":
                    resp["result"] = {
                        "content": wikipedia_search(
                            arguments.get("query", ""),
                            arguments.get("limit", 5),
                            arguments.get("lang", "en"),
                        )
                    }
                elif name == "arxiv_search":
                    resp["result"] = {
                        "content": arxiv_search(arguments.get("query", ""), arguments.get("limit", 5))
                    }
                elif name == "images_search_commons":
                    resp["result"] = {
                        "content": images_search_commons(
                            arguments.get("query", ""),
                            arguments.get("limit", 8),
                            arguments.get("thumb_width", 640),
                        )
                    }
                else:
                    resp["error"] = {"code": -32601, "message": f"Unknown tool '{name}'"}
            else:
                resp["error"] = {"code": -32601, "message": f"Unknown method '{method}'"}
        except Exception:
            resp["error"] = {"code": -32000, "message": traceback.format_exc()}

        send(resp)


if __name__ == "__main__":
    main()
