# Phase 6.B focused script operation module.
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

# Analyze script operation - Parse GDScript and extract structure
func analyze_script(params):
    log_info("Starting analyze_script operation")

    # Validate required parameters
    if not params.has("scriptPath"):
        log_error("scriptPath parameter is required")
        quit(1)
        return

    var script_path = params["scriptPath"]
    log_debug("Script path: " + script_path)

    # Check if file exists
    if not FileAccess.file_exists(script_path):
        log_error("Script file not found: " + script_path)
        quit(1)
        return

    # Read the script file
    var file = FileAccess.open(script_path, FileAccess.READ)
    if file == null:
        log_error("Failed to open script file: " + script_path)
        quit(1)
        return

    var lines = []
    while not file.eof_reached():
        lines.append(file.get_line())
    file.close()

    log_debug("Read " + str(lines.size()) + " lines from script")

    # Initialize analysis results
    var script_class_name = ""
    var script_extends = ""
    var functions = []
    var signals = []
    var export_vars = []
    var constants = []
    var enums = []
    var variables = []
    var preloads = []

    # Parse the script line by line
    var line_num = 0
    var in_multiline_comment = false

    for line in lines:
        line_num += 1
        var trimmed = line.strip_edges()

        # Skip empty lines and comments
        if trimmed.is_empty():
            continue

        # Handle multiline comments
        if trimmed.begins_with('"""') or trimmed.begins_with("'''"):
            if in_multiline_comment:
                in_multiline_comment = false
            else:
                in_multiline_comment = true
            continue

        if in_multiline_comment:
            continue

        # Skip single-line comments
        if trimmed.begins_with("#"):
            continue

        # Extract class_name
        if trimmed.begins_with("class_name "):
            script_class_name = trimmed.replace("class_name ", "").strip_edges()
            log_debug("Found class_name: " + script_class_name)

        # Extract extends
        elif trimmed.begins_with("extends "):
            script_extends = trimmed.replace("extends ", "").strip_edges()
            log_debug("Found extends: " + script_extends)

        # Extract signals
        elif trimmed.begins_with("signal "):
            var signal_def = trimmed.replace("signal ", "").strip_edges()
            var signal_name = signal_def
            var signal_params = []

            # Check if signal has parameters
            if "(" in signal_def:
                var paren_pos = signal_def.find("(")
                signal_name = signal_def.substr(0, paren_pos).strip_edges()
                var params_str = signal_def.substr(paren_pos + 1, signal_def.find(")") - paren_pos - 1)

                if not params_str.is_empty():
                    var params_list = params_str.split(",")
                    for param in params_list:
                        var param_trimmed = param.strip_edges()
                        if not param_trimmed.is_empty():
                            signal_params.append(param_trimmed)

            signals.append({
                "name": signal_name,
                "parameters": signal_params,
                "line": line_num
            })
            log_debug("Found signal: " + signal_name)

        # Extract constants
        elif trimmed.begins_with("const "):
            var const_def = trimmed.replace("const ", "").strip_edges()
            var const_name = ""
            var const_value = ""

            if "=" in const_def:
                var parts = const_def.split("=", false, 1)
                const_name = parts[0].strip_edges()
                if parts.size() > 1:
                    const_value = parts[1].strip_edges()
            else:
                const_name = const_def

            # Remove type hints
            if ":" in const_name:
                const_name = const_name.split(":")[0].strip_edges()

            constants.append({
                "name": const_name,
                "value": const_value,
                "line": line_num
            })
            log_debug("Found constant: " + const_name)

        # Extract enums
        elif trimmed.begins_with("enum "):
            var enum_def = trimmed.replace("enum ", "").strip_edges()
            var enum_name = ""

            if "{" in enum_def:
                enum_name = enum_def.substr(0, enum_def.find("{")).strip_edges()
            else:
                enum_name = enum_def

            enums.append({
                "name": enum_name,
                "line": line_num
            })
            log_debug("Found enum: " + enum_name)

        # Extract @export variables
        elif trimmed.begins_with("@export"):
            var export_line = trimmed
            var var_name = ""
            var var_type = ""

            # Check if there's a variable declaration on the same line or next line
            if "var " in export_line:
                var var_part = export_line.substr(export_line.find("var ") + 4).strip_edges()
                if ":" in var_part:
                    var parts = var_part.split(":")
                    var_name = parts[0].strip_edges()
                    if parts.size() > 1:
                        var_type = parts[1].split("=")[0].strip_edges()
                elif "=" in var_part:
                    var_name = var_part.split("=")[0].strip_edges()
                else:
                    var_name = var_part

                export_vars.append({
                    "name": var_name,
                    "type": var_type,
                    "export": trimmed.substr(0, trimmed.find("var")).strip_edges(),
                    "line": line_num
                })
                log_debug("Found export variable: " + var_name)

        # Extract regular variables
        elif trimmed.begins_with("var "):
            var var_def = trimmed.replace("var ", "").strip_edges()
            var var_name = ""
            var var_type = ""

            if ":" in var_def:
                var parts = var_def.split(":")
                var_name = parts[0].strip_edges()
                if parts.size() > 1:
                    var_type = parts[1].split("=")[0].strip_edges()
            elif "=" in var_def:
                var_name = var_def.split("=")[0].strip_edges()
            else:
                var_name = var_def

            variables.append({
                "name": var_name,
                "type": var_type,
                "line": line_num
            })
            log_debug("Found variable: " + var_name)

        # Extract preloads
        elif "preload(" in trimmed:
            var preload_start = trimmed.find("preload(")
            var preload_str = trimmed.substr(preload_start)
            if ")" in preload_str:
                var path_str = preload_str.substr(8, preload_str.find(")") - 8).strip_edges()
                path_str = path_str.replace('"', '').replace("'", '')
                preloads.append({
                    "path": path_str,
                    "line": line_num
                })
                log_debug("Found preload: " + path_str)

        # Extract functions
        elif trimmed.begins_with("func "):
            var func_def = trimmed.replace("func ", "").strip_edges()
            var func_name = ""
            var func_params = []
            var return_type = ""

            # Extract function name
            if "(" in func_def:
                func_name = func_def.substr(0, func_def.find("(")).strip_edges()

                # Extract parameters
                var paren_start = func_def.find("(")
                var paren_end = func_def.find(")")
                if paren_end > paren_start:
                    var params_str = func_def.substr(paren_start + 1, paren_end - paren_start - 1)

                    if not params_str.is_empty():
                        var params_list = params_str.split(",")
                        for param in params_list:
                            var param_trimmed = param.strip_edges()
                            if not param_trimmed.is_empty():
                                func_params.append(param_trimmed)

                # Extract return type
                if "->" in func_def:
                    var arrow_pos = func_def.find("->")
                    var colon_pos = func_def.find(":")
                    if colon_pos > arrow_pos:
                        return_type = func_def.substr(arrow_pos + 2, colon_pos - arrow_pos - 2).strip_edges()
                    else:
                        return_type = func_def.substr(arrow_pos + 2).strip_edges().replace(":", "").strip_edges()
            else:
                func_name = func_def.replace(":", "").strip_edges()

            functions.append({
                "name": func_name,
                "parameters": func_params,
                "return_type": return_type,
                "line": line_num
            })
            log_debug("Found function: " + func_name + " at line " + str(line_num))

    # Build the result
    var result = {
        "script_path": script_path,
        "class_name": script_class_name,
        "extends": script_extends,
        "functions": functions,
        "signals": signals,
        "export_variables": export_vars,
        "constants": constants,
        "enums": enums,
        "variables": variables,
        "preloads": preloads,
        "total_lines": lines.size()
    }

    # Output the result as JSON
    print(JSON.stringify(result))
    log_info("analyze_script operation completed successfully")

