# Phase 6.B focused UI/theme operation module.
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

func _load_scene_for_edit(scene_path: String) -> Dictionary:
    return _legacy.load_scene_for_edit(scene_path)

func _save_scene_root(scene_root: Node, full_scene_path: String) -> bool:
    return _legacy.save_scene_root(scene_root, full_scene_path)

func _ensure_resource_dir(resource_path: String) -> bool:
    return _legacy.ensure_resource_dir(resource_path)

func _save_resource_to_path(resource: Resource, resource_path: String) -> bool:
    return _legacy.save_resource_to_path(resource, resource_path)

func _parse_vector2(value, fallback := Vector2.ZERO) -> Vector2:
    return _legacy.parse_vector2(value, fallback)

func _parse_color(value, fallback := Color.WHITE) -> Color:
    return _legacy.parse_color(value, fallback)

func _has_property(obj: Object, property_name: String) -> bool:
    return _legacy.has_property(obj, property_name)

func _get_edit_parent(scene_root: Node, parent_path: String) -> Node:
    return _legacy.get_edit_parent(scene_root, parent_path)

func _make_unique_child_name(parent: Node, base_name: String) -> String:
    return _legacy.make_unique_child_name(parent, base_name)

# --- Phase 1.5: UI and theme workflow ---

func ui_create_layout(params: Dictionary) -> void:
    log_info("Starting ui_create_layout operation")
    var result = _ui_create_layout_from_params(params, "custom")
    if result.is_empty():
        return
    print(JSON.stringify(result))
    log_info("ui_create_layout completed successfully")


func ui_draw_recipe(params: Dictionary) -> void:
    log_info("Starting ui_draw_recipe operation")
    var recipe: String = params.get("recipe", "")
    if recipe.is_empty():
        log_error("recipe is required")
        return
    var controls = _ui_recipe_controls(params)
    if controls.is_empty():
        log_error("Unsupported or empty UI recipe: " + recipe)
        return
    var layout_params = params.duplicate(true)
    layout_params["controls"] = controls
    if str(layout_params.get("root_name", "")).is_empty():
        layout_params["root_name"] = _ui_pascal_name(recipe)
    var result = _ui_create_layout_from_params(layout_params, recipe)
    if result.is_empty():
        return
    result["recipe"] = recipe
    print(JSON.stringify(result))
    log_info("ui_draw_recipe completed successfully")


func ui_set_control_anchor_preset(params: Dictionary) -> void:
    log_info("Starting ui_set_control_anchor_preset operation")
    var loaded = _ui_load_control_scene(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var control: Control = loaded["control"]
    var preset: String = params.get("preset", "")
    if preset.is_empty():
        log_error("preset is required")
        scene_root.free()
        return
    _ui_apply_anchor_preset(control, preset, bool(params.get("keep_offsets", false)))
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(params.get("scene_path", "")),
        "node_path": params.get("node_path", ""),
        "preset": preset
    }))
    log_info("ui_set_control_anchor_preset completed successfully")


func ui_set_control_offsets(params: Dictionary) -> void:
    log_info("Starting ui_set_control_offsets operation")
    var loaded = _ui_load_control_scene(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var control: Control = loaded["control"]
    _ui_apply_offsets(control, params)
    var offsets = _ui_offsets_dict(control)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(params.get("scene_path", "")),
        "node_path": params.get("node_path", ""),
        "offsets": offsets
    }))
    log_info("ui_set_control_offsets completed successfully")


func ui_set_control_text(params: Dictionary) -> void:
    log_info("Starting ui_set_control_text operation")
    var loaded = _ui_load_control_scene(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var control: Control = loaded["control"]
    if not _has_property(control, "text"):
        log_error("Control does not support a text property: " + params.get("node_path", ""))
        scene_root.free()
        return
    control.set("text", str(params.get("text", "")))
    if _has_property(control, "custom_minimum_size") and control.custom_minimum_size == Vector2.ZERO:
        control.custom_minimum_size = Vector2(160, 44)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(params.get("scene_path", "")),
        "node_path": params.get("node_path", ""),
        "text": str(params.get("text", ""))
    }))
    log_info("ui_set_control_text completed successfully")


func ui_set_control_theme_override(params: Dictionary) -> void:
    log_info("Starting ui_set_control_theme_override operation")
    var loaded = _ui_load_control_scene(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var control: Control = loaded["control"]
    var override_type: String = params.get("override_type", "")
    var item_name: String = params.get("name", "")
    if override_type.is_empty() or item_name.is_empty():
        log_error("override_type and name are required")
        scene_root.free()
        return
    if not _ui_apply_theme_override(control, params):
        scene_root.free()
        return
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(params.get("scene_path", "")),
        "node_path": params.get("node_path", ""),
        "override_type": override_type,
        "name": item_name
    }))
    log_info("ui_set_control_theme_override completed successfully")


