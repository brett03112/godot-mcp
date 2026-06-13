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

- [x] Create a new modular tool file, likely `src/tools/batch.ts`.
- [x] Register it from `src/index.ts` through the existing `ToolRegistry`.
- [x] Add tool schema:
  - `project_path`
  - `commands[]`
  - `rollback_on_error`
  - `dry_run`
  - `continue_on_error`
  - `max_commands`
  - `timeout_ms`
- [x] Dispatch each command through `ToolRegistry.dispatch()`.
- [x] Prevent recursive `batch_execute` calls unless explicitly allowed.
- [x] Snapshot touched files before mutation:
  - `.tscn`
  - `.gd`
  - `.tres`
  - `.res`
  - `.import`
  - `project.godot`
  - `export_presets.cfg`
- [x] Add conservative touched-file detection:
  - Start with command argument path fields.
  - Add optional `declared_touched_paths` to batch commands.
  - Later add per-tool metadata for touched file prediction.
- [x] Restore snapshots when a command fails and `rollback_on_error` is true.
- [x] Return structured results:
  - `status`
  - `executed_count`
  - `failed_command_index`
  - `rollback_status`
  - `commands[]`
  - `snapshots[]`
  - `warnings[]`
- [x] Add tests for:
  - successful batch
  - failing batch with rollback
  - failing batch without rollback
  - unknown tool name
  - recursive batch rejection

Acceptance:

- [x] A batch can create or modify a test scene in `test_mcp_enhancements`.
- [x] A forced failure restores the original scene file byte-for-byte or with documented Godot formatting differences.
- [x] The response identifies exactly which command failed.

Verification note, 2026-06-03: `npm test` passed 7/7 batch tests. A compiled MCP stdio proof with `GODOT_PATH=C:\Users\brett\Desktop\Godot\Godot.exe` listed `batch_execute`, changed `test_mcp_enhancements/tier1_test_scene.tscn` via `modify_node_property`, forced an unknown-tool failure at command index 1, restored the scene with `rollback_status: restored`, and confirmed the before/after SHA-256 hash stayed `546d030416a8c15bf0d4e077caff0afdbf0277e8744c40cca0becfecd4b9b930`.

### 1.2 Add `script_patch`

- [x] Add an anchor-based GDScript patch tool.
- [x] Support modes:
  - `insert_before`
  - `insert_after`
  - `replace_block`
  - `replace_range`
  - `append_to_file`
- [x] Support anchors by:
  - exact text
  - function name
  - class member/property name
  - regex, opt-in only
- [x] Add `validate_after` to run existing script validation.
- [x] Add `dry_run` to return a unified diff without writing.
- [x] Add guardrails:
  - reject missing anchor unless `allow_append_fallback` is true
  - reject ambiguous anchors unless caller provides `occurrence`
  - preserve line endings
- [x] Add tests for exact anchor insert, function block replace, ambiguous anchor rejection, and dry-run diff.

Acceptance:

- [x] Codex can apply a small script edit without regenerating the whole file.
- [x] A bad patch returns a precise failure reason and does not write partial content.

Verification note, 2026-06-03: focused `script_patch` TDD added 10 Node tests covering registration, exact anchor insert with CRLF preservation, function block replacement, ambiguous exact anchor rejection, dry-run unified diff, one-based `replace_range`, class member replacement, regex opt-in, append fallback, and `validate_after` content validation. `npm run build; node --test tests/script-patch.test.mjs` passed 10/10 focused tests after implementation. Final `npm test` passed 22/22 tests, and a compiled MCP stdio smoke with `GODOT_PATH=C:\Users\brett\Desktop\Godot\Godot.exe` listed `script_patch` and successfully patched a temporary `test_mcp_enhancements/mcp_script_patch_smoke.gd` file with `validate_after: true` before deleting the temporary file.

### 1.3 Add Project And Filesystem Helpers

- [x] Add `project_settings_get`.
- [x] Add `project_settings_set` with dry-run and allowlist support.
- [x] Add `autoload_list`.
- [x] Add `autoload_add`.
- [x] Add `autoload_remove`.
- [x] Add `filesystem_search`.
- [x] Add `filesystem_reimport`.
- [x] Add `filesystem_scan`.
- [x] Add `uid_resolve`.
- [x] Add `dependency_graph`.
- [x] Add `find_orphaned_assets`.
- [x] Add `find_missing_uid_files`.

Research basis:

- `EditorFileSystem` can scan and reimport from inside the editor.
- Existing MCP already has project structure and import/install logic, so these fit the current architecture.

Acceptance:

- [x] MCP can find assets/scripts/scenes by glob, class name, resource type, and text.
- [x] MCP can prepare and invoke Godot's non-live project import pass while preserving selected `import_paths` in the response for traceability.
- [x] MCP can list autoloads and project settings through a guarded `project.godot` parser; Phase 2 should switch scan/reimport to live `EditorFileSystem` calls where available.

Verification note, 2026-06-03: focused Phase 1.3 TDD added 8 Node tests covering tool registration, project settings read/write dry-run and allowlist rejection, autoload list/add/remove, filesystem search by glob/class/resource/text, filesystem scan, reimport command wiring, UID resolution, dependency graph, orphan detection, and missing UID files. RED was observed as `ERR_MODULE_NOT_FOUND` for `build/tools/project-filesystem.js` before implementation. After adding `src/tools/project-filesystem.ts` and registering it from `src/index.ts`, `npm run build; node --test tests/project-filesystem.test.mjs` passed 8/8 focused tests and `npm test` passed 30/30 repo tests. A built-tool smoke against `test_mcp_enhancements` read `application/config/name` as `Test_MCP_Enhancements`, found `CoinV2` at `res://coin_v2.gd`, found Theme resources, built a 352-edge dependency graph, resolved `res://coin_v2.gd` to `uid://w7rvduiajdmh`, and produced a dry-run Godot `--import` command for `res://icon.svg`. Non-live `filesystem_reimport` invokes Godot's project import pass; selected `import_paths` are preserved in the response for caller traceability until Phase 2 can use `EditorFileSystem` for truly selected live-editor reimports.

### 1.4 Add Resource Workflow Tools

- [x] Add `resource_search`.
- [x] Add `resource_get_info`.
- [x] Add `resource_assign`.
- [x] Add `resource_preview_metadata`.
- [x] Add `create_gradient_texture`.
- [x] Add `create_noise_texture`.
- [x] Add `create_curve_resource`.
- [x] Add `set_curve_points`.
- [x] Add `create_environment_resource`.
- [x] Add `create_physics_material`.
- [x] Add `autofit_physics_shape`.
- [x] Add `resource_convert_format` for safe `.tres`/`.res` conversion where Godot supports it.

Acceptance:

- [x] Codex can create common `.tres` resources without manually authoring resource text.
- [x] Codex can assign a created resource to a node property and validate the scene afterward.

Verification note, 2026-06-03: focused Phase 1.4 TDD added 4 Node tests covering registration for all 12 resource workflow tools, resource search/info/preview metadata parsing, ResourceSaver operation dispatch for gradient/noise/environment/physics material creation, and curve/assignment/autofit/format-conversion parameter mapping. `npm run build && node --test tests/resource-workflow.test.mjs` passed 4/4 focused tests, and final `npm test` passed 34/34 repo tests. A Godot 4.6.3 headless smoke against `test_mcp_enhancements` created real `GradientTexture2D`, `NoiseTexture2D`, `Curve`, `Environment`, and `PhysicsMaterial` resources via `ResourceSaver.save()`, replaced Curve points, converted the generated gradient from `.tres` to `.res`, assigned the generated gradient texture to a copied Sprite2D scene property, autofit a copied physics scene's `CollisionShape2D` to `Vector2(48, 24)`, and then removed the temporary `mcp_phase14_*` smoke artifacts.

### 1.5 Add UI And Theme Workflow Tools

- [x] Add `create_ui_layout`.
- [x] Add `draw_ui_recipe`.
- [x] Add `set_control_anchor_preset`.
- [x] Add `set_control_offsets`.
- [x] Add `set_control_text`.
- [x] Add `set_control_theme_override`.
- [x] Add `create_theme`.
- [x] Add `theme_set_color`.
- [x] Add `theme_set_constant`.
- [x] Add `theme_set_font_size`.
- [x] Add `theme_set_stylebox_flat`.
- [x] Add `apply_theme`.
- [x] Add `inspect_ui_layout`.
- [x] Add `validate_ui_safe_area`.

Tooling idea:

- `draw_ui_recipe` should accept a declarative layout recipe for common screens: main menu, pause menu, settings screen, HUD, dialogue box, inventory grid, virtual joystick, and mobile action buttons.

Acceptance:

- [x] Codex can create a usable menu scene from one recipe.
- [x] The resulting UI validates for empty containers, missing text, offscreen controls, and obvious anchor mistakes.

Verification note, 2026-06-03: focused Phase 1.5 TDD added 5 Node tests covering registration for all 14 UI/theme workflow tools, declarative layout and recipe operation payloads, control mutation payloads, Theme and StyleBoxFlat payloads, theme application payloads, and inspect/validate viewport constraints. RED was observed as `ERR_MODULE_NOT_FOUND` for `build/tools/ui-theme-workflow.js` before implementation. After adding `src/tools/ui-theme-workflow.ts`, registering it from `src/index.ts`, and adding Godot operations in `src/scripts/godot_operations.gd`, `npm run build && node --test tests/ui-theme-workflow.test.mjs` passed 5/5 focused tests and final `npm test` passed 39/39 repo tests. A Godot 4.6.3 headless smoke against `test_mcp_enhancements` created and mutated a real Theme resource with color, constant, font-size, and `StyleBoxFlat` entries, generated a pause-menu scene from `draw_ui_recipe`, applied the theme, changed button text and panel offsets, inspected 7 Control nodes, validated 0 safe-area/layout issues, and removed the temporary `mcp_phase15_*` smoke artifacts. A compiled MCP stdio smoke with `GODOT_PATH=C:\Users\brett\Desktop\Godot\Godot.exe` listed 155 tools including `create_ui_layout`, `draw_ui_recipe`, `set_control_anchor_preset`, and `validate_ui_safe_area`, created a temporary `res://scenes/mcp_phase15_mcp_smoke_menu.tscn` from a main-menu recipe, validated it with 0 issues, and deleted the temporary scene.

### 1.6 Add Camera Workflow Tools

- [x] Add `create_camera`.
- [x] Add `configure_camera`.
- [x] Add `setup_camera_follow_2d`.
- [x] Add `set_camera_limits_2d`.
- [x] Add `set_camera_smoothing_2d`.
- [x] Add `apply_camera_preset`.
- [x] Add `list_cameras`.
- [x] Add `preview_camera_bounds`.

Acceptance:

- [x] Codex can add a Camera2D to a test scene, configure follow behavior, set limits, and validate the result.

Verification note, 2026-06-03: focused Phase 1.6 TDD added 4 Node tests covering registration for all 8 camera workflow tools, camera creation/configuration payload mapping, Camera2D follow/limits/smoothing/preset payload mapping, and list/preview JSON response parsing. RED was observed as `ERR_MODULE_NOT_FOUND` for `build/tools/camera-workflow.js` before implementation. After adding `src/tools/camera-workflow.ts`, registering it from `src/index.ts`, and adding Godot operations in `src/scripts/godot_operations.gd`, `npm run build && node --test tests/camera-workflow.test.mjs` passed 4/4 focused tests and final `npm test` passed 43/43 repo tests. A built-tool Godot 4.6.3 headless smoke against `test_mcp_enhancements` copied a temporary scene, created `McpPhase16Camera` as a real Camera2D, attached a generated follow script targeting `../NewParent`, set limits to left `-128`, right `2048`, top `-96`, bottom `1024`, enabled smoothed limits and editor limit drawing, configured smoothing, applied the `platformer_2d` preset, listed one enabled/current camera, previewed 960x540 bounds centered at `[128, 96]`, and removed the temporary scene plus generated follow script artifacts when they were absent before the smoke.

### 1.7 Add Audio Player Workflow Tools

- [x] Add `create_audio_player`.
- [x] Add `set_audio_stream`.
- [x] Add `configure_audio_playback`.
- [x] Add `play_audio_node`.
- [x] Add `stop_audio_node`.
- [x] Add `list_audio_players`.
- [x] Add `validate_audio_routes`.

Acceptance:

- [x] Codex can generate or import an audio asset, create an AudioStreamPlayer node, route it to a bus, and verify it is present in the scene.

Verification note, 2026-06-03: focused Phase 1.7 TDD added 4 Node tests covering registration for all 7 audio player workflow tools, audio player creation/stream/configuration payload mapping, play/stop payload mapping, and list/route-validation JSON response parsing. RED was observed as `ERR_MODULE_NOT_FOUND` for `build/tools/audio-player-workflow.js` before implementation. After adding `src/tools/audio-player-workflow.ts`, registering it from `src/index.ts`, and adding Godot operations in `src/scripts/godot_operations.gd`, `npm run build && node --test tests/audio-player-workflow.test.mjs` passed 4/4 focused tests and final `npm test` passed 47/47 repo tests. A strict Godot 4.6.3 headless smoke against `test_mcp_enhancements` copied a temporary scene, created `McpPhase17Music` as a real `AudioStreamPlayer2D`, assigned `res://audio/test_music.wav`, switched the stream to `res://audio/test_sfx.wav`, routed playback to `Master`, configured volume `-4`, pitch `0.95`, max distance `1200`, and attenuation `1.25`, listed one audio player, validated the route with `valid: true` and no issues, and removed the temporary scene. During smoke debugging, direct offline `playing = true` emitted a Godot engine error because the edited node is not inside the scene tree; `play_audio_node` now defers offline playback by enabling `autoplay` and reports `playback_deferred: true`, while live/tree-attached use can still call `play()`. A compiled MCP stdio smoke with `GODOT_PATH=C:\Users\brett\Desktop\Godot\Godot.exe` listed 170 tools and confirmed all 7 Phase 1.7 tool names were present.

### 1.8 Add Scene Search And Node Refactor Helpers

- [x] Add `node_find`.
- [x] Add `node_rename`.
- [x] Add `node_move`.
- [x] Add `node_add_to_group`.
- [x] Add `node_remove_from_group`.
- [x] Add `node_replace_type`.
- [x] Add `node_bulk_property_set`.
- [x] Add `scene_find_references`.
- [x] Add `scene_dependency_report`.

Acceptance:

- [x] Codex can find nodes across scenes by name, type, group, script, or property.
- [x] Codex can safely rename or move a node and keep signal paths valid where possible.

Verification note, 2026-06-03: focused Phase 1.8 TDD added 4 Node tests covering registration for all 9 scene search/node refactor tools, search/report payload mapping, mutation payload mapping with scene-cache invalidation, type replacement, and bulk property JSON parsing. RED was observed as `ERR_MODULE_NOT_FOUND` for `build/tools/node-refactor-workflow.js` before implementation. After adding `src/tools/node-refactor-workflow.ts`, registering it from `src/index.ts`, and adding Godot operations in `src/scripts/godot_operations.gd`, `npm run build && node --test tests/node-refactor-workflow.test.mjs` passed 4/4 focused tests and final `npm test` passed 51/51 repo tests. A strict Godot 4.6.3 headless smoke against `test_mcp_enhancements` copied `tier1_test_scene.tscn` to temporary `res://scenes/mcp_phase18_smoke.tscn`, found two `Sprite2D` nodes, renamed `TestSprite` to `McpPhase18Hero`, added persistent group `phase18`, moved the node under `NewParent` while preserving global transform, bulk-set `visible=false` on two nodes, replaced `NewParent/NestedSprite` from `Sprite2D` to `Node2D`, removed the group, confirmed `scene_find_references` found the moved target with `target_exists: true`, reported the external dependency `res://materials/hologram.tres`, emitted no Godot warnings/errors after the ownership fix, and removed the temporary scene.

## Phase 2 - Add The Live Editor Plugin Bridge

Goal: Give Codex awareness of the Godot editor the user already has open.

### 2.1 Create The Addon Skeleton

- [x] Add `addons/godot_mcp_live/plugin.cfg`.
- [x] Add `addons/godot_mcp_live/godot_mcp_live.gd`.
- [x] Add `addons/godot_mcp_live/session_state.gd`.
- [x] Add `addons/godot_mcp_live/command_dispatcher.gd`.
- [x] Add `addons/godot_mcp_live/transport_websocket.gd`.
- [x] Skip `addons/godot_mcp_live/transport_http.gd`; WebSocket did not prove awkward in the Phase 2.1 loopback proof.
- [x] Mark editor scripts with `@tool`.
- [x] Use `EditorPlugin._enter_tree()` to start the bridge.
- [x] Use `EditorPlugin._exit_tree()` to disconnect and clean up.
- [x] Add a minimal dock panel showing connection state, active session ID, server URL, and last error.

Acceptance:

- [x] The addon appears in Godot's Project Settings > Plugins.
- [x] Enabling the plugin connects to the MCP server.
- [x] Disabling the plugin disconnects cleanly.

