import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import WebSocket from 'ws';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';
import {
  LIVE_ADDON_VERSION,
  LIVE_PROTOCOL_VERSION,
} from '../build/live/protocol.js';
import {
  ensureLiveSessionTransportStatus,
  getLiveSessionTransportStatus,
  LiveSessionTransport,
  startLiveSessionTransport,
  stopLiveSessionTransport,
} from '../build/live/transport.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveSession"\n');
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
      protocol_version: LIVE_PROTOCOL_VERSION,
      addon_version: LIVE_ADDON_VERSION,
      editor_pid: 4242,
      active_scene: 'res://scenes/main.tscn',
      play_state: 'stopped',
      writable: true,
      connection_state: 'connected',
      last_heartbeat_unix: 1770000000,
      ...overrides,
    },
  };
}

test('live editor session tools register with the registry', () => {
  const registry = createRegistry(new LiveSessionManager());
  assert.equal(registry.has('session_list'), true);
  assert.equal(registry.has('session_activate'), true);
  assert.equal(registry.has('session_disconnect'), true);
});

test('session_list shows connected editor session metadata', async () => {
  await withProject(async (projectPath) => {
    const manager = new LiveSessionManager({ now: () => 1000 });
    manager.registerHello(hello(projectPath), { remoteAddress: '127.0.0.1' });
    const data = parseResponse(await createRegistry(manager).dispatch('session_list', {}));

    assert.equal(data.status, 'success');
    assert.equal(data.count, 1);
    assert.equal(data.active_session_id, null);
    assert.equal(data.sessions[0].session_id, 'session-1');
    assert.equal(data.sessions[0].project_path, resolve(projectPath));
    assert.equal(data.sessions[0].godot_version, '4.6.3.stable');
    assert.equal(data.sessions[0].editor_pid, 4242);
    assert.equal(data.sessions[0].active_scene, 'res://scenes/main.tscn');
    assert.equal(data.sessions[0].stale, false);
    assert.equal(data.sessions[0].remote_address, '127.0.0.1');
  });
});

test('session_activate selects one matching project session and rejects mismatches', async () => {
  await withProject(async (projectPath) => {
    const manager = new LiveSessionManager({ now: () => 2000 });
    manager.registerHello(hello(projectPath), { remoteAddress: '127.0.0.1' });
    const registry = createRegistry(manager);

    const activated = parseResponse(await registry.dispatch('session_activate', {
      project_path: projectPath,
    }));
    assert.equal(activated.status, 'success');
    assert.equal(activated.active_session_id, 'session-1');

    const mismatch = await registry.dispatch('session_activate', {
      session_id: 'session-1',
      project_path: join(projectPath, 'other'),
    });
    const mismatchData = parseResponse(mismatch);
    assert.equal(mismatch.isError, true);
    assert.match(mismatchData.reason, /does not match requested project_path/);
  });
});

test('session activation requires an explicit target when multiple live sessions exist', async () => {
  const manager = new LiveSessionManager({ now: () => 3000 });
  manager.registerHello(hello('C:/tmp/project-a', { session_id: 'session-a' }), { remoteAddress: '127.0.0.1' });
  manager.registerHello(hello('C:/tmp/project-b', { session_id: 'session-b' }), { remoteAddress: '127.0.0.1' });

  const response = await createRegistry(manager).dispatch('session_activate', {});
  const data = parseResponse(response);
  assert.equal(response.isError, true);
  assert.match(data.reason, /multiple live sessions/);
});

test('heartbeat refreshes session state before stale cleanup', async () => {
  let now = 0;
  const manager = new LiveSessionManager({ now: () => now, staleTimeoutMs: 10000 });
  manager.registerHello(hello('C:/tmp/project-a'), { remoteAddress: '127.0.0.1' });

  now = 5000;
  manager.recordMessage('session-1', {
    kind: 'heartbeat',
    session: hello('C:/tmp/project-a', {
      active_scene: 'res://scenes/updated.tscn',
      play_state: 'playing',
      writable: false,
    }).session,
  });

  now = 12000;
  const sessions = manager.listSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].lastSeenMs, 5000);
  assert.equal(sessions[0].activeScene, 'res://scenes/updated.tscn');
  assert.equal(sessions[0].playState, 'playing');
  assert.equal(sessions[0].writable, false);
  assert.equal(sessions[0].stale, false);
});

test('session tools reject stale sessions after cleanup', async () => {
  let now = 0;
  const manager = new LiveSessionManager({ now: () => now, staleTimeoutMs: 1000 });
  manager.registerHello(hello('C:/tmp/project-a'), { remoteAddress: '127.0.0.1' });
  const registry = createRegistry(manager);

  now = 2000;
  const response = await registry.dispatch('session_activate', { session_id: 'session-1' });
  const data = parseResponse(response);
  assert.equal(response.isError, true);
  assert.match(data.reason, /Live session not found/);
  assert.equal(manager.listSessions().length, 0);
});

