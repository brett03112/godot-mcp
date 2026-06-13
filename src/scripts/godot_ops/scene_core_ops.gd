# Phase 6.B final-pass scene core operation module.
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


func get_script_by_name(name_of_class):
    if debug_mode:
        print("Attempting to get script for class: " + name_of_class)
    
    # Try to load it directly if it's a resource path
    if ResourceLoader.exists(name_of_class, "Script"):
        if debug_mode:
            print("Resource exists, loading directly: " + name_of_class)
        var script = load(name_of_class) as Script
        if script:
            if debug_mode:
                print("Successfully loaded script from path")
            return script
        else:
            printerr("Failed to load script from path: " + name_of_class)
    elif debug_mode:
        print("Resource not found, checking global class registry")
    
    # Search for it in the global class registry if it's a class name
    var global_classes = ProjectSettings.get_global_class_list()
    if debug_mode:
        print("Searching through " + str(global_classes.size()) + " global classes")
    
    for global_class in global_classes:
        var found_name_of_class = global_class["class"]
        var found_path = global_class["path"]
        
        if found_name_of_class == name_of_class:
            if debug_mode:
                print("Found matching class in registry: " + found_name_of_class + " at path: " + found_path)
            var script = load(found_path) as Script
            if script:
                if debug_mode:
                    print("Successfully loaded script from registry")
                return script
            else:
                printerr("Failed to load script from registry path: " + found_path)
                break
    
    printerr("Could not find script for class: " + name_of_class)
    return null

# Instantiate a class by name

func instantiate_class(name_of_class):
    if name_of_class.is_empty():
        printerr("Cannot instantiate class: name is empty")
        return null
    
    var result = null
    if debug_mode:
        print("Attempting to instantiate class: " + name_of_class)
    
    # Check if it's a built-in class
    if ClassDB.class_exists(name_of_class):
        if debug_mode:
            print("Class exists in ClassDB, using ClassDB.instantiate()")
        if ClassDB.can_instantiate(name_of_class):
            result = ClassDB.instantiate(name_of_class)
            if result == null:
                printerr("ClassDB.instantiate() returned null for class: " + name_of_class)
        else:
            printerr("Class exists but cannot be instantiated: " + name_of_class)
            printerr("This may be an abstract class or interface that cannot be directly instantiated")
    else:
        # Try to get the script
        if debug_mode:
            print("Class not found in ClassDB, trying to get script")
        var script = get_script_by_name(name_of_class)
        if script is GDScript:
            if debug_mode:
                print("Found GDScript, creating instance")
            result = script.new()
        else:
            printerr("Failed to get script for class: " + name_of_class)
            return null
    
    if result == null:
        printerr("Failed to instantiate class: " + name_of_class)
    elif debug_mode:
        print("Successfully instantiated class: " + name_of_class + " of type: " + result.get_class())
    
    return result

# Create a new scene with a specified root node type

