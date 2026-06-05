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
		"inspection_request":
			var request := _first_dictionary(data)
			EngineDebugger.send_message("godot_mcp:inspection_result", [_handle_inspection_request(request)])
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


func _handle_inspection_request(request: Dictionary) -> Dictionary:
	var request_id := str(request.get("request_id", ""))
	var command := str(request.get("command", ""))
	var args = request.get("args", {})
	if typeof(args) != TYPE_DICTIONARY:
		args = {}

	var data: Dictionary
	match command:
		"runtime_get_scene_tree":
			data = _runtime_scene_tree(args)
		"runtime_get_node_info":
			data = _runtime_node_info(args)
		"runtime_get_node_property":
			data = _runtime_node_property(args)
		"runtime_watch_node":
			data = _runtime_watch_node(args)
		"runtime_get_ui_elements":
			data = _runtime_ui_elements(args)
		"runtime_get_focus_owner":
			data = _runtime_focus_owner()
		"runtime_get_viewport_info":
			data = _runtime_viewport_info()
		"runtime_get_performance_metrics":
			data = _runtime_performance_metrics()
		"runtime_get_input_map":
			data = _runtime_input_map()
		"runtime_get_groups":
			data = _runtime_groups()
		_:
			return {
				"ok": false,
				"request_id": request_id,
				"error_code": "unsupported_runtime_command",
				"message": "Unsupported runtime inspection command: %s." % command,
			}

	return {
		"ok": true,
		"request_id": request_id,
		"command": command,
		"data": data,
	}


func _runtime_scene_tree(args: Dictionary) -> Dictionary:
	var root := _current_scene_root()
	if not root:
		return _runtime_error_data("no_current_scene", "The runtime does not have a current scene.")

	var max_depth := int(args.get("max_depth", 8))
	if max_depth < 0:
		max_depth = 0
	var include_properties := bool(args.get("include_properties", false))
	return {
		"scene": _current_scene_path(),
		"root": _node_tree(root, max_depth, include_properties, 0),
	}


func _runtime_node_info(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", "."))
	var node := _find_runtime_node(node_path)
	if not node:
		return _runtime_error_data("node_not_found", "Runtime node not found: %s." % node_path, {
			"node_path": node_path,
		})

	var include_properties := bool(args.get("include_properties", false))
	var include_groups := bool(args.get("include_groups", true))
	return {
		"node": _node_summary(node, include_properties, include_groups),
	}


func _runtime_node_property(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", "."))
	var property := str(args.get("property", ""))
	if property == "":
		return _runtime_error_data("missing_property", "property is required.")
	var node := _find_runtime_node(node_path)
	if not node:
		return _runtime_error_data("node_not_found", "Runtime node not found: %s." % node_path, {
			"node_path": node_path,
		})
	return {
		"node_path": _node_path(node),
		"property": property,
		"value": _safe_get(node, property),
	}


func _runtime_watch_node(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", "."))
	var node := _find_runtime_node(node_path)
	if not node:
		return _runtime_error_data("node_not_found", "Runtime node not found: %s." % node_path, {
			"node_path": node_path,
		})

	var properties = args.get("properties", [])
	if typeof(properties) != TYPE_ARRAY or properties.is_empty():
		properties = ["name", "visible", "process_mode", "position", "global_position", "text", "disabled"]

	var values := {}
	for property_name in properties:
		values[str(property_name)] = _safe_get(node, str(property_name))

	return {
		"node_path": _node_path(node),
		"class": node.get_class(),
		"properties": values,
		"unix": Time.get_unix_time_from_system(),
	}


func _runtime_ui_elements(args: Dictionary) -> Dictionary:
	var root := _current_scene_root()
	if not root:
		return _runtime_error_data("no_current_scene", "The runtime does not have a current scene.")

	var max_depth := int(args.get("max_depth", 12))
	var include_hidden := bool(args.get("include_hidden", false))
	var include_disabled := bool(args.get("include_disabled", true))
	var controls: Array[Dictionary] = []
	_collect_ui_controls(root, controls, 0, max_depth, include_hidden, include_disabled)
	return {
		"scene": _current_scene_path(),
		"controls": controls,
		"count": controls.size(),
	}


func _runtime_focus_owner() -> Dictionary:
	var viewport := get_viewport()
	var focus_owner: Control = null
	if viewport:
		focus_owner = viewport.gui_get_focus_owner()
	return {
		"focus_owner": _control_summary(focus_owner) if focus_owner else null,
	}


func _runtime_viewport_info() -> Dictionary:
	var viewport := get_viewport()
	if not viewport:
		return _runtime_error_data("viewport_unavailable", "The runtime viewport is not available.")
	var focus_owner := viewport.gui_get_focus_owner()
	return {
		"size": _serialize_variant(viewport.get_visible_rect().size),
		"visible_rect": _serialize_variant(viewport.get_visible_rect()),
		"mouse_position": _serialize_variant(viewport.get_mouse_position()),
		"focus_owner": _control_summary(focus_owner) if focus_owner else null,
	}


func _runtime_performance_metrics() -> Dictionary:
	var monitors := {
		"TIME_FPS": Performance.get_monitor(Performance.TIME_FPS),
		"TIME_PROCESS": Performance.get_monitor(Performance.TIME_PROCESS),
		"TIME_PHYSICS_PROCESS": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS),
		"MEMORY_STATIC": Performance.get_monitor(Performance.MEMORY_STATIC),
		"MEMORY_STATIC_MAX": Performance.get_monitor(Performance.MEMORY_STATIC_MAX),
		"OBJECT_COUNT": Performance.get_monitor(Performance.OBJECT_COUNT),
		"OBJECT_RESOURCE_COUNT": Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),
		"OBJECT_NODE_COUNT": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"OBJECT_ORPHAN_NODE_COUNT": Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT),
		"RENDER_TOTAL_OBJECTS_IN_FRAME": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
		"RENDER_TOTAL_PRIMITIVES_IN_FRAME": Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
		"RENDER_TOTAL_DRAW_CALLS_IN_FRAME": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
	}
	return {
		"monitors": monitors,
		"unix": Time.get_unix_time_from_system(),
	}


