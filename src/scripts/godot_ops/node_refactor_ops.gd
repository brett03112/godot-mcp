# Phase 6.B focused node refactor operation module.
extends RefCounted

var _context
var _legacy

func setup(context, legacy) -> void:
	_context = context
	_legacy = legacy

func log_info(message) -> void:
	if _legacy != null and _legacy.has_method("log_info"):
		_legacy.log_info(str(message))

func log_error(message) -> void:
	if _legacy != null and _legacy.has_method("log_error"):
		_legacy.log_error(str(message))

func instantiate_class(name_of_class):
	return _legacy.instantiate_class(name_of_class)

func find_files(path, extension) -> Array:
	return _legacy.find_files(path, extension)

func _to_res_path(path: String) -> String:
	return _legacy.to_res_path(path)

func _load_scene_for_edit(scene_path: String) -> Dictionary:
	return _legacy.load_scene_for_edit(scene_path)

func _save_scene_root(scene_root: Node, full_scene_path: String) -> bool:
	return _legacy.save_scene_root(scene_root, full_scene_path)

func _get_edit_parent(scene_root: Node, parent_path: String) -> Node:
	return _legacy.get_edit_parent(scene_root, parent_path)

func _has_property(obj: Object, property_name: String) -> bool:
	return _legacy.has_property(obj, property_name)

func _make_unique_child_name(parent: Node, base_name: String) -> String:
	return _legacy.make_unique_child_name(parent, base_name)

func _clear_owner_recursive(node: Node) -> void:
	_legacy.call("_clear_owner_recursive", node)

func _set_owner_recursive(node: Node, owner: Node) -> void:
	_legacy.call("_set_owner_recursive", node, owner)

func _convert_property_value(value, node: Node, property_name: String):
	return _legacy.call("_convert_property_value", value, node, property_name)
# --- Phase 1.8: Scene search and node refactor workflow ---

func node_find(params: Dictionary) -> void:
	log_info("Starting node_find operation")
	var scene_paths = _node_refactor_scene_paths(params)
	var max_results = int(params.get("max_results", 100))
	var include_properties = bool(params.get("include_properties", false))
	var include_connections = bool(params.get("include_connections", false))
	var matches = []
	var scanned_scenes = []
	var errors = []

	for scene_path in scene_paths:
		if max_results > 0 and matches.size() >= max_results:
			break
		var loaded = _load_scene_for_edit(scene_path)
		if loaded.is_empty():
			errors.append({"scene_path": scene_path, "message": "Failed to load scene"})
			continue
		var scene_root: Node = loaded["scene_root"]
		scanned_scenes.append(_to_res_path(scene_path))
		_node_refactor_collect_find_matches(
			scene_root, scene_root, scene_path, params, include_properties, 
			include_connections, max_results, matches)
		scene_root.free()

	print(JSON.stringify({
		"success": true,
		"count": matches.size(),
		"truncated": max_results > 0 and matches.size() >= max_results,
		"scanned_scenes": scanned_scenes,
		"errors": errors,
		"matches": matches
	}))
	log_info("node_find completed successfully")


func node_rename(params: Dictionary) -> void:
	log_info("Starting node_rename operation")
	var new_name: String = params.get("new_name", "")
	if new_name.is_empty():
		log_error("new_name is required")
		return
	var loaded = _node_refactor_load_scene_with_node(params)
	if loaded.is_empty():
		return
	var scene_root: Node = loaded["scene_root"]
	var target: Node = loaded["node"]
	var old_path = _node_refactor_node_path(scene_root, target)
	var old_name = str(target.name)
	var parent = target.get_parent()
	target.name = new_name if parent == null else _make_unique_child_name(parent, new_name)
	var actual_name = str(target.name)
	var new_path = _node_refactor_node_path(scene_root, target)
	var reference_updates = []
	if bool(params.get("update_references", true)):
		reference_updates = _node_refactor_update_nodepath_references(
			scene_root, old_path, new_path)

	if not _save_scene_root(scene_root, loaded["full_scene_path"]):
		scene_root.free()
		return
	scene_root.free()
	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(params.get("scene_path", "")),
		"old_path": old_path,
		"node_path": new_path,
		"old_name": old_name,
		"new_name": actual_name,
		"requested_name": new_name,
		"reference_updates": reference_updates,
		"reference_update_count": reference_updates.size()
	}))
	log_info("node_rename completed successfully")


