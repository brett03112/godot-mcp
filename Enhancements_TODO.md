# Godot MCP Live Enhancements TODO

This TODO converts the `godot-mcp-enhanced.md` discussion into a phased project plan for adding a live editor and runtime control layer to this MCP server.

The current MCP is already broad for file-backed Godot automation: project launch/run/debug, scene manipulation, script intelligence, validation, export/build, tests, playtesting, profiling, asset generation, networking, physics, navigation, and MCP tool metadata. The missing strategic capability is a persistent "Live" bridge into the active Godot editor and running game so Codex can reason about what is open, selected, playing, visible, logged, and editable right now.

## Research Notes

Research sources used while shaping this TODO:

- Existing repo docs and source: `README.md`, `src/index.ts`, `src/registry.ts`, `src/tools/*`, `src/scripts/godot_operations.gd`, and `godot-mcp-enhanced.md`.
- Godot 4.6 editor plugin docs: `EditorPlugin` provides the base addon hook, and `EditorPlugin.add_debugger_plugin()` can register an `EditorDebuggerPlugin`.
- Godot 4.6 editor APIs: `EditorInterface`, `EditorSelection`, and `EditorFileSystem` are the right surfaces for active scene state, selected nodes, save/open operations, filesystem scan, and reimport.
- Godot debugger APIs: `EditorDebuggerPlugin` and `EngineDebugger` support plugin-owned debugger messages between the editor and the running game, which is useful for runtime tree inspection and input/state probes.
- Godot network APIs: `WebSocketPeer`, `WebSocketMultiplayerPeer`, and local TCP/HTTP options are viable for editor-to-MCP transport.
- Godot command line and testing ecosystem: GUT command-line test execution is already partially supported here; gdUnit4 is another candidate for richer test automation.
- Existing Godot tool patterns worth studying: Godot AI live editor bridge, Godot Director editor backend, the Godot Asset Library API, Godot LSP/DAP integration, and editor automation patterns from Godot's official plugin system.

Reference links:

- https://docs.godotengine.org/en/4.6/tutorials/plugins/editor/making_plugins.html
- https://docs.godotengine.org/en/4.6/classes/class_editorplugin.html
- https://docs.godotengine.org/en/4.6/classes/class_editorinterface.html
- https://docs.godotengine.org/en/4.6/classes/class_editorselection.html
- https://docs.godotengine.org/en/4.6/classes/class_editorfilesystem.html
- https://docs.godotengine.org/en/4.6/classes/class_editordebuggerplugin.html
- https://docs.godotengine.org/en/4.6/classes/class_enginedebugger.html
- https://docs.godotengine.org/en/4.6/classes/class_websocketpeer.html
- https://gut.readthedocs.io/
- https://github.com/godot-gdunit-labs/gdUnit4
- https://godotengine.org/asset-library/api

## Guiding Principles

- Prefer explicit, narrowly scoped tools over one unsafe "execute arbitrary code" primitive.
- Make live-editor operations session-aware and project-path-aware so commands cannot accidentally target the wrong open editor.
- Keep non-live tools useful independently; the MCP should still work well in headless/file-backed workflows.
- Add rollback and dry-run paths for destructive or multi-step mutations.
- Every phase should have a real verification path against `test_mcp_enhancements`.
- Treat `game_eval` and editor/runtime code execution as gated, opt-in capabilities.
- Preserve existing `ToolRegistry` patterns and modular `src/tools/*` registration.
- Keep MCP resources read-only; use tools for mutations.

## Phase 1 - Existing MCP Upgrades Without A Live Editor Plugin

Goal: Improve autonomous command and control immediately using the current TypeScript plus `godot_operations.gd` architecture.

### 1.1 Add `batch_execute`

- [ ] Create a new modular tool file, likely `src/tools/batch.ts`.
- [ ] Register it from `src/index.ts` through the existing `ToolRegistry`.
- [ ] Add tool schema:
  - `project_path`
  - `commands[]`
  - `rollback_on_error`
  - `dry_run`
  - `continue_on_error`
  - `max_commands`
  - `timeout_ms`
