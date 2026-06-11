# Phase 6.B focused resource workflow operation module.
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

# --- Phase 1.4: Resource workflow ---

func resource_create_gradient_texture(params: Dictionary) -> void:
	log_info("Starting resource_create_gradient_texture operation")
	var output_path: String = params.get("output_path", "")
	if output_path.is_empty():
		log_error("output_path is required")
		return

	var dimension: String = params.get("dimension", "1d")
	var gradient = _gradient_from_points(params.get("points", []))
	var texture: Resource = null
	if dimension == "2d":
		var texture_2d = GradientTexture2D.new()
		texture_2d.gradient = gradient
		texture_2d.width = int(params.get("width", 256))
		texture_2d.height = int(params.get("height", 256))
		texture_2d.fill = _gradient_fill_mode(params.get("fill", "linear"))
		texture = texture_2d
	else:
		var texture_1d = GradientTexture1D.new()
		texture_1d.gradient = gradient
		texture_1d.width = int(params.get("width", 256))
		texture = texture_1d

	if not _save_resource_to_path(texture, output_path):
		return

	print(JSON.stringify({
		"success": true,
		"resource_path": _to_res_path(output_path),
		"resource_type": texture.get_class(),
		"point_count": gradient.get_point_count()
	}))
	log_info("resource_create_gradient_texture completed successfully")


func resource_create_noise_texture(params: Dictionary) -> void:
	log_info("Starting resource_create_noise_texture operation")
	var output_path: String = params.get("output_path", "")
	if output_path.is_empty():
		log_error("output_path is required")
		return

	var noise = FastNoiseLite.new()
	noise.seed = int(params.get("seed", 1337))
	noise.frequency = float(params.get("frequency", 0.02))
	noise.noise_type = int(params.get("noise_type", FastNoiseLite.TYPE_SIMPLEX))

	var texture = NoiseTexture2D.new()
	texture.width = int(params.get("width", 256))
	texture.height = int(params.get("height", 256))
	texture.noise = noise
	texture.seamless = bool(params.get("seamless", false))
	texture.as_normal_map = bool(params.get("as_normal_map", false))

	if not _save_resource_to_path(texture, output_path):
		return

	print(JSON.stringify({
		"success": true,
		"resource_path": _to_res_path(output_path),
		"resource_type": texture.get_class(),
		"width": texture.width,
		"height": texture.height,
		"seed": noise.seed,
		"frequency": noise.frequency
	}))
	log_info("resource_create_noise_texture completed successfully")


func resource_create_curve(params: Dictionary) -> void:
	log_info("Starting resource_create_curve operation")
	var output_path: String = params.get("output_path", "")
	if output_path.is_empty():
		log_error("output_path is required")
		return

	var curve = Curve.new()
	curve.min_value = float(params.get("min_value", 0.0))
	curve.max_value = float(params.get("max_value", 1.0))
	curve.bake_resolution = int(params.get("bake_resolution", 100))
	_curve_apply_points(curve, params.get("points", []))

	if not _save_resource_to_path(curve, output_path):
		return

	print(JSON.stringify({
		"success": true,
		"resource_path": _to_res_path(output_path),
		"resource_type": "Curve",
		"point_count": curve.get_point_count(),
		"min_value": curve.min_value,
		"max_value": curve.max_value
	}))
	log_info("resource_create_curve completed successfully")


func resource_set_curve_points(params: Dictionary) -> void:
	log_info("Starting resource_set_curve_points operation")
	var resource_path: String = params.get("resource_path", "")
	if resource_path.is_empty():
		log_error("resource_path is required")
		return
	var curve = ResourceLoader.load(_to_res_path(resource_path)) as Curve
	if curve == null:
		log_error("Resource is not a Curve: " + resource_path)
		return

	_curve_apply_points(curve, params.get("points", []))
	if not _save_resource_to_path(curve, resource_path):
		return

	print(JSON.stringify({
		"success": true,
		"resource_path": _to_res_path(resource_path),
		"resource_type": "Curve",
		"point_count": curve.get_point_count()
	}))
	log_info("resource_set_curve_points completed successfully")