func node_move(params: Dictionary) -> void:
	log_info("Starting node_move operation")
	var new_parent_path: String = params.get("new_parent_path", "")
	if new_parent_path.is_empty():
		log_error("new_parent_path is required")
		return
	var loaded = _node_refactor_load_scene_with_node(params)
	if loaded.is_empty():
		return
	var scene_root: Node = loaded["scene_root"]
	var target: Node = loaded["node"]
	if target == scene_root:
		log_error("Cannot move the root node")
		scene_root.free()
		return
	var new_parent = _get_edit_parent(scene_root, new_parent_path)
	if new_parent == null:
		log_error("New parent node not found: " + new_parent_path)
		scene_root.free()
		return
	if _node_refactor_is_descendant(new_parent, target):
		log_error("Cannot move a node under itself or one of its descendants")
		scene_root.free()
		return

	var old_path = _node_refactor_node_path(scene_root, target)
	var old_parent_path = _node_refactor_node_path(scene_root, target.get_parent())
	var keep_global_transform = bool(params.get("keep_global_transform", true))
	var old_transform_2d = Transform2D.IDENTITY
	var old_transform_3d = Transform3D.IDENTITY
	if keep_global_transform and target is Node2D:
		old_transform_2d = target.global_transform
	elif keep_global_transform and target is Node3D:
		old_transform_3d = target.global_transform

	var old_parent = target.get_parent()
	target.owner = null
	_clear_owner_recursive(target)
	old_parent.remove_child(target)
	new_parent.add_child(target)
	target.owner = scene_root
	_set_owner_recursive(target, scene_root)
	if keep_global_transform and target is Node2D:
		target.global_transform = old_transform_2d
	elif keep_global_transform and target is Node3D:
		target.global_transform = old_transform_3d

	var new_path = _node_refactor_node_path(scene_root, target)
	var actual_new_parent_path = _node_refactor_node_path(scene_root, new_parent)
	var reference_updates = []
	if bool(params.get("update_references", true)):
		reference_updates = _node_refactor_update_nodepath_references(
			scene_root, old_path, new_path)

	if not _save_scene_root(scene_root, loaded["full_scene_path"]):
		scene_root.free()
		return
	scene_root.free()
	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(params.get("scene_path", "")),
		"old_path": old_path,
		"node_path": new_path,
		"old_parent_path": old_parent_path,
		"new_parent_path": actual_new_parent_path,
		"keep_global_transform": keep_global_transform,
		"reference_updates": reference_updates,
		"reference_update_count": reference_updates.size()
	}))
	log_info("node_move completed successfully")


func node_add_to_group(params: Dictionary) -> void:
	log_info("Starting node_add_to_group operation")
	var group_name: String = params.get("group_name", "")
	if group_name.is_empty():
		log_error("group_name is required")
		return
	var loaded = _node_refactor_load_scene_with_node(params)
	if loaded.is_empty():
		return
	var scene_root: Node = loaded["scene_root"]
	var target: Node = loaded["node"]
	target.add_to_group(group_name, bool(params.get("persistent", true)))
	var groups = _node_refactor_group_list(target)
	if not _save_scene_root(scene_root, loaded["full_scene_path"]):
		scene_root.free()
		return
	var node_path = _node_refactor_node_path(scene_root, target)
	scene_root.free()
	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(params.get("scene_path", "")),
		"node_path": node_path,
		"group_name": group_name,
		"persistent": bool(params.get("persistent", true)),
		"groups": groups
	}))
	log_info("node_add_to_group completed successfully")


func node_remove_from_group(params: Dictionary) -> void:
	log_info("Starting node_remove_from_group operation")
	var group_name: String = params.get("group_name", "")
	if group_name.is_empty():
		log_error("group_name is required")
		return
	var loaded = _node_refactor_load_scene_with_node(params)
	if loaded.is_empty():
		return
	var scene_root: Node = loaded["scene_root"]
	var target: Node = loaded["node"]
	target.remove_from_group(group_name)
	var groups = _node_refactor_group_list(target)
	if not _save_scene_root(scene_root, loaded["full_scene_path"]):
		scene_root.free()
		return
	var node_path = _node_refactor_node_path(scene_root, target)
	scene_root.free()
	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(params.get("scene_path", "")),
		"node_path": node_path,
		"group_name": group_name,
		"groups": groups
	}))
	log_info("node_remove_from_group completed successfully")


