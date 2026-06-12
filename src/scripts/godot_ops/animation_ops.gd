# Phase 6.B focused animation operation module.
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

func quit(code := 0) -> void:
    if _legacy != null and _legacy.has_method("quit"):
        _legacy.quit(code)

func _to_res_path(path: String) -> String:
    return _legacy.to_res_path(path)

func _load_scene_for_animation(scene_path: String) -> Dictionary:
    return _legacy.load_scene_for_edit(scene_path)

func _save_animation_scene(scene_root: Node, full_scene_path: String) -> bool:
    return _legacy.save_scene_root(scene_root, full_scene_path)

func _animation_node_path(path: String) -> NodePath:
    var normalized_path := path
    if normalized_path.begins_with("root/"):
        normalized_path = normalized_path.substr(5)
    if normalized_path == "root":
        normalized_path = "."
    return NodePath(normalized_path)

func _get_animation_parent(scene_root: Node, parent_path: String) -> Node:
    if parent_path == "" or parent_path == "." or parent_path == "root":
        return scene_root
    return scene_root.get_node_or_null(_animation_node_path(parent_path))

func _get_animation_player(scene_root: Node, player_path: String) -> AnimationPlayer:
    var anim_player = scene_root.get_node_or_null(_animation_node_path(player_path))
    if anim_player == null:
        log_error("AnimationPlayer node not found: " + player_path)
        return null
    if not (anim_player is AnimationPlayer):
        log_error("Node is not an AnimationPlayer: " + player_path)
        return null
    return anim_player

func _get_default_animation_library(anim_player: AnimationPlayer) -> AnimationLibrary:
    if not anim_player.has_animation_library(""):
        return null
    return anim_player.get_animation_library("")

func _ensure_default_animation_library(anim_player: AnimationPlayer) -> AnimationLibrary:
    if anim_player.has_animation_library(""):
        return anim_player.get_animation_library("")
    var library := AnimationLibrary.new()
    anim_player.add_animation_library("", library)
    return library

func _free_scene_root(scene_root: Node) -> void:
    if scene_root != null:
        scene_root.free()

func create_animation_player(params: Dictionary) -> void:
    log_info("Creating AnimationPlayer in scene: " + str(params.get("scene_path", "")))
    var scene_path := str(params.get("scene_path", ""))
    if scene_path.is_empty():
        log_error("scene_path is required")
        quit(1)
        return

    var loaded := _load_scene_for_animation(scene_path)
    if loaded.is_empty():
        quit(1)
        return
    var full_scene_path: String = loaded["full_scene_path"]
    var scene_root: Node = loaded["scene_root"]

    var parent_path := str(params.get("parent_node_path", "root"))
    var parent := _get_animation_parent(scene_root, parent_path)
    if parent == null:
        log_error("Parent node not found: " + parent_path)
        _free_scene_root(scene_root)
        quit(1)
        return

    var animation_player_name := str(params.get("animation_player_name", "AnimationPlayer"))
    var animation_player := AnimationPlayer.new()
    animation_player.name = animation_player_name
    parent.add_child(animation_player)
    animation_player.owner = scene_root

    var created_animation := false
    var initial_animation_name = params.get("initial_animation_name", null)
    if initial_animation_name != null and not str(initial_animation_name).is_empty():
        var animation := Animation.new()
        animation.length = 1.0
        var library := _ensure_default_animation_library(animation_player)
        library.add_animation(StringName(str(initial_animation_name)), animation)
        created_animation = true

    if not _save_animation_scene(scene_root, full_scene_path):
        _free_scene_root(scene_root)
        quit(1)
        return

    _free_scene_root(scene_root)

    var output = {
        "scene_path": scene_path,
        "animation_player_name": animation_player_name,
        "parent_path": parent_path,
        "created_animation": created_animation
    }
    if created_animation:
        output["initial_animation_name"] = str(initial_animation_name)

    print(JSON.stringify(output))
    log_info("create_animation_player operation completed successfully")

