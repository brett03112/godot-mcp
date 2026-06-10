# Phase 4.10 Safer Autonomous Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safer autonomous planning tools that help Codex choose MCP tools, sequence feature work, plan tests, scan risk, check project health, and plan post-change verification before editing.

**Architecture:** Add a focused `src/tools/safer-planning.ts` module that builds deterministic recommendations from the registered MCP tool catalog plus project-local file facts. Keep the surface file-backed/read-only by default, return structured JSON plans, and wire all seven tools through the existing `ToolRegistry` and snake_case parameter mapping path.

**Tech Stack:** TypeScript MCP tools, Node filesystem/path APIs, existing `ToolRegistry`, existing `ServerContext.validatePath`, project-local Godot file inspection, and the established Phase 4 Node proof harness pattern.

---

## Scope

- Add these Phase 4.10 tools:
  - `capability_matrix`
  - `recommend_next_tool`
  - `plan_feature_implementation`
  - `plan_test_strategy`
  - `risk_scan`
  - `preflight_project_health`
  - `postchange_verification_plan`
- Keep outputs advisory and deterministic; no LLM calls, network calls, or mutation side effects.
- Let callers pass `available_tools` for catalog-aware planning while the tool can also return a built-in capability matrix.
- Inspect project structure for scenes, scripts, addons, tests, import artifacts, evidence ledgers, and likely risk signals.
- Update README tool counts and tool/resource references from 332 to 339.

## File Structure

- Create `src/tools/safer-planning.ts`
  - Registers all seven tools.
  - Owns capability categories, goal keyword matching, risk rules, health checks, and verification-plan generation.
  - Validates `project_path` when project inspection is requested.
- Create `tests/safer-planning.test.mjs`
  - Covers registration, capability matrix filtering, pause-menu recommendation sequence, feature/test planning, risk scan, health preflight, and post-change verification planning.
- Modify `src/index.ts`
  - Import and call `registerSaferPlanningTools`.
  - Add mappings for Phase 4.10 snake_case fields.
- Create `test_mcp_enhancements/phase410_live_proof.mjs`
  - Lists the built MCP catalog, confirms all seven tools, then calls each tool against `test_mcp_enhancements`.
- Modify `README.md`
  - Increase counts and add the new planning tools to the tool reference and resource list.
- Modify `Enhancements_TODO.md`
  - Check off Phase 4.10 and add a dated verification note.

## Tasks

- [x] Write focused RED tests in `tests/safer-planning.test.mjs`.
- [x] Run `npm run build && node --test tests/safer-planning.test.mjs`.
  - Expected RED: `ERR_MODULE_NOT_FOUND` for `build/tools/safer-planning.js`.
- [x] Implement `src/tools/safer-planning.ts`.
- [x] Register `registerSaferPlanningTools` from `src/index.ts`.
- [x] Add Phase 4.10 parameter mappings in `src/index.ts`.
- [x] Add `test_mcp_enhancements/phase410_live_proof.mjs`.
- [x] Update README tool count/tool list/resource references.
- [x] Run `npm run build && node --test tests/safer-planning.test.mjs`.
- [x] Run `npm test`.
- [x] Run a Godot headless editor smoke against `test_mcp_enhancements`.
- [x] Run `node test_mcp_enhancements/phase410_live_proof.mjs`.
- [x] Update `Enhancements_TODO.md` checkboxes and add a dated verification note.
- [x] Run `git diff --check`.
- [ ] After reload, prove direct Codex MCP namespace callability for the Phase 4.10 tools and `session_list`.

## Verification Notes To Capture

- Focused RED failure reason.
- Focused GREEN test count.
- Full `npm test` count.
- Godot headless smoke exit status and error scan.
- Proof script tool count and all seven tool call results.
- Startup/live listener state and whether direct Codex MCP namespace callability requires connector reload.

## Verification Update, 2026-06-10

- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/safer-planning.js`.
- Focused Phase 4.10 tests passed 6/6 with `npm run build && node --test tests/safer-planning.test.mjs`.
- Full `npm test` passed 144/144.
- Godot headless editor smoke against `test_mcp_enhancements` exited 0; the smoke log had 0 `SCRIPT ERROR`/`ERROR:` matches. Godot emitted the pre-existing nested-project warning for `res://test/tier2_projects/blank_test` and an ObjectDB leak warning at exit.
- `node test_mcp_enhancements/phase410_live_proof.mjs` listed 339 tools, found all seven Phase 4.10 tools, proved the pause-menu recommendation path, called every new planning tool successfully, and left no temporary proof artifacts.
- Startup checks initially left exactly one stale pre-build `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor PID established to it; direct Codex MCP namespace callability returned `Transport closed`. After build verification, a temporary current-build listener proved PID 24796 could own `127.0.0.1:6010` and Godot editor PID 6860 could reconnect to it. That temporary holder was stopped before handoff so it will not block the Codex MCP connector reload. Direct Codex MCP namespace callability still needs connector reload because `mcp__godot_mcp.session_list` still returns `Transport closed`.
- `git diff --check` exited 0 with Git CRLF warnings only.
