// Phase 5.2 live addon installer proof.

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
      clientInfo: { name: 'phase52-proof', version: '1.0.0' },
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
      'live_addon_install',
      'live_addon_update',
      'live_addon_remove',
      'live_addon_status',
      'live_addon_enable',
      'live_addon_disable',
    ]) {
      if (!toolNames.includes(toolName)) throw new Error(`${toolName} was not exposed.`);
    }
    if (toolNames.length !== 350) throw new Error(`Expected 350 default tools, got ${toolNames.length}`);

    const resources = await request(child, { jsonrpc: '2.0', id: 3, method: 'resources/list' });
    if (resources.result.resources.length !== 359) {
      throw new Error(`Expected 359 default resources, got ${resources.result.resources.length}`);
    }

    const baseArgs = { project_path: PROJECT_PATH, godot_version: '4.6.3' };
    const status = parseToolContent(await callTool(child, 4, 'live_addon_status', baseArgs));
    if (!status.installed || !status.enabled || status.compatibility.compatible !== true) {
      throw new Error('Initial live_addon_status did not report installed/enabled/compatible: ' + JSON.stringify(status));
    }

    const dryInstall = parseToolContent(await callTool(child, 5, 'live_addon_install', {
      ...baseArgs,
      overwrite: true,
      enable: true,
      dry_run: true,
    }));
    if (dryInstall.status !== 'dry_run' || dryInstall.planned_files.length === 0) {
      throw new Error('live_addon_install dry-run did not return planned files: ' + JSON.stringify(dryInstall));
    }

    const updated = parseToolContent(await callTool(child, 6, 'live_addon_update', baseArgs));
    if (updated.status !== 'success' || updated.up_to_date !== true) {
      throw new Error('live_addon_update did not complete cleanly: ' + JSON.stringify(updated));
    }

    for (const [id, name] of [
      [7, 'live_addon_remove'],
      [8, 'live_addon_disable'],
      [9, 'live_addon_enable'],
    ]) {
      const result = parseToolContent(await callTool(child, id, name, {
        project_path: PROJECT_PATH,
        dry_run: true,
      }));
      if (result.status !== 'dry_run') {
        throw new Error(`${name} dry-run was not callable: ${JSON.stringify(result)}`);
      }
    }

    const finalStatus = parseToolContent(await callTool(child, 10, 'live_addon_status', baseArgs));
    if (!finalStatus.installed || !finalStatus.enabled) {
      throw new Error('Final live addon status was not installed and enabled: ' + JSON.stringify(finalStatus));
    }
    console.log('Phase 5.2 proof exposed 350 tools, 359 resources, and called all six live_addon_* tools.');
  } finally {
    cleanupProcess();
  }
}

main().catch((error) => {
  cleanupProcess();
  console.error(error);
  process.exit(1);
});