# Create script operation - Generate GDScript from templates
func create_script(params):
    log_info("Starting create_script operation")

    # Validate required parameters
    if not params.has("scriptPath"):
        log_error("scriptPath parameter is required")
        quit(1)
        return

    if not params.has("extends"):
        log_error("extends parameter is required")
        quit(1)
        return

    if not params.has("template"):
        log_error("template parameter is required")
        quit(1)
        return

    var script_path = params["scriptPath"]
    var extends_class = params["extends"]
    var template_name = params["template"]
    var class_name_param = params.get("className", "")

    log_debug("Script path: " + script_path)
    log_debug("Extends: " + extends_class)
    log_debug("Template: " + template_name)

    # Generate script content based on template
    var script_content = ""

    match template_name:
        "basic":
            script_content = generate_basic_template(class_name_param, extends_class)
        "state_machine":
            script_content = generate_state_machine_template(class_name_param, extends_class)
        "singleton":
            script_content = generate_singleton_template(class_name_param, extends_class)
        "component":
            script_content = generate_component_template(class_name_param, extends_class)
        "character_controller":
            script_content = generate_character_controller_template(class_name_param, extends_class)
        _:
            log_error("Unknown template: " + template_name)
            quit(1)
            return

    # Write the script file
    var file = FileAccess.open(script_path, FileAccess.WRITE)
    if file == null:
        log_error("Failed to create script file: " + script_path)
        quit(1)
        return

    file.store_string(script_content)
    file.close()

    log_info("Script file created successfully at: " + script_path)

    # Build result
    var result = {
        "script_path": script_path,
        "template": template_name,
        "extends": extends_class,
        "class_name": class_name_param,
        "lines": script_content.split("\n").size()
    }

    # Output the result as JSON
    print(JSON.stringify(result))
    log_info("create_script operation completed successfully")

# Template: Basic script
func generate_basic_template(class_name_val: String, extends_class: String) -> String:
    var content = ""
    if class_name_val != "":
        content += "class_name " + class_name_val + "\n"
    content += "extends " + extends_class + "\n\n"
    content += "# Called when the node enters the scene tree for the first time.\n"
    content += "func _ready() -> void:\n"
    content += "\tpass\n\n"
    content += "# Called every frame. 'delta' is the elapsed time since the previous frame.\n"
    content += "func _process(delta: float) -> void:\n"
    content += "\tpass\n"
    return content