test('session_disconnect removes the active session and closes its transport', async () => {
  await withProject(async (projectPath) => {
    let closed = false;
    const manager = new LiveSessionManager({ now: () => 4000 });
    manager.registerHello(hello(projectPath), {
      remoteAddress: '127.0.0.1',
      close: () => { closed = true; },
    });
    const registry = createRegistry(manager);

    parseResponse(await registry.dispatch('session_activate', { session_id: 'session-1' }));
    const disconnected = parseResponse(await registry.dispatch('session_disconnect', {}));
    const list = parseResponse(await registry.dispatch('session_list', {}));

    assert.equal(disconnected.status, 'success');
    assert.equal(disconnected.disconnected_session_id, 'session-1');
    assert.equal(closed, true);
    assert.equal(list.count, 0);
    assert.equal(list.active_session_id, null);
  });
});

test('live transport accepts a loopback websocket hello payload', async () => {
  await withProject(async (projectPath) => {
    const port = await getFreePort();
    const manager = new LiveSessionManager({ now: () => 5000 });
    const transport = new LiveSessionTransport(manager, { port });
    transport.start();

    const client = new WebSocket(`ws://127.0.0.1:${port}/godot-mcp-live`);
    try {
      await waitForEvent(client, 'open');
      client.send(JSON.stringify(hello(projectPath, { session_id: 'transport-session' })));
      await waitForCondition(() => manager.listSessions().length === 1);

      const sessions = manager.listSessions();
      assert.equal(sessions[0].sessionId, 'transport-session');
      assert.equal(sessions[0].projectPath, resolve(projectPath));
      assert.equal(sessions[0].remoteAddress, '127.0.0.1');
      assert.equal(transport.getStatus().running, true);
    } finally {
      client.close();
      transport.stop();
    }
  });
});

test('live transport retries after an address-in-use startup failure', async () => {
  await withProject(async (projectPath) => {
    const port = await getFreePort();
    const blocker = createServer();
    await listenOnPort(blocker, port);

    const manager = new LiveSessionManager({ now: () => 6000 });
    const transport = new LiveSessionTransport(manager, { port });
    transport.start();

    try {
      await waitForCondition(() => {
        const status = transport.getStatus();
        return status.running === false && status.lastError?.includes('EADDRINUSE');
      });

      await closeServer(blocker);

      transport.start();
      const client = new WebSocket(`ws://127.0.0.1:${port}/godot-mcp-live`);
      try {
        await waitForEvent(client, 'open');
        client.send(JSON.stringify(hello(projectPath, { session_id: 'retry-session' })));
        await waitForCondition(() => manager.listSessions().length === 1);

        const sessions = manager.listSessions();
        assert.equal(sessions[0].sessionId, 'retry-session');
        assert.equal(transport.getStatus().running, true);
        assert.equal(transport.getStatus().lastError, null);
      } finally {
        client.close();
      }
    } finally {
      await closeServer(blocker);
      transport.stop();
    }
  });
});

test('live transport singleton status retries after a cleared startup bind failure', async () => {
  await withProject(async (projectPath) => {
    stopLiveSessionTransport();
    const port = await getFreePort();
    const blocker = createServer();
    await listenOnPort(blocker, port);
    const manager = new LiveSessionManager({ now: () => 7000 });

    try {
      startLiveSessionTransport(manager, { port });
      await waitForCondition(() => {
        const status = getLiveSessionTransportStatus();
        return status.running === false && status.lastError?.includes('EADDRINUSE');
      });

      await closeServer(blocker);
      await waitForCondition(() => getLiveSessionTransportStatus().running === true);

      const client = new WebSocket(`ws://127.0.0.1:${port}/godot-mcp-live`);
      try {
        await waitForEvent(client, 'open');
        client.send(JSON.stringify(hello(projectPath, { session_id: 'singleton-retry-session' })));
        await waitForCondition(() => manager.listSessions().length === 1);

        assert.equal(manager.listSessions()[0].sessionId, 'singleton-retry-session');
        assert.equal(getLiveSessionTransportStatus().lastError, null);
      } finally {
        client.close();
      }
    } finally {
      await closeServer(blocker);
      stopLiveSessionTransport();
    }
  });
});

test('live transport singleton can start lazily from status helper', async () => {
  await withProject(async (projectPath) => {
    stopLiveSessionTransport();
    const port = await getFreePort();
    const manager = new LiveSessionManager({ now: () => 8000 });

    try {
      await waitForCondition(() => ensureLiveSessionTransportStatus(manager, { port }).running === true);

      const client = new WebSocket(`ws://127.0.0.1:${port}/godot-mcp-live`);
      try {
        await waitForEvent(client, 'open');
        client.send(JSON.stringify(hello(projectPath, { session_id: 'lazy-status-session' })));
        await waitForCondition(() => manager.listSessions().length === 1);

        assert.equal(manager.listSessions()[0].sessionId, 'lazy-status-session');
      } finally {
        client.close();
      }
    } finally {
      stopLiveSessionTransport();
    }
  });
});

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a free port.')));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
    server.on('error', reject);
  });
}

function listenOnPort(server, port) {
  return new Promise((resolveListen, reject) => {
    server.listen(port, '127.0.0.1', resolveListen);
    server.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => {
    if (!server.listening) {
      resolveClose();
      return;
    }
    server.close(resolveClose);
  });
}

function waitForEvent(target, eventName) {
  return new Promise((resolveEvent, reject) => {
    target.once(eventName, resolveEvent);
    target.once('error', reject);
  });
}

async function waitForCondition(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error('Timed out waiting for condition.');
}
