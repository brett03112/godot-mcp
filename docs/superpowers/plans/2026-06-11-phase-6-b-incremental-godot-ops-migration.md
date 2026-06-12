# Phase 6.B Incremental Godot Ops Migration Plan

Goal: Continue splitting `src/scripts/godot_ops/legacy_operations.gd` without changing MCP tool names, parameter shapes, operation names, or JSON result contracts.

Scope for pass 1:

- Move the first preferred family, design-to-scene operations, into `src/scripts/godot_ops/design_to_scene_ops.gd`.
- Register the moved `design_*` operation names in `operation_registry.gd` before the legacy fallback.
- Keep shared helpers in the new module only when they are design-specific; delegate existing cross-family helpers such as path conversion, logging, and scene saving to the legacy compatibility module.
- Add a registry audit test proving the moved family is registered outside the legacy fallback.
- Update safer-planning reload/risk detection so `src/scripts/godot_ops/**` changes get the same Godot-operation verification guidance as `src/scripts/godot_operations.gd`.
- Update docs/templates to mention the modular script tree.

Verification ladder:

1. RED: `npm run build && node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build && node --test tests/design-to-scene.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs tests/safer-planning.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for a moved design operation.
6. Startup/live facts and post-reload MCP namespace proof when the connector/addon can be reloaded.
7. `git diff --check`

## Status, 2026-06-11

Phase 6.B pass 1 is PASSED.

Overall Phase 6.B remains IN PROGRESS. This pass only moved the design-to-scene operation family; the remaining families listed in `Enhancements_TODO.md` still need their own migration passes before the overall Phase 6.B acceptance can be checked.

- Focused RED/GREEN verification passed after moving the design-to-scene operation family into `src/scripts/godot_ops/design_to_scene_ops.gd`.
- Full `npm test` passed 184/184.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd design_generate_hud` returned success JSON with `dry_run: true`.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches.
- Post-reload live proof passed after reloading the Godot editor and Codex: `session_list`, `live_config_status`, `generate_hud`, `generate_scene_from_brief`, `editor_state`, `scene_current`, `editor_open_resource`, `toolset_status`, `project_settings_get`, `filesystem_search`, and `validate_scene` were callable.
- Live state after reload: one connected session for `Test_MCP_Enhancements`, Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and 350 loaded tools.
- Service state after reload: one MCP listener on `127.0.0.1:6010`, established Godot socket, and Godot-owned DAP/LSP listeners on ports `6006` and `6005`.

## Pass 2 Plan, 2026-06-11

Scope:

- Move the next preferred family, gameplay system operations, into `src/scripts/godot_ops/gameplay_ops.gd`.
- Register the moved `gameplay_*` operation names in `operation_registry.gd` before the legacy fallback.
- Keep the gameplay-specific generation helpers with the gameplay module, including smoke-test generation, manifest shaping, state-machine script generation, and scene owner preparation.
- Preserve the existing MCP tool names and operation names from `src/tools/gameplay-systems.ts`.
- Avoid new gameplay behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build; node --test tests/gameplay-systems.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for a moved gameplay operation.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Startup/live facts and post-reload MCP namespace proof after the connector/addon can be reloaded.
8. `git diff --check`

## Pass 2 Status, 2026-06-11

Phase 6.B pass 2 is PASSED.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the gameplay system operation family; the remaining families listed in `Enhancements_TODO.md` still need their own migration passes before overall acceptance can be checked.

