import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';

const PHASE_24_TOOLS = [
  'live_scene_get_hierarchy',
  'live_node_get_properties',
  'live_node_set_property',
  'live_node_create',
  'live_node_delete',
  'live_node_duplicate',
  'live_node_reparent',
  'live_node_rename',
  'live_node_connect_signal',
  'live_node_disconnect_signal',
  'live_scene_mark_dirty',
  'live_scene_save',
];

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-mutate-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveMutate"\n');
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

test('Phase 2.4 live scene mutation tools register with the registry', () => {
  const registry = createRegistry(new LiveSessionManager());
  for (const name of PHASE_24_TOOLS) {
    assert.equal(registry.has(name), true, `${name} should be registered`);
  }
});

test('Phase 2.4 live scene mutation tools dispatch expected live commands', async () => {
  await withProject(async (projectPath) => {
    const cases = [
      {
        toolName: 'live_scene_get_hierarchy',
        args: { max_depth: 4, include_properties: true },
        expectedArgs: { max_depth: 4, include_properties: true },
        data: { hierarchy: [{ path: '.', name: 'Root', type: 'Node2D' }] },
      },
      {
        toolName: 'live_node_get_properties',
        args: { node_path: 'TestSprite', property_names: ['visible', 'position'] },
        expectedArgs: { node_path: 'TestSprite', property_names: ['visible', 'position'] },
        data: { path: 'TestSprite', properties: { visible: true } },
      },
      {
        toolName: 'live_node_set_property',
        args: { node_path: 'TestSprite', property_name: 'visible', property_value: false },
        expectedArgs: { node_path: 'TestSprite', property_name: 'visible', property_value: false },
        data: { path: 'TestSprite', property_name: 'visible', old_value: true, new_value: false, marked_dirty: true },
      },
      {
        toolName: 'live_node_create',
        args: { parent_path: '.', node_type: 'Node2D', node_name: 'McpPhase24Node', properties: { visible: true } },
        expectedArgs: { parent_path: '.', node_type: 'Node2D', node_name: 'McpPhase24Node', properties: { visible: true } },
        data: { path: 'McpPhase24Node', type: 'Node2D', created: true },
      },
      {
        toolName: 'live_node_delete',
        args: { node_path: 'McpPhase24Node', keep_children: false },
        expectedArgs: { node_path: 'McpPhase24Node', keep_children: false },
        data: { deleted: true, path: 'McpPhase24Node' },
      },
      {
        toolName: 'live_node_duplicate',
        args: { node_path: 'TestSprite', new_name: 'TestSpriteCopy' },
        expectedArgs: { node_path: 'TestSprite', new_name: 'TestSpriteCopy' },
        data: { duplicated: true, original_path: 'TestSprite', new_path: 'TestSpriteCopy' },
      },
      {
        toolName: 'live_node_reparent',
        args: { node_path: 'TestSpriteCopy', new_parent_path: 'NewParent', keep_global_transform: true },
        expectedArgs: { node_path: 'TestSpriteCopy', new_parent_path: 'NewParent', keep_global_transform: true },
        data: { reparented: true, old_path: 'TestSpriteCopy', new_path: 'NewParent/TestSpriteCopy' },
      },
      {
        toolName: 'live_node_rename',
        args: { node_path: 'NewParent/TestSpriteCopy', new_name: 'RenamedCopy' },
        expectedArgs: { node_path: 'NewParent/TestSpriteCopy', new_name: 'RenamedCopy' },
        data: { renamed: true, old_path: 'NewParent/TestSpriteCopy', new_path: 'NewParent/RenamedCopy' },
      },
      {
        toolName: 'live_node_connect_signal',
        args: {
          source_node_path: 'TestButton',
          signal_name: 'pressed',
          target_node_path: '.',
          method_name: '_on_test_button_pressed',
          flags: 0,
          binds: ['phase24'],
        },
        expectedArgs: {
          source_node_path: 'TestButton',
          signal_name: 'pressed',
          target_node_path: '.',
          method_name: '_on_test_button_pressed',
          flags: 0,
          binds: ['phase24'],
        },
        data: { connected: true },
      },
      {
        toolName: 'live_node_disconnect_signal',
        args: {
          source_node_path: 'TestButton',
          signal_name: 'pressed',
          target_node_path: '.',
          method_name: '_on_test_button_pressed',
        },
        expectedArgs: {
          source_node_path: 'TestButton',
          signal_name: 'pressed',
          target_node_path: '.',
          method_name: '_on_test_button_pressed',
        },
        data: { disconnected: true },
      },
      {
        toolName: 'live_scene_mark_dirty',
        args: {},
        expectedArgs: {},
        data: { marked_dirty: true },
      },
      {
        toolName: 'live_scene_save',
        args: {},
        expectedArgs: {},
        data: { saved: true, scene_path: 'res://tier1_test_scene.tscn' },
      },
    ];

    for (const item of cases) {
      const sent = [];
      const manager = new LiveSessionManager({ now: () => 2400 });
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
