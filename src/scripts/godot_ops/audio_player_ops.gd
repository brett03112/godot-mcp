# Phase 6.B focused audio-player workflow operation module.
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

func _get_edit_parent(scene_root: Node, parent_path: String) -> Node:
    return _legacy.get_edit_parent(scene_root, parent_path)

func _make_unique_child_name(parent: Node, base_name: String) -> String:
    return _legacy.make_unique_child_name(parent, base_name)

func _has_property(obj: Object, property_name: String) -> bool:
    return _legacy.has_property(obj, property_name)

func _set_if_property(obj: Object, property_name: String, value) -> bool:
    return _legacy.call("_set_if_property", obj, property_name, value)

func _parse_vector2(value, fallback := Vector2.ZERO) -> Vector2:
    return _legacy.parse_vector2(value, fallback)

func _parse_vector3(value, fallback := Vector3.ZERO) -> Vector3:
    return _legacy.call("_parse_vector3", value, fallback)

func audio_player_create(params: Dictionary) -> void:
    log_info("Starting audio_player_create operation")
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

    var player_type = _audio_player_normalize_type(params.get("player_type", "plain"))
    var player = _audio_player_new(player_type)
    if player == null:
        scene_root.free()
        return
    player.name = _make_unique_child_name(parent, params.get("player_name", _audio_player_default_name(player_type)))
    parent.add_child(player)
    player.owner = scene_root

    if params.has("stream_path"):
        if not _audio_player_apply_stream(player, params.get("stream_path")):
            scene_root.free()
            return
    _audio_player_apply_config(player, params)

    var player_path = _audio_player_path(scene_root, player)
    var summary = _audio_player_summary(scene_root, player, true)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(scene_path)
    summary["parent_path"] = parent_path
    summary["player_path"] = player_path
    print(JSON.stringify(summary))
    log_info("audio_player_create completed successfully")

func audio_player_set_stream(params: Dictionary) -> void:
    log_info("Starting audio_player_set_stream operation")
    var loaded = _audio_player_load_scene_with_player(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var player = loaded["player"]
    if not _audio_player_apply_stream(player, params.get("stream_path", "")):
        scene_root.free()
        return
    var summary = _audio_player_summary(scene_root, player, true)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    print(JSON.stringify(summary))
    log_info("audio_player_set_stream completed successfully")

func audio_player_configure(params: Dictionary) -> void:
    log_info("Starting audio_player_configure operation")
    var loaded = _audio_player_load_scene_with_player(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var player = loaded["player"]
    _audio_player_apply_config(player, params)
    var summary = _audio_player_summary(scene_root, player, true)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    print(JSON.stringify(summary))
    log_info("audio_player_configure completed successfully")

func audio_player_play(params: Dictionary) -> void:
    log_info("Starting audio_player_play operation")
    var loaded = _audio_player_load_scene_with_player(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var player = loaded["player"]
    var from_position = float(params.get("from_position", 0.0))
    var playback_deferred = not player.is_inside_tree()
    if playback_deferred:
        _set_if_property(player, "autoplay", true)
    elif player.has_method("play"):
        player.call("play", from_position)
    else:
        _set_if_property(player, "playing", true)
    var summary = _audio_player_summary(scene_root, player, true)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    summary["from_position"] = from_position
    summary["playback_deferred"] = playback_deferred
    print(JSON.stringify(summary))
    log_info("audio_player_play completed successfully")

func audio_player_stop(params: Dictionary) -> void:
    log_info("Starting audio_player_stop operation")
    var loaded = _audio_player_load_scene_with_player(params)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var player = loaded["player"]
    if player.is_inside_tree() and player.has_method("stop"):
        player.call("stop")
    _set_if_property(player, "playing", false)
    _set_if_property(player, "autoplay", false)
    var summary = _audio_player_summary(scene_root, player, true)
    if not _save_scene_root(scene_root, loaded["full_scene_path"]):
        scene_root.free()
        return
    scene_root.free()
    summary["success"] = true
    summary["scene_path"] = _to_res_path(params.get("scene_path", ""))
    print(JSON.stringify(summary))
    log_info("audio_player_stop completed successfully")

func audio_player_list(params: Dictionary) -> void:
    log_info("Starting audio_player_list operation")
    var scene_path: String = params.get("scene_path", "")
    if scene_path.is_empty():
        log_error("scene_path is required")
        return
    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var players = []
    _audio_player_collect(scene_root, scene_root, players, bool(params.get("include_routes", true)))
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(scene_path),
        "count": players.size(),
        "players": players
    }))
    log_info("audio_player_list completed successfully")

