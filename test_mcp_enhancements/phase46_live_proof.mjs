// Phase 4.6 addon and external tool manager proof.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const PROJECT_FILE = join(PROJECT_PATH, 'project.godot');
const EXTERNAL_CONFIG = join(PROJECT_PATH, '.godot-mcp', 'external_tools.json');
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';
const PHASE_ADDON = 'mcp_phase46_plugin';
let activeChild = null;
let projectFileSnapshot = null;
let externalConfigSnapshot = null;
let externalConfigExisted = false;

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
    const cleanupListeners = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
    };
    const onError = (error) => {
      cleanupListeners();
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
          cleanupListeners();
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

function snapshotState() {
  projectFileSnapshot = readFileSync(PROJECT_FILE, 'utf8');
  externalConfigExisted = existsSync(EXTERNAL_CONFIG);
  externalConfigSnapshot = externalConfigExisted ? readFileSync(EXTERNAL_CONFIG, 'utf8') : null;
}

function restoreState() {
  if (projectFileSnapshot !== null) {
    writeFileSync(PROJECT_FILE, projectFileSnapshot);
  }
  if (externalConfigExisted) {
    mkdirSync(dirname(EXTERNAL_CONFIG), { recursive: true });
    writeFileSync(EXTERNAL_CONFIG, externalConfigSnapshot);
  } else {
    rmSync(EXTERNAL_CONFIG, { force: true });
  }
}

function cleanup() {
  for (const relPath of [
    `addons/${PHASE_ADDON}`,
    '.godot-mcp/phase46_source_v1',
    '.godot-mcp/phase46_source_v2',
    '.godot-mcp/phase46_tools',
  ]) {
    rmSync(join(PROJECT_PATH, relPath), { recursive: true, force: true });
  }
}

function seedSourceAddon(rootRelPath, version) {
  writeProjectFile(`${rootRelPath}/addons/${PHASE_ADDON}/plugin.cfg`, [
    '[plugin]',
    'name="MCP Phase 4.6 Proof"',
    'description="Disposable addon manager proof fixture"',
    'author="Codex"',
    `version="${version}"`,
    'script="plugin.gd"',
    '',
  ].join('\n'));
  writeProjectFile(`${rootRelPath}/addons/${PHASE_ADDON}/plugin.gd`, '@tool\nextends EditorPlugin\n');
}

function createAssetApiServer() {
  const server = createServer((request, response) => {
    if (request.url === '/asset/460') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        asset_id: 460,
        title: 'MCP Phase 4.6 Proof',
        author: 'Codex',
        category: 'Tools',
        version_string: '1.0.0',
        godot_version: '4.6',
        download_url: 'https://example.invalid/mcp-phase46.zip',
        browse_url: 'https://godotengine.org/asset-library/asset/460',
      }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  });
  return server;
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function main() {
  snapshotState();
  cleanup();
  seedSourceAddon('.godot-mcp/phase46_source_v1', '1.0.0');
  seedSourceAddon('.godot-mcp/phase46_source_v2', '1.1.0');
  writeProjectFile('.godot-mcp/phase46_tools/blender.exe', 'fixture');

  const apiServer = createAssetApiServer();
  const apiBaseUrl = await listen(apiServer);
  const child = startChild();
  activeChild = child;

  try {
    await request(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase46-proof', version: '1.0.0' },
      },
    });
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    const required = [
      'addon_disable',
      'addon_enable',
      'addon_health_check',
      'addon_list',
      'asset_library_get_details',
      'asset_library_install_addon',
      'asset_library_remove_addon',
      'asset_library_update_addon',
      'external_tool_configure',
      'external_tool_status',
    ];
    const tools = await listTools(child, 2);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    const missing = required.filter((name) => !toolNames.includes(name));
    if (missing.length > 0) {
      throw new Error('Missing tools: ' + missing.join(', '));
    }
    console.log('tools/list returned ' + toolNames.length + ' tools including all 10 Phase 4.6 tools.');

    const details = parseToolContent(await callTool(child, 10, 'asset_library_get_details', {
      asset_id: 460,
      api_base_url: apiBaseUrl,
    }));
    if (details.status !== 'success' || details.asset.title !== 'MCP Phase 4.6 Proof') {
      throw new Error('asset_library_get_details failed: ' + JSON.stringify(details));
    }

    const install = parseToolContent(await callTool(child, 11, 'asset_library_install_addon', {
      project_path: PROJECT_PATH,
      source_directory: join(PROJECT_PATH, '.godot-mcp/phase46_source_v1'),
      addon_ids: [PHASE_ADDON],
      auto_enable: true,
    }));
    if (install.status !== 'success' || install.installed_addons[0].id !== PHASE_ADDON || !existsSync(join(PROJECT_PATH, 'addons', PHASE_ADDON, 'plugin.cfg'))) {
      throw new Error('asset_library_install_addon failed: ' + JSON.stringify(install));
    }

    const list = parseToolContent(await callTool(child, 12, 'addon_list', {
      project_path: PROJECT_PATH,
      include_health: true,
      include_adapters: true,
    }));
    const installed = list.addons.find((addon) => addon.id === PHASE_ADDON);
    if (!installed || installed.enabled !== true || installed.health.status !== 'success') {
      throw new Error('addon_list failed to see enabled fixture: ' + JSON.stringify(list));
    }

    const disable = parseToolContent(await callTool(child, 13, 'addon_disable', {
      project_path: PROJECT_PATH,
      addon_id: PHASE_ADDON,
    }));
    const enable = parseToolContent(await callTool(child, 14, 'addon_enable', {
      project_path: PROJECT_PATH,
      addon_id: PHASE_ADDON,
    }));
    if (disable.enabled !== false || enable.enabled !== true) {
      throw new Error('addon enable/disable failed: ' + JSON.stringify({ disable, enable }));
    }

    const health = parseToolContent(await callTool(child, 15, 'addon_health_check', {
      project_path: PROJECT_PATH,
      addon_id: PHASE_ADDON,
    }));
    if (health.status !== 'success' || health.addons[0].checks.some((check) => !check.ok)) {
      throw new Error('addon_health_check failed: ' + JSON.stringify(health));
    }

    const update = parseToolContent(await callTool(child, 16, 'asset_library_update_addon', {
      project_path: PROJECT_PATH,
      source_directory: join(PROJECT_PATH, '.godot-mcp/phase46_source_v2'),
      addon_ids: [PHASE_ADDON],
    }));
    if (update.status !== 'success') {
      throw new Error('asset_library_update_addon failed: ' + JSON.stringify(update));
    }
    const afterUpdate = parseToolContent(await callTool(child, 17, 'addon_list', {
      project_path: PROJECT_PATH,
    }));
    if (afterUpdate.addons.find((addon) => addon.id === PHASE_ADDON).version !== '1.1.0') {
      throw new Error('updated addon version not visible: ' + JSON.stringify(afterUpdate));
    }

    const adapterStatus = parseToolContent(await callTool(child, 18, 'external_tool_status', {
      project_path: PROJECT_PATH,
      include_adapters: true,
    }));
    for (const toolId of ['gut', 'gdunit4', 'godot_jolt', 'dialogic', 'limboai', 'aseprite', 'blender', 'ldtk_tiled']) {
      if (!adapterStatus.tools.some((tool) => tool.tool_id === toolId)) {
        throw new Error('Missing adapter definition: ' + toolId);
      }
    }

    const configured = parseToolContent(await callTool(child, 19, 'external_tool_configure', {
      project_path: PROJECT_PATH,
      tool_id: 'blender',
      executable_path: join(PROJECT_PATH, '.godot-mcp/phase46_tools/blender.exe'),
      args: ['--background'],
      enabled: true,
      metadata: { source: 'phase46-proof' },
    }));
    if (configured.status !== 'success' || configured.config.tool_id !== 'blender') {
      throw new Error('external_tool_configure failed: ' + JSON.stringify(configured));
    }

    const blenderStatus = parseToolContent(await callTool(child, 20, 'external_tool_status', {
      project_path: PROJECT_PATH,
      tool_id: 'blender',
    }));
    if (!blenderStatus.tools[0].configured || !blenderStatus.tools[0].executable_exists) {
      throw new Error('external_tool_status failed after configure: ' + JSON.stringify(blenderStatus));
    }

    const remove = parseToolContent(await callTool(child, 21, 'asset_library_remove_addon', {
      project_path: PROJECT_PATH,
      addon_id: PHASE_ADDON,
    }));
    if (remove.status !== 'success' || !remove.removed_files || existsSync(join(PROJECT_PATH, 'addons', PHASE_ADDON))) {
      throw new Error('asset_library_remove_addon failed: ' + JSON.stringify(remove));
    }

    child.kill();
    activeChild = null;
    console.log('Phase 4.6 addon/external tool manager proof PASSED');
  } finally {
    await new Promise((resolve) => apiServer.close(resolve));
    if (activeChild) {
      activeChild.kill();
      activeChild = null;
    }
    restoreState();
    cleanup();
  }
}

main().catch((error) => {
  console.error('Phase 4.6 addon/external tool manager proof FAILED:', error);
  process.exitCode = 1;
});
