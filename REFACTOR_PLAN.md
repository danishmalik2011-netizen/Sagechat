# Sage — Refactor Plan: Design, Motion & Architecture

Status: **In progress — living document.** This plan is the single source of truth for
the refactor. Each phase is executable independently and should be checked off as it lands.

## Phase log

- ✅ **Phase 0 — Cleanup (landed):** removed dead files (`part5.js`, `served.js`,
  `analyze_part5*.js`, `fix1.js`, `chrome-temp/`); fixed font loading (Plus Jakarta
  Sans, Lexend, Newsreader now actually load); canonicalized palette ids
  (`blossom/slate/sandstone/moss/ocean/mono`, legacy ids migrate in `applyAppearance`);
  unified branding (Sage everywhere); added `version.json` + `bump-version.js` and
  versioned the service-worker shell (v7).

---

## 1. Executive Summary

Sage is a feature-rich, zero-dependency, local-first AI chat app (vanilla HTML/CSS/JS,
PWA, BYOK multi-provider). It works well — but it *looks and is structured* like a
generated starter template, not a designed product. The goal of this refactor is to make
Sage feel like a **premium, intentionally-designed tool in the class of Claude and
ChatGPT** (quiet surfaces, one accent, tight type, purposeful motion) while keeping the
no-build, no-backend, private-by-design philosophy that makes it special.

Three headline moves:

1. **Design system first.** Build real tokens (color, type, space, radius, elevation,
   motion) and rebuild the UI on top of them. Replace the scattered `#ff3366`-style
   accents, inconsistent radii, and "template" hero with a disciplined, quiet system.
2. **A designed startup experience.** A brief, elegant boot splash plus a
   Claude/ChatGPT-grade empty state ("How can I help you today?") — the first thing
   users see is the most important screen in the app.
3. **Architecture cleanup.** Delete ~3,500 lines of dead code, split the 7,600-line
   `app.js` and 8,100-line `styles.css` into real modules, fix known bugs (fonts,
   naming drift, cache busting), and add motion/a11y/perf discipline.

---

## 2. Current State Assessment (from deep dive, Sep 2026)

### What exists

| Asset | Size | Notes |
|---|---|---|
| `index.html` | 1,624 lines | All layout + modals + settings, hand-wired IDs |
| `styles.css` | 8,123 lines | 40+ sections, token-ish `:root`, 5 palettes, light/dark |
| `app.js` | 7,604 lines | 5 "parts" in IIFEs joined via `window.__CC` |
| `part5.js` | 1,427 lines | **Dead** — stale snapshot of app.js part 5 |
| `served.js` | 1,867 lines | **Dead** — older copy of app.js |
| `analyze_part5.js`, `analyze_part5_v2.js`, `fix1.js` | ~200 lines | **Dead** — scratch analysis scripts |
| `api/search.js`, `api/proxy.js` | ~9 KB | Vercel serverless functions (also served locally by `serve.js`) |
| `sw.js`, `manifest.json`, `serve.js`, `vercel.json` | — | PWA shell, local server, deploy config |

### Strengths (keep these)

- Zero build step, zero runtime deps beyond 3 CDN libs (marked, DOMPurify, highlight.js).
- Local-first: BYOK, localStorage/IndexedDB, service worker offline shell.
- Genuinely feature-rich: streaming, per-chat sessions, 6 modes, skills, thinking-depth
  slider, canvas artifact preview, MCP connectors, incognito, voice, PWA install.
- A real token layer already exists (`--surface`, `--ink-*`, `--radius-*`, `--shadow-*`)
  with theme-aware palettes.
- Good a11y instincts in places (aria labels, roles, `aria-live`).

### Weaknesses (fix these)

**Design**
- **Generic "AI template" look.** Pink accent everywhere (`#ff3366`), rounded starter
  cards, standard sidebar/hero/composer layout. Reads as *generated*, not *designed*.
- **Inconsistent detail.** Radii vary (18/14/10/7) without a rule; some buttons use
  borders, some shadows, some both; icon stroke weights mix 1.5/1.8/2/2.5; several
  hard-coded colors (`rgba(0,0,0,0.08)`, `#131114`) bypass the token system.
- **No motion system.** A few transitions exist, but durations/easings are ad hoc.
  No `prefers-reduced-motion` handling anywhere.
- **No designed startup.** The hero empty-state is functional but plain; there is no
  boot moment at all.

**Codebase**
- **Dead files committed to git**: `part5.js`, `served.js`, `analyze_part5.js`,
  `analyze_part5_v2.js`, `fix1.js` (~3,500 lines).
