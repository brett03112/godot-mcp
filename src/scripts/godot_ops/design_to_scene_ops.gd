# Phase 6.B focused design-to-scene operation module.
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

# Phase 4.1: Design-to-scene workflow helpers

func _design_required_output_path(params: Dictionary) -> String:
	return str(params.get("output_path", "")).strip_edges()


func _design_dry_run(params: Dictionary) -> bool:
	return bool(params.get("dry_run", false)) or bool(params.get("recipe_only", false))


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


func _design_normalize_size(value, fallback := Vector2(1152, 648)) -> Vector2:
	if value is Vector2:
		return value
	if value is Array and value.size() >= 2:
		return Vector2(float(value[0]), float(value[1]))
	if value is Dictionary and value.has("x") and value.has("y"):
		return Vector2(float(value["x"]), float(value["y"]))
	return fallback


func _design_safe_manifest(manifest: Dictionary) -> Dictionary:
	if not manifest.has("created_files"):
		manifest["created_files"] = []
	if not manifest.has("validation_commands"):
		manifest["validation_commands"] = []
	if not manifest.has("preview_summary"):
		manifest["preview_summary"] = {}
	if not manifest.has("dry_run"):
		manifest["dry_run"] = false
	if not manifest.has("recipe_only"):
		manifest["recipe_only"] = false
	return manifest


func _design_print_success(operation: String, manifest: Dictionary) -> void:
	var payload := {
		"success": true,
		"operation": operation,
		"manifest": _design_safe_manifest(manifest),
	}
	print(JSON.stringify(payload))


func _design_validation_commands(entries: Array) -> Array:
	var commands: Array = []
	for entry in entries:
		if not (entry is Dictionary):
			continue
		var kind: String = str(entry.get("kind", "scene"))
		var res_path: String = str(entry.get("path", ""))
		if res_path.is_empty():
			continue
		var tool_path: String = res_path.substr(6) if res_path.begins_with("res://") else res_path
		if kind == "script":
			commands.append({
				"tool": "validate_script",
				"args": {
					"projectPath": "<self>",
					"scriptPath": tool_path,
				},
			})
		else:
			commands.append({
				"tool": "validate_scene",
				"args": {
					"project_path": "<self>",
					"scene_path": tool_path,
				},
			})
	return commands


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


func _design_build_blockout_2d(grid_size, spawn_position, include_physics: bool) -> Node:
	var grid := _design_normalize_size(grid_size, Vector2(16, 12))
	var spawn := Vector2.ZERO
	if spawn_position is Array and spawn_position.size() >= 2:
		spawn = Vector2(float(spawn_position[0]), float(spawn_position[1]))
	elif spawn_position is Vector2:
		spawn = spawn_position
	var root := Node2D.new()
	root.name = "Blockout"
	var tile_size := Vector2(64, 64)
	var ground := StaticBody2D.new()
	ground.name = "Ground"
	ground.position = Vector2((grid.x * tile_size.x) * 0.5, grid.y * tile_size.y - 32.0)
	var ground_color := ColorRect.new()
	ground_color.name = "GroundColor"
	ground_color.color = Color(0.18, 0.20, 0.24, 1.0)
	ground_color.size = Vector2(grid.x * tile_size.x, 64.0)
	ground_color.position = Vector2(-ground_color.size.x * 0.5, -32.0)
	ground.add_child(ground_color)
	if include_physics:
		var ground_shape := CollisionShape2D.new()
		ground_shape.name = "GroundShape"
		var rect := RectangleShape2D.new()
		rect.size = Vector2(grid.x * tile_size.x, 64.0)
		ground_shape.shape = rect
		ground.add_child(ground_shape)
	root.add_child(ground)

	var left_wall := StaticBody2D.new()
	left_wall.name = "LeftWall"
	left_wall.position = Vector2(-32.0, (grid.y * tile_size.y) * 0.5)
	var left_color := ColorRect.new()
	left_color.name = "LeftColor"
	left_color.color = Color(0.25, 0.27, 0.32, 1.0)
	left_color.size = Vector2(64.0, grid.y * tile_size.y)
	left_color.position = Vector2(-32.0, -left_color.size.y * 0.5)
	left_wall.add_child(left_color)
	if include_physics:
		var left_shape := CollisionShape2D.new()
		left_shape.name = "LeftShape"
		var lrect := RectangleShape2D.new()
		lrect.size = Vector2(64.0, grid.y * tile_size.y)
		left_shape.shape = lrect
		left_wall.add_child(left_shape)
	root.add_child(left_wall)

	var right_wall := StaticBody2D.new()
	right_wall.name = "RightWall"
	right_wall.position = Vector2(grid.x * tile_size.x + 32.0, (grid.y * tile_size.y) * 0.5)
	var right_color := ColorRect.new()
	right_color.name = "RightColor"
	right_color.color = Color(0.25, 0.27, 0.32, 1.0)
	right_color.size = Vector2(64.0, grid.y * tile_size.y)
	right_color.position = Vector2(-32.0, -right_color.size.y * 0.5)
	right_wall.add_child(right_color)
	if include_physics:
		var right_shape := CollisionShape2D.new()
		right_shape.name = "RightShape"
		var rrect := RectangleShape2D.new()
		rrect.size = Vector2(64.0, grid.y * tile_size.y)
		right_shape.shape = rrect
		right_wall.add_child(right_shape)
	root.add_child(right_wall)

	var marker := Marker2D.new()
	marker.name = "PlayerSpawn"
	marker.position = spawn
	root.add_child(marker)
	return root


