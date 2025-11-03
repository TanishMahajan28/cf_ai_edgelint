# AI Prompts Used in EdgeLint AI

This document contains all AI prompts and tool configurations used in the EdgeLint AI project, as required by the assignment guidelines.

## System Prompt (Main Agent)

**Location:** `src/server.ts` - Line ~50

**Purpose:** Defines the Agent's personality, expertise, and response format
```typescript
system: `You are EdgeLint AI, an expert code reviewer specialized in Cloudflare Workers.

Your mission: Help developers write better, faster, edge-optimized code.

WORKFLOW:
1. When users share code, ALWAYS use the analyzeWorkerCode tool first
2. Present the tool's analysis results as-is (they're already formatted)
3. After showing issues, offer to provide corrected code
4. When providing corrected code, use proper markdown code blocks
5. Explain what you changed and why

PROVIDING CORRECTED CODE:
When users ask for a fix, provide:

✅ **CORRECTED VERSION:**

\`\`\`javascript
[complete, working code here]
\`\`\`

**What I changed:**
- [Specific change 1 with explanation]
- [Specific change 2 with explanation]
- [Specific change 3 with explanation]

**Key improvements:**
- [Performance/compatibility benefit 1]
- [Performance/compatibility benefit 2]

**To use this code:**
1. Add necessary bindings to wrangler.toml
2. Test locally with \`wrangler dev\`
3. Deploy with \`wrangler deploy\`

IMPORTANT:
- Always use analyzeWorkerCode tool when code is shared
- Present tool output cleanly (it's pre-formatted with markdown)
- Provide complete, working code examples in code blocks
- Be encouraging and educational
- Explain WHY something doesn't work, not just WHAT is wrong

Common Workers alternatives:
- fs → KV or R2 storage
- path → URL manipulation or KV keys
- setTimeout → Durable Objects Alarms, Cron Triggers, or Workflows
- Global variables → Durable Objects or KV
- process.env → env parameter in fetch()
- Buffer → Uint8Array or ArrayBuffer

You can have normal conversations, but excel at code review.

${getSchedulePrompt({ date: new Date() })}`
```

### Design Decisions

**Why this approach:**
- ✅ Clear role definition - Agent knows it's a code reviewer
- ✅ Structured workflow - Consistent responses
- ✅ Educational tone - Teaches while reviewing
- ✅ Action-oriented - Provides fixes, not just criticism
- ✅ Platform-specific - Deep Cloudflare Workers knowledge

**Alternatives considered:**
- Generic assistant prompt - Rejected (too broad, less authoritative)
- Pure technical analyzer - Rejected (less approachable, no explanations)
- Strict rule-based only - Rejected (less flexible, can't handle edge cases)

---

## Tool Prompts

### 1. analyzeWorkerCode Tool

**Location:** `src/tools.ts` - Line ~30

**Purpose:** Analyze code for Workers compatibility issues
```typescript
const analyzeWorkerCode = tool({
  description: "Analyze code for Cloudflare Workers compatibility issues, performance problems, and best practices. Use this when users share code to review.",
  inputSchema: z.object({
    code: z.string().describe("The code to analyze"),
    filename: z.string().optional().describe("Optional filename for context")
  }),
  execute: async ({ code, filename }) => {
    // Pattern matching and rule-based analysis
    // Returns formatted markdown with issues categorized by severity
  }
});
```

**Key Analysis Patterns:**

1. **Node.js API Detection**
```typescript
   const nodeAPIs = [
     'fs', 'path', 'crypto', 'os', 'process', 'child_process',
     'cluster', 'dns', 'http', 'https', 'net', 'tls', 'stream',
     'buffer', 'events', 'util', 'url', 'querystring', 'zlib'
   ];
```

2. **Blocking Operations**
```typescript
   const blockingOps = [
     { pattern: 'readFileSync', fix: 'Use KV.get() or R2 fetch with await' },
     { pattern: 'writeFileSync', fix: 'Use KV.put() or R2 put with await' },
     { pattern: 'execSync', fix: 'Not supported - rethink your architecture' }
   ];
```

3. **Anti-patterns**
   - Global state detection
   - setTimeout/setInterval usage
   - Missing error handling
   - Missing env parameter
   - Missing ctx.waitUntil for background tasks

**Output Format:**
```markdown
## 📊 Analysis Results

Found **X issue(s)** in your code:

### 🔴 CRITICAL ISSUES (count)
*These will prevent your Worker from running:*

**1. Issue Title**
   Description and fix suggestion

### 🟡 WARNINGS (count)
*These may cause problems in production:*

[Similar format]

### ℹ️ SUGGESTIONS (count)
*Optional improvements for better code:*

[Similar format]

---

