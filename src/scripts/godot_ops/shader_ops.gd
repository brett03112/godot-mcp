# Phase 6.B focused shader/material operation module.
extends RefCounted

var _context
var _legacy

func setup(context, legacy) -> void:
    _context = context
    _legacy = legacy

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

func _has_property(obj: Object, property_name: String) -> bool:
    return _legacy.has_property(obj, property_name)

func _shader_template(template_name: String) -> Dictionary:
    var templates = {
        "dissolve": {
            "code": """shader_type canvas_item;

uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D dissolve_texture : hint_default_white;
uniform vec4 edge_color : source_color = vec4(1.0, 0.5, 0.0, 1.0);
uniform float edge_width : hint_range(0.0, 0.5) = 0.1;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float noise = texture(dissolve_texture, UV).r;

    float edge = smoothstep(dissolve_amount - edge_width, dissolve_amount, noise);
    float alpha = smoothstep(dissolve_amount, dissolve_amount + 0.01, noise);

    vec4 edge_glow = edge_color * (1.0 - edge);
    COLOR = mix(tex + edge_glow, tex, edge);
    COLOR.a *= alpha * tex.a;
}""",
            "type": "canvas_item"
        },
        "outline": {
            "code": """shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float outline_width : hint_range(0.0, 10.0) = 2.0;

void fragment() {
    vec4 col = texture(TEXTURE, UV);
    vec2 ps = TEXTURE_PIXEL_SIZE * outline_width;
    float a = col.a;

    a = max(a, texture(TEXTURE, UV + vec2(0.0, -ps.y)).a);
    a = max(a, texture(TEXTURE, UV + vec2(0.0, ps.y)).a);
    a = max(a, texture(TEXTURE, UV + vec2(-ps.x, 0.0)).a);
    a = max(a, texture(TEXTURE, UV + vec2(ps.x, 0.0)).a);

    COLOR = mix(outline_color, col, col.a);
    COLOR.a = a;
}""",
            "type": "canvas_item"
        },
        "damage_flash": {
            "code": """shader_type canvas_item;

uniform float flash_intensity : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 0.0, 0.0, 1.0);

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    COLOR = mix(tex, flash_color, flash_intensity * tex.a);
    COLOR.a = tex.a;
}""",
            "type": "canvas_item"
        },
        "hologram": {
            "code": """shader_type canvas_item;

uniform float scan_speed : hint_range(0.0, 10.0) = 2.0;
uniform vec4 tint_color : source_color = vec4(0.0, 1.0, 1.0, 1.0);
uniform float scan_intensity : hint_range(0.0, 1.0) = 0.5;

void fragment() {
    float scan = sin((UV.y + TIME * scan_speed) * 20.0) * 0.5 + 0.5;
    vec4 tex = texture(TEXTURE, UV);
    COLOR = tex * tint_color;
    COLOR.a *= mix(1.0 - scan_intensity, 1.0, scan) * tex.a;
}""",
            "type": "canvas_item"
        }
    }
    return templates.get(template_name, {})

