# Godot MCP Live Release And Compatibility Policy

Godot MCP Live has two compatibility boundaries: the Godot editor version and the live bridge protocol between the MCP server and the editor addon.

## Supported Godot Versions

The live addon supports Godot `>=4.6 <5.0`.

Godot 4.6 is the first supported line for the current live editor/runtime bridge because this project verifies against Godot 4.6 and uses Godot 4 editor plugin, debugger, filesystem, and WebSocket APIs. Later Godot 4.x releases are expected to remain compatible unless a verification note says otherwise. Godot 5.x is intentionally not included until tested.

The MCP server reports this policy through `live_addon_status` and session compatibility metadata. A Godot version mismatch returns a clear compatibility result instead of a silent live-tool failure.

## Live Protocol Versioning

The current live protocol is `protocol_version: "1.0.0"`.

Every addon hello message includes:

- `protocol_version`
- `addon_version`
- `godot_version`

The MCP server currently accepts only protocol `1.0.0`. Addon patch releases may keep using protocol `1.0.0` when command envelopes remain backward-compatible.

## Migration Policy

Protocol changes follow these rules:

- Patch changes must not break existing command envelopes.
- Minor changes may add optional fields or commands, but must keep existing fields stable.
- Breaking changes require a new `protocol_version`, a changelog entry, and migration notes in this document.
- A version mismatch must return a structured `live_protocol_incompatible` error with remediation.

When the bundled addon changes, run `live_addon_update`, then reload or re-enable the addon in the open Godot editor. When the MCP server code changes, reload the MCP connector. If both changed, reload both before trusting live callability.

## Version Mismatch Behavior

If an addon connects with an unsupported `protocol_version`, the MCP server rejects the hello before registering a session. The error uses code `live_protocol_incompatible` and tells the user to update the bundled Godot MCP Live addon, reload or re-enable it in Godot, and reload the MCP connector if server code changed.

This is intentional. A missing or unsupported `protocol_version` usually means the editor is still running an older addon script.