💡 **Next:** I can provide a corrected version of this code. 
Would you like me to show you a Workers-compatible implementation?
```

---

### 2. explainWorkersConcept Tool

**Location:** `src/tools.ts` - Line ~200

**Purpose:** Provide detailed explanations of Workers concepts
```typescript
const explainWorkersConcept = tool({
  description: "Explain Cloudflare Workers concepts, constraints, or best practices",
  inputSchema: z.object({
    concept: z.string().describe("The concept to explain (e.g., 'CPU time limits', 'V8 isolates', 'KV vs R2')")
  }),
  execute: async ({ concept }) => {
    return `Requesting explanation for: ${concept}`;
  }
});
```

**Note:** This tool signals the AI to provide an explanation. The actual explanation is generated by the LLM based on its training data and the system prompt's expertise definition.

---

## Prompt Engineering Techniques Used

### 1. **Role Definition**
Clear establishment of the agent's expertise and purpose:
```
"You are EdgeLint AI, an expert code reviewer specialized in Cloudflare Workers."
```

### 2. **Structured Workflow**
Step-by-step instructions for consistent behavior:
```
WORKFLOW:
1. When users share code, ALWAYS use the analyzeWorkerCode tool first
2. Present the tool's analysis results as-is
3. After showing issues, offer to provide corrected code
```

### 3. **Output Templates**
Pre-defined formats for consistent, high-quality responses:
```
✅ **CORRECTED VERSION:**
[code block]

**What I changed:**
- [explanations]
```

### 4. **Knowledge Injection**
Domain-specific mappings embedded in the prompt:
```
Common Workers alternatives:
- fs → KV or R2 storage
- setTimeout → Durable Objects Alarms
- Global variables → Durable Objects or KV
```

### 5. **Behavioral Guidelines**
Clear rules for tone and approach:
```
- Be encouraging and educational
- Explain WHY something doesn't work, not just WHAT is wrong
- Provide complete, working code examples
```

---

## Prompt Iteration History

### Version 1 (Initial)
- Generic "helpful assistant" prompt
- No structured output
- AI would sometimes miss using tools

**Issues:**
- Inconsistent response format
- Sometimes didn't call analysis tool
- Lacked domain expertise

### Version 2 (Structured)
- Added clear role definition
- Specified tool usage workflow
- Added output templates

**Improvements:**
- More consistent responses
- Always uses tools when appropriate
- Better formatting

### Version 3 (Current - Domain Expert)
- Deep Workers knowledge embedded
- Educational tone emphasized
- Pre-formatted tool outputs
- Common alternatives provided

**Results:**
- High-quality, consistent responses
- Educational and actionable feedback
- Professional presentation

---

## Testing & Validation

### Test Prompts Used

1. **Code Review Test**
```
   Can you review this code?
   
   import fs from 'fs';
   export default {
     async fetch(request) {
       const data = fs.readFileSync('./data.json');
       return new Response(data);
     }
   }
```
   
   **Expected:** Detect fs module, readFileSync, provide corrected version

2. **Conceptual Question**
```
   Why can't I use setTimeout in Cloudflare Workers?
```
   
   **Expected:** Explain request-based execution model, suggest alternatives

3. **Optimization Question**
```
   How do I cache API responses in Workers?
```
   
   **Expected:** Explain Cache API, provide code example

### Success Criteria

✅ Correctly identifies all critical issues
✅ Provides working, corrected code
✅ Explains concepts clearly
✅ Maintains educational, encouraging tone
✅ Uses proper markdown formatting
✅ References Cloudflare-specific solutions

---

## AI Model Configuration

**Model:** Llama 3.3 70B Instruct (FP8 Fast)
**Provider:** Cloudflare Workers AI
**Model ID:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

**Configuration:**
```typescript
const workersai = createWorkersAI({ binding: this.env.AI });
const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

const result = streamText({
  system: [system prompt],
  messages: convertToModelMessages(processedMessages),
  model,
  tools: allTools,
  onFinish,
  stopWhen: stepCountIs(10)
});
```

**Parameters:**
- `stopWhen: stepCountIs(10)` - Limits reasoning steps to prevent infinite loops
- Streaming enabled - Real-time response delivery
- Tool calling enabled - Can invoke code analysis functions

---

## Future Prompt Improvements

Potential enhancements for future versions:

1. **Few-shot Examples**
   - Add example code reviews in the system prompt
   - Show ideal response formats

2. **Severity Calibration**
   - More nuanced issue categorization
   - Context-aware severity (dev vs prod)

3. **Learning Mode**
   - Adapt explanations based on user expertise level
   - Track common user mistakes

4. **Multi-file Analysis**
   - Analyze entire project structure
   - Check wrangler.toml compatibility

5. **Performance Benchmarking**
   - Estimate CPU time usage
   - Suggest optimization metrics

---

## References

- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Agents SDK Prompt Engineering](https://developers.cloudflare.com/agents/)
- [Vercel AI SDK - Tool Calling](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling)

---

*This document fulfills the PROMPTS.md requirement specified in the assignment guidelines.*