- [ ] Dispatch each command through `ToolRegistry.dispatch()`.
- [ ] Prevent recursive `batch_execute` calls unless explicitly allowed.
- [ ] Snapshot touched files before mutation:
  - `.tscn`
  - `.gd`
  - `.tres`
  - `.res`
  - `.import`
  - `project.godot`
  - `export_presets.cfg`
- [ ] Add conservative touched-file detection:
  - Start with command argument path fields.
  - Add optional `declared_touched_paths` to batch commands.
  - Later add per-tool metadata for touched file prediction.
- [ ] Restore snapshots when a command fails and `rollback_on_error` is true.
- [ ] Return structured results:
  - `status`
  - `executed_count`
  - `failed_command_index`
  - `rollback_status`
  - `commands[]`
  - `snapshots[]`
  - `warnings[]`
- [ ] Add tests for:
  - successful batch
  - failing batch with rollback
  - failing batch without rollback
  - unknown tool name
  - recursive batch rejection

Acceptance:

- [ ] A batch can create or modify a test scene in `test_mcp_enhancements`.
- [ ] A forced failure restores the original scene file byte-for-byte or with documented Godot formatting differences.
- [ ] The response identifies exactly which command failed.

### 1.2 Add `script_patch`

- [ ] Add an anchor-based GDScript patch tool.
- [ ] Support modes:
  - `insert_before`
  - `insert_after`
  - `replace_block`
  - `replace_range`
  - `append_to_file`
- [ ] Support anchors by:
  - exact text
  - function name
  - class member/property name
  - regex, opt-in only
- [ ] Add `validate_after` to run existing script validation.
- [ ] Add `dry_run` to return a unified diff without writing.
- [ ] Add guardrails:
  - reject missing anchor unless `allow_append_fallback` is true
  - reject ambiguous anchors unless caller provides `occurrence`
  - preserve line endings
- [ ] Add tests for exact anchor insert, function block replace, ambiguous anchor rejection, and dry-run diff.

Acceptance:

- [ ] Codex can apply a small script edit without regenerating the whole file.
- [ ] A bad patch returns a precise failure reason and does not write partial content.

### 1.3 Add Project And Filesystem Helpers

- [ ] Add `project_settings_get`.
- [ ] Add `project_settings_set` with dry-run and allowlist support.
- [ ] Add `autoload_list`.
- [ ] Add `autoload_add`.
- [ ] Add `autoload_remove`.
- [ ] Add `filesystem_search`.
- [ ] Add `filesystem_reimport`.
- [ ] Add `filesystem_scan`.
- [ ] Add `uid_resolve`.
- [ ] Add `dependency_graph`.
- [ ] Add `find_orphaned_assets`.
- [ ] Add `find_missing_uid_files`.

Research basis:

- `EditorFileSystem` can scan and reimport from inside the editor.
- Existing MCP already has project structure and import/install logic, so these fit the current architecture.

Acceptance:

- [ ] MCP can find assets/scripts/scenes by glob, class name, resource type, and text.
- [ ] MCP can ask Godot to reimport selected assets.
- [ ] MCP can list autoloads and project settings without hand-parsing fragile file sections where Godot can provide a safer path.

### 1.4 Add Resource Workflow Tools

- [ ] Add `resource_search`.
- [ ] Add `resource_get_info`.
- [ ] Add `resource_assign`.
- [ ] Add `resource_preview_metadata`.
- [ ] Add `create_gradient_texture`.
- [ ] Add `create_noise_texture`.
- [ ] Add `create_curve_resource`.
- [ ] Add `set_curve_points`.
- [ ] Add `create_environment_resource`.
- [ ] Add `create_physics_material`.
- [ ] Add `autofit_physics_shape`.
- [ ] Add `resource_convert_format` for safe `.tres`/`.res` conversion where Godot supports it.

Acceptance:

- [ ] Codex can create common `.tres` resources without manually authoring resource text.
- [ ] Codex can assign a created resource to a node property and validate the scene afterward.

### 1.5 Add UI And Theme Workflow Tools

