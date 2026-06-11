# Phase 6.B focused navigation operation module.
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

func generate_navmesh(params: Dictionary) -> void:
    var scene_path: String = params.get("scene_path", "")
    var region_name: String = params.get("region_name", "NavigationRegion3D")
    var parent_path: String = params.get("parent_path", ".")
    var cell_size := float(params.get("cell_size", 0.25))
    var cell_height := float(params.get("cell_height", 0.25))
    var agent_radius := float(params.get("agent_radius", 0.5))
    var agent_height := float(params.get("agent_height", 2.0))
    var agent_max_slope := float(params.get("agent_max_slope", 45.0))
    var agent_max_climb := float(params.get("agent_max_climb", 0.25))
    var source_geometry_mode: String = params.get("source_geometry_mode", "static_colliders")

    if scene_path.is_empty():
        log_error("Scene path is required")
        return

    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var parent_node = _get_edit_parent(scene_root, parent_path)
    if parent_node == null:
        log_error("Parent node not found: " + parent_path)
        scene_root.free()
        return

    var nav_region: NavigationRegion3D = null
    if parent_node.has_node(region_name):
        nav_region = parent_node.get_node(region_name) as NavigationRegion3D

    if nav_region == null:
        nav_region = NavigationRegion3D.new()
        nav_region.name = region_name
        parent_node.add_child(nav_region)
        nav_region.owner = scene_root

    var navmesh = NavigationMesh.new()
    navmesh.cell_size = cell_size
    navmesh.cell_height = cell_height
    navmesh.agent_radius = agent_radius
    navmesh.agent_height = agent_height
    navmesh.agent_max_slope = agent_max_slope
    navmesh.agent_max_climb = agent_max_climb

    match source_geometry_mode:
        "static_colliders":
            navmesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
        "meshes":
            navmesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_MESH_INSTANCES
        "physics_bodies":
            navmesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_BOTH

    nav_region.navigation_mesh = navmesh

    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()

    var output = {
        "success": true,
        "scene_path": scene_path,
        "region_name": region_name,
        "cell_size": cell_size,
        "cell_height": cell_height,
        "agent_radius": agent_radius,
        "agent_height": agent_height,
        "agent_max_slope": agent_max_slope,
        "agent_max_climb": agent_max_climb,
        "source_geometry_mode": source_geometry_mode,
        "note": "Navigation mesh geometry will be baked at runtime or in the Godot editor"
    }
    print(JSON.stringify(output))
    log_info("generate_navmesh operation completed successfully")

func add_navigation_agent(params: Dictionary) -> void:
    log_info("Starting add_navigation_agent operation")
    var scene_path: String = params.get("scene_path", "")
    var parent_path: String = params.get("parent_path", "")
    if scene_path.is_empty() or parent_path.is_empty():
        log_error("scene_path and parent_path are required")
        return

    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var parent = _get_edit_parent(scene_root, parent_path)
    if parent == null:
        log_error("Parent node not found: " + parent_path)
        scene_root.free()
        return

    var agent_type: String = params.get("agent_type", "2d")
    var agent: Node = NavigationAgent3D.new() if agent_type == "3d" else NavigationAgent2D.new()
    agent.name = _make_unique_child_name(parent, params.get("agent_name", "NavigationAgent"))
    _set_if_property(agent, "radius", float(params.get("agent_radius", 0.5 if agent_type == "3d" else 10.0)))
    _set_if_property(agent, "height", float(params.get("agent_height", 2.0)))
    _set_if_property(agent, "max_speed", float(params.get("max_speed", 10.0 if agent_type == "3d" else 200.0)))
    _set_if_property(agent, "path_desired_distance", float(params.get("path_desired_distance", 1.0 if agent_type == "3d" else 5.0)))
    _set_if_property(agent, "target_desired_distance", float(params.get("path_desired_distance", 1.0 if agent_type == "3d" else 5.0)))
    _set_if_property(agent, "path_max_distance", float(params.get("path_max_distance", 0.0)))
    _set_if_property(agent, "path_search_max_distance", float(params.get("path_max_distance", 0.0)))
    _set_if_property(agent, "avoidance_enabled", bool(params.get("avoidance_enabled", true)))
    _set_if_property(agent, "avoidance_layers", int(params.get("avoidance_layers", 1)))
    _set_if_property(agent, "avoidance_priority", float(params.get("avoidance_priority", 1.0)))
    _set_if_property(agent, "navigation_layers", int(params.get("navigation_layers", 1)))
    _set_if_property(agent, "path_postprocessing", _nav_path_postprocessing_mode(params.get("path_post_processing", "edge_centered")))
    _set_if_property(agent, "path_metadata_flags", _nav_metadata_flags(params.get("enable_meta_flags", ["path", "closest", "request", "update"])))

    parent.add_child(agent)
    agent.owner = scene_root

    var result_agent_name = agent.name
    var result_agent_max_speed = agent.get("max_speed") if _has_property(agent, "max_speed") else null
    var result_agent_avoidance_enabled = agent.get("avoidance_enabled") if _has_property(agent, "avoidance_enabled") else null
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()

    var result = {
        "success": true,
        "scene_path": scene_path,
        "parent_path": parent_path,
        "agent_name": result_agent_name,
        "agent_type": agent_type,
        "max_speed": result_agent_max_speed,
        "avoidance_enabled": result_agent_avoidance_enabled
    }
    print(JSON.stringify(result))
    log_info("add_navigation_agent completed successfully")

