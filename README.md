
# Godot MCP

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

A Model Context Protocol (MCP) server for interacting with the Godot game engine. **78 tools** across 17 categories for complete AI-driven game development.

## Introduction

Godot MCP enables AI assistants to launch the Godot editor, run projects, capture debug output, inspect and manipulate scenes, manage scripts, configure shaders, run tests, export builds, and much more — all through a standardized MCP interface.

This direct feedback loop helps AI assistants like Claude understand what works and what doesn't in real Godot projects, leading to better code generation and debugging assistance.

## Tool Reference (78 tools)

### Project Management (7 tools)

| Tool | Description |
|------|-------------|
| `launch_editor` | Open the Godot editor for a specific project |
| `run_project` | Execute a project in debug mode with optional scene selection |
| `stop_project` | Terminate a running project |
| `get_debug_output` | Retrieve console output with intelligent error parsing, structured errors, and actionable solutions |
| `get_godot_version` | Query the installed Godot version |
| `list_projects` | Find project.godot files in a directory (recursive or flat) |
| `get_project_info` | Analyze project structure and assets |

### Scene Creation (5 tools)

| Tool | Description |
|------|-------------|
| `create_scene` | Create new .tscn files with a specified root node type |
| `add_node` | Add child nodes to scenes with properties |
| `load_sprite` | Assign textures to Sprite2D nodes |
| `save_scene` | Save scenes or create scene variants |
| `export_mesh_library` | Convert 3D scenes to MeshLibrary resources for GridMap |

### Scene Inspection & Manipulation (6 tools)

| Tool | Description | Engine |
|------|-------------|--------|
| `list_scene_tree` | Get the full node hierarchy of a .tscn file with types, paths, and attached resources | TypeScript |
| `read_node_properties` | Read all properties of a specific node including resolved resource references | TypeScript |
| `modify_node_property` | Change properties on existing nodes (position, visibility, modulate, etc.) | GDScript |
| `remove_node` | Remove a node and optionally reparent its children | GDScript |
| `duplicate_node` | Clone a node with all properties and children | GDScript |
| `reparent_node` | Move a node to a different parent in the scene tree | GDScript |

```text
# Example: Inspect and modify an existing scene
list_scene_tree(project_path, scene_path="scenes/level.tscn")
read_node_properties(project_path, scene_path, node_path="Player/Sprite2D")
modify_node_property(project_path, scene_path, node_path="Player", property_name="position", property_value="Vector2(100, 200)")
reparent_node(project_path, scene_path, node_path="UI/OldParent/Button", new_parent_path="UI/NewParent")
```

### UID Management (2 tools)

| Tool | Description |
|------|-------------|
| `get_uid` | Get UID for a file (Godot 4.4+) |
| `update_project_uids` | Resave resources to update UID references |

### Signal & Event System (5 tools)

| Tool | Description |
|------|-------------|
| `list_signals` | List all signals on a node type or instance with parameter info |
| `list_connections` | List all signal connections in a scene with filtering |
| `connect_signal` | Connect signals to methods — persists to .tscn |
| `disconnect_signal` | Remove existing signal connections |
| `validate_connection` | Pre-validate connections before creating them |

### GDScript Code Intelligence (7 tools)

| Tool | Description |
|------|-------------|
| `analyze_script` | Parse GDScript files to extract structure (class, functions, signals, variables) |
| `create_script` | Generate scripts from templates: basic, state_machine, singleton, component, character_controller |
| `modify_function` | Update function implementations with optional signature changes |
| `add_export_variable` | Add @export variables with hints (RANGE, FILE, DIR, ENUM, FLAGS, etc.) |
| `extract_dependencies` | Find all preloads, loads, resource paths, and class references |
| `attach_script` | Attach GDScript files to scene nodes with ExtResource management |
| `validate_script` | Validate GDScript syntax using Godot's `--check-only` flag |

### Debugging & Error Analysis (enhanced)

`get_debug_output` and `validate_script` include intelligent error parsing:
- 5 error pattern types: SCRIPT ERROR, ERROR, Parse error, WARNING, Debugger Break
- Structured extraction: type, message, file, line, function
- Context-aware solutions for null references, index errors, parse errors, type mismatches, missing resources, signal issues

