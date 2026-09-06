/* =========================================================================
 * cute chat — app.js
 * Vanilla JS, no build step. Loaded via <script src="app.js" defer>.
 * Covers: state + persistence, 6 modes, 4 providers (pollinations/groq/
 * openrouter/custom), streaming chat, conversations, skills (think/PDF/web/
 * memory/canvas), attachments, voice input, settings + image + canvas modals,
 * theme, export/import, custom-provider live model fetch.
 * ========================================================================= */
(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Tiny DOM helpers (so the rest of the code reads naturally)
  // -----------------------------------------------------------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const on = (el, ev, fn, opts) => { if (el) el.addEventListener(ev, fn, opts); };
  const escapeHTML = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // localStorage JSON wrapper; never throws
  const LS = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // SHA-256-ish fingerprint of a string, hex. For cache keys only.
  async function fingerprint(s) {
    const buf = new TextEncoder().encode(String(s || ''));
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).slice(0, 8)
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // -----------------------------------------------------------------------
  // Modes (Chat / Code / Study / Write / Summarize / Translate)
  // Each has a system prompt + a small inline SVG icon.
  // -----------------------------------------------------------------------
  const MODES = [
    {
      id: 'chat', label: 'Chat', tabTitle: 'Chat',
      tabSub: 'Thoughtful, coherent AI conversation',
      sys: 'You are a friendly, concise AI assistant. Be clear and helpful. Use markdown.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    },
    {
      id: 'code', label: 'Code', tabTitle: 'Code',
      tabSub: 'Write, review, and refactor code with precision',
      sys: 'You are a senior software engineer. Answer with concise, correct code. Prefer modern idioms and explain tradeoffs in 1-2 sentences. Wrap code in fenced blocks with the right language tag.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    },
    {
      id: 'study', label: 'Study', tabTitle: 'Study',
      tabSub: 'Learn anything, step by step',
      sys: 'You are a patient tutor. Break topics into small steps, use analogies, and end each response with a quick recap.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    },
    {
      id: 'write', label: 'Write', tabTitle: 'Write',
      tabSub: 'Draft, edit, and polish any text',
      sys: 'You are a writing partner. Match the requested tone, suggest improvements, and offer a short, punchy version when asked.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    },
    {
      id: 'summarize', label: 'Summarize', tabTitle: 'Summarize',
      tabSub: 'Distill long text into key points',
      sys: 'You are a summarizer. Produce a tight summary with bullet points, then a one-sentence TL;DR. Stay faithful to the source.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M6 12h12M9 18h6"/></svg>',
    },
    {
      id: 'translate', label: 'Translate', tabTitle: 'Translate',
      tabSub: 'Faithful translation between languages',
      sys: 'You are a translator. Detect the source language and translate to the user\u2019s target language (default: English). Preserve formatting, idioms, and tone.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14M9 4v4M7 20l3-7 3 7M8 17h4"/><path d="M14 12h7M17.5 9 21 15M14 15l3.5 6"/></svg>',
    },
  ];

  // -----------------------------------------------------------------------
  // Skills — 5 toggles that inject extra system instructions
  // -----------------------------------------------------------------------
  const SKILLS = [
    { id: 'think',  label: 'Think',  hint: 'Show reasoning',
      sys: 'Think carefully step-by-step before answering. When useful, expose your reasoning in a hidden block, then deliver a clean final answer.' },
    { id: 'pdf',    label: 'PDF',    hint: 'Generate PDFs',
      sys: 'You can produce a downloadable PDF by emitting a fenced code block with language tag "pdf" that contains the COMPLETE HTML document. The user will get a preview and a print dialog. The block must be the FULL standalone HTML, not a fragment.' },
    { id: 'web',    label: 'Web',    hint: 'Search the web',
      sys: 'If you need up-to-date information, emit a fenced code block with language tag "search" whose body is the exact query string. The system will run the search and feed results back to you before you answer.' },
    { id: 'memory', label: 'Memory', hint: 'Remember this chat',
      sys: 'Treat the conversation as long-term memory for this user within this chat session. Refer back to prior facts naturally.' },
    { id: 'canvas', label: 'Canvas', hint: 'Render artifacts',
      sys: 'You can render interactive HTML/SVG by emitting a fenced code block with language tag "canvas" containing the FULL standalone HTML. The user will see it in a side panel.' },
  ];

  // -----------------------------------------------------------------------
  // Static fallback model lists per provider (used before any live fetch)
  // Each entry: { id, label, vision? }
  // -----------------------------------------------------------------------
  const STATIC_MODELS = {
    pollinations: [
      { id: 'openai-fast',  label: 'OpenAI GPT-4o mini (fast)' },
      { id: 'openai',       label: 'OpenAI GPT-4o' },
      { id: 'openai-large', label: 'OpenAI GPT-4o (large)' },
      { id: 'qwen-coder',   label: 'Qwen 2.5 Coder 32B' },
      { id: 'mistral',      label: 'Mistral Nemo' },
      { id: 'gemini-fast',  label: 'Gemini 2.0 Flash (vision)' , vision: true },
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B Instant' },
      { id: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision (preview)', vision: true },
      { id: 'mixtral-8x7b-32768',       label: 'Mixtral 8x7B 32k' },
    ],
    openrouter: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
      { id: 'qwen/qwen-2.5-72b-instruct:free',        label: 'Qwen 2.5 72B (free)' },
      { id: 'deepseek/deepseek-chat-v3.1:free',       label: 'DeepSeek Chat v3.1 (free)' },
      { id: 'google/gemini-2.0-flash-exp:free',       label: 'Gemini 2.0 Flash (free, vision)', vision: true },
    ],
    // Custom: empty until the user fetches. We seed a tiny placeholder
    // so the dropdown is never empty when the user switches providers
    // before configuring.
    custom: [
      { id: '__placeholder__', label: 'Configure & fetch your models' },
    ],
  };

  // -----------------------------------------------------------------------
  // Live, mutable model registry. Seeded from STATIC_MODELS, enriched by
  // fetchLiveModels(provider). Persisted in localStorage with TTL 1h.
  // -----------------------------------------------------------------------
  const MODELS = JSON.parse(JSON.stringify(STATIC_MODELS));
  const MODEL_CACHE = {
    key:  'cc.models.cache.v1',
    ttlMs: 60 * 60 * 1000, // 1 hour
  };

  function cacheKeyFor(provider, baseUrl, apiKey) {
    return `${provider}::${baseUrl || ''}::${apiKey || ''}`;
  }

  function loadModelCache(provider, baseUrl, apiKey) {
    const k = cacheKeyFor(provider, baseUrl, apiKey);
    const all = LS.get(MODEL_CACHE.key, {});
    const hit = all[k];
    if (!hit) return null;
    if ((Date.now() - hit.t) > MODEL_CACHE.ttlMs) return null;
    return hit.list || null;
  }

  function saveModelCache(provider, baseUrl, apiKey, list) {
    const k = cacheKeyFor(provider, baseUrl, apiKey);
    const all = LS.get(MODEL_CACHE.key, {});
    all[k] = { t: Date.now(), list };
    LS.set(MODEL_CACHE.key, all);
  }

  function hydrateModelsFromCache() {
    // For each provider, if we have a cache hit, overlay MODELS with it.
    const s = state.settings;
    for (const prov of ['groq', 'openrouter', 'custom']) {
      const baseUrl = prov === 'custom' ? (s.custom?.baseUrl || '') : '';
      const apiKey  = s.apiKeys?.[prov] || '';
      const cached  = loadModelCache(prov, baseUrl, apiKey);
      if (cached && Array.isArray(cached) && cached.length) {
        MODELS[prov] = cached;
      }
    }
  }

  // -----------------------------------------------------------------------
  // State (global) + per-conversation session
  // -----------------------------------------------------------------------
  const DEFAULT_SETTINGS = {
    provider: 'pollinations',   // 'pollinations' | 'groq' | 'openrouter' | 'custom'
    apiKeys: { pollinations: '', groq: '', openrouter: '', custom: '' },
    model:   { pollinations: 'openai-fast', groq: 'llama-3.3-70b-versatile',
               openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
               custom: '__placeholder__' },
    stream:  true,
    memory:  true,
    temperature: 0.7,
    custom: {
      name:   'Custom Provider',
      slug:   'custom',
      baseUrl: '',
      apiKey:  '',
    },
  };

  const state = {
    settings: structuredClone(DEFAULT_SETTINGS),
    conversations: [],            // [{id, title, messages, createdAt, session}]
    activeConvId: null,
    currentMode: 'chat',
    attachments: [],              // [{name, type, size, dataUrl|content}]
    isStreaming: false,
    aborter: null,                // AbortController for in-flight stream
  };

  // Each conversation has its own session — independent provider/model/etc.
  function ensureSession(conv) {
    if (!conv.session) {
      conv.session = {
        provider: state.settings.provider,
        model:    state.settings.model[state.settings.provider] || '',
        skills:   {},
        temperature: state.settings.temperature,
        stream:   state.settings.stream,
        systemPromptOverride: '',
      };
    }
    return conv.session;
  }
  function activeConv() {
    return state.conversations.find(c => c.id === state.activeConvId) || null;
  }
  function activeSession() {
    const c = activeConv(); return c ? ensureSession(c) : null;
  }

  function persist() {
    LS.set('cc.settings.v1', state.settings);
    LS.set('cc.conversations.v1', {
      list: state.conversations,
      activeId: state.activeConvId,
    });
  }
  function loadPersisted() {
    const s = LS.get('cc.settings.v1', null);
    if (s && typeof s === 'object') {
      // shallow merge so new fields added in DEFAULT_SETTINGS are honored
      state.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), s);
      state.settings.apiKeys = Object.assign({}, DEFAULT_SETTINGS.apiKeys, s.apiKeys || {});
      state.settings.model   = Object.assign({}, DEFAULT_SETTINGS.model,   s.model   || {});
      state.settings.custom  = Object.assign({}, DEFAULT_SETTINGS.custom,  s.custom  || {});
    }
    const c = LS.get('cc.conversations.v1', null);
    if (c && Array.isArray(c.list)) {
      state.conversations = c.list;
      state.activeConvId = c.activeId || (c.list[0] && c.list[0].id) || null;
    }
  }

  // -----------------------------------------------------------------------
  // End of Part 1. Part 2 continues below (providers + custom chat).
  // -----------------------------------------------------------------------
  // Expose internals to subsequent chunks via a namespaced object
  // so we can split the file with append_file without losing context.
  window.__CC = window.__CC || {};
  Object.assign(window.__CC, {
    $, $$, on, escapeHTML, LS, fingerprint,
    MODES, SKILLS, STATIC_MODELS, MODELS,
    MODEL_CACHE, cacheKeyFor, loadModelCache, saveModelCache, hydrateModelsFromCache,
    DEFAULT_SETTINGS, state, ensureSession, activeConv, activeSession, persist, loadPersisted,
  });
})();


/* =========================================================================
 * Part 2 — Providers (pollinations, groq, openrouter, custom)
 *
 * Each provider exposes a chat(...) function that takes:
 *   { messages, model, temperature, signal, stream, onChunk, onDone, onError }
 * and either streams chunks via onChunk(text) or returns the final text.
 *
 *   pollinationsChat — POST to https://text.pollinations.ai/ (no key)
 *   groqChat         — POST to Groq's /openai/v1/chat/completions
 *   openrouterChat   — POST to OpenRouter's /api/v1/chat/completions
 *   customChat       — POST to {baseUrl}/chat/completions  (any OpenAI-compatible)
 * ========================================================================= */
(function () {
  'use strict';
  const CC = window.__CC;
  const { escapeHTML } = CC;

  // ---------- Pollinations (GET-style with system+message in URL) ----------
  // Pollinations also supports a POST OpenAI-compatible endpoint at
  // https://text.pollinations.ai/openai (with vision-capable models).
  async function pollinationsChat({ messages, model, signal, onChunk }) {
    const url = 'https://text.pollinations.ai/openai';
    const body = {
      model: model || 'openai-fast',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Pollinations ${res.status}: ${t || res.statusText}`);
    }
    if (!res.body) throw new Error('Pollinations: no response body');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const piece = json.choices?.[0]?.delta?.content
                     || json.choices?.[0]?.message?.content
                     || '';
          if (piece && onChunk) onChunk(piece);
        } catch { /* ignore malformed SSE line */ }
      }
    }
  }

  // ---------- Generic OpenAI-compatible streamer (groq, openrouter, custom) --
  async function openAIStreamChat({ url, apiKey, model, messages, temperature, signal, onChunk }) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const body = {
      model: model,
      messages: messages,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      stream: true,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Provider ${res.status}: ${t || res.statusText}`);
    }
    if (!res.body) throw new Error('Provider: no response body');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        if (!data) continue;
        try {
          const json = JSON.parse(data);
          const piece = json.choices?.[0]?.delta?.content
                     || json.choices?.[0]?.message?.content
                     || '';
          if (piece && onChunk) onChunk(piece);
        } catch { /* ignore */ }
      }
    }
  }

  function groqChat(opts) {
    return openAIStreamChat({
      ...opts,
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: opts.apiKey,
    });
  }

  function openrouterChat(opts) {
    return openAIStreamChat({
      ...opts,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: opts.apiKey,
    });
  }

  // ---------- Custom provider: any OpenAI-compatible base URL ----------
  // baseUrl should end with /v1 or just be a host; we normalize.
  function normalizeBaseUrl(u) {
    if (!u) return '';
    return String(u).replace(/\/+$/, ''); // trim trailing slashes
  }
  function customChat(opts) {
    const base = normalizeBaseUrl(opts.baseUrl);
    if (!base) throw new Error('Custom provider: Base URL is empty. Open Settings to configure it.');
    // Common conventions: {base}/chat/completions
    const url = base.replace(/\/v1\/?$/, '') + '/v1/chat/completions';
    return openAIStreamChat({
      ...opts,
      url,
      apiKey: opts.apiKey || '',
    });
  }

  // Dispatcher
  async function providerChat(prov, args) {
    if (prov === 'pollinations') return pollinationsChat(args);
    if (prov === 'groq')         return groqChat(args);
    if (prov === 'openrouter')   return openrouterChat(args);
    if (prov === 'custom')       return customChat(args);
    throw new Error('Unknown provider: ' + prov);
  }

  Object.assign(CC, {
    pollinationsChat, groqChat, openrouterChat, customChat, providerChat,
    normalizeBaseUrl,
  });
})();