# Template: State machine pattern
func generate_state_machine_template(class_name_val: String, extends_class: String) -> String:
    var content = ""
    if class_name_val != "":
        content += "class_name " + class_name_val + "\n"
    content += "extends " + extends_class + "\n\n"
    content += "enum State {\n"
    content += "\tIDLE,\n"
    content += "\tMOVING,\n"
    content += "\tATTACKING,\n"
    content += "}\n\n"
    content += "signal state_changed(old_state: State, new_state: State)\n\n"
    content += "var current_state: State = State.IDLE\n\n"
    content += "func _ready() -> void:\n"
    content += "\tchange_state(State.IDLE)\n\n"
    content += "func _process(delta: float) -> void:\n"
    content += "\tmatch current_state:\n"
    content += "\t\tState.IDLE:\n"
    content += "\t\t\tprocess_idle(delta)\n"
    content += "\t\tState.MOVING:\n"
    content += "\t\t\tprocess_moving(delta)\n"
    content += "\t\tState.ATTACKING:\n"
    content += "\t\t\tprocess_attacking(delta)\n\n"
    content += "func change_state(new_state: State) -> void:\n"
    content += "\tif current_state == new_state:\n"
    content += "\t\treturn\n"
    content += "\tvar old_state = current_state\n"
    content += "\texit_state(old_state)\n"
    content += "\tcurrent_state = new_state\n"
    content += "\tenter_state(new_state)\n"
    content += "\tstate_changed.emit(old_state, new_state)\n\n"
    content += "func enter_state(state: State) -> void:\n"
    content += "\tmatch state:\n"
    content += "\t\tState.IDLE:\n"
    content += "\t\t\tpass\n"
    content += "\t\tState.MOVING:\n"
    content += "\t\t\tpass\n"
    content += "\t\tState.ATTACKING:\n"
    content += "\t\t\tpass\n\n"
    content += "func exit_state(state: State) -> void:\n"
    content += "\tmatch state:\n"
    content += "\t\tState.IDLE:\n"
    content += "\t\t\tpass\n"
    content += "\t\tState.MOVING:\n"
    content += "\t\t\tpass\n"
    content += "\t\tState.ATTACKING:\n"
    content += "\t\t\tpass\n\n"
    content += "func process_idle(delta: float) -> void:\n"
    content += "\tpass\n\n"
    content += "func process_moving(delta: float) -> void:\n"
    content += "\tpass\n\n"
    content += "func process_attacking(delta: float) -> void:\n"
    content += "\tpass\n"
    return content

# Template: Singleton/Autoload pattern
func generate_singleton_template(class_name_val: String, extends_class: String) -> String:
    var content = ""
    if class_name_val != "":
        content += "class_name " + class_name_val + "\n"
    content += "extends " + extends_class + "\n\n"
    content += "# Singleton instance (accessed via autoload)\n"
    content += "# Add this script to Project Settings -> Autoload\n\n"
    content += "signal value_changed(new_value)\n\n"
    content += "var data: Dictionary = {}\n\n"
    content += "func _ready() -> void:\n"
    content += "\tlog_info(\"Singleton initialized\")\n\n"
    content += "func set_value(key: String, value) -> void:\n"
    content += "\tdata[key] = value\n"
    content += "\tvalue_changed.emit(value)\n\n"
    content += "func get_value(key: String, default = null):\n"
    content += "\treturn data.get(key, default)\n\n"
    content += "func has_value(key: String) -> bool:\n"
    content += "\treturn data.has(key)\n\n"
    content += "func clear_data() -> void:\n"
    content += "\tdata.clear()\n\n"
    content += "func log_info(message: String) -> void:\n"
    content += "\tprint(\"[\" + name + \"] \" + message)\n"
    return content

# Template: Component pattern
func generate_component_template(class_name_val: String, extends_class: String) -> String:
    var content = ""
    if class_name_val != "":
        content += "class_name " + class_name_val + "\n"
    content += "extends " + extends_class + "\n\n"
    content += "# Modular component pattern\n"
    content += "# Attach to a node to add specific functionality\n\n"
    content += "@export var enabled: bool = true\n"
    content += "@export var debug_mode: bool = false\n\n"
    content += "var owner_node: Node\n\n"
    content += "func _ready() -> void:\n"
    content += "\towner_node = get_parent()\n"
    content += "\tif debug_mode:\n"
    content += "\t\tprint(\"Component initialized on: \", owner_node.name)\n\n"
    content += "func _process(delta: float) -> void:\n"
    content += "\tif not enabled:\n"
    content += "\t\treturn\n"
    content += "\tupdate_component(delta)\n\n"
    content += "func update_component(delta: float) -> void:\n"
    content += "\t# Override in derived components\n"
    content += "\tpass\n\n"
    content += "func enable() -> void:\n"
    content += "\tenabled = true\n\n"
    content += "func disable() -> void:\n"
    content += "\tenabled = false\n\n"
    content += "func toggle() -> void:\n"
    content += "\tenabled = not enabled\n"
    return content