func audio_player_validate_routes(params: Dictionary) -> void:
    log_info("Starting audio_player_validate_routes operation")
    var scene_path: String = params.get("scene_path", "")
    if scene_path.is_empty():
        log_error("scene_path is required")
        return
    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return
    var scene_root: Node = loaded["scene_root"]
    var players = []
    _audio_player_collect(scene_root, scene_root, players, true)
    var known_buses = _audio_player_known_buses(params.get("allowed_buses", []))
    var require_stream = bool(params.get("require_stream", true))
    var issues = []
    for player_info in players:
        var path = str(player_info.get("path", ""))
        var bus = str(player_info.get("bus", ""))
        if bus.is_empty():
            issues.append({
                "path": path,
                "code": "missing_bus",
                "message": "Audio player has no bus route"
            })
        elif not known_buses.has(bus):
            issues.append({
                "path": path,
                "code": "unknown_bus",
                "bus": bus,
                "message": "Audio player routes to unknown bus: " + bus
            })
        if require_stream and not bool(player_info.get("has_stream", false)):
            issues.append({
                "path": path,
                "code": "missing_stream",
                "message": "Audio player has no AudioStream assigned"
            })
    scene_root.free()
    print(JSON.stringify({
        "success": true,
        "scene_path": _to_res_path(scene_path),
        "valid": issues.is_empty(),
        "players_checked": players.size(),
        "allowed_buses": known_buses,
        "issues": issues,
        "players": players
    }))
    log_info("audio_player_validate_routes completed successfully")

func _audio_player_load_scene_with_player(params: Dictionary) -> Dictionary:
    var scene_path: String = params.get("scene_path", "")
    var player_path: String = params.get("player_path", "")
    if scene_path.is_empty() or player_path.is_empty():
        log_error("scene_path and player_path are required")
        return {}
    var loaded = _load_scene_for_edit(scene_path)
    if loaded.is_empty():
        return {}
    var scene_root: Node = loaded["scene_root"]
    var player = _get_edit_parent(scene_root, player_path)
    if player == null:
        log_error("Audio player node not found: " + player_path)
        scene_root.free()
        return {}
    if not _audio_player_is_player(player):
        log_error("Node is not an AudioStreamPlayer: " + player_path)
        scene_root.free()
        return {}
    loaded["player"] = player
    return loaded

func _audio_player_new(player_type: String) -> Node:
    match player_type:
        "2d":
            return AudioStreamPlayer2D.new()
        "3d":
            return AudioStreamPlayer3D.new()
        "plain":
            return AudioStreamPlayer.new()
        _:
            log_error("Unsupported audio player type: " + player_type)
            return null

func _audio_player_default_name(player_type: String) -> String:
    match player_type:
        "2d":
            return "AudioStreamPlayer2D"
        "3d":
            return "AudioStreamPlayer3D"
        _:
            return "AudioStreamPlayer"

func _audio_player_normalize_type(value) -> String:
    var text = str(value).to_lower()
    if text.find("3") >= 0:
        return "3d"
    if text.find("2") >= 0:
        return "2d"
    return "plain"

func _audio_player_is_player(node) -> bool:
    return node is AudioStreamPlayer or node is AudioStreamPlayer2D or node is AudioStreamPlayer3D

func _audio_player_apply_stream(player: Node, stream_path) -> bool:
    var path = str(stream_path)
    if path.is_empty():
        log_error("stream_path is required")
        return false
    var full_path = _to_res_path(path)
    var stream = ResourceLoader.load(full_path) as AudioStream
    if stream == null:
        log_error("Failed to load AudioStream: " + full_path)
        return false
    player.set("stream", stream)
    return true