func ui_create_theme(params: Dictionary) -> void:
    log_info("Starting ui_create_theme operation")
    var output_path: String = params.get("output_path", "")
    if output_path.is_empty():
        log_error("output_path is required")
        return
    var full_path = _to_res_path(output_path)
    if FileAccess.file_exists(ProjectSettings.globalize_path(full_path)) and not bool(params.get("overwrite", false)):
        log_error("output_path already exists; pass overwrite=true to replace it")
        return
    var theme = Theme.new()
    theme.default_font_size = int(params.get("default_font_size", 16))
    _ui_apply_theme_entries(theme, params)
    if not _save_resource_to_path(theme, output_path):
        return
    print(JSON.stringify({
        "success": true,
        "theme_path": _to_res_path(output_path),
        "resource_type": "Theme",
        "default_font_size": theme.default_font_size
    }))
    log_info("ui_create_theme completed successfully")


func ui_theme_set_color(params: Dictionary) -> void:
    log_info("Starting ui_theme_set_color operation")
    var theme = _ui_load_theme(params.get("theme_path", ""))
    if theme == null:
        return
    var item_name: String = params.get("name", "")
    var theme_type: String = params.get("theme_type", "")
    if item_name.is_empty() or theme_type.is_empty():
        log_error("name and theme_type are required")
        return
    theme.set_color(item_name, theme_type, _parse_color(params.get("color", Color.WHITE)))
    if not _save_resource_to_path(theme, params.get("theme_path", "")):
        return
    print(JSON.stringify({"success": true, "theme_path": _to_res_path(params.get("theme_path", "")), "theme_type": theme_type, "name": item_name, "kind": "color"}))
    log_info("ui_theme_set_color completed successfully")


func ui_theme_set_constant(params: Dictionary) -> void:
    log_info("Starting ui_theme_set_constant operation")
    var theme = _ui_load_theme(params.get("theme_path", ""))
    if theme == null:
        return
    var item_name: String = params.get("name", "")
    var theme_type: String = params.get("theme_type", "")
    if item_name.is_empty() or theme_type.is_empty():
        log_error("name and theme_type are required")
        return
    theme.set_constant(item_name, theme_type, int(params.get("value", 0)))
    if not _save_resource_to_path(theme, params.get("theme_path", "")):
        return
    print(JSON.stringify({"success": true, "theme_path": _to_res_path(params.get("theme_path", "")), "theme_type": theme_type, "name": item_name, "kind": "constant"}))
    log_info("ui_theme_set_constant completed successfully")


func ui_theme_set_font_size(params: Dictionary) -> void:
    log_info("Starting ui_theme_set_font_size operation")
    var theme = _ui_load_theme(params.get("theme_path", ""))
    if theme == null:
        return
    var item_name: String = params.get("name", "")
    var theme_type: String = params.get("theme_type", "")
    if item_name.is_empty() or theme_type.is_empty():
        log_error("name and theme_type are required")
        return
    theme.set_font_size(item_name, theme_type, int(params.get("size", 16)))
    if not _save_resource_to_path(theme, params.get("theme_path", "")):
        return
    print(JSON.stringify({"success": true, "theme_path": _to_res_path(params.get("theme_path", "")), "theme_type": theme_type, "name": item_name, "kind": "font_size"}))
    log_info("ui_theme_set_font_size completed successfully")


func ui_theme_set_stylebox_flat(params: Dictionary) -> void:
    log_info("Starting ui_theme_set_stylebox_flat operation")
    var theme = _ui_load_theme(params.get("theme_path", ""))
    if theme == null:
        return
    var item_name: String = params.get("name", "")
    var theme_type: String = params.get("theme_type", "")
    if item_name.is_empty() or theme_type.is_empty():
        log_error("name and theme_type are required")
        return
    var stylebox = _ui_make_stylebox_flat(params)
    theme.set_stylebox(item_name, theme_type, stylebox)
    if not _save_resource_to_path(theme, params.get("theme_path", "")):
        return
    print(JSON.stringify({"success": true, "theme_path": _to_res_path(params.get("theme_path", "")), "theme_type": theme_type, "name": item_name, "kind": "stylebox"}))
    log_info("ui_theme_set_stylebox_flat completed successfully")