# Template: Character controller
func generate_character_controller_template(class_name_val: String, extends_class: String) -> String:
    var content = ""
    if class_name_val != "":
        content += "class_name " + class_name_val + "\n"
    content += "extends " + extends_class + "\n\n"
    content += "@export var speed: float = 300.0\n"
    content += "@export var jump_velocity: float = -400.0\n"
    content += "@export var acceleration: float = 10.0\n"
    content += "@export var friction: float = 15.0\n\n"
    content += "# Get the gravity from the project settings to be synced with RigidBody nodes.\n"
    content += "var gravity: float = ProjectSettings.get_setting(\"physics/2d/default_gravity\")\n\n"
    content += "func _ready() -> void:\n"
    content += "\tpass\n\n"
    content += "func _physics_process(delta: float) -> void:\n"
    content += "\t# Add gravity\n"
    content += "\tif not is_on_floor():\n"
    content += "\t\tvelocity.y += gravity * delta\n\n"
    content += "\t# Handle jump\n"
    content += "\tif Input.is_action_just_pressed(\"ui_accept\") and is_on_floor():\n"
    content += "\t\tvelocity.y = jump_velocity\n\n"
    content += "\t# Get input direction\n"
    content += "\tvar direction: float = Input.get_axis(\"ui_left\", \"ui_right\")\n\n"
    content += "\t# Apply movement\n"
    content += "\tif direction != 0:\n"
    content += "\t\tvelocity.x = move_toward(velocity.x, direction * speed, acceleration)\n"
    content += "\telse:\n"
    content += "\t\tvelocity.x = move_toward(velocity.x, 0, friction)\n\n"
    content += "\tmove_and_slide()\n\n"
    content += "func get_input_vector() -> Vector2:\n"
    content += "\treturn Input.get_vector(\"ui_left\", \"ui_right\", \"ui_up\", \"ui_down\")\n"
    return content

# Modify function operation - Update an existing function in a script
func modify_function(params):
    log_info("Starting modify_function operation")

    # Validate required parameters
    if not params.has("scriptPath"):
        log_error("scriptPath parameter is required")
        quit(1)
        return

    if not params.has("functionName"):
        log_error("functionName parameter is required")
        quit(1)
        return

    if not params.has("newBody"):
        log_error("newBody parameter is required")
        quit(1)
        return

    var script_path = params["scriptPath"]
    var function_name = params["functionName"]
    var new_body = params["newBody"]
    var new_signature = params.get("newSignature", "")

    log_debug("Script path: " + script_path)
    log_debug("Function name: " + function_name)
    log_debug("Has new signature: " + str(new_signature != ""))

    # Check if file exists
    if not FileAccess.file_exists(script_path):
        log_error("Script file not found: " + script_path)
        quit(1)
        return

    # Read the script file
    var file = FileAccess.open(script_path, FileAccess.READ)
    if file == null:
        log_error("Failed to open script file: " + script_path)
        quit(1)
        return

    var lines = []
    while not file.eof_reached():
        lines.append(file.get_line())
    file.close()

    log_debug("Read " + str(lines.size()) + " lines from script")

    # Find the function
    var func_start_line = -1
    var func_end_line = -1
    var func_indent_level = 0
    var found_function = false

    for i in range(lines.size()):
        var line = lines[i]
        var trimmed = line.strip_edges()

        # Look for the function declaration
        if trimmed.begins_with("func " + function_name + "(") or trimmed.begins_with("func " + function_name + " ("):
            func_start_line = i
            found_function = true
            # Calculate indentation level (count leading tabs/spaces)
            func_indent_level = len(line) - len(line.lstrip("\t "))
            log_debug("Found function at line " + str(i + 1) + " with indent level " + str(func_indent_level))
            continue

        # If we've found the function, look for its end
        if found_function and func_end_line == -1:
            # Skip empty lines and comments within the function
            if trimmed.is_empty() or trimmed.begins_with("#"):
                continue

            # Check indentation to find where function ends
            var current_indent = len(line) - len(line.lstrip("\t "))

            # Function ends when we hit a line with same or less indentation
            # (and it's not empty or a comment)
            if current_indent <= func_indent_level and not trimmed.is_empty():
                func_end_line = i - 1
                log_debug("Function ends at line " + str(func_end_line + 1))
                break

    # If we reached end of file while in function
    if found_function and func_end_line == -1:
        func_end_line = lines.size() - 1
        log_debug("Function extends to end of file at line " + str(func_end_line + 1))

    if not found_function:
        log_error("Function '" + function_name + "' not found in script")
        quit(1)
        return

    # Build the new function
    var new_lines = []
    var function_indent_str = lines[func_start_line].substr(0, func_indent_level)
    var body_indent_str = function_indent_str + "\t"

    for i in range(func_start_line + 1, func_end_line + 1):
        var existing_body_line = lines[i]
        if existing_body_line.strip_edges().is_empty() or existing_body_line.strip_edges().begins_with("#"):
            continue

        var existing_indent_len = len(existing_body_line) - len(existing_body_line.lstrip("\t "))
        if existing_indent_len > func_indent_level:
            body_indent_str = existing_body_line.substr(0, existing_indent_len)
            break

    # Add lines before the function
    for i in range(func_start_line):
        new_lines.append(lines[i])

    # Add function signature (new or existing)
    if new_signature != "":
        # Use new signature
        new_lines.append(function_indent_str + new_signature)
    else:
        # Keep existing signature
        new_lines.append(lines[func_start_line])

    # Add new function body with proper indentation
    var body_lines = new_body.split("\n")
    for body_line in body_lines:
        if body_line.strip_edges().is_empty():
            new_lines.append("")
        else:
            new_lines.append(body_indent_str + body_line)

    # Add lines after the function
    for i in range(func_end_line + 1, lines.size()):
        new_lines.append(lines[i])

    # Write the modified script
    file = FileAccess.open(script_path, FileAccess.WRITE)
    if file == null:
        log_error("Failed to open script file for writing: " + script_path)
        quit(1)
        return

    for line in new_lines:
        file.store_line(line)
    file.close()

    log_info("Function modified successfully")

    # Build result
    var result = {
        "script_path": script_path,
        "function_name": function_name,
        "signature_changed": new_signature != "",
        "total_lines": new_lines.size()
    }

    # Output the result as JSON
    print(JSON.stringify(result))
    log_info("modify_function operation completed successfully")