func resource_create_environment(params: Dictionary) -> void:
	log_info("Starting resource_create_environment operation")
	var output_path: String = params.get("output_path", "")
	if output_path.is_empty():
		log_error("output_path is required")
		return

	var environment = Environment.new()
	environment.background_mode = int(params.get("background_mode", Environment.BG_COLOR))
	environment.background_color = _parse_color(params.get("background_color", [0.05, 0.07, 0.1, 1.0]), Color(0.05, 0.07, 0.1, 1.0))
	environment.ambient_light_color = _parse_color(params.get("ambient_light_color", [1, 1, 1, 1]), Color.WHITE)
	environment.ambient_light_energy = float(params.get("ambient_light_energy", 0.5))
	environment.glow_enabled = bool(params.get("glow_enabled", false))
	environment.ssao_enabled = bool(params.get("ssao_enabled", false))

	if not _save_resource_to_path(environment, output_path):
		return

	print(JSON.stringify({
		"success": true,
		"resource_path": _to_res_path(output_path),
		"resource_type": "Environment",
		"background_mode": environment.background_mode,
		"ambient_light_energy": environment.ambient_light_energy
	}))
	log_info("resource_create_environment completed successfully")


func resource_create_physics_material(params: Dictionary) -> void:
	log_info("Starting resource_create_physics_material operation")
	var output_path: String = params.get("output_path", "")
	if output_path.is_empty():
		log_error("output_path is required")
		return

	var material = PhysicsMaterial.new()
	material.friction = float(params.get("friction", 1.0))
	material.rough = bool(params.get("rough", false))
	material.bounce = float(params.get("bounce", 0.0))
	material.absorbent = bool(params.get("absorbent", false))

	if not _save_resource_to_path(material, output_path):
		return

	print(JSON.stringify({
		"success": true,
		"resource_path": _to_res_path(output_path),
		"resource_type": "PhysicsMaterial",
		"friction": material.friction,
		"rough": material.rough,
		"bounce": material.bounce,
		"absorbent": material.absorbent
	}))
	log_info("resource_create_physics_material completed successfully")


func resource_assign(params: Dictionary) -> void:
	log_info("Starting resource_assign operation")
	var scene_path: String = params.get("scene_path", "")
	var node_path: String = params.get("node_path", "")
	var property_name: String = params.get("property_name", "")
	var resource_path: String = params.get("resource_path", "")
	if scene_path.is_empty() or node_path.is_empty() or property_name.is_empty() or resource_path.is_empty():
		log_error("scene_path, node_path, property_name, and resource_path are required")
		return

	var loaded = _load_scene_for_edit(scene_path)
	if loaded.is_empty():
		return
	var scene_root: Node = loaded["scene_root"]
	var target = _get_edit_parent(scene_root, node_path)
	if target == null:
		log_error("Node not found: " + node_path)
		scene_root.free()
		return
	if not _has_property(target, property_name):
		log_error("Property not found on node: " + property_name)
		scene_root.free()
		return

	var resource = ResourceLoader.load(_to_res_path(resource_path))
	if resource == null:
		log_error("Failed to load resource: " + resource_path)
		scene_root.free()
		return

	target.set(property_name, resource)
	if not _save_scene_root(scene_root, loaded["full_scene_path"]):
		scene_root.free()
		return
	scene_root.free()

	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(scene_path),
		"node_path": node_path,
		"property_name": property_name,
		"resource_path": _to_res_path(resource_path),
		"validated": bool(params.get("validate_after", true))
	}))
	log_info("resource_assign completed successfully")


func resource_autofit_physics_shape(params: Dictionary) -> void:
	log_info("Starting resource_autofit_physics_shape operation")
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

	var is_3d = body is PhysicsBody3D or body is Area3D
	var shape_size = params.get("shape_size", Vector3(1, 1, 1) if is_3d else Vector2(64, 64))
	var visual_path: String = params.get("visual_node_path", "")
	if not visual_path.is_empty():
		var visual = _get_edit_parent(scene_root, visual_path)
		if visual is Sprite2D and visual.texture != null:
			shape_size = visual.texture.get_size()
		elif visual is ColorRect:
			shape_size = visual.size
		elif visual is MeshInstance3D and visual.mesh != null:
			shape_size = visual.mesh.get_aabb().size

	var shape_name: String = params.get("shape_name", "CollisionShape")
	var shape_node: Node = null
	if bool(params.get("replace_existing", true)):
		for child in body.get_children():
			if child is CollisionShape2D or child is CollisionShape3D:
				shape_node = child
				break
	if shape_node == null:
		shape_node = CollisionShape3D.new() if is_3d else CollisionShape2D.new()
		shape_node.name = _make_unique_child_name(body, shape_name)
		body.add_child(shape_node)
		shape_node.owner = scene_root

	if not _resource_apply_shape_size(shape_node, params, is_3d, shape_size):
		scene_root.free()
		return

	if not _save_scene_root(scene_root, loaded["full_scene_path"]):
		scene_root.free()
		return
	var result_shape_path = str(scene_root.get_path_to(shape_node))
	scene_root.free()

	print(JSON.stringify({
		"success": true,
		"scene_path": _to_res_path(scene_path),
		"body_path": body_path,
		"shape_path": result_shape_path,
		"shape_type": params.get("shape_type", "box" if is_3d else "rectangle"),
		"shape_size": str(shape_size)
	}))
	log_info("resource_autofit_physics_shape completed successfully")


