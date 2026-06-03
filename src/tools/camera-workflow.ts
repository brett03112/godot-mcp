/**
 * Camera workflow tools for Phase 1.6.
 */

import { existsSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

export function registerCameraWorkflowTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    createCamera(ctx),
    configureCamera(ctx),
    setupCameraFollow2d(ctx),
    setCameraLimits2d(ctx),
    setCameraSmoothing2d(ctx),
    applyCameraPreset(ctx),
    listCameras(ctx),
    previewCameraBounds(ctx),
  ]);
}

function createCamera(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_camera',
    description: 'Create a Camera2D or Camera3D node in a scene and optionally make it current.',
    operation: 'camera_create',
    required: ['project_path', 'scene_path'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      parent_path: { type: 'string' },
      camera_name: { type: 'string' },
      camera_type: { type: 'string', enum: ['2d', '3d', 'Camera2D', 'Camera3D'] },
      make_current: { type: 'boolean' },
      enabled: { type: 'boolean' },
      position: {},
      rotation: {},
      zoom: {},
      offset: {},
      fov: { type: 'number' },
      size: { type: 'number' },
      projection: { type: 'string' },
      near: { type: 'number' },
      far: { type: 'number' },
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      parent_path: args.parentPath || '.',
      camera_name: args.cameraName || (normalizeCameraType(args.cameraType) === '3d' ? 'Camera3D' : 'Camera2D'),
      camera_type: normalizeCameraType(args.cameraType),
      make_current: args.makeCurrent ?? true,
      enabled: args.enabled ?? true,
      position: args.position,
      rotation: args.rotation,
      zoom: args.zoom,
      offset: args.offset,
      fov: args.fov,
      size: args.size,
      projection: args.projection,
      near: args.near,
      far: args.far,
    }),
  });
}

function configureCamera(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'configure_camera',
    description: 'Configure common Camera2D or Camera3D properties in a scene.',
    operation: 'camera_configure',
    required: ['project_path', 'scene_path', 'camera_path'],
    properties: cameraSceneProperties({
      make_current: { type: 'boolean' },
      enabled: { type: 'boolean' },
      position: {},
      rotation: {},
      zoom: {},
      offset: {},
      ignore_rotation: { type: 'boolean' },
      drag_horizontal_enabled: { type: 'boolean' },
      drag_vertical_enabled: { type: 'boolean' },
      drag_margins: { type: 'object' },
      fov: { type: 'number' },
      size: { type: 'number' },
      projection: { type: 'string' },
      near: { type: 'number' },
      far: { type: 'number' },
      keep_aspect: { type: 'string' },
      cull_mask: { type: 'number' },
      h_offset: { type: 'number' },
      v_offset: { type: 'number' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      camera_path: args.cameraPath,
      make_current: args.makeCurrent,
      enabled: args.enabled,
      position: args.position,
      rotation: args.rotation,
      zoom: args.zoom,
      offset: args.offset,
      ignore_rotation: args.ignoreRotation,
      drag_horizontal_enabled: args.dragHorizontalEnabled,
      drag_vertical_enabled: args.dragVerticalEnabled,
      drag_margins: args.dragMargins,
      fov: args.fov,
      size: args.size,
      projection: args.projection,
      near: args.near,
      far: args.far,
      keep_aspect: args.keepAspect,
      cull_mask: args.cullMask,
      h_offset: args.hOffset,
      v_offset: args.vOffset,
    }),
  });
}

function setupCameraFollow2d(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'setup_camera_follow_2d',
    description: 'Attach or configure a Camera2D follow script that tracks a target Node2D at runtime.',
    operation: 'camera_setup_follow_2d',
    required: ['project_path', 'scene_path', 'camera_path', 'target_path'],
    properties: cameraSceneProperties({
      target_path: { type: 'string' },
      follow_offset: {},
      update_mode: { type: 'string', enum: ['idle', 'physics'] },
      overwrite_script: { type: 'boolean' },
      make_current: { type: 'boolean' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      camera_path: args.cameraPath,
      target_path: args.targetPath,
      follow_offset: args.followOffset || [0, 0],
      update_mode: args.updateMode || 'idle',
      overwrite_script: args.overwriteScript ?? false,
      make_current: args.makeCurrent ?? true,
    }),
  });
}

function setCameraLimits2d(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'set_camera_limits_2d',
    description: 'Set Camera2D boundary limits and editor limit visualization.',
    operation: 'camera_set_limits_2d',
    required: ['project_path', 'scene_path', 'camera_path'],
    properties: cameraSceneProperties({
      limit_left: { type: 'number' },
      limit_right: { type: 'number' },
      limit_top: { type: 'number' },
      limit_bottom: { type: 'number' },
      limit_enabled: { type: 'boolean' },
      limit_smoothed: { type: 'boolean' },
      editor_draw_limits: { type: 'boolean' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      camera_path: args.cameraPath,
      limit_left: args.limitLeft,
      limit_right: args.limitRight,
      limit_top: args.limitTop,
      limit_bottom: args.limitBottom,
      limit_enabled: args.limitEnabled,
      limit_smoothed: args.limitSmoothed,
      editor_draw_limits: args.editorDrawLimits,
    }),
  });
}

