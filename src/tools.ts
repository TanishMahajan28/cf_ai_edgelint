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
    
    const issues: Array<{ severity: string; title: string; description: string; line?: number }> = [];
    
    // Check for Node.js APIs
    const nodeAPIs = [
      'fs', 'path', 'crypto', 'os', 'process', 'child_process',
      'cluster', 'dns', 'http', 'https', 'net', 'tls', 'stream',
      'buffer', 'events', 'util', 'url', 'querystring', 'zlib'
    ];
    
    nodeAPIs.forEach(api => {
      if (code.includes(`from '${api}'`) || code.includes(`from "${api}"`) || 
          code.includes(`require('${api}')`) || code.includes(`require("${api}")`)) {
        issues.push({
          severity: 'CRITICAL',
          title: `Node.js '${api}' module not available`,
          description: `Workers run in V8 isolates without Node.js APIs. Replace '${api}' with Workers-compatible alternatives.`
        });
      }
    });
    
    // Check for blocking operations
    const blockingOps = [
      { pattern: 'readFileSync', fix: 'Use KV.get() or R2 fetch with await' },
      { pattern: 'writeFileSync', fix: 'Use KV.put() or R2 put with await' },
      { pattern: 'execSync', fix: 'Not supported - rethink your architecture' },
      { pattern: 'readSync', fix: 'Use async operations with await' }
    ];
    
    blockingOps.forEach(({ pattern, fix }) => {
      if (code.includes(pattern)) {
        issues.push({
          severity: 'CRITICAL',
          title: `Synchronous operation: ${pattern}()`,
          description: `Blocking operations hurt edge performance. ${fix}`
        });
      }
    });
    
    // Check for setTimeout/setInterval
    if (code.includes('setTimeout') || code.includes('setInterval')) {
      issues.push({
        severity: 'WARNING',
        title: 'Timers not supported in Workers',
        description: 'setTimeout/setInterval won\'t work. Use Durable Objects Alarms for scheduled tasks, or Workflows for delayed execution.'
      });
    }
    
    // Check for global state
    if (code.match(/^(let|var|const)\s+\w+\s*=/m) && code.includes('export default')) {
      issues.push({
        severity: 'WARNING',
        title: 'Potential global state detected',
        description: 'Workers are stateless. Global variables reset between requests. Use Durable Objects or KV for persistence.'
      });
    }
    
    // Check for missing error handling
    const asyncFunctions = code.match(/async\s+\w+/g);
    if (asyncFunctions && !code.includes('try') && !code.includes('catch')) {
      issues.push({
        severity: 'WARNING',
        title: 'Missing error handling',
        description: 'Async operations should be wrapped in try-catch blocks to handle failures gracefully.'
      });
    }
    
    // Check for proper Workers export
    if (!code.includes('export default')) {
      issues.push({
        severity: 'ERROR',
        title: 'Missing default export',
        description: 'Workers require a default export with a fetch handler: export default { async fetch(request, env, ctx) {...} }'
      });
    }
    
    // Check for fetch handler
    if (!code.includes('fetch(') && !code.includes('fetch (')) {
      issues.push({
        severity: 'ERROR',
        title: 'No fetch handler found',
        description: 'Workers need a fetch() method to handle HTTP requests.'
      });
    }
    
    // Check for env parameter usage
    if (code.includes('fetch(request)') && !code.includes('fetch(request, env')) {
      issues.push({
        severity: 'INFO',
        title: 'Missing env parameter',
        description: 'Add env parameter to access bindings (KV, R2, D1, etc.): fetch(request, env, ctx)'
      });
    }
    
    // Check for Response usage
    if (code.includes('return ') && !code.includes('Response')) {
      issues.push({
        severity: 'INFO',
        title: 'Consider using Response objects',
        description: 'Return proper Response objects with status codes and headers for better HTTP handling.'
      });
    }
    
    // Check for waitUntil usage for background tasks
    if ((code.includes('await') || code.includes('fetch(')) && !code.includes('waitUntil')) {
      issues.push({
        severity: 'INFO',
        title: 'Consider using ctx.waitUntil()',
        description: 'For background tasks that can complete after responding, use ctx.waitUntil() to keep the Worker alive.'
      });
    }
    
    if (issues.length === 0) {
      return `✅ Excellent! No major issues detected.

  This code appears to be Workers-compatible and follows edge computing best practices. Great job! 🎉

  Some optional improvements you might consider:
  - Add comprehensive error handling
  - Implement caching strategies
  - Add request validation
  - Consider rate limiting`;
    }
    
    // Format issues by severity
    const critical = issues.filter(i => i.severity === 'CRITICAL');
    const errors = issues.filter(i => i.severity === 'ERROR');
    const warnings = issues.filter(i => i.severity === 'WARNING');
    const info = issues.filter(i => i.severity === 'INFO');
    
    let result = `Found ${issues.length} issue(s) in your code:\n\n`;
    
    if (critical.length > 0) {
      result += `🔴 CRITICAL ISSUES (${critical.length}):\n`;
      critical.forEach((issue, i) => {
        result += `\n${i + 1}. ${issue.title}\n   ${issue.description}\n`;
      });
      result += '\n';
    }
    
    if (errors.length > 0) {
      result += `🟠 ERRORS (${errors.length}):\n`;
      errors.forEach((issue, i) => {
        result += `\n${i + 1}. ${issue.title}\n   ${issue.description}\n`;
      });
      result += '\n';
    }
    
    if (warnings.length > 0) {
      result += `🟡 WARNINGS (${warnings.length}):\n`;
      warnings.forEach((issue, i) => {
        result += `\n${i + 1}. ${issue.title}\n   ${issue.description}\n`;
      });
      result += '\n';
    }
    
    if (info.length > 0) {
      result += `ℹ️ SUGGESTIONS (${info.length}):\n`;
      info.forEach((issue, i) => {
        result += `\n${i + 1}. ${issue.title}\n   ${issue.description}\n`;
      });
    }
    
    return result;
  }});


/**
 * Generate a fixed version of problematic code
 */
const generateFixedCode = tool({
  description: "Generate a corrected, Workers-compatible version of code with issues",
  inputSchema: z.object({
    originalCode: z.string().describe("The original code with issues"),
    issues: z.string().describe("Description of the issues found")
  }),
  execute: async ({ originalCode, issues }) => {
    console.log("Generating fixed code...");
    
    // The AI will handle the actual code generation
    // This tool just signals that we want a fix
    return `Please provide a corrected version of the code that addresses these issues: ${issues}`;
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
  generateFixedCode,
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
