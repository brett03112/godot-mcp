import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import WebSocket from 'ws';

import {
  LIVE_ADDON_VERSION,
  LIVE_PROTOCOL_VERSION,
  SUPPORTED_GODOT_VERSION_RANGE,
  checkLiveCompatibility,
} from '../build/live/protocol.js';
import { ToolRegistry } from '../build/registry.js';
import { LiveSessionManager } from '../build/live/session-manager.js';
import { LiveSessionTransport } from '../build/live/transport.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';

async function text(path) {
  return readFile(path, 'utf8');
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-phase55-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="Phase55"\n');
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

function hello(projectPath, overrides = {}) {
  return {
    kind: 'hello',
    session: {
      session_id: overrides.session_id || 'phase55-session',
      project_path: projectPath,
      godot_version: '4.6.3.stable',
      editor_pid: 4242,
      active_scene: 'res://test_animation_with_anim.tscn',
      play_state: 'stopped',
      writable: true,
      connection_state: 'connected',
      last_heartbeat_unix: 1770000000,
      protocol_version: LIVE_PROTOCOL_VERSION,
      addon_version: LIVE_ADDON_VERSION,
      ...overrides,
    },
  };
}

test('Phase 5.5 defines live bridge release compatibility constants', () => {
  assert.equal(LIVE_PROTOCOL_VERSION, '1.0.0');
  assert.equal(LIVE_ADDON_VERSION, '0.1.0');
  assert.equal(SUPPORTED_GODOT_VERSION_RANGE, '>=4.6 <5.0');

  const compatible = checkLiveCompatibility({
    protocol_version: LIVE_PROTOCOL_VERSION,
    addon_version: LIVE_ADDON_VERSION,
    godot_version: '4.6.3.stable',
  });
  assert.equal(compatible.compatible, true);
  assert.equal(compatible.protocol.compatible, true);
  assert.equal(compatible.godot.compatible, true);

  const incompatible = checkLiveCompatibility({
    protocol_version: '0.9.0',
    addon_version: '0.0.1',
    godot_version: '4.5.1.stable',
  });
  assert.equal(incompatible.compatible, false);
  assert.match(incompatible.reason, /protocol/i);
  assert.match(incompatible.reason, /Godot/i);
  assert.match(incompatible.remediation, /Update the Godot MCP Live addon/i);
});

test('session_list includes addon and protocol compatibility metadata', async () => {
  await withProject(async (projectPath) => {
    const manager = new LiveSessionManager({ now: () => 1000 });
    manager.registerHello(hello(projectPath), { remoteAddress: '127.0.0.1' });
    const registry = new ToolRegistry();
    registerLiveEditorTools(registry, { manager });

    const data = parseResponse(await registry.dispatch('session_list', {}));
    assert.equal(data.status, 'success');
    assert.equal(data.count, 1);
    assert.equal(data.sessions[0].project_path, resolve(projectPath));
    assert.equal(data.sessions[0].protocol_version, LIVE_PROTOCOL_VERSION);
    assert.equal(data.sessions[0].addon_version, LIVE_ADDON_VERSION);
    assert.equal(data.sessions[0].compatibility.compatible, true);
  });
});

test('live transport rejects incompatible protocol hello with clear remediation', async () => {
  await withProject(async (projectPath) => {
    const port = await getFreePort();
    const errors = [];
    const manager = new LiveSessionManager({ now: () => 1000 });
    const transport = new LiveSessionTransport(manager, { port, onError: (message) => errors.push(message) });
    transport.start();

    const client = new WebSocket(`ws://127.0.0.1:${port}/godot-mcp-live`);
    try {
      await waitForEvent(client, 'open');
      client.send(JSON.stringify(hello(projectPath, {
        session_id: 'old-addon',
        protocol_version: '0.9.0',
      })));

      const serverError = await waitForMessage(client);
      const parsed = JSON.parse(serverError);
      assert.equal(parsed.kind, 'error');
      assert.equal(parsed.error.code, 'live_protocol_incompatible');
      assert.match(parsed.error.message, /Update the Godot MCP Live addon/i);
      await waitForEvent(client, 'close');

      assert.equal(manager.listSessions().length, 0);
      assert.match(errors.join('\n'), /live protocol compatibility failed/i);
    } finally {
      client.close();
      transport.stop();
    }
  });
});

test('Phase 5.5 policy docs and changelog describe migration behavior', async () => {
  const releasePolicy = await text('docs/live-bridge-release-policy.md');
  const protocolDoc = await text('docs/live-bridge-protocol.md');
  const changelog = await text('CHANGELOG.md');
  const addonState = await text('test_mcp_enhancements/addons/godot_mcp_live/session_state.gd');

  for (const content of [releasePolicy, protocolDoc, changelog]) {
    assert.match(content, /protocol_version/);
    assert.match(content, /Godot 4\.6/);
    assert.match(content, /version mismatch/i);
  }

  assert.match(addonState, /LIVE_PROTOCOL_VERSION := "1\.0\.0"/);
  assert.match(addonState, /LIVE_ADDON_VERSION := "0\.1\.0"/);
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

function waitForEvent(target, eventName) {
  return new Promise((resolveEvent, reject) => {
    target.once(eventName, resolveEvent);
    target.once('error', reject);
  });
}

function waitForMessage(client) {
  return new Promise((resolveMessage, reject) => {
    client.once('message', (data) => resolveMessage(data.toString()));
    client.once('error', reject);
  });
}