func node_replace_type(params: Dictionary) -> void:
	log_info("Starting node_replace_type operation")
	var new_type: String = params.get("new_type", "")
	if new_type.is_empty():
		log_error("new_type is required")
		return
	var loaded = _node_refactor_load_scene_with_node(params)
	if loaded.is_empty():
		return
	var scene_root: Node = loaded["scene_root"]
	var target: Node = loaded["node"]
	if target == scene_root:
		log_error("Cannot replace the root node")
		scene_root.free()
		return
	var replacement_obj = instantiate_class(new_type)
	if not (replacement_obj is Node):
		log_error("new_type must instantiate a Node: " + new_type)
		scene_root.free()
		return
	var replacement: Node = replacement_obj
	var parent = target.get_parent()
	var target_index = target.get_index()
	var old_path = _node_refactor_node_path(scene_root, target)
	var old_type = target.get_class()
	var preserved_groups = _node_refactor_group_list(target)
	var preserve_name = bool(params.get("preserve_name", true))
	var preserve_children = bool(params.get("preserve_children", true))
	var preserve_groups = bool(params.get("preserve_groups", true))
	var preserve_script = bool(params.get("preserve_script", false))

	replacement.name = str(target.name) if preserve_name else _make_unique_child_name(parent, new_type)
	_node_refactor_copy_common_properties(target, replacement, preserve_script)
	if preserve_groups:
		for group_name in preserved_groups:
			replacement.add_to_group(str(group_name), true)
	if preserve_children:
		var children = []
		for child in target.get_children():
			children.append(child)
		for child in children:
			target.remove_child(child)
			replacement.add_child(child)
			child.owner = scene_root
			_set_owner_recursive(child, scene_root)

	parent.remove_child(target)
	parent.add_child(replacement)
	parent.move_child(replacement, target_index)
	replacement.owner = scene_root
	_set_owner_recursive(replacement, scene_root)
	target.free()
	var new_path = _node_refactor_node_path(scene_root, replacement)
	var actual_new_type = replacement.get_class()
	var actual_groups = _node_refactor_group_list(replacement)

	if not _save_scene_root(scene_root, loaded["full_scene_path"]):
		scene_root.free()
		return
	scene_root.free()
	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(params.get("scene_path", "")),
		"old_path": old_path,
		"node_path": new_path,
		"old_type": old_type,
		"new_type": actual_new_type,
		"preserve_name": preserve_name,
		"preserve_children": preserve_children,
		"preserve_groups": preserve_groups,
		"preserve_script": preserve_script,
		"groups": actual_groups
	}))
	log_info("node_replace_type completed successfully")


func node_bulk_property_set(params: Dictionary) -> void:
	log_info("Starting node_bulk_property_set operation")
	var nodes = params.get("nodes", [])
	var property_name: String = params.get("property_name", "")
	if not (nodes is Array) or nodes.is_empty() or property_name.is_empty() or not params.has("property_value"):
		log_error("nodes, property_name, and property_value are required")
		return
	var loaded = _load_scene_for_edit(params.get("scene_path", ""))
	if loaded.is_empty():
		return
	var scene_root: Node = loaded["scene_root"]
	var changed = []
	var issues = []
	for node_path_value in nodes:
		var node_path = str(node_path_value)
		var target = _get_edit_parent(scene_root, node_path)
		if target == null:
			issues.append({"node_path": node_path, "code": "node_not_found"})
			continue
		if not _has_property(target, property_name):
			issues.append({"node_path": node_path, "code": "property_not_found", "property_name": property_name})
			continue
		var converted_value = _convert_property_value(params.get("property_value"), target, property_name)
		target.set(property_name, converted_value)
		changed.append({
			"node_path": _node_refactor_node_path(scene_root, target),
			"property_name": property_name,
			"property_value": _node_refactor_json_value(converted_value)
		})

	if not _save_scene_root(scene_root, loaded["full_scene_path"]):
		scene_root.free()
		return
	scene_root.free()
	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(params.get("scene_path", "")),
		"changed_count": changed.size(),
		"issue_count": issues.size(),
		"changed": changed,
		"issues": issues
	}))
	log_info("node_bulk_property_set completed successfully")


