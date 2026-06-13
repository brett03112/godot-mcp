# Phase 6.B final-pass audio bus operation module.
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


func configure_audio_bus(params: Dictionary) -> void:
    var output_path: String = params.get("output_path", "")
    var buses: Array = params.get("buses", [])

    if output_path.is_empty():
        log_error("output_path is required")
        return

    if buses.is_empty():
        log_error("At least one bus definition is required")
        return

    # Reset AudioServer to default (only Master bus)
    while AudioServer.bus_count > 1:
        AudioServer.remove_bus(AudioServer.bus_count - 1)

    # Configure Master bus (index 0) from first bus entry if named "Master"
    var bus_index_start := 0
    if buses.size() > 0 and buses[0].get("name", "") == "Master":
        var master_def: Dictionary = buses[0]
        if master_def.has("volume_db"):
            AudioServer.set_bus_volume_db(0, master_def["volume_db"])
        if master_def.has("mute"):
            AudioServer.set_bus_mute(0, master_def["mute"])
        if master_def.has("solo"):
            AudioServer.set_bus_solo(0, master_def["solo"])
        _add_bus_effects(0, master_def.get("effects", []))
        bus_index_start = 1

    # Add remaining buses
    for i in range(bus_index_start, buses.size()):
        var bus_def: Dictionary = buses[i]
        var bus_name: String = bus_def.get("name", "Bus" + str(i))
        var bus_idx = AudioServer.bus_count
        AudioServer.add_bus(bus_idx)
        AudioServer.set_bus_name(bus_idx, bus_name)

        if bus_def.has("volume_db"):
            AudioServer.set_bus_volume_db(bus_idx, bus_def["volume_db"])
        if bus_def.has("mute"):
            AudioServer.set_bus_mute(bus_idx, bus_def["mute"])
        if bus_def.has("solo"):
            AudioServer.set_bus_solo(bus_idx, bus_def["solo"])
        if bus_def.has("bypass_effects"):
            AudioServer.set_bus_bypass_effects(bus_idx, bus_def["bypass_effects"])

        # Route to send bus
        var send_to: String = bus_def.get("send_to", "Master")
        AudioServer.set_bus_send(bus_idx, send_to)

        # Add effects
        _add_bus_effects(bus_idx, bus_def.get("effects", []))

    # Generate and save the bus layout
    var layout: AudioBusLayout = AudioServer.generate_bus_layout()
    var save_result = ResourceSaver.save(layout, output_path)
    if save_result != OK:
        log_error("Failed to save AudioBusLayout: " + str(save_result))
        return

    var bus_summary := []
    for i in range(AudioServer.bus_count):
        var info := {
            "name": AudioServer.get_bus_name(i),
            "volume_db": AudioServer.get_bus_volume_db(i),
            "mute": AudioServer.is_bus_mute(i),
            "solo": AudioServer.is_bus_solo(i),
            "send": AudioServer.get_bus_send(i),
            "effect_count": AudioServer.get_bus_effect_count(i),
        }
        bus_summary.append(info)

    var result := {
        "success": true,
        "output_path": output_path,
        "bus_count": AudioServer.bus_count,
        "buses": bus_summary,
    }
    print(JSON.stringify(result))
    log_info("configure_audio_bus completed: " + str(AudioServer.bus_count) + " buses")