func ui_apply_theme(params: Dictionary) -> void:
    log_info("Starting ui_apply_theme operation")
    var loaded = _ui_load_control_scene(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var control: Control = loaded["control"]
    var theme = _ui_load_theme(params.get("theme_path", ""))
    if theme == null:
        scene_root.free()
        return
    control.theme = theme
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(params.get("scene_path", "")),
        "node_path": params.get("node_path", ""),
        "theme_path": _to_res_path(params.get("theme_path", ""))
    }))
    log_info("ui_apply_theme completed successfully")


func ui_inspect_layout(params: Dictionary) -> void:
    log_info("Starting ui_inspect_layout operation")
    var data = _ui_inspect_layout_data(params)
    if data.is_empty():
        return
    data["success"] = true
    print(JSON.stringify(data))
    log_info("ui_inspect_layout completed successfully")


func ui_validate_safe_area(params: Dictionary) -> void:
    log_info("Starting ui_validate_safe_area operation")
    var data = _ui_inspect_layout_data(params)
    if data.is_empty():
        return
    var viewport_size = _parse_vector2(params.get("viewport_size", [1152, 648]), Vector2(1152, 648))
    var safe_margin = float(params.get("safe_margin", 16.0))
    var min_touch_size = _parse_vector2(params.get("min_touch_size", [44, 44]), Vector2(44, 44))
    var issues = []
    for control in data.get("controls", []):
        _ui_validate_control_summary(control, viewport_size, safe_margin, min_touch_size, issues)
    print(JSON.stringify({
        "success": true,
        "scene_path": data.get("scene_path", ""),
        "viewport_size": data.get("viewport_size", []),
        "valid": issues.is_empty(),
        "issue_count": issues.size(),
        "issues": issues
    }))
    log_info("ui_validate_safe_area completed successfully")


func _ui_create_layout_from_params(params: Dictionary, source_recipe: String) -> Dictionary:
    var output_path: String = params.get("output_path", "")
    if output_path.is_empty():
        log_error("output_path is required")
        return {}
    var full_scene_path = _to_res_path(output_path)
    if FileAccess.file_exists(ProjectSettings.globalize_path(full_scene_path)) and not bool(params.get("overwrite", false)):
        log_error("output_path already exists; pass overwrite=true to replace it")
        return {}

    var viewport_size = _parse_vector2(params.get("root_size", [1152, 648]), Vector2(1152, 648))
    var root = Control.new()
    root.name = str(params.get("root_name", "UI"))
    root.custom_minimum_size = viewport_size
    root.size = viewport_size
    _ui_apply_anchor_preset(root, "full_rect", false)

    var theme_path: String = params.get("theme_path", "")
    if not theme_path.is_empty():
        var theme = ResourceLoader.load(_to_res_path(theme_path)) as Theme
        if theme == null:
            log_error("Failed to load theme: " + theme_path)
            root.free()
            return {}
        root.theme = theme

    var controls = params.get("controls", [])
    if controls is Array:
        for spec in controls:
            if spec is Dictionary:
                if _ui_add_control_from_spec(root, root, spec, viewport_size) == null:
                    root.free()
                    return {}

    if not _ensure_resource_dir(full_scene_path):
        root.free()
        return {}
    var control_count = _ui_count_controls(root)
    if not _save_scene_root(root, full_scene_path):
        root.free()
        return {}
    root.free()
    return {
        "success": true,
        "scene_path": _to_res_path(output_path),
        "root_name": str(params.get("root_name", "UI")),
        "source": source_recipe,
        "control_count": control_count
    }


