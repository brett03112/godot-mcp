@tool
class_name GodotMCPLiveDebuggerBridge
extends EditorDebuggerPlugin

const MESSAGE_NAMESPACE := "godot_mcp"

var _state: GodotMCPLiveSessionState
var _sessions: Dictionary = {}
var _active_session_id: int = -1
var _last_ping: Dictionary = {}


func configure(state: GodotMCPLiveSessionState) -> void:
	_state = state


func _has_capture(capture: String) -> bool:
	return str(capture) == MESSAGE_NAMESPACE


func _capture(message: String, data: Array, session_id: int) -> bool:
	if not message.begins_with("%s:" % MESSAGE_NAMESPACE):
		return false

	var record := _ensure_session(session_id)
	var runtime_message := message.substr(MESSAGE_NAMESPACE.length() + 1)
	record["state"] = "running"
	record["last_message"] = message
	record["last_message_data"] = _copy_array(data)
	record["last_message_unix"] = Time.get_unix_time_from_system()
	_active_session_id = session_id

	match runtime_message:
		"runtime_ready":
			record["runtime"] = _first_dictionary(data)
		"pong":
			var pong := _first_dictionary(data)
			if not pong.has("roundtrip_id") and not data.is_empty():
				pong["roundtrip_id"] = str(data[0])
			pong["pong"] = true
			pong["runtime_session_id"] = session_id
			pong["received_unix"] = Time.get_unix_time_from_system()
			_last_ping = pong.duplicate(true)
			record["last_ping"] = _last_ping.duplicate(true)
		_:
			pass

	return true


func _setup_session(session_id: int) -> void:
	var record := _ensure_session(session_id)
	record["setup_unix"] = Time.get_unix_time_from_system()

	var session := get_session(session_id)
	if session:
		record["active"] = session.is_active()
		record["debuggable"] = session.is_debuggable()
		if session.is_active():
			record["state"] = "running"
			_active_session_id = session_id
		var started_callback := Callable(self, "_on_session_started").bind(session_id)
		if session.has_signal("started") and not session.is_connected("started", started_callback):
			session.connect("started", started_callback)
		var stopped_callback := Callable(self, "_on_session_stopped").bind(session_id)
		if session.has_signal("stopped") and not session.is_connected("stopped", stopped_callback):
			session.connect("stopped", stopped_callback)


func status() -> Dictionary:
	_refresh_sessions()

	var session_summaries: Array[Dictionary] = []
	for session_id in _sessions.keys():
		var record: Dictionary = _sessions[session_id]
		session_summaries.append(record.duplicate(true))

	var state_name := "stopped"
	if _active_session_id >= 0:
		state_name = "running"
	elif not session_summaries.is_empty():
		state_name = "available"

	return {
		"state": state_name,
		"active_session_id": _active_session_id if _active_session_id >= 0 else null,
		"sessions": session_summaries,
		"last_ping": _last_ping.duplicate(true),
		"message_namespace": MESSAGE_NAMESPACE,
	}


func send_ping(args: Dictionary) -> Dictionary:
	_refresh_sessions()

	var runtime_session_id := int(args.get("runtime_session_id", _active_session_id))
	if runtime_session_id < 0:
		return _error("no_runtime_session", "There is no active Godot debugger runtime session.")
	if not _sessions.has(runtime_session_id):
		return _error("runtime_session_not_found", "The requested runtime debugger session is not tracked.", {
			"runtime_session_id": runtime_session_id,
		})

	var session := get_session(runtime_session_id)
	if not session:
		return _error("runtime_session_unavailable", "The requested runtime debugger session is no longer available.", {
			"runtime_session_id": runtime_session_id,
		})
	if not session.is_active():
		return _error("runtime_session_inactive", "The requested runtime debugger session is not active.", {
			"runtime_session_id": runtime_session_id,
		})

	var roundtrip_id := str(args.get("roundtrip_id", ""))
	if roundtrip_id == "":
		roundtrip_id = "godot-mcp-ping-%s" % str(Time.get_ticks_msec())

	var payload = args.get("payload", {})
	_last_ping = {
		"roundtrip_id": roundtrip_id,
		"runtime_session_id": runtime_session_id,
		"payload": payload,
		"sent_unix": Time.get_unix_time_from_system(),
		"pong": false,
	}

	var record: Dictionary = _sessions[runtime_session_id]
	record["last_ping"] = _last_ping.duplicate(true)
	session.send_message("godot_mcp:ping", [{
		"roundtrip_id": roundtrip_id,
		"payload": payload,
	}])

	return _ok(_last_ping.duplicate(true))


func _on_session_started(session_id: int) -> void:
	var record := _ensure_session(session_id)
	record["state"] = "running"
	record["active"] = true
	record["started_unix"] = Time.get_unix_time_from_system()
	_active_session_id = session_id


func _on_session_stopped(session_id: int) -> void:
	if not _sessions.has(session_id):
		return

	var record: Dictionary = _sessions[session_id]
	record["state"] = "stopped"
	record["active"] = false
	record["stopped_unix"] = Time.get_unix_time_from_system()
	if _active_session_id == session_id:
		_active_session_id = _find_active_session_id()


func _refresh_sessions() -> void:
	for session in get_sessions():
		var session_id := int(session.get_instance_id())
		for candidate_id in _sessions.keys():
			if get_session(int(candidate_id)) == session:
				session_id = int(candidate_id)
				break
		var record := _ensure_session(session_id)
		record["active"] = session.is_active()
		record["debuggable"] = session.is_debuggable()
		if session.is_active():
			record["state"] = "running"
			_active_session_id = session_id

	if _active_session_id >= 0:
		var active_session := get_session(_active_session_id)
		if not active_session or not active_session.is_active():
			_active_session_id = _find_active_session_id()


func _find_active_session_id() -> int:
	for session_id in _sessions.keys():
		var session := get_session(int(session_id))
		if session and session.is_active():
			return int(session_id)
	return -1


func _ensure_session(session_id: int) -> Dictionary:
	if not _sessions.has(session_id):
		_sessions[session_id] = {
			"session_id": session_id,
			"state": "available",
			"active": false,
			"debuggable": false,
			"setup_unix": 0.0,
			"started_unix": 0.0,
			"stopped_unix": 0.0,
			"last_message": "",
			"last_message_data": [],
			"last_message_unix": 0.0,
			"last_ping": {},
			"runtime": {},
		}
	return _sessions[session_id]


func _first_dictionary(data: Array) -> Dictionary:
	if data.is_empty() or typeof(data[0]) != TYPE_DICTIONARY:
		return {}
	var first: Dictionary = data[0]
	return first.duplicate(true)


func _copy_array(data: Array) -> Array:
	var copy := []
	for item in data:
		if typeof(item) == TYPE_DICTIONARY:
			copy.append(item.duplicate(true))
		elif typeof(item) == TYPE_ARRAY:
			copy.append(_copy_array(item))
		else:
			copy.append(item)
	return copy


func _ok(data: Dictionary) -> Dictionary:
	return {
		"ok": true,
		"data": data,
	}


func _error(code: String, message: String, details: Dictionary = {}) -> Dictionary:
	var error := {
		"code": code,
		"message": message,
	}
	for key in details.keys():
		error[key] = details[key]
	return {
		"ok": false,
		"error": error,
	}