- **Broken font loading.** The font selector lists *Plus Jakarta Sans* (marked
  "Default"), *Lexend*, and *Newsreader* — but `index.html` only loads Geist,
  JetBrains Mono, and OpenDyslexic. The default font silently falls back to Geist.
- **Brand drift.** "cute chat" (file headers, `serve.js` log), "Sagechat" (README),
  "Sage" (manifest/title/system prompt). Storage keys `cc.*`, cache `sage-chat-v1`.
- **Palette alias sprawl.** CSS defines `cute-pink`, `obsidian`, `nord`, `matcha`,
  `midnight`, `mono` while the UI shows Blossom, Slate, Sandstone, Moss, Ocean,
  Monochrome. Old names linger as aliases; `cute-pink` is the *persisted default*
  even though the HTML declares `data-palette="mono"`.
- **Hardcoded cache-busting** (`styles.css?v=6`, `app.js?v=6`) — version bumps are
  manual and easy to forget.
- **Monolith coupling.** `app.js` parts reach into each other through the global
  `window.__CC` bag with no boundaries; `sendMessage`, `renderChat`, and
  `setupSettingsModal` are each 300–800 lines.
- **Scattered inline SVGs.** The same icons are re-pasted across `index.html` and JS
  template strings with inconsistent stroke weights.

---

## 3. Design Direction

### 3.1 Principles

1. **Quiet before loud.** Neutral base surfaces; exactly **one** accent used sparingly.
2. **Hierarchy by typography and space, not color.** Claude/ChatGPT look expensive
   because nearly everything is gray and the few colored things matter.
3. **Everything has a reason to move.** Micro-motion (120–260 ms) for state changes;
   gentle entrance motion for content; nothing bounces or sparkles.
4. **Consistency is the luxury.** One radius scale, one stroke weight, one easing
   curve, one border recipe.
5. **Motion must respect users.** Full `prefers-reduced-motion` support.

### 3.2 Brand & identity

- **Name: Sage** everywhere (kill "cute chat"/"Sagechat" strings; update `serve.js`
  log, file headers, README).
- **Logo:** keep the diamond mark but refine it — simplify to a single-color glyph
  (monochrome by default, accent only on the active state) on a softly rounded
  squircle. Stop the 5-color SVG; premium products use restrained marks.
- **Tone of voice:** the empty-state copy should feel like a well-edited product
  ("How can I help you today?"), not marketing ("Intelligence & Clarity").

### 3.3 Color system (tokens)

Consolidate to a strict neutral base + one accent. Recommend **Monochrome as the
default** (it already exists and matches the "premium" claim); demote the pink/blossom
palette to an optional accent variant rather than the shipped default.

New token names (keep existing `--surface/--ink` where possible, add the missing ones):

```
--bg            (app canvas)          --surface      (cards/panels)
--surface-2     (inset wells)         --surface-3    (raised hover)
--border        (hairline)            --border-strong
--text-1        (primary)             --text-2  --text-3 (secondary/tertiary)
--accent        (the one color)       --accent-subtle  --accent-contrast
```

Rules:
- Borders: `1px` hairlines at low alpha (`color-mix(in srgb, currentColor 8%, transparent)`)
  — this is the single biggest "expensive feel" lever.
- Shadows: layered, tight, low-alpha (`0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)`),
  not big diffuse glows.
- Replace every hard-coded hex/rgba with a token (grep for `#[0-9a-f]` and `rgba(`).
- Collapse legacy palette aliases: `cute-pink→blossom`, `obsidian→slate`,
  `nord→sandstone`, `matcha→moss`, `midnight→ocean`; keep one canonical id each.

### 3.4 Typography

