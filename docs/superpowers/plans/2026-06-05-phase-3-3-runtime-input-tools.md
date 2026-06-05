# Phase 3.3 Runtime Input Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let MCP clients drive live Godot play mode with keyboard, mouse, gamepad, action, text, UI-click, input-state, and wait-condition tools.

**Architecture:** Reuse the Phase 3.2 live runtime debugger bridge. TypeScript registers thin `runtime_input_*`, `runtime_click_ui_*`, and `runtime_wait_for_condition` MCP tools; the live editor dispatcher forwards them through `send_inspection_request()`; the runtime autoload injects Godot `InputEvent*` objects with `Input.parse_input_event()`, polls state over process frames, and returns structured success or timeout data.

**Tech Stack:** TypeScript, Node test runner, MCP tool schemas, Godot 4.6 `Input`, `InputEventAction`, `InputEventKey`, `InputEventMouseButton`, `InputEventMouseMotion`, `InputEventJoypadButton`, `InputEventJoypadMotion`, `Control`, `SceneTree.process_frame`, and the existing Godot MCP live WebSocket/debugger command envelope.

---

### Task 1: Add Focused RED Tests

**Files:**
- Create: `tests/live-runtime-input.test.mjs`
- Modify: `tests/live-addon-skeleton.test.mjs`

- [ ] **Step 1: Test Phase 3.3 tool registration**

Assert `registerLiveEditorTools()` registers:

```text
runtime_input_key
runtime_input_mouse
runtime_input_gamepad
runtime_input_action
runtime_input_text
runtime_input_state
runtime_wait_for_condition
runtime_click_ui_text
runtime_click_ui_path
```

- [ ] **Step 2: Test runtime input command mapping**

Dispatch representative tools through a fake live session and assert they send the matching live command with arguments unchanged:

```text
runtime_input_key -> { key, pressed, echo }
runtime_input_mouse -> { event_type, position, button_index, pressed }
runtime_input_gamepad -> { device, control, index, value, pressed }
runtime_input_action -> { action, pressed, strength }
runtime_input_text -> { text }
runtime_input_state -> { actions, keys, mouse_buttons, gamepad_buttons }
runtime_wait_for_condition -> { kind, node_path, property, equals, wait_timeout_ms, poll_interval_ms }
runtime_click_ui_text -> { text, exact, button_index }
runtime_click_ui_path -> { node_path, button_index }
```

- [ ] **Step 3: Test addon/runtime contract**

Extend `tests/live-addon-skeleton.test.mjs` to require all nine Phase 3.3 command names plus these runtime helpers:

```text
_runtime_input_key
_runtime_input_mouse
_runtime_input_gamepad
_runtime_input_action
_runtime_input_text
_runtime_input_state
_runtime_wait_for_condition
_runtime_click_ui_text
_runtime_click_ui_path
_make_key_event
_make_mouse_button_event
_make_mouse_motion_event
_make_action_event
_make_gamepad_button_event
_make_gamepad_motion_event
```

- [ ] **Step 4: Verify RED**

Run: `npm run build && node --test tests/live-runtime-input.test.mjs tests/live-addon-skeleton.test.mjs`

Expected: FAIL because the Phase 3.3 tools and runtime input handlers do not exist yet.

### Task 2: Register The MCP Runtime Input Tools

**Files:**
- Modify: `src/tools/live-editor.ts`

- [ ] **Step 1: Add liveCommandTool entries**

Register each Phase 3.3 tool as a thin live command wrapper using the existing `liveCommandTool()` helper. Use `10000` ms default timeout for regular input tools and `15000` ms for `runtime_wait_for_condition`.

- [ ] **Step 2: Define focused schemas**

Use these schema surfaces:

```text
runtime_input_key: key, pressed?, echo?
runtime_input_mouse: event_type?, position?, relative?, button_index?, pressed?, factor?
runtime_input_gamepad: device?, control, index, value?, pressed?
runtime_input_action: action, pressed?, strength?
runtime_input_text: text
runtime_input_state: actions?, keys?, mouse_buttons?, gamepad_buttons?, device?
runtime_wait_for_condition: kind, node_path?, property?, equals?, contains?, action?, pressed?, text?, exact?, wait_timeout_ms?, poll_interval_ms?
runtime_click_ui_text: text, exact?, button_index?
runtime_click_ui_path: node_path, button_index?
```

