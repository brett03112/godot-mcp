@tool
extends EditorPlugin

const SessionState = preload("res://addons/godot_mcp_live/session_state.gd")
const CommandDispatcher = preload("res://addons/godot_mcp_live/command_dispatcher.gd")
const TransportWebSocket = preload("res://addons/godot_mcp_live/transport_websocket.gd")

const DEFAULT_SERVER_URL := "ws://127.0.0.1:6010/godot-mcp-live"

var _state: GodotMCPLiveSessionState
var _dispatcher: GodotMCPLiveCommandDispatcher
var _transport: GodotMCPLiveTransportWebSocket
var _dock: VBoxContainer
var _status_label: Label
var _session_label: Label
var _server_label: Label
var _scene_label: Label
var _error_label: Label


func _enter_tree() -> void:
	_state = SessionState.new()
	_dispatcher = CommandDispatcher.new()
	_transport = TransportWebSocket.new()

	_dispatcher.configure(self, _state)
	_transport.configure(DEFAULT_SERVER_URL, _state)

	_create_dock()
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
	_start_bridge()
	set_process(true)


func _exit_tree() -> void:
	set_process(false)
	_stop_bridge()

	if _dock:
		remove_control_from_docks(_dock)
		_dock.queue_free()
		_dock = null


func _process(_delta: float) -> void:
	if not _state or not _transport:
		return

	_state.update_editor_snapshot(get_editor_interface())
	_transport.poll(_dispatcher)
	_refresh_dock()


func _start_bridge() -> void:
	if not _transport:
		return

	var err := _transport.connect_to_server()
	if err != OK:
		_state.record_error("Waiting for MCP live server at %s. Last connect error: %s." % [DEFAULT_SERVER_URL, err])
	_refresh_dock()


func _stop_bridge() -> void:
	if _transport:
		_transport.disconnect_from_server()
	if _state:
		_state.mark_disconnected()
	_refresh_dock()


func _create_dock() -> void:
	_dock = VBoxContainer.new()
	_dock.name = "GodotMCPLiveDock"

	var title := Label.new()
	title.text = "Godot MCP Live"
	title.add_theme_font_size_override("font_size", 16)
	_dock.add_child(title)

	_status_label = _make_status_label()
	_session_label = _make_status_label()
	_server_label = _make_status_label()
	_scene_label = _make_status_label()
	_error_label = _make_status_label()
	_error_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	_dock.add_child(_status_label)
	_dock.add_child(_session_label)
	_dock.add_child(_server_label)
	_dock.add_child(_scene_label)
	_dock.add_child(_error_label)
	_refresh_dock()


func _make_status_label() -> Label:
	var label := Label.new()
	label.clip_text = true
	return label


func _refresh_dock() -> void:
	if not _dock or not _state:
		return

	_status_label.text = "Connection: %s" % _state.connection_state
	_session_label.text = "Session: %s" % _state.session_id
	_server_label.text = "Server: %s" % _state.server_url
	_scene_label.text = "Active scene: %s" % (_state.active_scene if _state.active_scene != "" else "(none)")
	_error_label.text = "Last error: %s" % (_state.last_error if _state.last_error != "" else "(none)")
