# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Godot MCP is a Model Context Protocol (MCP) server that enables AI assistants to interact with the Godot game engine. It provides tools for launching the editor, running projects, capturing debug output, manipulating scenes, and managing project resources.

## Active Development

**IMPORTANT:** This project has an active enhancement roadmap. See `TODO.md` for the implementation plan and `godot-mcp-enhancements.md` for the complete enhancement specifications.

**Development Rules:**

1. **NO TASK MAY PROCEED UNTIL THE PREVIOUS TASK IS FULLY TESTED AND VALIDATED**
2. All tests must pass before marking any task complete
3. Each task has explicit testing requirements that MUST be completed
4. Document all test results in TODO.md before proceeding

The current implementation plan follows a phased approach:

- **Phase 1:** Signal & Event Connection System (COMPLETE ✅)
- **Phase 2:** GDScript Code Intelligence (COMPLETE ✅)
- **Phase 3:** Enhanced Debugging & Error Analysis (COMPLETE ✅)
- **Phase 4:** Animation & Timeline Orchestration (COMPLETE ✅)
- **Phase 5:** Shader & Material Pipeline (COMPLETE ✅)
- **Phase 6:** Testing & Quality Assurance (COMPLETE ✅)
- **Phase 7:** Asset Import & Configuration (COMPLETE ✅)
- **Phase 8:** Project Settings & Configuration (COMPLETE ✅)
- **Phase 9:** Build & Export Pipeline (COMPLETE ✅)
- **Phase 10:** Tilemap & Level Design (COMPLETE ✅)
- **Phase 11:** Dialogue & Localization Management (COMPLETE ✅)
- **Phase 12:** Plugin Management (COMPLETE ✅)
- **Tier 1:** Architecture + Scene Inspection + Shader Pipeline + AnimationTree + Refactoring (COMPLETE ✅)
- **Tier 2:** Particles + Scene Validation + Project Scaffolding + Performance Profiling + Caching (COMPLETE ✅)
- **Tier 3:** Code Intelligence + Engine Introspection + Audio Bus + Viewport Capture + Error/Logging Infrastructure (COMPLETE ✅)
- **Tier 4:** Automated Playtesting + Fun Metrics + Asset Generation Bridge (COMPLETE ✅)
- Future tiers cover specialized workflows as needed

## Build and Development Commands

### Essential Commands

- **Install dependencies**: `npm install`
- **Build the project**: `npm run build`
  - Compiles TypeScript from `src/` to `build/`
  - Copies `src/scripts/godot_operations.gd` to `build/scripts/`
  - Makes `build/index.js` executable
- **Development mode**: `npm run watch`
  - Runs TypeScript compiler in watch mode for continuous rebuilding
- **Test with MCP Inspector**: `npm run inspector`
  - Launches the MCP Inspector for interactive debugging

### Build Process

The build process involves two steps:

1. TypeScript compilation (`tsc`)
2. Post-build script (`scripts/build.js`) that:
   - Sets executable permissions on `build/index.js`
   - Copies the GDScript operations file to the build directory

## Architecture

### Core Components

**Main Server (`src/index.ts`)**: The legacy monolithic MCP server (~11,400 lines) containing the `GodotServer` class with 52 original tools. New tools use the modular architecture (see below).

**Modular Tool Architecture (Tier 1+)**:

- `src/types.ts` — Shared interfaces (`ToolDefinition`, `ServerContext`, `ToolResponse`, etc.)
- `src/registry.ts` — `ToolRegistry` class for registration-based tool dispatch
- `src/utils/tscn-parser.ts` — TypeScript parser for Godot `.tscn` scene files
- `src/utils/tscn-cache.ts` — Mtime-based cache for parsed TSCN files (Tier 2)
- `src/utils/validation.ts` — Centralized input validation middleware (Tier 2)
- `src/tools/scene.ts` — Scene inspection & manipulation (6 tools)
- `src/tools/shader.ts` — Shader pipeline completion (3 tools)
- `src/tools/animation-tree.ts` — AnimationTree configuration (2 tools)
- `src/tools/refactor.ts` — Refactoring tools (1 tool)
- `src/tools/project.ts` — Project scaffolding (1 tool, Tier 2)
- `src/tools/validate.ts` — Scene validation (1 tool, Tier 2)
- `src/tools/particles.ts` — Particle system designer (3 tools, Tier 2)
- `src/tools/profiling.ts` — Performance profiling (3 tools, Tier 2)
- `src/tools/code-intelligence.ts` — Extended code intelligence (4 tools, Tier 3)
- `src/tools/introspection.ts` — Class & engine introspection (2 tools, Tier 3)
- `src/tools/audio.ts` — Audio bus configuration (1 tool, Tier 3)
- `src/tools/viewport.ts` — Viewport screenshot capture (1 tool, Tier 3)
- `src/utils/errors.ts` — Structured error taxonomy with categories and codes (Tier 3)
- `src/utils/logger.ts` — Operation logging with session tracking (Tier 3)
- `src/tools/playtest.ts` — Automated playtesting harness (6 tools, Tier 4)
- `src/tools/fun-metrics.ts` — Fun metrics framework (5 tools, Tier 4)
- `src/tools/asset-generation.ts` — Asset generation bridge (5 tools, Tier 4)
- `src/utils/playtest-session.ts` — Session data types, I/O, and user:// path resolution (Tier 4)
- `src/utils/playtest-recorder-gen.ts` — GDScript recorder autoload generator (Tier 4)
- `src/utils/playtest-bot-gen.ts` — GDScript bot autoload generator (Tier 4)
- `src/utils/heatmap-generator.ts` — Heatmap computation and HTML visualization (Tier 4)
- `src/utils/genre-benchmarks.ts` — Genre benchmark data for comparison (Tier 4)
- `src/utils/metrics-calculator.ts` — Game feel metrics computation (Tier 4)
- `src/utils/generation-backends.ts` — Pluggable image/audio generation backends (Tier 4)

