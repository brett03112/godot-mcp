class_name GodotMCPLiveRuntimeBridge
extends Node

const MESSAGE_NAMESPACE := "godot_mcp"
const MAX_ASSERTION_RECORDS := 100
const MAX_RUNTIME_ERRORS := 100

var _capture_registered := false
var _assertion_records: Array[Dictionary] = []
var _recent_runtime_errors: Array[Dictionary] = []
var _signal_emissions := {}
var _signal_watchers := {}


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
		"runtime_input_key":
			data = _runtime_input_key(args)
		"runtime_input_mouse":
			data = _runtime_input_mouse(args)
		"runtime_input_gamepad":
			data = _runtime_input_gamepad(args)
		"runtime_input_action":
			data = _runtime_input_action(args)
		"runtime_input_text":
			data = _runtime_input_text(args)
		"runtime_input_state":
			data = _runtime_input_state(args)
		"runtime_wait_for_condition":
			data = _runtime_wait_for_condition(args)
		"runtime_click_ui_text":
			data = _runtime_click_ui_text(args)
		"runtime_click_ui_path":
			data = _runtime_click_ui_path(args)
		"runtime_assert_node_exists":
			data = _runtime_assert_node_exists(args)
		"runtime_assert_property_equals":
			data = _runtime_assert_property_equals(args)
		"runtime_assert_signal_emitted":
			data = _runtime_assert_signal_emitted(args)
		"runtime_assert_ui_text_visible":
			data = _runtime_assert_ui_text_visible(args)
		"runtime_assert_no_errors":
			data = _runtime_assert_no_errors(args)
		"runtime_snapshot_assertion_report":
			data = _runtime_snapshot_assertion_report(args)
		"game_eval":
			data = _game_eval(args)
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


