import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(repoRoot, 'test_mcp_enhancements');
const addonRoot = join(projectRoot, 'addons', 'godot_mcp_live');

const addonFiles = [
  'plugin.cfg',
  'godot_mcp_live.gd',
  'session_state.gd',
  'command_dispatcher.gd',
  'transport_websocket.gd',
];

test('live addon skeleton files are present and registered', async () => {
  for (const relativePath of addonFiles) {
    assert.equal(existsSync(join(addonRoot, relativePath)), true, `${relativePath} should exist`);
  }

  const pluginCfg = await readFile(join(addonRoot, 'plugin.cfg'), 'utf8');
  assert.match(pluginCfg, /\[plugin\]/);
  assert.match(pluginCfg, /name="Godot MCP Live"/);
  assert.match(pluginCfg, /description="Live editor bridge skeleton for Godot MCP sessions\."/);
  assert.match(pluginCfg, /author="Godot MCP"/);
  assert.match(pluginCfg, /version="0\.1\.0"/);
  assert.match(pluginCfg, /script="godot_mcp_live\.gd"/);

  const mainScript = await readFile(join(addonRoot, 'godot_mcp_live.gd'), 'utf8');
  assert.match(mainScript, /^@tool/m);
  assert.match(mainScript, /^extends EditorPlugin/m);
  assert.match(mainScript, /const SessionState = preload\("res:\/\/addons\/godot_mcp_live\/session_state\.gd"\)/);
  assert.match(mainScript, /const CommandDispatcher = preload\("res:\/\/addons\/godot_mcp_live\/command_dispatcher\.gd"\)/);
  assert.match(mainScript, /const TransportWebSocket = preload\("res:\/\/addons\/godot_mcp_live\/transport_websocket\.gd"\)/);
  assert.match(mainScript, /func _enter_tree\(\) -> void:/);
  assert.match(mainScript, /func _exit_tree\(\) -> void:/);
  assert.match(mainScript, /_start_bridge\(\)/);
  assert.match(mainScript, /_stop_bridge\(\)/);
  assert.match(mainScript, /add_control_to_dock\(DOCK_SLOT_RIGHT_UL, _dock\)/);
  assert.match(mainScript, /remove_control_from_docks\(_dock\)/);

  for (const relativePath of addonFiles.filter((file) => file.endsWith('.gd'))) {
    const content = await readFile(join(addonRoot, relativePath), 'utf8');
    assert.match(content, /^@tool/m, `${relativePath} should be an editor-safe tool script`);
  }
});

test('live addon collaborators expose the Phase 2.1 bridge contract', async () => {
  const sessionState = await readFile(join(addonRoot, 'session_state.gd'), 'utf8');
  assert.match(sessionState, /^class_name GodotMCPLiveSessionState/m);
  assert.match(sessionState, /func mark_connecting\(\) -> void:/);
  assert.match(sessionState, /func mark_connected\(\) -> void:/);
  assert.match(sessionState, /func mark_disconnected\(error_message: String = ""\) -> void:/);
  assert.match(sessionState, /func update_editor_snapshot\(editor_interface: EditorInterface\) -> void:/);
  assert.match(sessionState, /func to_dictionary\(\) -> Dictionary:/);

  const dispatcher = await readFile(join(addonRoot, 'command_dispatcher.gd'), 'utf8');
  assert.match(dispatcher, /^class_name GodotMCPLiveCommandDispatcher/m);
  assert.match(dispatcher, /func configure\(editor_plugin: EditorPlugin, state: GodotMCPLiveSessionState\) -> void:/);
  assert.match(dispatcher, /func handle_message\(message: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /"unsupported_command"/);

  const transport = await readFile(join(addonRoot, 'transport_websocket.gd'), 'utf8');
  assert.match(transport, /^class_name GodotMCPLiveTransportWebSocket/m);
  assert.match(transport, /var _peer: WebSocketPeer = WebSocketPeer\.new\(\)/);
  assert.match(transport, /func configure\(server_url: String, state: GodotMCPLiveSessionState\) -> void:/);
  assert.match(transport, /func connect_to_server\(\) -> int:/);
  assert.match(transport, /func disconnect_from_server\(\) -> void:/);
  assert.match(transport, /func poll\(dispatcher: GodotMCPLiveCommandDispatcher\) -> void:/);
  assert.doesNotMatch(transport, /func is_connected\(\) -> bool:/);
  assert.match(transport, /func is_transport_connected\(\) -> bool:/);
  assert.match(transport, /func send_json\(payload: Dictionary\) -> int:/);
});

test('test fixture enables the live addon without removing GUT', async () => {
  const projectConfig = await readFile(join(projectRoot, 'project.godot'), 'utf8');
  assert.match(projectConfig, /enabled=PackedStringArray\([^)]*"res:\/\/addons\/gut\/plugin\.cfg"[^)]*\)/);
  assert.match(projectConfig, /enabled=PackedStringArray\([^)]*"res:\/\/addons\/godot_mcp_live\/plugin\.cfg"[^)]*\)/);
});
