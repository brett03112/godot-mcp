# Phase 6.B final-pass tilemap operation module.
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


func create_tilemap(params):
    var scene_path = params.get("scene_path", "")
    var tilemap_name = params.get("tilemap_name", "TileMap")
    var parent_path = params.get("parent_path", ".")
    var tile_size = params.get("tile_size", {"x": 16, "y": 16})
    var tileset_path = params.get("tileset_path", "")
    var layers = params.get("layers", [])

    if scene_path.is_empty():
        log_error("Scene path is required")
        quit(1)

    # Load the scene
    var full_scene_path = "res://" + scene_path if not scene_path.begins_with("res://") else scene_path
    var packed_scene = ResourceLoader.load(full_scene_path) as PackedScene

    if not packed_scene:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)

    # Find parent node
    var parent_node = scene_root if parent_path == "." else scene_root.get_node_or_null(parent_path)
    if not parent_node:
        log_error("Parent node not found: " + parent_path)
        scene_root.free()
        quit(1)

    # Check if TileMap already exists
    if parent_node.has_node(tilemap_name):
        log_error("TileMap node already exists: " + tilemap_name)
        scene_root.free()
        quit(1)

    # Create TileMap node
    var tilemap = TileMap.new()
    tilemap.name = tilemap_name

    # Create or load TileSet
    var tileset: TileSet = null
    if not tileset_path.is_empty():
        var full_tileset_path = "res://" + tileset_path if not tileset_path.begins_with("res://") else tileset_path
        tileset = ResourceLoader.load(full_tileset_path) as TileSet
        if not tileset:
            log_error("Failed to load TileSet: " + full_tileset_path)
            scene_root.free()
            quit(1)
    else:
        # Create a new TileSet
        tileset = TileSet.new()
        tileset.tile_size = Vector2i(int(tile_size.get("x", 16)), int(tile_size.get("y", 16)))

    tilemap.tile_set = tileset

    # Configure layers
    if layers.size() > 0:
        # Clear default layer and add named layers
        for i in range(layers.size()):
            if i == 0:
                tilemap.set_layer_name(0, layers[i])
            else:
                tilemap.add_layer(i)
                tilemap.set_layer_name(i, layers[i])

    # Add to parent
    parent_node.add_child(tilemap)
    tilemap.owner = scene_root

    # Save the scene
    var new_packed_scene = PackedScene.new()
    var pack_result = new_packed_scene.pack(scene_root)
    if pack_result != OK:
        log_error("Failed to pack scene: " + str(pack_result))
        scene_root.free()
        quit(1)

    var save_result = ResourceSaver.save(new_packed_scene, full_scene_path)
    scene_root.free()
    if save_result != OK:
        log_error("Failed to save scene: " + str(save_result))
        quit(1)

    log_info("TileMap created: " + tilemap_name)

    var output = {
        "success": true,
        "tilemap_name": tilemap_name,
        "scene_path": scene_path,
        "tile_size": tile_size,
        "layers": layers if layers.size() > 0 else ["Layer 0"]
    }

    print(JSON.stringify(output))
    log_info("create_tilemap operation completed successfully")

# Paint tiles in a TileMap