func _runtime_input_map() -> Dictionary:
	var actions: Array[Dictionary] = []
	for action in InputMap.get_actions():
		var events: Array[Dictionary] = []
		for event in InputMap.action_get_events(action):
			events.append({
				"class": event.get_class(),
				"text": event.as_text(),
			})
		actions.append({
			"name": str(action),
			"deadzone": InputMap.action_get_deadzone(action),
			"events": events,
		})
	return {
		"actions": actions,
		"count": actions.size(),
	}


func _runtime_groups() -> Dictionary:
	var root := _current_scene_root()
	if not root:
		return _runtime_error_data("no_current_scene", "The runtime does not have a current scene.")

	var groups := {}
	_collect_groups(root, groups)
	var group_list: Array[Dictionary] = []
	for group_name in groups.keys():
		group_list.append({
			"name": group_name,
			"nodes": groups[group_name],
			"count": groups[group_name].size(),
		})
	return {
		"groups": group_list,
		"count": group_list.size(),
	}


func _current_scene_root() -> Node:
	var tree := get_tree()
	if not tree:
		return null
	return tree.current_scene


func _find_runtime_node(node_path: String) -> Node:
	var root := _current_scene_root()
	if not root:
		return null
	var normalized := node_path.strip_edges()
	if normalized == "" or normalized == "." or normalized == str(root.name):
		return root
	if normalized.begins_with("%s/" % str(root.name)):
		normalized = normalized.substr(str(root.name).length() + 1)
	if normalized.begins_with("/"):
		return get_tree().root.get_node_or_null(NodePath(normalized))
	return root.get_node_or_null(NodePath(normalized))


func _node_tree(node: Node, max_depth: int, include_properties: bool, depth: int) -> Dictionary:
	var summary := _node_summary(node, include_properties, true)
	if depth >= max_depth:
		summary["children"] = []
		return summary

	var children: Array[Dictionary] = []
	for child in node.get_children():
		if child is Node:
			children.append(_node_tree(child, max_depth, include_properties, depth + 1))
	summary["children"] = children
	return summary


func _node_summary(node: Node, include_properties := false, include_groups := true) -> Dictionary:
	var summary := {
		"name": str(node.name),
		"class": node.get_class(),
		"path": _node_path(node),
		"absolute_path": str(node.get_path()),
		"child_count": node.get_child_count(),
		"process_mode": node.process_mode,
		"visible": _safe_get(node, "visible") if _has_property(node, "visible") else null,
	}
	if include_groups:
		var groups: Array[String] = []
		for group in node.get_groups():
			groups.append(str(group))
		summary["groups"] = groups
	if include_properties:
		summary["properties"] = _selected_properties(node)
	return summary


