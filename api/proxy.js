// api/proxy.js - Vercel Serverless Function CORS and streaming proxy
const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target url parameter' });
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid target url: ' + targetUrl });
  }

  const lib = parsed.protocol === 'https:' ? https : http;
  const fwdHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lower = k.toLowerCase();
    if (!lower.startsWith('sec-') && !lower.startsWith('cf-') &&
        lower !== 'host' && lower !== 'origin' && lower !== 'referer' && lower !== 'cookie') {
      fwdHeaders[lower] = v;
    }
  }
  fwdHeaders['host'] = parsed.host;

  const proxyReq = lib.request(targetUrl, {
    method: req.method,
    headers: fwdHeaders,
  }, (proxyRes) => {
    res.status(proxyRes.statusCode);
    for (const [key, val] of Object.entries(proxyRes.headers)) {
      if (key.toLowerCase() !== 'content-security-policy' && key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, val);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Proxy request failed: ' + err.message });
    }
  });

  if (req.method === 'POST') {
    if (req.body) {
      const data = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      proxyReq.write(data);
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  } else {
    proxyReq.end();
  }
};
