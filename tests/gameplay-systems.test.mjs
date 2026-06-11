import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerGameplaySystemTools } from '../build/tools/gameplay-systems.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    output_path: 'outputPath',
    state_machine_path: 'stateMachinePath',
    state_name: 'stateName',
    state_names: 'stateNames',
    from_state: 'fromState',
    to_state: 'toState',
    condition: 'condition',
    class_name: 'className',
    controller_type: 'controllerType',
    movement_speed: 'movementSpeed',
    jump_velocity: 'jumpVelocity',
    gravity: 'gravity',
    interaction_action: 'interactionAction',
    inventory_size: 'inventorySize',
    dialogue_lines: 'dialogueLines',
    save_slots: 'saveSlots',
    settings_keys: 'settingsKeys',
    dry_run: 'dryRun',
    recipe_only: 'recipeOnly',
    include_tests: 'includeTests',
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
    executeOperation: options.executeOperation || (async (operation, params) => ({
      stdout: JSON.stringify({
        success: true,
        operation,
        manifest: {
          created_files: [{ path: params.output_path || params.state_machine_path, kind: 'scene' }],
          changed_files: [],
          validation_commands: [
            { tool: 'validate_scene', args: { project_path: '<self>', scene_path: params.output_path || params.state_machine_path } },
          ],
          preview_summary: {},
          dry_run: params.dry_run,
          recipe_only: params.recipe_only,
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
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-gameplay-systems-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="GameplaySystems"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerGameplaySystemTools(registry, ctx);
  return registry;
}

test('gameplay system tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'create_state_machine',
    'add_state',
    'connect_state_transition',
    'generate_character_controller',
    'generate_interaction_system',
    'generate_inventory_system',
    'generate_dialogue_controller',
    'generate_save_load_system',
    'generate_settings_persistence',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('gameplay system legacy module targets implemented Phase 4.2 handlers', async () => {
  const runner = await readFile(join(process.cwd(), 'src/scripts/godot_operations.gd'), 'utf8');
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');
  assert.match(runner, /OperationRegistry/);
  for (const operation of [
    'gameplay_create_state_machine',
    'gameplay_add_state',
    'gameplay_connect_state_transition',
    'gameplay_generate_character_controller',
    'gameplay_generate_interaction_system',
    'gameplay_generate_inventory_system',
    'gameplay_generate_dialogue_controller',
    'gameplay_generate_save_load_system',
    'gameplay_generate_settings_persistence',
  ]) {
    assert.match(source, new RegExp(`"${operation}":\\r?\\n\\s+_${operation}\\(params\\)`));
    assert.match(source, new RegExp(`func _${operation}\\(params: Dictionary\\) -> void:`));
  }
});

test('add_state keeps the scene root name before freeing the edited scene', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');
  assert.match(source, /var root_name := root\.name/);
  assert.doesNotMatch(
    source,
    /root\.free\(\)\r?\n\s*if bool\(params\.get\("include_tests", true\)\):\r?\n\s*if not _gameplay_write_smoke_test\(test_path, state_machine_path, root\.name\)/,
  );
});

test('state-machine tools map states, transitions, and flags', async () => {
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
              created_files: [],
              changed_files: [{ path: params.output_path || params.state_machine_path, kind: 'scene' }],
              validation_commands: [],
              preview_summary: { operation },
              dry_run: params.dry_run,
              recipe_only: params.recipe_only,
            },
          }) + '\n',
          stderr: '',
        };
      },
    }));

    await registry.dispatch('create_state_machine', {
      project_path: projectPath,
      output_path: 'scenes/combat_state_machine.tscn',
      state_names: ['Idle', 'Patrol'],
      class_name: 'CombatStateMachine',
      include_tests: true,
      dry_run: true,
    });
    await registry.dispatch('add_state', {
      project_path: projectPath,
      state_machine_path: 'scenes/combat_state_machine.tscn',
      state_name: 'Chase',
      class_name: 'ChaseState',
    });
    await registry.dispatch('connect_state_transition', {
      project_path: projectPath,
      state_machine_path: 'scenes/combat_state_machine.tscn',
      from_state: 'Patrol',
      to_state: 'Chase',
      condition: 'player_seen',
      recipe_only: true,
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'gameplay_create_state_machine',
      'gameplay_add_state',
      'gameplay_connect_state_transition',
    ]);
    assert.deepEqual(calls[0].params.state_names, ['Idle', 'Patrol']);
    assert.equal(calls[0].params.class_name, 'CombatStateMachine');
    assert.equal(calls[0].params.include_tests, true);
    assert.equal(calls[0].params.dry_run, true);
    assert.equal(calls[1].params.state_name, 'Chase');
    assert.equal(calls[1].params.state_machine_path, 'scenes/combat_state_machine.tscn');
    assert.equal(calls[2].params.from_state, 'Patrol');
    assert.equal(calls[2].params.to_state, 'Chase');
    assert.equal(calls[2].params.condition, 'player_seen');
    assert.equal(calls[2].params.recipe_only, true);
  });
});

