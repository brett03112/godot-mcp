# Phase 6.B focused gameplay operation module.
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

func _to_res_path(path: String) -> String:
	return _legacy.to_res_path(path)

func _ensure_resource_dir(resource_path: String) -> bool:
	return _legacy.ensure_resource_dir(resource_path)

func _save_scene_root(scene: Node, full_path: String) -> bool:
	return _legacy.save_scene_root(scene, full_path)

func _load_scene_for_edit(scene_path: String) -> Dictionary:
	return _legacy.load_scene_for_edit(scene_path)

# Shared generation helpers used by gameplay operations.

func _design_required_output_path(params: Dictionary) -> String:
	return str(params.get("output_path", "")).strip_edges()


func _design_pascal(value: String) -> String:
	var result := ""
	var capitalize_next := true
	for character in value:
		if character == " " or character == "_" or character == "-" or character == "/":
			capitalize_next = true
			continue
		if capitalize_next:
			result += character.to_upper()
			capitalize_next = false
		else:
			result += character.to_lower()
	return result


func _design_path_to_script(path: String) -> String:
	var base := path.get_basename()
	if base.ends_with(".tscn"):
		base = base.substr(0, base.length() - 5)
	return base + ".gd"


func _design_write_text_file(res_path: String, body: String) -> bool:
	var absolute := ProjectSettings.globalize_path(res_path)
	var dir_path := absolute.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir_path):
		var mkdir_err := DirAccess.make_dir_recursive_absolute(dir_path)
		if mkdir_err != OK:
			log_error("Failed to create directory: " + dir_path + " error=" + str(mkdir_err))
			return false
	var file := FileAccess.open(res_path, FileAccess.WRITE)
	if file == null:
		log_error("Failed to open for write: " + res_path)
		return false
	file.store_string(body)
	file.close()
	return true


func _design_save_scene(scene: Node, full_path: String) -> bool:
	if not _ensure_resource_dir(full_path):
		return false
	return _save_scene_root(scene, full_path)


func _design_persist_script(path: String, script_class_name: String, body: String) -> bool:
	var content := body
	if not script_class_name.is_empty() and not content.contains("\nclass_name ") and not content.begins_with("class_name "):
		content = "class_name " + script_class_name + "\n\n" + content
	return _design_write_text_file(path, content)


func _design_script_path_for(scene_path: String) -> String:
	return _design_path_to_script(_to_res_path(scene_path))

# Phase 4.2: Gameplay loop and state-machine helper operations

func _gameplay_dry_run(params: Dictionary) -> bool:
	return bool(params.get("dry_run", false)) or bool(params.get("recipe_only", false))


func _gameplay_safe_manifest(manifest: Dictionary) -> Dictionary:
	if not manifest.has("created_files"):
		manifest["created_files"] = []
	if not manifest.has("changed_files"):
		manifest["changed_files"] = []
	if not manifest.has("validation_commands"):
		manifest["validation_commands"] = []
	if not manifest.has("preview_summary"):
		manifest["preview_summary"] = {}
	if not manifest.has("dry_run"):
		manifest["dry_run"] = false
	if not manifest.has("recipe_only"):
		manifest["recipe_only"] = false
	return manifest


func _gameplay_print_success(operation: String, manifest: Dictionary) -> void:
	print(JSON.stringify({
		"success": true,
		"operation": operation,
		"manifest": _gameplay_safe_manifest(manifest),
	}))


func _gameplay_validation_commands(entries: Array) -> Array:
	var commands: Array = []
	for entry in entries:
		if not (entry is Dictionary):
			continue
		var kind: String = str(entry.get("kind", "scene"))
		var res_path: String = str(entry.get("path", ""))
		if res_path.is_empty():
			continue
		var tool_path: String = res_path.substr(6) if res_path.begins_with("res://") else res_path
		if kind == "script" or kind == "test":
			commands.append({
				"tool": "validate_script",
				"args": {
					"projectPath": "<self>",
					"scriptPath": tool_path,
				},
			})
		elif kind == "scene":
			commands.append({
				"tool": "validate_scene",
				"args": {
					"project_path": "<self>",
					"scene_path": tool_path,
				},
			})
	return commands