- [ ] Add `create_ui_layout`.
- [ ] Add `draw_ui_recipe`.
- [ ] Add `set_control_anchor_preset`.
- [ ] Add `set_control_offsets`.
- [ ] Add `set_control_text`.
- [ ] Add `set_control_theme_override`.
- [ ] Add `create_theme`.
- [ ] Add `theme_set_color`.
- [ ] Add `theme_set_constant`.
- [ ] Add `theme_set_font_size`.
- [ ] Add `theme_set_stylebox_flat`.
- [ ] Add `apply_theme`.
- [ ] Add `inspect_ui_layout`.
- [ ] Add `validate_ui_safe_area`.

Tooling idea:

- `draw_ui_recipe` should accept a declarative layout recipe for common screens: main menu, pause menu, settings screen, HUD, dialogue box, inventory grid, virtual joystick, and mobile action buttons.

Acceptance:

- [ ] Codex can create a usable menu scene from one recipe.
- [ ] The resulting UI validates for empty containers, missing text, offscreen controls, and obvious anchor mistakes.

### 1.6 Add Camera Workflow Tools

- [ ] Add `create_camera`.
- [ ] Add `configure_camera`.
- [ ] Add `setup_camera_follow_2d`.
- [ ] Add `set_camera_limits_2d`.
- [ ] Add `set_camera_smoothing_2d`.
- [ ] Add `apply_camera_preset`.
- [ ] Add `list_cameras`.
- [ ] Add `preview_camera_bounds`.

Acceptance:

- [ ] Codex can add a Camera2D to a test scene, configure follow behavior, set limits, and validate the result.

### 1.7 Add Audio Player Workflow Tools

- [ ] Add `create_audio_player`.
- [ ] Add `set_audio_stream`.
- [ ] Add `configure_audio_playback`.
- [ ] Add `play_audio_node`.
- [ ] Add `stop_audio_node`.
- [ ] Add `list_audio_players`.
- [ ] Add `validate_audio_routes`.

Acceptance:

- [ ] Codex can generate or import an audio asset, create an AudioStreamPlayer node, route it to a bus, and verify it is present in the scene.

### 1.8 Add Scene Search And Node Refactor Helpers

- [ ] Add `node_find`.
- [ ] Add `node_rename`.
- [ ] Add `node_move`.
- [ ] Add `node_add_to_group`.
- [ ] Add `node_remove_from_group`.
- [ ] Add `node_replace_type`.
- [ ] Add `node_bulk_property_set`.
- [ ] Add `scene_find_references`.
- [ ] Add `scene_dependency_report`.

Acceptance:

- [ ] Codex can find nodes across scenes by name, type, group, script, or property.
- [ ] Codex can safely rename or move a node and keep signal paths valid where possible.

## Phase 2 - Add The Live Editor Plugin Bridge

Goal: Give Codex awareness of the Godot editor the user already has open.

### 2.1 Create The Addon Skeleton

- [ ] Add `addons/godot_mcp_live/plugin.cfg`.
- [ ] Add `addons/godot_mcp_live/godot_mcp_live.gd`.
- [ ] Add `addons/godot_mcp_live/session_state.gd`.
- [ ] Add `addons/godot_mcp_live/command_dispatcher.gd`.
- [ ] Add `addons/godot_mcp_live/transport_websocket.gd`.
- [ ] Add `addons/godot_mcp_live/transport_http.gd` only if WebSocket proves awkward.
- [ ] Mark editor scripts with `@tool`.
- [ ] Use `EditorPlugin._enter_tree()` to start the bridge.
- [ ] Use `EditorPlugin._exit_tree()` to disconnect and clean up.
- [ ] Add a minimal dock panel showing connection state, active session ID, server URL, and last error.

Acceptance:

- [ ] The addon appears in Godot's Project Settings > Plugins.
- [ ] Enabling the plugin connects to the MCP server.
- [ ] Disabling the plugin disconnects cleanly.

### 2.2 Add MCP-Side Live Session Manager

