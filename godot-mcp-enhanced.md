Great — I checked your actual repo. It confirms the earlier read: your brett03112/godot-mcp is already much broader than Godot AI for autonomous build/test/playtest/export work, but Godot AI still has a live-editor bridge layer that your repo does not appear to have yet.

Your repo’s README says it exposes 115 tools across 30 categories plus 118 read-only MCP resources, and the tool list includes project launch/run/debug, scene manipulation, script intelligence, animation, shaders/materials, testing, import config, export/build, tilemaps, localization, plugins, refactoring, profiling, screenshots, automated playtesting, fun metrics, asset generation, multiplayer, physics, and navigation.  

The important update is this: I would not add Godot AI as a second MCP server unless you specifically want to use its live editor plugin now. Long-term, the better move is to develop the missing Godot AI-style editor bridge features into your repo.

What Godot AI still has that your repo does not appear to have

1. Live editor session bridge

Godot AI’s biggest advantage is not a particular tool; it is its architecture. It connects MCP clients to a live Godot editor through HTTP → Python FastMCP → WebSocket → Godot EditorPlugin → EditorInterface / live SceneTree.  

Your repo is currently a Node/TypeScript MCP server with a hybrid architecture: modular TypeScript tools, legacy handlers, a ToolRegistry, a TSCN parser/cache, and a large godot_operations.gd script for runtime/headless Godot operations.   The source imports and registers tool modules for scene, shader, animation-tree, refactor, project, validation, particles, profiling, code intelligence, introspection, audio, viewport, playtest, fun metrics, asset generation, networking, physics, and navigation, but not an editor-session/plugin bridge.  

This means Godot AI can answer questions like:

What scene is currently open in the editor?
What node is selected?
Is the editor writable?
What editor session should this call target?
Capture the active editor viewport.
Read editor/game/plugin logs from the active session.

Your repo can manipulate project files and run Godot, but it does not appear to maintain a persistent live editor session.

2. Session tools and live resources

Godot AI exposes core tools such as editor_state, scene_get_hierarchy, node_get_properties, and session_activate; it also exposes live resources like godot://sessions, godot://editor/state, godot://selection/current, godot://scene/current, and godot://scene/hierarchy.  

Your repo does have MCP resources, but they are mostly server/tool/debug-output oriented: godot-mcp://server/info, godot-mcp://tools/catalog, godot-mcp://runtime/debug-output, and per-tool metadata resources.  

So the missing piece is not “resources” generally; it is live active-editor resources.

3. Atomic batch_execute

Godot AI has batch_execute, described as running multiple plugin commands atomically with rollback on the first error.  

Your repo’s ToolRegistry already gives you a clean place to implement this because tools are registered by name and dispatched through a central registry with logging and timeout handling.  

This is probably the highest-value feature to port first, because it improves autonomous reliability immediately even without a live editor plugin.

Suggested addition:

batch_execute({
  project_path,
  commands: [
    { tool: "create_scene", args: {...} },
    { tool: "add_node", args: {...} },
    { tool: "modify_node_property", args: {...} },
    { tool: "connect_signal", args: {...} },
    { tool: "save_scene", args: {...} },
    { tool: "validate_scene", args: {...} }
  ],
  rollback_on_error: true
})

Implementation approach: snapshot touched .tscn, .gd, .tres, .import, and project.godot files before the batch; dispatch each command through ToolRegistry; restore snapshots if any command fails.

4. Live editor selection, monitors, logs, and screenshots

Godot AI’s editor_manage includes selection_get, selection_set, monitors_get, quit, logs_clear, and game_eval; it also has logs_read and editor_screenshot for plugin/game/editor logs and viewport/game framebuffer capture.  

Your repo has get_debug_output, profiling, and capture_viewport, but capture_viewport is described as running a scene and saving a PNG from the scene viewport, not capturing the live editor viewport or selected editor state.  

These should be ported via an EditorPlugin bridge, not by trying to fake them through headless Godot.

5. Runtime input/control tools

Godot AI has game_manage operations for runtime scene-tree inspection, node info, UI elements, keyboard input, mouse input, gamepad input, and input state.  

Your repo has much more advanced automated playtesting — bot runs, manual recording, heatmaps, session comparison, game-feel scoring, difficulty curves, frustration detection, and juice coverage.   But it does not appear to expose simple “press key / click mouse / inspect current runtime UI” primitives as standalone tools.

