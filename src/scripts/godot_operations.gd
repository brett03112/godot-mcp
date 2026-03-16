#!/usr/bin/env -S godot --headless --script
extends SceneTree

# Debug mode flag
var debug_mode = false

func _init():
    var args = OS.get_cmdline_args()
    
    # Check for debug flag
    debug_mode = "--debug-godot" in args
    
    # Find the script argument and determine the positions of operation and params
    var script_index = args.find("--script")
    if script_index == -1:
        log_error("Could not find --script argument")
        quit(1)
    
    # The operation should be 2 positions after the script path (script_index + 1 is the script path itself)
    var operation_index = script_index + 2
    # The params should be 3 positions after the script path
    var params_index = script_index + 3
    
    if args.size() <= params_index:
        log_error("Usage: godot --headless --script godot_operations.gd <operation> <json_params>")
        log_error("Not enough command-line arguments provided.")
        quit(1)
    
    # Log all arguments for debugging
    log_debug("All arguments: " + str(args))
    log_debug("Script index: " + str(script_index))
    log_debug("Operation index: " + str(operation_index))
    log_debug("Params index: " + str(params_index))
    
    var operation = args[operation_index]
    var params_json = args[params_index]
    
    log_info("Operation: " + operation)
    log_debug("Params JSON: " + params_json)
    
    # Parse JSON using Godot 4.x API
    var json = JSON.new()
    var error = json.parse(params_json)
    var params = null
    
    if error == OK:
        params = json.get_data()
    else:
        log_error("Failed to parse JSON parameters: " + params_json)
        log_error("JSON Error: " + json.get_error_message() + " at line " + str(json.get_error_line()))
        quit(1)
    
    if not params:
        log_error("Failed to parse JSON parameters: " + params_json)
        quit(1)
    
    log_info("Executing operation: " + operation)
    
    match operation:
        "create_scene":
            create_scene(params)
        "add_node":
            add_node(params)
        "load_sprite":
            load_sprite(params)
        "export_mesh_library":
            export_mesh_library(params)
        "save_scene":
            save_scene(params)
        "get_uid":
            get_uid(params)
        "resave_resources":
            resave_resources(params)
        "list_signals":
            list_signals(params)
        "list_connections":
            list_connections(params)
        "connect_signal":
            connect_signal(params)
        "disconnect_signal":
            disconnect_signal(params)
        "validate_connection":
            validate_connection(params)
        "analyze_script":
            analyze_script(params)
        "create_script":
            create_script(params)
        "modify_function":
            modify_function(params)
        "add_export_variable":
            add_export_variable(params)
        "extract_dependencies":
            extract_dependencies(params)
        "attach_script":
            attach_script(params)
        "create_animation_player":
            create_animation_player(params)
        "add_animation_track":
            add_animation_track(params)
        "add_keyframe":
            add_keyframe(params)
        "create_shader_material":
            create_shader_material(params)
        "create_test_suite":
            create_test_suite(params)
        "create_tilemap":
            create_tilemap(params)
        "paint_tiles":
            paint_tiles(params)
        "configure_tileset":
            configure_tileset(params)
        "generate_navmesh":
            generate_navmesh(params)
        # Tier 1: Scene Inspection & Manipulation
        "modify_node_property":
            modify_node_property(params)
        "remove_node":
            remove_node_op(params)
        "duplicate_node":
            duplicate_node(params)
        "reparent_node":
            reparent_node(params)
        # Tier 1: Shader Pipeline Completion
        "apply_material":
            apply_material(params)
        "set_shader_parameter":
            set_shader_parameter(params)
        # Tier 1: AnimationTree Configuration
        "configure_animation_tree":
            configure_animation_tree(params)
        "create_animation_library":
            create_animation_library(params)
        # Tier 2: Particle System Designer
        "create_particle_system":
            create_particle_system(params)
        "apply_particle_preset":
            apply_particle_preset(params)
        _:
            log_error("Unknown operation: " + operation)
            quit(1)
    
    quit()

# Logging functions
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    print("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)

# Get a script by name or path
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
    
    # Set the owner of the root node to itself (important for scene saving)
    scene_root.owner = scene_root
    
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

# Export a scene as a MeshLibrary resource
func export_mesh_library(params):
    print("Exporting MeshLibrary from scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Ensure the output path starts with res:// for Godot's resource system
    var full_output_path = params.output_path
    if not full_output_path.begins_with("res://"):
        full_output_path = "res://" + full_output_path
    
    if debug_mode:
        print("Full output path (with res://): " + full_output_path)
    
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
    if debug_mode:
        print("Loading scene from: " + full_scene_path)
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
    
    # Create a new MeshLibrary
    var mesh_library = MeshLibrary.new()
    if debug_mode:
        print("Created new MeshLibrary")
    
    # Get mesh item names if provided
    var mesh_item_names = params.mesh_item_names if params.has("mesh_item_names") else []
    var use_specific_items = mesh_item_names.size() > 0
    
    if debug_mode:
        if use_specific_items:
            print("Using specific mesh items: " + str(mesh_item_names))
        else:
            print("Using all mesh items in the scene")
    
    # Process all child nodes
    var item_id = 0
    if debug_mode:
        print("Processing child nodes...")
    
    for child in scene_root.get_children():
        if debug_mode:
            print("Checking child node: " + child.name)
        
        # Skip if not using all items and this item is not in the list
        if use_specific_items and not (child.name in mesh_item_names):
            if debug_mode:
                print("Skipping node " + child.name + " (not in specified items list)")
            continue
            
        # Check if the child has a mesh
        var mesh_instance = null
        if child is MeshInstance3D:
            mesh_instance = child
            if debug_mode:
                print("Node " + child.name + " is a MeshInstance3D")
        else:
            # Try to find a MeshInstance3D in the child's descendants
            if debug_mode:
                print("Searching for MeshInstance3D in descendants of " + child.name)
            for descendant in child.get_children():
                if descendant is MeshInstance3D:
                    mesh_instance = descendant
                    if debug_mode:
                        print("Found MeshInstance3D in descendant: " + descendant.name)
                    break
        
        if mesh_instance and mesh_instance.mesh:
            if debug_mode:
                print("Adding mesh: " + child.name)
            
            # Add the mesh to the library
            mesh_library.create_item(item_id)
            mesh_library.set_item_name(item_id, child.name)
            mesh_library.set_item_mesh(item_id, mesh_instance.mesh)
            if debug_mode:
                print("Added mesh to library with ID: " + str(item_id))
            
            # Add collision shape if available
            var collision_added = false
            for collision_child in child.get_children():
                if collision_child is CollisionShape3D and collision_child.shape:
                    mesh_library.set_item_shapes(item_id, [collision_child.shape])
                    if debug_mode:
                        print("Added collision shape from: " + collision_child.name)
                    collision_added = true
                    break
            
            if debug_mode and not collision_added:
                print("No collision shape found for mesh: " + child.name)
            
            # Add preview if available
            if mesh_instance.mesh:
                mesh_library.set_item_preview(item_id, mesh_instance.mesh)
                if debug_mode:
                    print("Added preview for mesh: " + child.name)
            
            item_id += 1
        elif debug_mode:
            print("Node " + child.name + " has no valid mesh")
    
    if debug_mode:
        print("Processed " + str(item_id) + " meshes")
    
    # Create directory if it doesn't exist
    var dir = DirAccess.open("res://")
    if dir == null:
        printerr("Failed to open res:// directory")
        printerr("DirAccess error: " + str(DirAccess.get_open_error()))
        quit(1)
        
    var output_dir = full_output_path.get_base_dir()
    if debug_mode:
        print("Output directory: " + output_dir)
    
    if output_dir != "res://" and not dir.dir_exists(output_dir.substr(6)):  # Remove "res://" prefix
        if debug_mode:
            print("Creating directory: " + output_dir)
        var error = dir.make_dir_recursive(output_dir.substr(6))  # Remove "res://" prefix
        if error != OK:
            printerr("Failed to create directory: " + output_dir + ", error: " + str(error))
            quit(1)
    
    # Save the mesh library
    if item_id > 0:
        if debug_mode:
            print("Saving MeshLibrary to: " + full_output_path)
        var error = ResourceSaver.save(mesh_library, full_output_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_output_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_output_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_output_path)
            else:
                print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
        else:
            printerr("Failed to save MeshLibrary: " + str(error))
    else:
        printerr("No valid meshes found in the scene")

# Find files with a specific extension recursively
func find_files(path, extension):
    var files = []
    var dir = DirAccess.open(path)
    
    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()
        
        while file_name != "":
            if dir.current_is_dir() and not file_name.begins_with("."):
                files.append_array(find_files(path + file_name + "/", extension))
            elif file_name.ends_with(extension):
                files.append(path + file_name)
            
            file_name = dir.get_next()
    
    return files

# Get UID for a specific file
func get_uid(params):
    if not params.has("file_path"):
        printerr("File path is required")
        quit(1)
    
    # Ensure the file path starts with res:// for Godot's resource system
    var file_path = params.file_path
    if not file_path.begins_with("res://"):
        file_path = "res://" + file_path
    
    print("Getting UID for file: " + file_path)
    if debug_mode:
        print("Full file path (with res://): " + file_path)
    
    # Get the absolute path for reference
    var absolute_path = ProjectSettings.globalize_path(file_path)
    if debug_mode:
        print("Absolute file path: " + absolute_path)
    
    # Ensure the file exists
    var file_check = FileAccess.file_exists(file_path)
    if debug_mode:
        print("File exists check: " + str(file_check))
    
    if not file_check:
        printerr("File does not exist at: " + file_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Check if the UID file exists
    var uid_path = file_path + ".uid"
    if debug_mode:
        print("UID file path: " + uid_path)
    
    var uid_check = FileAccess.file_exists(uid_path)
    if debug_mode:
        print("UID file exists check: " + str(uid_check))
    
    var f = FileAccess.open(uid_path, FileAccess.READ)
    
    if f:
        # Read the UID content
        var uid_content = f.get_as_text()
        f.close()
        if debug_mode:
            print("UID content read successfully")
        
        # Return the UID content
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "uid": uid_content.strip_edges(),
            "exists": true
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))
    else:
        if debug_mode:
            print("UID file does not exist or could not be opened")
        
        # UID file doesn't exist
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "exists": false,
            "message": "UID file does not exist for this file. Use resave_resources to generate UIDs."
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))

