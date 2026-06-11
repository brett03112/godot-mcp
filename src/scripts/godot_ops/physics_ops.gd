# Phase 6.B focused physics operation module.
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

# --- Tier 14: Physics ---

func configure_physics_material(params: Dictionary) -> void:
    log_info("Starting configure_physics_material operation")
    var mat_path: String = params.get("mat_path", "")
    if mat_path.is_empty():
        log_error("mat_path is required")
        return

    var material = PhysicsMaterial.new()
    material.friction = float(params.get("friction", 1.0))
    material.rough = bool(params.get("rough", false))
    material.bounce = float(params.get("bounce", 0.0))
    material.absorbent = bool(params.get("absorbent", false))

    var full_mat_path = _to_res_path(mat_path)
    var absolute_path = ProjectSettings.globalize_path(full_mat_path)
    var resource_dir = absolute_path.get_base_dir()
    if not DirAccess.dir_exists_absolute(resource_dir):
        DirAccess.make_dir_recursive_absolute(resource_dir)

    var save_err = ResourceSaver.save(material, full_mat_path)
    if save_err != OK:
        log_error("Failed to save PhysicsMaterial: " + str(save_err))
        return

    var result = {
        "success": true,
        "mat_path": mat_path,
        "physics_type": params.get("physics_type", "2d"),
        "friction": material.friction,
        "rough": material.rough,
        "bounce": material.bounce,
        "absorbent": material.absorbent,
        "note": "PhysicsMaterial in Godot 4.6 stores friction, rough, bounce, and absorbent. Damping belongs on physics bodies."
    }
    print(JSON.stringify(result))
    log_info("configure_physics_material completed successfully")


func set_collision_config(params: Dictionary) -> void:
    log_info("Starting set_collision_config operation")
    var scene_path: String = params.get("scene_path", "")
    var node_path: String = params.get("node_path", "")
    if scene_path.is_empty() or node_path.is_empty():
        log_error("scene_path and node_path are required")
        return

    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var target = _get_edit_parent(scene_root, node_path)
    if target == null:
        log_error("Collision node not found: " + node_path)
        scene_root.free()
        return
    if not (target is CollisionObject2D or target is CollisionObject3D):
        log_error("Node is not a CollisionObject2D/3D: " + node_path)
        scene_root.free()
        return

    var layer_set = bool(params.get("layer_set", true))
    var mask_set = bool(params.get("mask_set", true))
    if layer_set:
        target.collision_layer = int(params.get("collision_layer", 1))
    if mask_set:
        target.collision_mask = int(params.get("collision_mask", 1))
    if _has_property(target, "collision_priority"):
        target.collision_priority = float(params.get("collision_priority", 1.0))

    var result_layer = target.collision_layer
    var result_mask = target.collision_mask
    var result_priority = target.get("collision_priority") if _has_property(target, "collision_priority") else null
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()

    var result = {
        "success": true,
        "scene_path": scene_path,
        "node_path": node_path,
        "collision_layer": result_layer,
        "collision_mask": result_mask,
        "collision_priority": result_priority
    }
    print(JSON.stringify(result))
    log_info("set_collision_config completed successfully")


