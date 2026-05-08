# Godot MCP Tooling Verification

**Project under test:** `test_mcp_enhancements/`  
**Verification start:** 2026-05-07  
**Godot detected:** `4.6.2.stable.official.71f334935`  
**MCP build:** `npm run build` passed on 2026-05-07  

## Status Legend

| Status | Meaning |
| --- | --- |
| PASS | Tested in the current pass and behaved as expected. |
| PREVIOUS PASS | Covered by `test_mcp_enhancements/test_enhancements.md`; not yet re-run in the current pass. |
| REVIEW | Tested and failed, or behavior needs code review/update. |
| BLOCKED | Cannot be verified in the current environment without missing external state such as display, export templates, network, or credentials. |
| NOT TESTED | Inventory item not yet exercised. |

## MCP Protocol And Resources

| Item | Status | Evidence | Notes |
| --- | --- | --- | --- |
| TypeScript build | PASS | `npm run build` completed successfully. | Copies `godot_operations.gd` into `build/scripts`. |
| `tools/list` | PASS | MCP client listed 115 tools. | README currently says 102 tools, so documentation appears stale. |
| `resources/list` | PASS | MCP client listed 118 resources. | Includes 3 server/runtime/catalog resources plus 115 per-tool resources. |
| `resources/templates/list` | PASS | MCP client listed 1 template. | `godot-mcp://tools/{name}`. |
| `resources/read: godot-mcp://server/info` | PASS | Returned `toolCount: 115` and configured Godot path metadata. |  |
| `resources/read: godot-mcp://tools/catalog` | PASS | Returned catalog `count: 115`. |  |
| `resources/read: godot-mcp://runtime/debug-output` | PASS | Returned `isRunning`, `output`, and `errors` fields. | No active project process during check. |
| `resources/read: godot-mcp://tools/{name}` | PASS | `godot-mcp://tools/get_godot_version` returned schema and `callMethod: tools/call`. | Invalid tool URI correctly returned MCP `InvalidParams`. |

## Previous Coverage Baseline

These tools were previously tested in `test_mcp_enhancements/test_enhancements.md`. They remain marked as `PREVIOUS PASS` until re-run during this verification pass.