**Hybrid Dispatch**: The server uses registry-first dispatch. New modular tools register via `ToolRegistry`; legacy tools use the existing switch statement. The `CallToolRequestSchema` handler checks the registry first, then falls back to the switch. The registry includes per-tool timeout enforcement and automatic operation logging (Tier 3).

**Bundled Operations Script (`src/scripts/godot_operations.gd`)**: A comprehensive GDScript file (~5,900 lines) that handles all complex Godot operations. This script:

- Accepts operation type and JSON parameters via command-line arguments
- Executes operations directly within Godot's headless mode
- Eliminates the need for temporary script files
- Provides consistent error handling and logging

### Key Design Patterns

**Tool Registration (new pattern)**: New tools are defined as `ToolDefinition` objects in domain modules under `src/tools/`. Each module exports a `registerXxxTools(registry, ctx)` function. The `ServerContext` interface decouples tool implementations from the `GodotServer` class.

**Operation Dispatch**: The server uses a "bundled operation" approach rather than generating temporary scripts:

1. Simple CLI operations (launch editor, get version) use Godot's built-in commands directly
2. Complex operations (scene manipulation, node creation) invoke `godot_operations.gd` with operation type and JSON parameters
3. The GDScript file uses pattern matching to route to specific operation handlers
4. Read-only scene operations use the TypeScript TSCN parser (no Godot process needed)

**Parameter Mapping**: The server supports both snake_case and camelCase parameter names:

- `parameterMappings` converts snake_case to camelCase
- `reverseParameterMappings` converts camelCase to snake_case
- This dual support accommodates different MCP client conventions
- **CRITICAL:** Every snake_case parameter introduced by any tool MUST be explicitly added to the `parameterMappings` table in `src/index.ts`. If omitted, `normalizeParameters()` leaves the key as snake_case but all handlers check for camelCase — causing silent "required parameter" failures. See Tier 1 testing: 30 mappings were missing and had to be added. Tier 3 testing: 13 more mappings were missing (`script_path`, `class_name`, `setup_code`, `teardown_code`, `test_dir`, `exclude_virtual`, `base_class`, `methods_to_mock`, `signals_to_track`, `include_inherited`, `godot_version`, `max_results`, `delay_frames`).

**Process Management**: Maintains a single active Godot process (`activeProcess: GodotProcess | null`) for running projects, capturing stdout/stderr output and errors.

**Godot Path Detection**: Implements multi-stage fallback logic:

1. Custom path from config
2. GODOT_PATH environment variable
3. Platform-specific common installation paths
4. Fallback defaults with warnings

### Available MCP Tools

The server exposes 92 tools via the MCP protocol:

**Project Management**:

- `launch_editor` - Open Godot editor for a project
- `run_project` - Execute a project in debug mode with optional scene
- `stop_project` - Terminate running project
- `get_debug_output` - Retrieve captured console output **with enhanced error parsing** (Phase 3)
- `get_godot_version` - Query installed Godot version
- `list_projects` - Find project.godot files in directories
- `get_project_info` - Analyze project structure and assets

**Scene Manipulation**:

- `create_scene` - Create new .tscn files with specified root node types
- `add_node` - Add nodes to scenes with properties
- `load_sprite` - Assign textures to Sprite2D nodes
- `save_scene` - Save or create scene variants

**Resource Management**:

- `export_mesh_library` - Convert 3D scenes to MeshLibrary resources
- `get_uid` - Retrieve UIDs for files (Godot 4.4+)
- `update_project_uids` - Resave resources to update UID references (Godot 4.4+)

**Signal & Event System** (Phase 1 - COMPLETE):

- `list_signals` - List all signals available on a node type or instance with parameter info
- `list_connections` - List all signal connections in a scene with filtering support
- `connect_signal` - Connect signals to create functional interactive scenes (CORE)
- `disconnect_signal` - Remove existing signal connections from scenes
- `validate_connection` - Pre-validate signal connections before creating them

**GDScript Code Intelligence** (Phase 2 - COMPLETE):