func add_navigation_link(params: Dictionary) -> void:
    log_info("Starting add_navigation_link operation")
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

    var link_type: String = params.get("link_type", "2d")
    var link: Node = NavigationLink3D.new() if link_type == "3d" else NavigationLink2D.new()
    link.name = _make_unique_child_name(parent, params.get("link_name", "NavigationLink"))
    _set_if_property(link, "bidirectional", bool(params.get("bidirectional", true)))
    _set_if_property(link, "navigation_layers", int(params.get("navigation_layers", 1)))
    _set_if_property(link, "enter_cost", float(params.get("enter_cost", 0.0)))
    _set_if_property(link, "travel_cost", float(params.get("travel_cost", 1.0)))
    if link_type == "3d":
        _set_if_property(link, "start_position", _parse_vector3(params.get("start_position", "Vector3(0, 0, 0)")))
        _set_if_property(link, "end_position", _parse_vector3(params.get("end_position", "Vector3(0, 0, 100)")))
    else:
        _set_if_property(link, "start_position", _parse_vector2(params.get("start_position", "Vector2(0, 0)")))
        _set_if_property(link, "end_position", _parse_vector2(params.get("end_position", "Vector2(100, 0)")))

    parent.add_child(link)
    link.owner = scene_root

    var result_link_name = link.name
    var result_bidirectional = link.get("bidirectional")
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()

    var result = {
        "success": true,
        "scene_path": scene_path,
        "parent_path": parent_path,
        "link_name": result_link_name,
        "link_type": link_type,
        "bidirectional": result_bidirectional
    }
    print(JSON.stringify(result))
    log_info("add_navigation_link completed successfully")

func configure_navigation_obstacle(params: Dictionary) -> void:
    log_info("Starting configure_navigation_obstacle operation")
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

    var obstacle_name: String = params.get("obstacle_name", "NavigationObstacle")
    var action: String = params.get("action", "add")
    var existing = parent.get_node_or_null(NodePath(obstacle_name))

    if action == "remove":
        if existing == null:
            log_error("Navigation obstacle not found: " + obstacle_name)
            scene_root.free()
            return
        parent.remove_child(existing)
        existing.free()
    else:
        var obstacle_type: String = params.get("obstacle_type", "2d")
        var obstacle: Node = existing
        if obstacle == null:
            obstacle = NavigationObstacle3D.new() if obstacle_type == "3d" else NavigationObstacle2D.new()
            obstacle.name = _make_unique_child_name(parent, obstacle_name)
            parent.add_child(obstacle)
            obstacle.owner = scene_root
        if action == "toggle":
            var current_enabled = bool(obstacle.get("avoidance_enabled")) if _has_property(obstacle, "avoidance_enabled") else true
            _set_if_property(obstacle, "avoidance_enabled", not current_enabled)
        else:
            _set_if_property(obstacle, "radius", float(params.get("obstacle_radius", 1.0 if obstacle_type == "3d" else 32.0)))
            _set_if_property(obstacle, "height", float(params.get("obstacle_height", 2.0)))
            _set_if_property(obstacle, "avoidance_layers", int(params.get("avoidance_layers", 1)))
            _set_if_property(obstacle, "avoidance_enabled", bool(params.get("avoidance_enabled", true)))
            _set_if_property(obstacle, "affect_navigation_mesh", bool(params.get("affect_navigation", true)))
            _set_if_property(obstacle, "use_3d_avoidance", bool(params.get("use_3d_avoidance", true)))
            if params.has("velocity"):
                if obstacle_type == "3d":
                    _set_if_property(obstacle, "velocity", _parse_vector3(params.get("velocity")))
                else:
                    _set_if_property(obstacle, "velocity", _parse_vector2(params.get("velocity")))

    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()

    var result = {
        "success": true,
        "scene_path": scene_path,
        "parent_path": parent_path,
        "obstacle_name": obstacle_name,
        "action": action
    }
    print(JSON.stringify(result))
    log_info("configure_navigation_obstacle completed successfully")