func paint_tiles(params):
    var scene_path = params.get("scene_path", "")
    var tilemap_path = params.get("tilemap_path", "")
    var layer = int(params.get("layer", 0))
    var source_id = int(params.get("source_id", 0))
    var tiles = params.get("tiles", [])
    var pattern = params.get("pattern", "single")
    var rect_start = params.get("rect_start", null)
    var rect_end = params.get("rect_end", null)

    if scene_path.is_empty():
        log_error("Scene path is required")
        quit(1)

    if tilemap_path.is_empty():
        log_error("TileMap path is required")
        quit(1)

    # Load the scene
    var full_scene_path = "res://" + scene_path if not scene_path.begins_with("res://") else scene_path
    var packed_scene = ResourceLoader.load(full_scene_path) as PackedScene

    if not packed_scene:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)

    # Find TileMap node
    var tilemap = scene_root.get_node_or_null(tilemap_path) as TileMap
    if not tilemap:
        log_error("TileMap not found: " + tilemap_path)
        scene_root.free()
        quit(1)

    var painted_count = 0

    match pattern:
        "single":
            # Paint individual tiles
            for tile in tiles:
                var x = int(tile.get("x", 0))
                var y = int(tile.get("y", 0))
                var atlas_coords = tile.get("atlasCoords", {"x": 0, "y": 0})
                var atlas_x = int(atlas_coords.get("x", 0))
                var atlas_y = int(atlas_coords.get("y", 0))

                tilemap.set_cell(layer, Vector2i(x, y), source_id, Vector2i(atlas_x, atlas_y))
                painted_count += 1

        "rect":
            # Paint rectangular region
            if rect_start and rect_end and tiles.size() > 0:
                var start_x = int(rect_start.get("x", 0))
                var start_y = int(rect_start.get("y", 0))
                var end_x = int(rect_end.get("x", 0))
                var end_y = int(rect_end.get("y", 0))

                var atlas_coords = tiles[0].get("atlasCoords", {"x": 0, "y": 0})
                var atlas_x = int(atlas_coords.get("x", 0))
                var atlas_y = int(atlas_coords.get("y", 0))

                for x in range(min(start_x, end_x), max(start_x, end_x) + 1):
                    for y in range(min(start_y, end_y), max(start_y, end_y) + 1):
                        tilemap.set_cell(layer, Vector2i(x, y), source_id, Vector2i(atlas_x, atlas_y))
                        painted_count += 1

        "line":
            # Paint line (Bresenham's algorithm)
            if rect_start and rect_end and tiles.size() > 0:
                var x0 = int(rect_start.get("x", 0))
                var y0 = int(rect_start.get("y", 0))
                var x1 = int(rect_end.get("x", 0))
                var y1 = int(rect_end.get("y", 0))

                var atlas_coords = tiles[0].get("atlasCoords", {"x": 0, "y": 0})
                var atlas_x = int(atlas_coords.get("x", 0))
                var atlas_y = int(atlas_coords.get("y", 0))

                var dx = abs(x1 - x0)
                var dy = -abs(y1 - y0)
                var sx = 1 if x0 < x1 else -1
                var sy = 1 if y0 < y1 else -1
                var err = dx + dy

                while true:
                    tilemap.set_cell(layer, Vector2i(x0, y0), source_id, Vector2i(atlas_x, atlas_y))
                    painted_count += 1
                    if x0 == x1 and y0 == y1:
                        break
                    var e2 = 2 * err
                    if e2 >= dy:
                        err += dy
                        x0 += sx
                    if e2 <= dx:
                        err += dx
                        y0 += sy

        "erase":
            # Erase tiles (set to -1)
            for tile in tiles:
                var x = int(tile.get("x", 0))
                var y = int(tile.get("y", 0))
                tilemap.erase_cell(layer, Vector2i(x, y))
                painted_count += 1

    # Save the scene
    var new_packed_scene = PackedScene.new()
    var pack_result = new_packed_scene.pack(scene_root)
    if pack_result != OK:
        log_error("Failed to pack scene: " + str(pack_result))
        scene_root.free()
        quit(1)

    var save_result = ResourceSaver.save(new_packed_scene, full_scene_path)
    scene_root.free()
    if save_result != OK:
        log_error("Failed to save scene: " + str(save_result))
        quit(1)

    log_info("Painted " + str(painted_count) + " tiles")

    var output = {
        "success": true,
        "scene_path": scene_path,
        "tilemap_path": tilemap_path,
        "layer": layer,
        "pattern": pattern,
        "painted_count": painted_count
    }

    print(JSON.stringify(output))
    log_info("paint_tiles operation completed successfully")

# Configure TileSet properties

