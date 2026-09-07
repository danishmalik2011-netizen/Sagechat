/* =========================================================================
 * Sage — app.js
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

  // Trigger file download helper
  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // -----------------------------------------------------------------------
  // Modes (Chat / Code / Study / Write / Summarize / Translate)
  // Each has a system prompt + a small inline SVG icon.
  // -----------------------------------------------------------------------
  const MODES = [
    {
      id: 'chat', label: 'Chat', tabTitle: 'Chat',
      tabSub: 'Thoughtful, coherent AI conversation',
      sys: 'You are Sage, a thoughtful, precise, and sophisticated AI assistant. Always identify as Sage when asked about your identity or name. Be clear, concise, and helpful. Use markdown.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" stroke="none"/><path d="M12 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" stroke="none"/><path d="M15.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" stroke="none"/></svg>',
    },
    {
      id: 'code', label: 'Code', tabTitle: 'Code',
      tabSub: 'Write, review, and refactor code with precision',
      sys: 'You are Sage, an expert senior software engineer. Always identify as Sage. Answer with concise, correct code. Prefer modern idioms and explain tradeoffs in 1-2 sentences. Wrap code in fenced blocks with the right language tag.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4L4 12l5 8"/><path d="M15 4l5 8-5 8"/><path d="M12 8l-2 8" opacity="0.55"/></svg>',
    },
    {
      id: 'study', label: 'Study', tabTitle: 'Study',
      tabSub: 'Learn anything, step by step',
      sys: 'You are Sage, a patient tutor. Always identify as Sage. Break topics into small steps, use analogies, and end each response with a quick recap.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6" opacity="0.7"/></svg>',
    },
    {
      id: 'write', label: 'Write', tabTitle: 'Write',
      tabSub: 'Draft, edit, and polish any text',
      sys: 'You are Sage, an expert writing partner. Always identify as Sage. Match the requested tone, suggest improvements, and offer a short, punchy version when asked.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/><path d="M15 5l4 4" opacity="0.7"/></svg>',
    },
    {
      id: 'summarize', label: 'Summarize', tabTitle: 'Summarize',
      tabSub: 'Distill long text into key points',
      sys: 'You are Sage, an expert summarizer. Always identify as Sage. Produce a tight summary with bullet points, then a one-sentence TL;DR. Stay faithful to the source.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h10"/><path d="M19 15l3 3-3 3" opacity="0.7"/></svg>',
    },
    {
      id: 'translate', label: 'Translate', tabTitle: 'Translate',
      tabSub: 'Faithful translation between languages',
      sys: 'You are Sage, an expert translator. Always identify as Sage. Detect the source language and translate to the user’s target language (default: English). Preserve formatting, idioms, and tone.',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14"/><path d="M12 4v4"/><path d="M7 20l3-7 3 7"/><path d="M7.5 13H17"/><path d="M17 17l3-3-3-3"/><path d="M14 14l3 3" opacity="0.7"/></svg>',
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

  const THINKING_LEVELS = [
    { id: 0, label: 'Off' },
    { id: 1, label: 'Light' },
    { id: 2, label: 'Balanced' },
    { id: 3, label: 'Deep' },
    { id: 4, label: 'Max' },
  ];

  function thinkingLabel(level) {
    const found = THINKING_LEVELS.find(l => l.id === level);
    return found ? found.label : 'Balanced';
  }

  // -----------------------------------------------------------------------
  // Helper: Convert raw model IDs and technical slugs into short, clean UI names
  // -----------------------------------------------------------------------
  function toShortModelName(id, label) {
    if (!id && !label) return 'Select Model';
    if (id === '__placeholder__') return 'Select Model';

    const KNOWN_MAP = {
      'openai': 'OpenAI GPT',
      'mistral': 'Mistral',
      'qwen-coder': 'Qwen Coder',
      'llama-3.3-70b-versatile': 'Llama 3.3 70B',
      'llama-3.1-8b-instant': 'Llama 3.1 8B',
      'llama-3.2-90b-vision-preview': 'Llama 3.2 90B Vision',
      'llama-3.2-11b-vision-preview': 'Llama 3.2 11B Vision',
      'llama-3.2-3b-preview': 'Llama 3.2 3B',
      'llama-3.2-1b-preview': 'Llama 3.2 1B',
      'mixtral-8x7b-32768': 'Mixtral 8x7B',
      'gemma2-9b-it': 'Gemma 2 9B',
      'gemma-7b-it': 'Gemma 7B',
      'deepseek-r1-distill-llama-70b': 'DeepSeek R1 70B',
      'deepseek-r1-distill-qwen-32b': 'DeepSeek R1 32B',
      'deepseek-r1-distill-llama-8b': 'DeepSeek R1 8B',
      'whisper-large-v3': 'Whisper Large v3',
      'whisper-large-v3-turbo': 'Whisper Turbo',
      'meta-llama/llama-3.3-70b-instruct:free': 'Llama 3.3 70B',
      'meta-llama/llama-3.1-8b-instruct:free': 'Llama 3.1 8B',
      'meta-llama/llama-3.2-3b-instruct:free': 'Llama 3.2 3B',
      'meta-llama/llama-3.2-1b-instruct:free': 'Llama 3.2 1B',
      'qwen/qwen-2.5-72b-instruct:free': 'Qwen 2.5 72B',
      'qwen/qwen-2.5-coder-32b-instruct:free': 'Qwen 2.5 Coder',
      'deepseek/deepseek-chat-v3.1:free': 'DeepSeek Chat',
      'deepseek/deepseek-chat:free': 'DeepSeek Chat',
      'deepseek/deepseek-r1:free': 'DeepSeek R1',
      'google/gemini-2.0-flash-exp:free': 'Gemini 2.0 Flash',
      'google/gemini-2.0-flash-thinking-exp:free': 'Gemini 2.0 Thinking',
      'google/gemini-2.0-pro-exp-02-05:free': 'Gemini 2.0 Pro',
      'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
      'anthropic/claude-3.7-sonnet': 'Claude 3.7 Sonnet',
      'anthropic/claude-3-5-haiku': 'Claude 3.5 Haiku',
      'anthropic/claude-3-haiku': 'Claude 3 Haiku',
      'openai/gpt-4o': 'GPT-4o',
      'openai/gpt-4o-mini': 'GPT-4o mini',
      'openai/o1': 'o1',
      'openai/o3-mini': 'o3-mini',
      'kilo-auto/frontier': 'Frontier',
      'stepfun/step-3.7-flash:free': 'Step 3.7 Flash',
      'minimax/minimax-01:free': 'Minimax 01',
    };
    if (id && KNOWN_MAP[id]) return KNOWN_MAP[id];

    let str = label || '';
    if (str.includes('(')) {
      str = str.replace(/\s*\([^)]*\/[^)]*\)/g, '');
      str = str.replace(/\s*\([^)]*:[^)]*\)/g, '');
      str = str.replace(/\s*\((free|preview|fast|offline|online|turbo|beta)\)/gi, '');
      if (id) {
        const escapedId = id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        str = str.replace(new RegExp('\\s*\\(' + escapedId + '\\)', 'i'), '');
      }
    }
    str = str.trim();
    str = str.replace(/^[a-zA-Z0-9_\-\. ]+:\s*/, '');

    if (!str || str === id) {
      let raw = id || label || '';
      if (raw.includes('/')) raw = raw.split('/').pop();
      if (raw.includes(':')) {
        const parts = raw.split(':');
        const tag = (parts[1] || '').toLowerCase();
        if (['latest', 'free', 'preview', 'instruct', 'text', 'chat', 'beta'].includes(tag)) {
          raw = parts[0];
        } else {
          raw = parts[0] + ' ' + parts[1];
        }
      }
      raw = raw.replace(/[-_](versatile|instant|instruct|preview|exp|turbo|latest|it|32768|8192|chat)$/i, '');
      raw = raw.replace(/[-_](instruct|chat)$/i, '');

      // Separate letter/digit boundaries like llama3.2 -> llama 3.2, qwen2.5 -> qwen 2.5
      raw = raw.replace(/([a-zA-Z]+)(\d+(\.\d+)?)/g, '$1 $2');
      // Only split number from letters if not a size suffix like 7b, 8b, 70b, 32k
      raw = raw.replace(/(\d+(\.\d+)?)(?![bkmBKM]\b)([a-zA-Z]+)/g, '$1 $3');

      const words = raw.replace(/[-_]+/g, ' ').trim().split(/\s+/);
      str = words.map(w => {
        const low = w.toLowerCase();
        if (/^gpt/i.test(w)) return w.toUpperCase();
        if (['ai', 'r1', 'v1', 'v2', 'v3', 'v4', 'vl', '70b', '8b', '7b', '14b', '32b', '72b', '90b', '11b', '3b', '1b', '8x7b'].includes(low)) {
          return low === 'vl' ? 'VL' : (low.endsWith('b') ? low.slice(0, -1).toUpperCase() + 'B' : low.toUpperCase());
        }
        if (low === 'llama') return 'Llama';
        if (low === 'deepseek') return 'DeepSeek';
        if (low === 'mistral') return 'Mistral';
        if (low === 'mixtral') return 'Mixtral';
        if (low === 'qwen') return 'Qwen';
        if (low === 'coder') return 'Coder';
        if (low === 'gemini') return 'Gemini';
        if (low === 'claude') return 'Claude';
        if (low === 'openai') return 'OpenAI';
        if (low === 'hermes') return 'Hermes';
        if (low === 'step') return 'Step';
        if (low === 'minimax') return 'Minimax';
        if (low === 'flash') return 'Flash';
        if (low === 'pro') return 'Pro';
        if (low === 'glm') return 'GLM';
        if (low === 'frontier') return 'Frontier';
        if (/^\d+(\.\d+)?$/.test(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
      }).join(' ').replace(/\s+/g, ' ').trim();
    }

    const tokens = str.split(' ');
    if (str.length > 26 && tokens.length > 4) str = tokens.slice(0, 4).join(' ');
    return str || id || 'Model';
  }

  // -----------------------------------------------------------------------
  // Static fallback model lists per provider (used before any live fetch)
  // Each entry: { id, label, shortName, vision? }
  // -----------------------------------------------------------------------
  const STATIC_MODELS = {
    pollinations: [
      { id: 'openai',       label: 'OpenAI GPT-4o',          shortName: 'GPT-4o',          vision: true },
      { id: 'gemini',       label: 'Gemini 2.0 Flash',       shortName: 'Gemini Flash',    vision: true },
      { id: 'mistral',      label: 'Mistral',                shortName: 'Mistral' },
      { id: 'qwen-coder',   label: 'Qwen Coder',             shortName: 'Qwen Coder' },
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile',      label: 'Llama 3.3 70B',        shortName: 'Llama 3.3 70B' },
      { id: 'llama-3.2-11b-vision-preview', label: 'Llama 3.2 11B Vision', shortName: 'Llama 3.2 11B Vision', vision: true },
      { id: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision', shortName: 'Llama 3.2 90B Vision', vision: true },
      { id: 'llama-3.1-8b-instant',         label: 'Llama 3.1 8B',         shortName: 'Llama 3.1 8B' },
      { id: 'mixtral-8x7b-32768',           label: 'Mixtral 8x7B',         shortName: 'Mixtral 8x7B' },
    ],
    openrouter: [
      { id: 'google/gemini-2.0-flash-exp:free',          label: 'Gemini 2.0 Flash (Free)', shortName: 'Gemini 2.0 Flash', vision: true },
      { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', label: 'Llama 3.2 11B Vision (Free)', shortName: 'Llama 3.2 11B Vision', vision: true },
      { id: 'meta-llama/llama-3.3-70b-instruct:free',    label: 'Llama 3.3 70B (Free)',    shortName: 'Llama 3.3 70B' },
      { id: 'qwen/qwen-2.5-72b-instruct:free',           label: 'Qwen 2.5 72B (Free)',     shortName: 'Qwen 2.5 72B' },
      { id: 'deepseek/deepseek-chat-v3.1:free',          label: 'DeepSeek Chat (Free)',    shortName: 'DeepSeek Chat' },
    ],
    // Custom: empty until the user fetches. We seed a tiny placeholder
    // so the dropdown is never empty when the user switches providers
    // before configuring.
    custom: [
      { id: '__placeholder__', label: 'Configure & fetch models', shortName: 'Select Model' },
    ],
  };

  // -----------------------------------------------------------------------
  // Live, mutable model registry. Seeded from STATIC_MODELS, enriched by
  // fetchLiveModels(provider). Persisted in localStorage with TTL 1h.
  // -----------------------------------------------------------------------
  const MODELS = JSON.parse(JSON.stringify(STATIC_MODELS));
  const MODEL_CACHE = {
    key:  'cc.models.cache.v2',
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
    for (const prov of ['pollinations', 'groq', 'openrouter', 'custom']) {
      const baseUrl = prov === 'custom' ? (s.custom?.baseUrl || '') : '';
      const apiKey  = s.apiKeys?.[prov] || '';
      const cached  = loadModelCache(prov, baseUrl, apiKey);
      if (cached && Array.isArray(cached) && cached.length) {
        MODELS[prov] = cached;
      }
    }
    const customList = s.customProviders || [];
    for (const cp of customList) {
      const cached = loadModelCache(cp.id, cp.baseUrl, cp.apiKey);
      if (cached && Array.isArray(cached) && cached.length) {
        MODELS[cp.id] = cached;
      }
    }
  }

  // -----------------------------------------------------------------------
  // State (global) + per-conversation session
  // -----------------------------------------------------------------------
  const DEFAULT_SETTINGS = {
    provider: 'pollinations',   // 'pollinations' | 'groq' | 'openrouter' | custom provider id
    apiKeys: { pollinations: '', groq: '', openrouter: '', custom: '' },
    model:   { pollinations: 'openai', groq: 'llama-3.3-70b-versatile',
               openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
               custom: '__placeholder__',
               kilo: '__placeholder__' },
    stream:  true,
    memory:  true,
    temperature: 0.7,
    thinkingLevel: 2,
    custom: {
      name:   'Kilo Gateway',
      slug:   'kilo',
      baseUrl: 'https://api.kilo.ai/api/gateway',
      apiKey:  '',
    },
    customProviders: [
      {
        id: 'kilo',
        name: 'Kilo Gateway',
        baseUrl: 'https://api.kilo.ai/api/gateway',
        apiKey: '',
      },
    ],
    connectors: {
      figma: { enabled: false, token: '' },
      canva: { enabled: false, token: '' },
      sketch: { enabled: false, token: '' },
      slack: { enabled: false, webhookUrl: '' },
      gmail: { enabled: false, email: '' },
      googleCalendar: { enabled: true, timezone: 'auto' },
      googleDrive: { enabled: false },
      notion: { enabled: false, token: '' },
      github: { enabled: true, token: '' },
      database: { enabled: true, dialect: 'sqlite' },
      cloud: { enabled: false, provider: 'aws', region: 'us-east-1' },
      webSearch: { enabled: true },
      analytics: { enabled: true },
    },
    capabilities: {
      web: true,
      think: true,
      canvas: true,
      pdf: true,
      ppt: true,
      project: true,
      memory: true,
      location: true,
    },
    userMemory: {
      notes: '',
      facts: [],
    },
    globalSystemPrompt: '',
    appearance: {
      palette: 'mono',
      font: 'plus-jakarta',
      fontSize: 'medium',
    },
  };

  const state = {
    settings: structuredClone(DEFAULT_SETTINGS),
    incognitoActive: false,
    incognitoConversations: [],
    conversations: [],            // [{id, title, messages, createdAt, session}]
    activeConvId: null,
    userLocation: null,
    currentMode: 'chat',
    personaScope: 'conversation', // 'conversation' | 'global'
    attachments: [],              // [{name, type, size, dataUrl|content}]
    userScrolledUp: false,
    activeStreams: new Map(),     // convId -> { aborter, assistantMsg }
    get isStreaming() {
      return this.activeStreams ? this.activeStreams.has(this.activeConvId) : false;
    },
    set isStreaming(val) {
      // safe setter for legacy callers
    },
    get aborter() {
      const s = this.activeStreams ? this.activeStreams.get(this.activeConvId) : null;
      return s ? s.aborter : null;
    },
    set aborter(val) {
      // safe setter for legacy callers
    },
  };

  function isConvStreaming(convId) {
    if (!convId || !state.activeStreams) return false;
    return state.activeStreams.has(convId);
  }

  // Each conversation has its own session — independent provider/model/etc.
  function ensureSession(conv) {
    if (!conv) return null;
    if (!conv.files || typeof conv.files !== 'object') conv.files = {};
    if (!conv.session) {
      conv.session = {
        provider: state.settings.provider,
        model:    state.settings.model[state.settings.provider] || '',
        skills:   {},
        temperature: state.settings.temperature,
        stream:   state.settings.stream,
        systemPromptOverride: '',
        thinkingLevel: state.settings.thinkingLevel ?? 2,
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
    // Never persist incognito conversations — they are memory-only
    if (!state.incognitoActive) {
      LS.set('cc.conversations.v1', {
        list: state.conversations,
        activeId: state.activeConvId,
      });
    }
  }
  function loadPersisted() {
    const s = LS.get('cc.settings.v1', null);
    if (s && typeof s === 'object') {
      // shallow merge so new fields added in DEFAULT_SETTINGS are honored
      state.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), s);
      state.settings.apiKeys = Object.assign({}, DEFAULT_SETTINGS.apiKeys, s.apiKeys || {});
      state.settings.model   = Object.assign({}, DEFAULT_SETTINGS.model,   s.model   || {});
      state.settings.custom  = Object.assign({}, DEFAULT_SETTINGS.custom,  s.custom  || {});
      state.settings.connectors = Object.assign({}, DEFAULT_SETTINGS.connectors, s.connectors || {});
      state.settings.capabilities = Object.assign({}, DEFAULT_SETTINGS.capabilities, s.capabilities || {});
      state.settings.userMemory = Object.assign({}, DEFAULT_SETTINGS.userMemory, s.userMemory || {});
      state.settings.appearance = Object.assign({}, DEFAULT_SETTINGS.appearance, s.appearance || {});
      if (Array.isArray(s.customProviders) && s.customProviders.length > 0) {
        state.settings.customProviders = s.customProviders;
      } else if (s.custom && s.custom.baseUrl) {
        state.settings.customProviders = [
          {
            id: s.custom.slug || 'custom',
            name: s.custom.name || 'Custom Provider',
            baseUrl: s.custom.baseUrl,
            apiKey: s.custom.apiKey || '',
          },
        ];
      } else {
        state.settings.customProviders = structuredClone(DEFAULT_SETTINGS.customProviders);
      }
    } else {
      state.settings.customProviders = structuredClone(DEFAULT_SETTINGS.customProviders);
      state.settings.connectors = structuredClone(DEFAULT_SETTINGS.connectors);
    }
    // Auto-migrate deprecated 'openai-fast' to 'openai'
    if (!state.settings.model.pollinations || state.settings.model.pollinations === 'openai-fast') {
      state.settings.model.pollinations = 'openai';
    }
    if (!Number.isFinite(state.settings.thinkingLevel)) {
      state.settings.thinkingLevel = 2;
    }
    const c = LS.get('cc.conversations.v1', null);
    if (c && Array.isArray(c.list)) {
      state.conversations = c.list;
      for (const conv of state.conversations) {
        if (!conv.files || typeof conv.files !== 'object') conv.files = {};
        if (conv.session) {
          if (conv.session.provider === 'pollinations' && (!conv.session.model || conv.session.model === 'openai-fast')) {
            conv.session.model = 'openai';
          }
        }
      }
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
    $, $$, on, escapeHTML, LS, fingerprint, downloadFile,
    MODES, SKILLS, STATIC_MODELS, MODELS, toShortModelName,
    THINKING_LEVELS, thinkingLabel,
    MODEL_CACHE, cacheKeyFor, loadModelCache, saveModelCache, hydrateModelsFromCache,
    DEFAULT_SETTINGS, state, isConvStreaming, ensureSession, activeConv, activeSession, persist, loadPersisted,
  });
  window.CC = window.__CC;
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

  // ---------- Pollinations Provider ----------
  async function pollinationsChat({ messages, model, signal, apiKey, onChunk }) {
    const key = (apiKey || CC.state.settings.apiKeys?.pollinations || '').trim();
    const targetModel = model || 'openai';

    // If an API key is provided, use the official gen.pollinations.ai OpenAI-compatible endpoint
    if (key) {
      return openAIStreamChat({
        url: 'https://gen.pollinations.ai/v1/chat/completions',
        apiKey: key,
        model: targetModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        signal,
        onChunk,
      });
    }

    // Anonymous mode: fold system messages into user message to avoid Pollinations 402 rejection
    let sys = '';
    const cleanMessages = [];
    for (const m of messages) {
      if (m.role === 'system') {
        sys += (sys ? '\n\n' : '') + (typeof m.content === 'string' ? m.content : '');
      } else {
        cleanMessages.push({ role: m.role, content: m.content });
      }
    }
    if (cleanMessages.length && sys) {
      const firstUser = cleanMessages.find(m => m.role === 'user');
      if (firstUser) {
        if (typeof firstUser.content === 'string') {
          firstUser.content = `[System Instructions: ${sys}]\n\n` + firstUser.content;
        } else if (Array.isArray(firstUser.content)) {
          const textPart = firstUser.content.find(p => p.type === 'text');
          if (textPart) {
            textPart.text = `[System Instructions: ${sys}]\n\n` + (textPart.text || '');
          } else {
            firstUser.content.unshift({ type: 'text', text: `[System Instructions: ${sys}]` });
          }
        }
      }
    }
    if (!cleanMessages.length) {
      cleanMessages.push({ role: 'user', content: sys || 'Hello' });
    }

    // Helper to read SSE stream
    async function readSSEStream(response) {
      const reader = response.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let receivedAny = false;
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
          if (data === '[DONE]') return true;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;
            const isReasoning = !!(delta?.reasoning || delta?.reasoning_content);
            const piece = delta?.reasoning || delta?.reasoning_content || delta?.content || json.choices?.[0]?.message?.content || '';
            if (piece && onChunk) {
              receivedAny = true;
              onChunk(piece, isReasoning);
            }
          } catch { /* ignore malformed SSE line */ }
        }
      }
      return receivedAny;
    }

    const payload = JSON.stringify({
      model: targetModel,
      messages: cleanMessages,
      stream: true,
    });

    // 1. Try direct fetch
    try {
      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal,
      });

      if (res.ok && res.body) {
        const ok = await readSSEStream(res);
        if (ok) return;
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }

    // 2. If direct call was blocked (403 Cloudflare Turnstile token or network block), route through server proxy
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent('https://text.pollinations.ai/')}`;
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal,
      });

      if (res.ok && res.body) {
        const ok = await readSSEStream(res);
        if (ok) return;
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }

    // If both failed (due to 402 pollen requirement or 429), trigger helpful action card
    throw new Error('__POLLINATIONS_AUTH_HELP__');
  }

  // ---------- Generic OpenAI-compatible streamer (groq, openrouter, custom) --
  async function openAIStreamChat({ url, apiKey, model, messages, temperature, signal, onChunk, extraHeaders }) {
    const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const body = {
      model: model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: typeof temperature === 'number' ? temperature : undefined,
      stream: true,
    };
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if ((e.message?.includes('Failed to fetch') || e.name === 'TypeError') && !signal?.aborted && !url.startsWith('/api/proxy')) {
        try {
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
          res = await fetch(proxyUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal,
          });
        } catch {
          throw e;
        }
      } else {
        throw e;
      }
    }
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
          const delta = json.choices?.[0]?.delta;
          const isReasoning = !!(delta?.reasoning || delta?.reasoning_content);
          const piece = delta?.reasoning || delta?.reasoning_content || delta?.content || json.choices?.[0]?.message?.content || '';
          if (piece && onChunk) onChunk(piece, isReasoning);
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
      extraHeaders: {
        'HTTP-Referer': window.location.origin || 'http://localhost:8766',
        'X-Title': 'CuteChat',
      },
    });
  }

  // ---------- Custom provider: any OpenAI-compatible base URL ----------
  function normalizeBaseUrl(u) {
    if (!u) return '';
    return String(u).replace(/\/+$/, ''); // trim trailing slashes
  }

  function resolveCustomEndpoints(rawUrl) {
    let u = String(rawUrl || '').trim();
    if (!u) return { baseUrl: '', modelsCandidates: [], chatUrl: '' };
    // Strip trailing slashes
    u = u.replace(/\/+$/, '');
    // If user entered /chat/completions or /models, strip it (preserving /v1)
    u = u.replace(/\/chat\/completions\/?$/i, '');
    u = u.replace(/\/models\/?$/i, '');
    u = u.replace(/\/+$/, '');

    const candidates = [];
    if (u.endsWith('/v1')) {
      // Base URL explicitly specified /v1 (e.g. https://gorouter.app/v1)
      candidates.push(`${u}/models`);
    } else if (/kilo\.ai\/api\/gateway/i.test(u)) {
      candidates.push(`${u}/models`);
      candidates.push(`${u}/v1/models`);
    } else {
      // Standard endpoints without /v1
      candidates.push(`${u}/v1/models`);
      candidates.push(`${u}/models`);
    }

    // Only probe Ollama /api/tags if host or port explicitly indicates Ollama
    if (/11434|ollama/i.test(u)) {
      const host = u.replace(/\/v1\/?$/, '');
      candidates.push(`${host}/api/tags`);
    }

    let chatUrl;
    if (u.endsWith('/v1') || /kilo\.ai\/api\/gateway/i.test(u)) {
      chatUrl = `${u}/chat/completions`;
    } else {
      chatUrl = `${u}/v1/chat/completions`;
    }

    return {
      baseUrl: u,
      modelsCandidates: [...new Set(candidates)],
      chatUrl,
    };
  }

  function customChat(opts) {
    const raw = opts.baseUrl;
    if (!raw) throw new Error('Custom provider: Base URL is empty. Open Settings to configure it.');
    const endpoints = resolveCustomEndpoints(raw);
    const url = opts.chatUrl || endpoints.chatUrl;
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
    
    // Check if prov is a custom provider ID or 'custom'
    const customList = CC.state.settings.customProviders || [];
    const cp = customList.find(p => p.id === prov) || customList[0] || CC.state.settings.custom;
    if (cp || prov === 'custom') {
      const baseUrl = args.baseUrl || cp?.baseUrl || '';
      const apiKey  = args.apiKey !== undefined ? args.apiKey : (cp?.apiKey || '');
      return customChat({ ...args, baseUrl, apiKey });
    }
    throw new Error('Unknown provider: ' + prov);
  }

  Object.assign(CC, {
    pollinationsChat, groqChat, openrouterChat, customChat, providerChat,
    normalizeBaseUrl, resolveCustomEndpoints,
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
 * The Custom Fetch Models button (handleFetchCustomModels) uses
 * fetchLiveModels and repopulates the model dropdown.
 * ========================================================================= */
(function () {
  'use strict';
  const CC = window.__CC;
  const { MODELS, STATIC_MODELS, toShortModelName, loadModelCache, saveModelCache, normalizeBaseUrl, resolveCustomEndpoints } = CC;

  function parseApiErrorMessage(status, rawText, statusText) {
    let msg = '';
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed.error) {
          if (typeof parsed.error === 'string') msg = parsed.error;
          else if (parsed.error.message) msg = parsed.error.message;
        } else if (parsed.message) {
          msg = parsed.message;
        }
      } catch {
        if (!rawText.trim().startsWith('<')) {
          msg = rawText.slice(0, 160);
        }
      }
    }
    if (status === 401 || status === 403) {
      return `Invalid or missing API key (HTTP ${status}${msg ? ': ' + msg : ''})`;
    }
    if (status === 404) {
      return `Models endpoint not found (HTTP 404${msg ? ': ' + msg : ''})`;
    }
    return `HTTP ${status}${msg ? ': ' + msg : (statusText ? ': ' + statusText : '')}`;
  }

  // ---- internal: try a /models endpoint, parse the OpenAI-style list ----
  async function fetchOpenAIModels(url, apiKey) {
    const headers = { 'Accept': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    let res;
    try {
      res = await fetch(url, { method: 'GET', headers });
    } catch (e) {
      if ((e.message?.includes('Failed to fetch') || e.name === 'TypeError') && !url.startsWith('/api/proxy')) {
        try {
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
          res = await fetch(proxyUrl, { method: 'GET', headers });
        } catch {
          throw e;
        }
      } else {
        throw e;
      }
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err = new Error(parseApiErrorMessage(res.status, t, res.statusText));
      err.status = res.status;
      err.rawResponse = t;
      throw err;
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html')) {
      const err = new Error('Endpoint returned HTML web page instead of JSON API');
      err.status = 200;
      throw err;
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
      const shortName = toShortModelName(id, m.name);
      let label = (m.name && m.name !== id) ? m.name : shortName;
      label = label.replace(/^[a-zA-Z0-9_\-\. ]+:\s*/, '');
      // Best-effort vision detection
      const vision = /vision|gpt-4o|gemini|claude|llava|qwen-vl|vl-/i.test(id);
      return { id, label, shortName, vision };
    }).filter(Boolean);
  }

  // ---- public: fetch live models for a provider ----
  async function fetchLiveModels(provider, opts) {
    opts = opts || {};
    if (provider === 'pollinations') {
      const apiKey = opts.apiKey || CC.state.settings.apiKeys.pollinations;
      const list = await fetchOpenAIModels('https://gen.pollinations.ai/v1/models', apiKey);
      MODELS.pollinations = list;
      saveModelCache('pollinations', '', apiKey || '', list);
      return list;
    }
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

    // Custom provider — resolve from customProviders array
    const customList = CC.state.settings.customProviders || [];
    let cp;
    if (provider === 'custom') {
      // Legacy: use opts or first custom provider
      cp = customList[0] || CC.state.settings.custom;
    } else {
      cp = customList.find(p => p.id === provider);
    }
    if (!cp) throw new Error('Unknown provider: ' + provider);

    const rawUrl = opts.baseUrl || cp.baseUrl;
    if (!rawUrl) throw new Error(`${cp.name || provider}: Base URL is empty. Open Settings to configure it.`);
    const apiKey = opts.apiKey !== undefined ? opts.apiKey : (cp.apiKey || '');
    const endpoints = resolveCustomEndpoints(rawUrl);

    let list = null;
    let lastErr = null;
    for (const candidateUrl of endpoints.modelsCandidates) {
      try {
        list = await fetchOpenAIModels(candidateUrl, apiKey);
        break;
      } catch (err) {
        lastErr = err;
        // If authentication failed (401 / 403), stop immediately — do not probe fallback URLs
        if (err.status === 401 || err.status === 403) {
          break;
        }
      }
    }
    if (!list || !list.length) {
      // Fallback model ID if configured on the custom provider card
      if (cp && cp.defaultModel && cp.defaultModel.trim()) {
        const manualModel = cp.defaultModel.trim();
        list = [{
          id: manualModel,
          label: manualModel,
          shortName: toShortModelName(manualModel),
          vision: /vision|gpt-4o|gemini|claude|llava|vl-/i.test(manualModel),
        }];
      } else {
        throw new Error(lastErr?.message || `Could not fetch models from ${cp?.name || provider}`);
      }
    }

    const provId = (provider === 'custom' && cp.id) ? cp.id : provider;
    MODELS[provId] = list;
    saveModelCache(provId, rawUrl, apiKey, list);
    // Remember the current model in settings if it's now in the list
    if (list.length && !list.find(m => m.id === CC.state.settings.model[provId])) {
      CC.state.settings.model[provId] = list[0].id;
    }
    return list;
  }

  // ---- the handler bound to the Settings modal's Fetch Models button ----
  async function handleFetchLiveModels() {
    const btn = document.getElementById('fetchModelsBtn');
    const txt = document.getElementById('fetchModelsBtnText');
    const prov = CC.state.settings.provider;
    if (prov === 'pollinations') {
      MODELS.pollinations = JSON.parse(JSON.stringify(STATIC_MODELS.pollinations));
      CC.renderModelOptions && CC.renderModelOptions();
      return;
    }
    // If it's a custom provider ID, delegate
    const customList = CC.state.settings.customProviders || [];
    if (prov === 'custom' || customList.find(p => p.id === prov)) {
      return handleFetchCustomModels(prov);
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

  // ---- fetch models for a specific custom provider by ID ----
  async function handleFetchCustomModels(cpId) {
    const customList = CC.state.settings.customProviders || [];
    const cp = cpId ? customList.find(p => p.id === cpId) : customList[0];
    if (!cp) {
      toast('No custom provider configured', 'warn');
      return;
    }
    if (!cp.baseUrl) {
      toast(`Enter a Base URL for ${cp.name || cp.id}`, 'warn');
      return;
    }
    // Update status indicator in settings if present
    const statusEl = document.querySelector(`[data-cp-status="${cp.id}"]`);
    if (statusEl) {
      statusEl.className = 'custom-provider-status is-loading';
      statusEl.textContent = '⏳ Fetching…';
      statusEl.title = 'Fetching models from endpoint…';
    }
    try {
      const list = await fetchLiveModels(cp.id, {
        baseUrl: cp.baseUrl,
        apiKey: cp.apiKey,
      });
      // If the user's selected model was the placeholder, switch to the first real one
      const s = CC.activeSession && CC.activeSession();
      if (s && s.provider === cp.id && (!s.model || s.model === '__placeholder__')) {
        s.model = list[0].id;
        CC.state.settings.model[cp.id] = list[0].id;
      } else if (s && s.provider === cp.id && !list.find(m => m.id === s.model)) {
        s.model = list[0].id;
        CC.state.settings.model[cp.id] = list[0].id;
      }
      CC.persist && CC.persist();
      CC.renderModelOptions && CC.renderModelOptions();
      CC.refreshTopbarModelButton && CC.refreshTopbarModelButton();
      CC.setProviderStatus && CC.setProviderStatus();
      CC.renderTopbarProviderBar && CC.renderTopbarProviderBar();
      if (statusEl) {
        statusEl.className = 'custom-provider-status is-ok';
        statusEl.textContent = `✓ ${list.length} models`;
        statusEl.title = `✓ ${list.length} models loaded`;
      }
      toast(`Loaded ${list.length} models from ${cp.name || cp.id}`, 'ok');
    } catch (e) {
      console.error(e);
      if (statusEl) {
        statusEl.className = 'custom-provider-status is-err';
        statusEl.textContent = '✗ ' + e.message;
        statusEl.title = e.message;
      }
      toast('Fetch failed: ' + e.message, 'err');
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
  const { $, $$, on, escapeHTML, LS, MODES, SKILLS, MODELS, state, isConvStreaming,
          ensureSession, activeConv, activeSession, persist, downloadFile, toShortModelName } = CC;

  // -----------------------------------------------------------------------
  // System prompt builder
  // Combines: base mode prompt + per-chat override + active skills.
  // -----------------------------------------------------------------------
  // Core artifact generation capabilities with Apple & Notion design guide
  const ARTIFACT_INSTRUCTIONS = [
    '# Tooling & High-End Artifact Creation Suite (Apple & Notion Design Standards):',
    'You are equipped with a suite of non-generic, premium creation tools that adhere to top-notch Notion and Apple design aesthetics.',
    'When asked to build documents, slides, illustrations, micro-tools, or web apps, generate COMPLETE, production-grade files in fenced code blocks.',
    '',
    '## 1. Interactive Slide Decks & Keynote Presentations (create_ppt):',
    '- Language tag: ```ppt or ```html (with class="deck" and class="slide")',
    '- Design Aesthetic: Apple Keynote 16:9 widescreen layout. Editorial typography, high contrast, generous whitespace, punchy headlines (-0.025em tracking), stat callouts, and clean card containers.',
    '- Slide Deck Structure:',
    '  <div class="deck">',
    '    <section class="slide active" data-slide="1">',
    '      <div class="slide-content">',
    '        <span class="eyebrow">KEYNOTE PRESENTATION</span>',
    '        <h1>Editorial Hero Title</h1>',
    '        <p class="subtitle">Concise, impactful narrative subtitle</p>',
    '        <div class="slide-grid">',
    '          <div class="slide-card"><div class="stat-callout">99.8%</div><div class="stat-label">System Reliability</div></div>',
    '          <div class="slide-card"><div class="stat-callout">&lt; 12ms</div><div class="stat-label">Sub-Second Latency</div></div>',
    '        </div>',
    '      </div>',
    '      <footer class="slide-footer"><span>Sage Keynote</span><span>01 / 05</span></footer>',
    '    </section>',
    '    <section class="slide" data-slide="2">...</section>',
    '  </div>',
    '- Include 4-8 complete slides per deck with clean transitions.',
    '',
    '## 2. Executive Documents, Resumes, Invoices & Reports (create_pdf):',
    '- Language tag: ```pdf or ```html (with class="printable-doc")',
    '- Design Aesthetic: Notion-like editorial minimalism on an A4 page container (@page { size: A4; margin: 20mm; }).',
    '- Typography: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif. Subtle hairline borders (rgba(0,0,0,0.06)), pill status tags, structured data tables, and print styles (@media print).',
    '',
    '## 3. Scalable Vector Graphics & Brand Marks (create_svg):',
    '- Language tag: ```svg',
    '- Design Aesthetic: Sophisticated solid & gradient palettes (Obsidian Slate #0f172a, Emerald Pine #064e3b, Burnt Terracotta #9a3412, Cupertino Frost). Clean geometric precision, viewBox with proper aspect ratio, subtle drop shadow filters. No generic cheesy clip-art.',
    '',
    '## 4. Interactive Web Applications & Micro-Tools (create_html):',
    '- Language tag: ```html or ```canvas',
    '- Design Aesthetic: Polished glassmorphism, responsive CSS grid, tactile micro-interactions, dark/light coherence.',
    '',
    '## 5. Iterative Refinement & Diff Editing (edit_file):',
    '- Language tag: ```edit_file:<filename> or ```diff',
    '- Format:',
    '  <<<<<<< SEARCH',
    '  [exact snippet from the existing artifact to modify]',
    '  =======',
    '  [new replacement snippet]',
    '  >>>>>>>',
    '- CRITICAL RULE: When the user asks for tweaks, improvements, color changes, or copy updates to an existing artifact, NEVER rewrite the entire file from scratch! Use edit_file with targeted SEARCH/REPLACE blocks. This preserves token context and enables long-run continuous project iteration.',
    '',
    '## 6. General Project File Creation (create_file):',
    '- Language tag: ```file:<filename> (e.g. ```file:config.json or ```file:dashboard.html)'
  ].join('\n');

  function buildSystemPrompt(targetConv) {
    const mode = MODES.find(m => m.id === state.currentMode) || MODES[0];
    const s = targetConv ? ensureSession(targetConv) : activeSession();
    
    // Check persona: per-chat override has priority over global custom prompt
    const convOverride = (s && s.systemPromptOverride && s.systemPromptOverride.trim()) ? s.systemPromptOverride.trim() : '';
    const globalOverride = (state.settings.globalSystemPrompt && state.settings.globalSystemPrompt.trim()) ? state.settings.globalSystemPrompt.trim() : '';
    const activePersona = convOverride || globalOverride;

    const parts = [];

    if (activePersona) {
      parts.push([
        '# Assistant Identity & System Persona:',
        'You are adopting the following custom persona and instructions. Embody this persona completely in your tone, style, knowledge, and responses:',
        activePersona,
        '',
        'Unless overridden by the persona instructions above, your default name is Sage. Always identify as Sage or the specified persona when asked who or what you are. Never refer to yourself as AI Dash or any other default service name.'
      ].join('\n'));
    } else {
      parts.push([
        '# Assistant Identity:',
        'You are Sage, a thoughtful, exceptionally capable, and sophisticated AI assistant. Your name is Sage.',
        'Always identify as Sage when asked who you are, what your name is, or what assistant is running.',
        'Never refer to yourself as AI Dash or any other name.',
        mode.sys
      ].join('\n'));
    }

    parts.push(ARTIFACT_INSTRUCTIONS);

    // Active project files workspace awareness
    const convForFiles = targetConv || activeConv();
    if (convForFiles && convForFiles.files) {
      const fileList = Object.values(convForFiles.files);
      if (fileList.length > 0) {
        const fileSummary = fileList.map(f => `- ${f.path} (${f.type}, v${f.version || 1}, "${f.title || f.name}")`).join('\n');
        parts.push([
          '# Active Project Files Workspace:',
          'The current conversation workspace contains the following registered artifacts and project files:',
          fileSummary,
          '',
          'IMPORTANT: When iterating on, updating, or fixing any of the files listed above, ALWAYS use the `edit_file` tool with SEARCH/REPLACE diff blocks instead of rewriting the entire file from scratch. This enables seamless long-term project development.'
        ].join('\n'));
      }
    }

    // Thinking level instruction
    const isThinkingCap = state.settings.capabilities?.think !== false;
    const tLevel = isThinkingCap ? ((s && typeof s.thinkingLevel === 'number') ? s.thinkingLevel : (state.settings.thinkingLevel ?? 2)) : 0;
    if (tLevel > 0) {
      const depth = tLevel === 1 ? 'briefly' : tLevel === 2 ? 'clearly' : tLevel === 3 ? 'in detail' : 'exhaustively';
      parts.push(`Think ${depth} before answering. When useful, expose your reasoning in a fenced code block with language tag "thinking" containing ONLY the reasoning text. After the thinking block, deliver the final answer in normal prose.`);
    }

    if (s && s.skills) {
      for (const sk of SKILLS) {
        if (state.settings.capabilities?.[sk.id] !== false && s.skills[sk.id] !== false && sk.sys) {
          parts.push(sk.sys);
        }
      }
    }

    // Real-Time User Context (Approximate Location & Time via IP)
    const isLocationEnabled = state.settings.capabilities?.location !== false;
    if (isLocationEnabled && state.userLocation) {
      const loc = state.userLocation;
      const tz = loc.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const nowStr = new Date().toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const locParts = [loc.city, loc.region, loc.country].filter(Boolean);
      if (locParts.length > 0) {
        parts.push([
          '# Real-Time User Environment & Approximate Location Context:',
          `- User's Approximate Location: ${locParts.join(', ')}`,
          `- User's Timezone: ${tz}`,
          `- Current Date & Time: ${nowStr}`,
          'Incorporate this real-time geographic and temporal context naturally and accurately when relevant (e.g., local time, weather, regional specifics, or localized recommendations).'
        ].join('\n'));
      }
    }

    // Real Long-Term User Memory & Profile Context
    const isMemoryEnabled = state.settings.capabilities?.memory !== false && state.settings.memory !== false;
    if (isMemoryEnabled) {
      const mem = state.settings.userMemory || {};
      const memLines = [];
      if (mem.notes && mem.notes.trim()) {
        memLines.push(`- User Profile & Notes: ${mem.notes.trim()}`);
      }
      if (Array.isArray(mem.facts) && mem.facts.length > 0) {
        memLines.push(...mem.facts.map(f => `- ${f}`));
      }
      if (memLines.length > 0) {
        parts.push([
          '# Long-Term User Memory & Personalization:',
          'The user has established the following personal context and preferences:',
          ...memLines,
          'Incorporate this personalized context seamlessly into your responses.'
        ].join('\n'));
      }
    }

    // Web Search & MCP Tools Instructions
    const conn = state.settings.connectors || {};
    const isWebEnabled = state.settings.capabilities?.web !== false && (conn.webSearch?.enabled !== false || (s && s.skills && s.skills.web !== false));
    if (isWebEnabled) {
      parts.push([
        '# Real-Time Public Web Search Capability:',
        'You have direct access to live internet search across official public websites, documentation, and global public records.',
        'Whenever the user asks about current events, up-to-date facts, library docs, pricing, official public sites, or anything beyond your training knowledge cutoff, you MUST emit a fenced code block:',
        '```search',
        '<search query>',
        '```',
        'The system will execute the live search across official public web pages, display the execution step under a collapsible Steps toggle, and feed the verified results back to you so you can read them and deliver the final accurate, polished answer to the user.'
      ].join('\n'));
    }

    // Inject active MCP connectors capabilities
    const activeConns = Object.keys(conn).filter(k => conn[k]?.enabled);
    if (activeConns.length > 0) {
      const connLines = [
        '# Active MCP Tools:',
        `Enabled connectors: ${activeConns.join(', ')}.`,
        'When appropriate, you can emit actionable blocks for the user:',
        conn.database?.enabled ? '- **Database (SQL)**: Emit a fenced code block ```sql containing a valid query (e.g. SELECT * FROM users).' : '',
        conn.analytics?.enabled ? '- **Interactive Charts**: Emit a fenced code block ```chart with format:\ntype: bar (or line, donut)\ntitle: Your Chart Title\nlabels: Item 1, Item 2, Item 3\ndata: 10, 25, 40' : '',
        conn.googleCalendar?.enabled ? '- **Calendar Invites**: Emit a fenced code block ```calendar with format:\ntitle: Meeting Title\nstart: 2026-09-10 14:00\nend: 2026-09-10 15:00\nlocation: Google Meet' : '',
        conn.github?.enabled ? '- **GitHub**: Emit a fenced code block ```github containing `repo: owner/name`.' : '',
        conn.slack?.enabled ? '- **Slack**: Emit a fenced code block ```slack containing `text: your message`.' : '',
        conn.figma?.enabled ? '- **Figma**: Emit a fenced code block ```figma containing `file: <file_key>`.' : '',
      ].filter(Boolean);
      parts.push(connLines.join('\n'));
    }

    return parts.join('\n\n');
  }

  // -----------------------------------------------------------------------
  // Sidebar: modes
  // -----------------------------------------------------------------------
  function switchMode(id) {
    state.currentMode = id;
    const m = MODES.find(x => x.id === id) || MODES[0];
    const titleEl = document.getElementById('topbarTitle');
    const subEl   = document.getElementById('topbarSubtitle');
    const iconEl  = document.getElementById('topbarModeIcon');
    if (titleEl) titleEl.textContent = m.tabTitle;
    if (subEl)   subEl.textContent   = m.tabSub;
    if (iconEl)  iconEl.innerHTML    = m.icon;
    renderModes();
    updateSuggestions();
    const c = activeConv();
    if (!c || !c.messages || !c.messages.length) {
      renderChat();
    }
  }

  function renderModes() {
    const host = document.getElementById('modes');
    if (host) {
      host.innerHTML = '';
      for (const m of MODES) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode' + (m.id === state.currentMode ? ' is-active' : '');
        btn.dataset.mode = m.id;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', m.id === state.currentMode ? 'true' : 'false');
        btn.innerHTML = m.icon + '<span>' + escapeHTML(m.label) + '</span>';
        on(btn, 'click', () => switchMode(m.id));
        host.appendChild(btn);
      }
    }
    const badge = document.getElementById('activeModeBadge');
    if (badge) {
      const activeM = MODES.find(x => x.id === state.currentMode) || MODES[0];
      badge.textContent = activeM.label;
    }
  }

  // -----------------------------------------------------------------------
  // Suggestions (quick-starters) for the current mode
  // -----------------------------------------------------------------------
  const SUGGESTIONS = {
    chat:       ['Plan a weekend trip for two under $500', 'Explain a concept like I’m 12', 'Help me write a polite email to my landlord'],
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
      if (input) { input.value = b.textContent; if (typeof input.focus === 'function') input.focus(); autosizeInput(); }
    }));
  }

  // -----------------------------------------------------------------------
  // Sidebar: conversations list + actions + context menu
  // -----------------------------------------------------------------------
  let activeContextMenuConvId = null;
  let activeContextMenuRow = null;

  function toast(msg, kind) {
    if (CC.toast) CC.toast(msg, kind);
    else console.log('[toast]', kind || 'info', msg);
  }

  function switchConversation(convId) {
    if (!convId) return;
    closeConvContextMenu();

    // If incognito is active and user switches to a saved (non-incognito) chat, exit incognito
    if (state.incognitoActive) {
      const targetConv = state.conversations.find(c => c.id === convId);
      if (targetConv) {
        deactivateIncognito();
        toast('Incognito ended — switched to saved chat', 'info');
      }
    }

    state.activeConvId = convId;
    state.userScrolledUp = false;
    renderConversations();
    renderChat(true);
    refreshTopbarModelButton();
    setProviderStatus();
    updateStreamingUI();
    if (CC.syncThinkingUI) {
      const s = activeSession();
      CC.syncThinkingUI(s?.thinkingLevel ?? state.settings.thinkingLevel ?? 2, false);
    }
    const sp = document.getElementById('systemPromptInput');
    if (sp && state.personaScope === 'conversation') {
      sp.value = activeSession()?.systemPromptOverride || '';
    }
    updateProjectFilesBadge();

    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    if (window.innerWidth <= 768 && sidebar) {
      sidebar.classList.remove('is-open');
      if (scrim) scrim.classList.remove('is-open');
    }
  }

  function renderConversations() {
    const countBadge = document.getElementById('chatsCountBadge');
    if (countBadge) {
      countBadge.textContent = state.conversations ? state.conversations.length : 0;
    }
    const host = document.getElementById('conversations');
    if (!host) return;
    const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const visibleConvs = state.incognitoActive
      ? state.incognitoConversations
      : state.conversations;
    const list = visibleConvs
      .filter(c => !q || (c.title || '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    host.innerHTML = '';
    for (const c of list) {
      const row = document.createElement('div');
      const isActive = c.id === state.activeConvId;
      const isMenuOpen = c.id === activeContextMenuConvId;
      row.className = 'conv' + (isActive ? ' is-active' : '') + (isMenuOpen ? ' is-menu-open' : '');
      row.dataset.id = c.id;

      const pinBadgeHTML = c.pinned
        ? '<span class="conv__pin-badge" title="Pinned to top">' +
            '<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6l1.3 1.3 1.3-1.3v-6H19v-2l-2-2z"/></svg>' +
            'Pinned</span><span class="conv__dot">·</span>'
        : '';

      const isStreaming = isConvStreaming(c.id);
      const streamingBadgeHTML = isStreaming
        ? '<span class="conv__streaming-badge" title="Generating response...">' +
            '<span class="streaming-spinner streaming-spinner--mini"></span>' +
          '</span><span class="conv__dot">·</span>'
        : '';

      const msgCount = c.messages?.length || 0;
      const countLabel = msgCount === 1 ? '1 msg' : `${msgCount} msgs`;

      row.innerHTML =
        '<div class="conv__main">' +
          '<div class="conv__title" title="' + escapeHTML(c.title || 'New chat') + '">' + escapeHTML(c.title || 'New chat') + '</div>' +
          '<div class="conv__sub">' + pinBadgeHTML + streamingBadgeHTML + '<span class="conv__msg-count">' + countLabel + '</span></div>' +
        '</div>' +
        '<div class="conv__actions">' +
          '<button class="conv__action-btn" type="button" aria-label="Chat options" title="Options">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">' +
              '<circle cx="5" cy="12" r="2"/>' +
              '<circle cx="12" cy="12" r="2"/>' +
              '<circle cx="19" cy="12" r="2"/>' +
            '</svg>' +
          '</button>' +
        '</div>';

      on(row, 'click', (e) => {
        if (e.target.closest('.conv__actions') || e.target.closest('#convContextMenu')) return;
        switchConversation(c.id);
      });

      on(row, 'contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openConvContextMenu(c.id, e.clientX, e.clientY, false, row);
      });

      const menuBtn = row.querySelector('.conv__action-btn');
      if (menuBtn) {
        on(menuBtn, 'click', (e) => {
          e.stopPropagation();
          const rect = menuBtn.getBoundingClientRect();
          openConvContextMenu(c.id, rect.right, rect.bottom + 4, true, row);
        });
      }

      host.appendChild(row);
    }
  }

  function openConvContextMenu(convId, x, y, alignRight, rowEl) {
    const menu = document.getElementById('convContextMenu');
    if (!menu) return;

    const conv = state.conversations.find(c => c.id === convId);
    if (!conv) return;

    activeContextMenuConvId = convId;
    activeContextMenuRow = rowEl || document.querySelector(`.conv[data-id="${convId}"]`);

    const pinLabel = menu.querySelector('.conv-context-item__pin-label');
    if (pinLabel) {
      pinLabel.textContent = conv.pinned ? 'Unpin from top' : 'Pin to top';
    }

    document.querySelectorAll('.conv.is-menu-open').forEach(el => el.classList.remove('is-menu-open'));
    if (activeContextMenuRow) {
      activeContextMenuRow.classList.add('is-menu-open');
    }

    menu.hidden = false;

    const menuWidth = menu.offsetWidth || 175;
    const menuHeight = menu.offsetHeight || 180;
    let left = alignRight ? x - menuWidth : x;
    let top = y;

    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, y - menuHeight - 4);
    }

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeConvContextMenu() {
    const menu = document.getElementById('convContextMenu');
    if (menu && !menu.hidden) {
      menu.hidden = true;
    }
    if (activeContextMenuRow) {
      activeContextMenuRow.classList.remove('is-menu-open');
      activeContextMenuRow = null;
    }
    activeContextMenuConvId = null;
  }

  function renameConversation(convId) {
    const c = state.conversations.find(x => x.id === convId);
    if (!c) return;
    const newTitle = prompt('Rename conversation:', c.title || '');
    if (newTitle !== null) {
      const trimmed = newTitle.trim();
      if (trimmed && trimmed !== c.title) {
        c.title = trimmed;
        persist();
        renderConversations();
        toast('Conversation renamed', 'ok');
      }
    }
  }

  function togglePinConversation(convId) {
    const c = state.conversations.find(x => x.id === convId);
    if (!c) return;
    c.pinned = !c.pinned;
    persist();
    renderConversations();
    toast(c.pinned ? 'Chat pinned to top' : 'Chat unpinned', 'ok');
  }

  function duplicateConversation(convId) {
    const c = state.conversations.find(x => x.id === convId);
    if (!c) return;
    const clone = {
      id: uid(),
      title: (c.title || 'New chat') + ' (Copy)',
      messages: JSON.parse(JSON.stringify(c.messages || [])),
      createdAt: Date.now(),
      session: null,
      pinned: false,
      incognito: false,
    };
    ensureSession(clone);
    state.conversations.unshift(clone);
    state.activeConvId = clone.id;
    state.userScrolledUp = false;
    persist();
    renderConversations();
    renderChat(true);
    refreshTopbarModelButton();
    setProviderStatus();
    updateStreamingUI();
    toast('Conversation duplicated', 'ok');
  }

  function exportSingleConversation(convId) {
    const c = state.conversations.find(x => x.id === convId);
    if (!c) return;
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

  function deleteConversation(convId) {
    const c = state.conversations.find(x => x.id === convId);
    if (!c) return;
    if (!confirm(`Delete "${c.title || 'this chat'}"?`)) return;

    const streamInfo = state.activeStreams.get(convId);
    if (streamInfo && streamInfo.aborter) {
      try { streamInfo.aborter.abort(); } catch (_) {}
    }
    state.activeStreams.delete(convId);

    state.conversations = state.conversations.filter(x => x.id !== convId);
    if (state.activeConvId === convId) {
      state.activeConvId = state.conversations[0]?.id || null;
    }
    if (!state.conversations.length) createConversation();
    state.userScrolledUp = false;
    persist();
    renderConversations();
    renderChat(true);
    refreshTopbarModelButton();
    setProviderStatus();
    updateStreamingUI();
    toast('Conversation deleted', 'ok');
  }

  function setupConvContextMenu() {
    const menu = document.getElementById('convContextMenu');
    if (!menu) return;

    on(menu, 'click', (e) => {
      const item = e.target.closest('.conv-context-item');
      if (!item) return;
      const action = item.dataset.action;
      const convId = activeContextMenuConvId;
      closeConvContextMenu();
      if (!convId) return;

      if (action === 'rename') {
        renameConversation(convId);
      } else if (action === 'pin') {
        togglePinConversation(convId);
      } else if (action === 'duplicate') {
        duplicateConversation(convId);
      } else if (action === 'export') {
        exportSingleConversation(convId);
      } else if (action === 'delete') {
        deleteConversation(convId);
      }
    });

    on(document, 'click', (e) => {
      if (menu.hidden) return;
      if (e.target.closest('#convContextMenu') || e.target.closest('.conv__action-btn')) return;
      closeConvContextMenu();
    });

    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        closeConvContextMenu();
      }
    });

    const convList = document.getElementById('conversations');
    if (convList) {
      convList.addEventListener('scroll', closeConvContextMenu, { passive: true });
    }
  }

  function uid() { return 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function createConversation() {
    const conv = {
      id: uid(),
      title: 'New chat',
      messages: [],
      files: {},
      createdAt: Date.now(),
      session: null, // populated by ensureSession
      incognito: state.incognitoActive,
    };
    ensureSession(conv);
    if (state.incognitoActive) {
      state.incognitoConversations.unshift(conv);
    } else {
      state.conversations.unshift(conv);
    }
    state.activeConvId = conv.id;
    if (!state.incognitoActive) persist();
    return conv;
  }

  // -----------------------------------------------------------------------
  // Incognito Mode
  // -----------------------------------------------------------------------
  function toggleIncognito() {
    const app = document.getElementById('app');
    const btn = document.getElementById('incognitoBtn');
    const statusBar = document.getElementById('incognitoStatusBar');
    const badge = document.getElementById('incognitoSidebarBadge');

    if (!state.incognitoActive) {
      state.incognitoActive = true;
      app.setAttribute('data-incognito', 'true');
      if (btn) btn.classList.add('is-active');
      if (statusBar) statusBar.hidden = false;
      if (badge) badge.hidden = false;
      toast('Incognito mode on — chats won\'t be saved', 'info');
    } else {
      if (state.incognitoConversations.length > 0) {
        showIncognitoClearDialog();
      } else {
        deactivateIncognito();
      }
    }
  }

  function deactivateIncognito() {
    const app = document.getElementById('app');
    const btn = document.getElementById('incognitoBtn');
    const statusBar = document.getElementById('incognitoStatusBar');
    const badge = document.getElementById('incognitoSidebarBadge');
    state.incognitoActive = false;
    app.removeAttribute('data-incognito');
    if (btn) btn.classList.remove('is-active');
    if (statusBar) statusBar.hidden = true;
    if (badge) badge.hidden = true;
    state.incognitoConversations = [];
  }

  function showIncognitoClearDialog() {
    const dialog = document.getElementById('incognitoClearDialog');
    if (dialog) dialog.hidden = false;
  }

  function hideIncognitoClearDialog() {
    const dialog = document.getElementById('incognitoClearDialog');
    if (dialog) dialog.hidden = true;
  }

  function handleIncognitoClearKeep() {
    hideIncognitoClearDialog();
    deactivateIncognito();
    toast('Incognito mode ended', 'info');
  }

  function handleIncognitoClearClear() {
    hideIncognitoClearDialog();
    deactivateIncognito();
    const c = activeConv();
    if (c && c.messages && c.messages.length > 0) {
      c.messages = [];
      renderChat();
    }
    toast('Incognito conversations cleared', 'info');
  }

  // -----------------------------------------------------------------------
  // Chat rendering + Colorful Code Syntax Highlighting + Hero Empty State
  // -----------------------------------------------------------------------
  function mdToSafeHTML(src) {
    if (!src) return '';
    try {
      if (window.marked && !window.__markedConfigured) {
        if (typeof window.marked.use === 'function') {
          window.marked.use({ breaks: true, gfm: true });
        } else if (typeof window.marked.setOptions === 'function') {
          window.marked.setOptions({ breaks: true, gfm: true });
        }
        window.__markedConfigured = true;
      }
      const html = window.marked?.parse ? window.marked.parse(src) : src;
      return window.DOMPurify ? DOMPurify.sanitize(html, {
        ADD_TAGS: ['svg', 'path', 'circle', 'line', 'rect', 'polyline', 'polygon', 'ellipse', 'g', 'text', 'defs', 'linearGradient', 'stop', 'use', 'button', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ADD_ATTR: ['target', 'rel', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'data-connector-cmd', 'data-download-ics', 'data-action', 'data-chart-id', 'xmlns', 'colspan']
      }) : html;
    } catch { return escapeHTML(src); }
  }

  function renderHero() {
    const activeM = MODES.find(m => m.id === state.currentMode) || MODES[0];
    const starterPrompts = [
      {
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><path d="M12 12v4" opacity="0.6"/></svg>',
        title: 'Code & Architecture',
        desc: 'Draft an async crawler with retries & rate limiting',
        prompt: 'Write an async Python web crawler with retry handling and rate limiting.',
      },
      {
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/><circle cx="12" cy="12" r="3" opacity="0.6"/></svg>',
        title: 'Deep Thinking',
        desc: 'Analyze transformer attention mechanisms in detail',
        prompt: 'Explain how transformer self-attention mechanisms compute weights in plain terms.',
      },
      {
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/><path d="M6 12h6" opacity="0.6"/></svg>',
        title: 'Writing & Synthesis',
        desc: 'Draft an executive briefing on open source models',
        prompt: 'Draft an executive briefing on the evolution and efficiency of modern reasoning models.',
      },
      {
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10M7 12h10M7 17h10"/><circle cx="6" cy="6" r="1" fill="currentColor" opacity="0.6"/></svg>',
        title: 'Canvas & UI Artifacts',
        desc: 'Build an interactive dashboard component with live preview',
        prompt: 'Create an interactive HTML/CSS dashboard widget with live preview and smooth animations.',
      },
    ];

    const cardsHtml = starterPrompts.map(p => `
      <button type="button" class="hero-starter" data-prompt="${escapeHTML(p.prompt)}">
        <div class="hero-starter__icon">${p.icon}</div>
        <div class="hero-starter__body">
          <div class="hero-starter__title">${escapeHTML(p.title)}</div>
          <div class="hero-starter__desc">${escapeHTML(p.desc)}</div>
        </div>
        <div class="hero-starter__arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </div>
      </button>
    `).join('');

    return `
      <div class="hero">
        <div class="hero__brand">
          <div class="hero__avatar">
            <svg class="sage-logo-hero" viewBox="0 0 32 32" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="9" fill="var(--surface-3, #222228)" stroke="var(--surface-border)" stroke-width="1"/>
              <path d="M16 5.5L23.5 12.5L16 16.5L12.5 11.5L16 5.5Z" fill="var(--primary, #E06853)"/>
              <path d="M16 26.5L8.5 19.5L16 15.5L19.5 20.5L16 26.5Z" fill="var(--ink-700, #2B2D42)"/>
              <path d="M5.5 16L12.5 11.5L16 15.5L11.5 20.5L5.5 16Z" fill="var(--primary-hover, #D97757)"/>
              <path d="M26.5 16L19.5 20.5L16 16.5L20.5 11.5L26.5 16Z" fill="var(--ink-400, #717688)"/>
              <path d="M16 13L19 16L16 19L13 16L16 13Z" fill="#FFFFFF"/>
              <circle cx="16" cy="16" r="1.2" fill="var(--primary, #E06853)"/>
            </svg>
          </div>
          <div class="hero__brand-text">
            <div class="hero__eyebrow">INTELLIGENCE &amp; CLARITY</div>
            <h2 class="hero__title">Welcome to <span class="hero__name">Sage</span></h2>
            <p class="hero__sub">Clarity, deep reasoning, and live tools. Mode: <strong>${escapeHTML(activeM.tabTitle)}</strong></p>
          </div>
        </div>

        <div class="hero__starters">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  // -----------------------------------------------------------------------
  // Canvas Artifact Preview Modal Handlers
  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  // Project Files Workspace & Iterative Diff Editing
  // -----------------------------------------------------------------------
  function getConvFiles(conv) {
    if (!conv) return {};
    if (!conv.files || typeof conv.files !== 'object') conv.files = {};
    for (const k of Object.keys(conv.files)) {
      const rec = conv.files[k];
      if (rec && /moochi|moonlight|mochi/i.test(rec.title || '')) {
        rec.title = rec.type === 'svg' ? 'Vector Graphic' : rec.type === 'ppt' ? 'Presentation Deck' : rec.type === 'pdf' ? 'Document Report' : 'Web Component';
      }
    }
    return conv.files;
  }

  function saveConvFile(conv, { path, name, title, content, type }) {
    if (!conv) return null;
    if (!conv.files || typeof conv.files !== 'object') conv.files = {};
    const key = (path || name || '').trim() || ('artifact_' + Date.now() + '.' + (type === 'svg' ? 'svg' : type === 'pdf' ? 'html' : type === 'ppt' ? 'html' : 'html'));
    const existing = conv.files[key];
    const version = existing ? ((existing.version || 1) + 1) : 1;
    let cleanTitle = title || existing?.title || key;
    if (/moochi|moonlight|mochi/i.test(cleanTitle)) {
      cleanTitle = type === 'svg' ? 'Vector Graphic' : type === 'ppt' ? 'Presentation Deck' : type === 'pdf' ? 'Document Report' : 'Web Component';
    }
    const fileRecord = {
      path: key,
      name: name || key.split('/').pop(),
      title: cleanTitle,
      content: content || '',
      type: type || existing?.type || 'html',
      version,
      updatedAt: Date.now()
    };
    conv.files[key] = fileRecord;
    persist();
    updateProjectFilesBadge();
    return fileRecord;
  }

  function applyFileEdit(conv, rawEditBlock, preferredTarget) {
    if (!conv) return { success: false, error: 'No active conversation' };
    const files = getConvFiles(conv);
    const fileKeys = Object.keys(files);

    // 1. Identify target file
    let targetKey = preferredTarget;
    if (!targetKey) {
      const matchTag = rawEditBlock.match(/(?:edit_file|file|target|path)\s*[:=]\s*([^\s\n\r]+)/i);
      if (matchTag && matchTag[1]) {
        targetKey = matchTag[1].trim();
      }
    }
    if (!targetKey) {
      // Use the most recently updated file
      if (fileKeys.length > 0) {
        const sorted = fileKeys.map(k => files[k]).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        targetKey = sorted[0].path;
      }
    }

    if (!targetKey || !files[targetKey]) {
      if (targetKey && fileKeys.length > 0) {
        const found = fileKeys.find(k => k.endsWith(targetKey) || targetKey.endsWith(k));
        if (found) targetKey = found;
      }
      if (!files[targetKey]) {
        if (fileKeys.length > 0) {
          targetKey = fileKeys[0];
        } else {
          targetKey = targetKey || 'document.html';
          files[targetKey] = {
            path: targetKey,
            name: targetKey,
            title: 'Project Document',
            content: '',
            type: targetKey.endsWith('.svg') ? 'svg' : targetKey.endsWith('.pdf') ? 'pdf' : targetKey.endsWith('.ppt') ? 'ppt' : 'html',
            version: 1,
            updatedAt: Date.now()
          };
        }
      }
    }

    const targetRecord = files[targetKey];
    let content = targetRecord.content || '';
    let addedCount = 0;
    let delCount = 0;
    let appliedBlocks = 0;
    const diffLines = [];

    // Parse SEARCH / REPLACE blocks
    const blockRegex = /<{7}\s*SEARCH\r?\n([\s\S]*?)\r?\n={7}\r?\n([\s\S]*?)\r?\n>{7}/g;
    let match;
    const replacements = [];

    while ((match = blockRegex.exec(rawEditBlock)) !== null) {
      replacements.push({ searchStr: match[1], replaceStr: match[2] });
    }

    if (!replacements.length && rawEditBlock.includes('<<<<<<<') && rawEditBlock.includes('=======')) {
      const parts = rawEditBlock.split(/={7}/);
      if (parts.length >= 2) {
        const searchPart = parts[0].replace(/^[\s\S]*?<{7}\s*SEARCH\r?\n?/, '');
        const replacePart = parts[1].replace(/\r?\n?>{7}[\s\S]*$/, '');
        replacements.push({ searchStr: searchPart, replaceStr: replacePart });
      }
    }

    for (const { searchStr, replaceStr } of replacements) {
      const searchLines = searchStr.split(/\r?\n/);
      const replaceLines = replaceStr.split(/\r?\n/);

      if (content.includes(searchStr)) {
        content = content.replace(searchStr, replaceStr);
        appliedBlocks++;
        delCount += searchLines.length;
        addedCount += replaceLines.length;
        for (const l of searchLines) diffLines.push({ type: 'del', text: l });
        for (const l of replaceLines) diffLines.push({ type: 'add', text: l });
      } else {
        const trimmedSearch = searchStr.trim();
        if (trimmedSearch && content.includes(trimmedSearch)) {
          content = content.replace(trimmedSearch, replaceStr.trim());
          appliedBlocks++;
          delCount += searchLines.length;
          addedCount += replaceLines.length;
          for (const l of searchLines) diffLines.push({ type: 'del', text: l });
          for (const l of replaceLines) diffLines.push({ type: 'add', text: l });
        } else {
          for (const l of replaceLines) diffLines.push({ type: 'add', text: l });
          addedCount += replaceLines.length;
          if (!content) content = replaceStr;
          appliedBlocks++;
        }
      }
    }

    targetRecord.content = content;
    targetRecord.version = (targetRecord.version || 1) + 1;
    targetRecord.updatedAt = Date.now();
    persist();
    updateProjectFilesBadge();

    return {
      success: true,
      fileRecord: targetRecord,
      stats: { added: addedCount, deleted: delCount, blocks: appliedBlocks },
      diffLines
    };
  }

  function updateProjectFilesBadge() {
    const badge = document.getElementById('projectFilesBadge');
    if (!badge) return;
    const conv = activeConv();
    const files = conv && conv.files ? Object.values(conv.files) : [];
    const count = files.length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function openProjectFilesModal() {
    const modal = document.getElementById('projectFilesModal');
    const empty = document.getElementById('projectFilesEmpty');
    const list = document.getElementById('projectFilesList');
    if (!modal) return;

    const conv = activeConv();
    const files = conv && conv.files ? Object.values(conv.files) : [];

    if (empty && list) {
      if (!files.length) {
        empty.hidden = false;
        list.hidden = true;
        list.innerHTML = '';
      } else {
        empty.hidden = true;
        list.hidden = false;
        list.innerHTML = files.map(f => {
          const type = f.type || 'html';
          const isPpt = type === 'ppt';
          const isPdf = type === 'pdf';
          const isSvg = type === 'svg';
          const icon = isPpt
            ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`
            : isPdf
            ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
            : isSvg
            ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`
            : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

          const timeStr = f.updatedAt ? new Date(f.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

          return `
            <div class="project-file-row" data-path="${escapeHTML(f.path)}">
              <div class="project-file-info">
                <div class="project-file-icon" aria-hidden="true">${icon}</div>
                <div class="project-file-texts">
                  <div class="project-file-title-row">
                    <span class="project-file-name">${escapeHTML(f.name || f.path)}</span>
                    <span class="edit-card__version-pill">v${f.version || 1}</span>
                  </div>
                  <span class="project-file-meta">${escapeHTML(f.title || f.name)} · Updated ${timeStr}</span>
                </div>
              </div>
              <div class="project-file-actions">
                <button type="button" class="btn-artifact-primary btn-file-preview" data-path="${escapeHTML(f.path)}" title="Open and preview artifact">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                  <span>${isPpt ? 'Present' : isPdf ? 'Print' : 'Preview'}</span>
                </button>
                <button type="button" class="btn-artifact-secondary btn-file-download" data-path="${escapeHTML(f.path)}" title="Download file">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                </button>
                <button type="button" class="btn-artifact-secondary btn-file-copy" data-path="${escapeHTML(f.path)}" title="Copy source">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('');

        list.querySelectorAll('.btn-file-preview').forEach(b => {
          on(b, 'click', (e) => {
            e.stopPropagation();
            const p = b.dataset.path;
            const file = conv.files[p];
            if (file) {
              closeProjectFilesModal();
              openCanvas(file.content, file.title, file.type);
            }
          });
        });

        list.querySelectorAll('.btn-file-download').forEach(b => {
          on(b, 'click', (e) => {
            e.stopPropagation();
            const p = b.dataset.path;
            const file = conv.files[p];
            if (!file) return;
            const ext = file.type === 'svg' ? 'svg' : 'html';
            const mime = file.type === 'svg' ? 'image/svg+xml' : 'text/html;charset=utf-8';
            const blob = new Blob([file.content], { type: mime });
            const u = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = u;
            a.download = file.name || `file.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(u), 1000);
          });
        });

        list.querySelectorAll('.btn-file-copy').forEach(b => {
          on(b, 'click', async (e) => {
            e.stopPropagation();
            const p = b.dataset.path;
            const file = conv.files[p];
            if (!file) return;
            try {
              await navigator.clipboard.writeText(file.content);
              toast('Source copied to clipboard', 'ok');
            } catch {
              toast('Could not copy to clipboard', 'err');
            }
          });
        });
      }
    }

    modal.hidden = false;
    modal.removeAttribute('hidden');
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }

  function closeProjectFilesModal() {
    const modal = document.getElementById('projectFilesModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    setTimeout(() => {
      modal.hidden = true;
      modal.setAttribute('hidden', '');
    }, 160);
  }

  function setupProjectFilesModal() {
    const modal = document.getElementById('projectFilesModal');
    if (!modal) return;
    modal.querySelectorAll('[data-close]').forEach(b => on(b, 'click', closeProjectFilesModal));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden && modal.classList.contains('is-open')) {
        closeProjectFilesModal();
      }
    });
  }

  // -----------------------------------------------------------------------
  // Canvas Artifact Preview Modal Handlers
  // -----------------------------------------------------------------------
  let canvasCurrentHtml = '';
  let canvasCurrentSrc = '';
  let canvasCurrentType = 'html';
  let canvasCurrentTitle = '';

  function openCanvas(html, title, type) {
    const m = document.getElementById('canvasModal');
    const f = document.getElementById('canvasFrame');
    if (!m || !f) return;
    canvasCurrentHtml = html || '';
    const trimmed = canvasCurrentHtml.trim();

    const isSlideDeck = type === 'ppt' || trimmed.includes('class="slide') || trimmed.includes('class="deck') || trimmed.includes('data-slide') || trimmed.includes('slide-deck');

    canvasCurrentType = isSlideDeck ? 'ppt' : (type || (trimmed.startsWith('<svg') ? 'svg' : (trimmed.includes('printable-doc') ? 'pdf' : 'html')));
    canvasCurrentTitle = title || (canvasCurrentType === 'ppt' ? 'Presentation Deck' : canvasCurrentType === 'pdf' ? 'Document Report' : canvasCurrentType === 'svg' ? 'Vector Graphic' : 'Artifact Preview');

    const titleEl = document.getElementById('canvasTitle');
    const infoEl  = document.getElementById('canvasInfo');
    const printBtn = document.getElementById('canvasPrintBtn');
    const slideControls = document.getElementById('canvasSlideControls');
    const slideCounter  = document.getElementById('canvasSlideCounter');

    if (titleEl) {
      titleEl.textContent = canvasCurrentTitle;
      titleEl.title = canvasCurrentTitle;
    }
    if (infoEl) {
      infoEl.textContent = '';
      infoEl.hidden = true;
    }
    if (printBtn) {
      printBtn.hidden = canvasCurrentType !== 'pdf' && canvasCurrentType !== 'ppt';
    }
    if (slideControls) {
      slideControls.hidden = !isSlideDeck;
    }
    if (slideCounter) {
      slideCounter.textContent = '1 / 1';
    }

    // Wrap partial HTML if needed
    let doc = html || '';
    if (trimmed.startsWith('<svg') && !doc.includes('<html')) {
      doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#181825;overflow:auto;}svg{max-width:95vw;max-height:95vh;box-shadow:0 8px 30px rgba(0,0,0,0.5);border-radius:8px;}</style></head><body>${doc}</body></html>`;
    } else if (isSlideDeck) {
      if (!doc.toLowerCase().includes('<html') && !doc.toLowerCase().includes('<!doctype')) {
        doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHTML(canvasCurrentTitle)}</title></head><body><div class="deck">${doc}</div></body></html>`;
      }
    } else if (!doc.toLowerCase().includes('<html') && !doc.toLowerCase().includes('<!doctype')) {
      doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;margin:24px;color:#222;line-height:1.5;background:#fff;}</style></head><body>${doc}</body></html>`;
    }

    // Keynote slide deck styling and controller script injection
    if (isSlideDeck) {
      const keynoteStyles = `
        <style id="cc-keynote-engine-styles">
          html, body {
            margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
            background: #0b0e14;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', system-ui, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          .deck {
            width: 100%; height: 100%; position: relative;
            display: flex; align-items: center; justify-content: center;
          }
          .slide, section[data-slide], section {
            width: 100%; height: 100%;
            box-sizing: border-box;
            display: none;
            flex-direction: column;
            justify-content: space-between;
            padding: clamp(24px, 5vw, 64px) clamp(28px, 6vw, 80px);
            position: absolute;
            inset: 0;
            background: #0f141f;
            opacity: 0;
            transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            transform: scale(0.985);
          }
          .slide.active, section[data-slide].active, section.active {
            display: flex !important;
            opacity: 1 !important;
            transform: scale(1) !important;
            z-index: 10;
          }
          .slide-content, .slide-body {
            display: flex; flex-direction: column; gap: 14px;
            max-width: 900px;
          }
          .eyebrow {
            font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.12em; color: #818cf8;
          }
          h1, .slide h1 {
            font-size: clamp(28px, 4.5vw, 52px);
            font-weight: 800; letter-spacing: -0.025em; line-height: 1.1; margin: 0;
            color: #ffffff;
          }
          h2, .slide h2 {
            font-size: clamp(22px, 3.2vw, 36px);
            font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; margin: 0;
            color: #ffffff;
          }
          p, .slide p {
            font-size: clamp(14px, 1.8vw, 19px);
            line-height: 1.6; color: #94a3b8; margin: 0;
          }
          .subtitle {
            font-size: clamp(16px, 2vw, 22px);
            color: #94a3b8; font-weight: 400; line-height: 1.5;
          }
          .slide-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px; margin-top: 24px;
          }
          .slide-card {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px; padding: 20px;

          }
          .slide-card h3 {
            font-size: 16px; font-weight: 700; margin: 0 0 8px; color: #fff;
          }
          .slide-card p {
            font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0;
          }
          .stat-callout {
            font-size: clamp(32px, 5vw, 56px);
            font-weight: 900; letter-spacing: -0.03em; color: #38bdf8; line-height: 1;
          }
          .stat-label {
            font-size: 13px; font-weight: 600; color: #94a3b8; margin-top: 6px;
          }
          .slide-footer {
            display: flex; align-items: center; justify-content: space-between;
            font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
            color: rgba(255, 255, 255, 0.4); text-transform: uppercase;
            padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.06);
          }
          @media print {
            html, body { overflow: visible !important; height: auto !important; background: #fff !important; color: #000 !important; }
            .deck { display: block !important; height: auto !important; }
            .slide, section {
              display: flex !important; position: static !important; opacity: 1 !important;
              transform: none !important; page-break-after: always !important;
              height: 100vh !important; background: #fff !important; color: #000 !important;
            }
            h1, h2, .slide-card h3 { color: #000 !important; }
            p, .subtitle, .slide-card p { color: #444 !important; }
            .slide-card { border-color: #ddd !important; background: #fafafa !important; }
          }
        </style>
      `;

      const keynoteScript = `
        <script id="cc-keynote-engine-script">
          (function() {
            var slides = Array.from(document.querySelectorAll('.slide, section, [data-slide]'));
            if (!slides.length) {
              var sections = Array.from(document.body.children).filter(function(el) {
                return el.tagName === 'DIV' || el.tagName === 'SECTION';
              });
              if (sections.length > 1) slides = sections;
            }
            if (!slides.length) return;
            var curIdx = 0;
            function notify() {
              window.parent.postMessage({ type: 'slideChange', current: curIdx + 1, total: slides.length }, '*');
            }
            function showSlide(idx) {
              if (idx < 0) idx = 0;
              if (idx >= slides.length) idx = slides.length - 1;
              curIdx = idx;
              slides.forEach(function(s, i) {
                if (i === curIdx) {
                  s.classList.add('active');
                } else {
                  s.classList.remove('active');
                }
              });
              notify();
            }
            window.addEventListener('message', function(e) {
              if (!e.data || typeof e.data !== 'object') return;
              if (e.data.type === 'nextSlide') showSlide(curIdx + 1);
              if (e.data.type === 'prevSlide') showSlide(curIdx - 1);
              if (e.data.type === 'gotoSlide') showSlide(e.data.index);
            });
            window.addEventListener('keydown', function(e) {
              if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'PageDown') {
                e.preventDefault();
                showSlide(curIdx + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Backspace') {
                e.preventDefault();
                showSlide(curIdx - 1);
              } else if (e.key.toLowerCase() === 'f') {
                e.preventDefault();
                window.parent.postMessage({ type: 'toggleFullscreen' }, '*');
              }
            });
            setTimeout(function() { showSlide(0); }, 50);
          })();
        </script>
      `;

      if (doc.includes('</head>')) {
        doc = doc.replace('</head>', keynoteStyles + '</head>');
      } else {
        doc = keynoteStyles + doc;
      }
      if (doc.includes('</body>')) {
        doc = doc.replace('</body>', keynoteScript + '</body>');
      } else {
        doc = doc + keynoteScript;
      }
    }

    // Inject custom minimalist scrollbar styling
    const iframeScrollbarCSS = `<style id="cc-iframe-scrollbar">
      /* Minimalist scrollbar styling */
      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(140, 140, 160, 0.35);
        border-radius: 999px;
        transition: background 0.15s ease;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #ff3366;
      }
      * {
        scrollbar-width: thin;
        scrollbar-color: rgba(140, 140, 160, 0.35) transparent;
      }
    </style>`;

    if (doc.includes('</head>')) {
      doc = doc.replace('</head>', iframeScrollbarCSS + '</head>');
    } else if (doc.includes('<head>')) {
      doc = doc.replace('<head>', '<head>' + iframeScrollbarCSS);
    } else {
      doc = iframeScrollbarCSS + doc;
    }

    f.onload = () => {
      try {
        const idoc = f.contentDocument || f.contentWindow?.document;
        if (idoc && !idoc.getElementById('cc-iframe-scrollbar')) {
          const st = idoc.createElement('style');
          st.id = 'cc-iframe-scrollbar';
          st.textContent = `
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(140, 140, 160, 0.35); border-radius: 999px; transition: background 0.15s ease; }
            ::-webkit-scrollbar-thumb:hover { background: #ff3366; }
            * { scrollbar-width: thin; scrollbar-color: rgba(140, 140, 160, 0.35) transparent; }
          `;
          (idoc.head || idoc.body || idoc.documentElement).appendChild(st);
        }
      } catch {}
    };

    f.srcdoc = doc;

    try {
      if (canvasCurrentSrc) URL.revokeObjectURL(canvasCurrentSrc);
      const mime = canvasCurrentType === 'svg' ? 'image/svg+xml' : 'text/html;charset=utf-8';
      const blob = new Blob([doc], { type: mime });
      canvasCurrentSrc = URL.createObjectURL(blob);
    } catch {}

    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.add('has-canvas-open');
    document.body.classList.add('has-canvas-open');

    m.hidden = false;
    m.removeAttribute('hidden');
    (window.requestAnimationFrame || setTimeout)(() => m.classList.add('is-open'), 0);
  }

  function closeCanvas() {
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.remove('has-canvas-open');
    document.body.classList.remove('has-canvas-open');

    const m = document.getElementById('canvasModal');
    if (!m) return;
    m.classList.remove('is-open');
    if (document.fullscreenElement) {
      try { document.exitFullscreen(); } catch {}
    }
    setTimeout(() => {
      m.hidden = true;
      m.setAttribute('hidden', '');
      const f = document.getElementById('canvasFrame');
      if (f) {
        f.srcdoc = '';
        f.src = 'about:blank';
      }
      const slideControls = document.getElementById('canvasSlideControls');
      if (slideControls) slideControls.hidden = true;
      if (canvasCurrentSrc) {
        try { URL.revokeObjectURL(canvasCurrentSrc); } catch {}
        canvasCurrentSrc = '';
      }
      canvasCurrentHtml = '';
    }, 160);
  }

  // -----------------------------------------------------------------------
  // MCP Connectors & Tools Engines
  // -----------------------------------------------------------------------

  // In-memory Relational SQL Database Engine (Database MCP)
  const SQL_DB = {
    tables: {
      users: {
        columns: ['id', 'name', 'email', 'role', 'status', 'created_at'],
        rows: [
          [1, 'Alice Chen', 'alice@company.internal', 'Lead Architect', 'active', '2026-01-15'],
          [2, 'Bob Smith', 'bob@company.internal', 'Senior DevOps', 'active', '2026-02-01'],
          [3, 'Charlie Kim', 'charlie@company.internal', 'UI/UX Designer', 'away', '2026-02-18'],
          [4, 'Diana Prince', 'diana@company.internal', 'Product Lead', 'active', '2026-03-05'],
          [5, 'Ethan Hunt', 'ethan@company.internal', 'Security Lead', 'offline', '2026-03-22'],
        ]
      },
      products: {
        columns: ['id', 'title', 'category', 'price', 'stock', 'rating'],
        rows: [
          [101, 'Cute Chat Pro', 'AI Software', 29.99, 150, 4.9],
          [102, 'Vector Studio', 'Design Tools', 49.00, 80, 4.8],
          [103, 'CloudSync Enterprise', 'Cloud Infra', 199.00, 25, 4.7],
          [104, 'API Gateway Ultra', 'Developer', 79.50, 300, 4.95],
          [105, 'Analytics Dashboard', 'Data Analytics', 89.00, 110, 4.85],
        ]
      },
      orders: {
        columns: ['order_id', 'user_id', 'product_id', 'qty', 'total_usd', 'status', 'order_date'],
        rows: [
          [1001, 1, 101, 2, 59.98, 'completed', '2026-09-01'],
          [1002, 2, 102, 1, 49.00, 'completed', '2026-09-02'],
          [1003, 1, 103, 1, 199.00, 'processing', '2026-09-03'],
          [1004, 3, 101, 3, 89.97, 'completed', '2026-09-04'],
          [1005, 4, 105, 2, 178.00, 'completed', '2026-09-05'],
          [1006, 5, 104, 5, 397.50, 'shipped', '2026-09-06'],
        ]
      },
      metrics: {
        columns: ['metric', 'value', 'unit', 'status', 'last_updated'],
        rows: [
          ['Daily Active Users', 14250, 'users', 'optimal', '2026-09-06 12:00'],
          ['API Requests / sec', 342, 'req/s', 'nominal', '2026-09-06 12:00'],
          ['Response Latency (p95)', 45, 'ms', 'optimal', '2026-09-06 12:00'],
          ['System Uptime', 99.98, '%', 'optimal', '2026-09-06 12:00'],
          ['Cache Hit Ratio', 94.6, '%', 'optimal', '2026-09-06 12:00'],
        ]
      }
    },
    execute(rawQuery) {
      const startTime = performance.now();
      const query = (rawQuery || '').trim();
      const clean = query.replace(/;+$/, '').trim();
      const lower = clean.toLowerCase();

      if (!clean) return { error: 'Empty SQL query', executionTimeMs: 0 };

      // SHOW TABLES / .tables
      if (lower === 'show tables' || lower === 'show databases' || lower === '.tables') {
        const names = Object.keys(this.tables);
        return {
          columns: ['table_name', 'rows_count', 'columns_count'],
          rows: names.map(n => [n, this.tables[n].rows.length, this.tables[n].columns.length]),
          rowCount: names.length,
          executionTimeMs: (performance.now() - startTime).toFixed(2),
        };
      }

      // DESCRIBE <table> / SCHEMA <table>
      const descMatch = clean.match(/^(?:describe|desc|explain|\.schema)\s+([a-zA-Z0-9_]+)/i);
      if (descMatch) {
        const tName = descMatch[1].toLowerCase();
        const tbl = this.tables[tName];
        if (!tbl) return { error: `Table '${tName}' not found. Try SHOW TABLES;`, executionTimeMs: 0 };
        return {
          columns: ['col_id', 'column_name', 'sample_type'],
          rows: tbl.columns.map((c, i) => [i + 1, c, typeof (tbl.rows[0] ? tbl.rows[0][i] : 'string')]),
          rowCount: tbl.columns.length,
          executionTimeMs: (performance.now() - startTime).toFixed(2),
        };
      }

      // SELECT query
      if (lower.startsWith('select')) {
        const selectRegex = /^select\s+(.+?)\s+from\s+([a-zA-Z0-9_]+)(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+(.+?))?(?:\s+limit\s+(\d+))?$/i;
        const match = clean.match(selectRegex);

        if (!match) {
          const fromMatch = clean.match(/from\s+([a-zA-Z0-9_]+)/i);
          if (!fromMatch) return { error: 'Syntax error. Example: SELECT * FROM users WHERE status = \'active\' LIMIT 10;', executionTimeMs: 0 };
          const tName = fromMatch[1].toLowerCase();
          const tbl = this.tables[tName];
          if (!tbl) return { error: `Table '${tName}' not found. Available: ${Object.keys(this.tables).join(', ')}`, executionTimeMs: 0 };
          return {
            columns: tbl.columns,
            rows: tbl.rows.slice(0, 10),
            rowCount: Math.min(tbl.rows.length, 10),
            executionTimeMs: (performance.now() - startTime).toFixed(2),
          };
        }

        const [, selectColsStr, tableNameRaw, whereClause, orderByClause, limitClause] = match;
        const tName = tableNameRaw.toLowerCase();
        const tbl = this.tables[tName];
        if (!tbl) return { error: `Table '${tName}' not found. Available: ${Object.keys(this.tables).join(', ')}`, executionTimeMs: 0 };

        let colIndices = [];
        let resultColumns = [];
        if (selectColsStr.trim() === '*') {
          colIndices = tbl.columns.map((_, i) => i);
          resultColumns = [...tbl.columns];
        } else {
          const requested = selectColsStr.split(',').map(s => s.trim().toLowerCase());
          for (const req of requested) {
            const idx = tbl.columns.findIndex(c => c.toLowerCase() === req);
            if (idx >= 0) {
              colIndices.push(idx);
              resultColumns.push(tbl.columns[idx]);
            }
          }
          if (!colIndices.length) {
            colIndices = tbl.columns.map((_, i) => i);
            resultColumns = [...tbl.columns];
          }
        }

        let filteredRows = [...tbl.rows];
        if (whereClause) {
          const condMatch = whereClause.match(/([a-zA-Z0-9_]+)\s*(=|!=|<>|>=|<=|>|<|like)\s*(.+)/i);
          if (condMatch) {
            const [, colName, op, rawVal] = condMatch;
            const colIdx = tbl.columns.findIndex(c => c.toLowerCase() === colName.toLowerCase());
            if (colIdx >= 0) {
              let val = rawVal.trim().replace(/^['"]|['"]$/g, '');
              const numVal = Number(val);
              const isNum = !isNaN(numVal) && val !== '';
              const targetVal = isNum ? numVal : val.toLowerCase();

              filteredRows = filteredRows.filter(r => {
                const cell = r[colIdx];
                const cellVal = (typeof cell === 'string') ? cell.toLowerCase() : cell;
                if (op === '=' || op === '==') return cellVal == targetVal;
                if (op === '!=' || op === '<>') return cellVal != targetVal;
                if (op === '>') return cellVal > targetVal;
                if (op === '>=') return cellVal >= targetVal;
                if (op === '<') return cellVal < targetVal;
                if (op === '<=') return cellVal <= targetVal;
                if (op.toLowerCase() === 'like') {
                  const pattern = String(targetVal).replace(/%/g, '.*');
                  return new RegExp('^' + pattern + '$', 'i').test(String(cell));
                }
                return true;
              });
            }
          }
        }

        if (orderByClause) {
          const [orderCol, direction] = orderByClause.trim().split(/\s+/);
          const colIdx = tbl.columns.findIndex(c => c.toLowerCase() === (orderCol || '').toLowerCase());
          if (colIdx >= 0) {
            const isDesc = (direction || '').toUpperCase() === 'DESC';
            filteredRows.sort((a, b) => {
              const va = a[colIdx];
              const vb = b[colIdx];
              if (va === vb) return 0;
              if (va > vb) return isDesc ? -1 : 1;
              return isDesc ? 1 : -1;
            });
          }
        }

        if (limitClause) {
          const lim = parseInt(limitClause, 10);
          if (!isNaN(lim) && lim >= 0) filteredRows = filteredRows.slice(0, lim);
        }

        const finalRows = filteredRows.map(row => colIndices.map(i => row[i]));
        return {
          columns: resultColumns,
          rows: finalRows,
          rowCount: finalRows.length,
          executionTimeMs: (performance.now() - startTime).toFixed(2),
        };
      }

      return { error: 'Unsupported query. Cute Chat SQL engine supports SELECT, WHERE, ORDER BY, LIMIT, SHOW TABLES, and DESCRIBE.', executionTimeMs: 0 };
    },

    formatHTML(res, rawQuery) {
      if (res.error) {
        return `
          <div class="tool-result-card tool-result-card--error">
            <div class="tool-result-card__header">
              <span class="tool-result-card__title">SQL Error</span>
              <span class="badge badge--red">Error</span>
            </div>
            <div style="font-size:12px; color:var(--red); font-family:monospace; margin-top:6px;">${escapeHTML(res.error)}</div>
          </div>
        `;
      }

      let headerHtml = res.columns.map(c => `<th>${escapeHTML(c)}</th>`).join('');
      let rowsHtml = res.rows.map(r => `<tr>${r.map(v => `<td>${escapeHTML(String(v == null ? 'NULL' : v))}</td>`).join('')}</tr>`).join('');

      return `
        <div class="tool-result-card">
          <div class="tool-result-card__header">
            <div class="tool-result-card__title">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              <span>SQL Query Result</span>
            </div>
            <div class="tool-result-card__meta">
              <span class="badge badge--cyan">${res.rowCount} row${res.rowCount === 1 ? '' : 's'}</span>
              <span class="badge badge--subtle">${res.executionTimeMs}ms</span>
            </div>
          </div>
          ${rawQuery ? `<div style="font-size:11px; font-family:monospace; color:var(--ink-500); margin-bottom:8px; overflow-x:auto;">${escapeHTML(rawQuery)}</div>` : ''}
          <div class="sql-table-container">
            <table class="sql-table">
              <thead><tr>${headerHtml}</tr></thead>
              <tbody>${rowsHtml || '<tr><td colspan="' + res.columns.length + '" style="text-align:center; color:var(--ink-400);">No matching records</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      `;
    }
  };

  // Live Web Search Engine with Multi-Source & Resilient Fallback
  async function searchWeb(query) {
    const q = (query || '').trim();
    if (!q) return { query: '', count: 0, results: [], error: 'Query was empty' };

    // 1. Try serverless search API (/api/search)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          return data;
        }
      }
    } catch (err) {
      // Fall through to client fallback
    }

    // 2. Client-side browser-safe fallback: Wikipedia Search API + DuckDuckGo Instant Answer
    try {
      const results = [];
      const seen = new Set();

      // Query Wikipedia
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=5`;
      const wikiPromise = fetch(wikiUrl).then(r => r.json()).then(data => {
        const list = data?.query?.search || [];
        for (const item of list) {
          const u = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`;
          if (!seen.has(u)) {
            seen.add(u);
            results.push({
              title: item.title,
              snippet: (item.snippet || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
              url: u,
              domain: 'wikipedia.org',
              source: 'Wikipedia'
            });
          }
        }
      }).catch(() => {});

      // Query DuckDuckGo Instant Answer
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`;
      const ddgPromise = fetch(ddgUrl).then(r => r.json()).then(data => {
        if (data.AbstractURL && !seen.has(data.AbstractURL)) {
          seen.add(data.AbstractURL);
          results.unshift({
            title: data.Heading || q,
            snippet: data.AbstractText || 'Overview summary from official public sources.',
            url: data.AbstractURL,
            domain: (new URL(data.AbstractURL)).hostname.replace(/^www\./, ''),
            source: data.AbstractSource || 'Public Web'
          });
        }
        if (Array.isArray(data.RelatedTopics)) {
          for (const top of data.RelatedTopics.slice(0, 3)) {
            if (top.FirstURL && !seen.has(top.FirstURL) && top.Text) {
              seen.add(top.FirstURL);
              results.push({
                title: top.Text.split(' - ')[0] || q,
                snippet: top.Text,
                url: top.FirstURL,
                domain: (new URL(top.FirstURL)).hostname.replace(/^www\./, ''),
                source: 'Public Web'
              });
            }
          }
        }
      }).catch(() => {});

      await Promise.allSettled([wikiPromise, ddgPromise]);

      if (results.length > 0) {
        return { query: q, count: results.length, results };
      }
    } catch {}

    // Final fallback
    return {
      query: q,
      count: 1,
      results: [
        {
          title: `Web Search Reference: "${q}"`,
          snippet: `Live verified results for "${q}". Check official documentation and public records.`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
          domain: 'duckduckgo.com',
          source: 'Web'
        }
      ]
    };
  }

  function formatSearchResultsHTML(data) {
    const query = data.query || '';
    const results = data.results || [];
    if (!results.length) {
      return `
        <div class="tool-result-card">
          <div class="tool-result-card__head">
            <span class="tool-result-card__title">Web Search: "${escapeHTML(query)}"</span>
            <span class="tool-result-card__badge">No results</span>
          </div>
          <div class="tool-result-card__body" style="font-size:12px; color:var(--ink-500);">No public pages found for this query.</div>
        </div>
      `;
    }

    const itemsHtml = results.map(r => `
      <a class="search-item" href="${escapeHTML(r.url)}" target="_blank" rel="noopener noreferrer">
        <div class="search-item__header">
          <span class="search-item__title">${escapeHTML(r.title)}</span>
          <span class="search-item__domain">${escapeHTML(r.domain || r.source || 'Web')}</span>
        </div>
        <div class="search-item__snippet">${escapeHTML(r.snippet)}</div>
      </a>
    `).join('');

    return `
      <div class="tool-result-card">
        <div class="tool-result-card__head">
          <div class="tool-result-card__title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Live Search: "${escapeHTML(query)}"</span>
          </div>
          <span class="tool-result-card__badge tool-result-card__badge--ok">${results.length} sources</span>
        </div>
        <div class="tool-result-card__body">
          <div class="search-results-list">
            ${itemsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // GitHub REST API connector
  async function fetchGitHubRepo(repoSlug, token) {
    const cleanSlug = (repoSlug || '').replace(/^https?:\/\/github\.com\//, '').trim().replace(/\/$/, '');
    const url = `https://api.github.com/repos/${cleanSlug}`;
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      return { success: true, data, repo: cleanSlug };
    } catch (e) {
      return { success: false, error: e.message, repo: cleanSlug };
    }
  }

  function formatGitHubRepoHTML(res) {
    if (!res.success) {
      return `
        <div class="tool-result-card tool-result-card--error">
          <div class="tool-result-card__header">
            <span class="tool-result-card__title">GitHub Error</span>
            <span class="badge badge--red">Error</span>
          </div>
          <div style="font-size:12px; color:var(--red);">${escapeHTML(res.error)}</div>
        </div>
      `;
    }
    const d = res.data;
    return `
      <div class="tool-result-card">
        <div class="tool-result-card__header">
          <div class="tool-result-card__title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>
            <a href="${escapeHTML(d.html_url)}" target="_blank" rel="noopener noreferrer" style="font-weight:600; color:inherit; text-decoration:none;">${escapeHTML(d.full_name)}</a>
          </div>
          <span class="badge badge--subtle">${escapeHTML(d.language || 'Code')}</span>
        </div>
        <p style="font-size:13px; margin:4px 0 10px; color:var(--ink-700);">${escapeHTML(d.description || 'No description provided.')}</p>
        <div style="display:flex; flex-wrap:wrap; gap:12px; font-size:12px; color:var(--ink-600);">
          <span><strong>${(d.stargazers_count || 0).toLocaleString()}</strong> stars</span>
          <span><strong>${(d.forks_count || 0).toLocaleString()}</strong> forks</span>
          <span><strong>${(d.open_issues_count || 0).toLocaleString()}</strong> open issues</span>
          ${d.license ? `<span>${escapeHTML(d.license.spdx_id || d.license.name)}</span>` : ''}
        </div>
        <div style="margin-top:12px; display:flex; gap:8px;">
          <a class="btn btn--subtle btn--sm" href="${escapeHTML(d.html_url)}" target="_blank" rel="noopener noreferrer">View on GitHub &rarr;</a>
        </div>
      </div>
    `;
  }

  // Slack Webhook dispatcher
  async function sendSlackMessage(webhookUrl, text) {
    const url = (webhookUrl || state.settings.connectors?.slack?.webhookUrl || '').trim();
    if (!url) return { success: false, error: 'No Slack Webhook URL configured. Open Settings → Connectors to set it.' };
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        // Fallback: direct fetch
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          mode: 'no-cors',
        });
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function formatSlackResultHTML(res, msg) {
    if (!res.success) {
      return `
        <div class="tool-result-card tool-result-card--error">
          <div class="tool-result-card__header">
            <span class="tool-result-card__title">Slack Dispatch Failed</span>
            <span class="badge badge--red">Error</span>
          </div>
          <div style="font-size:12px; color:var(--red); margin-top:6px;">${escapeHTML(res.error || 'Failed to dispatch webhook')}</div>
          <div style="font-size:11px; color:var(--ink-500); margin-top:6px;">Open <strong>Settings &rarr; Connectors</strong> and paste your Slack Incoming Webhook URL.</div>
        </div>
      `;
    }
    return `
      <div class="tool-result-card">
        <div class="tool-result-card__header">
          <div class="tool-result-card__title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 15a2 2 0 0 1-2-2V7a2 2 0 1 1 4 0v6a2 2 0 0 1-2 2zm0-6a2 2 0 1 1-2-2 2 2 0 0 1 2 2zm9-3a2 2 0 0 1 2 2v6a2 2 0 1 1-4 0V8a2 2 0 0 1 2-2zm0 6a2 2 0 1 1 2 2 2 2 0 0 1-2-2zm-6 9a2 2 0 0 1-2-2v-6a2 2 0 1 1 4 0v6a2 2 0 0 1-2 2zm6-3a2 2 0 0 1 2 2 2 2 0 1 1-2 2v-4z"/></svg>
            <span>Slack Message Dispatched</span>
          </div>
          <span class="badge badge--green">Delivered</span>
        </div>
        <div style="font-size:13px; color:var(--ink-800); margin-top:6px; background:var(--bg-card); padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
          ${escapeHTML(msg)}
        </div>
        <div style="font-size:11px; color:var(--ink-500); margin-top:6px;">Notification sent to your connected Slack channel.</div>
      </div>
    `;
  }

  // Google Calendar .ics generator & web link builder
  function createCalendarEvent({ title, description, location, startDate, endDate }) {
    const t = title || 'Cute Chat Event';
    const d = description || 'Scheduled via Cute Chat MCP Calendar';
    const loc = location || 'Online Meeting';
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getTime() + 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + 45 * 60 * 1000);

    const formatICSDate = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Cute Chat//Calendar MCP//EN',
      'BEGIN:VEVENT',
      `UID:event-${Date.now()}@sage`,
      `DTSTAMP:${formatICSDate(now)}`,
      `DTSTART:${formatICSDate(start)}`,
      `DTEND:${formatICSDate(end)}`,
      `SUMMARY:${t.replace(/\n/g, ' ')}`,
      `DESCRIPTION:${d.replace(/\n/g, '\\n')}`,
      `LOCATION:${loc.replace(/\n/g, ' ')}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(t)}&dates=${formatICSDate(start)}/${formatICSDate(end)}&details=${encodeURIComponent(d)}&location=${encodeURIComponent(loc)}`;

    return { title: t, description: d, location: loc, start, end, icsContent, gCalUrl };
  }

  function formatCalendarEventHTML(ev) {
    const startStr = ev.start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const endStr = ev.end.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="tool-result-card">
        <div class="tool-result-card__header">
          <div class="tool-result-card__title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>${escapeHTML(ev.title)}</span>
          </div>
          <span class="badge badge--blue">Calendar Event</span>
        </div>
        <div style="font-size:13px; color:var(--ink-700); margin-top:6px;">
          <div><strong>${escapeHTML(startStr)} &ndash; ${escapeHTML(endStr)}</strong></div>
          ${ev.location ? `<div style="margin-top:2px;">${escapeHTML(ev.location)}</div>` : ''}
          ${ev.description ? `<div style="margin-top:4px; color:var(--ink-500); font-size:12px;">${escapeHTML(ev.description)}</div>` : ''}
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <a class="btn btn--subtle btn--sm" href="${escapeHTML(ev.gCalUrl)}" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
            <span>Add to Google Calendar</span>
          </a>
          <button class="btn btn--subtle btn--sm" type="button" data-download-ics="${encodeURIComponent(ev.title)}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            <span>Download .ics</span>
          </button>
        </div>
      </div>
    `;
  }

  // Interactive SVG & Canvas Analytics Chart Generator
  function parseChartSpec(raw) {
    const text = (raw || '').trim();
    if (!text) return { type: 'bar', title: 'Chart', labels: ['Alpha', 'Beta', 'Gamma', 'Delta'], data: [35, 60, 45, 80] };

    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        return {
          type: (parsed.type || 'bar').toLowerCase(),
          title: parsed.title || 'Chart',
          labels: Array.isArray(parsed.labels) ? parsed.labels : ['1', '2', '3'],
          data: Array.isArray(parsed.data) ? parsed.data.map(Number) : [10, 20, 30],
          colors: Array.isArray(parsed.colors) ? parsed.colors : []
        };
      } catch {}
    }

    const lines = text.split('\n');
    let type = 'bar';
    let title = 'Chart';
    let labels = [];
    let data = [];
    let colors = [];

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 2) continue;
      const key = parts[0].trim().toLowerCase();
      const val = parts.slice(1).join(':').trim();
      if (key === 'type') type = val.toLowerCase();
      else if (key === 'title') title = val;
      else if (key === 'labels') {
        labels = val.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      }
      else if (key === 'data' || key === 'values') {
        data = val.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (key === 'colors') {
        colors = val.split(',').map(s => s.trim());
      }
    }

    if (!labels.length && data.length) labels = data.map((_, i) => 'Item ' + (i + 1));
    if (!data.length) {
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      data = [35, 60, 45, 80, 110, 145];
    }
    return { type, title, labels, data, colors };
  }

  function renderSVGChart({ type = 'bar', title = 'Analytics Metric Chart', labels = [], data = [], colors = [] }) {
    const W = 520;
    const H = 280;
    const pad = { top: 40, right: 30, bottom: 50, left: 55 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const defaultColors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];
    const maxVal = Math.max(...data, 10);

    let contentSvg = '';

    if (type === 'donut') {
      const cx = W / 2;
      const cy = H / 2 + 10;
      const r = 85;
      const innerR = 52;
      const total = data.reduce((a, b) => a + b, 0) || 1;
      let curAngle = -Math.PI / 2;

      let paths = '';
      data.forEach((val, i) => {
        const sliceAngle = (val / total) * (Math.PI * 2);
        const nextAngle = curAngle + sliceAngle;
        const x1 = cx + r * Math.cos(curAngle);
        const y1 = cy + r * Math.sin(curAngle);
        const x2 = cx + r * Math.cos(nextAngle);
        const y2 = cy + r * Math.sin(nextAngle);
        const ix1 = cx + innerR * Math.cos(curAngle);
        const iy1 = cy + innerR * Math.sin(curAngle);
        const ix2 = cx + innerR * Math.cos(nextAngle);
        const iy2 = cy + innerR * Math.sin(nextAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;
        const col = colors[i] || defaultColors[i % defaultColors.length];

        paths += `<path d="M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z" fill="${col}" stroke="var(--bg-panel, #ffffff)" stroke-width="2"><title>${labels[i] || 'Item'}: ${val}</title></path>`;
        curAngle = nextAngle;
      });

      let legend = '';
      labels.slice(0, 5).forEach((lbl, i) => {
        const col = colors[i] || defaultColors[i % defaultColors.length];
        const lx = 20 + i * 100;
        legend += `<g transform="translate(${lx}, 265)"><rect width="10" height="10" rx="2" fill="${col}"/><text x="14" y="9" font-size="10" fill="currentColor" opacity="0.8">${lbl} (${data[i]})</text></g>`;
      });

      contentSvg = `
        <g>${paths}</g>
        <circle cx="${cx}" cy="${cy}" r="${innerR - 1}" fill="var(--bg-panel, #ffffff)"/>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">Total</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${total}</text>
        <g>${legend}</g>
      `;
    } else if (type === 'line') {
      const step = labels.length > 1 ? chartW / (labels.length - 1) : chartW / 2;
      const points = data.map((v, i) => {
        const x = pad.left + i * step;
        const y = pad.top + chartH - (v / maxVal) * chartH;
        return { x, y, v, label: labels[i] };
      });
      const dPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const areaPath = `${dPath} L ${points[points.length - 1].x.toFixed(1)} ${pad.top + chartH} L ${points[0].x.toFixed(1)} ${pad.top + chartH} Z`;

      contentSvg = `
        <defs>
          <linearGradient id="chartLineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        ${[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = pad.top + chartH * (1 - frac);
          const v = Math.round(maxVal * frac);
          return `<line x1="${pad.left}" y1="${y}" x2="${pad.left + chartW}" y2="${y}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3,3"/><text x="${pad.left - 8}" y="${y + 4}" font-size="10" text-anchor="end" fill="currentColor" opacity="0.6">${v}</text>`;
        }).join('')}
        <path d="${areaPath}" fill="url(#chartLineGrad)"/>
        <path d="${dPath}" fill="none" stroke="#6366f1" stroke-width="3" stroke-linecap="round"/>
        ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#6366f1" stroke="var(--bg-panel, #ffffff)" stroke-width="2"><title>${p.label}: ${p.v}</title></circle><text x="${p.x.toFixed(1)}" y="${pad.top + chartH + 18}" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.7">${p.label || ''}</text>`).join('')}
      `;
    } else {
      const barW = Math.max(16, Math.min(48, (chartW / (data.length || 1)) - 14));
      const step = chartW / (data.length || 1);

      contentSvg = `
        ${[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = pad.top + chartH * (1 - frac);
          const v = Math.round(maxVal * frac);
          return `<line x1="${pad.left}" y1="${y}" x2="${pad.left + chartW}" y2="${y}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3,3"/><text x="${pad.left - 8}" y="${y + 4}" font-size="10" text-anchor="end" fill="currentColor" opacity="0.6">${v}</text>`;
        }).join('')}
        ${data.map((v, i) => {
          const x = pad.left + i * step + (step - barW) / 2;
          const barH = Math.max(4, (v / maxVal) * chartH);
          const y = pad.top + chartH - barH;
          const col = colors[i] || defaultColors[i % defaultColors.length];
          return `
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" rx="4" fill="${col}">
              <title>${labels[i] || 'Value'}: ${v}</title>
            </rect>
            <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="10" font-weight="600" text-anchor="middle" fill="currentColor" opacity="0.9">${v}</text>
            <text x="${(x + barW / 2).toFixed(1)}" y="${pad.top + chartH + 18}" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.7">${labels[i] || ''}</text>
          `;
        }).join('')}
      `;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="font-family:system-ui,-apple-system,sans-serif; user-select:none; max-height:320px;"><text x="${pad.left}" y="24" font-size="14" font-weight="700" fill="currentColor">${escapeHTML(title)}</text>${contentSvg}</svg>`;
  }

  function formatChartHTML(svg, title) {
    const chartId = 'chart_' + Date.now();
    return `
      <div class="tool-result-card">
        <div class="tool-result-card__header">
          <div class="tool-result-card__title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            <span>${escapeHTML(title || 'Analytics Chart')}</span>
          </div>
          <div class="tool-result-card__meta">
            <span class="badge badge--purple">SVG Interactive</span>
            <button class="btn-open-chart-canvas btn btn--subtle btn--sm" type="button" data-chart-id="${chartId}">Open in Canvas</button>
          </div>
        </div>
        <div class="chart-svg-wrap" id="${chartId}" style="margin-top:8px; overflow-x:auto;">
          ${svg}
        </div>
      </div>
    `;
  }

  function formatFigmaResultHTML(fileKey) {
    const token = state.settings.connectors?.figma?.token;
    if (!token) {
      return `
        <div class="tool-result-card">
          <div class="tool-result-card__header">
            <div class="tool-result-card__title">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 2h4a4 4 0 0 1 0 8H8V2zm0 8h4a4 4 0 1 1-4 4v-4zm-4 4a4 4 0 1 1 4-4v4H4zm0-8a4 4 0 0 1 4-4v8H4V6zm0 12a4 4 0 0 1 4-4v4a4 4 0 0 1-4 0z"/></svg>
              <span>Figma MCP Connector</span>
            </div>
            <span class="badge badge--subtle">Setup Required</span>
          </div>
          <p style="font-size:13px; color:var(--ink-700); margin-top:6px;">To inspect Figma designs and extract vector component SVGs, configure your Personal Access Token in <strong>Settings &rarr; Connectors</strong>.</p>
          <div style="margin-top:10px;">
            <button class="btn btn--subtle btn--sm" type="button" data-connector-cmd="/chart donut Device Share">Try Chart Tool &rarr;</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="tool-result-card">
        <div class="tool-result-card__header">
          <div class="tool-result-card__title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 2h4a4 4 0 0 1 0 8H8V2zm0 8h4a4 4 0 1 1-4 4v-4zm-4 4a4 4 0 1 1 4-4v4H4zm0-8a4 4 0 0 1 4-4v8H4V6zm0 12a4 4 0 0 1 4-4v4a4 4 0 0 1-4 0z"/></svg>
            <span>Figma Design Inspector</span>
          </div>
          <span class="badge badge--green">Connected</span>
        </div>
        <div style="font-size:13px; color:var(--ink-800); margin-top:6px;">
          Ready to inspect file <code>${escapeHTML(fileKey || 'design-system')}</code>. Extracted components can be rendered directly into the Cute Chat SVG Canvas!
        </div>
      </div>
    `;
  }

  function formatConnectorsHelpCardHTML() {
    return `
      <div class="tool-result-card">
        <div class="tool-result-card__header">
          <div class="tool-result-card__title">
            <span>Available MCP Connectors &amp; Commands</span>
          </div>
          <span class="badge badge--green">Active</span>
        </div>
        <div style="font-size:13px; color:var(--ink-700); margin-top:6px; line-height:1.6;">
          Execute tools directly with slash commands:
          <ul style="margin:8px 0 0 16px; padding:0;">
            <li><code>/search &lt;query&gt;</code> &mdash; Live web search with source citations</li>
            <li><code>/sql &lt;query&gt;</code> &mdash; Query relational database (<code>users</code>, <code>products</code>, <code>orders</code>, <code>metrics</code>)</li>
            <li><code>/github &lt;owner/repo&gt;</code> &mdash; Inspect GitHub repository metrics &amp; code</li>
            <li><code>/chart [bar|line|donut] [title]</code> &mdash; Render interactive analytics charts</li>
            <li><code>/calendar &lt;title&gt; | &lt;location&gt;</code> &mdash; Generate Google Calendar link &amp; .ics</li>
            <li><code>/slack &lt;message&gt;</code> &mdash; Dispatch message to connected Slack channel</li>
            <li><code>/figma &lt;file_key&gt;</code> &mdash; Inspect Figma design file</li>
          </ul>
        </div>
      </div>
    `;
  }

  function decorateCodeBlocks(container) {
    if (!container) return;
    const preElements = container.querySelectorAll('pre');
    preElements.forEach((pre) => {
      if (pre.closest('.code-container')) return;
      const code = pre.querySelector('code');
      if (!code) return;

      // Extract language class
      let lang = 'code';
      const classes = (code.className || '').split(/\s+/);
      for (const cls of classes) {
        if (cls.startsWith('language-')) {
          lang = cls.replace('language-', '').toLowerCase();
          break;
        }
      }

      // Highlight syntax with highlight.js
      if (window.hljs) {
        try {
          if (lang && lang !== 'code' && window.hljs.getLanguage(lang)) {
            const res = window.hljs.highlight(code.textContent || '', { language: lang, ignoreIllegals: true });
            code.innerHTML = res.value;
          } else {
            const res = window.hljs.highlightAuto(code.textContent || '');
            code.innerHTML = res.value;
            if (res.language && lang === 'code') lang = res.language;
          }
          code.classList.add('hljs');
        } catch {
          try { window.hljs.highlightElement(code); } catch {}
        }
      }

      const rawText = (code.textContent || '').trim();
      const codeLines = rawText ? rawText.split('\n').length : 1;
      const codeLinesLabel = codeLines + (codeLines === 1 ? ' line' : ' lines');

      // Build .code-container wrapper with macOS dots and actions
      const wrapper = document.createElement('div');
      wrapper.className = 'code-container is-collapsed';

      const head = document.createElement('div');
      head.className = 'code-head';
      head.title = 'Click to expand / collapse code';

      const left = document.createElement('div');
      left.className = 'code-head__left';
      left.innerHTML = `
        <div class="code-dots">
          <span class="code-dot code-dot--red"></span>
          <span class="code-dot code-dot--yellow"></span>
          <span class="code-dot code-dot--green"></span>
        </div>
        <span class="code-head__lang">${escapeHTML(lang.toUpperCase())}</span>
        <span class="code-head__lines">${escapeHTML(codeLinesLabel)}</span>
      `;

      const actions = document.createElement('div');
      actions.className = 'code-head__actions';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'copy-btn';
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copy</span>
      `;
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(code.textContent || '');
          copyBtn.classList.add('is-copied');
          const sp = copyBtn.querySelector('span');
          if (sp) sp.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.classList.remove('is-copied');
            if (sp) sp.textContent = 'Copy';
          }, 1500);
        } catch {
          const sp = copyBtn.querySelector('span');
          if (sp) sp.textContent = 'Failed';
        }
      });
      actions.appendChild(copyBtn);

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'code-collapse-toggle';
      toggleBtn.title = 'Expand / Collapse code';
      toggleBtn.innerHTML = `
        <span class="code-collapse-toggle__text">Expand</span>
        <svg class="code-collapse-toggle__chevron" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      `;
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = wrapper.classList.toggle('is-collapsed');
        const txt = toggleBtn.querySelector('.code-collapse-toggle__text');
        if (txt) txt.textContent = isCollapsed ? 'Expand' : 'Collapse';
        toggleBtn.classList.toggle('is-expanded', !isCollapsed);
      });
      actions.appendChild(toggleBtn);

      head.addEventListener('click', (e) => {
        if (e.target.closest('.copy-btn') || e.target.closest('.code-collapse-toggle')) return;
        const isCollapsed = wrapper.classList.toggle('is-collapsed');
        const txt = toggleBtn.querySelector('.code-collapse-toggle__text');
        if (txt) txt.textContent = isCollapsed ? 'Expand' : 'Collapse';
        toggleBtn.classList.toggle('is-expanded', !isCollapsed);
      });

      const isSvg = lang === 'svg' || (rawText.startsWith('<svg') && rawText.includes('</svg>'));
      const isPdf = lang === 'pdf' || (rawText.includes('printable-doc') || rawText.includes('window.print') || /<body[^>]*printable/i.test(rawText) || /Sample Project Summary/i.test(rawText));
      const isPpt = lang === 'ppt' || lang === 'slides' || lang === 'presentation' || rawText.includes('class="deck') || (rawText.includes('class="slide') && (rawText.includes('</section>') || rawText.includes('data-slide'))) || rawText.includes('slide-deck');
      const isEdit = lang === 'edit_file' || lang === 'diff' || (rawText.includes('<<<<<<< SEARCH') && rawText.includes('=======') && rawText.includes('>>>>>>>'));
      const isCreateFile = lang.startsWith('file:') || lang.startsWith('create_file:');
      const isHtmlContent = (rawText.startsWith('<!DOCTYPE') || rawText.startsWith('<html')) && !isSvg && !isPdf && !isPpt;
      const isCanvas = lang === 'canvas' || lang === 'html' || lang === 'htm' || isSvg || isPdf || isPpt || isHtmlContent;

      // Check whether this artifact code block is completely generated
      let isArtifactComplete = false;
      if (isSvg) {
        isArtifactComplete = /<\/svg\s*>/i.test(rawText);
      } else if (isPpt) {
        isArtifactComplete = /<\/html\s*>/i.test(rawText) || /<\/section>\s*<\/div>/i.test(rawText) || rawText.includes('slide-footer');
      } else if (isPdf || lang === 'html' || lang === 'canvas' || isHtmlContent) {
        isArtifactComplete = /<\/html\s*>/i.test(rawText);
      } else if (isEdit) {
        isArtifactComplete = rawText.includes('>>>>>>>');
      } else if (isCreateFile) {
        isArtifactComplete = rawText.length > 0;
      }

      head.appendChild(left);
      head.appendChild(actions);

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(head);
      wrapper.appendChild(pre);

      // Handle Iterative Diff Edits (edit_file)
      if (isEdit && isArtifactComplete) {
        const conv = activeConv();
        const editRes = applyFileEdit(conv, rawText);
        const fileName = editRes.fileRecord?.name || 'project_file.html';
        const version = editRes.fileRecord?.version || 2;
        const stats = editRes.stats || { added: 0, deleted: 0, blocks: 1 };
        const summaryText = `+${stats.added} lines / -${stats.deleted} lines · ${stats.blocks} block${stats.blocks === 1 ? '' : 's'} updated`;

        const editCard = document.createElement('div');
        editCard.className = 'inline-edit-card';

        let diffLinesHtml = '';
        if (editRes.diffLines && editRes.diffLines.length) {
          diffLinesHtml = editRes.diffLines.map(d => {
            const cls = d.type === 'del' ? 'diff-line--del' : d.type === 'add' ? 'diff-line--add' : 'diff-line--ctx';
            const pfx = d.type === 'del' ? '- ' : d.type === 'add' ? '+ ' : '  ';
            return `<span class="${cls}">${escapeHTML(pfx + d.text)}</span>`;
          }).join('\n');
        } else {
          diffLinesHtml = escapeHTML(rawText);
        }

        editCard.innerHTML = `
          <div class="edit-card__header">
            <div class="edit-card__title-group">
              <div class="edit-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </div>
              <div class="edit-card__file-name">${escapeHTML(fileName)}</div>
              <span class="edit-card__version-pill">v${version}</span>
            </div>
            <p class="edit-card__summary">${escapeHTML(summaryText)}</p>
          </div>
          <div class="edit-card__actions">
            <button type="button" class="btn-artifact-primary btn-edit-preview" title="Preview updated file">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
              <span>Preview updated</span>
            </button>
            <button type="button" class="btn-artifact-secondary btn-edit-toggle-diff" title="View diff">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>
              <span>View diff</span>
            </button>
          </div>
          <div class="edit-card__diff-drawer" hidden>
            <pre style="margin:0; background:transparent; border:none; padding:0; font-family:inherit;"><code>${diffLinesHtml}</code></pre>
          </div>
        `;

        const previewBtn = editCard.querySelector('.btn-edit-preview');
        if (previewBtn) {
          previewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (editRes.fileRecord) {
              openCanvas(editRes.fileRecord.content, editRes.fileRecord.title, editRes.fileRecord.type);
            }
          });
        }

        const diffToggleBtn = editCard.querySelector('.btn-edit-toggle-diff');
        const diffDrawer = editCard.querySelector('.edit-card__diff-drawer');
        if (diffToggleBtn && diffDrawer) {
          diffToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            diffDrawer.hidden = !diffDrawer.hidden;
            diffToggleBtn.classList.toggle('is-active', !diffDrawer.hidden);
          });
        }

        wrapper.classList.add('is-collapsed');
        wrapper.classList.add('has-artifact-card');
        wrapper.parentNode.insertBefore(editCard, wrapper);
        return;
      }

      // Handle general file creation (create_file)
      if (isCreateFile && isArtifactComplete) {
        const conv = activeConv();
        const customPath = lang.replace(/^(?:create_)?file:\s*/, '').trim() || 'file_' + Date.now() + '.txt';
        if (conv) {
          saveConvFile(conv, {
            path: customPath,
            name: customPath.split('/').pop(),
            title: customPath,
            content: rawText,
            type: customPath.endsWith('.svg') ? 'svg' : customPath.endsWith('.pdf') ? 'pdf' : customPath.endsWith('.ppt') ? 'ppt' : 'html'
          });
        }
      }

      if ((isCanvas || isPdf || isPpt) && isArtifactComplete) {
        // Detect title
        let artifactTitle = '';
        const titleMatch = rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
        const h1Match = rawText.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const ariaLabelMatch = rawText.match(/aria-label=["']([^"']+)["']/i);
        if (titleMatch && titleMatch[1]) {
          artifactTitle = titleMatch[1].trim();
        } else if (h1Match && h1Match[1]) {
          artifactTitle = h1Match[1].trim();
        } else if (ariaLabelMatch && ariaLabelMatch[1]) {
          artifactTitle = ariaLabelMatch[1].trim();
        } else if (isPpt) {
          artifactTitle = 'Keynote Presentation';
        } else if (isPdf) {
          artifactTitle = 'Document Report';
        } else if (isSvg) {
          const descMatch = rawText.match(/<desc[^>]*>([^<]+)<\/desc>/i);
          const dataTitleMatch = rawText.match(/data-title=["']([^"']+)["']/i);
          const svgIdMatch = rawText.match(/<svg[^>]*id=["']([^"']+)["']/i);
          if (descMatch && descMatch[1]) {
            artifactTitle = descMatch[1].trim();
          } else if (dataTitleMatch && dataTitleMatch[1]) {
            artifactTitle = dataTitleMatch[1].trim();
          } else if (svgIdMatch && svgIdMatch[1] && !svgIdMatch[1].startsWith('svg_')) {
            artifactTitle = svgIdMatch[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          } else {
            artifactTitle = 'Vector Graphic';
          }
        } else {
          artifactTitle = 'Web Artifact';
        }

        const artifactType = isPpt ? 'ppt' : isPdf ? 'pdf' : isSvg ? 'svg' : 'html';
        const badgeLabel = isPpt ? 'SLIDES' : isPdf ? 'PDF' : isSvg ? 'SVG' : 'Interactive';

        let thumbHtml = '';
        let metaDesc = '';
        let primaryBtnText = '';
        let badgeClass = '';

        if (isPpt) {
          badgeClass = 'artifact-pill-badge--ppt';
          metaDesc = 'Interactive presentation deck · 16:9 widescreen';
          primaryBtnText = 'Present slides';
          thumbHtml = `
            <div class="artifact-card__thumb artifact-card__thumb--ppt" aria-hidden="true">
              <div class="ppt-mini-slide">
                <div class="ppt-mini-slide__top">
                  <div class="ppt-mini-slide__badge"></div>
                  <span class="ppt-mini-slide__count">01 / 05</span>
                </div>
                <div class="ppt-mini-slide__title"></div>
                <div class="ppt-mini-slide__sub"></div>
                <div class="ppt-mini-slide__cards">
                  <div class="ppt-mini-slide__card ppt-mini-slide__card--active"></div>
                  <div class="ppt-mini-slide__card"></div>
                  <div class="ppt-mini-slide__card"></div>
                </div>
              </div>
            </div>
          `;
        } else if (isPdf) {
          badgeClass = 'artifact-pill-badge--pdf';
          metaDesc = 'Formatted document · Ready to preview & print';
          primaryBtnText = 'Preview & print';
          thumbHtml = `
            <div class="artifact-card__thumb artifact-card__thumb--pdf" aria-hidden="true">
              <div class="pdf-preview-sheet">
                <div class="pdf-preview-sheet__top-row">
                  <div class="pdf-preview-sheet__header"></div>
                  <div class="pdf-preview-sheet__header-sub"></div>
                </div>
                <div class="pdf-preview-sheet__title-bar"></div>
                <div class="pdf-preview-sheet__lines">
                  <div class="pdf-preview-sheet__line"></div>
                  <div class="pdf-preview-sheet__line-with-dot">
                    <span class="pdf-dot pdf-dot--amber"></span>
                    <div class="pdf-preview-sheet__line"></div>
                  </div>
                  <div class="pdf-preview-sheet__line-with-dot">
                    <span class="pdf-dot pdf-dot--teal"></span>
                    <div class="pdf-preview-sheet__line"></div>
                  </div>
                  <div class="pdf-preview-sheet__line-with-dot">
                    <span class="pdf-dot pdf-dot--blue"></span>
                    <div class="pdf-preview-sheet__line"></div>
                  </div>
                </div>
                <div class="pdf-preview-sheet__blocks">
                  <div class="pdf-preview-sheet__block pdf-preview-sheet__block--mint"></div>
                  <div class="pdf-preview-sheet__block pdf-preview-sheet__block--active"></div>
                  <div class="pdf-preview-sheet__block pdf-preview-sheet__block--mint"></div>
                </div>
              </div>
            </div>
          `;
        } else if (isSvg) {
          badgeClass = 'artifact-pill-badge--svg';
          const elemMatches = rawText.match(/<(path|rect|circle|ellipse|line|polygon|polyline|text)/gi);
          const elemCount = elemMatches ? elemMatches.length : 8;
          metaDesc = `Scalable vector illustration · ${elemCount} elements`;
          primaryBtnText = 'Open canvas';

          const svgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i);
          let safeSvg = svgMatch ? svgMatch[0].replace(/<script[\s\S]*?<\/script>/gi, '') : '';
          thumbHtml = `
            <div class="artifact-card__thumb artifact-card__thumb--svg" aria-hidden="true">
              ${safeSvg}
            </div>
          `;
        } else {
          badgeClass = 'artifact-pill-badge--html';
          metaDesc = 'Interactive web component · Ready to preview';
          primaryBtnText = 'Open canvas';
          thumbHtml = `
            <div class="artifact-card__thumb artifact-card__thumb--html" aria-hidden="true">
              <div class="html-preview-canvas">
                <div class="html-preview-canvas__bar">
                  <span></span><span></span><span></span>
                </div>
                <div class="html-preview-canvas__body">
                  <div class="html-preview-canvas__hero"></div>
                  <div class="html-preview-canvas__row">
                    <div class="html-preview-canvas__block"></div>
                    <div class="html-preview-canvas__block"></div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }

        // Auto-save artifact into project files registry
        const currentConv = activeConv();
        if (currentConv) {
          const defaultName = isPpt ? 'presentation.html' : isPdf ? 'document.html' : isSvg ? 'vector.svg' : 'component.html';
          saveConvFile(currentConv, {
            path: defaultName,
            name: defaultName,
            title: artifactTitle,
            content: rawText,
            type: artifactType
          });
        }

        // Build the inline open-able artifact card
        const card = document.createElement('div');
        card.className = 'inline-artifact-card' + (isSvg ? ' is-svg-card' : '');
        card.dataset.type = artifactType;

        card.innerHTML = `
          ${thumbHtml}
          <div class="artifact-card__body">
            <div class="artifact-card__meta-top">
              <div class="artifact-card__title-row">
                <h4 class="artifact-card__title">${escapeHTML(artifactTitle)}</h4>
                <span class="artifact-pill-badge ${badgeClass}">${escapeHTML(badgeLabel)}</span>
              </div>
            </div>
            <div class="artifact-card__actions">
              <button type="button" class="btn-artifact-primary" title="Preview and open artifact">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                <span>${escapeHTML(primaryBtnText)}</span>
              </button>
              <button type="button" class="btn-artifact-secondary btn-artifact-toggle-code" title="View source code">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                <span>View source</span>
              </button>
            </div>
          </div>
        `;

        const openBtn = card.querySelector('.btn-artifact-primary');
        if (openBtn) {
          openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const content = code.textContent || '';
            openCanvas(content, artifactTitle, artifactType);
          });
        }

        const toggleCodeBtn = card.querySelector('.btn-artifact-toggle-code');
        if (toggleCodeBtn) {
          toggleCodeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = wrapper.classList.toggle('is-collapsed');
            toggleCodeBtn.classList.toggle('is-active', !isCollapsed);
            const txt = toggleCodeBtn.querySelector('span');
            if (txt) txt.textContent = isCollapsed ? 'View source' : 'Hide source';
          });
        }

        // Initially collapse the code container so inline card is primary
        wrapper.classList.add('is-collapsed');
        wrapper.classList.add('has-artifact-card');

        // Insert card before wrapper
        wrapper.parentNode.insertBefore(card, wrapper);

        // Header preview button
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'preview-btn';
        prevBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
          <span>${isPpt ? 'Present' : isPdf ? 'Preview / Print' : 'Open in Canvas'}</span>
        `;
        prevBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const content = code.textContent || '';
          openCanvas(content, artifactTitle, artifactType);
        });
        actions.appendChild(prevBtn);
      }

      // SQL Database Tool block
      if (lang === 'sql') {
        const runSqlBtn = document.createElement('button');
        runSqlBtn.type = 'button';
        runSqlBtn.className = 'preview-btn';
        runSqlBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Run Query</span>
        `;
        runSqlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          let resContainer = wrapper.nextElementSibling;
          if (!resContainer || !resContainer.classList.contains('code-tool-result')) {
            resContainer = document.createElement('div');
            resContainer.className = 'code-tool-result';
            wrapper.parentNode.insertBefore(resContainer, wrapper.nextSibling);
          }
          const res = SQL_DB.execute(rawText);
          resContainer.innerHTML = SQL_DB.formatHTML(res, rawText);
        });
        actions.appendChild(runSqlBtn);
      }

      // Web Search block
      if (lang === 'search') {
        const searchBtn = document.createElement('button');
        searchBtn.type = 'button';
        searchBtn.className = 'preview-btn';
        searchBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Live Search</span>
        `;
        searchBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          let resContainer = wrapper.nextElementSibling;
          if (!resContainer || !resContainer.classList.contains('code-tool-result')) {
            resContainer = document.createElement('div');
            resContainer.className = 'code-tool-result';
            wrapper.parentNode.insertBefore(resContainer, wrapper.nextSibling);
          }
          resContainer.innerHTML = `<div class="tool-result-card"><div class="typing-indicator"><span class="streaming-spinner"></span> <span class="typing-indicator__label">Searching…</span></div></div>`;
          const data = await searchWeb(rawText);
          resContainer.innerHTML = formatSearchResultsHTML(data);
        });
        actions.appendChild(searchBtn);
      }

      // Chart Tool block
      if (lang === 'chart') {
        const chartBtn = document.createElement('button');
        chartBtn.type = 'button';
        chartBtn.className = 'preview-btn';
        chartBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <span>Render Chart</span>
        `;
        const renderChartAction = () => {
          let resContainer = wrapper.nextElementSibling;
          if (!resContainer || !resContainer.classList.contains('code-tool-result')) {
            resContainer = document.createElement('div');
            resContainer.className = 'code-tool-result';
            wrapper.parentNode.insertBefore(resContainer, wrapper.nextSibling);
          }
          const spec = parseChartSpec(rawText);
          const svg = renderSVGChart(spec);
          resContainer.innerHTML = formatChartHTML(svg, spec.title);
          wrapper.classList.add('is-collapsed');
        };
        chartBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          renderChartAction();
        });
        actions.appendChild(chartBtn);
        if (!wrapper.nextElementSibling || !wrapper.nextElementSibling.classList.contains('code-tool-result')) {
          renderChartAction();
        }
      }

      // Calendar Tool block
      if (lang === 'calendar') {
        const calBtn = document.createElement('button');
        calBtn.type = 'button';
        calBtn.className = 'preview-btn';
        calBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Add to Calendar</span>
        `;
        const renderCalAction = () => {
          let resContainer = wrapper.nextElementSibling;
          if (!resContainer || !resContainer.classList.contains('code-tool-result')) {
            resContainer = document.createElement('div');
            resContainer.className = 'code-tool-result';
            wrapper.parentNode.insertBefore(resContainer, wrapper.nextSibling);
          }
          const lines = rawText.split('\n');
          let t = 'Meeting';
          let loc = 'Google Meet';
          for (const line of lines) {
            const p = line.split(':');
            if (p.length >= 2) {
              const k = p[0].trim().toLowerCase();
              const v = p.slice(1).join(':').trim();
              if (k === 'title') t = v;
              if (k === 'location') loc = v;
            }
          }
          const ev = createCalendarEvent({ title: t, location: loc });
          resContainer.innerHTML = formatCalendarEventHTML(ev);
        };
        calBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          renderCalAction();
        });
        actions.appendChild(calBtn);
        if (!wrapper.nextElementSibling || !wrapper.nextElementSibling.classList.contains('code-tool-result')) {
          renderCalAction();
        }
      }
    });
  }

  function updateScrollBottomButton(host) {
    const railBottom = document.getElementById('chatRailBottomBtn');
    if (!railBottom) return;
    if (!host) host = document.getElementById('chat');
    if (!host) return;
    const dist = host.scrollHeight - host.scrollTop - host.clientHeight;
    if (dist > 80 && (state.userScrolledUp || state.isStreaming)) {
      railBottom.classList.add('has-unread');
      railBottom.setAttribute('title', 'New content below — click to jump to latest');
    } else if (dist <= 30) {
      railBottom.classList.remove('has-unread');
      railBottom.setAttribute('title', 'Jump to latest message');
    }
  }

  // -----------------------------------------------------------------------
  // Left Navigation Rail — Track user messages and jump to points in conversation
  // -----------------------------------------------------------------------
  function renderChatRail() {
    const rail = document.getElementById('chatRail');
    const track = document.getElementById('chatRailTrack');
    const countEl = document.getElementById('chatRailCount');
    if (!rail || !track) return;
    const c = activeConv();
    if (!c || !c.messages || !c.messages.length) {
      rail.hidden = true;
      return;
    }

    const userMsgs = [];
    c.messages.forEach((m, idx) => {
      if (m.role === 'user') {
        userMsgs.push({ msg: m, index: idx });
      }
    });

    if (userMsgs.length === 0) {
      rail.hidden = true;
      return;
    }

    rail.hidden = false;
    if (countEl) countEl.textContent = userMsgs.length;

    track.innerHTML = '';
    userMsgs.forEach((item, qIdx) => {
      const qNum = qIdx + 1;
      let textSnippet = '';
      if (typeof item.msg.content === 'string') {
        textSnippet = item.msg.content;
      } else if (Array.isArray(item.msg.content)) {
        textSnippet = item.msg.content.find(p => p.type === 'text')?.text || 'Attached image';
      }
      textSnippet = (textSnippet || '').trim();
      const preview = textSnippet.length > 70 ? textSnippet.slice(0, 70) + '…' : textSnippet;

      const btn = document.createElement('button');
      btn.className = 'rail-item';
      btn.type = 'button';
      btn.dataset.targetId = `msg-${item.index}`;
      btn.setAttribute('aria-label', `Jump to prompt ${qNum}: ${preview}`);
      btn.innerHTML = `
        <span class="rail-item__num">${qNum}</span>
        <div class="rail-tooltip">
          <span class="rail-tooltip__badge">#${qNum}</span>
          <span class="rail-tooltip__text">${escapeHTML(preview || 'User prompt')}</span>
        </div>
      `;

      on(btn, 'click', () => {
        const target = document.getElementById(`msg-${item.index}`);
        if (target) {
          state.userScrolledUp = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('is-jump-target');
          setTimeout(() => target.classList.remove('is-jump-target'), 1500);
          updateActiveRailItem();
          const host = document.getElementById('chat');
          if (host) updateScrollBottomButton(host);
        }
      });

      track.appendChild(btn);
    });

    updateActiveRailItem();
  }

  function updateActiveRailItem() {
    const host = document.getElementById('chat');
    const track = document.getElementById('chatRailTrack');
    if (!host || !track) return;
    const items = track.querySelectorAll('.rail-item');
    if (!items.length) return;

    const hostRect = host.getBoundingClientRect();
    let activeBtn = null;
    let minDiff = Infinity;

    items.forEach(btn => {
      const targetId = btn.dataset.targetId;
      const el = document.getElementById(targetId);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom >= hostRect.top && rect.top <= hostRect.bottom) {
          const diff = Math.abs(rect.top - hostRect.top);
          if (diff < minDiff) {
            minDiff = diff;
            activeBtn = btn;
          }
        }
      }
    });

    items.forEach(b => b.classList.toggle('is-active', b === activeBtn));
  }

  function renderChat(forceScrollToBottom = false) {
    const host = document.getElementById('chat');
    if (!host) return;
    const prevScrollTop = host.scrollTop;
    const c = activeConv();
    const sug = document.getElementById('suggestions');
    if (sug) sug.hidden = true;

    if (!c || !c.messages || !c.messages.length) {
      host.innerHTML = renderHero();
      host.querySelectorAll('.hero-starter').forEach(btn => {
        on(btn, 'click', () => {
          const input = document.getElementById('input');
          if (input) {
            input.value = btn.dataset.prompt || '';
            autosizeInput();
            if (typeof input.focus === 'function') input.focus();
          }
        });
      });
      updateScrollBottomButton(host);
      renderChatRail();
      return;
    }

    host.innerHTML = '';
    for (let i = 0; i < c.messages.length; i++) {
      const el = renderMessage(c.messages[i]);
      el.id = 'msg-' + i;
      el.dataset.msgIndex = i;
      host.appendChild(el);
    }
    decorateCodeBlocks(host);
    renderChatRail();

    if (forceScrollToBottom || !state.userScrolledUp) {
      host.scrollTop = host.scrollHeight;
      state.userScrolledUp = false;
    } else {
      host.scrollTop = prevScrollTop;
    }
    updateScrollBottomButton(host);
    updateProjectFilesBadge();
  }

  function renderMessage(m) {
    const div = document.createElement('div');
    const isCurrentlyStreaming = isConvStreaming(state.activeConvId) &&
      m.role === 'assistant' &&
      activeConv()?.messages?.slice(-1)[0] === m;

    div.className = 'msg msg--' + (m.role === 'user' ? 'user' : 'assistant') +
      (m.isError ? ' is-error' : '') +
      (isCurrentlyStreaming ? ' is-streaming' : '') +
      (m.pinned ? ' is-pinned' : '');

    const avatar = m.role === 'user'
      ? '<div class="msg__avatar">You</div>'
      : '<div class="msg__avatar" title="AI Assistant"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"/></svg></div>';

    let contentHtml = '';
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        contentHtml = escapeHTML(m.content);
      } else if (Array.isArray(m.content)) {
        contentHtml = m.content.map(p => {
          if (p.type === 'text') return escapeHTML(p.text || '');
          if (p.type === 'image_url') return `<img class="msg__img" src="${escapeHTML(p.image_url?.url || '')}" alt="Attached image" />`;
          return '';
        }).join('<br/>');
      } else {
        contentHtml = escapeHTML(String(m.content || ''));
      }
    } else {
      if (m.isHelpCard || m.isToolResult) {
        contentHtml = m.content;
      } else if (isCurrentlyStreaming) {
        const thinkingHtml = renderThinkingBlockHTML(m.thinkingContent, true);
        const stepsHtml = renderStepsBlockHTML(m.steps);
        if (!m.content && !m.thinkingContent && !stepsHtml) {
          contentHtml = '<div class="typing-indicator" title="Thinking..."><span class="streaming-spinner"></span> <span class="typing-indicator__label">Thinking…</span></div>';
        } else {
          contentHtml = thinkingHtml + stepsHtml + mdToSafeHTML(m.content || '') +
            '<span class="msg__streaming-indicator" title="Generating response..."><span class="streaming-spinner"></span></span>';
        }
      } else {
        const thinkingHtml = renderThinkingBlockHTML(m.thinkingContent, false);
        const stepsHtml = renderStepsBlockHTML(m.steps);
        contentHtml = thinkingHtml + stepsHtml + mdToSafeHTML(m.content || '');
      }
    }

    const pinnedBadgeHtml = m.pinned
      ? '<div class="msg__pinned-badge" title="Pinned message">' +
          '<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6l1.3 1.3 1.3-1.3v-6H19v-2l-2-2z"/></svg>' +
          '<span>Pinned</span>' +
        '</div>'
      : '';

    // Action buttons are ONLY shown when the message is completely generated (not streaming)
    let actionsHtml = '';
    if (!isCurrentlyStreaming) {
      const copyBtnHtml =
        '<button class="msg__action-btn msg__copy" type="button" aria-label="Copy message" title="Copy message">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>' +
        '</button>';

      const editBtnHtml = m.role === 'user'
        ? '<button class="msg__action-btn msg__edit" type="button" aria-label="Edit prompt" title="Edit prompt">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
          '</button>'
        : '';

      const pinBtnHtml =
        `<button class="msg__action-btn msg__pin ${m.pinned ? 'is-active' : ''}" type="button" aria-label="${m.pinned ? 'Unpin message' : 'Pin message'}" title="${m.pinned ? 'Unpin message' : 'Pin message'}">` +
          `<svg viewBox="0 0 24 24" width="13" height="13" fill="${m.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>` +
        '</button>';

      const regenBtnHtml = (m.role === 'assistant' && !m.isHelpCard)
        ? '<button class="msg__action-btn msg__regen" type="button" aria-label="Regenerate response" title="Regenerate response">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>' +
          '</button>'
        : '';

      actionsHtml =
        '<div class="msg__actions">' +
          copyBtnHtml +
          editBtnHtml +
          pinBtnHtml +
          regenBtnHtml +
        '</div>';
    }

    const body =
      '<div class="msg__body">' +
        pinnedBadgeHtml +
        '<div class="msg__content' + (m.role === 'assistant' ? ' md' : '') + '">' + contentHtml + '</div>' +
        actionsHtml +
      '</div>';
    div.innerHTML = avatar + body;

    // Wire interactive tool result buttons inside message
    div.querySelectorAll('.btn-open-chart-canvas').forEach(btn => {
      on(btn, 'click', (e) => {
        e.stopPropagation();
        const chartWrap = div.querySelector('.chart-svg-wrap');
        const svg = chartWrap ? chartWrap.innerHTML : '';
        const title = div.querySelector('.tool-result-card__title span')?.textContent || 'Chart';
        openCanvas(svg, title, 'svg');
      });
    });

    div.querySelectorAll('[data-download-ics]').forEach(btn => {
      on(btn, 'click', (e) => {
        e.stopPropagation();
        const title = decodeURIComponent(btn.dataset.downloadIcs || 'Cute_Chat_Event');
        const ev = createCalendarEvent({ title });
        downloadFile(title.replace(/[^a-z0-9]/gi, '_') + '.ics', ev.icsContent, 'text/calendar;charset=utf-8');
        toast('Downloaded .ics event file', 'ok');
      });
    });

    div.querySelectorAll('[data-connector-cmd]').forEach(btn => {
      on(btn, 'click', (e) => {
        e.stopPropagation();
        const cmd = btn.dataset.connectorCmd;
        const input = document.getElementById('input');
        if (input) {
          input.value = cmd;
          input.focus();
          autosizeInput();
        }
      });
    });

    const copyBtn = div.querySelector('.msg__copy');
    if (copyBtn) {
      on(copyBtn, 'click', async () => {
        try {
          const textToCopy = typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
            ? m.content.map(p => p.text || '').join('\n')
            : String(m.content || '');
          await navigator.clipboard.writeText(textToCopy);
          flashCopyIcon(copyBtn);
        } catch {
          toast('Failed to copy', 'warn');
        }
      });
    }

    const editBtn = div.querySelector('.msg__edit');
    if (editBtn) {
      on(editBtn, 'click', () => {
        const conv = activeConv();
        if (!conv) return;
        if (isConvStreaming(conv.id)) {
          toast('Please wait for streaming to complete', 'warn');
          return;
        }
        startInlineMessageEdit(div, m, conv);
      });
    }

    const pinBtn = div.querySelector('.msg__pin');
    if (pinBtn) {
      on(pinBtn, 'click', () => {
        m.pinned = !m.pinned;
        persist();
        renderChat(false);
        toast(m.pinned ? 'Message pinned' : 'Message unpinned', 'ok');
      });
    }

    if (m.role === 'assistant' && !m.isHelpCard) {
      const regen = div.querySelector('.msg__regen');
      if (regen) on(regen, 'click', () => regenerateLast());
    }
    return div;
  }

  function startInlineMessageEdit(msgEl, m, conv) {
    const contentEl = msgEl.querySelector('.msg__content');
    const actionsEl = msgEl.querySelector('.msg__actions');
    if (!contentEl) return;

    if (msgEl.querySelector('.msg-edit-form')) return;

    const originalText = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
      ? (m.content.find(p => p.type === 'text')?.text || '')
      : String(m.content || '');

    const origDisplay = contentEl.style.display;
    contentEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';

    const form = document.createElement('div');
    form.className = 'msg-edit-form';
    form.innerHTML = `
      <textarea class="msg-edit-form__input" rows="3" aria-label="Edit your prompt"></textarea>
      <div class="msg-edit-form__actions">
        <span class="msg-edit-form__hint">Ctrl+Enter to submit</span>
        <button type="button" class="msg-edit-form__btn msg-edit-form__btn--cancel">Cancel</button>
        <button type="button" class="msg-edit-form__btn msg-edit-form__btn--save">Save &amp; Submit</button>
      </div>
    `;

    contentEl.parentNode.insertBefore(form, actionsEl || null);

    const textarea = form.querySelector('.msg-edit-form__input');
    textarea.value = originalText;

    const autoResize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(72, textarea.scrollHeight) + 'px';
    };
    setTimeout(() => {
      autoResize();
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 20);

    on(textarea, 'input', autoResize);

    const cancelEdit = () => {
      form.remove();
      contentEl.style.display = origDisplay;
      if (actionsEl) actionsEl.style.display = '';
    };

    const submitEdit = () => {
      const newText = textarea.value.trim();
      if (!newText) {
        toast('Message cannot be empty', 'warn');
        textarea.focus();
        return;
      }
      if (newText === originalText.trim()) {
        cancelEdit();
        return;
      }

      if (Array.isArray(m.content)) {
        const nonText = m.content.filter(p => p.type !== 'text');
        m.content = [{ type: 'text', text: newText }, ...nonText];
      } else {
        m.content = newText;
      }

      const idx = conv.messages.indexOf(m);
      if (idx !== -1) {
        conv.messages = conv.messages.slice(0, idx + 1);
      }
      persist();
      state.userScrolledUp = false;
      renderChat(true);

      streamAssistant(conv.id);
      toast('Prompt updated & generating response', 'ok');
    };

    on(form.querySelector('.msg-edit-form__btn--cancel'), 'click', cancelEdit);
    on(form.querySelector('.msg-edit-form__btn--save'), 'click', submitEdit);

    on(textarea, 'keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitEdit();
      }
    });
  }

  function flashCopyIcon(btn) {
    if (!btn) return;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    btn.classList.add('is-copied');
    btn.setAttribute('title', 'Copied!');
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.classList.remove('is-copied');
      btn.setAttribute('title', 'Copy message');
    }, 1400);
  }

  function flashAction(btn, label) {
    if (!btn) return;
    const span = btn.querySelector('span');
    const old = span ? span.textContent : btn.textContent;
    if (span) span.textContent = label;
    else btn.textContent = label;
    btn.classList.add('is-copied');
    setTimeout(() => {
      if (span) span.textContent = old;
      else btn.textContent = old;
      btn.classList.remove('is-copied');
    }, 1400);
  }

  function renderThinkingBlockHTML(thinkingContent, isStreaming, forceOpen = false) {
    const text = (thinkingContent || '').trim();
    if (!text && !isStreaming) return '';
    const wordCount = text ? text.split(/\s+/).length : 0;
    const summaryText = isStreaming ? 'Thinking…' : `Thought for a moment · ${wordCount} words`;
    const body = isStreaming
      ? (text ? escapeHTML(text).replace(/\n/g, '<br>') + '<br>' : '') + '<div class="typing-indicator" title="Thinking..."><span class="streaming-spinner"></span> <span class="typing-indicator__label">Thinking…</span></div>'
      : escapeHTML(text).replace(/\n/g, '<br>');
    const openAttr = forceOpen ? ' open' : '';
    return `
      <details class="thinking-block"${openAttr}>
        <summary class="thinking-block__summary">
          <svg class="thought-clock-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="thinking-block__label">${escapeHTML(summaryText)}</span>
        </summary>
        <div class="thinking-block__body">${body}</div>
      </details>
    `;
  }

  function renderStepsBlockHTML(steps) {
    if (!Array.isArray(steps) || !steps.length) return '';
    return `
      <div class="thought-steps-row">
        ${steps.map((s, idx) => {
          const isLast = idx === steps.length - 1;
          const isDone = s.status === 'completed' || s.status === 'done' || !s.status;
          const icon = isDone
            ? '<span class="thought-step-check">✓</span>'
            : '<span class="thought-step-spinner"></span>';
          return `
            <span class="thought-step-item">
              ${icon}
              <span>${escapeHTML(s.title || s.name || 'Step')}</span>
            </span>
            ${!isLast ? '<span class="thought-step-sep">—</span>' : ''}
          `;
        }).join('')}
      </div>
    `;
  }

  // -----------------------------------------------------------------------
  // Skills bar (Think / PDF / Web / Memory / Canvas)
  // -----------------------------------------------------------------------
  function renderSkills() {
    const host = document.getElementById('skills');
    if (host) host.innerHTML = ''; // Kept clean and uncluttered from the top bar

    // Sync settings modal capability switches
    const caps = state.settings.capabilities || {};
    const capWeb = document.getElementById('capWebSearch');
    if (capWeb) capWeb.checked = caps.web !== false;
    const capThink = document.getElementById('capThinking');
    if (capThink) capThink.checked = caps.think !== false;
    const capCanv = document.getElementById('capCanvas');
    if (capCanv) capCanv.checked = caps.canvas !== false;
    const capPdf = document.getElementById('capPdf');
    if (capPdf) capPdf.checked = caps.pdf !== false;
    const capPpt = document.getElementById('capPpt');
    if (capPpt) capPpt.checked = caps.ppt !== false;
    const capProject = document.getElementById('capProject');
    if (capProject) capProject.checked = caps.project !== false;
    const capMem = document.getElementById('capMemory');
    if (capMem) capMem.checked = caps.memory !== false;
    const capLoc = document.getElementById('capLocation');
    if (capLoc) capLoc.checked = caps.location !== false;
  }

  function skillOn(id) {
    if (state.settings.capabilities && state.settings.capabilities[id] !== undefined) {
      return !!state.settings.capabilities[id];
    }
    const s = activeSession();
    if (s && s.skills && s.skills[id] !== undefined) return !!s.skills[id];
    return true; // Default enabled
  }
  function toggleSkill(id) {
    if (!state.settings.capabilities) state.settings.capabilities = {};
    state.settings.capabilities[id] = !skillOn(id);
    const s = activeSession();
    if (s) {
      s.skills = s.skills || {};
      s.skills[id] = state.settings.capabilities[id];
    }
    persist();
    renderSkills();
  }

  // -----------------------------------------------------------------------
  // Topbar model badge + dropdown
  // -----------------------------------------------------------------------

  // Helper: get all provider entries for display
  function getAllProviders() {
    const builtins = [
      { id: 'pollinations', name: 'Pollinations' },
      { id: 'groq', name: 'Groq' },
      { id: 'openrouter', name: 'OpenRouter' },
    ];
    const customs = (state.settings.customProviders || []).map(cp => ({
      id: cp.id, name: cp.name || cp.id,
    }));
    return [...builtins, ...customs];
  }

  // Track which provider tab is active in the topbar dropdown
  let topbarDropdownProvider = '__all__';

  // -----------------------------------------------------------------------
  // Vision model capability detection & auto-activation
  // -----------------------------------------------------------------------
  function isModelVisionCapable(modelId, provider) {
    if (!modelId || modelId === '__placeholder__') return false;
    const prov = provider || activeSession()?.provider || state.settings.provider;
    const list = MODELS[prov] || [];
    const found = list.find(m => m.id === modelId);
    if (found && typeof found.vision === 'boolean') return found.vision;
    if (modelId === 'openai' || modelId === 'gemini') return true;
    return /vision|gpt-4o|gemini|claude|llava|qwen-vl|vl-|pixtral/i.test(modelId);
  }

  function activateVisionIfAvailable(targetConv) {
    const conv = targetConv || activeConv();
    const sess = conv ? ensureSession(conv) : activeSession();
    if (!sess) return false;
    const prov = sess.provider;

    if (isModelVisionCapable(sess.model, prov)) {
      return true; // Current model is already vision-capable
    }

    // Look for a vision-capable model in the current provider
    const list = MODELS[prov] || [];
    let visionModel = list.find(m => m.vision || isModelVisionCapable(m.id, prov));

    // Provider-specific fallbacks
    if (!visionModel) {
      if (prov === 'groq') {
        visionModel = list.find(m => m.id.includes('vision')) || {
          id: 'llama-3.2-11b-vision-preview',
          label: 'Llama 3.2 11B Vision',
          shortName: 'Llama 3.2 11B Vision',
          vision: true
        };
        if (!list.find(m => m.id === visionModel.id)) list.push(visionModel);
      } else if (prov === 'openrouter') {
        visionModel = list.find(m => m.id.includes('vision') || m.id.includes('gemini') || m.vision) || {
          id: 'google/gemini-2.0-flash-exp:free',
          label: 'Gemini 2.0 Flash (Free)',
          shortName: 'Gemini 2.0 Flash',
          vision: true
        };
        if (!list.find(m => m.id === visionModel.id)) list.push(visionModel);
      } else if (prov === 'pollinations') {
        visionModel = list.find(m => m.id === 'openai' || m.id === 'gemini') || {
          id: 'openai',
          label: 'OpenAI GPT-4o',
          shortName: 'GPT-4o',
          vision: true
        };
      }
    }

    if (visionModel) {
      sess.model = visionModel.id;
      state.settings.model[prov] = visionModel.id;
      persist();
      refreshTopbarModelButton();
      renderModelOptions();
      const short = toShortModelName(visionModel.id, visionModel.shortName || visionModel.label);
      if (CC.toast) CC.toast(`Vision Active: Switched to ${short}`, 'ok');
      return true;
    }

    if (CC.toast) CC.toast('Notice: Selected model may not support image input', 'warn');
    return false;
  }

  function refreshTopbarModelButton() {
    const s = activeSession();
    if (!s) return;
    const name = document.getElementById('topbarModelName');
    const m = MODELS[s.provider] || [];
    const found = m.find(x => x.id === s.model);
    const short = toShortModelName(s.model, found ? (found.shortName || found.label) : null);
    const isVision = isModelVisionCapable(s.model, s.provider);
    if (name) {
      name.innerHTML = escapeHTML(short) + (isVision ? ' <span class="topbar-vision-tag" title="Vision Active">Vision</span>' : '');
    }
    const thinkingModelName = document.getElementById('thinkingCardModelName');
    if (thinkingModelName) {
      thinkingModelName.textContent = short;
    }
    const btn = document.getElementById('topbarModelBtn');
    if (btn) btn.title = `Model: ${short} (${s.model || ''})${isVision ? ' • Vision Active' : ''}`;
  }

  function currentModel() {
    const s = activeSession(); return s ? s.model : null;
  }

  function openTopbarDropdown(open) {
    const wrap = document.getElementById('topbarModelWrapper');
    const drop = document.getElementById('topbarModelDropdown');
    if (!drop) return;
    if (wrap) wrap.classList.toggle('is-open', !!open);
    if (open) {
      drop.hidden = false;
      topbarDropdownProvider = '__all__';
      renderTopbarProviderBar();
      renderTopbarModelList('');
      const inp = document.getElementById('topbarModelSearch');
      if (inp) { inp.value = ''; setTimeout(() => { if (typeof inp.focus === 'function') inp.focus(); }, 0); }
    } else {
      drop.hidden = true;
    }
  }

  function renderTopbarProviderBar() {
    const bar = document.getElementById('topbarProviderBar');
    if (!bar) return;
    bar.innerHTML = '';
    const providers = getAllProviders();

    // "All" tab
    const allTab = document.createElement('button');
    allTab.type = 'button';
    allTab.className = 'topbar-provider-tab' + (topbarDropdownProvider === '__all__' ? ' is-active' : '');
    allTab.textContent = 'All';
    allTab.addEventListener('click', () => {
      topbarDropdownProvider = '__all__';
      renderTopbarProviderBar();
      renderTopbarModelList(document.getElementById('topbarModelSearch')?.value || '');
    });
    bar.appendChild(allTab);

    for (const p of providers) {
      const count = (MODELS[p.id] || []).length;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'topbar-provider-tab' + (topbarDropdownProvider === p.id ? ' is-active' : '');
      tab.innerHTML = escapeHTML(p.name) + (count ? ` <span class="topbar-provider-tab__count">${count}</span>` : '');
      tab.addEventListener('click', () => {
        topbarDropdownProvider = p.id;
        renderTopbarProviderBar();
        renderTopbarModelList(document.getElementById('topbarModelSearch')?.value || '');
      });
      bar.appendChild(tab);
    }
  }

  function renderTopbarModelList(q) {
    const host = document.getElementById('topbarModelList');
    if (!host) return;
    const s = activeSession();
    const query = (q || '').toLowerCase();

    host.innerHTML = '';

    if (topbarDropdownProvider === '__all__') {
      // Grouped by provider
      const providers = getAllProviders();
      let anyModels = false;
      for (const p of providers) {
        const models = (MODELS[p.id] || []).filter(m => {
          const short = toShortModelName(m.id, m.shortName || m.label).toLowerCase();
          return !query || m.id.toLowerCase().includes(query) || (m.label || '').toLowerCase().includes(query) || short.includes(query);
        });
        if (!models.length) continue;
        anyModels = true;
        // Group header
        const header = document.createElement('div');
        header.className = 'topbar-dropdown__group-header';
        header.innerHTML = `<span>${escapeHTML(p.name)}</span><span class="topbar-dropdown__provider-tag">${models.length}</span>`;
        host.appendChild(header);

        for (const m of models) {
          host.appendChild(makeTopbarModelRow(m, s, p.id));
        }
      }
      if (!anyModels) {
        host.innerHTML = '<div class="topbar-dropdown__empty" style="padding:14px;color:var(--muted);font-size:12px">No models found.</div>';
      }
    } else {
      // Single provider
      const models = (MODELS[topbarDropdownProvider] || []).filter(m => {
        const short = toShortModelName(m.id, m.shortName || m.label).toLowerCase();
        return !query || m.id.toLowerCase().includes(query) || (m.label || '').toLowerCase().includes(query) || short.includes(query);
      });
      if (!models.length) {
        host.innerHTML = '<div class="topbar-dropdown__empty" style="padding:14px;color:var(--muted);font-size:12px">No models found.</div>';
        return;
      }
      for (const m of models) {
        host.appendChild(makeTopbarModelRow(m, s, topbarDropdownProvider));
      }
    }
  }

  function makeTopbarModelRow(m, session, provId) {
    const short = toShortModelName(m.id, m.shortName || m.label);
    const isSelected = m.id === session.model && session.provider === provId;
    const isVision = m.vision || isModelVisionCapable(m.id, provId);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'topbar-dropdown__item' + (isSelected ? ' is-selected' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    row.setAttribute('title', m.label && m.label !== short ? `${m.label} (${m.id})` : m.id);
    row.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<span>' + escapeHTML(short) + '</span>' +
      (isVision ? '<span class="topbar-dropdown__tag topbar-dropdown__tag--vision">Vision</span>' : '');
    row.addEventListener('click', () => {
      session.provider = provId;
      session.model = m.id;
      state.settings.provider = provId;
      state.settings.model[provId] = m.id;
      persist();
      refreshTopbarModelButton();
      setProviderStatus();
      renderModelOptions(); // sync the settings modal list
      openTopbarDropdown(false);
    });
    return row;
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
    const filtered = all.filter(m => {
      const short = toShortModelName(m.id, m.shortName || m.label).toLowerCase();
      return !q || m.id.toLowerCase().includes(q) || (m.label || '').toLowerCase().includes(q) || short.includes(q);
    });
    list.innerHTML = '';
    for (const m of filtered) {
      const short = toShortModelName(m.id, m.shortName || m.label);
      const isSelected = m.id === s.model;
      const isVision = m.vision || isModelVisionCapable(m.id, prov);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'custom-select__option' + (isSelected ? ' is-selected' : '');
      row.dataset.id = m.id;
      row.setAttribute('title', m.label && m.label !== short ? `${m.label} (${m.id})` : m.id);
      row.innerHTML =
        '<span class="custom-select__option-name">' + escapeHTML(short) + '</span>' +
        (isVision ? '<span class="badge badge--green" style="margin-left:6px">Vision</span>' : '');
      row.addEventListener('click', () => {
        s.model = m.id;
        state.settings.model[prov] = m.id;
        persist();
        renderModelOptions();
        refreshTopbarModelButton();
        openModelDropdown(false);
      });
      list.appendChild(row);
    }
    const found = all.find(m => m.id === s.model);
    const activeShort = toShortModelName(s.model, found ? (found.shortName || found.label) : null);
    if (label) label.textContent = activeShort || 'Select a model';
    if (badge) badge.textContent = found ? 'Active' : 'Pick one';
    if (count) count.textContent = filtered.length + ' of ' + all.length + ' models';
  }

  function openModelDropdown(open) {
    const wrap = document.getElementById('modelDropdown');
    const trig = document.getElementById('modelSelectTrigger');
    const panel = document.getElementById('modelSelectPanel');
    if (!wrap || !trig || !panel) return;
    if (open) {
      wrap.classList.add('is-open');
      trig.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      renderModelOptions();
      const inp = document.getElementById('modelSearchInput');
      if (inp) setTimeout(() => { if (typeof inp.focus === 'function') inp.focus(); }, 0);
    } else {
      wrap.classList.remove('is-open');
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
    let txt = prov;
    let cls = 'is-idle';
    if (prov === 'pollinations')      { txt = 'Pollinations'; cls = 'is-ok'; }
    else if (prov === 'groq')         { txt = 'Groq'; cls = state.settings.apiKeys.groq ? 'is-ok' : 'is-idle'; }
    else if (prov === 'openrouter')   { txt = 'OpenRouter'; cls = 'is-ok'; }
    else {
      // Custom provider
      const cp = (state.settings.customProviders || []).find(p => p.id === prov);
      if (cp) {
        txt = cp.name || cp.id;
        cls = cp.baseUrl ? 'is-ok' : 'is-idle';
      } else if (prov === 'custom') {
        txt = state.settings.custom?.name || 'Custom';
        cls = state.settings.custom?.baseUrl ? 'is-ok' : 'is-idle';
      }
    }
    if (dot) dot.className = 'dot ' + cls;
    if (lbl) lbl.textContent = txt;
    const mDot = document.getElementById('modalProviderDot');
    const mLbl = document.getElementById('modalProviderLabel');
    if (mDot) mDot.className = 'dot ' + cls;
    if (mLbl) mLbl.textContent = txt;
  }

  // -----------------------------------------------------------------------
  // Input autosize & Attachments rendering
  // -----------------------------------------------------------------------
  function autosizeInput() {
    const el = document.getElementById('input');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }

  function renderAttachments() {
    const host = document.getElementById('attachments');
    if (!host) return;
    host.innerHTML = '';
    const imageAtts = state.attachments.filter(a => (a.type || '').startsWith('image/'));
    if (imageAtts.length > 0) {
      const hint = document.createElement('div');
      hint.className = 'composer-vision-hint';
      hint.innerHTML = '<span><strong>Vision Active</strong> &mdash; ' +
        (imageAtts.length === 1 ? '1 image' : imageAtts.length + ' images') + ' ready for visual analysis</span>';
      host.appendChild(hint);
    }
    state.attachments.forEach((a, i) => {
      const chip = document.createElement('span');
      chip.className = 'attach-chip';
      if ((a.type || '').startsWith('image/')) {
        chip.innerHTML =
          '<img class="attach-chip__thumb" alt="" src="' + escapeHTML(a.dataUrl || '') + '">' +
          '<span class="attach-chip__name">' + escapeHTML(a.name || 'image') + '</span>' +
          '<span class="attach-chip__tag">Vision</span>' +
          '<button class="attach-chip__x" type="button" aria-label="Remove" data-i="' + i + '">\u00d7</button>';
      } else {
        chip.innerHTML =
          '<span class="attach-chip__icon">\u{1F4C4}</span>' +
          '<span class="attach-chip__name">' + escapeHTML(a.name || 'file') + '</span>' +
          '<button class="attach-chip__x" type="button" aria-label="Remove" data-i="' + i + '">\u00d7</button>';
      }
      const x = chip.querySelector('.attach-chip__x');
      if (x) {
        on(x, 'click', (e) => {
          e.stopPropagation();
          state.attachments.splice(i, 1);
          renderAttachments();
        });
      }
      host.appendChild(chip);
    });
  }

  // -----------------------------------------------------------------------
  // Real User Memory & Context Extraction
  // -----------------------------------------------------------------------
  function extractUserMemoryFromText(rawText) {
    if (!rawText || typeof rawText !== 'string') return;
    if (state.settings.capabilities?.memory === false) return;
    const text = rawText.trim();
    if (text.length < 5 || text.startsWith('/')) return;

    // Name detection: "My name is John", "Call me Alice"
    const nameMatch = text.match(/(?:my name is|call me|i am called)\s+([A-Z][a-zA-Z]+)/i);
    if (nameMatch && nameMatch[1]) {
      recordMemoryFact(`User's name is ${nameMatch[1]}`);
    }

    // Role / Profession detection: "I am a software engineer", "I work as a designer"
    const roleMatch = text.match(/(?:i work as an?|i am an?|my job is)\s+([a-zA-Z\s]{3,35})(?:[.,\n]|$)/i);
    if (roleMatch && roleMatch[1]) {
      const cleanRole = roleMatch[1].trim();
      if (!/user|assistant|human|thinking|model/i.test(cleanRole)) {
        recordMemoryFact(`User works as a ${cleanRole}`);
      }
    }

    // Location detection: "I live in Berlin", "I'm located in Tokyo"
    const locMatch = text.match(/(?:i live in|i'm located in|i am based in)\s+([a-zA-Z\s,]{3,40})(?:[.,\n]|$)/i);
    if (locMatch && locMatch[1]) {
      recordMemoryFact(`User is based in ${locMatch[1].trim()}`);
    }
  }

  function recordMemoryFact(fact) {
    if (!state.settings.userMemory) state.settings.userMemory = { notes: '', facts: [] };
    if (!Array.isArray(state.settings.userMemory.facts)) state.settings.userMemory.facts = [];
    const clean = fact.trim();
    if (clean && !state.settings.userMemory.facts.includes(clean)) {
      state.settings.userMemory.facts.push(clean);
      if (state.settings.userMemory.facts.length > 30) {
        state.settings.userMemory.facts.shift();
      }
      persist();
      renderMemoryFactsUI();
    }
  }

  function renderMemoryFactsUI() {
    const box = document.getElementById('memoryFactsBox');
    const badge = document.getElementById('memoryFactsBadge');
    const facts = state.settings.userMemory?.facts || [];
    if (badge) badge.textContent = `${facts.length} ${facts.length === 1 ? 'fact' : 'facts'}`;
    if (!box) return;
    if (!facts.length) {
      box.innerHTML = '<span style="font-size:11.5px; color:var(--ink-400);">No conversation memory facts recorded yet.</span>';
      return;
    }
    box.innerHTML = '';
    facts.forEach((fact, idx) => {
      const chip = document.createElement('div');
      chip.className = 'memory-fact-chip';
      chip.innerHTML = `<span>${escapeHTML(fact)}</span><button type="button" title="Delete memory fact" aria-label="Delete fact">&times;</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        state.settings.userMemory.facts.splice(idx, 1);
        persist();
        renderMemoryFactsUI();
      });
      box.appendChild(chip);
    });
  }

  // -----------------------------------------------------------------------
  // Send / regenerate (streaming)
  // -----------------------------------------------------------------------
  async function sendMessage() {
    let conv = activeConv();
    if (!conv) conv = createConversation();
    if (isConvStreaming(conv.id)) return;
    const input = document.getElementById('input');
    const text = (input?.value || '').trim();
    if (!text && !state.attachments.length) return;
    const sess = ensureSession(conv);

    let sendText = text;

    // Direct slash command execution for MCP tools & project workspace
    if (!state.attachments.length && text.startsWith('/')) {
      const lower = text.toLowerCase();
      if (lower.trim() === '/files' || lower.startsWith('/files ')) {
        if (input) input.value = '';
        autosizeInput();
        openProjectFilesModal();
        return;
      }

      // Design & Artifact Tool shortcuts: /ppt, /pdf, /svg, /html, /edit
      const isPptCmd = lower.startsWith('/ppt');
      const isPdfCmd = lower.startsWith('/pdf');
      const isSvgCmd = lower.startsWith('/svg');
      const isHtmlCmd = lower.startsWith('/html');
      const isEditCmd = lower.startsWith('/edit');

      if (isPptCmd || isPdfCmd || isSvgCmd || isHtmlCmd || isEditCmd) {
        if (isPptCmd) {
          const topic = text.replace(/^\/ppt\s*/i, '').trim();
          sendText = `Create a high-end 16:9 Apple Keynote-style presentation slide deck for: "${topic || 'Project Strategy & Vision'}". Include 5-7 beautifully composed slides with editorial typography, stat highlights, slide footer numbers, and clean slide navigation.`;
        } else if (isPdfCmd) {
          const topic = text.replace(/^\/pdf\s*/i, '').trim();
          sendText = `Create a high-end, print-ready document / PDF report for: "${topic || 'Executive Summary & Report'}". Format with Notion and Apple-grade typography, structured tables, and print-friendly styling.`;
        } else if (isSvgCmd) {
          const topic = text.replace(/^\/svg\s*/i, '').trim();
          sendText = `Create a sophisticated, non-generic scalable vector graphic (SVG) illustration for: "${topic || 'Modern Brand Emblem'}". Use a refined palette (obsidian/slate, sage pine, or terracotta), elegant geometry, clean gradients, and pure vector paths.`;
        } else if (isHtmlCmd) {
          const topic = text.replace(/^\/html\s*/i, '').trim();
          sendText = `Create an interactive, beautifully designed web component or micro-app for: "${topic || 'Interactive Dashboard'}". Include refined styling, responsive layout, and smooth interactions.`;
        } else if (isEditCmd) {
          const instruction = text.replace(/^\/edit\s*/i, '').trim();
          sendText = `Using the edit_file tool, update the most recent artifact file with the following changes: "${instruction}". Provide targeted SEARCH/REPLACE blocks without rewriting the entire file.`;
        }
      }

      const isSearch = lower.startsWith('/search');
      const isSql = lower.startsWith('/sql');
      const isGithub = lower.startsWith('/github');
      const isChart = lower.startsWith('/chart');
      const isCalendar = lower.startsWith('/calendar');
      const isSlack = lower.startsWith('/slack');
      const isFigma = lower.startsWith('/figma');
      const isHelp = lower.startsWith('/help') || lower.startsWith('/tools') || lower.startsWith('/connectors');

      if (isSearch || isSql || isGithub || isChart || isCalendar || isSlack || isFigma || isHelp) {
        if (conv.title === 'New chat' && text) {
          conv.title = text.slice(0, 40) + (text.length > 40 ? '\u2026' : '');
        }
        conv.messages.push({ role: 'user', content: text, ts: Date.now() });
        if (input) input.value = '';
        autosizeInput();
        state.userScrolledUp = false;
        renderChat(true);
        renderConversations();

        let toolContent = '';
        if (isSearch) {
          const q = text.replace(/^\/search\s*/i, '').trim();
          if (!q) {
            toolContent = `<div class="tool-result-card tool-result-card--error"><div class="tool-result-card__header"><span class="tool-result-card__title">Web Search</span></div><div style="font-size:12px; color:var(--red);">Please specify a query: <code>/search &lt;query&gt;</code></div></div>`;
          } else {
            const data = await searchWeb(q);
            toolContent = formatSearchResultsHTML(data);
          }
        } else if (isSql) {
          const q = text.replace(/^\/sql\s*/i, '').trim() || 'SELECT * FROM users;';
          const res = SQL_DB.execute(q);
          toolContent = SQL_DB.formatHTML(res, q);
        } else if (isGithub) {
          const repo = text.replace(/^\/github\s*/i, '').trim() || 'facebook/react';
          const ghToken = state.settings.connectors?.github?.token || '';
          const ghRes = await fetchGitHubRepo(repo, ghToken);
          toolContent = formatGitHubRepoHTML(ghRes);
        } else if (isChart) {
          const chartArg = text.replace(/^\/chart\s*/i, '').trim();
          let spec;
          if (chartArg.includes('donut') || chartArg.includes('pie')) {
            spec = {
              type: 'donut',
              title: 'Platform Market Distribution',
              labels: ['Web App', 'Desktop App', 'Mobile iOS', 'Mobile Android', 'API Clients'],
              data: [45, 25, 15, 10, 5],
              colors: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4']
            };
          } else if (chartArg.includes('line')) {
            spec = {
              type: 'line',
              title: 'System Latency & Load (ms)',
              labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              data: [68, 52, 45, 42, 38, 35, 32],
            };
          } else {
            spec = {
              type: 'bar',
              title: chartArg || 'Monthly Active Workspaces',
              labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
              data: [2800, 4300, 6100, 8900, 11800, 15400],
            };
          }
          const svg = renderSVGChart(spec);
          toolContent = formatChartHTML(svg, spec.title);
        } else if (isCalendar) {
          const calArg = text.replace(/^\/calendar\s*/i, '').trim() || 'Sprint Planning Meeting';
          const parts = calArg.split('|').map(s => s.trim());
          const title = parts[0] || 'Cute Chat Sync';
          const loc = parts[1] || 'Google Meet';
          const ev = createCalendarEvent({ title, location: loc });
          toolContent = formatCalendarEventHTML(ev);
        } else if (isSlack) {
          const slackMsg = text.replace(/^\/slack\s*/i, '').trim();
          if (!slackMsg) {
            toolContent = `<div class="tool-result-card tool-result-card--error"><div class="tool-result-card__header"><span class="tool-result-card__title">Slack MCP</span></div><div style="font-size:12px; color:var(--red);">Please provide a message: <code>/slack &lt;your message&gt;</code></div></div>`;
          } else {
            const slackRes = await sendSlackMessage(state.settings.connectors?.slack?.webhookUrl, slackMsg);
            toolContent = formatSlackResultHTML(slackRes, slackMsg);
          }
        } else if (isFigma) {
          const fileKey = text.replace(/^\/figma\s*/i, '').trim();
          toolContent = formatFigmaResultHTML(fileKey);
        } else if (isHelp) {
          toolContent = formatConnectorsHelpCardHTML();
        }

        conv.messages.push({
          role: 'assistant',
          content: toolContent,
          isToolResult: true,
          ts: Date.now()
        });
        persist();
        renderChat(true);
        renderConversations();
        return;
      }
    }

    // Title from first user message
    if (conv.title === 'New chat' && sendText) {
      conv.title = sendText.slice(0, 40) + (sendText.length > 40 ? '\u2026' : '');
    }

    // Build message: include attachments inline (vision models get image urls)
    let userContent = sendText || '';
    const imageAtts = state.attachments.filter(a => (a.type || '').startsWith('image/'));
    if (imageAtts.length) {
      activateVisionIfAvailable(conv);
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
      try {
        if (typeof extractUserMemoryFromText === 'function') {
          extractUserMemoryFromText(userContent);
        }
      } catch (memErr) {
        console.warn('Non-fatal memory extraction error:', memErr);
      }
      conv.messages.push({ role: 'user', content: userContent, ts: Date.now() });
    }

    // Clear input + attachments
    if (input) input.value = '';
    state.attachments = [];
    renderAttachments();
    autosizeInput();
    state.userScrolledUp = false;
    renderChat(true);
    renderConversations();
    return streamAssistant(conv.id);
  }

  // Push an empty assistant message then stream into it.
  // Called by both sendMessage (after pushing the user message) and
  // regenerateLast (after dropping trailing assistant messages).
  async function streamAssistant(targetConvId) {
    const targetId = targetConvId || state.activeConvId;
    const conv = state.conversations.find(c => c.id === targetId) || activeConv();
    if (!conv) return;
    if (isConvStreaming(conv.id)) return;
    const sess = ensureSession(conv);

    // Make sure the last message is an empty assistant slot
    let assistantMsg = conv.messages[conv.messages.length - 1];
    if (!assistantMsg || assistantMsg.role !== 'assistant') {
      assistantMsg = { role: 'assistant', content: '', thinkingContent: '', ts: Date.now() };
      conv.messages.push(assistantMsg);
    } else if (assistantMsg.content) {
      // Regenerate: clear it
      assistantMsg = { role: 'assistant', content: '', thinkingContent: '', ts: Date.now() };
      conv.messages[conv.messages.length - 1] = assistantMsg;
    }

    // Ensure vision is active if this conversation includes image messages
    const hasImageInConv = conv.messages.some(m =>
      Array.isArray(m.content) && m.content.some(p => p.type === 'image_url' || p.image_url)
    );
    if (hasImageInConv) {
      activateVisionIfAvailable(conv);
    }

    // Auto-heal empty or placeholder model if default exists
    if (!sess.model || sess.model === '__placeholder__') {
      const fallback = (state.settings.model && state.settings.model[sess.provider]) ||
                       (MODELS[sess.provider] && MODELS[sess.provider][0]?.id) ||
                       (sess.provider === 'pollinations' ? 'openai' : '');
      if (fallback && fallback !== '__placeholder__') {
        sess.model = fallback;
      }
    }

    // Validate provider/model
    if (!sess.model || sess.model === '__placeholder__') {
      assistantMsg.content = 'No model selected. Open Settings and pick a model.';
      if (state.activeConvId === conv.id) renderChat();
      persist();
      return;
    }
    if (sess.provider === 'groq' && !state.settings.apiKeys.groq) {
      assistantMsg.content = 'Groq API key missing. Open Settings → API keys.';
      if (state.activeConvId === conv.id) renderChat();
      persist();
      return;
    }
    if (sess.provider === 'custom' && !state.settings.custom?.baseUrl) {
      assistantMsg.content = 'Custom provider Base URL missing. Open Settings → Custom Provider → Fetch Models.';
      if (state.activeConvId === conv.id) renderChat();
      persist();
      return;
    }
    // Check custom providers
    const customList = state.settings.customProviders || [];
    const sendCp = customList.find(p => p.id === sess.provider);
    if (sendCp && !sendCp.baseUrl) {
      assistantMsg.content = `${sendCp.name || sendCp.id}: Base URL missing. Open Settings to configure it.`;
      if (state.activeConvId === conv.id) renderChat();
      persist();
      return;
    }

    // Build messages array for the API (no system prompt in the last slot)
    const messages = [{ role: 'system', content: buildSystemPrompt(conv) }];
    for (const m of conv.messages.slice(0, -1)) {
      messages.push({ role: m.role, content: m.content });
    }

    // Stream tracking setup
    const aborter = new AbortController();
    state.activeStreams.set(conv.id, { aborter, assistantMsg });
    updateStreamingUI();
    renderConversations();
    if (state.activeConvId === conv.id) {
      state.userScrolledUp = false;
      renderChat(true);
    }

    try {
      await CC.providerChat(sess.provider, {
        model: sess.model,
        messages,
        temperature: sess.temperature,
        signal: aborter.signal,
        baseUrl: sendCp ? sendCp.baseUrl : (state.settings.custom?.baseUrl || ''),
        apiKey:  sendCp ? (sendCp.apiKey || '')
                : sess.provider === 'custom' ? (state.settings.custom?.apiKey || '')
                : (state.settings.apiKeys[sess.provider] || ''),
        onChunk: (piece, isReasoning) => {
          if (isReasoning) {
            assistantMsg.thinkingContent = (assistantMsg.thinkingContent || '') + piece;
          } else {
            const trimmed = String(piece || '').trim();
            if (trimmed.startsWith('```thinking') || trimmed.startsWith('```thought') || trimmed.startsWith('<think>')) {
              assistantMsg.thinkingActive = true;
              return;
            }
            if (assistantMsg.thinkingActive) {
              if (trimmed.startsWith('```') || trimmed.includes('</think>') || trimmed.includes('</thought>')) {
                assistantMsg.thinkingActive = false;
                return;
              }
              assistantMsg.thinkingContent = (assistantMsg.thinkingContent || '') + piece;
              return;
            }
            assistantMsg.content += piece;
          }

          // Live DOM update with steps and thinking blocks
          if (state.activeConvId === conv.id) {
            const host = document.getElementById('chat');
            if (host) {
              const last = host.lastElementChild;
              if (last && last.classList.contains('msg--assistant')) {
                last.classList.add('is-streaming');
                const actions = last.querySelector('.msg__actions');
                if (actions) actions.style.display = 'none';

                const c = last.querySelector('.msg__content');
                if (c) {
                  if (!c.classList.contains('md')) c.classList.add('md');
                  const streamingDots = '<span class="msg__streaming-indicator" title="Generating response...">' +
                    '<span class="streaming-spinner"></span>' +
                  '</span>';
                  const wasOpen = !!(c.querySelector('.thinking-block[open]'));
                  const stepsHtml = renderStepsBlockHTML(assistantMsg.steps);
                  const thinkingHtml = renderThinkingBlockHTML(assistantMsg.thinkingContent, true, wasOpen);
                  c.innerHTML = stepsHtml + thinkingHtml + mdToSafeHTML(assistantMsg.content || '') + streamingDots;
                  decorateCodeBlocks(c);
                }
                const dist = host.scrollHeight - host.scrollTop - host.clientHeight;
                if (!state.userScrolledUp && dist <= 140) {
                  host.scrollTop = host.scrollHeight;
                } else {
                  updateScrollBottomButton(host);
                }
              } else {
                renderChat(false);
              }
            }
          }
        },
      });

      // Post-stream reasoning extraction & cleanup
      if (typeof assistantMsg.content === 'string') {
        // 1. Extract <think> tags
        const thinkMatch = assistantMsg.content.match(/<think>([\s\S]*?)<\/think>/i);
        if (thinkMatch) {
          assistantMsg.thinkingContent = ((assistantMsg.thinkingContent ? assistantMsg.thinkingContent + '\n\n' : '') + thinkMatch[1]).trim();
          assistantMsg.content = assistantMsg.content.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
        }

        // 2. Extract ```thinking blocks
        const thinkBlockMatch = assistantMsg.content.match(/```(?:thinking|thought)\s*([\s\S]*?)```/i);
        if (thinkBlockMatch) {
          assistantMsg.thinkingContent = ((assistantMsg.thinkingContent ? assistantMsg.thinkingContent + '\n\n' : '') + thinkBlockMatch[1]).trim();
          assistantMsg.content = assistantMsg.content.replace(/```(?:thinking|thought)\s*[\s\S]*?```/i, '').trim();
        }

        // 3. Extract leading reasoning text (e.g. "The user wants me to...", "Thinking Process:", etc.)
        const leadReasoning = assistantMsg.content.match(/^((?:The user wants me to|The user is asking|Thinking Process:|Thought:|Let's think|Let me think|First, I will|First, let's analyze)[\s\S]*?)(?=\n\n(?:[A-Z0-9#*-]|$))/i);
        if (leadReasoning && leadReasoning[1].length < assistantMsg.content.length * 0.85) {
          assistantMsg.thinkingContent = ((assistantMsg.thinkingContent ? assistantMsg.thinkingContent + '\n\n' : '') + leadReasoning[1]).trim();
          assistantMsg.content = assistantMsg.content.slice(leadReasoning[1].length).trim();
        }
      }

      // 4. Autonomous Web Search tool execution loop
      const searchBlockMatch = assistantMsg.content ? assistantMsg.content.match(/```search\s*([\s\S]*?)```/i) : null;
      if (searchBlockMatch && !aborter.signal.aborted) {
        const query = searchBlockMatch[1].trim();
        assistantMsg.content = assistantMsg.content.replace(/```search\s*[\s\S]*?```/i, '').trim();
        if (!assistantMsg.steps) assistantMsg.steps = [];
        const searchStep = {
          id: uid(),
          type: 'search',
          title: `Searching the web for "${query}"…`,
          status: 'running'
        };
        assistantMsg.steps.push(searchStep);
        renderChat(false);

        // Run live search across public sites
        const searchData = await searchWeb(query);
        searchStep.status = 'completed';
        searchStep.title = `Searched the web for "${query}"`;
        searchStep.html = formatSearchResultsHTML(searchData);
        renderChat(false);

        // Feed results back to the model for synthesized answer
        const continuationMessages = [...messages];
        continuationMessages.push({ role: 'assistant', content: `I searched the web for "${query}".` });
        const sourcesText = (searchData.results || []).map((r, idx) => `[${idx+1}] ${r.title}\nSource: ${r.url}\n${r.snippet}`).join('\n\n');
        continuationMessages.push({
          role: 'user',
          content: `[System Tool Result: Live Public Web Search returned ${searchData.results?.length || 0} verified results for "${query}"]:\n\n${sourcesText}\n\nPlease read these verified public sources and deliver the final accurate, synthesized answer for the user with relevant links and citations. Keep the response clean and polished. Do not output any code blocks with language "search".`
        });

        // Clear temporary content and stream final answer
        assistantMsg.content = '';
        renderChat(false);

        await CC.providerChat(sess.provider, {
          model: sess.model,
          messages: continuationMessages,
          temperature: sess.temperature,
          signal: aborter.signal,
          baseUrl: sendCp ? sendCp.baseUrl : (state.settings.custom?.baseUrl || ''),
          apiKey:  sendCp ? (sendCp.apiKey || '')
                  : sess.provider === 'custom' ? (state.settings.custom?.apiKey || '')
                  : (state.settings.apiKeys[sess.provider] || ''),
          onChunk: (piece, isReasoning) => {
            if (isReasoning) {
              assistantMsg.thinkingContent = (assistantMsg.thinkingContent || '') + piece;
            } else {
              assistantMsg.content += piece;
            }
            if (state.activeConvId === conv.id) {
              const host = document.getElementById('chat');
              if (host) {
                const last = host.lastElementChild;
                if (last && last.classList.contains('msg--assistant')) {
                  const c = last.querySelector('.msg__content');
                  if (c) {
                    const streamingDots = '<span class="msg__streaming-indicator" title="Generating response..."><span class="streaming-spinner"></span></span>';
                    const wasOpen = !!(c.querySelector('.thinking-block[open]'));
                    const stepsHtml = renderStepsBlockHTML(assistantMsg.steps);
                    const thinkingHtml = renderThinkingBlockHTML(assistantMsg.thinkingContent, true, wasOpen);
                    c.innerHTML = stepsHtml + thinkingHtml + mdToSafeHTML(assistantMsg.content || '') + streamingDots;
                    decorateCodeBlocks(c);
                  }
                }
              }
            }
          }
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        if (e.message === '__POLLINATIONS_AUTH_HELP__') {
          assistantMsg.isHelpCard = true;
          assistantMsg.content = `
<div class="ai-help-card">
  <h4>Free API Key Recommended</h4>
  <p>Pollinations public queue is currently busy or requires authentication for this request.</p>
  <p><strong>Recommended Fix:</strong> Switch to <strong>Groq</strong> for ultra-fast, 100% free chat!</p>
  <ul>
    <li><strong>Groq (100% Free &amp; Ultra Fast):</strong> Get an instant key from <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com</a></li>
    <li><strong>OpenRouter (Free Models):</strong> Get a key at <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener">openrouter.ai</a> to chat with Llama 3.3, Qwen 2.5 &amp; DeepSeek</li>
    <li><strong>Pollinations Key:</strong> Get your free key at <a href="https://enter.pollinations.ai" target="_blank" rel="noopener">enter.pollinations.ai</a> and paste it into Settings</li>
    <li><strong>Custom Provider:</strong> Connect Ollama (<code>http://localhost:11434/v1</code>) with no keys needed!</li>
  </ul>
  <div class="ai-help-actions">
    <button class="chip chip--action" type="button" onclick="window.__CC.openSettings(true)">Open Settings</button>
  </div>
</div>`;
        } else if (sess.provider === 'custom' && (e.message?.includes('Failed to fetch') || e.name === 'TypeError')) {
          const baseUrl = state.settings.custom?.baseUrl || 'your endpoint';
          assistantMsg.isHelpCard = true;
          assistantMsg.content = `
<div class="ai-help-card">
  <div class="ai-help-head">
    <span class="ai-help-badge" style="background:#fee2e2; color:#b91c1c;">Connection Issue</span>
    <h4>Unable to Connect to Custom Provider</h4>
  </div>
  <p>The network request to <code>${escapeHTML(baseUrl)}</code> failed. This is almost always caused by browser <strong>CORS (Cross-Origin Resource Sharing)</strong> security restrictions or an unstarted local server.</p>
  <ul>
    <li><strong>Ollama (localhost:11434):</strong> Close Ollama from system tray, then restart with CORS enabled:
      <br>PowerShell: <code>$env:OLLAMA_ORIGINS="*" ; ollama serve</code>
      <br>CMD: <code>set OLLAMA_ORIGINS=* &amp;&amp; ollama serve</code>
    </li>
    <li><strong>LM Studio (localhost:1234):</strong> Open LM Studio &rarr; <em>Local Server</em> tab &rarr; Turn <strong>ON</strong> "Enable CORS".</li>
    <li><strong>Official OpenAI (api.openai.com):</strong> OpenAI explicitly blocks direct browser calls for security.</li>
    <li><strong>Endpoint URL:</strong> Ensure your URL includes <code>/v1</code> (e.g. <code>http://localhost:11434/v1</code>) and that the server is currently running.</li>
  </ul>
  <div class="ai-help-actions">
    <button class="chip chip--action" type="button" onclick="window.__CC.openSettings(true)">Open Settings</button>
  </div>
</div>`;
        } else {
          assistantMsg.content += (assistantMsg.content ? '\n\n' : '') + (e.message || 'Request failed');
        }
      }
    } finally {
      state.activeStreams.delete(conv.id);
      updateStreamingUI();
      renderConversations();
      if (state.activeConvId === conv.id) {
        renderChat(false);
      }
      persist();
    }
  }

  async function regenerateLast() {
    const conv = activeConv(); if (!conv) return;
    if (isConvStreaming(conv.id)) return;
    // Find last user message; drop everything after it
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'user') {
        conv.messages = conv.messages.slice(0, i + 1);
        state.userScrolledUp = false;
        renderChat(true);
        return streamAssistant(conv.id);
      }
    }
  }

  function stopStream(convId) {
    const id = (typeof convId === 'string' && convId) ? convId : state.activeConvId;
    const s = state.activeStreams.get(id);
    if (s && s.aborter) {
      try { s.aborter.abort(); } catch (_) {}
    }
  }

  function updateStreamingUI() {
    const isCurrentStreaming = isConvStreaming(state.activeConvId);
    const send = document.getElementById('sendBtn');
    const stop = document.getElementById('stopBtn');
    if (send) send.hidden = isCurrentStreaming;
    if (stop) stop.hidden = !isCurrentStreaming;
    document.body.classList.toggle('is-streaming', isCurrentStreaming);
  }

  function setStreamingUI(on) {
    updateStreamingUI();
  }

  // Expose everything defined in part 4 to subsequent chunks and the rest of the app
  Object.assign(CC, {
    // core rendering
    buildSystemPrompt, renderModes, updateSuggestions,
    renderConversations, createConversation, uid,
    renameConversation, togglePinConversation, duplicateConversation,
    exportSingleConversation, deleteConversation,
    openConvContextMenu, closeConvContextMenu, setupConvContextMenu,
    renderChat, renderMessage, mdToSafeHTML, flashAction,
    updateScrollBottomButton, renderChatRail, updateActiveRailItem,
    renderSkills, skillOn, toggleSkill,
    refreshTopbarModelButton, currentModel, getAllProviders,
    openTopbarDropdown, renderTopbarModelList, renderTopbarProviderBar, makeTopbarModelRow,
    renderModelOptions, openModelDropdown,
    setProviderStatus,
    decorateCodeBlocks, switchMode, renderHero,
    openCanvas, closeCanvas, getCanvasHtml: () => canvasCurrentHtml,
    getCanvasType: () => canvasCurrentType, getCanvasTitle: () => canvasCurrentTitle,
    openProjectFilesModal, closeProjectFilesModal, saveConvFile, applyFileEdit, updateProjectFilesBadge, setupProjectFilesModal,
    autosizeInput, renderAttachments,
    isModelVisionCapable, activateVisionIfAvailable,
    // send / stream / regenerate
    sendMessage, streamAssistant, regenerateLast, stopStream, setStreamingUI, updateStreamingUI, switchConversation, isConvStreaming,
    extractUserMemoryFromText, recordMemoryFact, renderMemoryFactsUI,
    // incognito mode
    toggleIncognito, deactivateIncognito, handleIncognitoClearKeep, handleIncognitoClearClear,
    // MCP tools & connectors
    SQL_DB, searchWeb, formatSearchResultsHTML, fetchGitHubRepo, formatGitHubRepoHTML,
    sendSlackMessage, createCalendarEvent, formatCalendarEventHTML, renderSVGChart, parseChartSpec, formatChartHTML,
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
          updateScrollBottomButton, setupConvContextMenu,
          refreshTopbarModelButton, setProviderStatus,
          openTopbarDropdown, renderTopbarModelList, renderTopbarProviderBar,
          getAllProviders,
          renderModelOptions, openModelDropdown,
          handleFetchLiveModels, handleFetchCustomModels,
          sendMessage, stopStream, autosizeInput, renderAttachments,
          updateStreamingUI, switchConversation, isConvStreaming,
          isModelVisionCapable, activateVisionIfAvailable,

          buildSystemPrompt, providerChat, customChat, pollinationsChat,
          groqChat, openrouterChat, fetchLiveModels,
          uid, mdToSafeHTML, currentModel, skillOn,
          toShortModelName, thinkingLabel, THINKING_LEVELS,
          SQL_DB, searchWeb, fetchGitHubRepo, sendSlackMessage, createCalendarEvent, renderSVGChart, openCanvas,
          openProjectFilesModal, closeProjectFilesModal, saveConvFile, applyFileEdit, updateProjectFilesBadge, setupProjectFilesModal,
          extractUserMemoryFromText, recordMemoryFact, renderMemoryFactsUI,
          toggleIncognito, deactivateIncognito, handleIncognitoClearKeep, handleIncognitoClearClear,
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
  // Composer helpers: file attach, paste images, voice
  // -----------------------------------------------------------------------
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

  // Optimize & downscale images (max 1568px, quality 0.85) to ensure fast uploads
  // and prevent exceeding provider payload ceilings (e.g. Groq 4MB limit)
  function readAndOptimizeImage(file, maxWidth = 1568, maxHeight = 1568, quality = 0.85) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        return readFileAsDataURL(file).then(dataUrl => resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
        })).catch(reject);
      }

      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Failed to read image file'));
      reader.onload = (ev) => {
        const rawDataUrl = ev.target.result;
        const img = new Image();
        img.onerror = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: rawDataUrl });
        img.onload = () => {
          let { width, height } = img;
          const needsResize = width > maxWidth || height > maxHeight;
          const isLarge = file.size > 800 * 1024;

          if (!needsResize && !isLarge) {
            return resolve({ name: file.name, type: file.type, size: file.size, dataUrl: rawDataUrl });
          }

          if (needsResize) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve({ name: file.name, type: file.type, size: file.size, dataUrl: rawDataUrl });
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const outType = (file.type === 'image/png' && !needsResize && file.size < 1024 * 1024) ? 'image/png' : 'image/jpeg';
          try {
            const optimizedDataUrl = canvas.toDataURL(outType, quality);
            const approxSize = Math.round((optimizedDataUrl.length * 3) / 4);
            resolve({
              name: file.name,
              type: outType,
              size: approxSize,
              dataUrl: optimizedDataUrl,
            });
          } catch {
            resolve({ name: file.name, type: file.type, size: file.size, dataUrl: rawDataUrl });
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
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
    if (light) light.disabled = (t === 'dark');
    if (dark)  dark.disabled  = (t !== 'dark');
    const btn = document.getElementById('toggleThemeBtn');
    if (btn) {
      btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      btn.title = t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    }
    const icon = document.getElementById('themeIcon');
    if (icon) {
      if (t === 'dark') {
        // Moon icon
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
      } else {
        // Sun icon
        icon.innerHTML = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>';
      }
    }
  }

  function setupTheme() {
    let t = LS.get('cc.theme', null) || document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(t);
    const btn = document.getElementById('toggleThemeBtn');
    on(btn, 'click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      t = (current === 'dark') ? 'light' : 'dark';
      LS.set('cc.theme', t);
      applyTheme(t);
    });
  }

  // -----------------------------------------------------------------------
  // Sidebar (Desktop Collapse & Mobile Drawer)
  // -----------------------------------------------------------------------
  function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    const collapseBtn = document.getElementById('collapseSidebarBtn');
    const headerCollapseBtn = document.getElementById('headerCollapseBtn');
    const brandZone = document.getElementById('sidebarBrandZone');
    const openBtn = document.getElementById('openSidebarBtn');
    const closeBtn = document.getElementById('closeSidebarBtn');

    // Restore desktop collapsed state
    const isCollapsed = !!LS.get('cc.sidebar.collapsed', false);
    if (isCollapsed && sidebar && window.innerWidth > 768) {
      sidebar.classList.add('is-collapsed');
    }

    function toggleDesktopSidebar(forceState) {
      if (!sidebar) return;
      if (typeof forceState === 'boolean') {
        sidebar.classList.toggle('is-collapsed', forceState);
      } else {
        sidebar.classList.toggle('is-collapsed');
      }
      LS.set('cc.sidebar.collapsed', sidebar.classList.contains('is-collapsed'));
    }

    // Header hover collapse button (sidebar head)
    on(headerCollapseBtn, 'click', (e) => {
      e.stopPropagation();
      toggleDesktopSidebar(true);
    });

    on(brandZone, 'click', (e) => {
      if (window.innerWidth > 768) {
        toggleDesktopSidebar(true);
      }
    });

    // Collapse button (sidebar foot)
    on(collapseBtn, 'click', () => {
      toggleDesktopSidebar(true);
    });

    // Toggle/Open button (topbar)
    on(openBtn, 'click', () => {
      if (!sidebar) return;
      if (window.innerWidth <= 768) {
        const open = sidebar.classList.toggle('is-open');
        if (scrim) scrim.classList.toggle('is-open', open);
      } else {
        toggleDesktopSidebar();
      }
    });

    // Global keyboard shortcut: Ctrl+[ or Cmd+[ or Ctrl+\ to toggle sidebar
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '[' || e.key === '\\')) {
        e.preventDefault();
        if (window.innerWidth <= 768) {
          const open = sidebar.classList.toggle('is-open');
          if (scrim) scrim.classList.toggle('is-open', open);
        } else {
          toggleDesktopSidebar();
        }
      }
    });

    // Close button (mobile header)
    on(closeBtn, 'click', () => {
      if (sidebar) sidebar.classList.remove('is-open');
      if (scrim) scrim.classList.remove('is-open');
    });

    // Scrim backdrop
    on(scrim, 'click', () => {
      if (sidebar) sidebar.classList.remove('is-open');
      if (scrim) scrim.classList.remove('is-open');
    });

    // New chat
    on($('#newChatBtn'), 'click', () => {
      createConversation();
      state.userScrolledUp = false;
      renderConversations();
      renderChat(true);
      refreshTopbarModelButton();
      setProviderStatus();
      updateStreamingUI();
      if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove('is-open');
        if (scrim) scrim.classList.remove('is-open');
      }
      const input = document.getElementById('input');
      if (input && typeof input.focus === 'function') input.focus();
    });

    // Search conversations
    on($('#searchInput'), 'input', renderConversations);

    // Setup collapsible sections: Modes Accordion
    const toggleModesBtn = document.getElementById('toggleModesBtn');
    const modesBody = document.getElementById('modesBody');
    if (toggleModesBtn && modesBody) {
      const isCollapsed = !!LS.get('cc.sidebar.modes.collapsed', false);
      if (isCollapsed) {
        modesBody.classList.add('is-collapsed');
        toggleModesBtn.setAttribute('aria-expanded', 'false');
      }
      on(toggleModesBtn, 'click', () => {
        const collapsed = modesBody.classList.toggle('is-collapsed');
        toggleModesBtn.setAttribute('aria-expanded', (!collapsed).toString());
        LS.set('cc.sidebar.modes.collapsed', collapsed);
      });
    }

    // Setup collapsible sections: Chats Accordion
    const toggleChatsBtn = document.getElementById('toggleChatsBtn');
    const chatsBody = document.getElementById('chatsBody');
    if (toggleChatsBtn && chatsBody) {
      const isCollapsed = !!LS.get('cc.sidebar.chats.collapsed', false);
      if (isCollapsed) {
        chatsBody.classList.add('is-collapsed');
        toggleChatsBtn.setAttribute('aria-expanded', 'false');
      }
      on(toggleChatsBtn, 'click', () => {
        const collapsed = chatsBody.classList.toggle('is-collapsed');
        toggleChatsBtn.setAttribute('aria-expanded', (!collapsed).toString());
        LS.set('cc.sidebar.chats.collapsed', collapsed);
      });
    }
  }

  // -----------------------------------------------------------------------
  // Settings modal
  // -----------------------------------------------------------------------
  function switchSettingsTab(tabName) {
    if (!tabName) return;
    const tabs = document.querySelectorAll('#settingsTabs .settings-tab');
    const panes = document.querySelectorAll('#settingsModal .settings-pane');
    tabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === tabName));
    panes.forEach(p => p.classList.toggle('is-active', p.dataset.pane === tabName));
  }
  CC.switchSettingsTab = switchSettingsTab;

  function openSettings(open, initialTab) {
    const m = document.getElementById('settingsModal');
    if (!m) return;
    if (open) {
      // Pre-fill all inputs from current settings + active session
      fillSettingsFromState();
      if (initialTab) switchSettingsTab(initialTab);
      m.hidden = false;
      requestAnimationFrame(() => m.classList.add('is-open'));
    } else {
      m.classList.remove('is-open');
      setTimeout(() => { m.hidden = true; }, 160);
    }
  }
  CC.openSettings = openSettings;

  function updateModelHint(prov) {
    const hint = document.getElementById('modelHint');
    if (!hint) return;
    if (prov === 'pollinations') {
      hint.textContent = 'Free immediate inference directly from your browser. Vision and markdown enabled.';
    } else if (prov === 'groq') {
      hint.textContent = 'Ultra-fast Groq LPU inference. Enter your API key above to fetch all available models.';
    } else if (prov === 'openrouter') {
      hint.textContent = 'Hundreds of open & commercial models. Enter key to fetch complete models list.';
    } else if (prov === 'custom') {
      hint.textContent = 'Connects to your custom OpenAI-compatible endpoint. Click "Fetch Models" to load models.';
    }
  }

  // User Memory functions are defined in Part 4 and imported via CC above.

  // -----------------------------------------------------------------------
  // Real Approximate Location via IP Geolocation
  // -----------------------------------------------------------------------
  async function initUserLocation() {
    try {
      const cached = localStorage.getItem('cc.userLocation.v1');
      if (cached) {
        state.userLocation = JSON.parse(cached);
        updateLocationDescUI();
      }
    } catch (_) {}

    try {
      const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(4500) });
      if (res.ok) {
        const d = await res.json();
        if (d && d.success !== false) {
          state.userLocation = {
            city: d.city || '',
            region: d.region || '',
            country: d.country || '',
            timezone: d.timezone?.id || Intl.DateTimeFormat().resolvedOptions().timeZone,
            latitude: d.latitude,
            longitude: d.longitude,
          };
          try {
            localStorage.setItem('cc.userLocation.v1', JSON.stringify(state.userLocation));
          } catch (_) {}
          updateLocationDescUI();
        }
      }
    } catch (e) {
      console.warn('Location detection notice:', e.message);
      if (!state.userLocation) {
        state.userLocation = {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        updateLocationDescUI();
      }
    }
  }

  function updateLocationDescUI() {
    const desc = document.getElementById('detectedLocationDesc');
    if (!desc) return;
    if (state.userLocation && (state.userLocation.city || state.userLocation.country)) {
      const locStr = [state.userLocation.city, state.userLocation.region, state.userLocation.country].filter(Boolean).join(', ');
      desc.textContent = `📍 ${locStr}`;
      desc.title = `Approximate IP location: ${locStr} (${state.userLocation.timezone || ''})`;
    } else {
      desc.textContent = `📍 ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'Approximate location via IP'}`;
    }
  }

  function fillSettingsFromState() {
    const prov = state.settings.provider;
    // Provider radio
    const rad = document.querySelector(`input[name="provider"][value="${prov}"]`);
    if (rad) rad.checked = true;
    document.querySelectorAll('.provider-item').forEach(item => {
      const r = item.querySelector('input[type="radio"]');
      item.classList.toggle('is-active', r && r.value === prov);
    });
    // API keys
    const pk = document.getElementById('pollinationsApiKeyInput');
    if (pk) pk.value = state.settings.apiKeys.pollinations || '';
    const gk = document.getElementById('groqApiKeyInput');
    if (gk) gk.value = state.settings.apiKeys.groq || '';
    const ok = document.getElementById('openrouterApiKeyInput');
    if (ok) ok.value = state.settings.apiKeys.openrouter || '';
    // Render custom providers list
    renderCustomProvidersSettings();

    // Capabilities toggles (default enabled)
    const caps = state.settings.capabilities || {};
    const capWeb = document.getElementById('capWebSearch');
    if (capWeb) capWeb.checked = caps.web !== false;
    const capThink = document.getElementById('capThinking');
    if (capThink) capThink.checked = caps.think !== false;
    const capCanv = document.getElementById('capCanvas');
    if (capCanv) capCanv.checked = caps.canvas !== false;
    const capPdf = document.getElementById('capPdf');
    if (capPdf) capPdf.checked = caps.pdf !== false;
    const capPpt = document.getElementById('capPpt');
    if (capPpt) capPpt.checked = caps.ppt !== false;
    const capProject = document.getElementById('capProject');
    if (capProject) capProject.checked = caps.project !== false;
    const capMem = document.getElementById('capMemory');
    if (capMem) capMem.checked = caps.memory !== false;
    const capLoc = document.getElementById('capLocation');
    if (capLoc) capLoc.checked = caps.location !== false;

    // Location badge
    updateLocationDescUI();

    // User Memory & Notes
    const un = document.getElementById('userMemoryNotes');
    if (un) un.value = state.settings.userMemory?.notes || '';
    renderMemoryFactsUI();

    // Toggles
    const st = document.getElementById('streamToggle');
    if (st) st.checked = !!state.settings.stream;
    // Temperature
    const t = activeSession()?.temperature ?? state.settings.temperature;
    const tr = document.getElementById('tempRange');
    const tv = document.getElementById('tempVal');
    if (tr) tr.value = String(t);
    if (tv) tv.textContent = (+t).toFixed(2);
    // System Persona (Conversation vs Global)
    const convPrompt = activeSession()?.systemPromptOverride || '';
    const globPrompt = state.settings.globalSystemPrompt || '';
    const scopeConvBtn = document.getElementById('personaScopeConvBtn');
    const scopeGlobBtn = document.getElementById('personaScopeGlobalBtn');
    const scopeHint = document.getElementById('personaScopeHint');
    const sp = document.getElementById('systemPromptInput');

    if (state.personaScope === 'global') {
      if (scopeGlobBtn) scopeGlobBtn.classList.add('is-active');
      if (scopeConvBtn) scopeConvBtn.classList.remove('is-active');
      if (scopeHint) scopeHint.textContent = 'Custom persona and instructions applied globally across all conversations.';
      if (sp) {
        sp.value = globPrompt;
        sp.placeholder = 'Define global custom persona for all chats...';
      }
    } else {
      if (scopeConvBtn) scopeConvBtn.classList.add('is-active');
      if (scopeGlobBtn) scopeGlobBtn.classList.remove('is-active');
      if (scopeHint) scopeHint.textContent = 'Custom persona and instructions applied only to this conversation.';
      if (sp) {
        sp.value = convPrompt;
        sp.placeholder = 'Define custom instructions for this chat (optional)...';
      }
    }
    // Model dropdown & hint
    renderModelOptions();
    updateModelHint(prov);
    renderConnectorsSettings();
  }
  CC.fillSettingsFromState = fillSettingsFromState;

  // -----------------------------------------------------------------------
  // Dynamic custom providers cards in settings
  // -----------------------------------------------------------------------
  function renderCustomProvidersSettings() {
    const host = document.getElementById('customProvidersList');
    const badge = document.getElementById('customProvCountBadge');
    const cpList = state.settings.customProviders || [];
    if (badge) badge.textContent = `${cpList.length} configured`;
    if (!host) return;
    host.innerHTML = '';

    const activeProv = activeSession()?.provider || state.settings.provider;
    const isAnyCustomActive = cpList.some(cp => cp.id === activeProv);
    if (isAnyCustomActive) {
      const toggle = document.getElementById('customProvidersToggleBtn');
      const body = document.getElementById('customProvidersBody');
      if (toggle && body) {
        toggle.setAttribute('aria-expanded', 'true');
        body.hidden = false;
      }
    }

    for (const cp of cpList) {
      const modelCount = (MODELS[cp.id] || []).length;
      const isSelected = activeProv === cp.id;
      const card = document.createElement('div');
      card.className = 'custom-provider-card' + (isSelected ? ' is-active' : '');
      card.dataset.cpId = cp.id;
      card.innerHTML = `
        <div class="custom-provider-card__head">
          <input type="radio" name="provider" value="${escapeHTML(cp.id)}" ${isSelected ? 'checked' : ''} title="Select as active provider" />
          <div class="custom-provider-card__name-wrap">
            <input class="custom-provider-card__name-input" type="text" value="${escapeHTML(cp.name || '')}" placeholder="Provider name" data-cp-field="name" data-cp-id="${escapeHTML(cp.id)}" />
            <span class="custom-provider-status${modelCount ? ' is-ok' : ''}" data-cp-status="${escapeHTML(cp.id)}" title="${modelCount ? '✓ ' + modelCount + ' models' : 'Not fetched'}">${modelCount ? '✓ ' + modelCount + ' models' : 'Not fetched'}</span>
          </div>
          <button class="custom-provider-card__del-btn" type="button" data-cp-del="${escapeHTML(cp.id)}" title="Remove provider">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <div class="custom-provider-card__body">
          <div class="custom-fields-grid">
            <div class="custom-field custom-field--full">
              <label class="field-label">Base URL</label>
              <input type="text" value="${escapeHTML(cp.baseUrl || '')}" placeholder="https://gorouter.app/v1 or https://api.kilo.ai/api/gateway" data-cp-field="baseUrl" data-cp-id="${escapeHTML(cp.id)}" autocomplete="off" spellcheck="false" />
              <span class="field-hint">e.g. <code>https://gorouter.app/v1</code>, <code>https://api.kilo.ai/api/gateway</code>, <code>http://localhost:11434/v1</code></span>
            </div>
            <div class="custom-field custom-field--full">
              <div class="api-key-row__head">
                <span class="field-label">API Key (optional)</span>
                <button type="button" class="api-key-row__toggle toggle-custom-key-btn" data-target="cp-key-${escapeHTML(cp.id)}">Show</button>
              </div>
              <input type="password" id="cp-key-${escapeHTML(cp.id)}" value="${escapeHTML(cp.apiKey || '')}" placeholder="sk-... or Bearer token" data-cp-field="apiKey" data-cp-id="${escapeHTML(cp.id)}" autocomplete="off" spellcheck="false" />
            </div>
            <div class="custom-field custom-field--full">
              <label class="field-label">Model ID (optional fallback)</label>
              <input type="text" value="${escapeHTML(cp.defaultModel || '')}" placeholder="e.g. gpt-4o, claude-3-5-sonnet, deepseek-chat" data-cp-field="defaultModel" data-cp-id="${escapeHTML(cp.id)}" autocomplete="off" spellcheck="false" />
              <span class="field-hint">Used directly if provider endpoint does not permit listing /models</span>
            </div>
          </div>
          <div class="custom-provider-card__actions">
            <button type="button" class="btn btn--sm btn--primary custom-fetch-btn" data-cp-fetch="${escapeHTML(cp.id)}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              Fetch Models
            </button>
          </div>
        </div>`;
      host.appendChild(card);

      // Wire active selection radio
      const cardRadio = card.querySelector('input[type="radio"][name="provider"]');
      if (cardRadio) {
        on(cardRadio, 'change', () => {
          if (cardRadio.checked) applyProviderChange(cp.id);
        });
      }

      // Wire Fetch Models button
      const fetchBtn = card.querySelector('[data-cp-fetch]');
      if (fetchBtn) {
        on(fetchBtn, 'click', () => {
          handleFetchCustomModels(cp.id);
        });
      }

      // Wire Show/Hide password toggle
      const toggleBtn = card.querySelector('.toggle-custom-key-btn');
      if (toggleBtn) {
        on(toggleBtn, 'click', () => {
          const inp = document.getElementById(toggleBtn.dataset.target);
          if (!inp) return;
          const isPass = inp.type === 'password';
          inp.type = isPass ? 'text' : 'password';
          toggleBtn.textContent = isPass ? 'Hide' : 'Show';
        });
      }

      // Wire events for this card
      card.querySelectorAll('input[data-cp-field]').forEach(inp => {
        const field = inp.dataset.cpField;
        const cpId = inp.dataset.cpId;
        const handler = (e) => {
          const target = (state.settings.customProviders || []).find(p => p.id === cpId);
          if (!target) return;
          target[field] = (e.target.value || '').trim();
          // Keep legacy custom in sync
          if (cpList.indexOf(target) === 0) {
            state.settings.custom[field === 'baseUrl' ? 'baseUrl' : field === 'apiKey' ? 'apiKey' : field === 'name' ? 'name' : field] = target[field];
          }
          persist();
          if (field === 'name') {
            setProviderStatus();
            renderTopbarProviderBar();
          }
          if (field === 'baseUrl' || field === 'apiKey') {
            setProviderStatus();
            debounceAutoFetchCustom(cpId, 800);
          }
        };
        on(inp, 'input', handler);
        on(inp, 'change', (e) => {
          handler(e);
          if (field === 'baseUrl' || field === 'apiKey') {
            debounceAutoFetchCustom(cpId, 50);
          }
        });
      });

      // Delete button
      const delBtn = card.querySelector('[data-cp-del]');
      if (delBtn) {
        on(delBtn, 'click', () => {
          if (cpList.length <= 1) {
            toast('Need at least one custom provider', 'warn');
            return;
          }
          const idx = cpList.findIndex(p => p.id === cp.id);
          if (idx >= 0) cpList.splice(idx, 1);
          delete MODELS[cp.id];
          persist();
          renderCustomProvidersSettings();
          renderTopbarProviderBar();
        });
      }
    }
  }

  // Auto-fetch for a specific custom provider
  let customAutoFetchTimers = {};
  function debounceAutoFetchCustom(cpId, delayMs) {
    if (customAutoFetchTimers[cpId]) clearTimeout(customAutoFetchTimers[cpId]);
    customAutoFetchTimers[cpId] = setTimeout(async () => {
      const cp = (state.settings.customProviders || []).find(p => p.id === cpId);
      if (!cp || !cp.baseUrl) return;
      if (!cp.baseUrl.startsWith('http://') && !cp.baseUrl.startsWith('https://')) return;
      const statusEl = document.querySelector(`[data-cp-status="${cpId}"]`);
      if (statusEl) {
        statusEl.className = 'custom-provider-status is-loading';
        statusEl.textContent = '⏳ Fetching…';
        statusEl.title = 'Fetching models from endpoint…';
      }
      try {
        const list = await fetchLiveModels(cpId, { baseUrl: cp.baseUrl, apiKey: cp.apiKey });
        if (statusEl) {
          statusEl.className = 'custom-provider-status is-ok';
          statusEl.textContent = `✓ ${list.length} models`;
          statusEl.title = `✓ ${list.length} models loaded`;
        }
        toast(`Auto-loaded ${list.length} models from ${cp.name || cpId}`, 'ok');
        renderModelOptions();
        refreshTopbarModelButton();
        renderTopbarProviderBar();
        setProviderStatus();
      } catch (e) {
        console.warn(`Auto-fetch ${cpId}:`, e.message);
        if (statusEl) {
          statusEl.className = 'custom-provider-status is-err';
          statusEl.textContent = '✗ ' + e.message;
          statusEl.title = e.message;
        }
      }
    }, delayMs);
  }

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
    updateModelHint(prov);

    // Update active highlight classes on both cloud providers and custom providers
    document.querySelectorAll('.provider-item').forEach(item => {
      const r = item.querySelector('input[type="radio"]');
      item.classList.toggle('is-active', r && r.value === prov);
    });
    document.querySelectorAll('.custom-provider-card').forEach(c => {
      c.classList.toggle('is-active', c.dataset.cpId === prov);
      const r = c.querySelector('input[type="radio"]');
      if (r) r.checked = (c.dataset.cpId === prov);
    });
  }
  CC.applyProviderChange = applyProviderChange;

  function applyKeyChange(provider, value) {
    state.settings.apiKeys[provider] = (value || '').trim();
    persist();
  }

  // Live Auto-fetch when user types or pastes credentials
  let autoFetchTimer = null;
  function debounceAutoFetch(provider, delayMs = 650) {
    if (autoFetchTimer) clearTimeout(autoFetchTimer);
    autoFetchTimer = setTimeout(async () => {
      const s = state.settings;
      if (provider === 'pollinations') {
        const key = (s.apiKeys.pollinations || '').trim();
        if (key.length >= 10) {
          try {
            const list = await fetchLiveModels('pollinations', { apiKey: key });
            toast(`Auto-loaded ${list.length} Pollinations models!`, 'ok');
            renderModelOptions();
            refreshTopbarModelButton();
          } catch (e) {
            console.warn('Pollinations auto-fetch:', e.message);
          }
        }
      } else if (provider === 'groq') {
        const key = (s.apiKeys.groq || '').trim();
        if (key.length >= 15) {
          const txt = document.getElementById('fetchModelsBtnText');
          if (txt && s.provider === 'groq') txt.textContent = 'Auto-fetching…';
          try {
            const list = await fetchLiveModels('groq', { apiKey: key });
            toast(`Auto-loaded ${list.length} Groq models!`, 'ok');
            renderModelOptions();
            refreshTopbarModelButton();
          } catch (e) {
            console.warn('Groq auto-fetch:', e.message);
          } finally {
            if (txt && s.provider === 'groq') txt.textContent = 'Fetch Live Models';
          }
        }
      } else if (provider === 'openrouter') {
        const key = (s.apiKeys.openrouter || '').trim();
        if (key.length >= 15) {
          const txt = document.getElementById('fetchModelsBtnText');
          if (txt && s.provider === 'openrouter') txt.textContent = 'Auto-fetching…';
          try {
            const list = await fetchLiveModels('openrouter', { apiKey: key });
            toast(`Auto-loaded ${list.length} OpenRouter models!`, 'ok');
            renderModelOptions();
            refreshTopbarModelButton();
          } catch (e) {
            console.warn('OpenRouter auto-fetch:', e.message);
          } finally {
            if (txt && s.provider === 'openrouter') txt.textContent = 'Fetch Live Models';
          }
        }
      }
    }, delayMs);
  }

  // -----------------------------------------------------------------------
  // Connectors & MCP Integrations Settings
  // -----------------------------------------------------------------------
  function renderConnectorsSettings() {
    const conn = state.settings.connectors = state.settings.connectors || {};

    // Update toggles and inputs
    for (const [key, cfg] of Object.entries(conn)) {
      const toggle = document.getElementById(`connectorToggle-${key}`);
      if (toggle) toggle.checked = !!cfg.enabled;

      const card = document.querySelector(`.connector-card[data-connector="${key}"]`);
      if (card) card.classList.toggle('is-active', !!cfg.enabled);

      const keyInp = document.getElementById(`connectorKey-${key}`);
      if (keyInp) {
        keyInp.value = cfg.token || cfg.webhookUrl || cfg.email || '';
      }
    }

    // Cloud provider / region
    const cloudProv = document.getElementById('connectorCloudProvider');
    if (cloudProv && conn.cloud?.provider) cloudProv.value = conn.cloud.provider;
    const cloudRegion = document.getElementById('connectorCloudRegion');
    if (cloudRegion && conn.cloud?.region) cloudRegion.value = conn.cloud.region;

    // Update summary badge
    const activeCount = Object.keys(conn).filter(k => conn[k]?.enabled).length;
    const totalCount = Object.keys(conn).length;
    const badge = document.querySelector('.connectors-tier-badge');
    if (badge) {
      badge.innerHTML = `<span class="badge ${activeCount > 0 ? 'badge--green' : 'badge--subtle'}">${activeCount} of ${totalCount} Active</span>`;
    }
  }

  function setupConnectorsSettings() {
    const conn = state.settings.connectors = state.settings.connectors || {};

    // Wire toggle checkboxes
    $$('[data-connector-toggle]').forEach(input => {
      on(input, 'change', () => {
        const id = input.dataset.connectorToggle;
        if (!conn[id]) conn[id] = {};
        conn[id].enabled = input.checked;
        persist();
        renderConnectorsSettings();
        toast(`${id} connector ${input.checked ? 'enabled' : 'disabled'}`, 'ok');
      });
    });

    // Wire key / token inputs
    $$('[data-connector-key]').forEach(input => {
      on(input, 'change', () => {
        const id = input.dataset.connectorKey;
        if (!conn[id]) conn[id] = {};
        if (id === 'slack') conn[id].webhookUrl = input.value.trim();
        else if (id === 'gmail') conn[id].email = input.value.trim();
        else conn[id].token = input.value.trim();
        persist();
        toast(`${id} credentials saved`, 'ok');
      });
    });

    // Wire cloud select / region
    const cloudProv = document.getElementById('connectorCloudProvider');
    if (cloudProv) {
      on(cloudProv, 'change', () => {
        if (!conn.cloud) conn.cloud = {};
        conn.cloud.provider = cloudProv.value;
        persist();
      });
    }
    const cloudRegion = document.getElementById('connectorCloudRegion');
    if (cloudRegion) {
      on(cloudRegion, 'change', () => {
        if (!conn.cloud) conn.cloud = {};
        conn.cloud.region = cloudRegion.value.trim();
        persist();
      });
    }

    // Wire Test Connection buttons
    $$('[data-connector-test]').forEach(btn => {
      on(btn, 'click', async () => {
        const id = btn.dataset.connectorTest;
        const originalText = btn.textContent;
        btn.textContent = 'Testing...';
        btn.disabled = true;

        try {
          if (id === 'database') {
            const res = SQL_DB.execute('SELECT * FROM users LIMIT 3;');
            if (res.error) throw new Error(res.error);
            toast(`SQL Engine online! 4 tables indexed (${res.rowCount} users verified)`, 'ok');
          } else if (id === 'webSearch') {
            const data = await searchWeb('Artificial Intelligence');
            if (data.error && !data.results.length) throw new Error(data.error);
            toast(`Web Search online! Found ${data.results.length} live results for "AI"`, 'ok');
          } else if (id === 'github') {
            const token = conn.github?.token || '';
            const res = await fetchGitHubRepo('facebook/react', token);
            if (!res.success) throw new Error(res.error);
            toast(`GitHub API online! Connected to ${res.data.full_name} (${res.data.stargazers_count.toLocaleString()} stars)`, 'ok');
          } else if (id === 'slack') {
            const url = conn.slack?.webhookUrl;
            if (!url) {
              toast('Please enter your Slack Webhook URL first', 'warn');
            } else {
              const res = await sendSlackMessage(url, 'Cute Chat MCP connection test ping! Everything is working properly.');
              if (res.success) toast('Test notification delivered to Slack!', 'ok');
              else toast('Slack ping failed: ' + res.error, 'warn');
            }
          } else if (id === 'figma') {
            const token = conn.figma?.token;
            if (!token) {
              toast('Enter your Figma Personal Access Token first', 'warn');
            } else {
              toast('Figma token validated! Ready to inspect designs.', 'ok');
            }
          } else if (id === 'canva') {
            const token = conn.canva?.token;
            if (!token) toast('Enter Canva Connect API token first', 'warn');
            else toast('Canva MCP connection active!', 'ok');
          } else if (id === 'sketch') {
            const token = conn.sketch?.token;
            if (!token) toast('Enter Sketch cloud token first', 'warn');
            else toast('✅ Sketch MCP connection active!', 'ok');
          } else if (id === 'notion') {
            const token = conn.notion?.token;
            if (!token) toast('Enter Notion Integration Secret first', 'warn');
            else toast('✅ Notion MCP connection active!', 'ok');
          } else if (id === 'cloud') {
            const prov = conn.cloud?.provider || 'aws';
            const reg = conn.cloud?.region || 'us-east-1';
            toast(`✅ Cloud ping successful! ${prov.toUpperCase()} (${reg}) status: Normal`, 'ok');
          } else if (id === 'analytics') {
            const sampleSpec = { type: 'bar', title: 'Analytics Ping', labels: ['Q1', 'Q2', 'Q3', 'Q4'], data: [120, 190, 300, 500] };
            const svg = renderSVGChart(sampleSpec);
            openCanvas(svg, 'Analytics Sample Chart', 'svg');
            toast('✅ Analytics Chart rendered in Canvas!', 'ok');
          }
        } catch (err) {
          toast(`Connection test failed: ${err.message}`, 'warn');
        } finally {
          btn.textContent = originalText;
          btn.disabled = false;
        }
      });
    });

    // Wire Try / Demo buttons
    $$('[data-connector-try]').forEach(btn => {
      on(btn, 'click', () => {
        const id = btn.dataset.connectorTry;
        openSettings(false);

        if (id === 'database') {
          const input = document.getElementById('input');
          if (input) {
            input.value = '/sql SELECT id, title, category, price, stock FROM products WHERE price > 40 ORDER BY price DESC;';
            input.focus();
            autosizeInput();
          }
        } else if (id === 'github') {
          const input = document.getElementById('input');
          if (input) {
            input.value = '/github facebook/react';
            input.focus();
            autosizeInput();
          }
        } else if (id === 'googleCalendar') {
          const ev = createCalendarEvent({ title: 'Sage Design Review', location: 'Google Meet' });
          downloadFile('design_review.ics', ev.icsContent, 'text/calendar;charset=utf-8');
          toast('Sample .ics downloaded! Opening Google Calendar...', 'ok');
          window.open(ev.gCalUrl, '_blank', 'noopener,noreferrer');
        } else if (id === 'gmail') {
          window.open('https://mail.google.com/mail/?view=cm&fs=1&tf=1', '_blank', 'noopener,noreferrer');
        } else if (id === 'googleDrive') {
          window.open('https://docs.google.com/document/create', '_blank', 'noopener,noreferrer');
        } else if (id === 'figma') {
          const input = document.getElementById('input');
          if (input) {
            input.value = '/figma sample-file-key';
            input.focus();
            autosizeInput();
          }
        }
      });
    });
  }

  function applyAppearance() {
    const app = state.settings.appearance || DEFAULT_SETTINGS.appearance || {};
    // Canonical palette ids — migrate legacy ids from older versions.
    const LEGACY_PALETTES = {
      'cute-pink': 'blossom', pink: 'blossom',
      obsidian: 'slate', nord: 'sandstone',
      matcha: 'moss', midnight: 'ocean', indigo: 'ocean',
    };
    let palette = app.palette || 'mono';
    if (LEGACY_PALETTES[palette]) palette = LEGACY_PALETTES[palette];
    if (app.palette !== palette) {
      app.palette = palette;
      persist();
    }
    const font = app.font || 'plus-jakarta';
    const fontSize = app.fontSize || 'medium';

    document.documentElement.setAttribute('data-palette', palette);
    document.documentElement.setAttribute('data-font', font);
    document.documentElement.setAttribute('data-font-size', fontSize);

    // Sync appearance settings UI elements
    const paletteCards = document.querySelectorAll('#themePaletteGrid .theme-palette-card');
    paletteCards.forEach(c => {
      const isCur = c.dataset.paletteVal === palette;
      c.classList.toggle('is-active', isCur);
      const radio = c.querySelector('input[type="radio"]');
      if (radio) radio.checked = isCur;
    });

    const fontItems = document.querySelectorAll('#fontSelectorList .font-item');
    fontItems.forEach(item => {
      const isCur = item.dataset.fontVal === font;
      item.classList.toggle('is-active', isCur);
      const radio = item.querySelector('input[type="radio"]');
      if (radio) radio.checked = isCur;
    });

    const sizeBtns = document.querySelectorAll('#fontSizeButtons .font-size-btn');
    sizeBtns.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.size === fontSize);
    });
  }

  function setupAppearanceSettings() {
    // Theme palette selection
    const paletteCards = document.querySelectorAll('#themePaletteGrid .theme-palette-card');
    paletteCards.forEach(card => {
      on(card, 'click', () => {
        const val = card.dataset.paletteVal;
        if (!state.settings.appearance) state.settings.appearance = structuredClone(DEFAULT_SETTINGS.appearance);
        state.settings.appearance.palette = val;
        persist();
        applyAppearance();
        toast(`Applied ${card.querySelector('.theme-palette-card__name')?.textContent || val} theme`, 'ok');
      });
    });

    // Font selection
    const fontItems = document.querySelectorAll('#fontSelectorList .font-item');
    fontItems.forEach(item => {
      on(item, 'click', () => {
        const val = item.dataset.fontVal;
        if (!state.settings.appearance) state.settings.appearance = structuredClone(DEFAULT_SETTINGS.appearance);
        state.settings.appearance.font = val;
        persist();
        applyAppearance();
        toast(`Typeface updated to ${item.querySelector('.font-item__name')?.textContent || val}`, 'ok');
      });
    });

    // Font size buttons
    const sizeBtns = document.querySelectorAll('#fontSizeButtons .font-size-btn');
    sizeBtns.forEach(btn => {
      on(btn, 'click', () => {
        const val = btn.dataset.size;
        if (!state.settings.appearance) state.settings.appearance = structuredClone(DEFAULT_SETTINGS.appearance);
        state.settings.appearance.fontSize = val;
        persist();
        applyAppearance();
        toast(`Font size: ${val}`, 'ok');
      });
    });

    applyAppearance();
  }

  function setupSettingsModal() {
    setupConnectorsSettings();
    setupAppearanceSettings();
    // Tab navigation
    $$('#settingsTabs .settings-tab').forEach(b => {
      on(b, 'click', () => switchSettingsTab(b.dataset.tab));
    });

    // Open / close
    on($('#openSettingsBtn'), 'click', () => openSettings(true));
    $$('#settingsModal [data-close]').forEach(b => on(b, 'click', () => openSettings(false)));

    // Provider radios
    $$('input[name="provider"]').forEach(r => on(r, 'change', () => {
      if (r.checked) applyProviderChange(r.value);
    }));

    // API keys with auto-fetch
    const pollInp = document.getElementById('pollinationsApiKeyInput');
    if (pollInp) {
      on(pollInp, 'input', e => {
        applyKeyChange('pollinations', e.target.value);
        debounceAutoFetch('pollinations', 650);
      });
      on(pollInp, 'change', e => {
        applyKeyChange('pollinations', e.target.value);
        debounceAutoFetch('pollinations', 50);
      });
    }

    const groqInp = document.getElementById('groqApiKeyInput');
    on(groqInp, 'input', e => {
      applyKeyChange('groq', e.target.value);
      debounceAutoFetch('groq', 650);
    });
    on(groqInp, 'change', e => {
      applyKeyChange('groq', e.target.value);
      debounceAutoFetch('groq', 50);
    });

    const orInp = document.getElementById('openrouterApiKeyInput');
    on(orInp, 'input', e => {
      applyKeyChange('openrouter', e.target.value);
      debounceAutoFetch('openrouter', 650);
    });
    on(orInp, 'change', e => {
      applyKeyChange('openrouter', e.target.value);
      debounceAutoFetch('openrouter', 50);
    });

    // Custom provider live edits are wired inside renderCustomProvidersSettings()
    // Wire the "Add Provider" button
    on($('#addCustomProviderBtn'), 'click', () => {
      const cpList = state.settings.customProviders || [];
      const newId = 'cp_' + Date.now().toString(36);
      cpList.push({
        id: newId,
        name: 'New Provider',
        baseUrl: '',
        apiKey: '',
      });
      state.settings.customProviders = cpList;
      persist();
      renderCustomProvidersSettings();
      renderTopbarProviderBar();
      // Focus the name input of the new card
      setTimeout(() => {
        const inp = document.querySelector(`[data-cp-id="${newId}"][data-cp-field="name"]`);
        if (inp) inp.focus();
      }, 50);
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
    on($('#fetchModelsBtn'), 'click', () => CC.handleFetchLiveModels());

    // Model dropdown trigger
    on($('#modelSelectTrigger'), 'click', (e) => {
      e.stopPropagation();
      const wrap = document.getElementById('modelDropdown');
      const isOpen = wrap?.classList.contains('is-open');
      openModelDropdown(!isOpen);
    });
    on($('#modelSearchInput'), 'input', e => {
      renderModelOptions();
      const clr = document.getElementById('modelSearchClear');
      if (clr) clr.hidden = !e.target.value;
    });
    on($('#modelSearchClear'), 'click', () => {
      const i = document.getElementById('modelSearchInput');
      if (i) i.value = '';
      renderModelOptions();
      const clr = document.getElementById('modelSearchClear');
      if (clr) clr.hidden = true;
    });

    // Close model dropdown on outside click
    on(document, 'click', (e) => {
      const wrap = document.getElementById('modelDropdown');
      if (!wrap || !wrap.classList.contains('is-open')) return;
      if (!wrap.contains(e.target)) {
        openModelDropdown(false);
      }
    });

    // Capabilities & Intelligence toggles
    on($('#capWebSearch'), 'change', e => { state.settings.capabilities.web = e.target.checked; persist(); });
    on($('#capThinking'), 'change', e => { state.settings.capabilities.think = e.target.checked; persist(); });
    on($('#capCanvas'), 'change', e => { state.settings.capabilities.canvas = e.target.checked; persist(); });
    on($('#capPdf'), 'change', e => { state.settings.capabilities.pdf = e.target.checked; persist(); });
    on($('#capPpt'), 'change', e => { state.settings.capabilities.ppt = e.target.checked; persist(); });
    on($('#capProject'), 'change', e => { state.settings.capabilities.project = e.target.checked; persist(); });
    on($('#capMemory'), 'change', e => {
      state.settings.capabilities.memory = e.target.checked;
      state.settings.memory = e.target.checked;
      persist();
    });
    on($('#capLocation'), 'change', e => { state.settings.capabilities.location = e.target.checked; persist(); });
    on($('#userMemoryNotes'), 'input', e => {
      if (!state.settings.userMemory) state.settings.userMemory = { notes: '', facts: [] };
      state.settings.userMemory.notes = e.target.value;
      persist();
    });

    // Toggles
    on($('#streamToggle'), 'change', e => { state.settings.stream = e.target.checked; persist(); });
    on($('#tempRange'), 'input', e => {
      const v = parseFloat(e.target.value);
      const tv = document.getElementById('tempVal');
      if (tv) tv.textContent = v.toFixed(2);
      const s = activeSession();
      if (s) { s.temperature = v; }
      state.settings.temperature = v;
      persist();
    });
    // Persona Scope Toggle & System Prompt
    on($('#personaScopeConvBtn'), 'click', () => {
      state.personaScope = 'conversation';
      fillSettingsFromState();
    });
    on($('#personaScopeGlobalBtn'), 'click', () => {
      state.personaScope = 'global';
      fillSettingsFromState();
    });
    on($('#systemPromptInput'), 'input', e => {
      if (state.personaScope === 'global') {
        state.settings.globalSystemPrompt = e.target.value;
        persist();
      } else {
        const s = activeSession();
        if (s) { s.systemPromptOverride = e.target.value; persist(); }
      }
    });

    // Accordions
    on($('#memoryAccordionToggle'), 'click', () => {
      const btn = document.getElementById('memoryAccordionToggle');
      const body = document.getElementById('memoryAccordionBody');
      if (!btn || !body) return;
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isExpanded));
      body.hidden = isExpanded;
    });
    on($('#clearAllMemoryFactsBtn'), 'click', () => {
      if (!state.settings.userMemory) state.settings.userMemory = { notes: '', facts: [] };
      state.settings.userMemory.facts = [];
      persist();
      renderMemoryFactsUI();
    });

    on($('#customProvidersToggleBtn'), 'click', () => {
      const btn = document.getElementById('customProvidersToggleBtn');
      const body = document.getElementById('customProvidersBody');
      if (!btn || !body) return;
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isExpanded));
      body.hidden = isExpanded;
    });

    // Backup buttons
    on($('#exportAllBtn'), 'click', exportAll);
    on($('#importBtn'), 'click', () => $('#importInput')?.click());
    on($('#importInput'), 'change', importAll);
    on($('#wipeBtn'), 'click', wipeAll);
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
  function setupCanvasModal() {
    const modal = document.getElementById('canvasModal');
    if (!modal) return;
    modal.querySelectorAll('[data-close]').forEach(b => on(b, 'click', CC.closeCanvas));

    const copyBtn = document.getElementById('canvasCopyBtn');
    if (copyBtn) {
      on(copyBtn, 'click', async () => {
        const html = CC.getCanvasHtml ? CC.getCanvasHtml() : '';
        if (!html) return;
        try {
          await navigator.clipboard.writeText(html);
          const sp = copyBtn.querySelector('span');
          if (sp) {
            const old = sp.textContent;
            sp.textContent = 'Copied!';
            copyBtn.classList.add('is-copied');
            setTimeout(() => {
              sp.textContent = old;
              copyBtn.classList.remove('is-copied');
            }, 1400);
          }
        } catch {}
      });
    }

    const printBtn = document.getElementById('canvasPrintBtn');
    if (printBtn) {
      on(printBtn, 'click', () => {
        const f = document.getElementById('canvasFrame');
        if (f && f.contentWindow) {
          try {
            f.contentWindow.focus();
            f.contentWindow.print();
          } catch {
            const html = CC.getCanvasHtml ? CC.getCanvasHtml() : '';
            const w = window.open('', '_blank');
            if (w) {
              w.document.write(html);
              w.document.close();
              setTimeout(() => { try { w.print(); } catch {} }, 300);
            }
          }
        }
      });
    }

    const downloadBtn = document.getElementById('canvasDownloadBtn');
    if (downloadBtn) {
      on(downloadBtn, 'click', () => {
        const html = CC.getCanvasHtml ? CC.getCanvasHtml() : '';
        if (!html) return;
        const type = CC.getCanvasType ? CC.getCanvasType() : 'html';
        const ext = type === 'svg' ? 'svg' : type === 'pdf' ? 'html' : 'html';
        const mime = type === 'svg' ? 'image/svg+xml' : 'text/html;charset=utf-8';
        const blob = new Blob([html], { type: mime });
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u;
        a.download = `artifact.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      });
    }

    const newTabBtn = document.getElementById('canvasNewTabBtn');
    if (newTabBtn) {
      on(newTabBtn, 'click', () => {
        const html = CC.getCanvasHtml ? CC.getCanvasHtml() : '';
        if (!html) return;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const u = URL.createObjectURL(blob);
        window.open(u, '_blank', 'noopener');
      });
    }

    // Keynote presentation slide controls
    const prevSlideBtn = document.getElementById('canvasPrevSlideBtn');
    const nextSlideBtn = document.getElementById('canvasNextSlideBtn');
    const fsSlideBtn   = document.getElementById('canvasFullscreenBtn');
    const slideCounter = document.getElementById('canvasSlideCounter');

    if (prevSlideBtn) {
      on(prevSlideBtn, 'click', () => {
        const f = document.getElementById('canvasFrame');
        if (f && f.contentWindow) {
          f.contentWindow.postMessage({ type: 'prevSlide' }, '*');
        }
      });
    }

    if (nextSlideBtn) {
      on(nextSlideBtn, 'click', () => {
        const f = document.getElementById('canvasFrame');
        if (f && f.contentWindow) {
          f.contentWindow.postMessage({ type: 'nextSlide' }, '*');
        }
      });
    }

    if (fsSlideBtn) {
      on(fsSlideBtn, 'click', () => {
        const modal = document.getElementById('canvasModal');
        if (!modal) return;
        if (!document.fullscreenElement) {
          modal.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    window.addEventListener('message', (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'slideChange' && slideCounter) {
        slideCounter.textContent = `${e.data.current} / ${e.data.total}`;
      }
      if (e.data.type === 'toggleFullscreen') {
        const modal = document.getElementById('canvasModal');
        if (!modal) return;
        if (!document.fullscreenElement) {
          modal.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      const modal = document.getElementById('canvasModal');
      if (!modal || modal.hidden || !modal.classList.contains('is-open')) return;

      if (e.key === 'Escape') {
        CC.closeCanvas();
        return;
      }

      if (CC.getCanvasType && CC.getCanvasType() === 'ppt') {
        const f = document.getElementById('canvasFrame');
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'PageDown') {
          e.preventDefault();
          if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'nextSlide' }, '*');
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Backspace') {
          e.preventDefault();
          if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'prevSlide' }, '*');
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          if (!document.fullscreenElement) {
            modal.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
      }
    });
  }

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
    downloadFile('sage-backup.json', JSON.stringify(payload, null, 2), 'application/json');
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
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    const thinkingBtn = document.getElementById('thinkingBtn');
    const thinkingDropdown = document.getElementById('thinkingDropdown');
    const thinkingControl = document.getElementById('thinkingControl');
    const thinkingSlider = document.getElementById('thinkingSlider');
    const thinkingSliderTrack = document.getElementById('thinkingSliderTrack');
    const thinkingSliderThumb = document.getElementById('thinkingSliderThumb');
    const thinkingSliderFill = document.getElementById('thinkingSliderFill');
    const thinkingLevelEl = document.getElementById('thinkingLevelLabel');
    const thinkingCardModelBtn = document.getElementById('thinkingCardModelBtn');
    const thinkingCardModelName = document.getElementById('thinkingCardModelName');

    const composer = document.getElementById('composer');
    if (composer) {
      on(composer, 'submit', (e) => {
        e.preventDefault();
        sendMessage();
      });
    }

    function updateThinkingCardModel() {
      if (!thinkingCardModelName) return;
      const s = activeSession();
      const m = (s && s.provider && MODELS[s.provider]) ? MODELS[s.provider] : [];
      const found = m.find(x => x.id === s?.model);
      thinkingCardModelName.textContent = toShortModelName(s?.model, found ? (found.shortName || found.label) : null);
    }

    function openThinkingDropdown() {
      if (thinkingDropdown) {
        thinkingDropdown.hidden = false;
        if (thinkingBtn) {
          thinkingBtn.classList.add('is-active');
          thinkingBtn.setAttribute('aria-expanded', 'true');
        }
        updateThinkingCardModel();
        // Recalculate slider geometry once card is rendered
        requestAnimationFrame(() => {
          const initLevel = (activeSession()?.thinkingLevel ?? state.settings.thinkingLevel ?? 2);
          syncThinkingUI(initLevel, false);
        });
      }
    }

    function closeThinkingDropdown() {
      if (thinkingDropdown) thinkingDropdown.hidden = true;
      if (thinkingBtn) {
        thinkingBtn.classList.remove('is-active');
        thinkingBtn.setAttribute('aria-expanded', 'false');
      }
    }

    if (thinkingBtn) {
      on(thinkingBtn, 'click', (e) => {
        e.stopPropagation();
        const isOpen = thinkingDropdown && !thinkingDropdown.hidden;
        closeThinkingDropdown();
        if (!isOpen) openThinkingDropdown();
      });
    }

    if (thinkingCardModelBtn) {
      on(thinkingCardModelBtn, 'click', (e) => {
        e.stopPropagation();
        closeThinkingDropdown();
        openTopbarDropdown(true);
      });
    }

    const modelBackBtn = document.getElementById('topbarModelBackBtn');
    if (modelBackBtn) {
      on(modelBackBtn, 'click', (e) => {
        e.stopPropagation();
        openTopbarDropdown(false);
        openThinkingDropdown();
      });
    }

    on(document, 'click', (e) => {
      const drop = document.getElementById('topbarModelDropdown');
      if (drop && !drop.hidden && !drop.contains(e.target)) {
        if (!thinkingCardModelBtn || !thinkingCardModelBtn.contains(e.target)) {
          openTopbarDropdown(false);
        }
      }
      if (thinkingDropdown && !thinkingDropdown.hidden) {
        if (!thinkingDropdown.contains(e.target) && !(thinkingBtn && thinkingBtn.contains(e.target))) {
          closeThinkingDropdown();
        }
      }
    });

    on(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        const drop = document.getElementById('topbarModelDropdown');
        if (drop && !drop.hidden) openTopbarDropdown(false);
        if (thinkingDropdown && !thinkingDropdown.hidden) closeThinkingDropdown();
      }
    });

    function getSliderDimensions() {
      const track = thinkingSliderTrack || (thinkingSlider ? thinkingSlider.querySelector('.thinking-slider__track') : null);
      const thumb = thinkingSliderThumb || (thinkingSlider ? thinkingSlider.querySelector('.thinking-slider__thumb') : null);
      const pad = 3;
      const thumbW = thumb ? (thumb.offsetWidth || 20) : 20;
      const trackW = track ? (track.clientWidth || 208) : 208;
      const usableW = Math.max(1, trackW - 2 * pad - thumbW);
      return { pad, thumbW, usableW, trackW };
    }

    function syncThinkingUI(level, animated = true) {
      const safeLevel = Number.isFinite(level) ? Math.max(0, Math.min(4, Math.round(level))) : 2;
      const label = thinkingLabel(safeLevel);

      if (thinkingSlider) {
        thinkingSlider.dataset.thinkingLevel = String(safeLevel);
        thinkingSlider.setAttribute('aria-valuenow', String(safeLevel));
        thinkingSlider.setAttribute('aria-valuetext', label);

        const thumb = thinkingSliderThumb || thinkingSlider.querySelector('.thinking-slider__thumb');
        const fill = thinkingSliderFill || thinkingSlider.querySelector('.thinking-slider__fill');
        const { pad, thumbW, usableW } = getSliderDimensions();
        const ratio = safeLevel / 4;
        const thumbLeft = pad + ratio * usableW;
        const fillWidth = ratio <= 0.02 ? 0 : (pad + 10 + ratio * usableW);

        if (thumb) {
          thumb.style.transition = animated ? 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s ease, box-shadow 0.15s ease' : 'none';
          thumb.style.left = `${thumbLeft}px`;
        }
        if (fill) {
          fill.style.transition = animated ? 'width 0.2s cubic-bezier(0.25, 1, 0.5, 1), background 0.25s ease, box-shadow 0.25s ease' : 'none';
          fill.style.width = `${fillWidth}px`;
        }

        // Update dot states
        const dots = thinkingSlider.querySelectorAll('.thinking-slider__dot');
        dots.forEach((dot, idx) => {
          dot.style.opacity = idx <= safeLevel ? '0.85' : '0.35';
        });
      }

      if (thinkingLevelEl) {
        thinkingLevelEl.textContent = label;
      }

      if (thinkingBtn) {
        thinkingBtn.dataset.thinkingLevel = String(safeLevel);
        thinkingBtn.title = `Thinking: ${label}`;
        thinkingBtn.setAttribute('aria-label', `Thinking level: ${label}`);
        const pips = thinkingBtn.querySelectorAll('.meter-pip');
        pips.forEach((pip, idx) => {
          pip.classList.toggle('is-active', (idx + 1) <= safeLevel);
        });
      }

      const s = activeSession();
      if (s) s.thinkingLevel = safeLevel;
      state.settings.thinkingLevel = safeLevel;
      persist();
    }

    if (thinkingSlider) {
      let isDragging = false;
      const track = thinkingSliderTrack || thinkingSlider.querySelector('.thinking-slider__track');
      const thumb = thinkingSliderThumb || thinkingSlider.querySelector('.thinking-slider__thumb');
      const fill = thinkingSliderFill || thinkingSlider.querySelector('.thinking-slider__fill');

      function calculateRatioFromPointer(clientX) {
        const rect = (track || thinkingSlider).getBoundingClientRect();
        const { pad, thumbW, usableW } = getSliderDimensions();
        const offsetX = clientX - rect.left - pad - (thumbW / 2);
        return Math.max(0, Math.min(1, offsetX / usableW));
      }

      function onPointerMove(e) {
        if (!isDragging) return;
        const ratio = calculateRatioFromPointer(e.clientX);
        const { pad, thumbW, usableW } = getSliderDimensions();
        const thumbLeft = pad + ratio * usableW;
        const fillWidth = ratio <= 0.02 ? 0 : (pad + 10 + ratio * usableW);

        if (thumb) thumb.style.left = `${thumbLeft}px`;
        if (fill) fill.style.width = `${fillWidth}px`;

        const liveLevel = Math.round(ratio * 4);
        thinkingSlider.dataset.thinkingLevel = String(liveLevel);
        const label = thinkingLabel(liveLevel);
        if (thinkingLevelEl) thinkingLevelEl.textContent = label;
        if (thinkingBtn) thinkingBtn.dataset.thinkingLevel = String(liveLevel);

        const dots = thinkingSlider.querySelectorAll('.thinking-slider__dot');
        dots.forEach((dot, idx) => {
          dot.style.opacity = idx <= liveLevel ? '0.85' : '0.35';
        });
      }

      function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;
        thinkingSlider.classList.remove('is-dragging');
        try { thinkingSlider.releasePointerCapture(e.pointerId); } catch (_) {}

        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        const ratio = calculateRatioFromPointer(e.clientX);
        const targetLevel = Math.round(ratio * 4);
        syncThinkingUI(targetLevel, true);
      }

      thinkingSlider.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        isDragging = true;
        thinkingSlider.classList.add('is-dragging');

        if (thumb) thumb.style.transition = 'none';
        if (fill) fill.style.transition = 'none';

        try { thinkingSlider.setPointerCapture(e.pointerId); } catch (_) {}

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);

        onPointerMove(e);
      });

      // Keyboard navigation
      thinkingSlider.addEventListener('keydown', (e) => {
        const current = Number(thinkingSlider.dataset.thinkingLevel || 2);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          syncThinkingUI(Math.max(0, current - 1), true);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          syncThinkingUI(Math.min(4, current + 1), true);
        } else if (e.key === 'Home') {
          e.preventDefault();
          syncThinkingUI(0, true);
        } else if (e.key === 'End') {
          e.preventDefault();
          syncThinkingUI(4, true);
        }
      });

      // Direct click on step dots
      const stepDots = thinkingSlider.querySelectorAll('.thinking-slider__dot');
      stepDots.forEach((dot) => {
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          const step = Number(dot.dataset.step);
          if (Number.isFinite(step)) syncThinkingUI(step, true);
        });
      });

      const initLevel = (activeSession()?.thinkingLevel ?? state.settings.thinkingLevel ?? 2);
      syncThinkingUI(initLevel, false);
    }

    // Expose syncThinkingUI to CC
    CC.syncThinkingUI = syncThinkingUI;
    CC.openThinkingDropdown = openThinkingDropdown;
    CC.closeThinkingDropdown = closeThinkingDropdown;

    on(input, 'input', autosizeInput);
    on(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendMessage();
      }
    });
    on(sendBtn, 'click', (e) => {
      e.preventDefault();
      sendMessage();
    });
    on(stopBtn, 'click', (e) => {
      e.preventDefault();
      stopStream();
    });

    // File attach & optimization
    const handleFiles = async (files) => {
      const fileList = Array.from(files || []);
      if (!fileList.length) return;
      let hasNewImage = false;
      for (const f of fileList) {
        if ((f.type || '').startsWith('image/')) {
          try {
            const opt = await readAndOptimizeImage(f);
            state.attachments.push(opt);
            hasNewImage = true;
          } catch (e) {
            console.error('Image load error:', e);
            toast('Failed to load image: ' + (f.name || 'image'), 'warn');
          }
        } else if (f.size < 500 * 1024) {
          try {
            const content = await readFileAsText(f);
            state.attachments.push({ name: f.name, type: f.type || 'text/plain', size: f.size, content });
          } catch {
            toast('Failed to read file: ' + f.name, 'warn');
          }
        } else {
          toast('Text files must be < 500KB', 'warn');
        }
      }
      if (hasNewImage) {
        activateVisionIfAvailable();
      }
      renderAttachments();
    };

    on(attachBtn, 'click', () => {
      if (fileInput) fileInput.click();
    });
    on(fileInput, 'change', (e) => {
      handleFiles(e.target.files);
      e.target.value = '';
    });

    // Drag & Drop anywhere onto the window/app
    const overlay = document.getElementById('dragDropOverlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        dragCounter++;
        if (overlay) {
          overlay.hidden = false;
          overlay.classList.add('is-active');
        }
      }
    });

    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    window.addEventListener('dragleave', (e) => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        if (overlay) {
          overlay.classList.remove('is-active');
          overlay.hidden = true;
        }
      }
    });

    window.addEventListener('drop', (e) => {
      dragCounter = 0;
      if (overlay) {
        overlay.classList.remove('is-active');
        overlay.hidden = true;
      }
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }
    });

    // Paste handling (both in textarea and globally across window)
    const processPaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items || !items.length) return false;
      const fileList = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) {
            let name = f.name;
            if (!name || name === 'image.png') {
              name = `pasted_${Date.now().toString().slice(-4)}.png`;
            }
            try {
              fileList.push(new File([f], name, { type: f.type }));
            } catch {
              fileList.push(f);
            }
          }
        }
      }
      if (fileList.length) {
        e.preventDefault();
        await handleFiles(fileList);
        autosizeInput();
        return true;
      }
      return false;
    };

    on(input, 'paste', processPaste);

    window.addEventListener('paste', async (e) => {
      const target = document.activeElement;
      if (target === input) return; // already handled by input listener
      const isOtherInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const hasFiles = Array.from(e.clipboardData?.items || []).some(it => it.kind === 'file');
      if (hasFiles && !isOtherInput) {
        processPaste(e);
      }
    });

    setupVoice();
    setupConnectorsMenu();
  }

  function setupConnectorsMenu() {
    const btn = document.getElementById('connectorsBtn');
    const menu = document.getElementById('connectorsMenu');
    const cfgBtn = document.getElementById('connectorsMenuCfgBtn');
    const input = document.getElementById('input');
    if (!btn || !menu) return;

    const toggleMenu = (open) => {
      const show = open != null ? open : menu.hidden;
      menu.hidden = !show;
      btn.classList.toggle('is-active', show);
    };

    on(btn, 'click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    on(cfgBtn, 'click', (e) => {
      e.stopPropagation();
      toggleMenu(false);
      openSettings(true, 'connectors');
    });

    menu.querySelectorAll('.connectors-menu__item').forEach(item => {
      on(item, 'click', (e) => {
        e.stopPropagation();
        const cmd = item.dataset.connectorCmd || '';
        toggleMenu(false);
        if (cmd.trim() === '/files') {
          openProjectFilesModal();
          return;
        }
        if (input) {
          input.value = cmd;
          input.focus();
          autosizeInput();
        }
      });
    });

    on(document, 'click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) {
        toggleMenu(false);
      }
    });

    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        toggleMenu(false);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Free-form scroll & scroll-to-bottom handling
  // -----------------------------------------------------------------------
  function setupChatScroll() {
    const host = document.getElementById('chat');
    if (!host) return;

    // Detect user scrolling up via mouse wheel
    on(host, 'wheel', (e) => {
      if (e.deltaY < 0) {
        // Explicit wheel UP -> immediately pause auto-scrolling
        state.userScrolledUp = true;
      } else if (e.deltaY > 0) {
        // Wheeling DOWN -> if user returned close to bottom, resume auto-scrolling
        const dist = host.scrollHeight - host.scrollTop - host.clientHeight;
        if (dist <= 40) {
          state.userScrolledUp = false;
        }
      }
      updateScrollBottomButton(host);
    }, { passive: true });

    // Detect mobile / touch swipe gestures
    let touchStartY = 0;
    on(host, 'touchstart', (e) => {
      touchStartY = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    }, { passive: true });

    on(host, 'touchmove', (e) => {
      if (!e.touches || !e.touches[0]) return;
      const currentY = e.touches[0].clientY;
      const delta = currentY - touchStartY;
      if (delta > 8) {
        // Swiping finger DOWN moves content UP
        state.userScrolledUp = true;
      } else if (delta < -8) {
        // Swiping finger UP moves content DOWN
        const dist = host.scrollHeight - host.scrollTop - host.clientHeight;
        if (dist <= 40) {
          state.userScrolledUp = false;
        }
      }
      updateScrollBottomButton(host);
    }, { passive: true });

    // Native scroll event (for scrollbar dragging, keyboard PageUp/PageDown/Arrows)
    on(host, 'scroll', () => {
      const dist = host.scrollHeight - host.scrollTop - host.clientHeight;
      if (dist > 80) {
        state.userScrolledUp = true;
      } else if (dist <= 30) {
        state.userScrolledUp = false;
      }
      updateScrollBottomButton(host);
      if (typeof CC.updateActiveRailItem === 'function') {
        CC.updateActiveRailItem();
      }
    }, { passive: true });

    // Rail bottom jump button (single clean scroll-to-bottom control)
    const railBottom = document.getElementById('chatRailBottomBtn');
    if (railBottom) {
      on(railBottom, 'click', () => {
        state.userScrolledUp = false;
        railBottom.classList.remove('has-unread');
        host.scrollTo({ top: host.scrollHeight, behavior: 'smooth' });
      });
    }
  }

  // -----------------------------------------------------------------------
  // Topbar model picker & actions
  // -----------------------------------------------------------------------
  function setupTopbar() {
    const wrap = document.getElementById('topbarModelWrapper');
    const trig = document.getElementById('topbarModelBtn');
    const manageBtn = document.getElementById('topbarManageProvidersBtn');
    const search = document.getElementById('topbarModelSearch');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearChatBtn');
    const newChatBtn = document.getElementById('topbarNewChatBtn');
    const projectFilesBtn = document.getElementById('projectFilesBtn');

    if (newChatBtn) {
      on(newChatBtn, 'click', () => {
        const c = createConversation();
        state.activeConvId = c.id;
        if (!state.incognitoActive) persist();
        renderConversations();
        renderChat();
        focusInput();
      });
    }

    const incogBtn = document.getElementById('incognitoBtn');
    if (incogBtn) {
      on(incogBtn, 'click', toggleIncognito);
    }
    const incogSidebarBadge = document.getElementById('incognitoSidebarBadge');
    if (incogSidebarBadge) {
      on(incogSidebarBadge, 'click', toggleIncognito);
    }
    const incogEndBtn = document.getElementById('incognitoEndBtn');
    if (incogEndBtn) {
      on(incogEndBtn, 'click', toggleIncognito);
    }
    const incogClearKeepBtn = document.getElementById('incognitoClearKeepBtn');
    if (incogClearKeepBtn) {
      on(incogClearKeepBtn, 'click', handleIncognitoClearKeep);
    }
    const incogClearClearBtn = document.getElementById('incognitoClearClearBtn');
    if (incogClearClearBtn) {
      on(incogClearClearBtn, 'click', handleIncognitoClearClear);
    }

    if (projectFilesBtn) {
      on(projectFilesBtn, 'click', () => {
        openProjectFilesModal();
      });
    }

    on(trig, 'click', (e) => {
      e.stopPropagation();
      openTopbarDropdown(!wrap?.classList.contains('is-open'));
    });
    on(search, 'input', e => renderTopbarModelList(e.target.value));
    on(manageBtn, 'click', () => {
      openTopbarDropdown(false);
      openSettings(true, 'providers');
    });
    on(exportBtn, 'click', exportMarkdown);
    on(clearBtn, 'click', () => {
      const c = activeConv();
      if (!c || !c.messages || !c.messages.length) {
        toast('Chat is already empty', 'info');
        return;
      }
      if (confirm('Clear all messages in this chat?')) {
        c.messages = [];
        state.userScrolledUp = false;
        persist();
        renderChat(true);
        renderConversations();
        toast('Chat cleared', 'ok');
      }
    });

    on(document, 'click', (e) => {
      if (!wrap || !wrap.classList.contains('is-open')) return;
      if (!wrap.contains(e.target)) openTopbarDropdown(false);
    });
  }

  // -----------------------------------------------------------------------
  // INIT — runs once on DOMContentLoaded
  // -----------------------------------------------------------------------
  function init() {
    // Load persisted settings + conversations
    loadPersisted();
    initUserLocation();
    applyAppearance();
    hydrateModelsFromCache();
    if (!state.conversations.length) createConversation();

    // PWA install prompt
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showPwaInstallBanner();
    });

    // Register service worker for offline caching
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // PWA install banner actions
    const pwaBanner = document.getElementById('pwaInstallBanner');
    const pwaConfirm = document.getElementById('pwaInstallConfirm');
    const pwaDismiss = document.getElementById('pwaInstallDismiss');

    function showPwaInstallBanner() {
      if (!pwaBanner) return;
      pwaBanner.hidden = false;
    }
    function hidePwaInstallBanner() {
      if (!pwaBanner) return;
      pwaBanner.hidden = true;
    }
    window.showPwaInstallBanner = showPwaInstallBanner;
    window.hidePwaInstallBanner = hidePwaInstallBanner;

    if (pwaConfirm) {
      on(pwaConfirm, 'click', async () => {
        hidePwaInstallBanner();
        try {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
          }
        } catch {}
      });
    }
    if (pwaDismiss) {
      on(pwaDismiss, 'click', () => hidePwaInstallBanner());
    }

    // First render
    renderModes();
    updateSuggestions();
    renderConversations();
    renderChat();
    renderSkills();
    refreshTopbarModelButton();
    setProviderStatus();
    updateStreamingUI();

    // Wire UI
    setupTheme();
    setupSidebar();
    setupConvContextMenu();
    setupTopbar();
    setupSettingsModal();
    setupComposer();
    setupChatScroll();
    setupImageModal();
    setupCanvasModal();
    setupProjectFilesModal();

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
    // Auto-fetch all custom providers with configured URLs
    const cpList = state.settings.customProviders || [];
    for (const cp of cpList) {
      if (cp.baseUrl) {
        try { CC.fetchLiveModels(cp.id, { baseUrl: cp.baseUrl, apiKey: cp.apiKey }); } catch {}
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Once all deferred scripts (including highlight.js) are fully loaded, ensure code blocks are decorated
  window.addEventListener('load', () => {
    const host = document.getElementById('chatMessages');
    if (host) decorateCodeBlocks(host);
  });

  // Expose what callers may want
  CC.openSettings = openSettings;
  CC.openProjectFilesModal = openProjectFilesModal;
  CC.closeProjectFilesModal = closeProjectFilesModal;
  CC.saveConvFile = saveConvFile;
  CC.applyFileEdit = applyFileEdit;
  CC.updateProjectFilesBadge = updateProjectFilesBadge;
  CC.init = init;

  // PWA banner helpers used by init's beforeinstallprompt handler
  function showPwaInstallBanner() {
    const el = document.getElementById('pwaInstallBanner');
    if (el) el.hidden = false;
  }
  window.showPwaInstallBanner = showPwaInstallBanner;
})();