func _ui_recipe_controls(params: Dictionary) -> Array:
    var recipe: String = str(params.get("recipe", "")).to_lower()
    var title: String = str(params.get("title", ""))
    var subtitle: String = str(params.get("subtitle", ""))
    var buttons = params.get("buttons", [])
    if not (buttons is Array):
        buttons = []
    match recipe:
        "main_menu":
            if title.is_empty():
                title = "Main Menu"
            if buttons.is_empty():
                buttons = ["Play", "Settings", "Quit"]
            return [_ui_menu_panel_spec("MenuPanel", title, subtitle, buttons)]
        "pause_menu":
            if title.is_empty():
                title = "Paused"
            if buttons.is_empty():
                buttons = ["Resume", "Settings", "Quit"]
            return [_ui_menu_panel_spec("PausePanel", title, subtitle, buttons)]
        "settings_screen":
            if title.is_empty():
                title = "Settings"
            if buttons.is_empty():
                buttons = ["Audio", "Video", "Controls", "Back"]
            return [_ui_menu_panel_spec("SettingsPanel", title, subtitle, buttons)]
        "hud":
            return [
                {"type": "Label", "name": "ScoreLabel", "text": "Score: 0", "anchor_preset": "top_left", "offsets": {"left": 24, "top": 18, "right": 224, "bottom": 54}},
                {"type": "Label", "name": "HealthLabel", "text": "Health: 100", "anchor_preset": "top_right", "offsets": {"left": -224, "top": 18, "right": -24, "bottom": 54}}
            ]
        "dialogue_box":
            if title.is_empty():
                title = "Speaker"
            if subtitle.is_empty():
                subtitle = "Dialogue text"
            return [
                {"type": "PanelContainer", "name": "DialoguePanel", "anchor_preset": "bottom_wide", "offsets": {"left": 48, "top": -188, "right": -48, "bottom": -32}, "children": [
                    {"type": "VBoxContainer", "name": "DialogueStack", "anchor_preset": "full_rect", "offsets": {"left": 24, "top": 20, "right": -24, "bottom": -20}, "children": [
                        {"type": "Label", "name": "SpeakerLabel", "text": title, "custom_minimum_size": [240, 32]},
                        {"type": "Label", "name": "DialogueLabel", "text": subtitle, "custom_minimum_size": [420, 72]},
                        {"type": "Button", "name": "ContinueButton", "text": "Continue", "custom_minimum_size": [160, 48]}
                    ]}
                ]}
            ]
        "inventory_grid":
            var slots = int(params.get("options", {}).get("slots", 16))
            var children = []
            for index in range(slots):
                children.append({"type": "Button", "name": "Slot" + str(index + 1), "text": str(index + 1), "custom_minimum_size": [64, 64]})
            return [
                {"type": "GridContainer", "name": "InventoryGrid", "anchor_preset": "center", "offsets": {"left": -180, "top": -180, "right": 180, "bottom": 180}, "columns": 4, "children": children}
            ]
        "virtual_joystick":
            return [
                {"type": "TouchScreenButton", "name": "JoystickBase", "anchor_preset": "bottom_left", "offsets": {"left": 40, "top": -160, "right": 160, "bottom": -40}},
                {"type": "Label", "name": "JoystickLabel", "text": "Move", "anchor_preset": "bottom_left", "offsets": {"left": 58, "top": -88, "right": 142, "bottom": -52}}
            ]
        "mobile_action_buttons":
            return [
                {"type": "Button", "name": "ActionButtonA", "text": "A", "anchor_preset": "bottom_right", "offsets": {"left": -168, "top": -120, "right": -88, "bottom": -40}, "custom_minimum_size": [72, 72]},
                {"type": "Button", "name": "ActionButtonB", "text": "B", "anchor_preset": "bottom_right", "offsets": {"left": -84, "top": -204, "right": -4, "bottom": -124}, "custom_minimum_size": [72, 72]}
            ]
        _:
            return []


func _ui_menu_panel_spec(panel_name: String, title: String, subtitle: String, buttons: Array) -> Dictionary:
    var stack_children = [
        {"type": "Label", "name": "TitleLabel", "text": title, "custom_minimum_size": [320, 48]}
    ]
    if not subtitle.is_empty():
        stack_children.append({"type": "Label", "name": "SubtitleLabel", "text": subtitle, "custom_minimum_size": [320, 32]})
    for button_label in buttons:
        var button_text = str(button_label)
        stack_children.append({
            "type": "Button",
            "name": _ui_pascal_name(button_text) + "Button",
            "text": button_text,
            "custom_minimum_size": [260, 52]
        })
    return {
        "type": "PanelContainer",
        "name": panel_name,
        "anchor_preset": "center",
        "offsets": {"left": -240, "top": -196, "right": 240, "bottom": 196},
        "children": [
            {
                "type": "VBoxContainer",
                "name": "MenuStack",
                "anchor_preset": "full_rect",
                "offsets": {"left": 36, "top": 32, "right": -36, "bottom": -32},
                "children": stack_children
            }
        ]
    }