func _design_blockout_blocks_summary(grid_size) -> Dictionary:
	var grid := _design_normalize_size(grid_size, Vector2(16, 12))
	return {
		"grid_size": [grid.x, grid.y],
		"tile_size": [64, 64],
		"blocks": ["ground", "left_wall", "right_wall", "player_spawn"],
	}


func _design_build_hud_scene(root_size: Vector2) -> Node:
	var root := CanvasLayer.new()
	root.name = "HudLayer"
	var panel := Control.new()
	panel.name = "Hud"
	panel.custom_minimum_size = root_size
	panel.size = root_size
	_design_apply_full_rect(panel)
	root.add_child(panel)

	var score := Label.new()
	score.name = "ScoreLabel"
	score.text = "Score: 0"
	score.position = Vector2(24, 18)
	score.custom_minimum_size = Vector2(220, 32)
	panel.add_child(score)

	var health := Label.new()
	health.name = "HealthLabel"
	health.text = "Health: 100"
	health.position = Vector2(root_size.x - 224, 18)
	health.custom_minimum_size = Vector2(200, 32)
	health.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	panel.add_child(health)

	var time := Label.new()
	time.name = "TimeLabel"
	time.text = "0:00"
	time.position = Vector2(root_size.x * 0.5 - 60, 18)
	time.custom_minimum_size = Vector2(120, 32)
	time.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	panel.add_child(time)

	var pause := Button.new()
	pause.name = "PauseButton"
	pause.text = "Pause"
	pause.position = Vector2(root_size.x - 124, root_size.y - 72)
	pause.custom_minimum_size = Vector2(100, 44)
	panel.add_child(pause)
	return root


func _design_apply_full_rect(control: Control) -> void:
	control.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_KEEP_SIZE)


func _design_menu_panel_spec(
	title: String, subtitle: String, buttons: Array
) -> Dictionary:
	var button_specs: Array = []
	for idx in range(buttons.size()):
		button_specs.append({
			"type": "Button",
			"name": "Button" + str(idx + 1),
			"text": buttons[idx],
			"custom_minimum_size": [240, 48]
		})

	var stack_children: Array = [
		{
			"type": "Label",
			"name": "TitleLabel",
			"text": title,
			"horizontal_alignment": 1,
			"custom_minimum_size": [320, 48]
		},
		{
			"type": "Label",
			"name": "SubtitleLabel",
			"text": subtitle,
			"horizontal_alignment": 1,
			"custom_minimum_size": [320, 28]
		}
	]
	stack_children.append_array(button_specs)

	return {
		"type": "PanelContainer",
		"name": "MenuPanel",
		"anchor_preset": "center",
		"offsets": {"left": -200, "top": -180, "right": 200, "bottom": 180},
		"children": [
			{
				"type": "VBoxContainer",
				"name": "MenuStack",
				"anchor_preset": "full_rect",
				"offsets": {"left": 24, "top": 24, "right": -24, "bottom": -24},
				"separation": 16,
				"children": stack_children
			}
		]
	}


func _design_build_ui_layout(root_name: String, root_size: Vector2, controls: Array) -> Control:
	var root := Control.new()
	root.name = root_name
	root.custom_minimum_size = root_size
	root.size = root_size
	_design_apply_full_rect(root)
	for spec in controls:
		if not (spec is Dictionary):
			continue
		_design_add_control_spec(root, root, spec, root_size)
	return root


func _design_add_control_spec(scene_root: Node, parent: Node, spec: Dictionary, viewport_size: Vector2) -> Node:
	var type_name: String = str(spec.get("type", "Control"))
	if not ClassDB.class_exists(type_name):
		type_name = "Control"
	var node = ClassDB.instantiate(type_name)
	if node == null:
		return null
	node.name = str(spec.get("name", type_name))
	if node is Control:
		var control := node as Control
		var preset: String = str(spec.get("anchor_preset", ""))
		if not preset.is_empty():
			_design_apply_anchor(control, preset)
		var offsets = spec.get("offsets", {})
		if offsets is Dictionary and not offsets.is_empty():
			_design_apply_offsets(control, offsets)
		if spec.has("text"):
			control.set("text", str(spec.get("text", "")))
		if spec.has("columns"):
			control.set("columns", int(spec.get("columns", 1)))
		if spec.has("separation"):
			control.set("separation", int(spec.get("separation", 8)))
		if spec.has("horizontal_alignment"):
			control.set("horizontal_alignment", int(spec.get("horizontal_alignment", 0)))
		var min_size = spec.get("custom_minimum_size")
		if min_size is Array and min_size.size() >= 2:
			control.custom_minimum_size = Vector2(float(min_size[0]), float(min_size[1]))
	parent.add_child(node)
	for child_spec in spec.get("children", []):
		if child_spec is Dictionary:
			_design_add_control_spec(scene_root, node, child_spec, viewport_size)
	return node