- **UI font:** load **Plus Jakarta Sans** properly (it's the declared default) or
  commit to Geist as the default and remove the fake option. Recommend: Geist as
  system UI (already loaded, looks great), Plus Jakarta Sans only if we want the
  warmer Claude vibe — **decide in Phase 1 and delete the other option's dead weight**.
- **Mono:** JetBrains Mono (already loaded) for code + the message rail timestamps.
- **Type scale (tokens):**
  `--text-xs 11px / --text-sm 12.5px / --text-md 14px / --text-lg 17px / --text-xl 22px`
  with a defined line-height per step. Headings get `letter-spacing: -0.02em`.
- **Serif** option: keep only if Newsreader is actually loaded; otherwise remove the
  selector entry. No silent fallbacks.

### 3.5 Spacing, radius, elevation

- **Spacing scale:** `4/8/12/16/24/32/48` as `--space-1..6`; audit paddings/margins
  against it (today values like 14px, 18px, 20px, 22px drift).
- **Radius scale:** `--r-sm 6px / --r-md 10px / --r-lg 14px / --r-xl 18px` — pick one
  per component class and stop mixing.
- **Elevation:** `--shadow-1/2/3` + `--shadow-popover` (menus/dropdowns) + `--shadow-modal`.

### 3.6 Iconography

- **One icon set, one grid.** 24×24 viewBox, `stroke-width: 1.8`, `stroke-linecap/linejoin: round`.
  Migrate every inline SVG (HTML + JS templates) to a single `icons.js` registry
  (`ICONS = { search: '<svg…>', ... }`) and render via `data-icon="search"`.
- Connector/brand logos (GitHub, Slack, Figma…) stay as-is (they're brand marks),
  but their chrome (background chips) must use tokens, not inline styles.

### 3.7 Motion system (tokens)

Define once, use everywhere:

```css
:root {
  --ease-out:   cubic-bezier(0.16, 1, 0.3, 1);   /* standard "expensive" ease */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --t-fast:  120ms;   /* hover, press, toggles      */
  --t-med:   200ms;   /* dropdowns, panels, collapse */
  --t-slow:  340ms;   /* modals, canvas drawer      */
}
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

Apply to:
- Sidebar collapse/expand (width + opacity of labels, `--t-med`, ease-out)
- Message entrances (`translateY(6px) → 0`, 240 ms, stagger ~40 ms)
- Dropdowns/popovers (opacity + `translateY(4px)`, `--t-fast`)
- Modals (scrim fade + panel `scale(0.98→1)`, `--t-slow`)
- Send button (active press scale, hover lift)
- Thinking slider thumb (already draggable — add smooth `transition: left/transform`)
- Canvas drawer (translateY slide, `--t-slow`)

---

## 4. Component Redesign Plan

### 4.1 Startup experience (new)

**A. Boot splash (new, ~700 ms, skip on subsequent loads):**
- Full-bleed `--bg` layer, centered logo lockup, logo draws in with a 400 ms fade/scale,
  a single hairline progress bar sweeping 0→100% in 600 ms, then a 200 ms crossfade into
  the app. No text beyond the wordmark. Guard: only on first visit per session (sessionStorage),
  skip entirely under `prefers-reduced-motion`, never block interaction > 800 ms.

**B. Empty state / welcome (rebuild of `.hero`):**
Claude-style, not card-grid:
- Centered column, top: refined logo avatar (48px squircle).
- H1: **"How can I help you today?"** (24px, `--text-1`, tight tracking). Drop the
  "Welcome to Sage" + pink-script treatment.
- Sub-line: one muted sentence naming current mode + active model (small, `--text-2`).
- **Suggestion pills** (ChatGPT-style): 3–4 single-line starter prompts as quiet
  pill buttons (hairline border, hover → subtle surface lift), *not* 2×2 icon cards.
- Optional **capability chips** row (Search · Files · Canvas · Voice) as tiny
  text-only chips.
- The `.hero` fades/slides in 300 ms on load; suggestions stagger 40 ms.

### 4.2 Sidebar

- Hairline right border (`--border`), `--surface` bg, width 272px (`--sidebar-w`).
- **New Chat** button: full-width, `--accent` on hover state only; default = surface
  with hairline. Remove the `Ctrl+Shift+O` kbd chip from the button (moves to tooltip).
- Section headers: 11px, uppercase, 0.06em tracking, `--text-3` (already close — unify).
- Mode grid: keep 6 modes but restyle to *list rows* or quiet 2-col grid with
  icon + label, selected = `--accent-subtle` bg + `--accent` text (drop the solid pink fill).
- Conversation items: 2-line rows, hover surface, active = left 2px `--accent` bar +
  `--surface-2` bg (already close; tighten spacing/type).
- Footer: consolidate Settings + theme + collapse into one clean row of icon buttons.

### 4.3 Topbar

- Collapse the scattered controls: left = brand glyph + mode title/subtitle; right =
  incognito, new chat, files (with badge), export, clear — all `--icon-btn` (32px,
  hover `--surface-2`), stroke 1.8.
- Give the topbar a hairline bottom border and `--surface` bg; remove the "hidden
  container for JS compat" cruft in `index.html` (`#topbarModelWrapper`,
  `#topbarTitleWrap` hidden divs) and let the visible UI be the real DOM.

### 4.4 Chat stream & messages

- Message column max-width 760px, centered; user messages right-aligned compact
  bubbles (`--surface-2`), assistant messages left-aligned full-width (no bubble —
  Claude-style) with avatar only on first message of a run.
- Message actions (copy, regenerate, export) appear on hover, fade in 120 ms.
- Streaming caret: keep current, add a gentle 800 ms blink keyframe.
- **Thought-process / steps pills:** restyle to mono 11px chips with chevron;
  expand/collapse with height transition (`--t-med`).
- Code blocks: keep the mac-style header but unify header height/padding, use
  `--r-lg` top corners, `--font-mono` 12.5px, tab-size 2.

### 4.5 Composer & thinking controls

- **Floating dock:** Claude-style — composer as a rounded (`--r-xl`) panel with
  hairline border, subtle `--shadow-2`, max-width 760px, centered; the page behind
  it is `--bg`, not a bordered well. `:focus-within` → border `--border-strong` +
  `--shadow-3` (no inset wells, no pink glow).
- Textarea: 14px, `--text-1`, `max-height: 200px` autogrow, placeholder `--text-3`.
- Toolbar icons: `--icon-btn` 32px, stroke 1.8; keep mic, attach, connectors.
- Send button: 32px squircle `--accent` with `--accent-contrast` arrow; press = scale
  down 0.94 with `--t-fast`; disabled state = `--surface-2` + `--text-3`.
- Thinking control: keep the slider concept (it's a differentiator), restyle to the
  token system (mono labels "Faster/Smarter", `--accent` fill). The brain icon: keep,
  but single stroke weight.
- The **model picker dropdown** and **connectors menu**: `--shadow-popover`, hairline
  border, `--r-lg`, entrance `--t-fast` fade+slide; unify with the settings modal's
  select styles.

### 4.6 Modals (settings, canvas, project files)

- Unify: one modal recipe (scrim `rgba(0,0,0,.45)` fade, panel scale-in, `--r-xl`,
  `--shadow-modal`, max-width 680px).
- Settings: keep tabs but restyle to the hairline tab bar with an active underline
  (Linear-style), not filled pills. Consolidate the palette card previews (swatches
  are good — keep), and fix the font selector to only list fonts that load.
- Canvas: keep split-screen; add a drag-resize handle with a visible grab affordance
  and 1px divider.

---

## 5. Codebase Betterment

### 5.1 Dead code removal (Phase 0 — do first)

Delete (git rm): `part5.js`, `served.js`, `analyze_part5.js`, `analyze_part5_v2.js`,
`fix1.js`. Verified: none are referenced by `index.html`, `sw.js`, or `serve.js`.
Also delete `chrome-temp/` (Chrome crash artifacts) and review `.apex/`/`.aios/` for
agent-session cruft that should be gitignored rather than committed.

### 5.2 Bug fixes

1. **Fonts:** load exactly the fonts the UI offers. Either add Plus Jakarta Sans
   (+ Lexend, + Newsreader if kept) to the Google Fonts request, or trim the selector.
   No silent fallbacks.
2. **Naming:** rename all "cute chat" strings → Sage; unify storage keys under one
   prefix (`sage.*`), with a one-time migration from `cc.*` keys; bump SW cache to
   `sage-shell-v2` and add cache invalidation on version change.
3. **Cache busting:** replace `?v=6` with a small build step (or a checked-in
   `version.json` read by a 5-line script) so bumps can't be forgotten.
4. **Palette canonicalization:** one id per palette; default = `mono`.

### 5.3 File organization (no-build, keep it simple)

Split the monoliths into ordered classic scripts (loaded with `defer` in sequence),
keeping the `window.Sage = {}` namespace pattern (already half-built via `__CC`):

```
src/
  core/utils.js        ($, $$, on, escapeHTML, LS, download, fingerprint)
  core/state.js        (defaults, load/persist/migrate, sessions)
  core/events.js       (tiny pub/sub: Sage.on / Sage.emit)
  core/icons.js        (single icon registry)
  providers/index.js   (dispatch by provider id)
  providers/pollinations.js  groq.js  openrouter.js  custom.js
  features/models.js   (static + live model fetchers/cache)
  features/thinking.js (thinking levels, slider logic)
  features/memory.js   (user memory extraction)
  features/search.js   (web search skill)
  features/canvas.js   (artifact preview + project files)
  ui/sidebar.js  ui/topbar.js  ui/composer.js  ui/chat.js
  ui/rail.js     ui/suggestions.js
  ui/settings.js ui/modals.js  ui/incognito.js
  app.js               (init/boot: splash → hydrate → wire)
```

`styles.css` → keep one file but enforce section order (tokens → base → layout →
components → modals → responsive → incognito), or split with `@import` and serve a
concatenated dev bundle via `serve.js`. Recommend: **one file, reorganized** — fewer
moving parts with zero build.

Loading order in `index.html`:
`marked → dompurify → highlight.js → src/core/*.js → src/features/*.js → src/ui/*.js → app.js`.
The `window.Sage` namespace replaces the loose `window.__CC` bag; parts communicate
through `Sage.emit/on` instead of direct reach-ins (decouples UI from providers).

### 5.4 State & events architecture

- Keep `state` as the single source of truth (already true). Formalize it:
  `state.settings`, `state.conversations`, `state.ui` (sidebar collapsed, active tab,
  theme) — and make UI read from state, not from DOM attributes.
- Add a 30-line `Sage.on/emit` so, e.g., `chat:stream-chunk` is emitted by providers
  and consumed by `ui/chat.js`; `theme:changed` is consumed by icons/logo.
- Migration path: `window.__CC` stays as a compatibility alias during the split, then
  is removed in the final phase.

### 5.5 Accessibility & performance

- Full keyboard review: focus-visible rings (`--border-focus` 2px offset), modal focus
  trap, Esc-to-close everywhere, arrow-key nav in model picker.
- `prefers-reduced-motion` guard (see 3.7).
- Color contrast: text-3 must be ≥ 4.5:1 on surfaces in both themes.
- Lazy-load `highlight.js` languages (only register used grammars) — the default
  bundle is ~1 MB.
- Preconnect already present; add `font-display: swap` (already default via Google).
- Add `loading="lazy"` to canvas iframes, debounce `renderConversations` on search.

---

## 6. Phased Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Cleanup** ✅ | rm dead files, chrome-temp; unify names; fix fonts; palette aliases; cache-busting | Repo has only live files; fonts actually load; grep for `cute`/`sagechat` returns only README history |
| **1. Design tokens** | color/space/radius/shadow/motion tokens; replace hard-coded colors; icon registry | No raw hex/rgba outside `:root`; `icons.js` exists and is used |
| **2. Shell** | sidebar, topbar, rail, responsive drawer rebuilt on tokens | Shell matches reference screenshots in light+dark |
| **3. Startup** | splash + redesigned empty state + suggestions | Fresh load → splash → "How can I help you today?"; reduced-motion skips splash |
| **4. Chat & composer** | message surfaces, actions, streaming caret, composer dock, thinking/model dropdowns | Streaming chat looks/feels premium in both themes |
| **5. Modals & canvas** | unified modal recipe, settings restyle, canvas resize handle | Settings/canvas/files modals consistent, keyboard-safe |
| **6. JS split** | `src/` modules per 5.3, `Sage` namespace, pub/sub wiring | `app.js` ≤ ~400 lines; each module < 600 lines; app works identically |
| **7. QA pass** | a11y audit, contrast, reduced-motion, perf (HLJS trim, debounce), PWA re-test | Lighthouse a11y ≥ 95; offline shell works; export/import round-trip OK |

Each phase is a separate PR-sized change; phases 0–5 are CSS/HTML-dominant and safe,
phase 6 is the only behavior-touching refactor (mitigate with manual regression list).

---

## 7. Acceptance Criteria (definition of done)

- Fresh visit: splash → refined empty state → composed message → streamed reply,
  all with coherent motion, in light and dark.
- Zero hard-coded colors in components; one radius/style per component class.
- No dead files; `app.js` split into modules; no `window.__CC` by the end.
- Fonts actually load; no console 404s for fonts/CSS.
- All features (BYOK providers, thinking slider, canvas, incognito, PWA, export/import,
  search) still work after each phase.
- `prefers-reduced-motion: reduce` produces a static, usable UI.

---

## 8. Risks & Guardrails

- **Scope creep:** design work is endless; phases are time-boxed by exit criteria.
- **Behavior regressions during JS split (phase 6):** do it last, after the UI is
  frozen; test streaming, per-chat sessions, incognito, canvas manually per module move.
- **Font choice churn:** decide Geist vs Plus Jakarta Sans in phase 1 and don't revisit.
- **Don't "AI-ify" it further:** the anti-goal is adding gradients, glassmorphism,
  emoji badges, or rainbow accents. Reference: Claude's restraint, ChatGPT's clarity,
  Linear's precision.
- Keep zero-build as a hard constraint unless the user explicitly opts into a bundler.

---

*Generated as part of the Sage refactor kickoff. Update this file as decisions land.*