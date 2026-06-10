@tool
class_name GodotMCPLiveCommandDispatcher
extends RefCounted

const DEFAULT_HIERARCHY_DEPTH := 8
const MAX_LOG_RECORDS := 200

var _editor_plugin: EditorPlugin
var _state: GodotMCPLiveSessionState
var _debugger_bridge: GodotMCPLiveDebuggerBridge
var _logs: Array[Dictionary] = []


func configure(editor_plugin: EditorPlugin, state: GodotMCPLiveSessionState, debugger_bridge: GodotMCPLiveDebuggerBridge = null) -> void:
	_editor_plugin = editor_plugin
	_state = state
	_debugger_bridge = debugger_bridge


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
		"runtime_ping":
			result = _handle_runtime_ping(args)
		"runtime_play_scene":
			result = _handle_runtime_play_scene(args)
		"runtime_stop":
			result = _handle_runtime_stop()
		"editor_eval":
			result = _handle_editor_eval(args)
		"game_eval", "runtime_get_scene_tree", "runtime_get_node_info", "runtime_get_node_property", "runtime_watch_node", "runtime_get_ui_elements", "runtime_get_focus_owner", "runtime_get_viewport_info", "runtime_get_performance_metrics", "runtime_get_input_map", "runtime_get_groups", "runtime_input_key", "runtime_input_mouse", "runtime_input_gamepad", "runtime_input_action", "runtime_input_text", "runtime_input_state", "runtime_wait_for_condition", "runtime_click_ui_text", "runtime_click_ui_path", "runtime_assert_node_exists", "runtime_assert_property_equals", "runtime_assert_signal_emitted", "runtime_assert_ui_text_visible", "runtime_assert_no_errors", "runtime_snapshot_assertion_report":
			result = await _handle_runtime_inspection(command, args)
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
		"live_scene_get_hierarchy":
			result = _handle_live_scene_get_hierarchy(args)
		"live_node_get_properties":
			result = _handle_live_node_get_properties(args)
		"live_node_set_property":
			result = _handle_live_node_set_property(args)
		"live_node_create":
			result = _handle_live_node_create(args)
		"live_node_delete":
			result = _handle_live_node_delete(args)
		"live_node_duplicate":
			result = _handle_live_node_duplicate(args)
		"live_node_reparent":
			result = _handle_live_node_reparent(args)
		"live_node_rename":
			result = _handle_live_node_rename(args)
		"live_node_connect_signal":
			result = _handle_live_node_connect_signal(args)
		"live_node_disconnect_signal":
			result = _handle_live_node_disconnect_signal(args)
		"live_scene_mark_dirty":
			result = _handle_live_scene_mark_dirty()
		"live_scene_save":
			result = _handle_scene_save_active()
		"editor_filesystem_scan":
			result = _handle_editor_filesystem_scan(args)
		"editor_filesystem_reimport":
			result = _handle_editor_filesystem_reimport(args)
		"editor_resource_reload":
			result = _handle_editor_resource_reload(args)
		"editor_resource_uid_update":
			result = _handle_editor_resource_uid_update(args)
		"editor_open_resource":
			result = _handle_editor_open_resource(args)
		"editor_focus_file":
			result = _handle_editor_focus_file(args)
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
		"runtime_status": _state.runtime_status,
		"monitors": _collect_monitors([]),
	})


func _handle_runtime_ping(args: Dictionary) -> Dictionary:
	if not _debugger_bridge:
		return _error("debugger_bridge_unavailable", "The Godot MCP debugger bridge is not registered.")
	return _debugger_bridge.send_ping(args)


func _handle_runtime_play_scene(args: Dictionary) -> Dictionary:
	var scene_path := str(args.get("scene_path", ""))
	if scene_path == "":
		return _error("missing_scene_path", "scene_path is required.")
	if not scene_path.begins_with("res://"):
		return _error("invalid_scene_path", "scene_path must be a res:// path.", {
			"scene_path": scene_path,
		})
	if not ResourceLoader.exists(scene_path):
		return _error("scene_not_found", "The requested scene does not exist.", {
			"scene_path": scene_path,
		})

	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	editor.play_custom_scene(scene_path)
	_refresh_state()
	return _ok({
		"play_requested": true,
		"scene_path": scene_path,
		"runtime_status": _state.runtime_status,
	})


func _handle_runtime_stop() -> Dictionary:
	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	editor.stop_playing_scene()
	_refresh_state()
	return _ok({
		"stop_requested": true,
		"runtime_status": _state.runtime_status,
	})


func _handle_runtime_inspection(command: String, args: Dictionary) -> Dictionary:
	if not _debugger_bridge:
		return _error("debugger_bridge_unavailable", "The Godot MCP debugger bridge is not registered.")
	return await _debugger_bridge.send_inspection_request({
		"command": command,
		"args": args,
	})


