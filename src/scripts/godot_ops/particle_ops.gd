# Phase 6.B final-pass particle operation module.
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


func create_particle_system(params: Dictionary):
    var scene_path = params.get("scene_path", "")
    var parent_path = params.get("parent_path", ".")
    var node_name = params.get("node_name", "Particles")
    var particle_type = params.get("particle_type", "2d")
    var amount = int(params.get("amount", 16))
    var lifetime = float(params.get("lifetime", 1.0))
    var one_shot = params.get("one_shot", false)
    var explosiveness = float(params.get("explosiveness", 0.0))
    var emission_shape_name = params.get("emission_shape", "point")

    if scene_path.is_empty():
        log_error("scene_path is required")
        quit(1)

    var full_scene_path = "res://" + scene_path
    var packed_scene = load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene = packed_scene.instantiate()

    # Find parent node
    var parent = scene if parent_path == "." else scene.get_node_or_null(parent_path)
    if parent == null:
        log_error("Parent node not found: " + parent_path)
        scene.free()
        quit(1)

    # Create particle node
    var particles: Node
    if particle_type == "3d":
        particles = GPUParticles3D.new()
    else:
        particles = GPUParticles2D.new()

    particles.name = node_name
    particles.set("amount", amount)
    particles.set("lifetime", lifetime)
    particles.set("one_shot", one_shot)
    particles.set("explosiveness", explosiveness)
    particles.set("emitting", true)

    # Create ParticleProcessMaterial
    var material = ParticleProcessMaterial.new()

    # Emission shape
    var emission_shape_map = {
        "point": ParticleProcessMaterial.EMISSION_SHAPE_POINT,
        "sphere": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
        "sphere_surface": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE_SURFACE,
        "box": ParticleProcessMaterial.EMISSION_SHAPE_BOX,
        "ring": ParticleProcessMaterial.EMISSION_SHAPE_RING
    }
    if emission_shape_map.has(emission_shape_name):
        material.emission_shape = emission_shape_map[emission_shape_name]

    # Emission shape parameters
    if params.has("emission_sphere_radius"):
        material.emission_sphere_radius = float(params["emission_sphere_radius"])
    if params.has("emission_box_extents"):
        var e = params["emission_box_extents"]
        material.emission_box_extents = Vector3(float(e[0]), float(e[1]), float(e[2]))
    if params.has("emission_ring_radius"):
        material.emission_ring_radius = float(params["emission_ring_radius"])
    if params.has("emission_ring_inner_radius"):
        material.emission_ring_inner_radius = float(params["emission_ring_inner_radius"])
    if params.has("emission_ring_height"):
        material.emission_ring_height = float(params["emission_ring_height"])

    # Direction
    if params.has("direction"):
        var d = params["direction"]
        material.direction = Vector3(float(d[0]), float(d[1]), float(d[2]))
    if params.has("spread"):
        material.spread = float(params["spread"])

    # Gravity
    if params.has("gravity"):
        var g = params["gravity"]
        material.gravity = Vector3(float(g[0]), float(g[1]), float(g[2]))

    # Velocity
    if params.has("initial_velocity_min"):
        material.initial_velocity_min = float(params["initial_velocity_min"])
    if params.has("initial_velocity_max"):
        material.initial_velocity_max = float(params["initial_velocity_max"])

    # Scale (use set_param_min/max API — no direct property in ParticleProcessMaterial)
    if params.has("scale_amount_min"):
        material.set_param_min(ParticleProcessMaterial.PARAM_SCALE, float(params["scale_amount_min"]))
    if params.has("scale_amount_max"):
        material.set_param_max(ParticleProcessMaterial.PARAM_SCALE, float(params["scale_amount_max"]))

    # Color
    if params.has("color"):
        var c = params["color"]
        var alpha = float(c[3]) if c.size() > 3 else 1.0
        material.color = Color(float(c[0]), float(c[1]), float(c[2]), alpha)

    particles.set("process_material", material)
    parent.add_child(particles)
    particles.owner = scene

    # Save scene
    var new_packed = PackedScene.new()
    var pack_err = new_packed.pack(scene)
    if pack_err != OK:
        log_error("Failed to pack scene: " + str(pack_err))
        scene.free()
        quit(1)

    var save_err = ResourceSaver.save(new_packed, full_scene_path)
    scene.free()
    if save_err != OK:
        log_error("Failed to save scene: " + str(save_err))
        quit(1)

    var result = {
        "success": true,
        "node_name": node_name,
        "particle_type": particle_type,
        "parent_path": parent_path,
        "amount": amount,
        "lifetime": lifetime,
        "emission_shape": emission_shape_name
    }
    print(JSON.stringify(result))
    log_info("create_particle_system completed successfully")

