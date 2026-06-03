/**
 * Resource workflow tools for Phase 1.4.
 */

import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

type ProjectFileEntry = {
  absolutePath: string;
  relativePath: string;
  resourcePath: string;
  extension: string;
  size: number;
};

const DEFAULT_MAX_RESULTS = 100;
const RESOURCE_EXTENSIONS = new Set(['.tres', '.res', '.tscn', '.material', '.mesh', '.scn']);
const TEXT_RESOURCE_EXTENSIONS = new Set(['.tres', '.tscn', '.material']);
const DEFAULT_IGNORED_DIRS = new Set(['.godot', '.git', 'node_modules', '.import']);

export function registerResourceWorkflowTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    resourceSearch(ctx),
    resourceGetInfo(ctx),
    resourceAssign(ctx),
    resourcePreviewMetadata(ctx),
    createGradientTexture(ctx),
    createNoiseTexture(ctx),
    createCurveResource(ctx),
    setCurvePoints(ctx),
    createEnvironmentResource(ctx),
    createPhysicsMaterial(ctx),
    autofitPhysicsShape(ctx),
    resourceConvertFormat(ctx),
  ]);
}

function resourceSearch(ctx: ServerContext): ToolDefinition {
  return {
    name: 'resource_search',
    description: 'Search project resources by glob, type, UID, referenced path, and text metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        glob: { type: 'string' },
        resource_type: { type: 'string' },
        uid: { type: 'string' },
        references: { type: 'string' },
        text_query: { type: 'string' },
        scan_paths: { type: 'array', items: { type: 'string' } },
        max_results: { type: 'number' },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      try {
        const entries = (await walkProject(target.projectRoot, args.scanPaths))
          .filter((entry) => RESOURCE_EXTENSIONS.has(entry.extension));
        const globMatcher = args.glob ? globToRegExp(args.glob) : null;
        const maxResults = positiveInteger(args.maxResults, DEFAULT_MAX_RESULTS);
        const matches: any[] = [];

        for (const entry of entries) {
          if (globMatcher && !globMatcher.test(entry.relativePath)) continue;
          const metadata = await readResourceMetadata(entry);
          const reasons: string[] = [];

          if (args.resourceType) {
            if (metadata.type !== args.resourceType) continue;
            reasons.push('resource_type');
          }
          if (args.uid) {
            if (metadata.uid !== args.uid) continue;
            reasons.push('uid');
          }
          if (args.references) {
            const ref = normalizeResourcePath(args.references);
            if (!ref || !metadata.references.includes(ref)) continue;
            reasons.push('references');
          }
          if (args.textQuery) {
            if (!metadata.text || !metadata.text.includes(args.textQuery)) continue;
            reasons.push('text_query');
          }

          matches.push({
            path: entry.resourcePath,
            relative_path: entry.relativePath,
            extension: entry.extension,
            size: entry.size,
            type: metadata.type,
            uid: metadata.uid,
            references: metadata.references,
            reasons: reasons.length ? reasons : ['resource'],
          });

          if (matches.length >= maxResults) break;
        }

        return jsonResponse({
          status: 'success',
          count: matches.length,
          truncated: matches.length >= maxResults,
          matches,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function resourceGetInfo(ctx: ServerContext): ToolDefinition {
  return {
    name: 'resource_get_info',
    description: 'Read lightweight metadata and text-resource properties for a project resource.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        resource_path: { type: 'string' },
        include_properties: { type: 'boolean' },
      },
      required: ['project_path', 'resource_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const resourcePath = normalizeResourcePath(args.resourcePath);
      if (!resourcePath) return failure('resource_path must be a project resource path');
      const absolutePath = resolveProjectPath(target.projectRoot, resourcePath);
      if (!absolutePath || !existsSync(absolutePath)) return failure(`Resource not found: ${resourcePath}`);

      try {
        const entry = await fileEntry(target.projectRoot, absolutePath);
        const metadata = await readResourceMetadata(entry);
        return jsonResponse({
          status: 'success',
          path: entry.resourcePath,
          relative_path: entry.relativePath,
          extension: entry.extension,
          size: entry.size,
          type: metadata.type,
          uid: metadata.uid,
          references: metadata.references,
          properties: args.includeProperties === false ? undefined : metadata.properties,
          property_count: Object.keys(metadata.properties).length,
          binary: metadata.text === null,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function resourcePreviewMetadata(ctx: ServerContext): ToolDefinition {
  return {
    name: 'resource_preview_metadata',
    description: 'Preview concise resource metadata suitable for planning without loading the resource in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        resource_path: { type: 'string' },
      },
      required: ['project_path', 'resource_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const resourcePath = normalizeResourcePath(args.resourcePath);
      if (!resourcePath) return failure('resource_path must be a project resource path');
      const absolutePath = resolveProjectPath(target.projectRoot, resourcePath);
      if (!absolutePath || !existsSync(absolutePath)) return failure(`Resource not found: ${resourcePath}`);

      try {
        const entry = await fileEntry(target.projectRoot, absolutePath);
        const metadata = await readResourceMetadata(entry);
        return jsonResponse({
          status: 'success',
          path: entry.resourcePath,
          type: metadata.type,
          uid: metadata.uid,
          extension: entry.extension,
          size: entry.size,
          reference_count: metadata.references.length,
          property_names: Object.keys(metadata.properties),
          previewable: ['GradientTexture1D', 'GradientTexture2D', 'NoiseTexture2D', 'Curve', 'Environment', 'PhysicsMaterial'].includes(metadata.type || ''),
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function resourceAssign(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'resource_assign',
    description: 'Assign an existing resource to a node property in a scene and save the scene through Godot.',
    operation: 'resource_assign',
    required: ['project_path', 'scene_path', 'node_path', 'property_name', 'resource_path'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      node_path: { type: 'string' },
      property_name: { type: 'string' },
      resource_path: { type: 'string' },
      validate_after: { type: 'boolean' },
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      property_name: args.propertyName,
      resource_path: args.resourcePath,
      validate_after: args.validateAfter ?? true,
    }),
  });
}

function createGradientTexture(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_gradient_texture',
    description: 'Create a GradientTexture1D or GradientTexture2D resource using Godot ResourceSaver.',
    operation: 'resource_create_gradient_texture',
    required: ['project_path', 'output_path'],
    properties: {
      project_path: { type: 'string' },
      output_path: { type: 'string' },
      dimension: { type: 'string', enum: ['1d', '2d'] },
      width: { type: 'number' },
      height: { type: 'number' },
      fill: { type: 'string', enum: ['linear', 'radial', 'square', 'conic'] },
      points: { type: 'array', items: { type: 'object' } },
    },
    mapParams: (args) => ({
      output_path: args.outputPath,
      dimension: args.dimension || '1d',
      width: args.width ?? 256,
      height: args.height ?? 256,
      fill: args.fill || 'linear',
      points: args.points || [],
    }),
  });
}

function createNoiseTexture(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_noise_texture',
    description: 'Create a NoiseTexture2D resource backed by FastNoiseLite using Godot ResourceSaver.',
    operation: 'resource_create_noise_texture',
    required: ['project_path', 'output_path'],
    properties: {
      project_path: { type: 'string' },
      output_path: { type: 'string' },
      width: { type: 'number' },
      height: { type: 'number' },
      seed: { type: 'number' },
      frequency: { type: 'number' },
      noise_type: { type: 'number' },
      seamless: { type: 'boolean' },
      as_normal_map: { type: 'boolean' },
    },
    mapParams: (args) => ({
      output_path: args.outputPath,
      width: args.width ?? 256,
      height: args.height ?? 256,
      seed: args.seed ?? 1337,
      frequency: args.frequency ?? 0.02,
      noise_type: args.noiseType ?? 1,
      seamless: args.seamless ?? false,
      as_normal_map: args.asNormalMap ?? false,
    }),
  });
}

function createCurveResource(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_curve_resource',
    description: 'Create a Curve resource with optional initial points using Godot ResourceSaver.',
    operation: 'resource_create_curve',
    required: ['project_path', 'output_path'],
    properties: {
      project_path: { type: 'string' },
      output_path: { type: 'string' },
      min_value: { type: 'number' },
      max_value: { type: 'number' },
      bake_resolution: { type: 'number' },
      points: { type: 'array', items: { type: 'object' } },
    },
    mapParams: (args) => ({
      output_path: args.outputPath,
      min_value: args.minValue ?? 0,
      max_value: args.maxValue ?? 1,
      bake_resolution: args.bakeResolution ?? 100,
      points: args.points || [],
    }),
  });
}

function setCurvePoints(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'set_curve_points',
    description: 'Replace the points in an existing Curve resource and save it.',
    operation: 'resource_set_curve_points',
    required: ['project_path', 'resource_path', 'points'],
    properties: {
      project_path: { type: 'string' },
      resource_path: { type: 'string' },
      points: { type: 'array', items: { type: 'object' } },
    },
    mapParams: (args) => ({
      resource_path: args.resourcePath,
      points: args.points || [],
    }),
  });
}

function createEnvironmentResource(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_environment_resource',
    description: 'Create an Environment resource with common background and ambient-light settings.',
    operation: 'resource_create_environment',
    required: ['project_path', 'output_path'],
    properties: {
      project_path: { type: 'string' },
      output_path: { type: 'string' },
      background_mode: { type: 'number' },
      background_color: {},
      ambient_light_color: {},
      ambient_light_energy: { type: 'number' },
      glow_enabled: { type: 'boolean' },
      ssao_enabled: { type: 'boolean' },
    },
    mapParams: (args) => ({
      output_path: args.outputPath,
      background_mode: args.backgroundMode ?? 1,
      background_color: args.backgroundColor ?? [0.05, 0.07, 0.1, 1],
      ambient_light_color: args.ambientLightColor ?? [1, 1, 1, 1],
      ambient_light_energy: args.ambientLightEnergy ?? 0.5,
      glow_enabled: args.glowEnabled ?? false,
      ssao_enabled: args.ssaoEnabled ?? false,
    }),
  });
}

function createPhysicsMaterial(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_physics_material',
    description: 'Create a PhysicsMaterial resource using Godot ResourceSaver.',
    operation: 'resource_create_physics_material',
    required: ['project_path', 'output_path'],
    properties: {
      project_path: { type: 'string' },
      output_path: { type: 'string' },
      friction: { type: 'number' },
      rough: { type: 'boolean' },
      bounce: { type: 'number' },
      absorbent: { type: 'boolean' },
    },
    mapParams: (args) => ({
      output_path: args.outputPath,
      friction: args.friction ?? 1.0,
      rough: args.rough ?? false,
      bounce: args.bounce ?? 0.0,
      absorbent: args.absorbent ?? false,
    }),
  });
}