func scene_find_references(params: Dictionary) -> void:
	log_info("Starting scene_find_references operation")
	var scene_path: String = params.get("scene_path", "")
	var node_path: String = params.get("node_path", "")
	if scene_path.is_empty() or node_path.is_empty():
		log_error("scene_path and node_path are required")
		return
	var loaded = _load_scene_for_edit(scene_path)
	if loaded.is_empty():
		return
	var scene_root: Node = loaded["scene_root"]
	var references = []
	if bool(params.get("include_connections", true)):
		_node_refactor_collect_connection_references(scene_root, scene_path, node_path, references)
	if bool(params.get("include_properties", true)):
		_node_refactor_collect_nodepath_references(scene_root, scene_root, scene_path, node_path, references)
	var target_exists = _get_edit_parent(scene_root, node_path) != null
	scene_root.free()
	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(scene_path),
		"target": node_path,
		"target_exists": target_exists,
		"count": references.size(),
		"references": references
	}))
	log_info("scene_find_references completed successfully")


func scene_dependency_report(params: Dictionary) -> void:
	log_info("Starting scene_dependency_report operation")
	var scene_paths = _node_refactor_scene_paths(params)
	var max_results = int(params.get("max_results", 100))
	var include_scripts = bool(params.get("include_scripts", true))
	var include_dependencies = bool(params.get("include_dependencies", true))
	var scenes = []
	var dependencies = []
	var dependency_seen = {}
	var errors = []

	for scene_path in scene_paths:
		if max_results > 0 and scenes.size() >= max_results:
			break
		var loaded = _load_scene_for_edit(scene_path)
		if loaded.is_empty():
			errors.append({"scene_path": scene_path, "message": "Failed to load scene"})
			continue
		var scene_root: Node = loaded["scene_root"]
		var nodes = []
		_node_refactor_collect_node_summaries(scene_root, scene_root, scene_path, false, false, nodes)
		var connections = _node_refactor_connection_summaries(scene_root)
		if include_scripts or include_dependencies:
			_node_refactor_collect_dependencies(scene_root, scene_root, scene_path, include_scripts, include_dependencies, dependencies, dependency_seen)
		scenes.append({
			"scene_path": _to_res_path(scene_path),
			"root_name": str(scene_root.name),
			"root_type": scene_root.get_class(),
			"node_count": nodes.size(),
			"connection_count": connections.size(),
			"nodes": nodes
		})
		scene_root.free()

	print(JSON.stringify({
		"success": true,
		"count": scenes.size(),
		"truncated": max_results > 0 and scenes.size() >= max_results,
		"scenes": scenes,
		"dependencies": dependencies,
		"errors": errors
	}))
	log_info("scene_dependency_report completed successfully")


