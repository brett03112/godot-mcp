extends RefCounted

var debug_mode := false

func _init(enable_debug := false) -> void:
    debug_mode = bool(enable_debug)

func parse_json_params(params_json: String):
    var json := JSON.new()
    var error := json.parse(params_json)
    if error != OK:
        log_error("Failed to parse JSON parameters: " + params_json)
        log_error("JSON Error: " + json.get_error_message() + " at line " + str(json.get_error_line()))
        return null
    var params = json.get_data()
    if typeof(params) != TYPE_DICTIONARY:
        log_error("Failed to parse JSON parameters: " + params_json)
        return null
    return params

func log_debug(message) -> void:
    if debug_mode:
        print("[DEBUG] " + str(message))

func log_info(message) -> void:
    print("[INFO] " + str(message))

func log_error(message) -> void:
    printerr("[ERROR] " + str(message))