func create_shader_material(params: Dictionary) -> void:
    log_info("Creating shader material")
    var shader_path: String = params.get("shader_path", "")
    var material_path: String = params.get("material_path", "")
    var shader_code = params.get("shader_code", null)
    var shader_type = params.get("shader_type", null)
    var shader_parameters: Dictionary = params.get("shader_parameters", {})
    var template = params.get("template", null)

    if shader_path.is_empty() or material_path.is_empty():
        log_error("shader_path and material_path are required")
        return

    if template:
        log_info("Using shader template: " + str(template))
        var template_data = _shader_template(str(template))
        if template_data.is_empty():
            log_error("Unknown shader template: " + str(template))
            return
        shader_code = template_data["code"]
        if not shader_type:
            shader_type = template_data["type"]
        log_debug("Template shader type: " + str(shader_type))

    if not shader_code:
        log_error("No shader code provided (either via shaderCode or template)")
        return
    if not shader_type:
        log_error("No shader type provided (either via shaderType or template)")
        return

    var shader_source: String = str(shader_code)
    var shader_type_name: String = str(shader_type)
    log_debug("Shader path: " + shader_path)
    log_debug("Material path: " + material_path)
    log_debug("Shader type: " + shader_type_name)
    log_debug("Shader code length: " + str(shader_source.length()))

    if not shader_source.strip_edges().begins_with("shader_type"):
        log_error("Shader code must start with 'shader_type' declaration")
        return

    var found_shader_type := false
    for line in shader_source.split("\n"):
        var trimmed = line.strip_edges()
        if trimmed.begins_with("shader_type") and shader_type_name in trimmed:
            found_shader_type = true
            break
    if not found_shader_type:
        log_error("Shader code shader_type does not match parameter: " + shader_type_name)
        return

    var shader_res_path := _to_res_path(shader_path)
    var material_res_path := _to_res_path(material_path)
    var full_shader_path := ProjectSettings.globalize_path(shader_res_path)
    var full_material_path := ProjectSettings.globalize_path(material_res_path)

    for directory in [full_shader_path.get_base_dir(), full_material_path.get_base_dir()]:
        if not DirAccess.dir_exists_absolute(directory):
            var dir_result = DirAccess.make_dir_recursive_absolute(directory)
            if dir_result != OK:
                log_error("Failed to create directory: " + directory)
                return

    var shader_file = FileAccess.open(full_shader_path, FileAccess.WRITE)
    if not shader_file:
        log_error("Failed to create shader file: " + full_shader_path)
        return
    shader_file.store_string(shader_source)
    shader_file.close()
    log_info("Shader file created: " + shader_path)

    var shader = ResourceLoader.load(shader_res_path)
    if not shader:
        log_error("Failed to load shader: " + shader_path)
        log_error("Shader may contain syntax errors")
        return
    if not shader is Shader:
        log_error("Loaded resource is not a Shader")
        return

    var material = ShaderMaterial.new()
    material.shader = shader

    for param_name in shader_parameters.keys():
        var param_value = shader_parameters[param_name]
        if param_value is Array:
            if param_value.size() == 2:
                material.set_shader_parameter(param_name, Vector2(param_value[0], param_value[1]))
            elif param_value.size() == 3:
                material.set_shader_parameter(param_name, Vector3(param_value[0], param_value[1], param_value[2]))
            elif param_value.size() == 4:
                material.set_shader_parameter(param_name, Color(param_value[0], param_value[1], param_value[2], param_value[3]))
            else:
                material.set_shader_parameter(param_name, param_value)
        else:
            material.set_shader_parameter(param_name, param_value)
        log_debug("Set shader parameter: " + str(param_name) + " = " + str(param_value))

    var save_result = ResourceSaver.save(material, material_res_path)
    if save_result != OK:
        log_error("Failed to save material: " + material_path)
        log_error("Error code: " + str(save_result))
        return

    var output = {
        "shader_path": shader_path,
        "material_path": material_path,
        "shader_type": shader_type_name,
        "parameters_set": shader_parameters.keys() if shader_parameters.size() > 0 else []
    }
    print(JSON.stringify(output))
    log_info("create_shader_material operation completed successfully")

func apply_material(params: Dictionary) -> void:
    log_info("Starting apply_material operation")
    var scene_path: String = params.get("scene_path", "")
    var node_path_str: String = params.get("node_path", "")
    var material_path: String = params.get("material_path", "")
    var slot = params.get("slot", "auto")

    if scene_path.is_empty() or node_path_str.is_empty() or material_path.is_empty():
        log_error("scene_path, node_path, and material_path are required")
        return

    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var full_scene_path: String = loaded["full_scene_path"]

    var target_node: Node = scene_root if node_path_str == "." else scene_root.get_node_or_null(NodePath(node_path_str))
    if target_node == null:
        log_error("Node not found: " + node_path_str)
        scene_root.free()
        return

    var material = ResourceLoader.load(_to_res_path(material_path))
    if material == null:
        log_error("Failed to load material: " + _to_res_path(material_path))
        scene_root.free()
        return

    var applied_slot = slot
    if slot == "auto":
        if target_node is MeshInstance3D:
            applied_slot = "override"
        elif target_node is CSGPrimitive3D:
            applied_slot = "material"
        elif target_node is CanvasItem:
            applied_slot = "material"
        else:
            applied_slot = "override"

    if applied_slot == "override":
        target_node.set("material_override", material)
    elif str(applied_slot).begins_with("surface/"):
        var surface_idx = int(str(applied_slot).split("/")[1])
        if target_node is MeshInstance3D:
            target_node.set("surface_material_override/" + str(surface_idx), material)
    elif applied_slot == "material":
        target_node.set("material", material)

    if not _save_scene_root(scene_root, full_scene_path):
        scene_root.free()
        return
    scene_root.free()

    var output = {
        "success": true,
        "scene_path": scene_path,
        "node_path": node_path_str,
        "material_path": material_path,
        "slot": applied_slot
    }
    print(JSON.stringify(output))
    log_info("apply_material completed successfully")