Verification note, 2026-06-03: Phase 2.1 added the live addon skeleton under `test_mcp_enhancements/addons/godot_mcp_live/`, enabled it alongside GUT in `test_mcp_enhancements/project.godot`, and added focused structural coverage in `tests/live-addon-skeleton.test.mjs`. RED was observed before implementation as missing addon files and missing `res://addons/godot_mcp_live/plugin.cfg` enablement. After implementation, `npm run build && node --test tests/live-addon-skeleton.test.mjs` passed 3/3 focused tests and final `npm test` passed 54/54 repo tests. A strict editor-mode load with `C:\Users\brett\Desktop\Godot\Godot.exe --headless --editor --path C:\Users\brett\Desktop\godot-mcp\test_mcp_enhancements --quit` exited 0 with no addon script errors; it emitted only the existing nested-project warning and a generic headless editor shutdown ObjectDB warning. A loopback WebSocket listener on `127.0.0.1:6010` plus a fresh headless editor instance received the addon's `hello` payload with `project_path: C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements/` and `connection_state: connected`, proving enable-time connection behavior. A listener-only check against the already-open editor did not observe a connection, so the existing GUI window likely needs project/plugin reload before it hot-loads the newly added addon.

### 2.2 Add MCP-Side Live Session Manager

- [x] Add `src/live/session-manager.ts`.
- [x] Add `src/live/protocol.ts`.
- [x] Add `src/live/transport.ts`.
- [x] Add `src/tools/live-editor.ts`.
- [x] Track connected editor sessions:
  - session ID
  - project path
  - Godot version
  - editor PID if available
  - active scene
  - play state
  - writable state
  - last heartbeat
- [x] Add heartbeat and stale-session cleanup.
- [x] Add project-path matching before allowing mutations.
- [x] Add a session activation model:
  - active session
  - explicit session target
  - error if multiple sessions exist and no active session is selected
- [x] Add optional shared secret or loopback-only connection guard.

Acceptance:

- [x] `session_list` shows the open `test_mcp_enhancements` editor.
- [x] `session_activate` selects that editor.
- [x] Commands reject stale or mismatched sessions.

Verification note, 2026-06-03: focused Phase 2.2 TDD added `tests/live-session-manager.test.mjs` covering tool registration, `hello` session tracking, project-path normalization/mismatch rejection, multiple-session activation ambiguity, heartbeat snapshot refresh before stale cleanup, stale-session rejection, explicit disconnect close callbacks, and real loopback WebSocket `hello` intake. RED was observed first as `ERR_MODULE_NOT_FOUND` for `build/tools/live-editor.js`, then later as missing reconnect/heartbeat addon patterns and stale heartbeat state. After adding `src/live/protocol.ts`, `src/live/session-manager.ts`, `src/live/transport.ts`, `src/tools/live-editor.ts`, registering the tools from `src/index.ts`, and adding `ws`, `npm run build && node --test tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs` passed 10/10 focused tests and final `npm test` passed 62/62 repo tests. A built MCP stdio smoke with `GODOT_PATH=C:\Users\brett\Desktop\Godot\Godot.exe` confirmed `session_list` exposed a running listener on `127.0.0.1:6010/godot-mcp-live`; the already-open GUI editor did not hot-reload/connect during a 15-second poll. A controlled live smoke then started a fresh `C:\Users\brett\Desktop\Godot\Godot.exe --headless --editor --path C:\Users\brett\Desktop\godot-mcp\test_mcp_enhancements` instance while the built MCP server was running; `session_list` saw `test_mcp_enhancements` on attempt 5 with `connection_state: connected`, `godot_version: 4.6.3-stable (official)`, and `remote_address: 127.0.0.1`, and `session_activate` selected that session successfully. The headless editor emitted only the existing nested-project warning. Follow-up after reloading the GUI project: the built MCP server saw the GUI editor on `session_list` attempt 1 with `active_scene: res://exec_test.tscn`, `connection_state: connected`, `godot_version: 4.6.3-stable (official)`, `remote_address: 127.0.0.1`, and `session_activate` selected session `godot-mcp-1780523463261-849982`.

### 2.3 Add Live Editor State Tools And Resources

- [x] Add `editor_state`.
- [x] Add `session_list`.
- [x] Add `session_activate`.
- [x] Add `session_disconnect`.
- [x] Add `scene_current`.
- [x] Add `scene_open`.
- [x] Add `scene_save_active`.
- [x] Add `scene_reload_active`.
- [x] Add `selection_get`.
- [x] Add `selection_set`.
- [x] Add `editor_screenshot`.
- [x] Add `logs_read_editor`.
- [x] Add `logs_clear`.
- [x] Add `editor_monitors_get`.
- [x] Add `editor_quit`.

Resources:

- [x] Add `godot-mcp://live/sessions`.
- [x] Add `godot-mcp://live/editor/state`.
- [x] Add `godot-mcp://live/scene/current`.
- [x] Add `godot-mcp://live/scene/hierarchy`.
- [x] Add `godot-mcp://live/selection/current`.
- [x] Add `godot-mcp://live/logs/recent`.

Acceptance:

- [x] Codex can read the active scene path from the live editor.
- [x] Codex can read the selected node path.
- [x] Codex can set the editor selection to a known node.
- [x] Codex can save the active scene through the editor.
- [x] Codex can capture a screenshot of the editor viewport or active game viewport.

Verification note, 2026-06-03: focused Phase 2.3 TDD added `tests/live-editor-state.test.mjs` covering tool registration, MCP-to-addon command request/response, scene/selection/save/screenshot command mapping, and live resource reads. RED was observed as missing `getLiveResourceDescriptors` export and missing addon dispatcher handlers. After extending `src/live/protocol.ts`, `src/live/session-manager.ts`, `src/tools/live-editor.ts`, `src/index.ts`, and the live addon scripts, `npm run build && node --test tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs` passed 16/16 focused tests and `npm test` passed 67/67 repo tests. A built MCP stdio catalog smoke with `GODOT_PATH=C:\Users\brett\Desktop\Godot\Godot.exe` listed 194 tools including `editor_state`, `scene_current`, `selection_get`, `selection_set`, `scene_save_active`, and `editor_screenshot`, and 203 resources including all six `godot-mcp://live/*` Phase 2.3 resources. The smoke also confirmed the already-running MCP process still owned `127.0.0.1:6010` (`listen EADDRINUSE`) and exposed only the older Phase 2.2 live tools, so live command acceptance against the GUI editor required MCP connector reload. The existing live session remained connected through that older process: `test_mcp_enhancements`, Godot `4.6.3-stable (official)`, active scene `res://test_animation_with_anim.tscn`, session `godot-mcp-1780523463261-849982`. A Godot 4.6.3 headless editor parse smoke for `test_mcp_enhancements` exited 0 with only the known nested-project warning and an ObjectDB leak warning on editor shutdown.

Live GUI acceptance update, 2026-06-03: after restarting Codex, the active MCP process was a single Node server at PID 18304 with `127.0.0.1:6010` listening and one established connection. `session_list` reported one connected `test_mcp_enhancements` editor session, Godot `4.6.3-stable (official)`, editor PID 2596, active scene `res://test_animation_with_anim.tscn`, writable, and not stale. Live calls succeeded for `editor_state`, `scene_current`, `selection_get`, `selection_set` to `TestButton`, `selection_get` readback of `TestButton`, `scene_save_active` with `error_code: 0`, `editor_screenshot` to `res://screenshots/mcp_live_phase23.png` (`1101x845`), `logs_read_editor`, and `editor_monitors_get`.

### 2.4 Add Live Scene Mutation Tools

- [x] Add `live_scene_get_hierarchy`.
- [x] Add `live_node_get_properties`.
- [x] Add `live_node_set_property`.
- [x] Add `live_node_create`.
- [x] Add `live_node_delete`.
- [x] Add `live_node_duplicate`.
- [x] Add `live_node_reparent`.
- [x] Add `live_node_rename`.
- [x] Add `live_node_connect_signal`.
- [x] Add `live_node_disconnect_signal`.
- [x] Add `live_scene_mark_dirty`.
- [x] Add `live_scene_save`.

Acceptance:

- [x] Codex can add a node to the currently open scene without the user providing a `.tscn` path.
- [x] Codex can change a selected node property and save the active scene.
- [x] File-backed validators see the saved change afterward.

Verification note, 2026-06-03: focused Phase 2.4 TDD added `tests/live-scene-mutation.test.mjs` covering registration and MCP command mapping for all 12 live scene mutation tools, plus addon contract checks for dispatcher command branches and handlers. RED was observed as missing registry entries and missing addon handler names. After extending `src/tools/live-editor.ts` and `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`, `npm run build && node --test tests/live-scene-mutation.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs` passed 18/18 focused live tests, `npm test` passed 69/69 repo tests, and `C:\Users\brett\Desktop\Godot\Godot.exe --headless --editor --path test_mcp_enhancements --quit` exited 0 with only the known nested-project warning and ObjectDB shutdown warning. A fresh MCP stdio plus headless Godot 4.6.3 editor live smoke connected session `godot-mcp-1780527663355-734808`, opened `res://test_animation_with_anim.tscn`, read hierarchy root `root`, created `McpPhase24LiveProof_1780527661189` without passing a `.tscn` path, set `visible=false`, saved with `error_code: 0`, confirmed the saved scene file contained the proof node and `visible = false`, confirmed file-backed `node_find` saw the proof node, deleted it, saved again with `error_code: 0`, and confirmed the saved scene file no longer contained the proof node. The already-open GUI editor addon still had the Phase 2.3 dispatcher loaded and returned `unsupported_command` for `live_scene_get_hierarchy`; a plugin/editor reload is required before the GUI session can answer Phase 2.4 commands. A fresh hidden listener was restored afterward at PID 2340 with an established GUI connection on `127.0.0.1:6010`.

### 2.5 Add Editor Filesystem And Import Operations

- [x] Add `editor_filesystem_scan`.
- [x] Add `editor_filesystem_reimport`.
- [x] Add `editor_resource_reload`.
- [x] Add `editor_resource_uid_update`.
- [x] Add `editor_open_resource`.
- [x] Add `editor_focus_file`.

Research basis:

- These should use `EditorFileSystem` from inside the editor where possible.

Acceptance:

- [x] Codex can create a file externally, ask the live editor to scan/reimport, and then see the resource in the editor filesystem.

Verification note, 2026-06-03: focused Phase 2.5 TDD added `tests/live-editor-filesystem.test.mjs` covering registration and live-command mapping for all 6 editor filesystem/import tools, plus addon contract checks for dispatcher command branches and handlers. RED was observed as missing registry entries and missing addon handler names. After extending `src/tools/live-editor.ts` and `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`, `npm run build && node --test tests/live-editor-filesystem.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs` passed 18/18 focused live tests, `npm test` passed 71/71 repo tests, and `C:\Users\brett\Desktop\Godot\Godot.exe --headless --editor --path test_mcp_enhancements --quit` exited 0 with only the known nested-project warning and ObjectDB shutdown warning. Context7/Godot 4.6 docs confirmed `EditorFileSystem.update_file()`, `scan()`, `reimport_files()`, `EditorInterface.get_resource_filesystem()`, `EditorInterface.get_file_system_dock()`, and `FileSystemDock.navigate_to_path()`. A fresh MCP stdio server from the built code listed 212 tools, a fresh headless Godot live editor session `godot-mcp-1780528878653-200823` connected for `test_mcp_enhancements`, an externally-created `res://mcp_phase25_live_probe.svg` scanned visible/existing with `waited_ms: 51`, reimported with no timeout, reloaded as `CompressedTexture2D`, returned UID `uid://chkcmhe8omw04`, focused and opened as a resource, then cleanup removed the probe and a follow-up scan reported `exists: false` and `visible: false`. The live listener was restored afterward on `127.0.0.1:6010` with one established editor connection.

## Phase 3 - Runtime Control, Debugger Bridge, And Play Mode Awareness

Goal: Let Codex inspect and control the currently running game, not only offline scenes.

### 3.1 Add Editor Debugger Plugin Bridge

- [x] Add an `EditorDebuggerPlugin` inside the live addon.
- [x] Register it from the editor plugin with `add_debugger_plugin()`.
- [x] Define message namespace, for example `godot_mcp:*`.
- [x] Add runtime-side helper/autoload for messages from the running game using `EngineDebugger`.
- [x] Track debugger session IDs.
- [x] Track play start/stop events.
- [x] Surface runtime connection status in `editor_state`.
- [x] Add editor-driven `runtime_play_scene` and `runtime_stop` commands for live runtime acceptance.

Acceptance:

- [x] Starting the game from the editor creates a runtime debugger session visible to the MCP.
- [x] MCP can send a ping to the running game and receive a response.

Verification note, 2026-06-05: Phase 3.1 added an implementation plan at `docs/superpowers/plans/2026-06-05-phase-3-1-editor-debugger-bridge.md`, a live addon `EditorDebuggerPlugin` bridge (`debugger_bridge.gd`), a runtime `EngineDebugger` autoload helper (`runtime_bridge.gd`), project autoload registration, `runtime_status` session serialization, and the MCP `runtime_ping` live command. Context7 and the official Godot 4.6 docs were used for `EditorPlugin.add_debugger_plugin()`, `EditorDebuggerPlugin._has_capture()/_capture()/_setup_session()`, `EditorDebuggerSession.send_message()`, and `EngineDebugger.register_message_capture()/send_message()/unregister_message_capture()`. RED was observed with `npm run build && node --test tests/live-runtime-debugger.test.mjs tests/live-addon-skeleton.test.mjs` failing for missing `debugger_bridge.gd`, missing runtime autoload, missing `runtime_ping`, and missing serialized `runtime_status`; after implementation the same focused command passed 6/6. Broader focused live regression `npm run build && node --test tests/live-runtime-debugger.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs` passed 19/19, and `npm test` passed 74/74 after the final Godot signature fix. Godot 4.6.3 editor parse smoke with `C:\Users\brett\Desktop\Godot\Godot.exe --headless --editor --path C:\Users\brett\Desktop\godot-mcp\test_mcp_enhancements --quit` initially exposed that `_has_capture()` must match the parent signature as `String`, not `StringName`; after fixing that, the same smoke passed an explicit `SCRIPT ERROR|\bERROR:` output guard with only the known nested-project and ObjectDB shutdown warnings. A runtime autoload smoke with `--headless --path ... --quit-after 1 res://tier1_test_scene.tscn` also passed the explicit script-error output guard. Initial live GUI runtime acceptance was blocked because the callable MCP connector reported zero sessions and `listen EADDRINUSE` on `127.0.0.1:6010`; Windows TCP inspection showed PID 21344 (`node C:\Users\brett\Desktop\godot-mcp\build\index.js`) owned the port and had one established editor connection, so the open GUI was connected to a different already-running MCP server that had to be reloaded before the new Phase 3.1 `runtime_ping` command could be exercised against it.

Follow-up verification note, 2026-06-05: After cleaning duplicate Codex MCP config and reloading, a controlled MCP smoke confirmed the editor bridge reconnected on attempt 2 and `editor_state` returned the live GUI state. External `--remote-debug` runtime attachment did not create an `EditorDebuggerPlugin` session, so Phase 3.1 added `runtime_play_scene` and `runtime_stop` to start/stop the game from inside the live editor using Godot 4.6 `EditorInterface.play_custom_scene(scene_filepath)` and `EditorInterface.stop_playing_scene()`. Focused runtime/addon tests passed 7/7, broader live regression passed 20/20, `npm test` passed 75/75, Godot editor parse smoke passed the explicit `SCRIPT ERROR|\bERROR:` guard, and runtime autoload smoke passed. A controlled live proof then started a built MCP server, launched a fresh headless editor session for `test_mcp_enhancements`, called `runtime_play_scene` for `res://tier1_test_scene.tscn`, observed `runtime_status.state: running` with `runtime_active_session_id: 0`, called `runtime_ping`, verified the returned `last_ping.pong: true` from runtime PID 9796 for scene `res://tier1_test_scene.tscn`, and called `runtime_stop` successfully.

GUI reload verification note, 2026-06-05: After the user reloaded the Godot editor/app, a controlled smoke against the open GUI editor PID 4068 connected on attempt 2, read `editor_state`, called `runtime_play_scene` for `res://tier1_test_scene.tscn`, observed `runtime_status.state: running` with `runtime_active_session_id: 0`, `last_message: godot_mcp:runtime_ready`, runtime PID 3820, and scene `res://tier1_test_scene.tscn`, then called `runtime_ping` with roundtrip ID `godot-mcp-ping-379588` and verified `last_ping.pong: true` before `runtime_stop`. An earlier GUI attempt sent ping before `runtime_ready` arrived (`runtime_ready` arrived after the ping send), so live acceptance should wait for `runtime_ready` before sending runtime commands. The Codex app tool registry still did not expose the `mcp__godot_mcp` namespace in this already-running thread after the config cleanup, so the GUI proof used a temporary built MCP child server; the single intended Codex MCP declaration is now in `C:\Users\brett\.codex\config.toml`, and a fresh Codex app reload/new thread is expected to load that tool namespace.

Restart-debugging verification note, 2026-06-05: After a Codex restart the `mcp__godot_mcp` namespace loaded, but `session_list` still reported zero sessions with stale `listen EADDRINUSE` while Windows showed no active listener on `127.0.0.1:6010`; the Godot dock stayed at `connecting`. Root cause was the live WebSocket transport treating asynchronous bind errors as a non-null running server, which blocked later retries after the port was freed. A RED test in `tests/live-session-manager.test.mjs` reproduced that a port-blocked startup could not retry; `src/live/transport.ts` now marks the transport running only on `listening`, clears the server on server-level `error`, and lets a later `start()` retry. After another Codex/editor reload, `session_list` correctly reported `running: false` instead of stale running state, but it still did not trigger a new bind; a second RED test now verifies the singleton transport retries from `getLiveSessionTransportStatus()` after the startup bind error has been visible briefly. A second live probe found stale runtime metadata after editor stop/start, so `debugger_bridge.gd` now clears runtime metadata on start/stop and `runtime_ping` returns `runtime_not_ready` until a fresh `godot_mcp:runtime_ready` arrives after the current `started_unix`. Focused runtime/session/addon regression passed 16/16, focused session retry regression passed 10/10, `npm test` passed 77/77, the Godot editor parse smoke passed the explicit `SCRIPT ERROR|\bERROR:` guard, and a fresh headless live proof connected session `godot-mcp-1780683571075-175182`, started `res://tier1_test_scene.tscn`, observed fresh runtime PID 19348 with `last_message_unix >= started_unix`, sent ping `godot-mcp-ping-4600`, verified `last_ping.pong: true`, and stopped the runtime. The current GUI editor and Codex MCP child still need to be reloaded to pick up these just-built fixes.