func _handle_editor_eval(args: Dictionary) -> Dictionary:
	var code := str(args.get("code", ""))
	if code.strip_edges() == "":
		return _error("eval_code_required", "code is required.")
	if code.length() > 2000:
		return _error("eval_code_too_long", "Eval code must be 2000 characters or fewer.", {
			"code_length": code.length(),
		})

	var expression := Expression.new()
	var parse_error := expression.parse(code, [])
	if parse_error != OK:
		return _error("eval_parse_error", expression.get_error_text(), {
			"error_code": parse_error,
		})

	var started := Time.get_ticks_msec()
	var result = expression.execute([], null, false)
	var elapsed_ms := int(Time.get_ticks_msec() - started)
	if expression.has_execute_failed():
		return _error("eval_execute_error", "Expression execution failed.", {
			"elapsed_ms": elapsed_ms,
		})

	return _ok({
		"result": _serialize_variant(result),
		"result_type": _variant_type_name(result),
		"elapsed_ms": elapsed_ms,
		"context": "editor",
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


func _handle_live_scene_get_hierarchy(args: Dictionary) -> Dictionary:
	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var max_depth := int(args.get("max_depth", DEFAULT_HIERARCHY_DEPTH))
	if max_depth < 0:
		max_depth = DEFAULT_HIERARCHY_DEPTH
	var include_properties := bool(args.get("include_properties", false))

	return _ok({
		"active_scene": str(root.scene_file_path),
		"root_name": str(root.name),
		"root_type": root.get_class(),
		"root_path": ".",
		"hierarchy": [_serialize_node(root, root, 0, max_depth, include_properties)],
	})


func _handle_live_node_get_properties(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", ""))
	if node_path == "":
		return _error("missing_node_path", "node_path is required.")

	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var node := _resolve_node_path(root, node_path)
	if not node:
		return _error("node_not_found", "Node path does not exist in the active scene.", {
			"node_path": node_path,
		})

	var property_names = args.get("property_names", [])
	if typeof(property_names) != TYPE_ARRAY:
		return _error("invalid_property_names", "property_names must be an array when provided.")

	var names := _property_names_for_node(node, property_names)
	var properties := {}
	var missing: Array[String] = []
	for property_name in names:
		if _node_has_property(node, property_name):
			properties[property_name] = _serialize_variant(node.get(property_name))
		else:
			missing.append(property_name)

	return _ok({
		"path": _node_live_path(root, node),
		"name": str(node.name),
		"type": node.get_class(),
		"properties": properties,
		"missing_properties": missing,
	})


func _handle_live_node_set_property(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", ""))
	var property_name := str(args.get("property_name", ""))
	if node_path == "":
		return _error("missing_node_path", "node_path is required.")
	if property_name == "":
		return _error("missing_property_name", "property_name is required.")
	if not args.has("property_value"):
		return _error("missing_property_value", "property_value is required.")

	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var node := _resolve_node_path(root, node_path)
	if not node:
		return _error("node_not_found", "Node path does not exist in the active scene.", {
			"node_path": node_path,
		})
	if not _node_has_property(node, property_name):
		return _error("property_not_found", "The requested property does not exist on the node.", {
			"node_path": node_path,
			"property_name": property_name,
		})

	var old_value = node.get(property_name)
	var new_value = _decode_variant(args.get("property_value"))
	node.set(property_name, new_value)

	var marked_dirty := bool(args.get("mark_dirty", true))
	if marked_dirty:
		_mark_scene_dirty(root)

	return _ok({
		"path": _node_live_path(root, node),
		"property_name": property_name,
		"old_value": _serialize_variant(old_value),
		"new_value": _serialize_variant(node.get(property_name)),
		"marked_dirty": marked_dirty,
	})


func _handle_live_node_create(args: Dictionary) -> Dictionary:
	var parent_path := str(args.get("parent_path", ""))
	var node_type := str(args.get("node_type", ""))
	var node_name := str(args.get("node_name", ""))
	if parent_path == "":
		return _error("missing_parent_path", "parent_path is required.")
	if node_type == "":
		return _error("missing_node_type", "node_type is required.")
	if node_name == "":
		return _error("missing_node_name", "node_name is required.")
	if not ClassDB.class_exists(node_type):
		return _error("unknown_node_type", "Godot class does not exist.", {
			"node_type": node_type,
		})

	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var parent := _resolve_node_path(root, parent_path)
	if not parent:
		return _error("parent_not_found", "Parent path does not exist in the active scene.", {
			"parent_path": parent_path,
		})

	var instance = ClassDB.instantiate(node_type)
	if not instance or not (instance is Node):
		if instance:
			instance.free()
		return _error("invalid_node_type", "Godot class is not a Node.", {
			"node_type": node_type,
		})

	var node: Node = instance
	node.name = node_name
	parent.add_child(node, true)
	node.owner = root
	_set_owner_recursive(node, root)

	var applied := _apply_node_properties(node, args.get("properties", {}))
	if not bool(applied.get("ok", false)):
		parent.remove_child(node)
		node.free()
		return applied

	_mark_scene_dirty(root)
	if bool(args.get("select", false)):
		_select_single_node(node)

	return _ok({
		"created": true,
		"path": _node_live_path(root, node),
		"name": str(node.name),
		"type": node.get_class(),
		"parent_path": _node_live_path(root, parent),
		"applied_properties": applied.get("properties", {}),
	})


func _handle_live_node_delete(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", ""))
	if node_path == "":
		return _error("missing_node_path", "node_path is required.")
	if node_path == ".":
		return _error("cannot_delete_root", "The active scene root cannot be deleted.")

	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var target := _resolve_node_path(root, node_path)
	if not target:
		return _error("node_not_found", "Node path does not exist in the active scene.", {
			"node_path": node_path,
		})

	var parent := target.get_parent()
	var removed_path := _node_live_path(root, target)
	var reparented_children: Array[String] = []
	if bool(args.get("keep_children", false)):
		var children := target.get_children()
		for child in children:
			if child is Node:
				var child_node: Node = child
				target.remove_child(child_node)
				parent.add_child(child_node)
				child_node.owner = root
				_set_owner_recursive(child_node, root)
				reparented_children.append(_node_live_path(root, child_node))

	parent.remove_child(target)
	target.queue_free()
	_mark_scene_dirty(root)

	return _ok({
		"deleted": true,
		"path": removed_path,
		"parent_path": _node_live_path(root, parent),
		"keep_children": bool(args.get("keep_children", false)),
		"reparented_children": reparented_children,
	})


func _handle_live_node_duplicate(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", ""))
	if node_path == "":
		return _error("missing_node_path", "node_path is required.")
	if node_path == ".":
		return _error("cannot_duplicate_root", "The active scene root cannot be duplicated.")

	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var target := _resolve_node_path(root, node_path)
	if not target:
		return _error("node_not_found", "Node path does not exist in the active scene.", {
			"node_path": node_path,
		})

	var duplicate = target.duplicate()
	if not duplicate or not (duplicate is Node):
		return _error("duplicate_failed", "Godot failed to duplicate the requested node.", {
			"node_path": node_path,
		})

	var duplicate_node: Node = duplicate
	var new_name := str(args.get("new_name", ""))
	if new_name != "":
		duplicate_node.name = new_name
	else:
		duplicate_node.name = "%sCopy" % str(target.name)

	var parent := target.get_parent()
	parent.add_child(duplicate_node, true)
	duplicate_node.owner = root
	_set_owner_recursive(duplicate_node, root)
	_mark_scene_dirty(root)
	if bool(args.get("select", false)):
		_select_single_node(duplicate_node)

	return _ok({
		"duplicated": true,
		"original_path": _node_live_path(root, target),
		"new_path": _node_live_path(root, duplicate_node),
		"new_name": str(duplicate_node.name),
		"type": duplicate_node.get_class(),
	})


func _handle_live_node_reparent(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", ""))
	var new_parent_path := str(args.get("new_parent_path", ""))
	if node_path == "":
		return _error("missing_node_path", "node_path is required.")
	if new_parent_path == "":
		return _error("missing_new_parent_path", "new_parent_path is required.")
	if node_path == ".":
		return _error("cannot_reparent_root", "The active scene root cannot be reparented.")

	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var target := _resolve_node_path(root, node_path)
	var new_parent := _resolve_node_path(root, new_parent_path)
	if not target:
		return _error("node_not_found", "Node path does not exist in the active scene.", {
			"node_path": node_path,
		})
	if not new_parent:
		return _error("parent_not_found", "New parent path does not exist in the active scene.", {
			"new_parent_path": new_parent_path,
		})
	if target == new_parent or target.is_ancestor_of(new_parent):
		return _error("invalid_reparent", "A node cannot be reparented under itself or one of its descendants.", {
			"node_path": node_path,
			"new_parent_path": new_parent_path,
		})

	var old_path := _node_live_path(root, target)
	var old_parent_path := _node_live_path(root, target.get_parent())
	var keep_global_transform := bool(args.get("keep_global_transform", true))
	target.owner = null
	_clear_owner_recursive(target)
	target.reparent(new_parent, keep_global_transform)
	target.owner = root
	_set_owner_recursive(target, root)
	_mark_scene_dirty(root)

	return _ok({
		"reparented": true,
		"old_path": old_path,
		"new_path": _node_live_path(root, target),
		"old_parent_path": old_parent_path,
		"new_parent_path": _node_live_path(root, new_parent),
		"keep_global_transform": keep_global_transform,
	})


func _handle_live_node_rename(args: Dictionary) -> Dictionary:
	var node_path := str(args.get("node_path", ""))
	var new_name := str(args.get("new_name", ""))
	if node_path == "":
		return _error("missing_node_path", "node_path is required.")
	if new_name == "":
		return _error("missing_new_name", "new_name is required.")

	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var target := _resolve_node_path(root, node_path)
	if not target:
		return _error("node_not_found", "Node path does not exist in the active scene.", {
			"node_path": node_path,
		})

	var old_path := _node_live_path(root, target)
	var old_name := str(target.name)
	target.name = new_name
	_mark_scene_dirty(root)

	return _ok({
		"renamed": true,
		"old_path": old_path,
		"new_path": _node_live_path(root, target),
		"old_name": old_name,
		"new_name": str(target.name),
	})


func _handle_live_node_connect_signal(args: Dictionary) -> Dictionary:
	var connection := _resolve_connection_args(args)
	if not bool(connection.get("ok", false)):
		return connection

	var root: Node = connection["root"]
	var source: Node = connection["source"]
	var target: Node = connection["target"]
	var signal_name := str(connection["signal_name"])
	var method_name := str(connection["method_name"])
	var binds: Array = connection["binds"]
	var callable := Callable(target, method_name)
	if binds.size() > 0:
		callable = callable.bindv(binds)

	if source.is_connected(StringName(signal_name), callable):
		return _ok({
			"connected": true,
			"already_connected": true,
			"connection": _connection_summary(root, source, signal_name, target, method_name, binds, int(args.get("flags", CONNECT_PERSIST))),
		})

	var flags := int(args.get("flags", CONNECT_PERSIST))
	var err := source.connect(StringName(signal_name), callable, flags)
	if err != OK:
		return _error("connect_failed", "Signal connection failed.", {
			"error_code": err,
			"source_node_path": _node_live_path(root, source),
			"signal_name": signal_name,
			"target_node_path": _node_live_path(root, target),
			"method_name": method_name,
		})

	_mark_scene_dirty(root)
	return _ok({
		"connected": true,
		"connection": _connection_summary(root, source, signal_name, target, method_name, binds, flags),
	})


func _handle_live_node_disconnect_signal(args: Dictionary) -> Dictionary:
	var connection := _resolve_connection_args(args)
	if not bool(connection.get("ok", false)):
		return connection

	var root: Node = connection["root"]
	var source: Node = connection["source"]
	var target: Node = connection["target"]
	var signal_name := str(connection["signal_name"])
	var method_name := str(connection["method_name"])
	var binds: Array = connection["binds"]
	var callable := Callable(target, method_name)
	if binds.size() > 0:
		callable = callable.bindv(binds)

	if not source.is_connected(StringName(signal_name), callable):
		return _error("connection_not_found", "The requested signal connection does not exist.", {
			"source_node_path": _node_live_path(root, source),
			"signal_name": signal_name,
			"target_node_path": _node_live_path(root, target),
			"method_name": method_name,
		})

	source.disconnect(StringName(signal_name), callable)
	_mark_scene_dirty(root)
	return _ok({
		"disconnected": true,
		"connection": _connection_summary(root, source, signal_name, target, method_name, binds, 0),
	})


func _handle_live_scene_mark_dirty() -> Dictionary:
	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	_mark_scene_dirty(root)
	return _ok({
		"marked_dirty": true,
		"scene_path": str(root.scene_file_path),
	})


func _handle_editor_filesystem_scan(args: Dictionary) -> Dictionary:
	var context := _editor_filesystem_context()
	if not bool(context.get("ok", false)):
		return context

	var paths_result := _normalize_res_path_array(args.get("paths", []), false)
	if not bool(paths_result.get("ok", false)):
		return paths_result

	var fs: EditorFileSystem = context["filesystem"]
	var paths: Array = paths_result["paths"]
	for path in paths:
		fs.update_file(str(path))

	fs.scan()
	var wait_result := {}
	if bool(args.get("wait_for_scan", true)):
		wait_result = _wait_for_filesystem_idle(fs, 2500)
	return _ok({
		"scanned": true,
		"mode": "selected_paths" if paths.size() > 0 else "full_project",
		"wait_requested": bool(args.get("wait_for_scan", true)),
		"wait": wait_result,
		"scan_status": _filesystem_scan_status(fs),
		"paths": paths,
		"files": _filesystem_metadata_for_paths(fs, paths),
	})


func _handle_editor_filesystem_reimport(args: Dictionary) -> Dictionary:
	var context := _editor_filesystem_context()
	if not bool(context.get("ok", false)):
		return context

	var paths_result := _normalize_res_path_array(args.get("paths", []), true)
	if not bool(paths_result.get("ok", false)):
		return paths_result

	var fs: EditorFileSystem = context["filesystem"]
	var paths: Array = paths_result["paths"]
	var packed_paths := PackedStringArray()
	for path in paths:
		var res_path := str(path)
		fs.update_file(res_path)
		packed_paths.append(res_path)

	var wait_result := _wait_for_filesystem_idle(fs, 2500)
	if bool(wait_result.get("timed_out", false)):
		return _error("filesystem_scan_busy", "EditorFileSystem is still scanning; retry reimport after scan completes.", {
			"paths": paths,
			"scan_status": _filesystem_scan_status(fs),
		})

	fs.reimport_files(packed_paths)
	return _ok({
		"reimported": true,
		"paths": paths,
		"wait": wait_result,
		"scan_status": _filesystem_scan_status(fs),
		"files": _filesystem_metadata_for_paths(fs, paths),
	})


func _handle_editor_resource_reload(args: Dictionary) -> Dictionary:
	var path_result := _required_res_path(args, "resource_path")
	if not bool(path_result.get("ok", false)):
		return path_result

	var res_path := str(path_result["path"])
	var cache_mode_result := _resource_cache_mode(str(args.get("cache_mode", "replace")))
	if not bool(cache_mode_result.get("ok", false)):
		return cache_mode_result

	var context := _editor_filesystem_context()
	if not bool(context.get("ok", false)):
		return context

	var fs: EditorFileSystem = context["filesystem"]
	fs.update_file(res_path)
	var resource := ResourceLoader.load(res_path, "", int(cache_mode_result["cache_mode"]))
	if not resource:
		return _error("resource_load_failed", "Godot could not load the requested resource.", {
			"resource_path": res_path,
		})

	return _ok({
		"reloaded": true,
		"resource_path": res_path,
		"cache_mode": cache_mode_result["name"],
		"resource": _resource_metadata(resource, res_path),
		"file": _filesystem_file_metadata(fs, res_path),
	})


func _handle_editor_resource_uid_update(args: Dictionary) -> Dictionary:
	var context := _editor_filesystem_context()
	if not bool(context.get("ok", false)):
		return context

	var paths_result := _normalize_res_path_array(args.get("paths", []), true)
	if not bool(paths_result.get("ok", false)):
		return paths_result

	var fs: EditorFileSystem = context["filesystem"]
	var paths: Array = paths_result["paths"]
	for path in paths:
		fs.update_file(str(path))
	fs.scan()
	var wait_result := _wait_for_filesystem_idle(fs, 2500)

	return _ok({
		"updated": true,
		"paths": paths,
		"wait": wait_result,
		"scan_status": _filesystem_scan_status(fs),
		"files": _filesystem_metadata_for_paths(fs, paths),
	})


func _handle_editor_open_resource(args: Dictionary) -> Dictionary:
	var path_result := _required_res_path(args, "resource_path")
	if not bool(path_result.get("ok", false)):
		return path_result

	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var res_path := str(path_result["path"])
	var mode := "resource"
	if res_path.ends_with(".tscn") or res_path.ends_with(".scn"):
		editor.open_scene_from_path(res_path)
		mode = "scene"
		return _ok({
			"opened": true,
			"resource_path": res_path,
			"mode": mode,
		})

	var resource := ResourceLoader.load(res_path, "", ResourceLoader.CACHE_MODE_REPLACE)
	if not resource:
		return _error("resource_load_failed", "Godot could not load the requested resource.", {
			"resource_path": res_path,
		})

	editor.edit_resource(resource)
	return _ok({
		"opened": true,
		"resource_path": res_path,
		"mode": mode,
		"resource": _resource_metadata(resource, res_path),
	})


func _handle_editor_focus_file(args: Dictionary) -> Dictionary:
	var path_result := _required_res_path(args, "resource_path")
	if not bool(path_result.get("ok", false)):
		return path_result

	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var dock := editor.get_file_system_dock()
	if not dock:
		return _error("filesystem_dock_unavailable", "FileSystemDock is not available.")

	var res_path := str(path_result["path"])
	dock.navigate_to_path(res_path)

	var fs := editor.get_resource_filesystem()
	return _ok({
		"focused": true,
		"resource_path": res_path,
		"file": _filesystem_file_metadata(fs, res_path) if fs else {},
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


func _serialize_node(node: Node, root: Node, depth: int, max_depth: int, include_properties: bool = false) -> Dictionary:
	var children: Array[Dictionary] = []
	if depth < max_depth:
		for child in node.get_children():
			if child is Node:
				children.append(_serialize_node(child, root, depth + 1, max_depth, include_properties))

	var data := {
		"path": _node_live_path(root, node),
		"name": str(node.name),
		"type": node.get_class(),
		"child_count": node.get_child_count(),
		"children": children,
	}
	if include_properties:
		data["properties"] = _compact_node_properties(node)
	return data


func _active_scene_context() -> Dictionary:
	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var root := editor.get_edited_scene_root()
	if not root:
		return _error("no_active_scene", "There is no active scene in the live editor.")

	return {
		"ok": true,
		"editor": editor,
		"root": root,
	}


func _compact_node_properties(node: Node) -> Dictionary:
	var properties := {}
	for property_name in _property_names_for_node(node, []):
		if properties.size() >= 20:
			break
		properties[property_name] = _serialize_variant(node.get(property_name))
	return properties


func _property_names_for_node(node: Object, requested_names: Array) -> Array[String]:
	var names: Array[String] = []
	var seen := {}

	if not requested_names.is_empty():
		for raw_name in requested_names:
			var requested_name := str(raw_name)
			if requested_name != "" and not seen.has(requested_name):
				seen[requested_name] = true
				names.append(requested_name)
		return names

	for property in node.get_property_list():
		var property_name := str(property.get("name", ""))
		if property_name == "" or seen.has(property_name):
			continue
		var usage := int(property.get("usage", 0))
		if (usage & PROPERTY_USAGE_STORAGE) != 0 or (usage & PROPERTY_USAGE_EDITOR) != 0 or (usage & PROPERTY_USAGE_SCRIPT_VARIABLE) != 0:
			seen[property_name] = true
			names.append(property_name)

	return names


func _node_has_property(node: Object, property_name: String) -> bool:
	for property in node.get_property_list():
		if str(property.get("name", "")) == property_name:
			return true
	return false


func _apply_node_properties(node: Node, properties) -> Dictionary:
	if properties == null:
		properties = {}
	if typeof(properties) != TYPE_DICTIONARY:
		return _error("invalid_properties", "properties must be an object when provided.")

	var applied := {}
	for raw_name in properties.keys():
		var property_name := str(raw_name)
		if not _node_has_property(node, property_name):
			return _error("property_not_found", "The requested property does not exist on the node.", {
				"node_path": str(node.name),
				"property_name": property_name,
			})
		node.set(property_name, _decode_variant(properties[raw_name]))
		applied[property_name] = _serialize_variant(node.get(property_name))

	return {
		"ok": true,
		"properties": applied,
	}


func _decode_variant(value):
	match typeof(value):
		TYPE_DICTIONARY:
			var dict: Dictionary = value
			var value_type := str(dict.get("type", ""))
			var encoded = dict.get("value", null)
			if value_type == "Vector2" and typeof(encoded) == TYPE_ARRAY and encoded.size() >= 2:
				return Vector2(float(encoded[0]), float(encoded[1]))
			if value_type == "Vector2i" and typeof(encoded) == TYPE_ARRAY and encoded.size() >= 2:
				return Vector2i(int(encoded[0]), int(encoded[1]))
			if value_type == "Vector3" and typeof(encoded) == TYPE_ARRAY and encoded.size() >= 3:
				return Vector3(float(encoded[0]), float(encoded[1]), float(encoded[2]))
			if value_type == "Vector3i" and typeof(encoded) == TYPE_ARRAY and encoded.size() >= 3:
				return Vector3i(int(encoded[0]), int(encoded[1]), int(encoded[2]))
			if value_type == "Color" and typeof(encoded) == TYPE_ARRAY and encoded.size() >= 4:
				return Color(float(encoded[0]), float(encoded[1]), float(encoded[2]), float(encoded[3]))
			if value_type == "NodePath":
				return NodePath(str(encoded))

			var decoded := {}
			for key in dict.keys():
				decoded[key] = _decode_variant(dict[key])
			return decoded
		TYPE_ARRAY:
			var decoded_array := []
			for item in value:
				decoded_array.append(_decode_variant(item))
			return decoded_array
		_:
			return value


func _serialize_variant(value):
	match typeof(value):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
			return value
		TYPE_STRING_NAME, TYPE_NODE_PATH:
			return str(value)
		TYPE_VECTOR2:
			return { "type": "Vector2", "value": [value.x, value.y] }
		TYPE_VECTOR2I:
			return { "type": "Vector2i", "value": [value.x, value.y] }
		TYPE_VECTOR3:
			return { "type": "Vector3", "value": [value.x, value.y, value.z] }
		TYPE_VECTOR3I:
			return { "type": "Vector3i", "value": [value.x, value.y, value.z] }
		TYPE_RECT2:
			return { "type": "Rect2", "position": _serialize_variant(value.position), "size": _serialize_variant(value.size) }
		TYPE_RECT2I:
			return { "type": "Rect2i", "position": _serialize_variant(value.position), "size": _serialize_variant(value.size) }
		TYPE_TRANSFORM2D:
			return { "type": "Transform2D", "text": str(value) }
		TYPE_VECTOR4:
			return { "type": "Vector4", "value": [value.x, value.y, value.z, value.w] }
		TYPE_VECTOR4I:
			return { "type": "Vector4i", "value": [value.x, value.y, value.z, value.w] }
		TYPE_PLANE:
			return { "type": "Plane", "text": str(value) }
		TYPE_QUATERNION:
			return { "type": "Quaternion", "value": [value.x, value.y, value.z, value.w] }
		TYPE_AABB:
			return { "type": "AABB", "position": _serialize_variant(value.position), "size": _serialize_variant(value.size) }
		TYPE_BASIS:
			return { "type": "Basis", "text": str(value) }
		TYPE_TRANSFORM3D:
			return { "type": "Transform3D", "text": str(value) }
		TYPE_PROJECTION:
			return { "type": "Projection", "text": str(value) }
		TYPE_COLOR:
			return { "type": "Color", "value": [value.r, value.g, value.b, value.a] }
		TYPE_ARRAY:
			var result_array := []
			for item in value:
				result_array.append(_serialize_variant(item))
			return result_array
		TYPE_DICTIONARY:
			var result_dict := {}
			for key in value.keys():
				result_dict[str(key)] = _serialize_variant(value[key])
			return result_dict
		TYPE_OBJECT:
			if value == null:
				return null
			if value is Resource:
				var resource: Resource = value
				return {
					"type": resource.get_class(),
					"resource_path": str(resource.resource_path),
				}
			if value is Node:
				var node: Node = value
				return {
					"type": node.get_class(),
					"name": str(node.name),
					"path": str(node.get_path()),
				}
			return {
				"type": value.get_class(),
				"text": str(value),
			}
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


func _mark_scene_dirty(root: Node = null) -> void:
	var editor := _get_editor_interface()
	if not editor:
		return
	editor.mark_scene_as_unsaved()
	if root:
		editor.set_object_edited(root, true)


func _select_single_node(node: Node) -> void:
	var editor := _get_editor_interface()
	if not editor:
		return
	var selection := editor.get_selection()
	if selection:
		selection.clear()
		selection.add_node(node)
	editor.edit_node(node)


func _set_owner_recursive(node: Node, owner: Node) -> void:
	for child in node.get_children():
		if child is Node:
			var child_node: Node = child
			child_node.owner = owner
			_set_owner_recursive(child_node, owner)


func _clear_owner_recursive(node: Node) -> void:
	for child in node.get_children():
		if child is Node:
			var child_node: Node = child
			child_node.owner = null
			_clear_owner_recursive(child_node)


func _resolve_connection_args(args: Dictionary) -> Dictionary:
	var source_node_path := str(args.get("source_node_path", ""))
	var signal_name := str(args.get("signal_name", ""))
	var target_node_path := str(args.get("target_node_path", ""))
	var method_name := str(args.get("method_name", ""))
	if source_node_path == "":
		return _error("missing_source_node_path", "source_node_path is required.")
	if signal_name == "":
		return _error("missing_signal_name", "signal_name is required.")
	if target_node_path == "":
		return _error("missing_target_node_path", "target_node_path is required.")
	if method_name == "":
		return _error("missing_method_name", "method_name is required.")

	var binds = args.get("binds", [])
	if typeof(binds) != TYPE_ARRAY:
		return _error("invalid_binds", "binds must be an array when provided.")

	var context := _active_scene_context()
	if not bool(context.get("ok", false)):
		return context

	var root: Node = context["root"]
	var source := _resolve_node_path(root, source_node_path)
	var target := _resolve_node_path(root, target_node_path)
	if not source:
		return _error("source_node_not_found", "Source node path does not exist in the active scene.", {
			"source_node_path": source_node_path,
		})
	if not target:
		return _error("target_node_not_found", "Target node path does not exist in the active scene.", {
			"target_node_path": target_node_path,
		})
	if not source.has_signal(StringName(signal_name)):
		return _error("signal_not_found", "Source node does not expose the requested signal.", {
			"source_node_path": source_node_path,
			"signal_name": signal_name,
		})

	return {
		"ok": true,
		"root": root,
		"source": source,
		"target": target,
		"signal_name": signal_name,
		"method_name": method_name,
		"binds": binds,
	}


func _connection_summary(root: Node, source: Node, signal_name: String, target: Node, method_name: String, binds: Array, flags: int) -> Dictionary:
	return {
		"source_node_path": _node_live_path(root, source),
		"signal_name": signal_name,
		"target_node_path": _node_live_path(root, target),
		"method_name": method_name,
		"flags": flags,
		"binds": _serialize_variant(binds),
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


func _editor_filesystem_context() -> Dictionary:
	var editor := _get_editor_interface()
	if not editor:
		return _error("editor_unavailable", "EditorInterface is not available.")

	var fs := editor.get_resource_filesystem()
	if not fs:
		return _error("filesystem_unavailable", "EditorFileSystem is not available.")

	return {
		"ok": true,
		"editor": editor,
		"filesystem": fs,
	}


func _required_res_path(args: Dictionary, field_name: String) -> Dictionary:
	var raw_path := str(args.get(field_name, ""))
	if raw_path == "":
		return _error("missing_%s" % field_name, "%s is required." % field_name)

	var res_path := _normalize_res_resource_path(raw_path)
	if res_path == "":
		return _error("invalid_%s" % field_name, "%s must stay inside res:// and cannot contain '..'." % field_name, {
			field_name: raw_path,
		})

	return {
		"ok": true,
		"path": res_path,
	}


func _normalize_res_path_array(raw_paths, required: bool) -> Dictionary:
	if raw_paths == null:
		raw_paths = []
	if typeof(raw_paths) != TYPE_ARRAY:
		return _error("invalid_paths", "paths must be an array of project resource paths.")

	var paths: Array[String] = []
	var seen := {}
	for raw_path in raw_paths:
		var res_path := _normalize_res_resource_path(str(raw_path))
		if res_path == "":
			return _error("invalid_resource_path", "Resource paths must stay inside res:// and cannot contain '..'.", {
				"resource_path": str(raw_path),
			})
		if not seen.has(res_path):
			seen[res_path] = true
			paths.append(res_path)

	if required and paths.is_empty():
		return _error("missing_paths", "At least one resource path is required.")

	return {
		"ok": true,
		"paths": paths,
	}


func _normalize_res_resource_path(resource_path: String) -> String:
	var cleaned := resource_path.replace("\\", "/").strip_edges()
	if cleaned == "" or cleaned.contains(".."):
		return ""
	if cleaned.begins_with("res://"):
		return cleaned
	while cleaned.begins_with("/"):
		cleaned = cleaned.substr(1)
	if cleaned == "":
		return ""
	return "res://%s" % cleaned


func _filesystem_scan_status(fs: EditorFileSystem) -> Dictionary:
	return {
		"is_scanning": fs.is_scanning(),
		"progress": fs.get_scanning_progress(),
	}


func _wait_for_filesystem_idle(fs: EditorFileSystem, timeout_ms: int) -> Dictionary:
	var started := Time.get_ticks_msec()
	var waited_ms := 0
	while fs.is_scanning() and waited_ms < timeout_ms:
		OS.delay_msec(25)
		waited_ms = int(Time.get_ticks_msec() - started)

	return {
		"waited_ms": waited_ms,
		"timed_out": fs.is_scanning(),
	}


func _filesystem_metadata_for_paths(fs: EditorFileSystem, paths: Array) -> Array[Dictionary]:
	var files: Array[Dictionary] = []
	for path in paths:
		files.append(_filesystem_file_metadata(fs, str(path)))
	return files


func _filesystem_file_metadata(fs: EditorFileSystem, res_path: String) -> Dictionary:
	var full_path := ProjectSettings.globalize_path(res_path)
	var exists := FileAccess.file_exists(full_path) or DirAccess.dir_exists_absolute(full_path)
	var uid_data := _resource_uid_metadata(res_path)
	return {
		"path": res_path,
		"full_path": full_path,
		"exists": exists,
		"visible": _editor_filesystem_contains_path(fs.get_filesystem(), res_path),
		"type": str(fs.get_file_type(res_path)) if exists else "",
		"uid": uid_data["uid"],
		"uid_id": uid_data["uid_id"],
		"uid_available": uid_data["uid_available"],
	}


func _editor_filesystem_contains_path(directory: EditorFileSystemDirectory, res_path: String) -> bool:
	if not directory:
		return false

	for index in range(directory.get_file_count()):
		if str(directory.get_file_path(index)) == res_path:
			return true

	for index in range(directory.get_subdir_count()):
		if _editor_filesystem_contains_path(directory.get_subdir(index), res_path):
			return true

	return false


func _resource_uid_metadata(res_path: String) -> Dictionary:
	var uid_id := int(ResourceLoader.get_resource_uid(res_path))
	var uid_text := ""
	if uid_id > 0:
		uid_text = ResourceUID.id_to_text(uid_id)
	if uid_text == "":
		uid_text = ResourceUID.path_to_uid(res_path)
	return {
		"uid": uid_text,
		"uid_id": uid_id,
		"uid_available": uid_text != "",
	}


func _resource_cache_mode(cache_mode: String) -> Dictionary:
	var normalized := cache_mode.to_lower()
	match normalized:
		"reuse":
			return { "ok": true, "name": normalized, "cache_mode": ResourceLoader.CACHE_MODE_REUSE }
		"ignore":
			return { "ok": true, "name": normalized, "cache_mode": ResourceLoader.CACHE_MODE_IGNORE }
		"replace":
			return { "ok": true, "name": normalized, "cache_mode": ResourceLoader.CACHE_MODE_REPLACE }
		"ignore_deep":
			return { "ok": true, "name": normalized, "cache_mode": ResourceLoader.CACHE_MODE_IGNORE_DEEP }
		"replace_deep":
			return { "ok": true, "name": normalized, "cache_mode": ResourceLoader.CACHE_MODE_REPLACE_DEEP }
		_:
			return _error("invalid_cache_mode", "cache_mode must be reuse, ignore, replace, ignore_deep, or replace_deep.", {
				"cache_mode": cache_mode,
			})


func _resource_metadata(resource: Resource, fallback_path: String) -> Dictionary:
	if not resource:
		return {}

	var resource_path := str(resource.resource_path)
	if resource_path == "":
		resource_path = fallback_path

	return {
		"type": resource.get_class(),
		"resource_path": resource_path,
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
