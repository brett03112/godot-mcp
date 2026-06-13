extends RefCounted

const LegacyOperations = preload("legacy_operations.gd")
const AssetPipelineOps = preload("asset_pipeline_ops.gd")
const CameraOps = preload("camera_ops.gd")
const AudioPlayerOps = preload("audio_player_ops.gd")
const ShaderOps = preload("shader_ops.gd")
const DesignToSceneOps = preload("design_to_scene_ops.gd")
const GameplayOps = preload("gameplay_ops.gd")
const UiThemeOps = preload("ui_theme_ops.gd")
const NodeRefactorOps = preload("node_refactor_ops.gd")
const ResourceWorkflowOps = preload("resource_workflow_ops.gd")
const PhysicsOps = preload("physics_ops.gd")
const NavigationOps = preload("navigation_ops.gd")
const VisualQaOps = preload("visual_qa_ops.gd")
const SignalOps = preload("signal_ops.gd")
const AnimationOps = preload("animation_ops.gd")
const ScriptOps = preload("script_ops.gd")

var _context
var _handlers := {}
var _modules := []
var _legacy

func _init(context) -> void:
    _context = context
    _legacy = LegacyOperations.new()
    _legacy.setup(context)
    _modules.append(_legacy)
    _register_asset_pipeline()
    _register_camera()
    _register_audio_player()
    _register_shader()
    _register_design_to_scene()
    _register_gameplay()
    _register_ui_theme()
    _register_node_refactor()
    _register_resource_workflow()
    _register_physics()
    _register_navigation()
    _register_visual_qa()
    _register_signals()
    _register_animation()
    _register_scripts()

func dispatch(operation: String, params: Dictionary) -> bool:
    if _handlers.has(operation):
        var handler: Callable = _handlers[operation]
        handler.call(params)
        return true
    return _legacy.run(operation, params)

func registered_operations() -> Array:
    return _handlers.keys()

func _register_asset_pipeline() -> void:
    var asset_ops = AssetPipelineOps.new()
    asset_ops.setup(_context)
    _modules.append(asset_ops)
    _handlers["asset_batch_reimport"] = Callable(asset_ops, "asset_batch_reimport")

func _register_camera() -> void:
    var camera_ops = CameraOps.new()
    camera_ops.setup(_context, _legacy)
    _modules.append(camera_ops)
    for operation in [
        "camera_create",
        "camera_configure",
        "camera_setup_follow_2d",
        "camera_set_limits_2d",
        "camera_set_smoothing_2d",
        "camera_apply_preset",
        "camera_list",
        "camera_preview_bounds",
    ]:
        _handlers[operation] = Callable(camera_ops, operation)

func _register_audio_player() -> void:
    var audio_ops = AudioPlayerOps.new()
    audio_ops.setup(_context, _legacy)
    _modules.append(audio_ops)
    for operation in [
        "audio_player_create",
        "audio_player_set_stream",
        "audio_player_configure",
        "audio_player_play",
        "audio_player_stop",
        "audio_player_list",
        "audio_player_validate_routes",
    ]:
        _handlers[operation] = Callable(audio_ops, operation)

func _register_shader() -> void:
    var shader_ops = ShaderOps.new()
    shader_ops.setup(_context, _legacy)
    _modules.append(shader_ops)
    for operation in [
        "create_shader_material",
        "apply_material",
        "set_shader_parameter",
    ]:
        _handlers[operation] = Callable(shader_ops, operation)

func _register_design_to_scene() -> void:
    var design_ops = DesignToSceneOps.new()
    design_ops.setup(_context, _legacy)
    _modules.append(design_ops)
    for operation in [
        "design_generate_scene_from_brief",
        "design_generate_level_blockout",
        "design_generate_menu_flow",
        "design_generate_hud",
        "design_generate_dialogue_scene",
        "design_generate_settings_screen",
        "design_generate_mobile_controls",
        "design_generate_gameplay_prefab",
        "design_generate_enemy_archetype",
        "design_generate_pickup_archetype",
    ]:
        _handlers[operation] = Callable(design_ops, "_" + operation)