func add_animation_track(params: Dictionary) -> void:
    log_info("Adding animation track to: " + str(params.get("animation_name", "")))
    var scene_path := str(params.get("scene_path", ""))
    if scene_path.is_empty():
        log_error("scene_path is required")
        quit(1)
        return

    var loaded := _load_scene_for_animation(scene_path)
    if loaded.is_empty():
        quit(1)
        return
    var full_scene_path: String = loaded["full_scene_path"]
    var scene_root: Node = loaded["scene_root"]

    var anim_player_path := str(params.get("animation_player_path", ""))
    var anim_player := _get_animation_player(scene_root, anim_player_path)
    if anim_player == null:
        _free_scene_root(scene_root)
        quit(1)
        return

    var animation_name := str(params.get("animation_name", ""))
    var library := _get_default_animation_library(anim_player)
    if library == null:
        log_error("AnimationPlayer has no default animation library")
        _free_scene_root(scene_root)
        quit(1)
        return
    if not library.has_animation(animation_name):
        log_error("Animation not found: " + animation_name)
        _free_scene_root(scene_root)
        quit(1)
        return

    var animation := library.get_animation(animation_name)
    var track_type := str(params.get("track_type", ""))
    var target_node_path := str(params.get("target_node_path", ""))
    var track_index := -1

    match track_type:
        "position":
            track_index = animation.add_track(Animation.TYPE_POSITION_3D)
            animation.track_set_path(track_index, NodePath(target_node_path + ":position"))
        "rotation":
            track_index = animation.add_track(Animation.TYPE_ROTATION_3D)
            animation.track_set_path(track_index, NodePath(target_node_path + ":rotation"))
        "scale":
            track_index = animation.add_track(Animation.TYPE_SCALE_3D)
            animation.track_set_path(track_index, NodePath(target_node_path + ":scale"))
        "property":
            track_index = animation.add_track(Animation.TYPE_VALUE)
            var property_path := str(params.get("property_path", "modulate"))
            animation.track_set_path(track_index, NodePath(target_node_path + ":" + property_path))
        "method":
            track_index = animation.add_track(Animation.TYPE_METHOD)
            animation.track_set_path(track_index, NodePath(target_node_path))
        "audio":
            track_index = animation.add_track(Animation.TYPE_AUDIO)
            animation.track_set_path(track_index, NodePath(target_node_path))
        _:
            log_error("Unknown track type: " + track_type)
            _free_scene_root(scene_root)
            quit(1)
            return

    if track_index < 0:
        log_error("Failed to add track")
        _free_scene_root(scene_root)
        quit(1)
        return

    if not _save_animation_scene(scene_root, full_scene_path):
        _free_scene_root(scene_root)
        quit(1)
        return

    _free_scene_root(scene_root)

    print(JSON.stringify({
        "scene_path": scene_path,
        "animation_player_path": anim_player_path,
        "animation_name": animation_name,
        "track_type": track_type,
        "track_index": track_index,
        "target_node_path": target_node_path
    }))
    log_info("add_animation_track operation completed successfully")