# Resave all resources to update UID references
func resave_resources(params):
    print("Resaving all resources to update UID references...")
    
    # Get project path if provided
    var project_path = "res://"
    if params.has("project_path"):
        project_path = params.project_path
        if not project_path.begins_with("res://"):
            project_path = "res://" + project_path
        if not project_path.ends_with("/"):
            project_path += "/"
    
    if debug_mode:
        print("Using project path: " + project_path)
    
    # Get all .tscn files
    if debug_mode:
        print("Searching for scene files in: " + project_path)
    var scenes = find_files(project_path, ".tscn")
    if debug_mode:
        print("Found " + str(scenes.size()) + " scenes")
    
    # Resave each scene
    var success_count = 0
    var error_count = 0
    
    for scene_path in scenes:
        if debug_mode:
            print("Processing scene: " + scene_path)
        
        # Check if the scene file exists
        var file_check = FileAccess.file_exists(scene_path)
        if debug_mode:
            print("Scene file exists check: " + str(file_check))
        
        if not file_check:
            printerr("Scene file does not exist at: " + scene_path)
            error_count += 1
            continue
        
        # Load the scene
        var scene = load(scene_path)
        if scene:
            if debug_mode:
                print("Scene loaded successfully, saving...")
            var error = ResourceSaver.save(scene, scene_path)
            if debug_mode:
                print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
            
            if error == OK:
                success_count += 1
                if debug_mode:
                    print("Scene saved successfully: " + scene_path)
                
                    # Verify the file was actually updated
                    var file_check_after = FileAccess.file_exists(scene_path)
                    print("File exists check after save: " + str(file_check_after))
                
                    if not file_check_after:
                        printerr("File reported as saved but does not exist at: " + scene_path)
            else:
                error_count += 1
                printerr("Failed to save: " + scene_path + ", error: " + str(error))
        else:
            error_count += 1
            printerr("Failed to load: " + scene_path)
    
    # Get all .gd and .shader files
    if debug_mode:
        print("Searching for script and shader files in: " + project_path)
    var scripts = find_files(project_path, ".gd") + find_files(project_path, ".shader") + find_files(project_path, ".gdshader")
    if debug_mode:
        print("Found " + str(scripts.size()) + " scripts/shaders")
    
    # Check for missing .uid files
    var missing_uids = 0
    var generated_uids = 0
    
    for script_path in scripts:
        if debug_mode:
            print("Checking UID for: " + script_path)
        var uid_path = script_path + ".uid"
        
        var uid_check = FileAccess.file_exists(uid_path)
        if debug_mode:
            print("UID file exists check: " + str(uid_check))
        
        var f = FileAccess.open(uid_path, FileAccess.READ)
        if not f:
            missing_uids += 1
            if debug_mode:
                print("Missing UID file for: " + script_path + ", generating...")
            
            # Force a save to generate UID
            var res = load(script_path)
            if res:
                var error = ResourceSaver.save(res, script_path)
                if debug_mode:
                    print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
                
                if error == OK:
                    generated_uids += 1
                    if debug_mode:
                        print("Generated UID for: " + script_path)
                    
                        # Verify the UID file was actually created
                        var uid_check_after = FileAccess.file_exists(uid_path)
                        print("UID file exists check after save: " + str(uid_check_after))
                    
                        if not uid_check_after:
                            printerr("UID file reported as generated but does not exist at: " + uid_path)
                else:
                    printerr("Failed to generate UID for: " + script_path + ", error: " + str(error))
            else:
                printerr("Failed to load resource: " + script_path)
        elif debug_mode:
            print("UID file already exists for: " + script_path)
    
    if debug_mode:
        print("Summary:")
        print("- Scenes processed: " + str(scenes.size()))
        print("- Scenes successfully saved: " + str(success_count))
        print("- Scenes with errors: " + str(error_count))
        print("- Scripts/shaders missing UIDs: " + str(missing_uids))
        print("- UIDs successfully generated: " + str(generated_uids))
    print("Resave operation complete")

# Save changes to a scene file
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

# List signals operation
func list_signals(params):
    log_info("Starting list_signals operation")
    
    if not params.has("nodeType"):
        log_error("nodeType parameter is required")
        quit(1)
    
    var node_type = params["nodeType"]
    log_debug("Node type: " + node_type)
    
    var node_instance = null
    var signals_list = []
    
    # Check if we need to load from a scene
    if params.has("scenePath") and params.has("nodePath"):
        var scene_path = params["scenePath"]
        var node_path = params["nodePath"]
        
        log_debug("Loading scene: " + scene_path)
        var scene = load(scene_path)
        if scene == null:
            log_error("Failed to load scene: " + scene_path)
            quit(1)
        
        var scene_instance = scene.instantiate()
        if scene_instance == null:
            log_error("Failed to instantiate scene: " + scene_path)
            quit(1)
        
        # Navigate to the specific node
        node_instance = scene_instance.get_node(NodePath(node_path))
        if node_instance == null:
            log_error("Failed to find node at path: " + node_path)
            scene_instance.free()
            quit(1)
    else:
        # Instantiate the node type directly
        log_debug("Instantiating node type: " + node_type)
        node_instance = instantiate_class(node_type)
        if node_instance == null:
            log_error("Failed to instantiate node type: " + node_type)
            quit(1)
    
    # Verify node_instance is valid
    if node_instance == null:
        log_error("Node instance is null, cannot get signal list")
        quit(1)
        return

    # Get the signal list
    log_debug("Getting signal list from node")
    var signal_list = node_instance.get_signal_list()
    
    for signal_info in signal_list:
        var signal_name = signal_info["name"]
        var signal_params = []
        
        # Extract parameter information
        if signal_info.has("args"):
            for arg_info in signal_info["args"]:
                var param_data = {
                    "name": arg_info["name"],
                    "type": type_string(arg_info["type"])
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
    log_info("list_signals operation completed successfully")

# Helper function to convert type enum to string
func type_string(type_enum):
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
func list_connections(params):
    log_info("Starting list_connections operation")
    
    if not params.has("scenePath"):
        log_error("scenePath parameter is required")
        quit(1)
        return
    
    var scene_path = params["scenePath"]
    log_debug("Scene path: " + scene_path)
    
    # Load the scene
    var scene = load(scene_path)
    if scene == null:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
        return
    
    # Instantiate the scene to get connections
    var scene_instance = scene.instantiate()
    if scene_instance == null:
        log_error("Failed to instantiate scene: " + scene_path)
        quit(1)
        return
    
    log_debug("Scene instantiated successfully")
    
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
    log_info("list_connections operation completed successfully")

# Connect signal operation
func connect_signal(params):
    log_info("Starting connect_signal operation")
    
    # Validate required parameters
    if not params.has("scenePath"):
        log_error("scenePath parameter is required")
        quit(1)
        return
    
    if not params.has("sourceNodePath"):
        log_error("sourceNodePath parameter is required")
        quit(1)
        return
    
    if not params.has("signalName"):
        log_error("signalName parameter is required")
        quit(1)
        return
    
    if not params.has("targetNodePath"):
        log_error("targetNodePath parameter is required")
        quit(1)
        return
    
    if not params.has("methodName"):
        log_error("methodName parameter is required")
        quit(1)
        return
    
    var scene_path = params["scenePath"]
    var source_node_path = params["sourceNodePath"]
    var signal_name = params["signalName"]
    var target_node_path = params["targetNodePath"]
    var method_name = params["methodName"]
    var connection_flags = params.get("flags", 0)
    var binds = params.get("binds", [])
    
    log_debug("Scene path: " + scene_path)
    log_debug("Source node: " + source_node_path)
    log_debug("Signal: " + signal_name)
    log_debug("Target node: " + target_node_path)
    log_debug("Method: " + method_name)
    
    # Load the scene
    var scene = load(scene_path)
    if scene == null:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
        return
    
    # Instantiate the scene
    var scene_instance = scene.instantiate()
    if scene_instance == null:
        log_error("Failed to instantiate scene: " + scene_path)
        quit(1)
        return
    
    log_debug("Scene instantiated successfully")
    
    # Get the source node
    var source_node = scene_instance.get_node(NodePath(source_node_path))
    if source_node == null:
        log_error("Failed to find source node: " + source_node_path)
        scene_instance.free()
        quit(1)
        return
    
    log_debug("Source node found: " + str(source_node))
    
    # Validate that the source node has the specified signal
    var has_signal = source_node.has_signal(signal_name)
    if not has_signal:
        log_error("Source node does not have signal: " + signal_name)
        log_error("Use list_signals to see available signals on this node")
        scene_instance.free()
        quit(1)
        return
    
    log_debug("Signal exists on source node")
    
    # Get the target node
    var target_node = scene_instance.get_node(NodePath(target_node_path))
    if target_node == null:
        log_error("Failed to find target node: " + target_node_path)
        scene_instance.free()
        quit(1)
        return
    
    log_debug("Target node found: " + str(target_node))
    
    # Check if the method exists on the target node (warning only, not a hard error)
    if target_node.has_method(method_name):
        log_debug("Method exists on target node")
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
        log_error("Failed to connect signal. Error code: " + str(connect_result))
        scene_instance.free()
        quit(1)
        return
    
    log_info("Signal connected successfully in runtime")

    # Now we need to save this connection to the scene file
    # PackedScene.pack() doesn't preserve runtime connections, so we'll edit the .tscn file directly

    # Clean up the scene instance first
    scene_instance.free()

    # Read the scene file
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if file == null:
        log_error("Failed to open scene file for reading: " + scene_path)
        quit(1)
        return

    var file_content = file.get_as_text()
    file.close()

    log_debug("Scene file read successfully")

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
        log_info("Connection already exists in scene file")
    else:
        # Add the connection line to the end of the file
        file_content += "\n" + connection_line + "\n"
        log_debug("Connection line added: " + connection_line)

        # Write the modified content back
        file = FileAccess.open(scene_path, FileAccess.WRITE)
        if file == null:
            log_error("Failed to open scene file for writing: " + scene_path)
            quit(1)
            return

        file.store_string(file_content)
        file.close()

        log_info("Scene file updated with connection")

    
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
    log_info("connect_signal operation completed successfully")

# Disconnect signal operation
func disconnect_signal(params):
    log_info("Starting disconnect_signal operation")

    # Validate required parameters
    if not params.has("scenePath"):
        log_error("scenePath parameter is required")
        quit(1)
        return

    if not params.has("sourceNodePath"):
        log_error("sourceNodePath parameter is required")
        quit(1)
        return

    if not params.has("signalName"):
        log_error("signalName parameter is required")
        quit(1)
        return

    if not params.has("targetNodePath"):
        log_error("targetNodePath parameter is required")
        quit(1)
        return

    if not params.has("methodName"):
        log_error("methodName parameter is required")
        quit(1)
        return

    var scene_path = params["scenePath"]
    var source_node_path = params["sourceNodePath"]
    var signal_name = params["signalName"]
    var target_node_path = params["targetNodePath"]
    var method_name = params["methodName"]

    log_debug("Scene path: " + scene_path)
    log_debug("Source node: " + source_node_path)
    log_debug("Signal: " + signal_name)
    log_debug("Target node: " + target_node_path)
    log_debug("Method: " + method_name)

    # Load the scene to validate that nodes exist
    var scene = load(scene_path)
    if scene == null:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
        return

    # Instantiate the scene
    var scene_instance = scene.instantiate()
    if scene_instance == null:
        log_error("Failed to instantiate scene: " + scene_path)
        quit(1)
        return

    log_debug("Scene instantiated successfully")

    # Validate source node exists
    var source_node = scene_instance.get_node(NodePath(source_node_path))
    if source_node == null:
        log_error("Failed to find source node: " + source_node_path)
        scene_instance.free()
        quit(1)
        return

    log_debug("Source node found: " + str(source_node))

    # Validate target node exists
    var target_node = scene_instance.get_node(NodePath(target_node_path))
    if target_node == null:
        log_error("Failed to find target node: " + target_node_path)
        scene_instance.free()
        quit(1)
        return

    log_debug("Target node found: " + str(target_node))

    # Clean up the scene instance
    scene_instance.free()

    # Read the scene file
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if file == null:
        log_error("Failed to open scene file for reading: " + scene_path)
        quit(1)
        return

    var file_content = file.get_as_text()
    file.close()

    log_debug("Scene file read successfully")

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
            log_info("Found connection to remove: " + line)
            modified = true
            # Skip this line (don't add it to new_lines)
        else:
            new_lines.append(line)

    if not modified:
        log_error("Connection not found in scene file")
        log_error("Expected connection starting with: " + base_connection)
        quit(1)
        return

    # Rebuild the file content
    var new_content = "\n".join(new_lines)

    # Write the modified content back
    file = FileAccess.open(scene_path, FileAccess.WRITE)
    if file == null:
        log_error("Failed to open scene file for writing: " + scene_path)
        quit(1)
        return

    file.store_string(new_content)
    file.close()

    log_info("Scene file updated - connection removed")

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
    log_info("disconnect_signal operation completed successfully")

# Validate connection operation
func validate_connection(params):
    log_info("Starting validate_connection operation")

    # Validate required parameters
    if not params.has("scenePath"):
        log_error("scenePath parameter is required")
        quit(1)
        return

    if not params.has("sourceNodePath"):
        log_error("sourceNodePath parameter is required")
        quit(1)
        return

    if not params.has("signalName"):
        log_error("signalName parameter is required")
        quit(1)
        return

    if not params.has("targetNodePath"):
        log_error("targetNodePath parameter is required")
        quit(1)
        return

    if not params.has("methodName"):
        log_error("methodName parameter is required")
        quit(1)
        return

    var scene_path = params["scenePath"]
    var source_node_path = params["sourceNodePath"]
    var signal_name = params["signalName"]
    var target_node_path = params["targetNodePath"]
    var method_name = params["methodName"]

    log_debug("Scene path: " + scene_path)
    log_debug("Source node: " + source_node_path)
    log_debug("Signal: " + signal_name)
    log_debug("Target node: " + target_node_path)
    log_debug("Method: " + method_name)

    # Load the scene
    var scene = load(scene_path)
    if scene == null:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
        return

    # Instantiate the scene
    var scene_instance = scene.instantiate()
    if scene_instance == null:
        log_error("Failed to instantiate scene: " + scene_path)
        quit(1)
        return

    log_debug("Scene instantiated successfully")

    # Validation results
    var is_valid = true
    var errors = []
    var warnings = []

    # 1. Validate source node exists
    var source_node = scene_instance.get_node_or_null(NodePath(source_node_path))
    if source_node == null:
        is_valid = false
        errors.append("Source node not found: " + source_node_path)
        log_error("Source node not found: " + source_node_path)
    else:
        log_debug("Source node found: " + str(source_node))

        # 2. Validate signal exists on source node
        if not source_node.has_signal(signal_name):
            is_valid = false
            errors.append("Signal '" + signal_name + "' not found on source node")
            log_error("Signal '" + signal_name + "' not found on source node")
        else:
            log_debug("Signal exists on source node")

    # 3. Validate target node exists
    var target_node = scene_instance.get_node_or_null(NodePath(target_node_path))
    if target_node == null:
        is_valid = false
        errors.append("Target node not found: " + target_node_path)
        log_error("Target node not found: " + target_node_path)
    else:
        log_debug("Target node found: " + str(target_node))

        # 4. Check if method exists on target node (warning only, not an error)
        if target_node.has_method(method_name):
            log_debug("Method exists on target node")
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
        log_info("validate_connection operation completed - connection is valid")
    else:
        log_info("validate_connection operation completed - connection is NOT valid")

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
    var base_indent = "\t" if lines[func_start_line].begins_with("\t") else "    "

    # Add lines before the function
    for i in range(func_start_line):
        new_lines.append(lines[i])

    # Add function signature (new or existing)
    if new_signature != "":
        # Use new signature
        var indent_str = ""
        for j in range(func_indent_level):
            indent_str += base_indent[0] if base_indent.length() > 0 else "\t"
        new_lines.append(indent_str + new_signature)
    else:
        # Keep existing signature
        new_lines.append(lines[func_start_line])

    # Add new function body with proper indentation
    var body_lines = new_body.split("\n")
    var body_indent_str = base_indent
    for k in range(func_indent_level):
        body_indent_str = (base_indent[0] if base_indent.length() > 0 else "\t") + body_indent_str

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

# Add an AnimationPlayer node to a scene and optionally create an initial animation
func create_animation_player(params):
    log_info("Creating AnimationPlayer in scene: " + params.scene_path)

    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path

    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        log_debug("Scene path (with res://): " + full_scene_path)
        log_debug("Absolute scene path: " + absolute_scene_path)

    if not FileAccess.file_exists(absolute_scene_path):
        log_error("Scene file does not exist at: " + absolute_scene_path)
        quit(1)

    var scene = load(full_scene_path)
    if not scene:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    if debug_mode:
        log_debug("Scene loaded successfully")

    var scene_root = scene.instantiate()
    if debug_mode:
        log_debug("Scene instantiated")

    # Get parent node path (default to root)
    var parent_path = "root"
    if params.has("parent_node_path"):
        parent_path = params.parent_node_path
    if debug_mode:
        log_debug("Parent path: " + parent_path)

    var parent = scene_root
    if parent_path != "root":
        parent = scene_root.get_node(parent_path.replace("root/", ""))
        if not parent:
            log_error("Parent node not found: " + parent_path)
            quit(1)
    if debug_mode:
        log_debug("Parent node found: " + parent.name)

    # Create AnimationPlayer node
    var animation_player_name = "AnimationPlayer"
    if params.has("animation_player_name"):
        animation_player_name = params.animation_player_name

    if debug_mode:
        log_debug("Creating AnimationPlayer node with name: " + animation_player_name)

    var animation_player = AnimationPlayer.new()
    animation_player.name = animation_player_name
    parent.add_child(animation_player)
    animation_player.owner = scene_root

    if debug_mode:
        log_debug("AnimationPlayer node created and added to parent")

    # Optionally create an initial animation
    var created_animation = false
    if params.has("initial_animation_name") and params.initial_animation_name != null:
        var anim_name = params.initial_animation_name
        if debug_mode:
            log_debug("Creating initial animation: " + anim_name)

        var animation = Animation.new()
        animation.length = 1.0  # Default 1 second length

        # Add the animation to the AnimationPlayer's library
        var library = animation_player.get_animation_library("")
        if library == null:
            # Create a new library if it doesn't exist
            library = AnimationLibrary.new()
            animation_player.add_animation_library("", library)

        library.add_animation(anim_name, animation)
        created_animation = true

        if debug_mode:
            log_debug("Animation created: " + anim_name)

    # Pack the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)

    if result == OK:
        if debug_mode:
            log_debug("Scene packed successfully")

        # Save the scene
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)

        if save_error == OK:
            log_info("AnimationPlayer added successfully to scene: " + params.scene_path)

            # Create result
            var output = {
                "scene_path": params.scene_path,
                "animation_player_name": animation_player_name,
                "parent_path": parent_path,
                "created_animation": created_animation
            }

            if created_animation:
                output["initial_animation_name"] = params.initial_animation_name

            # Output the result as JSON
            print(JSON.stringify(output))
            log_info("create_animation_player operation completed successfully")
        else:
            log_error("Failed to save scene. Error code: " + str(save_error))
            quit(1)
    else:
        log_error("Failed to pack scene: " + str(result))
        quit(1)

