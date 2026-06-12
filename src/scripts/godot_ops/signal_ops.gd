extends RefCounted

var _context
var _legacy

func setup(context, legacy) -> void:
    _context = context
    _legacy = legacy

func _log_debug(message) -> void:
    if _legacy != null and _legacy.has_method("log_debug"):
        _legacy.log_debug(str(message))

func _log_info(message) -> void:
    if _legacy != null and _legacy.has_method("log_info"):
        _legacy.log_info(str(message))

func _log_error(message) -> void:
    if _legacy != null and _legacy.has_method("log_error"):
        _legacy.log_error(str(message))

func _quit(code := 0) -> void:
    if _legacy != null and _legacy.has_method("quit"):
        _legacy.quit(code)

func _instantiate_class(name_of_class):
    if _legacy != null and _legacy.has_method("instantiate_class"):
        return _legacy.instantiate_class(name_of_class)
    return null

# List signals operation
func list_signals(params: Dictionary) -> void:
    _log_info("Starting list_signals operation")
    
    if not params.has("nodeType"):
        _log_error("nodeType parameter is required")
        _quit(1)
    
    var node_type = params["nodeType"]
    _log_debug("Node type: " + node_type)
    
    var node_instance = null
    var signals_list = []
    
    # Check if we need to load from a scene
    if params.has("scenePath") and params.has("nodePath"):
        var scene_path = params["scenePath"]
        var node_path = params["nodePath"]
        
        _log_debug("Loading scene: " + scene_path)
        var scene = load(scene_path)
        if scene == null:
            _log_error("Failed to load scene: " + scene_path)
            _quit(1)
        
        var scene_instance = scene.instantiate()
        if scene_instance == null:
            _log_error("Failed to instantiate scene: " + scene_path)
            _quit(1)
        
        # Navigate to the specific node
        node_instance = scene_instance.get_node(NodePath(node_path))
        if node_instance == null:
            _log_error("Failed to find node at path: " + node_path)
            scene_instance.free()
            _quit(1)
    else:
        # Instantiate the node type directly
        _log_debug("Instantiating node type: " + node_type)
        node_instance = _instantiate_class(node_type)
        if node_instance == null:
            _log_error("Failed to instantiate node type: " + node_type)
            _quit(1)
    
    # Verify node_instance is valid
    if node_instance == null:
        _log_error("Node instance is null, cannot get signal list")
        _quit(1)
        return

    # Get the signal list
    _log_debug("Getting signal list from node")
    var signal_list = node_instance.get_signal_list()
    
    for signal_info in signal_list:
        var signal_name = signal_info["name"]
        var signal_params = []
        
        # Extract parameter information
        if signal_info.has("args"):
            for arg_info in signal_info["args"]:
                var param_data = {
                    "name": arg_info["name"],
                    "type": _type_string(arg_info["type"])
                }
                signal_params.append(param_data)
        
        signals_list.append({
            "name": signal_name,
            "parameters": signal_params
        })
    
    # Build the result
    var result = {
        "nodeType": node_type,
        "signals": signals_list
    }
    
    # Clean up
    if node_instance:
        node_instance.free()
    
    # Output the result as JSON
    print(JSON.stringify(result))
    _log_info("list_signals operation completed successfully")

