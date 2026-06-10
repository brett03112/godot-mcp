// Phase 5.0 toolset profile proof.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';
const TOOLSETS_FILE = `${PROJECT_PATH}/.godot-mcp/toolsets.json`;

let activeChild = null;
let originalToolsets = null;

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

function listResources(child, id) {
  return request(child, { jsonrpc: '2.0', id, method: 'resources/list' });
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

async function startInitializedChild(extraEnv = {}, name = 'phase50-proof') {
  const child = startChild(extraEnv);
  activeChild = child;
  await request(child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name, version: '1.0.0' },
    },
  });
  send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  return child;
}

function stopChild(child) {
  if (child) child.kill();
  if (activeChild === child) activeChild = null;
}

function cleanupProcess() {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
}

async function rememberToolsets() {
  originalToolsets = existsSync(TOOLSETS_FILE) ? await readFile(TOOLSETS_FILE, 'utf8') : null;
}

async function restoreToolsets() {
  if (originalToolsets === null) {
    await rm(TOOLSETS_FILE, { force: true });
  } else {
    await mkdir(`${PROJECT_PATH}/.godot-mcp`, { recursive: true });
    await writeFile(TOOLSETS_FILE, originalToolsets, 'utf8');
  }
}

function requireTools(toolNames, required) {
  const missing = required.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error('Missing tools: ' + missing.join(', '));
  }
}

async function proveDefaultCatalog() {
  const child = await startInitializedChild({}, 'phase50-default-proof');
  try {
    const tools = await listTools(child, 2);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    requireTools(toolNames, [
      'toolset_status',
      'recommend_toolset_profile',
      'playtest_recording',
      'profiler',
      'start_playtest_recording',
      'stop_playtest_recording',
      'start_profiler',
      'get_profiling_data',
      'analyze_bottlenecks',
    ]);
    if (toolNames.length !== 343) {
      throw new Error(`Expected 343 default tools, got ${toolNames.length}`);
    }

    const resources = await listResources(child, 3);
    if (resources.result.resources.length !== 352) {
      throw new Error(`Expected 352 default resources, got ${resources.result.resources.length}`);
    }

    let id = 10;
    const status = parseToolContent(await callTool(child, id++, 'toolset_status', {}));
    if (status.loaded_tool_count !== 343 || status.hidden_tool_count !== 0 || status.mode !== 'all') {
      throw new Error('Unexpected default toolset_status: ' + JSON.stringify(status));
    }

    const pause = parseToolContent(await callTool(child, id++, 'recommend_toolset_profile', {
      feature_request: 'add a pause menu',
      project_facts: { has_tests: true, has_live_editor: true },
    }));
    if (!pause.recommended_toolsets.includes('scene') || !pause.recommended_toolsets.includes('script') || !pause.recommended_toolsets.includes('visual')) {
      throw new Error('Pause menu recommendation missed scene/script/visual: ' + JSON.stringify(pause));
    }

    const playtest = parseToolContent(await callTool(child, id++, 'recommend_toolset_profile', {
      feature_request: 'run a playtest and make the level less frustrating',
      project_facts: { has_live_editor: true },
    }));
    if (!playtest.recommended_toolsets.includes('playtest') || !playtest.recommended_toolsets.includes('runtime') || !playtest.recommended_toolsets.includes('quality')) {
      throw new Error('Playtest recommendation missed playtest/runtime/quality: ' + JSON.stringify(playtest));
    }

    const badPlaytest = parseToolContent(await callTool(child, id++, 'playtest_recording', {
      project_path: PROJECT_PATH,
      action: 'pause',
    }), { allowError: true });
    if (badPlaytest.status !== 'failed' || !/start/.test(badPlaytest.reason)) {
      throw new Error('playtest_recording invalid action did not fail clearly: ' + JSON.stringify(badPlaytest));
    }

    const badProfiler = parseToolContent(await callTool(child, id++, 'profiler', {
      project_path: PROJECT_PATH,
      action: 'pause',
    }), { allowError: true });
    if (badProfiler.status !== 'failed' || !/analyze/.test(badProfiler.reason)) {
      throw new Error('profiler invalid action did not fail clearly: ' + JSON.stringify(badProfiler));
    }

    console.log('Default profile exposed 343 tools, 352 resources, status/recommendation tools, and lifecycle aliases.');
  } finally {
    stopChild(child);
  }
}