func _control_summary(control: Control) -> Dictionary:
	var rect := control.get_global_rect()
	return {
		"name": str(control.name),
		"class": control.get_class(),
		"path": _node_path(control),
		"text": _safe_get(control, "text") if _has_property(control, "text") else "",
		"bounds": _serialize_variant(rect),
		"visible": control.is_visible_in_tree(),
		"disabled": bool(_safe_get(control, "disabled")) if _has_property(control, "disabled") else false,
		"focus_mode": control.focus_mode,
		"has_focus": control.has_focus(),
		"mouse_filter": control.mouse_filter,
	}


func _collect_ui_controls(node: Node, controls: Array[Dictionary], depth: int, max_depth: int, include_hidden: bool, include_disabled: bool) -> void:
	if depth > max_depth:
		return
	if node is Control:
		var control := node as Control
		var disabled := bool(_safe_get(control, "disabled")) if _has_property(control, "disabled") else false
		if (include_hidden or control.is_visible_in_tree()) and (include_disabled or not disabled):
			controls.append(_control_summary(control))
	for child in node.get_children():
		if child is Node:
			_collect_ui_controls(child, controls, depth + 1, max_depth, include_hidden, include_disabled)


func _collect_groups(node: Node, groups: Dictionary) -> void:
	for group in node.get_groups():
		var group_name := str(group)
		if not groups.has(group_name):
			groups[group_name] = []
		groups[group_name].append(_node_path(node))
	for child in node.get_children():
		if child is Node:
			_collect_groups(child, groups)


func _node_path(node: Node) -> String:
	var root := _current_scene_root()
	if not root or node == root:
		return "."
	return str(root.get_path_to(node))


func _selected_properties(node: Node) -> Dictionary:
	var properties := {}
	var names := ["name", "visible", "process_mode", "position", "global_position", "rotation", "scale", "text", "disabled"]
	for property_name in names:
		if _has_property(node, property_name):
			properties[property_name] = _safe_get(node, property_name)
	return properties


func _has_property(object: Object, property_name: String) -> bool:
	for property in object.get_property_list():
		if str(property.get("name", "")) == property_name:
			return true
	return false


func _safe_get(object: Object, property_name: String):
	if not _has_property(object, property_name):
		return null
	return _serialize_variant(object.get(property_name))


func _serialize_variant(value):
	match typeof(value):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
			return value
		TYPE_STRING_NAME, TYPE_NODE_PATH:
			return str(value)
		TYPE_VECTOR2, TYPE_VECTOR2I:
			return {"type": "Vector2i" if typeof(value) == TYPE_VECTOR2I else "Vector2", "value": [value.x, value.y]}
		TYPE_VECTOR3, TYPE_VECTOR3I:
			return {"type": "Vector3i" if typeof(value) == TYPE_VECTOR3I else "Vector3", "value": [value.x, value.y, value.z]}
		TYPE_RECT2, TYPE_RECT2I:
			return {
				"type": "Rect2i" if typeof(value) == TYPE_RECT2I else "Rect2",
				"position": [value.position.x, value.position.y],
				"size": [value.size.x, value.size.y],
			}
		TYPE_COLOR:
			return {"type": "Color", "value": [value.r, value.g, value.b, value.a]}
		TYPE_ARRAY:
			var items := []
			for item in value:
				items.append(_serialize_variant(item))
			return items
		TYPE_DICTIONARY:
			var dictionary := {}
			for key in value.keys():
				dictionary[str(key)] = _serialize_variant(value[key])
			return dictionary
		TYPE_OBJECT:
			if value is Node:
				return {"type": "Node", "path": _node_path(value)}
			if value is Resource:
				return {"type": value.get_class(), "resource_path": value.resource_path}
			return {"type": value.get_class(), "value": str(value)}
		_:
			return str(value)


func _runtime_error_data(code: String, message: String, details: Dictionary = {}) -> Dictionary:
	var result := {
		"error": {
			"code": code,
			"message": message,
		}
	}
	for key in details.keys():
		result["error"][key] = details[key]
	return result