# Add a track to an existing animation in an AnimationPlayer node
func add_animation_track(params):
    log_info("Adding animation track to: " + params.animation_name)

    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path

    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        log_debug("Scene path (with res://): " + full_scene_path)
        log_debug("Absolute scene path: " + absolute_scene_path)

    if not FileAccess.file_exists(absolute_scene_path):
        log_error("Scene file does not exist at: " + absolute_scene_path)
        quit(1)

    var scene = load(full_scene_path)
    if not scene:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    if debug_mode:
        log_debug("Scene loaded successfully")

    var scene_root = scene.instantiate()
    if debug_mode:
        log_debug("Scene instantiated")

    # Get the AnimationPlayer node
    var anim_player_path = params.animation_player_path
    # Remove "root/" prefix if present
    if anim_player_path.begins_with("root/"):
        anim_player_path = anim_player_path.replace("root/", "")

    var anim_player = scene_root.get_node(anim_player_path)
    if not anim_player:
        log_error("AnimationPlayer node not found: " + params.animation_player_path)
        quit(1)

    if not anim_player is AnimationPlayer:
        log_error("Node is not an AnimationPlayer: " + params.animation_player_path)
        quit(1)

    if debug_mode:
        log_debug("AnimationPlayer found: " + anim_player.name)

    # Get the animation
    var animation_name = params.animation_name
    var library = anim_player.get_animation_library("")
    if library == null:
        log_error("AnimationPlayer has no default animation library")
        quit(1)

    if not library.has_animation(animation_name):
        log_error("Animation not found: " + animation_name)
        quit(1)

    var animation = library.get_animation(animation_name)
    if debug_mode:
        log_debug("Animation found: " + animation_name)

    # Determine track type and add the appropriate track
    var track_type = params.track_type
    var target_node_path = params.target_node_path
    var track_index = -1

    if debug_mode:
        log_debug("Track type: " + track_type)
        log_debug("Target node path: " + target_node_path)

    # Map track types to Animation.TrackType enum
    match track_type:
        "position":
            track_index = animation.add_track(Animation.TYPE_POSITION_3D)
            animation.track_set_path(track_index, target_node_path + ":position")
            if debug_mode:
                log_debug("Added position track")
        "rotation":
            track_index = animation.add_track(Animation.TYPE_ROTATION_3D)
            animation.track_set_path(track_index, target_node_path + ":rotation")
            if debug_mode:
                log_debug("Added rotation track")
        "scale":
            track_index = animation.add_track(Animation.TYPE_SCALE_3D)
            animation.track_set_path(track_index, target_node_path + ":scale")
            if debug_mode:
                log_debug("Added scale track")
        "property":
            track_index = animation.add_track(Animation.TYPE_VALUE)
            var property_path = params.get("property_path", "modulate")
            animation.track_set_path(track_index, target_node_path + ":" + property_path)
            if debug_mode:
                log_debug("Added property track for: " + property_path)
        "method":
            track_index = animation.add_track(Animation.TYPE_METHOD)
            animation.track_set_path(track_index, target_node_path)
            if debug_mode:
                log_debug("Added method track")
        "audio":
            track_index = animation.add_track(Animation.TYPE_AUDIO)
            animation.track_set_path(track_index, target_node_path)
            if debug_mode:
                log_debug("Added audio track")
        _:
            log_error("Unknown track type: " + track_type)
            quit(1)

    if track_index < 0:
        log_error("Failed to add track")
        quit(1)

    # Pack the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)

    if result == OK:
        if debug_mode:
            log_debug("Scene packed successfully")

        # Save the scene
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)

        if save_error == OK:
            log_info("Animation track added successfully")

            # Create result
            var output = {
                "scene_path": params.scene_path,
                "animation_player_path": params.animation_player_path,
                "animation_name": animation_name,
                "track_type": track_type,
                "track_index": track_index,
                "target_node_path": target_node_path
            }

            # Output the result as JSON
            print(JSON.stringify(output))
            log_info("add_animation_track operation completed successfully")
        else:
            log_error("Failed to save scene. Error code: " + str(save_error))
            quit(1)
    else:
        log_error("Failed to pack scene: " + str(result))
        quit(1)

