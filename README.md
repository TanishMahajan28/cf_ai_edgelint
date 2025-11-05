# EdgeLint AI 🔶

> AI-powered code review assistant for Cloudflare Workers

EdgeLint AI is an intelligent code review tool that helps developers write better, faster, and edge-optimized Cloudflare Workers code. Built with the Cloudflare Agents SDK and powered by Workers AI (Llama 3.3).

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Workers AI](https://img.shields.io/badge/Workers-AI-F38020)](https://ai.cloudflare.com/)
[![Agents SDK](https://img.shields.io/badge/Agents-SDK-F38020)](https://developers.cloudflare.com/agents/)

## 🌟 Features

### Intelligent Code Analysis
- **Node.js Compatibility Checks** - Detects incompatible Node.js APIs (fs, path, process, etc.)
- **Performance Analysis** - Identifies blocking operations and synchronous code
- **Edge-Specific Patterns** - Catches setTimeout, global state, and other anti-patterns
- **Best Practices** - Suggests error handling, proper exports, and env parameter usage

### Real-Time Assistance
- **Interactive Chat Interface** - Natural conversation about your code
- **Instant Feedback** - Get analysis results in seconds
- **Corrected Code Examples** - See working, edge-optimized alternatives
- **Educational Explanations** - Learn WHY something doesn't work

### Built on Cloudflare Platform
- **Workers AI (Llama 3.3)** - No external API dependencies
- **Agents SDK** - Durable state and real-time communication
- **Serverless** - Scales globally on Cloudflare's edge network

## 🚀 Demo

### Live Demo
👉 **[Try EdgeLint AI](https://cf-ai-edgelint.tanish-mahajan.workers.dev)**

### Example Usage

**Input:**
```javascript
import fs from 'fs';

export default {
  async fetch(request) {
    const data = fs.readFileSync('./config.json');
    return new Response(data);
  }
}
```

**EdgeLint Response:**
```
🔴 CRITICAL ISSUES (2):

1. Node.js 'fs' module not available
   Workers run in V8 isolates without Node.js APIs. 
   Replace 'fs' with Workers-compatible alternatives.

2. Synchronous operation: readFileSync()
   Blocking operations hurt edge performance. 
   Use KV.get() or R2 fetch with await

✅ CORRECTED VERSION:

export default {
  async fetch(request, env, ctx) {
    try {
      const data = await env.MY_KV.get('config.json', 'text');
      if (!data) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(data);
    } catch (error) {
      return new Response('Error', { status: 500 });
    }
  }
}
```

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+
- npm or pnpm
- Cloudflare account (for deployment)

### Local Development

1. **Clone the repository**
```bash
   git clone https://github.com/YOUR_USERNAME/cf_ai_edgelint.git
   cd cf_ai_edgelint
```

2. **Install dependencies**
```bash
   npm install
```

3. **Start development server**
```bash
   npm run start
```

4. **Open in browser**
```
   http://localhost:5173
```

That's it! No API keys needed - uses Workers AI locally.

## 🌐 Deployment

Deploy to Cloudflare Workers:
```bash
# Login to Cloudflare
npx wrangler login

# Deploy
npm run deploy
```

Your EdgeLint AI will be live at: `https://cf-ai-edgelint.tanish-mahajan.workers.dev`

### Configuration

The project is configured via `wrangler.jsonc`:
```jsonc
{
  "name": "cf-ai-edgelint",
  "main": "src/server.ts",
  "compatibility_date": "2025-08-03",
  "ai": {
    "binding": "AI",
    "remote": true
  },
  "durable_objects": {
    "bindings": [
      {
        "name": "Chat",
        "class_name": "Chat"
      }
    ]
  }
}
```

## 🏗️ Architecture

### Technology Stack

- **Frontend**: React 19 + Vite + TailwindCSS
- **Backend**: Cloudflare Workers + Agents SDK
- **AI Model**: Llama 3.3 (70B) via Workers AI
- **State Management**: Durable Objects + SQL
- **Real-time**: WebSockets (built into Agents SDK)

### Key Components
```
src/
├── server.ts           # Agent implementation (Chat class)
├── tools.ts            # Code analysis tools
├── app.tsx             # React UI
├── components/         # UI components
└── utils.ts           # Helper functions
```

### How It Works

1. **User submits code** → React UI sends message to Agent
2. **Agent analyzes** → Calls `analyzeWorkerCode` tool
3. **Tool executes** → Pattern matching + rule-based analysis
4. **AI enhances** → Llama 3.3 formats and explains results
5. **User receives** → Formatted analysis with fixes

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation.

## 🛠️ Code Analysis Rules

EdgeLint detects:

### 🔴 Critical Issues (Won't Run)
- Node.js modules (fs, path, crypto, http, etc.)
- Synchronous file operations (readFileSync, writeFileSync)
- Missing default export
- Missing fetch handler

### 🟡 Warnings (May Cause Problems)
- setTimeout/setInterval usage
- Global state (module-level variables)
- Missing error handling
- Missing env parameter

### ℹ️ Suggestions (Best Practices)
- Missing ctx.waitUntil for background tasks
- Inefficient Response handling
- Missing caching strategies

## 🧪 Testing

Try these example queries:

1. **Code Review**
```
   Can you review this code?
   [paste problematic Worker code]
```

2. **Concept Questions**
```
   Why can't I use fs.readFile in Workers?
   What's the difference between KV and R2?
   Explain V8 isolates
```

3. **Optimization Help**
```
   How do I optimize this Worker for performance?
   What's the best way to cache API responses?
```

## 📚 Learn More

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Agents SDK Guide](https://developers.cloudflare.com/agents/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Edge Computing Best Practices](https://developers.cloudflare.com/workers/platform/limits/)

## 🎯 Project Goals

EdgeLint AI was built to demonstrate:

1. **Deep platform knowledge** - Understanding of Workers constraints and edge computing
2. **AI integration expertise** - Effective use of Workers AI and Agents SDK
3. **Production-quality code** - Clean architecture, error handling, testing
4. **Developer experience focus** - Intuitive UI, helpful feedback, educational approach

## 🤝 Contributing

This is a portfolio/assignment project, but feedback is welcome!

## 📄 License

MIT License - see [LICENSE](./LICENSE) file

## 👤 Author

**Tanish Mahajan**
- GitHub: [@TanishMahajan28](https://github.com/TanishMahajan28)
- Emai: mahajantanish28@gmail.com

---

Built with ❤️ using Cloudflare Workers, Agents SDK, and Workers AI

*Submission for Cloudflare Software Engineer Intern position (Summer 2026)*