func create_physics_body(params: Dictionary) -> void:
    log_info("Starting create_physics_body operation")
    var scene_path: String = params.get("scene_path", "")
    if scene_path.is_empty():
        log_error("scene_path is required")
        return

    var body_type: String = params.get("body_type", "rigid_body_2d")
    var body: Node = null
    match body_type:
        "rigid_body_2d":
            body = RigidBody2D.new()
        "rigid_body_3d":
            body = RigidBody3D.new()
        "static_body_2d":
            body = StaticBody2D.new()
        "static_body_3d":
            body = StaticBody3D.new()
        "character_body_2d":
            body = CharacterBody2D.new()
        "character_body_3d":
            body = CharacterBody3D.new()
        "animatable_body_2d":
            body = AnimatableBody2D.new()
        "animatable_body_3d":
            body = AnimatableBody3D.new()
        "area_2d":
            body = Area2D.new()
        "area_3d":
            body = Area3D.new()
        _:
            log_error("Unsupported body_type: " + body_type)
            return

    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var parent = _get_edit_parent(scene_root, params.get("parent_path", "."))
    if parent == null:
        log_error("Parent node not found: " + str(params.get("parent_path", ".")))
        scene_root.free()
        return

    body.name = _make_unique_child_name(parent, params.get("body_name", "PhysicsBody"))
    if body is RigidBody2D or body is RigidBody3D:
        body.set("mass", float(params.get("mass", 1.0)))
        body.set("gravity_scale", float(params.get("gravity_scale", 1.0)))
        body.set("freeze", bool(params.get("freeze_enabled", false)))
        body.set("freeze_mode", 1 if str(params.get("freeze_mode", "kinematic")) == "kinematic" else 0)
        body.set("can_sleep", bool(params.get("can_sleep", true)))
        body.set("lock_rotation", bool(params.get("lock_rotation", false)))
        var ccd_mode = str(params.get("continuous_cd", "disabled"))
        var ccd_value = 0
        if ccd_mode == "cast_ray":
            ccd_value = 1
        elif ccd_mode == "cast_shape":
            ccd_value = 2
        body.set("continuous_cd", ccd_value)

    parent.add_child(body)
    body.owner = scene_root

    var added_shape = ""
    if bool(params.get("add_collision_shape", false)):
        var is_3d = _physics_node_is_3d(body_type)
        var shape_node = _create_collision_shape_node(
            is_3d,
            "CollisionShape",
            params.get("shape_type", "box" if is_3d else "rectangle"),
            params.get("shape_size", "Vector3(1, 1, 1)" if is_3d else "Vector2(64, 64)"),
            float(params.get("shape_radius", 32.0)),
            float(params.get("shape_height", 64.0)),
            false,
            false,
            1.0
        )
        if shape_node == null:
            scene_root.free()
            return
        body.add_child(shape_node)
        shape_node.owner = scene_root
        added_shape = shape_node.name

    var result_body_name = body.name
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()

    var result = {
        "success": true,
        "scene_path": scene_path,
        "parent_path": params.get("parent_path", "."),
        "body_name": result_body_name,
        "body_type": body_type,
        "collision_shape": added_shape
    }
    print(JSON.stringify(result))
    log_info("create_physics_body completed successfully")


func manage_collision_shape(params: Dictionary) -> void:
    log_info("Starting manage_collision_shape operation")
    var scene_path: String = params.get("scene_path", "")
    var body_path: String = params.get("body_path", "")
    if scene_path.is_empty() or body_path.is_empty():
        log_error("scene_path and body_path are required")
        return

    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var body = _get_edit_parent(scene_root, body_path)
    if body == null:
        log_error("Physics body not found: " + body_path)
        scene_root.free()
        return
    if not _is_physics_body_node(body):
        log_error("Node is not a physics body or area: " + body_path)
        scene_root.free()
        return

    var action: String = params.get("action", "add")
    var shape_name: String = params.get("shape_name", "CollisionShape")
    var removed_count = 0

    if action in ["remove", "replace"] and body.has_node(shape_name):
        var existing = body.get_node(shape_name)
        body.remove_child(existing)
        existing.free()
        removed_count += 1

    var added_shape = ""
    if action in ["add", "replace"]:
        var is_3d = body is Node3D
        var final_shape_name = _make_unique_child_name(body, shape_name)
        var shape_node = _create_collision_shape_node(
            is_3d,
            final_shape_name,
            params.get("shape_type", "box" if is_3d else "rectangle"),
            params.get("shape_size", "Vector3(1, 1, 1)" if is_3d else "Vector2(64, 64)"),
            float(params.get("shape_radius", 32.0)),
            float(params.get("shape_height", 64.0)),
            bool(params.get("disabled", false)),
            bool(params.get("one_way_collision", false)),
            float(params.get("one_way_margin", 1.0))
        )
        if shape_node == null:
            scene_root.free()
            return
        body.add_child(shape_node)
        shape_node.owner = scene_root
        added_shape = shape_node.name
    elif action != "remove":
        log_error("Unsupported collision shape action: " + action)
        scene_root.free()
        return

    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()

    var result = {
        "success": true,
        "scene_path": scene_path,
        "body_path": body_path,
        "action": action,
        "removed_count": removed_count,
        "added_shape": added_shape
    }
    print(JSON.stringify(result))
    log_info("manage_collision_shape completed successfully")