function autofitPhysicsShape(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'autofit_physics_shape',
    description: 'Create or update a CollisionShape2D/3D on a physics body using a supplied or inferred size.',
    operation: 'resource_autofit_physics_shape',
    required: ['project_path', 'scene_path', 'body_path'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      body_path: { type: 'string' },
      visual_node_path: { type: 'string' },
      shape_name: { type: 'string' },
      shape_type: { type: 'string' },
      shape_size: {},
      shape_radius: { type: 'number' },
      shape_height: { type: 'number' },
      replace_existing: { type: 'boolean' },
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      body_path: args.bodyPath,
      visual_node_path: args.visualNodePath || '',
      shape_name: args.shapeName || 'CollisionShape',
      shape_type: args.shapeType || 'rectangle',
      shape_size: args.shapeSize,
      shape_radius: args.shapeRadius ?? 32,
      shape_height: args.shapeHeight ?? 64,
      replace_existing: args.replaceExisting ?? true,
    }),
  });
}

function resourceConvertFormat(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'resource_convert_format',
    description: 'Safely load a resource and save it to .tres or .res where Godot ResourceSaver supports it.',
    operation: 'resource_convert_format',
    required: ['project_path', 'resource_path', 'output_path'],
    properties: {
      project_path: { type: 'string' },
      resource_path: { type: 'string' },
      output_path: { type: 'string' },
      overwrite: { type: 'boolean' },
    },
    mapParams: (args) => ({
      resource_path: args.resourcePath,
      output_path: args.outputPath,
      overwrite: args.overwrite ?? false,
    }),
  });
}

