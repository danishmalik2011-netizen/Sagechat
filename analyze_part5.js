// analyze_part5.js — extracts bare identifiers from Part 5 of app.js
// and filters out locals + built-ins, leaving those that must come from CC.
const fs = require('fs');

const part5 = fs.readFileSync('part5.js', 'utf8');

// Step 1: strip comments and strings to avoid false positives.
function strip(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    // line comment
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // block comment
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // strings
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += ' ';
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
          // template substitution — recurse so identifiers inside ${...} are kept
          i += 2;
          let depth = 1;
          let sub = '';
          while (i < n && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
            sub += src[i++];
          }
          out += strip(sub);
          continue;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const stripped = strip(part5);

// Step 2: collect identifiers.
const idRe = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const allIds = new Set();
let m;
while ((m = idRe.exec(stripped)) !== null) allIds.add(m[0]);

// Step 3: build definedHere from declarations in Part 5.
//    function NAME(...)
//    const|let|var NAME = ...
//    class NAME
const defRe = /\b(function\s+([A-Za-z_$][A-Za-z0-9_$]*)|(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)|class\s+([A-Za-z_$][A-Za-z0-9_$]*))/g;
const definedHere = new Set();
let dm;
while ((dm = defRe.exec(stripped)) !== null) {
  const name = dm[2] || dm[3] || dm[4];
  definedHere.add(name);
}

// Also pick up destructured names: const { a, b: c, ... } = ...
const destrRe = /\b(?:const|let|var)\s*\{([^}]+)\}\s*=/g;
let dd;
while ((dd = destrRe.exec(stripped)) !== null) {
  const inner = dd[1];
  // split on commas
  for (const part of inner.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // skip "name: alias" — the local binding is alias
    const colon = trimmed.indexOf(':');
    const name = colon >= 0 ? trimmed.slice(colon + 1).trim() : trimmed;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) definedHere.add(name);
  }
}

// Step 4: built-ins to skip.
const builtins = new Set([
  'document','window','localStorage','sessionStorage','setTimeout','clearTimeout',
  'setInterval','clearInterval','console','JSON','Math','Date','Array','Object','String',
  'Number','Boolean','Promise','Error','RegExp','Map','Set','WeakMap','WeakSet',
  'URL','URLSearchParams','fetch','requestAnimationFrame','cancelAnimationFrame',
  'crypto','navigator','history','location','alert','confirm','prompt',
  'File','FileReader','Blob','FormData','Event','MouseEvent','KeyboardEvent',
  'InputEvent','HTMLElement','Node','Element','parseFloat','parseInt','isNaN',
  'isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI',
  'Symbol','BigInt','Infinity','NaN','undefined','null','true','false',
  'require','module','exports','globalThis','self','top','parent',
  'parseFloat','parseInt','getComputedStyle','setAttribute','getAttribute',
  'queueMicrotask','structuredClone','atob','btoa',
  'Stop','Continue','Break',
  'AbortController','PromiseRejectionEvent','SpeechRecognitionEvent',
  'webkitSpeechRecognition','SpeechRecognition','AnimationEvent',
  'DragEvent','ClipboardEvent','TouchEvent','WheelEvent',
  'CustomEvent','UIEvent','MessageEvent','ErrorEvent','ProgressEvent',
  'FileList','DataTransfer','MutationObserver','IntersectionObserver',
  'ResizeObserver','PerformanceObserver','BroadcastChannel','XMLHttpRequest',
  'Headers','Request','Response','ReadableStream','WritableStream',
  'TransformStream','TextEncoder','TextDecoder',
]);

// Step 5: filter.
const used = new Set();
for (const id of allIds) {
  if (definedHere.has(id)) continue;
  if (builtins.has(id)) continue;
  used.add(id);
}

console.log('--- definedHere (', definedHere.size, ') ---');
console.log([...definedHere].sort().join(', '));
console.log('');
console.log('--- bare identifiers in Part 5 that need to come from CC or be globals (', used.size, ') ---');
console.log([...used].sort().join('\n'));