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
  'debugger_bridge.gd',
];

const runtimeFiles = [
  'runtime_bridge.gd',
];

test('live addon skeleton files are present and registered', async () => {
  for (const relativePath of [...addonFiles, ...runtimeFiles]) {
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
  assert.match(mainScript, /const DebuggerBridge = preload\("res:\/\/addons\/godot_mcp_live\/debugger_bridge\.gd"\)/);
  assert.match(mainScript, /func _enter_tree\(\) -> void:/);
  assert.match(mainScript, /func _exit_tree\(\) -> void:/);
  assert.match(mainScript, /add_debugger_plugin\(_debugger_bridge\)/);
  assert.match(mainScript, /remove_debugger_plugin\(_debugger_bridge\)/);
  assert.match(mainScript, /_start_bridge\(\)/);
  assert.match(mainScript, /_stop_bridge\(\)/);
  assert.match(mainScript, /const RECONNECT_INTERVAL_SECONDS := 1\.0/);
  assert.match(mainScript, /const HEARTBEAT_INTERVAL_SECONDS := 1\.0/);
  assert.match(mainScript, /var _retry_elapsed_seconds := 0\.0/);
  assert.match(mainScript, /var _heartbeat_elapsed_seconds := 0\.0/);
  assert.match(mainScript, /func _should_retry_bridge\(\) -> bool:/);
  assert.match(mainScript, /_should_retry_bridge\(\)/);
  assert.match(mainScript, /func _maybe_send_heartbeat\(delta: float\) -> void:/);
  assert.match(mainScript, /"kind": "heartbeat"/);
  assert.match(mainScript, /add_control_to_dock\(DOCK_SLOT_RIGHT_UL, _dock\)/);
  assert.match(mainScript, /remove_control_from_docks\(_dock\)/);

  for (const relativePath of addonFiles.filter((file) => file.endsWith('.gd'))) {
    const content = await readFile(join(addonRoot, relativePath), 'utf8');
    assert.match(content, /^@tool/m, `${relativePath} should be an editor-safe tool script`);
  }
});

test('live addon collaborators expose the live editor command contract', async () => {
  const sessionState = await readFile(join(addonRoot, 'session_state.gd'), 'utf8');
  assert.match(sessionState, /^class_name GodotMCPLiveSessionState/m);
  assert.match(sessionState, /func mark_connecting\(\) -> void:/);
  assert.match(sessionState, /func mark_connected\(\) -> void:/);
  assert.match(sessionState, /func mark_disconnected\(error_message: String = ""\) -> void:/);
  assert.match(sessionState, /func update_editor_snapshot\(editor_interface: EditorInterface\) -> void:/);
  assert.match(sessionState, /func update_runtime_status\(debugger_bridge: GodotMCPLiveDebuggerBridge\) -> void:/);
  assert.match(sessionState, /func to_dictionary\(\) -> Dictionary:/);
  assert.match(sessionState, /"runtime_status": runtime_status/);

  const dispatcher = await readFile(join(addonRoot, 'command_dispatcher.gd'), 'utf8');
  assert.match(dispatcher, /^class_name GodotMCPLiveCommandDispatcher/m);
  assert.match(dispatcher, /func configure\(editor_plugin: EditorPlugin, state: GodotMCPLiveSessionState, debugger_bridge: GodotMCPLiveDebuggerBridge = null\) -> void:/);
  assert.match(dispatcher, /func handle_message\(message: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_editor_state\(\) -> Dictionary:/);
  assert.match(dispatcher, /"runtime_ping"/);
  assert.match(dispatcher, /func _handle_runtime_ping\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /"runtime_play_scene"/);
  assert.match(dispatcher, /func _handle_runtime_play_scene\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /EditorInterface.*play_custom_scene|editor\.play_custom_scene\(scene_path\)/);
  assert.match(dispatcher, /"runtime_stop"/);
  assert.match(dispatcher, /func _handle_runtime_stop\(\) -> Dictionary:/);
  assert.match(dispatcher, /editor\.stop_playing_scene\(\)/);
  for (const commandName of [
    'runtime_get_scene_tree',
    'runtime_get_node_info',
    'runtime_get_node_property',
    'runtime_watch_node',
    'runtime_get_ui_elements',
    'runtime_get_focus_owner',
    'runtime_get_viewport_info',
    'runtime_get_performance_metrics',
    'runtime_get_input_map',
    'runtime_get_groups',
    'runtime_input_key',
    'runtime_input_mouse',
    'runtime_input_gamepad',
    'runtime_input_action',
    'runtime_input_text',
    'runtime_input_state',
    'runtime_wait_for_condition',
    'runtime_click_ui_text',
    'runtime_click_ui_path',
  ]) {
    assert.match(dispatcher, new RegExp(`"${commandName}"`));
  }
  assert.match(dispatcher, /func _handle_runtime_inspection\(command: String, args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_scene_current\(\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_selection_get\(\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_selection_set\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_scene_save_active\(\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_editor_screenshot\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /"live_scene_get_hierarchy"/);
  assert.match(dispatcher, /"live_node_get_properties"/);
  assert.match(dispatcher, /"live_node_set_property"/);
  assert.match(dispatcher, /"live_node_create"/);
  assert.match(dispatcher, /"live_node_delete"/);
  assert.match(dispatcher, /"live_node_duplicate"/);
  assert.match(dispatcher, /"live_node_reparent"/);
  assert.match(dispatcher, /"live_node_rename"/);
  assert.match(dispatcher, /"live_node_connect_signal"/);
  assert.match(dispatcher, /"live_node_disconnect_signal"/);
  assert.match(dispatcher, /"live_scene_mark_dirty"/);
  assert.match(dispatcher, /"live_scene_save"/);
  assert.match(dispatcher, /"editor_filesystem_scan"/);
  assert.match(dispatcher, /"editor_filesystem_reimport"/);
  assert.match(dispatcher, /"editor_resource_reload"/);
  assert.match(dispatcher, /"editor_resource_uid_update"/);
  assert.match(dispatcher, /"editor_open_resource"/);
  assert.match(dispatcher, /"editor_focus_file"/);
  assert.match(dispatcher, /func _handle_live_scene_get_hierarchy\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_get_properties\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_set_property\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_create\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_delete\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_duplicate\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_reparent\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_rename\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_connect_signal\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_node_disconnect_signal\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_live_scene_mark_dirty\(\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_editor_filesystem_scan\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_editor_filesystem_reimport\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_editor_resource_reload\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_editor_resource_uid_update\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_editor_open_resource\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /func _handle_editor_focus_file\(args: Dictionary\) -> Dictionary:/);
  assert.match(dispatcher, /"unsupported_command"/);

  const transport = await readFile(join(addonRoot, 'transport_websocket.gd'), 'utf8');
  assert.match(transport, /^class_name GodotMCPLiveTransportWebSocket/m);
  assert.match(transport, /var _peer: WebSocketPeer = WebSocketPeer\.new\(\)/);
  assert.match(transport, /func configure\(server_url: String, state: GodotMCPLiveSessionState\) -> void:/);
  assert.match(transport, /func connect_to_server\(\) -> int:/);
  assert.match(transport, /_peer = WebSocketPeer\.new\(\)/);
  assert.match(transport, /func disconnect_from_server\(\) -> void:/);
  assert.match(transport, /func poll\(dispatcher: GodotMCPLiveCommandDispatcher\) -> void:/);
  assert.doesNotMatch(transport, /func is_connected\(\) -> bool:/);
  assert.match(transport, /func is_transport_connected\(\) -> bool:/);
  assert.match(transport, /func send_json\(payload: Dictionary\) -> int:/);

  const debuggerBridge = await readFile(join(addonRoot, 'debugger_bridge.gd'), 'utf8');
  assert.match(debuggerBridge, /^@tool/m);
  assert.match(debuggerBridge, /^class_name GodotMCPLiveDebuggerBridge/m);
  assert.match(debuggerBridge, /^extends EditorDebuggerPlugin/m);
  assert.match(debuggerBridge, /const MESSAGE_NAMESPACE := "godot_mcp"/);
  assert.match(debuggerBridge, /func _has_capture\(capture: String\) -> bool:/);
  assert.match(debuggerBridge, /func _capture\(message: String, data: Array, session_id: int\) -> bool:/);
  assert.match(debuggerBridge, /func _setup_session\(session_id: int\) -> void:/);
  assert.match(debuggerBridge, /func send_ping\(args: Dictionary\) -> Dictionary:/);
  assert.match(debuggerBridge, /func _runtime_ready_after_start\(record: Dictionary\) -> bool:/);
  assert.match(debuggerBridge, /return _error\("runtime_not_ready"/);
  assert.match(debuggerBridge, /record\["runtime_ready_unix"\] = record\["last_message_unix"\]/);
  assert.match(debuggerBridge, /runtime_ready_unix < record\["started_unix"\]/);
  assert.match(debuggerBridge, /record\["runtime"\] = {}/);
  assert.match(debuggerBridge, /send_message\("godot_mcp:ping"/);
  assert.match(debuggerBridge, /func send_inspection_request\(args: Dictionary\) -> Dictionary:/);
  assert.match(debuggerBridge, /"inspection_result"/);
  assert.match(debuggerBridge, /send_message\("godot_mcp:inspection_request"/);

  const runtimeBridge = await readFile(join(addonRoot, 'runtime_bridge.gd'), 'utf8');
  assert.match(runtimeBridge, /^class_name GodotMCPLiveRuntimeBridge/m);
  assert.match(runtimeBridge, /^extends Node/m);
  assert.match(runtimeBridge, /EngineDebugger\.register_message_capture\("godot_mcp", _capture\)/);
  assert.match(runtimeBridge, /EngineDebugger\.send_message\("godot_mcp:runtime_ready"/);
  assert.match(runtimeBridge, /EngineDebugger\.send_message\("godot_mcp:pong"/);
  assert.match(runtimeBridge, /EngineDebugger\.send_message\("godot_mcp:inspection_result"/);
  assert.match(runtimeBridge, /func _handle_inspection_request\(request: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_scene_tree\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_node_info\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_ui_elements\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_input_key\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_input_mouse\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_input_gamepad\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_input_action\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_input_text\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_input_state\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_wait_for_condition\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_click_ui_text\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _runtime_click_ui_path\(args: Dictionary\) -> Dictionary:/);
  assert.match(runtimeBridge, /func _make_key_event\(args: Dictionary\) -> InputEventKey:/);
  assert.match(runtimeBridge, /func _make_mouse_button_event\(args: Dictionary\) -> InputEventMouseButton:/);
  assert.match(runtimeBridge, /func _make_mouse_motion_event\(args: Dictionary\) -> InputEventMouseMotion:/);
  assert.match(runtimeBridge, /func _make_action_event\(args: Dictionary\) -> InputEventAction:/);
  assert.match(runtimeBridge, /func _make_gamepad_button_event\(args: Dictionary\) -> InputEventJoypadButton:/);
  assert.match(runtimeBridge, /func _make_gamepad_motion_event\(args: Dictionary\) -> InputEventJoypadMotion:/);
});

test('test fixture enables the live addon without removing GUT', async () => {
  const projectConfig = await readFile(join(projectRoot, 'project.godot'), 'utf8');
  assert.match(projectConfig, /enabled=PackedStringArray\([^)]*"res:\/\/addons\/gut\/plugin\.cfg"[^)]*\)/);
  assert.match(projectConfig, /enabled=PackedStringArray\([^)]*"res:\/\/addons\/godot_mcp_live\/plugin\.cfg"[^)]*\)/);
  assert.match(projectConfig, /\[autoload\][\s\S]*GodotMCPLiveRuntime="\*res:\/\/addons\/godot_mcp_live\/runtime_bridge\.gd"/);
});
