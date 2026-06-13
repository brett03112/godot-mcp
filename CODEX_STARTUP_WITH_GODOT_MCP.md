# Codex Startup With Godot MCP

Use this file at the start of every `C:\Users\brett\Desktop\godot-mcp` session.

## Non-Negotiables

- Report only hard facts, failures, and questions.
- Keep updates short.
- Use simple language.
- Say the needed action directly.
- Do not explain transport, connector, namespace, or process details unless the user asks for them.
- If Codex cannot call `mcp__godot_mcp.*` because it returns `Transport closed`, say: `Reload Codex now.`
- Do not replace clear instructions with caveats.
- Do not give long failure explanations. State what failed and what to do next.
- Focus on fixing the problem, not describing every reason it failed.
- Do not make the user manage connector/process diagnosis.
- Do not ask the user to inspect the Godot UI when the state can be verified locally.
- Do not recreate, restore, rely on, inspect, or use repo-root `.mcp.json`. It is obsolete, intentionally deleted, and must remain untracked/ignored.

## Startup Checks

1. Check `127.0.0.1:6010`.
   - Confirm whether there is a listener.
   - Confirm which process owns it.
   - Confirm whether Godot has an established socket to it.

2. Ensure exactly one `godot-mcp/build/index.js` listener is active.
   - Stop extra stale `node build/index.js` / `godot-mcp/build/index.js` processes.
   - Leave one intended listener on `127.0.0.1:6010`.
   - If there is no listener, start the current built MCP server directly from `build/index.js` with `GODOT_PATH=C:/Users/brett/Desktop/Godot/Godot.exe`.

3. Prove MCP Live through tooling.
   - Use the available Godot MCP live tools when callable.
   - Prefer `session_list` first when available.
   - If the callable tool namespace is down, verify by OS facts: listener process, Godot process, and established loopback socket.
   - A port-open check alone is not enough.

4. Wait briefly and prove again.
   - After a restart, reload, or process cleanup, wait a few seconds.
   - Re-check listener ownership and the established Godot socket.
   - If a callable live tool exists, call it again after the wait.

## Allowed Startup Commands

Use PowerShell facts like:

```powershell
Get-NetTCPConnection -LocalPort 6010 -ErrorAction SilentlyContinue
Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 6010 -or $_.RemotePort -eq 6010 }
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
Get-CimInstance Win32_Process -Filter "Name = 'Godot.exe'"
```

Only stop processes after identifying them as stale or duplicate `godot-mcp` listener processes.
