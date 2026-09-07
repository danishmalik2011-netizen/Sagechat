<div align="center">

# ✦ Sage

### A private, delightful, local-first AI workspace built right into your browser.

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live_Preview-black?style=for-the-badge&logo=vercel)](https://sagechat-xi.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-pink?style=for-the-badge)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/danishmalik2011-netizen/Sagechat?style=for-the-badge&color=ff3366)](https://github.com/danishmalik2011-netizen/Sagechat)

**[Live App Demo ↗](https://sagechat-xi.vercel.app)** &nbsp;•&nbsp;
**[Alternative Mirror ↗](https://sagechat-k9m2b4oyf-danish-s-projects13.vercel.app)**

</div>

---

## 📖 Overview

**Sage** is a high-performance, private, client-side conversational AI application designed around the **BYOK (Bring Your Own Key)** philosophy. 

Everything runs directly in your browser: API keys never touch an intermediate server, chat histories stay stored locally on your device, and you get instant access to the world's most powerful LLMs alongside a suite of developer-first tools like a live **Canvas sandbox**, **Model Context Protocol (MCP)** integration, and a **Codex-style Thinking Depth Slider**.

---

## ✨ Features

### 🧠 Codex-Style Granular Thinking Slider
Fine-tune model reasoning on the fly with a tactile, grain-textured slider:
- **5 Reasoning Levels**: `Off` (Instant), `Minimal` (Light), `Balanced` (Default), `Deep` (Deliberate), and `Maximum` (Extended CoT).
- **Dynamic Pink Gradient**: The thumb and track scale in color intensity and grain as reasoning depth increases.
- **Touch & Desktop Draggable**: Smooth pointer events support both touch drag on mobile and mouse capture on desktop.

### 📱 True Mobile-First Responsive Design
Engineered from the ground up for phone viewports:
- **Two-Tier Composer Dock**: Full-width textarea on the top deck with zero horizontal cramping, paired with a dedicated action bar below.
- **iOS Safari Optimization**: Native `16px` font sizing prevents automatic page zoom on focus; respects all `env(safe-area-inset-*)` notches and home bars.
- **Fluid Drawer & Frosted Blur**: Off-canvas navigation drawer with rounded outer borders and an 8px frosted backdrop blur scrim.
- **Full-Width Message Stream**: Streamlined assistant bubbles maximize reading area on small screens without desktop indent overhead.

### 🎨 Live Canvas & Artifact Sandbox
- **Interactive Previews**: Render HTML, CSS, JavaScript, SVG, and dashboard components in a sandboxed, responsive canvas.
- **Minimalist Styling**: Custom sleek scrollbars and isolated preview environment.

### 💻 Dark-Card Syntax Highlighting
- **Mac-Style Terminal Header**: Colored window control pips, detected language badge, and instant one-click copy button.
- **Rich Palette**: High-contrast syntax theme with vibrant accents for tags, keywords, strings, and attributes.

### 🌐 Autonomous Web Search MCP
- **Multi-Source Real-Time Search**: Combines live public web querying across official documentation, news, and project sites with Wikipedia knowledge.
- **Serverless & Resilient Fallback**: Powered by Vercel Serverless Function `/api/search` with zero external dependencies, backed by automatic client-side CORS failovers. Never 404s.

### 🪜 Collapsible Steps & Polished Reasoning Toggles
- **Collapsible Tool Steps**: All MCP executions (Web Search, Charts, Calendar, SQLite) render cleanly inside a collapsible `Steps` pill, so the main chat stays distraction-free.
- **Dedicated Thought Process Toggle**: Model chain-of-thought (e.g. `<think>` blocks or leading reasoning) is automatically isolated inside an expandable `Thought Process` block, ensuring only the polished final answer appears in the chat stream.

### 🎭 Appearance & Premium UX
- **5 Sophisticated Matte Palettes**: Refined non-generic themes crafted for deep focus: *Blossom (Warm Rose)*, *Studio Slate (Neutral Gray)*, *Warm Sandstone (Oyster/Earthy)*, *Forest Moss (Calm Sage)*, and *Deep Ocean (Abyssal Slate)*.
- **Desktop Sidebar Hover-Swap**: Hovering near the top-left brand logo smoothly cross-fades into the professional dual-pane collapser button (`Ctrl+[` shortcut). When collapsed, the brand glyph anchors the topbar and swaps to the expand icon on hover.
- **Dyslexia-Friendly Typography**: Toggle between *Plus Jakarta Sans*, *OpenDyslexic* (specialized reading ease), *Lexend*, *JetBrains Mono*, and *Editorial Serif*.
- **Dynamic Font Scaling**: Real-time message body and composer text scaling across Small, Medium, Large, and Extra Large tokens.
- **Real Personalization & Memory**: Automatic approximate IP geolocation and automatic long-term memory extraction without server persistence.

### 🔌 Multi-Provider & BYOK Infrastructure
Seamlessly switch between providers:
- **Supported Providers**: OpenAI, Anthropic Claude, Google Gemini, Groq, Mistral AI, Ollama (Local LLMs), OpenRouter, DeepSeek, and Pollinations (Free out-of-the-box fallback).
- **Zero Intermediary**: All API calls are executed directly from the client via standard Fetch and Server-Sent Events (SSE).
- **Client Storage**: Session data and preferences persist in your browser's LocalStorage and IndexedDB.

### 🛠️ Developer & Power Tools
- **Model Context Protocol (MCP)**: Attach custom tool servers and schemas directly from the composer.
- **PDF & Document Parsing**: Upload and extract text and visual context from PDFs and images.
- **Voice Input**: Integrated speech-to-text dictation.
- **Prompt Library**: Pre-configured modes for Code & Architecture, Deep Thinking, Writing & Synthesis, and Summarization.

---

## 🚀 Quick Start

### 1. Try It Online
No installation required. Visit:
**[https://sagechat-xi.vercel.app](https://sagechat-xi.vercel.app)**

### 2. Run Locally

Sage is built with vanilla web technologies—no heavy bundling or node dependencies required.

```bash
# Clone the repository
git clone https://github.com/danishmalik2011-netizen/Sagechat.git

# Navigate to project directory
cd Sagechat

# Start a local static server
node serve.js
# Or with any static file server:
# npx serve .
```

Open `http://localhost:8766` in your browser.

---

## 📂 Project Structure

```text
Sage/
├── api/
│   └── search.js       # Vercel Serverless Function for multi-source web search
├── index.html          # Semantic application layout & template structures
├── styles.css          # Mobile-first responsive CSS, themes, & animations
├── app.js              # State management, SSE streaming, multi-provider engine, & UI handlers
├── serve.js            # Lightweight local dev server with proxy support
├── .gitignore          # Repository ignore rules
└── README.md           # Documentation
```

---

## 🌐 Deployment

### Deploy to Vercel

Sage is fully static and deploys to Vercel with zero configuration:

1. Import the repository on [Vercel](https://vercel.com/new).
2. Set Framework Preset to **Other** (Root directory `./`).
3. Deploy! Every `git push` to `main` will automatically trigger a production build.

---

## 🔒 Privacy & Security

- **Direct Connections**: Your API keys are stored only in your browser (`localStorage`).
- **No Analytics or Telemetry**: No third-party tracking scripts or remote analytics.
- **Offline & Local Models**: Fully compatible with local Ollama instances for 100% air-gapped workflows.

---

## 🤝 Contributing

Contributions, feedback, and bug reports are warmly welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
