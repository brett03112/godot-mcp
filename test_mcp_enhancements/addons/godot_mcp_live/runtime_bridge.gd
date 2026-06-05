class_name GodotMCPLiveRuntimeBridge
extends Node

const MESSAGE_NAMESPACE := "godot_mcp"

var _capture_registered := false


func _ready() -> void:
	_register_capture()
	_send_runtime_ready()


func _exit_tree() -> void:
	if _capture_registered and EngineDebugger.has_capture(MESSAGE_NAMESPACE):
		EngineDebugger.unregister_message_capture(MESSAGE_NAMESPACE)
	_capture_registered = false


func _register_capture() -> void:
	if EngineDebugger.has_capture(MESSAGE_NAMESPACE):
		EngineDebugger.unregister_message_capture(MESSAGE_NAMESPACE)
	EngineDebugger.register_message_capture("godot_mcp", _capture)
	_capture_registered = true


func _capture(message: String, data: Array) -> bool:
	match message:
		"ping":
			var ping_data := _first_dictionary(data)
			EngineDebugger.send_message("godot_mcp:pong", [{
				"roundtrip_id": str(ping_data.get("roundtrip_id", "")),
				"payload": ping_data.get("payload", {}),
				"runtime_pid": OS.get_process_id(),
				"scene": _current_scene_path(),
			}])
			return true
		_:
			return false


func _send_runtime_ready() -> void:
	if not EngineDebugger.is_active():
		return
	EngineDebugger.send_message("godot_mcp:runtime_ready", [{
		"runtime_pid": OS.get_process_id(),
		"project_path": ProjectSettings.globalize_path("res://"),
		"scene": _current_scene_path(),
		"unix": Time.get_unix_time_from_system(),
	}])


func _current_scene_path() -> String:
	var tree := get_tree()
	if not tree or not tree.current_scene:
		return ""
	return str(tree.current_scene.scene_file_path)


func _first_dictionary(data: Array) -> Dictionary:
	if data.is_empty() or typeof(data[0]) != TYPE_DICTIONARY:
		return {}
	var first: Dictionary = data[0]
	return first.duplicate(true)
