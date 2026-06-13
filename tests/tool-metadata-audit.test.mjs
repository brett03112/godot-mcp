import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { TOOLSET_KEYS } from '../build/toolsets.js';

const BUILD_INDEX = join(process.cwd(), 'build', 'index.js');
const RISK_KEYS = ['low', 'medium', 'high'];

function send(child, message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

function waitForId(child, id, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let stderr = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for response id ${id}. stderr=${stderr}`));
    }, timeoutMs);
    timer.unref?.();

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onStderr);
      child.off('error', onError);
      child.off('exit', onExit);
    };

    const onStderr = (chunk) => {
      stderr += chunk.toString('utf8');
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`MCP server exited before response id ${id}. code=${code} stderr=${stderr}`));
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
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

async function request(child, message, timeoutMs) {
  const response = waitForId(child, message.id, timeoutMs);
  send(child, message);
  return response;
}

async function listBuiltTools() {
  const child = spawn(process.execPath, [BUILD_INDEX], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GODOT_PATH: process.env.GODOT_PATH || 'C:/Users/brett/Desktop/Godot/Godot.exe',
    },
    windowsHide: true,
  });

  try {
    const initialize = await request(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase-7-1-metadata-audit', version: '1.0.0' },
      },
    });
    assert.equal(initialize.error, undefined);

    send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    const listed = await request(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(listed.error, undefined);
    return listed.result.tools;
  } finally {
    child.kill();
  }
}

function mapByName(tools) {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function expectMetadata(tool, expected) {
  assert.ok(tool, `Missing tool ${expected.name}`);
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'name') continue;
    assert.deepEqual(tool.metadata[key], value, `${tool.name}.${key}`);
  }
}

test('registered tool catalog has complete audited metadata', async () => {
  const tools = await listBuiltTools();
  const names = new Set();
  const knownToolsets = new Set(TOOLSET_KEYS);

  assert.equal(tools.length >= 350, true);
  for (const tool of tools) {
    assert.equal(names.has(tool.name), false, `Duplicate tool name: ${tool.name}`);
    names.add(tool.name);

    assert.equal(typeof tool.metadata?.toolset, 'string', `${tool.name} toolset`);
    assert.equal(knownToolsets.has(tool.metadata.toolset), true, `${tool.name} unknown toolset ${tool.metadata.toolset}`);
    assert.equal(RISK_KEYS.includes(tool.metadata.risk), true, `${tool.name} unknown risk ${tool.metadata.risk}`);
    assert.equal(typeof tool.metadata.mutates, 'boolean', `${tool.name} mutates`);
    assert.equal(typeof tool.metadata.requires_live, 'boolean', `${tool.name} requires_live`);
    assert.equal(typeof tool.metadata.requires_display, 'boolean', `${tool.name} requires_display`);
    assert.equal(Array.isArray(tool.metadata.aliases), true, `${tool.name} aliases`);
  }
});

test('representative Phase 7.1 metadata corrections are explicit', async () => {
  const byName = mapByName(await listBuiltTools());

  expectMetadata(byName.get('editor_screenshot'), {
    name: 'editor_screenshot',
    toolset: 'live',
    risk: 'low',
    mutates: false,
    requires_live: true,
    requires_display: true,
  });
  expectMetadata(byName.get('runtime_profile_capture'), {
    name: 'runtime_profile_capture',
    toolset: 'runtime',
    risk: 'low',
    mutates: false,
    requires_live: true,
    requires_display: true,
  });
  expectMetadata(byName.get('start_profiler'), {
    name: 'start_profiler',
    toolset: 'quality',
    risk: 'high',
    mutates: true,
    requires_live: false,
    requires_display: true,
    deprecated: true,
    alias_for: 'profiler',
  });
  expectMetadata(byName.get('get_profiling_data'), {
    name: 'get_profiling_data',
    toolset: 'quality',
    risk: 'low',
    mutates: false,
    requires_live: false,
    requires_display: false,
    deprecated: true,
    alias_for: 'profiler',
  });
  expectMetadata(byName.get('analyze_bottlenecks'), {
    name: 'analyze_bottlenecks',
    toolset: 'quality',
    risk: 'low',
    mutates: false,
    requires_live: false,
    requires_display: false,
    deprecated: true,
    alias_for: 'profiler',
  });

  for (const name of ['asset_library_install_addon', 'asset_library_update_addon', 'asset_library_remove_addon']) {
    expectMetadata(byName.get(name), {
      name,
      toolset: 'project',
      risk: 'high',
      mutates: true,
      requires_live: false,
      requires_display: false,
    });
  }

  expectMetadata(byName.get('filesystem_reimport'), {
    name: 'filesystem_reimport',
    toolset: 'project',
    risk: 'medium',
    mutates: true,
    requires_live: false,
    requires_display: false,
  });
  expectMetadata(byName.get('live_addon_status'), {
    name: 'live_addon_status',
    toolset: 'project',
    risk: 'low',
    mutates: false,
    requires_live: false,
    requires_display: false,
  });

  for (const name of ['editor_filesystem_scan', 'editor_filesystem_reimport', 'editor_resource_uid_update']) {
    expectMetadata(byName.get(name), {
      name,
      toolset: 'live',
      risk: 'high',
      mutates: true,
      requires_live: true,
      requires_display: false,
    });
  }
});
