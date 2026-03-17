/**
 * Class & Engine Introspection Tools (Tier 3 — Phase 3)
 *
 * Query Godot's built-in class database and search the Asset Library.
 *
 * Tools:
 *   - get_class_info        (GDScript)  Query ClassDB for class metadata
 *   - search_asset_library  (TS/HTTP)   Search Godot Asset Library REST API
 */

import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString, optionalString, optionalNumber } from '../utils/validation.js';

export function registerIntrospectionTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    getClassInfo(ctx),
    searchAssetLibrary(ctx),
  ]);
}

// ─── get_class_info ─────────────────────────────────────────────────────────

function getClassInfo(ctx: ServerContext): ToolDefinition {
  return {
    name: 'get_class_info',
    description: 'Query Godot\'s ClassDB for detailed information about any built-in class. Returns properties, methods, signals, constants, and inheritance chain. Useful for understanding node capabilities before adding or configuring them.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to a Godot project (needed to run Godot headless)' },
        class_name: { type: 'string', description: 'Godot class to query (e.g., "Node2D", "CharacterBody3D", "AnimationPlayer")' },
        include_inherited: { type: 'boolean', description: 'Include inherited members from parent classes (default: false)' },
        section: {
          type: 'string',
          description: 'Return only a specific section: "properties", "methods", "signals", "constants", "all" (default: "all")',
          enum: ['properties', 'methods', 'signals', 'constants', 'all'],
        },
      },
      required: ['project_path', 'class_name'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('className', 'class_name'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const className = args.className as string;
      const includeInherited = args.includeInherited === true;
      const section = (args.section as string) || 'all';

      try {
        const result = await ctx.executeOperation('get_class_info', {
          class_name: className,
          include_inherited: includeInherited,
          section,
        }, projectDir);

        // Parse the JSON output from GDScript
        const stdout = result.stdout.trim();
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) {
          return ctx.createErrorResponse(
            `Failed to get class info for '${className}'`,
            ['Check the class name is correct (case-sensitive)', `stderr: ${result.stderr}`]
          );
        }

        const data = JSON.parse(stdout.substring(jsonStart));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (err: any) {
        return ctx.createErrorResponse(
          `Failed to query ClassDB: ${err.message}`,
          [
            'Ensure Godot is installed and accessible',
            'Check the class name is a valid Godot built-in class',
          ]
        );
      }
    },
  };
}

// ─── search_asset_library ───────────────────────────────────────────────────

const ASSET_LIBRARY_API = 'https://godotengine.org/asset-library/api';

function searchAssetLibrary(ctx: ServerContext): ToolDefinition {
  return {
    name: 'search_asset_library',
    description: 'Search the official Godot Asset Library for plugins, tools, demos, and templates. Returns metadata including title, author, description, download URL, and rating.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (e.g., "state machine", "inventory", "shader")' },
        category: { type: 'string', description: 'Filter by category ID (optional)' },
        godot_version: { type: 'string', description: 'Filter by Godot version (e.g., "4.2", "4.3")' },
        sort: {
          type: 'string',
          description: 'Sort order',
          enum: ['rating', 'cost', 'name', 'updated'],
        },
        page: { type: 'number', description: 'Page number (default: 0)' },
        max_results: { type: 'number', description: 'Maximum results to return (default: 10, max: 30)' },
      },
      required: ['query'],
    },
    timeout: 15000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const query = args.query as string;
      if (!query || query.trim() === '') {
        return ctx.createErrorResponse('Missing required parameter: query');
      }

      const sort = args.sort || 'rating';
      const page = args.page || 0;
      const maxResults = Math.min(args.maxResults || 10, 30);

      // Build URL
      const params = new URLSearchParams();
      params.set('filter', query);
      params.set('sort', sort);
      params.set('page', String(page));
      if (args.godotVersion) {
        params.set('godot_version', args.godotVersion);
      }
      if (args.category) {
        params.set('category', args.category);
      }

      const url = `${ASSET_LIBRARY_API}/asset?${params.toString()}`;

      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(12000),
        });

        if (!response.ok) {
          return ctx.createErrorResponse(
            `Asset Library API returned ${response.status}: ${response.statusText}`,
            ['The Godot Asset Library may be temporarily unavailable', 'Try again later']
          );
        }

        const data = await response.json() as any;
        const results = (data.result || []).slice(0, maxResults);

        const assets = results.map((asset: any) => ({
          asset_id: asset.asset_id,
          title: asset.title,
          author: asset.author,
          author_id: asset.author_id,
          category: asset.category,
          godot_version: asset.godot_version,
          cost: asset.cost,
          description: asset.description
            ? asset.description.substring(0, 300) + (asset.description.length > 300 ? '...' : '')
            : '',
          support_level: asset.support_level,
          modify_date: asset.modify_date,
          icon_url: asset.icon_url,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              query,
              total_results: data.total_items || results.length,
              page,
              page_count: data.pages || 1,
              results: assets,
            }, null, 2),
          }],
        };
      } catch (err: any) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          return ctx.createErrorResponse(
            'Asset Library request timed out',
            ['The Godot Asset Library may be slow or unreachable', 'Try again later']
          );
        }
        return ctx.createErrorResponse(
          `Failed to search Asset Library: ${err.message}`,
          ['Check your internet connection', 'The Asset Library API may be temporarily down']
        );
      }
    },
  };
}
