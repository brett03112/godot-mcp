/**
 * Design-to-scene workflow tools for Phase 4.1.
 *
 * Each tool turns a short brief or a named recipe into a set of
 * real Godot 4.6 scene/script/resource files. The MCP server
 * receives a manifest with the list of files and the follow-up
 * validation commands to run, not just a single path.
 */

import { existsSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

export function registerDesignToSceneTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    generateSceneFromBrief(ctx),
    generateLevelBlockout(ctx),
    generateMenuFlow(ctx),
    generateHud(ctx),
    generateDialogueScene(ctx),
    generateSettingsScreen(ctx),
    generateMobileControls(ctx),
    generateGameplayPrefab(ctx),
    generateEnemyArchetype(ctx),
    generatePickupArchetype(ctx),
  ]);
}

function generateSceneFromBrief(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_scene_from_brief',
    description: 'Generate a multi-file mini-feature from a short brief by combining level, HUD, menu, dialogue, mobile controls, and settings recipes.',
    operation: 'design_generate_scene_from_brief',
    required: ['project_path', 'output_path', 'brief'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      brief: args.brief,
      options: args.options || {},
      include_hud: args.includeHud ?? true,
      include_menu: args.includeMenu ?? true,
      include_settings: args.includeSettings ?? false,
      include_dialogue: args.includeDialogue ?? false,
      include_mobile_controls: args.includeMobileControls ?? false,
      include_blockout: args.includeBlockout ?? false,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateLevelBlockout(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_level_blockout',
    description: 'Write a 2D or 3D level blockout scene with ground, walls, lights, and a player spawn marker.',
    operation: 'design_generate_level_blockout',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      grid_size: args.gridSize || [16, 12],
      spawn_position: args.spawnPosition || [0, 0, 0],
      include_physics: args.includePhysics ?? true,
      blocks: Array.isArray(args.blocks) ? args.blocks : [],
      kind: args.kind || '2d',
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateMenuFlow(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_menu_flow',
    description: 'Write a main menu scene plus optional settings and pause submenus, returning the screen transition list.',
    operation: 'design_generate_menu_flow',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      title: args.title || 'Main Menu',
      subtitle: args.subtitle || '',
      buttons: Array.isArray(args.buttons) ? args.buttons : ['Play', 'Settings', 'Quit'],
      include_settings: args.includeSettings ?? false,
      options: args.options || {},
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateHud(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_hud',
    description: 'Write an overlay HUD scene with score, health, time, and pause button that follows a player at runtime.',
    operation: 'design_generate_hud',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      root_size: args.rootSize || [1152, 648],
      follows_player: args.followsPlayer ?? false,
      target_path: args.targetPath || '',
      options: args.options || {},
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateDialogueScene(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_dialogue_scene',
    description: 'Write a dialogue box scene plus a sample DialogueLine script template for story scenes.',
    operation: 'design_generate_dialogue_scene',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      title: args.title || 'Speaker',
      subtitle: args.subtitle || 'Dialogue text',
      options: args.options || {},
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateSettingsScreen(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_settings_screen',
    description: 'Write a settings screen with audio, video, and controls sections plus a controller script template.',
    operation: 'design_generate_settings_screen',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      title: args.title || 'Settings',
      options: args.options || { audio: true, video: true, controls: true },
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateMobileControls(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_mobile_controls',
    description: 'Write a virtual joystick and action button scene for mobile or touch gameplay.',
    operation: 'design_generate_mobile_controls',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      root_size: args.rootSize || [720, 1280],
      options: args.options || {},
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateGameplayPrefab(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_gameplay_prefab',
    description: 'Write a reusable gameplay prefab scene (player, enemy, or projectile) with an attached controller script.',
    operation: 'design_generate_gameplay_prefab',
    required: ['project_path', 'output_path', 'kind'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      kind: args.kind,
      speed: args.speed ?? 240,
      damage: args.damage ?? 0,
      health: args.health ?? 100,
      class_name: args.className || '',
      options: args.options || {},
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateEnemyArchetype(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_enemy_archetype',
    description: 'Write a small enemy scene with an AI script template (idle, patrol, chase).',
    operation: 'design_generate_enemy_archetype',
    required: ['project_path', 'output_path', 'archetype'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      archetype: args.archetype,
      health: args.health ?? 30,
      speed: args.speed ?? 80,
      damage: args.damage ?? 5,
      include_ai: args.includeAi ?? true,
      class_name: args.className || '',
      options: args.options || {},
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generatePickupArchetype(ctx: ServerContext): ToolDefinition {
  return designTool(ctx, {
    name: 'generate_pickup_archetype',
    description: 'Write a small pickup scene with a pickup script template (coin, health, ammo).',
    operation: 'design_generate_pickup_archetype',
    required: ['project_path', 'output_path', 'archetype'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      archetype: args.archetype,
      pickup_value: args.pickupValue ?? 1,
      respawn_time: args.respawnTime ?? 0,
      include_physics: args.includePhysics ?? true,
      class_name: args.className || '',
      options: args.options || {},
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function designTool(ctx: ServerContext, config: {
  name: string;
  description: string;
  operation: string;
  required: string[];
  mapParams: (args: any) => Record<string, any>;
}): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: {
      type: 'object',
      properties: designProperties(),
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
        const hydrated = hydrateManifestValidationCommands(parsed, target.projectRoot);
        if (params.output_path) {
          invalidateSceneCache(ctx, target.projectRoot, params.output_path);
        }
        return jsonResponse({ status: 'success', ...hydrated });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function designProperties(): Record<string, any> {
  return {
    project_path: { type: 'string' },
    output_path: { type: 'string' },
    brief: { type: 'string' },
    recipe: { type: 'string' },
    archetype: { type: 'string' },
    kind: { type: 'string' },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    buttons: { type: 'array', items: { type: 'string' } },
    options: { type: 'object' },
    target_path: { type: 'string' },
    parent_path: { type: 'string' },
    class_name: { type: 'string' },
    root_size: { description: 'Viewport/design size as [width, height].' },
    dry_run: { type: 'boolean' },
    recipe_only: { type: 'boolean' },
    blocks: { type: 'array', items: { type: 'object' } },
    spawn_position: {},
    grid_size: {},
    width: { type: 'number' },
    height: { type: 'number' },
    speed: { type: 'number' },
    health: { type: 'number' },
    damage: { type: 'number' },
    pickup_value: { type: 'number' },
    respawn_time: { type: 'number' },
    follows_player: { type: 'boolean' },
    include_ai: { type: 'boolean' },
    include_physics: { type: 'boolean' },
    include_pickup: { type: 'boolean' },
    include_hud: { type: 'boolean' },
    include_menu: { type: 'boolean' },
    include_settings: { type: 'boolean' },
    include_dialogue: { type: 'boolean' },
    include_mobile_controls: { type: 'boolean' },
    include_blockout: { type: 'boolean' },
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

function hydrateManifestValidationCommands(parsed: any, projectRoot: string): any {
  if (!parsed || typeof parsed !== 'object' || !parsed.manifest || typeof parsed.manifest !== 'object') {
    return parsed;
  }
  const commands = parsed.manifest.validation_commands;
  if (!Array.isArray(commands)) return parsed;
  return {
    ...parsed,
    manifest: {
      ...parsed.manifest,
      validation_commands: commands.map((command: any) => {
        if (!command || typeof command !== 'object' || !command.args || typeof command.args !== 'object') {
          return command;
        }
        const args = { ...command.args };
        if (args.project_path === '<self>') args.project_path = projectRoot;
        if (args.projectPath === '<self>') args.projectPath = projectRoot;
        return { ...command, args };
      }),
    },
  };
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    outputPath: args.outputPath ?? args.output_path,
    brief: args.brief,
    recipe: args.recipe,
    archetype: args.archetype,
    kind: args.kind,
    title: args.title,
    subtitle: args.subtitle,
    buttons: args.buttons,
    options: args.options,
    targetPath: args.targetPath ?? args.target_path,
    parentPath: args.parentPath ?? args.parent_path,
    className: args.className ?? args.class_name,
    rootSize: args.rootSize ?? args.root_size,
    dryRun: args.dryRun ?? args.dry_run,
    recipeOnly: args.recipeOnly ?? args.recipe_only,
    blocks: args.blocks,
    spawnPosition: args.spawnPosition ?? args.spawn_position,
    gridSize: args.gridSize ?? args.grid_size,
    width: args.width,
    height: args.height,
    speed: args.speed,
    health: args.health,
    damage: args.damage,
    pickupValue: args.pickupValue ?? args.pickup_value,
    respawnTime: args.respawnTime ?? args.respawn_time,
    followsPlayer: args.followsPlayer ?? args.follows_player,
    includeAi: args.includeAi ?? args.include_ai,
    includePhysics: args.includePhysics ?? args.include_physics,
    includePickup: args.includePickup ?? args.include_pickup,
    includeHud: args.includeHud ?? args.include_hud,
    includeMenu: args.includeMenu ?? args.include_menu,
    includeSettings: args.includeSettings ?? args.include_settings,
    includeDialogue: args.includeDialogue ?? args.include_dialogue,
    includeMobileControls: args.includeMobileControls ?? args.include_mobile_controls,
    includeBlockout: args.includeBlockout ?? args.include_blockout,
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