func setup_joint(params: Dictionary) -> void:
    log_info("Starting setup_joint operation")
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

    var joint_type: String = params.get("joint_type", "pin_joint_2d")
    var joint: Node = null
    match joint_type:
        "pin_joint_2d":
            joint = PinJoint2D.new()
        "groove_joint_2d":
            joint = GrooveJoint2D.new()
        "damped_spring_joint_2d":
            joint = DampedSpringJoint2D.new()
        "hinge_joint_3d":
            joint = HingeJoint3D.new()
        "slider_joint_3d":
            joint = SliderJoint3D.new()
        "cone_twist_joint_3d":
            joint = ConeTwistJoint3D.new()
        "generic_6dof_joint_3d":
            joint = Generic6DOFJoint3D.new()
        "spring_arm_3d":
            joint = SpringArm3D.new()
        _:
            log_error("Unsupported joint_type: " + joint_type)
            scene_root.free()
            return

    joint.name = _make_unique_child_name(parent, params.get("joint_name", "Joint"))
    parent.add_child(joint)
    joint.owner = scene_root

    var body_paths: Array = []
    if params.has("node_a_path") and not str(params.get("node_a_path")).is_empty():
        body_paths.append(str(params.get("node_a_path")))
    if params.has("node_b_path") and not str(params.get("node_b_path")).is_empty():
        body_paths.append(str(params.get("node_b_path")))
    if body_paths.size() < 2:
        body_paths.clear()
        _collect_physics_body_paths(scene_root, parent, body_paths)

    if body_paths.size() >= 2:
        _set_if_property(joint, "node_a", _relative_joint_path(body_paths[0]))
        _set_if_property(joint, "node_b", _relative_joint_path(body_paths[1]))

    _set_if_property(joint, "bias", float(params.get("bias", 0.5)))
    _set_if_property(joint, "softness", float(params.get("softness", 0.0)))
    _set_if_property(joint, "disable_collision", bool(params.get("disable_collisions", true)))
    _set_if_property(joint, "exclude_nodes_from_collision", bool(params.get("disable_collisions", true)))
    _set_if_property(joint, "motor_enabled", bool(params.get("motor_enabled", false)))
    _set_if_property(joint, "motor_target_velocity", float(params.get("motor_target_velocity", 0.0)))
    _set_if_property(joint, "angular_limit_enabled", true)
    _set_if_property(joint, "angular_limit_lower", deg_to_rad(float(params.get("angular_limit_lower", -90.0))))
    _set_if_property(joint, "angular_limit_upper", deg_to_rad(float(params.get("angular_limit_upper", 90.0))))
    _set_if_property(joint, "rest_length", float(params.get("spring_length", 1.0)))
    _set_if_property(joint, "length", float(params.get("spring_length", 1.0)))
    _set_if_property(joint, "stiffness", float(params.get("spring_stiffness", 20.0)))
    _set_if_property(joint, "damping", float(params.get("spring_damping", 1.0)))
    _set_if_property(joint, "spring_length", float(params.get("spring_length", 1.0)))

    var result_joint_name = joint.name
    var result_node_a = str(joint.get("node_a")) if _has_property(joint, "node_a") else ""
    var result_node_b = str(joint.get("node_b")) if _has_property(joint, "node_b") else ""
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()

    var result = {
        "success": true,
        "scene_path": scene_path,
        "parent_path": parent_path,
        "joint_name": result_joint_name,
        "joint_type": joint_type,
        "node_a": result_node_a,
        "node_b": result_node_b
    }
    print(JSON.stringify(result))
    log_info("setup_joint completed successfully")