That would be a good addition because Codex/GPT agents need both levels:

High-level: run_automated_playtest, analyze_playtest_session
Low-level: runtime_input_key, runtime_input_mouse, runtime_get_ui_elements

6. UI/theme/camera/audio-player ergonomics

Godot AI has dedicated rollups for ui_manage, theme_manage, camera_manage, and audio_manage. These include UI layout building, anchors, text setting, theme colors/constants/font sizes/styleboxes, camera presets/follow/limits/damping, and AudioStreamPlayer authoring/playback.  

Your repo can already do some of this through generic add_node, modify_node_property, create_resource, shader/material tools, and audio bus configuration, but it does not list these as dedicated workflow tools. Your README lists configure_audio_bus, but not AudioStreamPlayer node creation/playback tools.   Your scene tools are strong but generic: list_scene_tree, read_node_properties, modify_node_property, remove_node, duplicate_node, and reparent_node.  

For autonomous game development, I would add these as explicit high-level tools:

create_ui_layout
set_control_anchor_preset
set_control_text
create_theme
theme_set_color
theme_set_font_size
theme_set_constant
theme_set_stylebox_flat
apply_theme
draw_ui_recipe
create_camera
configure_camera
setup_camera_follow_2d
set_camera_limits_2d
set_camera_smoothing_2d
list_cameras
create_audio_player
set_audio_stream
configure_audio_playback
play_audio_node
stop_audio_node
list_audio_players

7. Resource helpers

Godot AI’s resource_manage includes search, load, assign, get_info, create, curve_set_points, environment_create, physics_shape_autofit, gradient_texture_create, and noise_texture_create.  

Your repo has create_resource, import tools, physics tools, material tools, particle tools, and navigation tools, but not those specific resource helper workflows as first-class tools.  

These are easy to port into your current architecture because they are mostly resource/file operations.

What your repo already does better than Godot AI

Your repo is already stronger for autonomous full-cycle development:

Area	Your repo status
Export/build pipeline	create_export_preset, export_project, validate_export  
Automated playtesting	Bot/manual playtests, session analysis, heatmaps, comparisons  
Game-feel analysis	Responsiveness, pacing, difficulty, frustration, juice coverage  
Asset generation	Sprites, textures, SFX, music, backend config  
Multiplayer/physics/navigation	Dedicated networking, physics, navigation tools  
Test intelligence	GUT generation, natural-language test generation, coverage, mocks  
Refactoring	Project-wide refactor_rename with dry-run preview  

So I would not replace your MCP with Godot AI. I would use Godot AI as a reference implementation for the missing live-editor and ergonomics layer.

Recommended porting order for your repo

Phase 1 — No editor plugin required

Add these first:

batch_execute
script_patch
node_find
node_rename
node_move
node_add_to_group
node_remove_from_group
project_settings_get
autoload_list
filesystem_search
filesystem_reimport
resource_get_info
resource_search
resource_assign
create_gradient_texture
create_noise_texture
create_curve_resource
create_environment_resource
autofit_physics_shape
create_camera
configure_camera
create_audio_player
configure_audio_player
create_theme
theme_set_color
theme_set_font_size
set_control_anchor_preset
draw_ui_recipe

These fit cleanly into your existing ToolRegistry and godot_operations.gd model. Your registry already supports modular registration, dispatch, logging, and timeouts, so the codebase is ready for this style of expansion.  

Phase 2 — Add a small live editor plugin bridge

Add a project addon, for example:

plugin/addons/godot_mcp_bridge/
  plugin.cfg
  godot_mcp_bridge.gd
  websocket_client.gd
  command_dispatcher.gd

Then add tools/resources:

editor_state
session_list
session_activate
scene_current
scene_open
scene_save_active
selection_get
selection_set
editor_screenshot
logs_read_editor
logs_clear
editor_monitors_get
editor_quit

This would give your MCP Godot AI’s biggest architectural advantage while keeping your existing Node/TypeScript MCP server.

Phase 3 — Runtime control tools

Add:

runtime_get_scene_tree
runtime_get_node_info
runtime_get_ui_elements
runtime_input_key
runtime_input_mouse
runtime_input_gamepad
runtime_input_state

This complements your playtest framework rather than replacing it.

Phase 4 — Add game_eval, but gate it