func _gameplay_prepare_scene(root: Node) -> void:
	for child in root.get_children():
		child.owner = root
		_gameplay_set_owner_recursive(child, root)


func _gameplay_set_owner_recursive(node: Node, scene_owner: Node) -> void:
	for child in node.get_children():
		child.owner = scene_owner
		_gameplay_set_owner_recursive(child, scene_owner)


func _gameplay_slug(value: String) -> String:
	var result := ""
	var last_was_separator := false
	for character in value:
		var lower := character.to_lower()
		var is_allowed := (lower >= "a" and lower <= "z") or (lower >= "0" and lower <= "9")
		if is_allowed:
			result += lower
			last_was_separator = false
		elif not last_was_separator:
			result += "_"
			last_was_separator = true
	result = result.strip_edges().trim_prefix("_").trim_suffix("_")
	if result.is_empty():
		return "generated"
	return result


func _gameplay_default_class(path: String, suffix: String) -> String:
	return _design_pascal(_to_res_path(path).get_file().get_basename()) + suffix


func _gameplay_test_path(subject_path: String) -> String:
	return "res://test/test_" + _gameplay_slug(_to_res_path(subject_path).get_file().get_basename()) + ".gd"


func _gameplay_res_join(base_dir: String, file_name: String) -> String:
	var normalized_base := base_dir.trim_suffix("/")
	if normalized_base.is_empty():
		return file_name
	return normalized_base + "/" + file_name


func _gameplay_state_script_path(state_machine_path: String, state_name: String) -> String:
	return _gameplay_res_join(_to_res_path(state_machine_path).get_base_dir(), _gameplay_slug(state_name) + "_state.gd")


func _gameplay_quote(value: String) -> String:
	return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""


func _gameplay_string_array(values: Array) -> String:
	var quoted: Array = []
	for value in values:
		quoted.append(_gameplay_quote(str(value)))
	return "[" + ", ".join(quoted) + "]"


func _gameplay_scene_manifest(output_path: String, script_path: String, test_path: String, preview: Dictionary, params: Dictionary, extra_files := []) -> Dictionary:
	var files: Array = [
		{"path": _to_res_path(output_path), "kind": "scene"},
		{"path": _to_res_path(script_path), "kind": "script"},
	]
	for entry in extra_files:
		files.append(entry)
	if bool(params.get("include_tests", true)) and not test_path.is_empty():
		files.append({"path": _to_res_path(test_path), "kind": "test"})
	return {
		"created_files": files,
		"changed_files": [],
		"validation_commands": _gameplay_validation_commands(files),
		"preview_summary": preview,
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}


func _gameplay_write_smoke_test(test_path: String, scene_path: String, root_name: String) -> bool:
	var body := "extends GutTest\n\nfunc test_generated_scene_loads() -> void:\n    var packed := load(\"" + _to_res_path(scene_path) + "\") as PackedScene\n    assert_not_null(packed)\n    var node := packed.instantiate()\n    assert_not_null(node)\n    assert_eq(node.name, \"" + root_name + "\")\n    node.free()\n"
	return _design_write_text_file(_to_res_path(test_path), body)


func _gameplay_create_state_node(state_name: String) -> Node:
	var state := Node.new()
	state.name = _design_pascal(state_name) + "State"
	state.set_meta("state_name", state_name)
	return state


func _gameplay_state_machine_script_body(initial_state: String) -> String:
	return "extends Node\n\n@export var initial_state: String = \"" + initial_state + "\"\nvar current_state: String = \"\"\nvar transitions: Dictionary = {}\n\nsignal state_changed(from_state: String, to_state: String)\n\nfunc _ready() -> void:\n    if current_state.is_empty():\n        current_state = initial_state\n\nfunc add_transition(from_state: String, to_state: String, condition: String = \"\") -> void:\n    if not transitions.has(from_state):\n        transitions[from_state] = []\n    transitions[from_state].append({\"to\": to_state, \"condition\": condition})\n\nfunc can_transition(to_state: String) -> bool:\n    for transition in transitions.get(current_state, []):\n        if str(transition.get(\"to\", \"\")) == to_state:\n            return true\n    return false\n\nfunc change_state(to_state: String) -> bool:\n    var from_state := current_state\n    current_state = to_state\n    emit_signal(\"state_changed\", from_state, to_state)\n    return true\n"