func _register_gameplay() -> void:
    var gameplay_ops = GameplayOps.new()
    gameplay_ops.setup(_context, _legacy)
    _modules.append(gameplay_ops)
    for operation in [
        "gameplay_create_state_machine",
        "gameplay_add_state",
        "gameplay_connect_state_transition",
        "gameplay_generate_character_controller",
        "gameplay_generate_interaction_system",
        "gameplay_generate_inventory_system",
        "gameplay_generate_dialogue_controller",
        "gameplay_generate_save_load_system",
        "gameplay_generate_settings_persistence",
    ]:
        _handlers[operation] = Callable(gameplay_ops, "_" + operation)

func _register_ui_theme() -> void:
    var ui_ops = UiThemeOps.new()
    ui_ops.setup(_context, _legacy)
    _modules.append(ui_ops)
    for operation in [
        "ui_create_layout",
        "ui_draw_recipe",
        "ui_set_control_anchor_preset",
        "ui_set_control_offsets",
        "ui_set_control_text",
        "ui_set_control_theme_override",
        "ui_create_theme",
        "ui_theme_set_color",
        "ui_theme_set_constant",
        "ui_theme_set_font_size",
        "ui_theme_set_stylebox_flat",
        "ui_apply_theme",
        "ui_inspect_layout",
        "ui_validate_safe_area",
    ]:
        _handlers[operation] = Callable(ui_ops, operation)

func _register_node_refactor() -> void:
    var node_ops = NodeRefactorOps.new()
    node_ops.setup(_context, _legacy)
    _modules.append(node_ops)
    for operation in [
        "node_find",
        "node_rename",
        "node_move",
        "node_add_to_group",
        "node_remove_from_group",
        "node_replace_type",
        "node_bulk_property_set",
        "scene_find_references",
        "scene_dependency_report",
    ]:
        _handlers[operation] = Callable(node_ops, operation)

func _register_resource_workflow() -> void:
    var resource_ops = ResourceWorkflowOps.new()
    resource_ops.setup(_context, _legacy)
    _modules.append(resource_ops)
    for operation in [
        "resource_create_gradient_texture",
        "resource_create_noise_texture",
        "resource_create_curve",
        "resource_set_curve_points",
        "resource_create_environment",
        "resource_create_physics_material",
        "resource_assign",
        "resource_autofit_physics_shape",
        "resource_convert_format",
    ]:
        _handlers[operation] = Callable(resource_ops, operation)

func _register_physics() -> void:
    var physics_ops = PhysicsOps.new()
    physics_ops.setup(_context, _legacy)
    _modules.append(physics_ops)
    for operation in [
        "configure_physics_material",
        "set_collision_config",
        "create_physics_body",
        "manage_collision_shape",
        "setup_joint",
    ]:
        _handlers[operation] = Callable(physics_ops, operation)

func _register_navigation() -> void:
    var navigation_ops = NavigationOps.new()
    navigation_ops.setup(_context, _legacy)
    _modules.append(navigation_ops)
    for operation in [
        "generate_navmesh",
        "add_navigation_agent",
        "add_navigation_link",
        "configure_navigation_obstacle",
        "create_astar_grid",
        "setup_navigation_server",
    ]:
        _handlers[operation] = Callable(navigation_ops, operation)

func _register_visual_qa() -> void:
    var visual_ops = VisualQaOps.new()
    visual_ops.setup(_context, _legacy)
    _modules.append(visual_ops)
    for operation in [
        "visual_sprite_bounds_check",
        "visual_camera_framing_check",
    ]:
        _handlers[operation] = Callable(visual_ops, operation)

func _register_signals() -> void:
    var signal_ops = SignalOps.new()
    signal_ops.setup(_context, _legacy)
    _modules.append(signal_ops)
    for operation in [
        "list_signals",
        "list_connections",
        "connect_signal",
        "disconnect_signal",
        "validate_connection",
    ]:
        _handlers[operation] = Callable(signal_ops, operation)

func _register_animation() -> void:
    var animation_ops = AnimationOps.new()
    animation_ops.setup(_context, _legacy)
    _modules.append(animation_ops)
    for operation in [
        "create_animation_player",
        "add_animation_track",
        "add_keyframe",
        "configure_animation_tree",
        "create_animation_library",
    ]:
        _handlers[operation] = Callable(animation_ops, operation)

func _register_scripts() -> void:
    var script_ops = ScriptOps.new()
    script_ops.setup(_context, _legacy)
    _modules.append(script_ops)
    for operation in [
        "analyze_script",
        "create_script",
        "modify_function",
        "add_export_variable",
        "extract_dependencies",
        "attach_script",
    ]:
        _handlers[operation] = Callable(script_ops, operation)
