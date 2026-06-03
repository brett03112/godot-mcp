@tool
class_name GodotMCPLiveSessionState
extends RefCounted

var session_id: String = ""
var project_path: String = ""
var godot_version: String = ""
var connection_state: String = "disconnected"
var server_url: String = ""
var active_scene: String = ""
var play_state: String = "stopped"
var writable: bool = true
var last_heartbeat_unix: float = 0.0
var last_error: String = ""


func _init() -> void:
	session_id = _generate_session_id()
	project_path = ProjectSettings.globalize_path("res://")
	var version_info := Engine.get_version_info()
	godot_version = str(version_info.get("string", "unknown"))
	last_heartbeat_unix = Time.get_unix_time_from_system()


func configure(new_server_url: String) -> void:
	server_url = new_server_url


func mark_connecting() -> void:
	connection_state = "connecting"
	last_error = ""
	touch_heartbeat()


func mark_connected() -> void:
	connection_state = "connected"
	last_error = ""
	touch_heartbeat()


func mark_disconnected(error_message: String = "") -> void:
	connection_state = "disconnected"
	last_error = error_message
	touch_heartbeat()


func record_error(error_message: String) -> void:
	last_error = error_message
	if error_message != "":
		connection_state = "error"
	touch_heartbeat()


func touch_heartbeat() -> void:
	last_heartbeat_unix = Time.get_unix_time_from_system()


func update_editor_snapshot(editor_interface: EditorInterface) -> void:
	var edited_root := editor_interface.get_edited_scene_root()
	if edited_root and edited_root.scene_file_path != "":
		active_scene = edited_root.scene_file_path
	else:
		active_scene = ""

	if editor_interface.has_method("is_playing_scene") and editor_interface.call("is_playing_scene"):
		play_state = "playing"
	else:
		play_state = "stopped"

	touch_heartbeat()


func to_dictionary() -> Dictionary:
	return {
		"session_id": session_id,
		"project_path": project_path,
		"godot_version": godot_version,
		"connection_state": connection_state,
		"server_url": server_url,
		"active_scene": active_scene,
		"play_state": play_state,
		"writable": writable,
		"last_heartbeat_unix": last_heartbeat_unix,
		"last_error": last_error,
	}


func _generate_session_id() -> String:
	var timestamp := int(Time.get_unix_time_from_system() * 1000.0)
	var random_part := randi() % 1000000
	return "godot-mcp-%s-%06d" % [str(timestamp), random_part]
