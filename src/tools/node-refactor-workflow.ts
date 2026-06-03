/**
 * Scene search and node refactor helpers for Phase 1.8.
 */

import { existsSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

export function registerNodeRefactorWorkflowTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    nodeFind(ctx),
    nodeRename(ctx),
    nodeMove(ctx),
    nodeAddToGroup(ctx),
    nodeRemoveFromGroup(ctx),
    nodeReplaceType(ctx),
    nodeBulkPropertySet(ctx),
    sceneFindReferences(ctx),
    sceneDependencyReport(ctx),
  ]);
}

function nodeFind(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'node_find',
    description: 'Find nodes across one or more saved scenes by name, type, group, script, or property filters.',
    operation: 'node_find',
    required: ['project_path'],
    properties: searchProperties({
      name: { type: 'string' },
      type: { type: 'string' },
      group_name: { type: 'string' },
      script_path: { type: 'string' },
      property_name: { type: 'string' },
      property_value: {},
      property_filters: { type: 'object' },
      include_properties: { type: 'boolean' },
      include_connections: { type: 'boolean' },
      max_results: { type: 'number' },
    }),
    invalidateScene: false,
    mapParams: (args) => ({
      scene_path: args.scenePath,
      scene_paths: args.scenePaths,
      scan_paths: args.scanPaths,
      name: args.name,
      type: args.type,
      group_name: args.groupName,
      script_path: args.scriptPath,
      property_name: args.propertyName,
      property_value: args.propertyValue,
      property_filters: args.propertyFilters,
      include_properties: args.includeProperties ?? false,
      include_connections: args.includeConnections ?? false,
      max_results: args.maxResults ?? 100,
    }),
  });
}

function nodeRename(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'node_rename',
    description: 'Rename a node in a saved scene and report updated connection/reference paths where possible.',
    operation: 'node_rename',
    required: ['project_path', 'scene_path', 'node_path', 'new_name'],
    properties: nodeSceneProperties({
      new_name: { type: 'string' },
      update_references: { type: 'boolean' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      new_name: args.newName,
      update_references: args.updateReferences ?? true,
    }),
  });
}

function nodeMove(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'node_move',
    description: 'Move a node to a different parent in a saved scene, preserving global transforms and reference paths where possible.',
    operation: 'node_move',
    required: ['project_path', 'scene_path', 'node_path', 'new_parent_path'],
    properties: nodeSceneProperties({
      new_parent_path: { type: 'string' },
      keep_global_transform: { type: 'boolean' },
      update_references: { type: 'boolean' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      new_parent_path: args.newParentPath,
      keep_global_transform: args.keepGlobalTransform ?? true,
      update_references: args.updateReferences ?? true,
    }),
  });
}

function nodeAddToGroup(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'node_add_to_group',
    description: 'Add a node to a group in a saved scene. Persistent groups are serialized into the PackedScene.',
    operation: 'node_add_to_group',
    required: ['project_path', 'scene_path', 'node_path', 'group_name'],
    properties: nodeSceneProperties({
      group_name: { type: 'string' },
      persistent: { type: 'boolean' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      group_name: args.groupName,
      persistent: args.persistent ?? true,
    }),
  });
}

function nodeRemoveFromGroup(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'node_remove_from_group',
    description: 'Remove a node from a group in a saved scene.',
    operation: 'node_remove_from_group',
    required: ['project_path', 'scene_path', 'node_path', 'group_name'],
    properties: nodeSceneProperties({
      group_name: { type: 'string' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      group_name: args.groupName,
    }),
  });
}

function nodeReplaceType(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'node_replace_type',
    description: 'Replace a node with a new Godot class while preserving name, children, groups, and selected common properties.',
    operation: 'node_replace_type',
    required: ['project_path', 'scene_path', 'node_path', 'new_type'],
    properties: nodeSceneProperties({
      new_type: { type: 'string' },
      preserve_name: { type: 'boolean' },
      preserve_children: { type: 'boolean' },
      preserve_groups: { type: 'boolean' },
      preserve_script: { type: 'boolean' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      new_type: args.newType,
      preserve_name: args.preserveName ?? true,
      preserve_children: args.preserveChildren ?? true,
      preserve_groups: args.preserveGroups ?? true,
      preserve_script: args.preserveScript ?? false,
    }),
  });
}

function nodeBulkPropertySet(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'node_bulk_property_set',
    description: 'Set one property on multiple nodes in a saved scene.',
    operation: 'node_bulk_property_set',
    required: ['project_path', 'scene_path', 'nodes', 'property_name', 'property_value'],
    properties: sceneProperties({
      nodes: { type: 'array', items: { type: 'string' } },
      property_name: { type: 'string' },
      property_value: {},
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      nodes: args.nodes,
      property_name: args.propertyName,
      property_value: args.propertyValue,
    }),
  });
}

function sceneFindReferences(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'scene_find_references',
    description: 'Find scene-local references to a node path across connections and NodePath-like properties.',
    operation: 'scene_find_references',
    required: ['project_path', 'scene_path', 'node_path'],
    properties: nodeSceneProperties({
      include_connections: { type: 'boolean' },
      include_properties: { type: 'boolean' },
    }),
    invalidateScene: false,
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      include_connections: args.includeConnections ?? true,
      include_properties: args.includeProperties ?? true,
    }),
  });
}