func add_keyframe(params: Dictionary) -> void:
    log_info("Adding keyframe to animation: " + str(params.get("animation_name", "")))
    var scene_path := str(params.get("scene_path", ""))
    if scene_path.is_empty():
        log_error("scene_path is required")
        quit(1)
        return

    var loaded := _load_scene_for_animation(scene_path)
    if loaded.is_empty():
        quit(1)
        return
    var full_scene_path: String = loaded["full_scene_path"]
    var scene_root: Node = loaded["scene_root"]

    var anim_player_path := str(params.get("animation_player_path", ""))
    var anim_player := _get_animation_player(scene_root, anim_player_path)
    if anim_player == null:
        _free_scene_root(scene_root)
        quit(1)
        return

    var animation_name := str(params.get("animation_name", ""))
    var library := _get_default_animation_library(anim_player)
    if library == null:
        log_error("AnimationPlayer has no default animation library")
        _free_scene_root(scene_root)
        quit(1)
        return
    if not library.has_animation(animation_name):
        log_error("Animation not found: " + animation_name)
        _free_scene_root(scene_root)
        quit(1)
        return

    var animation := library.get_animation(animation_name)
    var track_index := int(params.get("track_index", -1))
    if track_index < 0 or track_index >= animation.get_track_count():
        log_error("Invalid track index: " + str(track_index) + " (animation has " + str(animation.get_track_count()) + " tracks)")
        _free_scene_root(scene_root)
        quit(1)
        return

    var time := float(params.get("time", 0.0))
    var value = params.get("value", null)
    var easing := float(params.get("easing", 1.0))
    var track_type := animation.track_get_type(track_index)

    if track_type == Animation.TYPE_VALUE:
        var key_index := animation.track_insert_key(track_index, time, value)
        animation.track_set_key_transition(track_index, key_index, easing)
    elif track_type == Animation.TYPE_POSITION_3D or track_type == Animation.TYPE_ROTATION_3D or track_type == Animation.TYPE_SCALE_3D:
        var vector_value = value
        if value is Array and value.size() >= 3:
            vector_value = Vector3(value[0], value[1], value[2])
        elif value is Array and value.size() == 2:
            var z_default := 1.0 if track_type == Animation.TYPE_SCALE_3D else 0.0
            vector_value = Vector3(value[0], value[1], z_default)
        var key_index := animation.track_insert_key(track_index, time, vector_value)
        animation.track_set_key_transition(track_index, key_index, easing)
    elif track_type == Animation.TYPE_METHOD:
        var method_name = value
        var args_array := []
        if value is Dictionary:
            method_name = value.get("method", "")
            args_array = value.get("args", [])
        animation.track_insert_key(track_index, time, {"method": method_name, "args": args_array})
    elif track_type == Animation.TYPE_AUDIO:
        var stream = null
        if value is String and ResourceLoader.exists(value):
            stream = load(value)
        animation.track_insert_key(track_index, time, stream)
    else:
        log_error("Unsupported track type: " + str(track_type))
        _free_scene_root(scene_root)
        quit(1)
        return

    if not _save_animation_scene(scene_root, full_scene_path):
        _free_scene_root(scene_root)
        quit(1)
        return

    _free_scene_root(scene_root)

    print(JSON.stringify({
        "scene_path": scene_path,
        "animation_player_path": anim_player_path,
        "animation_name": animation_name,
        "track_index": track_index,
        "time": time,
        "value": value,
        "easing": easing
    }))
    log_info("add_keyframe operation completed successfully")

func configure_animation_tree(params: Dictionary) -> void:
    log_info("Starting configure_animation_tree operation")
    var scene_path := str(params.get("scene_path", ""))
    var anim_player_path := str(params.get("animation_player_path", ""))
    if scene_path.is_empty() or anim_player_path.is_empty():
        log_error("scene_path and animation_player_path are required")
        quit(1)
        return

    var loaded := _load_scene_for_animation(scene_path)
    if loaded.is_empty():
        quit(1)
        return
    var full_scene_path: String = loaded["full_scene_path"]
    var scene_root: Node = loaded["scene_root"]

    var parent_node_path := str(params.get("parent_node_path", "."))
    var parent_node := _get_animation_parent(scene_root, parent_node_path)
    if parent_node == null:
        log_error("Parent node not found: " + parent_node_path)
        _free_scene_root(scene_root)
        quit(1)
        return

    var root_type := str(params.get("root_type", "state_machine"))
    var node_name := str(params.get("node_name", "AnimationTree"))
    var active := bool(params.get("active", true))
    var states: Array = params.get("states", [])
    var transitions: Array = params.get("transitions", [])
    var blend_points: Array = params.get("blend_points", [])
    var blend_mode_str := str(params.get("blend_mode", "interpolated"))

    var anim_tree := AnimationTree.new()
    anim_tree.name = node_name
    anim_tree.active = active
    anim_tree.anim_player = NodePath(anim_player_path)

    match root_type:
        "state_machine":
            anim_tree.tree_root = _build_animation_state_machine(states, transitions)
        "blend_space_1d":
            anim_tree.tree_root = _build_animation_blend_space_1d(blend_points, blend_mode_str)
        "blend_space_2d":
            anim_tree.tree_root = _build_animation_blend_space_2d(blend_points, blend_mode_str)
        "blend_tree":
            anim_tree.tree_root = AnimationNodeBlendTree.new()
        _:
            log_error("Unknown animation tree root type: " + root_type)
            _free_scene_root(scene_root)
            quit(1)
            return

    parent_node.add_child(anim_tree)
    anim_tree.owner = scene_root

    if not _save_animation_scene(scene_root, full_scene_path):
        _free_scene_root(scene_root)
        quit(1)
        return

    _free_scene_root(scene_root)

    print(JSON.stringify({
        "success": true,
        "scene_path": scene_path,
        "animation_tree": node_name,
        "root_type": root_type,
        "states_count": states.size(),
        "transitions_count": transitions.size(),
        "blend_points_count": blend_points.size()
    }))
    log_info("configure_animation_tree completed successfully")

