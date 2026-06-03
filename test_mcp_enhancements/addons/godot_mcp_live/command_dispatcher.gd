@tool
class_name GodotMCPLiveCommandDispatcher
extends RefCounted

var _editor_plugin: EditorPlugin
var _state: GodotMCPLiveSessionState


func configure(editor_plugin: EditorPlugin, state: GodotMCPLiveSessionState) -> void:
	_editor_plugin = editor_plugin
	_state = state


func handle_message(message: Dictionary) -> Dictionary:
	var command := str(message.get("command", ""))
	var request_id := message.get("request_id", null)
	_state.touch_heartbeat()

	return {
		"kind": "command_response",
		"request_id": request_id,
		"status": "error",
		"error": {
			"code": "unsupported_command",
			"message": "Phase 2.1 live addon skeleton received a command before Phase 2.2 protocol support exists.",
			"command": command,
		},
		"session": _state.to_dictionary(),
	}