- `analyze_script` - Parse GDScript files to extract structure (class, functions, signals, variables, dependencies)
- `create_script` - Generate GDScript files from production-ready templates (basic, state_machine, singleton, component, character_controller)
- `modify_function` - Update existing function implementations with optional signature changes
- `add_export_variable` - Add @export variables with hints (RANGE, FILE, DIR, ENUM, FLAGS, etc.) for editor exposure
- `extract_dependencies` - Find all script dependencies (preloads, loads, resource paths, class references)
- `attach_script` - Attach GDScript files to scene nodes with automatic ExtResource management

**Enhanced Debugging & Error Analysis** (Phase 3 - COMPLETE):

- `get_debug_output` - Enhanced with intelligent error parsing that:
  - Automatically detects and parses 5 Godot error patterns (SCRIPT ERROR, ERROR, Parse error, WARNING, Debugger Break)
  - Extracts structured error information (type, message, file path, line number, function name)
  - Provides context-aware actionable solutions for common error types:
    - Null reference errors
    - Invalid index/bounds errors
    - Parse/syntax errors
    - Function not found errors
    - Type mismatch errors
    - Resource not found errors
    - Signal connection errors
  - Returns `parsed_errors` array with full context and `error_count` in addition to raw output/errors

- `validate_script` - Validate GDScript syntax without execution:
  - Uses Godot's `--check-only` flag to check scripts for syntax errors
  - Validates scripts without running them or modifying game state
  - Reuses error parsing from `get_debug_output` for consistent error reporting
  - Returns structured validation result with:
    - `valid`: boolean indicating script has no errors
    - `exit_code`: Godot validation exit code (0 = success, 1 = errors)
    - `errors`: array of parsed error objects with type, message, file, line, solutions
    - `error_count`: total number of validation errors
    - `raw_output` and `raw_errors`: unfiltered output for debugging
  - Catches syntax errors, undefined variables, type mismatches, and other parse-time issues
  - Ideal for pre-commit validation or CI/CD integration

**Animation & Timeline Orchestration** (Phase 4 - COMPLETE):

- `create_animation_player` - Add AnimationPlayer nodes to scenes with optional initial animations
  - Creates AnimationPlayer nodes with parent path specification
  - Automatically creates AnimationLibrary for Godot 4.x compatibility
  - Optional initial animation name parameter
- `add_animation_track` - Add tracks to existing animations
  - Supports 6 track types: position, rotation, scale, property, method, audio
  - Maps user-friendly names to Animation.TYPE_* enums
  - Property paths with colons (e.g., "modulate:a")
  - Method tracks for function calls during animation
- `add_keyframe` - Add keyframes to animation tracks with easing support
  - Supports all track types with appropriate value handling
  - Custom easing curves (< 1.0 ease-in, = 1.0 linear, > 1.0 ease-out)
  - Automatic Array-to-Vector3 conversion for 3D transform tracks
  - Method call keyframes with arguments
  - Professional animation workflow: Create → Track → Keyframe

**Shader & Material Pipeline** (Phase 5 - COMPLETE):

- `create_shader_material` - Create shader materials with custom shader code or templates
  - Supports shader types: canvas_item, spatial, particles
  - Validates shader compilation before saving
  - Creates both .gdshader and .tres material files
  - Automatic type conversion for shader parameters (Array → Vector2/Vector3/Color)
  - 4 production-ready shader templates:
    - **dissolve** - Fade/dissolve effect with edge glow (dissolve_amount, edge_color, edge_width)
    - **outline** - Colored border around sprites (outline_color, outline_width)
    - **damage_flash** - Hit flash effect (flash_intensity, flash_color)
    - **hologram** - Scan lines effect (scan_speed, tint_color, scan_intensity)

**Testing & Quality Assurance** (Phase 6 - COMPLETE):

- `create_test_suite` - Create GUT (Godot Unit Test) test files with test cases
  - Generates test scripts extending GutTest with proper test methods
  - Automatically prefixes test methods with "test_" if not present
  - Supports multiple test cases with assertions, setup code, and descriptions
  - Optional hooks: before_all, after_all, before_each, after_each
  - Creates directory structure automatically
  - Integration with GUT 9.5.0 framework

- `run_tests` - Execute GUT tests and return structured results
  - Runs tests in headless mode via Godot command line
  - Comprehensive output parsing with ANSI color code stripping
  - Returns structured JSON with test files, tests, assertions, and summary statistics
  - Supports filtering by test directory or specific test file
  - Captures both passing and failing test details with assertion-level tracking
  - Output includes:
    - `success`: overall pass/fail status
    - `summary`: scripts, tests, passing_tests, failing_tests, asserts, time
    - `test_files`: array of test files with individual test results
    - `raw_output` and `raw_errors`: unfiltered output for debugging

**Asset Import & Configuration** (Phase 7 - COMPLETE):

- `import_texture` - Configure texture import settings for optimal game performance
  - Modifies .import files to control filtering, mipmaps, compression
  - Filter modes: Linear, Nearest (pixel art), Linear Mipmap, Nearest Mipmap
  - Compression: Lossless, Lossy, VRAM Compressed, VRAM Uncompressed, Basis Universal
  - Additional settings: sRGB handling, normal map detection, repeat mode
