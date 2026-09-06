# cute chat — project context

## What this is
A real AI chat assistant that runs in the browser. No backend. Vanilla HTML/CSS/JS. Solves real problems (code review, study, writing, summarizing, translating) using free AI providers.

## Stack
- **Frontend:** pure HTML + CSS + vanilla JS, no build step
- **Libraries (CDN):** marked (markdown), DOMPurify (sanitize), highlight.js (code), JetBrains Mono / Nunito / Caveat fonts
- **AI providers:**
  - `Pollinations` (https://text.pollinations.ai) — default, no signup, free
  - `Groq` (OpenAI-compatible) — needs free key from console.groq.com/keys, very fast
  - `OpenRouter` — needs free key, many free models

## Live model fetching
- `STATIC_MODELS` = small hardcoded fallback per provider (used before any fetch / if API is down)
- `MODELS` = live, mutable registry seeded from STATIC_MODELS, enriched by `fetchLiveModels(provider)`
  - `groq` → `GET https://api.groq.com/openai/v1/models` with `Authorization: Bearer <key>`
  - `openrouter` → `GET https://openrouter.ai/api/v1/models` (works with or without key, free models sorted first)
- Persisted in `localStorage` under `cc.models.cache.v1` keyed by api-key fingerprint + provider, 1h TTL
- Settings modal has a "↻ fetch live models from API" button that forces a fresh fetch
- On boot, `hydrateModelsFromCache()` restores cached live lists so dropdowns are populated immediately
- On provider switch / settings open, a live fetch is fired in the background
- **Server:** tiny zero-dep static server (`serve.js`, port 8766)

## Files
- `index.html` — full UI: sidebar, topbar, chat, composer, modals (settings + image)
- `styles.css` — light/dark theme, mobile responsive, no neon
- `app.js` — all logic: providers, streaming, history, attachments, voice, settings
- `serve.js` — local static server (`node serve.js` then open http://localhost:8766)
- `aios.md` — this file

## Run it
```
node serve.js
# open http://localhost:8766
```
Or just open `index.html` directly in a browser (file:// works for most features except voice input on some browsers).

## Maintenance notes
- **Disk-full guard**: if Windows reports "no space left on device" during edits, the workspace file may be truncated to 0 bytes. Stop background `node serve.js` first, free %TEMP% (`rd /s /q "%TEMP%"`), then restore the file. The full app.js is ~45 KB.
- **Server kill before edit**: `for /f "tokens=5" %a in ('netstat -ano ^| findstr :8766') do taskkill /F /PID %a` to free the port.

## Features
- 6 modes: Chat, Code, Study, Write, Summarize, Translate (each with a system prompt)
- Streaming responses (word-by-word)
- Conversation history in sidebar (localStorage, persistent)
- Search across chats
- Attachments: image (vision models), text files (read inline)
- Voice input (Web Speech API)
- Markdown rendering with syntax-highlighted code blocks + per-block copy
- Dark/light theme
- Export chat as markdown, export all as JSON, import JSON
- Mobile responsive (collapsible sidebar)
- Stop button mid-stream, regenerate last reply
- Settings modal: provider, API key, model, stream toggle, memory, temperature
- **Per-chat independent sessions** — each conversation has its own `session = {provider, model, skills, temperature, stream, systemPromptOverride}` seeded from `state.settings` defaults
- **5 toggleable skills** (Think / PDF / Web / Memory / Canvas) per chat
- **PDF builder** skill — emits ` pdf ` blocks → iframe preview + print dialog
- **Web search** skill — DuckDuckGo HTML parser, `[search: ...]` tag expand
- **Collapse sidebar** — desktop rail collapses, state remembered in `cc.sidebar.collapsed`
- **Per-chat system prompt override** — `<textarea id="systemPromptInput">` writes to `session.systemPromptOverride`, injected via `buildSystemPrompt()`

## Session refactor (current state)
- `ensureSession(conv)` / `activeSession()` helpers — every UI action reads the active session
- `currentModel()`, `skillOn()`, `toggleSkill()`, `buildSystemPrompt()` — all session-aware
- `sendMessage` + `regenerateLast` — read `s.provider`, `s.temperature` from active session (no more `state.settings.provider` for the request)
- `openSettings` / `applyProviderChange` / `handleFetchLiveModels` / `applyKeyChange` — session-aware (key stays global)
- `pollinationsChat` / `groqChat` / `openrouterChat` — read provider from `s.provider`
- `renderConversations` chat-switch handler — refreshes skills, model select, provider status
- `newChatBtn` — calls `ensureSession(conv)` so new chats get a default session immediately
- `init()` — initial `setProviderStatus` uses `activeSession()?.provider`

## Conventions
- Soft pastel palette, friendly tone, no placeholders
- API keys stored only in localStorage; never sent anywhere except chosen provider
- No tracking, no analytics, no remote config

## Next ideas
- Add "Memory" feature that learns user facts across conversations
- Add image-generation mode using Pollinations image API
- Add web search via DuckDuckGo HTML (free, no key)
- Add a /commands palette (e.g. /clear, /export, /translate)
- Pin favorite chats
