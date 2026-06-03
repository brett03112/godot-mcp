# Phase 2.4 Live Scene Mutation Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live scene mutation tools so Codex can inspect, edit, dirty, and save the currently open Godot editor scene without requiring a `.tscn` path from the caller.

**Architecture:** Keep the MCP TypeScript layer thin by registering Phase 2.4 tools in `src/tools/live-editor.ts` as named live commands sent through `LiveSessionManager.sendCommand()`. Put editor-only behavior in `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`, using the active edited scene root, scene-root-relative paths, Godot node ownership rules, and the existing response envelope. Use `scene_save_active` as the save implementation and expose `live_scene_save` as the Phase 2.4 command name.

**Tech Stack:** TypeScript, Node test runner, MCP tool schemas, Godot 4.6 `EditorPlugin`, `EditorInterface`, `EditorSelection`, `Node`, `Object.get_property_list()`, `Node.add_child()`, signal `Callable`s, and editor scene save APIs.

---

### Task 1: Add Focused RED Tests

**Files:**
- Create: `tests/live-scene-mutation.test.mjs`
- Modify: `tests/live-addon-skeleton.test.mjs`

- [ ] **Step 1: Test Phase 2.4 tool registration**

Create `tests/live-scene-mutation.test.mjs` and assert the registry contains:

```javascript
[
  'live_scene_get_hierarchy',
  'live_node_get_properties',
  'live_node_set_property',
  'live_node_create',
  'live_node_delete',
  'live_node_duplicate',
  'live_node_reparent',
  'live_node_rename',
  'live_node_connect_signal',
  'live_node_disconnect_signal',
  'live_scene_mark_dirty',
  'live_scene_save',
]
```

- [ ] **Step 2: Test MCP command mapping**

Register a fake live session with a `send` callback, dispatch each Phase 2.4 tool with representative arguments, assert the outbound command name matches the tool name, assert the argument payload preserves snake_case command fields, then resolve the fake `command_response`.

- [ ] **Step 3: Test addon dispatcher contract**

Extend `tests/live-addon-skeleton.test.mjs` to require handler functions for hierarchy reads, property reads, property mutation, node create/delete/duplicate/reparent/rename, signal connect/disconnect, dirty marking, and live save.

- [ ] **Step 4: Verify RED**

Run: `npm run build && node --test tests/live-scene-mutation.test.mjs tests/live-addon-skeleton.test.mjs`

Expected: FAIL because the Phase 2.4 tools and addon handlers are not implemented yet.

### Task 2: Add MCP Tool Definitions

**Files:**
- Modify: `src/tools/live-editor.ts`

- [ ] **Step 1: Register scene mutation tools**

Add `liveCommandTool()` entries for all Phase 2.4 names. Set `timeout: 10000` on mutating and save commands, leaving hierarchy/property reads at the default.

- [ ] **Step 2: Add narrow schemas**

Use these required fields:

```text
live_node_get_properties: node_path
live_node_set_property: node_path, property_name, property_value
live_node_create: parent_path, node_type, node_name
live_node_delete: node_path
live_node_duplicate: node_path
live_node_reparent: node_path, new_parent_path
live_node_rename: node_path, new_name
live_node_connect_signal: source_node_path, signal_name, target_node_path, method_name
live_node_disconnect_signal: source_node_path, signal_name, target_node_path, method_name
```

Keep optional fields explicit: `max_depth`, `include_properties`, `property_names`, `properties`, `select`, `keep_children`, `new_name`, `keep_global_transform`, `flags`, `binds`, and `mark_dirty`.

### Task 3: Add Addon Scene Read And Property Handlers

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`

- [ ] **Step 1: Dispatch new command names**

Add match cases for all Phase 2.4 commands. Route `live_scene_save` to the same implementation as `scene_save_active`.

- [ ] **Step 2: Implement hierarchy reads**

Use `EditorInterface.get_edited_scene_root()` and `_serialize_node()`. Accept `max_depth` and `include_properties`, and return `active_scene`, `root_name`, `root_type`, and `hierarchy`.

- [ ] **Step 3: Implement property reads**

Resolve the requested node relative to the active scene root. Return `path`, `name`, `type`, and a dictionary of property names to serialized values. If `property_names` is supplied, include only those names; otherwise include editor-visible/storage/script properties from `get_property_list()`.

- [ ] **Step 4: Implement property mutation**

Resolve the node, read the old value with `get()`, set the new value with `set()`, call `_mark_scene_dirty()` when `mark_dirty` is true, and return old/new serialized values.

### Task 4: Add Addon Node Mutation Handlers

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`

- [ ] **Step 1: Implement node creation**

Create a node by class name with `ClassDB.instantiate(node_type)`, validate it is a `Node`, name it, add it under `parent_path`, set owner recursively to the edited scene root, apply optional `properties`, select it when `select` is true, mark dirty, and return the new node path.

- [ ] **Step 2: Implement delete, duplicate, reparent, and rename**

Reject root deletion/duplication/reparent. Preserve owner recursively after duplicate or reparent. Support `keep_children` on delete and `keep_global_transform` on reparent for `Node2D`/`Node3D` where possible. Return before/after live paths.

- [ ] **Step 3: Implement signal connect/disconnect**

Resolve source and target nodes, validate the source signal exists, build `Callable(target, method_name)` with optional binds for connect, avoid duplicate connect errors, disconnect only when the connection exists, mark dirty, and return the connection summary.

### Task 5: Verification And Ledger Update

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run focused tests**

Run: `npm run build && node --test tests/live-scene-mutation.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run live editor acceptance**

Against the connected `test_mcp_enhancements` session, prove:

```text
session_list shows one connected editor session
live_scene_get_hierarchy reads the active scene
live_node_create adds a temporary node without a scene path
live_node_set_property mutates that node or a selected node
live_scene_save saves the active scene
a file-backed read/validator sees the saved change afterward
cleanup removes the temporary node and saves again
```

- [ ] **Step 4: Update TODO evidence**

Check off completed Phase 2.4 items and add a dated verification note with exact focused/full test counts, live session ID, active scene path, mutation proof, save proof, and file-backed validation proof.
