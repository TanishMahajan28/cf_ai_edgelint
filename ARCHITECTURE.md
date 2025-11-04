# EdgeLint AI - Technical Architecture

Deep dive into the technical design and implementation of EdgeLint AI.

## System Overview
```
┌─────────────────────────────────────────────────────────────┐
│                         User Browser                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             React UI (Vite + TailwindCSS)            │   │
│  │  • Code input • Chat interface • Result display      │   │
│  └────────────────────┬─────────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────────┘
                         │ WebSocket
                         │
┌────────────────────────▼─────────────────────────────────────┐
│                    Cloudflare Edge Network                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Cloudflare Worker                        │   │
│  │           (Routes requests to Agent)                  │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                       │
│  ┌────────────────────▼─────────────────────────────────┐   │
│  │           Durable Object: Chat Agent                  │   │
│  │  • State management  • Tool orchestration             │   │
│  │  • Message history   • WebSocket handling             │   │
│  └──┬──────────────┬──────────────┬─────────────────────┘   │
│     │              │              │                           │
│     ▼              ▼              ▼                           │
│  ┌──────┐    ┌──────────┐   ┌───────────┐                  │
│  │  SQL │    │ Workers  │   │   Tools   │                  │
│  │      │    │    AI    │   │           │                  │
│  │      │    │ (Llama   │   │ • analyze │                  │
│  │      │    │  3.3)    │   │ • explain │                  │
│  └──────┘    └──────────┘   └───────────┘                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Component Deep Dive

### 1. Frontend (React + Vite)

**Files:** `src/app.tsx`, `src/client.tsx`, `src/components/`

**Key Features:**
- Real-time messaging with WebSocket auto-reconnect
- Markdown rendering for code blocks
- State synchronization via `useAgent` hook
- Theme switching (dark/light mode)
- Debug mode for development

**State Management:**
```typescript
const agent = useAgent({ agent: "chat" });
const {
  messages,      // All conversation messages
  sendMessage,   // Send user input
  addToolResult, // Handle tool confirmations
  clearHistory,  // Reset conversation
  status,        // Connection status
  stop           // Cancel streaming
} = useAgentChat({ agent });
```

### 2. Backend Worker

**File:** `src/server.ts`

Entry point that routes requests to the Agent:
```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Health check endpoint
    if (url.pathname === "/check-open-ai-key") {
      return Response.json({ success: true });
    }
    
    // Route to Agent via Agents SDK
    return await routeAgentRequest(request, env) ||
           new Response("Not found", { status: 404 });
  }
}
```

### 3. Chat Agent (Durable Object)

**File:** `src/server.ts` - Chat class

The core AI agent that:
- Maintains conversation history
- Orchestrates tool calls
- Streams LLM responses
- Manages state persistence

**Key Method:**
```typescript
async onChatMessage(
  onFinish: StreamTextOnFinishCallback<ToolSet>,
  _options?: { abortSignal?: AbortSignal }
) {
  // 1. Create Workers AI model
  const workersai = createWorkersAI({ binding: this.env.AI });
  const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  
  // 2. Collect available tools
  const allTools = { ...tools, ...this.mcp.getAITools() };
  
  // 3. Process pending tool calls (human-in-the-loop)
  const processedMessages = await processToolCalls({
    messages: cleanedMessages,
    dataStream: writer,
    tools: allTools,
    executions
  });
  
  // 4. Stream AI response
  const result = streamText({
    system: [system prompt with expertise],
    messages: convertToModelMessages(processedMessages),
    model,
    tools: allTools,
    onFinish,
    stopWhen: stepCountIs(10)
  });
  
  // 5. Merge and return stream
  writer.merge(result.toUIMessageStream());
}
```

### 4. Code Analysis Tools

**File:** `src/tools.ts`

**analyzeWorkerCode:**
- Pattern matching for Node.js APIs
- Regular expression analysis for anti-patterns
- Severity categorization (Critical, Warning, Info)
- Formatted markdown output

**Algorithm:**
```python
function analyzeCode(code):
  issues = []
  
  # Check Node.js imports
  for api in NODE_APIS:
    if code.contains(f"from '{api}'") or code.contains(f"require('{api}')"):
      issues.add(CRITICAL: "Node.js module not available")
  
  # Check blocking operations
  if code.contains("readFileSync") or code.contains("writeFileSync"):
    issues.add(CRITICAL: "Synchronous operation detected")
  
  # Check Workers patterns
  if code.contains("setTimeout") or code.contains("setInterval"):
    issues.add(WARNING: "Timers not supported")
  
  if has_global_state(code):
    issues.add(WARNING: "Global state detected")
  
  if not code.contains("export default"):
    issues.add(ERROR: "Missing default export")
  
  # Format and return
  return format_issues(issues)
```

**explainWorkersConcept:**
- Signals the AI to provide concept explanations
- Leverages LLM's training data for detailed answers
- Context-aware based on conversation history

## Data Flow

### Code Review Flow
```
1. User pastes code
   └─> React UI

2. sendMessage() called
   └─> WebSocket to Worker

3. Worker routes to Agent
   └─> Durable Object: Chat

4. Chat.onChatMessage() invoked
   └─> Calls analyzeWorkerCode tool

5. Tool analyzes code
   └─> Pattern matching
   └─> Returns formatted issues