# Add a keyframe to an animation track
func add_keyframe(params):
    log_info("Adding keyframe to animation: " + params.animation_name)

    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path

    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        log_debug("Scene path (with res://): " + full_scene_path)
        log_debug("Absolute scene path: " + absolute_scene_path)

    if not FileAccess.file_exists(absolute_scene_path):
        log_error("Scene file does not exist at: " + absolute_scene_path)
        quit(1)

    var scene = load(full_scene_path)
    if not scene:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    if debug_mode:
        log_debug("Scene loaded successfully")

    var scene_root = scene.instantiate()
    if debug_mode:
        log_debug("Scene instantiated")

    # Get the AnimationPlayer node
    var anim_player_path = params.animation_player_path
    # Remove "root/" prefix if present
    if anim_player_path.begins_with("root/"):
        anim_player_path = anim_player_path.replace("root/", "")

    var anim_player = scene_root.get_node(anim_player_path)
    if not anim_player:
        log_error("AnimationPlayer node not found: " + params.animation_player_path)
        quit(1)

    if not anim_player is AnimationPlayer:
        log_error("Node is not an AnimationPlayer: " + params.animation_player_path)
        quit(1)

    if debug_mode:
        log_debug("AnimationPlayer found: " + anim_player.name)

    # Get the animation
    var animation_name = params.animation_name
    var library = anim_player.get_animation_library("")
    if library == null:
        log_error("AnimationPlayer has no default animation library")
        quit(1)

    if not library.has_animation(animation_name):
        log_error("Animation not found: " + animation_name)
        quit(1)

    var animation = library.get_animation(animation_name)
    if debug_mode:
        log_debug("Animation found: " + animation_name)

    # Get track index
    var track_index = params.track_index
    if track_index < 0 or track_index >= animation.get_track_count():
        log_error("Invalid track index: " + str(track_index) + " (animation has " + str(animation.get_track_count()) + " tracks)")
        quit(1)

    if debug_mode:
        log_debug("Track index: " + str(track_index))

    # Get time and value
    var time = params.time
    var value = params.value
    var easing = params.get("easing", 1.0)

    if debug_mode:
        log_debug("Time: " + str(time))
        log_debug("Value: " + str(value))
        log_debug("Easing: " + str(easing))

    # Get the track type
    var track_type = animation.track_get_type(track_index)

    # Add keyframe based on track type
    if track_type == Animation.TYPE_VALUE:
        # For value tracks (properties)
        var key_index = animation.track_insert_key(track_index, time, value)
        animation.track_set_key_transition(track_index, key_index, easing)
        if debug_mode:
            log_debug("Added value keyframe at index: " + str(key_index))
    elif track_type == Animation.TYPE_POSITION_3D or track_type == Animation.TYPE_ROTATION_3D or track_type == Animation.TYPE_SCALE_3D:
        # For 3D transform tracks
        # Convert array to Vector3 if needed
        var vector_value = value
        if value is Array and value.size() >= 3:
            vector_value = Vector3(value[0], value[1], value[2])
        elif value is Array and value.size() == 2:
            # Handle 2D case (convert to Vector3 with z=1 for scale, z=0 for others)
            var z_default = 1.0 if track_type == Animation.TYPE_SCALE_3D else 0.0
            vector_value = Vector3(value[0], value[1], z_default)

        var key_index = animation.track_insert_key(track_index, time, vector_value)
        animation.track_set_key_transition(track_index, key_index, easing)
        if debug_mode:
            log_debug("Added 3D transform keyframe at index: " + str(key_index))
    elif track_type == Animation.TYPE_METHOD:
        # For method call tracks
        # Value should be a dictionary with "method" and "args"
        var method_name = value
        var args_array = []
        if value is Dictionary:
            method_name = value.get("method", "")
            args_array = value.get("args", [])

        var key_index = animation.track_insert_key(track_index, time, {"method": method_name, "args": args_array})
        if debug_mode:
            log_debug("Added method call keyframe at index: " + str(key_index))
    elif track_type == Animation.TYPE_AUDIO:
        # For audio tracks
        # Value should be an AudioStream resource path
        var stream = null
        if value is String and ResourceLoader.exists(value):
            stream = load(value)
        var key_index = animation.track_insert_key(track_index, time, stream)
        if debug_mode:
            log_debug("Added audio keyframe at index: " + str(key_index))
    else:
        log_error("Unsupported track type: " + str(track_type))
        quit(1)

    # Pack the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)

    if result == OK:
        if debug_mode:
            log_debug("Scene packed successfully")

        # Save the scene
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)

        if save_error == OK:
            log_info("Keyframe added successfully")

            # Create result
            var output = {
                "scene_path": params.scene_path,
                "animation_player_path": params.animation_player_path,
                "animation_name": animation_name,
                "track_index": track_index,
                "time": time,
                "value": value,
                "easing": easing
            }

            # Output the result as JSON
            print(JSON.stringify(output))
            log_info("add_keyframe operation completed successfully")
        else:
            log_error("Failed to save scene. Error code: " + str(save_error))
            quit(1)
    else:
        log_error("Failed to pack scene: " + str(result))
        quit(1)

# Get shader template code
func get_shader_template(template_name: String) -> Dictionary:
    var templates = {
        "dissolve": {
            "code": """shader_type canvas_item;

uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D dissolve_texture : hint_default_white;
uniform vec4 edge_color : source_color = vec4(1.0, 0.5, 0.0, 1.0);
uniform float edge_width : hint_range(0.0, 0.5) = 0.1;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float noise = texture(dissolve_texture, UV).r;

    float edge = smoothstep(dissolve_amount - edge_width, dissolve_amount, noise);
    float alpha = smoothstep(dissolve_amount, dissolve_amount + 0.01, noise);

    vec4 edge_glow = edge_color * (1.0 - edge);
    COLOR = mix(tex + edge_glow, tex, edge);
    COLOR.a *= alpha * tex.a;
}""",
            "type": "canvas_item"
        },
        "outline": {
            "code": """shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float outline_width : hint_range(0.0, 10.0) = 2.0;

void fragment() {
    vec4 col = texture(TEXTURE, UV);
    vec2 ps = TEXTURE_PIXEL_SIZE * outline_width;
    float a = col.a;

    a = max(a, texture(TEXTURE, UV + vec2(0.0, -ps.y)).a);
    a = max(a, texture(TEXTURE, UV + vec2(0.0, ps.y)).a);
    a = max(a, texture(TEXTURE, UV + vec2(-ps.x, 0.0)).a);
    a = max(a, texture(TEXTURE, UV + vec2(ps.x, 0.0)).a);

    COLOR = mix(outline_color, col, col.a);
    COLOR.a = a;
}""",
            "type": "canvas_item"
        },
        "damage_flash": {
            "code": """shader_type canvas_item;

uniform float flash_intensity : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 0.0, 0.0, 1.0);

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    COLOR = mix(tex, flash_color, flash_intensity * tex.a);
    COLOR.a = tex.a;
}""",
            "type": "canvas_item"
        },
        "hologram": {
            "code": """shader_type canvas_item;

uniform float scan_speed : hint_range(0.0, 10.0) = 2.0;
uniform vec4 tint_color : source_color = vec4(0.0, 1.0, 1.0, 1.0);
uniform float scan_intensity : hint_range(0.0, 1.0) = 0.5;

void fragment() {
    float scan = sin((UV.y + TIME * scan_speed) * 20.0) * 0.5 + 0.5;
    vec4 tex = texture(TEXTURE, UV);
    COLOR = tex * tint_color;
    COLOR.a *= mix(1.0 - scan_intensity, 1.0, scan) * tex.a;
}""",
            "type": "canvas_item"
        }
    }

    if templates.has(template_name):
        return templates[template_name]
    else:
        return {}

# Create a shader material with custom shader code
func create_shader_material(params):
    log_info("Creating shader material")

    var shader_path = params.shader_path
    var material_path = params.material_path
    var shader_code = params.get("shader_code", null)
    var shader_type = params.get("shader_type", null)
    var shader_parameters = params.get("shader_parameters", {})
    var template = params.get("template", null)

    # If template is provided, use template code
    if template:
        log_info("Using shader template: " + template)
        var template_data = get_shader_template(template)
        if template_data.is_empty():
            log_error("Unknown shader template: " + template)
            quit(1)

        shader_code = template_data["code"]
        # Use template's shader type if not provided
        if not shader_type:
            shader_type = template_data["type"]
        if debug_mode:
            log_debug("Template shader type: " + shader_type)

    # Validate we have shader code
    if not shader_code:
        log_error("No shader code provided (either via shaderCode or template)")
        quit(1)

    # Validate we have shader type
    if not shader_type:
        log_error("No shader type provided (either via shaderType or template)")
        quit(1)

    if debug_mode:
        log_debug("Shader path: " + shader_path)
        log_debug("Material path: " + material_path)
        log_debug("Shader type: " + shader_type)
        log_debug("Shader code length: " + str(shader_code.length()))

    # Ensure shader code starts with shader_type declaration
    if not shader_code.strip_edges().begins_with("shader_type"):
        log_error("Shader code must start with 'shader_type' declaration")
        quit(1)

    # Verify shader_type in code matches the parameter
    var shader_code_lines = shader_code.split("\n")
    var found_shader_type = false
    for line in shader_code_lines:
        var trimmed = line.strip_edges()
        if trimmed.begins_with("shader_type"):
            if shader_type in trimmed:
                found_shader_type = true
                break

    if not found_shader_type:
        log_error("Shader code shader_type does not match parameter: " + shader_type)
        quit(1)

    # Convert paths to absolute
    var full_shader_path = ProjectSettings.globalize_path("res://" + shader_path)
    var full_material_path = ProjectSettings.globalize_path("res://" + material_path)

    if debug_mode:
        log_debug("Full shader path: " + full_shader_path)
        log_debug("Full material path: " + full_material_path)

    # Create directories if they don't exist
    var shader_dir = full_shader_path.get_base_dir()
    if not DirAccess.dir_exists_absolute(shader_dir):
        var result = DirAccess.make_dir_recursive_absolute(shader_dir)
        if result != OK:
            log_error("Failed to create shader directory: " + shader_dir)
            quit(1)
        log_info("Created shader directory: " + shader_dir)

    var material_dir = full_material_path.get_base_dir()
    if not DirAccess.dir_exists_absolute(material_dir):
        var result = DirAccess.make_dir_recursive_absolute(material_dir)
        if result != OK:
            log_error("Failed to create material directory: " + material_dir)
            quit(1)
        log_info("Created material directory: " + material_dir)

    # Write the shader file
    var shader_file = FileAccess.open(full_shader_path, FileAccess.WRITE)
    if not shader_file:
        log_error("Failed to create shader file: " + full_shader_path)
        quit(1)

    shader_file.store_string(shader_code)
    shader_file.close()
    log_info("Shader file created: " + shader_path)

    # Load and validate the shader
    var shader = load("res://" + shader_path)
    if not shader:
        log_error("Failed to load shader: " + shader_path)
        log_error("Shader may contain syntax errors")
        quit(1)

    if not shader is Shader:
        log_error("Loaded resource is not a Shader")
        quit(1)

    # Check if shader has compilation errors
    # Note: In Godot 4.x, shader errors are logged but we can check if it's valid
    if debug_mode:
        log_debug("Shader loaded successfully and appears valid")

    # Create the ShaderMaterial
    var material = ShaderMaterial.new()
    material.shader = shader

    # Set shader parameters if provided
    if shader_parameters.size() > 0:
        for param_name in shader_parameters.keys():
            var param_value = shader_parameters[param_name]
            # Convert arrays to appropriate types
            if param_value is Array:
                # Check array size to determine type
                if param_value.size() == 2:
                    material.set_shader_parameter(param_name, Vector2(param_value[0], param_value[1]))
                elif param_value.size() == 3:
                    material.set_shader_parameter(param_name, Vector3(param_value[0], param_value[1], param_value[2]))
                elif param_value.size() == 4:
                    material.set_shader_parameter(param_name, Color(param_value[0], param_value[1], param_value[2], param_value[3]))
                else:
                    material.set_shader_parameter(param_name, param_value)
            else:
                material.set_shader_parameter(param_name, param_value)

            if debug_mode:
                log_debug("Set shader parameter: " + param_name + " = " + str(param_value))

    # Save the material as .tres
    var save_result = ResourceSaver.save(material, "res://" + material_path)
    if save_result != OK:
        log_error("Failed to save material: " + material_path)
        log_error("Error code: " + str(save_result))
        quit(1)

    log_info("Material saved: " + material_path)

    # Output the result as JSON
    var output = {
        "shader_path": shader_path,
        "material_path": material_path,
        "shader_type": shader_type,
        "parameters_set": shader_parameters.keys() if shader_parameters.size() > 0 else []
    }

    print(JSON.stringify(output))
    log_info("create_shader_material operation completed successfully")