# Helper function to convert type enum to string
func _type_string(type_enum) -> String:
    match type_enum:
        TYPE_NIL: return "Nil"
        TYPE_BOOL: return "bool"
        TYPE_INT: return "int"
        TYPE_FLOAT: return "float"
        TYPE_STRING: return "String"
        TYPE_VECTOR2: return "Vector2"
        TYPE_VECTOR2I: return "Vector2i"
        TYPE_RECT2: return "Rect2"
        TYPE_RECT2I: return "Rect2i"
        TYPE_VECTOR3: return "Vector3"
        TYPE_VECTOR3I: return "Vector3i"
        TYPE_TRANSFORM2D: return "Transform2D"
        TYPE_VECTOR4: return "Vector4"
        TYPE_VECTOR4I: return "Vector4i"
        TYPE_PLANE: return "Plane"
        TYPE_QUATERNION: return "Quaternion"
        TYPE_AABB: return "AABB"
        TYPE_BASIS: return "Basis"
        TYPE_TRANSFORM3D: return "Transform3D"
        TYPE_PROJECTION: return "Projection"
        TYPE_COLOR: return "Color"
        TYPE_STRING_NAME: return "StringName"
        TYPE_NODE_PATH: return "NodePath"
        TYPE_RID: return "RID"
        TYPE_OBJECT: return "Object"
        TYPE_CALLABLE: return "Callable"
        TYPE_SIGNAL: return "Signal"
        TYPE_DICTIONARY: return "Dictionary"
        TYPE_ARRAY: return "Array"
        TYPE_PACKED_BYTE_ARRAY: return "PackedByteArray"
        TYPE_PACKED_INT32_ARRAY: return "PackedInt32Array"
        TYPE_PACKED_INT64_ARRAY: return "PackedInt64Array"
        TYPE_PACKED_FLOAT32_ARRAY: return "PackedFloat32Array"
        TYPE_PACKED_FLOAT64_ARRAY: return "PackedFloat64Array"
        TYPE_PACKED_STRING_ARRAY: return "PackedStringArray"
        TYPE_PACKED_VECTOR2_ARRAY: return "PackedVector2Array"
        TYPE_PACKED_VECTOR3_ARRAY: return "PackedVector3Array"
        TYPE_PACKED_COLOR_ARRAY: return "PackedColorArray"
        _: return "Unknown"

# List connections operation
func list_connections(params: Dictionary) -> void:
    _log_info("Starting list_connections operation")
    
    if not params.has("scenePath"):
        _log_error("scenePath parameter is required")
        _quit(1)
        return
    
    var scene_path = params["scenePath"]
    _log_debug("Scene path: " + scene_path)
    
    # Load the scene
    var scene = load(scene_path)
    if scene == null:
        _log_error("Failed to load scene: " + scene_path)
        _quit(1)
        return
    
    # Instantiate the scene to get connections
    var scene_instance = scene.instantiate()
    if scene_instance == null:
        _log_error("Failed to instantiate scene: " + scene_path)
        _quit(1)
        return
    
    _log_debug("Scene instantiated successfully")
    
    var connections_list = []
    var filter_node_path = params.get("nodePath", "")
    
    # Get all connections from the scene
    # We need to traverse all nodes and get their incoming connections
    var nodes_to_check = [scene_instance]
    var processed_nodes = []
    
    while nodes_to_check.size() > 0:
        var current_node = nodes_to_check.pop_front()
        if current_node in processed_nodes:
            continue
        processed_nodes.append(current_node)
        
        # Get the node's path relative to the scene root
        var node_path = scene_instance.get_path_to(current_node)
        var node_path_str = str(node_path)
        
        # If filtering by node path, check if this node matches
        var should_process = true
        if filter_node_path != "":
            # Check if this node matches the filter (either exact match or is a child)
            should_process = (node_path_str == filter_node_path or 
                            node_path_str.begins_with(filter_node_path + "/"))
        
        if should_process:
            # Get all incoming connections for this node
            var incoming_connections = current_node.get_incoming_connections()
            
            for connection_info in incoming_connections:
                var source = connection_info["signal"].get_object()
                var signal_name = connection_info["signal"].get_name()
                var callable_info = connection_info["callable"]
                var target = callable_info.get_object()
                var method_name = callable_info.get_method()
                
                # Get the paths for source and target nodes
                var source_path = scene_instance.get_path_to(source) if source else NodePath(".")
                var target_path = scene_instance.get_path_to(target) if target else NodePath(".")
                
                var connection_data = {
                    "source_node": str(source_path),
                    "signal": signal_name,
                    "target_node": str(target_path),
                    "method": method_name,
                    "flags": connection_info.get("flags", 0),
                    "binds": []
                }
                
                # Try to get binds if available
                if connection_info.has("binds"):
                    for bind_value in connection_info["binds"]:
                        connection_data["binds"].append(str(bind_value))
                
                connections_list.append(connection_data)
        
        # Add children to the list to check
        for child in current_node.get_children():
            if not child in processed_nodes:
                nodes_to_check.append(child)
    
    # Build the result
    var result = {
        "scene_path": scene_path,
        "connections": connections_list
    }
    
    # If filtering was applied, include that in the result
    if filter_node_path != "":
        result["filtered_by"] = filter_node_path
    
    # Clean up
    scene_instance.free()
    
    # Output the result as JSON
    print(JSON.stringify(result))
    _log_info("list_connections operation completed successfully")