Godot AI exposes game_eval through editor_manage.   I would only add this after you have approvals/safety controls, because it can execute arbitrary code inside a project/editor session.

One repo housekeeping note

Your package.json still points the repository metadata at Coding-Solo/godot-mcp, even though the actual repo you gave is brett03112/godot-mcp.   Before publishing or using this as your canonical MCP, update that field.

Bottom line

Now that I’ve checked your actual repo: yes, Godot AI’s missing capabilities can be developed into your MCP, and that is the better long-term path. Your MCP already has the broader autonomous-development layer. The missing Godot AI value is mainly:

live editor sessions
active scene/selection state
editor viewport/log capture
atomic batch execution
runtime input/UI inspection
UI/theme/camera/audio-player workflow tools
resource helpers
client auto-configuration

The one feature that changes the whole system is the EditorPlugin bridge. Add that to your repo, then selectively port Godot AI’s best tool patterns rather than running both servers permanently.

Yes — most of Godot AI’s missing value can be developed into your MCP, but the most important difference is architectural, not just tool count.

Your attached MCP is already broader as an autonomous production toolchain: build/export, test generation, profiling, automated playtesting, heatmaps, game-feel metrics, asset generation, localization, networking, physics, navigation, asset-library search, and 115 named tools. Godot AI is narrower in total named MCP tools, but it has a live Godot editor plugin bridge: MCP client → HTTP FastMCP server → WebSocket → Godot EditorPlugin → EditorInterface / live SceneTree. Its README explicitly describes that live-editor architecture and says it exposes editor capabilities over HTTP.  

The main things Godot AI has that your MCP does not list

1. Live editor session state and multi-editor routing

Godot AI has session_activate, session_manage list, editor_state, and read-only resources like godot://sessions, godot://editor/state, godot://scene/current, and godot://selection/current. These are not just project-file operations; they expose which editor is connected, what scene is open, what is selected, readiness/play state, and session routing. Godot AI’s docs list these as core tools/resources, including session activation and active editor state.  

Your MCP has strong project/process control — launch_editor, run_project, stop_project, get_debug_output, get_project_info — but it does not appear to have a persistent editor-session abstraction or current-selection/current-scene resources.

Can you develop this into your MCP?
Yes, but this is one of the features that really wants a Godot editor plugin or persistent bridge. A CLI-only/headless Godot script cannot reliably see the user’s current editor selection or active unsaved scene. You would add a small addons/your_mcp_bridge EditorPlugin that connects to your Node MCP server over WebSocket or localhost HTTP.

⸻

2. Atomic batch_execute with rollback semantics

Godot AI exposes batch_execute, described as running multiple plugin commands atomically with rollback on first error.  

Your MCP has many individual mutation tools, and its README says it uses a registry plus GDScript operation handlers, but it does not list a single batch transaction tool. This matters for autonomous development because agents often need to create a scene, add nodes, set properties, connect signals, save, and validate as one logical operation.

Can you develop this into your MCP?
Definitely. This is one of the best upgrades to port. Add a tool like:

batch_execute({
  project_path,
  commands: [
    { tool: "create_scene", args: {...} },
    { tool: "add_node", args: {...} },
    { tool: "modify_node_property", args: {...} },
    { tool: "connect_signal", args: {...} },
    { tool: "save_scene", args: {...} }
  ],
  rollback_on_error: true
})

For rollback, snapshot the touched .tscn, .gd, .tres, .import, and project.godot files before applying changes, then restore if any command fails.

⸻

3. Live editor selection, monitors, quit, logs clearing, and runtime eval

Godot AI’s editor_manage rollup includes selection_get, selection_set, monitors_get, quit, logs_clear, and game_eval.  

Your MCP has debug output and profiling, but it does not appear to expose Editor selection, Editor monitor snapshots, clearing log buffers, or evaluating code in the running game/editor session.

Can you develop this into your MCP?
Yes, with a split:

Easy without plugin:
- logs_clear for your own captured process logs
- monitors_get if launching the game with instrumentation
- quit active Godot process if your MCP launched it
Requires editor plugin:
- selection_get
- selection_set
- true editor_state
- game_eval against active editor/runtime
- editor monitor data from the active editor

Be careful with game_eval: it is powerful but dangerous. I would make it opt-in and approval-gated.

⸻

4. Runtime game control tools: input injection and live game tree inspection

