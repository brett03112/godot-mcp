# Godot MCP Live Bridge Security

The live bridge is designed for local development. Defaults are intentionally narrow: loopback-only transport, eval disabled, no required public network exposure, and project allowlisting when configured.

## Defaults

- Host defaults to `127.0.0.1`.
- Port defaults to `6010`.
- Eval is disabled by default.
- Shared secrets are optional and redacted from status output.
- Project path allowlists are optional and enforced when present.
- Screenshot and log output stay under local project-controlled paths when configured.

Use `live_config_status` to inspect the effective configuration and remediation. It reports validation issues without exposing shared secret values.

## Loopback Only

The bridge should listen only on loopback addresses such as `127.0.0.1`, `localhost`, or `::1`. Non-loopback hosts are rejected by config validation because live editor commands can inspect and mutate an open project.

## Shared Secret

Set a shared secret when multiple local processes may reach the bridge:

```json
{
  "live": {
    "shared_secret": "replace-with-local-secret"
  }
}
```

The addon and MCP server must agree on the secret. Status output should report whether a secret is configured, not the secret itself.

## Project Allowlist

Use `allowed_project_paths` to limit which Godot projects can connect:

```json
{
  "live": {
    "allowed_project_paths": [
      "C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements"
    ]
  }
}
```

When the allowlist is set, sessions outside the list are rejected. Relative entries are resolved from the project config location.

## Eval Policy

`editor_eval` and `game_eval` are hidden unless eval is explicitly enabled by configuration. Leave eval disabled for normal live editor workflows. Prefer dedicated tools such as `editor_state`, `scene_save_active`, `runtime_play_scene`, and resource/file-backed tools for repeatable automation.

## Reload Requirements

Configuration is read by the MCP server process at startup. After changing `.godot-mcp/config.json` or related environment variables, reload the MCP connector. After updating addon files, reload or re-enable the Godot addon in the editor so the GDScript side is current.