- Focused RED/GREEN verification passed after moving gameplay operations into `src/scripts/godot_ops/gameplay_ops.gd`.
- A follow-up focused RED caught the moved module's dependency on `_load_scene_for_edit()` before adding the legacy compatibility wrapper.
- Focused `npm run build; node --test tests/gameplay-systems.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 17/17.
- Full `npm test` passed 188/188.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd gameplay_create_state_machine` returned success JSON with `dry_run: true` and 0 `SCRIPT ERROR`/`ERROR:` log matches.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches.
- `npm run smoke:live` passed with listener PID 8172 and open Godot editor PID 22368 connected.
- `git diff --check` exited 0 with CRLF warnings only.
- Service state: exactly one MCP listener on `127.0.0.1:6010`, established Godot socket, and Godot-owned DAP/LSP listeners on ports `6006` and `6005`.
- After user reload, startup checks found one stale `127.0.0.1:6010` listener and one extra non-listening `node build/index.js` process; both were cleaned up before proof.
- Fresh local stdio MCP proof listed 350 tools, reconnected one live `test_mcp_enhancements` session, and passed calls for `session_list`, `live_config_status`, `create_state_machine`, `generate_inventory_system`, `editor_state`, `scene_current`, `editor_open_resource`, `toolset_status`, `project_settings_get`, `filesystem_search`, and `validate_scene`.
- The Codex-provided `mcp__godot_mcp` namespace still returned `Transport closed`, so the post-reload proof used a fresh local stdio MCP client against `build/index.js` and closed it afterward.
- After Codex reload, the Codex MCP namespace became callable. Live proof passed for `session_list`, `editor_state`, `live_config_status`, `create_state_machine`, `generate_inventory_system`, and `add_state`.
- Reload proof found and fixed one real root-path bug where generated gameplay helper script paths could become `res:///...`; root paths now stay `res://...`.

## Pass 3 Plan, 2026-06-11

Scope:

- Move the next preferred family, UI/theme workflow operations, into `src/scripts/godot_ops/ui_theme_ops.gd`.
- Register the moved `ui_*` operation names in `operation_registry.gd` before the legacy fallback.
- Keep UI-specific layout, theme, stylebox, safe-area, and inspection helpers with the UI/theme module.
- Preserve the existing MCP tool names and operation names from `src/tools/ui-theme-workflow.ts`.
- Avoid new UI/theme behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build; node --test tests/ui-theme-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for a moved UI/theme operation.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Live socket smoke against the open editor.
8. Post-reload MCP namespace proof after Codex is reloaded.
9. `git diff --check`

## Pass 3 Status, 2026-06-11

Phase 6.B pass 3 is code-complete and locally verified.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the UI/theme workflow operation family; the remaining families listed in `Enhancements_TODO.md` still need their own migration passes before overall acceptance can be checked.

- RED first failed with the missing UI/theme module, missing registry preload, legacy dispatch cases, and missing build output.
- Direct Godot smoke caught missing compatibility wrappers for `_ensure_resource_dir()` and `_make_unique_child_name()` after the move; focused regression coverage now checks for those wrappers.
- Focused `npm run build; node --test tests/ui-theme-workflow.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 19/19.
- Final `npm test` passed 192/192.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd ui_create_layout` returned success JSON with 0 `SCRIPT ERROR`/`ERROR:` log matches.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches.
- `npm run smoke:live` passed with listener PID 7380 and open Godot editor PID 20720 connected.
- Fresh local stdio MCP proof listed 350 tools and passed calls for `create_ui_layout`, `inspect_ui_layout`, and `toolset_status`.
- `git diff --check` exited 0 with CRLF warnings only.
- After Codex reload, direct Codex MCP calls were callable. Startup recovery stopped stale listener PID 7380, confirmed new listener PID 16936 with an established Godot editor socket from PID 20720, and `session_list` reported one compatible connected `test_mcp_enhancements` session.
- Post-reload Codex namespace proof passed for `session_list`, `editor_state`, `toolset_status`, `live_addon_status`, and moved UI/theme tools `create_ui_layout`, `inspect_ui_layout`, and `validate_ui_safe_area`; the temporary Codex smoke scene was removed afterward.

## Pass 4 Plan, 2026-06-11

Scope:

