@tool
class_name GodotMCPLiveCommandDispatcher
extends RefCounted

const DEFAULT_HIERARCHY_DEPTH := 8
const MAX_LOG_RECORDS := 200

var _editor_plugin: EditorPlugin
var _state: GodotMCPLiveSessionState
var _logs: Array[Dictionary] = []


func configure(editor_plugin: EditorPlugin, state: GodotMCPLiveSessionState) -> void:
	_editor_plugin = editor_plugin
	_state = state


func handle_message(message: Dictionary) -> Dictionary:
	var command := str(message.get("command", ""))
	var request_id := message.get("request_id", null)
	var args = message.get("args", {})
	if typeof(args) != TYPE_DICTIONARY:
		args = {}

	_state.touch_heartbeat()
	_record_log("debug", "command_received", command)

	var result: Dictionary
	match command:
		"editor_state":
			result = _handle_editor_state()
		"scene_current":
			result = _handle_scene_current()
		"scene_open":
			result = _handle_scene_open(args)
		"scene_save_active":
			result = _handle_scene_save_active()
		"scene_reload_active":
			result = _handle_scene_reload_active()
		"selection_get":
			result = _handle_selection_get()
		"selection_set":
			result = _handle_selection_set(args)
		"editor_screenshot":
			result = _handle_editor_screenshot(args)
		"logs_read_editor":
			result = _handle_logs_read_editor(args)
		"logs_clear":
			result = _handle_logs_clear()
		"editor_monitors_get":
			result = _handle_editor_monitors_get(args)
		"editor_quit":
			result = _handle_editor_quit(args)
		_:
			result = _error("unsupported_command", "Unsupported live editor command: %s." % command, {
				"command": command,
			})

	_refresh_state()
	if bool(result.get("ok", false)):
		return {
			"kind": "command_response",
			"request_id": request_id,
			"status": "success",
			"data": result.get("data", {}),
			"session": _state.to_dictionary(),
		}

	return {
		"kind": "command_response",
		"request_id": request_id,
		"status": "error",
		"error": result.get("error", {}),
		"session": _state.to_dictionary(),
	}


func _handle_editor_state() -> Dictionary:
	_refresh_state()
	return _ok({
		"active_scene": _state.active_scene,
		"open_scenes": _state.open_scenes,
		"selected_nodes": _state.selected_nodes,
		"play_state": _state.play_state,
		"writable": _state.writable,
		"editor_pid": _state.editor_pid,
		"connection_state": _state.connection_state,
		"monitors": _collect_monitors([]),
	})


func _handle_scene_current() -> Dictionary:
	return _current_scene_data(true)


func _handle_scene_open(args: Dictionary) -> Dictionary:
	var scene_path := str(args.get("scene_path", ""))
	if scene_path == "":
		return _error("missing_scene_path", "scene_path is required.")

	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	editor.open_scene_from_path(scene_path)
	_refresh_state()
	return _current_scene_data(true)


func _handle_scene_save_active() -> Dictionary:
	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var root := editor.get_edited_scene_root()
	if not root:
		return _error("no_active_scene", "There is no active scene to save.")

	var scene_path := str(root.scene_file_path)
	var err := editor.save_scene()
	if err != OK:
		return _error("save_failed", "EditorInterface.save_scene failed with error %s." % err, {
			"error_code": err,
			"scene_path": scene_path,
		})

	_refresh_state()
	return _ok({
		"saved": true,
		"scene_path": scene_path,
		"error_code": err,
	})


func _handle_scene_reload_active() -> Dictionary:
	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var root := editor.get_edited_scene_root()
	if not root or root.scene_file_path == "":
		return _error("no_active_scene", "There is no active scene to reload.")

	var scene_path := str(root.scene_file_path)
	editor.reload_scene_from_path(scene_path)
	_refresh_state()
	return _ok({
		"reloaded": true,
		"scene_path": scene_path,
	})


func _handle_selection_get() -> Dictionary:
	return _ok({
		"selected_nodes": _selected_node_data(),
	})