# Add an @export variable to a GDScript file
func add_export_variable(params):
    log_info("Starting add_export_variable operation")

    # Extract parameters
    var script_path = params.get("scriptPath", "")
    var variable_name = params.get("variableName", "")
    var variable_type = params.get("variableType", "")
    var default_value = params.get("defaultValue", "")
    var export_hint = params.get("exportHint", "")
    var hint_string = params.get("hintString", "")

    if script_path.is_empty():
        log_error("scriptPath parameter is required")
        return

    if variable_name.is_empty():
        log_error("variableName parameter is required")
        return

    if variable_type.is_empty():
        log_error("variableType parameter is required")
        return

    # Check if script file exists
    if not FileAccess.file_exists(script_path):
        log_error("Script file not found: " + script_path)
        return

    # Read the script file
    var file = FileAccess.open(script_path, FileAccess.READ)
    if file == null:
        log_error("Failed to open script file for reading: " + script_path)
        return

    var content = file.get_as_text()
    file.close()

    var lines = content.split("\n")

    # Find the insertion point (after class_name/extends, before functions or other variables)
    var insert_line = 0
    var found_class_name = false
    var found_extends = false

    for i in range(lines.size()):
        var trimmed = lines[i].strip_edges()

        # Track class_name and extends
        if trimmed.begins_with("class_name "):
            found_class_name = true
            insert_line = i + 1
        elif trimmed.begins_with("extends "):
            found_extends = true
            insert_line = i + 1
        # Stop at first function or signal
        elif trimmed.begins_with("func ") or trimmed.begins_with("signal "):
            break
        # If we already have class_name/extends, stop at first non-comment, non-empty line that's not a variable
        elif (found_class_name or found_extends) and not trimmed.is_empty() and not trimmed.begins_with("#"):
            if trimmed.begins_with("const ") or trimmed.begins_with("@export") or trimmed.begins_with("var "):
                insert_line = i + 1
            else:
                break

    # Skip any blank lines after the insertion point
    while insert_line < lines.size() and lines[insert_line].strip_edges().is_empty():
        insert_line += 1

    # Generate the export variable line
    var export_line = ""

    # Add export decorator with hint if provided
    if not export_hint.is_empty():
        match export_hint.to_upper():
            "RANGE":
                if not hint_string.is_empty():
                    export_line = "@export_range(" + hint_string + ") var " + variable_name + ": " + variable_type + " = " + default_value
                else:
                    export_line = "@export var " + variable_name + ": " + variable_type + " = " + default_value
            "FILE":
                if not hint_string.is_empty():
                    # For FILE, use only the first extension if multiple are provided
                    var file_filter = hint_string
                    if ", " in hint_string:
                        # Split comma-separated extensions and use the first one
                        var filters = hint_string.split(", ")
                        file_filter = filters[0].strip_edges()
                    export_line = "@export_file(\"" + file_filter + "\") var " + variable_name + ": " + variable_type + " = " + default_value
                else:
                    export_line = "@export_file var " + variable_name + ": " + variable_type + " = " + default_value
            "DIR":
                export_line = "@export_dir var " + variable_name + ": " + variable_type + " = " + default_value
            "ENUM":
                if not hint_string.is_empty():
                    # Parse comma-separated enum values and format as separate quoted strings
                    # Input: "Easy:0, Medium:1, Hard:2" or "Easy, Medium, Hard"
                    # Output: @export_enum("Easy", "Medium", "Hard")
                    var enum_values = hint_string.split(",")
                    var formatted_values = []
                    for val in enum_values:
                        var trimmed = val.strip_edges()
                        # Remove :number suffix if present (e.g., "Easy:0" -> "Easy")
                        if ":" in trimmed:
                            trimmed = trimmed.split(":")[0].strip_edges()
                        formatted_values.append("\"" + trimmed + "\"")
                    export_line = "@export_enum(" + ", ".join(formatted_values) + ") var " + variable_name + ": " + variable_type + " = " + default_value
                else:
                    export_line = "@export var " + variable_name + ": " + variable_type + " = " + default_value
            "FLAGS":
                if not hint_string.is_empty():
                    # Parse comma-separated flag values and format as separate quoted strings
                    # Input: "Flag1, Flag2, Flag3"
                    # Output: @export_flags("Flag1", "Flag2", "Flag3")
                    var flag_values = hint_string.split(",")
                    var formatted_values = []
                    for val in flag_values:
                        var trimmed = val.strip_edges()
                        # Remove :number suffix if present
                        if ":" in trimmed:
                            trimmed = trimmed.split(":")[0].strip_edges()
                        formatted_values.append("\"" + trimmed + "\"")
                    export_line = "@export_flags(" + ", ".join(formatted_values) + ") var " + variable_name + ": " + variable_type + " = " + default_value
                else:
                    export_line = "@export var " + variable_name + ": " + variable_type + " = " + default_value
            "COLOR_NO_ALPHA":
                export_line = "@export_color_no_alpha var " + variable_name + ": " + variable_type + " = " + default_value
            "NODE_PATH":
                if not hint_string.is_empty():
                    export_line = "@export_node_path(\"" + hint_string + "\") var " + variable_name + ": " + variable_type + " = " + default_value
                else:
                    export_line = "@export_node_path var " + variable_name + ": " + variable_type + " = " + default_value
            "MULTILINE":
                export_line = "@export_multiline var " + variable_name + ": " + variable_type + " = " + default_value
            "PLACEHOLDER":
                if not hint_string.is_empty():
                    export_line = "@export_placeholder(\"" + hint_string + "\") var " + variable_name + ": " + variable_type + " = " + default_value
                else:
                    export_line = "@export var " + variable_name + ": " + variable_type + " = " + default_value
            _:
                # Unknown hint, use basic @export
                export_line = "@export var " + variable_name + ": " + variable_type + " = " + default_value
    else:
        # No hint, use basic @export
        export_line = "@export var " + variable_name + ": " + variable_type + " = " + default_value

    # Insert the export variable
    lines.insert(insert_line, export_line)

    # Write the modified content back to the file
    var output_file = FileAccess.open(script_path, FileAccess.WRITE)
    if output_file == null:
        log_error("Failed to open script file for writing: " + script_path)
        return

    for i in range(lines.size()):
        if i < lines.size() - 1:
            output_file.store_line(lines[i])
        else:
            # Don't add extra newline at the end if the last line is already empty
            if not lines[i].is_empty():
                output_file.store_line(lines[i])
            else:
                output_file.store_string(lines[i])

    output_file.close()

    log_info("Export variable added successfully")

    # Create result
    var result = {
        "script_path": script_path,
        "variable_name": variable_name,
        "variable_type": variable_type,
        "default_value": default_value,
        "export_hint": export_hint if not export_hint.is_empty() else "none",
        "inserted_at_line": insert_line + 1,  # 1-indexed for user display
        "total_lines": lines.size()
    }

    # Output the result as JSON
    print(JSON.stringify(result))
    log_info("add_export_variable operation completed successfully")

