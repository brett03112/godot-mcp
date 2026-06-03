/**
 * Tool Registry for the Godot MCP server
 *
 * Provides a registration-based pattern for MCP tools, replacing the
 * monolithic switch statement. New tools register themselves via
 * registerTool() and the registry handles dispatch.
 *
 * Includes operation logging and per-tool timeout enforcement (Tier 3).
 */

import { ToolDefinition, ToolResponse } from './types.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OperationLogger } from './utils/logger.js';
import { createTimeoutError, structuredErrorToResponse, ErrorCategory } from './utils/errors.js';

const DEFAULT_TIMEOUT_MS = 30000;

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private logger: OperationLogger;

  constructor(logDir?: string) {
    this.logger = new OperationLogger(logDir);
  }

  /**
   * Register a tool with the registry
   * @throws Error if a tool with the same name is already registered
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools at once
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a tool definition by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tool definitions (for ListToolsRequestSchema)
   * Returns them in the format expected by the MCP SDK
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, any>; required?: string[] };
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Dispatch a tool call to its registered handler.
   * Wraps execution with logging and optional timeout enforcement.
   * @throws McpError if the tool is not found
   */
  async dispatch(name: string, args: any): Promise<ToolResponse> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }

    const opId = this.logger.logStart(name, args || {});
    const timeoutMs = tool.timeout ?? DEFAULT_TIMEOUT_MS;
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      const timeoutPromise = new Promise<ToolResponse>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(createTimeoutError(name, timeoutMs)), timeoutMs);
        timeoutHandle.unref?.();
      });

      const result = await Promise.race([
        tool.handler(args),
        timeoutPromise,
      ]);

      const isError = result.isError === true;
      this.logger.logEnd(opId, isError ? 'error' : 'success',
        isError ? { message: 'Tool returned error response' } : undefined);
      return result;
    } catch (err: any) {
      // Handle timeout (StructuredError) vs unexpected errors
      if (err && err.category && err.code) {
        this.logger.logEnd(opId, 'error', {
          category: err.category as ErrorCategory,
          message: err.message,
        });
        return structuredErrorToResponse(err);
      }
      this.logger.logEnd(opId, 'error', { message: err?.message || 'Unknown error' });
      throw err;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Get the operation logger for session log access
   */
  getLogger(): OperationLogger {
    return this.logger;
  }

  /**
   * Get the number of registered tools
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