func _audio_player_apply_config(player: Node, params: Dictionary) -> void:
    if params.has("bus"):
        _set_if_property(player, "bus", str(params.get("bus")))
    if params.has("autoplay"):
        _set_if_property(player, "autoplay", bool(params.get("autoplay")))
    if params.has("playing"):
        var requested_playing = bool(params.get("playing"))
        if requested_playing and not player.is_inside_tree():
            _set_if_property(player, "autoplay", true)
        else:
            _set_if_property(player, "playing", requested_playing)
    if params.has("volume_db"):
        _set_if_property(player, "volume_db", float(params.get("volume_db")))
    if params.has("pitch_scale"):
        _set_if_property(player, "pitch_scale", float(params.get("pitch_scale")))
    if params.has("max_polyphony"):
        _set_if_property(player, "max_polyphony", int(params.get("max_polyphony")))
    if params.has("position"):
        if player is Node3D:
            player.position = _parse_vector3(params.get("position"), Vector3.ZERO)
        elif player is Node2D:
            player.position = _parse_vector2(params.get("position"), Vector2.ZERO)
    if params.has("max_distance"):
        _set_if_property(player, "max_distance", float(params.get("max_distance")))
    if params.has("attenuation"):
        _set_if_property(player, "attenuation", float(params.get("attenuation")))
    if params.has("area_mask"):
        _set_if_property(player, "area_mask", int(params.get("area_mask")))
    if params.has("panning_strength"):
        _set_if_property(player, "panning_strength", float(params.get("panning_strength")))
    if params.has("max_db"):
        _set_if_property(player, "max_db", float(params.get("max_db")))
    if params.has("unit_size"):
        _set_if_property(player, "unit_size", float(params.get("unit_size")))

func _audio_player_collect(scene_root: Node, node: Node, players: Array, include_routes: bool) -> void:
    if _audio_player_is_player(node):
        players.append(_audio_player_summary(scene_root, node, include_routes))
    for child in node.get_children():
        if child is Node:
            _audio_player_collect(scene_root, child, players, include_routes)

func _audio_player_summary(scene_root: Node, player: Node, include_routes: bool) -> Dictionary:
    var path = _audio_player_path(scene_root, player)
    var stream = player.get("stream") if _has_property(player, "stream") else null
    var stream_path = ""
    if stream is Resource:
        stream_path = stream.resource_path
    var summary = {
        "path": path,
        "player_path": path,
        "name": player.name,
        "type": player.get_class(),
        "has_stream": stream != null,
        "stream_path": stream_path,
        "autoplay": bool(player.get("autoplay")) if _has_property(player, "autoplay") else false,
        "playing": bool(player.get("playing")) if _has_property(player, "playing") else false,
        "volume_db": float(player.get("volume_db")) if _has_property(player, "volume_db") else 0.0,
        "pitch_scale": float(player.get("pitch_scale")) if _has_property(player, "pitch_scale") else 1.0,
        "position": _audio_player_position_array(player)
    }
    if include_routes:
        summary["bus"] = str(player.get("bus")) if _has_property(player, "bus") else ""
    if _has_property(player, "max_distance"):
        summary["max_distance"] = float(player.get("max_distance"))
    if _has_property(player, "attenuation"):
        summary["attenuation"] = float(player.get("attenuation"))
    if _has_property(player, "area_mask"):
        summary["area_mask"] = int(player.get("area_mask"))
    if _has_property(player, "panning_strength"):
        summary["panning_strength"] = float(player.get("panning_strength"))
    if _has_property(player, "max_polyphony"):
        summary["max_polyphony"] = int(player.get("max_polyphony"))
    return summary

func _audio_player_path(scene_root: Node, player: Node) -> String:
    return "." if player == scene_root else str(scene_root.get_path_to(player))

func _audio_player_position_array(player: Node) -> Array:
    if player is Node3D:
        return [player.position.x, player.position.y, player.position.z]
    if player is Node2D:
        return [player.position.x, player.position.y]
    return []

func _audio_player_known_buses(allowed_buses) -> Array:
    var buses = []
    if allowed_buses is Array:
        for bus in allowed_buses:
            var bus_name = str(bus)
            if not bus_name.is_empty() and not buses.has(bus_name):
                buses.append(bus_name)
    for i in range(AudioServer.bus_count):
        var name = AudioServer.get_bus_name(i)
        if not buses.has(name):
            buses.append(name)
    return buses
