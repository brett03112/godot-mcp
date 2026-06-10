# Phase 5.5 - Release And Compatibility Policy

## Scope

Phase 5.5 adds explicit release and compatibility policy to the live bridge:

- Define supported Godot versions for the MCP server and live addon.
- Define live addon protocol version fields.
- Reject incompatible addon/server handshakes with a clear remediation message.
- Document migration expectations for protocol changes.
- Add changelog entries for the new policy and tooling behavior.

## Design

- Add protocol constants and compatibility helpers in `src/live/protocol.ts`.
- Extend live session snapshots with `protocol_version`, `addon_version`, and a structured compatibility result.
- Enforce compatibility in `src/live/transport.ts` before registering a `hello` session.
- Add matching protocol/addon constants to the bundled Godot addon session state.
- Update `live_addon_status`, protocol docs, README, and changelog with the compatibility policy.

## Verification

- Focused RED/GREEN test: `node --test tests/phase-5-5-release-compatibility.test.mjs`
- Full test suite: `npm test`
- Non-live smoke: `npm run smoke:non-live`
- Live smoke after reload: `npm run smoke:live`
- Godot headless editor parse/load against `test_mcp_enhancements`
- Post-reload callable proof: `session_list`, `editor_state`, and Phase 5.5 compatibility fields through the live session

## Reload Expectations

Server-side code changes require reloading the Codex MCP connector. Addon GDScript changes require reloading or re-enabling the Godot MCP Live addon in the open editor, or restarting the Godot editor.