# Connect signal operation
func connect_signal(params: Dictionary) -> void:
    _log_info("Starting connect_signal operation")
    
    # Validate required parameters
    if not params.has("scenePath"):
        _log_error("scenePath parameter is required")
        _quit(1)
        return
    
    if not params.has("sourceNodePath"):
        _log_error("sourceNodePath parameter is required")
        _quit(1)
        return
    
    if not params.has("signalName"):
        _log_error("signalName parameter is required")
        _quit(1)
        return
    
    if not params.has("targetNodePath"):
        _log_error("targetNodePath parameter is required")
        _quit(1)
        return
    
    if not params.has("methodName"):
        _log_error("methodName parameter is required")
        _quit(1)
        return
    
    var scene_path = params["scenePath"]
    var source_node_path = params["sourceNodePath"]
    var signal_name = params["signalName"]
    var target_node_path = params["targetNodePath"]
    var method_name = params["methodName"]
    var connection_flags = params.get("flags", 0)
    var binds = params.get("binds", [])
    
    _log_debug("Scene path: " + scene_path)
    _log_debug("Source node: " + source_node_path)
    _log_debug("Signal: " + signal_name)
    _log_debug("Target node: " + target_node_path)
    _log_debug("Method: " + method_name)
    
    # Load the scene
    var scene = load(scene_path)
    if scene == null:
        _log_error("Failed to load scene: " + scene_path)
        _quit(1)
        return
    
    # Instantiate the scene
    var scene_instance = scene.instantiate()
    if scene_instance == null:
        _log_error("Failed to instantiate scene: " + scene_path)
        _quit(1)
        return
    
    _log_debug("Scene instantiated successfully")
    
    # Get the source node
    var source_node = scene_instance.get_node(NodePath(source_node_path))
    if source_node == null:
        _log_error("Failed to find source node: " + source_node_path)
        scene_instance.free()
        _quit(1)
        return
    
    _log_debug("Source node found: " + str(source_node))
    
    # Validate that the source node has the specified signal
    var has_signal = source_node.has_signal(signal_name)
    if not has_signal:
        _log_error("Source node does not have signal: " + signal_name)
        _log_error("Use list_signals to see available signals on this node")
        scene_instance.free()
        _quit(1)
        return
    
    _log_debug("Signal exists on source node")
    
    # Get the target node
    var target_node = scene_instance.get_node(NodePath(target_node_path))
    if target_node == null:
        _log_error("Failed to find target node: " + target_node_path)
        scene_instance.free()
        _quit(1)
        return
    
    _log_debug("Target node found: " + str(target_node))
    
    # Check if the method exists on the target node (warning only, not a hard error)
    if target_node.has_method(method_name):
        _log_debug("Method exists on target node")
    else:
        print("WARNING: Method '" + method_name + "' does not exist on target node yet.")
        print("Make sure to add this method to the target node's script.")
    
    # Create the connection
    var callable = Callable(target_node, method_name)
    
    # Add binds if provided
    if binds.size() > 0:
        # Convert binds array to proper types
        var bind_values = []
        for bind_value in binds:
            bind_values.append(bind_value)
        callable = callable.bindv(bind_values)
    
    # Connect the signal
    var connect_result = source_node.connect(signal_name, callable, connection_flags)
    
    if connect_result != OK:
        _log_error("Failed to connect signal. Error code: " + str(connect_result))
        scene_instance.free()
        _quit(1)
        return
    
    _log_info("Signal connected successfully in runtime")

    # Now we need to save this connection to the scene file
    # PackedScene.pack() doesn't preserve runtime connections, so we'll edit the .tscn file directly

    # Clean up the scene instance first
    scene_instance.free()

    # Read the scene file
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if file == null:
        _log_error("Failed to open scene file for reading: " + scene_path)
        _quit(1)
        return

    var file_content = file.get_as_text()
    file.close()

    _log_debug("Scene file read successfully")

    # Build the connection line
    # Format: [connection signal="signal_name" from="source_path" to="target_path" method="method_name"]
    var connection_line = '[connection signal="' + signal_name + '" from="' + source_node_path + '" to="' + target_node_path + '" method="' + method_name + '"'

    # Add flags if non-zero
    if connection_flags != 0:
        connection_line += ' flags=' + str(connection_flags)

    # Add binds if present
    if binds.size() > 0:
        connection_line += ' binds=' + str(binds)

    connection_line += ']'

    # Check if this connection already exists
    if connection_line in file_content:
        _log_info("Connection already exists in scene file")
    else:
        # Add the connection line to the end of the file
        file_content += "\n" + connection_line + "\n"
        _log_debug("Connection line added: " + connection_line)

        # Write the modified content back
        file = FileAccess.open(scene_path, FileAccess.WRITE)
        if file == null:
            _log_error("Failed to open scene file for writing: " + scene_path)
            _quit(1)
            return

        file.store_string(file_content)
        file.close()

        _log_info("Scene file updated with connection")

    
    # Build success message
    var result = {
        "scene_path": scene_path,
        "connection": {
            "source_node": source_node_path,
            "signal": signal_name,
            "target_node": target_node_path,
            "method": method_name,
            "flags": connection_flags,
            "binds": binds
        }
    }

    # Output the result
    print(JSON.stringify(result))
    _log_info("connect_signal operation completed successfully")

