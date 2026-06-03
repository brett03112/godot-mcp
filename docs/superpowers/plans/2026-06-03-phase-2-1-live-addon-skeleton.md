# Phase 2.1 Live Addon Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Godot editor addon skeleton that appears in `test_mcp_enhancements`, starts a live bridge stub on enable, shows bridge status in an editor dock, and cleans up on disable.

**Architecture:** The addon lives under `test_mcp_enhancements/addons/godot_mcp_live` so the currently open fixture project can load it immediately. `godot_mcp_live.gd` owns the `EditorPlugin` lifecycle and dock panel, while `session_state.gd`, `command_dispatcher.gd`, and `transport_websocket.gd` are small focused collaborators that expose stable seams for Phase 2.2 without implementing the MCP-side session manager early.

**Tech Stack:** Godot 4.6 GDScript editor plugins, `@tool`, `EditorPlugin`, `WebSocketPeer`, Node test runner, PowerShell verification.

---

### Task 1: Add Structural Tests

**Files:**
- Create: `tests/live-addon-skeleton.test.mjs`

- [ ] **Step 1: Write the failing test**

Create tests that assert the Phase 2.1 addon files exist, `plugin.cfg` points at `godot_mcp_live.gd`, all scripts are marked `@tool`, the main script extends `EditorPlugin`, and the lifecycle methods call bridge startup and cleanup:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const addonRoot = join(repoRoot, 'test_mcp_enhancements', 'addons', 'godot_mcp_live');

test('live addon skeleton files are present and registered', async () => {
  const expectedFiles = [
    'plugin.cfg',
    'godot_mcp_live.gd',
    'session_state.gd',
    'command_dispatcher.gd',
    'transport_websocket.gd',
  ];

  for (const relativePath of expectedFiles) {
    assert.equal(existsSync(join(addonRoot, relativePath)), true, `${relativePath} should exist`);
  }

  const pluginCfg = await readFile(join(addonRoot, 'plugin.cfg'), 'utf8');
  assert.match(pluginCfg, /\[plugin\]/);
  assert.match(pluginCfg, /name="Godot MCP Live"/);
  assert.match(pluginCfg, /script="godot_mcp_live\.gd"/);

  const mainScript = await readFile(join(addonRoot, 'godot_mcp_live.gd'), 'utf8');
  assert.match(mainScript, /^@tool/m);
  assert.match(mainScript, /^extends EditorPlugin/m);
  assert.match(mainScript, /func _enter_tree\(\) -> void:/);
  assert.match(mainScript, /func _exit_tree\(\) -> void:/);
  assert.match(mainScript, /_start_bridge\(\)/);
  assert.match(mainScript, /_stop_bridge\(\)/);

  for (const relativePath of expectedFiles.filter((file) => file.endsWith('.gd'))) {
    const content = await readFile(join(addonRoot, relativePath), 'utf8');
    assert.match(content, /^@tool/m, `${relativePath} should be an editor-safe tool script`);
  }
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run build && node --test tests/live-addon-skeleton.test.mjs`

Expected: FAIL because `test_mcp_enhancements/addons/godot_mcp_live/plugin.cfg` and scripts do not exist.

### Task 2: Implement The Addon Files

**Files:**
- Create: `test_mcp_enhancements/addons/godot_mcp_live/plugin.cfg`
- Create: `test_mcp_enhancements/addons/godot_mcp_live/godot_mcp_live.gd`
- Create: `test_mcp_enhancements/addons/godot_mcp_live/session_state.gd`
- Create: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`
- Create: `test_mcp_enhancements/addons/godot_mcp_live/transport_websocket.gd`

- [ ] **Step 1: Add `plugin.cfg`**

```ini
[plugin]

name="Godot MCP Live"
description="Live editor bridge skeleton for Godot MCP sessions."
author="Godot MCP"
version="0.1.0"
script="godot_mcp_live.gd"
```

- [ ] **Step 2: Add session state**

Implement `SessionState` as a `RefCounted` that generates a session ID, records project path, Godot version, connection state, active scene, play state, last heartbeat, and last error. Include `mark_connecting`, `mark_connected`, `mark_disconnected`, `update_editor_snapshot`, `record_error`, and `to_dictionary`.

- [ ] **Step 3: Add transport and dispatcher stubs**

Implement `TransportWebSocket` as a `RefCounted` wrapper around `WebSocketPeer` with `configure`, `connect`, `disconnect`, `poll`, `is_connected`, and `send_json`. Implement `CommandDispatcher` with `configure` and `handle_message`, returning a clear unsupported-command dictionary for Phase 2.1.

- [ ] **Step 4: Add the editor plugin dock**

Implement `godot_mcp_live.gd` as an `EditorPlugin` that creates a `VBoxContainer` dock with labels for connection state, session ID, server URL, active scene, and last error. `_enter_tree()` instantiates collaborators, adds the dock, and calls `_start_bridge()`. `_exit_tree()` calls `_stop_bridge()`, removes the dock, and frees UI nodes.

### Task 3: Enable And Validate In The Test Project

**Files:**
- Modify: `test_mcp_enhancements/project.godot`

- [ ] **Step 1: Enable plugin for the open fixture**

Add `res://addons/godot_mcp_live/plugin.cfg` to `[editor_plugins] enabled=PackedStringArray(...)` while preserving the existing GUT entry.

- [ ] **Step 2: Verify GREEN structurally**

Run: `npm run build && node --test tests/live-addon-skeleton.test.mjs`

Expected: PASS for addon metadata and lifecycle structure.

- [ ] **Step 3: Verify with Godot**

Run a Godot editor/headless parse check against `test_mcp_enhancements`, then use the open editor when possible to confirm the plugin appears in Project Settings > Plugins and can be enabled without script errors.

### Task 4: Update Evidence

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Mark Phase 2.1 skeleton items complete**

Check off created addon files, `@tool`, lifecycle startup/cleanup, and minimal dock panel. Leave `transport_http.gd` unchecked unless WebSocket proves awkward.

- [ ] **Step 2: Add verification note**

Add a dated note with exact commands, test counts, and live-editor status. Record any limitation honestly, especially if the MCP-side server connection must wait for Phase 2.2.

