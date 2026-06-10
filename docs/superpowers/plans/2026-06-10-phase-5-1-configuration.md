# Phase 5.1 Configuration

## Scope

Add a first-pass MCP configuration layer for the live bridge. Keep defaults safe: loopback-only, port `6010`, eval disabled, no shared secret unless explicitly configured, and no project allowlist unless configured.

## Design

- Add `src/live/config.ts` to load defaults, environment variables, and optional per-project `.godot-mcp/config.json`.
- Validate live bridge settings with clear remediation:
  - `live.enabled`
  - `live.host`
  - `live.port`
  - `live.shared_secret`
  - `live.allowed_project_paths`
  - `eval.enabled`
  - `log_retention_days`
  - `screenshot_output_dir`
  - `stale_session_timeout_ms`
- Add read-only `live_config_status` in `src/tools/live-config.ts`.
- Wire resolved config into live transport startup, eval registration, and stale session timeout.
- Keep direct eval tools disabled unless config explicitly enables them.

## Tests

- Focused RED/GREEN coverage in `tests/live-config.test.mjs`.
- Verify defaults, env overrides, project config overlay, invalid config remediation, tool registration, and status redaction.
- Final verification: focused test, full `npm test`, headless Godot editor smoke, local MCP proof for `live_config_status`, startup socket proof, and `git diff --check`.
