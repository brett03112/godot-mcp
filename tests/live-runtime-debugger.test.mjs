import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-runtime-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveRuntime"\n');
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

function runtimeStatus(overrides = {}) {
  return {
    state: 'running',
    active_session_id: 7,
    sessions: [
      {
        session_id: 7,
        state: 'running',
        last_message: 'godot_mcp:runtime_ready',
      },
    ],
    last_ping: {
      roundtrip_id: 'ping-1',
      pong: true,
    },
    ...overrides,
  };
}

function hello(projectPath, overrides = {}) {
  return {
    kind: 'hello',
    session: {
      session_id: overrides.session_id || 'session-1',
      project_path: projectPath,
      godot_version: '4.6.3.stable',
      editor_pid: 4242,
      active_scene: 'res://runtime_debugger_probe.tscn',
      play_state: 'playing',
      writable: true,
      connection_state: 'connected',
      last_heartbeat_unix: 1770000000,
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

test('Phase 3.1 runtime debugger tool registers with the registry', () => {
  const registry = createRegistry(new LiveSessionManager());
  assert.equal(registry.has('runtime_ping'), true, 'runtime_ping should be registered');
  assert.equal(registry.has('runtime_play_scene'), true, 'runtime_play_scene should be registered');
  assert.equal(registry.has('runtime_stop'), true, 'runtime_stop should be registered');
});

test('runtime_ping sends a live command and returns runtime pong metadata', async () => {
  await withProject(async (projectPath) => {
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 1000 });
    const session = hello(projectPath, { runtime_status: runtimeStatus() }).session;
    manager.registerHello({ kind: 'hello', session }, {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    const registry = createRegistry(manager);

    const result = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'runtime_ping',
      args: {
        session_id: 'session-1',
        project_path: projectPath,
        runtime_session_id: 7,
        payload: { probe: 'phase-3.1' },
      },
      session,
      data: {
        pong: true,
        runtime_session_id: 7,
        roundtrip_id: 'ping-1',
        payload: { probe: 'phase-3.1' },
      },
    });

    assert.equal(result.outbound.kind, 'command');
    assert.equal(result.outbound.command, 'runtime_ping');
    assert.equal(result.outbound.args.project_path, resolve(projectPath));
    assert.equal(result.outbound.args.runtime_session_id, 7);
    assert.deepEqual(result.outbound.args.payload, { probe: 'phase-3.1' });
    assert.equal(result.data.status, 'success');
    assert.equal(result.data.data.pong, true);
    assert.equal(result.data.data.runtime_session_id, 7);
    assert.equal(result.data.data.roundtrip_id, 'ping-1');
  });
});

test('runtime play and stop tools dispatch editor runtime controls', async () => {
  await withProject(async (projectPath) => {
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 1500 });
    const session = hello(projectPath, { runtime_status: runtimeStatus({ state: 'available', active_session_id: null }) }).session;
    manager.registerHello({ kind: 'hello', session }, {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    const registry = createRegistry(manager);

    const playResult = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'runtime_play_scene',
      args: {
        session_id: 'session-1',
        project_path: projectPath,
        scene_path: 'res://tier1_test_scene.tscn',
      },
      session,
      data: {
        play_requested: true,
        scene_path: 'res://tier1_test_scene.tscn',
      },
    });

    assert.equal(playResult.outbound.command, 'runtime_play_scene');
    assert.equal(playResult.outbound.args.scene_path, 'res://tier1_test_scene.tscn');
    assert.equal(playResult.data.status, 'success');
    assert.equal(playResult.data.data.play_requested, true);

    sent.length = 0;
    const stopResult = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'runtime_stop',
      args: {
        session_id: 'session-1',
        project_path: projectPath,
      },
      session,
      data: {
        stop_requested: true,
      },
    });

    assert.equal(stopResult.outbound.command, 'runtime_stop');
    assert.equal(stopResult.data.status, 'success');
    assert.equal(stopResult.data.data.stop_requested, true);
  });
});

test('session_list serializes runtime debugger status from live snapshots', async () => {
  await withProject(async (projectPath) => {
    const manager = new LiveSessionManager({ now: () => 2000 });
    manager.registerHello(hello(projectPath), { remoteAddress: '127.0.0.1' });
    manager.recordMessage('session-1', {
      kind: 'heartbeat',
      session: hello(projectPath, {
        runtime_status: runtimeStatus({
          active_session_id: 12,
          last_ping: {
            roundtrip_id: 'ping-12',
            pong: true,
          },
        }),
      }).session,
    });

    const data = parseResponse(await createRegistry(manager).dispatch('session_list', {
      project_path: projectPath,
    }));

    assert.equal(data.status, 'success');
    assert.equal(data.count, 1);
    assert.equal(data.sessions[0].runtime_status.state, 'running');
    assert.equal(data.sessions[0].runtime_status.active_session_id, 12);
    assert.equal(data.sessions[0].runtime_status.sessions[0].last_message, 'godot_mcp:runtime_ready');
    assert.equal(data.sessions[0].runtime_status.last_ping.roundtrip_id, 'ping-12');
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