# Create a test suite file for GUT (Godot Unit Test)
func create_test_suite(params):
    log_info("Creating test suite")

    var test_path = params.test_path
    var target_script = params.get("target_script", null)
    var test_cases = params.get("test_cases", [])
    var include_hooks = params.get("include_hooks", false)

    if debug_mode:
        log_debug("Test path: " + test_path)
        log_debug("Target script: " + str(target_script))
        log_debug("Test cases count: " + str(test_cases.size()))
        log_debug("Include hooks: " + str(include_hooks))

    # Create directory if needed
    var full_test_path = ProjectSettings.globalize_path("res://" + test_path)
    var test_dir = full_test_path.get_base_dir()
    if not DirAccess.dir_exists_absolute(test_dir):
        var dir_result = DirAccess.make_dir_recursive_absolute(test_dir)
        if dir_result != OK:
            log_error("Failed to create test directory: " + test_dir)
            quit(1)
        log_info("Created test directory: " + test_dir)

    # Generate test file content
    var test_content = ""

    # Add header comment
    test_content += "# GUT (Godot Unit Test) test file\n"
    test_content += "# Generated by Godot MCP\n"
    if target_script:
        test_content += "# Testing: " + target_script + "\n"
    test_content += "\n"

    # Extend GutTest
    test_content += "extends GutTest\n\n"

    # Add optional hooks
    if include_hooks:
        test_content += "# Runs before all tests\n"
        test_content += "func before_all():\n"
        test_content += "\tpass\n\n"

        test_content += "# Runs after all tests\n"
        test_content += "func after_all():\n"
        test_content += "\tpass\n\n"

        test_content += "# Runs before each test\n"
        test_content += "func before_each():\n"
        test_content += "\tpass\n\n"

        test_content += "# Runs after each test\n"
        test_content += "func after_each():\n"
        test_content += "\tpass\n\n"

    # Add test cases
    var test_count = 0
    if test_cases.size() > 0:
        for test_case in test_cases:
            var test_name = test_case.get("name", "")
            var description = test_case.get("description", "")
            var setup = test_case.get("setup", "")
            var assertions = test_case.get("assertions", [])

            # Ensure test name starts with "test_"
            if not test_name.begins_with("test_"):
                test_name = "test_" + test_name

            # Add test method
            if description:
                test_content += "# " + description + "\n"
            test_content += "func " + test_name + "():\n"

            # Add setup code if provided
            if setup and setup != "":
                for line in setup.split("\n"):
                    if line.strip_edges() != "":
                        test_content += "\t" + line + "\n"
                test_content += "\t\n"

            # Add assertions
            if assertions.size() > 0:
                for assertion in assertions:
                    test_content += "\t" + assertion + "\n"
            else:
                # Add a pass statement if no assertions
                test_content += "\tpass\n"

            test_content += "\n"
            test_count += 1
    else:
        # Create a default example test if no test cases provided
        test_content += "# Example test - replace with your actual tests\n"
        test_content += "func test_example():\n"
        test_content += "\tassert_eq(1 + 1, 2, \"Math should work\")\n\n"
        test_count = 1

    # Write the test file
    var file = FileAccess.open(full_test_path, FileAccess.WRITE)
    if not file:
        log_error("Failed to create test file: " + full_test_path)
        quit(1)

    file.store_string(test_content)
    file.close()

    log_info("Test file created: " + test_path)

    # Output result
    var output = {
        "test_path": test_path,
        "target_script": target_script if target_script else "",
        "test_count": test_count,
        "include_hooks": include_hooks
    }

    print(JSON.stringify(output))
    log_info("create_test_suite operation completed successfully")

# ===== PHASE 10: TILEMAP & LEVEL DESIGN =====

# Create a TileMap node in a scene
func create_tilemap(params):
    var scene_path = params.get("scene_path", "")
    var tilemap_name = params.get("tilemap_name", "TileMap")
    var parent_path = params.get("parent_path", ".")
    var tile_size = params.get("tile_size", {"x": 16, "y": 16})
    var tileset_path = params.get("tileset_path", "")
    var layers = params.get("layers", [])

    if scene_path.is_empty():
        log_error("Scene path is required")
        quit(1)

    # Load the scene
    var full_scene_path = "res://" + scene_path if not scene_path.begins_with("res://") else scene_path
    var packed_scene = ResourceLoader.load(full_scene_path) as PackedScene

    if not packed_scene:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)

    # Find parent node
    var parent_node = scene_root if parent_path == "." else scene_root.get_node_or_null(parent_path)
    if not parent_node:
        log_error("Parent node not found: " + parent_path)
        quit(1)

    # Check if TileMap already exists
    if parent_node.has_node(tilemap_name):
        log_error("TileMap node already exists: " + tilemap_name)
        quit(1)

    # Create TileMap node
    var tilemap = TileMap.new()
    tilemap.name = tilemap_name

    # Create or load TileSet
    var tileset: TileSet = null
    if not tileset_path.is_empty():
        var full_tileset_path = "res://" + tileset_path if not tileset_path.begins_with("res://") else tileset_path
        tileset = ResourceLoader.load(full_tileset_path) as TileSet
        if not tileset:
            log_error("Failed to load TileSet: " + full_tileset_path)
            quit(1)
    else:
        # Create a new TileSet
        tileset = TileSet.new()
        tileset.tile_size = Vector2i(int(tile_size.get("x", 16)), int(tile_size.get("y", 16)))

    tilemap.tile_set = tileset

    # Configure layers
    if layers.size() > 0:
        # Clear default layer and add named layers
        for i in range(layers.size()):
            if i == 0:
                tilemap.set_layer_name(0, layers[i])
            else:
                tilemap.add_layer(i)
                tilemap.set_layer_name(i, layers[i])

    # Add to parent
    parent_node.add_child(tilemap)
    tilemap.owner = scene_root

    # Save the scene
    var new_packed_scene = PackedScene.new()
    var pack_result = new_packed_scene.pack(scene_root)
    if pack_result != OK:
        log_error("Failed to pack scene: " + str(pack_result))
        quit(1)

    var save_result = ResourceSaver.save(new_packed_scene, full_scene_path)
    if save_result != OK:
        log_error("Failed to save scene: " + str(save_result))
        quit(1)

    log_info("TileMap created: " + tilemap_name)

    var output = {
        "success": true,
        "tilemap_name": tilemap_name,
        "scene_path": scene_path,
        "tile_size": tile_size,
        "layers": layers if layers.size() > 0 else ["Layer 0"]
    }

    print(JSON.stringify(output))
    log_info("create_tilemap operation completed successfully")

# Paint tiles in a TileMap
func paint_tiles(params):
    var scene_path = params.get("scene_path", "")
    var tilemap_path = params.get("tilemap_path", "")
    var layer = int(params.get("layer", 0))
    var source_id = int(params.get("source_id", 0))
    var tiles = params.get("tiles", [])
    var pattern = params.get("pattern", "single")
    var rect_start = params.get("rect_start", null)
    var rect_end = params.get("rect_end", null)

    if scene_path.is_empty():
        log_error("Scene path is required")
        quit(1)

    if tilemap_path.is_empty():
        log_error("TileMap path is required")
        quit(1)

    # Load the scene
    var full_scene_path = "res://" + scene_path if not scene_path.begins_with("res://") else scene_path
    var packed_scene = ResourceLoader.load(full_scene_path) as PackedScene

    if not packed_scene:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)

    # Find TileMap node
    var tilemap = scene_root.get_node_or_null(tilemap_path) as TileMap
    if not tilemap:
        log_error("TileMap not found: " + tilemap_path)
        quit(1)

    var painted_count = 0

    match pattern:
        "single":
            # Paint individual tiles
            for tile in tiles:
                var x = int(tile.get("x", 0))
                var y = int(tile.get("y", 0))
                var atlas_coords = tile.get("atlasCoords", {"x": 0, "y": 0})
                var atlas_x = int(atlas_coords.get("x", 0))
                var atlas_y = int(atlas_coords.get("y", 0))

                tilemap.set_cell(layer, Vector2i(x, y), source_id, Vector2i(atlas_x, atlas_y))
                painted_count += 1

        "rect":
            # Paint rectangular region
            if rect_start and rect_end and tiles.size() > 0:
                var start_x = int(rect_start.get("x", 0))
                var start_y = int(rect_start.get("y", 0))
                var end_x = int(rect_end.get("x", 0))
                var end_y = int(rect_end.get("y", 0))

                var atlas_coords = tiles[0].get("atlasCoords", {"x": 0, "y": 0})
                var atlas_x = int(atlas_coords.get("x", 0))
                var atlas_y = int(atlas_coords.get("y", 0))

                for x in range(min(start_x, end_x), max(start_x, end_x) + 1):
                    for y in range(min(start_y, end_y), max(start_y, end_y) + 1):
                        tilemap.set_cell(layer, Vector2i(x, y), source_id, Vector2i(atlas_x, atlas_y))
                        painted_count += 1

        "line":
            # Paint line (Bresenham's algorithm)
            if rect_start and rect_end and tiles.size() > 0:
                var x0 = int(rect_start.get("x", 0))
                var y0 = int(rect_start.get("y", 0))
                var x1 = int(rect_end.get("x", 0))
                var y1 = int(rect_end.get("y", 0))

                var atlas_coords = tiles[0].get("atlasCoords", {"x": 0, "y": 0})
                var atlas_x = int(atlas_coords.get("x", 0))
                var atlas_y = int(atlas_coords.get("y", 0))

                var dx = abs(x1 - x0)
                var dy = -abs(y1 - y0)
                var sx = 1 if x0 < x1 else -1
                var sy = 1 if y0 < y1 else -1
                var err = dx + dy

                while true:
                    tilemap.set_cell(layer, Vector2i(x0, y0), source_id, Vector2i(atlas_x, atlas_y))
                    painted_count += 1
                    if x0 == x1 and y0 == y1:
                        break
                    var e2 = 2 * err
                    if e2 >= dy:
                        err += dy
                        x0 += sx
                    if e2 <= dx:
                        err += dx
                        y0 += sy

        "erase":
            # Erase tiles (set to -1)
            for tile in tiles:
                var x = int(tile.get("x", 0))
                var y = int(tile.get("y", 0))
                tilemap.erase_cell(layer, Vector2i(x, y))
                painted_count += 1

    # Save the scene
    var new_packed_scene = PackedScene.new()
    var pack_result = new_packed_scene.pack(scene_root)
    if pack_result != OK:
        log_error("Failed to pack scene: " + str(pack_result))
        quit(1)

    var save_result = ResourceSaver.save(new_packed_scene, full_scene_path)
    if save_result != OK:
        log_error("Failed to save scene: " + str(save_result))
        quit(1)

    log_info("Painted " + str(painted_count) + " tiles")

    var output = {
        "success": true,
        "scene_path": scene_path,
        "tilemap_path": tilemap_path,
        "layer": layer,
        "pattern": pattern,
        "painted_count": painted_count
    }

    print(JSON.stringify(output))
    log_info("paint_tiles operation completed successfully")

