// Phase 5.3 documentation proof.

import { spawn } from 'node:child_process';

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

function parseToolContent(result, { allowError = false } = {}) {
  if (result.error) {
    throw new Error('Tool call returned JSON-RPC error: ' + JSON.stringify(result.error));
  }
  if (!result.result || !Array.isArray(result.result.content)) {
    throw new Error('No content in tool response: ' + JSON.stringify(result));
  }
  const parsed = JSON.parse(result.result.content[0]?.text ?? '{}');
  if (result.result.isError && !allowError) {
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
      clientInfo: { name: 'phase53-proof', version: '1.0.0' },
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
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    for (const toolName of [
      'live_config_status',
      'live_addon_status',
      'live_addon_install',
      'live_addon_enable',
      'toolset_status',
      'session_list',
      'editor_state',
      'lsp_status',
      'dap_status',
    ]) {
      if (!toolNames.includes(toolName)) throw new Error(`${toolName} was not exposed.`);
    }
    if (toolNames.length !== 350) throw new Error(`Expected 350 default tools, got ${toolNames.length}`);

    const resources = await request(child, { jsonrpc: '2.0', id: 3, method: 'resources/list' });
    if (resources.result.resources.length !== 359) {
      throw new Error(`Expected 359 default resources, got ${resources.result.resources.length}`);
    }

    const config = parseToolContent(await callTool(child, 4, 'live_config_status', {
      project_path: PROJECT_PATH,
    }));
    if (config.config.live.host !== '127.0.0.1' || config.config.eval.enabled !== false) {
      throw new Error('live_config_status did not report safe defaults: ' + JSON.stringify(config));
    }

    const addonStatus = parseToolContent(await callTool(child, 5, 'live_addon_status', {
      project_path: PROJECT_PATH,
      godot_version: '4.6.3',
    }));
    if (!addonStatus.installed || !addonStatus.enabled || addonStatus.compatibility.compatible !== true) {
      throw new Error('live_addon_status did not report installed/enabled/compatible: ' + JSON.stringify(addonStatus));
    }

    const toolset = parseToolContent(await callTool(child, 6, 'toolset_status', {
      project_path: PROJECT_PATH,
    }));
    if (toolset.mode !== 'all' || toolset.loaded_tool_count !== 350) {
      throw new Error('toolset_status did not report the full default catalog: ' + JSON.stringify(toolset));
    }

    console.log('Phase 5.3 proof exposed 350 tools, 359 resources, and called live_config_status, live_addon_status, and toolset_status.');
  } finally {
    cleanupProcess();
  }
}

main().catch((error) => {
  cleanupProcess();
  console.error(error);
  process.exit(1);
});