- Move the next preferred family, node refactor workflow operations, into `src/scripts/godot_ops/node_refactor_ops.gd`.
- Register the moved node refactor operation names in `operation_registry.gd` before the legacy fallback.
- Keep node refactor search, mutation, reference, dependency, and summary helpers with the node refactor module.
- Preserve the existing MCP tool names and operation names from `src/tools/node-refactor-workflow.ts`.
- Avoid new node refactor behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build; node --test tests/node-refactor-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for a moved node refactor operation.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Live socket smoke against the open editor.
8. Post-reload MCP namespace proof after Codex is reloaded.
9. `git diff --check`

## Pass 4 Status, 2026-06-11

Phase 6.B pass 4 is PASSED.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the node refactor workflow operation family; the remaining families listed in `Enhancements_TODO.md` still need their own migration passes before overall acceptance can be checked.

- RED first failed with the missing node refactor module, missing registry preload, legacy dispatch cases, and missing build output.
- Focused `npm run build; node --test tests/node-refactor-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 26/26.
- Final `npm test` passed 196/196.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd node_find` returned success JSON with one `TestSprite` match.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches.
- `npm run smoke:live` passed with listener PID 16936 and open Godot editor PID 20720 connected.
- Fresh local stdio MCP proof listed 350 tools and passed calls for `node_find`, `scene_find_references`, and `toolset_status`.
- `git diff --check` exited 0 with CRLF warnings only.
- Initial direct Codex MCP namespace calls returned `Transport closed`; after Codex reload, startup recovery stopped old listener PID 16936 and confirmed reloaded Codex MCP PID 10860 owned `127.0.0.1:6010`.
- Post-reload Codex namespace proof passed for `session_list`, `editor_state`, `toolset_status`, `live_addon_status`, and moved node refactor tools `node_find` and `scene_find_references`.

## Pass 5 Plan, 2026-06-11

Scope:

- Move the next preferred family, resource workflow operations, into `src/scripts/godot_ops/resource_workflow_ops.gd`.
- Register the moved `resource_*` operation names in `operation_registry.gd` before the legacy fallback.
- Keep resource-specific Curve, Gradient, conversion, assignment, and autofit helpers with the resource workflow module.
- Preserve the existing MCP tool names and operation names from `src/tools/resource-workflow.ts`.
- Avoid new resource workflow behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build; node --test tests/resource-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for a moved resource operation.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Live socket smoke against the open editor.
8. Fresh local stdio MCP proof for moved resource tools while the Codex namespace requires reload.
9. Post-reload MCP namespace proof after Codex is reloaded.
10. `git diff --check`

## Pass 5 Status, 2026-06-11

Phase 6.B pass 5 is code-complete and locally verified.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the resource workflow operation family; the remaining families listed in `Enhancements_TODO.md` still need their own migration passes before overall acceptance can be checked.

