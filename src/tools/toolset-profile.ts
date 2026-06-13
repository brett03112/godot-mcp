/**
 * Read-only toolset profile tools for Phase 5.0.
 */

import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';
import {
  ActiveToolProfile,
  ToolDefinitionLike,
  recommendToolsetProfile,
  toolsetStatusPayload,
} from '../toolsets.js';

export interface ToolsetProfileProvider {
  getActiveProfile: () => ActiveToolProfile;
  getAllToolDefinitions: () => ToolDefinitionLike[];
}

export function registerToolsetProfileTools(registry: ToolRegistry, ctx: ServerContext, provider: ToolsetProfileProvider): void {
  registry.registerAll([
    toolsetStatus(ctx, provider),
    recommendToolsetProfileTool(ctx, provider),
  ]);
}

function toolsetStatus(ctx: ServerContext, provider: ToolsetProfileProvider): ToolDefinition {
  return {
    name: 'toolset_status',
    description: 'Report active Godot MCP toolsets, explicit tools, hidden tool count, loaded tool count, config sources, and disabled-tool remediation.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Optional project path used by callers for context; active filtering is resolved at MCP startup.',
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
      ctx.normalizeParameters(rawArgs || {});
      return jsonResponse(toolsetStatusPayload({
        profile: provider.getActiveProfile(),
        allToolDefinitions: provider.getAllToolDefinitions(),
      }));
    },
  };
}

function recommendToolsetProfileTool(ctx: ServerContext, provider: ToolsetProfileProvider): ToolDefinition {
  return {
    name: 'recommend_toolset_profile',
    description: 'Recommend compact toolsets, individual tools, resources, env snippets, and verification commands for a Godot feature request.',
    inputSchema: {
      type: 'object',
      properties: {
        feature_request: { type: 'string', description: 'Feature, debugging, playtest, or release goal for this session.' },
        project_facts: { type: 'object', description: 'Optional facts such as has_tests or has_live_editor.' },
        include_optional: { type: 'boolean', description: 'Include optional tools in the recommendation (default true).' },
      },
      required: ['feature_request'],
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
      const featureRequest = args.featureRequest || args.feature_request;
      if (!featureRequest || typeof featureRequest !== 'string') {
        return failure('feature_request is required');
      }
      return jsonResponse(recommendToolsetProfile(args, {
        allToolDefinitions: provider.getAllToolDefinitions(),
      }));
    },
  };
}

function failure(reason: string): ToolResponse {
  return jsonResponse({
    status: 'failed',
    reason,
    recommendations: [reason],
  }, true);
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
