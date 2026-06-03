/**
 * UI and theme workflow tools for Phase 1.5.
 */

import { existsSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

export function registerUiThemeWorkflowTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    createUiLayout(ctx),
    drawUiRecipe(ctx),
    setControlAnchorPreset(ctx),
    setControlOffsets(ctx),
    setControlText(ctx),
    setControlThemeOverride(ctx),
    createTheme(ctx),
    themeSetColor(ctx),
    themeSetConstant(ctx),
    themeSetFontSize(ctx),
    themeSetStyleboxFlat(ctx),
    applyTheme(ctx),
    inspectUiLayout(ctx),
    validateUiSafeArea(ctx),
  ]);
}

function createUiLayout(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_ui_layout',
    description: 'Create a Control-rooted UI scene from declarative controls using Godot PackedScene serialization.',
    operation: 'ui_create_layout',
    required: ['project_path', 'output_path'],
    properties: {
      project_path: { type: 'string' },
      output_path: { type: 'string' },
      root_name: { type: 'string' },
      root_size: { description: 'Viewport/design size as [width, height] or {x, y}.' },
      controls: { type: 'array', items: { type: 'object' } },
      theme_path: { type: 'string' },
      overwrite: { type: 'boolean' },
    },
    mapParams: (args) => ({
      output_path: args.outputPath,
      root_name: args.rootName || 'UI',
      root_size: args.rootSize || [1152, 648],
      controls: Array.isArray(args.controls) ? args.controls : [],
      theme_path: args.themePath || '',
      overwrite: args.overwrite ?? false,
    }),
  });
}

function drawUiRecipe(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'draw_ui_recipe',
    description: 'Create a common UI screen from a named recipe such as main_menu, pause_menu, settings_screen, HUD, dialogue, inventory, or mobile controls.',
    operation: 'ui_draw_recipe',
    required: ['project_path', 'output_path', 'recipe'],
    properties: {
      project_path: { type: 'string' },
      output_path: { type: 'string' },
      recipe: {
        type: 'string',
        enum: ['main_menu', 'pause_menu', 'settings_screen', 'hud', 'dialogue_box', 'inventory_grid', 'virtual_joystick', 'mobile_action_buttons'],
      },
      root_name: { type: 'string' },
      root_size: {},
      title: { type: 'string' },
      subtitle: { type: 'string' },
      buttons: { type: 'array', items: { type: 'string' } },
      theme_path: { type: 'string' },
      options: { type: 'object' },
      overwrite: { type: 'boolean' },
    },
    mapParams: (args) => ({
      output_path: args.outputPath,
      recipe: args.recipe,
      root_name: args.rootName || '',
      root_size: args.rootSize || [1152, 648],
      title: args.title || '',
      subtitle: args.subtitle || '',
      buttons: Array.isArray(args.buttons) ? args.buttons : [],
      theme_path: args.themePath || '',
      options: args.options || {},
      overwrite: args.overwrite ?? false,
    }),
  });
}

function setControlAnchorPreset(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'set_control_anchor_preset',
    description: 'Set a Control node anchor preset such as full_rect, center, top_left, or bottom_right.',
    operation: 'ui_set_control_anchor_preset',
    required: ['project_path', 'scene_path', 'node_path', 'preset'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      node_path: { type: 'string' },
      preset: { type: 'string' },
      keep_offsets: { type: 'boolean' },
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      preset: args.preset,
      keep_offsets: args.keepOffsets ?? false,
    }),
  });
}

function setControlOffsets(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'set_control_offsets',
    description: 'Set Control offset_left/top/right/bottom values in a scene.',
    operation: 'ui_set_control_offsets',
    required: ['project_path', 'scene_path', 'node_path'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      node_path: { type: 'string' },
      left: { type: 'number' },
      top: { type: 'number' },
      right: { type: 'number' },
      bottom: { type: 'number' },
      offsets: { type: 'object' },
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      left: args.left,
      top: args.top,
      right: args.right,
      bottom: args.bottom,
      offsets: args.offsets || {},
    }),
  });
}

function setControlText(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'set_control_text',
    description: 'Set a Control node text property when the target supports text.',
    operation: 'ui_set_control_text',
    required: ['project_path', 'scene_path', 'node_path', 'text'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      node_path: { type: 'string' },
      text: { type: 'string' },
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      text: args.text ?? '',
    }),
  });
}

function setControlThemeOverride(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'set_control_theme_override',
    description: 'Apply a color, constant, font_size, or StyleBoxFlat theme override to a Control node.',
    operation: 'ui_set_control_theme_override',
    required: ['project_path', 'scene_path', 'node_path', 'override_type', 'name'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      node_path: { type: 'string' },
      override_type: { type: 'string', enum: ['color', 'constant', 'font_size', 'stylebox_flat'] },
      name: { type: 'string' },
      value: {},
      bg_color: {},
      border_color: {},
      border_width: {},
      corner_radius: {},
      content_margin: {},
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      override_type: args.overrideType,
      name: args.name,
      value: args.value,
      bg_color: args.bgColor,
      border_color: args.borderColor,
      border_width: args.borderWidth,
      corner_radius: args.cornerRadius,
      content_margin: args.contentMargin,
    }),
  });
}

