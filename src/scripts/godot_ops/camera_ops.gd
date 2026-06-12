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

func _parse_vector2(value, fallback := Vector2.ZERO) -> Vector2:
    return _legacy.parse_vector2(value, fallback)

func _parse_vector3(value, fallback := Vector3.ZERO) -> Vector3:
    return _legacy.call("_parse_vector3", value, fallback)

func _has_property(obj: Object, property_name: String) -> bool:
    return _legacy.has_property(obj, property_name)

func _set_if_property(obj: Object, property_name: String, value) -> bool:
    return _legacy.call("_set_if_property", obj, property_name, value)

func _get_edit_parent(scene_root: Node, parent_path: String) -> Node:
    return _legacy.get_edit_parent(scene_root, parent_path)

func _make_unique_child_name(parent: Node, base_name: String) -> String:
    return _legacy.make_unique_child_name(parent, base_name)

func _write_text_file(res_path: String, text: String) -> bool:
    return _legacy.call("_write_text_file", res_path, text)

func _camera_make_current(camera: Node) -> void:
    if camera is Camera2D:
        var camera_2d: Camera2D = camera
        camera_2d.enabled = true
        if camera_2d.is_inside_tree():
            camera_2d.make_current()
        return
    if camera is Camera3D:
        var camera_3d: Camera3D = camera
        if camera_3d.is_inside_tree():
            camera_3d.make_current()
        elif _has_property(camera_3d, "current"):
            camera_3d.current = true

func camera_create(params: Dictionary) -> void:
    log_info("Starting camera_create operation")
    var scene_path: String = params.get("scene_path", "")
    if scene_path.is_empty():
        log_error("scene_path is required")
        return
    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var parent_path: String = params.get("parent_path", ".")
    var parent = _get_edit_parent(scene_root, parent_path)
    if parent == null:
        log_error("Parent node not found: " + parent_path)
        scene_root.free()
        return

    var camera_type: String = _camera_normalize_type(params.get("camera_type", "2d"))
    var camera: Node = Camera3D.new() if camera_type == "3d" else Camera2D.new()
    camera.name = _make_unique_child_name(parent, params.get("camera_name", "Camera3D" if camera_type == "3d" else "Camera2D"))
    parent.add_child(camera)
    camera.owner = scene_root
    _camera_apply_config(camera, params)

    var camera_path = _camera_path(scene_root, camera)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    var summary = _camera_summary(scene_root, camera, Vector2.ZERO, false)
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(scene_path)
    summary["parent_path"] = parent_path
    summary["camera_path"] = camera_path
    print(JSON.stringify(summary))
    log_info("camera_create completed successfully")