# Disconnect signal operation
func disconnect_signal(params: Dictionary) -> void:
    _log_info("Starting disconnect_signal operation")

    # Validate required parameters
    if not params.has("scenePath"):
        _log_error("scenePath parameter is required")
        _quit(1)
        return

    if not params.has("sourceNodePath"):
        _log_error("sourceNodePath parameter is required")
        _quit(1)
        return

    if not params.has("signalName"):
        _log_error("signalName parameter is required")
        _quit(1)
        return

    if not params.has("targetNodePath"):
        _log_error("targetNodePath parameter is required")
        _quit(1)
        return

    if not params.has("methodName"):
        _log_error("methodName parameter is required")
        _quit(1)
        return

    var scene_path = params["scenePath"]
    var source_node_path = params["sourceNodePath"]
    var signal_name = params["signalName"]
    var target_node_path = params["targetNodePath"]
    var method_name = params["methodName"]

    _log_debug("Scene path: " + scene_path)
    _log_debug("Source node: " + source_node_path)
    _log_debug("Signal: " + signal_name)
    _log_debug("Target node: " + target_node_path)
    _log_debug("Method: " + method_name)

    # Load the scene to validate that nodes exist
    var scene = load(scene_path)
    if scene == null:
        _log_error("Failed to load scene: " + scene_path)
        _quit(1)
        return

    # Instantiate the scene
    var scene_instance = scene.instantiate()
    if scene_instance == null:
        _log_error("Failed to instantiate scene: " + scene_path)
        _quit(1)
        return

    _log_debug("Scene instantiated successfully")

    # Validate source node exists
    var source_node = scene_instance.get_node(NodePath(source_node_path))
    if source_node == null:
        _log_error("Failed to find source node: " + source_node_path)
        scene_instance.free()
        _quit(1)
        return

    _log_debug("Source node found: " + str(source_node))

    # Validate target node exists
    var target_node = scene_instance.get_node(NodePath(target_node_path))
    if target_node == null:
        _log_error("Failed to find target node: " + target_node_path)
        scene_instance.free()
        _quit(1)
        return

    _log_debug("Target node found: " + str(target_node))

    # Clean up the scene instance
    scene_instance.free()

    # Read the scene file
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if file == null:
        _log_error("Failed to open scene file for reading: " + scene_path)
        _quit(1)
        return

    var file_content = file.get_as_text()
    file.close()

    _log_debug("Scene file read successfully")

    # Build the connection line patterns to search for
    # We need to handle both with and without optional parameters
    var base_connection = '[connection signal="' + signal_name + '" from="' + source_node_path + '" to="' + target_node_path + '" method="' + method_name + '"'

    # Split the file into lines
    var lines = file_content.split("\n")
    var modified = false
    var new_lines = []

    for line in lines:
        # Check if this line is the connection we want to remove
        if line.begins_with(base_connection):
            _log_info("Found connection to remove: " + line)
            modified = true
            # Skip this line (don't add it to new_lines)
        else:
            new_lines.append(line)

    if not modified:
        _log_error("Connection not found in scene file")
        _log_error("Expected connection starting with: " + base_connection)
        _quit(1)
        return

    # Rebuild the file content
    var new_content = "\n".join(new_lines)

    # Write the modified content back
    file = FileAccess.open(scene_path, FileAccess.WRITE)
    if file == null:
        _log_error("Failed to open scene file for writing: " + scene_path)
        _quit(1)
        return

    file.store_string(new_content)
    file.close()

    _log_info("Scene file updated - connection removed")

    # Build success message
    var result = {
        "scene_path": scene_path,
        "disconnected": {
            "source_node": source_node_path,
            "signal": signal_name,
            "target_node": target_node_path,
            "method": method_name
        }
    }

    # Output the result
    print(JSON.stringify(result))
    _log_info("disconnect_signal operation completed successfully")

