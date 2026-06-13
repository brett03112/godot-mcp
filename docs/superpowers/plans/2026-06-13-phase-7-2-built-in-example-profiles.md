# Phase 7.2 Built-In Example Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add built-in, documented toolset profiles for common Godot MCP workflows.

**Architecture:** Keep profile resolution centralized in `src/toolsets.ts`. Add built-in named profiles that can be selected with `GODOT_MCP_PROFILE`, expose copy/paste snippets and current count examples through `toolset_status`, and document the same profiles in README and autonomous workflow docs.

**Tech Stack:** TypeScript, MCP stdio JSON-RPC, Node test runner, existing Godot MCP live smoke scripts.

---

### Task 1: RED Built-In Profile Tests

**Files:**
- Create: `tests/built-in-profiles.test.mjs`

- [ ] **Step 1: Write the failing test**

Add tests that import `getBuiltInToolsetProfiles`, `createActiveToolProfile`, `filterToolDefinitions`, and `toolsetStatusPayload` from `build/toolsets.js`.

Assert these built-in profiles exist:

```js
[
  'planning-readonly',
  'scene-edit',
  'live-editor',
  'runtime-debug',
  'playtest-loop',
  'visual-qa',
  'release-check',
]
```

For each profile, assert `GODOT_MCP_PROFILE=<name>` activates a filtered profile without requiring `.godot-mcp/toolsets.json`.

- [ ] **Step 2: Run RED**

Run: `npm run build && node --test tests/built-in-profiles.test.mjs`

Expected: FAIL because `getBuiltInToolsetProfiles` does not exist yet.

### Task 2: Built-In Profile Runtime Support

**Files:**
- Modify: `src/toolsets.ts`
- Test: `tests/built-in-profiles.test.mjs`

- [ ] **Step 1: Add profile definitions**

Add definitions for:

```ts
planning-readonly: exact read-only planning, diagnostics, and inspection tools
scene-edit: core, project, scene, script, assets, quality
live-editor: core, project, scene, script, live, visual
runtime-debug: core, project, live, runtime, debug
playtest-loop: core, project, playtest, runtime, visual, quality
visual-qa: core, project, scene, live, runtime, visual, quality
release-check: core, project, quality, release, debug
```

- [ ] **Step 2: Resolve built-ins**

Update named profile loading so project-local `.godot-mcp/toolsets.json` wins when present, then built-in profiles are used as fallback.

- [ ] **Step 3: Expose examples in status**

Add `built_in_profiles` to `toolset_status` payloads with profile description, env snippet, `.godot-mcp/toolsets.json` snippet, verification commands, resources, and current loaded/hidden count examples.

- [ ] **Step 4: Run GREEN**

Run: `npm run build && node --test tests/built-in-profiles.test.mjs`

Expected: PASS.

### Task 3: Docs And Ledger

**Files:**
- Modify: `README.md`
- Modify: `docs/autonomous-workflows.md`
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Document copy/paste snippets**

Add PowerShell snippets and `.godot-mcp/toolsets.json` snippets for all seven built-in profiles.

- [ ] **Step 2: Add proved count examples**

After focused verification, add current loaded/hidden count examples for each profile.

- [ ] **Step 3: Update Phase 7.2 ledger**

Check off Phase 7.2 and add a dated verification note.

### Task 4: Verification

**Files:**
- Test: `tests/built-in-profiles.test.mjs`
- Test: `tests/toolset-profiles.test.mjs`
- Test: `tests/tool-metadata-audit.test.mjs`

- [ ] **Step 1: Run focused profile tests**

Run: `npm run build && node --test tests/built-in-profiles.test.mjs tests/toolset-profiles.test.mjs tests/tool-metadata-audit.test.mjs`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run smokes**

Run: `npm run smoke:non-live` and `npm run smoke:live`.

- [ ] **Step 4: Run direct MCP proof**

Start a fresh local stdio MCP server with `GODOT_MCP_PROFILE=scene-edit` and verify `toolset_status`, filtered count, and a hidden tool disabled response.

- [ ] **Step 5: Run final whitespace check**

Run: `git diff --check`.
