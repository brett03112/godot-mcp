# Phase 3.2 Runtime Inspection Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let MCP clients inspect the live running Godot scene tree, runtime node state, UI controls, focus, viewport, performance, input map, and groups while play mode is active.

**Architecture:** Reuse the Phase 3.1 live runtime bridge. TypeScript registers narrow `runtime_*` MCP tools that dispatch editor live commands; the editor `EditorDebuggerPlugin` forwards those commands to the active runtime through `EditorDebuggerSession.send_message()`, captures `godot_mcp:inspection_result`, and returns the result; the runtime autoload inspects the active `SceneTree` and replies over `EngineDebugger.send_message()`.

**Tech Stack:** TypeScript, Node test runner, MCP tool schemas, Godot 4.6 `EditorDebuggerPlugin`, `EditorDebuggerSession`, `EngineDebugger`, `SceneTree`, `Node`, `Control`, `Viewport`, `Performance`, `InputMap`, and the existing Godot MCP live WebSocket command envelope.

---

### Task 1: Add Focused RED Tests

**Files:**
- Create: `tests/live-runtime-inspection.test.mjs`
- Modify: `tests/live-addon-skeleton.test.mjs`

- [ ] **Step 1: Test Phase 3.2 tool registration**

Assert `registerLiveEditorTools()` registers:

```text
runtime_get_scene_tree
runtime_get_node_info
runtime_get_node_property
runtime_watch_node
runtime_get_ui_elements
runtime_get_focus_owner
runtime_get_viewport_info
runtime_get_performance_metrics
runtime_get_input_map
runtime_get_groups
```

- [ ] **Step 2: Test runtime inspection command mapping**

Dispatch representative tools through a fake live session and assert they send the matching live commands with their arguments unchanged:

```javascript
runtime_get_scene_tree -> { max_depth, include_properties }
runtime_get_node_info -> { node_path, include_properties, include_groups }
runtime_get_node_property -> { node_path, property }
runtime_watch_node -> { node_path, properties }
runtime_get_ui_elements -> { include_hidden, include_disabled, max_depth }
```

- [ ] **Step 3: Test addon debugger contract**

Extend `tests/live-addon-skeleton.test.mjs` to require:

```text
runtime_get_scene_tree
runtime_get_node_info
runtime_get_node_property
runtime_watch_node
runtime_get_ui_elements
runtime_get_focus_owner
runtime_get_viewport_info
runtime_get_performance_metrics
runtime_get_input_map
runtime_get_groups
send_inspection_request(args: Dictionary)
godot_mcp:inspection_request
godot_mcp:inspection_result
_handle_inspection_request
_runtime_scene_tree
_runtime_node_info
_runtime_ui_elements
```

- [ ] **Step 4: Verify RED**

Run: `npm run build && node --test tests/live-runtime-inspection.test.mjs tests/live-addon-skeleton.test.mjs`

Expected: FAIL because the Phase 3.2 tools and runtime inspection handlers do not exist yet.

### Task 2: Register The MCP Runtime Inspection Tools

**Files:**
- Modify: `src/tools/live-editor.ts`

- [ ] **Step 1: Add liveCommandTool entries**

Register each Phase 3.2 tool as a thin live command wrapper. Keep timeout at `10000` ms because these requests round-trip through the debugger channel.

- [ ] **Step 2: Define focused schemas**

Use these schema surfaces:

```text
runtime_get_scene_tree: max_depth?, include_properties?
runtime_get_node_info: node_path, include_properties?, include_groups?
runtime_get_node_property: node_path, property
runtime_watch_node: node_path, properties?
runtime_get_ui_elements: include_hidden?, include_disabled?, max_depth?
runtime_get_focus_owner: no args
runtime_get_viewport_info: no args
runtime_get_performance_metrics: no args
runtime_get_input_map: no args
runtime_get_groups: no args
```

### Task 3: Forward Inspection Requests Through The Editor Debugger Bridge

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/debugger_bridge.gd`
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`

- [ ] **Step 1: Add debugger bridge request/response tracking**

Add `send_inspection_request(args: Dictionary) -> Dictionary`. It must validate an active runtime session with the same fresh `runtime_ready` guard used by `send_ping()`, create a `request_id`, store a pending request record, send `godot_mcp:inspection_request` with command and args, wait briefly for a matching `godot_mcp:inspection_result`, and return either the runtime result or a structured timeout error.

- [ ] **Step 2: Capture inspection_result messages**