### Task 3: Forward Runtime Input Requests Through The Editor Dispatcher

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`

- [ ] **Step 1: Include Phase 3.3 commands in the debugger-forwarded command branch**

Add the nine Phase 3.3 command names to the existing `match` branch that calls `_handle_runtime_inspection(command, args)`.

### Task 4: Implement Runtime Input Handlers

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/runtime_bridge.gd`

- [ ] **Step 1: Add runtime command branches**

Extend `_handle_inspection_request()` with:

```text
runtime_input_key
runtime_input_mouse
runtime_input_gamepad
runtime_input_action
runtime_input_text
runtime_input_state
runtime_wait_for_condition
runtime_click_ui_text
runtime_click_ui_path
```

- [ ] **Step 2: Implement event creation helpers**

Add helpers that convert JSON-friendly args into Godot input events:

```text
_make_key_event(args: Dictionary) -> InputEventKey
_make_mouse_button_event(args: Dictionary) -> InputEventMouseButton
_make_mouse_motion_event(args: Dictionary) -> InputEventMouseMotion
_make_action_event(args: Dictionary) -> InputEventAction
_make_gamepad_button_event(args: Dictionary) -> InputEventJoypadButton
_make_gamepad_motion_event(args: Dictionary) -> InputEventJoypadMotion
```

For key names, support Godot key constants by `KEY_<UPPERCASE_NAME>` lookup via `@GlobalScope.get()`, numeric keycodes, and single-character fallbacks.

- [ ] **Step 3: Implement direct input tools**

Use `Input.parse_input_event(event)` for key, mouse, gamepad, action, and text injection. Return structured event summaries with `ok`, `event_type`, `pressed`, and relevant key/button/position/action fields.

- [ ] **Step 4: Implement UI click tools**

Resolve click targets from either visible `Control.text` matches or `node_path`. Use the `Control` global rect center to send mouse motion, mouse press, and mouse release events. Return target metadata and click coordinates.

- [ ] **Step 5: Implement input state and wait condition**

`runtime_input_state` reports requested actions, keys, mouse buttons, and gamepad buttons with pressed/strength data. `runtime_wait_for_condition` polls until timeout over `SceneTree.process_frame`, supporting node property equality/containment, UI text visibility, and action pressed state; return `{ matched: true }` or `{ matched: false, timed_out: true }` with the last observed value.

### Task 5: Verification And Ledger Update

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run focused RED/GREEN tests**

Run: `npm run build && node --test tests/live-runtime-input.test.mjs tests/live-addon-skeleton.test.mjs`

- [ ] **Step 2: Run broader live regression**

Run: `npm run build && node --test tests/live-runtime-input.test.mjs tests/live-runtime-inspection.test.mjs tests/live-runtime-debugger.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs`

- [ ] **Step 3: Run full tests**

Run: `npm test`

- [ ] **Step 4: Run Godot parse/runtime smokes**

Run:

```powershell
C:\Users\brett\Desktop\Godot\Godot.exe --headless --editor --path C:\Users\brett\Desktop\godot-mcp\test_mcp_enhancements --quit
C:\Users\brett\Desktop\Godot\Godot.exe --headless --path C:\Users\brett\Desktop\godot-mcp\test_mcp_enhancements --quit-after 1 res://tier1_test_scene.tscn
```

Expected: exit 0 and no `SCRIPT ERROR` or unexpected `ERROR` lines beyond known nested-project/ObjectDB shutdown warnings.

- [ ] **Step 5: Run live runtime acceptance through `.mcp.json`**

Using `.mcp.json` exactly (`node C:/Users/brett/Desktop/godot-mcp/build/index.js` with `GODOT_PATH=C:/Users/brett/Desktop/Godot/Godot.exe`), connect to `127.0.0.1:6010/godot-mcp-live`, start `res://tier1_test_scene.tscn`, wait for `runtime_ready`, and prove:

```text
runtime_input_action can press and release a project action.
runtime_click_ui_text or runtime_click_ui_path can click a visible button/control.
runtime_wait_for_condition reports success for an already-true or input-driven condition.
runtime_wait_for_condition reports structured timeout for a false condition.
runtime_input_state returns structured action/key/mouse/gamepad state.
runtime_stop stops the runtime.
```

- [ ] **Step 6: Update TODO evidence**

Check off Phase 3.3 items in `Enhancements_TODO.md` and add a dated verification note with Context7/API-doc usage, focused/full test counts, Godot smoke results, live proof details, and any GUI/connector reload caveat.