### Animation & Timeline (5 tools)

| Tool | Description |
|------|-------------|
| `create_animation_player` | Add AnimationPlayer nodes with optional initial animations |
| `add_animation_track` | Add tracks: position, rotation, scale, property, method, audio |
| `add_keyframe` | Add keyframes with custom easing curves |
| `configure_animation_tree` | Set up AnimationTree with StateMachine, BlendSpace1D/2D, or BlendTree root |
| `create_animation_library` | Batch-create multiple animations from compact descriptions |

```text
# Example: Character animation with state machine
create_animation_player(project_path, scene_path, parent_node_path="Player", animation_name="idle")
# ... add tracks and keyframes for idle, run, jump animations ...

configure_animation_tree(
  project_path, scene_path,
  parent_node_path="Player",
  animation_player_path="../AnimationPlayer",
  root_type="state_machine",
  states=[
    {name: "Idle", animation: "idle"},
    {name: "Run", animation: "run"},
    {name: "Jump", animation: "jump"}
  ],
  transitions=[
    {from: "Idle", to: "Run", advance_condition: "is_moving"},
    {from: "Run", to: "Idle", advance_condition: "is_idle"},
    {from: "any", to: "Jump", advance_condition: "is_jumping", switch_mode: "immediate"}
  ]
)
```

### Shader & Material Pipeline (4 tools)

| Tool | Description |
|------|-------------|
| `create_shader_material` | Create shader materials with custom code or templates (dissolve, outline, damage_flash, hologram) |
| `apply_material` | Apply ShaderMaterial or StandardMaterial3D to a node — auto-detects correct slot |
| `set_shader_parameter` | Modify shader uniform values (Vector2/3/4, Color, float, texture path) |
| `create_material_from_texture` | Generate StandardMaterial3D from albedo + optional normal/roughness/metallic/emission maps |

```text
# Example: Full shader workflow — create, apply, tune
create_shader_material(template="dissolve", shader_path="shaders/dissolve.gdshader", material_path="materials/dissolve.tres")
apply_material(project_path, scene_path, node_path="Enemy/Sprite2D", material_path="materials/dissolve.tres")
set_shader_parameter(project_path, scene_path, node_path="Enemy/Sprite2D", parameter_name="dissolve_amount", parameter_value=0.5)

# Example: PBR material from texture maps
create_material_from_texture(
  project_path, material_name="brick_wall",
  albedo_texture="textures/brick_albedo.png",
  normal_texture="textures/brick_normal.png",
  roughness_texture="textures/brick_roughness.png"
)
```

### Testing & QA (2 tools)

| Tool | Description |
|------|-------------|
| `create_test_suite` | Create GUT test files with test cases, assertions, and setup/teardown hooks |
| `run_tests` | Execute GUT tests headlessly and return structured pass/fail results |

### Asset Import & Configuration (4 tools)

| Tool | Description |
|------|-------------|
| `import_texture` | Configure filter mode (Nearest for pixel art), compression, mipmaps, repeat |
| `import_audio` | Configure loop settings, BPM sync, loop offset for WAV/OGG/MP3 |
| `import_3d_model` | Configure collision generation, materials, animations, scale for GLTF/GLB/FBX/OBJ |
| `create_resource` | Create any Resource .tres file with templates (themes, environments, materials) |

### Project Settings & Configuration (4 tools)

| Tool | Description |
|------|-------------|
| `modify_project_setting` | Change any project.godot setting (window size, physics, rendering) |
| `configure_input_action` | Create input maps with keyboard, mouse, joypad events |
| `setup_render_layers` | Name physics and render layers (1-32) |
| `configure_autoload` | Add/remove/toggle autoload singletons |

### Build & Export Pipeline (3 tools)

| Tool | Description |
|------|-------------|
| `create_export_preset` | Generate presets for Windows, Linux, macOS, Web, Android, iOS |
| `export_project` | Build debug/release exports or pack-only |
| `validate_export` | Check for export issues: missing templates, debug prints, large assets |

### Tilemap & Level Design (4 tools)