func _ui_add_control_from_spec(scene_root: Node, default_parent: Node, spec: Dictionary, viewport_size: Vector2) -> Control:
    var parent = default_parent
    var parent_path: String = spec.get("parent", "")
    if not parent_path.is_empty():
        var found_parent = _get_edit_parent(scene_root, parent_path)
        if found_parent == null:
            log_error("Parent node not found for UI control: " + parent_path)
            return null
        parent = found_parent
    var node_type: String = spec.get("type", "Control")
    if not ClassDB.class_exists(node_type) or not ClassDB.can_instantiate(node_type):
        log_error("Unsupported Control type: " + node_type)
        return null
    var node_obj = ClassDB.instantiate(node_type)
    if not (node_obj is Control):
        log_error("Node type is not a Control: " + node_type)
        return null
    var control: Control = node_obj
    var base_name: String = spec.get("name", node_type)
    control.name = _make_unique_child_name(parent, base_name)
    parent.add_child(control)
    control.owner = scene_root

    if spec.has("custom_minimum_size"):
        control.custom_minimum_size = _parse_vector2(spec.get("custom_minimum_size"), Vector2.ZERO)
    elif control is Button:
        control.custom_minimum_size = Vector2(160, 44)

    if _has_property(control, "text") and spec.has("text"):
        control.set("text", str(spec.get("text", "")))
    if _has_property(control, "columns") and spec.has("columns"):
        control.set("columns", int(spec.get("columns", 1)))

    _ui_apply_anchor_preset(control, spec.get("anchor_preset", "top_left"), false)
    if spec.has("offsets") or spec.has("left") or spec.has("position") or spec.has("size"):
        _ui_apply_offsets(control, spec)
    elif spec.has("custom_minimum_size") and not (parent is Container):
        var min_size = _parse_vector2(spec.get("custom_minimum_size"), Vector2.ZERO)
        control.offset_right = control.offset_left + min_size.x
        control.offset_bottom = control.offset_top + min_size.y

    if spec.has("theme_overrides") and spec.get("theme_overrides") is Array:
        for override_spec in spec.get("theme_overrides"):
            if override_spec is Dictionary:
                _ui_apply_theme_override(control, override_spec)

    if spec.has("children") and spec.get("children") is Array:
        for child_spec in spec.get("children"):
            if child_spec is Dictionary:
                if _ui_add_control_from_spec(scene_root, control, child_spec, viewport_size) == null:
                    return null
    return control


func _ui_load_control_scene(params: Dictionary) -> Dictionary:
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
        log_error("Control node not found: " + node_path)
        scene_root.free()
        return {}
    if not (target is Control):
        log_error("Node is not a Control: " + node_path)
        scene_root.free()
        return {}
    loaded["control"] = target as Control
    return loaded


func _ui_apply_anchor_preset(control: Control, preset: String, keep_offsets: bool) -> void:
    var old_offsets = _ui_offsets_dict(control)
    var current_size = control.size
    if current_size == Vector2.ZERO:
        current_size = control.custom_minimum_size
    var normalized = preset.to_lower()
    match normalized:
        "full_rect", "fill", "full":
            control.anchor_left = 0.0
            control.anchor_top = 0.0
            control.anchor_right = 1.0
            control.anchor_bottom = 1.0
            if not keep_offsets:
                control.offset_left = 0.0
                control.offset_top = 0.0
                control.offset_right = 0.0
                control.offset_bottom = 0.0
        "center":
            _ui_set_anchor_point(control, 0.5, 0.5)
            if not keep_offsets:
                _ui_set_center_offsets(control, current_size, Vector2.ZERO)
        "top_left":
            _ui_set_anchor_point(control, 0.0, 0.0)
        "top_center":
            _ui_set_anchor_point(control, 0.5, 0.0)
        "top_right":
            _ui_set_anchor_point(control, 1.0, 0.0)
        "center_left":
            _ui_set_anchor_point(control, 0.0, 0.5)
        "center_right":
            _ui_set_anchor_point(control, 1.0, 0.5)
        "bottom_left":
            _ui_set_anchor_point(control, 0.0, 1.0)
        "bottom_center":
            _ui_set_anchor_point(control, 0.5, 1.0)
        "bottom_right":
            _ui_set_anchor_point(control, 1.0, 1.0)
        "top_wide":
            control.anchor_left = 0.0
            control.anchor_top = 0.0
            control.anchor_right = 1.0
            control.anchor_bottom = 0.0
        "bottom_wide":
            control.anchor_left = 0.0
            control.anchor_top = 1.0
            control.anchor_right = 1.0
            control.anchor_bottom = 1.0
        _:
            log_info("Unknown anchor preset '" + preset + "', using top_left")
            _ui_set_anchor_point(control, 0.0, 0.0)
    if keep_offsets:
        control.offset_left = old_offsets["left"]
        control.offset_top = old_offsets["top"]
        control.offset_right = old_offsets["right"]
        control.offset_bottom = old_offsets["bottom"]


