# Phase 4.4 Visual QA And Screenshot Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual QA tools for screenshot comparison, viewport capture aliases, visual baselines, UI overlap/contrast checks, sprite bounds checks, and camera framing checks.

**Architecture:** Add a focused `src/tools/visual-qa.ts` module that keeps image diff and project-local `.mcp_visual/` baseline logic in TypeScript, delegates offline scene inspections to existing Godot operations where useful, and wraps existing live/runtime capture tools instead of duplicating bridge behavior. Register the module from `src/index.ts` and keep live capture proof dependent on the existing live addon commands.

**Tech Stack:** TypeScript MCP tools, Node `fs`/`path`/`zlib` PNG parsing, existing `capture_viewport`, existing UI/camera Godot operations, existing live editor/runtime commands, Godot 4.6 viewport capture APIs.

---

## Scope

- Add tools:
  - `screenshot_compare`
  - `capture_editor_viewport`
  - `capture_runtime_viewport`
  - `visual_regression_baseline_create`
  - `visual_regression_check`
  - `ui_overlap_check`
  - `ui_contrast_check`
  - `sprite_bounds_check`
  - `camera_framing_check`
- Store baselines and check reports under project-local `.mcp_visual/`.
- Use the existing `capture_viewport` for file-backed runtime scene screenshots.
- Use the existing live `editor_screenshot` command for editor viewport capture.
- Keep the first pass deterministic: PNG RGBA/RGB decoding, bounding-box diff regions, ratio/threshold checks, and geometry-based UI/camera/sprite audits.

## Evidence

- Context7 Godot 4.6 confirms viewport capture should wait for `RenderingServer.frame_post_draw` before `get_viewport().get_texture().get_image()` and `Image.save_png()`.
- Existing repo code already has `capture_viewport`, `editor_screenshot`, `ui_inspect_layout`, `ui_validate_safe_area`, `camera_preview_bounds`, and `runtime_get_viewport_info`.
- Existing Phase 4 modules register one focused `src/tools/*.ts` file plus snake_case normalization from `src/index.ts`.

## Tasks

- [x] Write focused RED tests in `tests/visual-qa.test.mjs` for registration, PNG diff/baseline behavior, UI overlap/contrast detection, sprite bounds, camera framing, capture delegation, and dispatcher coverage.
- [x] Add `src/tools/visual-qa.ts` with shared project-path validation, safe project-relative path resolution, PNG decode/diff helpers, baseline paths, QA issue helpers, and capture delegation.
- [x] Register `registerVisualQaTools` from `src/index.ts`.
- [x] Add any needed snake_case parameter normalization in `src/index.ts`.
- [x] Add offline Godot operation handlers in `src/scripts/godot_operations.gd` for sprite bounds and camera framing if existing inspection output is not enough.
- [x] Add live runtime screenshot support in the addon only if `capture_runtime_viewport` cannot be implemented safely through existing non-live `capture_viewport`.
- [x] Add `test_mcp_enhancements/phase44_live_proof.mjs` to list the built catalog, call all nine tools, create/check a baseline, run geometry checks, and clean temporary artifacts.
- [x] Run focused tests, then `npm test`.
- [x] Run a Godot editor smoke against `test_mcp_enhancements`.
- [x] Recheck listener/socket state and live callability after reload.
- [x] Update `Enhancements_TODO.md` checkboxes and add a dated verification note.
- [x] Run `git diff --check`.

## Verification Update, 2026-06-09

- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/visual-qa.js`.
- Focused Phase 4.4 tests passed 7/7.
- Full repo tests passed 114/114.
- Godot 4.6.3 headless editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR` or `ERROR:` log matches.
- `test_mcp_enhancements/phase44_live_proof.mjs` listed 280 tools, found all 9 Phase 4.4 tools, compared screenshots, created and checked a baseline, ran UI overlap/contrast checks, ran sprite/camera geometry checks, captured runtime and editor viewports, saw 1 live editor session, and cleaned temporary artifacts.
- After connector reload, `mcp__godot_mcp.session_list` reported one connected `test_mcp_enhancements` editor session on `127.0.0.1:6010`; tool discovery exposed all 9 Phase 4.4 tools, and direct Codex MCP calls succeeded for screenshot comparison, baseline creation/checking, UI overlap/contrast, sprite bounds, camera framing, runtime capture, and editor capture.