# Validate connection operation
func validate_connection(params: Dictionary) -> void:
    _log_info("Starting validate_connection operation")

    # Validate required parameters
    if not params.has("scenePath"):
        _log_error("scenePath parameter is required")
        _quit(1)
        return

    if not params.has("sourceNodePath"):
        _log_error("sourceNodePath parameter is required")
        _quit(1)
        return

    if not params.has("signalName"):
        _log_error("signalName parameter is required")
        _quit(1)
        return

    if not params.has("targetNodePath"):
        _log_error("targetNodePath parameter is required")
        _quit(1)
        return

    if not params.has("methodName"):
        _log_error("methodName parameter is required")
        _quit(1)
        return

    var scene_path = params["scenePath"]
    var source_node_path = params["sourceNodePath"]
    var signal_name = params["signalName"]
    var target_node_path = params["targetNodePath"]
    var method_name = params["methodName"]

    _log_debug("Scene path: " + scene_path)
    _log_debug("Source node: " + source_node_path)
    _log_debug("Signal: " + signal_name)
    _log_debug("Target node: " + target_node_path)
    _log_debug("Method: " + method_name)

    # Load the scene
    var scene = load(scene_path)
    if scene == null:
        _log_error("Failed to load scene: " + scene_path)
        _quit(1)
        return

    # Instantiate the scene
    var scene_instance = scene.instantiate()
    if scene_instance == null:
        _log_error("Failed to instantiate scene: " + scene_path)
        _quit(1)
        return

    _log_debug("Scene instantiated successfully")

    # Validation results
    var is_valid = true
    var errors = []
    var warnings = []

    # 1. Validate source node exists
    var source_node = scene_instance.get_node_or_null(NodePath(source_node_path))
    if source_node == null:
        is_valid = false
        errors.append("Source node not found: " + source_node_path)
        _log_error("Source node not found: " + source_node_path)
    else:
        _log_debug("Source node found: " + str(source_node))

        # 2. Validate signal exists on source node
        if not source_node.has_signal(signal_name):
            is_valid = false
            errors.append("Signal '" + signal_name + "' not found on source node")
            _log_error("Signal '" + signal_name + "' not found on source node")
        else:
            _log_debug("Signal exists on source node")

    # 3. Validate target node exists
    var target_node = scene_instance.get_node_or_null(NodePath(target_node_path))
    if target_node == null:
        is_valid = false
        errors.append("Target node not found: " + target_node_path)
        _log_error("Target node not found: " + target_node_path)
    else:
        _log_debug("Target node found: " + str(target_node))

        # 4. Check if method exists on target node (warning only, not an error)
        if target_node.has_method(method_name):
            _log_debug("Method exists on target node")
        else:
            warnings.append("Method '" + method_name + "' does not exist on target node yet. Make sure to add it to the target node's script.")
            print("WARNING: Method '" + method_name + "' does not exist on target node yet.")

    # Clean up
    scene_instance.free()

    # Build result
    var result = {
        "valid": is_valid,
        "scene_path": scene_path,
        "connection": {
            "source_node": source_node_path,
            "signal": signal_name,
            "target_node": target_node_path,
            "method": method_name
        }
    }

    if errors.size() > 0:
        result["errors"] = errors

    if warnings.size() > 0:
        result["warnings"] = warnings

    # Output the result
    print(JSON.stringify(result))

    if is_valid:
        _log_info("validate_connection operation completed - connection is valid")
    else:
        _log_info("validate_connection operation completed - connection is NOT valid")
