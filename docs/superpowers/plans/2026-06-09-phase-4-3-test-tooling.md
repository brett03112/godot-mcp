# Phase 4.3 Test Tooling Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add modular GUT and gdUnit4 test tooling so Codex can discover, plan, run, and diagnose Godot test suites.

**Architecture:** Keep the existing monolithic GUT `create_test_suite` and `run_tests` tools intact. Add `src/tools/test-tooling.ts` for Phase 4.3 tools that scan project files, run Godot test CLIs through `ctx.getGodotPath()`, and return structured JSON plans/results.

**Tech Stack:** TypeScript MCP tools, Node `fs`/`path`/`child_process`, Godot 4 CLI, GUT CLI, optional gdUnit4 CLI.

---

## Scope

- Preserve existing GUT `create_test_suite` and `run_tests`.
- Add modular tools:
  - `gut_install_or_update`
  - `gut_discover_tests`
  - `gut_run_test_file`
  - `gut_run_changed_tests`
  - `gut_run_with_coverage`
  - `gdunit4_install_or_update`
  - `gdunit4_run_tests`
  - `gdunit4_discover_tests`
  - `gdunit4_generate_test`
  - `test_watch_plan`
  - `failure_to_patch_plan`
- Keep implementation TS-only unless real Godot proof reveals a need for GDScript operations.

## Evidence

- Context7 `/bitwes/gut`: GUT runs through `addons/gut/gut_cmdln.gd` with `-gdir`, `-gtest`, `-gexit`, and optional JUnit XML output.
- Context7 `/godot-gdunit-labs/gdunit4`: gdUnit4 has an addon under `addons/gdUnit4`, a command-line runner, and JUnit/HTML reporting support.
- Context7 did not show built-in GDScript code coverage for GUT, so `gut_run_with_coverage` should report coverage unavailable unless an external coverage artifact or tool is detected.

## Tasks

- [x] Write a focused RED test in `tests/test-tooling.test.mjs` that expects all Phase 4.3 tools to register and exercise the core planner/discovery behavior.
- [x] Add `src/tools/test-tooling.ts` with shared project-path validation, test discovery, GUT command construction, gdUnit4 command construction, and failure mapping helpers.
- [x] Register `registerTestToolingTools` from `src/index.ts`.
- [x] Extend `src/index.ts` parameter mappings for the new snake_case arguments.
- [x] Run focused tests, then `npm test`.
- [x] Run Godot editor smoke against `test_mcp_enhancements`.
- [x] Run a Phase 4.3 proof script against `test_mcp_enhancements` that lists the built tool catalog and dry-runs or safely exercises the new tools.
- [x] Update `Enhancements_TODO.md` checkboxes and add a dated verification note.
- [x] Run `git diff --check`.

## Verification Update, 2026-06-09

- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/test-tooling.js`.
- Focused Phase 4.3 tests passed 5/5.
- Full repo tests passed 107/107.
- Godot 4.6.3 headless editor smoke exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches.
- `test_mcp_enhancements/phase43_live_proof.mjs` listed 271 tools, found all 11 Phase 4.3 tools, detected GUT 9.5.0, discovered 8 GUT test files / 11 tests, executed `test/unit/test_example.gd` through real GUT with exit 0, dry-ran changed-test selection and gdUnit4 helpers, and mapped sample failure output back to `coin.gd`.
- Startup/live recheck left exactly one `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor established to it; callable `session_list` still returned `Transport closed`, so live state was proven through OS facts.