# Configure TileSet properties
func configure_tileset(params):
    var tileset_path = params.get("tileset_path", "")
    var texture_path = params.get("texture_path", "")
    var tile_size = params.get("tile_size", {"x": 16, "y": 16})
    var tile_config = params.get("tile_config", [])
    var physics_layer = int(params.get("physics_layer", 0))
    var navigation_layer = int(params.get("navigation_layer", 0))

    if tileset_path.is_empty():
        log_error("TileSet path is required")
        quit(1)

    var full_tileset_path = "res://" + tileset_path if not tileset_path.begins_with("res://") else tileset_path

    # Load or create TileSet
    var tileset: TileSet = null
    if ResourceLoader.exists(full_tileset_path):
        tileset = ResourceLoader.load(full_tileset_path) as TileSet

    if not tileset:
        tileset = TileSet.new()

    # Set tile size
    tileset.tile_size = Vector2i(int(tile_size.get("x", 16)), int(tile_size.get("y", 16)))

    # Add physics layer if needed
    while tileset.get_physics_layers_count() <= physics_layer:
        tileset.add_physics_layer()

    # Add navigation layer if needed
    while tileset.get_navigation_layers_count() <= navigation_layer:
        tileset.add_navigation_layer()

    # Configure texture source if provided
    var source_id = 0
    if not texture_path.is_empty():
        var full_texture_path = "res://" + texture_path if not texture_path.begins_with("res://") else texture_path
        var texture = ResourceLoader.load(full_texture_path) as Texture2D

        if texture:
            # Create or get atlas source
            var atlas_source: TileSetAtlasSource = null
            if tileset.get_source_count() > 0 and tileset.has_source(0):
                var existing_source = tileset.get_source(0)
                if existing_source is TileSetAtlasSource:
                    atlas_source = existing_source

            if not atlas_source:
                atlas_source = TileSetAtlasSource.new()
                if tileset.has_source(0):
                    tileset.remove_source(0)
                tileset.add_source(atlas_source, 0)

            atlas_source.texture = texture
            atlas_source.texture_region_size = tileset.tile_size

            # Create tiles in atlas
            var tex_width = int(texture.get_width() / tileset.tile_size.x)
            var tex_height = int(texture.get_height() / tileset.tile_size.y)

            for y in range(tex_height):
                for x in range(tex_width):
                    var coords = Vector2i(x, y)
                    if not atlas_source.has_tile(coords):
                        atlas_source.create_tile(coords)

            source_id = 0
        else:
            log_error("Failed to load texture: " + full_texture_path)

    # Configure individual tiles
    var configured_count = 0
    if tile_config.size() > 0 and tileset.get_source_count() > 0:
        var atlas_source = tileset.get_source(source_id) as TileSetAtlasSource
        if atlas_source:
            for config in tile_config:
                var atlas_coords = config.get("atlasCoords", {"x": 0, "y": 0})
                var coords = Vector2i(int(atlas_coords.get("x", 0)), int(atlas_coords.get("y", 0)))

                if not atlas_source.has_tile(coords):
                    continue

                var tile_data = atlas_source.get_tile_data(coords, 0)
                if not tile_data:
                    continue

                # Configure collision
                var collision = config.get("collision", [])
                if collision.size() >= 3:
                    var polygon = PackedVector2Array()
                    for point in collision:
                        if point is Array and point.size() >= 2:
                            polygon.append(Vector2(point[0], point[1]))

                    if polygon.size() >= 3:
                        tile_data.set_collision_polygons_count(physics_layer, 1)
                        tile_data.set_collision_polygon_points(physics_layer, 0, polygon)

                # Configure navigation
                var navigation = config.get("navigation", [])
                if navigation.size() >= 3:
                    var nav_polygon = NavigationPolygon.new()
                    var outline = PackedVector2Array()
                    for point in navigation:
                        if point is Array and point.size() >= 2:
                            outline.append(Vector2(point[0], point[1]))

                    if outline.size() >= 3:
                        nav_polygon.add_outline(outline)
                        nav_polygon.make_polygons_from_outlines()
                        tile_data.set_navigation_polygon(navigation_layer, nav_polygon)

                # Configure terrain
                var terrain_set = config.get("terrainSet", -1)
                var terrain = config.get("terrain", -1)
                if terrain_set >= 0 and terrain >= 0:
                    tile_data.terrain_set = terrain_set
                    tile_data.terrain = terrain

                configured_count += 1

    # Save TileSet
    var save_result = ResourceSaver.save(tileset, full_tileset_path)
    if save_result != OK:
        log_error("Failed to save TileSet: " + str(save_result))
        quit(1)

    log_info("TileSet configured: " + tileset_path)

    var output = {
        "success": true,
        "tileset_path": tileset_path,
        "tile_size": tile_size,
        "configured_tiles": configured_count,
        "physics_layers": tileset.get_physics_layers_count(),
        "navigation_layers": tileset.get_navigation_layers_count()
    }

    print(JSON.stringify(output))
    log_info("configure_tileset operation completed successfully")

# Generate navigation mesh for 3D scenes
func generate_navmesh(params):
    var scene_path = params.get("scene_path", "")
    var region_name = params.get("region_name", "NavigationRegion3D")
    var parent_path = params.get("parent_path", ".")
    var cell_size = float(params.get("cell_size", 0.25))
    var cell_height = float(params.get("cell_height", 0.25))
    var agent_radius = float(params.get("agent_radius", 0.5))
    var agent_height = float(params.get("agent_height", 2.0))
    var agent_max_slope = float(params.get("agent_max_slope", 45.0))
    var agent_max_climb = float(params.get("agent_max_climb", 0.25))
    var source_geometry_mode = params.get("source_geometry_mode", "static_colliders")

    if scene_path.is_empty():
        log_error("Scene path is required")
        quit(1)

    # Load the scene
    var full_scene_path = "res://" + scene_path if not scene_path.begins_with("res://") else scene_path
    var packed_scene = ResourceLoader.load(full_scene_path) as PackedScene

    if not packed_scene:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)

    # Find parent node
    var parent_node = scene_root if parent_path == "." else scene_root.get_node_or_null(parent_path)
    if not parent_node:
        log_error("Parent node not found: " + parent_path)
        quit(1)

    # Create or get NavigationRegion3D
    var nav_region: NavigationRegion3D = null
    if parent_node.has_node(region_name):
        nav_region = parent_node.get_node(region_name) as NavigationRegion3D

    if not nav_region:
        nav_region = NavigationRegion3D.new()
        nav_region.name = region_name
        parent_node.add_child(nav_region)
        nav_region.owner = scene_root

    # Create NavigationMesh
    var navmesh = NavigationMesh.new()

    # Configure navigation mesh parameters
    navmesh.cell_size = cell_size
    navmesh.cell_height = cell_height
    navmesh.agent_radius = agent_radius
    navmesh.agent_height = agent_height
    navmesh.agent_max_slope = agent_max_slope
    navmesh.agent_max_climb = agent_max_climb

    # Set geometry source mode
    match source_geometry_mode:
        "static_colliders":
            navmesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
        "meshes":
            navmesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_MESH_INSTANCES
        "physics_bodies":
            navmesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_BOTH

    # Assign navigation mesh to region
    nav_region.navigation_mesh = navmesh

    # Save the scene
    var new_packed_scene = PackedScene.new()
    var pack_result = new_packed_scene.pack(scene_root)
    if pack_result != OK:
        log_error("Failed to pack scene: " + str(pack_result))
        quit(1)

    var save_result = ResourceSaver.save(new_packed_scene, full_scene_path)
    if save_result != OK:
        log_error("Failed to save scene: " + str(save_result))
        quit(1)

    log_info("NavigationRegion3D created: " + region_name)

    var output = {
        "success": true,
        "scene_path": scene_path,
        "region_name": region_name,
        "cell_size": cell_size,
        "cell_height": cell_height,
        "agent_radius": agent_radius,
        "agent_height": agent_height,
        "agent_max_slope": agent_max_slope,
        "agent_max_climb": agent_max_climb,
        "source_geometry_mode": source_geometry_mode,
        "note": "Navigation mesh geometry will be baked at runtime or in the Godot editor"
    }

    print(JSON.stringify(output))
    log_info("generate_navmesh operation completed successfully")


# =============================================================================
# Tier 1: Scene Inspection & Manipulation Operations
# =============================================================================

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

    # Reparent
    var old_parent = target_node.get_parent()
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
        "old_parent": str(old_parent.get_path()),
        "new_parent": new_parent_path,
        "scene_path": scene_path
    }
    print(JSON.stringify(output))
    log_info("reparent_node completed successfully")


# Helper: recursively set owner for all descendants
func _set_owner_recursive(node: Node, owner: Node):
    for child in node.get_children():
        child.owner = owner
        _set_owner_recursive(child, owner)


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


# =============================================================================
# Tier 1: Shader Pipeline Completion Operations
# =============================================================================

func apply_material(params: Dictionary):
    log_info("Starting apply_material operation")
    var scene_path = params.get("scene_path", "")
    var node_path_str = params.get("node_path", "")
    var material_path = params.get("material_path", "")
    var slot = params.get("slot", "auto")

    if scene_path.is_empty() or node_path_str.is_empty() or material_path.is_empty():
        log_error("scene_path, node_path, and material_path are required")
        quit(1)

    var full_scene_path = "res://" + scene_path
    var packed_scene = ResourceLoader.load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene_root = packed_scene.instantiate()
    if scene_root == null:
        log_error("Failed to instantiate scene")
        quit(1)

    var target_node: Node
    if node_path_str == ".":
        target_node = scene_root
    else:
        target_node = scene_root.get_node_or_null(NodePath(node_path_str))

    if target_node == null:
        log_error("Node not found: " + node_path_str)
        scene_root.queue_free()
        quit(1)

    # Load the material
    var full_mat_path = "res://" + material_path
    var material = ResourceLoader.load(full_mat_path)
    if material == null:
        log_error("Failed to load material: " + full_mat_path)
        scene_root.queue_free()
        quit(1)

    var applied_slot = slot

    # Auto-detect appropriate slot
    if slot == "auto":
        if target_node is MeshInstance3D:
            applied_slot = "override"
        elif target_node is CSGPrimitive3D:
            applied_slot = "material"
        elif target_node is CanvasItem:
            applied_slot = "material"
        else:
            applied_slot = "override"

    # Apply based on slot
    if applied_slot == "override":
        if target_node.has_method("set"):
            target_node.set("material_override", material)
    elif applied_slot.begins_with("surface/"):
        var surface_idx = int(applied_slot.split("/")[1])
        if target_node is MeshInstance3D:
            target_node.set("surface_material_override/" + str(surface_idx), material)
    elif applied_slot == "material":
        target_node.set("material", material)

    # Save
    var new_packed = PackedScene.new()
    var err = new_packed.pack(scene_root)
    if err != OK:
        log_error("Failed to pack scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    err = ResourceSaver.save(new_packed, full_scene_path)
    if err != OK:
        log_error("Failed to save scene: " + str(err))
        scene_root.queue_free()
        quit(1)

    scene_root.queue_free()

    var output = {
        "success": true,
        "scene_path": scene_path,
        "node_path": node_path_str,
        "material_path": material_path,
        "slot": applied_slot
    }
    print(JSON.stringify(output))
    log_info("apply_material completed successfully")


func set_shader_parameter(params: Dictionary):
    log_info("Starting set_shader_parameter operation")
    var scene_path = params.get("scene_path", "")
    var node_path_str = params.get("node_path", "")
    var parameter_name = params.get("parameter_name", "")
    var parameter_value = params.get("parameter_value", null)

    if scene_path.is_empty() or node_path_str.is_empty() or parameter_name.is_empty():
        log_error("scene_path, node_path, and parameter_name are required")
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
        target_node = scene_root
    else:
        target_node = scene_root.get_node_or_null(NodePath(node_path_str))

    if target_node == null:
        log_error("Node not found: " + node_path_str)
        scene_root.queue_free()
        quit(1)

    # Get the material from the node
    var material = null
    if target_node.has_method("get_active_material"):
        material = target_node.get_active_material(0)
    elif "material_override" in target_node and target_node.material_override != null:
        material = target_node.material_override
    elif "material" in target_node and target_node.material != null:
        material = target_node.material

    if material == null:
        log_error("No material found on node: " + node_path_str)
        scene_root.queue_free()
        quit(1)

    if not material is ShaderMaterial:
        log_error("Material is not a ShaderMaterial. Got: " + material.get_class())
        scene_root.queue_free()
        quit(1)

    # Convert value
    var converted_value = _convert_property_value(parameter_value, target_node, parameter_name)

    # If value is a string that looks like a resource path, load it
    if converted_value is String and (converted_value as String).begins_with("res://"):
        var loaded_res = ResourceLoader.load(converted_value)
        if loaded_res != null:
            converted_value = loaded_res

    material.set_shader_parameter(parameter_name, converted_value)

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
        "scene_path": scene_path,
        "node_path": node_path_str,
        "parameter_name": parameter_name,
        "parameter_value": str(converted_value)
    }
    print(JSON.stringify(output))
    log_info("set_shader_parameter completed successfully")


