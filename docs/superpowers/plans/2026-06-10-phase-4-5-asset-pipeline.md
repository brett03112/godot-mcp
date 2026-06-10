# Phase 4.5 Asset Pipeline Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add asset import profile, import settings, batch reimport, usage, size budget, and license manifest tools for Godot projects.

**Architecture:** Add a focused `src/tools/asset-pipeline.ts` module for profile storage, `.import` metadata reads/writes, file scanning, dependency/usage reports, and size/license manifests. Register it from `src/index.ts`, and add a narrow `asset_batch_reimport` Godot operation that uses `EditorFileSystem.reimport_files()` when run inside an editor-capable Godot process.

**Tech Stack:** TypeScript MCP tools, Node `fs`/`path` for deterministic project-local file work, Godot `.import` ConfigFile-compatible metadata, existing `ctx.executeOperation`, and Godot 4.6 `EditorFileSystem.reimport_files()`.

---

## Scope

- Add tools:
  - `asset_import_profile_create`
  - `asset_import_profile_apply`
  - `texture_import_settings_get`
  - `texture_import_settings_set`
  - `audio_import_settings_get`
  - `audio_import_settings_set`
  - `model_import_settings_get`
  - `model_import_settings_set`
  - `asset_batch_reimport`
  - `asset_usage_report`
  - `asset_size_budget_report`
  - `asset_license_manifest`
- Store import profiles under `.godot-mcp/import_profiles/`.
- Treat `.import` files as ConfigFile-style sections and keys; preserve Godot-style values well enough for booleans, numbers, strings, arrays, and dictionaries used by import settings.
- Keep the first pass conservative: modify only the `[params]` section for import-setting setters and profile application.
- Support `dry_run` on mutation tools so callers can preview changes.
- Use `asset_batch_reimport` to call the Godot-side reimport operation for selected resource paths.

## Evidence

- Context7 Godot 4.6 confirms `EditorFileSystem.reimport_files(files: PackedStringArray)` reimports selected files and blocks until import is complete after direct `.import` edits.
- Context7 Godot 4.6 confirms `ConfigFile` supports `load`, `save`, `get_value`, `set_value`, `get_section_keys`, and `get_sections` for INI-like files.
- Existing Phase 4 modules use one focused TypeScript module, registration from `src/index.ts`, focused Node tests, a Godot operation for editor-backed behavior, and a project-local proof script.

## Tasks

- [x] Write focused RED tests in `tests/asset-pipeline.test.mjs` for registration, import setting get/set, profile create/apply, batch reimport delegation, usage reports, size budgets, license manifest generation, and dispatcher coverage.
- [x] Add `src/tools/asset-pipeline.ts` with project validation, safe project-relative path resolution, `.import` parsing/writing, profile JSON storage, asset scanning, usage detection, size budget checks, and license metadata collection.
- [x] Register `registerAssetPipelineTools` from `src/index.ts`.
- [x] Add any needed snake_case parameter normalization in the tool module so direct registry dispatch and MCP calls both work.
- [x] Add `asset_batch_reimport` handling in `src/scripts/godot_operations.gd`, using `EditorFileSystem.reimport_files()` where available and returning selected paths plus status.
- [x] Add `test_mcp_enhancements/phase45_live_proof.mjs` to list the built catalog, call all twelve tools against copied or temporary assets, run batch reimport, validate reports, and clean temporary artifacts.
- [x] Run `npm run build && node --test tests/asset-pipeline.test.mjs`.
- [x] Run `npm test`.
- [x] Run a Godot 4.6.3 editor/headless smoke against `test_mcp_enhancements`.
- [ ] Recheck listener/socket state and live callability after user reloads the connector/Godot editor.
- [x] Update `Enhancements_TODO.md` checkboxes and add a dated verification note.
- [x] Run `git diff --check`.

## Verification Update, 2026-06-10

- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/asset-pipeline.js`.
- Focused Phase 4.5 tests passed 6/6.
- Full repo tests passed 120/120.
- `test_mcp_enhancements/phase45_live_proof.mjs` listed 292 tools, found all 12 Phase 4.5 tools, created a project-local import profile, applied texture/audio/model settings to temporary assets, proved dry-run import setting behavior, generated usage/size/license reports, ran `asset_batch_reimport`, and cleaned temporary proof artifacts. The reimport operation ran in headless checked mode because the callable connector/editor live session needs reload before direct live proof.
- Godot 4.6.3 headless editor smoke against `test_mcp_enhancements` exited 0, and the smoke log had 0 `SCRIPT ERROR`/`ERROR:` matches.
