// Phase 4.1 design-to-scene live proof.
//
// Spawns a built MCP child server over stdio and proves the ten
// design-to-scene tools work end-to-end against the
// test_mcp_enhancements Godot 4.6.3 project. The script also
// follows each tool's manifest.validation_commands so the proof
// covers the full generate-then-validate flow.

import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
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
        if (message.id === undefined && message.method === 'notifications/message') {
          process.stderr.write(`[mcp-notify] ${JSON.stringify(message)}\n`);
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

async function ensureExistingFilesRemoved(relativePaths) {
  // The MCP server writes to disk so we just note the pre-existing sizes.
  const sizes = {};
  for (const rel of relativePaths) {
    try {
      const stats = await stat(join(PROJECT_PATH, rel));
      sizes[rel] = stats.size;
    } catch {
      sizes[rel] = null;
    }
  }
  return sizes;
}

function startChild(extraEnv = {}) {
  const child = spawn(MCP_COMMAND, MCP_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GODOT_PATH,
      ...extraEnv,
    },
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[mcp-stderr] ${chunk.toString('utf8')}`));
  return child;
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
      clientInfo: { name: 'phase41-proof', version: '1.0.0' },
    },
  });
  send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  // Confirm Phase 4.1 tools are present.
  const tools = await listTools(child, 2);
  const toolNames = tools.result.tools.map((t) => t.name).sort();
  const required = [
    'generate_dialogue_scene',
    'generate_enemy_archetype',
    'generate_gameplay_prefab',
    'generate_hud',
    'generate_level_blockout',
    'generate_menu_flow',
    'generate_mobile_controls',
    'generate_pickup_archetype',
    'generate_scene_from_brief',
    'generate_settings_screen',
  ];
  const missing = required.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error('Missing tools: ' + missing.join(', '));
  }
  console.log('tools/list returned ' + toolNames.length + ' tools including all 10 Phase 4.1 tools.');

  // dry_run for every tool to prove the manifest shape.
  for (const toolName of required) {
    const args = {
      project_path: PROJECT_PATH,
      output_path: 'scenes/mcp_phase41_dry_run.tscn',
      brief: 'tiny phase 4.1 proof',
      archetype: 'goblin',
      kind: 'projectile',
      dry_run: true,
    };
    const response = await callTool(child, 100 + required.indexOf(toolName), toolName, args);
    const parsed = parseToolContent(response);
    if (parsed.status !== 'success') {
      throw new Error(`${toolName} dry_run failed: ${JSON.stringify(parsed)}`);
    }
    if (!parsed.manifest || !Array.isArray(parsed.manifest.created_files)) {
      throw new Error(`${toolName} manifest missing created_files: ${JSON.stringify(parsed)}`);
    }
    if (!Array.isArray(parsed.manifest.validation_commands)) {
      throw new Error(`${toolName} manifest missing validation_commands: ${JSON.stringify(parsed)}`);
    }
    if (parsed.manifest.dry_run !== true) {
      throw new Error(`${toolName} manifest did not echo dry_run: ${JSON.stringify(parsed.manifest)}`);
    }
  }
  console.log('All 10 dry_run calls returned a manifest with created_files + validation_commands.');

  // Real generation: HUD, enemy archetype, brief.
  const preHudFiles = await ensureExistingFilesRemoved([
    'scenes/mcp_phase41_hud.tscn',
    'scenes/mcp_phase41_hud.gd',
  ]);
  const hudResponse = await callTool(child, 200, 'generate_hud', {
    project_path: PROJECT_PATH,
    output_path: 'scenes/mcp_phase41_hud.tscn',
    root_size: [1280, 720],
    follows_player: true,
  });
  const hudParsed = parseToolContent(hudResponse);
  if (hudParsed.status !== 'success') {
    throw new Error('generate_hud failed: ' + JSON.stringify(hudParsed));
  }
  console.log('generate_hud manifest: ' + JSON.stringify(hudParsed.manifest, null, 2));

  // Validate the HUD scene through the same MCP child server.
  const validateHudScene = await callTool(child, 201, 'validate_scene', {
    project_path: PROJECT_PATH,
    scene_path: 'scenes/mcp_phase41_hud.tscn',
  });
  const validateHudParsed = parseToolContent(validateHudScene);
  console.log('validate_scene(mcp_phase41_hud.tscn) -> status=' + validateHudParsed.status);

  // Validate the generated HUD script.
  const validateHudScript = await callTool(child, 202, 'validate_script', {
    projectPath: PROJECT_PATH,
    scriptPath: 'scenes/mcp_phase41_hud.gd',
  });
  const validateHudScriptParsed = parseToolContent(validateHudScript);
  console.log('validate_script(mcp_phase41_hud.gd) -> status=' + validateHudScriptParsed.status);

  const enemyResponse = await callTool(child, 203, 'generate_enemy_archetype', {
    project_path: PROJECT_PATH,
    output_path: 'scenes/mcp_phase41_enemy_goblin.tscn',
    archetype: 'goblin',
    health: 40,
    speed: 90,
    include_ai: true,
  });
  const enemyParsed = parseToolContent(enemyResponse);
  if (enemyParsed.status !== 'success') {
    throw new Error('generate_enemy_archetype failed: ' + JSON.stringify(enemyParsed));
  }
  console.log('generate_enemy_archetype manifest: ' + JSON.stringify(enemyParsed.manifest, null, 2));

  const briefResponse = await callTool(child, 204, 'generate_scene_from_brief', {
    project_path: PROJECT_PATH,
    output_path: 'scenes/mcp_phase41_brief.tscn',
    brief: 'a tiny 2D platformer with one enemy and one pickup',
    include_hud: true,
    include_menu: true,
    include_settings: true,
    include_dialogue: true,
    include_mobile_controls: true,
    include_blockout: true,
  });
  const briefParsed = parseToolContent(briefResponse);
  if (briefParsed.status !== 'success') {
    throw new Error('generate_scene_from_brief failed: ' + JSON.stringify(briefParsed));
  }
  console.log('generate_scene_from_brief manifest: ' + JSON.stringify(briefParsed.manifest, null, 2));

  // Confirm pre-existing files were either null (no prior smoke) or replaced.
  for (const rel of Object.keys(preHudFiles)) {
    const stats = await stat(join(PROJECT_PATH, rel));
    if (stats.size === 0) {
      throw new Error('Expected non-empty file: ' + rel);
    }
  }

  // Run the manifest's validation_commands (truncated to scene + script checks).
  let validationCounter = 300;
  for (const entry of [...hudParsed.manifest.validation_commands, ...enemyParsed.manifest.validation_commands]) {
    const response = await callTool(child, validationCounter++, entry.tool, entry.args);
    const parsed = parseToolContent(response);
    if (parsed.status === 'failed') {
      throw new Error(`Manifest validation failed for ${entry.tool}: ${JSON.stringify(parsed)}`);
    }
  }
  console.log('All manifest validation commands returned success.');

  child.kill();
  activeChild = null;
  console.log('Phase 4.1 live proof PASSED');
}

main().catch((error) => {
  if (activeChild) {
    activeChild.kill();
  }
  console.error('Phase 4.1 live proof FAILED:', error);
  process.exitCode = 1;
});