func _game_eval(args: Dictionary) -> Dictionary:
	var code := str(args.get("code", ""))
	if code.strip_edges() == "":
		return _runtime_error_data("eval_code_required", "code is required.")
	if code.length() > 2000:
		return _runtime_error_data("eval_code_too_long", "Eval code must be 2000 characters or fewer.", {
			"code_length": code.length(),
		})

	var expression := Expression.new()
	var parse_error := expression.parse(code, [])
	if parse_error != OK:
		return _runtime_error_data("eval_parse_error", expression.get_error_text(), {
			"error_code": parse_error,
		})

	var started := Time.get_ticks_msec()
	var result = expression.execute([], null, false)
	var elapsed_ms := int(Time.get_ticks_msec() - started)
	if expression.has_execute_failed():
		return _runtime_error_data("eval_execute_error", "Expression execution failed.", {
			"elapsed_ms": elapsed_ms,
		})

	return {
		"result": _serialize_variant(result),
		"result_type": _variant_type_name(result),
		"elapsed_ms": elapsed_ms,
		"context": "game",
		"scene": _current_scene_path(),
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


func _runtime_input_key(args: Dictionary) -> Dictionary:
	var event := _make_key_event(args)
	if event.keycode == KEY_NONE and event.unicode == 0:
		return _runtime_error_data("invalid_key", "key must be a valid key name, single character, or numeric keycode.", {
			"key": args.get("key", null),
		})
	Input.parse_input_event(event)
	return {
		"event_type": "key",
		"key": str(args.get("key", "")),
		"keycode": event.keycode,
		"keycode_string": OS.get_keycode_string(event.keycode),
		"unicode": event.unicode,
		"pressed": event.pressed,
		"echo": event.echo,
	}


func _runtime_input_mouse(args: Dictionary) -> Dictionary:
	var event_type := str(args.get("event_type", "button")).to_lower()
	if event_type == "motion":
		var motion := _make_mouse_motion_event(args)
		Input.parse_input_event(motion)
		return {
			"event_type": "mouse_motion",
			"position": _serialize_variant(motion.position),
			"relative": _serialize_variant(motion.relative),
		}

	var button := _make_mouse_button_event(args)
	Input.parse_input_event(button)
	return {
		"event_type": "mouse_button",
		"position": _serialize_variant(button.position),
		"button_index": button.button_index,
		"pressed": button.pressed,
		"factor": button.factor,
	}


func _runtime_input_gamepad(args: Dictionary) -> Dictionary:
	var control := str(args.get("control", "button")).to_lower()
	if control == "axis":
		var motion := _make_gamepad_motion_event(args)
		Input.parse_input_event(motion)
		return {
			"event_type": "joypad_motion",
			"device": motion.device,
			"axis": motion.axis,
			"axis_value": motion.axis_value,
		}

	var button := _make_gamepad_button_event(args)
	Input.parse_input_event(button)
	return {
		"event_type": "joypad_button",
		"device": button.device,
		"button_index": button.button_index,
		"pressed": button.pressed,
		"pressure": button.pressure,
	}


func _runtime_input_action(args: Dictionary) -> Dictionary:
	var action := str(args.get("action", ""))
	if action == "":
		return _runtime_error_data("missing_action", "action is required.")
	var event := _make_action_event(args)
	Input.parse_input_event(event)
	return {
		"event_type": "action",
		"action": action,
		"pressed": event.pressed,
		"strength": event.strength,
	}


func _runtime_input_text(args: Dictionary) -> Dictionary:
	var text := str(args.get("text", ""))
	var key_events_sent := 0
	for index in text.length():
		var character := text.substr(index, 1)
		var key_args := {
			"key": character,
			"pressed": true,
			"unicode": character.unicode_at(0),
		}
		var press_event := _make_key_event(key_args)
		Input.parse_input_event(press_event)
		key_events_sent += 1

		key_args["pressed"] = false
		var release_event := _make_key_event(key_args)
		Input.parse_input_event(release_event)
		key_events_sent += 1

	return {
		"inserted_text": text,
		"character_count": text.length(),
		"events_sent": text.length(),
		"key_events_sent": key_events_sent,
	}


func _runtime_input_state(args: Dictionary) -> Dictionary:
	var actions_state := {}
	var actions = args.get("actions", [])
	if typeof(actions) == TYPE_ARRAY:
		for action in actions:
			var action_name := str(action)
			actions_state[action_name] = {
				"pressed": Input.is_action_pressed(action_name),
				"just_pressed": Input.is_action_just_pressed(action_name),
				"just_released": Input.is_action_just_released(action_name),
				"strength": Input.get_action_strength(action_name),
			}

	var keys_state := {}
	var keys = args.get("keys", [])
	if typeof(keys) == TYPE_ARRAY:
		for key in keys:
			var keycode := _keycode_from_value(key)
			keys_state[str(key)] = {
				"keycode": keycode,
				"keycode_string": OS.get_keycode_string(keycode),
				"pressed": Input.is_key_pressed(keycode) if keycode != KEY_NONE else false,
			}

	var mouse_state := {}
	var mouse_buttons = args.get("mouse_buttons", [])
	if typeof(mouse_buttons) == TYPE_ARRAY:
		for button in mouse_buttons:
			var button_index := int(button)
			mouse_state[str(button_index)] = {
				"button_index": button_index,
				"pressed": Input.is_mouse_button_pressed(button_index),
			}

	var device := int(args.get("device", 0))
	var gamepad_state := {}
	var gamepad_buttons = args.get("gamepad_buttons", [])
	if typeof(gamepad_buttons) == TYPE_ARRAY:
		for button in gamepad_buttons:
			var button_index := int(button)
			gamepad_state[str(button_index)] = {
				"device": device,
				"button_index": button_index,
				"pressed": Input.is_joy_button_pressed(device, button_index),
			}

	return {
		"actions": actions_state,
		"keys": keys_state,
		"mouse_buttons": mouse_state,
		"gamepad_buttons": gamepad_state,
		"mouse_position": _serialize_variant(get_viewport().get_mouse_position()) if get_viewport() else null,
	}


func _runtime_wait_for_condition(args: Dictionary) -> Dictionary:
	var timeout_ms := clampi(int(args.get("wait_timeout_ms", args.get("timeout_ms", 1000))), 0, 10000)
	var poll_interval_ms := clampi(int(args.get("poll_interval_ms", 50)), 1, 1000)
	var started := Time.get_ticks_msec()
	var deadline := started + timeout_ms
	var observed = null

	while true:
		var evaluation := _evaluate_runtime_condition(args)
		observed = evaluation.get("observed", null)
		if bool(evaluation.get("matched", false)):
			return {
				"matched": true,
				"timed_out": false,
				"kind": str(args.get("kind", "")),
				"observed": observed,
				"elapsed_ms": int(Time.get_ticks_msec() - started),
			}

		var now := Time.get_ticks_msec()
		if now >= deadline:
			return {
				"matched": false,
				"timed_out": true,
				"kind": str(args.get("kind", "")),
				"observed": observed,
				"elapsed_ms": int(now - started),
			}

		OS.delay_msec(mini(poll_interval_ms, int(deadline - now)))

	return {
		"matched": false,
		"timed_out": true,
		"kind": str(args.get("kind", "")),
		"observed": observed,
		"elapsed_ms": int(Time.get_ticks_msec() - started),
	}


func _runtime_click_ui_text(args: Dictionary) -> Dictionary:
	var text := str(args.get("text", ""))
	if text == "":
		return _runtime_error_data("missing_text", "text is required.")
	var control := _find_ui_by_text(text, bool(args.get("exact", true)))
	if not control:
		return _runtime_error_data("ui_text_not_found", "No visible Control with matching text was found.", {
			"text": text,
		})
	return _click_control(control, int(args.get("button_index", MOUSE_BUTTON_LEFT)))


func _runtime_click_ui_path(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", ""))
	if node_path == "":
		return _runtime_error_data("missing_node_path", "node_path is required.")
	var node := _find_runtime_node(node_path)
	if not node:
		return _runtime_error_data("node_not_found", "Runtime node not found: %s." % node_path, {
			"node_path": node_path,
		})
	if not node is Control:
		return _runtime_error_data("node_not_control", "Runtime node is not a Control: %s." % node_path, {
			"node_path": node_path,
			"class": node.get_class(),
		})
	return _click_control(node as Control, int(args.get("button_index", MOUSE_BUTTON_LEFT)))


func _runtime_assert_node_exists(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", "."))
	var node := _find_runtime_node(node_path)
	var observed := {
		"node_path": node_path,
		"exists": node != null,
	}
	if node:
		observed["resolved_path"] = _node_path(node)
		observed["class"] = node.get_class()
	return _assertion_record(
		"node_exists",
		node != null,
		observed,
		args,
		"runtime_get_scene_tree" if not node else ""
	)


func _runtime_assert_property_equals(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", "."))
	var property := str(args.get("property", ""))
	var node := _find_runtime_node(node_path)
	var observed = null
	var passed := false
	var suggestion := ""
	if not node:
		suggestion = "runtime_assert_node_exists"
	elif property == "":
		suggestion = "runtime_get_node_info"
	else:
		observed = _safe_get(node, property)
		passed = observed == _serialize_variant(args.get("expected", null))
		if not passed:
			suggestion = "runtime_get_node_property"
	return _assertion_record("property_equals", passed, observed, args, suggestion)


func _runtime_assert_signal_emitted(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", ""))
	var signal_name := str(args.get("signal_name", ""))
	var min_count := maxi(1, int(args.get("min_count", 1)))
	var node := _find_runtime_node(node_path)
	if not node:
		return _assertion_record("signal_emitted", false, {
			"node_path": node_path,
			"exists": false,
		}, args, "runtime_assert_node_exists")
	if signal_name == "" or not node.has_signal(StringName(signal_name)):
		return _assertion_record("signal_emitted", false, {
			"node_path": _node_path(node),
			"signal_name": signal_name,
			"signal_exists": false,
		}, args, "runtime_get_node_info")

	var track_result := _track_signal(node, signal_name)
	var key := str(track_result.get("key", _signal_key(node, signal_name)))
	var emissions: Array = _signal_emissions.get(key, [])
	var since_unix := float(args.get("since_unix", 0.0))
	var matching := []
	for emission in emissions:
		if typeof(emission) == TYPE_DICTIONARY and float(emission.get("unix", 0.0)) >= since_unix:
			matching.append(emission)

	var observed := {
		"node_path": _node_path(node),
		"signal_name": signal_name,
		"count": matching.size(),
		"min_count": min_count,
		"tracking": track_result,
		"emissions": matching,
	}
	return _assertion_record("signal_emitted", matching.size() >= min_count, observed, args, "runtime_click_ui_path")


func _runtime_assert_ui_text_visible(args: Dictionary) -> Dictionary:
	var text := str(args.get("text", ""))
	var control := _find_ui_by_text(text, bool(args.get("exact", true)))
	var observed = _control_summary(control) if control else {
		"text": text,
		"visible": false,
	}
	return _assertion_record("ui_text_visible", control != null, observed, args, "runtime_get_ui_elements")


func _runtime_assert_no_errors(args: Dictionary) -> Dictionary:
	var since_unix := float(args.get("since_unix", 0.0))
	var include_warnings := bool(args.get("include_warnings", false))
	var matching := []
	for item in _recent_runtime_errors:
		var level := str(item.get("level", "error"))
		if float(item.get("unix", 0.0)) >= since_unix and (include_warnings or level != "warning"):
			matching.append(item)
	var observed := {
		"count": matching.size(),
		"errors": matching,
	}
	return _assertion_record("no_errors", matching.is_empty(), observed, args, "runtime_snapshot_assertion_report")


func _runtime_snapshot_assertion_report(args: Dictionary) -> Dictionary:
	var include_passed := bool(args.get("include_passed", true))
	var limit := clampi(int(args.get("limit", 50)), 1, MAX_ASSERTION_RECORDS)
	var filtered: Array[Dictionary] = []
	var passed_count := 0
	var failed_count := 0
	for record in _assertion_records:
		if bool(record.get("passed", false)):
			passed_count += 1
		else:
			failed_count += 1
		if include_passed or not bool(record.get("passed", false)):
			filtered.append(record)
	var start_index = maxi(0, filtered.size() - limit)
	return {
		"assertions": filtered.slice(start_index, filtered.size()),
		"summary": {
			"total": _assertion_records.size(),
			"passed": passed_count,
			"failed": failed_count,
		},
		"recent_errors": _recent_runtime_errors,
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


func _find_ui_by_text(text: String, exact: bool) -> Control:
	var root := _current_scene_root()
	if not root:
		return null
	return _find_ui_by_text_recursive(root, text, exact)


func _find_ui_by_text_recursive(node: Node, text: String, exact: bool) -> Control:
	if node is Control:
		var control := node as Control
		var control_text := str(_safe_get(control, "text")) if _has_property(control, "text") else ""
		var matches := control_text == text if exact else control_text.to_lower().contains(text.to_lower())
		if matches and control.is_visible_in_tree():
			return control
	for child in node.get_children():
		if child is Node:
			var found := _find_ui_by_text_recursive(child, text, exact)
			if found:
				return found
	return null


func _click_control(control: Control, button_index: int) -> Dictionary:
	var rect := control.get_global_rect()
	var center := rect.position + rect.size / 2.0
	var motion := _make_mouse_motion_event({
		"position": center,
		"relative": Vector2.ZERO,
	})
	Input.parse_input_event(motion)
	var press := _make_mouse_button_event({
		"position": center,
		"button_index": button_index,
		"pressed": true,
	})
	Input.parse_input_event(press)
	var release := _make_mouse_button_event({
		"position": center,
		"button_index": button_index,
		"pressed": false,
	})
	Input.parse_input_event(release)
	return {
		"clicked": true,
		"target": _control_summary(control),
		"position": _serialize_variant(center),
		"button_index": button_index,
	}


func _assertion_record(assertion: String, passed: bool, observed, args: Dictionary, suggested_next_probe: String) -> Dictionary:
	var record := {
		"assertion": assertion,
		"assertion_id": str(args.get("assertion_id", "")),
		"passed": passed,
		"observed": observed,
		"suggested_next_probe": suggested_next_probe,
		"unix": Time.get_unix_time_from_system(),
	}
	if args.has("expected"):
		record["expected"] = _serialize_variant(args.get("expected"))
	_assertion_records.append(record)
	while _assertion_records.size() > MAX_ASSERTION_RECORDS:
		_assertion_records.pop_front()
	return record


func _track_signal(node: Node, signal_name: String) -> Dictionary:
	var key := _signal_key(node, signal_name)
	if not _signal_emissions.has(key):
		_signal_emissions[key] = []
	if _signal_watchers.has(key):
		return {
			"key": key,
			"connected": true,
			"already_tracking": true,
		}
	var callable := Callable(self, "_record_signal_emitted").bind(key)
	var error := node.connect(StringName(signal_name), callable)
	var connected := error == OK or error == ERR_INVALID_PARAMETER
	if connected:
		_signal_watchers[key] = true
	return {
		"key": key,
		"connected": connected,
		"already_tracking": error == ERR_INVALID_PARAMETER,
		"error_code": error,
	}


func _record_signal_emitted(key: String) -> void:
	if not _signal_emissions.has(key):
		_signal_emissions[key] = []
	_signal_emissions[key].append({
		"unix": Time.get_unix_time_from_system(),
		"ticks_msec": Time.get_ticks_msec(),
	})


func _signal_key(node: Node, signal_name: String) -> String:
	return "%s::%s" % [_node_path(node), signal_name]


func _collect_groups(node: Node, groups: Dictionary) -> void:
	for group in node.get_groups():
		var group_name := str(group)
		if not groups.has(group_name):
			groups[group_name] = []
		groups[group_name].append(_node_path(node))
	for child in node.get_children():
		if child is Node:
			_collect_groups(child, groups)


func _evaluate_runtime_condition(args: Dictionary) -> Dictionary:
	var kind := str(args.get("kind", ""))
	match kind:
		"node_property":
			var node_path := str(args.get("node_path", "."))
			var property := str(args.get("property", ""))
			var node := _find_runtime_node(node_path)
			var observed = null
			if node and property != "":
				observed = _safe_get(node, property)
			return {
				"matched": _condition_value_matches(observed, args),
				"observed": observed,
			}
		"ui_text":
			var text := str(args.get("text", ""))
			var control := _find_ui_by_text(text, bool(args.get("exact", true)))
			var observed = _control_summary(control) if control else null
			return {
				"matched": control != null,
				"observed": observed,
			}
		"action":
			var action := str(args.get("action", ""))
			var pressed := Input.is_action_pressed(action) if action != "" else false
			var expected_pressed := bool(args.get("pressed", true))
			return {
				"matched": pressed == expected_pressed,
				"observed": {
					"action": action,
					"pressed": pressed,
					"strength": Input.get_action_strength(action) if action != "" else 0.0,
				},
			}
		_:
			return {
				"matched": false,
				"observed": {
					"error": "unsupported_condition_kind",
					"kind": kind,
				},
			}


func _condition_value_matches(observed, args: Dictionary) -> bool:
	if args.has("equals"):
		return observed == _serialize_variant(args.get("equals"))
	if args.has("contains"):
		return _value_contains(observed, str(args.get("contains", "")))
	return bool(observed)


func _value_contains(observed, expected: String) -> bool:
	if observed == null:
		return false
	if typeof(observed) == TYPE_STRING:
		return str(observed).contains(expected)
	if typeof(observed) == TYPE_ARRAY:
		for item in observed:
			if str(item).contains(expected):
				return true
		return false
	if typeof(observed) == TYPE_DICTIONARY:
		return JSON.stringify(observed).contains(expected)
	return str(observed).contains(expected)


func _make_key_event(args: Dictionary) -> InputEventKey:
	var event := InputEventKey.new()
	var keycode := _keycode_from_value(args.get("key", KEY_NONE))
	event.keycode = keycode
	event.physical_keycode = keycode
	event.unicode = int(args.get("unicode", 0))
	if event.unicode == 0 and typeof(args.get("key", null)) == TYPE_STRING:
		var key_text := str(args.get("key", ""))
		if key_text.length() == 1:
			event.unicode = key_text.unicode_at(0)
	event.pressed = bool(args.get("pressed", true))
	event.echo = bool(args.get("echo", false))
	return event


func _make_mouse_button_event(args: Dictionary) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	var position := _vector2_from_value(args.get("position", get_viewport().get_mouse_position() if get_viewport() else Vector2.ZERO))
	event.position = position
	event.global_position = position
	event.button_index = int(args.get("button_index", MOUSE_BUTTON_LEFT))
	event.pressed = bool(args.get("pressed", true))
	event.factor = float(args.get("factor", 1.0))
	return event


func _make_mouse_motion_event(args: Dictionary) -> InputEventMouseMotion:
	var event := InputEventMouseMotion.new()
	var position := _vector2_from_value(args.get("position", get_viewport().get_mouse_position() if get_viewport() else Vector2.ZERO))
	event.position = position
	event.global_position = position
	event.relative = _vector2_from_value(args.get("relative", Vector2.ZERO))
	return event


func _make_action_event(args: Dictionary) -> InputEventAction:
	var event := InputEventAction.new()
	event.action = str(args.get("action", ""))
	event.pressed = bool(args.get("pressed", true))
	event.strength = float(args.get("strength", 1.0 if event.pressed else 0.0))
	return event


func _make_gamepad_button_event(args: Dictionary) -> InputEventJoypadButton:
	var event := InputEventJoypadButton.new()
	event.device = int(args.get("device", 0))
	event.button_index = int(args.get("index", args.get("button_index", 0)))
	event.pressed = bool(args.get("pressed", true))
	event.pressure = float(args.get("value", 1.0 if event.pressed else 0.0))
	return event


func _make_gamepad_motion_event(args: Dictionary) -> InputEventJoypadMotion:
	var event := InputEventJoypadMotion.new()
	event.device = int(args.get("device", 0))
	event.axis = int(args.get("index", args.get("axis", 0)))
	event.axis_value = float(args.get("value", 0.0))
	return event


func _keycode_from_value(value) -> int:
	match typeof(value):
		TYPE_INT:
			return int(value)
		TYPE_FLOAT:
			return int(value)
		TYPE_STRING:
			var text := str(value).strip_edges()
			if text == "":
				return KEY_NONE
			var keycode := OS.find_keycode_from_string(text)
			if keycode != KEY_NONE:
				return keycode
			if text.length() == 1:
				return OS.find_keycode_from_string(text.to_upper())
			return KEY_NONE
		_:
			return KEY_NONE


func _vector2_from_value(value) -> Vector2:
	match typeof(value):
		TYPE_VECTOR2:
			return value
		TYPE_VECTOR2I:
			return Vector2(value)
		TYPE_ARRAY:
			if value.size() >= 2:
				return Vector2(float(value[0]), float(value[1]))
		TYPE_DICTIONARY:
			if value.has("x") and value.has("y"):
				return Vector2(float(value["x"]), float(value["y"]))
			if value.has("value") and typeof(value["value"]) == TYPE_ARRAY and value["value"].size() >= 2:
				return Vector2(float(value["value"][0]), float(value["value"][1]))
	return Vector2.ZERO


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


func _variant_type_name(value) -> String:
	match typeof(value):
		TYPE_NIL:
			return "nil"
		TYPE_BOOL:
			return "bool"
		TYPE_INT:
			return "int"
		TYPE_FLOAT:
			return "float"
		TYPE_STRING:
			return "String"
		TYPE_STRING_NAME:
			return "StringName"
		TYPE_NODE_PATH:
			return "NodePath"
		TYPE_ARRAY:
			return "Array"
		TYPE_DICTIONARY:
			return "Dictionary"
		TYPE_OBJECT:
			return value.get_class() if value else "Object"
		_:
			return str(typeof(value))


func _runtime_error_data(code: String, message: String, details: Dictionary = {}) -> Dictionary:
	var result := {
		"error": {
			"code": code,
			"message": message,
		}
	}
	for key in details.keys():
		result["error"][key] = details[key]
	_recent_runtime_errors.append({
		"unix": Time.get_unix_time_from_system(),
		"level": "error",
		"code": code,
		"message": message,
		"details": details,
	})
	while _recent_runtime_errors.size() > MAX_RUNTIME_ERRORS:
		_recent_runtime_errors.pop_front()
	return result