func _ui_set_anchor_point(control: Control, x: float, y: float) -> void:
    control.anchor_left = x
    control.anchor_right = x
    control.anchor_top = y
    control.anchor_bottom = y


func _ui_set_center_offsets(control: Control, current_size: Vector2, center_offset: Vector2) -> void:
    var width = current_size.x if current_size.x > 0 else 200.0
    var height = current_size.y if current_size.y > 0 else 80.0
    control.offset_left = center_offset.x - width / 2.0
    control.offset_right = center_offset.x + width / 2.0
    control.offset_top = center_offset.y - height / 2.0
    control.offset_bottom = center_offset.y + height / 2.0


func _ui_apply_offsets(control: Control, params: Dictionary) -> void:
    var offsets = params.get("offsets", {})
    if offsets is Dictionary:
        if offsets.has("left"):
            control.offset_left = float(offsets["left"])
        if offsets.has("top"):
            control.offset_top = float(offsets["top"])
        if offsets.has("right"):
            control.offset_right = float(offsets["right"])
        if offsets.has("bottom"):
            control.offset_bottom = float(offsets["bottom"])
    elif offsets is Array and offsets.size() >= 4:
        control.offset_left = float(offsets[0])
        control.offset_top = float(offsets[1])
        control.offset_right = float(offsets[2])
        control.offset_bottom = float(offsets[3])

    if params.has("left"):
        control.offset_left = float(params.get("left"))
    if params.has("top"):
        control.offset_top = float(params.get("top"))
    if params.has("right"):
        control.offset_right = float(params.get("right"))
    if params.has("bottom"):
        control.offset_bottom = float(params.get("bottom"))

    if params.has("position") or params.has("size"):
        var position = _parse_vector2(params.get("position", [control.offset_left, control.offset_top]), Vector2(control.offset_left, control.offset_top))
        var size = _parse_vector2(params.get("size", [control.offset_right - control.offset_left, control.offset_bottom - control.offset_top]), Vector2(control.offset_right - control.offset_left, control.offset_bottom - control.offset_top))
        control.offset_left = position.x
        control.offset_top = position.y
        control.offset_right = position.x + size.x
        control.offset_bottom = position.y + size.y


func _ui_offsets_dict(control: Control) -> Dictionary:
    return {
        "left": control.offset_left,
        "top": control.offset_top,
        "right": control.offset_right,
        "bottom": control.offset_bottom
    }


func _ui_apply_theme_override(control: Control, params: Dictionary) -> bool:
    var override_type: String = str(params.get("override_type", params.get("type", ""))).to_lower()
    var item_name: String = params.get("name", "")
    if item_name.is_empty():
        log_error("Theme override name is required")
        return false
    match override_type:
        "color":
            control.add_theme_color_override(item_name, _parse_color(params.get("value", params.get("color", Color.WHITE))))
        "constant":
            control.add_theme_constant_override(item_name, int(params.get("value", 0)))
        "font_size":
            control.add_theme_font_size_override(item_name, int(params.get("value", params.get("size", 16))))
        "stylebox_flat":
            control.add_theme_stylebox_override(item_name, _ui_make_stylebox_flat(params))
        _:
            log_error("Unsupported theme override type: " + override_type)
            return false
    return true


func _ui_load_theme(theme_path: String) -> Theme:
    if theme_path.is_empty():
        log_error("theme_path is required")
        return null
    var theme = ResourceLoader.load(_to_res_path(theme_path)) as Theme
    if theme == null:
        log_error("Failed to load Theme: " + theme_path)
    return theme


func _ui_apply_theme_entries(theme: Theme, params: Dictionary) -> void:
    for item in params.get("colors", []):
        if item is Dictionary:
            theme.set_color(item.get("name", "font_color"), item.get("theme_type", item.get("type", "Button")), _parse_color(item.get("color", Color.WHITE)))
    for item in params.get("constants", []):
        if item is Dictionary:
            theme.set_constant(item.get("name", "h_separation"), item.get("theme_type", item.get("type", "Button")), int(item.get("value", 0)))
    for item in params.get("font_sizes", []):
        if item is Dictionary:
            theme.set_font_size(item.get("name", "font_size"), item.get("theme_type", item.get("type", "Label")), int(item.get("size", item.get("value", theme.default_font_size))))
    for item in params.get("styleboxes", []):
        if item is Dictionary:
            theme.set_stylebox(item.get("name", "normal"), item.get("theme_type", item.get("type", "Button")), _ui_make_stylebox_flat(item))