| Tool | Status | Evidence | Current-pass notes |
| --- | --- | --- | --- |
| `list_scene_tree` | PREVIOUS PASS | Tier 1 T1.01-T1.03 |  |
| `read_node_properties` | PREVIOUS PASS | Tier 1 T1.04-T1.06 |  |
| `modify_node_property` | PREVIOUS PASS | Tier 1 T1.08-T1.10 |  |
| `remove_node` | PREVIOUS PASS | Tier 1 T1.11-T1.12 |  |
| `duplicate_node` | PREVIOUS PASS | Tier 1 T1.13 |  |
| `reparent_node` | PREVIOUS PASS | Tier 1 T1.14 |  |
| `create_material_from_texture` | PREVIOUS PASS | Tier 1 T1.15-T1.16 |  |
| `apply_material` | PREVIOUS PASS | Tier 1 T1.17-T1.18 |  |
| `set_shader_parameter` | PREVIOUS PASS | Tier 1 T1.19-T1.20 |  |
| `create_animation_library` | PREVIOUS PASS | Tier 1 T1.21 |  |
| `configure_animation_tree` | PREVIOUS PASS | Tier 1 T1.22-T1.24 | Previous caveat: direct Godot invocation passed; MCP dispatch had Windows shell escaping caveat. |
| `refactor_rename` | PREVIOUS PASS | Tier 1 T1.25-T1.29 | Previous caveat: signal rename does not track convention-based handler names or `.emit()` calls. |
| `validate_scene` | PREVIOUS PASS | Tier 2 T2.01-T2.09 |  |
| `create_project` | PREVIOUS PASS | Tier 2 T2.10-T2.14 |  |
| `create_particle_system` | PREVIOUS PASS | Tier 2 T2.16-T2.18 |  |
| `apply_particle_preset` | PREVIOUS PASS | Tier 2 T2.19-T2.21 |  |
| `create_particle_material` | PREVIOUS PASS | Tier 2 T2.22-T2.24 |  |
| `start_profiler` | PREVIOUS PASS | Tier 2 T2.25-T2.28 | Requires display and explicit `scene_path` when no main scene is configured. |
| `get_profiling_data` | PREVIOUS PASS | Tier 2 T2.29-T2.31 |  |
| `analyze_bottlenecks` | PREVIOUS PASS | Tier 2 T2.32-T2.34 |  |
| `generate_docstring` | PREVIOUS PASS | Tier 3 T3.01-T3.06 |  |
| `generate_test_from_specification` | PREVIOUS PASS | Tier 3 T3.07-T3.11 |  |
| `analyze_test_coverage` | PREVIOUS PASS | Tier 3 T3.12-T3.16 |  |
| `create_mock_node` | PREVIOUS PASS | Tier 3 T3.17-T3.20 |  |
| `get_class_info` | PREVIOUS PASS | Tier 3 T3.21-T3.26 |  |
| `search_asset_library` | PREVIOUS PASS | Tier 3 T3.27-T3.32 | Requires network for success-path tests. |
| `configure_audio_bus` | PREVIOUS PASS | Tier 3 T3.33-T3.39 |  |
| `capture_viewport` | PREVIOUS PASS | Tier 3 T3.40-T3.45 | Requires display. |
| `configure_asset_generation` | PREVIOUS PASS | Tier 4 T4.01-T4.02 |  |
| `generate_sprite` | PREVIOUS PASS | Tier 4 T4.03-T4.06 | Placeholder backend. |
| `generate_texture` | PREVIOUS PASS | Tier 4 T4.07-T4.08 | Placeholder backend. |
| `generate_sfx` | PREVIOUS PASS | Tier 4 T4.09-T4.12 | Placeholder backend. |
| `generate_music` | PREVIOUS PASS | Tier 4 T4.13-T4.14 | Placeholder backend. |
| `analyze_juice_coverage` | PREVIOUS PASS | Tier 4 T4.15-T4.17 |  |
| `run_automated_playtest` | PREVIOUS PASS | Tier 4 T4.20-T4.27 | Requires display; prior T4.26 ran 600 seconds due clamping behavior. |
| `start_playtest_recording` | PREVIOUS PASS | Tier 4 T4.28 | Requires display/user interaction. |
| `stop_playtest_recording` | PREVIOUS PASS | Tier 4 T4.29-T4.31 |  |
| `analyze_playtest_session` | PREVIOUS PASS | Tier 4 T4.32-T4.37 | Requires existing playtest session data. |
| `generate_heatmap` | PREVIOUS PASS | Tier 4 T4.38-T4.43 | Requires existing playtest session data. |
| `compare_sessions` | PREVIOUS PASS | Tier 4 T4.44-T4.48 | Requires existing playtest session data. |
| `calculate_game_feel_metrics` | PREVIOUS PASS | Tier 4 T4.49-T4.51 | Requires existing playtest session data. |
| `analyze_difficulty_curve` | PREVIOUS PASS | Tier 4 T4.52-T4.54 | Requires existing playtest session data. |
| `compare_to_genre_benchmarks` | PREVIOUS PASS | Tier 4 T4.55-T4.58 | Requires existing playtest session data. |
| `detect_frustration_points` | PREVIOUS PASS | Tier 4 T4.59-T4.62 | Requires existing playtest session data. |

## Current-Pass Tool Inventory

