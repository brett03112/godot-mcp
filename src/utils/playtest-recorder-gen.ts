/**
 * Playtest Recorder GDScript Generator (Tier 4 — Phase A)
 *
 * Generates the mcp_playtest_recorder.gd autoload script that:
 * - Finds the player node (configurable or auto-detected)
 * - Records position, velocity, state, and performance samples
 * - Detects events via signals, property watching, and conventions
 * - Optionally records input events
 * - Writes session data as JSON on exit/timeout
 */

export interface RecorderConfig {
  /** Output file path (Godot res:// path) */
  outputPath: string;
  /** Session ID */
  sessionId: string;
  /** Seconds between position/performance samples */
  sampleIntervalMs: number;
  /** Maximum duration in seconds (0 = unlimited for manual recording) */
  duration: number;
  /** Explicit player node path (e.g. "/root/Level/Player") */
  playerNodePath?: string;
  /** Whether to record input events */
  recordInputs: boolean;
  /** Map of signal names to event categories to connect on the player */
  eventHooks?: Record<string, string>;
  /** Session name for labeling */
  sessionName?: string;
  /** Scene being run (res:// path) */
  scenePath?: string;
}

/**
 * Generate the playtest recorder GDScript autoload
 */
export function generateRecorderScript(config: RecorderConfig): string {
  const sampleInterval = config.sampleIntervalMs / 1000;
  const eventHooksGd = config.eventHooks
    ? Object.entries(config.eventHooks)
        .map(([signal, category]) => `\t"${signal}": "${category}"`)
        .join(',\n')
    : '';

  return `extends Node
# MCP Playtest Recorder — auto-generated, do not edit
# Records player state, events, and performance data

var _output_path := "${config.outputPath.replace(/\\/g, '/')}"
var _session_id := "${config.sessionId}"
var _session_name := "${config.sessionName || ''}"
var _scene_path := "${config.scenePath || ''}"
var _sample_interval := ${sampleInterval.toFixed(3)}
var _max_duration := ${config.duration.toFixed(1)}
var _record_inputs := ${config.recordInputs}
var _player_node_path := "${config.playerNodePath || ''}"

var _player: Node = null
var _is_3d := false
var _elapsed := 0.0
var _sample_timer := 0.0
var _samples := []
var _events := []
var _inputs := []
var _start_time := ""
var _last_pos: Variant = null
var _total_distance := 0.0
var _last_hp: float = -1.0
var _total_damage := 0.0
var _visited_cells := {}
var _cell_size := 64.0

# Event hooks: signal_name -> event_category
var _event_hooks := {
${eventHooksGd}
}

func _ready() -> void:
\t_start_time = Time.get_datetime_string_from_system(true)
\tprint("[MCP Recorder] Session started: ", _session_id)
\t# Defer player detection to allow scene to initialize
\tcall_deferred("_find_player")

func _find_player() -> void:
\tif _player_node_path != "":
\t\t_player = get_node_or_null(_player_node_path)
\t\tif _player:
\t\t\tprint("[MCP Recorder] Player found at: ", _player_node_path)
\t\telse:
\t\t\tprint("[MCP Recorder] Player not found at: ", _player_node_path, " — trying auto-detect")

\tif not _player:
\t\t_player = _auto_detect_player()

\tif _player:
\t\t_is_3d = _player is Node3D
\t\t_connect_event_hooks()
\t\t_connect_convention_signals()
\t\t_detect_health_property()
\t\tprint("[MCP Recorder] Recording ", "3D" if _is_3d else "2D", " player: ", _player.name)
\telse:
\t\tprint("[MCP Recorder] No player found — recording performance data only")

func _auto_detect_player() -> Node:
\t# Strategy 1: Node named "Player" (case-insensitive search)
\tvar root := get_tree().current_scene
\tif not root:
\t\treturn null
\tvar candidate = _find_node_by_name(root, "player")
\tif candidate:
\t\treturn candidate
\t# Strategy 2: First CharacterBody2D or CharacterBody3D
\tcandidate = _find_node_by_class(root, "CharacterBody2D")
\tif not candidate:
\t\tcandidate = _find_node_by_class(root, "CharacterBody3D")
\treturn candidate

func _find_node_by_name(node: Node, target_lower: String) -> Node:
\tif node.name.to_lower() == target_lower:
\t\treturn node
\tfor child in node.get_children():
\t\tvar found = _find_node_by_name(child, target_lower)
\t\tif found:
\t\t\treturn found
\treturn null

func _find_node_by_class(node: Node, class_name_str: String) -> Node:
\tif node.get_class() == class_name_str:
\t\treturn node
\tfor child in node.get_children():
\t\tvar found = _find_node_by_class(child, class_name_str)
\t\tif found:
\t\t\treturn found
\treturn null

func _connect_event_hooks() -> void:
\tfor sig_name in _event_hooks:
\t\tif _player.has_signal(sig_name):
\t\t\t_player.connect(sig_name, _on_hooked_event.bind(sig_name, _event_hooks[sig_name]))
\t\t\tprint("[MCP Recorder] Connected hook: ", sig_name, " -> ", _event_hooks[sig_name])

func _connect_convention_signals() -> void:
\tif not _player:
\t\treturn
\t# Try common signal names
\tvar conventions := {
\t\t"died": "death",
\t\t"killed": "death",
\t\t"death": "death",
\t\t"health_changed": "health_changed",
\t\t"damage_taken": "damage",
\t\t"hurt": "damage",
\t\t"item_picked_up": "pickup",
\t\t"collected": "pickup",
\t\t"level_completed": "level_complete",
\t\t"checkpoint_reached": "checkpoint",
\t}
\tfor sig_name in conventions:
\t\tif sig_name in _event_hooks:
\t\t\tcontinue  # Already hooked by user config
\t\tif _player.has_signal(sig_name):
\t\t\t_player.connect(sig_name, _on_hooked_event.bind(sig_name, conventions[sig_name]))
\t\t\tprint("[MCP Recorder] Auto-connected convention signal: ", sig_name)

var _has_health := false
var _health_property := ""

func _detect_health_property() -> void:
\tif not _player:
\t\treturn
\tfor prop_name in ["health", "hp", "hit_points", "life"]:
\t\tif prop_name in _player:
\t\t\t_has_health = true
\t\t\t_health_property = prop_name
\t\t\t_last_hp = float(_player.get(prop_name))
\t\t\tprint("[MCP Recorder] Tracking health property: ", prop_name)
\t\t\tbreak

func _on_hooked_event(sig_name: String, category: String) -> void:
\tvar evt := {
\t\t"t": _elapsed,
\t\t"type": category,
\t\t"details": {"signal": sig_name},
\t}
\tif _player:
\t\tevt["pos"] = _get_player_pos_array()
\t_events.append(evt)

func _process(delta: float) -> void:
\t_elapsed += delta
\t_sample_timer += delta

\t# Check duration limit
\tif _max_duration > 0.0 and _elapsed >= _max_duration:
\t\t_write_results()
\t\tget_tree().quit()
\t\treturn

\t# Collect sample at interval
\tif _sample_timer >= _sample_interval:
\t\t_sample_timer = 0.0
\t\t_collect_sample()

\t# Watch health property for damage/death
\tif _has_health and _player and is_instance_valid(_player):
\t\tvar current_hp := float(_player.get(_health_property))
\t\tif current_hp < _last_hp:
\t\t\tvar dmg := _last_hp - current_hp
\t\t\t_total_damage += dmg
\t\t\t_events.append({
\t\t\t\t"t": _elapsed,
\t\t\t\t"type": "damage",
\t\t\t\t"pos": _get_player_pos_array(),
\t\t\t\t"details": {"amount": dmg, "hp_before": _last_hp, "hp_after": current_hp},
\t\t\t})
\t\t\tif current_hp <= 0.0 and _last_hp > 0.0:
\t\t\t\t_events.append({
\t\t\t\t\t"t": _elapsed,
\t\t\t\t\t"type": "death",
\t\t\t\t\t"pos": _get_player_pos_array(),
\t\t\t\t\t"details": {"cause": "health_depleted"},
\t\t\t\t})
\t\t_last_hp = current_hp

func _collect_sample() -> void:
\tvar sample := {
\t\t"t": round(_elapsed, 3),
\t\t"fps": Performance.get_monitor(Performance.TIME_FPS),
\t}

\tif _player and is_instance_valid(_player):
\t\tvar pos_arr = _get_player_pos_array()
\t\tsample["pos"] = pos_arr
\t\tsample["vel"] = _get_player_vel_array()

\t\t# Track distance
\t\tif _last_pos != null:
\t\t\tvar dx := pos_arr[0] - _last_pos[0]
\t\t\tvar dy := pos_arr[1] - _last_pos[1]
\t\t\tvar dist := sqrt(dx * dx + dy * dy)
\t\t\tif _is_3d and pos_arr.size() > 2 and _last_pos.size() > 2:
\t\t\t\tvar dz := pos_arr[2] - _last_pos[2]
\t\t\t\tdist = sqrt(dx * dx + dy * dy + dz * dz)
\t\t\t_total_distance += dist
\t\t_last_pos = pos_arr

\t\t# Track visited cells for area coverage
\t\tvar cell_key := str(int(pos_arr[0] / _cell_size)) + "," + str(int(pos_arr[1] / _cell_size))
\t\t_visited_cells[cell_key] = true

\t\t# Health
\t\tif _has_health:
\t\t\tsample["hp"] = float(_player.get(_health_property))

\t\t# State (check for "state" or "current_state" property)
\t\tfor state_prop in ["state", "current_state", "state_name"]:
\t\t\tif state_prop in _player:
\t\t\t\tvar state_val = _player.get(state_prop)
\t\t\t\tif state_val is String:
\t\t\t\t\tsample["state"] = state_val
\t\t\t\telif state_val is int:
\t\t\t\t\tsample["state"] = str(state_val)
\t\t\t\tbreak

\t_samples.append(sample)

func _get_player_pos_array() -> Array:
\tif not _player or not is_instance_valid(_player):
\t\treturn [0, 0]
\tif _is_3d:
\t\tvar pos = (_player as Node3D).global_position
\t\treturn [round(pos.x, 2), round(pos.y, 2), round(pos.z, 2)]
\telse:
\t\tvar pos = (_player as Node2D).global_position
\t\treturn [round(pos.x, 2), round(pos.y, 2)]

func _get_player_vel_array() -> Array:
\tif not _player or not is_instance_valid(_player):
\t\treturn [0, 0]
\tif _player is CharacterBody3D:
\t\tvar vel = (_player as CharacterBody3D).velocity
\t\treturn [round(vel.x, 2), round(vel.y, 2), round(vel.z, 2)]
\telif _player is CharacterBody2D:
\t\tvar vel = (_player as CharacterBody2D).velocity
\t\treturn [round(vel.x, 2), round(vel.y, 2)]
\treturn [0, 0] if not _is_3d else [0, 0, 0]

func round(value: float, decimals: int) -> float:
\tvar factor := pow(10.0, decimals)
\treturn roundf(value * factor) / factor

${config.recordInputs ? `
func _input(event: InputEvent) -> void:
\tif not _record_inputs:
\t\treturn
\tif event is InputEventAction:
\t\t_inputs.append({
\t\t\t"t": round(_elapsed, 3),
\t\t\t"action": event.action,
\t\t\t"pressed": event.pressed,
\t\t})
\telif event is InputEventKey:
\t\tvar key_event := event as InputEventKey
\t\tif key_event.pressed or not key_event.echo:
\t\t\t# Record mapped actions
\t\t\tvar actions := InputMap.get_actions()
\t\t\tfor action in actions:
\t\t\t\tif action.begins_with("ui_"):
\t\t\t\t\tcontinue
\t\t\t\tif InputMap.action_has_event(action, event):
\t\t\t\t\t_inputs.append({
\t\t\t\t\t\t"t": round(_elapsed, 3),
\t\t\t\t\t\t"action": action,
\t\t\t\t\t\t"pressed": key_event.pressed,
\t\t\t\t\t})
` : ''}

func _notification(what: int) -> void:
\tif what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_WM_GO_BACK_REQUESTED:
\t\t_write_results()

func _write_results() -> void:
\tvar end_time := Time.get_datetime_string_from_system(true)

\t# Build summary
\tvar death_count := 0
\tvar events_by_type := {}
\tfor evt in _events:
\t\tvar evt_type: String = evt["type"]
\t\tif evt_type == "death":
\t\t\tdeath_count += 1
\t\tif evt_type in events_by_type:
\t\t\tevents_by_type[evt_type] += 1
\t\telse:
\t\t\tevents_by_type[evt_type] = 1

\tvar fps_values := []
\tfor s in _samples:
\t\tfps_values.append(s.get("fps", 0.0))

\tvar avg_fps := 0.0
\tvar min_fps := 999.0
\tvar max_fps := 0.0
\tfor f in fps_values:
\t\tavg_fps += f
\t\tif f < min_fps:
\t\t\tmin_fps = f
\t\tif f > max_fps:
\t\t\tmax_fps = f
\tif fps_values.size() > 0:
\t\tavg_fps = avg_fps / fps_values.size()
\telse:
\t\tmin_fps = 0.0

\tvar session := {
\t\t"session_id": _session_id,
\t\t"session_name": _session_name,
\t\t"start_time": _start_time,
\t\t"end_time": end_time,
\t\t"duration_seconds": round(_elapsed, 2),
\t\t"scene": _scene_path,
\t\t"bot_type": null,
\t\t"player_node_path": _player_node_path if _player_node_path != "" else ("auto-detected" if _player else "none"),
\t\t"is_3d": _is_3d,
\t\t"metadata": {
\t\t\t"project_name": ProjectSettings.get_setting("application/config/name", "Unknown"),
\t\t\t"resolution": [
\t\t\t\tProjectSettings.get_setting("display/window/size/viewport_width", 1152),
\t\t\t\tProjectSettings.get_setting("display/window/size/viewport_height", 648),
\t\t\t],
\t\t},
\t\t"samples": _samples,
\t\t"events": _events,
\t\t"inputs": _inputs,
\t\t"summary": {
\t\t\t"total_deaths": death_count,
\t\t\t"total_damage_taken": round(_total_damage, 1),
\t\t\t"distance_traveled": round(_total_distance, 1),
\t\t\t"areas_visited": _visited_cells.size(),
\t\t\t"avg_fps": round(avg_fps, 1),
\t\t\t"min_fps": round(min_fps, 1),
\t\t\t"max_fps": round(max_fps, 1),
\t\t\t"events_by_type": events_by_type,
\t\t\t"total_inputs": _inputs.size(),
\t\t\t"duration_seconds": round(_elapsed, 2),
\t\t},
\t}

\t# Write to file
\tvar dir_path = _output_path.get_base_dir()
\tif not DirAccess.dir_exists_absolute(dir_path):
\t\tDirAccess.make_dir_recursive_absolute(dir_path)
\tvar file = FileAccess.open(_output_path, FileAccess.WRITE)
\tif file:
\t\tfile.store_string(JSON.stringify(session, "  "))
\t\tfile.close()
\t\tprint("[MCP Recorder] Session written to: ", _output_path)
\telse:
\t\tpush_error("[MCP Recorder] Failed to write session to: " + _output_path)
`;
}