Callable-process verification note, 2026-06-05: After another Codex/editor reload the Godot dock reported connected and Windows showed PID 22624 listening on `127.0.0.1:6010` with one established editor connection, but the callable `mcp__godot_mcp.session_list` still returned zero sessions. Windows process inspection showed a second Codex-launched MCP process PID 18584; the editor had connected to the earlier listener PID 22624 while tool calls were routed to PID 18584. Root cause was eager live listener startup in every `node build/index.js` process, which lets a non-callable process win the fixed live port. `src/index.ts` no longer starts the live transport in the constructor; it now passes a lazy `ensureLiveSessionTransportStatus()` callback to live tools, so the process that receives `session_list` is the process that binds the live bridge. `tests/live-session-manager.test.mjs` adds a RED/green regression proving the singleton can start lazily from the status helper and accept a WebSocket hello. Focused live-session regression passed 11/11, `npm test` passed 78/78, and Godot editor parse smoke passed the explicit `SCRIPT ERROR|\bERROR:` guard. A Codex restart is required to replace the already-running eager-listener processes with this lazy-listener build.

### 3.2 Add Runtime Inspection Tools

- [x] Add `runtime_get_scene_tree`.
- [x] Add `runtime_get_node_info`.
- [x] Add `runtime_get_node_property`.
- [x] Add `runtime_watch_node`.
- [x] Add `runtime_get_ui_elements`.
- [x] Add `runtime_get_focus_owner`.
- [x] Add `runtime_get_viewport_info`.
- [x] Add `runtime_get_performance_metrics`.
- [x] Add `runtime_get_input_map`.
- [x] Add `runtime_get_groups`.

Acceptance:

- [x] Codex can inspect the live running scene tree while the project is playing.
- [x] Codex can list visible UI controls with text, bounds, disabled/visible state, and focus information.

Verification note, 2026-06-05: Phase 3.2 added an implementation plan at `docs/superpowers/plans/2026-06-05-phase-3-2-runtime-inspection-tools.md`, focused RED tests in `tests/live-runtime-inspection.test.mjs`, expanded addon contract assertions in `tests/live-addon-skeleton.test.mjs`, ten new live MCP tool registrations in `src/tools/live-editor.ts`, editor dispatcher forwarding in `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`, async debugger request/result handling in `debugger_bridge.gd`, and runtime `SceneTree`/node/UI/viewport/performance/input/group serializers in `runtime_bridge.gd`. Context7/Godot 4.6 docs were used for `EngineDebugger` message capture and GDScript coroutine/`await` behavior. RED was observed with `npm run build && node --test tests/live-runtime-inspection.test.mjs tests/live-addon-skeleton.test.mjs` failing for missing `runtime_get_scene_tree` registration and missing addon/runtime handler names. An initial Godot editor smoke caught `Variant.get_type_name(...)` parser errors, which were fixed with explicit type strings. Initial live proof showed blocking `OS.delay_msec()` starved `EditorDebuggerPlugin._capture()` until after timeout; `transport_websocket.gd`, `command_dispatcher.gd`, and `debugger_bridge.gd` now await frame-yielded inspection responses, and `runtime_ready_unix` keeps runtime readiness valid after later `inspection_result` messages. Final focused live regression `npm run build && node --test tests/live-runtime-inspection.test.mjs tests/live-runtime-debugger.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs` passed 25/25, `npm test` passed 80/80, Godot 4.6.3 editor parse smoke passed the explicit `SCRIPT ERROR|\bERROR:` guard with only the known nested-project and ObjectDB shutdown warnings, and runtime autoload smoke with `--headless --path ... --quit-after 1 res://tier1_test_scene.tscn` exited 0. Live acceptance used the `.mcp.json` stdio command `node C:/Users/brett/Desktop/godot-mcp/build/index.js` with `GODOT_PATH=C:/Users/brett/Desktop/Godot/Godot.exe`; a stale non-callable listener PID 21036 owned `127.0.0.1:6010` and was stopped so the `.mcp.json` process could own the bridge. A fresh headless editor session `godot-mcp-1780687800899-474470` (editor PID 15272) started `res://tier1_test_scene.tscn`, observed runtime session `0`, and proved `runtime_get_scene_tree` root `root`, `runtime_get_node_info` class `Node2D`, `runtime_get_node_property name = root`, `runtime_watch_node` keys `name` and `process_mode`, `runtime_get_ui_elements` count `1`, `runtime_get_focus_owner` structured null focus, `runtime_get_viewport_info` size `1152x648`, `runtime_get_performance_metrics` including `TIME_FPS`, `runtime_get_input_map` count `92`, `runtime_get_groups` count `1`, and `runtime_stop`.

### 3.3 Add Runtime Input Tools

- [x] Add `runtime_input_key`.
- [x] Add `runtime_input_mouse`.
- [x] Add `runtime_input_gamepad`.
- [x] Add `runtime_input_action`.
- [x] Add `runtime_input_text`.
- [x] Add `runtime_input_state`.
- [x] Add `runtime_wait_for_condition`.
- [x] Add `runtime_click_ui_text`.
- [x] Add `runtime_click_ui_path`.

Acceptance:

- [x] Codex can press a project input action.
- [x] Codex can click a visible UI button by text or node path.
- [x] Codex can wait for a UI/state condition and report timeout vs success.

Verification note, 2026-06-05: Phase 3.3 added an implementation plan at `docs/superpowers/plans/2026-06-05-phase-3-3-runtime-input-tools.md`, focused RED tests in `tests/live-runtime-input.test.mjs`, addon contract assertions in `tests/live-addon-skeleton.test.mjs`, nine new live MCP tool registrations in `src/tools/live-editor.ts`, dispatcher forwarding in `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`, and runtime input/event/UI-click/state/wait handlers in `test_mcp_enhancements/addons/godot_mcp_live/runtime_bridge.gd`. Context7/Godot docs were used for `Input.parse_input_event()`, `InputEventAction`, `InputEventKey`, mouse/joypad input events, `OS.find_keycode_from_string()`, and timer/frame waiting behavior. RED was observed with `npm run build && node --test tests/live-runtime-input.test.mjs tests/live-addon-skeleton.test.mjs` failing for missing `runtime_input_key` registration, unknown-tool dispatch, and missing addon command names. GREEN focused runtime-input/addon tests passed 5/5, broader live runtime regression passed 27/27, and `npm test` passed 82/82. Godot 4.6.3 headless editor parse smoke exited 0 after fixing a typed `Dictionary` return analyzer issue in `_runtime_wait_for_condition`; final editor/runtime smokes exited 0 with only the known nested-project and ObjectDB shutdown warnings. Live acceptance used `.mcp.json` exactly (`node C:/Users/brett/Desktop/godot-mcp/build/index.js` with `GODOT_PATH=C:/Users/brett/Desktop/Godot/Godot.exe`), a fresh headless editor session `godot-mcp-1780689073858-892208` (editor PID 22164), and `res://test_connect.tscn`: `runtime_input_action` pressed and released `ui_accept`, `runtime_wait_for_condition` matched action pressed with `elapsed_ms: 0`, `runtime_input_state` showed `ui_accept.pressed` true then false, `runtime_wait_for_condition` matched visible UI text `Test Button`, `runtime_click_ui_text` and `runtime_click_ui_path` clicked the `Button` at `[275, 225]`, and a false node-property wait returned `matched: false`, `timed_out: true`, `observed: "TestConnect"` after 101 ms. A second `.mcp.json` live probe with headless editor session `godot-mcp-1780689203684-271500` (editor PID 23128) proved the remaining direct input constructors: `runtime_input_key` sent Space press/release, `runtime_input_mouse` sent motion plus left press/release at `[275, 225]`, `runtime_input_gamepad` sent joypad button 0 and axis 0 value `0.5`, `runtime_input_text` inserted `Hi` with four key events, and `runtime_input_state` read back key/mouse/gamepad state. The stale listener on `127.0.0.1:6010` was stopped for the `.mcp.json` proofs; afterward a hidden `.mcp.json` keeper restored a fresh listener at PID 21008 with the open GUI editor PID 24116 reconnected on an established loopback socket.

### 3.4 Add Lightweight Runtime Assertions

- [x] Add `runtime_assert_node_exists`.
- [x] Add `runtime_assert_property_equals`.
- [x] Add `runtime_assert_signal_emitted`.
- [x] Add `runtime_assert_ui_text_visible`.
- [x] Add `runtime_assert_no_errors`.
- [x] Add `runtime_snapshot_assertion_report`.

Acceptance:

- [x] Codex can perform a short live smoke test without writing a full GUT test.
- [x] Failures include the observed value and suggested next probe.

Verification note, 2026-06-05: Phase 3.4 added an implementation plan at `docs/superpowers/plans/2026-06-05-phase-3-4-runtime-assertions.md`, focused RED tests in `tests/live-runtime-assertions.test.mjs`, addon contract assertions in `tests/live-addon-skeleton.test.mjs`, six new live MCP tool registrations in `src/tools/live-editor.ts`, dispatcher forwarding in `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`, and runtime assertion/report/signal-tracking handlers in `test_mcp_enhancements/addons/godot_mcp_live/runtime_bridge.gd`. Context7/Godot 4.6 docs were used for signal connection and callable behavior. RED was observed with `npm run build && node --test tests/live-runtime-assertions.test.mjs tests/live-addon-skeleton.test.mjs` failing for missing tool registration and addon command names. GREEN focused assertion/addon tests passed 5/5, broader live runtime regression passed 29/29, and `npm test` passed 84/84. `validate_script` passed for `runtime_bridge.gd` and `command_dispatcher.gd`; Godot 4.6.3 headless editor and runtime smokes exited 0 with no `SCRIPT ERROR` or `ERROR:` matches, only the known nested-project/ObjectDB warnings. Live acceptance used `.mcp.json` exactly (`node C:/Users/brett/Desktop/godot-mcp/build/index.js` with `GODOT_PATH=C:/Users/brett/Desktop/Godot/Godot.exe`), stopped stale listener PID 22932, and proved all six new tools were present. Against live session `godot-mcp-1780690353054-740449` / editor PID 8948 running `res://test_connect.tscn`, `runtime_assert_node_exists` passed for `.`, `runtime_assert_property_equals` passed for root `name == TestConnect`, `runtime_assert_ui_text_visible` passed for `Test Button`, `runtime_assert_signal_emitted` failed before clicking then passed after `runtime_click_ui_path TestButton` with count `1`, `runtime_assert_no_errors` passed with count `0`, and `runtime_snapshot_assertion_report` returned total `3`, passed `2`, failed `1`; the intentional false property assertion observed `TestConnect` and suggested `runtime_get_node_property`. A fresh hidden `.mcp.json` keeper restored a listener on `127.0.0.1:6010/godot-mcp-live` at PID 21796.

### 3.5 Add Safe Eval, Gated And Disabled By Default

- [x] Add `live_eval_status`.
- [x] Add `game_eval` only if explicitly enabled in MCP config.
- [x] Add `editor_eval` only if explicitly enabled in MCP config.
- [x] Require:
  - local loopback connection
  - matching project path
  - explicit config flag
  - optional per-session approval token
- [x] Return clear refusal when eval is disabled.
- [x] Log all eval calls with timestamp, session, code hash, and caller-visible reason.

Acceptance:

- [x] Eval is disabled by default.
- [x] Disabled eval returns a safe error.
- [x] Enabled eval can run a harmless expression in a disposable test project.

Verification note, 2026-06-07: Phase 3.5 added `docs/superpowers/plans/2026-06-07-phase-3-5-safe-eval.md`, focused RED tests in `tests/live-safe-eval.test.mjs`, `live_eval_status`, and gated `editor_eval`/`game_eval` registration in `src/tools/live-editor.ts`. Eval tools are absent unless `GODOT_MCP_ENABLE_EVAL=true` is present in MCP env/config; enabled calls require loopback, project-path match, optional `GODOT_MCP_EVAL_APPROVAL_TOKEN`, caller `reason`, and write JSONL audit records with timestamp, session, SHA-256 code hash, decision, and reason. Context7/Godot 4.6 docs were used for `Expression.parse()` and `Expression.execute()`. RED failed for missing `live_eval_status`, `editor_eval`, and `game_eval`; GREEN focused `npm run build && node --test tests/live-safe-eval.test.mjs tests/live-addon-skeleton.test.mjs` passed 7/7, broader live runtime regression passed 33/33, and `npm test` passed 88/88. Godot 4.6.3 headless editor and runtime smokes exited 0 with no `SCRIPT ERROR` or `ERROR:` matches. `.mcp.json` live proof confirmed default eval state listed 241 tools with `live_eval_status` present and both eval tools absent; enabled proof listed 243 tools, used approval token `phase35-live-proof`, connected fresh headless editor session `godot-mcp-1780859465720-855073` PID 17008, ran `editor_eval` result `2`, started `res://tier1_test_scene.tscn`, waited for `runtime_ready`, ran `game_eval` result `5`, stopped runtime, and verified accepted audit entries with 64-character code hashes. The already-open GUI editor PID 14012 still had the old addon loaded during the first enabled proof, so reload Godot before using Phase 3.5 eval from that GUI session.

## Phase 4 - Autonomous Development Tooling Beyond The Live Bridge

Goal: Add higher-level tools that make Codex a better game-development operator, designer, tester, and maintainer.

### 4.1 Add Design-To-Scene Generators

- [x] Add `generate_scene_from_brief`.
- [x] Add `generate_level_blockout`.
- [x] Add `generate_menu_flow`.
- [x] Add `generate_hud`.
- [x] Add `generate_dialogue_scene`.
- [x] Add `generate_settings_screen`.
- [x] Add `generate_mobile_controls`.
- [x] Add `generate_gameplay_prefab`.
- [x] Add `generate_enemy_archetype`.
- [x] Add `generate_pickup_archetype`.

Implementation notes:

- These should produce normal scene/script/resource files through existing lower-level tools.
- They should return a manifest of created files and follow-up validation commands.
- They should support `dry_run` and `recipe_only`.

Acceptance:

- [x] Codex can create a playable mini-feature from a short brief and then validate the created files.

Verification note, 2026-06-09: Phase 4.1 tooling was recovered after a partial implementation state. Fixes covered the Godot dispatcher calling the underscored Phase 4.1 handlers, GDScript keyword/parser issues, the Godot 4.6 `Control.PRESET_MODE_KEEP_SIZE` constant, generated validation command path hydration, and a race in `test_mcp_enhancements/phase41_live_proof.mjs`. Focused `npm run build; node --test tests/design-to-scene.test.mjs` passed 7/7, final `npm test` passed 95/95, Godot 4.6.3 editor smoke against `test_mcp_enhancements` exited 0 with no repo script errors, and `node test_mcp_enhancements/phase41_live_proof.mjs` listed 251 tools, found all 10 Phase 4.1 tools, dry-ran all 10, generated HUD/enemy/brief proof files, and validated the returned manifest commands successfully. Temporary `mcp_phase41_*` and `mcp_design_*` proof artifacts were removed afterward.

### 4.2 Add Gameplay Loop And State-Machine Helpers

- [x] Add `create_state_machine`.
- [x] Add `add_state`.
- [x] Add `connect_state_transition`.
- [x] Add `generate_character_controller`.
- [x] Add `generate_interaction_system`.
- [x] Add `generate_inventory_system`.
- [x] Add `generate_dialogue_controller`.
- [x] Add `generate_save_load_system`.
- [x] Add `generate_settings_persistence`.

Acceptance:

- [x] Codex can scaffold a small gameplay system with scripts, scene nodes, and tests.

Verification note, 2026-06-09: Phase 4.2 added `docs/superpowers/plans/2026-06-09-phase-4-2-gameplay-systems.md`, focused RED/GREEN tests in `tests/gameplay-systems.test.mjs`, `src/tools/gameplay-systems.ts`, registration from `src/index.ts`, Godot operation handlers in `src/scripts/godot_operations.gd`, and `test_mcp_enhancements/phase42_live_proof.mjs`. Context7 Godot docs were used for `ConfigFile.load()`, `ConfigFile.save()`, `set_value()`, and `get_value()` in the settings persistence generator. RED first failed with missing `build/tools/gameplay-systems.js`; a later live proof found and fixed an `add_state` use-after-free root-name bug with a regression test. Focused `npm run build; node --test tests/gameplay-systems.test.mjs` passed 7/7, final `npm test` passed 102/102, Godot 4.6.3 headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches, and `node test_mcp_enhancements/phase42_live_proof.mjs` listed 260 tools, found all 9 Phase 4.2 tools, dry-ran all 9, generated a state machine plus state/transition, generated character/interaction/inventory/dialogue/save/settings systems with scenes/scripts/tests, validated all returned manifest commands, and removed temporary `mcp_phase42_*` artifacts. The open editor remained connected on `127.0.0.1:6010`.