| Tool | Status | Evidence | Notes |
| --- | --- | --- | --- |
| `setup_multiplayer_peer` | REVIEW | Success-path call failed: Godot could not create ENet host on port 10568. | May be sandbox/network binding related; retest outside sandbox before code changes. |
| `configure_rpc` | PASS | Configured RPC metadata on `mcp_verification/net_scene.tscn`. | Returns annotation guidance; does not edit script source. |
| `manage_multiplayer_spawner` | PASS | Added `MultiplayerSpawner` and `MultiplayerSynchronizer` after API fix. | Repaired obsolete `add_property()` usage. |
| `configure_physics_material` | REVIEW | Failed with `Unknown operation: configure_physics_material`. | Tool is registered, but backing GDScript operation is missing. |
| `set_collision_config` | REVIEW | Code inspection: backing operation is missing. | Not executed after missing-operation finding. |
| `create_physics_body` | REVIEW | Failed with `Unknown operation: create_physics_body`. | Tool is registered, but backing GDScript operation is missing. |
| `manage_collision_shape` | REVIEW | Code inspection: backing operation is missing. | Not executed after missing-operation finding. |
| `setup_joint` | REVIEW | Code inspection: backing operation is missing. | Not executed after missing-operation finding. |
| `generate_navmesh` | PASS | Added `NavigationRegion3D` metadata to verification scene. | Tool has a backing GDScript operation. |
| `add_navigation_agent` | REVIEW | Failed with `Unknown operation: add_navigation_agent`. | Tool is registered, but backing GDScript operation is missing. |
| `add_navigation_link` | REVIEW | Code inspection: backing operation is missing. | Not executed after missing-operation finding. |
| `configure_navigation_obstacle` | REVIEW | Code inspection: backing operation is missing. | Not executed after missing-operation finding. |
| `create_astar_grid` | REVIEW | Failed with `Unknown operation: create_astar_grid`. | Also review design: `AStarGrid2D` is not a normal `.tres` Resource in Godot 4. |
| `setup_navigation_server` | REVIEW | Failed with `Unknown operation: setup_navigation_server`. | Tool is registered, but backing GDScript operation is missing. |
| `launch_editor` | BLOCKED |  | Success path launches GUI editor; not run in this pass. |
| `run_project` | BLOCKED |  | Success path launches GUI/runtime; not run in this pass. |
| `get_debug_output` | PASS | Inactive-process path returned expected MCP error. | Success path depends on `run_project`. |
| `stop_project` | PASS | Inactive-process path returned expected MCP error. | Success path depends on `run_project`. |
| `get_godot_version` | PASS | Returned `4.6.2.stable.official.71f334935`. |  |
| `list_projects` | PASS | Found copied `test_mcp_enhancements` project recursively. |  |
| `get_project_info` | PASS | Returned project name, Godot version, and structure counts. | Repaired ESM `require('fs')` path. |
| `create_scene` | PASS | Created nested `mcp_verification/*.tscn` scenes. | Repaired missing nested directory creation. |
| `add_node` | PASS | Added Sprite2D, Button, and other verification nodes. |  |
| `load_sprite` | PASS | Applied `assets/test_texture.png` to Sprite2D. |  |
| `export_mesh_library` | REVIEW | Failed when using copied `models/test_cube.gltf`; import/resource load was unavailable. | Negative path cleaned to stop after load failure; needs a valid imported 3D scene for success test. |
| `save_scene` | PASS | Saved `legacy_scene_copy.tscn`. |  |
| `get_uid` | PASS | Returned UID for verification scene. |  |
| `update_project_uids` | PASS | Resaved resources in a copied temp project. |  |
| `list_signals` | PASS | Listed Button signals including `pressed`. | Repaired legacy camelCase parameter handling and JSON parsing. |
| `list_connections` | PASS | Listed `pause_menu.tscn` button signal connections. | Repaired legacy camelCase parameter handling and JSON parsing. |
| `connect_signal` | PASS | Connected Button `pressed` signal in verification scene. |  |
| `disconnect_signal` | PASS | Removed the verification signal connection. |  |
| `validate_connection` | PASS | Validated Button `pressed` signal to root method. |  |
| `analyze_script` | PASS | Analyzed `coin.gd`. | Repaired legacy camelCase parameter handling. |
| `create_script` | PASS | Created `mcp_verification/verification_script.gd`. |  |
| `modify_function` | PASS | Modified `_ready()` and validation stayed true after indentation fix. | Repaired mixed tab/space insertion. |
| `add_export_variable` | PASS | Added `@export_range` variable to verification script. |  |
| `extract_dependencies` | PASS | Extracted dependencies from `coin.gd`. |  |
| `attach_script` | PASS | Attached verification script to scene root. |  |
| `validate_script` | PASS | Returned `"valid": true` for verification script. | Repaired temp log-file handling for Godot `--check-only`. |
| `create_animation_player` | PASS | Added AnimationPlayer with initial animation. | Repaired false stderr failure from missing default animation library. |
| `add_animation_track` | PASS | Added property track to `verify_idle`. | Required initial animation from `create_animation_player`. |
| `add_keyframe` | PASS | Added keyframe to the verification animation. |  |
| `create_shader_material` | PASS | Created verification shader/material resources. |  |
| `create_test_suite` | PASS | Generated GUT test file with one test method. | Repaired JSON parsing path. |
| `run_tests` | PASS | Tool executed against copied project. | Returned structured GUT result; no matching tests in the smoke pattern. |
| `import_texture` | PASS | Updated import settings for `assets/test_texture.png`. |  |
| `import_audio` | PASS | Updated import settings for `audio/test_sfx.wav`. |  |
| `import_3d_model` | PASS | Updated import settings for `models/test_cube.gltf`. |  |
| `create_resource` | PASS | Created `mcp_verification/verify_resource.tres`. |  |
| `modify_project_setting` | PASS | Created `application/config/mcp_verify_setting`. | Temp project only. |
| `configure_input_action` | PASS | Created `mcp_verify_action`. | Temp project only. |
| `setup_render_layers` | PASS | Configured 2D physics layer names. |  |
| `configure_autoload` | PASS | Created and removed `McpVerificationSingleton`. |  |
| `create_export_preset` | PASS | Created `MCP Verify Linux` preset for `Linux/X11`. |  |
| `export_project` | BLOCKED |  | Requires installed export templates and writes platform artifacts. |
| `validate_export` | PASS | Passed for `MCP Verify Linux` with template/script checks disabled. | Full template validation remains environment-dependent. |
| `create_tilemap` | PASS | Created `VerifyTileMap` in a clean copied project. | Avoided localization side effects from separate test. |
| `paint_tiles` | PASS | Painted a verification tile. |  |
| `configure_tileset` | PASS | Created `verify_tileset.tres` from `assets/test_texture.png`. |  |
| `create_translation_file` | PASS | Created CSV with `en` and `es`. |  |
| `add_translation` | PASS | Added `MENU_QUIT` translation. |  |
| `remove_translation` | PASS | Dry-run removal found `MENU_QUIT`. |  |
| `validate_translations` | PASS | CSV validation returned valid with complete keys. |  |
| `create_dialogue_resource` | PASS | Created `dialogue_intro.tres`. |  |
| `configure_localization` | PASS | Registered locales and translation path after `res://` normalization fix. | Caveat: raw CSV may need Godot import before runtime load is clean. |
| `extract_translatable_strings` | PASS | Extracted zero strings from verification scan path with warnings. |  |
| `list_plugins` | PASS | Listed existing GUT plugin. |  |
| `configure_plugin` | PASS | Enabled and disabled `mcp_verify_plugin`. | Temp project only. |
| `create_plugin` | PASS | Created basic `mcp_verify_plugin`. | Temp project only. |
| `install_plugin` | BLOCKED |  | Success path requires network Asset Library or Git source. Validation-only paths not counted as success. |

