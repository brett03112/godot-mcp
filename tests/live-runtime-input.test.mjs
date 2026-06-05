import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';

const phase33Tools = [
  'runtime_input_key',
  'runtime_input_mouse',
  'runtime_input_gamepad',
  'runtime_input_action',
  'runtime_input_text',
  'runtime_input_state',
  'runtime_wait_for_condition',
  'runtime_click_ui_text',
  'runtime_click_ui_path',
];

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-runtime-input-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveRuntimeInput"\n');
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

test('Phase 3.3 runtime input tools register with the live registry', () => {
  const registry = createRegistry(new LiveSessionManager());
  for (const toolName of phase33Tools) {
    assert.equal(registry.has(toolName), true, `${toolName} should be registered`);
  }
});

test('runtime input tools dispatch matching live commands with arguments', async () => {
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
        toolName: 'runtime_input_key',
        args: { key: 'Space', pressed: true, echo: false },
        data: { event_type: 'key', key: 'Space', pressed: true },
      },
      {
        toolName: 'runtime_input_mouse',
        args: { event_type: 'button', position: { x: 25, y: 40 }, button_index: 1, pressed: true },
        data: { event_type: 'mouse_button', button_index: 1, pressed: true },
      },
      {
        toolName: 'runtime_input_gamepad',
        args: { device: 0, control: 'button', index: 0, pressed: true },
        data: { event_type: 'joypad_button', device: 0, button_index: 0, pressed: true },
      },
      {
        toolName: 'runtime_input_action',
        args: { action: 'ui_accept', pressed: true, strength: 1 },
        data: { event_type: 'action', action: 'ui_accept', pressed: true, strength: 1 },
      },
      {
        toolName: 'runtime_input_text',
        args: { text: 'Codex' },
        data: { inserted_text: 'Codex', events_sent: 5 },
      },
      {
        toolName: 'runtime_input_state',
        args: { actions: ['ui_accept'], keys: ['Space'], mouse_buttons: [1], gamepad_buttons: [0], device: 0 },
        data: { actions: { ui_accept: { pressed: true, strength: 1 } } },
      },
      {
        toolName: 'runtime_wait_for_condition',
        args: { kind: 'node_property', node_path: '.', property: 'name', equals: 'root', wait_timeout_ms: 500, poll_interval_ms: 25 },
        data: { matched: true, kind: 'node_property', observed: 'root' },
      },
      {
        toolName: 'runtime_click_ui_text',
        args: { text: 'Start', exact: true, button_index: 1 },
        data: { clicked: true, target: { text: 'Start' } },
      },
      {
        toolName: 'runtime_click_ui_path',
        args: { node_path: 'CanvasLayer/StartButton', button_index: 1 },
        data: { clicked: true, target: { path: 'CanvasLayer/StartButton' } },
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
