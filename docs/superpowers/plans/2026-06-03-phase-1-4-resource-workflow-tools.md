# Phase 1.4 Resource Workflow Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 1.4 non-live resource workflow tools so Codex can search, inspect, create, assign, convert, and fit common Godot resources without hand-authoring `.tres` text at the call site.

**Architecture:** Add one focused `src/tools/resource-workflow.ts` module registered from `src/index.ts`. Keep read-only search/metadata operations in TypeScript for speed, and route resource creation, scene assignment, format conversion, and physics-shape fitting through `src/scripts/godot_operations.gd` so Godot owns resource serialization through `ResourceSaver.save()`.

**Tech Stack:** TypeScript ESM, Node `fs/promises`, existing `ToolRegistry`, existing `ServerContext`, GDScript ResourceSaver/ResourceLoader operations, Node test runner.

---

### Task 1: Test Phase 1.4 Tool Behavior

**Files:**
- Create: `tests/resource-workflow.test.mjs`
- Build dependency: `src/tools/resource-workflow.ts`

- [x] **Step 1: Write focused tests**

Cover registration for all Phase 1.4 tools, metadata search/info/preview behavior for text resources, and operation dispatch payloads for resource creation, curve updates, scene assignment, physics-shape fitting, and format conversion.

- [x] **Step 2: Run focused verification**

Run: `npm run build && node --test tests/resource-workflow.test.mjs`

Result: passed 4/4 focused tests after implementation.

### Task 2: Implement Resource Workflow Tools

**Files:**
- Create: `src/tools/resource-workflow.ts`
- Modify: `src/index.ts`
- Modify: `src/scripts/godot_operations.gd`

- [x] **Step 1: Add tool module**

Register:

`resource_search`, `resource_get_info`, `resource_assign`, `resource_preview_metadata`, `create_gradient_texture`, `create_noise_texture`, `create_curve_resource`, `set_curve_points`, `create_environment_resource`, `create_physics_material`, `autofit_physics_shape`, `resource_convert_format`.

- [x] **Step 2: Add Godot operations**

Add ResourceSaver-backed GDScript operations for gradient/noise/curve/environment/physics material creation, curve point replacement, resource assignment to scene node properties, physics shape fitting, and `.tres`/`.res` conversion.

- [x] **Step 3: Register module from the server**

Import `registerResourceWorkflowTools` in `src/index.ts`, add Phase 1.4 parameter mappings, and call the module after Phase 1.3 helpers.

### Task 3: Verify Against `test_mcp_enhancements`

**Files:**
- Modify: `Enhancements_TODO.md`

- [x] **Step 1: Run full tests**

Run: `npm test`

Result: passed 34/34 Node tests.

- [x] **Step 2: Run Godot 4.6.3 smoke operations**

Using `C:\Users\brett\Desktop\Godot\Godot.exe` against `test_mcp_enhancements`, verify ResourceSaver-backed creation of GradientTexture2D, NoiseTexture2D, Curve, Environment, and PhysicsMaterial resources, curve point replacement, `.tres` to `.res` conversion, resource assignment to a copied Sprite2D scene, and autofit of a copied physics scene's CollisionShape2D.

- [x] **Step 3: Clean smoke artifacts and update ledger**

Remove temporary `mcp_phase14_*` resources/scenes and update Phase 1.4 checklist plus the dated verification note.