- RED first failed with the missing resource workflow module, missing registry preload, legacy dispatch cases, and missing build output.
- Focused `npm run build; node --test tests/resource-workflow.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 30/30.
- Final `npm test` passed 200/200.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd resource_create_curve` returned success JSON for `res://resources/mcp_phase6b_pass5_curve.tres` with 0 `SCRIPT ERROR`/`ERROR:` matches.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches.
- `npm run smoke:live` passed with listener PID 10860 and open Godot editor PID 20720 connected.
- Fresh local stdio MCP proof listed 350 tools and passed calls for `create_curve_resource`, `set_curve_points`, `resource_convert_format`, and `toolset_status`.
- `git diff --check` exited 0 with CRLF warnings only.
- Direct Codex MCP namespace calls returned `Transport closed` before implementation, so post-reload proof still requires reloading Codex, then calling `session_list` plus moved resource workflow tools from the Codex namespace.
- After Codex reload, `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state.
- Post-reload Codex namespace proof passed for `session_list`, `editor_state`, `toolset_status`, `live_addon_status`, and moved resource workflow tools `create_curve_resource`, `set_curve_points`, and `resource_convert_format`; temporary proof resources were removed afterward.

## Pass 6 Plan, 2026-06-11

Scope:

- Move the next preferred family, physics operations, into `src/scripts/godot_ops/physics_ops.gd`.
- Register `configure_physics_material`, `set_collision_config`, `create_physics_body`, `manage_collision_shape`, and `setup_joint` from `operation_registry.gd` before the legacy fallback.
- Keep physics-specific shape, body, and joint helpers with the physics module.
- Preserve existing MCP tool names and operation names from `src/tools/physics.ts`.
- Avoid new physics behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build; node --test tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for a moved physics operation.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Live socket smoke against the open editor.
8. Fresh local stdio MCP proof for moved physics tools if the Codex namespace requires reload.
9. Post-reload MCP namespace proof after Codex is reloaded.
10. `git diff --check`

## Pass 6 Status, 2026-06-11

Phase 6.B pass 6 is code-complete and locally verified.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the physics operation family; the remaining families listed in `Enhancements_TODO.md` still need their own migration passes before overall acceptance can be checked.

- RED first failed with the missing physics module, missing registry preload, legacy dispatch cases, and missing build output.
- Focused `npm run build; node --test tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 30/30.
- Final `npm test` passed 204/204.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd create_physics_body` returned success JSON for `McpPhase6BPhysics` with `CollisionShape`.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches.
- `npm run smoke:live` passed with listener PID 14244 and open Godot editor PID 14904 connected.
- Fresh local stdio MCP proof listed 350 tools and passed calls for `configure_physics_material`, `create_physics_body`, `set_collision_config`, `manage_collision_shape`, `setup_joint`, `validate_scene`, and `toolset_status`.
- `git diff --check` exited 0 with CRLF warnings only.
- Direct Codex MCP namespace calls returned `Transport closed`, so post-reload proof still requires reloading Codex, then calling `session_list` plus moved physics tools from the Codex namespace.

## Pass 6 Post-Reload Proof, 2026-06-11

Phase 6.B pass 6 post-reload Codex proof is PASSED.

- Startup recovery stopped old listener PID 14244 so reloaded Codex MCP process PID 25112 could bind `127.0.0.1:6010`.
- The open Godot editor PID 14904 reconnected from local port 56593.
- `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state.
- Direct Codex MCP calls passed for `editor_state`, `live_config_status`, `toolset_status`, and `live_addon_status`.
- Direct Codex MCP calls passed for moved physics tools `configure_physics_material`, `create_physics_body`, `set_collision_config`, `manage_collision_shape`, and `setup_joint`.
- `validate_scene` passed on the temporary proof scene with 0 errors and 2 pre-existing sprite-without-texture warnings from the copied fixture.
- Temporary `mcp_phase6b_pass6_codex` scene/resource proof files were removed afterward.

## Pass 7 Plan, 2026-06-11

Scope:

- Move the next preferred family, navigation operations, into `src/scripts/godot_ops/navigation_ops.gd`.
- Register `generate_navmesh`, `add_navigation_agent`, `add_navigation_link`, `configure_navigation_obstacle`, `create_astar_grid`, and `setup_navigation_server` from `operation_registry.gd` before the legacy fallback.
- Keep navigation-specific AStar and navigation metadata helpers with the navigation module.
- Preserve existing MCP tool names and operation names from `src/tools/navigation.ts`.
- Avoid new navigation behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build; node --test tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for a moved navigation operation.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Live socket smoke against the open editor.
8. Fresh local stdio MCP proof for moved navigation tools if the Codex namespace requires reload.
9. Post-reload MCP namespace proof after Codex is reloaded.
10. `git diff --check`

## Pass 7 Status, 2026-06-11

Phase 6.B pass 7 is code-complete and locally verified.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the navigation operation family; the remaining families listed in `Enhancements_TODO.md` still need their own migration passes before overall acceptance can be checked.

