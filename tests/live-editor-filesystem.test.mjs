import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';

const PHASE_25_TOOLS = [
  'editor_filesystem_scan',
  'editor_filesystem_reimport',
  'editor_resource_reload',
  'editor_resource_uid_update',
  'editor_open_resource',
  'editor_focus_file',
];

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-fs-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveFilesystem"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function hello(projectPath, overrides = {}) {
  return {
    kind: 'hello',
    session: {
      session_id: overrides.session_id || 'session-1',
      project_path: projectPath,
      godot_version: '4.6.3.stable',
      editor_pid: 4242,
      active_scene: 'res://tier1_test_scene.tscn',
      play_state: 'stopped',
      writable: true,
      connection_state: 'connected',
      last_heartbeat_unix: 1770000000,
      ...overrides,
    },
  };
}

function createRegistry(manager) {
  const registry = new ToolRegistry();
  registerLiveEditorTools(registry, { manager });
  return registry;
}

async function dispatchAndResolve({ manager, registry, sent, toolName, args = {}, data = {}, session = null }) {
  const promise = registry.dispatch(toolName, args);
  await waitForCondition(() => sent.length === 1);
  const outbound = sent[0];

  manager.recordMessage(args.session_id || 'session-1', {
    kind: 'command_response',
    request_id: outbound.request_id,
    status: 'success',
    data,
    session: session || hello(args.project_path || 'C:/tmp/live-project').session,
  });

  return {
    outbound,
    data: parseResponse(await promise),
  };
}

test('Phase 2.5 live editor filesystem tools register with the registry', () => {
  const registry = createRegistry(new LiveSessionManager());
  for (const name of PHASE_25_TOOLS) {
    assert.equal(registry.has(name), true, `${name} should be registered`);
  }
});

test('Phase 2.5 live editor filesystem tools dispatch expected live commands', async () => {
  await withProject(async (projectPath) => {
    const cases = [
      {
        toolName: 'editor_filesystem_scan',
        args: { paths: ['res://mcp_phase25_probe.gd'], wait_for_scan: true },
        expectedArgs: { paths: ['res://mcp_phase25_probe.gd'], wait_for_scan: true },
        data: { scanned: true, paths: ['res://mcp_phase25_probe.gd'], files: [{ path: 'res://mcp_phase25_probe.gd', exists: true }] },
      },
      {
        toolName: 'editor_filesystem_reimport',
        args: { paths: ['res://icon.svg'] },
        expectedArgs: { paths: ['res://icon.svg'] },
        data: { reimported: true, paths: ['res://icon.svg'], files: [{ path: 'res://icon.svg', type: 'SVGTexture' }] },
      },
      {
        toolName: 'editor_resource_reload',
        args: { resource_path: 'res://materials/hologram.tres', cache_mode: 'replace' },
        expectedArgs: { resource_path: 'res://materials/hologram.tres', cache_mode: 'replace' },
        data: { reloaded: true, resource_path: 'res://materials/hologram.tres', type: 'ShaderMaterial' },
      },
      {
        toolName: 'editor_resource_uid_update',
        args: { paths: ['res://coin_v2.gd'] },
        expectedArgs: { paths: ['res://coin_v2.gd'] },
        data: { updated: true, files: [{ path: 'res://coin_v2.gd', uid: 'uid://w7rvduiajdmh' }] },
      },
      {
        toolName: 'editor_open_resource',
        args: { resource_path: 'res://coin_v2.gd' },
        expectedArgs: { resource_path: 'res://coin_v2.gd' },
        data: { opened: true, resource_path: 'res://coin_v2.gd', mode: 'resource' },
      },
      {
        toolName: 'editor_focus_file',
        args: { resource_path: 'res://coin_v2.gd' },
        expectedArgs: { resource_path: 'res://coin_v2.gd' },
        data: { focused: true, resource_path: 'res://coin_v2.gd' },
      },
    ];

    for (const item of cases) {
      const sent = [];
      const manager = new LiveSessionManager({ now: () => 2500 });
      manager.registerHello(hello(projectPath), {
        remoteAddress: '127.0.0.1',
        send: (payload) => sent.push(payload),
      });
      const registry = createRegistry(manager);

      const result = await dispatchAndResolve({
        manager,
        registry,
        sent,
        toolName: item.toolName,
        args: { session_id: 'session-1', project_path: projectPath, ...item.args },
        session: hello(projectPath).session,
        data: item.data,
      });

      assert.equal(result.outbound.kind, 'command');
      assert.equal(result.outbound.command, item.toolName);
      assert.equal(result.outbound.args.project_path, resolve(projectPath));
      for (const [key, value] of Object.entries(item.expectedArgs)) {
        assert.deepEqual(result.outbound.args[key], value, `${item.toolName} should forward ${key}`);
      }
      assert.equal(result.data.status, 'success');
      assert.equal(result.data.session.session_id, 'session-1');
    }
  });
});

async function waitForCondition(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  }
  throw new Error('Timed out waiting for condition.');
}