- [ ] Add `src/live/session-manager.ts`.
- [ ] Add `src/live/protocol.ts`.
- [ ] Add `src/live/transport.ts`.
- [ ] Add `src/tools/live-editor.ts`.
- [ ] Track connected editor sessions:
  - session ID
  - project path
  - Godot version
  - editor PID if available
  - active scene
  - play state
  - writable state
  - last heartbeat
- [ ] Add heartbeat and stale-session cleanup.
- [ ] Add project-path matching before allowing mutations.
- [ ] Add a session activation model:
  - active session
  - explicit session target
  - error if multiple sessions exist and no active session is selected
- [ ] Add optional shared secret or loopback-only connection guard.

Acceptance:

- [ ] `session_list` shows the open `test_mcp_enhancements` editor.
- [ ] `session_activate` selects that editor.
- [ ] Commands reject stale or mismatched sessions.

### 2.3 Add Live Editor State Tools And Resources

- [ ] Add `editor_state`.
- [ ] Add `session_list`.
- [ ] Add `session_activate`.
- [ ] Add `session_disconnect`.
- [ ] Add `scene_current`.
- [ ] Add `scene_open`.
- [ ] Add `scene_save_active`.
- [ ] Add `scene_reload_active`.
- [ ] Add `selection_get`.
- [ ] Add `selection_set`.
- [ ] Add `editor_screenshot`.
- [ ] Add `logs_read_editor`.
- [ ] Add `logs_clear`.
- [ ] Add `editor_monitors_get`.
- [ ] Add `editor_quit`.

Resources:

- [ ] Add `godot-mcp://live/sessions`.
- [ ] Add `godot-mcp://live/editor/state`.
- [ ] Add `godot-mcp://live/scene/current`.
- [ ] Add `godot-mcp://live/scene/hierarchy`.
- [ ] Add `godot-mcp://live/selection/current`.
- [ ] Add `godot-mcp://live/logs/recent`.

Acceptance:

- [ ] Codex can read the active scene path from the live editor.
- [ ] Codex can read the selected node path.
- [ ] Codex can set the editor selection to a known node.
- [ ] Codex can save the active scene through the editor.
- [ ] Codex can capture a screenshot of the editor viewport or active game viewport.

### 2.4 Add Live Scene Mutation Tools

- [ ] Add `live_scene_get_hierarchy`.
- [ ] Add `live_node_get_properties`.
- [ ] Add `live_node_set_property`.
- [ ] Add `live_node_create`.
- [ ] Add `live_node_delete`.
- [ ] Add `live_node_duplicate`.
- [ ] Add `live_node_reparent`.
- [ ] Add `live_node_rename`.
- [ ] Add `live_node_connect_signal`.
- [ ] Add `live_node_disconnect_signal`.
- [ ] Add `live_scene_mark_dirty`.
- [ ] Add `live_scene_save`.

Acceptance:

- [ ] Codex can add a node to the currently open scene without the user providing a `.tscn` path.
- [ ] Codex can change a selected node property and save the active scene.
- [ ] File-backed validators see the saved change afterward.

### 2.5 Add Editor Filesystem And Import Operations

- [ ] Add `editor_filesystem_scan`.
- [ ] Add `editor_filesystem_reimport`.
- [ ] Add `editor_resource_reload`.
- [ ] Add `editor_resource_uid_update`.
- [ ] Add `editor_open_resource`.
- [ ] Add `editor_focus_file`.

Research basis:

- These should use `EditorFileSystem` from inside the editor where possible.

Acceptance:

- [ ] Codex can create a file externally, ask the live editor to scan/reimport, and then see the resource in the editor filesystem.

## Phase 3 - Runtime Control, Debugger Bridge, And Play Mode Awareness

Goal: Let Codex inspect and control the currently running game, not only offline scenes.

### 3.1 Add Editor Debugger Plugin Bridge

- [ ] Add an `EditorDebuggerPlugin` inside the live addon.
- [ ] Register it from the editor plugin with `add_debugger_plugin()`.
- [ ] Define message namespace, for example `godot_mcp:*`.
- [ ] Add runtime-side helper/autoload for messages from the running game using `EngineDebugger`.
- [ ] Track debugger session IDs.
- [ ] Track play start/stop events.
- [ ] Surface runtime connection status in `editor_state`.

