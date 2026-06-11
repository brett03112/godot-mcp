extends RefCounted

var _context
var _legacy

func setup(context, legacy_operations) -> void:
    _context = context
    _legacy = legacy_operations

func camera_create(params: Dictionary) -> void:
    _legacy.camera_create(params)

func camera_configure(params: Dictionary) -> void:
    _legacy.camera_configure(params)

func camera_setup_follow_2d(params: Dictionary) -> void:
    _legacy.camera_setup_follow_2d(params)

func camera_set_limits_2d(params: Dictionary) -> void:
    _legacy.camera_set_limits_2d(params)

func camera_set_smoothing_2d(params: Dictionary) -> void:
    _legacy.camera_set_smoothing_2d(params)

func camera_apply_preset(params: Dictionary) -> void:
    _legacy.camera_apply_preset(params)

func camera_list(params: Dictionary) -> void:
    _legacy.camera_list(params)

func camera_preview_bounds(params: Dictionary) -> void:
    _legacy.camera_preview_bounds(params)
