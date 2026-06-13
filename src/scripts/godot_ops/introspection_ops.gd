# Phase 6.B final-pass introspection operation module.
extends RefCounted

var _context
var _legacy
var debug_mode = false
var _exit_code = 0

func setup(context, legacy) -> void:
    _context = context
    _legacy = legacy
    debug_mode = bool(context.debug_mode)

func get_exit_code() -> int:
    return _exit_code

func reset_exit_code() -> void:
    _exit_code = 0

func quit(code := 0) -> void:
    _exit_code = int(code)

func log_debug(message) -> void:
    if _legacy != null and _legacy.has_method("log_debug"):
        _legacy.log_debug(str(message))

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

func _parse_color(value, fallback := Color.WHITE) -> Color:
    return _legacy.parse_color(value, fallback)

func _parse_vector2(value, fallback := Vector2.ZERO) -> Vector2:
    return _legacy.parse_vector2(value, fallback)

func _has_property(obj: Object, property_name: String) -> bool:
    return _legacy.has_property(obj, property_name)

func _get_edit_parent(scene_root: Node, parent_path: String) -> Node:
    return _legacy.get_edit_parent(scene_root, parent_path)

func _make_unique_child_name(parent: Node, base_name: String) -> String:
    return _legacy.make_unique_child_name(parent, base_name)

func get_class_info(params: Dictionary) -> void:
    get_class_info_op(params)


func type_string(type_enum):
    match type_enum:
        TYPE_NIL: return "Nil"
        TYPE_BOOL: return "bool"
        TYPE_INT: return "int"
        TYPE_FLOAT: return "float"
        TYPE_STRING: return "String"
        TYPE_VECTOR2: return "Vector2"
        TYPE_VECTOR2I: return "Vector2i"
        TYPE_RECT2: return "Rect2"
        TYPE_RECT2I: return "Rect2i"
        TYPE_VECTOR3: return "Vector3"
        TYPE_VECTOR3I: return "Vector3i"
        TYPE_TRANSFORM2D: return "Transform2D"
        TYPE_VECTOR4: return "Vector4"
        TYPE_VECTOR4I: return "Vector4i"
        TYPE_PLANE: return "Plane"
        TYPE_QUATERNION: return "Quaternion"
        TYPE_AABB: return "AABB"
        TYPE_BASIS: return "Basis"
        TYPE_TRANSFORM3D: return "Transform3D"
        TYPE_PROJECTION: return "Projection"
        TYPE_COLOR: return "Color"
        TYPE_STRING_NAME: return "StringName"
        TYPE_NODE_PATH: return "NodePath"
        TYPE_RID: return "RID"
        TYPE_OBJECT: return "Object"
        TYPE_CALLABLE: return "Callable"
        TYPE_SIGNAL: return "Signal"
        TYPE_DICTIONARY: return "Dictionary"
        TYPE_ARRAY: return "Array"
        TYPE_PACKED_BYTE_ARRAY: return "PackedByteArray"
        TYPE_PACKED_INT32_ARRAY: return "PackedInt32Array"
        TYPE_PACKED_INT64_ARRAY: return "PackedInt64Array"
        TYPE_PACKED_FLOAT32_ARRAY: return "PackedFloat32Array"
        TYPE_PACKED_FLOAT64_ARRAY: return "PackedFloat64Array"
        TYPE_PACKED_STRING_ARRAY: return "PackedStringArray"
        TYPE_PACKED_VECTOR2_ARRAY: return "PackedVector2Array"
        TYPE_PACKED_VECTOR3_ARRAY: return "PackedVector3Array"
        TYPE_PACKED_COLOR_ARRAY: return "PackedColorArray"
        _: return "Unknown"

# Create a test suite file for GUT (Godot Unit Test)

func get_class_info_op(params: Dictionary) -> void:
    var class_name_param: String = params.get("class_name", "")
    var include_inherited: bool = params.get("include_inherited", false)
    var section: String = params.get("section", "all")

    if class_name_param.is_empty():
        log_error("class_name is required")
        return

    if not ClassDB.class_exists(class_name_param):
        log_error("Class not found: " + class_name_param)
        return

    var no_inheritance = not include_inherited
    var result := {
        "success": true,
        "class_name": class_name_param,
        "parent_class": ClassDB.get_parent_class(class_name_param),
        "include_inherited": include_inherited,
    }

    # Build inheritance chain
    var chain := []
    var current := class_name_param
    while current != "":
        chain.append(current)
        current = ClassDB.get_parent_class(current)
    result["inheritance_chain"] = chain

    # Properties
    if section == "all" or section == "properties":
        var props := []
        var prop_list = ClassDB.class_get_property_list(class_name_param, no_inheritance)
        for prop in prop_list:
            if prop["name"] == "" or prop["name"].begins_with("_"):
                continue
            props.append({
                "name": prop["name"],
                "type": type_string(prop["type"]),
                "usage": prop.get("usage", 0),
            })
        result["properties"] = props
        result["property_count"] = props.size()

    # Methods
    if section == "all" or section == "methods":
        var methods := []
        var method_list = ClassDB.class_get_method_list(class_name_param, no_inheritance)
        for method in method_list:
            var method_name: String = method["name"]
            if method_name.begins_with("_"):
                continue
            var args := []
            for arg in method.get("args", []):
                args.append({
                    "name": arg.get("name", ""),
                    "type": type_string(arg.get("type", 0)),
                })
            var ret = method.get("return", {})
            methods.append({
                "name": method_name,
                "args": args,
                "return_type": type_string(ret.get("type", 0)),
            })
        result["methods"] = methods
        result["method_count"] = methods.size()

    # Signals
    if section == "all" or section == "signals":
        var signals := []
        var signal_list = ClassDB.class_get_signal_list(class_name_param, no_inheritance)
        for sig in signal_list:
            var args := []
            for arg in sig.get("args", []):
                args.append({
                    "name": arg.get("name", ""),
                    "type": type_string(arg.get("type", 0)),
                })
            signals.append({
                "name": sig["name"],
                "args": args,
            })
        result["signals"] = signals
        result["signal_count"] = signals.size()

    # Constants / Enums
    if section == "all" or section == "constants":
        var constants := []
        var const_list = ClassDB.class_get_integer_constant_list(class_name_param, no_inheritance)
        for const_name in const_list:
            constants.append({
                "name": const_name,
                "value": ClassDB.class_get_integer_constant(class_name_param, const_name),
            })
        result["constants"] = constants
        result["constant_count"] = constants.size()

    print(JSON.stringify(result))
    log_info("get_class_info_op completed for " + class_name_param)


# ─── Tier 3: Audio Bus Configuration ────────────────────────────────────────