### 4.3 Add Test Tooling Expansion

- [x] Keep existing GUT support.
- [x] Add `gut_install_or_update`.
- [x] Add `gut_discover_tests`.
- [x] Add `gut_run_test_file`.
- [x] Add `gut_run_changed_tests`.
- [x] Add `gut_run_with_coverage` if coverage tooling is available.
- [x] Research and optionally add gdUnit4 support:
  - `gdunit4_install_or_update`
  - `gdunit4_run_tests`
  - `gdunit4_discover_tests`
  - `gdunit4_generate_test`
- [x] Add `test_watch_plan` to recommend which tests to run after changed files.
- [x] Add `failure_to_patch_plan` to map failing tests to likely files/nodes.

Research basis:

- GUT command-line testing is already supported in this repo.
- gdUnit4 is a mature alternative with modern Godot 4 support and could be useful for users who prefer that ecosystem.

Verification note, 2026-06-09: Phase 4.3 added `docs/superpowers/plans/2026-06-09-phase-4-3-test-tooling.md`, focused RED/GREEN tests in `tests/test-tooling.test.mjs`, modular tooling in `src/tools/test-tooling.ts`, registration and parameter mappings in `src/index.ts`, README tool-surface updates, and `test_mcp_enhancements/phase43_live_proof.mjs`. Context7 docs were used for current GUT CLI flags (`addons/gut/gut_cmdln.gd`, `-gdir`, `-gtest`, `-gexit`, JUnit XML output) and gdUnit4 runner/install conventions. RED first failed with missing `build/tools/test-tooling.js`; a live GUT proof then found a false failure where GUT reported `1/1 passed` but emitted a runner-side GUT loader `SCRIPT ERROR`, so `parseTestRunnerOutput` now records runner warnings without turning an all-passing exit-0 run into a failed test result. Focused `npm run build; node --test tests/test-tooling.test.mjs` passed 5/5, final `npm test` passed 107/107, Godot 4.6.3 headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches, and `node test_mcp_enhancements/phase43_live_proof.mjs` listed 271 tools, found all 11 Phase 4.3 tools, detected GUT 9.5.0, discovered 8 GUT test files / 11 tests, executed `test/unit/test_example.gd` through real GUT with exit 0, dry-ran changed-test selection and gdUnit4 helpers, and mapped sample failure output back to `coin.gd`. Startup/live checks left exactly one `build/index.js` listener on `127.0.0.1:6010`, with the open Godot editor PID established to it; callable `session_list` still returned `Transport closed`, so live state was proven through OS facts per `CODEX_STARTUP_WITH_GODOT_MCP.md`.

Acceptance:

- [x] Codex can install or verify a test framework, generate a test, run it headlessly, and parse results.

### 4.4 Add Visual QA And Screenshot Diff Tools

- [x] Add `screenshot_compare`.
- [x] Add `capture_editor_viewport`.
- [x] Add `capture_runtime_viewport`.
- [x] Add `visual_regression_baseline_create`.
- [x] Add `visual_regression_check`.
- [x] Add `ui_overlap_check`.
- [x] Add `ui_contrast_check`.
- [x] Add `sprite_bounds_check`.
- [x] Add `camera_framing_check`.

Implementation notes:

- Use existing `capture_viewport` where possible.
- Add live editor capture after Phase 2.
- Store baselines under a project-local `.mcp_visual/` directory.

Acceptance:

- [x] Codex can compare a before/after screenshot and report changed regions.
- [x] Codex can detect obvious UI overlap or offscreen controls.

Verification note, 2026-06-09: Phase 4.4 added `docs/superpowers/plans/2026-06-09-phase-4-4-visual-qa.md`, focused RED/GREEN tests in `tests/visual-qa.test.mjs`, modular tooling in `src/tools/visual-qa.ts`, registration and parameter mappings in `src/index.ts`, Godot operation handlers `visual_sprite_bounds_check` and `visual_camera_framing_check` in `src/scripts/godot_operations.gd`, and `test_mcp_enhancements/phase44_live_proof.mjs`. Context7 Godot 4.6 docs were used for viewport capture timing and viewport size APIs. RED first failed with missing `build/tools/visual-qa.js`; focused `npm run build; node --test tests/visual-qa.test.mjs` passed 7/7, final `npm test` passed 114/114, and Godot 4.6.3 headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 4.4 proof script listed 280 tools including all 9 new tools, compared PNG screenshots with a changed-region bounding box, created and checked `.mcp_visual` baselines, ran UI overlap and contrast checks, ran sprite bounds and camera framing checks through real Godot operations, captured a runtime viewport, waited for one live editor session, captured the editor viewport through the live bridge, and cleaned temporary `phase44` artifacts. After connector reload, `mcp__godot_mcp.session_list` reported one connected `test_mcp_enhancements` editor session on `127.0.0.1:6010`, tool discovery exposed all 9 Phase 4.4 tools, and direct calls through the Codex MCP namespace succeeded for screenshot comparison, baseline creation/checking, UI overlap/contrast, sprite bounds, camera framing, runtime capture, and editor capture; temporary `.mcp_visual` artifacts were removed and `project.godot` had no diff afterward.

### 4.5 Add Asset Pipeline Control Tools

- [x] Add `asset_import_profile_create`.
- [x] Add `asset_import_profile_apply`.
- [x] Add `texture_import_settings_get`.
- [x] Add `texture_import_settings_set`.
- [x] Add `audio_import_settings_get`.
- [x] Add `audio_import_settings_set`.
- [x] Add `model_import_settings_get`.
- [x] Add `model_import_settings_set`.
- [x] Add `asset_batch_reimport`.
- [x] Add `asset_usage_report`.
- [x] Add `asset_size_budget_report`.
- [x] Add `asset_license_manifest`.

Acceptance:

- [x] Codex can import a batch of assets, set import flags, reimport them, and report size/license/usage metadata.

Verification note, 2026-06-10: Phase 4.5 added `docs/superpowers/plans/2026-06-10-phase-4-5-asset-pipeline.md`, focused RED/GREEN tests in `tests/asset-pipeline.test.mjs`, modular tooling in `src/tools/asset-pipeline.ts`, registration from `src/index.ts`, Godot operation handler `asset_batch_reimport` in `src/scripts/godot_operations.gd`, README tool-count/tool-list updates, and `test_mcp_enhancements/phase45_live_proof.mjs`. Context7 Godot 4.6 docs were used for `EditorFileSystem.reimport_files()` and `ConfigFile` import metadata handling. RED first failed with missing `build/tools/asset-pipeline.js`; focused `npm run build; node --test tests/asset-pipeline.test.mjs` passed 6/6, final `npm test` passed 120/120, and Godot 4.6.3 headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 4.5 proof script listed 292 tools, found all 12 new tools, created and applied a project-local import profile across temporary texture/audio/model assets, proved import setting get/set and dry-run behavior, generated usage, size-budget, and license reports, ran selected `asset_batch_reimport` in headless checked mode, and removed temporary `mcp_phase45_*` and `.godot-mcp/phase45_*` proof artifacts. The open GUI live connector still needs reload before direct Codex MCP namespace callability can be tested.

### 4.6 Add Addon And External Tool Managers

- [x] Expand existing Asset Library support with `asset_library_get_details`.
- [x] Add `asset_library_install_addon`.
- [x] Add `asset_library_update_addon`.
- [x] Add `asset_library_remove_addon`.
- [x] Add `addon_enable`.
- [x] Add `addon_disable`.
- [x] Add `addon_list`.
- [x] Add `addon_health_check`.
- [x] Add `external_tool_status`.
- [x] Add `external_tool_configure`.
- [x] Add adapter definitions for optional tools:
  - GUT
  - gdUnit4
  - Godot Jolt
  - Dialogic
  - LimboAI or other behavior tree/state machine addons
  - Aseprite importers
  - Blender import/export workflow helpers
  - LDtk/Tiled importers

Acceptance:

- [x] Codex can search, install, enable, and verify a plugin in a disposable project.
- [x] Codex can explain which optional tools are installed and what MCP tools can use them.

Verification note, 2026-06-10: Phase 4.6 added `docs/superpowers/plans/2026-06-10-phase-4-6-addon-tool-managers.md`, focused RED/GREEN tests in `tests/addon-tool-manager.test.mjs`, modular tooling in `src/tools/addon-tool-manager.ts`, registration from `src/index.ts`, README tool-count/tool-list updates, and `test_mcp_enhancements/phase46_live_proof.mjs`. Context7 Godot 4.6 docs were used for editor addon/plugin.cfg install and enable-state behavior. RED first failed with missing `build/tools/addon-tool-manager.js`; focused `npm run build; node --test tests/addon-tool-manager.test.mjs` passed 5/5, final `npm test` passed 125/125, and Godot 4.6.3 headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 4.6 proof script listed 302 tools, found all 10 new tools, fetched Asset Library details from a disposable local API fixture, installed/enabled/listed/health-checked/disabled/re-enabled/updated/removed a disposable project-local addon, reported all optional adapter definitions, configured a Blender adapter, verified its executable path, restored `project.godot` and `.godot-mcp/external_tools.json`, and removed temporary `.godot-mcp/phase46_*` and `addons/mcp_phase46_plugin` proof artifacts. Startup checks left exactly one `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor PID established to it; callable `mcp__godot_mcp.session_list` still returned `Transport closed`, so direct Codex MCP namespace callability requires connector/editor reload.

### 4.7 Add LSP/DAP Integration Tools

- [x] Research Godot LSP and DAP ports and lifecycle in Godot 4.6.
- [x] Add `lsp_status`.
- [x] Add `lsp_symbols`.
- [x] Add `lsp_definition`.
- [x] Add `lsp_references`.
- [x] Add `lsp_diagnostics`.
- [x] Add `lsp_rename_preview`.
- [x] Add `dap_status`.
- [x] Add `dap_set_breakpoint`.
- [x] Add `dap_clear_breakpoint`.
- [x] Add `dap_stack_trace`.
- [x] Add `dap_variables`.
- [x] Add `dap_continue`.
- [x] Add `dap_step`.

Why this matters:

- Codex already reads files, but LSP/DAP can provide editor-grade semantic information and live debugging state.

Acceptance:

- [x] Codex can retrieve diagnostics and symbols from the Godot language server.
- [x] Codex can attach to a debug session or report why it cannot.

Verification note, 2026-06-10: Phase 4.7 added `docs/superpowers/plans/2026-06-10-phase-4-7-lsp-dap-integration.md`, focused RED/GREEN tests in `tests/lsp-dap-integration.test.mjs`, modular tooling in `src/tools/lsp-dap-integration.ts`, registration and parameter mappings in `src/index.ts`, README tool-count/tool-list updates, and `test_mcp_enhancements/phase47_live_proof.mjs`. Context7 Godot docs confirmed Godot's external editor defaults: LSP on `6005`, DAP on `6006`, configured under Network > Language Server and Network > Debug Adapter. RED first failed with missing `build/tools/lsp-dap-integration.js`; a live LSP proof then found and fixed byte-inaccurate TCP frame parsing for non-ASCII symbol payloads. Focused `npm run build; node --test tests/lsp-dap-integration.test.mjs` passed 4/4, final `npm test` passed 129/129, and Godot headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 4.7 proof script listed 315 tools, found all 13 new tools, retrieved `coin.gd` symbols and diagnostics from the open editor language server, called LSP definition/references/rename preview, and exercised DAP status, breakpoint set/clear, stack trace, variables, continue, and step against port `6006`; `dap_variables` returned a clear `unavailable` status without an active variables reference. `godot_mcp_live` was re-enabled in `project.godot`, but the already-open GUI editor did not hot-connect to `127.0.0.1:6010`; direct Codex MCP namespace callability for the new `lsp_*`/`dap_*` tools still requires connector/editor reload.

### 4.8 Add Performance, Memory, And Quality Gates

- [x] Add `performance_budget_create`.
- [x] Add `performance_budget_check`.
- [x] Add `runtime_profile_capture`.
- [x] Add `runtime_profile_compare`.
- [x] Add `memory_snapshot`.
- [x] Add `node_count_budget_check`.
- [x] Add `draw_call_budget_check`.
- [x] Add `texture_memory_budget_check`.
- [x] Add `export_size_budget_check`.
- [x] Add `quality_gate_run`.

Acceptance:

- [x] Codex can run a named quality gate before export and produce pass/fail results with recommendations.

Verification note, 2026-06-10: Phase 4.8 added `docs/superpowers/plans/2026-06-10-phase-4-8-quality-gates.md`, focused RED/GREEN tests in `tests/quality-gates.test.mjs`, modular tooling in `src/tools/quality-gates.ts`, registration and parameter mappings in `src/index.ts`, README tool-count/tool-list updates, and `test_mcp_enhancements/phase48_live_proof.mjs`. Context7 Godot 4.6 docs confirmed `Performance.get_monitor(...)` usage and rendering/video-memory counters such as `RENDER_TOTAL_DRAW_CALLS_IN_FRAME`, `RENDER_VIDEO_MEM_USED`, and `RENDER_TEXTURE_MEM_USED`. RED first failed with missing `build/tools/quality-gates.js`; focused `npm run build && node --test tests/quality-gates.test.mjs` passed 5/5, final `npm test` passed 134/134, and Godot headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 4.8 proof script listed 325 tools, found all 10 new tools, created disposable profile/budget/export/scene artifacts, called every new tool successfully, and removed temporary proof artifacts. Startup checks left exactly one `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor PID established to it; the Codex MCP namespace still returned `Transport closed`, so direct namespace callability requires connector reload.

### 4.9 Add Issue Tracker And Task Ledger Tools

- [x] Add `mcp_task_create`.
- [x] Add `mcp_task_update`.
- [x] Add `mcp_task_list`.
- [x] Add `mcp_task_close`.
- [x] Add `mcp_evidence_attach`.
- [x] Add `mcp_session_report`.
- [x] Add `mcp_changelog_draft`.

Implementation notes:

- Store project-local state in `.godot-mcp/`.
- Keep this optional and transparent.

Acceptance:

- [x] Codex can leave a structured evidence trail of what it changed, tested, and still recommends.