func apply_particle_preset(params: Dictionary):
    var scene_path = params.get("scene_path", "")
    var parent_path = params.get("parent_path", ".")
    var preset = params.get("preset", "")
    var particle_type = params.get("particle_type", "2d")
    var scale_factor = float(params.get("scale_factor", 1.0))
    var node_name = params.get("node_name", "")

    if scene_path.is_empty() or preset.is_empty():
        log_error("scene_path and preset are required")
        quit(1)

    # Define presets
    var presets = {
        "fire": {
            "node_name": "FireParticles",
            "amount": 32,
            "lifetime": 1.5,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
            "emission_sphere_radius": 0.5,
            "direction": Vector3(0, -1, 0),
            "spread": 15.0,
            "gravity": Vector3(0, -2, 0),
            "initial_velocity_min": 2.0,
            "initial_velocity_max": 4.0,
            "scale_amount_min": 0.5,
            "scale_amount_max": 1.5,
            "color": Color(1.0, 0.5, 0.1, 0.9)
        },
        "smoke": {
            "node_name": "SmokeParticles",
            "amount": 24,
            "lifetime": 3.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
            "emission_sphere_radius": 0.3,
            "direction": Vector3(0, -1, 0),
            "spread": 25.0,
            "gravity": Vector3(0, -0.5, 0),
            "initial_velocity_min": 0.5,
            "initial_velocity_max": 1.5,
            "scale_amount_min": 1.0,
            "scale_amount_max": 3.0,
            "color": Color(0.5, 0.5, 0.5, 0.5)
        },
        "explosion": {
            "node_name": "ExplosionParticles",
            "amount": 64,
            "lifetime": 0.8,
            "one_shot": true,
            "explosiveness": 1.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
            "emission_sphere_radius": 0.1,
            "direction": Vector3(0, -1, 0),
            "spread": 180.0,
            "gravity": Vector3(0, 2, 0),
            "initial_velocity_min": 5.0,
            "initial_velocity_max": 12.0,
            "scale_amount_min": 0.3,
            "scale_amount_max": 1.0,
            "color": Color(1.0, 0.7, 0.2, 1.0)
        },
        "magic_sparkle": {
            "node_name": "MagicParticles",
            "amount": 48,
            "lifetime": 2.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
            "emission_sphere_radius": 1.0,
            "direction": Vector3(0, -1, 0),
            "spread": 180.0,
            "gravity": Vector3(0, 0, 0),
            "initial_velocity_min": 0.5,
            "initial_velocity_max": 2.0,
            "scale_amount_min": 0.1,
            "scale_amount_max": 0.4,
            "color": Color(0.5, 0.8, 1.0, 0.8)
        },
        "rain": {
            "node_name": "RainParticles",
            "amount": 200,
            "lifetime": 2.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_BOX,
            "emission_box_extents": Vector3(10, 0.1, 10),
            "direction": Vector3(0, 1, 0),
            "spread": 5.0,
            "gravity": Vector3(0, 9.8, 0),
            "initial_velocity_min": 5.0,
            "initial_velocity_max": 8.0,
            "scale_amount_min": 0.02,
            "scale_amount_max": 0.05,
            "color": Color(0.7, 0.8, 1.0, 0.6)
        },
        "snow": {
            "node_name": "SnowParticles",
            "amount": 100,
            "lifetime": 5.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_BOX,
            "emission_box_extents": Vector3(10, 0.1, 10),
            "direction": Vector3(0, 1, 0),
            "spread": 30.0,
            "gravity": Vector3(0, 1.5, 0),
            "initial_velocity_min": 0.3,
            "initial_velocity_max": 1.0,
            "scale_amount_min": 0.05,
            "scale_amount_max": 0.15,
            "color": Color(1.0, 1.0, 1.0, 0.9)
        },
        "dust": {
            "node_name": "DustParticles",
            "amount": 30,
            "lifetime": 4.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_BOX,
            "emission_box_extents": Vector3(2, 0.5, 2),
            "direction": Vector3(1, 0, 0),
            "spread": 90.0,
            "gravity": Vector3(0, 0.2, 0),
            "initial_velocity_min": 0.1,
            "initial_velocity_max": 0.5,
            "scale_amount_min": 0.05,
            "scale_amount_max": 0.2,
            "color": Color(0.8, 0.7, 0.5, 0.4)
        },
        "sparks": {
            "node_name": "SparkParticles",
            "amount": 40,
            "lifetime": 0.5,
            "one_shot": false,
            "explosiveness": 0.3,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_POINT,
            "direction": Vector3(0, -1, 0),
            "spread": 60.0,
            "gravity": Vector3(0, 5, 0),
            "initial_velocity_min": 3.0,
            "initial_velocity_max": 8.0,
            "scale_amount_min": 0.05,
            "scale_amount_max": 0.15,
            "color": Color(1.0, 0.9, 0.3, 1.0)
        }
    }

    if not presets.has(preset):
        log_error("Unknown preset: " + preset + ". Available: " + ", ".join(presets.keys()))
        quit(1)

    var preset_data = presets[preset]
    if node_name.is_empty():
        node_name = preset_data["node_name"]

    var full_scene_path = "res://" + scene_path
    var packed_scene = load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene = packed_scene.instantiate()

    var parent = scene if parent_path == "." else scene.get_node_or_null(parent_path)
    if parent == null:
        log_error("Parent node not found: " + parent_path)
        scene.free()
        quit(1)

    # Create particle node
    var particles: Node
    if particle_type == "3d":
        particles = GPUParticles3D.new()
    else:
        particles = GPUParticles2D.new()

    particles.name = node_name
    particles.set("amount", int(preset_data["amount"] * scale_factor))
    particles.set("lifetime", preset_data["lifetime"])
    particles.set("one_shot", preset_data["one_shot"])
    particles.set("explosiveness", preset_data["explosiveness"])
    particles.set("emitting", not preset_data["one_shot"])

    # Create and configure material
    var material = ParticleProcessMaterial.new()
    material.emission_shape = preset_data["emission_shape"]

    if preset_data.has("emission_sphere_radius"):
        material.emission_sphere_radius = preset_data["emission_sphere_radius"] * scale_factor
    if preset_data.has("emission_box_extents"):
        material.emission_box_extents = preset_data["emission_box_extents"] * scale_factor

    material.direction = preset_data["direction"]
    material.spread = preset_data["spread"]
    material.gravity = preset_data["gravity"]
    material.initial_velocity_min = preset_data["initial_velocity_min"] * scale_factor
    material.initial_velocity_max = preset_data["initial_velocity_max"] * scale_factor
    material.set_param_min(ParticleProcessMaterial.PARAM_SCALE, preset_data["scale_amount_min"] * scale_factor)
    material.set_param_max(ParticleProcessMaterial.PARAM_SCALE, preset_data["scale_amount_max"] * scale_factor)
    material.color = preset_data["color"]

    particles.set("process_material", material)
    parent.add_child(particles)
    particles.owner = scene

    # Save scene
    var new_packed = PackedScene.new()
    var pack_err = new_packed.pack(scene)
    if pack_err != OK:
        log_error("Failed to pack scene: " + str(pack_err))
        scene.free()
        quit(1)

    var save_err = ResourceSaver.save(new_packed, full_scene_path)
    scene.free()
    if save_err != OK:
        log_error("Failed to save scene: " + str(save_err))
        quit(1)

    var result = {
        "success": true,
        "node_name": node_name,
        "preset": preset,
        "particle_type": particle_type,
        "scale_factor": scale_factor,
        "amount": int(preset_data["amount"] * scale_factor)
    }
    print(JSON.stringify(result))
    log_info("apply_particle_preset completed successfully")


# ─── Tier 3: Engine Introspection ────────────────────────────────────────────
