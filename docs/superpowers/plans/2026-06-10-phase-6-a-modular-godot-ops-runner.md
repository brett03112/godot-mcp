# Phase 6.A Modular Godot Operations Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the non-live Godot operation script behind the stable `godot_operations.gd` entrypoint while preserving existing MCP operation names and JSON contracts.

**Architecture:** Keep `src/scripts/godot_operations.gd` as the `godot --headless --script` entrypoint, but reduce it to argument parsing and dispatch through modules under `src/scripts/godot_ops/`. Move the previous monolith into a legacy module for compatibility, then register dedicated modules for asset pipeline reimport and camera workflow operations.

**Tech Stack:** Godot 4.6 GDScript, Node.js `node:test`, TypeScript build script, existing MCP `executeOperation` path.

---

### Task 1: Add RED Contract Tests

**Files:**
- Create: `tests/phase-6-a-modular-runner.test.mjs`

- [ ] **Step 1: Write the failing test**

Add tests that assert `src/scripts/godot_operations.gd` is a small entrypoint, `src/scripts/godot_ops/operation_registry.gd` registers moved operation names, `scripts/build.js` copies the whole script tree, and the asset pipeline TS tool still calls `ctx.executeOperation('asset_batch_reimport', ...)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/phase-6-a-modular-runner.test.mjs`

Expected: FAIL because `src/scripts/godot_ops/` and registry files do not exist yet.

### Task 2: Add Modular GDScript Runner

**Files:**
- Modify: `src/scripts/godot_operations.gd`
- Create: `src/scripts/godot_ops/operation_context.gd`
- Create: `src/scripts/godot_ops/operation_registry.gd`
- Create: `src/scripts/godot_ops/legacy_operations.gd`

- [ ] **Step 1: Move the old implementation body**

Move the current `godot_operations.gd` implementation into `legacy_operations.gd`, convert it from a script entrypoint into an instantiable operation module, and keep the original logging/error helper behavior.

- [ ] **Step 2: Write the new entrypoint**

Replace `godot_operations.gd` with a small `SceneTree` script that parses the operation and JSON params, creates `OperationContext`, registers modules with `OperationRegistry`, dispatches the operation, and quits with `0` or `1`.

- [ ] **Step 3: Verify focused tests**

Run: `npm run build && node --test tests/phase-6-a-modular-runner.test.mjs`

Expected: PASS for runner shape, registry names, build tree copy, and TS delegation.

### Task 3: Move Asset Pipeline And Camera Families

**Files:**
- Create: `src/scripts/godot_ops/asset_pipeline_ops.gd`
- Create: `src/scripts/godot_ops/camera_ops.gd`
- Modify: `src/scripts/godot_ops/operation_registry.gd`
- Modify: `src/scripts/godot_ops/legacy_operations.gd`

- [ ] **Step 1: Move `asset_batch_reimport`**

Place `asset_batch_reimport` and `_asset_pipeline_to_res_path` in `asset_pipeline_ops.gd`, registering `asset_batch_reimport` in the registry before the legacy fallback.

- [ ] **Step 2: Move camera workflow**

Place `camera_create`, `camera_configure`, `camera_setup_follow_2d`, `camera_set_limits_2d`, `camera_set_smoothing_2d`, `camera_apply_preset`, `camera_list`, `camera_preview_bounds`, and camera-local helpers in `camera_ops.gd`, registering all camera operation names.

- [ ] **Step 3: Verify existing family tests**

Run: `npm run build && node --test tests/asset-pipeline.test.mjs tests/camera-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs`

Expected: PASS.

### Task 4: Build, Smoke, And Ledger

**Files:**
- Modify: `scripts/build.js`
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Copy the full script tree**

Update `scripts/build.js` so `build/scripts` receives all files under `src/scripts`, including `godot_ops/**`.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run smoke:non-live
C:/Users/brett/Desktop/Godot/Godot.exe --headless --path test_mcp_enhancements --script build/scripts/godot_operations.gd asset_batch_reimport "{\"asset_paths\":[\"res://icon.svg\"],\"wait_for_completion\":false}"
git diff --check
```

Expected: all commands exit `0`; the direct operation smoke returns JSON with `"operation":"asset_batch_reimport"`.

- [ ] **Step 3: Update ledger**

Check off Phase 6.A in `Enhancements_TODO.md` and add the dated verification note with focused test, full test, non-live smoke, direct Godot smoke, and live reload/callability status.
