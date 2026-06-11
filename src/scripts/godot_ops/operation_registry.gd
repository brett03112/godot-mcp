extends RefCounted

const LegacyOperations = preload("legacy_operations.gd")
const AssetPipelineOps = preload("asset_pipeline_ops.gd")
const CameraOps = preload("camera_ops.gd")
const DesignToSceneOps = preload("design_to_scene_ops.gd")
const GameplayOps = preload("gameplay_ops.gd")

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
    _register_design_to_scene()
    _register_gameplay()

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