func _ui_make_stylebox_flat(params: Dictionary) -> StyleBoxFlat:
    var box = StyleBoxFlat.new()
    box.bg_color = _parse_color(params.get("bg_color", params.get("value", Color(0.12, 0.14, 0.17, 1.0))), Color(0.12, 0.14, 0.17, 1.0))
    box.border_color = _parse_color(params.get("border_color", Color(0.45, 0.75, 1.0, 1.0)), Color(0.45, 0.75, 1.0, 1.0))
    _ui_set_stylebox_border(box, params.get("border_width", 0))
    _ui_set_stylebox_corners(box, params.get("corner_radius", 0))
    _ui_set_stylebox_content_margin(box, params.get("content_margin", 0))
    return box


func _ui_set_stylebox_border(box: StyleBoxFlat, value) -> void:
    box.set_border_width(SIDE_LEFT, _ui_side_int(value, "left", 0))
    box.set_border_width(SIDE_TOP, _ui_side_int(value, "top", 0))
    box.set_border_width(SIDE_RIGHT, _ui_side_int(value, "right", 0))
    box.set_border_width(SIDE_BOTTOM, _ui_side_int(value, "bottom", 0))


func _ui_set_stylebox_corners(box: StyleBoxFlat, value) -> void:
    box.set_corner_radius(CORNER_TOP_LEFT, _ui_side_int(value, "top_left", 0))
    box.set_corner_radius(CORNER_TOP_RIGHT, _ui_side_int(value, "top_right", 0))
    box.set_corner_radius(CORNER_BOTTOM_RIGHT, _ui_side_int(value, "bottom_right", 0))
    box.set_corner_radius(CORNER_BOTTOM_LEFT, _ui_side_int(value, "bottom_left", 0))


func _ui_set_stylebox_content_margin(box: StyleBoxFlat, value) -> void:
    box.set_content_margin(SIDE_LEFT, float(_ui_side_int(value, "left", 0)))
    box.set_content_margin(SIDE_TOP, float(_ui_side_int(value, "top", 0)))
    box.set_content_margin(SIDE_RIGHT, float(_ui_side_int(value, "right", 0)))
    box.set_content_margin(SIDE_BOTTOM, float(_ui_side_int(value, "bottom", 0)))


func _ui_side_int(value, side: String, fallback: int) -> int:
    if value is Dictionary:
        if value.has(side):
            return int(value[side])
        if side == "top_left" or side == "top_right" or side == "bottom_right" or side == "bottom_left":
            if value.has("all"):
                return int(value["all"])
        if value.has("horizontal") and (side == "left" or side == "right"):
            return int(value["horizontal"])
        if value.has("vertical") and (side == "top" or side == "bottom"):
            return int(value["vertical"])
        return fallback
    if value is Array:
        if value.size() >= 4:
            match side:
                "left", "top_left":
                    return int(value[0])
                "top", "top_right":
                    return int(value[1])
                "right", "bottom_right":
                    return int(value[2])
                "bottom", "bottom_left":
                    return int(value[3])
        if value.size() >= 1:
            return int(value[0])
    if value == null:
        return fallback
    return int(value)


func _ui_inspect_layout_data(params: Dictionary) -> Dictionary:
    var scene_path: String = params.get("scene_path", "")
    if scene_path.is_empty():
        log_error("scene_path is required")
        return {}
    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return {}
    var scene_root: Node = loaded["scene_root"]
    var viewport_size = _parse_vector2(params.get("viewport_size", [1152, 648]), Vector2(1152, 648))
    var controls = []
    _ui_collect_controls(scene_root, scene_root, Rect2(Vector2.ZERO, viewport_size), controls)
    scene_root.free()
    return {
        "scene_path": _to_res_path(scene_path),
        "viewport_size": [viewport_size.x, viewport_size.y],
        "control_count": controls.size(),
        "controls": controls
    }


func _ui_collect_controls(scene_root: Node, node: Node, parent_rect: Rect2, controls: Array) -> void:
    var next_parent_rect = parent_rect
    if node is Control:
        var control: Control = node
        var rect = _ui_control_rect(control, parent_rect)
        next_parent_rect = rect
        var path = "." if node == scene_root else str(scene_root.get_path_to(node))
        var text_value = ""
        if _has_property(control, "text"):
            text_value = str(control.get("text"))
        controls.append({
            "path": path,
            "name": control.name,
            "type": control.get_class(),
            "text": text_value,
            "visible": control.visible,
            "child_count": control.get_child_count(),
            "anchors": {
                "left": control.anchor_left,
                "top": control.anchor_top,
                "right": control.anchor_right,
                "bottom": control.anchor_bottom
            },
            "offsets": _ui_offsets_dict(control),
            "rect": {
                "x": rect.position.x,
                "y": rect.position.y,
                "width": rect.size.x,
                "height": rect.size.y
            }
        })
    for child in node.get_children():
        if child is Node:
            _ui_collect_controls(scene_root, child, next_parent_rect, controls)


