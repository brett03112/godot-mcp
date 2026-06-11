# Phase 6.B focused visual QA operation module.
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

func _parse_vector2(value, fallback := Vector2.ZERO) -> Vector2:
    return _legacy.parse_vector2(value, fallback)

func _get_edit_parent(scene_root: Node, parent_path: String) -> Node:
    return _legacy.get_edit_parent(scene_root, parent_path)

func _has_property(obj: Object, property_name: String) -> bool:
    return _legacy.has_property(obj, property_name)

func visual_sprite_bounds_check(params: Dictionary) -> void:
    log_info("Starting visual_sprite_bounds_check operation")
    var scene_path: String = params.get("scene_path", "")
    if scene_path.is_empty():
        log_error("scene_path is required")
        return
    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var viewport_size = _parse_vector2(params.get("viewport_size", [1152, 648]), Vector2(1152, 648))
    var margin = float(params.get("margin", 0.0))
    var include_hidden = bool(params.get("include_hidden", false))
    var viewport_rect = _visual_grow_rect(Rect2(Vector2.ZERO, viewport_size), margin)
    var sprites = []
    var issues = []
    _visual_collect_sprite_bounds(scene_root, scene_root, viewport_rect, include_hidden, sprites, issues)
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(scene_path),
        "viewport_size": [viewport_size.x, viewport_size.y],
        "margin": margin,
        "valid": issues.is_empty(),
        "sprite_count": sprites.size(),
        "sprites": sprites,
        "issue_count": issues.size(),
        "issues": issues
    }))
    log_info("visual_sprite_bounds_check completed successfully")

func visual_camera_framing_check(params: Dictionary) -> void:
    log_info("Starting visual_camera_framing_check operation")
    var loaded = _camera_load_scene_with_camera(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var camera: Node = loaded["camera"]
    if not (camera is Camera2D):
        log_error("camera_path must point to a Camera2D")
        scene_root.free()
        return
    var viewport_size = _parse_vector2(params.get("viewport_size", [1152, 648]), Vector2(1152, 648))
    var margin = float(params.get("margin", 0.0))
    var bounds = _camera_2d_bounds_dict(camera, viewport_size)
    var bounds_rect = Rect2(
        Vector2(float(bounds.get("x", 0.0)), float(bounds.get("y", 0.0))),
        Vector2(float(bounds.get("width", 0.0)), float(bounds.get("height", 0.0)))
    )
    var framing_rect = _visual_inset_rect(bounds_rect, margin)
    var target_paths_param = params.get("target_paths", [])
    var target_paths: Array = target_paths_param if target_paths_param is Array else []
    var targets = []
    var issues = []
    for target_path_value in target_paths:
        var target_path := str(target_path_value)
        var target = _get_edit_parent(scene_root, target_path)
        if target == null:
            issues.append({
                "kind": "target_missing",
                "path": target_path,
                "message": "Target node was not found."
            })
            continue
        if not (target is Node2D):
            issues.append({
                "kind": "target_not_node2d",
                "path": target_path,
                "type": target.get_class(),
                "message": "Camera framing check currently supports Node2D targets."
            })
            continue
        var target_2d: Node2D = target
        var point = target_2d.global_position
        var inside = framing_rect.has_point(point)
        targets.append({
            "path": target_path,
            "type": target.get_class(),
            "position": [point.x, point.y],
            "inside": inside
        })
        if not inside:
            issues.append({
                "kind": "target_outside_camera",
                "path": target_path,
                "type": target.get_class(),
                "position": [point.x, point.y],
                "camera_bounds": _visual_rect_dict(bounds_rect),
                "framing_bounds": _visual_rect_dict(framing_rect),
                "message": "Target position is outside the Camera2D framing bounds."
            })
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(params.get("scene_path", "")),
        "camera_path": params.get("camera_path", ""),
        "viewport_size": [viewport_size.x, viewport_size.y],
        "margin": margin,
        "camera_bounds": bounds,
        "framing_bounds": _visual_rect_dict(framing_rect),
        "valid": issues.is_empty(),
        "target_count": targets.size(),
        "targets": targets,
        "issue_count": issues.size(),
        "issues": issues
    }))
    log_info("visual_camera_framing_check completed successfully")

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