func create_scene(params):
    print("Creating scene: " + params.scene_path)
    
    # Get project paths and log them for debugging
    var project_res_path = "res://"
    var project_user_path = "user://"
    var global_res_path = ProjectSettings.globalize_path(project_res_path)
    var global_user_path = ProjectSettings.globalize_path(project_user_path)
    
    if debug_mode:
        print("Project paths:")
        print("- res:// path: " + project_res_path)
        print("- user:// path: " + project_user_path)
        print("- Globalized res:// path: " + global_res_path)
        print("- Globalized user:// path: " + global_user_path)
        
        # Print some common environment variables for debugging
        print("Environment variables:")
        var env_vars = ["PATH", "HOME", "USER", "TEMP", "GODOT_PATH"]
        for env_var in env_vars:
            if OS.has_environment(env_var):
                print("  " + env_var + " = " + OS.get_environment(env_var))
    
    # Normalize the scene path
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    # Convert resource path to an absolute path
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    # Get the scene directory paths
    var scene_dir_res = full_scene_path.get_base_dir()
    var scene_dir_abs = absolute_scene_path.get_base_dir()
    if debug_mode:
        print("Scene directory (resource path): " + scene_dir_res)
        print("Scene directory (absolute path): " + scene_dir_abs)
    
    # Only do extensive testing in debug mode
    if debug_mode:
        # Try to create a simple test file in the project root to verify write access
        var initial_test_file_path = "res://godot_mcp_test_write.tmp"
        var initial_test_file = FileAccess.open(initial_test_file_path, FileAccess.WRITE)
        if initial_test_file:
            initial_test_file.store_string("Test write access")
            initial_test_file.close()
            print("Successfully wrote test file to project root: " + initial_test_file_path)
            
            # Verify the test file exists
            var initial_test_file_exists = FileAccess.file_exists(initial_test_file_path)
            print("Test file exists check: " + str(initial_test_file_exists))
            
            # Clean up the test file
            if initial_test_file_exists:
                var remove_error = DirAccess.remove_absolute(ProjectSettings.globalize_path(initial_test_file_path))
                print("Test file removal result: " + str(remove_error))
        else:
            var write_error = FileAccess.get_open_error()
            printerr("Failed to write test file to project root: " + str(write_error))
            printerr("This indicates a serious permission issue with the project directory")
    
    # Use traditional if-else statement for better compatibility
    var root_node_type = "Node2D"  # Default value
    if params.has("root_node_type"):
        root_node_type = params.root_node_type
    if debug_mode:
        print("Root node type: " + root_node_type)
    
    # Create the root node
    var scene_root = instantiate_class(root_node_type)
    if not scene_root:
        printerr("Failed to instantiate node of type: " + root_node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    
    scene_root.name = "root"
    if debug_mode:
        print("Root node created with name: " + scene_root.name)
    
    # Pack the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        # Only do extensive testing in debug mode
        if debug_mode:
            # First, let's verify we can write to the project directory
            print("Testing write access to project directory...")
            var test_write_path = "res://test_write_access.tmp"
            var test_write_abs = ProjectSettings.globalize_path(test_write_path)
            var test_file = FileAccess.open(test_write_path, FileAccess.WRITE)
            
            if test_file:
                test_file.store_string("Write test")
                test_file.close()
                print("Successfully wrote test file to project directory")
                
                # Clean up test file
                if FileAccess.file_exists(test_write_path):
                    var remove_error = DirAccess.remove_absolute(test_write_abs)
                    print("Test file removal result: " + str(remove_error))
            else:
                var write_error = FileAccess.get_open_error()
                printerr("Failed to write test file to project directory: " + str(write_error))
                printerr("This may indicate permission issues with the project directory")
                # Continue anyway, as the scene directory might still be writable
        
        # Ensure the scene directory exists using DirAccess
        if debug_mode:
            print("Ensuring scene directory exists...")
        
        # Get the scene directory relative to res://
        var scene_dir_relative = scene_dir_res.substr(6)  # Remove "res://" prefix
        if debug_mode:
            print("Scene directory (relative to res://): " + scene_dir_relative)
        
        # Create the directory if needed
        if not scene_dir_relative.is_empty():
            # First check if it exists
            var dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
            if debug_mode:
                print("Directory exists check (absolute): " + str(dir_exists))
            
            if not dir_exists:
                if debug_mode:
                    print("Directory doesn't exist, creating: " + scene_dir_relative)
                
                # Try to create the directory using DirAccess
                var dir = DirAccess.open("res://")
                if dir == null:
                    var open_error = DirAccess.get_open_error()
                    printerr("Failed to open res:// directory: " + str(open_error))
                    
                    # Try alternative approach with absolute path
                    if debug_mode:
                        print("Trying alternative directory creation approach...")
                    var make_dir_error = DirAccess.make_dir_recursive_absolute(scene_dir_abs)
                    if debug_mode:
                        print("Make directory result (absolute): " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory using absolute path")
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                else:
                    # Create the directory using the DirAccess instance
                    if debug_mode:
                        print("Creating directory using DirAccess: " + scene_dir_relative)
                    var make_dir_error = dir.make_dir_recursive(scene_dir_relative)
                    if debug_mode:
                        print("Make directory result: " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory: " + scene_dir_relative)
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                
                # Verify the directory was created
                dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
                if debug_mode:
                    print("Directory exists check after creation: " + str(dir_exists))
                
                if not dir_exists:
                    printerr("Directory reported as created but does not exist: " + scene_dir_abs)
                    printerr("This may indicate a problem with path resolution or permissions")
                    quit(1)
            elif debug_mode:
                print("Directory already exists: " + scene_dir_abs)
        
        # Save the scene
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        
        if save_error == OK:
            # Only do extensive testing in debug mode
            if debug_mode:
                # Wait a moment to ensure file system has time to complete the write
                print("Waiting for file system to complete write operation...")
                OS.delay_msec(500)  # 500ms delay
                
                # Verify the file was actually created using multiple methods
                var file_check_abs = FileAccess.file_exists(absolute_scene_path)
                print("File exists check (absolute path): " + str(file_check_abs))
                
                var file_check_res = FileAccess.file_exists(full_scene_path)
                print("File exists check (resource path): " + str(file_check_res))
                
                var res_exists = ResourceLoader.exists(full_scene_path)
                print("Resource exists check: " + str(res_exists))
                
                # If file doesn't exist by absolute path, try to create a test file in the same directory
                if not file_check_abs and not file_check_res:
                    printerr("Scene file not found after save. Trying to diagnose the issue...")
                    
                    # Try to write a test file to the same directory
                    var test_scene_file_path = scene_dir_res + "/test_scene_file.tmp"
                    var test_scene_file = FileAccess.open(test_scene_file_path, FileAccess.WRITE)
                    
                    if test_scene_file:
                        test_scene_file.store_string("Test scene directory write")
                        test_scene_file.close()
                        print("Successfully wrote test file to scene directory: " + test_scene_file_path)
                        
                        # Check if the test file exists
                        var test_file_exists = FileAccess.file_exists(test_scene_file_path)
                        print("Test file exists: " + str(test_file_exists))
                        
                        if test_file_exists:
                            # Directory is writable, so the issue is with scene saving
                            printerr("Directory is writable but scene file wasn't created.")
                            printerr("This suggests an issue with ResourceSaver.save() or the packed scene.")
                            
                            # Try saving with a different approach
                            print("Trying alternative save approach...")
                            var alt_save_error = ResourceSaver.save(packed_scene, test_scene_file_path + ".tscn")
                            print("Alternative save result: " + str(alt_save_error))
                            
                            # Clean up test files
                            DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path))
                            if alt_save_error == OK:
                                DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path + ".tscn"))
                        else:
                            printerr("Test file couldn't be verified. This suggests filesystem access issues.")
                    else:
                        var write_error = FileAccess.get_open_error()
                        printerr("Failed to write test file to scene directory: " + str(write_error))
                        printerr("This confirms there are permission or path issues with the scene directory.")
                    
                    # Return error since we couldn't create the scene file
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
                
                # If we get here, at least one of our file checks passed
                if file_check_abs or file_check_res or res_exists:
                    print("Scene file verified to exist!")
                    
                    # Try to load the scene to verify it's valid
                    var test_load = ResourceLoader.load(full_scene_path)
                    if test_load:
                        print("Scene created and verified successfully at: " + params.scene_path)
                        print("Scene file can be loaded correctly.")
                    else:
                        print("Scene file exists but cannot be loaded. It may be corrupted or incomplete.")
                        # Continue anyway since the file exists
                    
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("All file existence checks failed despite successful save operation.")
                    printerr("This indicates a serious issue with file system access or path resolution.")
                    quit(1)
            else:
                # In non-debug mode, just check if the file exists
                var file_exists = FileAccess.file_exists(full_scene_path)
                if file_exists:
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
        else:
            # Handle specific error codes
            var error_message = "Failed to save scene. Error code: " + str(save_error)
            
            if save_error == ERR_CANT_CREATE:
                error_message += " (ERR_CANT_CREATE - Cannot create the scene file)"
            elif save_error == ERR_CANT_OPEN:
                error_message += " (ERR_CANT_OPEN - Cannot open the scene file for writing)"
            elif save_error == ERR_FILE_CANT_WRITE:
                error_message += " (ERR_FILE_CANT_WRITE - Cannot write to the scene file)"
            elif save_error == ERR_FILE_NO_PERMISSION:
                error_message += " (ERR_FILE_NO_PERMISSION - No permission to write the scene file)"
            
            printerr(error_message)
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        printerr("Error code: " + str(result))
        quit(1)

