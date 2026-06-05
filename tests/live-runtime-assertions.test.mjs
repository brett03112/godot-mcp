import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';

const phase34Tools = [
  'runtime_assert_node_exists',
  'runtime_assert_property_equals',
  'runtime_assert_signal_emitted',
  'runtime_assert_ui_text_visible',
  'runtime_assert_no_errors',
  'runtime_snapshot_assertion_report',
];

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-runtime-assertions-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveRuntimeAssertions"\n');
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
      active_scene: 'res://test_connect.tscn',
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

test('Phase 3.4 runtime assertion tools register with the live registry', () => {
  const registry = createRegistry(new LiveSessionManager());
  for (const toolName of phase34Tools) {
    assert.equal(registry.has(toolName), true, `${toolName} should be registered`);
  }
});

test('runtime assertion tools dispatch matching live commands with arguments', async () => {
  await withProject(async (projectPath) => {
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 4000 });
    const session = hello(projectPath).session;
    manager.registerHello({ kind: 'hello', session }, {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    const registry = createRegistry(manager);

    const cases = [
      {
        toolName: 'runtime_assert_node_exists',
        args: { node_path: '.', assertion_id: 'root-exists' },
        data: { assertion: 'node_exists', passed: true, observed: { node_path: '.', exists: true } },
      },
      {
        toolName: 'runtime_assert_property_equals',
        args: { node_path: '.', property: 'name', expected: 'TestConnect', assertion_id: 'root-name' },
        data: { assertion: 'property_equals', passed: true, observed: 'TestConnect', expected: 'TestConnect' },
      },
      {
        toolName: 'runtime_assert_signal_emitted',
        args: { node_path: 'Button', signal_name: 'pressed', min_count: 1, since_unix: 1770000000 },
        data: { assertion: 'signal_emitted', passed: false, observed: { count: 0 }, suggested_next_probe: 'runtime_click_ui_path' },
      },
      {
        toolName: 'runtime_assert_ui_text_visible',
        args: { text: 'Test Button', exact: true },
        data: { assertion: 'ui_text_visible', passed: true, observed: { text: 'Test Button' } },
      },
      {
        toolName: 'runtime_assert_no_errors',
        args: { since_unix: 1770000000, include_warnings: false },
        data: { assertion: 'no_errors', passed: true, observed: { count: 0 } },
      },
      {
        toolName: 'runtime_snapshot_assertion_report',
        args: { include_passed: true, limit: 20 },
        data: { assertions: [], summary: { total: 0, passed: 0, failed: 0 } },
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
