// Phase 5.4 non-live smoke harness.

import { spawn } from 'node:child_process';

const PROJECT_PATH = process.env.GODOT_MCP_PROJECT_PATH || 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = [process.env.GODOT_MCP_BUILD_INDEX || 'C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = process.env.GODOT_PATH || 'C:/Users/brett/Desktop/Godot/Godot.exe';

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
      cleanupProcess();
      reject(new Error(`Timed out waiting for response id ${id}`));
    }, timeoutMs);
    timer.unref?.();
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

function callTool(child, id, name, args, timeoutMs = 30000) {
  return request(child, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  }, timeoutMs);
}

function parseToolContent(result) {
  if (result.error) {
    throw new Error('Tool call returned JSON-RPC error: ' + JSON.stringify(result.error));
  }
  if (!result.result || !Array.isArray(result.result.content)) {
    throw new Error('No content in tool response: ' + JSON.stringify(result));
  }
  const parsed = JSON.parse(result.result.content[0]?.text ?? '{}');
  if (result.result.isError) {
    throw new Error('Tool returned error content: ' + JSON.stringify(parsed));
  }
  return parsed;
}

async function startInitializedChild() {
  const child = spawn(MCP_COMMAND, MCP_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GODOT_PATH,
    },
  });
  activeChild = child;
  child.stderr.on('data', (chunk) => process.stderr.write(`[mcp-stderr] ${chunk.toString('utf8')}`));
  await request(child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'phase54-non-live-smoke', version: '1.0.0' },
    },
  });
  send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  return child;
}

function cleanupProcess() {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
}

async function main() {
  process.on('exit', cleanupProcess);
  const child = await startInitializedChild();
  try {
    const tools = await request(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const toolNames = tools.result.tools.map((tool) => tool.name);
    for (const toolName of ['project_settings_get', 'filesystem_search', 'validate_scene', 'toolset_status']) {
      if (!toolNames.includes(toolName)) throw new Error(`${toolName} was not exposed.`);
    }

    const settings = parseToolContent(await callTool(child, 3, 'project_settings_get', {
      project_path: PROJECT_PATH,
      setting_paths: ['application/config/name'],
    }));
    if (settings.settings?.['application/config/name']?.value !== 'Test_MCP_Enhancements') {
      throw new Error('project_settings_get returned unexpected project name: ' + JSON.stringify(settings));
    }

    const search = parseToolContent(await callTool(child, 4, 'filesystem_search', {
      project_path: PROJECT_PATH,
      glob: 'tier1_test_scene.tscn',
      max_results: 5,
    }));
    const files = search.matches || search.results || [];
    if (!JSON.stringify(files).includes('tier1_test_scene.tscn')) {
      throw new Error('filesystem_search did not find tier1_test_scene.tscn: ' + JSON.stringify(search));
    }

    const validation = parseToolContent(await callTool(child, 5, 'validate_scene', {
      project_path: PROJECT_PATH,
      scene_path: 'tier1_test_scene.tscn',
    }));
    if (validation.valid !== true && !['success', 'warning'].includes(validation.status)) {
      throw new Error('validate_scene did not return a usable status: ' + JSON.stringify(validation));
    }

    const toolset = parseToolContent(await callTool(child, 6, 'toolset_status', {
      project_path: PROJECT_PATH,
    }));
    if (toolset.loaded_tool_count < 300) {
      throw new Error('toolset_status loaded_tool_count was unexpectedly low: ' + JSON.stringify(toolset));
    }

    console.log(`Phase 5.4 non-live smoke passed with ${toolNames.length} tools; called project_settings_get, filesystem_search, validate_scene, and toolset_status.`);
  } finally {
    cleanupProcess();
  }
}

main().catch((error) => {
  cleanupProcess();
  console.error(error);
  process.exit(1);
});