# =============================================================================
# Tier 1: AnimationTree Configuration Operations
# =============================================================================

func configure_animation_tree(params: Dictionary):
    log_info("Starting configure_animation_tree operation")
    var scene_path = params.get("scene_path", "")
    var parent_node_path = params.get("parent_node_path", ".")
    var anim_player_path = params.get("animation_player_path", "")
    var root_type = params.get("root_type", "state_machine")
    var node_name = params.get("node_name", "AnimationTree")
    var active = params.get("active", true)
    var states = params.get("states", [])
    var transitions = params.get("transitions", [])
    var blend_points = params.get("blend_points", [])
    var blend_mode_str = params.get("blend_mode", "interpolated")

    if scene_path.is_empty() or anim_player_path.is_empty():
        log_error("scene_path and animation_player_path are required")
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

    var parent_node: Node
    if parent_node_path == ".":
        parent_node = scene_root
    else:
        parent_node = scene_root.get_node_or_null(NodePath(parent_node_path))

    if parent_node == null:
        log_error("Parent node not found: " + parent_node_path)
        scene_root.queue_free()
        quit(1)

    # Create AnimationTree
    var anim_tree = AnimationTree.new()
    anim_tree.name = node_name
    anim_tree.active = active

    # Set animation player path (relative to AnimationTree's position)
    anim_tree.anim_player = NodePath(anim_player_path)

    # Configure root based on type
    match root_type:
        "state_machine":
            var sm = AnimationNodeStateMachine.new()

            # Add states
            for state_def in states:
                var state_name = state_def.get("name", "")
                var anim_name = state_def.get("animation", "")
                if state_name.is_empty():
                    continue

                var anim_node = AnimationNodeAnimation.new()
                anim_node.animation = StringName(anim_name)
                sm.add_node(StringName(state_name), anim_node)

                # Set position if provided
                var pos = state_def.get("position", null)
                if pos != null and pos is Array and pos.size() >= 2:
                    sm.set_node_position(StringName(state_name), Vector2(pos[0], pos[1]))

            # Add transitions
            for trans_def in transitions:
                var from_state = trans_def.get("from", "")
                var to_state = trans_def.get("to", "")
                if from_state.is_empty() or to_state.is_empty():
                    continue

                var transition = AnimationNodeStateMachineTransition.new()

                if trans_def.get("auto_advance", false):
                    transition.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO

                var advance_cond = trans_def.get("advance_condition", "")
                if not advance_cond.is_empty():
                    transition.advance_condition = StringName(advance_cond)

                var switch_mode_str = trans_def.get("switch_mode", "immediate")
                match switch_mode_str:
                    "immediate":
                        transition.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
                    "sync":
                        transition.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_SYNC
                    "at_end":
                        transition.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END

                var xfade = trans_def.get("xfade_time", 0.0)
                transition.xfade_time = xfade

                sm.add_transition(StringName(from_state), StringName(to_state), transition)

            anim_tree.tree_root = sm

        "blend_space_1d":
            var bs = AnimationNodeBlendSpace1D.new()
            for bp in blend_points:
                var anim_name = bp.get("animation", "")
                var pos = bp.get("position", 0.0)
                var anim_node = AnimationNodeAnimation.new()
                anim_node.animation = StringName(anim_name)
                bs.add_blend_point(anim_node, float(pos))

            match blend_mode_str:
                "discrete":
                    bs.blend_mode = AnimationNodeBlendSpace1D.BLEND_MODE_DISCRETE
                "carry":
                    bs.blend_mode = AnimationNodeBlendSpace1D.BLEND_MODE_DISCRETE_CARRY
                _:
                    bs.blend_mode = AnimationNodeBlendSpace1D.BLEND_MODE_INTERPOLATED

            anim_tree.tree_root = bs

        "blend_space_2d":
            var bs = AnimationNodeBlendSpace2D.new()
            for bp in blend_points:
                var anim_name = bp.get("animation", "")
                var pos = bp.get("position", [0.0, 0.0])
                var pos_vec = Vector2(0, 0)
                if pos is Array and pos.size() >= 2:
                    pos_vec = Vector2(pos[0], pos[1])
                var anim_node = AnimationNodeAnimation.new()
                anim_node.animation = StringName(anim_name)
                bs.add_blend_point(anim_node, pos_vec)

            match blend_mode_str:
                "discrete":
                    bs.blend_mode = AnimationNodeBlendSpace2D.BLEND_MODE_DISCRETE
                "carry":
                    bs.blend_mode = AnimationNodeBlendSpace2D.BLEND_MODE_DISCRETE_CARRY
                _:
                    bs.blend_mode = AnimationNodeBlendSpace2D.BLEND_MODE_INTERPOLATED

            anim_tree.tree_root = bs

        "blend_tree":
            var bt = AnimationNodeBlendTree.new()
            anim_tree.tree_root = bt

    parent_node.add_child(anim_tree)
    anim_tree.owner = scene_root

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
        "scene_path": scene_path,
        "animation_tree": node_name,
        "root_type": root_type,
        "states_count": states.size(),
        "transitions_count": transitions.size(),
        "blend_points_count": blend_points.size()
    }
    print(JSON.stringify(output))
    log_info("configure_animation_tree completed successfully")


func create_animation_library(params: Dictionary):
    log_info("Starting create_animation_library operation")
    var library_name = params.get("library_name", "")
    var output_dir = params.get("output_dir", "animations")
    var animations_data = params.get("animations", [])

    if library_name.is_empty():
        log_error("library_name is required")
        quit(1)

    if animations_data.is_empty():
        log_error("animations array must not be empty")
        quit(1)

    # Ensure output directory exists
    var dir = DirAccess.open("res://")
    if dir and not dir.dir_exists(output_dir):
        dir.make_dir_recursive(output_dir)

    # Create AnimationLibrary
    var library = AnimationLibrary.new()

    for anim_def in animations_data:
        var anim_name = anim_def.get("name", "")
        if anim_name.is_empty():
            continue

        var anim = Animation.new()
        anim.length = anim_def.get("length", 1.0)

        var loop_mode_str = anim_def.get("loop_mode", "none")
        match loop_mode_str:
            "linear":
                anim.loop_mode = Animation.LOOP_LINEAR
            "pingpong":
                anim.loop_mode = Animation.LOOP_PINGPONG
            _:
                anim.loop_mode = Animation.LOOP_NONE

        # Add tracks
        var tracks = anim_def.get("tracks", [])
        for track_def in tracks:
            var track_type_str = track_def.get("type", "property")
            var node_path_str = track_def.get("node_path", "")
            var property = track_def.get("property", "")
            var keyframes = track_def.get("keyframes", [])

            var track_type = Animation.TYPE_VALUE
            var track_path = node_path_str

            match track_type_str:
                "position":
                    track_type = Animation.TYPE_POSITION_3D
                "rotation":
                    track_type = Animation.TYPE_ROTATION_3D
                "scale":
                    track_type = Animation.TYPE_SCALE_3D
                "property":
                    track_type = Animation.TYPE_VALUE
                    if not property.is_empty():
                        track_path = node_path_str + ":" + property
                "method":
                    track_type = Animation.TYPE_METHOD
                "audio":
                    track_type = Animation.TYPE_AUDIO

            var track_idx = anim.add_track(track_type)
            anim.track_set_path(track_idx, NodePath(track_path))

            # Add keyframes
            for kf in keyframes:
                var time = kf.get("time", 0.0)
                var value = kf.get("value", null)

                if track_type == Animation.TYPE_POSITION_3D or track_type == Animation.TYPE_SCALE_3D:
                    if value is Array and value.size() >= 3:
                        value = Vector3(value[0], value[1], value[2])
                elif track_type == Animation.TYPE_ROTATION_3D:
                    if value is Array and value.size() >= 4:
                        value = Quaternion(value[0], value[1], value[2], value[3])

                if track_type == Animation.TYPE_METHOD:
                    var method_name = value
                    var method_args = kf.get("args", [])
                    anim.track_insert_key(track_idx, time, {"method": method_name, "args": method_args})
                else:
                    anim.track_insert_key(track_idx, time, value)

                # Apply easing if specified
                var easing = kf.get("easing", 1.0)
                if easing != 1.0:
                    var key_idx = anim.track_find_key(track_idx, time, Animation.FIND_MODE_APPROX)
                    if key_idx >= 0:
                        anim.track_set_key_transition(track_idx, key_idx, easing)

        library.add_animation(StringName(anim_name), anim)
        log_info("Added animation: " + anim_name + " (length: " + str(anim.length) + "s, tracks: " + str(tracks.size()) + ")")

    # Save library
    var save_path = "res://" + output_dir + "/" + library_name + ".tres"
    var err = ResourceSaver.save(library, save_path)
    if err != OK:
        log_error("Failed to save animation library: " + str(err))
        quit(1)

    var output = {
        "success": true,
        "library_path": output_dir + "/" + library_name + ".tres",
        "animation_count": animations_data.size()
    }
    print(JSON.stringify(output))
    log_info("create_animation_library completed successfully")

# ─── Tier 2: Particle System Designer ────────────────────────────────────────