| Tool | Description |
|------|-------------|
| `create_tilemap` | Create TileMap nodes with layers and TileSet configuration |
| `paint_tiles` | Paint single tiles, rectangles, or lines programmatically |
| `configure_tileset` | Set up texture atlas, collision shapes, navigation polygons, terrain |
| `generate_navmesh` | Create NavigationRegion3D with agent parameters |

### Dialogue & Localization (7 tools)

| Tool | Description |
|------|-------------|
| `create_translation_file` | Create CSV or PO translation files with initial keys |
| `add_translation` | Add/update translation entries with placeholder support |
| `remove_translation` | Remove keys by name or regex pattern (dry run supported) |
| `validate_translations` | Check for missing translations, placeholder mismatches, duplicates |
| `create_dialogue_resource` | Create branching dialogue with conditions, character metadata, signals |
| `configure_localization` | Set supported locales, register files, set fallback locale |
| `extract_translatable_strings` | Scan .gd and .tscn files for tr() calls and UI text |

### Plugin Management (4 tools)

| Tool | Description |
|------|-------------|
| `list_plugins` | List installed plugins with enabled/disabled status and metadata |
| `configure_plugin` | Enable, disable, or add settings to plugins |
| `create_plugin` | Generate scaffolds from templates: basic, dock, inspector, import, tool |
| `install_plugin` | Install from Godot Asset Library or Git repositories |

### Refactoring (1 tool)

| Tool | Description |
|------|-------------|
| `refactor_rename` | Rename functions, variables, signals, classes, or constants across all .gd and .tscn files. Dry-run mode by default shows all planned changes before applying. |

```text
# Example: Rename a signal across the entire project
refactor_rename(
  project_path, symbol_type="signal",
  old_name="health_changed", new_name="hp_updated",
  dry_run=true  # Preview changes first
)
# Shows: 23 changes across 8 files
# Then apply:
refactor_rename(..., dry_run=false)
```

### Project Scaffolding (1 tool) — NEW

| Tool | Description |
|------|-------------|
| `create_project` | Scaffold a new Godot project with standard folder structure, project.godot, and a template main scene |

```text
# Example: Create a 2D game project
create_project(
  project_path="/home/user/games/my_platformer",
  project_name="My Platformer",
  template="2d_game",           # blank, 2d_game, 3d_game, ui_app
  renderer="forward_plus",      # forward_plus, mobile, gl_compatibility
  window_width=1920,
  window_height=1080
)
# Creates: project.godot, scenes/main.tscn (with Camera2D),
#          and directories: scenes/, scripts/, assets/, audio/, shaders/, resources/, addons/
```

### Scene Validation (1 tool) — NEW

| Tool | Description |
|------|-------------|
| `validate_scene` | Check a scene for common issues: missing resources, broken scripts, collision shapes without bodies, sprites without textures, signal connections to non-existent methods, and more |

```text
# Example: Validate a scene before shipping
validate_scene(project_path, scene_path="scenes/level_1.tscn")
# Returns: { valid: false, issues: [
#   { severity: "error", category: "missing_resources", message: "External resource not found: res://old_sprite.png" },
#   { severity: "warning", category: "collision_without_body", message: "CollisionShape2D not a child of a physics body" },
#   { severity: "info", category: "empty_containers", message: "VBoxContainer has no children" }
# ], summary: { errors: 1, warnings: 1, info: 1 } }
```

**Checks:** `missing_resources`, `broken_scripts`, `collision_without_body`, `sprite_without_texture`, `signal_method_missing`, `duplicate_node_names`, `empty_containers`, `deep_nesting`

### Particle System Designer (3 tools) — NEW

| Tool | Description |
|------|-------------|
| `create_particle_system` | Create GPUParticles2D/3D nodes with ParticleProcessMaterial configuration |
| `apply_particle_preset` | Create particle systems from named presets: fire, smoke, explosion, magic_sparkle, rain, snow, dust, sparks |
| `create_particle_material` | Create standalone ParticleProcessMaterial .tres files for reuse |