func _node_refactor_load_scene_with_node(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")
	var node_path: String = params.get("node_path", "")
	if scene_path.is_empty() or node_path.is_empty():
		log_error("scene_path and node_path are required")
		return {}
	var loaded = _load_scene_for_edit(scene_path)
	if loaded.is_empty():
		return {}
	var scene_root: Node = loaded["scene_root"]
	var target = _get_edit_parent(scene_root, node_path)
	if target == null:
		log_error("Node not found: " + node_path)
		scene_root.free()
		return {}
	loaded["node"] = target
	return loaded


func _node_refactor_scene_paths(params: Dictionary) -> Array:
	var paths = []
	var seen = {}
	if params.has("scene_paths") and params.get("scene_paths") is Array:
		for scene_path in params.get("scene_paths"):
			_node_refactor_add_scene_path(paths, seen, str(scene_path))
	if params.has("scene_path") and not str(params.get("scene_path", "")).is_empty():
		_node_refactor_add_scene_path(paths, seen, str(params.get("scene_path")))
	if params.has("scan_paths") and params.get("scan_paths") is Array:
		for scan_path in params.get("scan_paths"):
			_node_refactor_add_scan_path(paths, seen, str(scan_path))
	if paths.is_empty():
		_node_refactor_add_scan_path(paths, seen, "res://")
	return paths


func _node_refactor_add_scan_path(paths: Array, seen: Dictionary, scan_path: String) -> void:
	if scan_path.is_empty():
		return
	var res_path = _to_res_path(scan_path)
	if res_path.ends_with(".tscn"):
		_node_refactor_add_scene_path(paths, seen, res_path)
		return
	if not res_path.ends_with("/"):
		res_path += "/"
	var found = find_files(res_path, ".tscn")
	for scene_path in found:
		_node_refactor_add_scene_path(paths, seen, str(scene_path))


func _node_refactor_add_scene_path(paths: Array, seen: Dictionary, scene_path: String) -> void:
	if scene_path.is_empty():
		return
	var full_path = _to_res_path(scene_path)
	if not full_path.ends_with(".tscn"):
		return
	if seen.has(full_path):
		return
	seen[full_path] = true
	paths.append(full_path)


func _node_refactor_collect_find_matches(scene_root: Node, node: Node, scene_path: String, params: Dictionary, include_properties: bool, include_connections: bool, max_results: int, matches: Array) -> void:
	if max_results > 0 and matches.size() >= max_results:
		return
	if _node_refactor_node_matches(node, params):
		matches.append(_node_refactor_node_summary(scene_root, node, scene_path, include_properties, include_connections))
	for child in node.get_children():
		if child is Node:
			_node_refactor_collect_find_matches(scene_root, child, scene_path, params, include_properties, include_connections, max_results, matches)


func _node_refactor_node_matches(node: Node, params: Dictionary) -> bool:
	var name_query: String = params.get("name", "")
	if not name_query.is_empty():
		var node_name = str(node.name)
		if name_query.find("*") >= 0 or name_query.find("?") >= 0:
			if not node_name.match(name_query):
				return false
		elif node_name != name_query:
			return false

	var type_query: String = params.get("type", "")
	if not type_query.is_empty() and node.get_class() != type_query and not node.is_class(type_query):
		return false

	var group_name: String = params.get("group_name", "")
	if not group_name.is_empty() and not node.is_in_group(group_name):
		return false

	var script_path: String = params.get("script_path", "")
	if not script_path.is_empty():
		var script = node.get_script()
		var script_res_path = script.resource_path if script is Resource else ""
		if _to_res_path(script_path) != script_res_path:
			return false

	var property_name: String = params.get("property_name", "")
	if not property_name.is_empty():
		if not _has_property(node, property_name):
			return false
		if params.has("property_value") and not _node_refactor_values_match(node.get(property_name), params.get("property_value"), node, property_name):
			return false

	var property_filters = params.get("property_filters", {})
	if property_filters is Dictionary:
		for filter_name in property_filters.keys():
			var filter_key = str(filter_name)
			if not _has_property(node, filter_key):
				return false
			if not _node_refactor_values_match(node.get(filter_key), property_filters[filter_name], node, filter_key):
				return false
	return true


func _node_refactor_node_summary(scene_root: Node, node: Node, scene_path: String, include_properties: bool, include_connections: bool) -> Dictionary:
	var path = _node_refactor_node_path(scene_root, node)
	var script = node.get_script()
	var summary = {
		"scene_path": _to_res_path(scene_path),
		"path": path,
		"node_path": path,
		"name": str(node.name),
		"type": node.get_class(),
		"groups": _node_refactor_group_list(node),
		"child_count": node.get_child_count()
	}
	if script is Resource and not script.resource_path.is_empty():
		summary["script_path"] = script.resource_path
	if include_properties:
		summary["properties"] = _node_refactor_property_summary(node)
	if include_connections:
		var refs = []
		_node_refactor_collect_connection_references(scene_root, scene_path, path, refs)
		summary["connections"] = refs
	return summary


func _node_refactor_collect_node_summaries(scene_root: Node, node: Node, scene_path: String, include_properties: bool, include_connections: bool, nodes: Array) -> void:
	nodes.append(_node_refactor_node_summary(scene_root, node, scene_path, include_properties, include_connections))
	for child in node.get_children():
		if child is Node:
			_node_refactor_collect_node_summaries(scene_root, child, scene_path, include_properties, include_connections, nodes)


func _node_refactor_property_summary(node: Node) -> Dictionary:
	var properties = {}
	var added = 0
	for property_info in node.get_property_list():
		if added >= 40:
			break
		var property_name = str(property_info.get("name", ""))
		if property_name.is_empty():
			continue
		var usage = int(property_info.get("usage", 0))
		if (usage & PROPERTY_USAGE_STORAGE) == 0:
			continue
		properties[property_name] = _node_refactor_json_value(node.get(property_name))
		added += 1
	return properties


func _node_refactor_update_nodepath_references(scene_root: Node, old_path: String, new_path: String) -> Array:
	var updates = []
	_node_refactor_update_nodepath_references_in_node(scene_root, scene_root, old_path, new_path, updates)
	return updates


func _node_refactor_update_nodepath_references_in_node(scene_root: Node, node: Node, old_path: String, new_path: String, updates: Array) -> void:
	for property_info in node.get_property_list():
		var property_name = str(property_info.get("name", ""))
		if property_name.is_empty():
			continue
		var property_type = int(property_info.get("type", -1))
		if property_type != TYPE_NODE_PATH and property_type != TYPE_STRING:
			continue
		if property_type == TYPE_STRING and property_name.to_lower().find("path") < 0:
			continue
		var value = node.get(property_name)
		var current_path = str(value)
		var replacement_path = _node_refactor_rewrite_reference_path(current_path, old_path, new_path)
		if replacement_path == current_path:
			continue
		if property_type == TYPE_NODE_PATH:
			node.set(property_name, NodePath(replacement_path))
		else:
			node.set(property_name, replacement_path)
		updates.append({
			"node_path": _node_refactor_node_path(scene_root, node),
			"property_name": property_name,
			"old_value": current_path,
			"new_value": replacement_path
		})
	for child in node.get_children():
		if child is Node:
			_node_refactor_update_nodepath_references_in_node(scene_root, child, old_path, new_path, updates)


func _node_refactor_collect_nodepath_references(scene_root: Node, node: Node, scene_path: String, target_path: String, references: Array) -> void:
	for property_info in node.get_property_list():
		var property_name = str(property_info.get("name", ""))
		if property_name.is_empty():
			continue
		var property_type = int(property_info.get("type", -1))
		if property_type != TYPE_NODE_PATH and property_type != TYPE_STRING:
			continue
		if property_type == TYPE_STRING and property_name.to_lower().find("path") < 0:
			continue
		var value_text = str(node.get(property_name))
		if _node_refactor_path_matches_reference(value_text, target_path):
			references.append({
				"scene_path": _to_res_path(scene_path),
				"kind": "property",
				"node_path": _node_refactor_node_path(scene_root, node),
				"property_name": property_name,
				"value": value_text
			})
	for child in node.get_children():
		if child is Node:
			_node_refactor_collect_nodepath_references(scene_root, child, scene_path, target_path, references)


func _node_refactor_collect_connection_references(scene_root: Node, scene_path: String, target_path: String, references: Array) -> void:
	var connections = _node_refactor_connection_summaries(scene_root)
	for connection in connections:
		if _node_refactor_path_matches_reference(str(connection.get("from", "")), target_path) or _node_refactor_path_matches_reference(str(connection.get("to", "")), target_path):
			var ref = connection.duplicate(true)
			ref["scene_path"] = _to_res_path(scene_path)
			ref["kind"] = "connection"
			references.append(ref)


func _node_refactor_connection_summaries(scene_root: Node) -> Array:
	var summaries = []
	_node_refactor_collect_connection_summaries(scene_root, scene_root, summaries)
	return summaries


func _node_refactor_collect_connection_summaries(scene_root: Node, node: Node, summaries: Array) -> void:
	for connection_info in node.get_incoming_connections():
		var signal_value = connection_info.get("signal")
		var callable_value = connection_info.get("callable")
		var source = signal_value.get_object() if signal_value is Signal else null
		var target = callable_value.get_object() if callable_value is Callable else null
		if not (source is Node) or not (target is Node):
			continue
		summaries.append({
			"from": _node_refactor_node_path(scene_root, source),
			"to": _node_refactor_node_path(scene_root, target),
			"signal": signal_value.get_name() if signal_value is Signal else "",
			"method": callable_value.get_method() if callable_value is Callable else "",
			"flags": int(connection_info.get("flags", 0))
		})
	for child in node.get_children():
		if child is Node:
			_node_refactor_collect_connection_summaries(scene_root, child, summaries)


func _node_refactor_collect_dependencies(scene_root: Node, node: Node, scene_path: String, include_scripts: bool, include_dependencies: bool, dependencies: Array, seen: Dictionary) -> void:
	var from_path = _to_res_path(scene_path)
	var node_path = _node_refactor_node_path(scene_root, node)
	if include_scripts:
		var script = node.get_script()
		if script is Resource and not script.resource_path.is_empty():
			_node_refactor_add_dependency(dependencies, seen, from_path, script.resource_path, "script", node_path)
	if include_dependencies:
		if not node.scene_file_path.is_empty():
			_node_refactor_add_dependency(dependencies, seen, from_path, node.scene_file_path, "instanced_scene", node_path)
		for property_info in node.get_property_list():
			var property_name = str(property_info.get("name", ""))
			if property_name.is_empty():
				continue
			var value = node.get(property_name)
			if value is Resource and not value.resource_path.is_empty():
				_node_refactor_add_dependency(dependencies, seen, from_path, value.resource_path, "resource", node_path)
	for child in node.get_children():
		if child is Node:
			_node_refactor_collect_dependencies(scene_root, child, scene_path, include_scripts, include_dependencies, dependencies, seen)


func _node_refactor_add_dependency(dependencies: Array, seen: Dictionary, from_path: String, to_path: String, kind: String, node_path: String) -> void:
	if to_path.is_empty():
		return
	if to_path == from_path or to_path.begins_with(from_path + "::"):
		return
	var key = from_path + "|" + to_path + "|" + kind + "|" + node_path
	if seen.has(key):
		return
	seen[key] = true
	dependencies.append({
		"from": from_path,
		"to": to_path,
		"kind": kind,
		"node_path": node_path
	})


func _node_refactor_copy_common_properties(source: Node, target: Node, preserve_script: bool) -> void:
	if source is Node2D and target is Node2D:
		target.transform = source.transform
		target.visible = source.visible
		target.z_index = source.z_index
		target.modulate = source.modulate
	elif source is Node3D and target is Node3D:
		target.transform = source.transform
		target.visible = source.visible
	if source is Control and target is Control:
		target.anchor_left = source.anchor_left
		target.anchor_top = source.anchor_top
		target.anchor_right = source.anchor_right
		target.anchor_bottom = source.anchor_bottom
		target.offset_left = source.offset_left
		target.offset_top = source.offset_top
		target.offset_right = source.offset_right
		target.offset_bottom = source.offset_bottom
		target.custom_minimum_size = source.custom_minimum_size
	if _has_property(source, "text") and _has_property(target, "text"):
		target.set("text", source.get("text"))
	if preserve_script and source.get_script() != null:
		target.set_script(source.get_script())


func _node_refactor_rewrite_reference_path(current_path: String, old_path: String, new_path: String) -> String:
	if current_path == old_path:
		return new_path
	if not old_path.is_empty() and current_path.begins_with(old_path + "/"):
		return new_path + current_path.substr(old_path.length())
	return current_path


func _node_refactor_path_matches_reference(reference_path: String, target_path: String) -> bool:
	if reference_path == target_path:
		return true
	if not target_path.is_empty() and reference_path.begins_with(target_path + "/"):
		return true
	return false


func _node_refactor_node_path(scene_root: Node, node: Node) -> String:
	if node == null:
		return ""
	return "." if node == scene_root else str(scene_root.get_path_to(node))


func _node_refactor_group_list(node: Node) -> Array:
	var groups = []
	for group_name in node.get_groups():
		var text = str(group_name)
		if text.begins_with("_"):
			continue
		groups.append(text)
	groups.sort()
	return groups


func _node_refactor_is_descendant(node: Node, possible_ancestor: Node) -> bool:
	var current = node
	while current != null:
		if current == possible_ancestor:
			return true
		current = current.get_parent()
	return false


func _node_refactor_values_match(current, expected, node: Node, property_name: String) -> bool:
	var converted = _convert_property_value(expected, node, property_name)
	if current is Vector2 and expected is Array and expected.size() >= 2:
		return is_equal_approx(current.x, float(expected[0])) and is_equal_approx(current.y, float(expected[1]))
	if current is Vector3 and expected is Array and expected.size() >= 3:
		return is_equal_approx(current.x, float(expected[0])) and is_equal_approx(current.y, float(expected[1])) and is_equal_approx(current.z, float(expected[2]))
	if current is Color and expected is Array and expected.size() >= 3:
		return is_equal_approx(current.r, float(expected[0])) and is_equal_approx(current.g, float(expected[1])) and is_equal_approx(current.b, float(expected[2]))
	return str(current) == str(converted)


func _node_refactor_json_value(value):
	if value is Vector2:
		return [value.x, value.y]
	if value is Vector2i:
		return [value.x, value.y]
	if value is Vector3:
		return [value.x, value.y, value.z]
	if value is Vector3i:
		return [value.x, value.y, value.z]
	if value is Color:
		return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
	if value is NodePath:
		return str(value)
	if value is Resource:
		return {"type": value.get_class(), "path": value.resource_path}
	if value is Object:
		return str(value)
	return value