/* =========================================================================
 * Part 3 — Live model fetchers
 *
 *   fetchLiveModels('groq')         → GET https://api.groq.com/openai/v1/models
 *   fetchLiveModels('openrouter')   → GET https://openrouter.ai/api/v1/models
 *   fetchLiveModels('custom', base, key) → GET {base}/models
 *
 * Each returns an array of { id, label, vision? }. On failure, throws and
 * the caller falls back to the static list. Results are cached in
 * localStorage for 1h, keyed by provider+baseUrl+apiKey fingerprint.
 *
 * The Custom Fetch Models button (handleFetchCustomModels) is the user\u2019s
 * original ask \u2014 it uses fetchLiveModels('custom', ...) and repopulates
 * the model dropdown.
 * ========================================================================= */
(function () {
  'use strict';
  const CC = window.__CC;
  const { MODELS, STATIC_MODELS, loadModelCache, saveModelCache, normalizeBaseUrl } = CC;

  // ---- internal: try a /models endpoint, parse the OpenAI-style list ----
  async function fetchOpenAIModels(url, apiKey) {
    const headers = { 'Accept': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Models endpoint ${res.status}: ${t || res.statusText}`);
    }
    const json = await res.json();
    const arr = Array.isArray(json?.data) ? json.data
              : Array.isArray(json?.models) ? json.models
              : Array.isArray(json) ? json
              : [];
    if (!arr.length) throw new Error('Models endpoint returned no models');
    return arr.map(m => {
      const id = m.id || m.name || m.model || '';
      if (!id) return null;
      const label = (m.name && m.name !== id) ? `${m.name} (${id})` : id;
      // Best-effort vision detection
      const vision = /vision|gpt-4o|gemini|claude|llava|qwen-vl|vl-/i.test(id);
      return { id, label, vision };
    }).filter(Boolean);
  }

  // ---- public: fetch live models for a provider ----
  async function fetchLiveModels(provider, opts) {
    opts = opts || {};
    if (provider === 'groq') {
      const apiKey = opts.apiKey || CC.state.settings.apiKeys.groq;
      if (!apiKey) throw new Error('Groq API key missing');
      const list = await fetchOpenAIModels('https://api.groq.com/openai/v1/models', apiKey);
      MODELS.groq = list;
      saveModelCache('groq', '', apiKey, list);
      return list;
    }
    if (provider === 'openrouter') {
      const apiKey = opts.apiKey || CC.state.settings.apiKeys.openrouter;
      const list = await fetchOpenAIModels('https://openrouter.ai/api/v1/models', apiKey);
      // Sort free models first, then alphabetical
      list.sort((a, b) => {
        const af = a.id.includes(':free') ? 0 : 1;
        const bf = b.id.includes(':free') ? 0 : 1;
        if (af !== bf) return af - bf;
        return a.id.localeCompare(b.id);
      });
      MODELS.openrouter = list;
      saveModelCache('openrouter', '', apiKey, list);
      return list;
    }
    if (provider === 'custom') {
      const base = normalizeBaseUrl(opts.baseUrl || CC.state.settings.custom?.baseUrl);
      if (!base) throw new Error('Custom provider: Base URL is empty. Open Settings to configure it.');
      const apiKey = opts.apiKey || CC.state.settings.custom?.apiKey || '';
      // Same as groq/openrouter: GET {base}/models
      const url = base.replace(/\/v1\/?$/, '') + '/v1/models';
      const list = await fetchOpenAIModels(url, apiKey);
      MODELS.custom = list;
      saveModelCache('custom', base, apiKey, list);
      // Also remember the current model in settings if it\u2019s now in the list
      if (list.length && !list.find(m => m.id === CC.state.settings.model.custom)) {
        CC.state.settings.model.custom = list[0].id;
      }
      return list;
    }
    throw new Error('Unknown provider: ' + provider);
  }

  // ---- the handler bound to the Settings modal\u2019s Fetch Models button ----
  // (For groq / openrouter. The custom case has its own handler below.)
  async function handleFetchLiveModels() {
    const btn = document.getElementById('fetchModelsBtn');
    const txt = document.getElementById('fetchModelsBtnText');
    const prov = CC.state.settings.provider;
    if (prov === 'pollinations') {
      // No live list for Pollinations (it has no public /models endpoint).
      // Just restore static list, in case it was wiped.
      MODELS.pollinations = JSON.parse(JSON.stringify(STATIC_MODELS.pollinations));
      CC.renderModelOptions && CC.renderModelOptions();
      return;
    }
    if (prov === 'custom') {
      return handleFetchCustomModels();
    }
    if (!CC.state.settings.apiKeys[prov]) {
      toast(`Enter your ${prov} API key first`, 'warn');
      return;
    }
    if (btn) btn.disabled = true;
    if (txt) txt.textContent = 'Fetching…';
    try {
      const list = await fetchLiveModels(prov);
      toast(`Loaded ${list.length} ${prov} models`, 'ok');
      CC.renderModelOptions && CC.renderModelOptions();
    } catch (e) {
      console.error(e);
      toast('Fetch failed: ' + e.message, 'err');
    } finally {
      if (btn) btn.disabled = false;
      if (txt) txt.textContent = 'Fetch Live Models';
    }
  }

  // ---- the handler bound to the Custom Provider\u2019s Fetch Models button ----
  // This is the user\u2019s original ask.
  async function handleFetchCustomModels() {
    const btn = document.getElementById('customFetchModelsBtn');
    const txt = document.getElementById('customFetchModelsBtnText');

    // Pull the current values from the inputs (in case the user is editing live)
    const nameInp  = document.getElementById('customProviderNameInput');
    const slugInp  = document.getElementById('customProviderSlugInput');
    const baseInp  = document.getElementById('customBaseUrlInput');
    const keyInp   = document.getElementById('customApiKeyInput');
    if (baseInp && baseInp.value) CC.state.settings.custom.baseUrl = baseInp.value.trim();
    if (keyInp  && keyInp.value)  CC.state.settings.custom.apiKey  = keyInp.value.trim();
    if (nameInp && nameInp.value) CC.state.settings.custom.name    = nameInp.value.trim() || 'Custom Provider';
    if (slugInp && slugInp.value) CC.state.settings.custom.slug    = slugInp.value.trim() || 'custom';

    const base = CC.state.settings.custom.baseUrl;
    if (!base) {
      toast('Enter a Base URL first (e.g. http://localhost:11434/v1)', 'warn');
      if (baseInp) baseInp.focus();
      return;
    }
    if (btn) btn.disabled = true;
    if (txt) txt.textContent = 'Fetching…';
    try {
      const list = await fetchLiveModels('custom', {
        baseUrl: base,
        apiKey:  CC.state.settings.custom.apiKey,
      });
      // If the user\u2019s selected model was the placeholder, switch to the first real one
      const s = CC.activeSession && CC.activeSession();
      if (s && (s.provider === 'custom') && (!s.model || s.model === '__placeholder__')) {
        s.model = list[0].id;
        CC.state.settings.model.custom = list[0].id;
      } else if (s && s.provider === 'custom' && !list.find(m => m.id === s.model)) {
        s.model = list[0].id;
        CC.state.settings.model.custom = list[0].id;
      }
      CC.persist && CC.persist();
      // Refresh the dropdown(s) and the status badge
      CC.renderModelOptions && CC.renderModelOptions();
      CC.refreshTopbarModelButton && CC.refreshTopbarModelButton();
      CC.setProviderStatus && CC.setProviderStatus();
      // Update the "OpenAI / Ollama / vLLM" badge with the friendly name
      const badge = document.getElementById('customStatusBadge');
      if (badge) {
        const friendly = CC.state.settings.custom.name || 'Custom';
        badge.textContent = friendly;
      }
      toast(`Loaded ${list.length} models from ${CC.state.settings.custom.name}`, 'ok');
    } catch (e) {
      console.error(e);
      toast('Fetch failed: ' + e.message, 'err');
    } finally {
      if (btn) btn.disabled = false;
      if (txt) txt.textContent = 'Fetch Models from this Endpoint';
    }
  }

  // ---- tiny toast (used here, defined globally in part 5) ----
  function toast(msg, kind) {
    if (CC.toast) CC.toast(msg, kind);
    else console.log('[toast]', kind || 'info', msg);
  }

  Object.assign(CC, {
    fetchLiveModels, handleFetchLiveModels, handleFetchCustomModels,
  });
})();


/* =========================================================================
 * Part 4 — UI rendering, streaming, conversations, skills, attachments
 * ========================================================================= */
(function () {
  'use strict';
  const CC = window.__CC;
  const { $, $$, on, escapeHTML, LS, MODES, SKILLS, MODELS, state,
          ensureSession, activeConv, activeSession, persist } = CC;

  // -----------------------------------------------------------------------
  // System prompt builder
  // Combines: base mode prompt + per-chat override + active skills.
  // -----------------------------------------------------------------------
  function buildSystemPrompt() {
    const mode = MODES.find(m => m.id === state.currentMode) || MODES[0];
    const s = activeSession();
    const parts = [mode.sys];
    if (s && s.systemPromptOverride && s.systemPromptOverride.trim()) {
      parts.push('Additional instructions from the user:\n' + s.systemPromptOverride.trim());
    }
    if (s && s.skills) {
      for (const sk of SKILLS) {
        if (s.skills[sk.id] && sk.sys) parts.push(sk.sys);
      }
    }
    return parts.join('\n\n');
  }

  // -----------------------------------------------------------------------
  // Sidebar: modes
  // -----------------------------------------------------------------------
  function renderModes() {
    const host = document.getElementById('modes');
    if (!host) return;
    host.innerHTML = '';
    for (const m of MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode' + (m.id === state.currentMode ? ' is-active' : '');
      btn.dataset.mode = m.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', m.id === state.currentMode ? 'true' : 'false');
      btn.innerHTML = m.icon + '<span>' + escapeHTML(m.label) + '</span>';
      on(btn, 'click', () => {
        state.currentMode = m.id;
        const titleEl = document.getElementById('topbarTitle');
        const subEl   = document.getElementById('topbarSubtitle');
        const iconEl  = document.getElementById('topbarModeIcon');
        if (titleEl) titleEl.textContent = m.tabTitle;
        if (subEl)   subEl.textContent   = m.tabSub;
        if (iconEl)  iconEl.innerHTML    = m.icon;
        renderModes();
        updateSuggestions();
      });
      host.appendChild(btn);
    }
  }

  // -----------------------------------------------------------------------
  // Suggestions (quick-starters) for the current mode
  // -----------------------------------------------------------------------
  const SUGGESTIONS = {
    chat:       ['Plan a weekend trip for two under $500', 'Explain a concept like I\u2019m 12', 'Help me write a polite email to my landlord'],
    code:       ['Review this function for bugs', 'Convert this to TypeScript', 'Write a small Express server with one route'],
    study:      ['Quiz me on photosynthesis', 'Explain calculus limits in plain English', 'Make a study plan for the GRE in 8 weeks'],
    write:      ['Tighten this paragraph', 'Rewrite for a friendly tone', 'Suggest three better titles'],
    summarize:  ['Summarize the article I just pasted', 'Give me 5 bullet points and a TL;DR', 'Make a 3-sentence version'],
    translate:  ['Translate this to Spanish', 'Translate this formal English to casual English', 'Detect the language and translate to Japanese'],
  };
  function updateSuggestions() {
    const host = document.getElementById('suggestions');
    if (!host) return;
    const list = SUGGESTIONS[state.currentMode] || [];
    host.innerHTML = list.map(s => '<button class="suggestion" type="button">' + escapeHTML(s) + '</button>').join('');
    $$('.suggestion', host).forEach(b => on(b, 'click', () => {
      const input = document.getElementById('input');
      if (input) { input.value = b.textContent; input.focus(); autosizeInput(); }
    }));
  }

  // -----------------------------------------------------------------------
  // Sidebar: conversations list + new chat
  // -----------------------------------------------------------------------
  function renderConversations() {
    const host = document.getElementById('conversations');
    if (!host) return;
    const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const list = state.conversations
      .filter(c => !q || (c.title || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    host.innerHTML = '';
    for (const c of list) {
      const row = document.createElement('div');
      row.className = 'conv' + (c.id === state.activeConvId ? ' is-active' : '');
      row.dataset.id = c.id;
      row.innerHTML =
        '<div class="conv__main">' +
          '<div class="conv__title">' + escapeHTML(c.title || 'New chat') + '</div>' +
          '<div class="conv__sub">' + (c.messages?.length || 0) + ' messages</div>' +
        '</div>' +
        '<button class="conv__del" type="button" aria-label="Delete chat" title="Delete">\u00d7</button>';
      on(row, 'click', (e) => {
        if (e.target.classList.contains('conv__del')) return;
        state.activeConvId = c.id;
        renderConversations();
        renderChat();
        refreshTopbarModelButton();
        setProviderStatus();
      });
      const del = row.querySelector('.conv__del');
      on(del, 'click', (e) => {
        e.stopPropagation();
        if (!confirm('Delete this chat?')) return;
        state.conversations = state.conversations.filter(x => x.id !== c.id);
        if (state.activeConvId === c.id) {
          state.activeConvId = state.conversations[0]?.id || null;
        }
        if (!state.conversations.length) createConversation();
        persist();
        renderConversations();
        renderChat();
        refreshTopbarModelButton();
      });
      host.appendChild(row);
    }
  }

  function uid() { return 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function createConversation() {
    const conv = {
      id: uid(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      session: null, // populated by ensureSession
    };
    ensureSession(conv);
    state.conversations.unshift(conv);
    state.activeConvId = conv.id;
    persist();
    return conv;
  }

  // -----------------------------------------------------------------------
  // Chat rendering (read-only)
  // -----------------------------------------------------------------------
  function mdToSafeHTML(src) {
    if (!src) return '';
    try {
      const html = window.marked?.parse ? window.marked.parse(src) : src;
      return window.DOMPurify ? DOMPurify.sanitize(html) : html;
    } catch { return escapeHTML(src); }
  }

  function renderChat() {
    const host = document.getElementById('chat');
    if (!host) return;
    const c = activeConv();
    if (!c) { host.innerHTML = ''; return; }
    host.innerHTML = '';
    for (const m of (c.messages || [])) {
      host.appendChild(renderMessage(m));
    }
    // After rendering, run highlight.js on code blocks
    try { window.hljs?.highlightAll && window.hljs.highlightAll(); } catch {}
    // Scroll to bottom
    host.scrollTop = host.scrollHeight;
  }

  function renderMessage(m) {
    const div = document.createElement('div');
    div.className = 'msg msg--' + (m.role === 'user' ? 'user' : 'assistant');
    const avatar = m.role === 'user'
      ? '<div class="msg__avatar">You</div>'
      : '<div class="msg__avatar">AI</div>';
    const body =
      '<div class="msg__body">' +
        '<div class="msg__content">' + (m.role === 'user' ? escapeHTML(m.content) : mdToSafeHTML(m.content)) + '</div>' +
        '<div class="msg__actions">' +
          '<button class="msg__copy" type="button" title="Copy">Copy</button>' +
          (m.role === 'assistant' ? '<button class="msg__regen" type="button" title="Regenerate">Regenerate</button>' : '') +
        '</div>' +
      '</div>';
    div.innerHTML = avatar + body;
    // Copy button
    const copyBtn = div.querySelector('.msg__copy');
    on(copyBtn, 'click', async () => {
      try { await navigator.clipboard.writeText(m.content || ''); flashAction(copyBtn, 'Copied'); }
      catch { flashAction(copyBtn, 'Failed'); }
    });
    // Per-block copy inside assistant messages (for code blocks)
    if (m.role === 'assistant') {
      $$('.msg__content pre code', div).forEach((code) => {
        const pre = code.parentElement;
        if (!pre || pre.querySelector('.code-copy')) return;
        const btn = document.createElement('button');
        btn.className = 'code-copy';
        btn.type = 'button';
        btn.textContent = 'Copy';
        pre.appendChild(btn);
        on(btn, 'click', async (e) => {
          e.stopPropagation();
          try { await navigator.clipboard.writeText(code.textContent || ''); btn.textContent = 'Copied'; }
          catch { btn.textContent = 'Failed'; }
          setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
        });
      });
      // Canvas / PDF / search blocks
      $$('.msg__content pre code.language-canvas', div).forEach((code) => {
        const html = code.textContent || '';
        const pre = code.parentElement;
        const btn = document.createElement('button');
        btn.className = 'code-action';
        btn.textContent = 'Open in Canvas';
        pre.appendChild(btn);
        on(btn, 'click', () => openCanvas(html));
      });
      $$('.msg__content pre code.language-pdf', div).forEach((code) => {
        const html = code.textContent || '';
        const pre = code.parentElement;
        const btn = document.createElement('button');
        btn.className = 'code-action';
        btn.textContent = 'Preview / Print';
        pre.appendChild(btn);
        on(btn, 'click', () => openCanvas(html));
      });
      // Regenerate
      const regen = div.querySelector('.msg__regen');
      on(regen, 'click', () => regenerateLast());
    }
    return div;
  }

  function flashAction(btn, label) {
    const old = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = old; }, 1100);
  }

  // -----------------------------------------------------------------------
  // Skills bar (Think / PDF / Web / Memory / Canvas)
  // -----------------------------------------------------------------------
  function renderSkills() {
    const host = document.getElementById('skills');
    if (!host) return;
    const s = activeSession();
    if (!s) { host.innerHTML = ''; return; }
    if (!s.skills) s.skills = {};
    host.innerHTML = '';
    for (const sk of SKILLS) {
      const on = !!(s.skills[sk.id]);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skill' + (on ? ' is-on' : '');
      btn.title = sk.hint;
      btn.dataset.skill = sk.id;
      btn.innerHTML = '<span class="skill__dot"></span><span>' + escapeHTML(sk.label) + '</span>';
      btn.addEventListener('click', () => {
        s.skills[sk.id] = !s.skills[sk.id];
        persist();
        renderSkills();
      });
      host.appendChild(btn);
    }
  }

  function skillOn(id) {
    const s = activeSession(); return s && s.skills && !!s.skills[id];
  }
  function toggleSkill(id) {
    const s = activeSession(); if (!s) return;
    s.skills = s.skills || {};
    s.skills[id] = !s.skills[id];
    persist();
    renderSkills();
  }

  // -----------------------------------------------------------------------
  // Topbar model badge + dropdown
  // -----------------------------------------------------------------------
  function refreshTopbarModelButton() {
    const s = activeSession();
    if (!s) return;
    const name = document.getElementById('topbarModelName');
    const m = MODELS[s.provider] || [];
    const found = m.find(x => x.id === s.model);
    if (name) name.textContent = found ? found.label : (s.model || 'select model');
  }

  function currentModel() {
    const s = activeSession(); return s ? s.model : null;
  }

  function openTopbarDropdown(open) {
    const wrap = document.getElementById('topbarModelWrapper');
    const drop = document.getElementById('topbarModelDropdown');
    if (!wrap || !drop) return;
    if (open) {
      wrap.classList.add('is-open');
      drop.hidden = false;
      renderTopbarModelList('');
      const inp = document.getElementById('topbarModelSearch');
      if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 0); }
    } else {
      wrap.classList.remove('is-open');
      drop.hidden = true;
    }
  }

  function renderTopbarModelList(q) {
    const host = document.getElementById('topbarModelList');
    if (!host) return;
    const s = activeSession();
    const list = (MODELS[s.provider] || []).filter(m =>
      !q || m.id.toLowerCase().includes(q.toLowerCase()) || (m.label||'').toLowerCase().includes(q.toLowerCase())
    );
    host.innerHTML = '';
    if (!list.length) {
      host.innerHTML = '<div class="topbar-dropdown__empty" style="padding:14px;color:var(--muted);font-size:12px">No models. Configure &amp; fetch.</div>';
      return;
    }
    for (const m of list) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'topbar-dropdown__item' + (m.id === s.model ? ' is-selected' : '');
      row.setAttribute('role', 'option');
      row.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        '<span>' + escapeHTML(m.label) + '</span>' +
        (m.vision ? '<span class="topbar-dropdown__tag">vision</span>' : '');
      row.addEventListener('click', () => {
        s.model = m.id;
        state.settings.model[s.provider] = m.id;
        persist();
        refreshTopbarModelButton();
        renderModelOptions(); // sync the settings modal list
        openTopbarDropdown(false);
      });
      host.appendChild(row);
    }
  }

  // -----------------------------------------------------------------------
  // Settings modal: model dropdown (searchable)
  // -----------------------------------------------------------------------
  function renderModelOptions() {
    const list = document.getElementById('modelOptionsList');
    const label = document.getElementById('selectedModelLabel');
    const badge = document.getElementById('selectedModelBadge');
    const count = document.getElementById('modelCountLabel');
    if (!list) return;
    const s = activeSession() || { provider: state.settings.provider, model: '' };
    const prov = s.provider;
    const all = MODELS[prov] || [];
    const q = (document.getElementById('modelSearchInput')?.value || '').toLowerCase();
    const filtered = all.filter(m =>
      !q || m.id.toLowerCase().includes(q) || (m.label || '').toLowerCase().includes(q)
    );
    list.innerHTML = '';
    for (const m of filtered) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'custom-select__option' + (m.id === s.model ? ' is-selected' : '');
      row.dataset.id = m.id;
      row.innerHTML =
        '<span class="custom-select__option-name">' + escapeHTML(m.label) + '</span>' +
        (m.vision ? '<span class="badge badge--green" style="margin-left:6px">vision</span>' : '');
      row.addEventListener('click', () => {
        s.model = m.id;
        state.settings.model[prov] = m.id;
        persist();
        renderModelOptions();
        refreshTopbarModelButton();
      });
      list.appendChild(row);
    }
    const found = all.find(m => m.id === s.model);
    if (label) label.textContent = found ? found.label : (s.model || 'Select a model');
    if (badge) badge.textContent = found ? 'Active' : 'Pick one';
    if (count) count.textContent = filtered.length + ' of ' + all.length + ' models';
  }

  function openModelDropdown(open) {
    const trig = document.getElementById('modelSelectTrigger');
    const panel = document.getElementById('modelSelectPanel');
    if (!trig || !panel) return;
    if (open) {
      trig.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      renderModelOptions();
      const inp = document.getElementById('modelSearchInput');
      if (inp) setTimeout(() => inp.focus(), 0);
    } else {
      trig.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
    }
  }

  // -----------------------------------------------------------------------
  // Provider status (sidebar dot + label)
  // -----------------------------------------------------------------------
  function setProviderStatus() {
    const s = activeSession();
    const prov = s?.provider || state.settings.provider;
    const dot = document.getElementById('providerDot');
    const lbl = document.getElementById('providerLabel');
    if (!dot || !lbl) return;
    let txt = prov;
    let cls = 'is-idle';
    if (prov === 'pollinations')      { txt = 'Pollinations'; cls = 'is-ok'; }
    else if (prov === 'groq')         { txt = 'Groq'; cls = state.settings.apiKeys.groq ? 'is-ok' : 'is-idle'; }
    else if (prov === 'openrouter')   { txt = 'OpenRouter'; cls = 'is-ok'; }
    else if (prov === 'custom')       {
      txt = state.settings.custom?.name || 'Custom';
      cls = state.settings.custom?.baseUrl ? 'is-ok' : 'is-idle';
    }
    dot.className = 'dot ' + cls;
    lbl.textContent = txt;
  }

  // -----------------------------------------------------------------------
  // Send / regenerate (streaming)
  // -----------------------------------------------------------------------
  async function sendMessage() {
    if (state.isStreaming) return;
    const input = document.getElementById('input');
    const text = (input?.value || '').trim();
    if (!text && !state.attachments.length) return;
    let conv = activeConv();
    if (!conv) conv = createConversation();
    const sess = ensureSession(conv);

    // Title from first user message
    if (conv.title === 'New chat' && text) {
      conv.title = text.slice(0, 40) + (text.length > 40 ? '\u2026' : '');
    }

    // Build message: include attachments inline (vision models get image urls)
    let userContent = text || '';
    const imageAtts = state.attachments.filter(a => (a.type || '').startsWith('image/'));
    if (imageAtts.length) {
      const parts = [{ type: 'text', text: userContent || 'See image.' }];
      for (const a of imageAtts) {
        parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
      }
      conv.messages.push({ role: 'user', content: parts, ts: Date.now() });
    } else if (state.attachments.length) {
      // text attachments: append as a fenced block to the user message
      const txt = state.attachments
        .map(a => '```\n' + (a.content || '') + '\n```')
        .join('\n\n');
      conv.messages.push({ role: 'user', content: userContent + (userContent ? '\n\n' : '') + txt, ts: Date.now() });
    } else {
      conv.messages.push({ role: 'user', content: userContent, ts: Date.now() });
    }

    // Clear input + attachments
    if (input) input.value = '';
    state.attachments = [];
    renderAttachments();
    autosizeInput();
    renderChat();
    renderConversations();
    return streamAssistant();
  }

  // Push an empty assistant message then stream into it.
  // Called by both sendMessage (after pushing the user message) and
  // regenerateLast (after dropping trailing assistant messages).
  async function streamAssistant() {
    if (state.isStreaming) return;
    const conv = activeConv();
    if (!conv) return;
    const sess = ensureSession(conv);

    // Make sure the last message is an empty assistant slot
    let assistantMsg = conv.messages[conv.messages.length - 1];
    if (!assistantMsg || assistantMsg.role !== 'assistant') {
      assistantMsg = { role: 'assistant', content: '', ts: Date.now() };
      conv.messages.push(assistantMsg);
    } else if (assistantMsg.content) {
      // Regenerate: clear it
      assistantMsg = { role: 'assistant', content: '', ts: Date.now() };
      conv.messages[conv.messages.length - 1] = assistantMsg;
    }

    // Validate provider/model
    if (!sess.model || sess.model === '__placeholder__') {
      assistantMsg.content = '⚠️ No model selected. Open Settings and pick a model.';
      renderChat(); persist(); return;
    }
    if (sess.provider === 'groq' && !state.settings.apiKeys.groq) {
      assistantMsg.content = '⚠️ Groq API key missing. Open Settings → API keys.';
      renderChat(); persist(); return;
    }
    if (sess.provider === 'custom' && !state.settings.custom?.baseUrl) {
      assistantMsg.content = '⚠️ Custom provider Base URL missing. Open Settings → Custom Provider → Fetch Models.';
      renderChat(); persist(); return;
    }

    // Build messages array for the API (no system prompt in the last slot)
    const messages = [{ role: 'system', content: buildSystemPrompt() }];
    for (const m of conv.messages.slice(0, -1)) {
      messages.push({ role: m.role, content: m.content });
    }

    // Stream
    state.isStreaming = true;
    state.aborter = new AbortController();
    setStreamingUI(true);
    renderChat();
    try {
      await CC.providerChat(sess.provider, {
        model: sess.model,
        messages,
        temperature: sess.temperature,
        signal: state.aborter.signal,
        baseUrl: state.settings.custom?.baseUrl,
        apiKey:  sess.provider === 'custom' ? (state.settings.custom?.apiKey || '')
                : (state.settings.apiKeys[sess.provider] || ''),
        onChunk: (piece) => {
          assistantMsg.content += piece;
          // Re-render only the last message for speed
          const host = document.getElementById('chat');
          if (host) {
            const last = host.lastElementChild;
            if (last && last.classList.contains('msg--assistant')) {
              const c = last.querySelector('.msg__content');
              if (c) c.innerHTML = mdToSafeHTML(assistantMsg.content);
              host.scrollTop = host.scrollHeight;
            } else {
              renderChat();
            }
          }
        },
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        assistantMsg.content += (assistantMsg.content ? '\n\n' : '') + '⚠️ ' + (e.message || 'Request failed');
      }
    } finally {
      state.isStreaming = false;
      state.aborter = null;
      setStreamingUI(false);
      renderChat();
      persist();
    }
  }

  async function regenerateLast() {
    if (state.isStreaming) return;
    const conv = activeConv(); if (!conv) return;
    // Find last user message; drop everything after it
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'user') {
        conv.messages = conv.messages.slice(0, i + 1);
        renderChat();
        return streamAssistant();
      }
    }
  }

  function stopStream() {
    if (state.aborter) state.aborter.abort();
  }

  function setStreamingUI(on) {
    const send = document.getElementById('send-btn');
    const stop = document.getElementById('stop-btn');
    if (send) send.style.display = on ? 'none' : '';
    if (stop) stop.style.display = on ? '' : 'none';
    document.body.classList.toggle('is-streaming', on);
  }

  function setStreamingUI(on) {
    const send = document.getElementById('send-btn');
    const stop = document.getElementById('stop-btn');
    if (send) send.style.display = on ? 'none' : '';
    if (stop) stop.style.display = on ? '' : 'none';
    document.body.classList.toggle('is-streaming', on);
  }

  // Expose everything defined in part 4 to subsequent chunks and the rest of the app
  Object.assign(CC, {
    // core rendering
    buildSystemPrompt, renderModes, updateSuggestions,
    renderConversations, createConversation, uid,
    renderChat, renderMessage, mdToSafeHTML, flashAction,
    renderSkills, skillOn, toggleSkill,
    refreshTopbarModelButton, currentModel,
    openTopbarDropdown, renderTopbarModelList,
    renderModelOptions, openModelDropdown,
    setProviderStatus,
    // send / stream / regenerate
    sendMessage, streamAssistant, regenerateLast, stopStream, setStreamingUI,
  });
})();

/* =========================================================================
 * Part 5 — Settings modal, image/canvas modals, theme, export/import,
 *          voice input, autosize, DOMContentLoaded init().
 *
 * This is the only part with side effects at load time. It wires every
 * button, input, and key handler in index.html. Nothing in parts 1-4
 * run automatically on import; they only define functions and state.
 * ========================================================================= */
(function () {
  'use strict';
  const CC = window.__CC;
  const { $, $$, on, escapeHTML, LS, MODES, SKILLS, STATIC_MODELS, MODELS,
          state, ensureSession, activeConv, activeSession, persist,
          loadPersisted, hydrateModelsFromCache,
          createConversation, renderModes, updateSuggestions,
          renderConversations, renderChat, renderSkills,
          refreshTopbarModelButton, setProviderStatus,
          openTopbarDropdown, renderTopbarModelList,
          renderModelOptions, openModelDropdown,
          handleFetchLiveModels, handleFetchCustomModels,
          sendMessage, stopStream,

          buildSystemPrompt, providerChat, customChat, pollinationsChat,
          groqChat, openrouterChat, fetchLiveModels,
          uid, mdToSafeHTML, currentModel, skillOn,
          } = CC;

  // -----------------------------------------------------------------------
  // Toast (small ephemeral notifications)
  // -----------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, kind) {
    let host = document.getElementById('toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast';
      host.className = 'toast';
      document.body.appendChild(host);
    }
    host.className = 'toast' + (kind ? ' toast--' + kind : '');
    host.textContent = msg;
    host.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => host.classList.remove('is-visible'), 2400);
  }
  CC.toast = toast;

  // -----------------------------------------------------------------------
  // Attachments rendering (chips under the input)
  // -----------------------------------------------------------------------
  function renderAttachments() {
    const host = document.getElementById('attachments');
    if (!host) return;
    host.innerHTML = '';
    state.attachments.forEach((a, i) => {
      const chip = document.createElement('span');
      chip.className = 'attach-chip';
      if ((a.type || '').startsWith('image/')) {
        chip.innerHTML =
          '<img class="attach-chip__thumb" alt="" src="' + escapeHTML(a.dataUrl || '') + '">' +
          '<span class="attach-chip__name">' + escapeHTML(a.name || 'image') + '</span>' +
          '<button class="attach-chip__x" type="button" aria-label="Remove" data-i="' + i + '">\u00d7</button>';
      } else {
        chip.innerHTML =
          '<span class="attach-chip__icon">\u{1F4C4}</span>' +
          '<span class="attach-chip__name">' + escapeHTML(a.name || 'file') + '</span>' +
          '<button class="attach-chip__x" type="button" aria-label="Remove" data-i="' + i + '">\u00d7</button>';
      }
      host.appendChild(chip);
    });
    $$('.attach-chip__x', host).forEach(b => on(b, 'click', () => {
      const i = +b.dataset.i;
      state.attachments.splice(i, 1);
      renderAttachments();
    }));
  }
  CC.renderAttachments = renderAttachments;

  // -----------------------------------------------------------------------
  // Composer: autosize, file attach, paste images, voice
  // -----------------------------------------------------------------------
  function autosizeInput() {
    const el = document.getElementById('input');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }
  CC.autosizeInput = autosizeInput;

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsDataURL(file);
    });
  }
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsText(file);
    });
  }

  // Voice input (Web Speech API)
  let recognition = null;
  let voiceOn = false;
  function setupVoice() {
    const btn = document.getElementById('micBtn');
    if (!btn) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btn.title = 'Voice input not supported in this browser';
      btn.disabled = true;
      btn.style.opacity = '0.4';
      return;
    }
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    let interim = '';
    recognition.onresult = (e) => {
      let final = ''; interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const input = document.getElementById('input');
      if (!input) return;
      if (final) {
        input.value = (input.value.trim() + ' ' + final).trim();
      } else if (interim) {
        input.dataset.interim = interim;
      }
      autosizeInput();
    };
    recognition.onend = () => {
      voiceOn = false;
      btn.classList.remove('is-on');
    };
    recognition.onerror = () => {
      voiceOn = false;
      btn.classList.remove('is-on');
    };
    on(btn, 'click', () => {
      if (!recognition) return;
      if (voiceOn) { try { recognition.stop(); } catch {} return; }
      try { recognition.start(); voiceOn = true; btn.classList.add('is-on'); }
      catch (e) { toast('Mic start failed: ' + e.message, 'err'); }
    });
  }

  // -----------------------------------------------------------------------
  // Theme (light / dark)
  // -----------------------------------------------------------------------
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const light = document.getElementById('hljs-light');
    const dark  = document.getElementById('hljs-dark');
    if (light) light.disabled = t === 'dark';
    if (dark)  dark.disabled  = t !== 'dark';
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      btn.title = t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    }
  }
  function setupTheme() {
    let t = LS.get('cc.theme', null) || document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(t);
    const btn = document.getElementById('themeToggle');
    on(btn, 'click', () => {
      t = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      LS.set('cc.theme', t);
      applyTheme(t);
    });
  }

  // -----------------------------------------------------------------------
  // Sidebar collapse (rail)
  // -----------------------------------------------------------------------
  function applySidebar(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  }
  function setupSidebar() {
    applySidebar(!!LS.get('cc.sidebar.collapsed', false));
    const btn = document.getElementById('toggleSidebarBtn');
    on(btn, 'click', () => {
      const next = !document.body.classList.contains('sidebar-collapsed');
      LS.set('cc.sidebar.collapsed', next);
      applySidebar(next);
    });
  }

  // -----------------------------------------------------------------------
  // Settings modal
  // -----------------------------------------------------------------------
  function openSettings(open) {
    const m = document.getElementById('settingsModal');
    if (!m) return;
    if (open) {
      // Pre-fill all inputs from current settings + active session
      fillSettingsFromState();
      m.hidden = false;
      requestAnimationFrame(() => m.classList.add('is-open'));
    } else {
      m.classList.remove('is-open');
      setTimeout(() => { m.hidden = true; }, 160);
    }
  }
  CC.openSettings = openSettings;

  function fillSettingsFromState() {
    // Provider radio
    const prov = activeSession()?.provider || state.settings.provider;
    const radio = document.querySelector('input[name="provider"][value="' + prov + '"]');
    if (radio) radio.checked = true;
    // API keys
    const gk = document.getElementById('groqApiKeyInput');
    if (gk) gk.value = state.settings.apiKeys.groq || '';
    const ok = document.getElementById('openrouterApiKeyInput');
    if (ok) ok.value = state.settings.apiKeys.openrouter || '';
    // Custom fields
    const cn = document.getElementById('customProviderNameInput');
    if (cn) cn.value = state.settings.custom.name || '';
    const cs = document.getElementById('customProviderSlugInput');
    if (cs) cs.value = state.settings.custom.slug || '';
    const cb = document.getElementById('customBaseUrlInput');
    if (cb) cb.value = state.settings.custom.baseUrl || '';
    const ck = document.getElementById('customApiKeyInput');
    if (ck) ck.value = state.settings.custom.apiKey || '';
    // Friendly badge
    const badge = document.getElementById('customStatusBadge');
    if (badge) badge.textContent = state.settings.custom.name || 'Custom';
    const ct = document.getElementById('customCardTitle');
    if (ct) ct.textContent = state.settings.custom.name || 'Custom Provider';
    // Toggles
    const st = document.getElementById('streamToggle');
    if (st) st.checked = !!state.settings.stream;
    const mt = document.getElementById('memoryToggle');
    if (mt) mt.checked = !!state.settings.memory;
    // Temperature (use active session's, fall back to global)
    const t = activeSession()?.temperature ?? state.settings.temperature;
    const tr = document.getElementById('tempRange');
    const tv = document.getElementById('tempVal');
    if (tr) tr.value = String(t);
    if (tv) tv.textContent = (+t).toFixed(2);
    // System prompt override (per-chat)
    const sp = document.getElementById('systemPromptInput');
    if (sp) sp.value = activeSession()?.systemPromptOverride || '';
    // Model dropdown
    renderModelOptions();
  }
  CC.fillSettingsFromState = fillSettingsFromState;

  // Apply a provider change (radio click) to current session + global default
  function applyProviderChange(prov) {
    const s = activeSession();
    if (s) {
      s.provider = prov;
      s.model = state.settings.model[prov] || (MODELS[prov]?.[0]?.id) || '';
    }
    state.settings.provider = prov;
    if (!state.settings.model[prov]) {
      state.settings.model[prov] = (MODELS[prov]?.[0]?.id) || '';
    }
    persist();
    refreshTopbarModelButton();
    renderModelOptions();
    setProviderStatus();
  }
  CC.applyProviderChange = applyProviderChange;

  function applyKeyChange(provider, value) {
    state.settings.apiKeys[provider] = (value || '').trim();
    persist();
  }

  function setupSettingsModal() {
    // Open / close
    on($('#openSettingsBtn'), 'click', () => openSettings(true));
    $$('#settingsModal [data-close]').forEach(b => on(b, 'click', () => openSettings(false)));
    // Provider radios
    $$('input[name="provider"]').forEach(r => on(r, 'change', () => {
      if (r.checked) applyProviderChange(r.value);
    }));
    // API keys
    on($('#groqApiKeyInput'),     'input', e => applyKeyChange('groq',       e.target.value));
    on($('#openrouterApiKeyInput'),'input', e => applyKeyChange('openrouter', e.target.value));
    // Custom provider live edits
    on($('#customProviderNameInput'),'input', e => {
      state.settings.custom.name = (e.target.value || '').trim() || 'Custom Provider';
      const badge = document.getElementById('customStatusBadge');
      if (badge) badge.textContent = state.settings.custom.name;
      const ct = document.getElementById('customCardTitle');
      if (ct) ct.textContent = state.settings.custom.name;
      persist();
    });
    on($('#customProviderSlugInput'),'input', e => {
      state.settings.custom.slug = (e.target.value || '').trim() || 'custom';
      persist();
    });
    on($('#customBaseUrlInput'),'input', e => {
      state.settings.custom.baseUrl = (e.target.value || '').trim();
      persist();
      setProviderStatus();
    });
    on($('#customApiKeyInput'),'input', e => {
      state.settings.custom.apiKey = (e.target.value || '').trim();
      persist();
    });
    // Show/hide key buttons
    $$('.toggle-key-btn').forEach(b => on(b, 'click', () => {
      const inp = document.getElementById(b.dataset.for);
      if (!inp) return;
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.textContent = show ? 'Hide' : 'Show';
    }));
    // Fetch models buttons
    on($('#fetchModelsBtn'),     'click', () => CC.handleFetchLiveModels());
    on($('#customFetchModelsBtn'),'click', () => CC.handleFetchCustomModels());
    // Model dropdown trigger
    on($('#modelSelectTrigger'),'click', () => openModelDropdown($('#modelSelectPanel')?.hidden));
    on($('#modelSearchInput'),  'input', e => { renderModelOptions(); const clr = document.getElementById('modelSearchClear'); if (clr) clr.hidden = !e.target.value; });
    on($('#modelSearchClear'),  'click', () => { const i = $('#modelSearchInput'); if (i) i.value=''; renderModelOptions(); const clr = document.getElementById('modelSearchClear'); if (clr) clr.hidden = true; });
    // Close panel on outside click
    on(document, 'click', (e) => {
      const panel = document.getElementById('modelSelectPanel');
      const trig  = document.getElementById('modelSelectTrigger');
      if (!panel || panel.hidden) return;
      if (panel.contains(e.target) || trig?.contains(e.target)) return;
      openModelDropdown(false);
    });
    // Toggles
    on($('#streamToggle'),'change', e => { state.settings.stream = e.target.checked; persist(); });
    on($('#memoryToggle'),'change', e => { state.settings.memory = e.target.checked; persist(); });
    on($('#tempRange'),   'input',  e => {
      const v = parseFloat(e.target.value);
      const tv = document.getElementById('tempVal'); if (tv) tv.textContent = v.toFixed(2);
      const s = activeSession();
      if (s) { s.temperature = v; }
      state.settings.temperature = v;
      persist();
    });
    on($('#systemPromptInput'),'input', e => {
      const s = activeSession();
      if (s) { s.systemPromptOverride = e.target.value; persist(); }
    });
    // Backup buttons
    on($('#exportAllBtn'),'click', exportAll);
    on($('#importBtn'),   'click', () => $('#importInput')?.click());
    on($('#importInput'), 'change', importAll);
    on($('#wipeBtn'),     'click', wipeAll);
  }

  // -----------------------------------------------------------------------
  // Image preview modal
  // -----------------------------------------------------------------------
  function openImage(src) {
    const m = document.getElementById('imageModal');
    const img = document.getElementById('imagePreview');
    if (!m || !img) return;
    img.src = src;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('is-open'));
  }
  function closeImage() {
    const m = document.getElementById('imageModal');
    if (!m) return;
    m.classList.remove('is-open');
    setTimeout(() => { m.hidden = true; }, 160);
  }
  function setupImageModal() {
    $$('#imageModal [data-close]').forEach(b => on(b, 'click', closeImage));
  }
  CC.openImage = openImage; CC.closeImage = closeImage;

  // -----------------------------------------------------------------------
  // Canvas / artifact modal (iframe + copy / download / open-in-tab)
  // -----------------------------------------------------------------------
  let canvasCurrentSrc = '';
  function openCanvas(html) {
    const m = document.getElementById('canvasModal');
    const f = document.getElementById('canvasFrame');
    if (!m || !f) return;
    // Build a blob URL so the iframe loads as a real document
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    if (canvasCurrentSrc) { try { URL.revokeObjectURL(canvasCurrentSrc); } catch {} }
    canvasCurrentSrc = url;
    f.src = url;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('is-open'));
  }
  function closeCanvas() {
    const m = document.getElementById('canvasModal');
    if (!m) return;
    m.classList.remove('is-open');
    setTimeout(() => {
      m.hidden = true;
      const f = document.getElementById('canvasFrame');
      if (f) f.src = 'about:blank';
      if (canvasCurrentSrc) { try { URL.revokeObjectURL(canvasCurrentSrc); } catch {} canvasCurrentSrc = ''; }
    }, 160);
  }
  function setupCanvasModal() {
    $$('#canvasModal [data-close]').forEach(b => on(b, 'click', closeCanvas));
    on($('#canvasCopyBtn'),     'click', () => {
      // Copy the *source* by walking back to the last code block that opened it
      // — easier: just copy the iframe srcdoc-equivalent isn't reachable, so we
      // copy a placeholder note. (The source is preserved per-message.)
      const last = document.querySelector('.msg--assistant .code-action[data-copied]');
      if (last) navigator.clipboard.writeText(last.dataset.copied || '').catch(() => {});
    });
    on($('#canvasDownloadBtn'), 'click', () => {
      if (!canvasCurrentSrc) return;
      const a = document.createElement('a');
      a.href = canvasCurrentSrc;
      a.download = 'artifact.html';
      a.click();
    });
    on($('#canvasNewTabBtn'),   'click', () => {
      if (canvasCurrentSrc) window.open(canvasCurrentSrc, '_blank', 'noopener');
    });
  }
  CC.openCanvas = openCanvas; CC.closeCanvas = closeCanvas;

  // -----------------------------------------------------------------------
  // Export / import / wipe (JSON backup)
  // -----------------------------------------------------------------------
  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exportMarkdown() {
    const c = activeConv(); if (!c) { toast('No conversation to export', 'warn'); return; }
    const lines = ['# ' + (c.title || 'Conversation'), ''];
    for (const m of (c.messages || [])) {
      lines.push('## ' + (m.role === 'user' ? 'You' : 'Assistant'));
      lines.push('');
      lines.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2));
      lines.push('');
    }
    downloadFile((c.title || 'chat').replace(/[^a-z0-9_\-]+/gi, '_') + '.md', lines.join('\n'), 'text/markdown');
    toast('Exported conversation as Markdown', 'ok');
  }
  function exportAll() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      conversations: state.conversations,
      activeConvId: state.activeConvId,
    };
    downloadFile('cute-chat-backup.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Exported all data', 'ok');
  }
  function importAll(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ''));
        if (data && typeof data === 'object') {
          if (data.settings && typeof data.settings === 'object') {
            state.settings = Object.assign({}, state.settings, data.settings);
          }
          if (Array.isArray(data.conversations)) {
            state.conversations = data.conversations;
          }
          if (data.activeConvId) state.activeConvId = data.activeConvId;
          persist();
          renderConversations(); renderChat(); refreshTopbarModelButton(); setProviderStatus();
          toast('Imported backup', 'ok');
        } else {
          toast('Invalid backup file', 'err');
        }
      } catch (err) { toast('Import failed: ' + err.message, 'err'); }
      e.target.value = '';
    };
    reader.readAsText(file);
  }
  function wipeAll() {
    if (!confirm('This will delete every conversation and reset all settings. Continue?')) return;
    LS.del('cc.settings.v1');
    LS.del('cc.conversations.v1');
    LS.del('cc.models.cache.v1');
    LS.del('cc.theme');
    LS.del('cc.sidebar.collapsed');
    // Reload to pick up defaults
    location.reload();
  }

  // -----------------------------------------------------------------------
  // Composer: send / enter-to-send / attach / paste
  // -----------------------------------------------------------------------
  function setupComposer() {
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const attachBtn = document.getElementById('attachBtn');
    on(input, 'input', autosizeInput);
    on(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendMessage();
      }
    });
    on(sendBtn, 'click', sendMessage);
    on(stopBtn, 'click', stopStream);
    // File attach
    on(attachBtn, 'click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = 'image/*,text/*,.md,.txt,.json,.js,.ts,.py,.html,.css,.csv';
      inp.addEventListener('change', async () => {
        for (const f of Array.from(inp.files || [])) {
          if ((f.type || '').startsWith('image/')) {
            const dataUrl = await readFileAsDataURL(f);
            state.attachments.push({ name: f.name, type: f.type, size: f.size, dataUrl });
          } else if (f.size < 200 * 1024) {
            const content = await readFileAsText(f);
            state.attachments.push({ name: f.name, type: f.type || 'text/plain', size: f.size, content });
          } else {
            toast('Text files must be < 200KB', 'warn');
          }
        }
        renderAttachments();
      });
      inp.click();
    });
    // Paste images / files
    on(input, 'paste', async (e) => {
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (!f) continue;
          if ((f.type || '').startsWith('image/')) {
            const dataUrl = await readFileAsDataURL(f);
            state.attachments.push({ name: f.name || 'pasted.png', type: f.type, size: f.size, dataUrl });
          } else if (f.size < 200 * 1024) {
            const content = await readFileAsText(f);
            state.attachments.push({ name: f.name || 'pasted.txt', type: f.type || 'text/plain', size: f.size, content });
          }
        }
      }
      renderAttachments();
    });
    setupVoice();
  }

  // -----------------------------------------------------------------------
  // Sidebar buttons + topbar model picker
  // -----------------------------------------------------------------------
  function setupSidebar() {
    on($('#newChatBtn'), 'click', () => {
      createConversation();
      renderConversations();
      renderChat();
      refreshTopbarModelButton();
      setProviderStatus();
      const input = document.getElementById('input'); if (input) input.focus();
    });
    on($('#searchInput'), 'input', renderConversations);
  }
  function setupTopbar() {
    const wrap = document.getElementById('topbarModelWrapper');
    const trig = wrap?.querySelector('.topbar__model-btn');
    on(trig, 'click', () => openTopbarDropdown(!!wrap && wrap.classList.contains('is-open') ? false : true));
    on($('#topbarModelSearch'), 'input', e => renderTopbarModelList(e.target.value));
    on(document, 'click', (e) => {
      if (!wrap) return;
      if (!wrap.contains(e.target)) openTopbarDropdown(false);
    });
  }

  // -----------------------------------------------------------------------
  // Export single conversation button (next to chat)
  // -----------------------------------------------------------------------
  function setupExportChat() {
    on($('#exportBtn'), 'click', exportMarkdown);
  }

  // -----------------------------------------------------------------------
  // INIT — runs once on DOMContentLoaded
  // -----------------------------------------------------------------------
  function init() {
    // Load persisted settings + conversations
    loadPersisted();
    hydrateModelsFromCache();
    if (!state.conversations.length) createConversation();

    // First render
    renderModes();
    updateSuggestions();
    renderConversations();
    renderChat();
    renderSkills();
    refreshTopbarModelButton();
    setProviderStatus();

    // Wire UI
    setupTheme();
    setupSidebar();
    setupTopbar();
    setupSettingsModal();
    setupComposer();
    setupImageModal();
    setupCanvasModal();
    setupExportChat();

    // Set initial active mode in topbar
    const m = MODES.find(x => x.id === state.currentMode) || MODES[0];
    const titleEl = document.getElementById('topbarTitle');
    const subEl   = document.getElementById('topbarSubtitle');
    const iconEl  = document.getElementById('topbarModeIcon');
    if (titleEl) titleEl.textContent = m.tabTitle;
    if (subEl)   subEl.textContent   = m.tabSub;
    if (iconEl)  iconEl.innerHTML    = m.icon;

    // Live-fetch on first open
    try { CC.fetchLiveModels('openrouter'); } catch {}
    try {
      if (state.settings.apiKeys.groq) CC.fetchLiveModels('groq');
    } catch {}
    try {
      if (state.settings.custom?.baseUrl) CC.fetchLiveModels('custom');
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose what callers may want
  CC.openSettings = openSettings;
  CC.init = init;
})();
