# Phase 4.1 Design-To-Scene Generator Plan

## Scope

Add ten design-to-scene generator tools that build real Godot 4.6 scenes, scripts, and resource files from a short brief, then return a manifest plus follow-up validation commands:

- `generate_scene_from_brief` — high-level mini-feature generator that picks a recipe bundle and writes multiple files.
- `generate_level_blockout` — write a 2D/3D blockout scene with a ground, walls, lights, and a player spawn marker.
- `generate_menu_flow` — write a main menu plus optional submenus and the screen transitions between them.
- `generate_hud` — write an overlay HUD with score, health, time, and pause button.
- `generate_dialogue_scene` — write a dialogue box scene plus a sample `DialogueLine` resource script.
- `generate_settings_screen` — write a settings screen with audio, video, and controls sections.
- `generate_mobile_controls` — write a virtual joystick plus action buttons.
- `generate_gameplay_prefab` — write a reusable gameplay prefab scene (player, enemy, or projectile).
- `generate_enemy_archetype` — write a small enemy scene with an AI script template.
- `generate_pickup_archetype` — write a small pickup scene with a pickup script template.

All ten tools must:

- Produce normal `res://` scene/script/resource files (no MCP-only state).
- Return a manifest with `created_files[]` (typed paths) and `validation_commands[]` (the MCP tool names and arguments to run next).
- Support `dry_run` (return manifest without writing) and `recipe_only` (return manifest of what would be written, no GDScript dispatch).

## Architecture

### Tooling layer (`src/tools/design-to-scene.ts`)

- One `registerDesignToSceneTools(registry, ctx)` that registers all ten tools, mirroring `registerUiThemeWorkflowTools`.
- A shared `operationTool` factory that:
  - Normalizes snake/camel args.
  - Resolves and validates the project root.
  - Requires `project_path` plus per-tool required fields.
  - Forwards `dry_run` and `recipe_only` to the GDScript operation as boolean params.
  - Parses the Godot JSON result and wraps it as `{ status: "success", ...parsed }` or `{ status: "failed", ... }` on error.
  - Invalidates the scene cache for any `output_path` produced.
- A shared `normalizeArgs` that maps snake_case to camelCase for every generator.
- A shared `manifestProperties()` helper that surfaces `dry_run` and `recipe_only` plus `output_path` in the schema.

### GDScript operations (`src/scripts/godot_operations.gd`)

Add one dispatcher case per tool plus ten backing functions:

- `design_generate_scene_from_brief`
- `design_generate_level_blockout`
- `design_generate_menu_flow`
- `design_generate_hud`
- `design_generate_dialogue_scene`
- `design_generate_settings_screen`
- `design_generate_mobile_controls`
- `design_generate_gameplay_prefab`
- `design_generate_enemy_archetype`
- `design_generate_pickup_archetype`

Each function:

1. Reads `output_path` plus per-tool params.
2. Builds a manifest by calling shared helpers (file builders that use `PackedScene.new().pack()` and `ResourceSaver.save()` for real writes, or just record the planned file list for `dry_run` / `recipe_only`).
3. Uses `_to_res_path`, `_ensure_resource_dir`, `_save_scene_root`, and `_save_resource_to_path` from the existing helpers.
4. Prints a single `JSON.stringify({ success, manifest })` line.
5. Returns empty dict on validation error (logs to stderr, follows existing pattern).

The blockout/prefab/archetype helpers write both a `.tscn` and a small `.gd` script (using `FileAccess.open/write` and a deterministic two-space-indented body). The script files use `class_name` only when the brief supplies one so generated scripts can be referenced by UID.

### Manifest shape

```json
{
  "success": true,
  "operation": "design_generate_hud",
  "manifest": {
    "created_files": [
      { "path": "res://scenes/mcp_hud.tscn", "kind": "scene" },
      { "path": "res://scripts/mcp_hud_controller.gd", "kind": "script" }
    ],
    "validation_commands": [
      { "tool": "validate_scene", "args": { "project_path": "...", "scene_path": "res://scenes/mcp_hud.tscn" } },
      { "tool": "validate_script", "args": { "projectPath": "...", "scriptPath": "scripts/mcp_hud_controller.gd" } }
    ],
    "preview_summary": { "control_count": 4, "script_classes": ["McpHudController"] },
    "dry_run": false,
    "recipe_only": false
  }
}
```

`preview_summary` keeps a small, project-agnostic report (counts, class names) so Codex can review without re-reading every file.

## Implementation Steps

1. Add `tests/design-to-scene.test.mjs` RED tests covering:
   - Registration of all ten tools.
   - Payload mapping (snake/camelCase, defaults, `dry_run`, `recipe_only`).
   - Failure paths (missing `output_path`, missing `project_path`).
   - Required-field enforcement.
2. Create `src/tools/design-to-scene.ts` with ten tool definitions and shared helpers.
3. Register from `src/index.ts` via `registerDesignToSceneTools(this.toolRegistry, ctx)` next to the workflow tools.
4. Add dispatcher cases and ten functions in `godot_operations.gd`. Each function uses the existing helpers and writes real `.tscn`/`.gd`/`.tres` files when not in `dry_run` / `recipe_only` mode.
5. Add shared GDScript helpers for HUD/prefab/archetype file builders so the JSON output is stable.

## Verification

- `npm run build && node --test tests/design-to-scene.test.mjs` focused RED/GREEN.
- `npm test` for the full suite.
- Godot 4.6.3 headless editor parse smoke against `test_mcp_enhancements`.
- Headless live proof: start a fresh `Godot.exe --headless --editor --path test_mcp_enhancements` and use the GUI MCP server to call `generate_hud`, `generate_enemy_archetype`, and `generate_scene_from_brief` against it, then run the returned `validation_commands` and confirm pass results.
- Update `Enhancements_TODO.md` Phase 4.1 checkboxes and a verification note dated 2026-06-07.