function sceneDependencyReport(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'scene_dependency_report',
    description: 'Report scene nodes, scripts, instanced scenes, resources, and connection counts across saved scenes.',
    operation: 'scene_dependency_report',
    required: ['project_path'],
    properties: searchProperties({
      include_scripts: { type: 'boolean' },
      include_dependencies: { type: 'boolean' },
      max_results: { type: 'number' },
    }),
    invalidateScene: false,
    mapParams: (args) => ({
      scene_path: args.scenePath,
      scene_paths: args.scenePaths,
      scan_paths: args.scanPaths,
      include_scripts: args.includeScripts ?? true,
      include_dependencies: args.includeDependencies ?? true,
      max_results: args.maxResults ?? 100,
    }),
  });
}

function operationTool(ctx: ServerContext, config: {
  name: string;
  description: string;
  operation: string;
  properties: Record<string, any>;
  required: string[];
  invalidateScene?: boolean;
  mapParams: (args: any) => Record<string, any>;
}): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: {
      type: 'object',
      properties: config.properties,
      required: config.required,
    },
    timeout: 60000,
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      for (const required of config.required) {
        if (required === 'project_path') continue;
        const camel = snakeToCamel(required);
        if (args[camel] === undefined || args[camel] === null || args[camel] === '') {
          return failure(`${required} is required`);
        }
      }

      try {
        const params = config.mapParams(args);
        const result = await ctx.executeOperation(config.operation, params, target.projectRoot);
        const parsed = parseGodotJson(result.stdout);
        if (!parsed) {
          return jsonResponse({
            status: 'failed',
            reason: result.stderr || result.stdout || `No JSON result returned by ${config.operation}`,
          }, true);
        }
        if (parsed.success === false) {
          return jsonResponse({ status: 'failed', ...parsed }, true);
        }
        if (config.invalidateScene !== false) {
          invalidateSceneCache(ctx, target.projectRoot, args.scenePath);
        }
        return jsonResponse({ status: 'success', ...parsed });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function searchProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    scene_path: { type: 'string' },
    scene_paths: { type: 'array', items: { type: 'string' } },
    scan_paths: { type: 'array', items: { type: 'string' } },
    ...extra,
  };
}

function sceneProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    scene_path: { type: 'string' },
    ...extra,
  };
}

function nodeSceneProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    scene_path: { type: 'string' },
    node_path: { type: 'string' },
    ...extra,
  };
}

function parseGodotJson(stdout: string): any | null {
  const lines = stdout.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    scenePath: args.scenePath ?? args.scene_path,
    scenePaths: args.scenePaths ?? args.scene_paths,
    scanPaths: args.scanPaths ?? args.scan_paths,
    nodePath: args.nodePath ?? args.node_path,
    newName: args.newName ?? args.new_name,
    newParentPath: args.newParentPath ?? args.new_parent_path,
    updateReferences: args.updateReferences ?? args.update_references,
    keepGlobalTransform: args.keepGlobalTransform ?? args.keep_global_transform,
    groupName: args.groupName ?? args.group_name,
    scriptPath: args.scriptPath ?? args.script_path,
    propertyName: args.propertyName ?? args.property_name,
    propertyValue: args.propertyValue ?? args.property_value,
    propertyFilters: args.propertyFilters ?? args.property_filters,
    includeProperties: args.includeProperties ?? args.include_properties,
    includeConnections: args.includeConnections ?? args.include_connections,
    includeDependencies: args.includeDependencies ?? args.include_dependencies,
    includeScripts: args.includeScripts ?? args.include_scripts,
    maxResults: args.maxResults ?? args.max_results,
    newType: args.newType ?? args.new_type,
    preserveName: args.preserveName ?? args.preserve_name,
    preserveChildren: args.preserveChildren ?? args.preserve_children,
    preserveGroups: args.preserveGroups ?? args.preserve_groups,
    preserveScript: args.preserveScript ?? args.preserve_script,
  };
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): { projectRoot: string } | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  if (!existsSync(resolve(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  }
  return { projectRoot };
}

function resolveProjectPath(projectRoot: string, candidate: string | undefined): string | null {
  if (!candidate || candidate.startsWith('uid://')) return null;
  const localPath = candidate.startsWith('res://') ? candidate.slice('res://'.length) : candidate;
  const absolutePath = isAbsolute(localPath) ? resolve(localPath) : resolve(projectRoot, localPath);
  return normalizeRelative(projectRoot, absolutePath) === null ? null : absolutePath;
}

function normalizeRelative(projectRoot: string, absolutePath: string): string | null {
  const rel = relative(projectRoot, absolutePath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    return absolutePath === projectRoot ? '.' : null;
  }
  return rel.replace(/\\/g, '/');
}

function invalidateSceneCache(ctx: ServerContext, projectRoot: string, scenePath: string | undefined): void {
  const absolute = resolveProjectPath(projectRoot, scenePath);
  if (absolute) ctx.invalidateTscnCache(absolute);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function failure(reason: string): ToolResponse {
  return jsonResponse({ status: 'failed', reason }, true);
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