func set_shader_parameter(params: Dictionary) -> void:
    log_info("Starting set_shader_parameter operation")
    var scene_path: String = params.get("scene_path", "")
    var node_path_str: String = params.get("node_path", "")
    var parameter_name: String = params.get("parameter_name", "")
    var parameter_value = params.get("parameter_value", null)

    if scene_path.is_empty() or node_path_str.is_empty() or parameter_name.is_empty():
        log_error("scene_path, node_path, and parameter_name are required")
        return

    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var full_scene_path: String = loaded["full_scene_path"]

    var target_node: Node = scene_root if node_path_str == "." else scene_root.get_node_or_null(NodePath(node_path_str))
    if target_node == null:
        log_error("Node not found: " + node_path_str)
        scene_root.free()
        return

    var material = null
    if target_node.has_method("get_active_material"):
        material = target_node.call("get_active_material", 0)
    elif _has_property(target_node, "material_override") and target_node.get("material_override") != null:
        material = target_node.get("material_override")
    elif _has_property(target_node, "material") and target_node.get("material") != null:
        material = target_node.get("material")

    if material == null:
        log_error("No material found on node: " + node_path_str)
        scene_root.free()
        return
    if not material is ShaderMaterial:
        log_error("Material is not a ShaderMaterial. Got: " + material.get_class())
        scene_root.free()
        return

    var converted_value = _shader_parameter_value(parameter_value)
    if converted_value is String and (converted_value as String).begins_with("res://"):
        var loaded_res = ResourceLoader.load(converted_value)
        if loaded_res != null:
            converted_value = loaded_res

    material.set_shader_parameter(parameter_name, converted_value)

    var material_resource_path = material.resource_path
    if not material_resource_path.is_empty():
        var mat_err = ResourceSaver.save(material, material_resource_path)
        if mat_err != OK:
            log_error("Failed to save material file: " + str(mat_err))
            scene_root.free()
            return
        log_info("Saved material to: " + material_resource_path)

    if not _save_scene_root(scene_root, full_scene_path):
        scene_root.free()
        return
    scene_root.free()

    var output = {
        "success": true,
        "scene_path": scene_path,
        "node_path": node_path_str,
        "parameter_name": parameter_name,
        "parameter_value": str(converted_value)
    }
    print(JSON.stringify(output))
    log_info("set_shader_parameter completed successfully")

func _shader_parameter_value(value):
    if value == null:
        return null
    if value is Array:
        if value.size() == 2:
            return Vector2(value[0], value[1])
        if value.size() == 3:
            return Vector3(value[0], value[1], value[2])
        if value.size() == 4:
            return Color(value[0], value[1], value[2], value[3])
        return value
    if value is String:
        var s = value.strip_edges()
        if s.begins_with("Vector2("):
            var inner_v2 = s.substr(8, s.length() - 9)
            var parts_v2 = inner_v2.split(",")
            if parts_v2.size() >= 2:
                return Vector2(float(parts_v2[0].strip_edges()), float(parts_v2[1].strip_edges()))
        elif s.begins_with("Vector3("):
            var inner_v3 = s.substr(8, s.length() - 9)
            var parts_v3 = inner_v3.split(",")
            if parts_v3.size() >= 3:
                return Vector3(float(parts_v3[0].strip_edges()), float(parts_v3[1].strip_edges()), float(parts_v3[2].strip_edges()))
        elif s.begins_with("Color("):
            var inner_color = s.substr(6, s.length() - 7)
            var parts_color = inner_color.split(",")
            if parts_color.size() >= 4:
                return Color(float(parts_color[0].strip_edges()), float(parts_color[1].strip_edges()), float(parts_color[2].strip_edges()), float(parts_color[3].strip_edges()))
            if parts_color.size() >= 3:
                return Color(float(parts_color[0].strip_edges()), float(parts_color[1].strip_edges()), float(parts_color[2].strip_edges()))
        elif s == "true":
            return true
        elif s == "false":
            return false
        elif s.is_valid_float():
            return float(s)
        elif s.is_valid_int():
            return int(s)
        return s
    return value
