# Script Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Phase 1.2 `script_patch` MCP tool so Codex can make small, anchor-based GDScript edits without regenerating entire files.

**Architecture:** Implement a focused `src/tools/script-patch.ts` module registered through the existing `ToolRegistry` pattern. The tool resolves a project-local `.gd` file, computes a full replacement in memory, optionally validates the patched script through the existing Godot operation layer, and only writes after all guardrails pass.

**Tech Stack:** TypeScript ESM, Node built-in `fs/promises`, `path`, `node:test`, MCP `ToolDefinition` responses.

---

### Task 1: Register The Tool Shape

**Files:**
- Create: `src/tools/script-patch.ts`
- Modify: `src/index.ts`
- Test: `tests/script-patch.test.mjs`

- [ ] **Step 1: Write a failing registration test**

Add a `script_patch` test that imports `registerScriptPatchTools`, registers it with a `ToolRegistry`, and asserts `registry.has('script_patch')`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run build && node --test tests/script-patch.test.mjs`
Expected: FAIL because `../build/tools/script-patch.js` does not exist.

- [ ] **Step 3: Add the minimal module and register it from `src/index.ts`**

Create `src/tools/script-patch.ts` with `registerScriptPatchTools(registry, ctx)` and a stub handler. Import and call it from `src/index.ts` next to `registerBatchTools`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run build && node --test tests/script-patch.test.mjs`
Expected: PASS for registration, with later behavior tests still missing.

### Task 2: Exact Anchor Insert And Line Ending Preservation

**Files:**
- Modify: `src/tools/script-patch.ts`
- Test: `tests/script-patch.test.mjs`

- [ ] **Step 1: Write a failing exact-anchor test**

Create a temporary Godot project with `project.godot` and `player.gd`, call `script_patch` with `mode: 'insert_after'`, `anchor_type: 'exact_text'`, and `anchor: 'func _ready():\r\n\tpass'`, then assert the inserted text is written and `\r\n` line endings are preserved.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run build && node --test tests/script-patch.test.mjs`
Expected: FAIL because the stub does not patch files.

- [ ] **Step 3: Implement project-safe file resolution and exact text insertion**

Resolve `project_path` plus `script_path`/`file_path`, reject traversal and non-`.gd` targets, read the file as UTF-8, detect `\r\n` vs `\n`, normalize patch text to the detected line ending, apply `insert_before`, `insert_after`, and `append_to_file`, then write once.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run build && node --test tests/script-patch.test.mjs`
Expected: PASS for registration and exact-anchor insertion.

### Task 3: Function Block Replacement

**Files:**
- Modify: `src/tools/script-patch.ts`
- Test: `tests/script-patch.test.mjs`

- [ ] **Step 1: Write a failing function-anchor replacement test**

Call `script_patch` with `mode: 'replace_block'`, `anchor_type: 'function_name'`, and `anchor: '_physics_process'`, then assert only that function block is replaced while following functions remain.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run build && node --test tests/script-patch.test.mjs`
Expected: FAIL because function block anchors are not implemented.

- [ ] **Step 3: Implement GDScript block matching**

Find `func <name>(...)` declarations with indentation, then extend the block until the next non-empty line with indentation less than or equal to the function declaration. Use the resulting range for `replace_block`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run build && node --test tests/script-patch.test.mjs`
Expected: PASS for function block replacement.

### Task 4: Guardrails, Dry Run, And Validation

**Files:**
- Modify: `src/tools/script-patch.ts`
- Test: `tests/script-patch.test.mjs`

- [ ] **Step 1: Write failing guardrail tests**

Add tests for ambiguous exact anchors requiring `occurrence`, missing anchors not writing unless `allow_append_fallback` is true, `dry_run` returning a unified diff without writing, `replace_range`, `class_member` anchors, opt-in regex anchors, and `validate_after` invoking `ctx.executeOperation`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run build && node --test tests/script-patch.test.mjs`
Expected: FAIL for missing guardrail behavior.

- [ ] **Step 3: Implement the remaining modes and guardrails**

Support `replace_range` with one-based inclusive lines, `class_member` anchors for `var`, `const`, `signal`, `enum`, and `@export var` declarations, regex anchors only when `anchor_type: 'regex'` and `regex: true` are set, occurrence selection, `allow_append_fallback`, dry-run diffs, and validation before writes.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run build && node --test tests/script-patch.test.mjs`
Expected: PASS for all `script_patch` tests.

### Task 5: Documentation And Full Verification

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Mark Phase 1.2 completed with verification evidence**

Update the Phase 1.2 checklist and add a dated verification note with the commands and result counts.

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: all Node tests pass after a TypeScript build.

- [ ] **Step 3: Inspect git diff**

Run: `git diff -- src/tools/script-patch.ts src/index.ts tests/script-patch.test.mjs Enhancements_TODO.md docs/superpowers/plans/2026-06-03-script-patch.md`
Expected: diff is limited to Phase 1.2 code, tests, and docs.