## Findings For Review

| ID | Status | Item | Finding | Next action |
| --- | --- | --- | --- | --- |
| DOC-001 | REVIEW | README tool count | README advertises 102 tools, while `tools/list` currently returns 115. | Update documentation after verification settles. |
| FIX-001 | PASS | ESM runtime compatibility | Removed remaining `require(...)` usage from ESM code paths in `get_project_info` and `install_plugin`. | Re-run network/git plugin install when network is available. |
| FIX-002 | PASS | Godot operation stderr | Routed headless operation logs to temp files and sanitized known non-fatal macOS Godot stderr noise. | Keep an eye on whether sanitizing hides any real platform issue. |
| FIX-003 | PASS | Nested scene creation | `create_scene` claimed success for nested paths when the directory did not exist. | Fixed by creating the target directory before invoking Godot. |
| FIX-004 | PASS | Legacy parameter casing | Signal/script legacy operations expected camelCase while the shared executor sent snake_case. | Fixed by preserving camelCase for the legacy GDScript operations that still require it. |
| FIX-005 | PASS | Legacy JSON parsing | `list_signals`, `list_connections`, and `create_test_suite` parsed raw stdout despite Godot debug lines. | Fixed with JSON payload extraction from operation stdout. |
| FIX-006 | PASS | `modify_function` indentation | Function edits could mix spaces into tab-indented GDScript, breaking parse. | Fixed by detecting existing function-body indentation. |
| FIX-007 | PASS | `create_animation_player` false failure | Initial animation creation called `get_animation_library("")` before the default library existed, causing recoverable engine stderr. | Fixed with `has_animation_library("")` guard. |
| FIX-008 | PASS | `configure_localization` path normalization | Passing `res://...` produced `res://res://...` in `project.godot`. | Fixed by preserving existing `res://` prefixes. |
| FIX-009 | PASS | `manage_multiplayer_spawner` Godot 4.6 API | Used nonexistent `MultiplayerSynchronizer.add_property()`. | Fixed with `SceneReplicationConfig`. |
| REV-001 | REVIEW | Physics tools | `configure_physics_material`, `set_collision_config`, `create_physics_body`, `manage_collision_shape`, and `setup_joint` are registered but their GDScript operations are missing. | Implement or disable these tools before advertising them as available. |
| REV-002 | REVIEW | Navigation tools | `add_navigation_agent`, `add_navigation_link`, `configure_navigation_obstacle`, `create_astar_grid`, and `setup_navigation_server` are registered but their GDScript operations are missing. | Implement or disable these tools; review `create_astar_grid` resource design. |
| REV-003 | REVIEW | `setup_multiplayer_peer` | ENet server setup failed with `Couldn't create an ENet host` in this sandbox. | Retest outside sandbox or make the tool support config-only generation without binding a port. |
| REV-004 | REVIEW | `export_mesh_library` | Success path still needs a valid imported 3D scene; copied `.gltf` failed to load as a scene in the temp project. | Add a deterministic 3D test scene or improve import handling. |
| BLK-001 | BLOCKED | GUI tools | `launch_editor`, `run_project`, viewport/playtest GUI success paths were not run in this pass. | Run with explicit GUI approval/display access. |
| BLK-002 | BLOCKED | External install/export | `install_plugin` and `export_project` need network/git or export templates. | Run in an environment with those dependencies configured. |