- RED first failed with the missing navigation module, missing registry preload, legacy dispatch cases, and missing build output.
- `src/scripts/godot_ops/navigation_ops.gd` now owns `generate_navmesh`, `add_navigation_agent`, `add_navigation_link`, `configure_navigation_obstacle`, `create_astar_grid`, and `setup_navigation_server`.
- Focused `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs` passed 30/30, and `node --test tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 34/34.
- Final `npm test` passed 208/208.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd create_astar_grid` returned success JSON for `res://resources/mcp_phase6b_pass7_astar.tres`.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` log matches.
- `npm run smoke:live` passed with listener PID 25112 and open Godot editor PID 21400 connected.
- Fresh local stdio MCP proof listed 350 tools and passed calls for `generate_navmesh`, `add_navigation_agent`, `add_navigation_link`, `configure_navigation_obstacle`, `create_astar_grid`, `setup_navigation_server`, `validate_scene`, and `toolset_status`.
- Temporary pass 7 scene/resource proof files were removed afterward.
- `git diff --check` exited 0 with CRLF warnings only.
- Direct Codex MCP namespace calls returned `Transport closed`, so post-reload proof still requires reloading Codex, then calling `session_list` plus moved navigation tools from the Codex namespace.

## Pass 7 Post-Reload Proof, 2026-06-11

Phase 6.B pass 7 post-reload Codex proof is PASSED.

- Startup recovery stopped old listener PID 25112 so reloaded Codex MCP process PID 21384 could bind `127.0.0.1:6010`.
- The open Godot editor PID 21400 reconnected from local port 52256.
- `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state.
- Direct Codex MCP calls passed for `editor_state`, `toolset_status`, and `live_addon_status`.
- Direct Codex MCP calls passed for moved navigation tools `generate_navmesh`, `add_navigation_agent`, `add_navigation_link`, `configure_navigation_obstacle`, `create_astar_grid`, and `setup_navigation_server`.
- `validate_scene` passed on the temporary proof scene with 0 errors and 0 warnings.
- Temporary `mcp_phase6b_pass7_codex` scene/resource proof files were removed afterward.

## Pass 8 Plan, 2026-06-11

Scope:

- Move the next preferred family, visual QA operations, into `src/scripts/godot_ops/visual_qa_ops.gd`.
- Register `visual_sprite_bounds_check` and `visual_camera_framing_check` from `operation_registry.gd` before the legacy fallback.
- Keep visual-specific sprite bounds, camera framing, rectangle, and target summary helpers with the visual QA module.
- Preserve existing MCP tool names and operation names from `src/tools/visual-qa.ts`.
- Avoid new visual QA behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs tests/visual-qa.test.mjs`
2. GREEN focused: `npm run build; node --test tests/visual-qa.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for a moved visual QA operation.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Live socket smoke against the open editor.
8. Fresh local stdio MCP proof for moved visual QA tools if the Codex namespace requires reload.
9. Post-reload MCP namespace proof after Codex is reloaded.
10. `git diff --check`

## Pass 8 Status, 2026-06-11

Phase 6.B pass 8 is code-complete and locally verified.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the visual QA operation family; the remaining families listed in `Enhancements_TODO.md` still need their own migration passes before overall acceptance can be checked.

- RED first failed with the missing visual QA module, missing registry preload, legacy dispatch cases, missing build output, and the old visual QA test still expecting legacy handlers.
- `src/scripts/godot_ops/visual_qa_ops.gd` now owns `visual_sprite_bounds_check` and `visual_camera_framing_check`.
- Focused `npm run build; node --test tests/visual-qa.test.mjs tests/phase-6-a-modular-runner.test.mjs tests/phase-6-b-modular-migration.test.mjs` passed 45/45.
- Final `npm test` passed 212/212.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smokes through `build/scripts/godot_operations.gd` proved `visual_sprite_bounds_check` and `visual_camera_framing_check`.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches.
- `npm run smoke:live` passed with listener PID 21384 and open Godot editor PID 21400 connected.
- Fresh local stdio MCP proof listed 350 tools and passed calls for `sprite_bounds_check`, `camera_framing_check`, `validate_scene`, and `toolset_status`.
- Final startup checks found one MCP listener on `127.0.0.1:6010`, owned by PID 21384, and one established Godot socket from PID 21400 local port 52256.
- Direct Codex MCP namespace calls returned `Transport closed`, so post-reload proof still requires reloading Codex, then calling `session_list` plus moved visual QA tools from the Codex namespace.

