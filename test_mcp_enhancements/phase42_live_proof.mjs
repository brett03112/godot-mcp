// Phase 4.2 gameplay-system proof.

import { spawn } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';
let activeChild = null;

function send(child, message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

function request(child, message) {
  const response = waitForId(child, message.id);
  send(child, message);
  return response;
}

function waitForId(child, id) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      child.stdout.off('data', onData);
      child.off('error', onError);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.id === id) {
          cleanup();
          resolve(message);
          return;
        }
      }
    };
    child.stdout.on('data', onData);
    child.once('error', onError);
  });
}

function callTool(child, id, name, args) {
  return request(child, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
}

function listTools(child, id) {
  return request(child, { jsonrpc: '2.0', id, method: 'tools/list' });
}

function parseToolContent(result) {
  if (!result.result || !Array.isArray(result.result.content)) {
    throw new Error('No content in tool response: ' + JSON.stringify(result));
  }
  const text = result.result.content.map((c) => c.text ?? '').join('\n');
  return JSON.parse(text);
}

function startChild() {
  const child = spawn(MCP_COMMAND, MCP_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GODOT_PATH,
    },
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[mcp-stderr] ${chunk.toString('utf8')}`));
  return child;
}

async function validateManifest(child, manifest, idStart) {
  let id = idStart;
  for (const entry of manifest.validation_commands || []) {
    const response = await callTool(child, id++, entry.tool, entry.args);
    const parsed = parseToolContent(response);
    if (parsed.status === 'failed') {
      throw new Error(`Manifest validation failed for ${entry.tool}: ${JSON.stringify(parsed)}`);
    }
  }
  return id;
}

async function assertCreatedFiles(paths) {
  for (const rel of paths) {
    const stats = await stat(join(PROJECT_PATH, rel));
    if (stats.size === 0) {
      throw new Error('Expected non-empty file: ' + rel);
    }
  }
}

async function cleanup(paths) {
  for (const rel of paths) {
    await rm(join(PROJECT_PATH, rel), { force: true });
    await rm(join(PROJECT_PATH, `${rel}.uid`), { force: true });
  }
}

async function main() {
  const child = startChild();
  activeChild = child;
  await request(child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'phase42-proof', version: '1.0.0' },
    },
  });
  send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const required = [
    'add_state',
    'connect_state_transition',
    'create_state_machine',
    'generate_character_controller',
    'generate_dialogue_controller',
    'generate_interaction_system',
    'generate_inventory_system',
    'generate_save_load_system',
    'generate_settings_persistence',
  ];
  const tools = await listTools(child, 2);
  const toolNames = tools.result.tools.map((tool) => tool.name).sort();
  const missing = required.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error('Missing tools: ' + missing.join(', '));
  }
  console.log('tools/list returned ' + toolNames.length + ' tools including all 9 Phase 4.2 tools.');

  for (const toolName of required) {
    const response = await callTool(child, 100 + required.indexOf(toolName), toolName, {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase42_dry_run.tscn',
      state_machine_path: 'scenes/mcp_phase42_dry_run_state_machine.tscn',
      state_name: 'Chase',
      state_names: ['Idle', 'Patrol'],
      from_state: 'Idle',
      to_state: 'Patrol',
      condition: 'target_visible',
      dry_run: true,
    });
    const parsed = parseToolContent(response);
    if (parsed.status !== 'success') {
      throw new Error(`${toolName} dry_run failed: ${JSON.stringify(parsed)}`);
    }
    if (!parsed.manifest || !Array.isArray(parsed.manifest.validation_commands)) {
      throw new Error(`${toolName} returned no manifest validation commands`);
    }
  }
  console.log('All 9 dry_run calls returned manifests.');

  const cleanupPaths = [
    'scenes/mcp_phase42_combat_state_machine.tscn',
    'scenes/mcp_phase42_combat_state_machine.gd',
    'scenes/chase_state.gd',
    'test/test_mcp_phase42_combat_state_machine.gd',
    'scenes/mcp_phase42_player_controller.tscn',
    'scenes/mcp_phase42_player_controller.gd',
    'test/test_mcp_phase42_player_controller.gd',
    'scenes/mcp_phase42_interaction_system.tscn',
    'scenes/mcp_phase42_interaction_system.gd',
    'test/test_mcp_phase42_interaction_system.gd',
    'scenes/mcp_phase42_inventory_system.tscn',
    'scenes/mcp_phase42_inventory_system.gd',
    'scenes/mcp_phase42_inventory_system_item.gd',
    'test/test_mcp_phase42_inventory_system.gd',
    'scenes/mcp_phase42_dialogue_controller.tscn',
    'scenes/mcp_phase42_dialogue_controller.gd',
    'test/test_mcp_phase42_dialogue_controller.gd',
    'scenes/mcp_phase42_save_load_system.tscn',
    'scenes/mcp_phase42_save_load_system.gd',
    'test/test_mcp_phase42_save_load_system.gd',
    'scenes/mcp_phase42_settings_persistence.tscn',
    'scenes/mcp_phase42_settings_persistence.gd',
    'test/test_mcp_phase42_settings_persistence.gd',
  ];
  await cleanup(cleanupPaths);

  const realCalls = [
    ['create_state_machine', {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase42_combat_state_machine.tscn',
      state_names: ['Idle', 'Patrol'],
      class_name: 'McpPhase42CombatStateMachine',
    }],
    ['add_state', {
      project_path: PROJECT_PATH,
      state_machine_path: 'scenes/mcp_phase42_combat_state_machine.tscn',
      state_name: 'Chase',
      class_name: 'McpPhase42ChaseState',
    }],
    ['connect_state_transition', {
      project_path: PROJECT_PATH,
      state_machine_path: 'scenes/mcp_phase42_combat_state_machine.tscn',
      from_state: 'Patrol',
      to_state: 'Chase',
      condition: 'target_visible',
    }],
    ['generate_character_controller', {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase42_player_controller.tscn',
      controller_type: 'platformer_2d',
      movement_speed: 320,
      jump_velocity: -480,
      gravity: 1200,
    }],
    ['generate_interaction_system', {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase42_interaction_system.tscn',
      interaction_action: 'interact',
    }],
    ['generate_inventory_system', {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase42_inventory_system.tscn',
      inventory_size: 24,
    }],
    ['generate_dialogue_controller', {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase42_dialogue_controller.tscn',
      dialogue_lines: ['Ready?', 'Go.'],
    }],
    ['generate_save_load_system', {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase42_save_load_system.tscn',
      save_slots: 3,
    }],
    ['generate_settings_persistence', {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase42_settings_persistence.tscn',
      settings_keys: ['master_volume', 'fullscreen'],
    }],
  ];

  let id = 200;
  const manifests = [];
  for (const [toolName, args] of realCalls) {
    const response = await callTool(child, id++, toolName, args);
    const parsed = parseToolContent(response);
    if (parsed.status !== 'success') {
      throw new Error(`${toolName} failed: ${JSON.stringify(parsed)}`);
    }
    manifests.push(parsed.manifest);
    console.log(toolName + ' generated ' + parsed.manifest.created_files.length + ' files and changed ' + parsed.manifest.changed_files.length + ' files.');
  }

  await assertCreatedFiles([
    'scenes/mcp_phase42_combat_state_machine.tscn',
    'scenes/mcp_phase42_combat_state_machine.gd',
    'scenes/chase_state.gd',
    'scenes/mcp_phase42_player_controller.tscn',
    'scenes/mcp_phase42_inventory_system_item.gd',
    'test/test_mcp_phase42_settings_persistence.gd',
  ]);

  id = 400;
  for (const manifest of manifests) {
    id = await validateManifest(child, manifest, id);
  }
  console.log('All manifest validation commands returned success.');

  await cleanup(cleanupPaths);
  child.kill();
  activeChild = null;
  console.log('Phase 4.2 gameplay-system proof PASSED');
}

main().catch((error) => {
  if (activeChild) {
    activeChild.kill();
  }
  console.error('Phase 4.2 gameplay-system proof FAILED:', error);
  process.exitCode = 1;
});
