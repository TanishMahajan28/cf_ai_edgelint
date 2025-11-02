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

        Core expertise:
        - Cloudflare Workers architecture and constraints
        - Edge computing best practices
        - Workers API usage patterns
        - Performance optimization for V8 isolates
        - Identifying Node.js incompatibilities

        When reviewing code:
        1. Identify specific issues with line numbers
        2. Explain WHY something is problematic
        3. Suggest concrete, actionable fixes
        4. Teach edge computing concepts
        5. Be encouraging and educational

        Common issues to check:
        ❌ Node.js APIs (fs, path, process, etc.) - Won't work on Workers
        ❌ Synchronous/blocking operations - Bad for edge performance
        ❌ Missing error handling - Critical for production
        ❌ Inefficient data fetching - Should use caching
        ❌ CPU-intensive operations - Workers have CPU time limits

        You can have normal conversations, but your specialty is code review.
        When users share code, analyze it thoroughly for Workers compatibility.

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