## Pass 8 Post-Reload Proof, 2026-06-11

Phase 6.B pass 8 post-reload Codex proof is PASSED.

- Startup recovery stopped old listener PID 21384 so reloaded Codex MCP process PID 9520 could bind `127.0.0.1:6010`.
- The open Godot editor PID 21400 reconnected from local port 51673.
- `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state.
- Direct Codex MCP calls passed for `editor_state`, `toolset_status`, and `live_addon_status`.
- Direct Codex MCP calls passed for moved visual QA tools `sprite_bounds_check` and `camera_framing_check`.
- `validate_scene` passed on `tier1_test_scene.tscn` with 0 errors and 2 expected sprite-without-texture warnings from the fixture.

## Pass 9 Plan, 2026-06-12

Scope:

- Move the next preferred family, signal operations, into `src/scripts/godot_ops/signal_ops.gd`.
- Register `list_signals`, `list_connections`, `connect_signal`, `disconnect_signal`, and `validate_connection` from `operation_registry.gd` before the legacy fallback.
- Keep the signal-specific operation code with the signal module.
- Keep the legacy `type_string()` helper in `legacy_operations.gd` for the remaining ClassDB/script-intelligence code, and copy a private `_type_string()` helper into the signal module.
- Preserve existing MCP tool names and operation names from `src/index.ts`.
- Avoid new signal behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for `list_signals`.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Live socket smoke against the open editor.
8. Fresh local stdio MCP proof for moved signal tools if the Codex namespace requires reload.
9. Post-reload MCP namespace proof after Codex is reloaded.
10. `git diff --check`

## Pass 9 Status, 2026-06-12

Phase 6.B pass 9 is code-complete and locally verified.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the signal operation family; the script-intelligence and older scene/animation/shader/TileMap/mesh families still need migration passes before overall acceptance can be checked.

- RED first failed with the missing signal module, missing registry preload, legacy dispatch cases, and missing build output.
- `src/scripts/godot_ops/signal_ops.gd` now owns `list_signals`, `list_connections`, `connect_signal`, `disconnect_signal`, and `validate_connection`.
- Focused `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs` passed 38/38.
- Final `npm test` passed 216/216.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd list_signals` returned 30 `Button` signals including `pressed`, with 0 `SCRIPT ERROR`/`ERROR:` matches.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with 0 `SCRIPT ERROR`/`ERROR:` matches.
- `npm run smoke:live` initially failed because no `127.0.0.1:6010` listener was active; direct Codex MCP `session_list` also returned `Transport closed`.
- Fresh local stdio MCP proof listed 350 tools, restored a live socket to the open Godot editor PID 3792, and passed calls for `session_list`, `list_signals`, `list_connections`, `validate_connection`, `connect_signal`, and `disconnect_signal` against a temporary copied scene that was removed afterward.
- Direct Codex MCP namespace proof passed after Codex reload.

## Pass 9 Post-Reload Proof, 2026-06-12

Phase 6.B pass 9 post-reload Codex proof is PASSED.