# Add a node to an existing scene

func add_node(params):
    print("Adding node to scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
        return
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Use traditional if-else statement for better compatibility
    var parent_path = "root"  # Default value
    if params.has("parent_node_path"):
        parent_path = params.parent_node_path
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = scene_root
    if parent_path != "root":
        parent = scene_root.get_node(parent_path.replace("root/", ""))
        if not parent:
            printerr("Parent node not found: " + parent_path)
            quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    if debug_mode:
        print("Instantiating node of type: " + params.node_type)
    var new_node = instantiate_class(params.node_type)
    if not new_node:
        printerr("Failed to instantiate node of type: " + params.node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    new_node.name = params.node_name
    if debug_mode:
        print("New node created with name: " + new_node.name)
    
    if params.has("properties"):
        if debug_mode:
            print("Setting properties on node")
        var properties = params.properties
        for property in properties:
            if debug_mode:
                print("Setting property: " + property + " = " + str(properties[property]))
            new_node.set(property, properties[property])
    
    parent.add_child(new_node)
    new_node.owner = scene_root
    if debug_mode:
        print("Node added to parent and ownership set")
    
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            if debug_mode:
                var file_check_after = FileAccess.file_exists(absolute_scene_path)
                print("File exists check after save: " + str(file_check_after))
                if file_check_after:
                    print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
                else:
                    printerr("File reported as saved but does not exist at: " + absolute_scene_path)
            else:
                print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))
    scene_root.free()
    packed_scene = null