# Extract all dependencies from a GDScript file
func extract_dependencies(params):
    log_info("Starting extract_dependencies operation")

    # Extract parameters
    var script_path = params.get("scriptPath", "")

    if script_path.is_empty():
        log_error("scriptPath parameter is required")
        return

    # Check if script file exists
    if not FileAccess.file_exists(script_path):
        log_error("Script file not found: " + script_path)
        return

    # Read the script file
    var file = FileAccess.open(script_path, FileAccess.READ)
    if file == null:
        log_error("Failed to open script file for reading: " + script_path)
        return

    var content = file.get_as_text()
    file.close()

    var lines = content.split("\n")

    # Arrays to store different types of dependencies
    var preloads = []
    var loads = []
    var class_references = []
    var resource_paths = []

    # Regular expressions for parsing (using simple string parsing instead for compatibility)
    for line_text in lines:
        var trimmed = line_text.strip_edges()

        # Skip comments and empty lines
        if trimmed.is_empty() or trimmed.begins_with("#"):
            continue

        # Extract preload() statements
        # Formats: preload("path"), const X = preload("path"), var x = preload("path")
        if "preload(" in trimmed:
            var preload_start = trimmed.find("preload(")
            if preload_start != -1:
                var path_start = trimmed.find("\"", preload_start)
                if path_start != -1:
                    var path_end = trimmed.find("\"", path_start + 1)
                    if path_end != -1:
                        var path = trimmed.substr(path_start + 1, path_end - path_start - 1)
                        if not path in preloads:
                            preloads.append(path)

        # Extract load() statements
        # Formats: load("path"), var x = load("path")
        if "load(" in trimmed and not "preload(" in trimmed:
            var load_start = trimmed.find("load(")
            if load_start != -1:
                var path_start = trimmed.find("\"", load_start)
                if path_start != -1:
                    var path_end = trimmed.find("\"", path_start + 1)
                    if path_end != -1:
                        var path = trimmed.substr(path_start + 1, path_end - path_start - 1)
                        if not path in loads:
                            loads.append(path)

        # Extract resource paths (res://, user://, uid://)
        # Look for quoted strings that start with resource protocol
        var search_pos = 0
        while true:
            var quote_pos = trimmed.find("\"", search_pos)
            if quote_pos == -1:
                break

            var next_quote = trimmed.find("\"", quote_pos + 1)
            if next_quote == -1:
                break

            var potential_path = trimmed.substr(quote_pos + 1, next_quote - quote_pos - 1)

            # Check if it's a resource path
            if potential_path.begins_with("res://") or potential_path.begins_with("user://") or potential_path.begins_with("uid://"):
                # Skip if already captured by preload/load
                if not potential_path in preloads and not potential_path in loads:
                    if not potential_path in resource_paths:
                        resource_paths.append(potential_path)

            search_pos = next_quote + 1

        # Extract class references (ClassName.new(), ClassName.something)
        # Look for capitalized words followed by a dot
        var words = trimmed.split(" ")
        for word in words:
            # Check for patterns like ClassName.new() or ClassName.method()
            if "." in word:
                var parts = word.split(".")
                if parts.size() > 0:
                    var potential_class = parts[0]
                    # Remove common prefixes/symbols
                    potential_class = potential_class.replace("=", "").replace("(", "").replace(")", "").replace("[", "").replace("]", "").strip_edges()

                    # Check if it starts with uppercase (likely a class name)
                    if potential_class.length() > 0 and potential_class[0] >= 'A' and potential_class[0] <= 'Z':
                        # Filter out built-in types and common keywords
                        var built_ins = ["Vector2", "Vector3", "Color", "Rect2", "Transform2D", "Transform3D",
                                        "AABB", "Basis", "Plane", "Quaternion", "String", "Array", "Dictionary",
                                        "PackedByteArray", "PackedInt32Array", "PackedInt64Array", "PackedFloat32Array",
                                        "PackedFloat64Array", "PackedStringArray", "PackedVector2Array", "PackedVector3Array",
                                        "PackedColorArray", "Node", "Node2D", "Node3D", "Control", "Resource",
                                        "Input", "OS", "Engine", "Time", "ProjectSettings", "ResourceLoader",
                                        "FileAccess", "DirAccess", "JSON", "print", "printerr"]

                        if not potential_class in built_ins and not potential_class in class_references:
                            class_references.append(potential_class)

    log_info("Dependencies extracted successfully")

    # Create result
    var result = {
        "script_path": script_path,
        "preloads": preloads,
        "loads": loads,
        "resource_paths": resource_paths,
        "class_references": class_references,
        "total_dependencies": preloads.size() + loads.size() + resource_paths.size() + class_references.size()
    }

    # Output the result as JSON
    print(JSON.stringify(result))
    log_info("extract_dependencies operation completed successfully")

