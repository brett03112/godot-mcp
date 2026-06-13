# Autonomous Workflows

This document describes how to start smaller Godot MCP sessions with only the tools and resources needed for the current task.

Related Phase 5.3 docs:

- [Live bridge protocol](live-bridge-protocol.md)
- [Live bridge security](live-bridge-security.md)
- [Tooling adapters](tooling-adapters.md)

## Fresh-User Setup

For a fresh-user setup, build the MCP server, configure the MCP client to run `node /absolute/path/to/godot-mcp/build/index.js`, install the bundled live addon with `live_addon_install`, enable it with `live_addon_enable`, reload the MCP connector and the Godot addon if either side changed, then verify with `session_list` and `editor_state`.

## Toolset Profiles

Phase 5.0 adds first-pass tool metadata and profile filtering. When no profile is configured, the MCP server exposes the full catalog for backward compatibility. When a profile is configured, the server filters `tools/list`, per-tool resources, catalog resources, and dispatch through the same active profile.

Available toolsets:

- `core`: server status, profile recommendation, and planning support.
- `project`: project settings, filesystem, addons, and project inspection.
- `scene`: scene, node, camera, UI, animation, signal, and layout tools.
- `script`: script patching, code edits, refactors, dependencies, autoloads, and UID helpers.
- `assets`: resource, texture, audio, model, import, shader, material, particle, physics, and navigation workflows.
- `live`: live editor session state, selection, logs, filesystem, and editor mutation tools.
- `runtime`: running-game inspection, input, assertions, screenshots, logs, and runtime state tools.
- `playtest`: automated/manual playtesting, heatmaps, session comparison, and fun metrics.
- `visual`: screenshots, viewport capture, visual regression, UI overlap, contrast, sprite bounds, and camera framing.
- `quality`: performance, profiler, memory, node-count, draw-call, texture-memory, export-size, and quality gates.
- `debug`: LSP/DAP, diagnostics, symbols, definitions, references, breakpoints, stack traces, and variables.
- `release`: export presets, export validation, and build/export workflows.

## Startup Patterns

Use toolsets for broad feature workflows:

```powershell
$env:GODOT_MCP_TOOLSETS = "core,project,scene,script,visual"
```

Use exact tools for a very small surface:

```powershell
$env:GODOT_MCP_TOOLS = "script_patch,validate_scene"
```

Use a built-in named profile:

```powershell
$env:GODOT_MCP_PROFILE = "playtest-loop"
```

Add `GODOT_MCP_PROJECT_PATH` when a project-local profile file should override the built-in profile:

```powershell
$env:GODOT_MCP_PROJECT_PATH = "C:\path\to\godot-project"
$env:GODOT_MCP_PROFILE = "playtest-loop"
```

Built-in profiles proved against the 350-tool catalog:

| Profile | Use | Proved catalog count |
| ------ | --- | -------------------- |
| `planning-readonly` | Project inspection, diagnostics, planning, recommendations | 24 loaded / 326 hidden |
| `scene-edit` | File-backed scene, script, resource, and quality work | 241 loaded / 109 hidden |
| `live-editor` | Active editor state, selection, screenshots, live scene work | 211 loaded / 139 hidden |
| `runtime-debug` | Running-game inspection, runtime input, assertions, LSP, DAP | 178 loaded / 172 hidden |
| `playtest-loop` | Playtests, runtime state, visual proof, fun metrics, quality gates | 160 loaded / 190 hidden |
| `visual-qa` | Screenshots, viewport capture, visual regression, bounds, framing, contrast | 240 loaded / 110 hidden |
| `release-check` | Export validation, release/build tools, quality gates, diagnostics | 135 loaded / 215 hidden |

Project file snippet:

