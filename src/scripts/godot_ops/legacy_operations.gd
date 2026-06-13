# Phase 6.A legacy compatibility module. New operation families should live in focused modules under godot_ops/.
extends RefCounted

var debug_mode = false
var _exit_code = 0

func setup(context) -> void:
    debug_mode = bool(context.debug_mode)

func get_exit_code() -> int:
    return _exit_code

func quit(code := 0) -> void:
    _exit_code = int(code)
    var loop = Engine.get_main_loop()
    if loop != null and loop.has_method("quit"):
        loop.call_deferred("quit", _exit_code)

func run(operation: String, params: Dictionary) -> bool:
    log_error("Unknown operation: " + operation)
    return false
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    print("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)

# Get a script by name or path
func to_res_path(path: String) -> String:
    return _to_res_path(path)


func load_scene_for_edit(scene_path: String) -> Dictionary:
    return _load_scene_for_edit(scene_path)


func save_scene_root(scene_root: Node, full_scene_path: String) -> bool:
    return _save_scene_root(scene_root, full_scene_path)


func ensure_resource_dir(resource_path: String) -> bool:
    return _ensure_resource_dir(resource_path)


func save_resource_to_path(resource: Resource, resource_path: String) -> bool:
    return _save_resource_to_path(resource, resource_path)


func parse_color(value, fallback := Color.WHITE) -> Color:
    return _parse_color(value, fallback)


func parse_vector2(value, fallback := Vector2.ZERO) -> Vector2:
    return _parse_vector2(value, fallback)


func has_property(obj: Object, property_name: String) -> bool:
    return _has_property(obj, property_name)


func get_edit_parent(scene_root: Node, parent_path: String) -> Node:
    return _get_edit_parent(scene_root, parent_path)


func make_unique_child_name(parent: Node, base_name: String) -> String:
    return _make_unique_child_name(parent, base_name)


func _to_res_path(path: String) -> String:
    if path.begins_with("res://"):
        return path
    return "res://" + path


func _load_scene_for_edit(scene_path: String) -> Dictionary:
    var full_scene_path = _to_res_path(scene_path)
    var packed_scene = load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        return {}
    var scene_root = packed_scene.instantiate()
    if scene_root == null:
        log_error("Failed to instantiate scene: " + full_scene_path)
        return {}
    return {
        "full_scene_path": full_scene_path,
        "scene_root": scene_root,
    }


func _save_scene_root(scene_root: Node, full_scene_path: String) -> bool:
    var new_packed = PackedScene.new()
    var pack_err = new_packed.pack(scene_root)
    if pack_err != OK:
        log_error("Failed to pack scene: " + str(pack_err))
        return false
    var save_err = ResourceSaver.save(new_packed, full_scene_path)
    if save_err != OK:
        log_error("Failed to save scene: " + str(save_err))
        return false
    return true


func _get_edit_parent(scene_root: Node, parent_path: String) -> Node:
    if parent_path == "." or parent_path == "" or parent_path == "root":
        return scene_root
    var normalized_path = parent_path
    if normalized_path.begins_with("root/"):
        normalized_path = normalized_path.substr(5)
    return scene_root.get_node_or_null(NodePath(normalized_path))


func _has_property(obj: Object, property_name: String) -> bool:
    for property_info in obj.get_property_list():
        if str(property_info.get("name", "")) == property_name:
            return true
    return false


func _set_if_property(obj: Object, property_name: String, value) -> bool:
    if _has_property(obj, property_name):
        obj.set(property_name, value)
        return true
    return false


func _ensure_resource_dir(resource_path: String) -> bool:
    var full_path = _to_res_path(resource_path)
    var absolute_path = ProjectSettings.globalize_path(full_path)
    var dir_path = absolute_path.get_base_dir()
    if not DirAccess.dir_exists_absolute(dir_path):
        var err = DirAccess.make_dir_recursive_absolute(dir_path)
        if err != OK:
            log_error("Failed to create resource directory: " + dir_path + " error=" + str(err))
            return false
    return true


func _save_resource_to_path(resource: Resource, resource_path: String) -> bool:
    var full_path = _to_res_path(resource_path)
    if not _ensure_resource_dir(full_path):
        return false
    var save_err = ResourceSaver.save(resource, full_path)
    if save_err != OK:
        log_error("Failed to save resource " + full_path + ": " + str(save_err))
        return false
    return true


func _parse_color(value, fallback := Color.WHITE) -> Color:
    if value is Color:
        return value
    if value is Array and value.size() >= 3:
        return Color(float(value[0]), float(value[1]), float(value[2]), float(value[3]) if value.size() >= 4 else 1.0)
    if value is String:
        var text = value.strip_edges()
        if text.begins_with("#"):
            return Color.html(text)
        var parts = _constructor_parts(text)
        if parts.size() >= 3:
            return Color(float(parts[0].strip_edges()), float(parts[1].strip_edges()), float(parts[2].strip_edges()), float(parts[3].strip_edges()) if parts.size() >= 4 else 1.0)
    return fallback


func _constructor_parts(value: String) -> PackedStringArray:
    var start = value.find("(")
    var end = value.rfind(")")
    if start < 0 or end <= start:
        return PackedStringArray()
    var inner = value.substr(start + 1, end - start - 1)
    return inner.split(",")


func _parse_vector2(value, fallback := Vector2.ZERO) -> Vector2:
    if value is Vector2:
        return value
    if value is Array and value.size() >= 2:
        return Vector2(float(value[0]), float(value[1]))
    if value is String:
        var parts = _constructor_parts(value.strip_edges())
        if parts.size() >= 2:
            return Vector2(float(parts[0].strip_edges()), float(parts[1].strip_edges()))
    return fallback


func _parse_vector3(value, fallback := Vector3.ZERO) -> Vector3:
    if value is Vector3:
        return value
    if value is Array and value.size() >= 3:
        return Vector3(float(value[0]), float(value[1]), float(value[2]))
    if value is String:
        var parts = _constructor_parts(value.strip_edges())
        if parts.size() >= 3:
            return Vector3(float(parts[0].strip_edges()), float(parts[1].strip_edges()), float(parts[2].strip_edges()))
    return fallback


func _make_unique_child_name(parent: Node, base_name: String) -> String:
    if not parent.has_node(base_name):
        return base_name
    var counter = 2
    var candidate = base_name + str(counter)
    while parent.has_node(candidate):
        counter += 1
        candidate = base_name + str(counter)
    return candidate