Verification note, 2026-06-10: Phase 4.9 added `docs/superpowers/plans/2026-06-10-phase-4-9-task-ledger.md`, focused RED/GREEN tests in `tests/task-ledger.test.mjs`, modular tooling in `src/tools/task-ledger.ts`, registration and parameter mappings in `src/index.ts`, README tool-count/tool-list updates, and `test_mcp_enhancements/phase49_live_proof.mjs`. RED first failed with missing `build/tools/task-ledger.js`; focused `npm run build && node --test tests/task-ledger.test.mjs` passed 4/4, final `npm test` passed 138/138, and Godot headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 4.9 proof script listed 332 tools, found all 7 new tools, created a disposable project-local task ledger entry, updated/listed/closed it, attached evidence, generated a session report and changelog draft, and restored/remedied temporary `.godot-mcp` proof artifacts. Startup checks before implementation left exactly one `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor PID established to it, but the direct Codex MCP namespace returned `Transport closed`; after rebuilding, the current built listener was refreshed at PID 22996 and Godot editor PID 6860 reconnected to it on `127.0.0.1:6010`. Direct Codex MCP namespace callability still needs the Codex MCP connector namespace reloaded.

### 4.10 Add Safer Autonomous Planning Tools

- [x] Add `capability_matrix`.
- [x] Add `recommend_next_tool`.
- [x] Add `plan_feature_implementation`.
- [x] Add `plan_test_strategy`.
- [x] Add `risk_scan`.
- [x] Add `preflight_project_health`.
- [x] Add `postchange_verification_plan`.

Why this matters:

- Codex can use these to select the right MCP operation instead of guessing from a flat list of 100+ tools.

Acceptance:

- [x] Given a goal like "add a pause menu", MCP can recommend the tool sequence and validation path.

Verification note, 2026-06-10: Phase 4.10 added `docs/superpowers/plans/2026-06-10-phase-4-10-safer-planning.md`, focused RED/GREEN tests in `tests/safer-planning.test.mjs`, modular tooling in `src/tools/safer-planning.ts`, registration and parameter mappings in `src/index.ts`, README tool-count/tool-list/resource updates, and `test_mcp_enhancements/phase410_live_proof.mjs`. RED first failed with missing `build/tools/safer-planning.js`; focused `npm run build && node --test tests/safer-planning.test.mjs` passed 6/6, full `npm test` passed 144/144, Godot headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches, and `git diff --check` exited 0 with Git CRLF warnings only. The Phase 4.10 proof script listed 339 tools, found all 7 new tools, proved `capability_matrix`, `recommend_next_tool`, `plan_feature_implementation`, `plan_test_strategy`, `risk_scan`, `preflight_project_health`, and `postchange_verification_plan` against `test_mcp_enhancements`, verified the "add a pause menu" sequence included `generate_menu_flow` and visual validation, and removed the temporary smoke log. A temporary current-build listener proved PID 24796 could own `127.0.0.1:6010` and Godot editor PID 6860 could reconnect to it, then that holder was stopped before handoff so it will not block Codex MCP connector reload. Direct Codex MCP namespace callability still needs connector reload because `mcp__godot_mcp.session_list` returns `Transport closed`.

## Phase 5 - Packaging, Configuration, Documentation, And Distribution

Goal: Make the live-enhanced MCP easy to install, trust, verify, and maintain.

### 5.0 Add Toolset Profiles And Session Setup

Goal: Reduce token load and improve tool selection by letting a developer or LLM load only the MCP tools/resources needed for a feature session.

- [x] Add tool metadata to the registry:
  - `toolset`
  - `aliases`
  - `risk`
  - `mutates`
  - `requires_live`
  - `requires_display`
  - `requires_godot_version`
- [x] Define first-pass toolsets:
  - `core`
  - `project`
  - `scene`
  - `script`
  - `assets`
  - `live`
  - `runtime`
  - `playtest`
  - `visual`
  - `quality`
  - `debug`
  - `release`
- [x] Add startup filtering with env vars:
  - `GODOT_MCP_TOOLSETS=core,scene,playtest`
  - `GODOT_MCP_TOOLS=script_patch,validate_scene,run_automated_playtest`
- [x] Keep the default startup profile backward-compatible by loading all tools when no filter is configured.
- [x] Add an optional per-project `.godot-mcp/toolsets.json` for named profiles such as `feature-scene-edit`, `playtest-loop`, `visual-qa`, and `release-check`.
- [x] Filter `tools/list`, per-tool resources, catalog resources, and dispatch through the same active profile.
- [x] Return a clear disabled-tool error when a tool exists but is not loaded by the active profile.
- [x] Add a read-only `toolset_status` tool that reports:
  - active toolsets
  - explicitly enabled tools
  - hidden tool count
  - loaded tool count
  - config sources
  - disabled-tool remediation
- [x] Add a read-only `recommend_toolset_profile` tool that accepts a feature request and project facts, then returns:
  - recommended toolsets
  - required individual tools
  - optional tools
  - needed MCP resources
  - env/config snippet for the next session
  - verification commands for the selected workflow
- [x] Update safer-planning tools so `recommend_next_tool`, `plan_feature_implementation`, `plan_test_strategy`, `risk_scan`, and `postchange_verification_plan` can include active-profile awareness.
- [x] Add a session setup workflow:
  - LLM receives a developer feature request.
  - LLM calls `toolset_status` and/or `recommend_toolset_profile`.
  - LLM selects the minimal needed toolsets/resources.
  - LLM writes or suggests the session env/profile config.
  - User or client reloads the MCP server with that profile.
  - LLM proceeds with implementation using the smaller loaded catalog.
- [x] Add compatibility aliases for consolidated lifecycle tools instead of breaking existing names immediately.
- [x] Consolidate only true sibling lifecycle tools:
  - `start_playtest_recording` and `stop_playtest_recording` -> `playtest_recording` with `action: "start" | "stop"`.
  - `start_profiler`, `get_profiling_data`, and `analyze_bottlenecks` -> `profiler` with `action: "start" | "get" | "analyze"`.
- [x] Mark legacy sibling tools as deprecated aliases in tool metadata, docs, and catalog output.
- [x] Do not hide deprecated aliases by default until at least one release cycle after the consolidated tools ship.
- [x] Update README and `docs/autonomous-workflows.md` with:
  - profile examples
  - common feature-to-toolset mappings
  - safe read-only default recommendations
  - live/playtest/display caveats
  - reload requirements
- [x] Update MCP resource catalog generation so resources respect active profiles and do not duplicate hidden tool definitions.
- [x] Add tests for:
  - env var profile parsing
  - explicit tool allowlists
  - default all-tools behavior
  - disabled-tool dispatch errors
  - `toolset_status`
  - `recommend_toolset_profile`
  - deprecated alias behavior
  - consolidated playtest/profiler action validation
  - catalog/resource filtering

Acceptance:

- [x] With no toolset env vars, the MCP server exposes the same tool surface as before.
- [x] With `GODOT_MCP_TOOLSETS=core,scene`, `tools/list` omits unrelated playtest, asset-generation, profiling, and release tools.
- [x] With `GODOT_MCP_TOOLS=script_patch,validate_scene`, only those tools plus required core support tools are exposed.
- [x] Calling a hidden-but-known tool returns a clear remediation message naming the missing profile or explicit tool env var.
- [x] Given a request like "add a pause menu", `recommend_toolset_profile` returns a compact scene/script/UI/test/visual profile and a usable env/config snippet.
- [x] Given a request like "run a playtest and make the level less frustrating", `recommend_toolset_profile` includes playtest, runtime, fun metrics, and visual/quality verification tools.
- [x] A Codex session can follow the recommended env/config snippet, reload the MCP server, and continue with the smaller active catalog.
- [x] Deprecated `start_playtest_recording`, `stop_playtest_recording`, `start_profiler`, `get_profiling_data`, and `analyze_bottlenecks` still work as aliases.
- [x] `playtest_recording` and `profiler` reject unsupported `action` values with clear guidance.
- [x] Focused tests, full `npm test`, and a `test_mcp_enhancements` proof verify profile filtering and alias behavior.

Verification note, 2026-06-10: Phase 5.0 added `docs/superpowers/plans/2026-06-10-phase-5-0-toolset-profiles.md`, focused RED/GREEN coverage in `tests/toolset-profiles.test.mjs`, the profile metadata/filtering layer in `src/toolsets.ts`, registry metadata and disabled dispatch support in `src/registry.ts`, read-only profile tools in `src/tools/toolset-profile.ts`, server-side active-profile wiring in `src/index.ts`, consolidated lifecycle wrappers in `src/tools/playtest.ts` and `src/tools/profiling.ts`, active-profile awareness in `src/tools/safer-planning.ts`, README/profile workflow docs, `docs/autonomous-workflows.md`, and `test_mcp_enhancements/phase50_live_proof.mjs`. RED first failed with missing `build/toolsets.js`; focused `npm run build && node --test tests/toolset-profiles.test.mjs tests/safer-planning.test.mjs` passed 14/14, final `npm test` passed 152/152, and Godot headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 5.0 proof script listed 343 default tools and 352 default resources, verified `toolset_status`, `recommend_toolset_profile`, `playtest_recording`, `profiler`, and all five deprecated lifecycle aliases, proved `GODOT_MCP_TOOLSETS=core,scene` exposed 66 tools while hiding playtest/assets/live resources, proved `GODOT_MCP_TOOLS=script_patch,validate_scene` exposed 14 tools, proved a disposable `.godot-mcp/toolsets.json` named profile exposed 95 tools including `filesystem_search`, and restored the temporary project profile file. Startup checks left exactly one `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor PID established to it; direct Codex MCP namespace callability still requires MCP connector reload because the namespace call returned `Transport closed` before implementation.

### 5.1 Add Configuration

- [x] Add MCP config for:
  - live bridge enabled/disabled
  - host
  - port
  - shared secret
  - allowed project paths
  - eval enabled/disabled
  - log retention
  - screenshot output directory
  - stale session timeout
- [x] Add per-project `.godot-mcp/config.json`.
- [x] Add config validation.
- [x] Add `live_config_status`.

Acceptance:

- [x] Bad config fails with clear remediation.
- [x] Default config is local-only and eval-disabled.

Verification note, 2026-06-10: Phase 5.1 added `docs/superpowers/plans/2026-06-10-phase-5-1-configuration.md`, focused RED/GREEN coverage in `tests/live-config.test.mjs`, the config loader/validator in `src/live/config.ts`, read-only `live_config_status` in `src/tools/live-config.ts`, live transport allowlist/secret/config wiring in `src/live/transport.ts` and `src/index.ts`, configurable stale session timeout in `src/live/session-manager.ts`, README/workflow docs updates, and `test_mcp_enhancements/phase51_live_proof.mjs`. RED first failed with missing `build/live/config.js`; focused `npm run build && node --test tests/live-config.test.mjs` passed 5/5, final `npm test` passed 157/157, and Godot headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 5.1 proof script listed 344 default tools and 353 default resources, verified `live_config_status`, proved safe defaults (`127.0.0.1:6010`, eval disabled), proved bad config remediation with redacted secrets, proved disposable `.godot-mcp/config.json` project overlay behavior, and restored the temporary config artifact.

### 5.2 Add Addon Installer And Updater

- [x] Add `live_addon_install`.
- [x] Add `live_addon_update`.
- [x] Add `live_addon_remove`.
- [x] Add `live_addon_status`.
- [x] Add `live_addon_enable`.
- [x] Add `live_addon_disable`.
- [x] Add compatibility check for Godot 4.6.

Acceptance:

- [x] Codex can install the live addon into `test_mcp_enhancements`.
- [x] The user can enable it in the editor and MCP sees the session.

Verification note, 2026-06-10: Phase 5.2 added `docs/superpowers/plans/2026-06-10-phase-5-2-live-addon-installer.md`, focused RED/GREEN coverage in `tests/live-addon-installer.test.mjs`, bundled addon packaging in `scripts/build.js`, modular tooling in `src/tools/live-addon-installer.ts`, registration in `src/index.ts`, README count/tool/resource updates, and `test_mcp_enhancements/phase52_live_proof.mjs`. RED first failed with missing `build/tools/live-addon-installer.js`; focused `npm run build && node --test tests/live-addon-installer.test.mjs` passed 4/4, final `npm test` passed 161/161, and Godot headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. The Phase 5.2 proof script listed 350 tools and 359 resources, found all 6 new `live_addon_*` tools, proved `live_addon_status`, dry-run install/remove/enable/disable, and a real `live_addon_update` against `test_mcp_enhancements` while preserving the enabled addon state. Startup checks left exactly one `build/index.js` listener on `127.0.0.1:6010` with the open Godot editor PID established to it; direct Codex MCP namespace callability still requires connector reload because `mcp__godot_mcp.session_list` and `editor_state` returned `Transport closed` before implementation.

### 5.3 Add Documentation

- [x] Update `README.md` with:
  - Live bridge overview
  - Install steps
  - Security model
  - Tool list
  - Resource list
  - Common workflows
  - Troubleshooting
- [x] Add `docs/live-bridge-protocol.md`.
- [x] Add `docs/live-bridge-security.md`.
- [x] Add `docs/autonomous-workflows.md`.
- [x] Add `docs/tooling-adapters.md`.
- [x] Update MCP resource catalog generation if counts are documented manually.
- [x] Update `package.json` repository metadata from the old upstream repo to the correct repo.

Acceptance:

- [x] A fresh user can install the MCP, install the addon, enable it, and run `editor_state`.

Verification note, 2026-06-10: Phase 5.3 added `docs/superpowers/plans/2026-06-10-phase-5-3-documentation.md`, focused RED/GREEN docs contract coverage in `tests/phase-5-3-docs.test.mjs`, live bridge protocol/security docs in `docs/live-bridge-protocol.md` and `docs/live-bridge-security.md`, tooling adapter docs in `docs/tooling-adapters.md`, fresh-user workflow updates in `docs/autonomous-workflows.md`, README install/security/workflow/troubleshooting updates, `test_mcp_enhancements/phase53_live_proof.mjs`, and canonical repository metadata in `package.json`. RED first failed because README/package still pointed to the old upstream repo, dedicated docs were missing, and the fresh-user live bridge path was not documented. Focused `npm run build && node --test tests/phase-5-3-docs.test.mjs` passed 3/3, final `npm test` passed 164/164, and the Phase 5.3 proof script listed 350 tools and 359 resources while proving `live_config_status`, `live_addon_status`, and `toolset_status` against `test_mcp_enhancements`. Godot headless editor smoke against `test_mcp_enhancements` exited 0 and the smoke log had 0 `SCRIPT ERROR`/`ERROR:` matches; Godot emitted the pre-existing nested-project warning for `res://test/tier2_projects/blank_test` and an ObjectDB leak warning at exit. README/package/docs now point to `https://github.com/brett03112/godot-mcp`.

### 5.4 Add Verification Harness

- [x] Add disposable fixture project or use `test_mcp_enhancements`.
- [x] Add an automated smoke script for non-live tools.
- [x] Add a semi-live smoke checklist for the open editor.
- [x] Add tests for session manager behavior.
- [x] Add tests for protocol encoding/decoding.
- [x] Add tests for stale session cleanup.
- [x] Add tests for project-path mismatch rejection.
- [x] Add tests for disabled eval refusal.
- [x] Add manual verification notes template.

Acceptance:

- [x] `npm run build` passes.
- [x] Existing tests pass.
- [x] Non-live smoke passes headlessly.
- [x] Live smoke proves an actual editor session is connected.

Verification note, 2026-06-10: Phase 5.4 added `docs/superpowers/plans/2026-06-10-phase-5-4-verification-harness.md`, focused RED/GREEN harness coverage in `tests/phase-5-4-verification-harness.test.mjs`, `stringifyLiveProtocolMessage()` in `src/live/protocol.ts`, package smoke scripts `smoke:non-live` and `smoke:live`, the automated non-live harness `scripts/smoke-non-live.mjs`, the semi-live open-editor socket harness `scripts/smoke-live-editor.mjs`, and `docs/templates/manual-verification-note.md`. RED first failed because `build/live/protocol.js` did not export `stringifyLiveProtocolMessage`; after implementation, focused `npm run build && node --test tests/phase-5-4-verification-harness.test.mjs` passed 6/6. Final `npm test` passed 170/170. `npm run smoke:non-live` passed with 350 tools exposed and real calls to `project_settings_get`, `filesystem_search`, `validate_scene`, and `toolset_status` against `test_mcp_enhancements`. `npm run smoke:live` passed with exactly one `127.0.0.1:6010` listener owned by `godot-mcp/build/index.js` PID 27076 and an established open Godot editor connection from PID 20008 local port 56628. Godot headless editor smoke against `test_mcp_enhancements` exited 0, and `phase54_headless_editor.log` had 0 `SCRIPT ERROR`/`ERROR:` matches; Godot emitted the pre-existing nested-project warning for `res://test/tier2_projects/blank_test` and an ObjectDB shutdown warning. Direct Codex MCP tool namespace calls to `session_list` and `live_config_status` returned `Transport closed` after this implementation, so the Codex-managed MCP connector needs reload before post-reload callable proof of Phase 5.4 services.

Post-reload verification update, 2026-06-10: After Codex reload, the callable MCP connector initially reported 0 sessions because stale listener PID 27076 still owned `127.0.0.1:6010`; stopping that stale listener let the callable connector PID 22684 bind the live transport and the open Godot editor PID 20008 reconnected on local port 52912. Direct MCP calls then succeeded for `session_list` with 1 connected `test_mcp_enhancements` editor session, `editor_state` with active scene `res://test_animation_with_anim.tscn`, `live_config_status`, `live_addon_status`, and `toolset_status` with 350 loaded tools. Fresh `npm run smoke:live` passed with listener PID 22684 and Godot PID 20008, and fresh `npm run smoke:non-live` passed with real calls to `project_settings_get`, `filesystem_search`, `validate_scene`, and `toolset_status`.

### 5.5 Add Release And Compatibility Policy

- [x] Define supported Godot versions.
- [x] Define live addon protocol versioning.
- [x] Add compatibility negotiation between addon and MCP server.
- [x] Add migration notes for protocol changes.
- [x] Add changelog entries for new tools.

Acceptance:

- [x] A version mismatch returns a clear message instead of failing mysteriously.

Verification note, 2026-06-10: Phase 5.5 added `docs/superpowers/plans/2026-06-10-phase-5-5-release-compatibility-policy.md`, focused RED/GREEN coverage in `tests/phase-5-5-release-compatibility.test.mjs`, live protocol constants and compatibility checks in `src/live/protocol.ts`, handshake rejection in `src/live/transport.ts`, session compatibility serialization in `src/live/session-manager.ts` and `src/tools/live-editor.ts`, addon hello fields in `test_mcp_enhancements/addons/godot_mcp_live/session_state.gd`, release policy docs in `docs/live-bridge-release-policy.md`, protocol/README updates, and `CHANGELOG.md`. RED first failed with missing `LIVE_ADDON_VERSION` export from `build/live/protocol.js`; focused `npm run build && node --test tests/phase-5-5-release-compatibility.test.mjs` passed 4/4, final `npm test` passed 174/174, `npm run smoke:non-live` passed with 350 tools, and `npm run smoke:live` passed with listener PID 22684 and Godot PID 20008. Godot headless editor smoke against `test_mcp_enhancements` exited 0 and `phase55_headless_editor.log` had 0 `SCRIPT ERROR`/`ERROR:` matches; Godot emitted the pre-existing nested-project and ObjectDB shutdown warnings. `git diff --check` exited 0 with Git CRLF warnings only. Direct Codex MCP namespace calls to `session_list`, `editor_state`, and `live_addon_status` returned `Transport closed`, so post-reload Phase 5.5 callable proof requires reloading the Codex MCP connector and reloading or re-enabling the Godot MCP Live addon so the new `protocol_version`/`addon_version` hello fields are active.

## Phase 6 - Split The Non-Live Godot Operations Runner

Goal: Reduce the editor, review, and LLM context cost of the 12k-line `src/scripts/godot_operations.gd` file without changing the public MCP tool surface, operation names, parameter shapes, or JSON result contracts.

### 6.A Add A Modular Runner And Move Low-Risk Operation Families

- [x] Keep `src/scripts/godot_operations.gd` as the stable CLI entrypoint for `godot --headless --script`.
- [x] Move argument parsing, JSON decoding, error reporting, and final `quit()` behavior into a small runner flow.
- [x] Add a `src/scripts/godot_ops/` module folder.
- [x] Add shared operation infrastructure:
  - `operation_context.gd` for logging, JSON output, path conversion, scene load/save helpers, resource save helpers, and common value parsers.
  - `operation_registry.gd` for mapping operation names to module handlers.
- [x] Update `scripts/build.js` to copy the whole `src/scripts` tree, not only `godot_operations.gd`, so module paths work from `build/scripts`.
- [x] Move the smallest recent family first:
  - `asset_batch_reimport`
  - `_asset_pipeline_to_res_path`
