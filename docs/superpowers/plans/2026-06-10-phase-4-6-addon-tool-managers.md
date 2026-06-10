# Phase 4.6 Addon And External Tool Managers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-safe addon lifecycle tools and optional external tool adapter reporting for Godot projects.

**Architecture:** Add a focused `src/tools/addon-tool-manager.ts` module for Asset Library details, addon install/update/remove, editor plugin enable/disable/list/health, and external tool adapter configuration. Keep file work project-local, expose deterministic dry-run/local-source paths for proof, and register the module from `src/index.ts`.

**Tech Stack:** TypeScript MCP tools, Node `fs`/`path`/`http`/`https` for deterministic project-local management, Godot `plugin.cfg` metadata, `project.godot` `[editor_plugins]` enable state, and Godot 4.6 editor plugin conventions.

---

## Scope

- Add tools:
  - `asset_library_get_details`
  - `asset_library_install_addon`
  - `asset_library_update_addon`
  - `asset_library_remove_addon`
  - `addon_enable`
  - `addon_disable`
  - `addon_list`
  - `addon_health_check`
  - `external_tool_status`
  - `external_tool_configure`
- Add adapter definitions for GUT, gdUnit4, Godot Jolt, Dialogic, LimboAI, Aseprite importers, Blender helpers, and LDtk/Tiled importers.
- Keep destructive actions bounded to verified paths under the target project's `addons/` directory.
- Support dry-run and local source directories so disposable-project verification does not depend on live Asset Library downloads.

## Evidence

- Context7 Godot 4.6 confirms editor plugins are installed under a project `addons` folder, expose `plugin.cfg`, and are enabled from the Project Settings plugin state.
- Existing Phase 4 modules use one focused TypeScript module, registration from `src/index.ts`, focused Node tests, a project-local proof script, README count updates, and a dated TODO verification note.

## Tasks

- [x] Write focused RED tests in `tests/addon-tool-manager.test.mjs` for tool registration, Asset Library details normalization, addon local install/update/remove, enable/disable/list/health, and external adapter configuration/status.
- [x] Add `src/tools/addon-tool-manager.ts` with project validation, plugin.cfg parsing, enabled plugin array editing, addon copying/removal, Asset Library detail fetching, adapter definitions, and external tool config storage under `.godot-mcp/external_tools.json`.
- [x] Register `registerAddonToolManagerTools` from `src/index.ts`.
- [x] Add snake_case parameter normalization inside the module so direct registry tests and MCP calls both work.
- [x] Add `test_mcp_enhancements/phase46_live_proof.mjs` to list the built catalog, call all ten tools against disposable project-local fixtures, validate install/enable/health/status flows, and clean temporary artifacts.
- [x] Update README tool counts and tool reference sections.
- [x] Run `npm run build && node --test tests/addon-tool-manager.test.mjs`.
- [x] Run `npm test`.
- [x] Run a Godot 4.6.3 headless editor smoke against `test_mcp_enhancements`.
- [ ] Recheck listener/socket state and live callability after connector/editor reload.
- [x] Update `Enhancements_TODO.md` checkboxes and add a dated verification note.
- [x] Run `git diff --check`.

## Verification Update, 2026-06-10

- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/addon-tool-manager.js`.
- Focused Phase 4.6 tests passed 5/5.
- Full repo tests passed 125/125.
- `test_mcp_enhancements/phase46_live_proof.mjs` listed 302 tools, found all 10 Phase 4.6 tools, fetched Asset Library details from a disposable local API fixture, installed/enabled/listed/health-checked/disabled/re-enabled/updated/removed a disposable project-local addon, reported all optional adapter definitions, configured a Blender adapter, verified its executable path, restored `project.godot` and `.godot-mcp/external_tools.json`, and cleaned temporary proof artifacts.
- Godot 4.6.3 headless editor smoke against `test_mcp_enhancements` exited 0, and the smoke log had 0 `SCRIPT ERROR`/`ERROR:` matches.
- The currently exposed Codex MCP namespace still returns `Transport closed` for `session_list`; reload the connector/editor before direct namespace callability can be tested.
