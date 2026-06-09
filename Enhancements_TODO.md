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

- [x] Add `batch_execute`.
- [x] Add a minimal live addon.
- [x] Add MCP session manager.
- [x] Add `session_list`.
- [x] Add `session_activate`.
- [x] Add `editor_state`.
- [x] Add `selection_get`.
- [x] Add `scene_current`.
- [x] Add `live_scene_get_hierarchy`.
- [ ] Verify against the currently open `test_mcp_enhancements` Godot 4.6 project.

Done means:

- [ ] Codex can see the open Godot editor.
- [ ] Codex can identify the active project and active scene.
- [ ] Codex can identify the selected node.
- [ ] Codex can read the live scene hierarchy.
- [ ] Codex can run a small batch file-backed edit with rollback.