Acceptance:

- [ ] Starting the game from the editor creates a runtime debugger session visible to the MCP.
- [ ] MCP can send a ping to the running game and receive a response.

### 3.2 Add Runtime Inspection Tools

- [ ] Add `runtime_get_scene_tree`.
- [ ] Add `runtime_get_node_info`.
- [ ] Add `runtime_get_node_property`.
- [ ] Add `runtime_watch_node`.
- [ ] Add `runtime_get_ui_elements`.
- [ ] Add `runtime_get_focus_owner`.
- [ ] Add `runtime_get_viewport_info`.
- [ ] Add `runtime_get_performance_metrics`.
- [ ] Add `runtime_get_input_map`.
- [ ] Add `runtime_get_groups`.

Acceptance:

- [ ] Codex can inspect the live running scene tree while the project is playing.
- [ ] Codex can list visible UI controls with text, bounds, disabled/visible state, and focus information.

### 3.3 Add Runtime Input Tools

- [ ] Add `runtime_input_key`.
- [ ] Add `runtime_input_mouse`.
- [ ] Add `runtime_input_gamepad`.
- [ ] Add `runtime_input_action`.
- [ ] Add `runtime_input_text`.
- [ ] Add `runtime_input_state`.
- [ ] Add `runtime_wait_for_condition`.
- [ ] Add `runtime_click_ui_text`.
- [ ] Add `runtime_click_ui_path`.

Acceptance:

- [ ] Codex can press a project input action.
- [ ] Codex can click a visible UI button by text or node path.
- [ ] Codex can wait for a UI/state condition and report timeout vs success.

### 3.4 Add Lightweight Runtime Assertions

- [ ] Add `runtime_assert_node_exists`.
- [ ] Add `runtime_assert_property_equals`.
- [ ] Add `runtime_assert_signal_emitted`.
- [ ] Add `runtime_assert_ui_text_visible`.
- [ ] Add `runtime_assert_no_errors`.
- [ ] Add `runtime_snapshot_assertion_report`.

Acceptance:

- [ ] Codex can perform a short live smoke test without writing a full GUT test.
- [ ] Failures include the observed value and suggested next probe.

### 3.5 Add Safe Eval, Gated And Disabled By Default

- [ ] Add `live_eval_status`.
- [ ] Add `game_eval` only if explicitly enabled in MCP config.
- [ ] Add `editor_eval` only if explicitly enabled in MCP config.
- [ ] Require:
  - local loopback connection
  - matching project path
  - explicit config flag
  - optional per-session approval token
- [ ] Return clear refusal when eval is disabled.
- [ ] Log all eval calls with timestamp, session, code hash, and caller-visible reason.

Acceptance:

- [ ] Eval is disabled by default.
- [ ] Disabled eval returns a safe error.
- [ ] Enabled eval can run a harmless expression in a disposable test project.

## Phase 4 - Autonomous Development Tooling Beyond The Live Bridge

Goal: Add higher-level tools that make Codex a better game-development operator, designer, tester, and maintainer.

### 4.1 Add Design-To-Scene Generators

- [ ] Add `generate_scene_from_brief`.
- [ ] Add `generate_level_blockout`.
- [ ] Add `generate_menu_flow`.
- [ ] Add `generate_hud`.
- [ ] Add `generate_dialogue_scene`.
- [ ] Add `generate_settings_screen`.
- [ ] Add `generate_mobile_controls`.
- [ ] Add `generate_gameplay_prefab`.
- [ ] Add `generate_enemy_archetype`.
- [ ] Add `generate_pickup_archetype`.

Implementation notes:

- These should produce normal scene/script/resource files through existing lower-level tools.
- They should return a manifest of created files and follow-up validation commands.
- They should support `dry_run` and `recipe_only`.

Acceptance:

- [ ] Codex can create a playable mini-feature from a short brief and then validate the created files.

### 4.2 Add Gameplay Loop And State-Machine Helpers