function operationTool(ctx: ServerContext, config: {
  name: string;
  description: string;
  operation: string;
  properties: Record<string, any>;
  required: string[];
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
        const camel = snakeToCamel(required);
        if (required === 'project_path') continue;
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
        return jsonResponse({ status: 'success', ...parsed });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
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
    nodePath: args.nodePath ?? args.node_path,
    bodyPath: args.bodyPath ?? args.body_path,
    visualNodePath: args.visualNodePath ?? args.visual_node_path,
    propertyName: args.propertyName ?? args.property_name,
    resourcePath: args.resourcePath ?? args.resource_path,
    outputPath: args.outputPath ?? args.output_path,
    includeProperties: args.includeProperties ?? args.include_properties,
    resourceType: args.resourceType ?? args.resource_type,
    textQuery: args.textQuery ?? args.text_query,
    scanPaths: args.scanPaths ?? args.scan_paths,
    maxResults: args.maxResults ?? args.max_results,
    validateAfter: args.validateAfter ?? args.validate_after,
    noiseType: args.noiseType ?? args.noise_type,
    asNormalMap: args.asNormalMap ?? args.as_normal_map,
    minValue: args.minValue ?? args.min_value,
    maxValue: args.maxValue ?? args.max_value,
    bakeResolution: args.bakeResolution ?? args.bake_resolution,
    backgroundMode: args.backgroundMode ?? args.background_mode,
    backgroundColor: args.backgroundColor ?? args.background_color,
    ambientLightColor: args.ambientLightColor ?? args.ambient_light_color,
    ambientLightEnergy: args.ambientLightEnergy ?? args.ambient_light_energy,
    glowEnabled: args.glowEnabled ?? args.glow_enabled,
    ssaoEnabled: args.ssaoEnabled ?? args.ssao_enabled,
    shapeName: args.shapeName ?? args.shape_name,
    shapeType: args.shapeType ?? args.shape_type,
    shapeSize: args.shapeSize ?? args.shape_size,
    shapeRadius: args.shapeRadius ?? args.shape_radius,
    shapeHeight: args.shapeHeight ?? args.shape_height,
    replaceExisting: args.replaceExisting ?? args.replace_existing,
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

async function walkProject(projectRoot: string, scanPaths?: string[]): Promise<ProjectFileEntry[]> {
  const roots = Array.isArray(scanPaths) && scanPaths.length > 0 ? scanPaths : ['.'];
  const entries: ProjectFileEntry[] = [];
  for (const scanPath of roots) {
    const absolute = resolveProjectPath(projectRoot, scanPath);
    if (absolute && existsSync(absolute)) {
      await walkPath(projectRoot, absolute, entries);
    }
  }
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}

async function walkPath(projectRoot: string, currentPath: string, entries: ProjectFileEntry[]): Promise<void> {
  const { readdir } = await import('fs/promises');
  const currentStat = await stat(currentPath);
  if (currentStat.isDirectory()) {
    const dirName = currentPath === projectRoot ? '' : currentPath.split(/[\\/]/).pop() || '';
    if (dirName && DEFAULT_IGNORED_DIRS.has(dirName)) return;
    const children = await readdir(currentPath, { withFileTypes: true });
    for (const child of children) {
      await walkPath(projectRoot, join(currentPath, child.name), entries);
    }
    return;
  }
  if (!currentStat.isFile()) return;
  const entry = await fileEntry(projectRoot, currentPath);
  if (entry.relativePath) entries.push(entry);
}

async function fileEntry(projectRoot: string, absolutePath: string): Promise<ProjectFileEntry> {
  const currentStat = await stat(absolutePath);
  const relativePath = normalizeRelative(projectRoot, absolutePath) || '';
  return {
    absolutePath,
    relativePath,
    resourcePath: relativePath === 'project.godot' ? 'res://project.godot' : `res://${relativePath}`,
    extension: extname(relativePath),
    size: currentStat.size,
  };
}

function resolveProjectPath(projectRoot: string, candidate: string): string | null {
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

async function readResourceMetadata(entry: ProjectFileEntry): Promise<{
  type: string | null;
  uid: string | null;
  references: string[];
  properties: Record<string, string>;
  text: string | null;
}> {
  if (!TEXT_RESOURCE_EXTENSIONS.has(entry.extension)) {
    return { type: null, uid: null, references: [], properties: {}, text: null };
  }
  const text = await readFile(entry.absolutePath, 'utf8');
  return {
    type: detectResourceType(text),
    uid: detectEmbeddedUid(text),
    references: extractResourceDependencies(text),
    properties: parseResourceProperties(text),
    text,
  };
}

function detectResourceType(content: string): string | null {
  const match = content.match(/^\[(?:gd_resource|gd_scene)\b[^\]]*\btype="([^"]+)"/m);
  if (match) return match[1];
  if (/^\[gd_scene\b/m.test(content)) return 'PackedScene';
  return null;
}

function detectEmbeddedUid(content: string): string | null {
  return content.match(/^\[(?:gd_resource|gd_scene)\b[^\]]*\buid="([^"]+)"/m)?.[1] || null;
}

function extractResourceDependencies(content: string): string[] {
  const dependencies = new Set<string>();
  const pathRegex = /["'](res:\/\/[^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(content)) !== null) {
    dependencies.add(match[1]);
  }
  return Array.from(dependencies);
}

function parseResourceProperties(content: string): Record<string, string> {
  const properties: Record<string, string> = {};
  const resourceIndex = content.search(/^\[resource\]\s*$/m);
  if (resourceIndex < 0) return properties;
  const lines = content.slice(resourceIndex).split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (line.startsWith('[')) break;
    const match = line.match(/^([^=\s][^=]*?)=(.*)$/);
    if (match) properties[match[1].trim()] = match[2].trim();
  }
  return properties;
}

function normalizeResourcePath(value: string | undefined): string | null {
  if (!value || value.startsWith('uid://') || value.includes('..')) return null;
  return value.startsWith('res://') ? value : `res://${value.replace(/\\/g, '/')}`;
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  let out = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    const afterNext = normalized[index + 2];
    if (char === '*' && next === '*' && afterNext === '/') {
      out += '(?:.*/)?';
      index += 2;
    } else if (char === '*' && next === '*') {
      out += '.*';
      index += 1;
    } else if (char === '*') {
      out += '[^/]*';
    } else if (char === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(char);
    }
  }
  out += '$';
  return new RegExp(out);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function positiveInteger(value: any, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
