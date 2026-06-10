// Phase 4.5 asset pipeline proof.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';
let activeChild = null;

function send(child, message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

function request(child, message, timeoutMs = 30000) {
  const response = waitForId(child, message.id, timeoutMs);
  send(child, message);
  return response;
}

function waitForId(child, id, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for response id ${id}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
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

function callTool(child, id, name, args, timeoutMs = 60000) {
  return request(child, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  }, timeoutMs);
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

function writeProjectFile(relPath, content) {
  const absolute = join(PROJECT_PATH, relPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function cleanup() {
  for (const relPath of [
    'assets/mcp_phase45_sprite.png',
    'assets/mcp_phase45_sprite.png.import',
    'assets/mcp_phase45_sprite.png.license',
    'audio/mcp_phase45_music.wav',
    'audio/mcp_phase45_music.wav.import',
    'models/mcp_phase45_model.gltf',
    'models/mcp_phase45_model.gltf.import',
    'scenes/mcp_phase45_usage.tscn',
    '.godot-mcp/import_profiles/phase45-mobile.json',
    '.godot-mcp/phase45_asset_licenses.json',
  ]) {
    rmSync(join(PROJECT_PATH, relPath), { force: true });
  }
}

function seedFiles() {
  cleanup();
  writeProjectFile('assets/mcp_phase45_sprite.png', 'phase45-png');
  writeProjectFile('audio/mcp_phase45_music.wav', 'phase45-wav');
  writeProjectFile('models/mcp_phase45_model.gltf', '{"asset":{}}\n');
  writeProjectFile('assets/mcp_phase45_sprite.png.import', [
    '[remap]',
    'importer="texture"',
    'type="CompressedTexture2D"',
    'uid="uid://phase45sprite"',
    '',
    '[params]',
    'compress/mode=0',
    'mipmaps/generate=false',
    '',
  ].join('\n'));
  writeProjectFile('audio/mcp_phase45_music.wav.import', [
    '[remap]',
    'importer="wav"',
    'type="AudioStreamWAV"',
    'uid="uid://phase45music"',
    '',
    '[params]',
    'edit/loop_mode=0',
    'compress/mode=2',
    '',
  ].join('\n'));
  writeProjectFile('models/mcp_phase45_model.gltf.import', [
    '[remap]',
    'importer="scene"',
    'type="PackedScene"',
    'uid="uid://phase45model"',
    '',
    '[params]',
    'nodes/root_type="Node3D"',
    'meshes/create_shadow_meshes=true',
    '',
  ].join('\n'));
  writeProjectFile('scenes/mcp_phase45_usage.tscn', [
    '[gd_scene format=3]',
    '[ext_resource type="Texture2D" path="res://assets/mcp_phase45_sprite.png" id="1"]',
    '[node name="Sprite2D" type="Sprite2D"]',
    'texture = ExtResource("1")',
    '',
  ].join('\n'));
  writeProjectFile('assets/mcp_phase45_sprite.png.license', 'CC0-1.0\nAuthor: Phase 45 Proof\nSource: generated fixture\n');
}

async function main() {
  seedFiles();

  const child = startChild();
  activeChild = child;
  await request(child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'phase45-proof', version: '1.0.0' },
    },
  });
  send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const required = [
    'asset_batch_reimport',
    'asset_import_profile_apply',
    'asset_import_profile_create',
    'asset_license_manifest',
    'asset_size_budget_report',
    'asset_usage_report',
    'audio_import_settings_get',
    'audio_import_settings_set',
    'model_import_settings_get',
    'model_import_settings_set',
    'texture_import_settings_get',
    'texture_import_settings_set',
  ];
  const tools = await listTools(child, 2);
  const toolNames = tools.result.tools.map((tool) => tool.name).sort();
  const missing = required.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error('Missing tools: ' + missing.join(', '));
  }
  console.log('tools/list returned ' + toolNames.length + ' tools including all 12 Phase 4.5 tools.');

  const profile = parseToolContent(await callTool(child, 10, 'asset_import_profile_create', {
    project_path: PROJECT_PATH,
    profile_name: 'phase45-mobile',
    texture_settings: { 'compress/mode': 2, 'mipmaps/generate': true },
    audio_settings: { 'compress/mode': 1 },
    model_settings: { 'meshes/create_shadow_meshes': false },
  }));
  if (profile.status !== 'success' || !existsSync(join(PROJECT_PATH, '.godot-mcp/import_profiles/phase45-mobile.json'))) {
    throw new Error('asset_import_profile_create failed: ' + JSON.stringify(profile));
  }

  const apply = parseToolContent(await callTool(child, 11, 'asset_import_profile_apply', {
    project_path: PROJECT_PATH,
    profile_name: 'phase45-mobile',
    asset_paths: [
      'assets/mcp_phase45_sprite.png',
      'audio/mcp_phase45_music.wav',
      'models/mcp_phase45_model.gltf',
    ],
  }));
  if (apply.status !== 'success' || apply.applied_assets.length !== 3) {
    throw new Error('asset_import_profile_apply failed: ' + JSON.stringify(apply));
  }

  const texture = parseToolContent(await callTool(child, 12, 'texture_import_settings_get', {
    project_path: PROJECT_PATH,
    asset_path: 'assets/mcp_phase45_sprite.png',
  }));
  if (texture.status !== 'success' || texture.settings['compress/mode'] !== 2 || texture.settings['mipmaps/generate'] !== true) {
    throw new Error('texture_import_settings_get failed after apply: ' + JSON.stringify(texture));
  }

  const textureSet = parseToolContent(await callTool(child, 13, 'texture_import_settings_set', {
    project_path: PROJECT_PATH,
    asset_path: 'assets/mcp_phase45_sprite.png',
    settings: { 'compress/mode': 0 },
  }));
  if (textureSet.status !== 'success' || !textureSet.changed_keys.includes('compress/mode')) {
    throw new Error('texture_import_settings_set failed: ' + JSON.stringify(textureSet));
  }

  const audioSet = parseToolContent(await callTool(child, 14, 'audio_import_settings_set', {
    project_path: PROJECT_PATH,
    asset_path: 'audio/mcp_phase45_music.wav',
    settings: { 'edit/loop_mode': 1 },
    dry_run: true,
  }));
  const audio = parseToolContent(await callTool(child, 15, 'audio_import_settings_get', {
    project_path: PROJECT_PATH,
    asset_path: 'audio/mcp_phase45_music.wav',
  }));
  if (audioSet.status !== 'success' || audioSet.dry_run !== true || audio.settings['edit/loop_mode'] !== 0) {
    throw new Error('audio import dry-run proof failed: ' + JSON.stringify({ audioSet, audio }));
  }

  const modelSet = parseToolContent(await callTool(child, 16, 'model_import_settings_set', {
    project_path: PROJECT_PATH,
    asset_path: 'models/mcp_phase45_model.gltf',
    settings: { 'nodes/root_type': 'StaticBody3D' },
  }));
  const model = parseToolContent(await callTool(child, 17, 'model_import_settings_get', {
    project_path: PROJECT_PATH,
    asset_path: 'models/mcp_phase45_model.gltf',
  }));
  if (modelSet.status !== 'success' || model.settings['nodes/root_type'] !== 'StaticBody3D') {
    throw new Error('model import settings proof failed: ' + JSON.stringify({ modelSet, model }));
  }

  const usage = parseToolContent(await callTool(child, 18, 'asset_usage_report', {
    project_path: PROJECT_PATH,
    asset_paths: ['assets/mcp_phase45_sprite.png', 'audio/mcp_phase45_music.wav'],
  }));
  if (usage.status !== 'success' || usage.assets[0].reference_count < 1) {
    throw new Error('asset_usage_report failed: ' + JSON.stringify(usage));
  }

  const budget = parseToolContent(await callTool(child, 19, 'asset_size_budget_report', {
    project_path: PROJECT_PATH,
    asset_paths: ['assets/mcp_phase45_sprite.png', 'audio/mcp_phase45_music.wav'],
    max_total_bytes: 1,
    per_asset_budget_bytes: 6,
  }));
  if (budget.status !== 'failed' || budget.violations.length < 2) {
    throw new Error('asset_size_budget_report failed: ' + JSON.stringify(budget));
  }

  const license = parseToolContent(await callTool(child, 20, 'asset_license_manifest', {
    project_path: PROJECT_PATH,
    asset_paths: ['assets/mcp_phase45_sprite.png', 'audio/mcp_phase45_music.wav'],
    output_path: '.godot-mcp/phase45_asset_licenses.json',
    default_license: 'UNKNOWN',
  }));
  if (license.status !== 'success' || license.entries[0].license !== 'CC0-1.0' || !existsSync(join(PROJECT_PATH, '.godot-mcp/phase45_asset_licenses.json'))) {
    throw new Error('asset_license_manifest failed: ' + JSON.stringify(license));
  }

  const reimport = parseToolContent(await callTool(child, 21, 'asset_batch_reimport', {
    project_path: PROJECT_PATH,
    asset_paths: ['assets/mcp_phase45_sprite.png', 'audio/mcp_phase45_music.wav'],
    wait_for_completion: true,
  }, 120000));
  if (reimport.status !== 'success' || reimport.count !== 2) {
    throw new Error('asset_batch_reimport failed: ' + JSON.stringify(reimport));
  }
  console.log('asset_batch_reimport mode: ' + reimport.mode + '.');

  child.kill();
  activeChild = null;
  cleanup();
  console.log('Phase 4.5 asset pipeline proof PASSED');
}

main().catch((error) => {
  if (activeChild) {
    activeChild.kill();
  }
  cleanup();
  console.error('Phase 4.5 asset pipeline proof FAILED:', error);
  process.exitCode = 1;
});
