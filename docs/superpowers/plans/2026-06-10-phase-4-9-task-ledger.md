# Phase 4.9 Issue Tracker And Task Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transparent project-local task, evidence, session report, and changelog tools that leave a structured trail under `.godot-mcp/`.

**Architecture:** Add a focused `src/tools/task-ledger.ts` module that owns `.godot-mcp/task-ledger.json` plus evidence files under `.godot-mcp/evidence/`. Keep all state file-backed and deterministic, expose compact JSON responses, and keep generated reports/changelogs optional output files inside the project.

**Tech Stack:** TypeScript MCP tools, Node filesystem/path APIs, JSON state persistence, existing `ToolRegistry` registration/mapping flow, and the Phase 4 project-local state pattern used by quality gates and asset pipeline tools.

---

## Scope

- Add these Phase 4.9 tools:
  - `mcp_task_create`
  - `mcp_task_update`
  - `mcp_task_list`
  - `mcp_task_close`
  - `mcp_evidence_attach`
  - `mcp_session_report`
  - `mcp_changelog_draft`
- Store task state in `.godot-mcp/task-ledger.json`.
- Store copied or inline evidence in `.godot-mcp/evidence/`.
- Return structured task/evidence/session/changelog payloads that Codex can cite in later work.
- Keep the tools optional, local, and transparent; no external issue tracker integration in this phase.

## File Structure

- Create `src/tools/task-ledger.ts`
  - Registers all seven tools.
  - Validates `project_path` with the repo's existing `ctx.validatePath` pattern.
  - Reads/writes `.godot-mcp/task-ledger.json`.
  - Resolves only project-contained evidence and output paths.
- Create `tests/task-ledger.test.mjs`
  - Covers registration, create/list/update/close, evidence attachment, session reports, changelog drafts, and path guards.
- Modify `src/index.ts`
  - Import and call `registerTaskLedgerTools`.
  - Add snake_case to camelCase mappings used by these tools.
- Create `test_mcp_enhancements/phase49_live_proof.mjs`
  - Uses the built server registry path to list/call all seven tools against disposable `.godot-mcp/phase49_*` data, then removes proof artifacts.
- Modify `README.md`
  - Increase tool count by seven and add the task ledger tools to the tool reference/resource list.
- Modify `Enhancements_TODO.md`
  - Check off Phase 4.9 and add the verification note.

## Tasks

- [x] Write focused RED tests in `tests/task-ledger.test.mjs`.

```js
test('Phase 4.9 task ledger tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'mcp_task_create',
    'mcp_task_update',
    'mcp_task_list',
    'mcp_task_close',
    'mcp_evidence_attach',
    'mcp_session_report',
    'mcp_changelog_draft',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});
```

- [x] Run `npm run build && node --test tests/task-ledger.test.mjs`.
  - Expected RED: `ERR_MODULE_NOT_FOUND` for `build/tools/task-ledger.js`.
- [x] Implement `src/tools/task-ledger.ts`.
  - `mcp_task_create`: required `project_path`, `title`; optional `description`, `status`, `priority`, `assignee`, `tags`, `source`, `related_files`, `recommendations`.
  - `mcp_task_update`: required `project_path`, `task_id`; optional editable fields, `append_notes`, `add_related_files`, `add_recommendations`.
  - `mcp_task_list`: filters by `status`, `tag`, `query`, `include_closed`, `limit`.
  - `mcp_task_close`: required `project_path`, `task_id`; optional `resolution`, `summary`, `recommendations`.
  - `mcp_evidence_attach`: required `project_path`; accepts `task_id`, `kind`, `title`, `summary`, `content`, `source_path`, `output_path`, `metadata`.
  - `mcp_session_report`: summarizes open/closed tasks and evidence; optionally writes `output_path`.
  - `mcp_changelog_draft`: drafts grouped Markdown from closed tasks and evidence; optionally writes `output_path`.
- [x] Register `registerTaskLedgerTools` from `src/index.ts`.
- [x] Add snake_case parameter mappings in `src/index.ts` for Phase 4.9 arguments.
- [x] Add `test_mcp_enhancements/phase49_live_proof.mjs`.
  - Create a task, update it, attach inline evidence, list it, close it, write a report, write a changelog, and remove `.godot-mcp/phase49_*` proof artifacts plus the disposable task ledger.
- [x] Update README tool count/tool list references from 325 to 332 tools.
- [x] Run `npm run build && node --test tests/task-ledger.test.mjs`.
- [x] Run `npm test`.
- [x] Run a Godot headless editor smoke against `test_mcp_enhancements`.
- [x] Run `node test_mcp_enhancements/phase49_live_proof.mjs`.
- [x] Update `Enhancements_TODO.md` checkboxes and add a dated verification note.
- [ ] Run `git diff --check`.
- [ ] After connector reload, prove direct Codex MCP namespace callability for the Phase 4.9 tools and `session_list`.

## Verification Notes To Capture

- Focused RED failure reason.
- Focused GREEN test count.
- Full `npm test` count.
- Godot headless smoke exit status and error scan.
- Proof script tool count and all seven tool call results.
- Startup/live listener state and whether direct Codex MCP namespace callability still needs connector reload.

## Verification Update, 2026-06-10

- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/task-ledger.js`.
- Focused Phase 4.9 tests passed 4/4 with `npm run build && node --test tests/task-ledger.test.mjs`.
- Full `npm test` passed 138/138.
- Godot headless editor smoke against `test_mcp_enhancements` exited 0; the smoke log had 0 `SCRIPT ERROR`/`ERROR:` matches. Godot emitted the pre-existing nested-project warning for `res://test/tier2_projects/blank_test` and an ObjectDB leak warning at exit.
- `node test_mcp_enhancements/phase49_live_proof.mjs` listed 332 tools, found all seven Phase 4.9 tools, called create/update/list/close/evidence/report/changelog successfully, and restored/remedied temporary `.godot-mcp` proof artifacts.
- Startup checks before implementation left one `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor PID established to it, but the direct Codex MCP namespace returned `Transport closed`. After rebuild, the current built listener was refreshed at PID 22996 and Godot editor PID 6860 reconnected to it on `127.0.0.1:6010`; direct Codex MCP namespace callability still needs the Codex MCP connector namespace reloaded.
