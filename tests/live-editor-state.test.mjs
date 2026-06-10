import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import {
  getLiveResourceDescriptors,
  readLiveResource,
  registerLiveEditorTools,
} from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-state-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveState"\n');
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

test('Phase 2.3 live editor state tools register with the registry', () => {
  const registry = createRegistry(new LiveSessionManager());
  for (const name of [
    'editor_state',
    'session_list',
    'session_activate',
    'session_disconnect',
    'scene_current',
    'scene_open',
    'scene_save_active',
    'scene_reload_active',
    'selection_get',
    'selection_set',
    'editor_screenshot',
    'logs_read_editor',
    'logs_clear',
    'editor_monitors_get',
    'editor_quit',
  ]) {
    assert.equal(registry.has(name), true, `${name} should be registered`);
  }
});

test('editor_state sends a live command and returns editor metadata', async () => {
  await withProject(async (projectPath) => {
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 1000 });
    manager.registerHello(hello(projectPath), {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    const registry = createRegistry(manager);

    const result = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'editor_state',
      args: { session_id: 'session-1', project_path: projectPath },
      session: hello(projectPath).session,
      data: {
        active_scene: 'res://tier1_test_scene.tscn',
        open_scenes: ['res://tier1_test_scene.tscn'],
        selected_nodes: ['TestSprite'],
        play_state: 'stopped',
        writable: true,
      },
    });

    assert.equal(result.outbound.kind, 'command');
    assert.equal(result.outbound.command, 'editor_state');
    assert.equal(result.outbound.args.project_path, resolve(projectPath));
    assert.equal(result.data.status, 'success');
    assert.equal(result.data.session.session_id, 'session-1');
    assert.equal(result.data.data.active_scene, 'res://tier1_test_scene.tscn');
    assert.deepEqual(result.data.data.selected_nodes, ['TestSprite']);
  });
});

test('scene and selection tools dispatch the expected live commands', async () => {
  await withProject(async (projectPath) => {
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 2000 });
    manager.registerHello(hello(projectPath), {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    const registry = createRegistry(manager);

    const sceneCurrent = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'scene_current',
      args: { session_id: 'session-1' },
      session: hello(projectPath).session,
      data: {
        active_scene: 'res://tier1_test_scene.tscn',
        root_name: 'Tier1Root',
        hierarchy: [{ path: '.', name: 'Tier1Root', type: 'Node2D', child_count: 1 }],
      },
    });
    assert.equal(sceneCurrent.outbound.command, 'scene_current');
    assert.equal(sceneCurrent.data.data.root_name, 'Tier1Root');

    sent.length = 0;
    const selectionGet = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'selection_get',
      args: { session_id: 'session-1' },
      session: hello(projectPath).session,
      data: {
        selected_nodes: [{ path: 'TestSprite', name: 'TestSprite', type: 'Sprite2D' }],
      },
    });
    assert.equal(selectionGet.outbound.command, 'selection_get');
    assert.equal(selectionGet.data.data.selected_nodes[0].path, 'TestSprite');

    sent.length = 0;
    const selectionSet = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'selection_set',
      args: { session_id: 'session-1', node_paths: ['TestSprite'] },
      session: hello(projectPath).session,
      data: {
        selected_nodes: [{ path: 'TestSprite', name: 'TestSprite', type: 'Sprite2D' }],
      },
    });
    assert.equal(selectionSet.outbound.command, 'selection_set');
    assert.deepEqual(selectionSet.outbound.args.node_paths, ['TestSprite']);
    assert.equal(selectionSet.data.data.selected_nodes.length, 1);

    sent.length = 0;
    const saveActive = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'scene_save_active',
      args: { session_id: 'session-1' },
      session: hello(projectPath).session,
      data: {
        saved: true,
        scene_path: 'res://tier1_test_scene.tscn',
      },
    });
    assert.equal(saveActive.outbound.command, 'scene_save_active');
    assert.equal(saveActive.data.data.saved, true);
  });
});

test('editor_screenshot sends output path and exposes saved screenshot metadata', async () => {
  await withProject(async (projectPath) => {
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 3000 });
    manager.registerHello(hello(projectPath), {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    const registry = createRegistry(manager);

    const result = await dispatchAndResolve({
      manager,
      registry,
      sent,
      toolName: 'editor_screenshot',
      args: {
        session_id: 'session-1',
        output_path: 'screenshots/mcp_live_editor.png',
        viewport: '2d',
      },
      session: hello(projectPath).session,
      data: {
        saved: true,
        output_path: 'res://screenshots/mcp_live_editor.png',
        width: 1280,
        height: 720,
      },
    });

    assert.equal(result.outbound.command, 'editor_screenshot');
    assert.equal(result.outbound.args.output_path, 'screenshots/mcp_live_editor.png');
    assert.equal(result.outbound.args.viewport, '2d');
    assert.equal(result.data.data.saved, true);
    assert.equal(result.data.data.width, 1280);
  });
});

test('live resources expose session and active editor snapshots', async () => {
  await withProject(async (projectPath) => {
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 4000 });
    manager.registerHello(hello(projectPath), {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    manager.activateSession({ sessionId: 'session-1' });

    const descriptors = getLiveResourceDescriptors();
    assert.equal(descriptors.some((resource) => resource.uri === 'godot-mcp://live/sessions'), true);
    assert.equal(descriptors.some((resource) => resource.uri === 'godot-mcp://live/editor/state'), true);

    const sessions = await readLiveResource('godot-mcp://live/sessions', manager);
    assert.equal(sessions.count, 1);
    assert.equal(sessions.sessions[0].session_id, 'session-1');

    const statePromise = readLiveResource('godot-mcp://live/editor/state', manager);
    await waitForCondition(() => sent.length === 1);
    manager.recordMessage('session-1', {
      kind: 'command_response',
      request_id: sent[0].request_id,
      status: 'success',
      data: {
        active_scene: 'res://tier1_test_scene.tscn',
        selected_nodes: ['TestSprite'],
      },
      session: hello(projectPath).session,
    });

    const state = await statePromise;
    assert.equal(sent[0].command, 'editor_state');
    assert.equal(state.status, 'success');
    assert.equal(state.data.active_scene, 'res://tier1_test_scene.tscn');
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