Godot AI has a game_manage domain with get_scene_tree, get_node_info, get_ui_elements, input_key, input_mouse, input_gamepad, and input_state.  

Your MCP has automated playtesting, playtest recording, heatmaps, session analysis, and bot modes, which are actually more advanced for QA. But it does not list simple low-level runtime controls like “press this key,” “click this coordinate,” “inspect runtime UI elements,” or “get the current running scene tree.”

Can you develop this into your MCP?
Yes. You already have the right foundation because your playtesting tools presumably inject/record game behavior. I would add a lower-level runtime-control layer:

runtime_get_scene_tree
runtime_get_node_info
runtime_get_ui_elements
runtime_input_key
runtime_input_mouse
runtime_input_gamepad
runtime_input_state

These can be implemented by injecting an autoload bridge into the running project, similar to how automated playtest recorders usually work.

⸻

5. Dedicated UI and theme construction tools

Godot AI has specialized ui_manage and theme_manage operations: set_anchor_preset, set_text, build_layout, draw_recipe, create, set_color, set_constant, set_font_size, set_stylebox_flat, and apply.  

Your MCP can already create scenes, add nodes, modify properties, create resources, and configure project settings. But it does not list high-level UI layout or theme-editing tools. This is a real ergonomic gap: agents are much better at UI work when they can say “build this layout” rather than manually juggling anchors, margins, containers, fonts, and styleboxes.

Can you develop this into your MCP?
Yes, and this is high-value. I would port this before many lower-level Godot AI features.

Suggested tools:

create_ui_layout
set_control_anchor_preset
set_control_text
create_theme
theme_set_color
theme_set_font_size
theme_set_constant
theme_set_stylebox_flat
apply_theme
draw_ui_recipe

A draw_ui_recipe tool is especially useful for autonomous game development because it gives Codex/GPT a declarative way to create menus, HUDs, inventory panels, dialogue boxes, settings pages, and mobile controls.

⸻

6. Camera-specific authoring tools

Godot AI has camera_manage with create, configure, set_limits_2d, set_damping_2d, follow_2d, get, list, and apply_preset.  

Your MCP can create Camera2D/Camera3D nodes through generic scene tools, but it does not list a dedicated camera workflow.

Can you develop this into your MCP?
Yes, easily. This is a good candidate for your existing godot_operations.gd.

Suggested tools:

create_camera
configure_camera
setup_camera_follow_2d
set_camera_limits_2d
set_camera_smoothing_2d
list_cameras
apply_camera_preset

This would help autonomous agents build playable prototypes faster.

⸻

7. Rich resource helpers: curves, gradients, noise textures, environments, physics-shape autofit

Godot AI’s resource_manage includes curve_set_points, environment_create, physics_shape_autofit, gradient_texture_create, and noise_texture_create.  

Your MCP has create_resource, physics tools, import tools, shader/material tools, and particle tools, but these specific resource constructors are not listed.

Can you develop this into your MCP?
Yes. Most of these are file/resource operations and fit your current architecture well.

I would add:

create_gradient_texture
create_noise_texture
create_curve_resource
set_curve_points
create_environment_resource
autofit_physics_shape
resource_get_info
resource_assign
resource_search

The autofit_physics_shape operation is particularly useful for AI-generated scenes because it can automatically produce reasonable collision shapes from sprite/mesh bounds.

⸻

8. Audio player node controls

Godot AI’s audio_manage includes player_create, player_set_stream, player_set_playback, play, stop, and list.  

Your MCP has audio import, audio bus configuration, SFX generation, and music generation, but not dedicated AudioStreamPlayer node authoring/playback tools.

Can you develop this into your MCP?
Yes. Add:

create_audio_player
set_audio_stream
configure_audio_playback
play_audio_node
stop_audio_node
list_audio_players

This pairs nicely with your existing generate_sfx and generate_music.

⸻

9. Filesystem search/reimport and resource-database actions

Godot AI has filesystem_manage with read_text, write_text, reimport, and search.  

Codex already has filesystem access, so read_text and write_text are not very special outside MCP. But reimport is valuable because it asks Godot’s editor/resource system to refresh imported assets.

Can you develop this into your MCP?
Yes. Add godot_reimport_resource or reimport_assets. That is more useful than duplicating Codex’s file read/write abilities.

⸻