# Attach a script to a node in a scene
func attach_script(params):
    log_info("Starting attach_script operation")

    # Extract parameters
    var scene_path = params.get("scenePath", "")
    var node_path = params.get("nodePath", "")
    var script_path = params.get("scriptPath", "")

    if scene_path.is_empty():
        log_error("scenePath parameter is required")
        return

    if node_path.is_empty():
        log_error("nodePath parameter is required")
        return

    if script_path.is_empty():
        log_error("scriptPath parameter is required")
        return

    # Check if scene file exists
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file not found: " + scene_path)
        return

    # Check if script file exists
    if not FileAccess.file_exists(script_path):
        log_error("Script file not found: " + script_path)
        return

    # Load the scene
    var scene = load(scene_path)
    if scene == null:
        log_error("Failed to load scene: " + scene_path)
        return

    var scene_instance = scene.instantiate()
    if scene_instance == null:
        log_error("Failed to instantiate scene: " + scene_path)
        return

    # Find the target node
    var target_node = null
    if node_path == ".":
        target_node = scene_instance
    else:
        target_node = scene_instance.get_node_or_null(node_path)

    if target_node == null:
        log_error("Node not found: " + node_path)
        scene_instance.queue_free()
        return

    # Load the script
    var script = load(script_path)
    if script == null:
        log_error("Failed to load script: " + script_path)
        scene_instance.queue_free()
        return

    # Get the node's name and type for the result
    var node_name = target_node.name
    var node_type = target_node.get_class()
    var had_previous_script = target_node.get_script() != null

    # We need to modify the .tscn file directly to persist the script attachment
    # Read the scene file
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if file == null:
        log_error("Failed to open scene file for reading: " + scene_path)
        scene_instance.queue_free()
        return

    var content = file.get_as_text()
    file.close()

    # Clean up the scene instance
    scene_instance.queue_free()

    # Parse the .tscn file to find the node and add/update the script property
    var lines = content.split("\n")
    var modified = false
    var in_target_node = false
    var node_section_start = -1

    # Determine the node identifier we're looking for
    var target_identifier = ""
    if node_path == ".":
        target_identifier = "[node name=\"" + node_name + "\" type=\""
    else:
        # For child nodes, we need to match the full path
        var path_parts = node_path.split("/")
        var last_part = path_parts[path_parts.size() - 1]
        target_identifier = "[node name=\"" + last_part + "\""

    # First pass: find the node section
    for i in range(lines.size()):
        var line = lines[i]

        # Check if this is the target node
        if line.begins_with("[node") and target_identifier in line:
            in_target_node = true
            node_section_start = i
            log_debug("Found target node at line " + str(i + 1) + ": " + line)
            continue

        # If we're in the target node section
        if in_target_node:
            # Check if we've reached the next section or another node
            if line.begins_with("[") and not line.begins_with("[node") == false:
                # We've left the node section without finding a script line
                # Insert the script line before this section
                var script_line = "script = ExtResource(\"???_" + script_path.get_file() + "\")"
                lines.insert(i, script_line)
                modified = true
                log_debug("Inserted script line at line " + str(i + 1))
                break

            # Check if there's already a script property
            if line.strip_edges().begins_with("script = "):
                # Replace the existing script line
                var indent = ""
                for j in range(line.length()):
                    if line[j] == ' ' or line[j] == '\t':
                        indent += line[j]
                    else:
                        break

                lines[i] = indent + "script = ExtResource(\"???_" + script_path.get_file() + "\")"
                modified = true
                log_debug("Replaced existing script line at line " + str(i + 1))
                break

    if not modified and in_target_node:
        # We're at the end of the file and in the target node
        # Append the script line
        var script_line = "script = ExtResource(\"???_" + script_path.get_file() + "\")"
        lines.append(script_line)
        modified = true
        log_debug("Appended script line at end of file")

    if not modified:
        log_error("Failed to attach script - could not find or modify target node section")
        return

    # Now we need to ensure the script is in the [ext_resource] section
    # For simplicity, we'll use the direct file path approach
    # Find or add the ext_resource for the script
    var ext_resource_id = ""
    var found_resource = false

    # Look for existing ext_resource with this script
    for i in range(lines.size()):
        var line = lines[i]
        if line.begins_with("[ext_resource") and script_path.get_file() in line:
            # Extract the id
            var id_start = line.find("id=\"")
            if id_start != -1:
                id_start += 4
                var id_end = line.find("\"", id_start)
                if id_end != -1:
                    ext_resource_id = line.substr(id_start, id_end - id_start)
                    found_resource = true
                    break

    # If not found, we need to add a new ext_resource
    if not found_resource:
        # Find the last ext_resource line
        var last_ext_resource_line = -1
        var max_id = 0

        for i in range(lines.size()):
            var line = lines[i]
            if line.begins_with("[ext_resource"):
                last_ext_resource_line = i

                # Extract the numeric part of the id to find the max
                var id_start = line.find("id=\"")
                if id_start != -1:
                    id_start += 4
                    var id_end = line.find("\"", id_start)
                    if id_end != -1:
                        var id_str = line.substr(id_start, id_end - id_start)
                        # Remove non-numeric prefix if present
                        var numeric_part = id_str
                        for j in range(id_str.length()):
                            if id_str[j] >= '0' and id_str[j] <= '9':
                                numeric_part = id_str.substr(j)
                                break

                        var id_num = numeric_part.to_int()
                        if id_num > max_id:
                            max_id = id_num

        # Create new ext_resource
        var new_id = str(max_id + 1) + "_" + script_path.get_file().get_basename()
        ext_resource_id = new_id

        var new_ext_resource = "[ext_resource type=\"Script\" path=\"res://" + script_path + "\" id=\"" + new_id + "\"]"

        if last_ext_resource_line != -1:
            lines.insert(last_ext_resource_line + 1, new_ext_resource)
            log_debug("Added new ext_resource at line " + str(last_ext_resource_line + 2))
        else:
            # No ext_resources yet, add after [gd_scene]
            for i in range(lines.size()):
                if lines[i].begins_with("[gd_scene"):
                    lines.insert(i + 1, "")
                    lines.insert(i + 2, new_ext_resource)
                    log_debug("Added first ext_resource at line " + str(i + 3))
                    break

    # Now update the script line with the correct ExtResource id
    for i in range(lines.size()):
        if "script = ExtResource(\"???_" in lines[i]:
            lines[i] = lines[i].replace("ExtResource(\"???_" + script_path.get_file() + "\")", "ExtResource(\"" + ext_resource_id + "\")")
            log_debug("Updated script reference to use ExtResource id: " + ext_resource_id)
            break

    # Write the modified content back to the file
    var output_file = FileAccess.open(scene_path, FileAccess.WRITE)
    if output_file == null:
        log_error("Failed to open scene file for writing: " + scene_path)
        return

    for line in lines:
        output_file.store_line(line)

    output_file.close()

    log_info("Script attached successfully")

    # Create result
    var result = {
        "scene_path": scene_path,
        "node_path": node_path,
        "node_name": node_name,
        "node_type": node_type,
        "script_path": script_path,
        "ext_resource_id": ext_resource_id,
        "replaced_existing": had_previous_script
    }

    # Output the result as JSON
    print(JSON.stringify(result))
    log_info("attach_script operation completed successfully")

