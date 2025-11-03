import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 * Now using Cloudflare Workers AI (Llama 3.3)
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    console.log("🚀 onChatMessage called");
    console.log("AI binding available:", !!this.env.AI);

    // Create Workers AI provider using Cloudflare's infrastructure
    const workersai = createWorkersAI({ binding: this.env.AI });
    console.log("✅ Workers AI provider created");

    // Type assertion needed because package types may not include latest models
    const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any);
    console.log("✅ Model created");

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };
    console.log("✅ Tools collected:", Object.keys(allTools));

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        console.log("📝 Starting stream execution");

        const cleanedMessages = cleanupMessages(this.messages);
        console.log("📝 Messages cleaned:", cleanedMessages.length);

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });
        console.log("📝 Messages processed");

        console.log("🤖 Calling streamText...");
        const result = streamText({
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

${getSchedulePrompt({ date: new Date() })}`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as any,
          stopWhen: stepCountIs(10)
        });
        console.log("✅ streamText called");

        writer.merge(result.toUIMessageStream());
        console.log("✅ Stream merged");
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  //   async onChatMessage(
  //     onFinish: StreamTextOnFinishCallback<ToolSet>,
  //     _options?: { abortSignal?: AbortSignal }
  //   ) {
  //     // Create Workers AI provider using Cloudflare's infrastructure
  //     const workersai = createWorkersAI({ binding: this.env.AI });
  //     const model = workersai("@cf/meta/llama-3-70b-instruct" as any);

  //     // Collect all tools, including MCP tools
  //     const allTools = {
  //       ...tools,
  //       ...this.mcp.getAITools()
  //     };

  //     const stream = createUIMessageStream({
  //       execute: async ({ writer }) => {
  //         // Clean up incomplete tool calls to prevent API errors
  //         const cleanedMessages = cleanupMessages(this.messages);

  //         // Process any pending tool calls from previous messages
  //         // This handles human-in-the-loop confirmations for tools
  //         const processedMessages = await processToolCalls({
  //           messages: cleanedMessages,
  //           dataStream: writer,
  //           tools: allTools,
  //           executions
  //         });

  //         const result = streamText({
  //           system: `You are a helpful assistant that can do various tasks...

  // ${getSchedulePrompt({ date: new Date() })}

  // If the user asks to schedule a task, use the schedule tool to schedule the task.`,
  //           messages: convertToModelMessages(processedMessages),
  //           model,
  //           tools: allTools,
  //           // Type boundary: streamText expects specific tool types, but base class uses ToolSet
  //           // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
  //           onFinish: onFinish as any,
  //           stopWhen: stepCountIs(10)
  //         });

  //         writer.merge(result.toUIMessageStream());
  //       }
  //     });

  //     return createUIMessageStreamResponse({ stream });
  //   }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      // Workers AI doesn't need an external API key!
      return Response.json({
        success: true
      });
    }

    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
