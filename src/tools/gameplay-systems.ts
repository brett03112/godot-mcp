/**
 * Gameplay loop and state-machine helper tools for Phase 4.2.
 */

import { existsSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

export function registerGameplaySystemTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    createStateMachine(ctx),
    addState(ctx),
    connectStateTransition(ctx),
    generateCharacterController(ctx),
    generateInteractionSystem(ctx),
    generateInventorySystem(ctx),
    generateDialogueController(ctx),
    generateSaveLoadSystem(ctx),
    generateSettingsPersistence(ctx),
  ]);
}

function createStateMachine(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'create_state_machine',
    description: 'Create a scripted state-machine scene with child state nodes and a smoke test.',
    operation: 'gameplay_create_state_machine',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      state_names: Array.isArray(args.stateNames) && args.stateNames.length > 0 ? args.stateNames : ['Idle'],
      class_name: args.className || '',
      include_tests: args.includeTests ?? true,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function addState(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'add_state',
    description: 'Add a state node and script to an existing state-machine scene.',
    operation: 'gameplay_add_state',
    required: ['project_path', 'state_machine_path', 'state_name'],
    mapParams: (args) => ({
      state_machine_path: args.stateMachinePath,
      state_name: args.stateName,
      class_name: args.className || '',
      include_tests: args.includeTests ?? true,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function connectStateTransition(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'connect_state_transition',
    description: 'Add or update a transition node between two states in a state-machine scene.',
    operation: 'gameplay_connect_state_transition',
    required: ['project_path', 'state_machine_path', 'from_state', 'to_state'],
    mapParams: (args) => ({
      state_machine_path: args.stateMachinePath,
      from_state: args.fromState,
      to_state: args.toState,
      condition: args.condition || '',
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateCharacterController(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'generate_character_controller',
    description: 'Generate a CharacterBody2D controller scene, controller script, and smoke test.',
    operation: 'gameplay_generate_character_controller',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      controller_type: args.controllerType || 'top_down_2d',
      movement_speed: args.movementSpeed ?? 240,
      jump_velocity: args.jumpVelocity ?? -420,
      gravity: args.gravity ?? 980,
      class_name: args.className || '',
      include_tests: args.includeTests ?? true,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateInteractionSystem(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'generate_interaction_system',
    description: 'Generate an Area2D interaction detector scene, script, and smoke test.',
    operation: 'gameplay_generate_interaction_system',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      interaction_action: args.interactionAction || 'interact',
      class_name: args.className || '',
      include_tests: args.includeTests ?? true,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateInventorySystem(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'generate_inventory_system',
    description: 'Generate an inventory manager scene, item data script, controller script, and smoke test.',
    operation: 'gameplay_generate_inventory_system',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      inventory_size: args.inventorySize ?? 16,
      class_name: args.className || '',
      include_tests: args.includeTests ?? true,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateDialogueController(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'generate_dialogue_controller',
    description: 'Generate a dialogue controller scene, script, and smoke test.',
    operation: 'gameplay_generate_dialogue_controller',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      dialogue_lines: Array.isArray(args.dialogueLines) ? args.dialogueLines : [],
      class_name: args.className || '',
      include_tests: args.includeTests ?? true,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateSaveLoadSystem(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'generate_save_load_system',
    description: 'Generate a save/load manager scene, script, and smoke test.',
    operation: 'gameplay_generate_save_load_system',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      save_slots: args.saveSlots ?? 3,
      class_name: args.className || '',
      include_tests: args.includeTests ?? true,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function generateSettingsPersistence(ctx: ServerContext): ToolDefinition {
  return gameplayTool(ctx, {
    name: 'generate_settings_persistence',
    description: 'Generate a ConfigFile-backed settings persistence scene, script, and smoke test.',
    operation: 'gameplay_generate_settings_persistence',
    required: ['project_path', 'output_path'],
    mapParams: (args) => ({
      output_path: args.outputPath,
      settings_keys: Array.isArray(args.settingsKeys) && args.settingsKeys.length > 0
        ? args.settingsKeys
        : ['master_volume', 'fullscreen'],
      class_name: args.className || '',
      include_tests: args.includeTests ?? true,
      dry_run: args.dryRun ?? false,
      recipe_only: args.recipeOnly ?? false,
    }),
  });
}

function gameplayTool(ctx: ServerContext, config: {
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
      properties: gameplayProperties(),
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
        invalidateTouchedScenes(ctx, target.projectRoot, hydrated.manifest);
        return jsonResponse({ status: 'success', ...hydrated });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function gameplayProperties(): Record<string, any> {
  return {
    project_path: { type: 'string' },
    output_path: { type: 'string' },
    state_machine_path: { type: 'string' },
    state_name: { type: 'string' },
    state_names: { type: 'array', items: { type: 'string' } },
    from_state: { type: 'string' },
    to_state: { type: 'string' },
    condition: { type: 'string' },
    class_name: { type: 'string' },
    controller_type: { type: 'string', enum: ['top_down_2d', 'platformer_2d'] },
    movement_speed: { type: 'number' },
    jump_velocity: { type: 'number' },
    gravity: { type: 'number' },
    interaction_action: { type: 'string' },
    inventory_size: { type: 'number' },
    dialogue_lines: { type: 'array', items: { type: 'string' } },
    save_slots: { type: 'number' },
    settings_keys: { type: 'array', items: { type: 'string' } },
    dry_run: { type: 'boolean' },
    recipe_only: { type: 'boolean' },
    include_tests: { type: 'boolean' },
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
    stateMachinePath: args.stateMachinePath ?? args.state_machine_path,
    stateName: args.stateName ?? args.state_name,
    stateNames: args.stateNames ?? args.state_names,
    fromState: args.fromState ?? args.from_state,
    toState: args.toState ?? args.to_state,
    condition: args.condition,
    className: args.className ?? args.class_name,
    controllerType: args.controllerType ?? args.controller_type,
    movementSpeed: args.movementSpeed ?? args.movement_speed,
    jumpVelocity: args.jumpVelocity ?? args.jump_velocity,
    gravity: args.gravity,
    interactionAction: args.interactionAction ?? args.interaction_action,
    inventorySize: args.inventorySize ?? args.inventory_size,
    dialogueLines: args.dialogueLines ?? args.dialogue_lines,
    saveSlots: args.saveSlots ?? args.save_slots,
    settingsKeys: args.settingsKeys ?? args.settings_keys,
    dryRun: args.dryRun ?? args.dry_run,
    recipeOnly: args.recipeOnly ?? args.recipe_only,
    includeTests: args.includeTests ?? args.include_tests,
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

function invalidateTouchedScenes(ctx: ServerContext, projectRoot: string, manifest: any): void {
  if (!manifest || typeof manifest !== 'object') return;
  const entries = [
    ...(Array.isArray(manifest.created_files) ? manifest.created_files : []),
    ...(Array.isArray(manifest.changed_files) ? manifest.changed_files : []),
  ];
  for (const entry of entries) {
    if (!entry || entry.kind !== 'scene') continue;
    const absolute = resolveProjectPath(projectRoot, entry.path);
    if (absolute) ctx.invalidateTscnCache(absolute);
  }
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