func resource_convert_format(params: Dictionary) -> void:
	log_info("Starting resource_convert_format operation")
	var resource_path: String = params.get("resource_path", "")
	var output_path: String = params.get("output_path", "")
	if resource_path.is_empty() or output_path.is_empty():
		log_error("resource_path and output_path are required")
		return
	if not (output_path.ends_with(".tres") or output_path.ends_with(".res")):
		log_error("output_path must end with .tres or .res")
		return
	if ResourceLoader.exists(_to_res_path(output_path)) and not bool(params.get("overwrite", false)):
		log_error("output_path already exists; pass overwrite=true to replace it")
		return

	var resource = ResourceLoader.load(_to_res_path(resource_path))
	if resource == null:
		log_error("Failed to load resource: " + resource_path)
		return
	if not _save_resource_to_path(resource, output_path):
		return

	print(JSON.stringify({
		"success": true,
		"resource_path": _to_res_path(resource_path),
		"output_path": _to_res_path(output_path),
		"resource_type": resource.get_class()
	}))
	log_info("resource_convert_format completed successfully")


func _curve_apply_points(curve: Curve, points: Array) -> void:
	while curve.get_point_count() > 0:
		curve.remove_point(0)
	if points.is_empty():
		points = [
			{"offset": 0.0, "value": 0.0},
			{"offset": 1.0, "value": 1.0}
		]
	for point in points:
		if not (point is Dictionary):
			continue
		var offset = float(point.get("offset", point.get("x", 0.0)))
		var value = float(point.get("value", point.get("y", 0.0)))
		curve.add_point(Vector2(offset, value))


func _gradient_from_points(points: Array) -> Gradient:
	var gradient = Gradient.new()
	if points.is_empty():
		points = [
			{"offset": 0.0, "color": [1.0, 1.0, 1.0, 1.0]},
			{"offset": 1.0, "color": [0.0, 0.0, 0.0, 1.0]}
		]
	while gradient.get_point_count() > 2:
		gradient.remove_point(gradient.get_point_count() - 1)
	for i in range(points.size()):
		var point = points[i]
		if not (point is Dictionary):
			continue
		var offset = float(point.get("offset", 0.0))
		var color = _parse_color(point.get("color", [1, 1, 1, 1]))
		if i < gradient.get_point_count():
			gradient.set_offset(i, offset)
			gradient.set_color(i, color)
		else:
			gradient.add_point(offset, color)
	return gradient


func _gradient_fill_mode(fill: String) -> int:
	match fill.to_lower():
		"radial":
			return 1
		"square":
			return 2
		"conic":
			return 3
		_:
			return 0


func _resource_apply_shape_size(shape_node: Node, params: Dictionary, is_3d: bool, shape_size) -> bool:
	var shape_resource = _create_collision_shape_resource(
		params.get("shape_type", "box" if is_3d else "rectangle"),
		is_3d,
		shape_size,
		float(params.get("shape_radius", 32.0)),
		float(params.get("shape_height", 64.0))
	)
	if shape_resource == null:
		return false
	shape_node.shape = shape_resource
	return true


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


func _constructor_parts(value: String) -> PackedStringArray:
	var start = value.find("(")
	var end = value.rfind(")")
	if start < 0 or end <= start:
		return PackedStringArray()
	var inner = value.substr(start + 1, end - start - 1)
	return inner.split(",")


func _is_physics_body_node(node: Node) -> bool:
	return node is PhysicsBody2D or node is PhysicsBody3D or node is Area2D or node is Area3D
