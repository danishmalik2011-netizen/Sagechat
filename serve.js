// tiny zero-dep static server & CORS proxy for cute-chat
const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');
const ROOT = __dirname;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8766;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.json': 'application/json; charset=utf-8',
};

http.createServer((req, res) => {
  // Global CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Live Web Search API endpoint (MCP Web Search Connector)
  if (req.url.startsWith('/api/search')) {
    const parsed = new URL(req.url, `http://localhost:${PORT}`);
    const query = (parsed.searchParams.get('q') || '').trim();
    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Missing query parameter q' }));
      return;
    }

    // Query Wikipedia search API + DuckDuckGo Instant Answer
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=6`;
    https.get(wikiUrl, { headers: { 'User-Agent': 'CuteChat-Search/1.0' } }, (wikiRes) => {
      let data = '';
      wikiRes.on('data', chunk => data += chunk);
      wikiRes.on('end', () => {
        const results = [];
        try {
          const json = JSON.parse(data);
          const list = json.query?.search || [];
          for (const item of list) {
            results.push({
              title: item.title,
              snippet: (item.snippet || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
              source: 'Wikipedia'
            });
          }
        } catch {}

        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        https.get(ddgUrl, { headers: { 'User-Agent': 'CuteChat-Search/1.0' } }, (ddgRes) => {
          let ddgData = '';
          ddgRes.on('data', chunk => ddgData += chunk);
          ddgRes.on('end', () => {
            try {
              const dj = JSON.parse(ddgData);
              if (dj.AbstractText && dj.AbstractURL) {
                results.unshift({
                  title: dj.Heading || query,
                  snippet: dj.AbstractText,
                  url: dj.AbstractURL,
                  source: dj.AbstractSource || 'DuckDuckGo'
                });
              }
              if (Array.isArray(dj.RelatedTopics)) {
                for (const top of dj.RelatedTopics.slice(0, 3)) {
                  if (top.Text && top.FirstURL) {
                    results.push({
                      title: top.Text.split(' - ')[0] || query,
                      snippet: top.Text,
                      url: top.FirstURL,
                      source: 'DuckDuckGo'
                    });
                  }
                }
              }
            } catch {}

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ query, results: results.slice(0, 6) }));
          });
        }).on('error', () => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ query, results: results.slice(0, 6) }));
        });
      });
    }).on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Search failed: ' + err.message }));
    });
    return;
  }

  // Built-in CORS proxy for custom LLM providers (Ollama, LM Studio, OpenAI, etc.)
  if (req.url.startsWith('/api/proxy')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': '*',
      });
      res.end();
      return;
    }

    const parsed = new URL(req.url, `http://localhost:${PORT}`);
    const targetUrl = parsed.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ error: 'Missing target url parameter' }));
      return;
    }

    let targetParsed;
    try {
      targetParsed = new URL(targetUrl);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ error: 'Invalid target url: ' + targetUrl }));
      return;
    }

    const lib = targetParsed.protocol === 'https:' ? https : http;
    const fwdHeaders = { ...req.headers };
    delete fwdHeaders['host'];
    delete fwdHeaders['origin'];
    delete fwdHeaders['referer'];
    fwdHeaders['host'] = targetParsed.host;

    const proxyReq = lib.request(targetUrl, {
      method: req.method,
      headers: fwdHeaders,
    }, (proxyRes) => {
      const resHeaders = { ...proxyRes.headers };
      delete resHeaders['transfer-encoding'];
      resHeaders['access-control-allow-origin'] = '*';
      resHeaders['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      resHeaders['access-control-allow-headers'] = '*';
      res.writeHead(proxyRes.statusCode, resHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
      }
      res.end(JSON.stringify({ error: 'Proxy request failed: ' + err.message }));
    });

    if (req.method === 'GET' || req.method === 'HEAD') {
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
    return;
  }

  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(ROOT, url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + url); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`cute-chat ready: http://localhost:${PORT}/`));