func _handle_selection_set(args: Dictionary) -> Dictionary:
	var node_paths = args.get("node_paths", [])
	if typeof(node_paths) != TYPE_ARRAY:
		return _error("invalid_node_paths", "node_paths must be an array of scene-root-relative node paths.")

	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var root := editor.get_edited_scene_root()
	if not root:
		return _error("no_active_scene", "There is no active scene for selection.")

	var nodes: Array[Node] = []
	var missing: Array[String] = []
	for raw_path in node_paths:
		var node := _resolve_node_path(root, str(raw_path))
		if node:
			nodes.append(node)
		else:
			missing.append(str(raw_path))

	if missing.size() > 0:
		return _error("node_not_found", "One or more node paths do not exist in the active scene.", {
			"missing_node_paths": missing,
		})

	var selection := editor.get_selection()
	if bool(args.get("replace", true)):
		selection.clear()

	for node in nodes:
		selection.add_node(node)

	if nodes.size() > 0:
		editor.edit_node(nodes[0])

	_refresh_state()
	return _ok({
		"selected_nodes": _selected_node_data(),
	})


func _handle_editor_screenshot(args: Dictionary) -> Dictionary:
	var output_path := str(args.get("output_path", ""))
	if output_path == "":
		return _error("missing_output_path", "output_path is required.")

	var res_output_path := _normalize_res_output_path(output_path)
	if res_output_path == "":
		return _error("invalid_output_path", "output_path must stay inside res:// and cannot contain '..'.")

	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var viewport_name := str(args.get("viewport", "2d")).to_lower()
	var viewport_index := int(args.get("viewport_index", 0))
	var viewport: SubViewport
	if viewport_name == "3d":
		viewport = editor.get_editor_viewport_3d(viewport_index)
	else:
		viewport = editor.get_editor_viewport_2d()
		viewport_name = "2d"

	if not viewport:
		return _error("viewport_unavailable", "The requested editor viewport is not available.", {
			"viewport": viewport_name,
			"viewport_index": viewport_index,
		})

	var texture := viewport.get_texture()
	if not texture:
		return _error("screenshot_unavailable", "The requested editor viewport does not expose a texture.")

	var image := texture.get_image()
	if not image:
		return _error("screenshot_unavailable", "The requested editor viewport did not return an image.")

	var absolute_output_path := ProjectSettings.globalize_path(res_output_path)
	var output_dir := absolute_output_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(output_dir):
		var mkdir_err := DirAccess.make_dir_recursive_absolute(output_dir)
		if mkdir_err != OK:
			return _error("screenshot_directory_failed", "Could not create screenshot output directory.", {
				"error_code": mkdir_err,
				"full_path": absolute_output_path,
			})

	var err := image.save_png(absolute_output_path)
	if err != OK:
		return _error("screenshot_save_failed", "Could not save editor screenshot.", {
			"error_code": err,
			"full_path": absolute_output_path,
		})

	return _ok({
		"saved": true,
		"output_path": res_output_path,
		"full_path": absolute_output_path,
		"width": image.get_width(),
		"height": image.get_height(),
		"viewport": viewport_name,
		"viewport_index": viewport_index,
	})


func _handle_logs_read_editor(args: Dictionary) -> Dictionary:
	var limit := int(args.get("limit", _logs.size()))
	if limit <= 0:
		limit = _logs.size()

	var start_index = max(0, _logs.size() - limit)
	return _ok({
		"source": "godot_mcp_live_addon",
		"count": _logs.size() - start_index,
		"logs": _logs.slice(start_index, _logs.size()),
	})


func _handle_logs_clear() -> Dictionary:
	var cleared := _logs.size()
	_logs.clear()
	return _ok({
		"cleared_count": cleared,
	})


func _handle_editor_monitors_get(args: Dictionary) -> Dictionary:
	var monitors = args.get("monitors", [])
	if typeof(monitors) != TYPE_ARRAY:
		return _error("invalid_monitors", "monitors must be an array of Performance monitor names.")

	return _ok({
		"monitors": _collect_monitors(monitors),
	})


func _handle_editor_quit(args: Dictionary) -> Dictionary:
	if not bool(args.get("confirm", false)):
		return _error("confirmation_required", "editor_quit requires confirm: true.")

	var editor := _get_editor_interface()
	if editor and bool(args.get("save", true)):
		editor.save_all_scenes()

	if _editor_plugin and _editor_plugin.get_tree():
		var tree := _editor_plugin.get_tree()
		tree.create_timer(0.5).timeout.connect(tree.quit)

	return _ok({
		"quit_scheduled": true,
		"save_requested": bool(args.get("save", true)),
	})


func _current_scene_data(include_hierarchy: bool = true) -> Dictionary:
	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var root := editor.get_edited_scene_root()
	var data := {
		"active_scene": _state.active_scene,
		"open_scenes": _state.open_scenes,
		"root_name": "",
		"root_type": "",
		"root_path": "",
		"hierarchy": [],
	}

	if not root:
		return _ok(data)

	data["active_scene"] = str(root.scene_file_path)
	data["root_name"] = str(root.name)
	data["root_type"] = root.get_class()
	data["root_path"] = "."
	if include_hierarchy:
		data["hierarchy"] = [_serialize_node(root, root, 0, DEFAULT_HIERARCHY_DEPTH)]

	return _ok(data)