test('gameplay generator tools map controller-specific parameters', async () => {
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
              changed_files: [],
              validation_commands: [],
              preview_summary: {},
              dry_run: false,
              recipe_only: false,
            },
          }) + '\n',
          stderr: '',
        };
      },
    }));

    await registry.dispatch('generate_character_controller', {
      project_path: projectPath,
      output_path: 'scenes/player_controller.tscn',
      controller_type: 'platformer_2d',
      movement_speed: 320,
      jump_velocity: -480,
      gravity: 1200,
    });
    await registry.dispatch('generate_interaction_system', {
      project_path: projectPath,
      output_path: 'scenes/interaction_system.tscn',
      interaction_action: 'interact',
    });
    await registry.dispatch('generate_inventory_system', {
      project_path: projectPath,
      output_path: 'scenes/inventory_system.tscn',
      inventory_size: 24,
    });
    await registry.dispatch('generate_dialogue_controller', {
      project_path: projectPath,
      output_path: 'scenes/dialogue_controller.tscn',
      dialogue_lines: ['Hello', 'Goodbye'],
    });
    await registry.dispatch('generate_save_load_system', {
      project_path: projectPath,
      output_path: 'scenes/save_load_system.tscn',
      save_slots: 3,
    });
    await registry.dispatch('generate_settings_persistence', {
      project_path: projectPath,
      output_path: 'scenes/settings_persistence.tscn',
      settings_keys: ['master_volume', 'fullscreen'],
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'gameplay_generate_character_controller',
      'gameplay_generate_interaction_system',
      'gameplay_generate_inventory_system',
      'gameplay_generate_dialogue_controller',
      'gameplay_generate_save_load_system',
      'gameplay_generate_settings_persistence',
    ]);
    assert.equal(calls[0].params.controller_type, 'platformer_2d');
    assert.equal(calls[0].params.movement_speed, 320);
    assert.equal(calls[0].params.jump_velocity, -480);
    assert.equal(calls[0].params.gravity, 1200);
    assert.equal(calls[1].params.interaction_action, 'interact');
    assert.equal(calls[2].params.inventory_size, 24);
    assert.deepEqual(calls[3].params.dialogue_lines, ['Hello', 'Goodbye']);
    assert.equal(calls[4].params.save_slots, 3);
    assert.deepEqual(calls[5].params.settings_keys, ['master_volume', 'fullscreen']);
  });
});

test('gameplay tools reject missing project_path and required target paths', async () => {
  const registry = createRegistry();
  const missingProject = parseResponse(await registry.dispatch('create_state_machine', {}));
  assert.equal(missingProject.status, 'failed');
  assert.match(missingProject.reason, /project_path/i);

  await withProject(async (projectPath) => {
    const missingOutput = parseResponse(await registry.dispatch('generate_inventory_system', {
      project_path: projectPath,
    }));
    assert.equal(missingOutput.status, 'failed');
    assert.match(missingOutput.reason, /output_path/i);

    const missingStateMachine = parseResponse(await registry.dispatch('add_state', {
      project_path: projectPath,
      state_name: 'Attack',
    }));
    assert.equal(missingStateMachine.status, 'failed');
    assert.match(missingStateMachine.reason, /state_machine_path/i);
  });
});

test('successful gameplay responses preserve manifest validation commands', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => ({
        stdout: JSON.stringify({
          success: true,
          operation,
          manifest: {
            created_files: [
              { path: 'res://scenes/player_controller.tscn', kind: 'scene' },
              { path: 'res://scenes/player_controller.gd', kind: 'script' },
              { path: 'res://test/test_player_controller.gd', kind: 'test' },
            ],
            changed_files: [],
            validation_commands: [
              { tool: 'validate_scene', args: { project_path: '<self>', scene_path: 'res://scenes/player_controller.tscn' } },
              { tool: 'validate_script', args: { projectPath: '<self>', scriptPath: 'scenes/player_controller.gd' } },
            ],
            preview_summary: { scene_nodes: 3, script_classes: ['PlayerController'] },
            dry_run: false,
            recipe_only: false,
          },
        }) + '\n',
        stderr: '',
      }),
    }));

    const response = parseResponse(await registry.dispatch('generate_character_controller', {
      project_path: projectPath,
      output_path: 'scenes/player_controller.tscn',
    }));

    assert.equal(response.status, 'success');
    assert.equal(response.manifest.created_files.length, 3);
    assert.equal(response.manifest.preview_summary.scene_nodes, 3);
    assert.equal(response.manifest.validation_commands[0].args.project_path, projectPath);
    assert.equal(response.manifest.validation_commands[1].args.projectPath, projectPath);
  });
});
