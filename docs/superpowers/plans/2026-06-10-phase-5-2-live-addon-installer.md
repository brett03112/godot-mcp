# Phase 5.2 Live Addon Installer And Updater

## Scope

Add live-addon-specific MCP tools for installing, updating, removing, enabling, disabling, and inspecting the bundled `godot_mcp_live` editor addon. Keep the scope fixed to the live bridge addon; generic Asset Library addon management remains in the Phase 4.6 tools.

## Design

- Add `src/tools/live-addon-installer.ts`.
- Add tools:
  - `live_addon_install`
  - `live_addon_update`
  - `live_addon_remove`
  - `live_addon_status`
  - `live_addon_enable`
  - `live_addon_disable`
- Copy the existing live addon into `build/addons/godot_mcp_live` during `npm run build` so packaged installs have a local source bundle.
- Default installation source resolution:
  - built addon bundle
  - source addon bundle, if present later
  - `test_mcp_enhancements/addons/godot_mcp_live` during repo development
- Use project-local `project.godot` edits for enable/disable:
  - `[editor_plugins]`
  - `enabled=PackedStringArray("res://addons/godot_mcp_live/plugin.cfg", ...)`
- Report addon status with plugin metadata, enabled state, file manifest hashes, update availability, and Godot 4.6 compatibility.
- Support dry-run for install, update, remove, enable, and disable.
- Refuse non-Godot project paths and unsafe live addon locations.

## Tests

- Focused RED/GREEN coverage in `tests/live-addon-installer.test.mjs`.
- Verify tool registration, install/update/remove filesystem behavior, enable/disable `project.godot` edits, status/update detection, dry-run behavior, and Godot 4.6 compatibility reporting.
- Final verification: focused test, full `npm test`, headless Godot editor smoke, standalone MCP proof against `test_mcp_enhancements`, startup socket proof, and `git diff --check`.