async function proveToolsetFilter() {
  const child = await startInitializedChild({
    GODOT_MCP_TOOLSETS: 'core,scene',
  }, 'phase50-toolsets-proof');
  try {
    const tools = await listTools(child, 100);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    requireTools(toolNames, ['toolset_status', 'recommend_toolset_profile', 'create_scene', 'validate_scene']);
    if (toolNames.includes('run_automated_playtest') || toolNames.includes('resource_search')) {
      throw new Error('Filtered core,scene catalog exposed unrelated tools.');
    }

    const resources = await listResources(child, 101);
    const resourceUris = resources.result.resources.map((resource) => resource.uri);
    if (resourceUris.includes('godot-mcp://tools/run_automated_playtest')) {
      throw new Error('Filtered resources still exposed run_automated_playtest.');
    }
    if (resourceUris.some((uri) => uri.startsWith('godot-mcp://live/'))) {
      throw new Error('Filtered core,scene resources exposed live resources.');
    }

    let id = 110;
    const status = parseToolContent(await callTool(child, id++, 'toolset_status', {}));
    if (status.mode !== 'filtered' || !status.active_toolsets.includes('scene') || status.hidden_tool_count <= 0) {
      throw new Error('Unexpected filtered toolset_status: ' + JSON.stringify(status));
    }

    const disabled = parseToolContent(await callTool(child, id++, 'run_automated_playtest', {
      project_path: PROJECT_PATH,
    }), { allowError: true });
    if (disabled.status !== 'disabled' || disabled.metadata.toolset !== 'playtest' || !disabled.remediation.env.GODOT_MCP_TOOLSETS.includes('playtest')) {
      throw new Error('Hidden playtest tool did not return remediation: ' + JSON.stringify(disabled));
    }

    console.log(`GODOT_MCP_TOOLSETS=core,scene exposed ${toolNames.length} tools and hid playtest/assets/live resources.`);
  } finally {
    stopChild(child);
  }
}

async function proveExplicitToolFilter() {
  const child = await startInitializedChild({
    GODOT_MCP_TOOLS: 'script_patch,validate_scene',
  }, 'phase50-explicit-proof');
  try {
    const tools = await listTools(child, 200);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    requireTools(toolNames, ['toolset_status', 'recommend_toolset_profile', 'script_patch', 'validate_scene']);
    if (toolNames.includes('create_scene') || toolNames.includes('run_automated_playtest')) {
      throw new Error('Explicit tool catalog exposed non-core, non-explicit tools.');
    }
    const status = parseToolContent(await callTool(child, 210, 'toolset_status', {}));
    if (!status.explicit_tools.includes('script_patch') || !status.explicit_tools.includes('validate_scene')) {
      throw new Error('Explicit profile status missed explicit tools: ' + JSON.stringify(status));
    }
    console.log(`GODOT_MCP_TOOLS explicit profile exposed ${toolNames.length} tools including requested exact tools.`);
  } finally {
    stopChild(child);
  }
}

async function proveProjectNamedProfile() {
  await mkdir(`${PROJECT_PATH}/.godot-mcp`, { recursive: true });
  await writeFile(TOOLSETS_FILE, JSON.stringify({
    profiles: {
      'phase50-scene': {
        toolsets: ['core', 'scene', 'script', 'visual'],
        tools: ['filesystem_search'],
      },
    },
  }, null, 2));

  const child = await startInitializedChild({
    GODOT_MCP_PROJECT_PATH: PROJECT_PATH,
    GODOT_MCP_PROFILE: 'phase50-scene',
  }, 'phase50-named-profile-proof');
  try {
    const tools = await listTools(child, 300);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    requireTools(toolNames, ['toolset_status', 'script_patch', 'capture_editor_viewport', 'filesystem_search']);
    if (toolNames.includes('run_automated_playtest')) {
      throw new Error('Named scene profile exposed run_automated_playtest.');
    }
    const status = parseToolContent(await callTool(child, 310, 'toolset_status', {}));
    if (status.named_profile !== 'phase50-scene' || !status.config_sources.some((source) => source.includes('toolsets.json'))) {
      throw new Error('Named profile status missed config source: ' + JSON.stringify(status));
    }
    console.log(`Project .godot-mcp/toolsets.json profile exposed ${toolNames.length} tools and included configured filesystem_search.`);
  } finally {
    stopChild(child);
  }
}

async function main() {
  await rememberToolsets();
  try {
    await proveDefaultCatalog();
    await proveToolsetFilter();
    await proveExplicitToolFilter();
    await proveProjectNamedProfile();
    console.log('Phase 5.0 toolset profile proof PASSED');
  } finally {
    cleanupProcess();
    await restoreToolsets();
  }
}

main().catch((error) => {
  console.error('Phase 5.0 toolset profile proof FAILED:', error);
  process.exitCode = 1;
});
