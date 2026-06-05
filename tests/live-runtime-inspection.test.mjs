import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';

const phase32Tools = [
  'runtime_get_scene_tree',
  'runtime_get_node_info',
  'runtime_get_node_property',
  'runtime_watch_node',
  'runtime_get_ui_elements',
  'runtime_get_focus_owner',
  'runtime_get_viewport_info',
  'runtime_get_performance_metrics',
  'runtime_get_input_map',
  'runtime_get_groups',
];

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-runtime-inspection-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveRuntimeInspection"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(manager) {
  const registry = new ToolRegistry();
  registerLiveEditorTools(registry, { manager });
  return registry;
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
      play_state: 'playing',
      writable: true,
      connection_state: 'connected',
      last_heartbeat_unix: 1770000000,
      runtime_status: {
        state: 'running',
        active_session_id: 7,
        sessions: [{ session_id: 7, state: 'running', last_message: 'godot_mcp:runtime_ready' }],
      },
      ...overrides,
    },
  };
}

async function dispatchAndResolve({ manager, registry, sent, toolName, args = {}, data = {}, session }) {
  const promise = registry.dispatch(toolName, args);
  await waitForCondition(() => sent.length === 1);
  const outbound = sent[0];

  manager.recordMessage(args.session_id || 'session-1', {
    kind: 'command_response',
    request_id: outbound.request_id,
    status: 'success',
    data,
    session,
  });

  return {
    outbound,
    data: parseResponse(await promise),
  };
}

test('Phase 3.2 runtime inspection tools register with the live registry', () => {
  const registry = createRegistry(new LiveSessionManager());
  for (const toolName of phase32Tools) {
    assert.equal(registry.has(toolName), true, `${toolName} should be registered`);
  }
});

test('runtime inspection tools dispatch matching live commands with arguments', async () => {
  await withProject(async (projectPath) => {
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 3000 });
    const session = hello(projectPath).session;
    manager.registerHello({ kind: 'hello', session }, {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    const registry = createRegistry(manager);

    const cases = [
      {
        toolName: 'runtime_get_scene_tree',
        args: { max_depth: 4, include_properties: true },
        data: { scene: 'res://tier1_test_scene.tscn', root: { name: 'Tier1TestScene' } },
      },
      {
        toolName: 'runtime_get_node_info',
        args: { node_path: '.', include_properties: true, include_groups: true },
        data: { node: { path: '.', name: 'Tier1TestScene', groups: [] } },
      },
      {
        toolName: 'runtime_get_node_property',
        args: { node_path: '.', property: 'name' },
        data: { node_path: '.', property: 'name', value: 'Tier1TestScene' },
      },
      {
        toolName: 'runtime_watch_node',
        args: { node_path: '.', properties: ['name', 'visible'] },
        data: { node_path: '.', properties: { name: 'Tier1TestScene' } },
      },
      {
        toolName: 'runtime_get_ui_elements',
        args: { include_hidden: false, include_disabled: true, max_depth: 6 },
        data: { controls: [{ path: 'CanvasLayer/Button', text: 'Start', visible: true }] },
      },
      {
        toolName: 'runtime_get_focus_owner',
        args: {},
        data: { focus_owner: null },
      },
      {
        toolName: 'runtime_get_viewport_info',
        args: {},
        data: { size: { type: 'Vector2i', value: [1152, 648] } },
      },
      {
        toolName: 'runtime_get_performance_metrics',
        args: {},
        data: { monitors: { TIME_FPS: 60 } },
      },
      {
        toolName: 'runtime_get_input_map',
        args: {},
        data: { actions: [{ name: 'ui_accept', events: [] }] },
      },
      {
        toolName: 'runtime_get_groups',
        args: {},
        data: { groups: [] },
      },
    ];

    for (const testCase of cases) {
      sent.length = 0;
      const args = {
        session_id: 'session-1',
        project_path: projectPath,
        ...testCase.args,
      };
      const result = await dispatchAndResolve({
        manager,
        registry,
        sent,
        toolName: testCase.toolName,
        args,
        session,
        data: testCase.data,
      });

      assert.equal(result.outbound.kind, 'command');
      assert.equal(result.outbound.command, testCase.toolName);
      assert.equal(result.outbound.args.project_path, resolve(projectPath));
      for (const [key, value] of Object.entries(testCase.args)) {
        assert.deepEqual(result.outbound.args[key], value);
      }
      assert.equal(result.data.status, 'success');
      assert.deepEqual(result.data.data, testCase.data);
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
