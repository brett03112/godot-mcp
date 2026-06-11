extends RefCounted

var _context

func setup(context) -> void:
    _context = context

func asset_batch_reimport(params: Dictionary) -> void:
    _context.log_info("Starting asset_batch_reimport operation")
    var raw_paths = params.get("asset_paths", [])
    var asset_paths: Array = raw_paths if raw_paths is Array else []
    if asset_paths.is_empty():
        _context.log_error("asset_paths is required")
        return

    var selected := PackedStringArray()
    var missing: Array = []
    for raw_path in asset_paths:
        var res_path := _asset_pipeline_to_res_path(str(raw_path))
        selected.append(res_path)
        var absolute_path := ProjectSettings.globalize_path(res_path)
        if not FileAccess.file_exists(absolute_path):
            missing.append(res_path)

    var mode := "checked"
    var warnings: Array = []
    if Engine.is_editor_hint() and Engine.has_singleton("EditorInterface"):
        var editor_interface = Engine.get_singleton("EditorInterface")
        if editor_interface != null and editor_interface.has_method("get_resource_filesystem"):
            var filesystem = editor_interface.call("get_resource_filesystem")
            if filesystem != null and filesystem.has_method("reimport_files"):
                filesystem.call("reimport_files", selected)
                mode = "editor_filesystem"
            else:
                warnings.append("EditorInterface resource filesystem does not expose reimport_files.")
        else:
            warnings.append("EditorInterface singleton does not expose get_resource_filesystem.")
    else:
        warnings.append("EditorInterface singleton is unavailable in this Godot run; selected files were checked but not editor-reimported.")

    print(JSON.stringify({
        "success": true,
        "operation": "asset_batch_reimport",
        "mode": mode,
        "reimported": Array(selected),
        "count": selected.size(),
        "missing": missing,
        "warnings": warnings,
        "wait_for_completion": bool(params.get("wait_for_completion", true))
    }))
    _context.log_info("asset_batch_reimport completed successfully")

func _asset_pipeline_to_res_path(path: String) -> String:
    var normalized := path.replace("\\", "/")
    if normalized.begins_with("res://"):
        return normalized
    return "res://" + normalized.trim_prefix("/")
