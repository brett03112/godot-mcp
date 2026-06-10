# Autonomous Workflows

This document describes how to start smaller Godot MCP sessions with only the tools and resources needed for the current task.

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

Use a project-local named profile when a workflow is repeated:

```powershell
$env:GODOT_MCP_PROJECT_PATH = "C:\path\to\godot-project"
$env:GODOT_MCP_PROFILE = "playtest-loop"
```

Project file:

```json
{
  "profiles": {
    "feature-scene-edit": {
      "toolsets": ["core", "project", "scene", "script", "visual"],
      "tools": ["filesystem_search"]
    },
    "playtest-loop": {
      "toolsets": ["core", "playtest", "runtime", "visual", "quality"]
    },
    "release-check": {
      "toolsets": ["core", "project", "quality", "release", "debug"]
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
| Add a pause menu | `core,project,scene,script,visual,quality` |
| Add a collectible or enemy | `core,project,scene,script,assets,quality` |
| Run a playtest and reduce frustration | `core,playtest,runtime,visual,quality` |
| Debug script errors or breakpoints | `core,project,script,debug` |
| Prepare a release/export check | `core,project,quality,release,debug` |
| Inspect live editor state only | `core,live` |

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
$env:GODOT_MCP_TOOLSETS = "core,project,debug"
```

For file-backed scene/script edits, start with:

```powershell
$env:GODOT_MCP_TOOLSETS = "core,project,scene,script,quality"
```

For live editor work, include `live` and confirm a session after reload:

```powershell
$env:GODOT_MCP_TOOLSETS = "core,project,scene,script,live,visual"
```

## Caveats

Live editor and runtime tools require the Godot live addon/session to be connected. Visual, viewport, playtest, and profiler workflows may require a display or running game. Release/export tools can write build artifacts and should be paired with `quality` and `debug` checks before completion.

Legacy lifecycle names remain available for compatibility:

- `start_playtest_recording` and `stop_playtest_recording` are deprecated aliases for `playtest_recording`.
- `start_profiler`, `get_profiling_data`, and `analyze_bottlenecks` are deprecated aliases for `profiler`.