- [ ] Add `create_state_machine`.
- [ ] Add `add_state`.
- [ ] Add `connect_state_transition`.
- [ ] Add `generate_character_controller`.
- [ ] Add `generate_interaction_system`.
- [ ] Add `generate_inventory_system`.
- [ ] Add `generate_dialogue_controller`.
- [ ] Add `generate_save_load_system`.
- [ ] Add `generate_settings_persistence`.

Acceptance:

- [ ] Codex can scaffold a small gameplay system with scripts, scene nodes, and tests.

### 4.3 Add Test Tooling Expansion

- [ ] Keep existing GUT support.
- [ ] Add `gut_install_or_update`.
- [ ] Add `gut_discover_tests`.
- [ ] Add `gut_run_test_file`.
- [ ] Add `gut_run_changed_tests`.
- [ ] Add `gut_run_with_coverage` if coverage tooling is available.
- [ ] Research and optionally add gdUnit4 support:
  - `gdunit4_install_or_update`
  - `gdunit4_run_tests`
  - `gdunit4_discover_tests`
  - `gdunit4_generate_test`
- [ ] Add `test_watch_plan` to recommend which tests to run after changed files.
- [ ] Add `failure_to_patch_plan` to map failing tests to likely files/nodes.

Research basis:

- GUT command-line testing is already supported in this repo.
- gdUnit4 is a mature alternative with modern Godot 4 support and could be useful for users who prefer that ecosystem.

Acceptance:

- [ ] Codex can install or verify a test framework, generate a test, run it headlessly, and parse results.

### 4.4 Add Visual QA And Screenshot Diff Tools

- [ ] Add `screenshot_compare`.
- [ ] Add `capture_editor_viewport`.
- [ ] Add `capture_runtime_viewport`.
- [ ] Add `visual_regression_baseline_create`.
- [ ] Add `visual_regression_check`.
- [ ] Add `ui_overlap_check`.
- [ ] Add `ui_contrast_check`.
- [ ] Add `sprite_bounds_check`.
- [ ] Add `camera_framing_check`.

Implementation notes:

- Use existing `capture_viewport` where possible.
- Add live editor capture after Phase 2.
- Store baselines under a project-local `.mcp_visual/` directory.

Acceptance:

- [ ] Codex can compare a before/after screenshot and report changed regions.
- [ ] Codex can detect obvious UI overlap or offscreen controls.

### 4.5 Add Asset Pipeline Control Tools

- [ ] Add `asset_import_profile_create`.
- [ ] Add `asset_import_profile_apply`.
- [ ] Add `texture_import_settings_get`.
- [ ] Add `texture_import_settings_set`.
- [ ] Add `audio_import_settings_get`.
- [ ] Add `audio_import_settings_set`.
- [ ] Add `model_import_settings_get`.
- [ ] Add `model_import_settings_set`.
- [ ] Add `asset_batch_reimport`.
- [ ] Add `asset_usage_report`.
- [ ] Add `asset_size_budget_report`.
- [ ] Add `asset_license_manifest`.

Acceptance:

- [ ] Codex can import a batch of assets, set import flags, reimport them, and report size/license/usage metadata.

### 4.6 Add Addon And External Tool Managers

- [ ] Expand existing Asset Library support with `asset_library_get_details`.
- [ ] Add `asset_library_install_addon`.
- [ ] Add `asset_library_update_addon`.
- [ ] Add `asset_library_remove_addon`.
- [ ] Add `addon_enable`.
- [ ] Add `addon_disable`.
- [ ] Add `addon_list`.
- [ ] Add `addon_health_check`.
- [ ] Add `external_tool_status`.
- [ ] Add `external_tool_configure`.
- [ ] Add adapter definitions for optional tools:
  - GUT
  - gdUnit4
  - Godot Jolt
  - Dialogic
  - LimboAI or other behavior tree/state machine addons
  - Aseprite importers
  - Blender import/export workflow helpers
  - LDtk/Tiled importers

Acceptance:

- [ ] Codex can search, install, enable, and verify a plugin in a disposable project.
- [ ] Codex can explain which optional tools are installed and what MCP tools can use them.

### 4.7 Add LSP/DAP Integration Tools

