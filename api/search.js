// Vercel Serverless Function: Multi-Source Public Web Search
// Queries DuckDuckGo HTML (for live general web results across official sites, docs, news)
// and Wikipedia API (for encyclopedic factual summaries).

const https = require('https');

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers
      },
      timeout: 8000
    }, (res) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        return fetchUrl(redirectUrl, headers).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 500000) { // 500KB cap
          res.destroy();
          resolve(data);
        }
      });
      res.on('end', () => resolve(data));
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
  });
}

function stripTags(html) {
  return (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

async function searchDuckDuckGo(query) {
  const results = [];
  try {
    const ddgHtml = await fetchUrl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    // Match results blocks: <div class="result results_links results_links_deep web-result">
    // Extract url from uddg parameter: href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com..."
    const resultBlocks = ddgHtml.split(/class="[^"]*result[^"]*results_links/i);
    for (let i = 1; i < resultBlocks.length && results.length < 8; i++) {
      const block = resultBlocks[i];
      // Find href
      const hrefMatch = block.match(/href="([^"]+)"/);
      if (!hrefMatch) continue;
      let rawHref = hrefMatch[1];
      let finalUrl = '';
      if (rawHref.includes('uddg=')) {
        const uddgPart = rawHref.split('uddg=')[1].split('&')[0];
        try { finalUrl = decodeURIComponent(uddgPart); } catch { finalUrl = uddgPart; }
      } else if (rawHref.startsWith('http')) {
        finalUrl = rawHref;
      }
      if (!finalUrl || finalUrl.includes('duckduckgo.com/y.js') || finalUrl.includes('ad_provider')) continue;

      // Title
      const titleMatch = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/) ||
                         block.match(/<a class="result__url"[^>]*>([\s\S]*?)<\/a>/) ||
                         block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      let title = titleMatch ? stripTags(titleMatch[1]) : '';
      if (!title) {
        const h2 = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        if (h2) title = stripTags(h2[1]);
      }

      // Snippet
      const snipMatch = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
      let snippet = snipMatch ? stripTags(snipMatch[1]) : '';

      if (!title && !snippet) continue;
      if (!title) title = getDomain(finalUrl);

      results.push({
        title: title || getDomain(finalUrl),
        snippet: snippet || 'Visit official page for complete documentation and details.',
        url: finalUrl,
        domain: getDomain(finalUrl),
        source: getDomain(finalUrl)
      });
    }
  } catch (err) {
    // DDG HTML block fallback
  }
  return results;
}

async function searchWikipedia(query) {
  const results = [];
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=4`;
    const data = await fetchUrl(wikiUrl, { 'User-Agent': 'CuteChat-Search/2.0' });
    const json = JSON.parse(data);
    const list = json.query?.search || [];
    for (const item of list) {
      results.push({
        title: item.title,
        snippet: stripTags(item.snippet || ''),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
        domain: 'wikipedia.org',
        source: 'Wikipedia'
      });
    }
  } catch {}
  return results;
}

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const query = (req.query?.q || (new URL(req.url, 'http://localhost')).searchParams.get('q') || '').trim();

  if (!query) {
    res.status(400).json({ error: 'Missing search query parameter q', query: '', count: 0, results: [] });
    return;
  }

  try {
    // Run general web search and Wikipedia search concurrently
    const [webResults, wikiResults] = await Promise.allSettled([
      searchDuckDuckGo(query),
      searchWikipedia(query)
    ]);

    const combined = [];
    const seenUrls = new Set();

    // Prioritize top general web results from official sites
    if (webResults.status === 'fulfilled' && Array.isArray(webResults.value)) {
      for (const r of webResults.value) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          combined.push(r);
        }
      }
    }

    // Add relevant Wikipedia reference
    if (wikiResults.status === 'fulfilled' && Array.isArray(wikiResults.value)) {
      for (const r of wikiResults.value) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          combined.push(r);
        }
      }
    }

    res.status(200).json({
      query,
      count: combined.length,
      results: combined.slice(0, 8),
      provider: 'Multi-Source Public Web Search'
    });
  } catch (err) {
    res.status(500).json({
      error: 'Web search error: ' + err.message,
      query,
      count: 0,
      results: []
    });
  }
};