In `_capture()`, handle `inspection_result` by copying the payload, marking it with `runtime_session_id` and `received_unix`, and storing it in `_inspection_results[request_id]`.

- [ ] **Step 3: Route dispatcher commands**

Add command branches for all ten `runtime_*` inspection commands. Each branch calls `_debugger_bridge.send_inspection_request()` with:

```gdscript
{
  "command": command_name,
  "args": args,
}
```

### Task 4: Implement Runtime Autoload Inspection Handlers

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/runtime_bridge.gd`

- [ ] **Step 1: Add inspection request capture**

Extend `_capture()` so `inspection_request` calls `_handle_inspection_request(_first_dictionary(data))`, sends `godot_mcp:inspection_result`, and returns `true`.

- [ ] **Step 2: Add common serialization helpers**

Add helpers for runtime-safe serialization:

```gdscript
_node_path(node: Node) -> String
_node_summary(node: Node, include_properties := false) -> Dictionary
_serialize_variant(value) -> Variant
_safe_get(node: Node, property_name: String)
_find_runtime_node(node_path: String) -> Node
```

Support primitives, `Vector2`, `Vector3`, `Rect2`, `Color`, `NodePath`, arrays, and dictionaries. Fall back to `str(value)` for complex objects.

- [ ] **Step 3: Implement tree and node handlers**

Implement:

```text
runtime_get_scene_tree
runtime_get_node_info
runtime_get_node_property
runtime_watch_node
runtime_get_groups
```

The scene tree response must include the current scene path, root node summary, and nested children up to `max_depth`. Node info must include class, name, path, visibility when present, process mode, groups when requested, and selected properties when requested.

- [ ] **Step 4: Implement UI and viewport handlers**

Implement:

```text
runtime_get_ui_elements
runtime_get_focus_owner
runtime_get_viewport_info
```

UI elements should include Control nodes with text when available, global bounds, disabled/visible state, focus mode, whether each node has focus, and mouse filter. Viewport info should include visible rect, size, mouse position, and focused control path when available.

- [ ] **Step 5: Implement metrics and input handlers**

Implement:

```text
runtime_get_performance_metrics
runtime_get_input_map
```

Performance metrics should return common `Performance` monitor values that are available in Godot 4.6. Input map should return action names and serialized events from `InputMap`.

### Task 5: Verification And Ledger Update

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run focused tests**

Run: `npm run build && node --test tests/live-runtime-inspection.test.mjs tests/live-runtime-debugger.test.mjs tests/live-addon-skeleton.test.mjs`

- [ ] **Step 2: Run broader live regression**

Run: `npm run build && node --test tests/live-runtime-inspection.test.mjs tests/live-runtime-debugger.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs`

- [ ] **Step 3: Run full tests**

Run: `npm test`

- [ ] **Step 4: Run Godot parse/runtime smokes**

Run:

```powershell
C:\Users\brett\Desktop\Godot\Godot.exe --headless --editor --path C:\Users\brett\Desktop\godot-mcp\test_mcp_enhancements --quit
C:\Users\brett\Desktop\Godot\Godot.exe --headless --path C:\Users\brett\Desktop\godot-mcp\test_mcp_enhancements --quit-after 1 res://tier1_test_scene.tscn
```

Expected: exit 0 and no `SCRIPT ERROR` or unexpected `ERROR` lines beyond known nested-project/ObjectDB shutdown warnings.

- [ ] **Step 5: Run live runtime acceptance**

Using the `.mcp.json` stdio command (`node C:/Users/brett/Desktop/godot-mcp/build/index.js`) and `GODOT_PATH=C:/Users/brett/Desktop/Godot/Godot.exe`, connect to the live bridge, start `res://tier1_test_scene.tscn` with `runtime_play_scene`, wait for fresh `runtime_ready`, then prove:

```text
runtime_get_scene_tree returns the live scene root
runtime_get_node_info returns runtime node metadata
runtime_get_ui_elements returns visible Control metadata when controls exist
runtime_get_focus_owner and runtime_get_viewport_info return structured state
runtime_get_performance_metrics, runtime_get_input_map, and runtime_get_groups return structured data
runtime_stop stops the runtime
```

- [ ] **Step 6: Update TODO evidence**

Check off Phase 3.2 items in `Enhancements_TODO.md` and add a dated verification note with Context7/API-doc usage, focused/full test counts, Godot smoke results, live proof details, and any GUI/connector reload caveat.