10. Anchor-based script_patch

Godot AI has script_patch, described as an anchor-edit tool for GDScript files.  

Your MCP has create_script, modify_function, add_export_variable, generate_docstring, validate_script, and other code intelligence tools. Those are strong, but script_patch is a different kind of primitive: it lets an agent make a localized text patch without fully regenerating or function-parsing the file.

Can you develop this into your MCP?
Yes. This is very worth adding.

Suggested shape:

script_patch({
  project_path,
  script_path,
  anchor: "func _physics_process(delta):",
  mode: "replace_block" | "insert_before" | "insert_after",
  content: "...",
  validate_after: true
})

This complements modify_function; it does not replace it.

⸻

11. Client self-configuration tools

Godot AI has client_manage with status, configure, and remove, and its README says the dock can configure multiple MCP clients, including Codex, Cursor, Claude, Windsurf, Zed, Gemini CLI, Cline, Roo Code, and others.  

Your MCP does not list client auto-configuration tooling.

Can you develop this into your MCP?
Yes, but I would not prioritize it unless you want your MCP to be distributed publicly. For your own Codex workflow, editing ~/.codex/config.toml manually is enough.

⸻

What Godot AI does not seem to add over your MCP

Your MCP already appears to exceed Godot AI in several autonomous-development areas:

Area	Your MCP status
Build/export pipeline	Already has create_export_preset, export_project, validate_export
Automated playtesting	Already has bot playtests, manual recording, session analysis, heatmaps, compare sessions
Game-feel metrics	Already has responsiveness, pacing, difficulty, frustration, juice coverage, genre benchmarks
Asset generation	Already has sprite, texture, SFX, music generation bridge
Test generation/coverage/mocking	Already has test generation, coverage analysis, mock node generation
Dialogue/localization	Already has translation and dialogue tools
Networking/physics/navigation	Already has dedicated multiplayer, physics, navmesh/navigation tools
Refactoring	Already has refactor_rename
Export validation/profiling	Already has profiling and bottleneck analysis

So I would not try to “merge all of Godot AI” into yours. I would selectively port the live-editor and UI/resource ergonomics.

Best development strategy

I would split the work into three tiers.

Tier 1 — Add immediately inside your existing MCP

These do not require a Godot editor plugin:

batch_execute
script_patch
node_find
node_rename
node_move
node_group_add
node_group_remove
project_settings_get
autoload_list
filesystem_search
filesystem_reimport
resource_get_info
resource_assign
resource_search
create_gradient_texture
create_noise_texture
create_curve_resource
create_environment_resource
autofit_physics_shape
create_audio_player
configure_audio_player
create_camera
configure_camera
setup_camera_follow_2d
create_theme
theme_set_color
theme_set_font_size
theme_set_stylebox_flat
set_control_anchor_preset
build_ui_layout
draw_ui_recipe

This gives you most of Godot AI’s practical benefits while keeping your current TypeScript/GDScript architecture.

Tier 2 — Add a live editor bridge

This is the real Godot AI advantage. Add a small Godot EditorPlugin that connects to your MCP server.

Target tools/resources:

editor_state
session_list
session_activate
scene_current
scene_open
scene_save_active
selection_get
selection_set
editor_screenshot
logs_read_editor
logs_clear
editor_monitors_get
editor_quit

This would let Codex reason about what is currently open in the editor instead of only manipulating files by path.

Tier 3 — Add runtime control and eval carefully

runtime_get_scene_tree
runtime_get_node_info
runtime_get_ui_elements
runtime_input_key
runtime_input_mouse
runtime_input_gamepad
runtime_input_state
game_eval

I would gate game_eval behind approval because it can execute arbitrary project/editor code.

Bottom line

Yes, Godot AI’s missing tools can be developed into your MCP. The best path is not to run both or clone every feature; it is to port the live-editor bridge pattern, then add the specific ergonomics your MCP lacks: batch_execute, active session/editor state, selection, editor screenshots/logs, runtime input, UI/theme builders, camera tools, audio-player tools, and resource helpers.

Because Godot AI is MIT-licensed, you can generally reuse or adapt implementation ideas/code as long as you preserve the required license notices, but the cleanest integration would be to reimplement the concepts in your existing TypeScript ToolRegistry plus godot_operations.gd structure and add a small EditorPlugin bridge for the features that need EditorInterface.