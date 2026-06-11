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