func _visual_collect_sprite_bounds(scene_root: Node, node: Node, viewport_rect: Rect2, include_hidden: bool, sprites: Array, issues: Array) -> void:
    if node is Sprite2D:
        var sprite: Sprite2D = node
        if include_hidden or sprite.visible:
            var sprite_info = _visual_sprite_summary(scene_root, sprite, viewport_rect)
            sprites.append(sprite_info)
            for issue in sprite_info.get("issues", []):
                issues.append(issue)
    for child in node.get_children():
        if child is Node:
            _visual_collect_sprite_bounds(scene_root, child, viewport_rect, include_hidden, sprites, issues)

func _visual_sprite_summary(scene_root: Node, sprite: Sprite2D, viewport_rect: Rect2) -> Dictionary:
    var path = "." if sprite == scene_root else str(scene_root.get_path_to(sprite))
    var rect = _visual_sprite_global_rect(sprite)
    var issues = []
    if sprite.texture == null:
        issues.append({
            "kind": "sprite_missing_texture",
            "path": path,
            "type": sprite.get_class(),
            "message": "Sprite2D has no texture assigned."
        })
    elif rect.size.x <= 0.0 or rect.size.y <= 0.0:
        issues.append({
            "kind": "sprite_empty_bounds",
            "path": path,
            "type": sprite.get_class(),
            "rect": _visual_rect_dict(rect),
            "message": "Sprite2D texture bounds are empty."
        })
    elif not _visual_rects_intersect(viewport_rect, rect):
        issues.append({
            "kind": "sprite_outside_viewport",
            "path": path,
            "type": sprite.get_class(),
            "rect": _visual_rect_dict(rect),
            "message": "Sprite2D bounds are outside the viewport plus margin."
        })
    return {
        "path": path,
        "name": sprite.name,
        "type": sprite.get_class(),
        "visible": sprite.visible,
        "texture_path": sprite.texture.resource_path if sprite.texture != null else "",
        "rect": _visual_rect_dict(rect),
        "issues": issues
    }

func _visual_sprite_global_rect(sprite: Sprite2D) -> Rect2:
    var local_rect = sprite.get_rect()
    var corners = [
        local_rect.position,
        local_rect.position + Vector2(local_rect.size.x, 0),
        local_rect.position + Vector2(0, local_rect.size.y),
        local_rect.position + local_rect.size
    ]
    var min_x = INF
    var min_y = INF
    var max_x = -INF
    var max_y = -INF
    for corner in corners:
        var point = sprite.to_global(corner)
        min_x = min(min_x, point.x)
        min_y = min(min_y, point.y)
        max_x = max(max_x, point.x)
        max_y = max(max_y, point.y)
    return Rect2(Vector2(min_x, min_y), Vector2(max_x - min_x, max_y - min_y))

func _visual_rects_intersect(a: Rect2, b: Rect2) -> bool:
    return a.position.x < b.position.x + b.size.x and a.position.x + a.size.x > b.position.x and a.position.y < b.position.y + b.size.y and a.position.y + a.size.y > b.position.y

func _visual_grow_rect(rect: Rect2, margin: float) -> Rect2:
    return Rect2(rect.position - Vector2(margin, margin), rect.size + Vector2(margin * 2.0, margin * 2.0))

func _visual_inset_rect(rect: Rect2, margin: float) -> Rect2:
    var inset_size = rect.size - Vector2(margin * 2.0, margin * 2.0)
    if inset_size.x < 0.0:
        inset_size.x = 0.0
    if inset_size.y < 0.0:
        inset_size.y = 0.0
    return Rect2(rect.position + Vector2(margin, margin), inset_size)

func _visual_rect_dict(rect: Rect2) -> Dictionary:
    return {
        "x": rect.position.x,
        "y": rect.position.y,
        "width": rect.size.x,
        "height": rect.size.y
    }