```text
# Example: Add fire particles to a torch
create_particle_system(
  project_path, scene_path="scenes/level.tscn",
  parent_path="Torch", node_name="FireEffect",
  particle_type="2d", amount=32, lifetime=1.5,
  emission_shape="sphere", emission_sphere_radius=0.5,
  direction=[0, -1, 0], gravity=[0, -2, 0],
  initial_velocity_min=2.0, initial_velocity_max=4.0,
  color=[1.0, 0.5, 0.1, 0.9]
)

# Or use a preset for quick results
apply_particle_preset(
  project_path, scene_path="scenes/level.tscn",
  parent_path="Torch", preset="fire", scale_factor=0.5
)

# Create a reusable material
create_particle_material(
  project_path, material_path="resources/rain_material.tres",
  preset="rain"
)
```

### Performance Profiling (3 tools) — NEW

| Tool | Description |
|------|-------------|
| `start_profiler` | Run a Godot project with a performance profiler for a specified duration |
| `get_profiling_data` | Read profiling results with statistical summary (FPS, frame times, draw calls, memory) |
| `analyze_bottlenecks` | Detect performance bottlenecks with severity ratings and an overall A-F grade |

```text
# Example: Profile a game for 10 seconds
start_profiler(project_path, duration=10, sample_interval=0.5)
# Returns: { profiler_id: "profile_1710547200000", status: "completed" }

get_profiling_data(project_path, profiler_id="profile_1710547200000")
# Returns: { summary: { avg_fps: 58.3, min_fps: 42.1, max_draw_calls: 1250, ... }, samples: [...] }

analyze_bottlenecks(project_path, target_fps=60)
# Returns: { overall_grade: "C", bottlenecks: [
#   { severity: "warning", category: "rendering", metric: "max_draw_calls", value: 1250, threshold: 1000,
#     recommendation: "Consider batching materials or using MultiMesh" }
# ], recommendations: [...] }
```

**Metrics collected:** FPS, frame time, process time, physics time, draw calls, render objects, render primitives, static memory, node count, orphan nodes, navigation maps

## Requirements

- [Godot Engine](https://godotengine.org/download) installed on your system
- Node.js and npm
- An AI assistant that supports MCP (Claude Code, Cline, Cursor, etc.)

## Installation and Configuration

### Step 1: Install and Build

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
        "DEBUG": "true"
      },
      "disabled": false,
      "autoApprove": [
        "launch_editor", "run_project", "get_debug_output", "stop_project",
        "get_godot_version", "list_projects", "get_project_info",
        "create_scene", "add_node", "load_sprite", "export_mesh_library",
        "save_scene", "get_uid", "update_project_uids",
        "list_scene_tree", "read_node_properties", "modify_node_property",
        "remove_node", "duplicate_node", "reparent_node",
        "list_signals", "list_connections", "connect_signal",
        "disconnect_signal", "validate_connection",
        "analyze_script", "create_script", "modify_function",
        "add_export_variable", "extract_dependencies", "attach_script",
        "validate_script",
        "create_animation_player", "add_animation_track", "add_keyframe",
        "configure_animation_tree", "create_animation_library",
        "create_shader_material", "apply_material", "set_shader_parameter",
        "create_material_from_texture",
        "create_test_suite", "run_tests",
        "import_texture", "import_audio", "import_3d_model", "create_resource",
        "modify_project_setting", "configure_input_action",
        "setup_render_layers", "configure_autoload",
        "create_export_preset", "export_project", "validate_export",
        "create_tilemap", "paint_tiles", "configure_tileset", "generate_navmesh",
        "create_translation_file", "add_translation", "remove_translation",
        "validate_translations", "create_dialogue_resource",
        "configure_localization", "extract_translatable_strings",
        "list_plugins", "configure_plugin", "create_plugin", "install_plugin",
        "refactor_rename",
        "create_project", "validate_scene",
        "create_particle_system", "apply_particle_preset", "create_particle_material",
        "start_profiler", "get_profiling_data", "analyze_bottlenecks"
      ]
    }
  }
}
```

#### Option B: Configure with Cursor

**Using the Cursor UI:**

1. Go to **Cursor Settings** > **Features** > **MCP**
2. Click **+ Add New MCP Server**
3. Fill out: Name: `godot`, Type: `command`, Command: `node /absolute/path/to/godot-mcp/build/index.js`
4. Click "Add" and refresh the tool list

**Using Project-Specific Configuration (`.cursor/mcp.json`):**

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "DEBUG": "true"
      }
    }
  }
}
```

