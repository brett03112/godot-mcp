import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerDesignToSceneTools } from '../build/tools/design-to-scene.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    output_path: 'outputPath',
    brief: 'brief',
    recipe: 'recipe',
    archetype: 'archetype',
    kind: 'kind',
    title: 'title',
    subtitle: 'subtitle',
    buttons: 'buttons',
    options: 'options',
    target_path: 'targetPath',
    parent_path: 'parentPath',
    class_name: 'className',
    root_size: 'rootSize',
    dry_run: 'dryRun',
    recipe_only: 'recipeOnly',
    blocks: 'blocks',
    spawn_position: 'spawnPosition',
    grid_size: 'gridSize',
    width: 'width',
    height: 'height',
    speed: 'speed',
    health: 'health',
    damage: 'damage',
    pickup_value: 'pickupValue',
    respawn_time: 'respawnTime',
    follows_player: 'followsPlayer',
    include_ai: 'includeAi',
    include_physics: 'includePhysics',
    include_pickup: 'includePickup',
    include_hud: 'includeHud',
    include_menu: 'includeMenu',
    include_settings: 'includeSettings',
    include_dialogue: 'includeDialogue',
    include_mobile_controls: 'includeMobileControls',
    include_blockout: 'includeBlockout',
  };

  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = mapping[key] || key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[normalizedKey] = normalizeParameters(value);
      } else if (Array.isArray(value)) {
        result[normalizedKey] = value.map((item) => normalizeParameters(item));
      } else {
        result[normalizedKey] = value;
      }
    }
    return result;
  };

  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({ content: [{ type: 'text', text: message }], isError: true }),
    validatePath: (path) => Boolean(path) && !path.includes('..'),
    executeOperation: options.executeOperation || (async () => ({
      stdout: JSON.stringify({
        success: true,
        operation: 'design_generate_hud',
        manifest: {
          created_files: [{ path: 'res://scenes/out.tscn', kind: 'scene' }],
          validation_commands: [{ tool: 'validate_scene', args: { project_path: '<self>', scene_path: 'res://scenes/out.tscn' } }],
          preview_summary: { control_count: 4 },
          dry_run: false,
          recipe_only: false,
        },
      }) + '\n',
      stderr: '',
    })),
    normalizeParameters,
    convertCamelToSnakeCase: (params) => params,
    parseGodotErrors: () => [],
    formatTresValue: (value) => String(value),
    generateUID: () => 'uid://test',
    generateShortUID: () => 'testuid',
    isGodot44OrLater: () => true,
    getGodotPath: async () => 'godot',
    formatProjectSettingValue: (value) => String(value),
    escapeCsvValue: (value) => value,
    parseCsvLine: (line) => line.split(','),
    escapePoString: (value) => value,
    escapeRegex: (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    extractPlaceholders: () => [],
    getOrParseTscn: () => ({}),
    invalidateTscnCache: () => {},
  };
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-design-to-scene-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="DesignToScene"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerDesignToSceneTools(registry, ctx);
  return registry;
}