func create_particle_system(params: Dictionary):
    var scene_path = params.get("scene_path", "")
    var parent_path = params.get("parent_path", ".")
    var node_name = params.get("node_name", "Particles")
    var particle_type = params.get("particle_type", "2d")
    var amount = int(params.get("amount", 16))
    var lifetime = float(params.get("lifetime", 1.0))
    var one_shot = params.get("one_shot", false)
    var explosiveness = float(params.get("explosiveness", 0.0))
    var emission_shape_name = params.get("emission_shape", "point")

    if scene_path.is_empty():
        log_error("scene_path is required")
        quit(1)

    var full_scene_path = "res://" + scene_path
    var packed_scene = load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene = packed_scene.instantiate()

    # Find parent node
    var parent = scene if parent_path == "." else scene.get_node_or_null(parent_path)
    if parent == null:
        log_error("Parent node not found: " + parent_path)
        scene.free()
        quit(1)

    # Create particle node
    var particles: Node
    if particle_type == "3d":
        particles = GPUParticles3D.new()
    else:
        particles = GPUParticles2D.new()

    particles.name = node_name
    particles.set("amount", amount)
    particles.set("lifetime", lifetime)
    particles.set("one_shot", one_shot)
    particles.set("explosiveness", explosiveness)
    particles.set("emitting", true)

    # Create ParticleProcessMaterial
    var material = ParticleProcessMaterial.new()

    # Emission shape
    var emission_shape_map = {
        "point": ParticleProcessMaterial.EMISSION_SHAPE_POINT,
        "sphere": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
        "sphere_surface": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE_SURFACE,
        "box": ParticleProcessMaterial.EMISSION_SHAPE_BOX,
        "ring": ParticleProcessMaterial.EMISSION_SHAPE_RING
    }
    if emission_shape_map.has(emission_shape_name):
        material.emission_shape = emission_shape_map[emission_shape_name]

    # Emission shape parameters
    if params.has("emission_sphere_radius"):
        material.emission_sphere_radius = float(params["emission_sphere_radius"])
    if params.has("emission_box_extents"):
        var e = params["emission_box_extents"]
        material.emission_box_extents = Vector3(float(e[0]), float(e[1]), float(e[2]))
    if params.has("emission_ring_radius"):
        material.emission_ring_radius = float(params["emission_ring_radius"])
    if params.has("emission_ring_inner_radius"):
        material.emission_ring_inner_radius = float(params["emission_ring_inner_radius"])
    if params.has("emission_ring_height"):
        material.emission_ring_height = float(params["emission_ring_height"])

    # Direction
    if params.has("direction"):
        var d = params["direction"]
        material.direction = Vector3(float(d[0]), float(d[1]), float(d[2]))
    if params.has("spread"):
        material.spread = float(params["spread"])

    # Gravity
    if params.has("gravity"):
        var g = params["gravity"]
        material.gravity = Vector3(float(g[0]), float(g[1]), float(g[2]))

    # Velocity
    if params.has("initial_velocity_min"):
        material.initial_velocity_min = float(params["initial_velocity_min"])
    if params.has("initial_velocity_max"):
        material.initial_velocity_max = float(params["initial_velocity_max"])

    # Scale
    if params.has("scale_amount_min"):
        material.scale_amount_min = float(params["scale_amount_min"])
    if params.has("scale_amount_max"):
        material.scale_amount_max = float(params["scale_amount_max"])

    # Color
    if params.has("color"):
        var c = params["color"]
        var alpha = float(c[3]) if c.size() > 3 else 1.0
        material.color = Color(float(c[0]), float(c[1]), float(c[2]), alpha)

    particles.set("process_material", material)
    parent.add_child(particles)
    particles.owner = scene

    # Save scene
    var new_packed = PackedScene.new()
    var pack_err = new_packed.pack(scene)
    if pack_err != OK:
        log_error("Failed to pack scene: " + str(pack_err))
        scene.free()
        quit(1)

    var save_err = ResourceSaver.save(new_packed, full_scene_path)
    scene.free()
    if save_err != OK:
        log_error("Failed to save scene: " + str(save_err))
        quit(1)

    var result = {
        "success": true,
        "node_name": node_name,
        "particle_type": particle_type,
        "parent_path": parent_path,
        "amount": amount,
        "lifetime": lifetime,
        "emission_shape": emission_shape_name
    }
    print(JSON.stringify(result))
    log_info("create_particle_system completed successfully")


func apply_particle_preset(params: Dictionary):
    var scene_path = params.get("scene_path", "")
    var parent_path = params.get("parent_path", ".")
    var preset = params.get("preset", "")
    var particle_type = params.get("particle_type", "2d")
    var scale_factor = float(params.get("scale_factor", 1.0))
    var node_name = params.get("node_name", "")

    if scene_path.is_empty() or preset.is_empty():
        log_error("scene_path and preset are required")
        quit(1)

    # Define presets
    var presets = {
        "fire": {
            "node_name": "FireParticles",
            "amount": 32,
            "lifetime": 1.5,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
            "emission_sphere_radius": 0.5,
            "direction": Vector3(0, -1, 0),
            "spread": 15.0,
            "gravity": Vector3(0, -2, 0),
            "initial_velocity_min": 2.0,
            "initial_velocity_max": 4.0,
            "scale_amount_min": 0.5,
            "scale_amount_max": 1.5,
            "color": Color(1.0, 0.5, 0.1, 0.9)
        },
        "smoke": {
            "node_name": "SmokeParticles",
            "amount": 24,
            "lifetime": 3.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
            "emission_sphere_radius": 0.3,
            "direction": Vector3(0, -1, 0),
            "spread": 25.0,
            "gravity": Vector3(0, -0.5, 0),
            "initial_velocity_min": 0.5,
            "initial_velocity_max": 1.5,
            "scale_amount_min": 1.0,
            "scale_amount_max": 3.0,
            "color": Color(0.5, 0.5, 0.5, 0.5)
        },
        "explosion": {
            "node_name": "ExplosionParticles",
            "amount": 64,
            "lifetime": 0.8,
            "one_shot": true,
            "explosiveness": 1.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
            "emission_sphere_radius": 0.1,
            "direction": Vector3(0, -1, 0),
            "spread": 180.0,
            "gravity": Vector3(0, 2, 0),
            "initial_velocity_min": 5.0,
            "initial_velocity_max": 12.0,
            "scale_amount_min": 0.3,
            "scale_amount_max": 1.0,
            "color": Color(1.0, 0.7, 0.2, 1.0)
        },
        "magic_sparkle": {
            "node_name": "MagicParticles",
            "amount": 48,
            "lifetime": 2.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_SPHERE,
            "emission_sphere_radius": 1.0,
            "direction": Vector3(0, -1, 0),
            "spread": 180.0,
            "gravity": Vector3(0, 0, 0),
            "initial_velocity_min": 0.5,
            "initial_velocity_max": 2.0,
            "scale_amount_min": 0.1,
            "scale_amount_max": 0.4,
            "color": Color(0.5, 0.8, 1.0, 0.8)
        },
        "rain": {
            "node_name": "RainParticles",
            "amount": 200,
            "lifetime": 2.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_BOX,
            "emission_box_extents": Vector3(10, 0.1, 10),
            "direction": Vector3(0, 1, 0),
            "spread": 5.0,
            "gravity": Vector3(0, 9.8, 0),
            "initial_velocity_min": 5.0,
            "initial_velocity_max": 8.0,
            "scale_amount_min": 0.02,
            "scale_amount_max": 0.05,
            "color": Color(0.7, 0.8, 1.0, 0.6)
        },
        "snow": {
            "node_name": "SnowParticles",
            "amount": 100,
            "lifetime": 5.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_BOX,
            "emission_box_extents": Vector3(10, 0.1, 10),
            "direction": Vector3(0, 1, 0),
            "spread": 30.0,
            "gravity": Vector3(0, 1.5, 0),
            "initial_velocity_min": 0.3,
            "initial_velocity_max": 1.0,
            "scale_amount_min": 0.05,
            "scale_amount_max": 0.15,
            "color": Color(1.0, 1.0, 1.0, 0.9)
        },
        "dust": {
            "node_name": "DustParticles",
            "amount": 30,
            "lifetime": 4.0,
            "one_shot": false,
            "explosiveness": 0.0,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_BOX,
            "emission_box_extents": Vector3(2, 0.5, 2),
            "direction": Vector3(1, 0, 0),
            "spread": 90.0,
            "gravity": Vector3(0, 0.2, 0),
            "initial_velocity_min": 0.1,
            "initial_velocity_max": 0.5,
            "scale_amount_min": 0.05,
            "scale_amount_max": 0.2,
            "color": Color(0.8, 0.7, 0.5, 0.4)
        },
        "sparks": {
            "node_name": "SparkParticles",
            "amount": 40,
            "lifetime": 0.5,
            "one_shot": false,
            "explosiveness": 0.3,
            "emission_shape": ParticleProcessMaterial.EMISSION_SHAPE_POINT,
            "direction": Vector3(0, -1, 0),
            "spread": 60.0,
            "gravity": Vector3(0, 5, 0),
            "initial_velocity_min": 3.0,
            "initial_velocity_max": 8.0,
            "scale_amount_min": 0.05,
            "scale_amount_max": 0.15,
            "color": Color(1.0, 0.9, 0.3, 1.0)
        }
    }

    if not presets.has(preset):
        log_error("Unknown preset: " + preset + ". Available: " + ", ".join(presets.keys()))
        quit(1)

    var preset_data = presets[preset]
    if node_name.is_empty():
        node_name = preset_data["node_name"]

    var full_scene_path = "res://" + scene_path
    var packed_scene = load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        quit(1)

    var scene = packed_scene.instantiate()

    var parent = scene if parent_path == "." else scene.get_node_or_null(parent_path)
    if parent == null:
        log_error("Parent node not found: " + parent_path)
        scene.free()
        quit(1)

    # Create particle node
    var particles: Node
    if particle_type == "3d":
        particles = GPUParticles3D.new()
    else:
        particles = GPUParticles2D.new()

    particles.name = node_name
    particles.set("amount", int(preset_data["amount"] * scale_factor))
    particles.set("lifetime", preset_data["lifetime"])
    particles.set("one_shot", preset_data["one_shot"])
    particles.set("explosiveness", preset_data["explosiveness"])
    particles.set("emitting", not preset_data["one_shot"])

    # Create and configure material
    var material = ParticleProcessMaterial.new()
    material.emission_shape = preset_data["emission_shape"]

    if preset_data.has("emission_sphere_radius"):
        material.emission_sphere_radius = preset_data["emission_sphere_radius"] * scale_factor
    if preset_data.has("emission_box_extents"):
        material.emission_box_extents = preset_data["emission_box_extents"] * scale_factor

    material.direction = preset_data["direction"]
    material.spread = preset_data["spread"]
    material.gravity = preset_data["gravity"]
    material.initial_velocity_min = preset_data["initial_velocity_min"] * scale_factor
    material.initial_velocity_max = preset_data["initial_velocity_max"] * scale_factor
    material.scale_amount_min = preset_data["scale_amount_min"] * scale_factor
    material.scale_amount_max = preset_data["scale_amount_max"] * scale_factor
    material.color = preset_data["color"]

    particles.set("process_material", material)
    parent.add_child(particles)
    particles.owner = scene

    # Save scene
    var new_packed = PackedScene.new()
    var pack_err = new_packed.pack(scene)
    if pack_err != OK:
        log_error("Failed to pack scene: " + str(pack_err))
        scene.free()
        quit(1)

    var save_err = ResourceSaver.save(new_packed, full_scene_path)
    scene.free()
    if save_err != OK:
        log_error("Failed to save scene: " + str(save_err))
        quit(1)

    var result = {
        "success": true,
        "node_name": node_name,
        "preset": preset,
        "particle_type": particle_type,
        "scale_factor": scale_factor,
        "amount": int(preset_data["amount"] * scale_factor)
    }
    print(JSON.stringify(result))
    log_info("apply_particle_preset completed successfully")