func _gameplay_state_script_body(state_name: String) -> String:
	return "extends Node\n\n@export var state_name: String = \"" + state_name + "\"\n\nfunc enter(_previous_state: String = \"\") -> void:\n    pass\n\nfunc exit(_next_state: String = \"\") -> void:\n    pass\n\nfunc tick(_delta: float) -> void:\n    pass\n"


func _gameplay_create_state_machine(params: Dictionary) -> void:
	log_info("Starting gameplay_create_state_machine operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var state_names_param = params.get("state_names", ["Idle"])
	var state_names: Array = state_names_param if state_names_param is Array else ["Idle"]
	if state_names.is_empty():
		state_names = ["Idle"]
	var initial_state := str(state_names[0])
	var script_path := _design_script_path_for(output_path)
	var test_path := _gameplay_test_path(output_path)
	var script_class_name: String = str(params.get("class_name", "")).strip_edges()
	if script_class_name.is_empty():
		script_class_name = _gameplay_default_class(output_path, "StateMachine")
	var preview := {
		"state_count": state_names.size(),
		"states": state_names,
		"script_class": script_class_name,
		"test_path": test_path,
	}
	var manifest := _gameplay_scene_manifest(output_path, script_path, test_path, preview, params)
	if not _gameplay_dry_run(params):
		if not _design_persist_script(script_path, script_class_name, _gameplay_state_machine_script_body(initial_state)):
			return
		var root := Node.new()
		root.name = _gameplay_default_class(output_path, "")
		var script = load(script_path)
		if script != null:
			root.set_script(script)
		var states := Node.new()
		states.name = "States"
		root.add_child(states)
		for state_name in state_names:
			states.add_child(_gameplay_create_state_node(str(state_name)))
		var transitions := Node.new()
		transitions.name = "Transitions"
		root.add_child(transitions)
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(output_path)):
			root.free()
			return
		root.free()
		if bool(params.get("include_tests", true)):
			if not _gameplay_write_smoke_test(test_path, output_path, _gameplay_default_class(output_path, "")):
				return
	_gameplay_print_success("gameplay_create_state_machine", manifest)
	log_info("gameplay_create_state_machine completed successfully")


