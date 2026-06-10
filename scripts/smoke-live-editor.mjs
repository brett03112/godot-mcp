// Phase 5.4 semi-live smoke harness for the already-open Godot editor.

import { spawnSync } from 'node:child_process';

const PROJECT_FRAGMENT = (process.env.GODOT_MCP_PROJECT_FRAGMENT || 'godot-mcp/test_mcp_enhancements').replace(/\\/g, '/').toLowerCase();

function powershellJson(command) {
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`PowerShell command failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  const text = result.stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalize(text) {
  return String(text || '').replace(/\\/g, '/').toLowerCase();
}

function getProcess(processId) {
  const command = `Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(processId)}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Depth 4`;
  return powershellJson(command)[0] || null;
}

function main() {
  const listeners = powershellJson(`
    Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 6010 -State Listen -ErrorAction SilentlyContinue |
      Select-Object LocalAddress,LocalPort,State,OwningProcess |
      ConvertTo-Json -Depth 4
  `);
  if (listeners.length !== 1) {
    throw new Error(`Expected exactly one listener on 127.0.0.1:6010, found ${listeners.length}.`);
  }

  const listener = listeners[0];
  const listenerProcess = getProcess(listener.OwningProcess);
  if (!normalize(listenerProcess?.CommandLine).includes('godot-mcp/build/index.js')) {
    throw new Error('Listener is not the built Godot MCP server: ' + JSON.stringify(listenerProcess));
  }

  const establishedClients = powershellJson(`
    Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
      Where-Object { $_.RemoteAddress -eq '127.0.0.1' -and $_.RemotePort -eq 6010 } |
      Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess |
      ConvertTo-Json -Depth 4
  `);
  const godotConnections = establishedClients
    .map((connection) => ({ connection, process: getProcess(connection.OwningProcess) }))
    .filter((entry) => normalize(entry.process?.Name).includes('godot') || normalize(entry.process?.CommandLine).includes('godot.exe'));

  if (godotConnections.length === 0) {
    throw new Error('No Godot process has an established socket to 127.0.0.1:6010.');
  }

  const matchingProject = godotConnections.find((entry) => normalize(entry.process?.CommandLine).includes(PROJECT_FRAGMENT));
  if (!matchingProject) {
    throw new Error(`Godot is connected, but no connection command line includes ${PROJECT_FRAGMENT}: ${JSON.stringify(godotConnections)}`);
  }

  console.log([
    'Phase 5.4 live smoke passed.',
    `listener_pid=${listener.OwningProcess}`,
    `godot_pid=${matchingProject.process.ProcessId}`,
    `godot_local_port=${matchingProject.connection.LocalPort}`,
    'manual_tool_check=session_list,editor_state',
  ].join(' '));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
