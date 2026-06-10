import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';
import {
  LiveConfigLoadResult,
  liveConfigStatusPayload,
} from '../live/config.js';

export type LiveConfigProvider = {
  getConfigStatus: (projectPath?: string) => LiveConfigLoadResult;
};

export function registerLiveConfigTools(registry: ToolRegistry, ctx: ServerContext, provider: LiveConfigProvider): void {
  registry.register(liveConfigStatus(ctx, provider));
}

function liveConfigStatus(ctx: ServerContext, provider: LiveConfigProvider): ToolDefinition {
  return {
    name: 'live_config_status',
    description: 'Report effective Godot MCP live bridge configuration, validation, sources, and remediation with secrets redacted.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Optional project path used to load .godot-mcp/config.json overlays.',
        },
      },
    },
    metadata: {
      toolset: 'core',
      aliases: [],
      risk: 'low',
      mutates: false,
      requires_live: false,
      requires_display: false,
    },
    handler: async (rawArgs) => {
      const args = ctx.normalizeParameters(rawArgs || {});
      const result = provider.getConfigStatus(args.projectPath || args.project_path);
      return jsonResponse(liveConfigStatusPayload(result), result.status === 'failed');
    },
  };
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