- [x] Move one medium cohesive family next, preferably camera or audio player workflow.
- [x] Replace source-grep tests that assume handlers live in `godot_operations.gd` with tests that prove operation names are registered and callable through the runner.
- [x] Preserve backwards compatibility for `src/index.ts` execution:
  - Same `operationsScriptPath`.
  - Same operation name strings.
  - Same stdout JSON payload shape.
  - Same stderr sanitization assumptions.
- [x] Add focused tests for:
  - runner rejects unknown operations with the existing failure shape
  - registry exposes moved operation names
  - build output contains `build/scripts/godot_operations.gd` and `build/scripts/godot_ops/**`
  - moved asset pipeline operation still runs through `ctx.executeOperation`

Acceptance:

- [x] `godot_operations.gd` becomes a small runner/dispatcher instead of an implementation monolith.
- [x] At least two operation families are loaded from `src/scripts/godot_ops/`.
- [x] Existing TypeScript tools call the same operation names without code changes outside build/test plumbing.
- [x] `npm run build` copies all required GDScript modules.
- [x] `npm test` passes.
- [x] `npm run smoke:non-live` passes against `test_mcp_enhancements`.
- [x] A direct Godot headless operation smoke proves a moved operation works from `build/scripts`.
- [x] `git diff --check` exits 0.

Verification note, 2026-06-10: Phase 6.A added `docs/superpowers/plans/2026-06-10-phase-6-a-modular-godot-ops-runner.md`, split `src/scripts/godot_operations.gd` into a 43-line stable runner, added `src/scripts/godot_ops/operation_context.gd`, `operation_registry.gd`, `asset_pipeline_ops.gd`, `camera_ops.gd`, and `legacy_operations.gd`, and updated `scripts/build.js` to copy the full `src/scripts` tree into `build/scripts`. Focused RED first failed because the runner was still 12,348 lines and `godot_ops` modules were missing; after implementation, focused `npm run build && node --test tests/asset-pipeline.test.mjs tests/camera-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs` passed 14/14. Final `npm test` passed 178/178, and `npm run smoke:non-live` passed with 350 tools. Direct Godot headless smokes against `test_mcp_enhancements` through `build/scripts/godot_operations.gd` proved moved `asset_batch_reimport` returned success JSON for `res://icon.svg` and moved camera routing returned success JSON for `camera_list` on `res://tier1_test_scene.tscn`. The unknown-operation path still logs `[ERROR] Unknown operation: ...`; Godot 4.6.3 reports process exit `0` for that headless `--script` failure path, so compatibility is asserted on the existing log/error shape. Startup/live facts before implementation were one listener on `127.0.0.1:6010` owned by PID 5144 and one established Godot editor socket from PID 16400; direct Codex `session_list` returned `Transport closed`, so post-reload live namespace callability still requires Codex MCP connector reload plus Godot MCP Live addon/editor reload.

### 6.B Migrate The Remaining Operation Families Incrementally

Status, 2026-06-13: Phase 6.B final pass is complete, locally verified, and direct Codex MCP verified after reload. Overall Phase 6.B acceptance is complete.

- [x] Move one cohesive operation family per pass, with focused tests and a smoke proof after each pass.
- [x] Prefer this migration order:
  - [x] design-to-scene operations
  - [x] gameplay system operations
  - [x] UI/theme workflow operations
  - [x] node refactor workflow operations
  - [x] resource workflow operations
  - [x] physics operations
  - [x] navigation operations
  - [x] visual QA operations
  - [x] signal operations
  - [x] script intelligence and script mutation operations
  - [x] audio-player workflow operations
  - [x] shader/material operations
  - [x] TileMap, mesh, and older scene operations
- [ ] Keep shared helpers in `operation_context.gd` only when multiple modules truly use them.
- [x] Keep family-specific helpers next to their family module.
- [x] Avoid adding new tool behavior during the migration unless a moved operation exposes an existing bug.
- [x] Add a lightweight operation registry audit test that compares expected non-live operation names against registered handlers.
- [x] Update safer-planning risk detection so changes under `src/scripts/godot_ops/**` trigger the same Godot operation verification guidance as changes to `src/scripts/godot_operations.gd`.
- [x] Update docs and verification templates to mention the modular script tree.
- [ ] Consider deleting or shrinking any tests that only assert implementation placement once registry/callability tests cover the behavior.

Pass 1 acceptance, design-to-scene family:

- [x] `design_generate_scene_from_brief` and related design-to-scene operations are registered from `src/scripts/godot_ops/design_to_scene_ops.gd`.
- [x] Design-to-scene dispatch cases are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] A direct Godot headless smoke proved a moved design operation works from `build/scripts`.
- [x] Post-reload live MCP proof passed for the moved Phase 6.B tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 2 acceptance, gameplay system family:

- [x] `gameplay_create_state_machine` and related gameplay system operations are registered from `src/scripts/godot_ops/gameplay_ops.gd`.
- [x] Gameplay dispatch cases are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B gameplay migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] A direct Godot headless smoke proved a moved gameplay operation works from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Post-reload live MCP callable proof passed for the moved Phase 6.B pass 2 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 3 acceptance, UI/theme workflow family:

- [x] `ui_create_layout` and related UI/theme workflow operations are registered from `src/scripts/godot_ops/ui_theme_ops.gd`.
- [x] UI/theme dispatch cases are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B UI/theme migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] A direct Godot headless smoke proved a moved UI/theme operation works from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Post-reload live MCP callable proof passed for the moved Phase 6.B pass 3 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 4 acceptance, node refactor workflow family:

- [x] `node_find` and related node refactor workflow operations are registered from `src/scripts/godot_ops/node_refactor_ops.gd`.
- [x] Node refactor dispatch cases are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B node refactor migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] A direct Godot headless smoke proved a moved node refactor operation works from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 4 tools.
- [x] Post-reload Codex MCP callable proof passed for the moved Phase 6.B pass 4 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 5 acceptance, resource workflow family:

- [x] `resource_create_curve` and related resource workflow operations are registered from `src/scripts/godot_ops/resource_workflow_ops.gd`.
- [x] Resource workflow dispatch cases and implementation functions are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B resource workflow migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] A direct Godot headless smoke proved a moved resource workflow operation works from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 5 tools.
- [x] Post-reload Codex MCP callable proof passed for the moved Phase 6.B pass 5 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 6 acceptance, physics family:

- [x] `configure_physics_material` and related physics operations are registered from `src/scripts/godot_ops/physics_ops.gd`.
- [x] Physics dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B physics migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] A direct Godot headless smoke proved a moved physics operation works from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 6 tools.
- [x] Post-reload Codex MCP callable proof passed for the moved Phase 6.B pass 6 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 7 acceptance, navigation family:

- [x] `generate_navmesh` and related navigation operations are registered from `src/scripts/godot_ops/navigation_ops.gd`.
- [x] Navigation dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B navigation migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] A direct Godot headless smoke proved a moved navigation operation works from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 7 tools.
- [x] Post-reload Codex MCP callable proof passed for the moved Phase 6.B pass 7 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 8 acceptance, visual QA family:

- [x] `sprite_bounds_check` and related visual QA operations are registered from `src/scripts/godot_ops/visual_qa_ops.gd`.
- [x] Visual QA dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B visual QA migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] Direct Godot headless smokes proved moved visual QA operations work from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 8 tools.
- [x] Post-reload Codex MCP callable proof passed for the moved Phase 6.B pass 8 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 9 acceptance, signal family:

- [x] `list_signals` and related signal operations are registered from `src/scripts/godot_ops/signal_ops.gd`.
- [x] Signal dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B signal migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] A direct Godot headless smoke proved a moved signal operation works from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 9 tools.
- [x] Post-reload Codex MCP callable proof passed for the moved Phase 6.B pass 9 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 10 acceptance, animation family:

- [x] `create_animation_player`, `add_animation_track`, `add_keyframe`, `configure_animation_tree`, and `create_animation_library` are registered from `src/scripts/godot_ops/animation_ops.gd`.
- [x] Animation dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B animation migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] Direct Godot headless smoke proved all five moved animation operations work from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with only known warnings and no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 10 tools.
- [x] Post-reload Codex MCP callable proof passed for the moved Phase 6.B pass 10 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 11 acceptance, script intelligence and mutation family:

- [x] `analyze_script`, `create_script`, `modify_function`, `add_export_variable`, `extract_dependencies`, and `attach_script` are registered from `src/scripts/godot_ops/script_ops.gd`.
- [x] Script dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B script migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] Direct Godot headless smoke proved all six moved script operations work from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 11 tools.
- [x] Post-reload Codex MCP callable proof passed for the moved Phase 6.B pass 11 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 12 acceptance, camera workflow family:

- [x] `create_camera`, `configure_camera`, `setup_camera_follow_2d`, `set_camera_limits_2d`, `set_camera_smoothing_2d`, `apply_camera_preset`, `list_cameras`, and `preview_camera_bounds` are registered from `src/scripts/godot_ops/camera_ops.gd`.
- [x] Camera dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B camera migration tests pass.
- [x] The offline `make_current` guard prevents detached Camera2D edits from emitting Godot errors.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] Direct Godot headless smoke proved all eight moved camera operations work from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 12 tools.
- [x] Direct Codex MCP callable proof passed for the moved Phase 6.B pass 12 tools and representative live/non-live services.
- [x] `git diff --check` exits 0.

Pass 13 acceptance, audio-player workflow family:

- [x] `audio_player_create`, `audio_player_set_stream`, `audio_player_configure`, `audio_player_play`, `audio_player_stop`, `audio_player_list`, and `audio_player_validate_routes` are registered from `src/scripts/godot_ops/audio_player_ops.gd`.
- [x] Audio-player dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B audio-player migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] Direct Godot headless smoke proved all seven moved audio-player operations work from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 13 tools.
- [x] Direct Codex MCP callable proof passed for the moved Phase 6.B pass 13 tools and representative live/non-live services after Codex reload.
- [x] `git diff --check` exits 0.

Pass 14 acceptance, shader/material family:

- [x] `create_shader_material`, `apply_material`, and `set_shader_parameter` are registered from `src/scripts/godot_ops/shader_ops.gd`.
- [x] Shader/material dispatch cases and implementation helpers are removed from `src/scripts/godot_ops/legacy_operations.gd`.
- [x] Focused Phase 6.B shader/material migration tests pass.
- [x] `npm test` passed for this pass.
- [x] `npm run smoke:non-live` passed for this pass.
- [x] Direct Godot headless smoke proved all three moved shader/material operations work from `build/scripts`.
- [x] A headless Godot editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches.
- [x] Live socket smoke passed for the open editor connection.
- [x] Fresh local stdio MCP callable proof passed for the moved Phase 6.B pass 14 tools.
- [x] Direct Codex MCP callable proof passed for the moved Phase 6.B pass 14 tools and representative live/non-live services after Codex reload.
- [x] `git diff --check` exits 0.

Overall Phase 6.B acceptance, all remaining operation families:

- [x] No operation implementation families remain in the runner file.
- [x] `godot_operations.gd` is small enough to inspect comfortably in Godot and LLM contexts.
- [x] Each module has a clear operation family boundary and can be reviewed independently.
- [x] All non-live operations remain compatible with existing MCP clients.
- [x] `npm test` passes.
- [x] `npm run smoke:non-live` passes.
- [x] A headless Godot smoke against `test_mcp_enhancements` exits 0 with no `SCRIPT ERROR`/`ERROR:` matches except documented pre-existing Godot shutdown warnings.
- [x] Live bridge smoke still passes, proving the cleanup did not disturb the live addon/tooling path.

Verification note, 2026-06-13: Phase 6.B final pass moved the remaining legacy operation families into focused modules under `src/scripts/godot_ops/`: `scene_core_ops.gd`, `mesh_library_ops.gd`, `resource_maintenance_ops.gd`, `test_suite_ops.gd`, `tilemap_ops.gd`, `particle_ops.gd`, `introspection_ops.gd`, `audio_bus_ops.gd`, and `multiplayer_ops.gd`. `legacy_operations.gd` now keeps compatibility helpers only, and `src/scripts/godot_operations.gd` remains a small delegating runner. Direct Godot smoke caught cleanup leaks in `create_tilemap` and `export_mesh_library`; focused regression tests now cover those paths. Focused `node --test tests\phase-6-b-modular-migration.test.mjs` passed 74/74, `npm test` passed 252/252, `npm run smoke:non-live` passed with 350 tools, direct Godot final-pass smoke passed representative moved operations with no `SCRIPT ERROR`/`ERROR:` matches, headless editor smoke against `test_mcp_enhancements` passed with 0 matches, and `npm run smoke:live` passed with listener PID 20808 and Godot editor PID 3792. Direct Codex MCP namespace proof initially required a Codex reload; post-reload callable proof completed below.