test('design-to-scene workflow tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'generate_scene_from_brief',
    'generate_level_blockout',
    'generate_menu_flow',
    'generate_hud',
    'generate_dialogue_scene',
    'generate_settings_screen',
    'generate_mobile_controls',
    'generate_gameplay_prefab',
    'generate_enemy_archetype',
    'generate_pickup_archetype',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('design-to-scene GDScript dispatcher targets implemented Phase 4.1 handlers', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_operations.gd'), 'utf8');
  for (const operation of [
    'design_generate_scene_from_brief',
    'design_generate_level_blockout',
    'design_generate_menu_flow',
    'design_generate_hud',
    'design_generate_dialogue_scene',
    'design_generate_settings_screen',
    'design_generate_mobile_controls',
    'design_generate_gameplay_prefab',
    'design_generate_enemy_archetype',
    'design_generate_pickup_archetype',
  ]) {
    assert.match(source, new RegExp(`"${operation}":\\r?\\n\\s+_${operation}\\(params\\)`));
    assert.match(source, new RegExp(`func _${operation}\\(params: Dictionary\\) -> void:`));
  }
  assert.doesNotMatch(source, /func _design_persist_script\(path: String, class_name:/);
  assert.doesNotMatch(source, /var class_name :=/);
  assert.doesNotMatch(source, /Control\.PRESET_OPERATION_KEEP_SIZE/);
  assert.match(source, /var tool_path: String = res_path\.substr\(6\) if res_path\.begins_with\("res:\/\/"\) else res_path/);
  assert.match(source, /"scene_path": tool_path/);
  assert.match(source, /"scriptPath": tool_path/);
});

test('generate_scene_from_brief forwards brief, options, and dry_run flags', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return {
          stdout: JSON.stringify({
            success: true,
            operation,
            manifest: {
              created_files: [
                { path: 'res://scenes/brief_main.tscn', kind: 'scene' },
                { path: 'res://scenes/brief_hud.tscn', kind: 'scene' },
              ],
              validation_commands: [],
              preview_summary: { scene_count: 2 },
              dry_run: true,
              recipe_only: false,
            },
          }) + '\n',
          stderr: '',
        };
      },
    }));

    const response = parseResponse(await registry.dispatch('generate_scene_from_brief', {
      project_path: projectPath,
      output_path: 'scenes/brief_main.tscn',
      brief: 'a tiny platformer with one enemy and one pickup',
      include_hud: true,
      include_menu: true,
      dry_run: true,
    }));

    assert.equal(response.status, 'success');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].operation, 'design_generate_scene_from_brief');
    assert.equal(calls[0].params.brief, 'a tiny platformer with one enemy and one pickup');
    assert.equal(calls[0].params.dry_run, true);
    assert.equal(calls[0].params.recipe_only, false);
    assert.equal(calls[0].params.include_hud, true);
    assert.equal(calls[0].params.include_menu, true);
    assert.equal(calls[0].params.output_path, 'scenes/brief_main.tscn');
    assert.equal(response.manifest.preview_summary.scene_count, 2);
    assert.equal(response.manifest.dry_run, true);
  });
});

test('blockout, prefab, and archetype tools map design parameters', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return {
          stdout: JSON.stringify({
            success: true,
            operation,
            manifest: {
              created_files: [{ path: params.output_path, kind: 'scene' }],
              validation_commands: [],
              preview_summary: {},
              dry_run: params.dry_run,
              recipe_only: params.recipe_only,
            },
          }) + '\n',
          stderr: '',
        };
      },
    }));

    await registry.dispatch('generate_level_blockout', {
      project_path: projectPath,
      output_path: 'scenes/level_01.tscn',
      grid_size: [16, 12],
      include_physics: true,
      recipe_only: true,
    });
    await registry.dispatch('generate_gameplay_prefab', {
      project_path: projectPath,
      output_path: 'scenes/prefabs/projectile.tscn',
      kind: 'projectile',
      speed: 480,
      damage: 12,
    });
    await registry.dispatch('generate_enemy_archetype', {
      project_path: projectPath,
      output_path: 'scenes/enemies/goblin.tscn',
      archetype: 'goblin',
      health: 40,
      speed: 90,
      include_ai: true,
    });
    await registry.dispatch('generate_pickup_archetype', {
      project_path: projectPath,
      output_path: 'scenes/pickups/coin.tscn',
      archetype: 'coin',
      pickup_value: 5,
      respawn_time: 8,
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'design_generate_level_blockout',
      'design_generate_gameplay_prefab',
      'design_generate_enemy_archetype',
      'design_generate_pickup_archetype',
    ]);
    assert.deepEqual(calls[0].params.grid_size, [16, 12]);
    assert.equal(calls[0].params.include_physics, true);
    assert.equal(calls[0].params.recipe_only, true);
    assert.equal(calls[0].params.dry_run, false);
    assert.equal(calls[1].params.kind, 'projectile');
    assert.equal(calls[1].params.speed, 480);
    assert.equal(calls[1].params.damage, 12);
    assert.equal(calls[2].params.archetype, 'goblin');
    assert.equal(calls[2].params.health, 40);
    assert.equal(calls[2].params.include_ai, true);
    assert.equal(calls[3].params.archetype, 'coin');
    assert.equal(calls[3].params.pickup_value, 5);
    assert.equal(calls[3].params.respawn_time, 8);
  });
});