- `import_audio` - Configure audio import settings for music and sound effects
  - Loop settings: enable/disable, loop mode (Forward, Ping-Pong, Backward)
  - Music sync: BPM, beat count, bar beats for rhythm synchronization
  - Loop offset for skipping intro sections
  - Supports WAV, OGG, MP3 formats with automatic detection
- `import_3d_model` - Configure 3D model import with materials, collisions, animations
  - Collision generation: None, Mesh, Convex, Multiple Convex, Decomposed
  - Import options: materials, animations, scale, LOD generation
  - Root node type: Node3D, StaticBody3D, RigidBody3D, CharacterBody3D, Area3D
  - Supports GLTF, GLB, FBX, OBJ, DAE, BLEND formats
- `create_resource` - Create custom Godot Resource files (.tres) programmatically
  - Supports any Resource class: Theme, Environment, Material, AudioBusLayout, etc.
  - 6 built-in templates: theme_dark, theme_light, environment_outdoor, environment_indoor, material_standard, material_unshaded
  - Set any resource property with automatic type formatting
  - Generates valid Godot 4.x .tres files with proper UIDs

**Project Settings & Configuration** (Phase 8 - COMPLETE):

- `modify_project_setting` - Modify project.godot settings programmatically
  - Supports any setting path (e.g., "display/window/size/viewport_width", "physics/2d/default_gravity")
  - Handles all value types: strings, numbers, booleans, arrays, Godot types
  - Automatically creates sections if they don't exist
  - Direct file manipulation for reliable persistence
- `configure_input_action` - Create and modify input action maps
  - Event types: keyboard (InputEventKey), mouse button (InputEventMouseButton), joypad button (InputEventJoypadButton), joypad axis (InputEventJoypadMotion)
  - Full key mapping for A-Z, 0-9, F1-F12, arrows, modifiers, special keys
  - Configurable deadzone for analog input
  - Support for multiple bindings per action
  - Generates proper Godot 4.x Object() format
- `setup_render_layers` - Configure physics and render layer names
  - Layer types: 2d_physics, 3d_physics, 2d_render, 3d_render
  - Validates layer numbers (1-32 for physics, 1-20 for render)
  - Writes to [layer_names] section in project.godot
  - Layer names improve editor usability and code readability
- `configure_autoload` - Add or remove autoload singletons
  - Add global singleton scripts accessible from any script
  - Enable/disable autoloads with * prefix control
  - Remove autoloads cleanly from project settings
  - Validates script existence before adding
  - Essential for game managers, audio systems, save systems

**Build & Export Pipeline** (Phase 9 - COMPLETE):

- `create_export_preset` - Generate export presets for target platforms
  - Platforms: Windows Desktop, Linux/X11, macOS, Web, Android, iOS
  - Creates export_presets.cfg with platform-specific settings
  - Options: runnable, debug mode, include/exclude filters, encryption
  - Auto-generates export paths with correct file extensions (.exe, .x86_64, .zip, .html, .apk, .ipa)
  - Supports adding multiple presets to same project
- `export_project` - Build/export Godot projects for distribution
  - Modes: debug export (--export-debug), release export (--export-release), pack-only (--export-pack)
  - Validates preset exists before export
  - Creates output directories automatically
  - Returns build duration, exit code, and output verification
  - Captures export errors for troubleshooting
- `validate_export` - Check projects for export issues before building
  - Checks: export_presets.cfg exists, export templates installed, script issues, large assets, project icon
  - Script analysis: debug print statements (>10), breakpoint() calls, TODO/FIXME comments
  - Severity levels: error, warning, info with actionable recommendations
  - Export readiness determination
  - Summary with error/warning/info counts

**Tilemap & Level Design** (Phase 10 - COMPLETE):

- `create_tilemap` - Create TileMap nodes with TileSet configuration
  - Configure tile size (8x8, 16x16, 32x32, etc.)
  - Create new TileSet or reference existing one
  - Support multiple named layers (Ground, Objects, Collisions, etc.)
  - Proper Godot 4.x TileMap format with TileSetAtlasSource
- `paint_tiles` - Paint tiles programmatically with patterns
  - Pattern types: single tile, rectangular region, line (Bresenham), erase
  - Paint on specific layers by index
  - Specify tile source ID and atlas coordinates
  - Supports bulk tile operations for efficient level generation
- `configure_tileset` - Configure TileSet with texture, collision, navigation, terrain
  - Set up texture atlas source with tile size
  - Add collision polygons to tiles for physics
  - Add navigation polygons for pathfinding
  - Configure terrain sets for autotiling
  - Physics and navigation layer configuration
- `generate_navmesh` - Create NavigationRegion3D with NavigationMesh for 3D pathfinding
  - Agent parameters: radius, height, max slope, max climb
  - Cell configuration: cell size and height for voxelization
  - Source geometry modes: static_colliders, meshes, physics_bodies
  - Ready for runtime baking with NavigationServer3D

**Dialogue & Localization Management** (Phase 11 - COMPLETE):

- `create_translation_file` - Create translation files for localization (CSV or PO format)
  - CSV format with multiple locale columns
  - PO format (GNU gettext) for single locale
  - Pre-populate with initial translation keys
  - Automatic directory creation and UTF-8 encoding