func create_astar_grid(params: Dictionary) -> void:
    log_info("Starting create_astar_grid operation")
    var output_path: String = params.get("output_path", "")
    if output_path.is_empty():
        log_error("output_path is required")
        return

    var grid_size = _parse_vector2i(params.get("grid_size", "Vector2i(10, 10)"), Vector2i(10, 10))
    var cell_size = _parse_vector2(params.get("cell_size", "Vector2(16, 16)"), Vector2(16, 16))
    var cell_connect_mode: String = params.get("cell_connect_mode", "orthogonal")
    var default_heuristic: String = params.get("default_heuristic", "euclidean")
    var diagonal_mode_name: String = params.get("diagonal_mode", "always")

    var grid = AStarGrid2D.new()
    grid.region = Rect2i(Vector2i.ZERO, grid_size)
    grid.cell_size = cell_size
    grid.default_compute_heuristic = _astar_heuristic(default_heuristic)
    grid.default_estimate_heuristic = _astar_heuristic(default_heuristic)
    grid.diagonal_mode = _astar_diagonal_mode(cell_connect_mode, diagonal_mode_name)
    grid.jumping_enabled = bool(params.get("jumping_enabled", false))
    grid.offset = _parse_vector2(params.get("offset", "Vector2(0, 0)"), Vector2.ZERO)
    grid.update()

    var config_resource = Resource.new()
    config_resource.resource_name = "AStarGrid2DConfig"
    config_resource.set_meta("grid_size", grid_size)
    config_resource.set_meta("cell_size", cell_size)
    config_resource.set_meta("cell_connect_mode", cell_connect_mode)
    config_resource.set_meta("default_heuristic", default_heuristic)
    config_resource.set_meta("diagonal_mode", diagonal_mode_name)
    config_resource.set_meta("offset", grid.offset)
    config_resource.set_meta("jumping_enabled", grid.jumping_enabled)
    config_resource.set_meta("solid_point_weight", float(params.get("solid_point_weight", 1.0)))
    config_resource.set_meta("default_point_weight", float(params.get("default_point_weight", 1.0)))

    var full_output_path = _to_res_path(output_path)
    var absolute_output_path = ProjectSettings.globalize_path(full_output_path)
    var output_dir = absolute_output_path.get_base_dir()
    if not DirAccess.dir_exists_absolute(output_dir):
        DirAccess.make_dir_recursive_absolute(output_dir)
    var save_err = ResourceSaver.save(config_resource, full_output_path)
    if save_err != OK:
        log_error("Failed to save AStarGrid2D config resource: " + str(save_err))
        return

    var result = {
        "success": true,
        "output_path": output_path,
        "resource_type": "AStarGrid2DConfig",
        "grid_size": str(grid_size),
        "cell_size": str(cell_size),
        "cell_connect_mode": cell_connect_mode,
        "default_heuristic": default_heuristic,
        "note": "AStarGrid2D is RefCounted in Godot 4.6, so this saves a Resource config rather than a direct AStarGrid2D instance."
    }
    print(JSON.stringify(result))
    log_info("create_astar_grid completed successfully")