#### Option C: Configure with Claude Code

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "GODOT_PATH": "/path/to/godot"
      }
    }
  }
}
```

### Step 3: Optional Environment Variables

- `GODOT_PATH`: Path to the Godot executable (overrides automatic detection)
- `DEBUG`: Set to `"true"` to enable detailed server-side logging

## Architecture

```
src/
├── index.ts                    # Main server + legacy 52 tool handlers
├── types.ts                    # Shared interfaces (ToolDefinition, ServerContext, etc.)
├── registry.ts                 # ToolRegistry — registration-based dispatch
├── utils/
│   ├── tscn-parser.ts          # TypeScript parser for .tscn scene files
│   ├── tscn-cache.ts           # Mtime-based cache for parsed TSCN files
│   └── validation.ts           # Centralized input validation middleware
├── tools/
│   ├── scene.ts                # Scene inspection & manipulation (6 tools)
│   ├── shader.ts               # Shader pipeline completion (3 tools)
│   ├── animation-tree.ts       # AnimationTree configuration (2 tools)
│   ├── refactor.ts             # Refactoring tools (1 tool)
│   ├── project.ts              # Project scaffolding (1 tool)
│   ├── validate.ts             # Scene validation (1 tool)
│   ├── particles.ts            # Particle system designer (3 tools)
│   └── profiling.ts            # Performance profiling (3 tools)
└── scripts/
    └── godot_operations.gd     # GDScript operation handlers (~5,500 lines)
```

The server uses a **hybrid dispatch** pattern:
1. **New modular tools** (Tier 1-2, 20 tools) register via `ToolRegistry` in domain-specific modules under `src/tools/`
2. **Legacy tools** (Phases 1-12, 52 tools) continue working via the existing switch statement in `src/index.ts`
3. The `CallToolRequestSchema` handler checks the registry first, then falls back to the switch

**Infrastructure:**
- **TSCN Cache** (`tscn-cache.ts`) avoids re-parsing scene files across multiple tool calls in a session (mtime-based invalidation)
- **Validation Middleware** (`validation.ts`) provides declarative parameter validation with consistent error responses
- **GDScript operations** (`godot_operations.gd`) handles all operations requiring Godot's runtime — scene manipulation, particle creation, animation tree setup, etc. Read-only operations use the TypeScript TSCN parser for speed (no Godot process needed)

## Example Prompts

```text
"Show me the node tree of my main scene"
"Read the properties of the Player node in level_1.tscn"
"Move the HealthBar node from UI/OldPanel to UI/HUD"
"Duplicate the Goblin enemy node and name it Goblin2"
"Remove the deprecated OldSystem node from my scene"

"Apply the dissolve material to my enemy sprite"
"Set the dissolve_amount shader parameter to 0.7"
"Create a PBR material from my brick texture maps"

"Set up an AnimationTree with a state machine for Idle, Run, and Jump states"
"Create an animation library with walk, run, and attack animations"

"Rename the 'player_died' signal to 'player_death' across my whole project"
"Preview what would change if I renamed the take_damage function to receive_damage"

"Create a new 2D platformer project from scratch"
"Validate my level scene for any issues before I ship"
"Add fire particles to the torch in my dungeon scene"
"Apply the rain particle preset to my outdoor level"
"Profile my game for 15 seconds and tell me where the bottlenecks are"

"Create a functional pause menu with Resume, Settings, and Quit buttons"
"Connect the 'pressed' signal from StartButton to _on_start_pressed"
"Create a dissolve shader effect for my enemy death animation"
"Set up my 3D character model to generate convex collision shapes"
"Configure input actions for WASD movement and Space to jump"
"Export my game for Windows and validate it has no issues"
"Create a test suite for my player health system"
"Create a translation file for English, Spanish, and French"
```

## Troubleshooting

- **Godot Not Found**: Set the `GODOT_PATH` environment variable to your Godot executable
- **Connection Issues**: Ensure the server is running and restart your AI assistant
- **Invalid Project Path**: Ensure the path points to a directory containing a `project.godot` file
- **Build Issues**: Run `npm install` then `npm run build`
- **For Cursor**: Ensure MCP is enabled in Settings > MCP. MCP tools require the Agent chat profile (Pro/Business). Use "Yolo Mode" for auto-approval.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