- `add_translation` - Add or update translation entries in existing files
  - Add new keys or update existing translations
  - Partial updates preserve other locales
  - Support for placeholder syntax ({variable}, %s, %d)
  - Comments and context hints for PO format
- `remove_translation` - Remove translation keys from files
  - Remove single or multiple keys by name
  - Pattern matching with regex for bulk removal
  - Dry run mode to preview changes
- `validate_translations` - Validate translation files for completeness and consistency
  - Detect missing translations for any locale
  - Check placeholder consistency across translations
  - Find duplicate keys
  - Generate actionable recommendations
- `create_dialogue_resource` - Create dialogue resources for conversations
  - Linear dialogue sequences with next entry linking
  - Branching choices with conditions (GDScript expressions)
  - Character metadata (portraits, colors, voice)
  - Signal emission for game integration
- `configure_localization` - Configure project.godot localization settings
  - Add/remove supported locales
  - Register translation files
  - Set fallback locale for missing translations
  - Set test locale for development
- `extract_translatable_strings` - Scan project for translatable content
  - Find tr() calls in GDScript with context
  - Extract UI text from .tscn files (Label.text, Button.text, etc.)
  - Detect hardcoded strings that should use tr()
  - Output to CSV, PO, or JSON format

**Plugin Management** (Phase 12 - COMPLETE):

- `list_plugins` - List installed plugins with status from project.godot
  - Scan addons/ directory for plugin folders
  - Parse plugin.cfg for name, version, author metadata
  - Check [editor_plugins] section for enabled/disabled status
  - Verbose mode includes raw configuration
- `configure_plugin` - Enable, disable, or configure plugin settings
  - Manages [editor_plugins] PackedStringArray in project.godot
  - Add plugin-specific settings sections
  - Track previous and new state for change reporting
- `create_plugin` - Generate plugin scaffolds with templates
  - 5 templates: basic, dock, inspector, import, tool
  - Creates plugin.cfg and main plugin.gd
  - Dock template includes dock.tscn scene
  - Inspector template includes EditorInspectorPlugin script
  - Import template includes EditorImportPlugin script
  - Tool template adds tool menu item
  - Auto-enable option after creation
- `install_plugin` - Install plugins from Asset Library or Git
  - Asset Library: search by query or install by ID
  - Git: clone from any repository with branch selection
  - Handles ZIP extraction and addon folder detection
  - Auto-enable option after installation
  - Overwrite protection for existing plugins

**Scene Inspection & Manipulation** (Tier 1):

- `list_scene_tree` - Get the full node hierarchy of a .tscn file (TypeScript TSCN parser, no Godot needed)
- `read_node_properties` - Read all properties of a specific node in a scene (TypeScript TSCN parser)
- `modify_node_property` - Change properties on existing nodes without recreating them (GDScript)
- `remove_node` - Remove a node and optionally reparent its children (GDScript)
- `duplicate_node` - Clone an existing node with children and properties (GDScript)
- `reparent_node` - Move a node to a different parent in the scene tree (GDScript)

**Shader Pipeline Completion** (Tier 1):

- `apply_material` - Apply ShaderMaterial or StandardMaterial3D to a node (auto-detects slot)
- `set_shader_parameter` - Modify shader uniform values with type conversion
- `create_material_from_texture` - Generate StandardMaterial3D from albedo + optional PBR maps

**AnimationTree Configuration** (Tier 1):

- `configure_animation_tree` - Set up AnimationTree with StateMachine, BlendSpace1D/2D, or BlendTree
- `create_animation_library` - Batch-create multiple animations from compact descriptions

**Refactoring** (Tier 1):

- `refactor_rename` - Rename functions, variables, signals, classes, or constants across all .gd and .tscn files with dry_run preview

**Project Scaffolding** (Tier 2):

- `create_project` - Scaffold a new Godot project from scratch
  - Templates: blank, 2d_game, 3d_game, ui_app
  - Configurable renderer: forward_plus, mobile, gl_compatibility
  - Standard directory structure (scenes, scripts, assets, audio, shaders, resources, addons)
  - Default main scene with template-appropriate nodes

**Scene Validation** (Tier 2):

- `validate_scene` - Check a scene for common issues before runtime
  - Checks: missing_resources, broken_scripts, collision_without_body, sprite_without_texture, signal_method_missing, duplicate_node_names, empty_containers, deep_nesting
  - Uses TypeScript TSCN parser (no Godot process needed)
  - Returns issues with severity (error/warning/info) and recommendations

**Particle System Designer** (Tier 2):

- `create_particle_system` - Create GPUParticles2D/3D with ParticleProcessMaterial
  - Emission shapes: point, sphere, sphere_surface, box, ring
  - Direction, velocity, gravity, scale, and color configuration
- `apply_particle_preset` - Create particle systems from named presets
  - Presets: fire, smoke, explosion, magic_sparkle, rain, snow, dust, sparks
  - Scale factor for preset customization
- `create_particle_material` - Create standalone ParticleProcessMaterial .tres files
  - Full parameter control or preset-based creation
  - Reusable across multiple scenes

**Performance Profiling** (Tier 2):