test('UI recipe tools map title, buttons, options, and flags', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return {
          stdout: JSON.stringify({
            success: true,
            operation,
            manifest: { created_files: [], validation_commands: [], preview_summary: {}, dry_run: false, recipe_only: false },
          }) + '\n',
          stderr: '',
        };
      },
    }));

    await registry.dispatch('generate_menu_flow', {
      project_path: projectPath,
      output_path: 'scenes/menus/main_menu.tscn',
      title: 'LaunchPad',
      buttons: ['Play', 'Settings', 'Quit'],
      include_settings: true,
    });
    await registry.dispatch('generate_hud', {
      project_path: projectPath,
      output_path: 'scenes/ui/hud.tscn',
      root_size: [1280, 720],
      follows_player: true,
    });
    await registry.dispatch('generate_dialogue_scene', {
      project_path: projectPath,
      output_path: 'scenes/dialogue/intro.tscn',
      title: 'Elder',
      subtitle: 'Greetings, traveler.',
    });
    await registry.dispatch('generate_settings_screen', {
      project_path: projectPath,
      output_path: 'scenes/ui/settings.tscn',
      title: 'Settings',
      options: { audio: true, video: true, controls: true },
    });
    await registry.dispatch('generate_mobile_controls', {
      project_path: projectPath,
      output_path: 'scenes/ui/mobile_controls.tscn',
      root_size: [720, 1280],
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'design_generate_menu_flow',
      'design_generate_hud',
      'design_generate_dialogue_scene',
      'design_generate_settings_screen',
      'design_generate_mobile_controls',
    ]);
    assert.equal(calls[0].params.title, 'LaunchPad');
    assert.deepEqual(calls[0].params.buttons, ['Play', 'Settings', 'Quit']);
    assert.equal(calls[0].params.include_settings, true);
    assert.deepEqual(calls[1].params.root_size, [1280, 720]);
    assert.equal(calls[1].params.follows_player, true);
    assert.equal(calls[2].params.subtitle, 'Greetings, traveler.');
    assert.equal(calls[3].params.title, 'Settings');
    assert.deepEqual(calls[3].params.options, { audio: true, video: true, controls: true });
    assert.deepEqual(calls[4].params.root_size, [720, 1280]);
  });
});

test('generator tools reject missing project_path and missing output_path', async () => {
  const registry = createRegistry();
  const missingProject = parseResponse(await registry.dispatch('generate_hud', {}));
  assert.equal(missingProject.status, 'failed');
  assert.match(missingProject.reason, /project_path/i);

  await withProject(async (projectPath) => {
    const missingOutput = parseResponse(await registry.dispatch('generate_hud', {
      project_path: projectPath,
    }));
    assert.equal(missingOutput.status, 'failed');
    assert.match(missingOutput.reason, /output_path/i);
  });
});

test('successful generator responses preserve manifest, validation_commands, and dry_run', async () => {
  await withProject(async (projectPath) => {
    const ctx = createContext({
      executeOperation: async (operation, params) => ({
        stdout: JSON.stringify({
          success: true,
          operation,
          manifest: {
            created_files: [
              { path: 'res://scenes/probe.tscn', kind: 'scene' },
              { path: 'res://scripts/probe.gd', kind: 'script' },
            ],
            validation_commands: [
              { tool: 'validate_scene', args: { project_path: '<self>', scene_path: 'res://scenes/probe.tscn' } },
              { tool: 'validate_script', args: { projectPath: '<self>', scriptPath: 'scripts/probe.gd' } },
            ],
            preview_summary: { control_count: 3, script_classes: ['McpProbe'] },
            dry_run: false,
            recipe_only: true,
          },
        }) + '\n',
        stderr: '',
      }),
    });
    const registry = createRegistry(ctx);
    const response = parseResponse(await registry.dispatch('generate_scene_from_brief', {
      project_path: projectPath,
      output_path: 'scenes/probe.tscn',
      brief: 'quick probe',
      recipe_only: true,
    }));

    assert.equal(response.status, 'success');
    assert.equal(response.manifest.preview_summary.control_count, 3);
    assert.equal(response.manifest.preview_summary.script_classes[0], 'McpProbe');
    assert.equal(response.manifest.recipe_only, true);
    assert.equal(response.manifest.created_files.length, 2);
    assert.equal(response.manifest.validation_commands[0].tool, 'validate_scene');
    assert.equal(response.manifest.validation_commands[1].tool, 'validate_script');
    assert.equal(response.manifest.validation_commands[0].args.project_path, projectPath);
    assert.equal(response.manifest.validation_commands[1].args.projectPath, projectPath);
  });
});
