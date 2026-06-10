# Godot MCP Live Bridge Protocol

The Godot MCP Live bridge connects the Node MCP server to the Godot editor addon over a local WebSocket. The MCP side listens on the configured loopback host and port, normally `127.0.0.1:6010`, at the path `/godot-mcp-live`. The Godot editor addon connects to that endpoint when enabled in the project.

## Transport

- Protocol: WebSocket
- Default endpoint: `ws://127.0.0.1:6010/godot-mcp-live`
- Server owner: the MCP server process running `build/index.js`
- Client owner: the enabled `addons/godot_mcp_live` editor addon
- Session proof: `session_list` should show the connected project and active session

The live bridge is separate from stdio MCP transport. MCP clients call tools over stdio; live editor tools then forward command envelopes to the connected Godot editor session.

## Session Lifecycle

1. The MCP server starts the live transport when live tooling initializes.
2. The Godot addon connects to `/godot-mcp-live`.
3. The addon registers a session with project path, Godot/editor details, active scene state, and capability flags.
4. MCP tools such as `session_list` and `editor_state` read from the session manager.
5. Mutating live tools send command envelopes to the session and wait for response envelopes.
6. Stale sessions are removed after the configured `stale_session_timeout_ms`.

## Command Envelope

Live commands use a request/response envelope so tool calls can be correlated with editor responses:

```json
{
  "id": "request-id",
  "type": "command",
  "command": "editor_state",
  "payload": {
    "project_path": "C:/path/to/project"
  }
}
```

Responses carry the same `id`, a status, and a JSON-safe payload:

```json
{
  "id": "request-id",
  "type": "response",
  "status": "success",
  "payload": {
    "active_scene": "res://main.tscn"
  }
}
```

Unsupported commands should return a structured failure rather than being ignored. If a newly added live command returns `unsupported_command`, the open editor likely needs the addon reloaded or updated from the bundled source.

## Minimum Proof Path

Use this sequence after install, update, connector reload, or addon reload:

1. Confirm exactly one `node build/index.js` process owns `127.0.0.1:6010`.
2. Call `session_list` and confirm the target project has a session.
3. Call `editor_state` for that project path.
4. Call one representative tool from the changed surface.

`session_list` proves transport and session registration. `editor_state` proves request/response command handling through the live bridge.