- `start_profiler` - Run a Godot project with performance profiling
  - Injects a temporary profiler autoload that samples Performance monitors
  - Configurable duration and sample interval
  - Automatic cleanup after profiling
- `get_profiling_data` - Read profiling results from a completed session
  - Returns raw samples and statistical summary (avg/min/max FPS, frame times, draw calls, memory)
- `analyze_bottlenecks` - Threshold-based bottleneck detection
  - Checks FPS, frame time, draw calls, memory, orphan nodes against configurable target FPS
  - Overall grade (A-F) and prioritized recommendations

**Extended Code Intelligence** (Tier 3):

- `generate_docstring` - Generate ## doc comments for GDScript functions and classes
  - Parses functions to extract params, return types, and virtual method patterns
  - Inserts @param and @return annotations
  - Optional target for specific function or entire file
  - Overwrite mode for replacing existing docs
- `generate_test_from_specification` - Generate GUT tests from natural language behavior specs
  - Transforms descriptions into test methods with appropriate assertions
  - Auto-generates assert_eq, assert_true, assert_signal_emitted from spec keywords
  - Includes before_each/after_each with class preloading
- `analyze_test_coverage` - Match source functions to test methods by naming convention
  - Scans .gd files for func declarations, test/ for test_* methods
  - Reports per-script and overall coverage percentage
  - Excludes virtual functions (_ready,_process, etc.) by default
- `create_mock_node` - Generate mock GDScript classes for unit testing
  - Extends base class with overridden methods and configurable return values
  - Call tracking with assert_called/assert_called_with/call_count helpers
  - Optional signal emission tracking

**Class & Engine Introspection** (Tier 3):

- `get_class_info` - Query Godot ClassDB for class properties, methods, signals, constants
  - Uses ClassDB API in headless mode
  - Optional include_inherited flag
  - Section filter (properties, methods, signals, constants, all)
  - Returns inheritance chain
- `search_asset_library` - Search the official Godot Asset Library REST API
  - Filter by query, category, Godot version
  - Sort by rating, cost, name, updated
  - Returns asset metadata: title, author, description, category

**Audio Bus Configuration** (Tier 3):

- `configure_audio_bus` - Create AudioBusLayout with buses, routing, and effects
  - Bus properties: volume_db, mute, solo, bypass_effects, send_to routing
  - 13 effect types: Reverb, Compressor, Limiter, EQ (6/10/21-band), Delay, Chorus, Phaser, Distortion, LowPass, HighPass, BandPass, Amplify, Panner
  - Each effect type supports its full parameter set
  - Saves as .tres AudioBusLayout resource

**Viewport & Screenshot Capture** (Tier 3):