```json
{
  "profiles": {
    "planning-readonly": {
      "toolsets": ["core"],
      "tools": [
        "get_godot_version",
        "list_projects",
        "get_project_info",
        "project_settings_get",
        "autoload_list",
        "filesystem_search",
        "dependency_graph",
        "find_orphaned_assets",
        "find_missing_uid_files",
        "validate_scene",
        "analyze_script",
        "extract_dependencies",
        "lsp_status",
        "lsp_diagnostics",
        "capability_matrix",
        "recommend_next_tool",
        "plan_feature_implementation",
        "plan_test_strategy",
        "risk_scan",
        "preflight_project_health",
        "postchange_verification_plan"
      ]
    },
    "scene-edit": {
      "toolsets": ["core", "project", "scene", "script", "assets", "quality"],
      "tools": ["filesystem_search", "validate_scene", "script_patch"]
    },
    "live-editor": {
      "toolsets": ["core", "project", "scene", "script", "live", "visual"],
      "tools": ["session_list", "editor_state", "capture_editor_viewport"]
    },
    "runtime-debug": {
      "toolsets": ["core", "project", "live", "runtime", "debug"],
      "tools": ["session_list", "runtime_play_scene", "lsp_diagnostics", "dap_status"]
    },
    "playtest-loop": {
      "toolsets": ["core", "project", "playtest", "runtime", "visual", "quality"],
      "tools": ["run_automated_playtest", "analyze_playtest_session", "quality_gate_run"]
    },
    "visual-qa": {
      "toolsets": ["core", "project", "scene", "live", "runtime", "visual", "quality"],
      "tools": ["capture_editor_viewport", "screenshot_compare", "visual_regression_check"]
    },
    "release-check": {
      "toolsets": ["core", "project", "quality", "release", "debug"],
      "tools": ["validate_export", "quality_gate_run", "lsp_diagnostics"]
    }
  }
}
```

Reload/restart the MCP connector after changing these values. The active catalog is resolved when the server process starts.

## Live Configuration

Phase 5.1 adds `.godot-mcp/config.json` for live bridge settings. Defaults are local-only and eval-disabled:

```json
{
  "live": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 6010,
    "allowed_project_paths": ["."]
  },
  "eval": {
    "enabled": false
  },
  "log_retention_days": 14,
  "screenshot_output_dir": ".godot-mcp/screenshots",
  "stale_session_timeout_ms": 15000
}
```

Use `live_config_status` to verify the effective config. It redacts shared secrets and returns explicit remediation when host, port, allowed project paths, retention, screenshot directory, or stale timeout values are invalid.

## Common Mappings

| Feature request | Recommended profile |
| ------ | ------ |
| Add a pause menu | `scene-edit` |
| Add a collectible or enemy | `scene-edit` |
| Run a playtest and reduce frustration | `playtest-loop` |
| Debug script errors or breakpoints | `runtime-debug` |
| Prepare a release/export check | `release-check` |
| Inspect live editor state only | `live-editor` |
| Check screenshots or UI layout | `visual-qa` |
| Plan before edits | `planning-readonly` |

## Session Setup Workflow

1. Call `toolset_status` to see whether the current catalog is full or filtered.
2. Call `recommend_toolset_profile` with the feature request.
3. Copy the returned env snippet into the MCP server environment or save the returned profile shape in `.godot-mcp/toolsets.json`.
4. Reload/restart the MCP connector.
5. Call `toolset_status` again and confirm the loaded and hidden counts match the intended session.
6. Proceed with implementation using the smaller catalog.

If a hidden-but-known tool is called, the server returns a structured `status: "disabled"` response that names the missing toolset and an exact `GODOT_MCP_TOOLSETS` or `GODOT_MCP_TOOLS` remediation.

## Safe Defaults

For read-only planning, start with:

```powershell
$env:GODOT_MCP_PROFILE = "planning-readonly"
```

For file-backed scene/script edits, start with:

```powershell
$env:GODOT_MCP_PROFILE = "scene-edit"
```

For live editor work, include `live` and confirm a session after reload:

```powershell
$env:GODOT_MCP_PROFILE = "live-editor"
```

## Caveats

Live editor and runtime tools require the Godot live addon/session to be connected. Visual, viewport, playtest, and profiler workflows may require a display or running game. Release/export tools can write build artifacts and should be paired with `quality` and `debug` checks before completion.

Legacy lifecycle names remain available for compatibility:

- `start_playtest_recording` and `stop_playtest_recording` are deprecated aliases for `playtest_recording`.
- `start_profiler`, `get_profiling_data`, and `analyze_bottlenecks` are deprecated aliases for `profiler`.
