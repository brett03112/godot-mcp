extends RefCounted

const LegacyOperations = preload("legacy_operations.gd")
const AssetPipelineOps = preload("asset_pipeline_ops.gd")
const CameraOps = preload("camera_ops.gd")

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
