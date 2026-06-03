# Phase 1.6 Camera Workflow Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 1.6 non-live camera workflow tools so Codex can create, configure, inspect, and validate Camera2D/Camera3D nodes in Godot scenes through the existing file-backed MCP path.

**Architecture:** Add one focused `src/tools/camera-workflow.ts` module registered from `src/index.ts`. Keep tool schemas, parameter normalization, and Godot JSON parsing in TypeScript; route scene mutations and bounds previews through `src/scripts/godot_operations.gd` so Godot owns Camera2D/Camera3D node creation, property assignment, scene saving, and scene hierarchy reads.

**Tech Stack:** TypeScript ESM, existing `ToolRegistry`, existing `ServerContext`, Godot 4.6 Camera2D/Camera3D APIs, Godot headless script operations, Node test runner.

---

### Task 1: Test Phase 1.6 Tool Behavior

**Files:**
- Create: `tests/camera-workflow.test.mjs`
- Build dependency: `src/tools/camera-workflow.ts`

- [x] **Step 1: Write focused tests**

Cover registration for `create_camera`, `configure_camera`, `setup_camera_follow_2d`, `set_camera_limits_2d`, `set_camera_smoothing_2d`, `apply_camera_preset`, `list_cameras`, and `preview_camera_bounds`.

- [x] **Step 2: Test payload mapping**

Assert that camera creation and camera configuration tools map snake_case MCP parameters to narrow Godot operations named `camera_create`, `camera_configure`, `camera_setup_follow_2d`, `camera_set_limits_2d`, `camera_set_smoothing_2d`, `camera_apply_preset`, `camera_list`, and `camera_preview_bounds`.

- [x] **Step 3: Run focused verification in RED**

Run: `npm run build && node --test tests/camera-workflow.test.mjs`

Expected before implementation: failure because `build/tools/camera-workflow.js` does not exist or the registry lacks the Phase 1.6 tools.

Observed: `ERR_MODULE_NOT_FOUND` for `build/tools/camera-workflow.js`.

### Task 2: Implement TypeScript Tool Module

**Files:**
- Create: `src/tools/camera-workflow.ts`
- Modify: `src/index.ts`

- [x] **Step 1: Add camera workflow registration**

Create `registerCameraWorkflowTools(registry, ctx)` and register all eight Phase 1.6 tools.

- [x] **Step 2: Add schemas and parameter mapping**

Expose snake_case tool schemas while accepting normalized camelCase values from `ServerContext.normalizeParameters`. Map user inputs to focused Godot operations without adding broad arbitrary execution.

- [x] **Step 3: Register module from server startup**

Import `registerCameraWorkflowTools` in `src/index.ts` and call it after `registerUiThemeWorkflowTools`.

### Task 3: Implement Godot Camera Operations

**Files:**
- Modify: `src/scripts/godot_operations.gd`

- [x] **Step 1: Add operation dispatch entries**

Add Phase 1.6 `camera_*` match cases near the existing Phase 1.5 `ui_*` operations.

- [x] **Step 2: Add scene mutation operations**

Implement camera node creation, generic Camera2D/Camera3D configuration, Camera2D follow metadata/script attachment, Camera2D limits, Camera2D smoothing, and named camera presets.

- [x] **Step 3: Add inspection operations**

Implement camera listing and Camera2D bounds preview using saved scene data. Return node path, camera type, current/enabled status, zoom/FOV, limits, smoothing, target/follow metadata, and approximate bounds when available.

### Task 4: Verify Against `test_mcp_enhancements`

**Files:**
- Modify: `Enhancements_TODO.md`

- [x] **Step 1: Run focused tests**

Run: `npm run build && node --test tests/camera-workflow.test.mjs`

Expected after implementation: all focused camera workflow tests pass.

Result: passed 4/4 focused tests.

- [x] **Step 2: Run full tests**

Run: `npm test`

Expected after implementation: all repository tests pass.

Result: `npm test` passed 43/43 repository tests.

- [x] **Step 3: Run Godot smoke operations**

Using `C:\Users\brett\Desktop\Godot\Godot.exe` against `test_mcp_enhancements`, copy a temporary scene, create a Camera2D, configure follow/limits/smoothing/preset values, list cameras, preview bounds, then remove temporary smoke artifacts.

Result: built camera workflow tools created `McpPhase16Camera`, attached follow behavior targeting `../NewParent`, set limits and smoothing, applied `platformer_2d`, listed one enabled/current camera, previewed 960x540 bounds, and removed temporary smoke artifacts.

- [x] **Step 4: Update ledger**

Mark Phase 1.6 checklist items complete and add a dated verification note with focused tests, full tests, and Godot smoke evidence.