func _gameplay_add_state(params: Dictionary) -> void:
	log_info("Starting gameplay_add_state operation")
	var state_machine_path := str(params.get("state_machine_path", "")).strip_edges()
	var state_name := str(params.get("state_name", "")).strip_edges()
	if state_machine_path.is_empty():
		log_error("state_machine_path is required")
		return
	if state_name.is_empty():
		log_error("state_name is required")
		return
	var script_path := _gameplay_state_script_path(state_machine_path, state_name)
	var test_path := _gameplay_test_path(state_machine_path)
	var changed_files: Array = [{"path": _to_res_path(state_machine_path), "kind": "scene"}]
	var created_files: Array = [{"path": script_path, "kind": "script"}]
	if bool(params.get("include_tests", true)):
		created_files.append({"path": test_path, "kind": "test"})
	var manifest := {
		"created_files": created_files,
		"changed_files": changed_files,
		"validation_commands": _gameplay_validation_commands(created_files + changed_files),
		"preview_summary": {
			"state_name": state_name,
			"state_script": script_path,
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not _gameplay_dry_run(params):
		if not _design_persist_script(script_path, str(params.get("class_name", "")).strip_edges(), _gameplay_state_script_body(state_name)):
			return
		var loaded := _load_scene_for_edit(state_machine_path)
		if loaded.is_empty():
			return
		var root: Node = loaded["scene_root"]
		var states := root.get_node_or_null("States")
		if states == null:
			states = Node.new()
			states.name = "States"
			root.add_child(states)
		var node_name := _design_pascal(state_name) + "State"
		var state_node := states.get_node_or_null(NodePath(node_name))
		if state_node == null:
			state_node = _gameplay_create_state_node(state_name)
			states.add_child(state_node)
		var script = load(script_path)
		if script != null:
			state_node.set_script(script)
		var root_name := root.name
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(state_machine_path)):
			root.free()
			return
		root.free()
		if bool(params.get("include_tests", true)):
			if not _gameplay_write_smoke_test(test_path, state_machine_path, root_name):
				return
	_gameplay_print_success("gameplay_add_state", manifest)
	log_info("gameplay_add_state completed successfully")


func _gameplay_connect_state_transition(params: Dictionary) -> void:
	log_info("Starting gameplay_connect_state_transition operation")
	var state_machine_path := str(params.get("state_machine_path", "")).strip_edges()
	var from_state := str(params.get("from_state", "")).strip_edges()
	var to_state := str(params.get("to_state", "")).strip_edges()
	var condition := str(params.get("condition", "")).strip_edges()
	if state_machine_path.is_empty():
		log_error("state_machine_path is required")
		return
	if from_state.is_empty() or to_state.is_empty():
		log_error("from_state and to_state are required")
		return
	var changed_files: Array = [{"path": _to_res_path(state_machine_path), "kind": "scene"}]
	var manifest := {
		"created_files": [],
		"changed_files": changed_files,
		"validation_commands": _gameplay_validation_commands(changed_files),
		"preview_summary": {
			"from_state": from_state,
			"to_state": to_state,
			"condition": condition,
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not _gameplay_dry_run(params):
		var loaded := _load_scene_for_edit(state_machine_path)
		if loaded.is_empty():
			return
		var root: Node = loaded["scene_root"]
		var transitions := root.get_node_or_null("Transitions")
		if transitions == null:
			transitions = Node.new()
			transitions.name = "Transitions"
			root.add_child(transitions)
		var transition_name := _design_pascal(from_state) + "To" + _design_pascal(to_state)
		var transition_node := transitions.get_node_or_null(NodePath(transition_name))
		if transition_node == null:
			transition_node = Node.new()
			transition_node.name = transition_name
			transitions.add_child(transition_node)
		transition_node.set_meta("from_state", from_state)
		transition_node.set_meta("to_state", to_state)
		transition_node.set_meta("condition", condition)
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(state_machine_path)):
			root.free()
			return
		root.free()
	_gameplay_print_success("gameplay_connect_state_transition", manifest)
	log_info("gameplay_connect_state_transition completed successfully")


func _gameplay_character_controller_script(params: Dictionary) -> String:
	var controller_type := str(params.get("controller_type", "top_down_2d"))
	var movement_speed := float(params.get("movement_speed", 240.0))
	var jump_velocity := float(params.get("jump_velocity", -420.0))
	var gravity := float(params.get("gravity", 980.0))
	return "extends CharacterBody2D\n\n@export_enum(\"top_down_2d\", \"platformer_2d\") var controller_type: String = \"" + controller_type + "\"\n@export var movement_speed: float = " + str(movement_speed) + "\n@export var jump_velocity: float = " + str(jump_velocity) + "\n@export var gravity: float = " + str(gravity) + "\n\nfunc _physics_process(delta: float) -> void:\n    if controller_type == \"platformer_2d\":\n        var axis := Input.get_axis(\"ui_left\", \"ui_right\")\n        velocity.x = axis * movement_speed\n        if not is_on_floor():\n            velocity.y += gravity * delta\n        if Input.is_action_just_pressed(\"ui_accept\") and is_on_floor():\n            velocity.y = jump_velocity\n    else:\n        var direction := Input.get_vector(\"ui_left\", \"ui_right\", \"ui_up\", \"ui_down\")\n        velocity = direction * movement_speed\n    move_and_slide()\n"


func _gameplay_generate_character_controller(params: Dictionary) -> void:
	log_info("Starting gameplay_generate_character_controller operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var script_path := _design_script_path_for(output_path)
	var test_path := _gameplay_test_path(output_path)
	var script_class_name: String = str(params.get("class_name", "")).strip_edges()
	if script_class_name.is_empty():
		script_class_name = _gameplay_default_class(output_path, "Controller")
	var preview := {
		"controller_type": str(params.get("controller_type", "top_down_2d")),
		"movement_speed": float(params.get("movement_speed", 240.0)),
		"jump_velocity": float(params.get("jump_velocity", -420.0)),
		"gravity": float(params.get("gravity", 980.0)),
		"script_class": script_class_name,
	}
	var manifest := _gameplay_scene_manifest(output_path, script_path, test_path, preview, params)
	if not _gameplay_dry_run(params):
		if not _design_persist_script(script_path, script_class_name, _gameplay_character_controller_script(params)):
			return
		var root := CharacterBody2D.new()
		root.name = _gameplay_default_class(output_path, "")
		var script = load(script_path)
		if script != null:
			root.set_script(script)
		var sprite := Sprite2D.new()
		sprite.name = "Sprite"
		root.add_child(sprite)
		var shape := CollisionShape2D.new()
		shape.name = "Collision"
		var capsule := CapsuleShape2D.new()
		capsule.radius = 12.0
		capsule.height = 36.0
		shape.shape = capsule
		root.add_child(shape)
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(output_path)):
			root.free()
			return
		root.free()
		if bool(params.get("include_tests", true)):
			if not _gameplay_write_smoke_test(test_path, output_path, _gameplay_default_class(output_path, "")):
				return
	_gameplay_print_success("gameplay_generate_character_controller", manifest)
	log_info("gameplay_generate_character_controller completed successfully")


func _gameplay_generate_interaction_system(params: Dictionary) -> void:
	log_info("Starting gameplay_generate_interaction_system operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var script_path := _design_script_path_for(output_path)
	var test_path := _gameplay_test_path(output_path)
	var action := str(params.get("interaction_action", "interact"))
	var script_class_name: String = str(params.get("class_name", "")).strip_edges()
	if script_class_name.is_empty():
		script_class_name = _gameplay_default_class(output_path, "InteractionSystem")
	var manifest := _gameplay_scene_manifest(output_path, script_path, test_path, {"interaction_action": action, "script_class": script_class_name}, params)
	if not _gameplay_dry_run(params):
		var body := "extends Area2D\n\n@export var interaction_action: String = \"" + action + "\"\nvar current_target: Node = null\n\nsignal interacted(target: Node)\n\nfunc _ready() -> void:\n    body_entered.connect(_on_body_entered)\n    body_exited.connect(_on_body_exited)\n\nfunc _unhandled_input(event: InputEvent) -> void:\n    if event.is_action_pressed(interaction_action) and current_target != null:\n        emit_signal(\"interacted\", current_target)\n\nfunc _on_body_entered(body: Node) -> void:\n    current_target = body\n\nfunc _on_body_exited(body: Node) -> void:\n    if current_target == body:\n        current_target = null\n"
		if not _design_persist_script(script_path, script_class_name, body):
			return
		var root := Area2D.new()
		root.name = _gameplay_default_class(output_path, "")
		var script = load(script_path)
		if script != null:
			root.set_script(script)
		var shape := CollisionShape2D.new()
		shape.name = "InteractionRange"
		var circle := CircleShape2D.new()
		circle.radius = 72.0
		shape.shape = circle
		root.add_child(shape)
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(output_path)):
			root.free()
			return
		root.free()
		if bool(params.get("include_tests", true)):
			if not _gameplay_write_smoke_test(test_path, output_path, _gameplay_default_class(output_path, "")):
				return
	_gameplay_print_success("gameplay_generate_interaction_system", manifest)
	log_info("gameplay_generate_interaction_system completed successfully")


func _gameplay_generate_inventory_system(params: Dictionary) -> void:
	log_info("Starting gameplay_generate_inventory_system operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var script_path := _design_script_path_for(output_path)
	var item_path := _gameplay_res_join(_to_res_path(output_path).get_base_dir(), _gameplay_slug(_to_res_path(output_path).get_file().get_basename()) + "_item.gd")
	var test_path := _gameplay_test_path(output_path)
	var inventory_size := int(params.get("inventory_size", 16))
	var script_class_name: String = str(params.get("class_name", "")).strip_edges()
	if script_class_name.is_empty():
		script_class_name = _gameplay_default_class(output_path, "Inventory")
	var item_class_name := script_class_name + "Item"
	var extra_files := [{"path": item_path, "kind": "script"}]
	var manifest := _gameplay_scene_manifest(output_path, script_path, test_path, {"inventory_size": inventory_size, "script_class": script_class_name, "item_class": item_class_name}, params, extra_files)
	if not _gameplay_dry_run(params):
		var body := "extends Node\n\n@export var inventory_size: int = " + str(inventory_size) + "\nvar items: Array = []\n\nsignal inventory_changed(items: Array)\n\nfunc add_item(item) -> bool:\n    if items.size() >= inventory_size:\n        return false\n    items.append(item)\n    emit_signal(\"inventory_changed\", items)\n    return true\n\nfunc remove_item(item) -> bool:\n    var index := items.find(item)\n    if index < 0:\n        return false\n    items.remove_at(index)\n    emit_signal(\"inventory_changed\", items)\n    return true\n\nfunc has_item(item) -> bool:\n    return items.has(item)\n\nfunc clear() -> void:\n    items.clear()\n    emit_signal(\"inventory_changed\", items)\n"
		var item_body := "extends Resource\n\n@export var id: String = \"item\"\n@export var display_name: String = \"Item\"\n@export var stack_size: int = 1\n"
		if not _design_persist_script(script_path, script_class_name, body):
			return
		if not _design_persist_script(item_path, item_class_name, item_body):
			return
		var root := Node.new()
		root.name = _gameplay_default_class(output_path, "")
		var script = load(script_path)
		if script != null:
			root.set_script(script)
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(output_path)):
			root.free()
			return
		root.free()
		if bool(params.get("include_tests", true)):
			if not _gameplay_write_smoke_test(test_path, output_path, _gameplay_default_class(output_path, "")):
				return
	_gameplay_print_success("gameplay_generate_inventory_system", manifest)
	log_info("gameplay_generate_inventory_system completed successfully")


func _gameplay_generate_dialogue_controller(params: Dictionary) -> void:
	log_info("Starting gameplay_generate_dialogue_controller operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var script_path := _design_script_path_for(output_path)
	var test_path := _gameplay_test_path(output_path)
	var lines_param = params.get("dialogue_lines", ["Hello"])
	var dialogue_lines: Array = lines_param if lines_param is Array else ["Hello"]
	if dialogue_lines.is_empty():
		dialogue_lines = ["Hello"]
	var script_class_name: String = str(params.get("class_name", "")).strip_edges()
	if script_class_name.is_empty():
		script_class_name = _gameplay_default_class(output_path, "DialogueController")
	var manifest := _gameplay_scene_manifest(output_path, script_path, test_path, {"line_count": dialogue_lines.size(), "script_class": script_class_name}, params)
	if not _gameplay_dry_run(params):
		var body := "extends CanvasLayer\n\n@export var dialogue_lines: Array[String] = " + _gameplay_string_array(dialogue_lines) + "\nvar current_index: int = -1\n\nsignal dialogue_started\nsignal dialogue_finished\nsignal line_changed(line: String, index: int)\n\nfunc start() -> void:\n    current_index = -1\n    emit_signal(\"dialogue_started\")\n    show_next_line()\n\nfunc show_next_line() -> bool:\n    current_index += 1\n    if current_index >= dialogue_lines.size():\n        emit_signal(\"dialogue_finished\")\n        return false\n    emit_signal(\"line_changed\", dialogue_lines[current_index], current_index)\n    return true\n"
		if not _design_persist_script(script_path, script_class_name, body):
			return
		var root := CanvasLayer.new()
		root.name = _gameplay_default_class(output_path, "")
		var script = load(script_path)
		if script != null:
			root.set_script(script)
		var panel := PanelContainer.new()
		panel.name = "DialoguePanel"
		var label := Label.new()
		label.name = "DialogueText"
		label.text = str(dialogue_lines[0])
		panel.add_child(label)
		root.add_child(panel)
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(output_path)):
			root.free()
			return
		root.free()
		if bool(params.get("include_tests", true)):
			if not _gameplay_write_smoke_test(test_path, output_path, _gameplay_default_class(output_path, "")):
				return
	_gameplay_print_success("gameplay_generate_dialogue_controller", manifest)
	log_info("gameplay_generate_dialogue_controller completed successfully")


func _gameplay_generate_save_load_system(params: Dictionary) -> void:
	log_info("Starting gameplay_generate_save_load_system operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var script_path := _design_script_path_for(output_path)
	var test_path := _gameplay_test_path(output_path)
	var save_slots := int(params.get("save_slots", 3))
	var script_class_name: String = str(params.get("class_name", "")).strip_edges()
	if script_class_name.is_empty():
		script_class_name = _gameplay_default_class(output_path, "SaveLoad")
	var manifest := _gameplay_scene_manifest(output_path, script_path, test_path, {"save_slots": save_slots, "script_class": script_class_name}, params)
	if not _gameplay_dry_run(params):
		var body := "extends Node\n\n@export var save_slots: int = " + str(save_slots) + "\n\nfunc _slot_path(slot: int) -> String:\n    return \"user://save_slot_%d.json\" % clamp(slot, 0, max(save_slots - 1, 0))\n\nfunc save_game(slot: int, data: Dictionary) -> bool:\n    var file := FileAccess.open(_slot_path(slot), FileAccess.WRITE)\n    if file == null:\n        return false\n    file.store_string(JSON.stringify(data))\n    file.close()\n    return true\n\nfunc load_game(slot: int) -> Dictionary:\n    var path := _slot_path(slot)\n    if not FileAccess.file_exists(path):\n        return {}\n    var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))\n    if parsed is Dictionary:\n        return parsed\n    return {}\n"
		if not _design_persist_script(script_path, script_class_name, body):
			return
		var root := Node.new()
		root.name = _gameplay_default_class(output_path, "")
		var script = load(script_path)
		if script != null:
			root.set_script(script)
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(output_path)):
			root.free()
			return
		root.free()
		if bool(params.get("include_tests", true)):
			if not _gameplay_write_smoke_test(test_path, output_path, _gameplay_default_class(output_path, "")):
				return
	_gameplay_print_success("gameplay_generate_save_load_system", manifest)
	log_info("gameplay_generate_save_load_system completed successfully")


func _gameplay_generate_settings_persistence(params: Dictionary) -> void:
	log_info("Starting gameplay_generate_settings_persistence operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var script_path := _design_script_path_for(output_path)
	var test_path := _gameplay_test_path(output_path)
	var keys_param = params.get("settings_keys", ["master_volume", "fullscreen"])
	var settings_keys: Array = keys_param if keys_param is Array else ["master_volume", "fullscreen"]
	if settings_keys.is_empty():
		settings_keys = ["master_volume", "fullscreen"]
	var script_class_name: String = str(params.get("class_name", "")).strip_edges()
	if script_class_name.is_empty():
		script_class_name = _gameplay_default_class(output_path, "SettingsPersistence")
	var manifest := _gameplay_scene_manifest(output_path, script_path, test_path, {"settings_keys": settings_keys, "script_class": script_class_name}, params)
	if not _gameplay_dry_run(params):
		var body := "extends Node\n\nconst CONFIG_PATH := \"user://settings.cfg\"\n@export var settings_keys: Array[String] = " + _gameplay_string_array(settings_keys) + "\nvar config := ConfigFile.new()\n\nfunc _ready() -> void:\n    load_settings()\n\nfunc set_setting(key: String, value) -> void:\n    config.set_value(\"settings\", key, value)\n\nfunc get_setting(key: String, default_value = null):\n    return config.get_value(\"settings\", key, default_value)\n\nfunc load_settings() -> bool:\n    var err := config.load(CONFIG_PATH)\n    return err == OK or err == ERR_FILE_NOT_FOUND\n\nfunc save_settings() -> bool:\n    return config.save(CONFIG_PATH) == OK\n"
		if not _design_persist_script(script_path, script_class_name, body):
			return
		var root := Node.new()
		root.name = _gameplay_default_class(output_path, "")
		var script = load(script_path)
		if script != null:
			root.set_script(script)
		_gameplay_prepare_scene(root)
		if not _design_save_scene(root, _to_res_path(output_path)):
			root.free()
			return
		root.free()
		if bool(params.get("include_tests", true)):
			if not _gameplay_write_smoke_test(test_path, output_path, _gameplay_default_class(output_path, "")):
				return
	_gameplay_print_success("gameplay_generate_settings_persistence", manifest)
	log_info("gameplay_generate_settings_persistence completed successfully")
