# Phase 3.1 Editor Debugger Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first runtime/debugger bridge slice so the live editor addon can see Godot play sessions and exchange a ping/pong message with the running game through Godot's debugger channel.

**Status, 2026-06-05:** Completed with `runtime_ping`, `runtime_play_scene`, and `runtime_stop`; focused tests, full tests, Godot parse/runtime smokes, a controlled headless editor/runtime ping proof, and a GUI editor runtime ping proof after reload passed. Follow-up restart debugging added transport retry after port conflicts, status-triggered retry for recovered bind failures, lazy listener startup so the callable MCP process owns the live bridge, and stale runtime metadata guards; live runtime commands now require a fresh `godot_mcp:runtime_ready` before pinging.

**Architecture:** Keep the existing WebSocket live bridge as the MCP-to-editor transport. Add a Godot `EditorDebuggerPlugin` script inside the live addon to track debugger sessions and capture `godot_mcp:*` runtime messages, plus a runtime autoload script that registers an `EngineDebugger` message capture and responds to pings. Expose the runtime/debugger status through `editor_state` and add narrow `runtime_ping`, `runtime_play_scene`, and `runtime_stop` MCP tools that forward through the existing live command envelope.

**Tech Stack:** TypeScript, Node test runner, MCP tool schemas, Godot 4.6 `EditorPlugin`, `EditorDebuggerPlugin`, `EditorDebuggerSession`, `EngineDebugger`, and the existing Godot MCP live WebSocket command envelope.

---

### Task 1: Add Focused RED Tests

**Files:**
- Create: `tests/live-runtime-debugger.test.mjs`
- Modify: `tests/live-addon-skeleton.test.mjs`

- [ ] **Step 1: Test Phase 3.1 tool registration**

Assert `runtime_ping`, `runtime_play_scene`, and `runtime_stop` are registered by `registerLiveEditorTools()`.

- [ ] **Step 2: Test runtime_ping command mapping**

Dispatch `runtime_ping` through a fake live session and assert the outbound command is `runtime_ping`, `payload` is forwarded unchanged, and the command response exposes `pong: true`, `runtime_session_id`, and `roundtrip_id`.

- [ ] **Step 2b: Test runtime play/stop command mapping**

Dispatch `runtime_play_scene` and `runtime_stop` through a fake live session and assert the outbound commands preserve `scene_path` and return structured success responses.

- [ ] **Step 3: Test live session runtime metadata serialization**

Register a hello or heartbeat payload containing:

```javascript
runtime_status: {
  state: 'running',
  active_session_id: 7,
  sessions: [{ session_id: 7, state: 'running', last_message: 'godot_mcp:runtime_ready' }],
  last_ping: { roundtrip_id: 'ping-1', pong: true }
}
```

Assert `session_list` serializes `runtime_status` and `editor_state` can return matching runtime status data from the addon response.

- [ ] **Step 4: Test addon debugger contract**

Extend `tests/live-addon-skeleton.test.mjs` to require:

```text
debugger_bridge.gd
runtime_bridge.gd
GodotMCPLiveDebuggerBridge extends EditorDebuggerPlugin
_has_capture(capture: StringName) -> bool
_capture(message: String, data: Array, session_id: int) -> bool
_setup_session(session_id: int) -> void
send_ping(args: Dictionary) -> Dictionary
add_debugger_plugin(_debugger_bridge)
remove_debugger_plugin(_debugger_bridge)
EngineDebugger.register_message_capture("godot_mcp", _capture)
EngineDebugger.send_message("godot_mcp:runtime_ready", ...)
EngineDebugger.send_message("godot_mcp:pong", ...)
```

- [ ] **Step 5: Verify RED**

Run: `npm run build && node --test tests/live-runtime-debugger.test.mjs tests/live-addon-skeleton.test.mjs`

Expected: FAIL because Phase 3.1 runtime debugger files, metadata, and `runtime_ping` are not implemented yet.

### Task 2: Extend The Live Session Protocol

**Files:**
- Modify: `src/live/protocol.ts`
- Modify: `src/live/session-manager.ts`
- Modify: `src/tools/live-editor.ts`

- [ ] **Step 1: Add runtimeStatus to session snapshots**

