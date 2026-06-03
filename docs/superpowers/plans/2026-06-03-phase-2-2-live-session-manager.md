# Phase 2.2 Live Session Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the MCP-side live session manager that accepts the Phase 2.1 Godot editor addon's WebSocket connection, tracks connected editor sessions, and exposes `session_list`, `session_activate`, and `session_disconnect`.

**Architecture:** Keep the protocol, WebSocket transport, session manager, and MCP tools in separate modules under `src/live` and `src/tools/live-editor.ts`. The live manager is a process-local singleton so the transport, registered tools, and later resource handlers share one session table without expanding the monolithic server class.

**Tech Stack:** TypeScript, Node test runner, `ws` WebSocket server, Godot 4.6 editor addon payloads, MCP `ToolRegistry`.

---

### Task 1: Add Focused Tests For The Live Manager And Tools

**Files:**
- Create: `tests/live-session-manager.test.mjs`

- [ ] **Step 1: Write failing tests for registration and session behavior**

Create Node tests that import the missing build modules, register the new live editor tools, feed a `hello` payload into the manager, list sessions, activate the session, reject a mismatched project path, and disconnect the session.

```js
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
```

- [ ] **Step 2: Verify RED**

Run: `npm run build && node --test tests/live-session-manager.test.mjs`

Expected: FAIL because `build/tools/live-editor.js` and `build/live/session-manager.js` do not exist.

### Task 2: Add Protocol And Session Manager

**Files:**
- Create: `src/live/protocol.ts`
- Create: `src/live/session-manager.ts`

- [ ] **Step 1: Implement protocol types**

Define `LiveSessionSnapshot`, `LiveHelloMessage`, `LiveCommandResponseMessage`, and helpers that validate `kind: "hello"` payloads and normalize Godot editor session fields.

- [ ] **Step 2: Implement session manager**

Implement `LiveSessionManager` with `registerHello`, `listSessions`, `activateSession`, `disconnectSession`, `resolveTargetSession`, `cleanupStaleSessions`, and stale timeout handling. Normalize project paths with `path.resolve`, keep `activeSessionId`, and call an optional connection `close()` callback when disconnecting.

### Task 3: Add WebSocket Transport

**Files:**
- Create: `src/live/transport.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependency**

Run: `npm install ws@^8.18.3 @types/ws@^8.5.13 --save`

- [ ] **Step 2: Implement transport wrapper**

Use `WebSocketServer` from `ws` to listen on `127.0.0.1:6010` and path `/godot-mcp-live`. Accept loopback clients only, parse JSON text messages, call `manager.registerHello()` for `kind: "hello"`, route command responses to the manager for later phases, and expose `startLiveSessionTransport()` plus `stopLiveSessionTransport()`.

### Task 4: Register MCP Tools

**Files:**
- Create: `src/tools/live-editor.ts`
- Modify: `src/index.ts`
- Modify: `src/types.ts` if the context needs to expose the singleton manager

- [ ] **Step 1: Implement `session_list`**

Return JSON with `status`, `count`, `active_session_id`, `sessions`, and transport status.

- [ ] **Step 2: Implement `session_activate`**

Accept optional `session_id` and `project_path`; select the only matching non-stale session, return an error when multiple sessions exist and no target is provided, and reject a project path mismatch.

- [ ] **Step 3: Implement `session_disconnect`**

Accept optional `session_id`; default to the active session when present, remove it from the manager, close the transport connection if available, and report the disconnected ID.

- [ ] **Step 4: Start the listener during server setup**

Create the live manager singleton in `src/live/session-manager.ts`, start the transport from `GodotServer` construction or setup, stop it from `cleanup()`, and register the tools with the registry.

### Task 5: Update Ledger And Verify

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Mark completed Phase 2.2 items**

Check off the new source files, tracked session fields, heartbeat/stale cleanup, project-path matching, activation model, and loopback guard if the implementation covers them.

- [ ] **Step 2: Add verification note**

Record RED failure, focused test pass, full `npm test` pass, and whether the already-open `test_mcp_enhancements` editor connected without a reload.

- [ ] **Step 3: Run final verification**

Run:

```powershell
npm run build
node --test tests/live-session-manager.test.mjs
npm test
```

Expected: all commands pass. Then run a built MCP/list-tools smoke and, if the open editor reconnects to `127.0.0.1:6010`, call `session_list` through the live MCP server to verify it shows `test_mcp_enhancements`.