func _physics_node_is_3d(body_type: String) -> bool:
    return body_type.ends_with("_3d")


func _create_collision_shape_resource(shape_type: String, is_3d: bool, shape_size, shape_radius: float, shape_height: float):
    var normalized_type = shape_type.to_lower()
    if is_3d:
        match normalized_type:
            "box", "rectangle":
                var box = BoxShape3D.new()
                box.size = _parse_vector3(shape_size, Vector3(1, 1, 1))
                return box
            "sphere", "circle":
                var sphere = SphereShape3D.new()
                sphere.radius = shape_radius
                return sphere
            "cylinder":
                var cylinder = CylinderShape3D.new()
                cylinder.radius = shape_radius
                cylinder.height = shape_height
                return cylinder
            "capsule", "capsule_3d":
                var capsule3d = CapsuleShape3D.new()
                capsule3d.radius = shape_radius
                capsule3d.height = shape_height
                return capsule3d
            "world_boundary":
                return WorldBoundaryShape3D.new()
            _:
                log_error("Unsupported 3D collision shape type: " + shape_type)
                return null

    match normalized_type:
        "rectangle", "box":
            var rect = RectangleShape2D.new()
            rect.size = _parse_vector2(shape_size, Vector2(64, 64))
            return rect
        "circle", "sphere":
            var circle = CircleShape2D.new()
            circle.radius = shape_radius
            return circle
        "capsule", "capsule_2d":
            var capsule2d = CapsuleShape2D.new()
            capsule2d.radius = shape_radius
            capsule2d.height = shape_height
            return capsule2d
        "segment":
            var segment = SegmentShape2D.new()
            var size = _parse_vector2(shape_size, Vector2(64, 0))
            segment.a = Vector2(-size.x / 2.0, -size.y / 2.0)
            segment.b = Vector2(size.x / 2.0, size.y / 2.0)
            return segment
        "world_boundary":
            return WorldBoundaryShape2D.new()
        _:
            log_error("Unsupported 2D collision shape type: " + shape_type)
            return null


func _create_collision_shape_node(is_3d: bool, shape_name: String, shape_type: String, shape_size, shape_radius: float, shape_height: float, disabled: bool, one_way_collision: bool, one_way_margin: float) -> Node:
    var shape_resource = _create_collision_shape_resource(shape_type, is_3d, shape_size, shape_radius, shape_height)
    if shape_resource == null:
        return null

    if is_3d:
        var shape_node_3d = CollisionShape3D.new()
        shape_node_3d.name = shape_name
        shape_node_3d.shape = shape_resource
        shape_node_3d.disabled = disabled
        return shape_node_3d

    var shape_node_2d = CollisionShape2D.new()
    shape_node_2d.name = shape_name
    shape_node_2d.shape = shape_resource
    shape_node_2d.disabled = disabled
    shape_node_2d.one_way_collision = one_way_collision
    shape_node_2d.one_way_collision_margin = one_way_margin
    return shape_node_2d


func _is_physics_body_node(node: Node) -> bool:
    return node is PhysicsBody2D or node is PhysicsBody3D or node is Area2D or node is Area3D


func _collect_physics_body_paths(root: Node, node: Node, paths: Array) -> void:
    if _is_physics_body_node(node):
        paths.append(str(root.get_path_to(node)))
    for child in node.get_children():
        if child is Node:
            _collect_physics_body_paths(root, child, paths)


func _relative_joint_path(body_path: String) -> NodePath:
    if body_path.begins_with("../") or body_path.begins_with("/"):
        return NodePath(body_path)
    return NodePath("../" + body_path)