function createTheme(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_theme',
    description: 'Create a Theme resource using Godot ResourceSaver with optional common defaults.',
    operation: 'ui_create_theme',
    required: ['project_path', 'output_path'],
    properties: {
      project_path: { type: 'string' },
      output_path: { type: 'string' },
      default_font_size: { type: 'number' },
      colors: { type: 'array', items: { type: 'object' } },
      constants: { type: 'array', items: { type: 'object' } },
      font_sizes: { type: 'array', items: { type: 'object' } },
      styleboxes: { type: 'array', items: { type: 'object' } },
      overwrite: { type: 'boolean' },
    },
    mapParams: (args) => ({
      output_path: args.outputPath,
      default_font_size: args.defaultFontSize ?? 16,
      colors: Array.isArray(args.colors) ? args.colors : [],
      constants: Array.isArray(args.constants) ? args.constants : [],
      font_sizes: Array.isArray(args.fontSizes) ? args.fontSizes : [],
      styleboxes: Array.isArray(args.styleboxes) ? args.styleboxes : [],
      overwrite: args.overwrite ?? false,
    }),
  });
}

function themeSetColor(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'theme_set_color',
    description: 'Set a Theme color entry by item name and theme type.',
    operation: 'ui_theme_set_color',
    required: ['project_path', 'theme_path', 'theme_type', 'name', 'color'],
    properties: themeItemProperties({ color: {} }),
    mapParams: (args) => ({
      theme_path: args.themePath,
      theme_type: args.themeType,
      name: args.name,
      color: args.color,
    }),
  });
}

function themeSetConstant(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'theme_set_constant',
    description: 'Set a Theme constant entry by item name and theme type.',
    operation: 'ui_theme_set_constant',
    required: ['project_path', 'theme_path', 'theme_type', 'name', 'value'],
    properties: themeItemProperties({ value: { type: 'number' } }),
    mapParams: (args) => ({
      theme_path: args.themePath,
      theme_type: args.themeType,
      name: args.name,
      value: args.value,
    }),
  });
}

function themeSetFontSize(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'theme_set_font_size',
    description: 'Set a Theme font_size entry by item name and theme type.',
    operation: 'ui_theme_set_font_size',
    required: ['project_path', 'theme_path', 'theme_type', 'name', 'size'],
    properties: themeItemProperties({ size: { type: 'number' } }),
    mapParams: (args) => ({
      theme_path: args.themePath,
      theme_type: args.themeType,
      name: args.name,
      size: args.size,
    }),
  });
}

function themeSetStyleboxFlat(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'theme_set_stylebox_flat',
    description: 'Create a StyleBoxFlat and set it on a Theme stylebox entry.',
    operation: 'ui_theme_set_stylebox_flat',
    required: ['project_path', 'theme_path', 'theme_type', 'name'],
    properties: themeItemProperties({
      bg_color: {},
      border_color: {},
      border_width: {},
      corner_radius: {},
      content_margin: {},
    }),
    mapParams: (args) => ({
      theme_path: args.themePath,
      theme_type: args.themeType,
      name: args.name,
      bg_color: args.bgColor,
      border_color: args.borderColor,
      border_width: args.borderWidth,
      corner_radius: args.cornerRadius,
      content_margin: args.contentMargin,
    }),
  });
}

function applyTheme(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'apply_theme',
    description: 'Assign a Theme resource to a Control node and save the scene.',
    operation: 'ui_apply_theme',
    required: ['project_path', 'scene_path', 'node_path', 'theme_path'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      node_path: { type: 'string' },
      theme_path: { type: 'string' },
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      node_path: args.nodePath,
      theme_path: args.themePath,
    }),
  });
}

function inspectUiLayout(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'inspect_ui_layout',
    description: 'Inspect Control nodes in a UI scene with anchor, offset, text, and approximate rectangle data.',
    operation: 'ui_inspect_layout',
    required: ['project_path', 'scene_path'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      viewport_size: {},
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      viewport_size: args.viewportSize || [1152, 648],
    }),
  });
}

function validateUiSafeArea(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'validate_ui_safe_area',
    description: 'Validate a UI scene for empty containers, missing text, offscreen controls, tiny touch targets, and obvious anchor mistakes.',
    operation: 'ui_validate_safe_area',
    required: ['project_path', 'scene_path'],
    properties: {
      project_path: { type: 'string' },
      scene_path: { type: 'string' },
      viewport_size: {},
      safe_margin: { type: 'number' },
      min_touch_size: {},
    },
    mapParams: (args) => ({
      scene_path: args.scenePath,
      viewport_size: args.viewportSize || [1152, 648],
      safe_margin: args.safeMargin ?? 16,
      min_touch_size: args.minTouchSize || [44, 44],
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
        if (args[camel] === undefined || args[camel] === null) {
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

function themeItemProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    theme_path: { type: 'string' },
    theme_type: { type: 'string' },
    name: { type: 'string' },
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
    outputPath: args.outputPath ?? args.output_path,
    rootName: args.rootName ?? args.root_name,
    rootSize: args.rootSize ?? args.root_size,
    scenePath: args.scenePath ?? args.scene_path,
    nodePath: args.nodePath ?? args.node_path,
    keepOffsets: args.keepOffsets ?? args.keep_offsets,
    overrideType: args.overrideType ?? args.override_type,
    themePath: args.themePath ?? args.theme_path,
    themeType: args.themeType ?? args.theme_type,
    defaultFontSize: args.defaultFontSize ?? args.default_font_size,
    fontSizes: args.fontSizes ?? args.font_sizes,
    bgColor: args.bgColor ?? args.bg_color,
    borderColor: args.borderColor ?? args.border_color,
    borderWidth: args.borderWidth ?? args.border_width,
    cornerRadius: args.cornerRadius ?? args.corner_radius,
    contentMargin: args.contentMargin ?? args.content_margin,
    viewportSize: args.viewportSize ?? args.viewport_size,
    safeMargin: args.safeMargin ?? args.safe_margin,
    minTouchSize: args.minTouchSize ?? args.min_touch_size,
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