- Startup proof found one listener on `127.0.0.1:6010`, owned by PID 16336, and one established Godot editor socket from PID 3792.
- `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state.
- `toolset_status` reported 350 loaded tools.
- Direct Codex MCP calls passed for moved signal tools `list_signals`, `list_connections`, `validate_connection`, `disconnect_signal`, and `connect_signal`.
- The temporary Codex smoke scene was removed afterward.

## Pass 10 Plan, 2026-06-12

Scope:

- Move the animation operation family into `src/scripts/godot_ops/animation_ops.gd`.
- Register `create_animation_player`, `add_animation_track`, `add_keyframe`, `configure_animation_tree`, and `create_animation_library` from `operation_registry.gd` before the legacy fallback.
- Remove the old animation dispatch cases and implementation functions from `legacy_operations.gd`.
- Keep existing MCP tool names and operation names unchanged.
- Avoid new animation behavior; this is a compatibility-preserving placement change.

Verification ladder:

1. RED: `node --test tests/phase-6-b-modular-migration.test.mjs`
2. GREEN focused: `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs`
3. Full: `npm test`
4. Non-live smoke: `npm run smoke:non-live`
5. Direct Godot headless smoke through `build/scripts/godot_operations.gd` for all five moved animation operations.
6. Headless editor smoke against `test_mcp_enhancements`.
7. Live socket smoke against the open editor.
8. Fresh local stdio MCP proof for moved animation tools if the Codex namespace requires reload.
9. Post-reload MCP namespace proof after Codex is reloaded.
10. `git diff --check`

## Pass 10 Status, 2026-06-12

Phase 6.B pass 10 is code-complete and locally verified.

Overall Phase 6.B remains IN PROGRESS. This pass moved only the animation operation family; the script-intelligence and older scene/shader/TileMap/mesh families still need migration passes before overall acceptance can be checked.

- RED first failed with the missing animation module, missing registry preload, legacy dispatch cases, and missing build output.
- `src/scripts/godot_ops/animation_ops.gd` now owns `create_animation_player`, `add_animation_track`, `add_keyframe`, `configure_animation_tree`, and `create_animation_library`.
- Focused `npm run build; node --test tests/phase-6-b-modular-migration.test.mjs` passed 42/42.
- Final `npm test` passed 220/220.
- `npm run smoke:non-live` passed with 350 tools.
- Direct Godot headless smoke through `build/scripts/godot_operations.gd` passed for all five moved animation operations.
- Headless editor smoke against `test_mcp_enhancements` exited 0 with only known warnings and no `SCRIPT ERROR`/`ERROR:` matches.
- `npm run smoke:live` passed with listener PID 16336 and connected Godot editor PID 3792.
- Fresh local stdio MCP proof listed 350 tools and passed calls for `create_animation_player`, `add_animation_track`, `add_keyframe`, `configure_animation_tree`, `create_animation_library`, and `toolset_status` against temporary files that were removed afterward.
- Direct Codex MCP namespace proof returned `Transport closed`, so post-reload proof requires reloading Codex and then calling `session_list` plus the moved animation tools.
- `git diff --check` exited 0 with CRLF warnings only.

## Pass 10 Post-Reload Proof, 2026-06-12

Phase 6.B pass 10 post-reload Codex proof is PASSED.

- Startup proof found stale listener PID 16336 still owning `127.0.0.1:6010` while reloaded connector PID 14576 was callable but not listening.
- PID 16336 was stopped; PID 14576 bound `127.0.0.1:6010`; the open Godot editor PID 3792 reconnected from local port 61069.
- `session_list` reported one connected compatible `test_mcp_enhancements` session with Godot `4.6.3-stable`, addon `0.1.0`, protocol `1.0.0`, active scene `res://test_animation_with_anim.tscn`, and writable editor state.
- `toolset_status` reported 350 loaded tools.
- Direct Codex MCP calls passed for moved animation tools `create_animation_player`, `add_animation_track`, `add_keyframe`, `configure_animation_tree`, and `create_animation_library`.
- Representative service calls passed for `editor_state`, `live_addon_status`, `project_settings_get`, `filesystem_search`, and `validate_scene`.
- Temporary Codex smoke scene/resource files were removed afterward.