6. LLM enhances response
   └─> Adds explanations
   └─> Formats for readability

7. Stream response
   └─> WebSocket to UI
   └─> Incremental render

8. User sees result
   └─> Can ask follow-ups
```

### WebSocket State Sync

The Agents SDK automatically syncs state:
```typescript
// Backend (Durable Object)
this.setState({
  codeUnderReview: code,
  issues: analysisResults,
  lastReview: Date.now()
});

// Frontend (React)
const agent = useAgent({ agent: "chat" });
// agent.state automatically updates!
```

## Performance Optimizations

### 1. Streaming Responses
- LLM output streams token-by-token
- Users see results immediately
- Lower perceived latency

### 2. Durable Objects
- State persists between requests
- No cold starts for active sessions
- WebSocket hibernation saves costs

### 3. Edge Deployment
- Runs closest to users globally
- Sub-100ms latency worldwide
- No origin servers needed

### 4. Code Analysis Caching
Future enhancement:
```typescript
// Cache analysis results
const cacheKey = hashCode(code);
const cached = await env.KV.get(`analysis:${cacheKey}`);
if (cached) return cached;
```

## Security Considerations

### 1. Input Validation
- Code length limits (prevent DoS)
- Sanitize user input before analysis
- Rate limiting via Durable Objects

### 2. Tool Permissions
- Tools can't execute arbitrary code
- Read-only analysis operations
- No file system access

### 3. State Isolation
- Each conversation = separate Durable Object
- User data never shared
- Automatic cleanup of old sessions

## Scalability

### Current Limits
- **Durable Objects:** ~1 million instances possible
- **Workers AI:** ~10,000 requests/day free tier
- **WebSocket connections:** Unlimited with hibernation

### Scaling Strategy
1. **Horizontal:** Add more Durable Object instances automatically
2. **Geographic:** Deploy to 300+ data centers globally
3. **Cost-effective:** Workers AI pricing per token

## Development Workflow

### Local Development
```bash
npm run start  # Vite dev server + Wrangler
```

**What runs locally:**
- ✅ React UI (Vite hot reload)
- ✅ Worker logic (Wrangler local mode)
- ✅ Durable Objects (local SQLite)
- ⚠️ Workers AI (requires remote mode or mock)

### Testing Strategy
```bash
npm run test   # Vitest unit tests
npm run check  # Type checking + linting
```

**Test Coverage:**
- Tool function logic
- Pattern matching accuracy
- Message formatting
- Error handling

### Deployment
```bash
npm run deploy  # Build + wrangler deploy
```

**What happens:**
1. Vite builds React app
2. Wrangler bundles Worker
3. Uploads to Cloudflare
4. Updates Durable Object migrations
5. Binds Workers AI

## Technology Choices

### Why Agents SDK?
**Alternatives considered:**
- Plain Durable Objects → Too much boilerplate
- Hono + Workers → No WebSocket state sync
- Pages Functions → Less control over state

**Why Agents SDK wins:**
- ✅ Built-in WebSocket handling
- ✅ Automatic state synchronization
- ✅ Scheduling and workflows built-in
- ✅ MCP (Model Context Protocol) support
- ✅ Production-ready patterns

### Why Workers AI (Llama 3.3)?
**Alternatives considered:**
- OpenAI GPT-4 → External dependency, higher cost
- Anthropic Claude → Not available on Workers
- Gemini → Requires API keys

**Why Workers AI wins:**
- ✅ No external APIs
- ✅ Runs on Cloudflare's infrastructure
- ✅ Free generous tier
- ✅ Shows platform expertise
- ✅ Lower latency (same network)

### Why React + Vite?
**Alternatives considered:**
- Vanilla JS → Harder state management
- Next.js → Overkill for this scope
- Svelte → Less familiar ecosystem

**Why React + Vite wins:**
- ✅ Fast development
- ✅ Great DX with hot reload
- ✅ Vercel AI SDK integration
- ✅ TypeScript support
- ✅ Modern tooling

## Monitoring & Observability

### Current Logging
```typescript
console.log(`Analyzing code${filename ? ` from ${filename}` : ''}...`);
console.log("AI binding available:", !!this.env.AI);
```

### Production Enhancements
Future additions:
- Workers Analytics for request metrics
- Logpush for detailed logs
- Real User Monitoring (RUM)
- Error tracking (Sentry integration)

## Future Enhancements

### Phase 2 Features
1. **Multi-file Analysis**
   - Analyze entire project
   - Check wrangler.toml compatibility
   - Dependency analysis

2. **Performance Profiling**
   - Estimate CPU time usage
   - Identify bottlenecks
   - Benchmark suggestions

3. **Auto-fix Mode**
   - One-click code correction
   - Preview diffs
   - Download corrected files

4. **Learning Mode**
   - Track user's common mistakes
   - Personalized suggestions
   - Progress tracking

5. **Integration**
   - GitHub App
   - VS Code extension
   - CLI tool

### Technical Debt
- Add comprehensive unit tests
- Implement caching for repeated analyses
- Add rate limiting
- Improve error messages
- Add telemetry

## References

- [Cloudflare Workers Architecture](https://developers.cloudflare.com/workers/learning/how-workers-works/)
- [Durable Objects Best Practices](https://developers.cloudflare.com/durable-objects/best-practices/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)