# Load a sprite into a Sprite2D node

func load_sprite(params):
    print("Loading sprite into scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Ensure the texture path starts with res:// for Godot's resource system
    var full_texture_path = params.texture_path
    if not full_texture_path.begins_with("res://"):
        full_texture_path = "res://" + full_texture_path
    
    if debug_mode:
        print("Full texture path (with res://): " + full_texture_path)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Find the sprite node
    var node_path = params.node_path
    if debug_mode:
        print("Original node path: " + node_path)
    
    if node_path.begins_with("root/"):
        node_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Node path after removing 'root/' prefix: " + node_path)
    
    var sprite_node = null
    if node_path == "":
        # If no node path, assume root is the sprite
        sprite_node = scene_root
        if debug_mode:
            print("Using root node as sprite node")
    else:
        sprite_node = scene_root.get_node(node_path)
        if sprite_node and debug_mode:
            print("Found sprite node: " + sprite_node.name)
    
    if not sprite_node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Check if the node is a Sprite2D or compatible type
    if debug_mode:
        print("Node class: " + sprite_node.get_class())
    if not (sprite_node is Sprite2D or sprite_node is Sprite3D or sprite_node is TextureRect):
        printerr("Node is not a sprite-compatible type: " + sprite_node.get_class())
        quit(1)
    
    # Load the texture
    if debug_mode:
        print("Loading texture from: " + full_texture_path)
    var texture = load(full_texture_path)
    if not texture:
        printerr("Failed to load texture: " + full_texture_path)
        quit(1)
    
    if debug_mode:
        print("Texture loaded successfully")
    
    # Set the texture on the sprite
    if sprite_node is Sprite2D or sprite_node is Sprite3D:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on Sprite2D/Sprite3D node")
    elif sprite_node is TextureRect:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on TextureRect node")
    
    # Save the modified scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_scene_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Sprite loaded successfully with texture: " + full_texture_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_scene_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_scene_path)
            else:
                print("Sprite loaded successfully with texture: " + full_texture_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))
    scene_root.free()
    texture = null
    packed_scene = null