Post-reload note, 2026-06-13: After Codex reload, stale listener PID 20808 was stopped and the reloaded MCP listener bound `127.0.0.1:6010` as PID 8476. `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, writable editor state, and editor PID 3792. Callable proof passed for `session_list`, `toolset_status`, `editor_state`, `live_addon_status`, and moved Phase 6.B final-pass tools `create_scene`, `add_node`, `load_sprite`, `modify_node_property`, `duplicate_node`, `reparent_node`, `remove_node`, `save_scene`, `get_uid`, `get_class_info`, `create_tilemap`, `paint_tiles`, `configure_tileset`, `create_particle_system`, `apply_particle_preset`, `create_test_suite`, `configure_audio_bus`, `export_mesh_library`, `setup_multiplayer_peer`, `configure_rpc`, and `manage_multiplayer_spawner`. Post-reload proof caught and fixed a Godot 4.6 incompatibility where `manage_multiplayer_spawner` assigned unsupported `MultiplayerSpawner.replication_interval`; focused regression coverage now guards the property before setting it. It also caught and fixed `update_project_uids` passing the absolute project path into `resave_resources`; focused regression coverage now keeps that operation scanning the active Godot project root. `update_project_uids` was then proved against a temporary copy of `test_mcp_enhancements`, scanning 57 scenes without touching the real fixture. After the second Codex reload, direct namespace proof used the final `src/index.ts` fix: listener PID 10812 connected to Godot editor PID 3792, `session_list`, `toolset_status`, `editor_state`, and `live_addon_status` passed, `update_project_uids` scanned 57 scenes in a temporary project copy, and `manage_multiplayer_spawner` passed with `replication_interval: 0.1`; temporary proof scene and project copy were removed afterward.

Verification note, 2026-06-11: Phase 6.B pass 1 added `docs/superpowers/plans/2026-06-11-phase-6-b-incremental-godot-ops-migration.md`, focused RED/GREEN coverage in `tests/phase-6-b-modular-migration.test.mjs`, and moved the design-to-scene operation family from the legacy fallback into `src/scripts/godot_ops/design_to_scene_ops.gd`. `src/scripts/godot_ops/operation_registry.gd` now registers the ten `design_*` operation names before the legacy fallback, while `legacy_operations.gd` keeps only minimal shared generation helpers still used by the remaining gameplay fallback code. `tests/design-to-scene.test.mjs` now proves the new module/registry boundary, `src/tools/safer-planning.ts` treats `src/scripts/godot_ops/**` edits as Godot operation handler risk, and `README.md` plus `docs/templates/manual-verification-note.md` mention the modular script tree. RED first failed with the missing design module/registry/docs/risk coverage; focused `npm run build && node --test tests/design-to-scene.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs tests/safer-planning.test.mjs` passed 23/23. Final `npm test` passed 184/184, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd design_generate_hud` returned success JSON with `dry_run: true`, and headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches. Startup checks found the open Godot editor PID 20720, cleaned duplicate stale `node build/index.js` processes down to one PID 18228, but direct Codex MCP `session_list` still returned `Transport closed`; post-reload callable live proof required Codex MCP connector reload plus Godot MCP Live addon/editor reload.

Post-reload pass note, 2026-06-11: Phase 6.B pass 1 PASSED after the Godot editor and Codex were reloaded. Startup proof found exactly one current MCP listener on `127.0.0.1:6010` owned by `C:\Users\brett\Desktop\godot-mcp\build\index.js`, an established Godot socket, and Godot-owned DAP/LSP listeners on ports `6006` and `6005`. MCP live proof reported one connected `Test_MCP_Enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and 350 loaded tools. Callable proof passed for `session_list`, `live_config_status`, moved Phase 6.B tools `generate_hud` and `generate_scene_from_brief`, live editor tools `editor_state`, `scene_current`, `editor_open_resource`, and non-live status/validation tools `toolset_status`, `project_settings_get`, `filesystem_search`, and `validate_scene`. A final `npm run smoke:non-live` also passed with 350 tools.

Verification note, 2026-06-11: Phase 6.B pass 2 moved the gameplay system operation family from the legacy fallback into `src/scripts/godot_ops/gameplay_ops.gd`, registered the nine `gameplay_*` operation names from `src/scripts/godot_ops/operation_registry.gd`, and kept gameplay-specific helpers with the new module. `legacy_operations.gd` no longer dispatches gameplay operations. RED first failed with the missing gameplay module, missing registry preload, legacy dispatch cases, and missing build output; a second focused RED caught the moved module's dependency on the legacy `_load_scene_for_edit()` helper before adding a compatibility wrapper. Focused `npm run build; node --test tests/gameplay-systems.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 17/17. Final `npm test` passed 188/188, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd gameplay_create_state_machine` returned success JSON with `dry_run: true` and 0 `SCRIPT ERROR`/`ERROR:` log matches, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches, `npm run smoke:live` passed with listener PID 8172 and connected Godot editor PID 22368, and `git diff --check` exited 0 with CRLF warnings only. Startup checks after reload found one stale listener and one stale duplicate process; after cleanup, a fresh stdio MCP proof against `build/index.js` listed 350 tools, reconnected one `test_mcp_enhancements` live session, and passed callable proof for `session_list`, `live_config_status`, moved gameplay tools `create_state_machine` and `generate_inventory_system`, live editor tools `editor_state`, `scene_current`, `editor_open_resource`, and non-live services `toolset_status`, `project_settings_get`, `filesystem_search`, and `validate_scene`. The Codex-provided `mcp__godot_mcp` namespace itself still returned `Transport closed`, so the successful proof used a fresh local stdio MCP client and closed it afterward.

Post-Codex-reload note, 2026-06-11: Codex MCP calls are now working. Live proof passed for `session_list`, `editor_state`, `live_config_status`, `create_state_machine`, `generate_inventory_system`, and `add_state`. Reload proof found one root-path bug where gameplay helper script paths could become `res:///...`; `src/scripts/godot_ops/gameplay_ops.gd` now joins resource paths without the extra slash, and focused Phase 6.B migration tests passed 10/10 after rebuild.

Verification note, 2026-06-11: Phase 6.B pass 3 moved the UI/theme workflow operation family from the legacy fallback into `src/scripts/godot_ops/ui_theme_ops.gd`, registered the fourteen `ui_*` operation names from `src/scripts/godot_ops/operation_registry.gd`, and kept UI-specific layout/theme helpers with the new module. `legacy_operations.gd` no longer dispatches UI/theme operations and now exposes only the shared compatibility wrappers the module needs. RED first failed with the missing UI/theme module, missing registry preload, legacy dispatch cases, and missing build output; direct Godot smoke then caught missing shared wrappers for `_ensure_resource_dir()` and `_make_unique_child_name()` before the compatibility wrappers were added. Focused `npm run build; node --test tests/ui-theme-workflow.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 19/19. Final `npm test` passed 192/192, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd ui_create_layout` returned success JSON for `res://phase6b_pass3_ui_smoke.tscn` with 0 `SCRIPT ERROR`/`ERROR:` log matches, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches, `npm run smoke:live` passed with listener PID 7380 and connected Godot editor PID 20720, and `git diff --check` exited 0 with CRLF warnings only. A fresh local stdio MCP proof listed 350 tools and successfully called `create_ui_layout`, `inspect_ui_layout`, and `toolset_status`; the temporary smoke scenes were removed afterward. The Codex-provided `mcp__godot_mcp` namespace returned `Transport closed` before implementation, so post-reload proof still requires reloading Codex, then calling `session_list` plus moved UI/theme tools from the Codex namespace.

Post-reload note, 2026-06-11: After Codex reload, direct Codex MCP calls were callable. Startup proof found the previous listener PID 7380 stale for the reloaded connector, stopped it, and confirmed a new listener PID 16936 with an established Godot editor socket from PID 20720. `session_list` then reported one connected `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and compatibility passing. Callable proof passed for `session_list`, `editor_state`, `toolset_status`, `live_addon_status`, and moved Phase 6.B pass 3 UI/theme tools `create_ui_layout`, `inspect_ui_layout`, and `validate_ui_safe_area`; the temporary Codex smoke scene was removed afterward.

Verification note, 2026-06-11: Phase 6.B pass 4 moved the node refactor workflow operation family from the legacy fallback into `src/scripts/godot_ops/node_refactor_ops.gd`, registered the nine node refactor operation names from `src/scripts/godot_ops/operation_registry.gd`, and kept node search, mutation, reference, dependency, and summary helpers with the new module. RED first failed with the missing node refactor module, missing registry preload, legacy dispatch cases, and missing build output. Focused `npm run build; node --test tests/node-refactor-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 26/26. Final `npm test` passed 196/196, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd node_find` returned success JSON with one `TestSprite` match and 0 `SCRIPT ERROR`/`ERROR:` log matches, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches, `npm run smoke:live` passed with listener PID 16936 and connected Godot editor PID 20720, and `git diff --check` exited 0 with CRLF warnings only. A fresh local stdio MCP proof listed 350 tools and successfully called `node_find`, `scene_find_references`, and `toolset_status`. Direct Codex MCP namespace calls returned `Transport closed` before implementation, so post-reload proof still requires reloading Codex, then calling `session_list` plus moved node refactor tools from the Codex namespace.

Post-reload note, 2026-06-11: After Codex reload, startup recovery found the old listener PID 16936 blocking the reloaded Codex MCP process PID 10860. The old listener was stopped, PID 10860 bound `127.0.0.1:6010`, and the open Godot editor PID 20720 reconnected from local port 57550. `session_list` then reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. Callable proof passed for `session_list`, `editor_state`, `toolset_status`, `live_addon_status`, and moved Phase 6.B pass 4 node refactor tools `node_find` and `scene_find_references`.

Verification note, 2026-06-11: Phase 6.B pass 5 moved the resource workflow operation family from the legacy fallback into `src/scripts/godot_ops/resource_workflow_ops.gd`, registered the nine `resource_*` operation names from `src/scripts/godot_ops/operation_registry.gd`, and kept resource-specific Curve, Gradient, assignment, conversion, and autofit helpers with the new module. The old resource workflow dispatch cases and implementation functions were removed from `legacy_operations.gd`. RED first failed with the missing resource workflow module, missing registry preload, legacy dispatch cases, and missing build output. Focused `npm run build; node --test tests/resource-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 30/30. Final `npm test` passed 200/200, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd resource_create_curve` returned success JSON for `res://resources/mcp_phase6b_pass5_curve.tres` with 0 `SCRIPT ERROR`/`ERROR:` matches, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 10860 and connected Godot editor PID 20720. A fresh local stdio MCP proof listed 350 tools and successfully called `create_curve_resource`, `set_curve_points`, `resource_convert_format`, and `toolset_status`. `git diff --check` exited 0 with CRLF warnings only. Direct Codex MCP namespace calls returned `Transport closed` before implementation, so post-reload proof still requires reloading Codex, then calling `session_list` plus moved resource workflow tools from the Codex namespace.

Post-reload note, 2026-06-11: After Codex reload, startup recovery found one non-listening stale `godot-mcp` node process and stopped it. The first `session_list` call started the live transport, a retry reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, writable editor state, and editor PID 14904. Callable proof passed for `session_list`, `editor_state`, `toolset_status`, `live_addon_status`, and moved Phase 6.B pass 5 resource workflow tools `create_curve_resource`, `set_curve_points`, and `resource_convert_format`; temporary `mcp_phase6b_pass5_codex_curve` resources were removed afterward.

Verification note, 2026-06-11: Phase 6.B pass 6 moved the physics operation family from the legacy fallback into `src/scripts/godot_ops/physics_ops.gd`, registered `configure_physics_material`, `set_collision_config`, `create_physics_body`, `manage_collision_shape`, and `setup_joint` from `src/scripts/godot_ops/operation_registry.gd`, and kept physics-specific collision shape/body/joint helpers with the new module. The old physics dispatch cases and implementation helpers were removed from `legacy_operations.gd`. RED first failed with the missing physics module, missing registry preload, legacy dispatch cases, and missing build output. Focused `npm run build; node --test tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 30/30. Final `npm test` passed 204/204, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd create_physics_body` returned success JSON for `McpPhase6BPhysics` with a `CollisionShape`, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 14244 and connected Godot editor PID 14904. A fresh local stdio MCP proof listed 350 tools and successfully called `configure_physics_material`, `create_physics_body`, `set_collision_config`, `manage_collision_shape`, `setup_joint`, `validate_scene`, and `toolset_status` against temporary pass 6 files that were removed afterward. `git diff --check` exited 0 with CRLF warnings only. Direct Codex MCP namespace proof returned `Transport closed`, so post-reload proof requires reloading Codex, then calling `session_list` plus moved physics tools from the Codex namespace.

Post-reload note, 2026-06-11: After Codex reload, startup recovery found old listener PID 14244 still owning `127.0.0.1:6010` and the reloaded Codex MCP process PID 25112 not listening. PID 14244 was stopped, PID 25112 bound `127.0.0.1:6010`, and the open Godot editor PID 14904 reconnected from local port 56593. `session_list` then reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. Callable proof passed for `session_list`, `editor_state`, `live_config_status`, `toolset_status`, `live_addon_status`, moved Phase 6.B pass 6 physics tools `configure_physics_material`, `create_physics_body`, `set_collision_config`, `manage_collision_shape`, and `setup_joint`, plus `validate_scene`; temporary `mcp_phase6b_pass6_codex` scene/resource files were removed afterward.

Verification note, 2026-06-11: Phase 6.B pass 7 moved the navigation operation family from the legacy fallback into `src/scripts/godot_ops/navigation_ops.gd`, registered `generate_navmesh`, `add_navigation_agent`, `add_navigation_link`, `configure_navigation_obstacle`, `create_astar_grid`, and `setup_navigation_server` from `src/scripts/godot_ops/operation_registry.gd`, and kept navigation-specific AStar and metadata helpers with the new module. The old navigation dispatch cases and implementation helpers were removed from `legacy_operations.gd`. RED first failed with the missing navigation module, missing registry preload, legacy dispatch cases, and missing build output. Focused `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs` passed 30/30, and `node --test tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 34/34. Final `npm test` passed 208/208, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd create_astar_grid` returned success JSON for `res://resources/mcp_phase6b_pass7_astar.tres`, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 25112 and connected Godot editor PID 21400. A fresh local stdio MCP proof listed 350 tools and successfully called `generate_navmesh`, `add_navigation_agent`, `add_navigation_link`, `configure_navigation_obstacle`, `create_astar_grid`, `setup_navigation_server`, `validate_scene`, and `toolset_status` against temporary pass 7 files that were removed afterward. `git diff --check` exited 0 with CRLF warnings only. Direct Codex MCP namespace proof returned `Transport closed`, so post-reload proof requires reloading Codex, then calling `session_list` plus moved navigation tools from the Codex namespace.

Post-reload note, 2026-06-11: After Codex reload, startup recovery found old listener PID 25112 still owning `127.0.0.1:6010` while the reloaded Codex MCP process PID 21384 was not listening. PID 25112 was stopped, PID 21384 bound `127.0.0.1:6010`, and the open Godot editor PID 21400 reconnected from local port 52256. `session_list` then reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. Callable proof passed for `session_list`, `editor_state`, `toolset_status`, `live_addon_status`, moved Phase 6.B pass 7 navigation tools `generate_navmesh`, `add_navigation_agent`, `add_navigation_link`, `configure_navigation_obstacle`, `create_astar_grid`, and `setup_navigation_server`, plus `validate_scene`; temporary `mcp_phase6b_pass7_codex` scene/resource files were removed afterward.

Verification note, 2026-06-11: Phase 6.B pass 8 moved the visual QA operation family from the legacy fallback into `src/scripts/godot_ops/visual_qa_ops.gd`, registered `visual_sprite_bounds_check` and `visual_camera_framing_check` from `src/scripts/godot_ops/operation_registry.gd`, and kept sprite bounds, camera framing, rectangle, and Camera2D bounds helpers with the new module. The old visual QA dispatch cases and implementation helpers were removed from `legacy_operations.gd`. RED first failed with the missing visual QA module, missing registry preload, legacy dispatch cases, missing build output, and the old visual QA test still expecting legacy handlers. Focused `npm run build; node --test tests/visual-qa.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 45/45. Final `npm test` passed 212/212, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smokes through `build/scripts/godot_operations.gd` proved `visual_sprite_bounds_check` on `res://tier1_test_scene.tscn` and `visual_camera_framing_check` on `res://test/tier2_projects/game2d_test/scenes/main.tscn`, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 21384 and connected Godot editor PID 21400. A fresh local stdio MCP proof listed 350 tools and successfully called `sprite_bounds_check`, `camera_framing_check`, `validate_scene`, and `toolset_status`. Final startup checks showed exactly one `127.0.0.1:6010` listener owned by PID 21384 and one established Godot editor socket from PID 21400 local port 52256. Direct Codex MCP namespace proof returned `Transport closed`, so post-reload proof requires reloading Codex, then calling `session_list` plus moved visual QA tools from the Codex namespace.

Post-reload note, 2026-06-11: After Codex reload, startup recovery found old listener PID 21384 still owning `127.0.0.1:6010` while the reloaded Codex MCP process PID 9520 was not listening. PID 21384 was stopped, PID 9520 bound `127.0.0.1:6010`, and the open Godot editor PID 21400 reconnected from local port 51673. `session_list` then reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. Callable proof passed for `editor_state`, `toolset_status`, `live_addon_status`, moved Phase 6.B pass 8 visual QA tools `sprite_bounds_check` and `camera_framing_check`, plus `validate_scene`; the visual fixture reported its expected two sprite-without-texture warnings.

Verification note, 2026-06-12: Phase 6.B pass 9 moved the signal operation family from the legacy fallback into `src/scripts/godot_ops/signal_ops.gd`, registered `list_signals`, `list_connections`, `connect_signal`, `disconnect_signal`, and `validate_connection` from `src/scripts/godot_ops/operation_registry.gd`, and kept signal-specific operation code with the new module. The old signal dispatch cases and implementation functions were removed from `legacy_operations.gd`; the shared `type_string()` helper remains in legacy for the remaining ClassDB/script-intelligence code, while signal ops use a private `_type_string()` copy. RED first failed with the missing signal module, missing registry preload, legacy dispatch cases, and missing build output. Focused `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs` passed 38/38. Final `npm test` passed 216/216, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd list_signals` returned 30 `Button` signals including `pressed` with 0 `SCRIPT ERROR`/`ERROR:` matches, and headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches. `npm run smoke:live` initially failed because no `127.0.0.1:6010` listener was active and direct Codex MCP `session_list` returned `Transport closed`; a fresh local stdio MCP proof then listed 350 tools, restored a live socket to the open Godot editor PID 3792, and passed calls for `session_list`, moved signal tools `list_signals`, `list_connections`, `validate_connection`, `connect_signal`, and `disconnect_signal`, with the temporary copied scene removed afterward.

Post-reload note, 2026-06-12: After Codex reload, direct Codex MCP calls were callable. Startup proof found exactly one listener on `127.0.0.1:6010` owned by PID 16336 and one established Godot editor socket from PID 3792. `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. Callable proof passed for `session_list`, `toolset_status`, moved Phase 6.B pass 9 signal tools `list_signals`, `list_connections`, `validate_connection`, `disconnect_signal`, and `connect_signal`; the temporary Codex smoke scene was removed afterward.

Verification note, 2026-06-12: Phase 6.B pass 10 moved the animation operation family from the legacy fallback into `src/scripts/godot_ops/animation_ops.gd`, registered `create_animation_player`, `add_animation_track`, `add_keyframe`, `configure_animation_tree`, and `create_animation_library` from `src/scripts/godot_ops/operation_registry.gd`, and removed the old animation dispatch cases and implementation functions from `legacy_operations.gd`. RED first failed with the missing animation module, missing registry preload, legacy dispatch cases, and missing build output. Focused `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs` passed 42/42. Final `npm test` passed 220/220, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd` passed for all five moved animation operations, headless editor smoke against `test_mcp_enhancements` exited 0 with only known warnings and no `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 16336 and connected Godot editor PID 3792. A fresh local stdio MCP proof listed 350 tools and successfully called all five moved animation tools plus `toolset_status`; temporary pass 10 scene/resource files were removed afterward. Direct Codex MCP namespace calls returned `Transport closed`, so post-reload proof requires reloading Codex, then calling `session_list` plus moved animation tools from the Codex namespace. `git diff --check` exited 0 with CRLF warnings only.

Post-reload note, 2026-06-12: After Codex reload, startup proof found stale listener PID 16336 still owning `127.0.0.1:6010` while the reloaded connector PID 14576 was callable but not listening. PID 16336 was stopped, PID 14576 bound `127.0.0.1:6010`, and the open Godot editor PID 3792 reconnected from local port 61069. `session_list` then reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. Callable proof passed for `session_list`, `editor_state`, `toolset_status`, `live_addon_status`, moved Phase 6.B pass 10 animation tools `create_animation_player`, `add_animation_track`, `add_keyframe`, `configure_animation_tree`, and `create_animation_library`, plus `project_settings_get`, `filesystem_search`, and `validate_scene`; temporary Codex smoke scene/resource files were removed afterward.

Verification note, 2026-06-12: Phase 6.B pass 11 moved the script intelligence and mutation operation family from the legacy fallback into `src/scripts/godot_ops/script_ops.gd`, registered `analyze_script`, `create_script`, `modify_function`, `add_export_variable`, `extract_dependencies`, and `attach_script` from `src/scripts/godot_ops/operation_registry.gd`, and removed the old script dispatch cases and implementation functions from `legacy_operations.gd`. RED first failed with the missing script module, missing registry preload, legacy dispatch cases, and missing build output. A fresh local MCP proof then exposed an existing Windows JSON quoting bug in `executeOperation`; `src/index.ts` now uses `execFile` argument arrays so quoted script bodies reach Godot unchanged. Focused `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs` passed 47/47. Final `npm test` passed 225/225, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd` passed for all six moved script operations, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 14576 and connected Godot editor PID 3792. A fresh local stdio MCP proof listed 350 tools and successfully called `create_script`, `analyze_script`, `modify_function`, `add_export_variable`, `extract_dependencies`, `attach_script`, and `toolset_status`; temporary pass 11 files were removed afterward. Direct Codex MCP post-reload proof required reloading Codex/the Godot MCP connector.

Post-reload note, 2026-06-12: After Codex reload, direct Codex MCP calls were callable. The first `session_list` call started the live transport; after a short wait, startup proof found exactly one listener on `127.0.0.1:6010` owned by PID 12892 and one established Godot editor socket from PID 3792. `session_list` then reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. Callable proof passed for `session_list`, `editor_state`, `live_config_status`, `toolset_status`, `live_addon_status`, moved Phase 6.B pass 11 script tools `create_script`, `analyze_script`, `modify_function`, `add_export_variable`, `extract_dependencies`, and `attach_script`, plus `project_settings_get`, `filesystem_search`, and `validate_scene`; temporary Codex smoke script and scene files were removed afterward.

Verification note, 2026-06-12: Phase 6.B pass 12 moved the camera workflow operation family fully into `src/scripts/godot_ops/camera_ops.gd`, registered the existing camera operation names before the legacy fallback, and removed the old camera dispatch cases and implementation helpers from `legacy_operations.gd`. RED first failed because `camera_ops.gd` still delegated to legacy and legacy still owned the camera handlers. Direct Godot smoke then exposed an offline `Camera2D.make_current()` error on detached scene edits, so `camera_ops.gd` now uses `_camera_make_current()` to persist current/enabled state without calling `make_current()` unless the camera is inside the tree. Focused `npm run build; node --test tests/camera-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 60/60. Final `npm test` passed 230/230, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd` passed all eight moved camera operations with 0 `SCRIPT ERROR`/`ERROR:` matches, headless editor smoke against `test_mcp_enhancements` exited 0 with no `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 12892 and connected Godot editor PID 3792. A fresh local stdio MCP proof listed 350 tools and successfully called all eight camera tools plus `toolset_status`; temporary pass 12 scene/script proof files were removed afterward. `git diff --check` exited 0 with CRLF warnings only.

Direct Codex MCP proof note, 2026-06-12: Direct Codex namespace proof passed after stale listener cleanup. Startup recovery stopped stale listener PID 12892 and duplicate non-listening PID 12664, leaving exactly one `127.0.0.1:6010` listener owned by PID 13604 with one connected Godot editor session PID 3792. `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. `toolset_status` reported 350 loaded tools. Direct Codex MCP `create_camera` succeeded on a temporary `mcp_phase6b_pass12_codex_camera.tscn` scene; the temporary scene was removed afterward.

Verification note, 2026-06-12: Phase 6.B pass 13 moved the audio-player workflow operation family from the legacy fallback into `src/scripts/godot_ops/audio_player_ops.gd`, registered `audio_player_create`, `audio_player_set_stream`, `audio_player_configure`, `audio_player_play`, `audio_player_stop`, `audio_player_list`, and `audio_player_validate_routes` from `src/scripts/godot_ops/operation_registry.gd`, and removed the old audio-player dispatch cases and implementation helpers from `legacy_operations.gd`. RED first failed with the missing audio-player module, missing registry preload, legacy dispatch cases, and missing build output. Focused `npm run build; node --test tests/audio-player-workflow.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 60/60. Final `npm test` passed 234/234, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd` passed all seven moved audio-player operations using `audio/test_sfx.wav`, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 13604 and connected Godot editor PID 3792. A fresh local stdio MCP proof listed 350 tools and successfully called `create_audio_player`, `set_audio_stream`, `configure_audio_playback`, `play_audio_node`, `stop_audio_node`, `list_audio_players`, `validate_audio_routes`, and `toolset_status`; temporary pass 13 proof scenes were removed afterward. `git diff --check` exited 0 with CRLF warnings only. Direct Codex MCP post-reload proof passed after Codex/the Godot MCP connector reload.

Direct Codex MCP proof note, 2026-06-12: After Codex reload, direct Codex MCP calls were callable. Startup proof found exactly one listener on `127.0.0.1:6010` owned by PID 18992 and one established Godot editor socket from PID 3792 local port 50152. `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state. `toolset_status` reported 350 loaded tools. Callable proof passed for `session_list`, `editor_state`, `live_addon_status`, `toolset_status`, and all seven moved Phase 6.B pass 13 audio-player tools: `create_audio_player`, `set_audio_stream`, `configure_audio_playback`, `play_audio_node`, `stop_audio_node`, `list_audio_players`, and `validate_audio_routes`. The temporary Codex proof scene was removed afterward.

Verification note, 2026-06-12: Phase 6.B pass 14 moved the shader/material operation family from the legacy fallback into `src/scripts/godot_ops/shader_ops.gd`, registered `create_shader_material`, `apply_material`, and `set_shader_parameter` from `src/scripts/godot_ops/operation_registry.gd`, and removed the old shader/material dispatch cases and implementation helpers from `legacy_operations.gd`. RED first failed with the missing shader module, missing registry preload, legacy dispatch cases, and missing build output. Focused `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs` passed 60/60. Final `npm test` passed 238/238, `npm run smoke:non-live` passed with 350 tools, direct Godot headless smoke through `build/scripts/godot_operations.gd` passed `create_shader_material`, `apply_material`, and `set_shader_parameter` against temporary shader/material/scene files that were removed afterward, headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches, and `npm run smoke:live` passed with listener PID 18992 and connected Godot editor PID 3792. A fresh local stdio MCP proof listed 350 tools and successfully called `create_shader_material`, `apply_material`, `set_shader_parameter`, and `toolset_status`; temporary proof files were removed afterward. `git diff --check` exited 0 with CRLF warnings only. Direct Codex MCP post-reload proof passed after stale listener cleanup: `session_list` returned one connected compatible `test_mcp_enhancements` session on listener PID 20808 with Godot editor PID 3792, `toolset_status` reported 350 loaded tools, `live_addon_status` was compatible and up to date, `editor_state` was connected and writable, and direct Codex calls passed for `create_shader_material`, `apply_material`, `set_shader_parameter`, and `validate_scene`; temporary Codex proof files were removed afterward.

## Phase 7 - Toolset Profile Hardening And Final Catalog Audit

The current MCP tool surface is too large to load by default in normal agent sessions. Loading the entire toolset is a token/context killer. Phase 7 should turn the existing Phase 5.0 profile layer into the default practical workflow for users and LLMs: select the smallest useful catalog, reload the connector, prove the active profile, then work.

The first pass should keep full-catalog mode available for compatibility, but regular docs and examples should steer users toward profile-based startup.

### 7.1 Audit Tool Metadata

- [x] Audit every registered tool for correct `toolset` assignment.
- [x] Audit every registered tool for correct `risk`.
- [x] Audit every registered tool for correct `mutates`.
- [x] Audit every registered tool for correct `requires_live`.
- [x] Audit every registered tool for correct `requires_display`.
- [x] Fix tools that are currently classified by weak name inference when explicit metadata is clearer.
- [x] Keep deprecated aliases visible only where compatibility requires them.
- [x] Add focused tests that catch representative metadata mistakes.

Verification note, 2026-06-12: Phase 7.1 added `docs/superpowers/plans/2026-06-12-phase-7-1-tool-metadata-audit.md`, a catalog-level RED test in `tests/tool-metadata-audit.test.mjs`, and explicit metadata overrides in `src/toolsets.ts` for weak-inference cases including `editor_screenshot`, `runtime_profile_capture`, `start_profiler`, Asset Library addon tools, and `filesystem_reimport`. RED first failed on `editor_screenshot.risk`. Focused `npm run build; node --test tests/tool-metadata-audit.test.mjs` passed 2/2, profile regression `node --test tests/toolset-profiles.test.mjs tests/tool-metadata-audit.test.mjs` passed 10/10, and final `npm test` passed 254/254. `npm run smoke:non-live` passed with 350 tools. Live smoke passed against the open `test_mcp_enhancements` editor with listener PID 20476 and Godot PID 3792. Direct local MCP proof listed 350 tools, verified corrected metadata for `editor_screenshot`, `runtime_profile_capture`, and `start_profiler`, called `toolset_status`, `recommend_toolset_profile`, and `session_list`, and saw the live `test_mcp_enhancements` session. Headless Godot editor smoke exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches.

### 7.2 Add Built-In Example Profiles

Example profiles are required. Add a first useful set now, then expand it as real MCP workflows expose better groupings.

- [x] Add a documented `planning-readonly` profile for project inspection, diagnostics, planning, and recommendation work.
- [x] Add a documented `scene-edit` profile for file-backed scene/script changes.
- [x] Add a documented `live-editor` profile for active editor state, selection, screenshots, and live scene work.
- [x] Add a documented `runtime-debug` profile for running-game inspection, runtime input, assertions, LSP, and DAP.
- [x] Add a documented `playtest-loop` profile for automated/manual playtests, runtime state, visual proof, fun metrics, and quality gates.
- [x] Add a documented `visual-qa` profile for screenshots, viewport capture, visual regression, sprite bounds, camera framing, overlap, and contrast checks.
- [x] Add a documented `release-check` profile for export validation, release/build tools, quality gates, diagnostics, and project metadata.
- [x] Make the examples copy/paste friendly for PowerShell and `.godot-mcp/toolsets.json`.
- [x] Include loaded/hidden tool count examples after each profile is proved.

Verification note, 2026-06-13: Phase 7.2 added `docs/superpowers/plans/2026-06-13-phase-7-2-built-in-example-profiles.md`, built-in profile definitions in `src/toolsets.ts`, project-local override support, `getBuiltInToolsetProfiles`, and `toolset_status.built_in_profiles` with PowerShell snippets, `.godot-mcp/toolsets.json` snippets, resources, verification commands, and loaded/hidden count examples. The proved counts against the 350-tool catalog were `planning-readonly` 24/326, `scene-edit` 241/109, `live-editor` 211/139, `runtime-debug` 178/172, `playtest-loop` 160/190, `visual-qa` 240/110, and `release-check` 135/215. RED first failed because `build/toolsets.js` did not export `getBuiltInToolsetProfiles`. Focused `npm run build && node --test tests/built-in-profiles.test.mjs` passed 4/4. Profile regression `npm run build && node --test tests/built-in-profiles.test.mjs tests/toolset-profiles.test.mjs tests/tool-metadata-audit.test.mjs` passed 14/14. Final `npm test` passed 258/258. `npm run smoke:non-live` passed with 350 tools. `npm run smoke:live` passed against listener PID 3964 and Godot editor PID 3792. A fresh local stdio MCP proof with `GODOT_MCP_PROFILE=scene-edit` listed 241 filtered tools, confirmed `toolset_status` loaded 241 and hid 109, exposed all built-in profile examples, and rejected hidden `run_automated_playtest` with `status: "disabled"` plus playtest-toolset remediation. Direct Codex MCP namespace proof requires Codex/the Godot MCP connector reload because calls returned `Transport closed` before reload.

### 7.3 Improve Profile Recommendation

- [x] Make `recommend_toolset_profile` use the real tool catalog and metadata instead of relying mainly on keyword matching.
- [x] Return both broad toolsets and exact extra tools when a smaller catalog is better.
- [x] Return named-profile suggestions when a request matches a built-in example profile.
- [x] Return required MCP resources for the selected profile.
- [x] Return verification commands matched to the active profile.
- [x] Return reload instructions whenever env/profile changes are needed.

Verification note, 2026-06-13: Phase 7.3 added `docs/superpowers/plans/2026-06-13-phase-7-3-profile-recommendation.md`, catalog-aware profile recommendation in `src/toolsets.ts`, provider-catalog wiring in `src/tools/toolset-profile.ts`, and focused coverage in `tests/toolset-profiles.test.mjs`. RED first failed 2/10 because `primary_named_profile` and catalog-backed recommendation fields were missing. Focused `npm run build && node --test tests/toolset-profiles.test.mjs` passed 10/10. Profile regression `npm run build && node --test tests/toolset-profiles.test.mjs tests/built-in-profiles.test.mjs tests/tool-metadata-audit.test.mjs` passed 16/16. Final `npm test` passed 260/260. `npm run smoke:non-live` passed with 350 tools. `npm run smoke:live` passed against listener PID 19904 and Godot editor PID 13144. A fresh local stdio MCP proof listed 350 tools and confirmed `recommend_toolset_profile` returned `primary_named_profile: live-editor`, exact tools including `capture_editor_viewport`, `editor_state`, `selection_get`, and `session_list`, live resources, profile verification commands, and reload instructions. The live session was connected on `127.0.0.1:6010` with Godot local port 51501, and direct Codex MCP calls to `session_list`, `editor_state`, and `selection_get` succeeded against `test_mcp_enhancements`. Post-reload direct Codex MCP proof confirmed the new Phase 7.3 recommendation shape, including `primary_named_profile: live-editor`, built-in named profile suggestions, exact extra tools, required MCP resources, verification commands, and reload instructions. Stale listener PID 19904 and extra non-listener `build/index.js` processes were stopped; the remaining listener was PID 16820 on `127.0.0.1:6010`, with Godot editor PID 13144 connected from local port 52857. Final direct calls to `toolset_status`, `session_list`, `editor_state`, and `selection_get` succeeded.

### 7.4 Strengthen Runtime Behavior

- [x] Keep default startup backward-compatible with all tools loaded when no profile is configured.
- [x] Add a startup/status summary that clearly reports loaded tool count and hidden tool count.
- [x] Ensure `tools/list`, `godot-mcp://tools/catalog`, per-tool resources, and dispatch all use the same filtered catalog.
- [x] Ensure hidden known tools return a structured disabled response with the exact toolset or env var needed.
- [x] Ensure invalid toolset/profile names produce clear startup or status warnings.
- [x] Ensure full-catalog mode is explicitly marked as heavy and not the recommended normal session mode.

Verification note, 2026-06-13: Phase 7.4 added `docs/superpowers/plans/2026-06-13-phase-7-4-runtime-behavior.md`, full/filtered catalog summaries in `toolset_status`, invalid profile/toolset/tool warnings, stronger hidden-tool remediation, and profile-aware `smoke:non-live` count checks. RED first failed because `catalog_summary`/`full_catalog` were missing and invalid `GODOT_MCP_TOOLSETS`/`GODOT_MCP_TOOLS` values did not warn; the filtered smoke also exposed the old full-catalog-only count check. Focused `npm run build; node --test tests/toolset-profiles.test.mjs` passed 13/13. Harness focused `npm run build; node --test tests/phase-5-4-verification-harness.test.mjs` passed 7/7. Profile regression `npm run build; node --test tests/toolset-profiles.test.mjs tests/built-in-profiles.test.mjs tests/tool-metadata-audit.test.mjs` passed 19/19. Final `npm test` passed 264/264. `npm run smoke:non-live` passed in full mode with 350 loaded / 0 hidden and with `GODOT_MCP_PROFILE=scene-edit` at 241 loaded / 109 hidden. `npm run smoke:live` passed against listener PID 16820 and Godot editor PID 13144. Direct Codex MCP namespace proof requires Codex/the Godot MCP connector reload because calls returned `Transport closed` before reload.

Post-reload note, 2026-06-13: After Codex reload, stale pre-reload listener PID 16820 was stopped, leaving the reloaded connector PID 5148 to bind `127.0.0.1:6010`; Godot editor PID 13144 reconnected from local port 59978. Direct Codex MCP calls passed for `session_list`, `toolset_status`, `editor_state`, `live_addon_status`, `recommend_toolset_profile`, `project_settings_get`, and `validate_scene`. `toolset_status` reported full-catalog compatibility mode with 350 loaded / 0 hidden, `startup_summary` and `catalog_summary` present, and full catalog marked heavy/not normal recommended mode. `session_list` reported one compatible connected `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state.

### 7.5 Docs And User Workflow

- [ ] Update `README.md` so profile-based startup is the recommended path.
- [ ] Update `docs/autonomous-workflows.md` with the built-in example profiles.
- [ ] Add a short "pick a profile first" workflow for LLM sessions.
- [ ] Document that changing `GODOT_MCP_TOOLSETS`, `GODOT_MCP_TOOLS`, or `GODOT_MCP_PROFILE` requires reloading the MCP connector.
- [ ] Document that full catalog mode exists for compatibility and broad audits, but should not be the default for normal feature work.

### Phase 7 Acceptance Criteria

- [ ] With no profile configured, the full catalog still loads for backward compatibility.
- [ ] A filtered profile cuts the visible tool count significantly compared to the full catalog.
- [ ] Hidden tools cannot be called through dispatch.
- [ ] Hidden-tool responses explain exactly how to enable the missing tool.
- [ ] Built-in example profiles exist for `planning-readonly`, `scene-edit`, `live-editor`, `runtime-debug`, `playtest-loop`, `visual-qa`, and `release-check`.
- [ ] Example profiles are documented with copy/paste PowerShell env snippets.
- [ ] Example profiles are documented with `.godot-mcp/toolsets.json` snippets.
- [ ] `toolset_status` proves the active profile, loaded count, hidden count, active toolsets, explicit tools, and config sources after reload.
- [ ] `recommend_toolset_profile` can map common requests to a compact profile and verification path.
- [ ] Profile filtering is proven across `tools/list`, resources, and dispatch.
- [ ] `npm test` passes.
- [ ] `npm run smoke:non-live` passes with at least one filtered profile.
- [ ] Direct MCP proof shows a filtered profile active and a hidden tool rejected with remediation.
- [ ] `git diff --check` exits 0.

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