- `capture_viewport` - Take a screenshot of a Godot scene viewport
  - Injects temporary autoload, runs scene non-headless, captures PNG
  - Configurable delay frames for scene loading
  - Optional resolution override
  - Requires display (won't work on headless servers without Xvfb)

**Infrastructure Improvements** (Tier 3):

- Structured error taxonomy (`src/utils/errors.ts`): ErrorCategory enum, StructuredError interface, error code constants
- Operation logger (`src/utils/logger.ts`): Automatic logging of all registry-dispatched tools with timestamps, duration, sanitized parameters
- Per-tool timeout: Optional `timeout` field on ToolDefinition, enforced via Promise.race in registry dispatch

**Automated Playtesting Harness** (Tier 4):

- `run_automated_playtest` - Run a Godot project with an automated input bot and playtest recorder
  - Bot types: random (random input actions), waypoint (random navigation), idle (no input), stress (all inputs simultaneously)
  - Player auto-detection: explicit path, node named "Player", first CharacterBody2D/3D
  - Records position, velocity, state, events, performance samples, and optionally inputs
  - Event detection via convention signals (died, health_changed, damage_taken) and user-specified hooks
  - Health property watching (detects damage and death from health decreases)
  - Configurable duration (max 600s), sample interval, session naming
- `start_playtest_recording` - Start manual playtest recording (human plays)
  - Injects recorder autoload, runs project non-blocking
  - Returns session_id for stop_playtest_recording
- `stop_playtest_recording` - Stop recording, collect session data, clean up autoloads
- `analyze_playtest_session` - Analyze recorded session for patterns
  - Analysis types: death_locations (clustering), backtracking, difficulty_spikes, time_distribution, event_frequency, movement_patterns
  - Returns structured analysis with recommendations
- `generate_heatmap` - Generate heatmap from playtest sessions
  - Types: position, death, damage, pickup, time_spent
  - Returns JSON grid data (AI-readable) + saves HTML visualization (human-viewable)
  - Configurable cell size and hotspot detection
- `compare_sessions` - Compare metrics across multiple sessions
  - Metrics: duration, deaths, damage, distance, events, FPS, areas_visited, inputs
  - Aggregates (min/max/avg/stddev), trend detection, optional group_by

**Fun Metrics Framework** (Tier 4):

- `calculate_game_feel_metrics` - Score game feel on 0-100 scale
  - Metrics: responsiveness (input-to-movement latency), pacing (event intensity variance), difficulty (death/damage rates), engagement (exploration diversity)
  - Returns per-metric scores with explanations and recommendations
- `analyze_difficulty_curve` - Time-windowed difficulty analysis
  - Configurable window size and death/damage weights
  - Detects spikes (>2x previous window), valleys (3+ zero windows)
  - Classifies curve shape: gradually_increasing, sawtooth, flat, variable
- `compare_to_genre_benchmarks` - Compare against genre standards
  - Genres: platformer, roguelike, fps, rpg, puzzle, metroidvania, action, survival
  - Compares deaths/min, session duration, damage/min, FPS, idle ratio
  - Returns genre fit score and per-metric assessment
- `detect_frustration_points` - Identify frustration signals
  - Detects: repeated deaths in same area, long idle periods, rapid input spam
  - Configurable sensitivity (low/medium/high)
  - Each point includes location, evidence, severity, and suggestion
- `analyze_juice_coverage` - Scan scripts for visual/audio feedback on actions
  - Scans .gd files for action functions (attack, jump, dash, etc.)
  - Checks for audio, particles, animation, tween, screen effects
  - Reports coverage percentage and identifies unjuiced actions

**Asset Generation Bridge** (Tier 4):

- `generate_sprite` - Generate 2D sprite from text description
  - Backends: DALL-E 3 (requires OPENAI_API_KEY) or placeholder (colored PNG)
  - Styles: pixel_art, hand_drawn, realistic, cartoon, flat
  - Saves PNG to project assets directory
- `generate_texture` - Generate tileable texture from description
  - Same backends as generate_sprite, adds seamless/tileable instructions
- `generate_sfx` - Generate sound effect from text description
  - Backends: ElevenLabs (requires ELEVENLABS_API_KEY) or placeholder (sine tone WAV)
  - Configurable duration (max 10s)
- `generate_music` - Generate background music from description
  - Placeholder backend generates sine tone WAV with configurable duration/BPM
  - Supports mood keywords, loop flag, BPM setting
- `configure_asset_generation` - View backend configuration and API key status
  - Shows active backends and environment variable status
  - Optional connectivity testing for configured APIs

## Configuration

### Environment Variables

- `GODOT_PATH`: Override Godot executable path (avoids auto-detection)
- `DEBUG`: Set to "true" to enable detailed server-side logging
- `OPENAI_API_KEY`: API key for DALL-E 3 image generation (Tier 4)
- `ELEVENLABS_API_KEY`: API key for ElevenLabs audio generation (Tier 4)
- `ASSET_GEN_IMAGE_BACKEND`: Image generation backend — `dalle3` or `placeholder` (default: `placeholder`)
- `ASSET_GEN_AUDIO_BACKEND`: Audio generation backend — `elevenlabs` or `placeholder` (default: `placeholder`)

### Server Configuration Options

When instantiating `GodotServer`, you can pass a `GodotServerConfig`:

- `godotPath`: Custom path to Godot executable
- `debugMode`: Enable debug logging (overrides DEBUG env var)
- `godotDebugMode`: Always true for operations script
- `strictPathValidation`: When true, throws error if Godot not found (default: false)

## Cross-Platform Considerations

- Always use Node.js `path` utilities (`join`, `normalize`, `dirname`) for path operations
- Godot executable locations vary by platform:
  - **macOS**: `/Applications/Godot.app/Contents/MacOS/Godot`
  - **Windows**: `C:\Program Files\Godot\Godot.exe`
  - **Linux**: `/usr/bin/godot` or `/usr/local/bin/godot`
- The server normalizes all paths to ensure consistent format

## Code Style and Patterns

- TypeScript with strict mode enabled
- ES2022 target, ESNext module format
- JSDoc comments for all classes and methods
- Error responses include `isError: true` and optional `possibleSolutions` array
- Debug logging gated by `DEBUG_MODE` constant
- Path validation to prevent traversal attacks

## Adding New Tools

### New modular approach (preferred)

1. Create or edit a tool module in `src/tools/` (e.g., `src/tools/myfeature.ts`)
2. Define a `ToolDefinition` with name, description, inputSchema, and handler
3. Export a `registerXxxTools(registry: ToolRegistry, ctx: ServerContext)` function
4. Import and call the registration function in `registerModularTools()` in `src/index.ts`
5. **Add every new snake_case parameter name to `parameterMappings` in `src/index.ts`** — omitting this causes silent "required parameter" errors since `normalizeParameters()` only converts mapped keys
6. If it requires GDScript operations, add the operation handler to `godot_operations.gd`
7. Update CLAUDE.md and README.md with the new tool documentation

### Legacy approach (for editing existing tools)

1. Add tool definition to `setupToolHandlers()` in the `ListToolsRequestSchema` handler
2. Add tool name to the switch statement in `CallToolRequestSchema` handler
3. Implement handler method (e.g., `private async handleNewTool(args: any)`)
4. If it requires GDScript operations, add operation to `godot_operations.gd`
5. Update README.md Features section
6. Update configuration examples with new tool in `autoApprove` array

## Testing and Debugging

- Use `npm run inspector` to interactively test tools
- Enable DEBUG mode for verbose logging
- Check both server logs (TypeScript side) and Godot logs (GDScript side)
- The GDScript operations file includes its own debug logging controlled by `--debug-godot` flag
- Run Godot operations directly from bash to isolate TypeScript vs GDScript issues:

  ```bash
  "C:\Users\brett\Desktop\Godot\Godot.exe" --headless --path "<project>" \
    --script "build/scripts/godot_operations.gd" <operation> "<json_params>" --debug-godot
  ```

- **Editor + headless conflict:** Do not have the Godot editor open with a project while running MCP tools that write `.tres` or `.tscn` files. The editor's in-memory state overwrites external changes on scene reload. Applies especially to `set_shader_parameter` and `apply_material`.

## Known Issues & Architectural Notes

### Windows Shell Escaping (BUG-3 — open)

- **File:** `src/index.ts` → `executeOperation()`
- **Issue:** On Windows, `exec()` wraps JSON params as `\"..\"` with inner quotes escaped. For deeply nested JSON (arrays of objects as in `configure_animation_tree` `states`/`transitions`/`blend_points`), `cmd.exe` corrupts the string before Godot receives it. The GDScript logic is correct; the payload just never arrives intact.
- **Workaround:** Invoke Godot directly via bash when nested array-of-object params are needed.
- **Recommended fix:** Replace `exec(cmd)` with `execFile(godotPath, argsArray)` to bypass shell parsing entirely.

### Reparenting Nodes (Godot 4.x ownership, FIXED)

- **File:** `src/scripts/godot_operations.gd` → `reparent_node()`
- **Fix applied:** Must call `node.owner = null` + `_clear_owner_recursive()` before `remove_child()`, then reset owner after `add_child()`. Without this, Godot 4.x throws "Adding X as child to Y will make owner Z inconsistent."

### ShaderMaterial Parameter Persistence (FIXED)

- **File:** `src/scripts/godot_operations.gd` → `set_shader_parameter()`
- **Fix applied:** After `material.set_shader_parameter()`, check `material.resource_path`. If non-empty (ExtResource), call `ResourceSaver.save(material, material_path)` to persist changes to the `.tres` file. Without this, parameter changes exist only in memory and are lost.

### ParticleProcessMaterial Scale Properties (Godot 4.x API, FIXED)

- **File:** `src/scripts/godot_operations.gd` — `create_particle_system()` and `apply_particle_preset()`
- **Fix applied:** `ParticleProcessMaterial` does not have `scale_amount_min`/`scale_amount_max` as direct properties (those exist on `CPUParticles2D/3D`). Changed to `material.set_param_min(ParticleProcessMaterial.PARAM_SCALE, value)` / `set_param_max(...)`. The `.tres` file writer (`create_particle_material` in TypeScript) is unaffected since `scale_amount_min = ...` is valid in the resource text format.

### Signal Rename Scope Limitation (documented caveat)

- **Tool:** `refactor_rename` with `symbol_type: "signal"`
- **Behavior:** Renames signal declarations (`signal foo`) but does NOT rename convention-based handler methods (`_on_foo`) or `.emit()` call sites. These must be renamed separately (use `symbol_type: "function"` for the handler, `symbol_type: "variable"` or a manual pass for emit calls).

### GDScript JSON Output Parsing with Debug Mode (FIXED — Tier 3)

- **Files:** `src/tools/introspection.ts`, `src/tools/audio.ts`
- **Issue:** `GODOT_DEBUG_MODE` is always `true`, causing `[DEBUG] Params JSON: {"class_name":...}` to print to stdout before the actual result JSON. The original parser used `stdout.indexOf('{')` which found the `{` in the debug log line (containing escaped command params) instead of the actual JSON result from the GDScript operation. This broke `get_class_info` and `configure_audio_bus`.
- **Fix applied:** Changed both parsers to split stdout by lines and find the line starting with `{` — this skips all `[DEBUG]`/`[INFO]` prefixed lines and reliably extracts the result JSON.
- **Note:** Any new tool that parses JSON from `executeOperation()` stdout should use the line-based approach: `const jsonLine = lines.find(l => l.trimStart().startsWith('{'));`

### Coverage vs. Spec Test Naming Convention Mismatch (design caveat)

- **Tools:** `analyze_test_coverage` + `generate_test_from_specification`
- **Behavior:** `analyze_test_coverage` matches by strict naming convention (`test_[functionName]` or `test_[ClassName]_[functionName]`). Tests generated by `generate_test_from_specification` use descriptive names from specs (e.g., `test_emit_collected_signal_when_collect_is_called`) which do NOT match the convention and therefore show as uncovered. This is a design gap between the two tools, not a bug.

## Common Patterns

**Executing Godot Operations**:

```typescript
const result = await this.executeGodotOperation(
  projectPath,
  'operation_name',
  { param1: value1, param2: value2 }
);
```

**Creating Error Responses**:

```typescript
return this.createErrorResponse(
  'Error message',
  ['Solution 1', 'Solution 2']
);
```

**Validating Project Paths**:

```typescript
const projectFile = join(projectPath, 'project.godot');
if (!existsSync(projectFile)) {
  return this.createErrorResponse('Invalid project path');
}
```