function setCameraSmoothing2d(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'set_camera_smoothing_2d',
    description: 'Configure Camera2D position and rotation smoothing settings.',
    operation: 'camera_set_smoothing_2d',
    required: ['project_path', 'scene_path', 'camera_path'],
    properties: cameraSceneProperties({
      position_smoothing_enabled: { type: 'boolean' },
      position_smoothing_speed: { type: 'number' },
      rotation_smoothing_enabled: { type: 'boolean' },
      rotation_smoothing_speed: { type: 'number' },
      limit_smoothed: { type: 'boolean' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      camera_path: args.cameraPath,
      position_smoothing_enabled: args.positionSmoothingEnabled,
      position_smoothing_speed: args.positionSmoothingSpeed,
      rotation_smoothing_enabled: args.rotationSmoothingEnabled,
      rotation_smoothing_speed: args.rotationSmoothingSpeed,
      limit_smoothed: args.limitSmoothed,
    }),
  });
}

function applyCameraPreset(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'apply_camera_preset',
    description: 'Apply a named Camera2D or Camera3D preset such as platformer_2d, top_down_2d, pixel_art_2d, cinematic_2d, third_person_3d, or orthographic_3d.',
    operation: 'camera_apply_preset',
    required: ['project_path', 'scene_path', 'camera_path', 'preset'],
    properties: cameraSceneProperties({
      preset: {
        type: 'string',
        enum: ['platformer_2d', 'top_down_2d', 'pixel_art_2d', 'cinematic_2d', 'third_person_3d', 'orthographic_3d'],
      },
      viewport_size: {},
      make_current: { type: 'boolean' },
      options: { type: 'object' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      camera_path: args.cameraPath,
      preset: args.preset,
      viewport_size: args.viewportSize || [1152, 648],
      make_current: args.makeCurrent ?? true,
      options: args.options || {},
    }),
  });
}

function listCameras(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'list_cameras',
    description: 'List Camera2D and Camera3D nodes in a scene with key configuration details.',
    operation: 'camera_list',
    required: ['project_path', 'scene_path'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      include_bounds: { type: 'boolean' },
      viewport_size: {},
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      include_bounds: args.includeBounds ?? false,
      viewport_size: args.viewportSize || [1152, 648],
    }),
  });
}

function previewCameraBounds(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'preview_camera_bounds',
    description: 'Preview approximate Camera2D viewport bounds using saved scene position, zoom, offset, and limits.',
    operation: 'camera_preview_bounds',
    required: ['project_path', 'scene_path', 'camera_path'],
    properties: cameraSceneProperties({
      viewport_size: {},
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      camera_path: args.cameraPath,
      viewport_size: args.viewportSize || [1152, 648],
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
        invalidateSceneCache(ctx, target.projectRoot, args.scenePath);
        return jsonResponse({ status: 'success', ...parsed });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function cameraSceneProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    scene_path: { type: 'string' },
    camera_path: { type: 'string' },
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
    parentPath: args.parentPath ?? args.parent_path,
    cameraName: args.cameraName ?? args.camera_name,
    cameraType: args.cameraType ?? args.camera_type,
    cameraPath: args.cameraPath ?? args.camera_path,
    makeCurrent: args.makeCurrent ?? args.make_current,
    ignoreRotation: args.ignoreRotation ?? args.ignore_rotation,
    dragHorizontalEnabled: args.dragHorizontalEnabled ?? args.drag_horizontal_enabled,
    dragVerticalEnabled: args.dragVerticalEnabled ?? args.drag_vertical_enabled,
    dragMargins: args.dragMargins ?? args.drag_margins,
    keepAspect: args.keepAspect ?? args.keep_aspect,
    cullMask: args.cullMask ?? args.cull_mask,
    hOffset: args.hOffset ?? args.h_offset,
    vOffset: args.vOffset ?? args.v_offset,
    targetPath: args.targetPath ?? args.target_path,
    followOffset: args.followOffset ?? args.follow_offset,
    updateMode: args.updateMode ?? args.update_mode,
    overwriteScript: args.overwriteScript ?? args.overwrite_script,
    limitLeft: args.limitLeft ?? args.limit_left,
    limitRight: args.limitRight ?? args.limit_right,
    limitTop: args.limitTop ?? args.limit_top,
    limitBottom: args.limitBottom ?? args.limit_bottom,
    limitEnabled: args.limitEnabled ?? args.limit_enabled,
    limitSmoothed: args.limitSmoothed ?? args.limit_smoothed,
    editorDrawLimits: args.editorDrawLimits ?? args.editor_draw_limits,
    positionSmoothingEnabled: args.positionSmoothingEnabled ?? args.position_smoothing_enabled,
    positionSmoothingSpeed: args.positionSmoothingSpeed ?? args.position_smoothing_speed,
    rotationSmoothingEnabled: args.rotationSmoothingEnabled ?? args.rotation_smoothing_enabled,
    rotationSmoothingSpeed: args.rotationSmoothingSpeed ?? args.rotation_smoothing_speed,
    viewportSize: args.viewportSize ?? args.viewport_size,
    includeBounds: args.includeBounds ?? args.include_bounds,
  };
}

function normalizeCameraType(value: string | undefined): '2d' | '3d' {
  return String(value || '2d').toLowerCase().includes('3') ? '3d' : '2d';
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
