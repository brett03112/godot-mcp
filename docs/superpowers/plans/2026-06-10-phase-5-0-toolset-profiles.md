# Phase 5.0 Toolset Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profile-aware MCP tool catalogs so sessions can expose only the toolsets needed for the current Godot feature workflow.

**Architecture:** Keep default behavior backward-compatible by loading every tool when no profile env var is set. Add a central `src/toolsets.ts` profile layer that infers metadata for existing modular and legacy tools, filters tool definitions, and generates disabled-tool remediation; wire `src/index.ts` so `tools/list`, tool resources, catalog resources, and dispatch all use that same active profile. Add `src/tools/toolset-profile.ts` for read-only `toolset_status` and `recommend_toolset_profile`, then add narrow lifecycle wrappers in the existing playtest/profiling modules while marking legacy sibling names as deprecated aliases.

**Tech Stack:** TypeScript, MCP SDK request handlers, Node test runner, Godot 4.6 test fixture.

---

### Task 1: RED Test For Toolset Profiles

**Files:**
- Create: `tests/toolset-profiles.test.mjs`

- [ ] **Step 1: Write the failing test**

Create tests that import `../build/toolsets.js`, `../build/tools/toolset-profile.js`, the existing `ToolRegistry`, and the playtest/profiling modules. Cover default all-tools behavior, `GODOT_MCP_TOOLSETS`, `GODOT_MCP_TOOLS`, per-project `.godot-mcp/toolsets.json`, disabled dispatch, status/recommendation tools, deprecated alias metadata, and consolidated `playtest_recording`/`profiler` action validation.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/toolset-profiles.test.mjs`

Expected: FAIL with missing `build/toolsets.js` or `build/tools/toolset-profile.js`.

### Task 2: Core Profile Layer

**Files:**
- Create: `src/toolsets.ts`
- Modify: `src/types.ts`
- Modify: `src/registry.ts`

- [ ] **Step 1: Add metadata types**

Add `ToolMetadata` to `ToolDefinition` with `toolset`, `aliases`, `risk`, `mutates`, `requires_live`, `requires_display`, `requires_godot_version`, and deprecation fields.

- [ ] **Step 2: Implement first-pass metadata inference**

Create the twelve Phase 5.0 toolsets: `core`, `project`, `scene`, `script`, `assets`, `live`, `runtime`, `playtest`, `visual`, `quality`, `debug`, and `release`. Infer metadata from known tool names and name prefixes so all existing tools get useful metadata without rewriting every tool module.

- [ ] **Step 3: Implement profile resolution**

Parse `GODOT_MCP_TOOLSETS`, `GODOT_MCP_TOOLS`, optional `GODOT_MCP_PROJECT_PATH`, and optional `GODOT_MCP_PROFILE`. If no filter is set, return the all-tools profile. If an explicit allowlist is set, include the requested tools plus required core support tools.

- [ ] **Step 4: Implement disabled-tool responses**

Return a structured error with `status: "disabled"`, the hidden tool name, its metadata, and a remediation message naming the needed env var or profile setting.

### Task 3: Server Wiring And Read-Only Tools

**Files:**
- Create: `src/tools/toolset-profile.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Register read-only profile tools**

Add `toolset_status` and `recommend_toolset_profile`, wired to the active catalog provider.

- [ ] **Step 2: Filter list/catalog/resource surfaces**

Wrap the existing modular and legacy tool list with the same profile filter. Use filtered definitions for `tools/list`, `godot-mcp://tools/catalog`, and per-tool resource lookup.

- [ ] **Step 3: Filter dispatch**

Before modular or legacy dispatch, reject known hidden tools with the disabled-tool response.

### Task 4: Lifecycle Aliases

**Files:**
- Modify: `src/tools/playtest.ts`
- Modify: `src/tools/profiling.ts`

- [ ] **Step 1: Add consolidated wrappers**

Add `playtest_recording` with `action: "start" | "stop"` and `profiler` with `action: "start" | "get" | "analyze"`.

- [ ] **Step 2: Preserve legacy aliases**

Keep `start_playtest_recording`, `stop_playtest_recording`, `start_profiler`, `get_profiling_data`, and `analyze_bottlenecks` registered, but mark them deprecated aliases in metadata.

### Task 5: Planning Awareness And Docs

**Files:**
- Modify: `src/tools/safer-planning.ts`
- Modify: `README.md`
- Create: `docs/autonomous-workflows.md`
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Add active-profile awareness to safer-planning outputs**

Accept optional active profile hints and include profile/remediation notes in `recommend_next_tool`, `plan_feature_implementation`, `plan_test_strategy`, `risk_scan`, and `postchange_verification_plan`.

- [ ] **Step 2: Document session setup**

Add README and workflow examples for env var profiles, per-project named profiles, common feature-to-toolset mappings, safe read-only defaults, live/playtest/display caveats, and reload requirements.

- [ ] **Step 3: Update TODO verification note**

Check off Phase 5.0 items with dated evidence only after focused tests, full tests, Godot proof, and diff check pass.

### Task 6: Verification

**Files:**
- Create: `test_mcp_enhancements/phase50_live_proof.mjs`

- [ ] **Step 1: Run focused tests**

Run: `npm run build && node --test tests/toolset-profiles.test.mjs`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run Godot proof**

Run a Phase 5.0 proof script against `test_mcp_enhancements` that checks default catalog size, profile-filtered catalog size, explicit-tool profile behavior, disabled-tool error remediation, status/recommendation calls, and alias action validation.

- [ ] **Step 4: Run final checks**

Run: `git diff --check`

Expected: focused tests pass, full suite passes, Godot editor smoke exits 0 with no script errors, Phase 5.0 proof reports the expected filtered/hidden tool counts, and whitespace check passes.