- [ ] Research Godot LSP and DAP ports and lifecycle in Godot 4.6.
- [ ] Add `lsp_status`.
- [ ] Add `lsp_symbols`.
- [ ] Add `lsp_definition`.
- [ ] Add `lsp_references`.
- [ ] Add `lsp_diagnostics`.
- [ ] Add `lsp_rename_preview`.
- [ ] Add `dap_status`.
- [ ] Add `dap_set_breakpoint`.
- [ ] Add `dap_clear_breakpoint`.
- [ ] Add `dap_stack_trace`.
- [ ] Add `dap_variables`.
- [ ] Add `dap_continue`.
- [ ] Add `dap_step`.

Why this matters:

- Codex already reads files, but LSP/DAP can provide editor-grade semantic information and live debugging state.

Acceptance:

- [ ] Codex can retrieve diagnostics and symbols from the Godot language server.
- [ ] Codex can attach to a debug session or report why it cannot.

### 4.8 Add Performance, Memory, And Quality Gates

- [ ] Add `performance_budget_create`.
- [ ] Add `performance_budget_check`.
- [ ] Add `runtime_profile_capture`.
- [ ] Add `runtime_profile_compare`.
- [ ] Add `memory_snapshot`.
- [ ] Add `node_count_budget_check`.
- [ ] Add `draw_call_budget_check`.
- [ ] Add `texture_memory_budget_check`.
- [ ] Add `export_size_budget_check`.
- [ ] Add `quality_gate_run`.

Acceptance:

- [ ] Codex can run a named quality gate before export and produce pass/fail results with recommendations.

### 4.9 Add Issue Tracker And Task Ledger Tools

- [ ] Add `mcp_task_create`.
- [ ] Add `mcp_task_update`.
- [ ] Add `mcp_task_list`.
- [ ] Add `mcp_task_close`.
- [ ] Add `mcp_evidence_attach`.
- [ ] Add `mcp_session_report`.
- [ ] Add `mcp_changelog_draft`.

Implementation notes:

- Store project-local state in `.godot-mcp/`.
- Keep this optional and transparent.

Acceptance:

- [ ] Codex can leave a structured evidence trail of what it changed, tested, and still recommends.

### 4.10 Add Safer Autonomous Planning Tools

- [ ] Add `capability_matrix`.
- [ ] Add `recommend_next_tool`.
- [ ] Add `plan_feature_implementation`.
- [ ] Add `plan_test_strategy`.
- [ ] Add `risk_scan`.
- [ ] Add `preflight_project_health`.
- [ ] Add `postchange_verification_plan`.

Why this matters:

- Codex can use these to select the right MCP operation instead of guessing from a flat list of 100+ tools.

Acceptance:

- [ ] Given a goal like "add a pause menu", MCP can recommend the tool sequence and validation path.

## Phase 5 - Packaging, Configuration, Documentation, And Distribution

Goal: Make the live-enhanced MCP easy to install, trust, verify, and maintain.

### 5.1 Add Configuration

- [ ] Add MCP config for:
  - live bridge enabled/disabled
  - host
  - port
  - shared secret
  - allowed project paths
  - eval enabled/disabled
  - log retention
  - screenshot output directory
  - stale session timeout
- [ ] Add per-project `.godot-mcp/config.json`.
- [ ] Add config validation.
- [ ] Add `live_config_status`.

Acceptance:

- [ ] Bad config fails with clear remediation.
- [ ] Default config is local-only and eval-disabled.

### 5.2 Add Addon Installer And Updater

- [ ] Add `live_addon_install`.
- [ ] Add `live_addon_update`.
- [ ] Add `live_addon_remove`.
- [ ] Add `live_addon_status`.
- [ ] Add `live_addon_enable`.
- [ ] Add `live_addon_disable`.
- [ ] Add compatibility check for Godot 4.6.

Acceptance:

- [ ] Codex can install the live addon into `test_mcp_enhancements`.
- [ ] The user can enable it in the editor and MCP sees the session.

### 5.3 Add Documentation