func setup_navigation_server(params: Dictionary) -> void:
    log_info("Starting setup_navigation_server operation")
    var server_type: String = params.get("server_type", "2d")
    var config = {
        "server_type": server_type,
        "avoidance_enabled": bool(params.get("avoidance_enabled", true)),
        "avoidance_time_horizon": float(params.get("avoidance_time_horizon", 2.0 if server_type == "3d" else 1.5)),
        "avoidance_max_neighbors": int(params.get("avoidance_max_neighbors", 256 if server_type == "3d" else 512)),
        "avoidance_max_speed": float(params.get("avoidance_max_speed", 10.0 if server_type == "3d" else 300.0)),
        "avoidance_radius_scale": float(params.get("avoidance_radius_scale", 2.0)),
        "cell_size": float(params.get("cell_size", 0.25 if server_type == "3d" else 1.0)),
        "cell_height": float(params.get("cell_height", 0.25)),
        "edge_connection_margin": float(params.get("edge_connection_margin", 1.0 if server_type == "3d" else 5.0)),
        "use_edge_connections": bool(params.get("use_edge_connections", true)),
        "border_size": float(params.get("border_size", 1.0 if server_type == "3d" else 10.0)),
        "iteration_cost": float(params.get("iteration_cost", 1.0)),
        "agent_radius": float(params.get("agent_radius", 0.5 if server_type == "3d" else 10.0)),
        "agent_height": float(params.get("agent_height", 2.0)),
        "agent_max_slope": float(params.get("agent_max_slope", 45.0)),
        "agent_max_climb": float(params.get("agent_max_climb", 0.25))
    }

    var result = {
        "success": true,
        "config": config,
        "note": "NavigationServer maps are runtime RIDs, so this tool validates and returns the requested configuration. Persist map-specific values in scene nodes or a project resource."
    }
    print(JSON.stringify(result))
    log_info("setup_navigation_server completed successfully")

func _parse_vector2i(value, fallback := Vector2i.ZERO) -> Vector2i:
    if value is Vector2i:
        return value
    if value is Vector2:
        return Vector2i(int(value.x), int(value.y))
    if value is Array and value.size() >= 2:
        return Vector2i(int(value[0]), int(value[1]))
    if value is String:
        var parts = _constructor_parts(value.strip_edges())
        if parts.size() >= 2:
            return Vector2i(int(parts[0].strip_edges()), int(parts[1].strip_edges()))
    return fallback

func _constructor_parts(value: String) -> PackedStringArray:
    var open_index = value.find("(")
    var close_index = value.rfind(")")
    if open_index >= 0 and close_index > open_index:
        return value.substr(open_index + 1, close_index - open_index - 1).split(",")
    return value.split(",")

func _nav_path_postprocessing_mode(mode: String) -> int:
    match mode.to_lower():
        "center":
            return 1
        _:
            return 0

func _nav_metadata_flags(flags: Array) -> int:
    var mask = 0
    for flag in flags:
        match str(flag):
            "path":
                mask |= 1
            "closest":
                mask |= 2
            "request":
                mask |= 4
            "update":
                mask |= 8
            "navigation_layers":
                mask |= 16
    return mask

func _astar_heuristic(value: String) -> int:
    match value.to_lower():
        "manhattan":
            return AStarGrid2D.HEURISTIC_MANHATTAN
        "octile":
            return AStarGrid2D.HEURISTIC_OCTILE
        "chebyshev":
            return AStarGrid2D.HEURISTIC_CHEBYSHEV
        _:
            return AStarGrid2D.HEURISTIC_EUCLIDEAN

func _astar_diagonal_mode(cell_connect_mode: String, diagonal_mode: String) -> int:
    if cell_connect_mode.to_lower() == "orthogonal":
        return AStarGrid2D.DIAGONAL_MODE_NEVER
    match diagonal_mode.to_lower():
        "at_least_one_walkable":
            return AStarGrid2D.DIAGONAL_MODE_AT_LEAST_ONE_WALKABLE
        "only_if_no_obstacles":
            return AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
        _:
            return AStarGrid2D.DIAGONAL_MODE_ALWAYS
