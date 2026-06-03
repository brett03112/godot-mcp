# Phase 2.3 Live Editor State Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live editor state tools and read-only MCP resources so Codex can inspect and control the currently connected Godot editor session.

**Architecture:** Extend the existing Phase 2.2 WebSocket/session manager with request/response command dispatch, then keep all Godot editor API calls in the live addon dispatcher. MCP tools in `src/tools/live-editor.ts` stay thin: resolve a target session, send a named live command, and return structured JSON. MCP resource handlers expose live snapshots by calling the same safe command path or by reading cached session metadata.

**Tech Stack:** TypeScript, Node test runner, `ws`, MCP resources, Godot 4.6 `EditorPlugin`, `EditorInterface`, `EditorSelection`, `Performance`, and `SubViewport` screenshot capture.

---

### Task 1: Add Focused RED Tests

**Files:**
- Create: `tests/live-editor-state.test.mjs`
- Modify: `tests/live-addon-skeleton.test.mjs`

- [ ] **Step 1: Test live command request/response behavior**

Create a test that registers a fake session with a `send` callback, dispatches `editor_state`, captures the outbound command payload, feeds a `command_response` back into `LiveSessionManager.recordMessage()`, and asserts the tool returns the command data.

- [ ] **Step 2: Test selection and scene tools**

Add tests for `scene_current`, `selection_get`, `selection_set`, and `scene_save_active`. Each test should assert the outbound command name and request args, then resolve it with a simulated addon response.

- [ ] **Step 3: Test registration surface**

Assert all Phase 2.3 tools are registered: `editor_state`, session tools, scene tools, selection tools, screenshot, logs, monitors, and quit.

- [ ] **Step 4: Test addon dispatcher structure**

Extend the addon skeleton test to require concrete dispatcher handlers for `editor_state`, `scene_current`, `selection_get`, `selection_set`, `scene_save_active`, and `editor_screenshot`, replacing the old unsupported-only Phase 2.1 contract.

- [ ] **Step 5: Verify RED**

Run: `npm run build && node --test tests/live-editor-state.test.mjs tests/live-addon-skeleton.test.mjs`

Expected: FAIL because command promises, new tools, and addon handlers do not exist yet.

### Task 2: Add MCP Command Dispatch Plumbing

**Files:**
- Modify: `src/live/protocol.ts`
- Modify: `src/live/session-manager.ts`

- [ ] **Step 1: Add command payload types**

Add `LiveCommandMessage`, enrich `LiveCommandResponseMessage`, and add helpers for command response detection.

- [ ] **Step 2: Add pending request tracking**

Add `sendCommand()` to `LiveSessionManager`. It should resolve the target session, require a connected `send` callback, create a unique `request_id`, send `{ kind: "command", request_id, command, args }`, and wait for a matching `command_response`.

- [ ] **Step 3: Resolve or reject responses**

Update `recordMessage()` so `command_response` updates session state, resolves a pending request on `status: "success"`, and rejects with the addon error message on `status: "error"`.

- [ ] **Step 4: Timeout cleanly**

Reject pending requests with a clear timeout message and remove them from the pending map. Keep the default short enough for editor state reads but configurable for screenshot and save commands.

### Task 3: Add Phase 2.3 MCP Tools

**Files:**
- Modify: `src/tools/live-editor.ts`

- [ ] **Step 1: Register all tools**

Register `editor_state`, `scene_current`, `scene_open`, `scene_save_active`, `scene_reload_active`, `selection_get`, `selection_set`, `editor_screenshot`, `logs_read_editor`, `logs_clear`, `editor_monitors_get`, and `editor_quit` alongside the existing session tools.

- [ ] **Step 2: Add common live command helper**

Normalize `session_id`, `project_path`, and `timeout_ms`, call `manager.sendCommand()`, and return JSON with `status`, `session`, and command-specific `data`.

- [ ] **Step 3: Add tool schemas**

Keep schemas narrow. Require `node_paths` for `selection_set`, `scene_path` for `scene_open`, and `output_path` for `editor_screenshot`; make `session_id`, `project_path`, and `timeout_ms` optional on all live tools.

### Task 4: Add Addon Dispatcher Handlers

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/session_state.gd`
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`

- [ ] **Step 1: Enrich session snapshot**

Track `open_scenes`, `selected_nodes`, and editor monitor summaries in `GodotMCPLiveSessionState.to_dictionary()`.

- [ ] **Step 2: Implement scene state reads**

Use `EditorInterface.get_edited_scene_root()`, `get_open_scenes()`, and root traversal to return active scene metadata and a compact hierarchy.

- [ ] **Step 3: Implement selection operations**

Use `EditorInterface.get_selection()` plus `EditorSelection.clear()` and `add_node()` to read and set selected node paths relative to the active scene root.

- [ ] **Step 4: Implement safe scene operations**

Use `open_scene_from_path()`, `save_scene()`, and `reload_scene_from_path()` where available. Return clear errors when there is no active scene.

- [ ] **Step 5: Implement screenshot, logs, monitors, and quit**

Save editor viewport screenshots to a project-relative path with `SubViewport.get_texture().get_image().save_png()`. Return retained addon log messages for `logs_read_editor`, clear them for `logs_clear`, read selected `Performance` monitors, and gate `editor_quit` behind an explicit `confirm: true`.

### Task 5: Add Live MCP Resources

**Files:**
- Modify: `src/tools/live-editor.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add resource descriptors**

List `godot-mcp://live/sessions`, `godot-mcp://live/editor/state`, `godot-mcp://live/scene/current`, `godot-mcp://live/scene/hierarchy`, `godot-mcp://live/selection/current`, and `godot-mcp://live/logs/recent`.

- [ ] **Step 2: Add resource reads**

Read `sessions` from the manager directly. For editor state, scene, hierarchy, selection, and logs, dispatch the corresponding live command against the active or only session and return structured JSON.

### Task 6: Verify And Update The Ledger

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run focused tests**

Run: `npm run build && node --test tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run live smoke**

With the Godot editor and Godot MCP Live connected, call `session_list`, `editor_state`, `scene_current`, `selection_get`, `selection_set`, `scene_save_active`, and `editor_screenshot` through the built MCP server against `test_mcp_enhancements`.

- [ ] **Step 4: Update TODO evidence**

Check off completed Phase 2.3 items and add a dated verification note with exact test counts, live session ID, active scene, selected node proof, save result, and screenshot output path.