func _add_bus_effects(bus_idx: int, effects: Array) -> void:
    for effect_def in effects:
        var effect_type: String = effect_def.get("type", "")
        var effect: AudioEffect = null

        match effect_type.to_lower():
            "reverb":
                var fx = AudioEffectReverb.new()
                if effect_def.has("room_size"):
                    fx.room_size = effect_def["room_size"]
                if effect_def.has("damping"):
                    fx.damping = effect_def["damping"]
                if effect_def.has("spread"):
                    fx.spread = effect_def["spread"]
                if effect_def.has("dry"):
                    fx.dry = effect_def["dry"]
                if effect_def.has("wet"):
                    fx.wet = effect_def["wet"]
                effect = fx
            "compressor":
                var fx = AudioEffectCompressor.new()
                if effect_def.has("threshold"):
                    fx.threshold = effect_def["threshold"]
                if effect_def.has("ratio"):
                    fx.ratio = effect_def["ratio"]
                if effect_def.has("gain"):
                    fx.gain = effect_def["gain"]
                if effect_def.has("attack_us"):
                    fx.attack_us = effect_def["attack_us"]
                if effect_def.has("release_ms"):
                    fx.release_ms = effect_def["release_ms"]
                effect = fx
            "limiter":
                var fx = AudioEffectLimiter.new()
                if effect_def.has("threshold_db"):
                    fx.threshold_db = effect_def["threshold_db"]
                if effect_def.has("ceiling_db"):
                    fx.ceiling_db = effect_def["ceiling_db"]
                if effect_def.has("soft_clip_db"):
                    fx.soft_clip_db = effect_def["soft_clip_db"]
                if effect_def.has("soft_clip_ratio"):
                    fx.soft_clip_ratio = effect_def["soft_clip_ratio"]
                effect = fx
            "eq", "eq6", "eq10", "eq21":
                # Default to EQ6 for "eq"
                var band_count = 6
                if effect_type == "eq10":
                    band_count = 10
                elif effect_type == "eq21":
                    band_count = 21
                if band_count == 6:
                    effect = AudioEffectEQ6.new()
                elif band_count == 10:
                    effect = AudioEffectEQ10.new()
                else:
                    effect = AudioEffectEQ21.new()
            "delay":
                var fx = AudioEffectDelay.new()
                if effect_def.has("dry"):
                    fx.dry = effect_def["dry"]
                if effect_def.has("tap1_active"):
                    fx.tap1_active = effect_def["tap1_active"]
                if effect_def.has("tap1_delay_ms"):
                    fx.tap1_delay_ms = effect_def["tap1_delay_ms"]
                if effect_def.has("tap1_level_db"):
                    fx.tap1_level_db = effect_def["tap1_level_db"]
                if effect_def.has("feedback_active"):
                    fx.feedback_active = effect_def["feedback_active"]
                if effect_def.has("feedback_delay_ms"):
                    fx.feedback_delay_ms = effect_def["feedback_delay_ms"]
                if effect_def.has("feedback_level_db"):
                    fx.feedback_level_db = effect_def["feedback_level_db"]
                effect = fx
            "chorus":
                var fx = AudioEffectChorus.new()
                if effect_def.has("dry"):
                    fx.dry = effect_def["dry"]
                if effect_def.has("wet"):
                    fx.wet = effect_def["wet"]
                effect = fx
            "phaser":
                var fx = AudioEffectPhaser.new()
                if effect_def.has("range_min_hz"):
                    fx.range_min_hz = effect_def["range_min_hz"]
                if effect_def.has("range_max_hz"):
                    fx.range_max_hz = effect_def["range_max_hz"]
                if effect_def.has("rate_hz"):
                    fx.rate_hz = effect_def["rate_hz"]
                if effect_def.has("feedback"):
                    fx.feedback = effect_def["feedback"]
                if effect_def.has("depth"):
                    fx.depth = effect_def["depth"]
                effect = fx
            "distortion":
                var fx = AudioEffectDistortion.new()
                if effect_def.has("drive"):
                    fx.drive = effect_def["drive"]
                if effect_def.has("pre_gain"):
                    fx.pre_gain = effect_def["pre_gain"]
                if effect_def.has("post_gain"):
                    fx.post_gain = effect_def["post_gain"]
                if effect_def.has("keep_hf_hz"):
                    fx.keep_hf_hz = effect_def["keep_hf_hz"]
                effect = fx
            "lowpassfilter", "low_pass":
                var fx = AudioEffectLowPassFilter.new()
                if effect_def.has("cutoff_hz"):
                    fx.cutoff_hz = effect_def["cutoff_hz"]
                if effect_def.has("resonance"):
                    fx.resonance = effect_def["resonance"]
                if effect_def.has("db"):
                    fx.db = effect_def["db"]
                effect = fx
            "highpassfilter", "high_pass":
                var fx = AudioEffectHighPassFilter.new()
                if effect_def.has("cutoff_hz"):
                    fx.cutoff_hz = effect_def["cutoff_hz"]
                if effect_def.has("resonance"):
                    fx.resonance = effect_def["resonance"]
                if effect_def.has("db"):
                    fx.db = effect_def["db"]
                effect = fx
            "bandpassfilter", "band_pass":
                var fx = AudioEffectBandPassFilter.new()
                if effect_def.has("cutoff_hz"):
                    fx.cutoff_hz = effect_def["cutoff_hz"]
                if effect_def.has("resonance"):
                    fx.resonance = effect_def["resonance"]
                if effect_def.has("db"):
                    fx.db = effect_def["db"]
                effect = fx
            "amplify":
                var fx = AudioEffectAmplify.new()
                if effect_def.has("volume_db"):
                    fx.volume_db = effect_def["volume_db"]
                effect = fx
            "panner":
                var fx = AudioEffectPanner.new()
                if effect_def.has("pan"):
                    fx.pan = effect_def["pan"]
                effect = fx
            _:
                log_error("Unknown audio effect type: " + effect_type)
                continue

        if effect:
            AudioServer.add_bus_effect(bus_idx, effect)


# --- Tier 13: Networking & Multiplayer ---