func create_animation_library(params: Dictionary) -> void:
    log_info("Starting create_animation_library operation")
    var library_name := str(params.get("library_name", ""))
    var output_dir := str(params.get("output_dir", "animations"))
    var animations_data: Array = params.get("animations", [])

    if library_name.is_empty():
        log_error("library_name is required")
        quit(1)
        return
    if animations_data.is_empty():
        log_error("animations array must not be empty")
        quit(1)
        return

    var clean_output_dir := output_dir
    if clean_output_dir.begins_with("res://"):
        clean_output_dir = clean_output_dir.substr(6)
    clean_output_dir = clean_output_dir.trim_prefix("/")

    var dir := DirAccess.open("res://")
    if dir != null and not dir.dir_exists(clean_output_dir):
        dir.make_dir_recursive(clean_output_dir)

    var library := AnimationLibrary.new()
    for anim_def in animations_data:
        var anim_name := str(anim_def.get("name", ""))
        if anim_name.is_empty():
            continue
        var anim := _build_animation_resource(anim_def)
        library.add_animation(StringName(anim_name), anim)
        log_info("Added animation: " + anim_name + " (length: " + str(anim.length) + "s, tracks: " + str(anim_def.get("tracks", []).size()) + ")")

    var save_path := "res://" + clean_output_dir.path_join(library_name + ".tres")
    var err := ResourceSaver.save(library, save_path)
    if err != OK:
        log_error("Failed to save animation library: " + str(err))
        quit(1)
        return

    print(JSON.stringify({
        "success": true,
        "library_path": clean_output_dir.path_join(library_name + ".tres"),
        "animation_count": animations_data.size()
    }))
    log_info("create_animation_library completed successfully")

func _build_animation_state_machine(states: Array, transitions: Array) -> AnimationNodeStateMachine:
    var state_machine := AnimationNodeStateMachine.new()
    for state_def in states:
        var state_name := str(state_def.get("name", ""))
        var anim_name := str(state_def.get("animation", ""))
        if state_name.is_empty():
            continue
        var anim_node := AnimationNodeAnimation.new()
        anim_node.animation = StringName(anim_name)
        state_machine.add_node(StringName(state_name), anim_node)
        var pos = state_def.get("position", null)
        if pos is Array and pos.size() >= 2:
            state_machine.set_node_position(StringName(state_name), Vector2(pos[0], pos[1]))

    for trans_def in transitions:
        var from_state := str(trans_def.get("from", ""))
        var to_state := str(trans_def.get("to", ""))
        if from_state.is_empty() or to_state.is_empty():
            continue
        var transition := AnimationNodeStateMachineTransition.new()
        if bool(trans_def.get("auto_advance", false)):
            transition.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO
        var advance_cond := str(trans_def.get("advance_condition", ""))
        if not advance_cond.is_empty():
            transition.advance_condition = StringName(advance_cond)
        match str(trans_def.get("switch_mode", "immediate")):
            "sync":
                transition.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_SYNC
            "at_end":
                transition.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END
            _:
                transition.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
        transition.xfade_time = float(trans_def.get("xfade_time", 0.0))
        state_machine.add_transition(StringName(from_state), StringName(to_state), transition)
    return state_machine

func _build_animation_blend_space_1d(blend_points: Array, blend_mode_str: String) -> AnimationNodeBlendSpace1D:
    var blend_space := AnimationNodeBlendSpace1D.new()
    for bp in blend_points:
        var anim_node := AnimationNodeAnimation.new()
        anim_node.animation = StringName(str(bp.get("animation", "")))
        blend_space.add_blend_point(anim_node, float(bp.get("position", 0.0)))
    match blend_mode_str:
        "discrete":
            blend_space.blend_mode = AnimationNodeBlendSpace1D.BLEND_MODE_DISCRETE
        "carry":
            blend_space.blend_mode = AnimationNodeBlendSpace1D.BLEND_MODE_DISCRETE_CARRY
        _:
            blend_space.blend_mode = AnimationNodeBlendSpace1D.BLEND_MODE_INTERPOLATED
    return blend_space