func _design_apply_anchor(control: Control, preset: String) -> void:
	var preset_id := -1
	match preset:
		"full_rect": preset_id = Control.PRESET_FULL_RECT
		"top_left": preset_id = Control.PRESET_TOP_LEFT
		"top_right": preset_id = Control.PRESET_TOP_RIGHT
		"bottom_left": preset_id = Control.PRESET_BOTTOM_LEFT
		"bottom_right": preset_id = Control.PRESET_BOTTOM_RIGHT
		"center": preset_id = Control.PRESET_CENTER
		"top_wide": preset_id = Control.PRESET_TOP_WIDE
		"bottom_wide": preset_id = Control.PRESET_BOTTOM_WIDE
		"left_wide": preset_id = Control.PRESET_LEFT_WIDE
		"right_wide": preset_id = Control.PRESET_RIGHT_WIDE
		"vcenter_wide": preset_id = Control.PRESET_VCENTER_WIDE
		"hcenter_wide": preset_id = Control.PRESET_HCENTER_WIDE
	if preset_id >= 0:
		control.set_anchors_and_offsets_preset(preset_id, Control.PRESET_MODE_KEEP_SIZE)


func _design_apply_offsets(control: Control, offsets: Dictionary) -> void:
	if offsets.has("left"): control.offset_left = float(offsets["left"])
	if offsets.has("top"): control.offset_top = float(offsets["top"])
	if offsets.has("right"): control.offset_right = float(offsets["right"])
	if offsets.has("bottom"): control.offset_bottom = float(offsets["bottom"])


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


