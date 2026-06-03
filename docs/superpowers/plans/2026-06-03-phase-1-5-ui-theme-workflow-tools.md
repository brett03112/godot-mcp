# Phase 1.5 UI And Theme Workflow Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 1.5 non-live UI and theme workflow tools so Codex can generate usable menu/control scenes, create and mutate Theme resources, apply themes, inspect UI layout, and flag obvious safe-area/layout mistakes.

**Architecture:** Add one focused `src/tools/ui-theme-workflow.ts` module registered from `src/index.ts`. Keep tool schemas, parameter normalization, and Godot JSON response parsing in TypeScript; route scene/resource mutations plus layout inspection/validation through `src/scripts/godot_operations.gd` so Godot owns Control and Theme serialization through `PackedScene` and `ResourceSaver.save()`.

**Tech Stack:** TypeScript ESM, existing `ToolRegistry`, existing `ServerContext`, GDScript Control/Theme/StyleBoxFlat APIs, Godot 4.6 headless script operations, Node test runner.

---

### Task 1: Test Phase 1.5 Tool Behavior

**Files:**
- Create: `tests/ui-theme-workflow.test.mjs`
- Build dependency: `src/tools/ui-theme-workflow.ts`

- [x] **Step 1: Write focused tests**

Cover registration for all Phase 1.5 tools, creation recipe payloads, control property mutation payloads, theme/stylebox payloads, apply-theme payloads, and inspect/validate operation dispatch.

- [x] **Step 2: Run focused verification in RED**

Run: `npm run build && node --test tests/ui-theme-workflow.test.mjs`

Observed before implementation: `ERR_MODULE_NOT_FOUND` for `build/tools/ui-theme-workflow.js`.

### Task 2: Implement TypeScript Tool Module

**Files:**
- Create: `src/tools/ui-theme-workflow.ts`
- Modify: `src/index.ts`

- [x] **Step 1: Add tool module**

Register:

`create_ui_layout`, `draw_ui_recipe`, `set_control_anchor_preset`, `set_control_offsets`, `set_control_text`, `set_control_theme_override`, `create_theme`, `theme_set_color`, `theme_set_constant`, `theme_set_font_size`, `theme_set_stylebox_flat`, `apply_theme`, `inspect_ui_layout`, `validate_ui_safe_area`.

- [x] **Step 2: Add schema and parameter mapping**

Expose snake_case tool schemas, normalize both snake_case and camelCase, and map each tool to one narrow Godot operation.

- [x] **Step 3: Register module from the server**

Import `registerUiThemeWorkflowTools` in `src/index.ts` and call it after the Phase 1.4 resource workflow tools.

### Task 3: Implement Godot UI/Theme Operations

**Files:**
- Modify: `src/scripts/godot_operations.gd`

- [x] **Step 1: Add match cases**

Add `ui_*` operation entries beside the Phase 1.4 resource workflow operations.

- [x] **Step 2: Add scene/control operations**

Implement `ui_create_layout`, `ui_draw_recipe`, `ui_set_control_anchor_preset`, `ui_set_control_offsets`, `ui_set_control_text`, `ui_set_control_theme_override`, `ui_apply_theme`, `ui_inspect_layout`, and `ui_validate_safe_area`.

- [x] **Step 3: Add theme operations**

Implement `ui_create_theme`, `ui_theme_set_color`, `ui_theme_set_constant`, `ui_theme_set_font_size`, and `ui_theme_set_stylebox_flat`.

### Task 4: Verify Against `test_mcp_enhancements`

**Files:**
- Modify: `Enhancements_TODO.md`

- [x] **Step 1: Run focused tests**

Run: `npm run build && node --test tests/ui-theme-workflow.test.mjs`

Result: passed 5/5 focused tests.

- [x] **Step 2: Run full tests**

Run: `npm test`

Result: passed 39/39 repo tests.

- [x] **Step 3: Run Godot smoke operations**

Using `C:\Users\brett\Desktop\Godot\Godot.exe` against `test_mcp_enhancements`, create a temporary menu scene from `draw_ui_recipe`, create and mutate a Theme resource, apply it, inspect the UI layout, validate safe area, and remove temporary `mcp_phase15_*` smoke artifacts.

Result: a Godot 4.6.3 headless smoke created and mutated a real Theme resource, generated a pause-menu scene, applied the theme, changed button text and panel offsets, inspected 7 controls, validated 0 issues, and removed the temporary artifacts. A compiled MCP stdio smoke listed 155 tools, created and validated a temporary main-menu scene with 0 issues, and removed it.

- [x] **Step 4: Update ledger**

Mark Phase 1.5 checklist items complete and add a dated verification note with focused tests, full tests, and Godot smoke evidence.
