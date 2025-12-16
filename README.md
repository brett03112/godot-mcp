
# Godot MCP

[![Github-sponsors](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#EA4AAA)](https://github.com/sponsors/Coding-Solo)

[![](https://badge.mcpx.dev?type=server 'MCP Server')](https://modelcontextprotocol.io/introduction)
[![Made with Godot](https://img.shields.io/badge/Made%20with-Godot-478CBF?style=flat&logo=godot%20engine&logoColor=white)](https://godotengine.org)
[![](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white 'Node.js')](https://nodejs.org/en/download/)
[![](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white 'TypeScript')](https://www.typescriptlang.org/)

[![](https://img.shields.io/github/last-commit/Coding-Solo/godot-mcp 'Last Commit')](https://github.com/Coding-Solo/godot-mcp/commits/main)
[![](https://img.shields.io/github/stars/Coding-Solo/godot-mcp 'Stars')](https://github.com/Coding-Solo/godot-mcp/stargazers)
[![](https://img.shields.io/github/forks/Coding-Solo/godot-mcp 'Forks')](https://github.com/Coding-Solo/godot-mcp/network/members)
[![](https://img.shields.io/badge/License-MIT-red.svg 'MIT License')](https://opensource.org/licenses/MIT)

```text
                           (((((((             (((((((                          
                        (((((((((((           (((((((((((                      
                        (((((((((((((       (((((((((((((                       
                        (((((((((((((((((((((((((((((((((                       
                        (((((((((((((((((((((((((((((((((                       
         (((((      (((((((((((((((((((((((((((((((((((((((((      (((((        
       (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((      
     ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((    
    ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((    
      (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((     
        (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((       
         (((((((((((@@@@@@@(((((((((((((((((((((((((((@@@@@@@(((((((((((        
         (((((((((@@@@,,,,,@@@(((((((((((((((((((((@@@,,,,,@@@@(((((((((        
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((        
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((        
         (((((((((@@@,,,,,,,@@((((((((@@@@@((((((((@@,,,,,,,@@@(((((((((        
         ((((((((((((@@@@@@(((((((((((@@@@@(((((((((((@@@@@@((((((((((((        
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((        
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((        
         @@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@        
         ((((((((( @@@(((((((((((@@(((((((((((@@(((((((((((@@@ (((((((((        
         (((((((((( @@((((((((((@@@(((((((((((@@@((((((((((@@ ((((((((((        
          (((((((((((@@@@@@@@@@@@@@(((((((((((@@@@@@@@@@@@@@(((((((((((         
           (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((          
              (((((((((((((((((((((((((((((((((((((((((((((((((((((             
                 (((((((((((((((((((((((((((((((((((((((((((((((                
                        (((((((((((((((((((((((((((((((((                       
                                                                                

                          /$$      /$$  /$$$$$$  /$$$$$$$ 
                         | $$$    /$$$ /$$__  $$| $$__  $$
                         | $$$$  /$$$$| $$  \__/| $$  \ $$
                         | $$ $$/$$ $$| $$      | $$$$$$$/
                         | $$  $$$| $$| $$      | $$____/ 
                         | $$\  $ | $$| $$    $$| $$      
                         | $$ \/  | $$|  $$$$$$/| $$      
                         |__/     |__/ \______/ |__/       
```

A Model Context Protocol (MCP) server for interacting with the Godot game engine.

## Introduction

Godot MCP enables AI assistants to launch the Godot editor, run projects, capture debug output, and control project execution - all through a standardized interface.

This direct feedback loop helps AI assistants like Claude understand what works and what doesn't in real Godot projects, leading to better code generation and debugging assistance.

## Features

- **Launch Godot Editor**: Open the Godot editor for a specific project
- **Run Godot Projects**: Execute Godot projects in debug mode
- **Enhanced Debug Output**: Retrieve console output with **intelligent error parsing** (Phase 3)
  - Automatically parses and structures Godot errors (SCRIPT ERROR, Parse error, WARNING, etc.)
  - Extracts error details: type, message, file path, line number, function name
  - Provides context-aware actionable solutions for 8+ error categories
  - Returns `parsed_errors` array with full context + `error_count`
- **Control Execution**: Start and stop Godot projects programmatically
- **Get Godot Version**: Retrieve the installed Godot version
- **List Godot Projects**: Find Godot projects in a specified directory
- **Project Analysis**: Get detailed information about project structure
- **Scene Management**:
  - Create new scenes with specified root node types
  - Add nodes to existing scenes with customizable properties
  - Load sprites and textures into Sprite2D nodes
  - Export 3D scenes as MeshLibrary resources for GridMap
  - Save scenes with options for creating variants
- **UID Management** (for Godot 4.4+):
  - Get UID for specific files
  - Update UID references by resaving resources
- **Signal & Event System** (Phase 1 - COMPLETE):
  - **`list_signals`**: List all signals available on any node type or instance
    - Inspect custom signals with parameter type information
    - Support for both built-in and custom script signals
  - **`list_connections`**: List all signal connections in a scene
    - Filter connections by specific node paths
    - View source, target, method, flags, and bound parameters
  - **`connect_signal`**: Connect signals to create functional interactive scenes (CORE)
    - Automatically persists connections to .tscn files
    - Validates signal and node existence before connecting
    - Support for connection flags and bound parameters
  - **`disconnect_signal`**: Remove existing signal connections
    - Clean removal from scene files
    - Validation to prevent errors
  - **`validate_connection`**: Pre-validate connections before creating
    - Check signal existence (hard error if missing)
    - Check node existence (hard error if missing)
    - Check method existence (warning if missing - can be added later)
- **GDScript Code Intelligence** (Phase 2 - COMPLETE):
  - **`analyze_script`**: Parse GDScript files to extract complete structure
    - Extract class name, extends, functions with signatures and line numbers
    - Identify signals, export variables, constants, enums, and preloads
    - Line-accurate parsing for navigation and refactoring
  - **`create_script`**: Generate GDScript files from production-ready templates
    - 5 templates: basic, state_machine, singleton, component, character_controller
    - All templates use GDScript 2.0 syntax with proper type hints
    - Customizable class names and inheritance
  - **`modify_function`**: Update existing function implementations
    - Supports body-only or full signature+body modifications
    - Indentation-aware parsing maintains code structure
    - Preserves surrounding code and formatting
  - **`add_export_variable`**: Add @export variables for editor exposure
    - Supports 10+ export hints: RANGE, FILE, DIR, ENUM, FLAGS, COLOR_NO_ALPHA, NODE_PATH, MULTILINE, PLACEHOLDER
    - Intelligent insertion point detection (after class_name/extends, before functions)
    - Proper Godot 4.x @export decorator syntax
  - **`extract_dependencies`**: Find all script dependencies for refactoring
    - Identifies preloads, loads, resource paths, and class references
    - Filters out built-in Godot types from class references
    - Supports dependency analysis for large codebases
  - **`attach_script`**: Attach GDScript files to scene nodes
    - Direct .tscn file manipulation for reliable persistence
    - Automatic ExtResource management with unique IDs
    - Supports both root nodes and child nodes
- **Enhanced Debugging & Error Analysis** (Phase 3 - COMPLETE):
  - **`get_debug_output`**: Enhanced with intelligent error parsing
    - **5 Error Pattern Types**: SCRIPT ERROR, ERROR, Parse error, WARNING, Debugger Break
    - **Structured Error Extraction**: Automatically extracts type, message, file, line, function from errors
    - **Context-Aware Solutions**: Provides actionable fixes for common error types:
      - Null reference errors (4 solutions: initialization checks, node tree validation, null guards)
      - Invalid index/bounds errors (3 solutions: bounds checking, key existence, array validation)
      - Parse/syntax errors (4 solutions: syntax checking, indentation fixes, typo detection)
      - Function not found errors (3 solutions: spelling verification, scope checking)
      - Type mismatch errors (3 solutions: type annotation fixes, conversion functions)
      - Resource not found errors (3 solutions: path validation, existence checks)
      - Signal connection errors (3 solutions: signal name validation, signature checking)
    - **Enhanced Output Format**:

      ```json
      {
        "output": [...],
        "errors": [...],
        "parsed_errors": [{
          "type": "SCRIPT_ERROR",
          "message": "Cannot call method 'queue_free' on a null value.",
          "file": "res://player.gd",
          "line": 42,
          "function": "take_damage",
          "raw_line": "SCRIPT ERROR: ...",
          "possible_solutions": ["Check if the object is properly initialized...", ...]
        }],
        "error_count": 1
      }
      ```

  - **`validate_script`**: Validate GDScript syntax without execution
    - Uses Godot's `--check-only` flag to check scripts without running them
    - Catches syntax errors, undefined variables, type mismatches, and other parse-time issues
    - Reuses error parsing from `get_debug_output` for consistent error reporting
    - Returns structured validation result:
      - `valid`: boolean indicating script has no errors
      - `exit_code`: Godot validation exit code (0 = success, 1 = errors)
      - `errors`: array of parsed error objects with type, message, file, line, solutions
      - `error_count`: total number of validation errors
      - `raw_output` and `raw_errors`: unfiltered output for debugging
    - Ideal for pre-commit validation or CI/CD integration
    - Example output:

      ```json
      {
        "valid": false,
        "script_path": "player.gd",
        "exit_code": 1,
        "errors": [{
          "type": "PARSE_ERROR",
          "message": "Identifier 'undefined_variable' not declared",
          "file": "res://player.gd",
          "line": 15,
          "function": "_ready",
          "possible_solutions": ["Declare the variable before use...", ...]
        }],
        "error_count": 1
      }
      ```

- **Animation & Timeline Orchestration** (Phase 4 - COMPLETE):
  - **`create_animation_player`**: Add AnimationPlayer nodes to scenes
    - Create AnimationPlayer nodes with optional initial animations
    - Supports parent node path specification for flexible scene structure
    - Automatically creates AnimationLibrary for Godot 4.x compatibility
    - Optional animation name parameter creates ready-to-use animations
  - **`add_animation_track`**: Add tracks to existing animations
    - **6 Track Types**: position, rotation, scale, property, method, audio
    - Maps user-friendly names to Godot's Animation.TYPE_* enums
    - Property track support for animating any node property (e.g., "modulate:a", "position:x")
    - Method tracks for triggering functions during animation playback
    - Audio tracks for sound effect synchronization
  - **`add_keyframe`**: Add keyframes to animation tracks with easing
    - Supports all track types with appropriate value handling
    - **Custom Easing Curves**: Control animation feel with easing values
      - easing < 1.0: Ease-in (slow start, fast end)
      - easing = 1.0: Linear (constant speed)
      - easing > 1.0: Ease-out (fast start, slow end)
    - Automatic type conversion for 3D transforms (Array → Vector3)
    - Method call keyframes with argument support
    - Professional animation workflow: Create → Track → Keyframe
  - **Complete Animation Workflow**:
    ```gdscript
    # Example: Create a button hover animation
    1. create_animation_player(scene, "AnimationPlayer", "hover")
    2. add_animation_track("hover", "scale", "Button")
    3. add_keyframe(track=0, time=0.0, value=[1.0, 1.0, 1.0], easing=1.0)
    4. add_keyframe(track=0, time=0.2, value=[1.1, 1.1, 1.0], easing=2.0)  # Bouncy
    5. add_keyframe(track=0, time=0.4, value=[1.0, 1.0, 1.0], easing=0.5)  # Smooth
    # Result: Professional hover effect with smooth scaling
    ```

- **Shader & Material Pipeline** (Phase 5 - COMPLETE):
  - **`create_shader_material`**: Create shader materials with custom code or templates
    - **3 Shader Types Supported**: canvas_item (2D), spatial (3D), particles
    - Creates both .gdshader and .tres ShaderMaterial files
    - Validates shader compilation before saving to catch syntax errors
    - Automatic parameter type conversion (Array → Vector2/Vector3/Color)
    - Support for custom shader parameters with proper Godot types
  - **4 Production-Ready Shader Templates**:
    - **dissolve**: Fade/dissolve effect with edge glow
      - Parameters: dissolve_amount, edge_color, edge_width
      - Use cases: Enemy death effects, teleportation, transitions
    - **outline**: Colored border shader for sprites
      - Parameters: outline_color, outline_width
      - Use cases: Selection highlights, UI emphasis, character focus
    - **damage_flash**: Hit flash effect for damage feedback
      - Parameters: flash_intensity, flash_color
      - Use cases: Damage indicators, power-ups, status effects
    - **hologram**: Scan lines effect with animated tint
      - Parameters: scan_speed, tint_color, scan_intensity
      - Use cases: Holograms, distortion effects, futuristic UI
  - **Complete Shader Workflow**:
    ```gdscript
    # Example 1: Use a template with custom parameters
    create_shader_material(
      template="dissolve",
      shader_path="shaders/my_dissolve.gdshader",
      material_path="materials/my_dissolve.tres",
      shader_parameters={
        "dissolve_amount": 0.5,
        "edge_color": [1.0, 0.0, 1.0, 1.0],  # Magenta
        "edge_width": 0.2
      }
    )

    # Example 2: Create custom shader from scratch
    create_shader_material(
      shader_code="shader_type canvas_item;\nvoid fragment() { COLOR = vec4(1.0, 0.0, 0.0, 1.0); }",
      shader_type="canvas_item",
      shader_path="shaders/red.gdshader",
      material_path="materials/red.tres"
    )
    # Result: Ready-to-use shader materials with validated compilation
    ```

- **Testing & Quality Assurance** (Phase 6 - COMPLETE):
  - **`create_test_suite`**: Create GUT (Godot Unit Test) test files with test cases
    - **Generates GutTest Scripts**: Creates properly structured test files extending GutTest
    - Automatically prefixes test methods with "test_" if not present
    - Supports multiple test cases with assertions, setup code, and descriptions
    - **Optional Test Hooks**: before_all, after_all, before_each, after_each for setup/teardown
    - Creates directory structure automatically for organized test suites
    - **Integration with GUT 9.5.0**: Compatible with latest GUT framework
    - Perfect for TDD workflows and regression testing
  - **`run_tests`**: Execute GUT tests and return structured results
    - **Headless Test Execution**: Runs tests via Godot command line without opening editor
    - **Comprehensive Output Parsing**: Strips ANSI color codes and parses test results
    - Returns structured JSON with test files, tests, assertions, and summary statistics
    - **Flexible Test Selection**:
      - Run all tests in a directory (default: "test/")
      - Run specific test file (e.g., "test/unit/test_player.gd")
      - Configure verbosity level (0=quiet, 1=normal, 2=verbose)
    - **Detailed Result Tracking**:
      - Overall success/failure status
      - Summary statistics: scripts, tests, passing_tests, failing_tests, asserts, time
      - Per-file test results with individual test pass/fail status
      - Assertion-level tracking with full messages
      - Raw output and errors for debugging
    - **Example Output**:
      ```json
      {
        "success": false,
        "summary": {
          "scripts": 2,
          "tests": 3,
          "passing_tests": 2,
          "failing_tests": 1,
          "asserts": 5,
          "time": "0.453s"
        },
        "test_files": [
          {
            "file": "res://test/unit/test_player.gd",
            "tests": [
              {
                "name": "test_health_system",
                "passed": true,
                "assertions": [
                  {"passed": true, "message": "[Passed]: Health initialized correctly"}
                ]
              }
            ],
            "passed": 1,
            "failed": 0
          }
        ]
      }
      ```
  - **Complete TDD Workflow**:
    ```gdscript
    # Step 1: Create test suite
    create_test_suite(
      projectPath="/path/to/project",
      testPath="test/unit/test_player.gd",
      targetScript="player.gd",
      testCases=[
        {
          "name": "health_system",
          "description": "Test player health mechanics",
          "assertions": [
            "assert_eq(player.health, 100, 'Initial health')",
            "player.take_damage(30)",
            "assert_eq(player.health, 70, 'Health after damage')"
          ]
        }
      ]
    )

    # Step 2: Run tests
    run_tests(
      projectPath="/path/to/project",
      testDir="test/"  # Runs all tests in directory
    )

    # Step 3: Fix failing tests and rerun
    # Result: Full TDD cycle with structured feedback
    ```

- **Asset Import & Configuration** (Phase 7 - COMPLETE):
  - **`import_texture`**: Configure texture import settings for optimal game performance
    - **Filter Modes**: Linear, Nearest (pixel art), Linear Mipmap, Nearest Mipmap
    - **Compression Options**: Lossless, Lossy, VRAM Compressed, VRAM Uncompressed, Basis Universal
    - **Additional Settings**: Mipmaps, repeat mode, sRGB handling, normal map detection
    - Modifies `.import` files directly for reliable persistence
    - Perfect for optimizing texture settings for different use cases (pixel art, 3D textures, UI)
  - **`import_audio`**: Configure audio import settings for music and sound effects
    - **Loop Settings**: Enable/disable looping, loop mode (Forward, Ping-Pong, Backward)
    - **Music Sync**: BPM, beat count, bar beats for rhythm game synchronization
    - **Loop Offset**: Skip intro sections by setting loop start point in seconds
    - Supports WAV, OGG, and MP3 formats with automatic format detection
    - Ideal for background music, ambient sounds, and one-shot sound effects
  - **`import_3d_model`**: Configure 3D model import with materials, collisions, and animations
    - **Collision Generation**: None, Mesh, Convex, Multiple Convex, Decomposed
    - **Import Options**: Materials, animations, scale multiplier, LOD generation
    - **Root Node Type**: Node3D, StaticBody3D, RigidBody3D, CharacterBody3D, Area3D
    - Supports GLTF, GLB, FBX, OBJ, DAE, and BLEND formats
    - Professional workflow for importing game-ready 3D assets
  - **`create_resource`**: Create custom Godot Resource files (.tres) programmatically
    - **Supported Types**: Theme, Environment, Material, AudioBusLayout, and any Resource class
    - **6 Built-in Templates**: theme_dark, theme_light, environment_outdoor, environment_indoor, material_standard, material_unshaded
    - **Property Support**: Set any resource property with automatic type formatting
    - Generates valid Godot 4.x .tres files with proper UIDs
    - Perfect for creating reusable game configurations and assets
  - **Complete Asset Workflow**:
    ```gdscript
    # Example 1: Import pixel art texture
    import_texture(
      projectPath="/path/to/project",
      texturePath="sprites/player.png",
      filter="Nearest",           # No blur for pixel art
      compression="Lossless",     # Perfect quality
      mipmaps=false               # Not needed for 2D
    )

    # Example 2: Import looping background music
    import_audio(
      projectPath="/path/to/project",
      audioPath="audio/bgm.ogg",
      loop=true,
      loopOffset=2.5,             # Skip 2.5s intro
      bpm=120,                    # For beat sync
      barBeats=4                  # 4/4 time signature
    )

    # Example 3: Import 3D character model
    import_3d_model(
      projectPath="/path/to/project",
      modelPath="models/character.glb",
      importMaterials=true,
      importAnimations=true,
      generateCollision="Convex",
      scale=0.01                  # Convert cm to meters
    )

    # Example 4: Create outdoor environment resource
    create_resource(
      projectPath="/path/to/project",
      resourcePath="resources/outdoor_env.tres",
      resourceType="Environment",
      template="environment_outdoor",
      properties={
        "ambient_light_energy": 0.8,
        "fog_enabled": true
      }
    )
    ```

- **Project Settings & Configuration** (Phase 8 - COMPLETE):
  - **`modify_project_setting`**: Modify project.godot settings programmatically
    - **Common Settings**: Window size, application name, rendering method, physics gravity
    - **Type Support**: Strings, numbers, booleans, arrays, Godot types (Vector2, Color, PackedStringArray)
    - Automatically creates sections if they don't exist
    - Perfect for project initialization and configuration automation
  - **`configure_input_action`**: Create and modify input action maps
    - **Event Types**: Keyboard keys, mouse buttons, joypad buttons, joypad axes
    - **Key Mapping**: Full support for A-Z, 0-9, F1-F12, arrows, modifiers, special keys
    - **Customization**: Deadzone configuration, multiple bindings per action
    - Generates proper Godot 4.x InputEvent Object() format
    - Essential for game control configuration
  - **`setup_render_layers`**: Configure physics and render layer names
    - **Layer Types**: 2D physics, 3D physics, 2D render, 3D render
    - **Validation**: 1-32 for physics layers, 1-20 for render layers
    - Layer names improve editor usability and code readability
    - Organize collision and rendering groups effectively
  - **`configure_autoload`**: Add or remove autoload singletons
    - **Add Autoloads**: Register global singleton scripts
    - **Enable/Disable**: Control whether autoload is active (* prefix)
    - **Remove Autoloads**: Clean removal from project settings
    - Validates script exists before adding
    - Essential for global game managers, audio systems, save systems
  - **Complete Project Setup Workflow**:
    ```gdscript
    # Example 1: Configure window settings
    modify_project_setting(
      projectPath="/path/to/project",
      settingPath="display/window/size/viewport_width",
      value=1920
    )

    # Example 2: Set up player input
    configure_input_action(
      projectPath="/path/to/project",
      actionName="jump",
      events=[
        {type: "key", keycode: "Space"},
        {type: "joypad_button", button: 0}  # A button
      ],
      deadzone=0.5
    )

    # Example 3: Configure physics layers
    setup_render_layers(
      projectPath="/path/to/project",
      layerType="2d_physics",
      layerNames={"1": "Player", "2": "Enemy", "3": "World", "4": "Projectile"}
    )

    # Example 4: Add game manager autoload
    configure_autoload(
      projectPath="/path/to/project",
      name="GameManager",
      scriptPath="res://autoload/game_manager.gd",
      enabled=true
    )
    ```

- **Build & Export Pipeline** (Phase 9 - COMPLETE):
  - **`create_export_preset`**: Generate export presets for target platforms
    - **Platforms**: Windows Desktop, Linux/X11, macOS, Web, Android, iOS
    - **Options**: Runnable, debug mode, include/exclude filters, encryption
    - Generates proper export_presets.cfg with platform-specific settings
    - Auto-generates export paths with correct file extensions
    - Supports adding multiple presets to same project
  - **`export_project`**: Build/export Godot projects
    - **Modes**: Debug export, release export, pack-only export
    - **Options**: Custom output path, preset selection
    - Creates output directories automatically
    - Returns build duration and verification status
    - Captures export errors for troubleshooting
  - **`validate_export`**: Check projects for export issues
    - **Checks**: Export presets, templates, scripts, large assets, project icon
    - **Script Analysis**: Debug print statements, breakpoints, TODO/FIXME comments
    - **Recommendations**: Actionable suggestions for fixing issues
    - Summary with error/warning/info counts
    - Export readiness determination
  - **Complete Export Workflow**:
    ```gdscript
    # Step 1: Create export preset
    create_export_preset(
      projectPath="/path/to/project",
      presetName="Windows Release",
      platform="Windows Desktop",
      exportPath="export/windows/game.exe"
    )

    # Step 2: Validate before export
    validate_export(
      projectPath="/path/to/project",
      presetName="Windows Release",
      checkTemplates=true,
      checkScripts=true,
      warnLargeAssets=true
    )

    # Step 3: Build the game
    export_project(
      projectPath="/path/to/project",
      presetName="Windows Release",
      outputPath="export/windows/game.exe",
      releaseMode=true
    )
    ```

- **Tilemap & Level Design** (Phase 10 - COMPLETE):
  - **`create_tilemap`**: Create TileMap nodes with TileSet configuration
    - **Tile Size**: Configure custom tile dimensions (8x8, 16x16, 32x32, etc.)
    - **TileSet Support**: Create new TileSet or reference existing one
    - **Multiple Layers**: Create named layers for Ground, Objects, Collisions, etc.
    - Proper Godot 4.x TileMap format with TileSetAtlasSource
  - **`paint_tiles`**: Paint tiles programmatically with patterns
    - **Pattern Types**: Single tile, rectangular region, line (Bresenham), erase
    - **Layer Support**: Paint on specific layers by index
    - **Atlas Coordinates**: Specify tile source and atlas position
    - Supports bulk tile operations for efficient level generation
  - **`configure_tileset`**: Configure TileSet with collision, navigation, terrain
    - **Texture Atlas**: Set up texture source with tile size
    - **Collision Shapes**: Add physics polygons to tiles
    - **Navigation Polygons**: Configure tiles for pathfinding
    - **Terrain Sets**: Set up terrain for autotiling
    - Physics and navigation layer configuration
  - **`generate_navmesh`**: Create NavigationRegion3D with NavigationMesh
    - **Agent Parameters**: Radius, height, max slope, max climb
    - **Cell Configuration**: Cell size and height for voxelization
    - **Source Geometry**: static_colliders, meshes, physics_bodies modes
    - Ready for runtime baking with NavigationServer3D
  - **Complete Level Design Workflow**:
    ```gdscript
    # Step 1: Create TileMap with layers
    create_tilemap(
      projectPath="/path/to/project",
      scenePath="scenes/level.tscn",
      tilemapName="TileMap",
      tileSize={x: 16, y: 16},
      layers=["Ground", "Objects", "Collisions"]
    )

    # Step 2: Configure TileSet with texture and collision
    configure_tileset(
      projectPath="/path/to/project",
      tilesetPath="resources/tileset.tres",
      texturePath="sprites/tilemap.png",
      tileSize={x: 16, y: 16},
      tiles=[
        {atlasCoords: {x: 0, y: 0}, collision: [[0,0], [16,0], [16,16], [0,16]]},
        {atlasCoords: {x: 1, y: 0}, navigation: [[2,2], [14,2], [14,14], [2,14]]}
      ]
    )

    # Step 3: Paint tiles with patterns
    paint_tiles(
      projectPath="/path/to/project",
      scenePath="scenes/level.tscn",
      tilemapPath="TileMap",
      pattern="rect",
      rectStart={x: 0, y: 0},
      rectEnd={x: 10, y: 5},
      atlasCoords={x: 0, y: 0}
    )

    # Step 4: Generate 3D navigation mesh
    generate_navmesh(
      projectPath="/path/to/project",
      scenePath="scenes/level_3d.tscn",
      regionName="NavigationRegion3D",
      agentRadius=0.5,
      agentHeight=2.0,
      agentMaxSlope=45.0,
      sourceGeometryMode="static_colliders"
    )
    ```

## Requirements

- [Godot Engine](https://godotengine.org/download) installed on your system
- Node.js and npm
- An AI assistant that supports MCP (Cline, Cursor, etc.)

## Installation and Configuration

### Step 1: Install and Build

First, clone the repository and build the MCP server:

```bash
git clone https://github.com/Coding-Solo/godot-mcp.git
cd godot-mcp
npm install
npm run build
```

### Step 2: Configure with Your AI Assistant

#### Option A: Configure with Cline

Add to your Cline MCP settings file (`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "DEBUG": "true"                  // Optional: Enable detailed logging
      },
      "disabled": false,
      "autoApprove": [
        "launch_editor",
        "run_project",
        "get_debug_output",
        "stop_project",
        "get_godot_version",
        "list_projects",
        "get_project_info",
        "create_scene",
        "add_node",
        "load_sprite",
        "export_mesh_library",
        "save_scene",
        "get_uid",
        "update_project_uids",
        "list_signals",
        "list_connections",
        "connect_signal",
        "disconnect_signal",
        "validate_connection",
        "analyze_script",
        "create_script",
        "modify_function",
        "add_export_variable",
        "extract_dependencies",
        "attach_script",
        "validate_script",
        "create_animation_player",
        "add_animation_track",
        "add_keyframe",
        "create_shader_material",
        "create_test_suite",
        "run_tests",
        "import_texture",
        "import_audio",
        "import_3d_model",
        "create_resource",
        "modify_project_setting",
        "configure_input_action",
        "setup_render_layers",
        "configure_autoload",
        "create_export_preset",
        "export_project",
        "validate_export",
        "create_tilemap",
        "paint_tiles",
        "configure_tileset",
        "generate_navmesh"
      ]
    }
  }
}
```

#### Option B: Configure with Cursor

**Using the Cursor UI:**

1. Go to **Cursor Settings** > **Features** > **MCP**
2. Click on the **+ Add New MCP Server** button
3. Fill out the form:
   - Name: `godot` (or any name you prefer)
   - Type: `command`
   - Command: `node /absolute/path/to/godot-mcp/build/index.js`
4. Click "Add"
5. You may need to press the refresh button in the top right corner of the MCP server card to populate the tool list

**Using Project-Specific Configuration:**

Create a file at `.cursor/mcp.json` in your project directory with the following content:

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "DEBUG": "true"                  // Enable detailed logging
      }
    }
  }
}
```

### Step 3: Optional Environment Variables

You can customize the server behavior with these environment variables:

- `GODOT_PATH`: Path to the Godot executable (overrides automatic detection)
- `DEBUG`: Set to "true" to enable detailed server-side debug logging

## Example Prompts

Once configured, your AI assistant will automatically run the MCP server when needed. You can use prompts like:

```text
"Launch the Godot editor for my project at /path/to/project"

"Run my Godot project and show me any errors"

"Get information about my Godot project structure"

"Analyze my Godot project structure and suggest improvements"

"Help me debug this error in my Godot project: [paste error]"

"Write a GDScript for a character controller with double jump and wall sliding"

"Create a new scene with a Player node in my Godot project"

"Add a Sprite2D node to my player scene and load the character texture"

"Export my 3D models as a MeshLibrary for use with GridMap"

"Create a UI scene with buttons and labels for my game's main menu"

"Get the UID for a specific script file in my Godot 4.4 project"

"Update UID references in my Godot project after upgrading to 4.4"

"List all signals available on a Button node"

"Show me all signal connections in my pause_menu scene"

"Connect the 'pressed' signal from my StartButton to the _on_start_pressed method"

"Create a functional pause menu with Resume, Settings, and Quit buttons"

"Validate if I can connect the 'body_entered' signal from my Area2D to the player script"

"Disconnect the button_down signal from my old handler"

"Analyze my player.gd script and show me all functions and signals"

"Create a new character controller script using the character_controller template"

"Add an @export variable for jump height with a range hint from 0 to 1000"

"Modify the _physics_process function in my player script to add wall-sliding mechanics"

"Extract all dependencies from my game_manager.gd script"

"Attach the player_controller.gd script to my Player node in the scene"

"Create a state machine script for my enemy AI"

"Find all preloads and class references in my inventory system script"

"Validate my player script for syntax errors before committing"

"Check if my inventory.gd has any undefined variables or type mismatches"

"Create a dissolve shader effect for my enemy death animation"

"Add an outline shader to my player sprite for selection highlighting"

"Create a hologram effect shader with cyan tint and fast scan lines"

"Make a damage flash shader that turns my character red when hit"

"Create a custom shader that makes sprites glow with a pulsing effect"

"Apply the dissolve template to my enemy sprite with magenta edge color"

"Create a shader material with custom parameters for my UI effects"

"Create a test suite for my player health system with damage and healing tests"

"Run all my GUT tests and show me which ones are failing"

"Configure my pixel art textures to use Nearest filtering without mipmaps"

"Import my background music with looping enabled and set the BPM to 120"

"Set up my 3D character model to generate convex collision shapes on import"

"Create an Environment resource with outdoor lighting settings"

"Configure my sound effects to not loop and use Lossless compression"

"Import my GLTF model at 0.01 scale to convert from centimeters to meters"

"Create a Theme resource with dark mode colors for my game UI"
```

## Implementation Details

### Architecture

The Godot MCP server uses a bundled GDScript approach for complex operations:

1. **Direct Commands**: Simple operations like launching the editor or getting project info use Godot's built-in CLI commands directly.
2. **Bundled Operations Script**: Complex operations like creating scenes or adding nodes use a single, comprehensive GDScript file (`godot_operations.gd`) that handles all operations.

This architecture provides several benefits:

- **No Temporary Files**: Eliminates the need for temporary script files, keeping your system clean
- **Simplified Codebase**: Centralizes all Godot operations in one (somewhat) organized file
- **Better Maintainability**: Makes it easier to add new operations or modify existing ones
- **Improved Error Handling**: Provides consistent error reporting across all operations
- **Reduced Overhead**: Minimizes file I/O operations for better performance

The bundled script accepts operation type and parameters as JSON, allowing for flexible and dynamic operation execution without generating temporary files for each operation.

## Troubleshooting

- **Godot Not Found**: Set the GODOT_PATH environment variable to your Godot executable
- **Connection Issues**: Ensure the server is running and restart your AI assistant
- **Invalid Project Path**: Ensure the path points to a directory containing a project.godot file
- **Build Issues**: Make sure all dependencies are installed by running `npm install`
- **For Cursor Specifically**:
- Ensure the MCP server shows up and is enabled in Cursor settings (Settings > MCP)
- MCP tools can only be run using the Agent chat profile (Cursor Pro or Business subscription)
- Use "Yolo Mode" to automatically run MCP tool requests

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/coding-solo-godot-mcp-badge.png)](https://mseep.ai/app/coding-solo-godot-mcp)