Add an optional `runtimeStatus` field to `LiveSessionSnapshot` and normalize `session.runtime_status` when it is an object.

- [ ] **Step 2: Preserve runtimeStatus across heartbeats**

Update `LiveSessionManager.recordMessage()` so hello, heartbeat, and command-response session snapshots refresh the stored runtime status.

- [ ] **Step 3: Serialize runtime_status for MCP clients**

Update `serializeSession()` to include `runtime_status`.

### Task 3: Add The MCP Runtime Control Tools

**Files:**
- Modify: `src/tools/live-editor.ts`

- [ ] **Step 1: Register runtime_ping**

Add a `liveCommandTool()` entry:

```text
name: runtime_ping
command: runtime_ping
args: runtime_session_id?, payload?
timeout: 10000
```

- [ ] **Step 2: Keep it narrow**

Add only editor-driven runtime start/stop support needed to prove the debugger bridge. Do not add runtime tree or input tools in this phase. Those belong to Phase 3.2 and Phase 3.3.

### Task 4: Add The Editor Debugger Plugin Bridge

**Files:**
- Create: `test_mcp_enhancements/addons/godot_mcp_live/debugger_bridge.gd`
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/godot_mcp_live.gd`
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/session_state.gd`
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`

- [ ] **Step 1: Implement debugger bridge script**

Create `GodotMCPLiveDebuggerBridge` extending `EditorDebuggerPlugin`. It should capture only the `godot_mcp` namespace, track sessions by integer ID, record setup/start/stop/message timestamps, and provide `status()` and `send_ping(args)` methods.

- [ ] **Step 2: Register from the editor plugin**

Preload `debugger_bridge.gd`, create `_debugger_bridge`, call `_debugger_bridge.configure(_state)`, register it with `add_debugger_plugin(_debugger_bridge)` in `_enter_tree()`, and remove it in `_exit_tree()`.

- [ ] **Step 3: Surface runtime status**

Add `runtime_status` to `GodotMCPLiveSessionState`, include it in `to_dictionary()`, and have `_process()` refresh it from `_debugger_bridge.status()`.

- [ ] **Step 4: Route runtime_ping and runtime play/stop**

Configure `GodotMCPLiveCommandDispatcher` with the debugger bridge, add a `runtime_ping` branch that calls `_debugger_bridge.send_ping(args)`, and add `runtime_play_scene`/`runtime_stop` branches that call `EditorInterface.play_custom_scene(scene_path)` and `EditorInterface.stop_playing_scene()`.

### Task 5: Add The Runtime Autoload Helper

**Files:**
- Create: `test_mcp_enhancements/addons/godot_mcp_live/runtime_bridge.gd`
- Modify: `test_mcp_enhancements/project.godot`

- [ ] **Step 1: Implement runtime bridge script**

Create `GodotMCPLiveRuntimeBridge` extending `Node`. On `_ready()`, register `EngineDebugger.register_message_capture("godot_mcp", _capture)` and send `godot_mcp:runtime_ready` with runtime metadata. In `_capture()`, respond to `ping` by sending `godot_mcp:pong` with the received roundtrip ID and payload.

- [ ] **Step 2: Register autoload**

Add:

```ini
[autoload]
GodotMCPLiveRuntime="*res://addons/godot_mcp_live/runtime_bridge.gd"
```

without removing existing project settings.

### Task 6: Verification And Ledger Update

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run focused tests**

Run: `npm run build && node --test tests/live-runtime-debugger.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run Godot parse smoke**

Run: `C:\Users\brett\Desktop\Godot\Godot.exe --headless --editor --path C:\Users\brett\Desktop\godot-mcp\test_mcp_enhancements --quit`

Expected: exit 0 with no Phase 3.1 addon parse errors.

- [ ] **Step 4: Run live/runtime acceptance where the current listener permits it**

Start a built MCP server and a controlled Godot editor session. Use `runtime_play_scene` to start the game from the editor, prove `session_list` reports runtime status, prove `runtime_ping` receives a `pong` response, then use `runtime_stop` to stop play mode.

- [ ] **Step 5: Update TODO evidence**

Check off Phase 3.1 completed items that are verified and add a dated note with focused/full test counts, Godot parse smoke result, Context7/API-doc source used, live bridge status, and any GUI reload caveat.
