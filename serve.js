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
    try {
      const searchHandler = require('./api/search.js');
      const parsed = new URL(req.url, `http://localhost:${PORT}`);
      const mockRes = {
        setHeader: (k, v) => res.setHeader(k, v),
        status: (code) => {
          res.statusCode = code;
          return {
            json: (data) => {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(data));
            },
            end: () => res.end()
          };
        }
      };
      searchHandler({ url: req.url, query: Object.fromEntries(parsed.searchParams) }, mockRes);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message, results: [] }));
    }
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
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const bodyBuf = Buffer.concat(chunks);
      const fwdHeaders = {};
      for (const [k, v] of Object.entries(req.headers)) {
        const lower = k.toLowerCase();
        if (!lower.startsWith('sec-') && !lower.startsWith('cf-') &&
            lower !== 'host' && lower !== 'origin' && lower !== 'referer' &&
            lower !== 'cookie' && lower !== 'content-length') {
          fwdHeaders[lower] = v;
        }
      }
      fwdHeaders['host'] = targetParsed.host;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        fwdHeaders['content-length'] = bodyBuf.length;
      }

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

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        proxyReq.write(bodyBuf);
      }
      proxyReq.end();
    });
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
