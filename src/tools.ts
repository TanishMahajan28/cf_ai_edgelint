/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  inputSchema: z.object({ city: z.string() })
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  }
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to cancel")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
});


/**
 * EdgeLint: Analyze code for Cloudflare Workers issues
 */
const analyzeWorkerCode = tool({
  description: "Analyze code for Cloudflare Workers compatibility issues, performance problems, and best practices. Use this when users share code to review.",
  inputSchema: z.object({
    code: z.string().describe("The code to analyze"),
    filename: z.string().optional().describe("Optional filename for context")
  }),
  execute: async ({ code, filename }) => {
    console.log(`Analyzing code${filename ? ` from ${filename}` : ''}...`);
    
    const issues: string[] = [];
    
    // Check for Node.js APIs
    const nodeAPIs = [
      'fs', 'path', 'crypto', 'os', 'process', 'child_process',
      'cluster', 'dns', 'http', 'https', 'net', 'tls', 'stream'
    ];
    
    nodeAPIs.forEach(api => {
      if (code.includes(`from '${api}'`) || code.includes(`require('${api}')`)) {
        issues.push(`❌ CRITICAL: Node.js '${api}' module detected - Not available in Workers`);
      }
    });
    
    // Check for blocking operations
    if (code.includes('.readFileSync') || code.includes('.writeFileSync')) {
      issues.push(`❌ CRITICAL: Synchronous file operations detected - Use async operations or KV/R2`);
    }
    
    // Check for setTimeout/setInterval
    if (code.includes('setTimeout') || code.includes('setInterval')) {
      issues.push(`⚠️ WARNING: setTimeout/setInterval detected - Consider Durable Objects Alarms or Cron Triggers`);
    }
    
    // Check for missing error handling
    if (code.includes('async') && !code.includes('try') && !code.includes('catch')) {
      issues.push(`⚠️ WARNING: Async operations without try-catch - Add error handling`);
    }
    
    // Check for proper Workers export
    if (!code.includes('export default')) {
      issues.push(`ℹ️ INFO: Missing 'export default' - Workers need a default export`);
    }
    
    // Check for fetch handler
    if (!code.includes('fetch(')) {
      issues.push(`ℹ️ INFO: No fetch handler detected - Workers need a fetch handler`);
    }
    
    if (issues.length === 0) {
      return `✅ Code looks good! No major issues detected.\n\nThis code appears to be Workers-compatible. Great job!`;
    }
    
    return `Found ${issues.length} issue(s):\n\n${issues.join('\n\n')}`;
  }
});

/**
 * Explain a specific Workers concept
 */
const explainWorkersConcept = tool({
  description: "Explain Cloudflare Workers concepts, constraints, or best practices",
  inputSchema: z.object({
    concept: z.string().describe("The concept to explain (e.g., 'CPU time limits', 'V8 isolates', 'KV vs R2')")
  }),
  execute: async ({ concept }) => {
    console.log(`Explaining concept: ${concept}`);
    
    // This is a simple implementation - the AI will handle the actual explanation
    return `Requesting explanation for: ${concept}`;
  }
});


/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  //EdgeLint tools (new ones)
  analyzeWorkerCode,
  explainWorkersConcept,

  // Original demo tools
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  }
};
