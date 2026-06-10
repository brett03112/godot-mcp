// Phase 5.1 live configuration proof.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';
const CONFIG_FILE = `${PROJECT_PATH}/.godot-mcp/config.json`;

let activeChild = null;
let originalConfig = null;

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

async function startInitializedChild(extraEnv = {}, name = 'phase51-proof') {
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

async function rememberConfig() {
  originalConfig = existsSync(CONFIG_FILE) ? await readFile(CONFIG_FILE, 'utf8') : null;
}

async function restoreConfig() {
  if (originalConfig === null) {
    await rm(CONFIG_FILE, { force: true });
  } else {
    await mkdir(`${PROJECT_PATH}/.godot-mcp`, { recursive: true });
    await writeFile(CONFIG_FILE, originalConfig, 'utf8');
  }
}

async function proveDefaultCatalogAndConfig() {
  const child = await startInitializedChild({}, 'phase51-default-proof');
  try {
    const tools = await listTools(child, 2);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    if (!toolNames.includes('live_config_status')) {
      throw new Error('live_config_status was not exposed.');
    }
    if (toolNames.length !== 344) {
      throw new Error(`Expected 344 default tools, got ${toolNames.length}`);
    }

    const resources = await listResources(child, 3);
    if (resources.result.resources.length !== 353) {
      throw new Error(`Expected 353 default resources, got ${resources.result.resources.length}`);
    }

    const status = parseToolContent(await callTool(child, 4, 'live_config_status', {
      project_path: PROJECT_PATH,
    }));
    if (status.status !== 'success') {
      throw new Error('Default live_config_status failed: ' + JSON.stringify(status));
    }
    if (status.config.live.host !== '127.0.0.1' || status.config.live.port !== 6010) {
      throw new Error('Default live config is not local-only on port 6010: ' + JSON.stringify(status));
    }
    if (status.config.eval.enabled !== false) {
      throw new Error('Default eval config was not disabled: ' + JSON.stringify(status));
    }
    console.log('Default catalog exposed 344 tools, 353 resources, and safe live config defaults.');
  } finally {
    stopChild(child);
  }
}

async function proveInvalidEnvRedaction() {
  const child = await startInitializedChild({
    GODOT_MCP_LIVE_HOST: '0.0.0.0',
    GODOT_MCP_LIVE_PORT: '70000',
    GODOT_MCP_LIVE_SECRET: 'phase51-secret',
  }, 'phase51-invalid-proof');
  try {
    const status = parseToolContent(await callTool(child, 10, 'live_config_status', {
      project_path: PROJECT_PATH,
    }), { allowError: true });
    if (status.status !== 'failed') {
      throw new Error('Invalid config did not fail: ' + JSON.stringify(status));
    }
    if (!status.validation.issues.some((issue) => issue.path === 'live.host')) {
      throw new Error('Invalid config did not report live.host issue: ' + JSON.stringify(status));
    }
    if (JSON.stringify(status).includes('phase51-secret')) {
      throw new Error('live_config_status exposed a shared secret.');
    }
    console.log('Invalid live config returned clear remediation and redacted the shared secret.');
  } finally {
    stopChild(child);
  }
}

async function proveProjectConfigOverlay() {
  await mkdir(`${PROJECT_PATH}/.godot-mcp`, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify({
    live: {
      port: 6123,
      allowed_project_paths: ['.'],
    },
    eval: {
      enabled: true,
      approval_token: 'phase51-approval',
    },
    log_retention_days: 7,
    screenshot_output_dir: '.godot-mcp/phase51-screens',
    stale_session_timeout_ms: 26000,
  }, null, 2), 'utf8');

  const child = await startInitializedChild({}, 'phase51-project-config-proof');
  try {
    const status = parseToolContent(await callTool(child, 20, 'live_config_status', {
      project_path: PROJECT_PATH,
    }));
    const allowed = status.config.live.allowed_project_paths.map((entry) => entry.replaceAll('\\', '/'));
    if (status.config.live.port !== 6123 || !allowed.includes(PROJECT_PATH)) {
      throw new Error('Project config overlay did not apply live settings: ' + JSON.stringify(status));
    }
    if (status.config.eval.enabled !== true || status.config.eval.approval_token_configured !== true) {
      throw new Error('Project config overlay did not apply eval settings: ' + JSON.stringify(status));
    }
    if (JSON.stringify(status).includes('phase51-approval')) {
      throw new Error('live_config_status exposed the approval token.');
    }
    console.log('Project .godot-mcp/config.json overlay applied and redacted sensitive values.');
  } finally {
    stopChild(child);
  }
}

async function main() {
  process.on('exit', cleanupProcess);
  await rememberConfig();
  try {
    await proveDefaultCatalogAndConfig();
    await proveInvalidEnvRedaction();
    await proveProjectConfigOverlay();
  } finally {
    cleanupProcess();
    await restoreConfig();
  }
}

main().catch((error) => {
  cleanupProcess();
  console.error(error);
  process.exit(1);
});