- [ ] Update `README.md` with:
  - Live bridge overview
  - Install steps
  - Security model
  - Tool list
  - Resource list
  - Common workflows
  - Troubleshooting
- [ ] Add `docs/live-bridge-protocol.md`.
- [ ] Add `docs/live-bridge-security.md`.
- [ ] Add `docs/autonomous-workflows.md`.
- [ ] Add `docs/tooling-adapters.md`.
- [ ] Update MCP resource catalog generation if counts are documented manually.
- [ ] Update `package.json` repository metadata from `Coding-Solo/godot-mcp` to the correct repo.

Acceptance:

- [ ] A fresh user can install the MCP, install the addon, enable it, and run `editor_state`.

### 5.4 Add Verification Harness

- [ ] Add disposable fixture project or use `test_mcp_enhancements`.
- [ ] Add an automated smoke script for non-live tools.
- [ ] Add a semi-live smoke checklist for the open editor.
- [ ] Add tests for session manager behavior.
- [ ] Add tests for protocol encoding/decoding.
- [ ] Add tests for stale session cleanup.
- [ ] Add tests for project-path mismatch rejection.
- [ ] Add tests for disabled eval refusal.
- [ ] Add manual verification notes template.

Acceptance:

- [ ] `npm run build` passes.
- [ ] Existing tests pass.
- [ ] Non-live smoke passes headlessly.
- [ ] Live smoke proves an actual editor session is connected.

### 5.5 Add Release And Compatibility Policy

- [ ] Define supported Godot versions.
- [ ] Define live addon protocol versioning.
- [ ] Add compatibility negotiation between addon and MCP server.
- [ ] Add migration notes for protocol changes.
- [ ] Add changelog entries for new tools.

Acceptance:

- [ ] A version mismatch returns a clear message instead of failing mysteriously.

## Cross-Phase Tooling Ideas To Keep In View

These are not all first-pass requirements, but they are strong candidates for making Codex more autonomous in Godot:

- `editor_command_palette`: trigger safe named editor actions.
- `editor_open_docs`: open or return relevant Godot docs for a selected class/property.
- `classdb_search`: search Godot classes and methods from the MCP.
- `project_graph`: graph scenes, scripts, resources, autoloads, and dependencies.
- `scene_blueprint_export`: summarize a scene as compact JSON for agent planning.
- `scene_blueprint_apply`: apply a validated scene JSON patch.
- `prefab_catalog`: maintain reusable scene recipes.
- `input_map_editor`: create and validate project input actions.
- `signal_graph`: inspect signal connections across scenes.
- `animation_preview`: preview animation player/tree states.
- `tween_builder`: create common tween animations.
- `navmesh_preview`: generate and verify navigation regions.
- `physics_debug_snapshot`: inspect collision layers, masks, shapes, and overlaps.
- `accessibility_audit`: check font sizes, contrast, input remapping, and UI focus paths.
- `localization_audit`: find hardcoded visible strings.
- `save_data_inspector`: inspect project save files in a controlled schema-aware way.
- `export_matrix_run`: run multiple export presets and compare outputs.
- `build_artifact_report`: report executable/package size, included files, templates, and warnings.
- `crash_log_collector`: collect Godot/editor/game crash logs and map them to recent MCP actions.
- `agent_action_replay`: replay a sequence of MCP operations for reproducible debugging.

## First Practical Milestone

The first milestone should be intentionally small:

- [ ] Add `batch_execute`.
- [ ] Add a minimal live addon.
- [ ] Add MCP session manager.
- [ ] Add `session_list`.
- [ ] Add `session_activate`.
- [ ] Add `editor_state`.
- [ ] Add `selection_get`.
- [ ] Add `scene_current`.
- [ ] Add `live_scene_get_hierarchy`.
- [ ] Verify against the currently open `test_mcp_enhancements` Godot 4.6 project.

Done means:

- [ ] Codex can see the open Godot editor.
- [ ] Codex can identify the active project and active scene.
- [ ] Codex can identify the selected node.
- [ ] Codex can read the live scene hierarchy.
- [ ] Codex can run a small batch file-backed edit with rollback.

