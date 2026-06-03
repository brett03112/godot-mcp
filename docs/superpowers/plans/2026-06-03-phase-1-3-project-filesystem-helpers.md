# Phase 1.3 Project And Filesystem Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 1.3 non-live project, autoload, filesystem, UID, and dependency helper tools to the existing modular MCP server.

**Architecture:** Add one focused `src/tools/project-filesystem.ts` module registered from `src/index.ts`. Use direct, guarded `project.godot` parsing for settings/autoload reads and writes, disk scanning for search/graph/orphan/UID reports, and a conservative Godot import command for `filesystem_reimport`.

**Tech Stack:** TypeScript ESM, Node `fs/promises`, existing `ToolRegistry`, existing `ServerContext`, Node test runner.

---

### Task 1: Test Phase 1.3 Tool Behavior

**Files:**
- Create: `tests/project-filesystem.test.mjs`
- Build dependency: `src/tools/project-filesystem.ts`

- [x] **Step 1: Write failing tests**

Cover tool registration, settings get/set dry-run and allowlist rejection, autoload list/add/remove, filesystem search by glob/class/resource/text, filesystem scan, reimport command wiring, UID resolution, dependency graph, orphan detection, and missing UID reports.

- [x] **Step 2: Run tests to verify RED**

Run: `npm run build; node --test tests/project-filesystem.test.mjs`

Expected: build fails because `src/tools/project-filesystem.ts` is not implemented yet, or the focused tests fail because the tools are not registered.

### Task 2: Implement Project And Filesystem Helpers

**Files:**
- Create: `src/tools/project-filesystem.ts`
- Modify: `src/index.ts`

- [x] **Step 1: Add tool module**

Register:

`project_settings_get`, `project_settings_set`, `autoload_list`, `autoload_add`, `autoload_remove`, `filesystem_search`, `filesystem_reimport`, `filesystem_scan`, `uid_resolve`, `dependency_graph`, `find_orphaned_assets`, `find_missing_uid_files`.

- [x] **Step 2: Register module from the server**

Import `registerProjectFilesystemTools` in `src/index.ts` and call it after existing project tools.

- [x] **Step 3: Run focused tests**

Run: `npm run build; node --test tests/project-filesystem.test.mjs`

Expected: all focused tests pass.

### Task 3: Verify And Update Ledger

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run full verification**

Run: `npm test`

Expected: all repo tests pass.

- [ ] **Step 2: Update Phase 1.3 checklist**

Mark completed helper tools and add a dated verification note with the commands and counts.