# Export a scene as a MeshLibrary resource

func save_scene(params):
    print("Saving scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Determine save path
    var save_path = params.new_path if params.has("new_path") else full_scene_path
    if params.has("new_path") and not save_path.begins_with("res://"):
        save_path = "res://" + save_path
    
    if debug_mode:
        print("Save path: " + save_path)
    
    # Create directory if it doesn't exist
    if params.has("new_path"):
        var dir = DirAccess.open("res://")
        if dir == null:
            printerr("Failed to open res:// directory")
            printerr("DirAccess error: " + str(DirAccess.get_open_error()))
            quit(1)
            
        var scene_dir = save_path.get_base_dir()
        if debug_mode:
            print("Scene directory: " + scene_dir)
        
        if scene_dir != "res://" and not dir.dir_exists(scene_dir.substr(6)):  # Remove "res://" prefix
            if debug_mode:
                print("Creating directory: " + scene_dir)
            var error = dir.make_dir_recursive(scene_dir.substr(6))  # Remove "res://" prefix
            if error != OK:
                printerr("Failed to create directory: " + scene_dir + ", error: " + str(error))
                quit(1)
    
    # Create a packed scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + save_path)
        var error = ResourceSaver.save(packed_scene, save_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created/updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(save_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Scene saved successfully to: " + save_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(save_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + save_path)
            else:
                print("Scene saved successfully to: " + save_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))
    scene_root.free()
    packed_scene = null

# Helper function to convert type enum to string

func modify_node_property(params: Dictionary):
    log_info("Starting modify_node_property operation")
    var scene_path = params.get("scene_path", "")
    var node_path_str = params.get("node_path", "")
    var property_name = params.get("property_name", "")
    var property_value = params.get("property_value", null)

    if scene_path.is_empty() or node_path_str.is_empty() or property_name.is_empty():
        log_error("scene_path, node_path, and property_name are required")
        quit(1)

    var full_path = "res://" + scene_path
    var packed_scene = ResourceLoader.load(full_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if scene_root == null:
        log_error("Failed to instantiate scene")
        quit(1)

    # Find the target node
    var target_node: Node
    if node_path_str == ".":
        target_node = scene_root
    else:
        target_node = scene_root.get_node_or_null(NodePath(node_path_str))

    if target_node == null:
        log_error("Node not found at path: " + node_path_str)
        scene_root.queue_free()
        quit(1)

    # Convert value to appropriate type
    var converted_value = _convert_property_value(property_value, target_node, property_name)

    # Set the property
    target_node.set(property_name, converted_value)
    log_info("Set property '%s' on node '%s'" % [property_name, node_path_str])

    # Save the scene
    var new_packed = PackedScene.new()
    var err = new_packed.pack(scene_root)
    if err != OK:
        log_error("Failed to pack scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    err = ResourceSaver.save(new_packed, full_path)
    if err != OK:
        log_error("Failed to save scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    scene_root.queue_free()

    var output = {
        "success": true,
        "scene_path": scene_path,
        "node_path": node_path_str,
        "property_name": property_name,
        "property_value": str(converted_value)
    }
    print(JSON.stringify(output))
    log_info("modify_node_property completed successfully")

func remove_node_op(params: Dictionary):
    log_info("Starting remove_node operation")
    var scene_path = params.get("scene_path", "")
    var node_path_str = params.get("node_path", "")
    var keep_children = params.get("keep_children", false)

    if scene_path.is_empty() or node_path_str.is_empty():
        log_error("scene_path and node_path are required")
        quit(1)

    if node_path_str == ".":
        log_error("Cannot remove root node")
        quit(1)

    var full_path = "res://" + scene_path
    var packed_scene = ResourceLoader.load(full_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if scene_root == null:
        log_error("Failed to instantiate scene")
        quit(1)

    var target_node = scene_root.get_node_or_null(NodePath(node_path_str))
    if target_node == null:
        log_error("Node not found: " + node_path_str)
        scene_root.queue_free()
        quit(1)

    var parent_node = target_node.get_parent()
    var removed_children = 0

    if keep_children and target_node.get_child_count() > 0:
        # Reparent children to the removed node's parent
        var children = []
        for child in target_node.get_children():
            children.append(child)
        for child in children:
            target_node.remove_child(child)
            parent_node.add_child(child)
            child.owner = scene_root
            _set_owner_recursive(child, scene_root)
            removed_children += 1

    parent_node.remove_child(target_node)
    target_node.queue_free()

    # Save
    var new_packed = PackedScene.new()
    var err = new_packed.pack(scene_root)
    if err != OK:
        log_error("Failed to pack scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    err = ResourceSaver.save(new_packed, full_path)
    if err != OK:
        log_error("Failed to save scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    scene_root.queue_free()

    var output = {
        "success": true,
        "removed_node": node_path_str,
        "keep_children": keep_children,
        "reparented_children": removed_children
    }
    print(JSON.stringify(output))
    log_info("remove_node completed successfully")

func duplicate_node(params: Dictionary):
    log_info("Starting duplicate_node operation")
    var scene_path = params.get("scene_path", "")
    var node_path_str = params.get("node_path", "")
    var new_name = params.get("new_name", "")

    if scene_path.is_empty() or node_path_str.is_empty():
        log_error("scene_path and node_path are required")
        quit(1)

    var full_path = "res://" + scene_path
    var packed_scene = ResourceLoader.load(full_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if scene_root == null:
        log_error("Failed to instantiate scene")
        quit(1)

    var target_node: Node
    if node_path_str == ".":
        log_error("Cannot duplicate root node")
        scene_root.queue_free()
        quit(1)
    else:
        target_node = scene_root.get_node_or_null(NodePath(node_path_str))

    if target_node == null:
        log_error("Node not found: " + node_path_str)
        scene_root.queue_free()
        quit(1)

    # Duplicate the node with children
    var dup = target_node.duplicate()
    if new_name.is_empty():
        new_name = target_node.name + "2"
    dup.name = new_name

    # Add as sibling (same parent)
    target_node.get_parent().add_child(dup)
    dup.owner = scene_root
    _set_owner_recursive(dup, scene_root)

    # Save
    var new_packed = PackedScene.new()
    var err = new_packed.pack(scene_root)
    if err != OK:
        log_error("Failed to pack scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    err = ResourceSaver.save(new_packed, full_path)
    if err != OK:
        log_error("Failed to save scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    scene_root.queue_free()

    var output = {
        "success": true,
        "original_node": node_path_str,
        "new_name": new_name,
        "scene_path": scene_path
    }
    print(JSON.stringify(output))
    log_info("duplicate_node completed successfully")

func reparent_node(params: Dictionary):
    log_info("Starting reparent_node operation")
    var scene_path = params.get("scene_path", "")
    var node_path_str = params.get("node_path", "")
    var new_parent_path = params.get("new_parent_path", "")

    if scene_path.is_empty() or node_path_str.is_empty() or new_parent_path.is_empty():
        log_error("scene_path, node_path, and new_parent_path are required")
        quit(1)

    if node_path_str == ".":
        log_error("Cannot reparent root node")
        quit(1)

    var full_path = "res://" + scene_path
    var packed_scene = ResourceLoader.load(full_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if scene_root == null:
        log_error("Failed to instantiate scene")
        quit(1)

    var target_node = scene_root.get_node_or_null(NodePath(node_path_str))
    if target_node == null:
        log_error("Node not found: " + node_path_str)
        scene_root.queue_free()
        quit(1)

    var new_parent: Node
    if new_parent_path == ".":
        new_parent = scene_root
    else:
        new_parent = scene_root.get_node_or_null(NodePath(new_parent_path))

    if new_parent == null:
        log_error("New parent not found: " + new_parent_path)
        scene_root.queue_free()
        quit(1)

    # Reparent — must unset owner before reparenting to avoid inconsistency
    var old_parent = target_node.get_parent()
    var old_parent_path := _scene_core_relative_path(scene_root, old_parent)
    target_node.owner = null
    _clear_owner_recursive(target_node)
    old_parent.remove_child(target_node)
    new_parent.add_child(target_node)
    target_node.owner = scene_root
    _set_owner_recursive(target_node, scene_root)

    # Save
    var new_packed = PackedScene.new()
    var err = new_packed.pack(scene_root)
    if err != OK:
        log_error("Failed to pack scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    err = ResourceSaver.save(new_packed, full_path)
    if err != OK:
        log_error("Failed to save scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    scene_root.queue_free()

    var output = {
        "success": true,
        "node": node_path_str,
        "old_parent": old_parent_path,
        "new_parent": new_parent_path,
        "scene_path": scene_path
    }
    print(JSON.stringify(output))
    log_info("reparent_node completed successfully")


func _scene_core_relative_path(scene_root: Node, node: Node) -> String:
    if node == scene_root:
        return "."
    var names := []
    var current := node
    while current != null and current != scene_root:
        names.push_front(str(current.name))
        current = current.get_parent()
    if current != scene_root:
        return ""
    return "/".join(names)


# Helper: recursively set owner for all descendants

func _set_owner_recursive(node: Node, owner: Node):
    for child in node.get_children():
        child.owner = owner
        _set_owner_recursive(child, owner)


# Helper: recursively clear owner for reparenting

func _clear_owner_recursive(node: Node):
    for child in node.get_children():
        child.owner = null
        _clear_owner_recursive(child)


# Helper: convert a value to the appropriate Godot type based on the target property

func _convert_property_value(value, node: Node, property_name: String):
    if value == null:
        return null

    # If it's a string that looks like a Godot type constructor, evaluate it
    if value is String:
        var s = value.strip_edges()
        if s.begins_with("Vector2("):
            var inner = s.substr(8, s.length() - 9)
            var parts = inner.split(",")
            if parts.size() >= 2:
                return Vector2(float(parts[0].strip_edges()), float(parts[1].strip_edges()))
        elif s.begins_with("Vector3("):
            var inner = s.substr(8, s.length() - 9)
            var parts = inner.split(",")
            if parts.size() >= 3:
                return Vector3(float(parts[0].strip_edges()), float(parts[1].strip_edges()), float(parts[2].strip_edges()))
        elif s.begins_with("Color("):
            var inner = s.substr(6, s.length() - 7)
            var parts = inner.split(",")
            if parts.size() >= 4:
                return Color(float(parts[0].strip_edges()), float(parts[1].strip_edges()), float(parts[2].strip_edges()), float(parts[3].strip_edges()))
            elif parts.size() >= 3:
                return Color(float(parts[0].strip_edges()), float(parts[1].strip_edges()), float(parts[2].strip_edges()))
        elif s.begins_with("Transform3D("):
            # Basic Transform3D parsing for identity or simple transforms
            pass  # Complex types fall through
        elif s == "true":
            return true
        elif s == "false":
            return false
        elif s.is_valid_float():
            return float(s)
        elif s.is_valid_int():
            return int(s)
        # Otherwise return as string
        return s

    return value


# ─── Tier 2: Particle System Designer ────────────────────────────────────────
