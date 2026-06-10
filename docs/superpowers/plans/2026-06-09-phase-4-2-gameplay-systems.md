# Phase 4.2 Gameplay Loop And State-Machine Helper Plan

## Scope

Add nine gameplay-system scaffolding tools:

- `create_state_machine`
- `add_state`
- `connect_state_transition`
- `generate_character_controller`
- `generate_interaction_system`
- `generate_inventory_system`
- `generate_dialogue_controller`
- `generate_save_load_system`
- `generate_settings_persistence`

Each tool creates normal Godot project files and returns a manifest containing created or changed files plus follow-up validation commands.

## Architecture

- Add `src/tools/gameplay-systems.ts` with one shared operation-tool wrapper.
- Register the module from `src/index.ts` beside the Phase 4 workflow tools.
- Add dispatcher cases and backing functions in `src/scripts/godot_operations.gd`.
- Reuse the Phase 4.1 manifest shape: `created_files`, `changed_files`, `validation_commands`, `preview_summary`, `dry_run`, and `recipe_only`.
- Use file-backed Godot operations for scene/script/test generation.

## Behavior

- `create_state_machine` writes a scene with a scripted root, child state nodes, and a GUT-style smoke test.
- `add_state` loads an existing state-machine scene, adds a state node, writes the state script, and updates the test.
- `connect_state_transition` adds or updates a transition node under a `Transitions` container.
- The six generator tools create one scene, one controller script, and one test file each.
- `dry_run` returns the manifest without writing.
- `recipe_only` returns the recipe and validation plan without writing.

## Verification

- RED: `npm run build && node --test tests/gameplay-systems.test.mjs` fails for the missing module.
- GREEN: focused tests pass.
- Full `npm test` passes.
- Godot editor parse smoke passes against `test_mcp_enhancements`.
- Live bridge proof lists the new tools and scaffolds one small gameplay system in `test_mcp_enhancements`.
- Update `Enhancements_TODO.md` with Phase 4.2 checkboxes and a dated verification note.

## Verification Update, 2026-06-09

- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/gameplay-systems.js`.
- Focused Phase 4.2 tests passed 7/7.
- Full repo tests passed 102/102.
- Godot 4.6.3 headless editor smoke exited 0 with 0 parser/error matches.
- `test_mcp_enhancements/phase42_live_proof.mjs` listed 260 tools, found all 9 Phase 4.2 tools, dry-ran all 9, generated a state machine plus state/transition, generated character/interaction/inventory/dialogue/save/settings systems, validated all manifest commands, and removed temporary proof artifacts.