func _selected_node_data() -> Array[Dictionary]:
	var editor := _get_editor_interface()
	if not editor:
		return []

	var root := editor.get_edited_scene_root()
	var selection := editor.get_selection()
	if not selection:
		return []

	var selected: Array[Dictionary] = []
	for node in selection.get_selected_nodes():
		selected.append({
			"path": _node_live_path(root, node),
			"name": str(node.name),
			"type": node.get_class(),
			"scene_file_path": str(node.scene_file_path),
		})
	return selected


func _serialize_node(node: Node, root: Node, depth: int, max_depth: int) -> Dictionary:
	var children: Array[Dictionary] = []
	if depth < max_depth:
		for child in node.get_children():
			if child is Node:
				children.append(_serialize_node(child, root, depth + 1, max_depth))

	return {
		"path": _node_live_path(root, node),
		"name": str(node.name),
		"type": node.get_class(),
		"child_count": node.get_child_count(),
		"children": children,
	}


func _resolve_node_path(root: Node, node_path: String) -> Node:
	if not root:
		return null
	if node_path == "" or node_path == ".":
		return root

	var path := NodePath(node_path)
	if root.has_node(path):
		return root.get_node(path)
	return null


func _node_live_path(root: Node, node: Node) -> String:
	if not node:
		return ""
	if root and node == root:
		return "."
	if root and root.is_ancestor_of(node):
		return str(root.get_path_to(node))
	return str(node.get_path())


func _collect_monitors(requested_monitors: Array) -> Dictionary:
	var monitor_ids := {
		"TIME_FPS": Performance.TIME_FPS,
		"TIME_PROCESS": Performance.TIME_PROCESS,
		"TIME_PHYSICS_PROCESS": Performance.TIME_PHYSICS_PROCESS,
		"OBJECT_COUNT": Performance.OBJECT_COUNT,
		"OBJECT_RESOURCE_COUNT": Performance.OBJECT_RESOURCE_COUNT,
		"OBJECT_NODE_COUNT": Performance.OBJECT_NODE_COUNT,
		"OBJECT_ORPHAN_NODE_COUNT": Performance.OBJECT_ORPHAN_NODE_COUNT,
		"RENDER_TOTAL_DRAW_CALLS_IN_FRAME": Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME,
		"RENDER_TOTAL_PRIMITIVES_IN_FRAME": Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME,
		"RENDER_VIDEO_MEM_USED": Performance.RENDER_VIDEO_MEM_USED,
	}

	var names: Array = requested_monitors
	if names.is_empty():
		names = ["TIME_FPS", "TIME_PROCESS", "OBJECT_COUNT", "OBJECT_NODE_COUNT", "OBJECT_ORPHAN_NODE_COUNT"]

	var values := {}
	var unknown: Array[String] = []
	for raw_name in names:
		var name := str(raw_name)
		if monitor_ids.has(name):
			values[name] = Performance.get_monitor(monitor_ids[name])
		else:
			unknown.append(name)

	return {
		"values": values,
		"unknown": unknown,
	}


func _normalize_res_output_path(output_path: String) -> String:
	var cleaned := output_path.replace("\\", "/").strip_edges()
	if cleaned.contains(".."):
		return ""
	if cleaned.begins_with("res://"):
		return cleaned
	while cleaned.begins_with("/"):
		cleaned = cleaned.substr(1)
	if cleaned == "":
		return ""
	return "res://%s" % cleaned


func _refresh_state() -> void:
	var editor := _get_editor_interface()
	if editor and _state:
		_state.update_editor_snapshot(editor)


func _get_editor_interface() -> EditorInterface:
	if not _editor_plugin:
		return null
	return _editor_plugin.get_editor_interface()


func _record_log(level: String, event: String, message: String) -> void:
	_logs.append({
		"unix": Time.get_unix_time_from_system(),
		"level": level,
		"event": event,
		"message": message,
	})
	while _logs.size() > MAX_LOG_RECORDS:
		_logs.pop_front()


func _ok(data: Dictionary) -> Dictionary:
	return {
		"ok": true,
		"data": data,
	}


func _error(code: String, message: String, details: Dictionary = {}) -> Dictionary:
	_record_log("error", code, message)
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