func camera_configure(params: Dictionary) -> void:
    log_info("Starting camera_configure operation")
    var loaded = _camera_load_scene_with_camera(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var camera: Node = loaded["camera"]
    _camera_apply_config(camera, params)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    var summary = _camera_summary(scene_root, camera, Vector2.ZERO, false)
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    print(JSON.stringify(summary))
    log_info("camera_configure completed successfully")

func camera_setup_follow_2d(params: Dictionary) -> void:
    log_info("Starting camera_setup_follow_2d operation")
    var loaded = _camera_load_scene_with_camera(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var camera = loaded["camera"]
    if not (camera is Camera2D):
        log_error("camera_path must point to a Camera2D")
        scene_root.free()
        return
    var target_path: String = params.get("target_path", "")
    if target_path.is_empty():
        log_error("target_path is required")
        scene_root.free()
        return
    var target = _get_edit_parent(scene_root, target_path)
    if target == null or not (target is Node2D):
        log_error("target_path must point to a Node2D: " + target_path)
        scene_root.free()
        return

    var script_path = "scripts/mcp_camera_follow_2d.gd"
    var full_script_path = _to_res_path(script_path)
    var overwrite_script = bool(params.get("overwrite_script", false))
    if overwrite_script or not FileAccess.file_exists(ProjectSettings.globalize_path(full_script_path)):
        if not _write_text_file(script_path, _camera_follow_script_source()):
            scene_root.free()
            return

    var current_script = camera.get_script()
    if current_script != null and current_script.resource_path != full_script_path and not overwrite_script:
        log_error("Camera already has a different script; pass overwrite_script=true to replace it")
        scene_root.free()
        return

    var follow_script = ResourceLoader.load(full_script_path) as Script
    if follow_script == null:
        log_error("Failed to load follow script: " + full_script_path)
        scene_root.free()
        return
    camera.set_script(follow_script)
    var relative_target_path = camera.get_path_to(target)
    camera.set("target_path", relative_target_path)
    camera.set("follow_enabled", true)
    camera.set("follow_offset", _parse_vector2(params.get("follow_offset", [0, 0]), Vector2.ZERO))
    camera.set("update_mode", str(params.get("update_mode", "idle")))
    if bool(params.get("make_current", true)):
        _camera_make_current(camera)
    _set_if_property(camera, "enabled", true)

    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    var summary = _camera_summary(scene_root, camera, Vector2.ZERO, false)
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    summary["target_path"] = target_path
    summary["follow_target_path"] = str(relative_target_path)
    summary["follow_script"] = full_script_path
    print(JSON.stringify(summary))
    log_info("camera_setup_follow_2d completed successfully")

func camera_set_limits_2d(params: Dictionary) -> void:
    log_info("Starting camera_set_limits_2d operation")
    var loaded = _camera_load_scene_with_camera(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var camera = loaded["camera"]
    if not (camera is Camera2D):
        log_error("camera_path must point to a Camera2D")
        scene_root.free()
        return
    _camera_apply_2d_limits(camera, params)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    var summary = _camera_summary(scene_root, camera, Vector2.ZERO, false)
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    print(JSON.stringify(summary))
    log_info("camera_set_limits_2d completed successfully")

func camera_set_smoothing_2d(params: Dictionary) -> void:
    log_info("Starting camera_set_smoothing_2d operation")
    var loaded = _camera_load_scene_with_camera(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var camera = loaded["camera"]
    if not (camera is Camera2D):
        log_error("camera_path must point to a Camera2D")
        scene_root.free()
        return
    _camera_apply_2d_smoothing(camera, params)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    var summary = _camera_summary(scene_root, camera, Vector2.ZERO, false)
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    print(JSON.stringify(summary))
    log_info("camera_set_smoothing_2d completed successfully")

func camera_apply_preset(params: Dictionary) -> void:
    log_info("Starting camera_apply_preset operation")
    var loaded = _camera_load_scene_with_camera(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var camera: Node = loaded["camera"]
    var preset: String = str(params.get("preset", "")).to_lower()
    if preset.is_empty():
        log_error("preset is required")
        scene_root.free()
        return
    var viewport_size = _parse_vector2(params.get("viewport_size", [1152, 648]), Vector2(1152, 648))
    if not _camera_apply_preset(camera, preset, viewport_size, params.get("options", {})):
        scene_root.free()
        return
    if bool(params.get("make_current", true)):
        _camera_make_current(camera)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    var summary = _camera_summary(scene_root, camera, viewport_size, true)
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    summary["preset"] = preset
    print(JSON.stringify(summary))
    log_info("camera_apply_preset completed successfully")

func camera_list(params: Dictionary) -> void:
    log_info("Starting camera_list operation")
    var scene_path: String = params.get("scene_path", "")
    if scene_path.is_empty():
        log_error("scene_path is required")
        return
    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var viewport_size = _parse_vector2(params.get("viewport_size", [1152, 648]), Vector2(1152, 648))
    var cameras = []
    _camera_collect(scene_root, scene_root, cameras, viewport_size, bool(params.get("include_bounds", false)))
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(scene_path),
        "count": cameras.size(),
        "cameras": cameras
    }))
    log_info("camera_list completed successfully")

func camera_preview_bounds(params: Dictionary) -> void:
    log_info("Starting camera_preview_bounds operation")
    var loaded = _camera_load_scene_with_camera(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var camera: Node = loaded["camera"]
    var viewport_size = _parse_vector2(params.get("viewport_size", [1152, 648]), Vector2(1152, 648))
    var summary = _camera_summary(scene_root, camera, viewport_size, true)
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    print(JSON.stringify(summary))
    log_info("camera_preview_bounds completed successfully")

func _camera_load_scene_with_camera(params: Dictionary) -> Dictionary:
    var scene_path: String = params.get("scene_path", "")
    var camera_path: String = params.get("camera_path", "")
    if scene_path.is_empty() or camera_path.is_empty():
        log_error("scene_path and camera_path are required")
        return {}
    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return {}
    var scene_root: Node = loaded["scene_root"]
    var camera = _get_edit_parent(scene_root, camera_path)
    if camera == null:
        log_error("Camera node not found: " + camera_path)
        scene_root.free()
        return {}
    if not (camera is Camera2D) and not (camera is Camera3D):
        log_error("Node is not a Camera2D or Camera3D: " + camera_path)
        scene_root.free()
        return {}
    loaded["camera"] = camera
    return loaded

func _camera_apply_config(camera: Node, params: Dictionary) -> void:
    if params.has("enabled"):
        _set_if_property(camera, "enabled", bool(params.get("enabled")))
    if params.has("position"):
        if camera is Node3D:
            camera.position = _parse_vector3(params.get("position"), Vector3.ZERO)
        elif camera is Node2D:
            camera.position = _parse_vector2(params.get("position"), Vector2.ZERO)
    if params.has("rotation"):
        if camera is Node3D:
            camera.rotation = _parse_vector3(params.get("rotation"), Vector3.ZERO)
        elif camera is Node2D:
            camera.rotation = float(params.get("rotation", 0.0))
    if params.has("rotation_degrees"):
        if camera is Node3D:
            camera.rotation_degrees = _parse_vector3(params.get("rotation_degrees"), Vector3.ZERO)
        elif camera is Node2D:
            camera.rotation_degrees = float(params.get("rotation_degrees", 0.0))
    if camera is Camera2D:
        var camera_2d: Camera2D = camera
        if params.has("zoom"):
            camera_2d.zoom = _parse_vector2(params.get("zoom"), Vector2.ONE)
        if params.has("offset"):
            camera_2d.offset = _parse_vector2(params.get("offset"), Vector2.ZERO)
        if params.has("ignore_rotation"):
            camera_2d.ignore_rotation = bool(params.get("ignore_rotation"))
        if params.has("drag_horizontal_enabled"):
            camera_2d.drag_horizontal_enabled = bool(params.get("drag_horizontal_enabled"))
        if params.has("drag_vertical_enabled"):
            camera_2d.drag_vertical_enabled = bool(params.get("drag_vertical_enabled"))
        if params.has("drag_margins"):
            _camera_apply_drag_margins(camera_2d, params.get("drag_margins"))
    elif camera is Camera3D:
        var camera_3d: Camera3D = camera
        if params.has("fov"):
            camera_3d.fov = float(params.get("fov"))
        if params.has("size"):
            camera_3d.size = float(params.get("size"))
        if params.has("near"):
            camera_3d.near = float(params.get("near"))
        if params.has("far"):
            camera_3d.far = float(params.get("far"))
        if params.has("projection"):
            camera_3d.projection = _camera_projection(params.get("projection"))
        if params.has("keep_aspect"):
            camera_3d.keep_aspect = _camera_keep_aspect(params.get("keep_aspect"))
        if params.has("cull_mask"):
            camera_3d.cull_mask = int(params.get("cull_mask"))
        if params.has("h_offset"):
            camera_3d.h_offset = float(params.get("h_offset"))
        if params.has("v_offset"):
            camera_3d.v_offset = float(params.get("v_offset"))
    if params.has("make_current"):
        if bool(params.get("make_current")):
            _camera_make_current(camera)
        elif camera is Camera2D:
            var camera_2d: Camera2D = camera
            camera_2d.enabled = false
        elif _has_property(camera, "current"):
            camera.set("current", false)

func _camera_apply_2d_limits(camera: Camera2D, params: Dictionary) -> void:
    if params.has("limit_left"):
        camera.limit_left = int(params.get("limit_left"))
    if params.has("limit_right"):
        camera.limit_right = int(params.get("limit_right"))
    if params.has("limit_top"):
        camera.limit_top = int(params.get("limit_top"))
    if params.has("limit_bottom"):
        camera.limit_bottom = int(params.get("limit_bottom"))
    if params.has("limit_enabled"):
        _set_if_property(camera, "limit_enabled", bool(params.get("limit_enabled")))
    if params.has("limit_smoothed"):
        camera.limit_smoothed = bool(params.get("limit_smoothed"))
    if params.has("editor_draw_limits"):
        camera.editor_draw_limits = bool(params.get("editor_draw_limits"))

func _camera_apply_2d_smoothing(camera: Camera2D, params: Dictionary) -> void:
    if params.has("position_smoothing_enabled"):
        camera.position_smoothing_enabled = bool(params.get("position_smoothing_enabled"))
    if params.has("position_smoothing_speed"):
        camera.position_smoothing_speed = float(params.get("position_smoothing_speed"))
    if params.has("rotation_smoothing_enabled"):
        camera.rotation_smoothing_enabled = bool(params.get("rotation_smoothing_enabled"))
    if params.has("rotation_smoothing_speed"):
        camera.rotation_smoothing_speed = float(params.get("rotation_smoothing_speed"))
    if params.has("limit_smoothed"):
        camera.limit_smoothed = bool(params.get("limit_smoothed"))

func _camera_apply_preset(camera: Node, preset: String, viewport_size: Vector2, options) -> bool:
    if camera is Camera2D:
        var camera_2d: Camera2D = camera
        match preset:
            "platformer_2d":
                camera_2d.zoom = _parse_vector2(_camera_option(options, "zoom", [1, 1]), Vector2.ONE)
                camera_2d.position_smoothing_enabled = true
                camera_2d.position_smoothing_speed = float(_camera_option(options, "position_smoothing_speed", 6.0))
                camera_2d.drag_horizontal_enabled = true
                camera_2d.drag_vertical_enabled = false
                _camera_apply_drag_margins(camera_2d, {"left": 0.22, "right": 0.22, "top": 0.18, "bottom": 0.34})
                camera_2d.ignore_rotation = true
                camera_2d.editor_draw_limits = true
            "top_down_2d":
                camera_2d.zoom = _parse_vector2(_camera_option(options, "zoom", [1, 1]), Vector2.ONE)
                camera_2d.position_smoothing_enabled = true
                camera_2d.position_smoothing_speed = float(_camera_option(options, "position_smoothing_speed", 8.0))
                camera_2d.drag_horizontal_enabled = false
                camera_2d.drag_vertical_enabled = false
                camera_2d.ignore_rotation = true
            "pixel_art_2d":
                camera_2d.zoom = _parse_vector2(_camera_option(options, "zoom", [2, 2]), Vector2(2, 2))
                camera_2d.position_smoothing_enabled = false
                camera_2d.rotation_smoothing_enabled = false
                camera_2d.ignore_rotation = true
                camera_2d.editor_draw_screen = true
            "cinematic_2d":
                camera_2d.zoom = _parse_vector2(_camera_option(options, "zoom", [0.85, 0.85]), Vector2(0.85, 0.85))
                camera_2d.position_smoothing_enabled = true
                camera_2d.position_smoothing_speed = float(_camera_option(options, "position_smoothing_speed", 3.0))
                camera_2d.rotation_smoothing_enabled = true
                camera_2d.rotation_smoothing_speed = float(_camera_option(options, "rotation_smoothing_speed", 3.0))
                camera_2d.limit_smoothed = true
            _:
                log_error("Preset is not supported for Camera2D: " + preset)
                return false
        camera_2d.editor_draw_screen = true
        return true
    if camera is Camera3D:
        var camera_3d: Camera3D = camera
        match preset:
            "third_person_3d":
                camera_3d.projection = Camera3D.PROJECTION_PERSPECTIVE
                camera_3d.fov = float(_camera_option(options, "fov", 70.0))
                camera_3d.near = float(_camera_option(options, "near", 0.05))
                camera_3d.far = float(_camera_option(options, "far", 4000.0))
                camera_3d.position = _parse_vector3(_camera_option(options, "position", [0, 4, 8]), Vector3(0, 4, 8))
                camera_3d.rotation_degrees = _parse_vector3(_camera_option(options, "rotation_degrees", [-20, 0, 0]), Vector3(-20, 0, 0))
            "orthographic_3d":
                camera_3d.projection = Camera3D.PROJECTION_ORTHOGONAL
                camera_3d.size = float(_camera_option(options, "size", max(viewport_size.x, viewport_size.y) / 96.0))
                camera_3d.near = float(_camera_option(options, "near", 0.05))
                camera_3d.far = float(_camera_option(options, "far", 2000.0))
                camera_3d.position = _parse_vector3(_camera_option(options, "position", [0, 10, 10]), Vector3(0, 10, 10))
                camera_3d.rotation_degrees = _parse_vector3(_camera_option(options, "rotation_degrees", [-45, 0, 0]), Vector3(-45, 0, 0))
            _:
                log_error("Preset is not supported for Camera3D: " + preset)
                return false
        return true
    log_error("Node is not a camera")
    return false

func _camera_collect(scene_root: Node, node: Node, cameras: Array, viewport_size: Vector2, include_bounds: bool) -> void:
    if node is Camera2D or node is Camera3D:
        cameras.append(_camera_summary(scene_root, node, viewport_size, include_bounds))
    for child in node.get_children():
        if child is Node:
            _camera_collect(scene_root, child, cameras, viewport_size, include_bounds)

func _camera_summary(scene_root: Node, camera: Node, viewport_size: Vector2, include_bounds: bool) -> Dictionary:
    var path = _camera_path(scene_root, camera)
    var summary = {
        "path": path,
        "camera_path": path,
        "name": camera.name,
        "type": camera.get_class(),
        "current": _camera_is_current(camera),
        "position": _camera_position_array(camera),
        "rotation": _camera_rotation_array(camera)
    }
    if camera is Camera2D:
        var camera_2d: Camera2D = camera
        summary["enabled"] = camera_2d.enabled
        summary["zoom"] = [camera_2d.zoom.x, camera_2d.zoom.y]
        summary["offset"] = [camera_2d.offset.x, camera_2d.offset.y]
        summary["ignore_rotation"] = camera_2d.ignore_rotation
        summary["limits"] = _camera_limits_dict(camera_2d)
        summary["smoothing"] = _camera_smoothing_dict(camera_2d)
        summary["drag_margins"] = _camera_drag_margins_dict(camera_2d)
        summary["follow"] = _camera_follow_dict(camera_2d)
        if include_bounds and viewport_size != Vector2.ZERO:
            summary["bounds"] = _camera_2d_bounds_dict(camera_2d, viewport_size)
    elif camera is Camera3D:
        var camera_3d: Camera3D = camera
        summary["projection"] = _camera_projection_name(camera_3d.projection)
        summary["fov"] = camera_3d.fov
        summary["size"] = camera_3d.size
        summary["near"] = camera_3d.near
        summary["far"] = camera_3d.far
        summary["keep_aspect"] = "width" if camera_3d.keep_aspect == Camera3D.KEEP_WIDTH else "height"
        summary["cull_mask"] = camera_3d.cull_mask
        summary["h_offset"] = camera_3d.h_offset
        summary["v_offset"] = camera_3d.v_offset
        if include_bounds:
            summary["bounds"] = {
                "type": "camera3d_projection",
                "projection": summary["projection"],
                "fov": camera_3d.fov,
                "size": camera_3d.size,
                "near": camera_3d.near,
                "far": camera_3d.far
            }
    return summary

func _camera_2d_bounds_dict(camera: Camera2D, viewport_size: Vector2) -> Dictionary:
    var zoom = camera.zoom
    if abs(zoom.x) < 0.001:
        zoom.x = 1.0
    if abs(zoom.y) < 0.001:
        zoom.y = 1.0
    var visible_size = Vector2(viewport_size.x / abs(zoom.x), viewport_size.y / abs(zoom.y))
    var center = camera.global_position + camera.offset
    var position = center - visible_size / 2.0
    return {
        "x": position.x,
        "y": position.y,
        "width": visible_size.x,
        "height": visible_size.y,
        "center": [center.x, center.y],
        "viewport_size": [viewport_size.x, viewport_size.y],
        "limits": _camera_limits_dict(camera)
    }

func _camera_limits_dict(camera: Camera2D) -> Dictionary:
    return {
        "left": camera.limit_left,
        "right": camera.limit_right,
        "top": camera.limit_top,
        "bottom": camera.limit_bottom,
        "enabled": bool(camera.get("limit_enabled")) if _has_property(camera, "limit_enabled") else true,
        "smoothed": camera.limit_smoothed,
        "editor_draw_limits": camera.editor_draw_limits
    }

func _camera_smoothing_dict(camera: Camera2D) -> Dictionary:
    return {
        "position_enabled": camera.position_smoothing_enabled,
        "position_speed": camera.position_smoothing_speed,
        "rotation_enabled": camera.rotation_smoothing_enabled,
        "rotation_speed": camera.rotation_smoothing_speed
    }

func _camera_drag_margins_dict(camera: Camera2D) -> Dictionary:
    return {
        "horizontal_enabled": camera.drag_horizontal_enabled,
        "vertical_enabled": camera.drag_vertical_enabled,
        "left": camera.drag_left_margin,
        "right": camera.drag_right_margin,
        "top": camera.drag_top_margin,
        "bottom": camera.drag_bottom_margin
    }

func _camera_follow_dict(camera: Camera2D) -> Dictionary:
    var follow = {
        "enabled": false,
        "target_path": "",
        "offset": [0, 0],
        "update_mode": ""
    }
    if camera.get_script() != null:
        follow["script"] = camera.get_script().resource_path
    if _has_property(camera, "follow_enabled"):
        follow["enabled"] = bool(camera.get("follow_enabled"))
    if _has_property(camera, "target_path"):
        follow["target_path"] = str(camera.get("target_path"))
    if _has_property(camera, "follow_offset"):
        var offset = _parse_vector2(camera.get("follow_offset"), Vector2.ZERO)
        follow["offset"] = [offset.x, offset.y]
    if _has_property(camera, "update_mode"):
        follow["update_mode"] = str(camera.get("update_mode"))
    return follow

func _camera_apply_drag_margins(camera: Camera2D, value) -> void:
    if value is Dictionary:
        if value.has("left"):
            camera.drag_left_margin = float(value["left"])
        if value.has("right"):
            camera.drag_right_margin = float(value["right"])
        if value.has("top"):
            camera.drag_top_margin = float(value["top"])
        if value.has("bottom"):
            camera.drag_bottom_margin = float(value["bottom"])
        if value.has("horizontal"):
            camera.drag_left_margin = float(value["horizontal"])
            camera.drag_right_margin = float(value["horizontal"])
        if value.has("vertical"):
            camera.drag_top_margin = float(value["vertical"])
            camera.drag_bottom_margin = float(value["vertical"])
    elif value is Array and value.size() >= 4:
        camera.drag_left_margin = float(value[0])
        camera.drag_top_margin = float(value[1])
        camera.drag_right_margin = float(value[2])
        camera.drag_bottom_margin = float(value[3])

func _camera_path(scene_root: Node, camera: Node) -> String:
    return "." if camera == scene_root else str(scene_root.get_path_to(camera))

func _camera_is_current(camera: Node) -> bool:
    if camera is Camera2D:
        return bool(camera.enabled)
    if _has_property(camera, "current"):
        return bool(camera.get("current"))
    if camera.has_method("is_current"):
        return bool(camera.call("is_current"))
    if _has_property(camera, "enabled"):
        return bool(camera.get("enabled"))
    return false

func _camera_position_array(camera: Node) -> Array:
    if camera is Node3D:
        return [camera.position.x, camera.position.y, camera.position.z]
    if camera is Node2D:
        return [camera.position.x, camera.position.y]
    return []

func _camera_rotation_array(camera: Node) -> Array:
    if camera is Node3D:
        return [camera.rotation.x, camera.rotation.y, camera.rotation.z]
    if camera is Node2D:
        return [camera.rotation]
    return []

func _camera_normalize_type(value) -> String:
    var text = str(value).to_lower()
    return "3d" if text.find("3") >= 0 else "2d"

func _camera_projection(value) -> int:
    match str(value).to_lower():
        "orthogonal", "ortho":
            return Camera3D.PROJECTION_ORTHOGONAL
        "frustum":
            return Camera3D.PROJECTION_FRUSTUM
        _:
            return Camera3D.PROJECTION_PERSPECTIVE

func _camera_projection_name(value: int) -> String:
    match value:
        Camera3D.PROJECTION_ORTHOGONAL:
            return "orthogonal"
        Camera3D.PROJECTION_FRUSTUM:
            return "frustum"
        _:
            return "perspective"

func _camera_keep_aspect(value) -> int:
    var text = str(value).to_lower()
    return Camera3D.KEEP_WIDTH if text == "width" or text == "keep_width" else Camera3D.KEEP_HEIGHT

func _camera_option(options, key: String, fallback):
    if options is Dictionary and options.has(key):
        return options[key]
    return fallback

func _camera_follow_script_source() -> String:
    return """extends Camera2D

@export_node_path("Node2D") var target_path: NodePath
@export var follow_enabled: bool = true
@export var follow_offset: Vector2 = Vector2.ZERO
@export_enum("idle", "physics") var update_mode: String = "idle"

func _process(_delta: float) -> void:
    if update_mode == "idle":
        _sync_to_target()

func _physics_process(_delta: float) -> void:
    if update_mode == "physics":
        _sync_to_target()

func _sync_to_target() -> void:
    if not follow_enabled:
        return
    var target := get_node_or_null(target_path) as Node2D
    if target == null:
        return
    global_position = target.global_position + follow_offset
"""
