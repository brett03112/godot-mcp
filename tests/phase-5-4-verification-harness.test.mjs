import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import {
  LIVE_ADDON_VERSION,
  LIVE_PROTOCOL_VERSION,
  isLiveHelloMessage,
  parseLiveProtocolMessage,
  stringifyLiveProtocolMessage,
} from '../build/live/protocol.js';
import { ToolRegistry } from '../build/registry.js';
import { LiveSessionManager } from '../build/live/session-manager.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';

async function text(path) {
  return readFile(path, 'utf8');
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-phase54-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="Phase54"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createRegistry(manager, evalConfig = {}) {
  const registry = new ToolRegistry();
  registerLiveEditorTools(registry, { manager, evalConfig });
  return registry;
}

function hello(projectPath, overrides = {}) {
  return {
    kind: 'hello',
    session: {
      session_id: overrides.session_id || 'session-1',
      project_path: projectPath,
      godot_version: '4.6.3.stable',
      protocol_version: LIVE_PROTOCOL_VERSION,
      addon_version: LIVE_ADDON_VERSION,
      editor_pid: 4242,
      active_scene: 'res://test_animation_with_anim.tscn',
      play_state: 'stopped',
      writable: true,
      connection_state: 'connected',
      last_heartbeat_unix: 1770000000,
      ...overrides,
    },
  };
}

test('Phase 5.4 exposes repeatable smoke scripts through package scripts', async () => {
  const pkg = JSON.parse(await text('package.json'));
  const nonLive = await text('scripts/smoke-non-live.mjs');
  const live = await text('scripts/smoke-live-editor.mjs');

  assert.equal(pkg.scripts['smoke:non-live'], 'npm run build && node scripts/smoke-non-live.mjs');
  assert.equal(pkg.scripts['smoke:live'], 'npm run build && node scripts/smoke-live-editor.mjs');

  for (const required of ['project_settings_get', 'filesystem_search', 'validate_scene']) {
    assert.match(nonLive, new RegExp(required));
  }
  for (const required of ['session_list', 'editor_state', '127.0.0.1', '6010']) {
    assert.match(live, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Phase 5.4 manual verification note template captures local proof details', async () => {
  const template = await text('docs/templates/manual-verification-note.md');

  for (const required of [
    'Startup socket facts',
    'Focused tests',
    'Full test run',
    'Non-live smoke',
    'Live smoke',
    'Reload needed',
    'Known warnings',
  ]) {
    assert.match(template, new RegExp(required));
  }
});

test('live protocol stringify and parse round-trip command-safe JSON objects', () => {
  const message = {
    kind: 'hello',
      session: {
        session_id: 'phase54-session',
        project_path: 'C:/phase54/project',
        godot_version: '4.6.3.stable',
        protocol_version: LIVE_PROTOCOL_VERSION,
        addon_version: LIVE_ADDON_VERSION,
        editor_pid: 4242,
      },
  };

  const encoded = stringifyLiveProtocolMessage(message);
  assert.equal(encoded.endsWith('\n'), false);
  assert.equal(JSON.stringify(JSON.parse(encoded)), encoded);

  const decoded = parseLiveProtocolMessage(encoded);
  assert.equal(isLiveHelloMessage(decoded), true);
  assert.deepEqual(decoded, message);
});

test('session manager cleanup rejects stale sessions and clears active selection', async () => {
  await withProject(async (projectPath) => {
    let now = 1000;
    let closed = false;
    const manager = new LiveSessionManager({ now: () => now, staleTimeoutMs: 100 });
    manager.registerHello(hello(projectPath), {
      remoteAddress: '127.0.0.1',
      close: () => { closed = true; },
    });
    manager.activateSession({ sessionId: 'session-1' });

    now = 1200;
    const removed = manager.cleanupStaleSessions();
    assert.equal(removed.length, 1);
    assert.equal(removed[0].sessionId, 'session-1');
    assert.equal(closed, true);
    assert.equal(manager.getActiveSessionId(), null);

    const registry = createRegistry(manager);
    const response = await registry.dispatch('session_activate', { session_id: 'session-1' });
    const data = parseResponse(response);
    assert.equal(response.isError, true);
    assert.match(data.reason, /Live session not found/);
  });
});

test('session activation rejects project-path mismatches with normalized paths', async () => {
  await withProject(async (projectPath) => {
    const manager = new LiveSessionManager({ now: () => 1000 });
    manager.registerHello(hello(projectPath), { remoteAddress: '127.0.0.1' });
    const registry = createRegistry(manager);

    const response = await registry.dispatch('session_activate', {
      session_id: 'session-1',
      project_path: join(projectPath, 'different'),
    });
    const data = parseResponse(response);
    assert.equal(response.isError, true);
    assert.match(data.reason, new RegExp(resolve(projectPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(data.reason, /does not match requested project_path/);
  });
});

test('disabled eval is refused by default and does not expose eval mutation tools', async () => {
  const registry = createRegistry(new LiveSessionManager());
  assert.equal(registry.has('live_eval_status'), true);
  assert.equal(registry.has('editor_eval'), false);
  assert.equal(registry.has('game_eval'), false);

  const data = parseResponse(await registry.dispatch('live_eval_status', {}));
  assert.equal(data.status, 'success');
  assert.equal(data.eval.enabled, false);
  assert.match(data.eval.reason, /disabled/i);
});