func _design_generate_scene_from_brief(params: Dictionary) -> void:
	log_info("Starting design_generate_scene_from_brief operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var brief: String = str(params.get("brief", "")).strip_edges()
	if brief.is_empty():
		log_error("brief is required")
		return
	var include_hud := bool(params.get("include_hud", true))
	var include_menu := bool(params.get("include_menu", true))
	var include_settings := bool(params.get("include_settings", false))
	var include_dialogue := bool(params.get("include_dialogue", false))
	var include_mobile := bool(params.get("include_mobile_controls", false))
	var include_blockout := bool(params.get("include_blockout", false))
	var dry_run := _design_dry_run(params)
	var files: Array = []
	files.append({"path": _to_res_path(output_path), "kind": "scene"})

	if include_hud:
		files.append({"path": "res://scenes/mcp_design_hud.tscn", "kind": "scene"})
		files.append({"path": "res://scripts/mcp_design_hud_controller.gd", "kind": "script"})
	if include_menu:
		files.append({"path": "res://scenes/mcp_design_menu.tscn", "kind": "scene"})
		files.append({"path": "res://scripts/mcp_design_menu_controller.gd", "kind": "script"})
	if include_settings:
		files.append({"path": "res://scenes/mcp_design_settings.tscn", "kind": "scene"})
	if include_dialogue:
		files.append({"path": "res://scenes/mcp_design_dialogue.tscn", "kind": "scene"})
		files.append({"path": "res://scripts/mcp_design_dialogue_line.gd", "kind": "script"})
	if include_mobile:
		files.append({"path": "res://scenes/mcp_design_mobile_controls.tscn", "kind": "scene"})
	if include_blockout:
		files.append({"path": "res://scenes/mcp_design_blockout.tscn", "kind": "scene"})

	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {
			"brief": brief,
			"scene_count": files.filter(func(f): return f.get("kind", "") == "scene").size(),
			"script_count": files.filter(func(f): return f.get("kind", "") == "script").size(),
			"feature_flags": {
				"hud": include_hud,
				"menu": include_menu,
				"settings": include_settings,
				"dialogue": include_dialogue,
				"mobile_controls": include_mobile,
				"blockout": include_blockout,
			},
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}

	if not dry_run:
		var full_scene := _to_res_path(output_path)
		var layout := _design_build_ui_layout("McpDesignRoot", _design_normalize_size(params.get("root_size", [1152, 648])), [])
		if not _design_save_scene(layout, full_scene):
			log_error("Failed to save brief scene: " + full_scene)
			return
		layout.free()

		if include_hud:
			var hud := _design_build_hud_scene(_design_normalize_size(params.get("root_size", [1152, 648])))
			if not _design_save_scene(hud, "res://scenes/mcp_design_hud.tscn"):
				log_error("Failed to save HUD scene")
				return
			hud.free()
			var hud_body := "extends Node\n\n@export var score: int = 0\n@export var health: int = 100\n\nfunc _ready() -> void:\n    pass\n"
			if not _design_persist_script("res://scripts/mcp_design_hud_controller.gd", "McpDesignHudController", hud_body):
				return

		if include_menu:
			var menu_specs := [_design_menu_panel_spec("Brief Menu", brief, ["Play", "Settings", "Quit"])]
			var menu_root := _design_build_ui_layout("McpDesignMenu", _design_normalize_size(params.get("root_size", [1152, 648])), menu_specs)
			if not _design_save_scene(menu_root, "res://scenes/mcp_design_menu.tscn"):
				log_error("Failed to save menu scene")
				return
			menu_root.free()
			var menu_body := "extends Node\n\nsignal play_pressed\nsignal settings_pressed\nsignal quit_pressed\n\nfunc _ready() -> void:\n    pass\n"
			if not _design_persist_script("res://scripts/mcp_design_menu_controller.gd", "McpDesignMenuController", menu_body):
				return

		if include_settings:
			var settings_specs := [_design_menu_panel_spec("Settings", "", ["Audio", "Video", "Controls", "Back"])]
			var settings_root := _design_build_ui_layout("McpDesignSettings", _design_normalize_size(params.get("root_size", [1152, 648])), settings_specs)
			if not _design_save_scene(settings_root, "res://scenes/mcp_design_settings.tscn"):
				log_error("Failed to save settings scene")
				return
			settings_root.free()

		if include_dialogue:
			var dialogue_specs := [
				{"type": "PanelContainer", "name": "DialoguePanel", "anchor_preset": "bottom_wide", "offsets": {"left": 48, "top": -200, "right": -48, "bottom": -32}, "children": [
					{"type": "VBoxContainer", "name": "DialogueStack", "anchor_preset": "full_rect", "offsets": {"left": 24, "top": 20, "right": -24, "bottom": -20}, "separation": 8, "children": [
						{"type": "Label", "name": "SpeakerLabel", "text": "Speaker", "custom_minimum_size": [240, 32]},
						{"type": "Label", "name": "DialogueLabel", "text": brief, "custom_minimum_size": [420, 72]},
						{"type": "Button", "name": "ContinueButton", "text": "Continue", "custom_minimum_size": [160, 48]},
					]},
				]}
			]
			var dialogue_root := _design_build_ui_layout("McpDesignDialogue", _design_normalize_size(params.get("root_size", [1152, 648])), dialogue_specs)
			if not _design_save_scene(dialogue_root, "res://scenes/mcp_design_dialogue.tscn"):
				log_error("Failed to save dialogue scene")
				return
			dialogue_root.free()
			var line_body := "extends RefCounted\n\nclass_name McpDesignDialogueLine\n\n@export var speaker: String = \"\"\n@export var text: String = \"\"\n"
			if not _design_persist_script("res://scripts/mcp_design_dialogue_line.gd", "McpDesignDialogueLine", line_body):
				return

		if include_mobile:
			var mobile_specs := [
				{"type": "TouchScreenButton", "name": "JoystickBase", "anchor_preset": "bottom_left", "offsets": {"left": 40, "top": -200, "right": 200, "bottom": -40}},
				{"type": "Button", "name": "ActionButtonA", "text": "A", "anchor_preset": "bottom_right", "offsets": {"left": -180, "top": -140, "right": -88, "bottom": -48}, "custom_minimum_size": [88, 88]},
				{"type": "Button", "name": "ActionButtonB", "text": "B", "anchor_preset": "bottom_right", "offsets": {"left": -90, "top": -232, "right": -2, "bottom": -140}, "custom_minimum_size": [88, 88]},
			]
			var mobile_root := _design_build_ui_layout("McpDesignMobileControls", _design_normalize_size(params.get("root_size", [720, 1280])), mobile_specs)
			if not _design_save_scene(mobile_root, "res://scenes/mcp_design_mobile_controls.tscn"):
				log_error("Failed to save mobile controls scene")
				return
			mobile_root.free()

		if include_blockout:
			var blockout := _design_build_blockout_2d(params.get("grid_size", [16, 12]), params.get("spawn_position", [0, 0]), true)
			if not _design_save_scene(blockout, "res://scenes/mcp_design_blockout.tscn"):
				log_error("Failed to save blockout scene")
				return
			blockout.free()

	_design_print_success("design_generate_scene_from_brief", manifest)
	log_info("design_generate_scene_from_brief completed successfully")


func _design_generate_level_blockout(params: Dictionary) -> void:
	log_info("Starting design_generate_level_blockout operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var kind: String = str(params.get("kind", "2d")).to_lower()
	var dry_run := _design_dry_run(params)
	var grid_size = params.get("grid_size", [16, 12])
	var spawn = params.get("spawn_position", [0, 0])
	var include_physics := bool(params.get("include_physics", true))
	var files: Array = [{"path": _to_res_path(output_path), "kind": "scene"}]
	var summary := _design_blockout_blocks_summary(grid_size)
	summary["kind"] = kind
	summary["include_physics"] = include_physics
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": summary,
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		if kind == "3d":
			log_error("3D blockout is not yet supported; using 2D blockout")
		var blockout := _design_build_blockout_2d(grid_size, spawn, include_physics)
		if not _design_save_scene(blockout, _to_res_path(output_path)):
			log_error("Failed to save blockout scene")
			return
		blockout.free()
	_design_print_success("design_generate_level_blockout", manifest)
	log_info("design_generate_level_blockout completed successfully")


func _design_generate_menu_flow(params: Dictionary) -> void:
	log_info("Starting design_generate_menu_flow operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var title: String = str(params.get("title", "Main Menu"))
	var subtitle: String = str(params.get("subtitle", ""))
	var buttons = params.get("buttons", ["Play", "Settings", "Quit"])
	if not (buttons is Array):
		buttons = ["Play", "Settings", "Quit"]
	var include_settings := bool(params.get("include_settings", false))
	var dry_run := _design_dry_run(params)
	var files: Array = [{"path": _to_res_path(output_path), "kind": "scene"}]
	if include_settings:
		files.append({"path": "res://scenes/mcp_design_menu_settings.tscn", "kind": "scene"})
	var root_size := _design_normalize_size(params.get("root_size", [1152, 648]))
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {
			"title": title,
			"button_count": buttons.size(),
			"include_settings": include_settings,
			"transitions": _design_menu_transitions(buttons, include_settings),
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		var menu := _design_build_ui_layout("McpDesignMenu", root_size, [_design_menu_panel_spec(title, subtitle, buttons)])
		if not _design_save_scene(menu, _to_res_path(output_path)):
			log_error("Failed to save menu scene")
			return
		menu.free()
		if include_settings:
			var settings_panel := _design_build_ui_layout("McpDesignMenuSettings", root_size, [_design_menu_panel_spec("Settings", "", ["Audio", "Video", "Controls", "Back"])])
			if not _design_save_scene(settings_panel, "res://scenes/mcp_design_menu_settings.tscn"):
				log_error("Failed to save menu settings scene")
				return
			settings_panel.free()
	_design_print_success("design_generate_menu_flow", manifest)
	log_info("design_generate_menu_flow completed successfully")


func _design_menu_transitions(buttons: Array, include_settings: bool) -> Array:
	var transitions: Array = []
	for label in buttons:
		var text: String = str(label).to_lower()
		if text == "play" or text == "resume":
			transitions.append({"from": "Menu", "button": label, "to": "GameScene"})
		elif text == "settings":
			transitions.append({"from": "Menu", "button": label, "to": "Settings"})
		elif text == "quit":
			transitions.append({"from": "Menu", "button": label, "to": "QuitApp"})
		elif text == "back":
			transitions.append({"from": "Settings", "button": label, "to": "Menu"})
		else:
			transitions.append({"from": "Menu", "button": label, "to": text.capitalize()})
	if not include_settings:
		var had_settings := false
		for transition in transitions:
			if str(transition.get("to", "")) == "Settings":
				had_settings = true
				break
		if not had_settings:
			return transitions
	return transitions


func _design_generate_hud(params: Dictionary) -> void:
	log_info("Starting design_generate_hud operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var root_size := _design_normalize_size(params.get("root_size", [1152, 648]))
	var follows_player := bool(params.get("follows_player", false))
	var dry_run := _design_dry_run(params)
	var script_path := _design_script_path_for(output_path)
	var files: Array = [
		{"path": _to_res_path(output_path), "kind": "scene"},
		{"path": script_path, "kind": "script"},
	]
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {
			"control_count": 4,
			"labels": ["Score", "Health", "Time"],
			"buttons": ["Pause"],
			"follows_player": follows_player,
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		var hud := _design_build_hud_scene(root_size)
		if not _design_save_scene(hud, _to_res_path(output_path)):
			log_error("Failed to save HUD scene")
			return
		hud.free()
		var script_class_name := "McpHudController"
		var body := "extends Node\n\n@export var follow_path: NodePath\n@export var follows_player: bool = " + str(follows_player).to_lower() + "\n\nfunc _ready() -> void:\n    pass\n\nfunc set_score(value: int) -> void:\n    var label := get_node_or_null(\"Hud/ScoreLabel\") as Label\n    if label:\n        label.text = \"Score: %d\" % value\n"
		if not _design_persist_script(script_path, script_class_name, body):
			return
	_design_print_success("design_generate_hud", manifest)
	log_info("design_generate_hud completed successfully")


func _design_generate_dialogue_scene(params: Dictionary) -> void:
	log_info("Starting design_generate_dialogue_scene operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var title: String = str(params.get("title", "Speaker"))
	var subtitle: String = str(params.get("subtitle", "Dialogue text"))
	var dry_run := _design_dry_run(params)
	var script_path := _design_script_path_for(output_path)
	var files: Array = [
		{"path": _to_res_path(output_path), "kind": "scene"},
		{"path": script_path, "kind": "script"},
	]
	var specs := [
		{"type": "PanelContainer", "name": "DialoguePanel", "anchor_preset": "bottom_wide", "offsets": {"left": 48, "top": -200, "right": -48, "bottom": -32}, "children": [
			{"type": "VBoxContainer", "name": "DialogueStack", "anchor_preset": "full_rect", "offsets": {"left": 24, "top": 20, "right": -24, "bottom": -20}, "separation": 8, "children": [
				{"type": "Label", "name": "SpeakerLabel", "text": title, "custom_minimum_size": [240, 32]},
				{"type": "Label", "name": "DialogueLabel", "text": subtitle, "custom_minimum_size": [420, 72]},
				{"type": "Button", "name": "ContinueButton", "text": "Continue", "custom_minimum_size": [160, 48]},
			]},
		]}
	]
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {"speaker": title, "lines": 1, "scene_kind": "dialogue_box"},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		var root := _design_build_ui_layout("McpDesignDialogue", _design_normalize_size(params.get("root_size", [1152, 648])), specs)
		if not _design_save_scene(root, _to_res_path(output_path)):
			log_error("Failed to save dialogue scene")
			return
		root.free()
		var body := "extends Node\n\n@export var speaker: String = \"" + title + "\"\n@export_multiline var text: String = \"" + subtitle + "\"\n\nfunc _ready() -> void:\n    pass\n"
		if not _design_persist_script(script_path, "McpDialogueLine", body):
			return
	_design_print_success("design_generate_dialogue_scene", manifest)
	log_info("design_generate_dialogue_scene completed successfully")


func _design_generate_settings_screen(params: Dictionary) -> void:
	log_info("Starting design_generate_settings_screen operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var title: String = str(params.get("title", "Settings"))
	var options = params.get("options", {"audio": true, "video": true, "controls": true})
	if not (options is Dictionary):
		options = {"audio": true, "video": true, "controls": true}
	var dry_run := _design_dry_run(params)
	var script_path := _design_script_path_for(output_path)
	var files: Array = [
		{"path": _to_res_path(output_path), "kind": "scene"},
		{"path": script_path, "kind": "script"},
	]
	var children: Array = []
	for section in ["audio", "video", "controls"]:
		if bool(options.get(section, true)):
			children.append({"type": "Button", "name": section.capitalize() + "Button", "text": section.capitalize(), "custom_minimum_size": [240, 48]})
	children.append({"type": "Button", "name": "BackButton", "text": "Back", "custom_minimum_size": [240, 48]})
	var stack_children: Array = [
		{"type": "Label", "name": "TitleLabel", "text": title, "horizontal_alignment": 1, "custom_minimum_size": [320, 48]},
	]
	stack_children.append_array(children)
	var specs := [
		{"type": "PanelContainer", "name": "SettingsPanel", "anchor_preset": "center", "offsets": {"left": -200, "top": -200, "right": 200, "bottom": 200}, "children": [
			{"type": "VBoxContainer", "name": "SettingsStack", "anchor_preset": "full_rect", "offsets": {"left": 24, "top": 24, "right": -24, "bottom": -24}, "separation": 12, "children": stack_children}
		]}
	]
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {
			"sections": options.keys(),
			"button_count": children.size(),
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		var root := _design_build_ui_layout("McpDesignSettings", _design_normalize_size(params.get("root_size", [1152, 648])), specs)
		if not _design_save_scene(root, _to_res_path(output_path)):
			log_error("Failed to save settings scene")
			return
		root.free()
		var body := "extends Node\n\n@export var audio_volume: float = 0.0\n@export var music_volume: float = 0.0\n@export var fullscreen: bool = false\n\nfunc _ready() -> void:\n    pass\n"
		if not _design_persist_script(script_path, "McpSettingsController", body):
			return
	_design_print_success("design_generate_settings_screen", manifest)
	log_info("design_generate_settings_screen completed successfully")


func _design_generate_mobile_controls(params: Dictionary) -> void:
	log_info("Starting design_generate_mobile_controls operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var root_size := _design_normalize_size(params.get("root_size", [720, 1280]))
	var dry_run := _design_dry_run(params)
	var script_path := _design_script_path_for(output_path)
	var files: Array = [
		{"path": _to_res_path(output_path), "kind": "scene"},
		{"path": script_path, "kind": "script"},
	]
	var specs := [
		{"type": "TouchScreenButton", "name": "JoystickBase", "anchor_preset": "bottom_left", "offsets": {"left": 40, "top": -240, "right": 240, "bottom": -40}},
		{"type": "Label", "name": "JoystickLabel", "text": "Move", "anchor_preset": "bottom_left", "offsets": {"left": 100, "top": -130, "right": 180, "bottom": -100}},
		{"type": "Button", "name": "ActionButtonA", "text": "A", "anchor_preset": "bottom_right", "offsets": {"left": -200, "top": -160, "right": -100, "bottom": -60}, "custom_minimum_size": [96, 96]},
		{"type": "Button", "name": "ActionButtonB", "text": "B", "anchor_preset": "bottom_right", "offsets": {"left": -100, "top": -260, "right": 0, "bottom": -160}, "custom_minimum_size": [96, 96]},
	]
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {
			"joystick_count": 1,
			"action_buttons": 2,
			"root_size": [root_size.x, root_size.y],
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		var root := _design_build_ui_layout("McpDesignMobileControls", root_size, specs)
		if not _design_save_scene(root, _to_res_path(output_path)):
			log_error("Failed to save mobile controls scene")
			return
		root.free()
		var body := "extends Node\n\n@export var move_strength: float = 1.0\n@export var action_a: String = \"action_a\"\n@export var action_b: String = \"action_b\"\n\nfunc _ready() -> void:\n    pass\n"
		if not _design_persist_script(script_path, "McpMobileControls", body):
			return
	_design_print_success("design_generate_mobile_controls", manifest)
	log_info("design_generate_mobile_controls completed successfully")


func _design_generate_gameplay_prefab(params: Dictionary) -> void:
	log_info("Starting design_generate_gameplay_prefab operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var kind: String = str(params.get("kind", "projectile")).to_lower()
	var speed := float(params.get("speed", 240.0))
	var damage := int(params.get("damage", 0))
	var health := int(params.get("health", 100))
	var script_class_name := str(params.get("class_name", "")).strip_edges()
	var dry_run := _design_dry_run(params)
	var script_path := _design_script_path_for(output_path)
	var files: Array = [
		{"path": _to_res_path(output_path), "kind": "scene"},
		{"path": script_path, "kind": "script"},
	]
	var root: Node
	match kind:
		"player":
			root = _design_prefab_player(speed, health)
		"enemy":
			root = _design_prefab_enemy(speed, health)
		_:
			root = _design_prefab_projectile(speed, damage)
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {
			"kind": kind,
			"speed": speed,
			"damage": damage,
			"health": health,
			"script_class": script_class_name,
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		if not _design_save_scene(root, _to_res_path(output_path)):
			log_error("Failed to save prefab scene")
			return
		root.free()
		var body := "extends Node2D\n\n@export var speed: float = " + str(speed) + "\n@export var damage: int = " + str(damage) + "\n@export var health: int = " + str(health) + "\n\nfunc _ready() -> void:\n    pass\n"
		var class_declaration := "McpPrefab_" + _design_pascal(kind)
		if not script_class_name.is_empty():
			class_declaration = script_class_name
		if not _design_persist_script(script_path, class_declaration, body):
			return
	_design_print_success("design_generate_gameplay_prefab", manifest)
	log_info("design_generate_gameplay_prefab completed successfully")


func _design_prefab_player(speed: float, health: int) -> Node:
	var root := CharacterBody2D.new()
	root.name = "PrefabPlayer"
	var sprite := Sprite2D.new()
	sprite.name = "Sprite"
	root.add_child(sprite)
	var shape := CollisionShape2D.new()
	shape.name = "Collision"
	var rect := RectangleShape2D.new()
	rect.size = Vector2(48, 64)
	shape.shape = rect
	root.add_child(shape)
	return root


func _design_prefab_enemy(speed: float, health: int) -> Node:
	var root := CharacterBody2D.new()
	root.name = "PrefabEnemy"
	var sprite := Sprite2D.new()
	sprite.name = "Sprite"
	root.add_child(sprite)
	var shape := CollisionShape2D.new()
	shape.name = "Collision"
	var rect := RectangleShape2D.new()
	rect.size = Vector2(40, 40)
	shape.shape = rect
	root.add_child(shape)
	return root


func _design_prefab_projectile(speed: float, damage: int) -> Node:
	var root := Area2D.new()
	root.name = "PrefabProjectile"
	var sprite := Sprite2D.new()
	sprite.name = "Sprite"
	root.add_child(sprite)
	var shape := CollisionShape2D.new()
	shape.name = "Collision"
	var circle := CircleShape2D.new()
	circle.radius = 8.0
	shape.shape = circle
	root.add_child(shape)
	return root


func _design_generate_enemy_archetype(params: Dictionary) -> void:
	log_info("Starting design_generate_enemy_archetype operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var archetype: String = str(params.get("archetype", "enemy")).strip_edges()
	if archetype.is_empty():
		log_error("archetype is required")
		return
	var health := int(params.get("health", 30))
	var speed := float(params.get("speed", 80.0))
	var damage := int(params.get("damage", 5))
	var include_ai := bool(params.get("include_ai", true))
	var script_class_name := str(params.get("class_name", "")).strip_edges()
	var dry_run := _design_dry_run(params)
	var script_path := _design_script_path_for(output_path)
	var files: Array = [
		{"path": _to_res_path(output_path), "kind": "scene"},
		{"path": script_path, "kind": "script"},
	]
	var root := _design_archetype_enemy_node(_design_pascal(archetype))
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {
			"archetype": archetype,
			"health": health,
			"speed": speed,
			"damage": damage,
			"include_ai": include_ai,
			"script_class": script_class_name,
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		if not _design_save_scene(root, _to_res_path(output_path)):
			log_error("Failed to save enemy scene")
			return
		root.free()
		var body := "extends CharacterBody2D\n\n@export var max_health: int = " + str(health) + "\n@export var move_speed: float = " + str(speed) + "\n@export var contact_damage: int = " + str(damage) + "\n\nvar health: int = " + str(health) + "\n\nfunc _ready() -> void:\n    pass\n"
		if include_ai:
			body += "\nfunc patrol(targets: Array) -> void:\n    pass\n\nfunc chase(player: Node2D) -> void:\n    pass\n\nfunc idle() -> void:\n    pass\n"
		var class_declaration := "McpEnemy_" + _design_pascal(archetype)
		if not script_class_name.is_empty():
			class_declaration = script_class_name
		if not _design_persist_script(script_path, class_declaration, body):
			return
	_design_print_success("design_generate_enemy_archetype", manifest)
	log_info("design_generate_enemy_archetype completed successfully")


func _design_archetype_enemy_node(name_root: String) -> Node:
	var root := CharacterBody2D.new()
	root.name = name_root
	var sprite := Sprite2D.new()
	sprite.name = "Sprite"
	root.add_child(sprite)
	var shape := CollisionShape2D.new()
	shape.name = "Collision"
	var rect := RectangleShape2D.new()
	rect.size = Vector2(40, 40)
	shape.shape = rect
	root.add_child(shape)
	var marker := Marker2D.new()
	marker.name = "PatrolPoint"
	marker.position = Vector2(0, -48)
	root.add_child(marker)
	return root


func _design_generate_pickup_archetype(params: Dictionary) -> void:
	log_info("Starting design_generate_pickup_archetype operation")
	var output_path := _design_required_output_path(params)
	if output_path.is_empty():
		log_error("output_path is required")
		return
	var archetype: String = str(params.get("archetype", "pickup")).strip_edges()
	if archetype.is_empty():
		log_error("archetype is required")
		return
	var pickup_value := int(params.get("pickup_value", 1))
	var respawn_time := float(params.get("respawn_time", 0.0))
	var include_physics := bool(params.get("include_physics", true))
	var script_class_name := str(params.get("class_name", "")).strip_edges()
	var dry_run := _design_dry_run(params)
	var script_path := _design_script_path_for(output_path)
	var files: Array = [
		{"path": _to_res_path(output_path), "kind": "scene"},
		{"path": script_path, "kind": "script"},
	]
	var root := _design_archetype_pickup_node(_design_pascal(archetype), include_physics)
	var manifest := {
		"created_files": files,
		"validation_commands": _design_validation_commands(files),
		"preview_summary": {
			"archetype": archetype,
			"pickup_value": pickup_value,
			"respawn_time": respawn_time,
			"include_physics": include_physics,
			"script_class": script_class_name,
		},
		"dry_run": bool(params.get("dry_run", false)),
		"recipe_only": bool(params.get("recipe_only", false)),
	}
	if not dry_run:
		if not _design_save_scene(root, _to_res_path(output_path)):
			log_error("Failed to save pickup scene")
			return
		root.free()
		var body := "extends Area2D\n\n@export var pickup_value: int = " + str(pickup_value) + "\n@export var respawn_time: float = " + str(respawn_time) + "\n\nsignal collected(by: Node2D)\n\nfunc _ready() -> void:\n    pass\n\nfunc collect(by: Node2D) -> void:\n    emit_signal(\"collected\", by)\n    if respawn_time > 0.0:\n        set_deferred(\"monitoring\", false)\n        visible = false\n        await get_tree().create_timer(respawn_time).timeout\n        set_deferred(\"monitoring\", true)\n        visible = true\n"
		var class_declaration := "McpPickup_" + _design_pascal(archetype)
		if not script_class_name.is_empty():
			class_declaration = script_class_name
		if not _design_persist_script(script_path, class_declaration, body):
			return
	_design_print_success("design_generate_pickup_archetype", manifest)
	log_info("design_generate_pickup_archetype completed successfully")


func _design_archetype_pickup_node(name_root: String, include_physics: bool) -> Node:
	var root: Node
	if include_physics:
		root = Area2D.new()
	else:
		root = Node2D.new()
	root.name = name_root
	var sprite := Sprite2D.new()
	sprite.name = "Sprite"
	root.add_child(sprite)
	if include_physics:
		var shape := CollisionShape2D.new()
		shape.name = "Collision"
		var circle := CircleShape2D.new()
		circle.radius = 12.0
		shape.shape = circle
		root.add_child(shape)
	return root
