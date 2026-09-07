// Sage — cache-busting version bump.
// Usage:  node bump-version.js        (increment by 1)
//         node bump-version.js 12     (set an exact version)
// Rewrites the ?v= query in index.html, the CACHE_VERSION constant in sw.js,
// and version.json so deployed assets never serve from a stale cache.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const verFile = path.join(ROOT, 'version.json');
const indexFile = path.join(ROOT, 'index.html');
const swFile = path.join(ROOT, 'sw.js');

let current = 1;
try { current = JSON.parse(fs.readFileSync(verFile, 'utf8')).version || 1; } catch {}

const arg = process.argv[2];
const next = arg ? parseInt(arg, 10) : current + 1;
if (!Number.isFinite(next) || next < 1) {
  console.error('Usage: node bump-version.js [version]');
  process.exit(1);
}

let indexHtml = fs.readFileSync(indexFile, 'utf8');
indexHtml = indexHtml.replace(/\?v=\d+/g, `?v=${next}`);
fs.writeFileSync(indexFile, indexHtml);

let sw = fs.readFileSync(swFile, 'utf8');
sw = sw.replace(/CACHE_VERSION = \d+/, `CACHE_VERSION = ${next}`);
fs.writeFileSync(swFile, sw);

fs.writeFileSync(verFile, JSON.stringify({ version: next }, null, 2) + '\n');
console.log(`Bumped cache version to v${next} (version.json, index.html, sw.js)`);