func _ui_control_rect(control: Control, parent_rect: Rect2) -> Rect2:
    var left = parent_rect.position.x + parent_rect.size.x * control.anchor_left + control.offset_left
    var top = parent_rect.position.y + parent_rect.size.y * control.anchor_top + control.offset_top
    var right = parent_rect.position.x + parent_rect.size.x * control.anchor_right + control.offset_right
    var bottom = parent_rect.position.y + parent_rect.size.y * control.anchor_bottom + control.offset_bottom
    var width = right - left
    var height = bottom - top
    if width <= 0 and control.custom_minimum_size.x > 0:
        width = control.custom_minimum_size.x
    if height <= 0 and control.custom_minimum_size.y > 0:
        height = control.custom_minimum_size.y
    return Rect2(Vector2(left, top), Vector2(width, height))


func _ui_validate_control_summary(control: Dictionary, viewport_size: Vector2, safe_margin: float, min_touch_size: Vector2, issues: Array) -> void:
    var path = control.get("path", "")
    var control_type = control.get("type", "")
    var rect = control.get("rect", {})
    var anchors = control.get("anchors", {})
    var x = float(rect.get("x", 0.0))
    var y = float(rect.get("y", 0.0))
    var width = float(rect.get("width", 0.0))
    var height = float(rect.get("height", 0.0))
    if bool(control.get("visible", true)) and path != ".":
        if x < -safe_margin or y < -safe_margin or x + width > viewport_size.x + safe_margin or y + height > viewport_size.y + safe_margin:
            issues.append(_ui_issue("offscreen_control", path, control_type, "Control bounds extend outside the viewport plus safe margin", rect))
    if _ui_is_text_control_type(control_type) and str(control.get("text", "")).strip_edges().is_empty():
        issues.append(_ui_issue("missing_text", path, control_type, "Visible text control has empty text", rect))
    if _ui_is_interactive_control_type(control_type) and (width < min_touch_size.x or height < min_touch_size.y):
        issues.append(_ui_issue("small_touch_target", path, control_type, "Interactive control is smaller than the requested minimum touch size", rect))
    if control_type.ends_with("Container") and int(control.get("child_count", 0)) == 0:
        issues.append(_ui_issue("empty_container", path, control_type, "Container has no child controls", rect))
    if float(anchors.get("right", 0.0)) < float(anchors.get("left", 0.0)) or float(anchors.get("bottom", 0.0)) < float(anchors.get("top", 0.0)):
        issues.append(_ui_issue("invalid_anchors", path, control_type, "Control anchor right/bottom is less than left/top", rect))
    if path == "." and (width < viewport_size.x * 0.9 or height < viewport_size.y * 0.9):
        issues.append(_ui_issue("root_not_full_rect", path, control_type, "Root Control does not cover most of the viewport", rect))


func _ui_issue(kind: String, path: String, control_type: String, message: String, rect: Dictionary) -> Dictionary:
    return {
        "kind": kind,
        "path": path,
        "type": control_type,
        "message": message,
        "rect": rect
    }


func _ui_is_text_control_type(control_type: String) -> bool:
    return control_type in ["Button", "Label", "CheckBox", "CheckButton", "LineEdit", "TextEdit", "RichTextLabel", "OptionButton"]


func _ui_is_interactive_control_type(control_type: String) -> bool:
    return control_type in ["Button", "CheckBox", "CheckButton", "LineEdit", "TextEdit", "OptionButton", "TouchScreenButton"]


func _ui_count_controls(node: Node) -> int:
    var count = 1 if node is Control else 0
    for child in node.get_children():
        if child is Node:
            count += _ui_count_controls(child)
    return count


func _ui_pascal_name(value: String) -> String:
    var cleaned = ""
    var capitalize_next = true
    for index in range(value.length()):
        var ch = value[index]
        if ch == "_" or ch == "-" or ch == " ":
            capitalize_next = true
            continue
        if capitalize_next:
            cleaned += ch.to_upper()
            capitalize_next = false
        else:
            cleaned += ch
    return cleaned if not cleaned.is_empty() else "UI"

