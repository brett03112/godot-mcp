# Phase 7.4 Runtime Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make runtime tool profile filtering consistent, visible, and actionable across tools, resources, status, and dispatch.

**Architecture:** Keep profile resolution in `src/toolsets.ts`, dispatch filtering in `src/registry.ts`, and MCP protocol filtering in `src/index.ts`. Add focused Node coverage that proves the same filtered catalog drives `tools/list`, `godot-mcp://tools/catalog`, per-tool resources, and disabled hidden-tool calls.

**Tech Stack:** TypeScript ESM, MCP stdio JSON-RPC, Node test runner, existing smoke scripts.

---

### Task 1: RED Runtime Filtering Tests

**Files:**
- Modify: `tests/toolset-profiles.test.mjs`

- [ ] **Step 1: Add failing status assertions**

Add assertions that default full-catalog mode reports:

```js
status.mode === 'all'
status.loaded_tool_count === SAMPLE_TOOLS.length
status.hidden_tool_count === 0
status.full_catalog.heavy === true
status.full_catalog.recommended_normal_mode === false
```

Add assertions that invalid toolsets/profile names produce warnings:

```js
createActiveToolProfile({
  env: { GODOT_MCP_TOOLSETS: 'core,bad-set', GODOT_MCP_PROFILE: 'missing-profile' },
  allToolNames: names(SAMPLE_TOOLS),
}).warnings
```

Expected warning text names both invalid inputs.

- [ ] **Step 2: Add failing MCP protocol assertions**

Spawn `build/index.js` with `GODOT_MCP_TOOLSETS=core,script`, then assert:

```js
tools/list includes script_patch
tools/list excludes run_automated_playtest
resources/read godot-mcp://tools/catalog excludes run_automated_playtest
resources/read godot-mcp://tools/run_automated_playtest returns not found
tools/call run_automated_playtest returns status "disabled"
```

- [ ] **Step 3: Run RED**

Run: `npm run build && node --test tests/toolset-profiles.test.mjs`

Expected: FAIL because the new status fields and warnings are missing.

### Task 2: Runtime Behavior Implementation

**Files:**
- Modify: `src/toolsets.ts`
- Modify if needed: `src/index.ts`
- Modify if needed: `src/registry.ts`
- Test: `tests/toolset-profiles.test.mjs`

- [ ] **Step 1: Add invalid config warnings**

In `createActiveToolProfile`, warn for unknown `GODOT_MCP_TOOLSETS` entries and unknown configured tools.

- [ ] **Step 2: Add full-catalog status summary**

In `toolsetStatusPayload`, add:

```ts
catalog_summary
full_catalog
resources.filtered_by_active_profile
```

The summary must expose loaded/hidden counts and mark full mode as heavy.

- [ ] **Step 3: Keep filtered resource behavior aligned**

Confirm `src/index.ts` reads resources through `getAvailableToolDefinitions()` and blocks hidden per-tool resources. Patch only if the RED protocol test exposes drift.

- [ ] **Step 4: Run GREEN**

Run: `npm run build && node --test tests/toolset-profiles.test.mjs`

Expected: PASS.

### Task 3: Final Verification And Ledger

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run profile regression**

Run:

```powershell
npm run build && node --test tests/toolset-profiles.test.mjs tests/built-in-profiles.test.mjs tests/tool-metadata-audit.test.mjs
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run smoke:non-live
npm run smoke:live
git diff --check
```

- [ ] **Step 3: Update Phase 7.4 checkboxes and verification note**

Include focused test counts, full test counts, smoke results, listener PID, Godot PID, and reload status.
