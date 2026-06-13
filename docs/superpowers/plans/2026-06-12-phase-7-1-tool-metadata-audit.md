# Phase 7.1 Tool Metadata Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the full registered tool catalog and correct Phase 5.0 metadata used by profile filtering.

**Architecture:** Keep metadata centralized in `src/toolsets.ts`. Add explicit overrides for tools where name inference is weak, then add a catalog-level test that starts the built MCP server and checks every registered tool has complete, valid metadata plus representative corrected values.

**Tech Stack:** TypeScript, MCP stdio JSON-RPC, Node test runner.

---

### Task 1: RED Metadata Audit Test

**Files:**
- Create: `tests/tool-metadata-audit.test.mjs`

- [ ] **Step 1: Write the failing catalog audit test**

Add a test that starts `build/index.js`, calls `initialize`, calls `tools/list`, and asserts:
- every registered tool has `toolset`, `risk`, `mutates`, `requires_live`, and `requires_display`;
- metadata values use known toolsets and risks;
- `editor_screenshot` requires display;
- `runtime_profile_capture` requires display;
- `start_profiler` is a deprecated alias for `profiler`, remains visible for compatibility, and uses high-risk display metadata;
- `asset_library_*_addon` tools are project tools;
- `filesystem_reimport` is a project tool;
- `live_addon_status` is a project read-only compatibility tool;
- mutating `editor_filesystem_*` and `editor_resource_uid_update` tools remain live tools.

- [ ] **Step 2: Run RED**

Run: `npm run build && node --test tests/tool-metadata-audit.test.mjs`

Expected: FAIL before implementation on at least `editor_screenshot`, `runtime_profile_capture`, `start_profiler`, and project/addon classification assertions.

### Task 2: Metadata Corrections

**Files:**
- Modify: `src/toolsets.ts`
- Test: `tests/tool-metadata-audit.test.mjs`

- [ ] **Step 1: Add explicit metadata overrides**

Add a small `EXPLICIT_TOOL_METADATA` map in `src/toolsets.ts` for names that should not depend on weak inference.

- [ ] **Step 2: Merge override metadata**

Update `getToolMetadata()` precedence so explicit tool definition metadata wins, then explicit audit overrides, then deprecated alias metadata, then inference.

- [ ] **Step 3: Preserve deprecated aliases**

Keep the five known deprecated aliases visible and marked deprecated for compatibility. Do not remove tool registrations.

- [ ] **Step 4: Run GREEN**

Run: `npm run build && node --test tests/tool-metadata-audit.test.mjs`

Expected: PASS.

### Task 3: Full Verification And Ledger

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run focused profile tests**

Run: `node --test tests/toolset-profiles.test.mjs tests/tool-metadata-audit.test.mjs`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run Godot proof**

Run: `npm run smoke:non-live` and `npm run smoke:live`.

- [ ] **Step 4: Update Phase 7.1 ledger**

Check off Phase 7.1 in `Enhancements_TODO.md` and add the dated verification note.

- [ ] **Step 5: Final whitespace check**

Run: `git diff --check`.