func configure_tileset(params):
    var tileset_path = params.get("tileset_path", "")
    var texture_path = params.get("texture_path", "")
    var tile_size = params.get("tile_size", {"x": 16, "y": 16})
    var tile_config = params.get("tile_config", [])
    var physics_layer = int(params.get("physics_layer", 0))
    var navigation_layer = int(params.get("navigation_layer", 0))

    if tileset_path.is_empty():
        log_error("TileSet path is required")
        quit(1)

    var full_tileset_path = "res://" + tileset_path if not tileset_path.begins_with("res://") else tileset_path

    # Load or create TileSet
    var tileset: TileSet = null
    if ResourceLoader.exists(full_tileset_path):
        tileset = ResourceLoader.load(full_tileset_path) as TileSet

    if not tileset:
        tileset = TileSet.new()

    # Set tile size
    tileset.tile_size = Vector2i(int(tile_size.get("x", 16)), int(tile_size.get("y", 16)))

    # Add physics layer if needed
    while tileset.get_physics_layers_count() <= physics_layer:
        tileset.add_physics_layer()

    # Add navigation layer if needed
    while tileset.get_navigation_layers_count() <= navigation_layer:
        tileset.add_navigation_layer()

    # Configure texture source if provided
    var source_id = 0
    if not texture_path.is_empty():
        var full_texture_path = "res://" + texture_path if not texture_path.begins_with("res://") else texture_path
        var texture = ResourceLoader.load(full_texture_path) as Texture2D

        if texture:
            # Create or get atlas source
            var atlas_source: TileSetAtlasSource = null
            if tileset.get_source_count() > 0 and tileset.has_source(0):
                var existing_source = tileset.get_source(0)
                if existing_source is TileSetAtlasSource:
                    atlas_source = existing_source

            if not atlas_source:
                atlas_source = TileSetAtlasSource.new()
                if tileset.has_source(0):
                    tileset.remove_source(0)
                tileset.add_source(atlas_source, 0)

            atlas_source.texture = texture
            atlas_source.texture_region_size = tileset.tile_size

            # Create tiles in atlas
            var tex_width = int(texture.get_width() / tileset.tile_size.x)
            var tex_height = int(texture.get_height() / tileset.tile_size.y)

            for y in range(tex_height):
                for x in range(tex_width):
                    var coords = Vector2i(x, y)
                    if not atlas_source.has_tile(coords):
                        atlas_source.create_tile(coords)

            source_id = 0
        else:
            log_error("Failed to load texture: " + full_texture_path)

    # Configure individual tiles
    var configured_count = 0
    if tile_config.size() > 0 and tileset.get_source_count() > 0:
        var atlas_source = tileset.get_source(source_id) as TileSetAtlasSource
        if atlas_source:
            for config in tile_config:
                var atlas_coords = config.get("atlasCoords", {"x": 0, "y": 0})
                var coords = Vector2i(int(atlas_coords.get("x", 0)), int(atlas_coords.get("y", 0)))

                if not atlas_source.has_tile(coords):
                    continue

                var tile_data = atlas_source.get_tile_data(coords, 0)
                if not tile_data:
                    continue

                # Configure collision
                var collision = config.get("collision", [])
                if collision.size() >= 3:
                    var polygon = PackedVector2Array()
                    for point in collision:
                        if point is Array and point.size() >= 2:
                            polygon.append(Vector2(point[0], point[1]))

                    if polygon.size() >= 3:
                        tile_data.set_collision_polygons_count(physics_layer, 1)
                        tile_data.set_collision_polygon_points(physics_layer, 0, polygon)

                # Configure navigation
                var navigation = config.get("navigation", [])
                if navigation.size() >= 3:
                    var nav_polygon = NavigationPolygon.new()
                    var outline = PackedVector2Array()
                    for point in navigation:
                        if point is Array and point.size() >= 2:
                            outline.append(Vector2(point[0], point[1]))

                    if outline.size() >= 3:
                        nav_polygon.add_outline(outline)
                        nav_polygon.make_polygons_from_outlines()
                        tile_data.set_navigation_polygon(navigation_layer, nav_polygon)

                # Configure terrain
                var terrain_set = config.get("terrainSet", -1)
                var terrain = config.get("terrain", -1)
                if terrain_set >= 0 and terrain >= 0:
                    tile_data.terrain_set = terrain_set
                    tile_data.terrain = terrain

                configured_count += 1

    # Save TileSet
    var save_result = ResourceSaver.save(tileset, full_tileset_path)
    if save_result != OK:
        log_error("Failed to save TileSet: " + str(save_result))
        quit(1)

    log_info("TileSet configured: " + tileset_path)

    var output = {
        "success": true,
        "tileset_path": tileset_path,
        "tile_size": tile_size,
        "configured_tiles": configured_count,
        "physics_layers": tileset.get_physics_layers_count(),
        "navigation_layers": tileset.get_navigation_layers_count()
    }

    print(JSON.stringify(output))
    log_info("configure_tileset operation completed successfully")

# =============================================================================
# Tier 1: Scene Inspection & Manipulation Operations
# =============================================================================
