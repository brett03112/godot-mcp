# Phase 4.8 Performance, Memory, And Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-local performance budgets, runtime profile comparison, memory snapshots, individual budget checks, and a named quality gate runner for pre-export validation.

**Architecture:** Add a focused `src/tools/quality-gates.ts` module that stores budget definitions under `.godot-mcp/performance_budgets/`, reads existing `.mcp_profiling/profile_*.json` data when available, and exposes deterministic file-backed checks for tests plus live/editor metric hooks where the runtime bridge can provide them. Keep each check independent, then compose them through `quality_gate_run`.

**Tech Stack:** TypeScript MCP tools, Node filesystem/path APIs, existing profiling output format, existing asset scan patterns, Godot 4.6 `Performance.get_monitor()` metrics, and the repo's `ToolRegistry` registration/mapping flow.

---

## Scope

- Add these Phase 4.8 tools:
  - `performance_budget_create`
  - `performance_budget_check`
  - `runtime_profile_capture`
  - `runtime_profile_compare`
  - `memory_snapshot`
  - `node_count_budget_check`
  - `draw_call_budget_check`
  - `texture_memory_budget_check`
  - `export_size_budget_check`
  - `quality_gate_run`
- Store named budgets as JSON files in `.godot-mcp/performance_budgets/<budget-name>.json`.
- Read profile summaries from `.mcp_profiling/profile_*.json` and optionally create a fresh profile by delegating to existing `start_profiler` behavior through `quality_gate_run`.
- Make pass/fail output structured and recommendation-bearing so Codex can use it before export.
- Keep file-backed checks deterministic for tests and headless proof; live metrics remain optional enrichment when callable after reload.

## Evidence

- `Enhancements_TODO.md` Phase 4.8 requires performance, memory, and quality gate tools with named pass/fail gates before export.
- Existing `src/tools/profiling.ts` already writes `.mcp_profiling/profile_*.json` containing FPS, frame time, draw calls, memory, object, and node samples.
- Context7 Godot 4.6 docs confirm `Performance.get_monitor(Performance.TIME_FPS)` and rendering/video-memory monitors such as `RENDER_TOTAL_DRAW_CALLS_IN_FRAME`, `RENDER_VIDEO_MEM_USED`, and `RENDER_TEXTURE_MEM_USED`.

## Tasks

- [x] Write focused RED tests in `tests/quality-gates.test.mjs` covering registration, budget create/check, profile capture/compare, memory snapshot, each budget check, and composed `quality_gate_run`.
- [x] Run `npm run build && node --test tests/quality-gates.test.mjs` and confirm RED fails because `build/tools/quality-gates.js` is missing.
- [x] Add `src/tools/quality-gates.ts` with project path guards, budget persistence, profile parsing/summarizing, recommendations, and JSON responses.
- [x] Register `registerQualityGateTools` from `src/index.ts`.
- [x] Add snake_case parameter mappings in `src/index.ts` for Phase 4.8 arguments.
- [x] Add `test_mcp_enhancements/phase48_live_proof.mjs` that lists all 10 tools, creates a disposable budget, exercises every tool against deterministic fixtures, and removes temporary `.godot-mcp/phase48_*` and `.mcp_profiling/phase48_*` artifacts.
- [x] Update README tool count/tool list references for the 10 new tools.
- [x] Run `npm run build && node --test tests/quality-gates.test.mjs`.
- [x] Run `npm test`.
- [x] Run a Godot headless editor smoke against `test_mcp_enhancements`.
- [x] Run `node test_mcp_enhancements/phase48_live_proof.mjs`.
- [x] Update `Enhancements_TODO.md` checkboxes and add a dated verification note.
- [x] Run `git diff --check`.
- [ ] After connector reload, prove direct Codex MCP namespace callability for the Phase 4.8 tools and `session_list`.

## Verification Update, 2026-06-10

- Context7 Godot 4.6 docs confirmed `Performance.get_monitor(...)` usage and rendering/video-memory counters such as `RENDER_TOTAL_DRAW_CALLS_IN_FRAME`, `RENDER_VIDEO_MEM_USED`, and `RENDER_TEXTURE_MEM_USED`.
- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/quality-gates.js`.
- Focused Phase 4.8 tests passed 5/5 with `npm run build && node --test tests/quality-gates.test.mjs`.
- Full `npm test` passed 134/134.
- `node test_mcp_enhancements/phase48_live_proof.mjs` listed 325 tools, found all 10 Phase 4.8 tools, created disposable profile/budget/export/scene artifacts, called every new tool successfully, and removed temporary proof artifacts.
- Godot headless editor smoke against `test_mcp_enhancements` exited 0; the smoke log had 0 `SCRIPT ERROR`/`ERROR:` matches. Godot emitted the pre-existing nested-project warning for `res://test/tier2_projects/blank_test` and an ObjectDB leak warning at exit.
- Startup checks left exactly one `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor PID established to it. The Codex MCP namespace still returned `Transport closed`, so direct namespace callability needs connector reload.