func _build_animation_blend_space_2d(blend_points: Array, blend_mode_str: String) -> AnimationNodeBlendSpace2D:
    var blend_space := AnimationNodeBlendSpace2D.new()
    for bp in blend_points:
        var anim_node := AnimationNodeAnimation.new()
        anim_node.animation = StringName(str(bp.get("animation", "")))
        var pos = bp.get("position", [0.0, 0.0])
        var pos_vec := Vector2.ZERO
        if pos is Array and pos.size() >= 2:
            pos_vec = Vector2(pos[0], pos[1])
        blend_space.add_blend_point(anim_node, pos_vec)
    match blend_mode_str:
        "discrete":
            blend_space.blend_mode = AnimationNodeBlendSpace2D.BLEND_MODE_DISCRETE
        "carry":
            blend_space.blend_mode = AnimationNodeBlendSpace2D.BLEND_MODE_DISCRETE_CARRY
        _:
            blend_space.blend_mode = AnimationNodeBlendSpace2D.BLEND_MODE_INTERPOLATED
    return blend_space

func _build_animation_resource(anim_def: Dictionary) -> Animation:
    var anim := Animation.new()
    anim.length = float(anim_def.get("length", 1.0))
    match str(anim_def.get("loop_mode", "none")):
        "linear":
            anim.loop_mode = Animation.LOOP_LINEAR
        "pingpong":
            anim.loop_mode = Animation.LOOP_PINGPONG
        _:
            anim.loop_mode = Animation.LOOP_NONE

    var tracks: Array = anim_def.get("tracks", [])
    for track_def in tracks:
        _add_animation_library_track(anim, track_def)
    return anim

func _add_animation_library_track(anim: Animation, track_def: Dictionary) -> void:
    var track_type := Animation.TYPE_VALUE
    var track_path := str(track_def.get("node_path", ""))
    var property := str(track_def.get("property", ""))

    match str(track_def.get("type", "property")):
        "position":
            track_type = Animation.TYPE_POSITION_3D
        "rotation":
            track_type = Animation.TYPE_ROTATION_3D
        "scale":
            track_type = Animation.TYPE_SCALE_3D
        "property":
            track_type = Animation.TYPE_VALUE
            if not property.is_empty():
                track_path += ":" + property
        "method":
            track_type = Animation.TYPE_METHOD
        "audio":
            track_type = Animation.TYPE_AUDIO

    var track_idx := anim.add_track(track_type)
    anim.track_set_path(track_idx, NodePath(track_path))

    var keyframes: Array = track_def.get("keyframes", [])
    for kf in keyframes:
        _insert_animation_library_key(anim, track_idx, track_type, kf)

func _insert_animation_library_key(anim: Animation, track_idx: int, track_type: int, kf: Dictionary) -> void:
    var time := float(kf.get("time", 0.0))
    var value = kf.get("value", null)

    if track_type == Animation.TYPE_POSITION_3D or track_type == Animation.TYPE_SCALE_3D:
        if value is Array and value.size() >= 3:
            value = Vector3(value[0], value[1], value[2])
    elif track_type == Animation.TYPE_ROTATION_3D:
        if value is Array and value.size() >= 4:
            value = Quaternion(value[0], value[1], value[2], value[3])

    if track_type == Animation.TYPE_METHOD:
        var method_args: Array = kf.get("args", [])
        anim.track_insert_key(track_idx, time, {"method": value, "args": method_args})
    else:
        anim.track_insert_key(track_idx, time, value)

    var easing := float(kf.get("easing", 1.0))
    if easing != 1.0:
        var key_idx := anim.track_find_key(track_idx, time, Animation.FIND_MODE_APPROX)
        if key_idx >= 0:
            anim.track_set_key_transition(track_idx, key_idx, easing)
