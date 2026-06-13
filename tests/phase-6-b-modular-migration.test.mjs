import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DESIGN_OPERATIONS = [
  'design_generate_scene_from_brief',
  'design_generate_level_blockout',
  'design_generate_menu_flow',
  'design_generate_hud',
  'design_generate_dialogue_scene',
  'design_generate_settings_screen',
  'design_generate_mobile_controls',
  'design_generate_gameplay_prefab',
  'design_generate_enemy_archetype',
  'design_generate_pickup_archetype',
];

const GAMEPLAY_OPERATIONS = [
  'gameplay_create_state_machine',
  'gameplay_add_state',
  'gameplay_connect_state_transition',
  'gameplay_generate_character_controller',
  'gameplay_generate_interaction_system',
  'gameplay_generate_inventory_system',
  'gameplay_generate_dialogue_controller',
  'gameplay_generate_save_load_system',
  'gameplay_generate_settings_persistence',
];

const UI_THEME_OPERATIONS = [
  'ui_create_layout',
  'ui_draw_recipe',
  'ui_set_control_anchor_preset',
  'ui_set_control_offsets',
  'ui_set_control_text',
  'ui_set_control_theme_override',
  'ui_create_theme',
  'ui_theme_set_color',
  'ui_theme_set_constant',
  'ui_theme_set_font_size',
  'ui_theme_set_stylebox_flat',
  'ui_apply_theme',
  'ui_inspect_layout',
  'ui_validate_safe_area',
];

const NODE_REFACTOR_OPERATIONS = [
  'node_find',
  'node_rename',
  'node_move',
  'node_add_to_group',
  'node_remove_from_group',
  'node_replace_type',
  'node_bulk_property_set',
  'scene_find_references',
  'scene_dependency_report',
];

const RESOURCE_WORKFLOW_OPERATIONS = [
  'resource_create_gradient_texture',
  'resource_create_noise_texture',
  'resource_create_curve',
  'resource_set_curve_points',
  'resource_create_environment',
  'resource_create_physics_material',
  'resource_assign',
  'resource_autofit_physics_shape',
  'resource_convert_format',
];

const PHYSICS_OPERATIONS = [
  'configure_physics_material',
  'set_collision_config',
  'create_physics_body',
  'manage_collision_shape',
  'setup_joint',
];

const NAVIGATION_OPERATIONS = [
  'generate_navmesh',
  'add_navigation_agent',
  'add_navigation_link',
  'configure_navigation_obstacle',
  'create_astar_grid',
  'setup_navigation_server',
];

const VISUAL_QA_OPERATIONS = [
  'visual_sprite_bounds_check',
  'visual_camera_framing_check',
];

const SIGNAL_OPERATIONS = [
  'list_signals',
  'list_connections',
  'connect_signal',
  'disconnect_signal',
  'validate_connection',
];

const ANIMATION_OPERATIONS = [
  'create_animation_player',
  'add_animation_track',
  'add_keyframe',
  'configure_animation_tree',
  'create_animation_library',
];

const SCRIPT_OPERATIONS = [
  'analyze_script',
  'create_script',
  'modify_function',
  'add_export_variable',
  'extract_dependencies',
  'attach_script',
];

const CAMERA_OPERATIONS = [
  'camera_create',
  'camera_configure',
  'camera_setup_follow_2d',
  'camera_set_limits_2d',
  'camera_set_smoothing_2d',
  'camera_apply_preset',
  'camera_list',
  'camera_preview_bounds',
];

const AUDIO_PLAYER_OPERATIONS = [
  'audio_player_create',
  'audio_player_set_stream',
  'audio_player_configure',
  'audio_player_play',
  'audio_player_stop',
  'audio_player_list',
  'audio_player_validate_routes',
];

const SHADER_OPERATIONS = [
  'create_shader_material',
  'apply_material',
  'set_shader_parameter',
];

const CORE_SCENE_OPERATIONS = [
  'create_scene',
  'add_node',
  'load_sprite',
  'save_scene',
  'modify_node_property',
  'remove_node',
  'duplicate_node',
  'reparent_node',
];

const MESH_LIBRARY_OPERATIONS = [
  'export_mesh_library',
];

const RESOURCE_MAINTENANCE_OPERATIONS = [
  'get_uid',
  'resave_resources',
];

const TEST_SUITE_OPERATIONS = [
  'create_test_suite',
];

const TILEMAP_OPERATIONS = [
  'create_tilemap',
  'paint_tiles',
  'configure_tileset',
];

const PARTICLE_OPERATIONS = [
  'create_particle_system',
  'apply_particle_preset',
];

const INTROSPECTION_OPERATIONS = [
  'get_class_info',
];

const AUDIO_BUS_OPERATIONS = [
  'configure_audio_bus',
];

const MULTIPLAYER_OPERATIONS = [
  'setup_multiplayer_peer',
  'configure_rpc',
  'manage_multiplayer_spawner',
];

const FINAL_PASS_MODULES = [
  ['scene_core_ops.gd', 'SceneCoreOps', '_register_scene_core', CORE_SCENE_OPERATIONS],
  ['mesh_library_ops.gd', 'MeshLibraryOps', '_register_mesh_library', MESH_LIBRARY_OPERATIONS],
  ['resource_maintenance_ops.gd', 'ResourceMaintenanceOps', '_register_resource_maintenance', RESOURCE_MAINTENANCE_OPERATIONS],
  ['test_suite_ops.gd', 'TestSuiteOps', '_register_test_suite', TEST_SUITE_OPERATIONS],
  ['tilemap_ops.gd', 'TilemapOps', '_register_tilemap', TILEMAP_OPERATIONS],
  ['particle_ops.gd', 'ParticleOps', '_register_particles', PARTICLE_OPERATIONS],
  ['introspection_ops.gd', 'IntrospectionOps', '_register_introspection', INTROSPECTION_OPERATIONS],
  ['audio_bus_ops.gd', 'AudioBusOps', '_register_audio_bus', AUDIO_BUS_OPERATIONS],
  ['multiplayer_ops.gd', 'MultiplayerOps', '_register_multiplayer', MULTIPLAYER_OPERATIONS],
];

const FINAL_PASS_OPERATIONS = FINAL_PASS_MODULES.flatMap(([, , , operations]) => operations);

test('Phase 6.B has a dedicated design-to-scene operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/design_to_scene_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _to_res_path\(path: String\) -> String:/);
  assert.match(source, /func _save_scene_root\(scene: Node, full_path: String\) -> bool:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.doesNotMatch(source, /\] \+ \w+/);
  for (const operation of DESIGN_OPERATIONS) {
    assert.match(source, new RegExp(`func _${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved design operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const DesignToSceneOps = preload\("design_to_scene_ops\.gd"\)/);
  assert.match(registry, /func _register_design_to_scene\(\) -> void:/);
  assert.ok(registry.indexOf('_register_design_to_scene()') < registry.indexOf('func dispatch'), 'design registration should happen during initialization');
  for (const operation of DESIGN_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B removes design-to-scene dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of DESIGN_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+_${operation}\\(params\\)`), operation);
  }
  assert.doesNotMatch(legacy, /# Phase 4\.1: Design-to-scene workflow helpers/);
});

test('build output copies the Phase 6.B design module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/design_to_scene_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 2 has a dedicated gameplay operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/gameplay_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _load_scene_for_edit\(scene_path: String\) -> Dictionary:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func _gameplay_res_join\(base_dir: String, file_name: String\) -> String:/);
  assert.match(source, /return _gameplay_res_join\(_to_res_path\(state_machine_path\)\.get_base_dir\(\), _gameplay_slug\(state_name\) \+ "_state\.gd"\)/);
  assert.match(source, /var item_path := _gameplay_res_join\(_to_res_path\(output_path\)\.get_base_dir\(\), _gameplay_slug\(_to_res_path\(output_path\)\.get_file\(\)\.get_basename\(\)\) \+ "_item\.gd"\)/);
  assert.doesNotMatch(source, /get_base_dir\(\) \+ "\/" \+ _gameplay_slug/);
  assert.match(source, /func _gameplay_write_smoke_test\(test_path: String, scene_path: String, root_name: String\) -> bool:/);
  assert.match(source, /func _gameplay_character_controller_script\(params: Dictionary\) -> String:/);
  for (const operation of GAMEPLAY_OPERATIONS) {
    assert.match(source, new RegExp(`func _${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved gameplay operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const GameplayOps = preload\("gameplay_ops\.gd"\)/);
  assert.match(registry, /func _register_gameplay\(\) -> void:/);
  assert.ok(registry.indexOf('_register_gameplay()') < registry.indexOf('func dispatch'), 'gameplay registration should happen during initialization');
  for (const operation of GAMEPLAY_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 2 removes gameplay dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of GAMEPLAY_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+_${operation}\\(params\\)`), operation);
  }
  assert.doesNotMatch(legacy, /# Phase 4\.2: Gameplay loop and state-machine helpers/);
});

test('build output copies the Phase 6.B gameplay module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/gameplay_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 3 has a dedicated UI/theme operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/ui_theme_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _load_scene_for_edit\(scene_path: String\) -> Dictionary:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func _ensure_resource_dir\(resource_path: String\) -> bool:/);
  assert.match(source, /func _make_unique_child_name\(parent: Node, base_name: String\) -> String:/);
  assert.match(source, /func _ui_make_stylebox_flat\(params: Dictionary\) -> StyleBoxFlat:/);
  assert.match(source, /func _ui_collect_controls\(scene_root: Node, node: Node, parent_rect: Rect2, controls: Array\) -> void:/);
  for (const operation of UI_THEME_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved UI/theme operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const UiThemeOps = preload\("ui_theme_ops\.gd"\)/);
  assert.match(registry, /func _register_ui_theme\(\) -> void:/);
  assert.ok(registry.indexOf('_register_ui_theme()') < registry.indexOf('func dispatch'), 'UI/theme registration should happen during initialization');
  for (const operation of UI_THEME_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 3 removes UI/theme dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of UI_THEME_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
  }
  assert.doesNotMatch(legacy, /# --- Phase 1\.5: UI and theme workflow ---/);
});

test('build output copies the Phase 6.B UI/theme module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/ui_theme_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 4 has a dedicated node refactor operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/node_refactor_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _load_scene_for_edit\(scene_path: String\) -> Dictionary:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func _node_refactor_load_scene_with_node\(params: Dictionary\) -> Dictionary:/);
  assert.match(source, /func _node_refactor_collect_find_matches\(scene_root: Node, node: Node, scene_path: String, params: Dictionary, include_properties: bool, include_connections: bool, max_results: int, matches: Array\) -> void:/);
  assert.match(source, /func _node_refactor_update_nodepath_references\(scene_root: Node, old_path: String, new_path: String\) -> Array:/);
  assert.match(source, /func _node_refactor_collect_dependencies\(scene_root: Node, node: Node, scene_path: String, include_scripts: bool, include_dependencies: bool, dependencies: Array, seen: Dictionary\) -> void:/);
  for (const operation of NODE_REFACTOR_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved node refactor operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const NodeRefactorOps = preload\("node_refactor_ops\.gd"\)/);
  assert.match(registry, /func _register_node_refactor\(\) -> void:/);
  assert.ok(registry.indexOf('_register_node_refactor()') < registry.indexOf('func dispatch'), 'node refactor registration should happen during initialization');
  for (const operation of NODE_REFACTOR_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 4 removes node refactor dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of NODE_REFACTOR_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
  }
  assert.doesNotMatch(legacy, /# --- Phase 1\.8: Scene search and node refactor workflow ---/);
});

test('build output copies the Phase 6.B node refactor module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/node_refactor_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 5 has a dedicated resource workflow operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/resource_workflow_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _load_scene_for_edit\(scene_path: String\) -> Dictionary:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func _curve_apply_points\(curve: Curve, points: Array\) -> void:/);
  assert.match(source, /func _gradient_from_points\(points: Array\) -> Gradient:/);
  assert.match(source, /func _resource_apply_shape_size\(shape_node: Node, params: Dictionary, is_3d: bool, shape_size\) -> bool:/);
  for (const operation of RESOURCE_WORKFLOW_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved resource workflow operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const ResourceWorkflowOps = preload\("resource_workflow_ops\.gd"\)/);
  assert.match(registry, /func _register_resource_workflow\(\) -> void:/);
  assert.ok(registry.indexOf('_register_resource_workflow()') < registry.indexOf('func dispatch'), 'resource workflow registration should happen during initialization');
  for (const operation of RESOURCE_WORKFLOW_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 5 removes resource workflow dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of RESOURCE_WORKFLOW_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
  assert.doesNotMatch(legacy, /# --- Phase 1\.4: Resource workflow/);
  assert.doesNotMatch(legacy, /func _curve_apply_points\(curve: Curve, points: Array\) -> void:/);
  assert.doesNotMatch(legacy, /func _gradient_from_points\(points: Array\) -> Gradient:/);
});

test('build output copies the Phase 6.B resource workflow module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/resource_workflow_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 6 has a dedicated physics operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/physics_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _load_scene_for_edit\(scene_path: String\) -> Dictionary:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func _create_collision_shape_resource\(shape_type: String, is_3d: bool, shape_size, shape_radius: float, shape_height: float\)/);
  assert.match(source, /func _collect_physics_body_paths\(root: Node, node: Node, paths: Array\) -> void:/);
  assert.match(source, /func _relative_joint_path\(body_path: String\) -> NodePath:/);
  for (const operation of PHYSICS_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved physics operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const PhysicsOps = preload\("physics_ops\.gd"\)/);
  assert.match(registry, /func _register_physics\(\) -> void:/);
  assert.ok(registry.indexOf('_register_physics()') < registry.indexOf('func dispatch'), 'physics registration should happen during initialization');
  for (const operation of PHYSICS_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 6 removes physics dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of PHYSICS_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
  assert.doesNotMatch(legacy, /# --- Tier 14: Physics ---/);
  assert.doesNotMatch(legacy, /func _create_collision_shape_resource\(shape_type: String, is_3d: bool, shape_size, shape_radius: float, shape_height: float\)/);
  assert.doesNotMatch(legacy, /func _relative_joint_path\(body_path: String\) -> NodePath:/);
});

test('build output copies the Phase 6.B physics module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/physics_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 7 has a dedicated navigation operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/navigation_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _load_scene_for_edit\(scene_path: String\) -> Dictionary:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func _parse_vector2i\(value, fallback := Vector2i\.ZERO\) -> Vector2i:/);
  assert.match(source, /func _nav_path_postprocessing_mode\(mode: String\) -> int:/);
  assert.match(source, /func _nav_metadata_flags\(flags: Array\) -> int:/);
  assert.match(source, /func _astar_heuristic\(value: String\) -> int:/);
  assert.match(source, /func _astar_diagonal_mode\(cell_connect_mode: String, diagonal_mode: String\) -> int:/);
  for (const operation of NAVIGATION_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved navigation operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const NavigationOps = preload\("navigation_ops\.gd"\)/);
  assert.match(registry, /func _register_navigation\(\) -> void:/);
  assert.ok(registry.indexOf('_register_navigation()') < registry.indexOf('func dispatch'), 'navigation registration should happen during initialization');
  for (const operation of NAVIGATION_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 7 removes navigation dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of NAVIGATION_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
  assert.doesNotMatch(legacy, /# --- Tier 16: Navigation ---/);
  assert.doesNotMatch(legacy, /func _nav_path_postprocessing_mode\(mode: String\) -> int:/);
  assert.doesNotMatch(legacy, /func _astar_diagonal_mode\(cell_connect_mode: String, diagonal_mode: String\) -> int:/);
});

test('build output copies the Phase 6.B navigation module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/navigation_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 8 has a dedicated visual QA operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/visual_qa_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _load_scene_for_edit\(scene_path: String\) -> Dictionary:/);
  assert.match(source, /func _camera_load_scene_with_camera\(params: Dictionary\) -> Dictionary:/);
  assert.match(source, /func _camera_2d_bounds_dict\(camera: Camera2D, viewport_size: Vector2\) -> Dictionary:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func _visual_collect_sprite_bounds\(scene_root: Node, node: Node, viewport_rect: Rect2, include_hidden: bool, sprites: Array, issues: Array\) -> void:/);
  assert.match(source, /func _visual_sprite_global_rect\(sprite: Sprite2D\) -> Rect2:/);
  assert.match(source, /func _visual_rect_dict\(rect: Rect2\) -> Dictionary:/);
  for (const operation of VISUAL_QA_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved visual QA operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const VisualQaOps = preload\("visual_qa_ops\.gd"\)/);
  assert.match(registry, /func _register_visual_qa\(\) -> void:/);
  assert.ok(registry.indexOf('_register_visual_qa()') < registry.indexOf('func dispatch'), 'visual QA registration should happen during initialization');
  for (const operation of VISUAL_QA_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 8 removes visual QA dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of VISUAL_QA_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
  assert.doesNotMatch(legacy, /# Phase 4\.4: Visual QA helpers/);
  assert.doesNotMatch(legacy, /func _visual_collect_sprite_bounds\(scene_root: Node, node: Node, viewport_rect: Rect2, include_hidden: bool, sprites: Array, issues: Array\) -> void:/);
  assert.doesNotMatch(legacy, /func _visual_rect_dict\(rect: Rect2\) -> Dictionary:/);
});

test('build output copies the Phase 6.B visual QA module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/visual_qa_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 9 has a dedicated signal operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/signal_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func _type_string\(type_enum\) -> String:/);
  for (const operation of SIGNAL_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved signal operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const SignalOps = preload\("signal_ops\.gd"\)/);
  assert.match(registry, /func _register_signals\(\) -> void:/);
  assert.ok(registry.indexOf('_register_signals()') < registry.indexOf('func dispatch'), 'signal registration should happen during initialization');
  for (const operation of SIGNAL_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 9 removes signal dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of SIGNAL_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params\\)?`), operation);
  }
  assert.doesNotMatch(legacy, /# List signals operation/);
});

test('build output copies the Phase 6.B signal module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/signal_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 10 has a dedicated animation operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/animation_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _load_scene_for_animation\(scene_path: String\) -> Dictionary:/);
  assert.match(source, /func _save_animation_scene\(scene_root: Node, full_scene_path: String\) -> bool:/);
  assert.doesNotMatch(source, /_legacy\._/);
  for (const operation of ANIMATION_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B registry exposes moved animation operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const AnimationOps = preload\("animation_ops\.gd"\)/);
  assert.match(registry, /func _register_animation\(\) -> void:/);
  assert.ok(registry.indexOf('_register_animation()') < registry.indexOf('func dispatch'), 'animation registration should happen during initialization');
  for (const operation of ANIMATION_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 10 removes animation dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of ANIMATION_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params(?:: Dictionary)?\\)?`), operation);
  }
  assert.doesNotMatch(legacy, /# Add an AnimationPlayer node to a scene/);
  assert.doesNotMatch(legacy, /# Tier 1: AnimationTree Configuration Operations/);
});

test('build output copies the Phase 6.B animation module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/animation_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 11 has a dedicated script operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/script_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.doesNotMatch(source, /_legacy\._/);
  assert.match(source, /func generate_basic_template\(class_name_val: String, extends_class: String\) -> String:/);
  assert.match(source, /func generate_character_controller_template\(class_name_val: String, extends_class: String\) -> String:/);
  for (const operation of SCRIPT_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params(?:: Dictionary)?\\):`), operation);
  }
});

test('Phase 6.B registry exposes moved script operation names before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const ScriptOps = preload\("script_ops\.gd"\)/);
  assert.match(registry, /func _register_scripts\(\) -> void:/);
  assert.ok(registry.indexOf('_register_scripts()') < registry.indexOf('func dispatch'), 'script registration should happen during initialization');
  for (const operation of SCRIPT_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 11 removes script dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of SCRIPT_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params\\)?`), operation);
  }
  assert.doesNotMatch(legacy, /# Analyze script operation - Parse GDScript and extract structure/);
  assert.doesNotMatch(legacy, /func generate_basic_template\(class_name_val: String, extends_class: String\) -> String:/);
});

test('build output copies the Phase 6.B script module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/script_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 11 sends Godot operation JSON without shell re-quoting', async () => {
  const source = await readFile(join(process.cwd(), 'src/index.ts'), 'utf8');

  assert.match(source, /import \{ spawn, exec, execSync, execFile \} from 'child_process';/);
  assert.match(source, /const execFileAsync = promisify\(execFile\);/);
  assert.match(source, /const cmdArgs = \[/);
  assert.match(source, /await execFileAsync\(this\.godotPath, cmdArgs/);
  assert.doesNotMatch(source, /quotedParams/);
});

test('safer planning treats modular Godot operation changes as operation-handler risk', async () => {
  const source = await readFile(join(process.cwd(), 'src/tools/safer-planning.ts'), 'utf8');

  assert.match(source, /file\.startsWith\('src\/scripts\/godot_ops\/'\)/);
  assert.match(source, /Godot operation handler changes need headless Godot proof/);
  assert.match(source, /src\/scripts\/godot_ops\/\*\*/);
});

test('docs mention the modular Godot operation script tree', async () => {
  const readme = await readFile(join(process.cwd(), 'README.md'), 'utf8');
  const template = await readFile(join(process.cwd(), 'docs/templates/manual-verification-note.md'), 'utf8');

  assert.match(readme, /godot_ops\//);
  assert.match(template, /src\/scripts\/godot_ops\/\*\*/);
});

test('Phase 6.B pass 12 has a fully moved camera operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/camera_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.doesNotMatch(source, /_legacy\.camera_/);
  assert.match(source, /func _camera_load_scene_with_camera\(params: Dictionary\) -> Dictionary:/);
  assert.match(source, /func _camera_follow_script_source\(\) -> String:/);
  for (const operation of CAMERA_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B pass 12 keeps camera operations registered before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const CameraOps = preload\("camera_ops\.gd"\)/);
  assert.match(registry, /func _register_camera\(\) -> void:/);
  assert.ok(registry.indexOf('_register_camera()') < registry.indexOf('func dispatch'), 'camera registration should happen during initialization');
  for (const operation of CAMERA_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 12 removes camera dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of CAMERA_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
  assert.doesNotMatch(legacy, /# Phase 1\.6: Camera workflow/);
  assert.doesNotMatch(legacy, /func _camera_load_scene_with_camera\(params: Dictionary\) -> Dictionary:/);
});

test('Phase 6.B pass 12 guards Camera2D make_current during offline scene edits', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/camera_ops.gd'), 'utf8');

  assert.match(source, /func _camera_make_current\(camera: Node\) -> void:/);
  assert.match(source, /is_inside_tree\(\)/);
  assert.doesNotMatch(source, /camera\.make_current\(\)/);
  assert.doesNotMatch(source, /camera\.call\("make_current"\)/);
});

test('build output copies the Phase 6.B camera module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/camera_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 13 has a dedicated audio-player operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/audio_player_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.doesNotMatch(source, /_legacy\.audio_player/);
  assert.match(source, /func _audio_player_load_scene_with_player\(params: Dictionary\) -> Dictionary:/);
  assert.match(source, /func _audio_player_known_buses\(allowed_buses\) -> Array:/);
  for (const operation of AUDIO_PLAYER_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B pass 13 keeps audio-player operations registered before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const AudioPlayerOps = preload\("audio_player_ops\.gd"\)/);
  assert.match(registry, /func _register_audio_player\(\) -> void:/);
  assert.ok(registry.indexOf('_register_audio_player()') < registry.indexOf('func dispatch'), 'audio-player registration should happen during initialization');
  for (const operation of AUDIO_PLAYER_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 13 removes audio-player dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of AUDIO_PLAYER_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
  assert.doesNotMatch(legacy, /# --- Phase 1\.7: Audio player workflow ---/);
  assert.doesNotMatch(legacy, /func _audio_player_load_scene_with_player\(params: Dictionary\) -> Dictionary:/);
});

test('build output copies the Phase 6.B audio-player module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/audio_player_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B pass 14 has a dedicated shader/material operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/shader_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.doesNotMatch(source, /_legacy\.shader/);
  assert.match(source, /func _shader_template\(template_name: String\) -> Dictionary:/);
  assert.match(source, /func _shader_parameter_value\(value\)/);
  for (const operation of SHADER_OPERATIONS) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`), operation);
  }
});

test('Phase 6.B pass 14 keeps shader/material operations registered before legacy fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  assert.match(registry, /const ShaderOps = preload\("shader_ops\.gd"\)/);
  assert.match(registry, /func _register_shader\(\) -> void:/);
  assert.ok(registry.indexOf('_register_shader()') < registry.indexOf('func dispatch'), 'shader registration should happen during initialization');
  for (const operation of SHADER_OPERATIONS) {
    assert.match(registry, new RegExp(`"${operation}"`), operation);
  }
});

test('Phase 6.B pass 14 removes shader/material dispatch cases from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of SHADER_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n\\s+${operation}\\(params\\)`), operation);
    assert.doesNotMatch(legacy, new RegExp(`func ${operation}\\(params(?:: Dictionary)?\\)?`), operation);
  }
  assert.doesNotMatch(legacy, /# Get shader template code/);
  assert.doesNotMatch(legacy, /# Tier 1: Shader Pipeline Completion Operations/);
});

test('build output copies the Phase 6.B shader/material module', async () => {
  const builtPath = join(process.cwd(), 'build/scripts/godot_ops/shader_ops.gd');
  const stats = await stat(builtPath);
  assert.equal(stats.isFile(), true);
});

test('Phase 6.B final pass has focused modules for every remaining legacy operation family', async () => {
  for (const [fileName, , , operations] of FINAL_PASS_MODULES) {
    const modulePath = join(process.cwd(), 'src/scripts/godot_ops', fileName);
    assert.equal(existsSync(modulePath), true, fileName);
    const source = await readFile(modulePath, 'utf8');

    assert.match(source, /extends RefCounted/, fileName);
    assert.match(source, /func setup\(context, legacy\) -> void:/, fileName);
    assert.doesNotMatch(source, /_legacy\.[a-zA-Z0-9_]+\(params\)/, fileName);
    for (const operation of operations) {
      const escaped = operation === 'remove_node' ? 'remove_node_op' : operation;
      assert.match(source, new RegExp(`func ${escaped}\\(params(?:: Dictionary)?\\)?`), `${fileName} ${operation}`);
    }
  }
});

test('Phase 6.B final pass create_scene does not assign the root node as its own owner', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/scene_core_ops.gd'), 'utf8');

  assert.doesNotMatch(source, /scene_root\.owner\s*=\s*scene_root/);
});

test('Phase 6.B final pass load_sprite frees the edited scene after saving', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/scene_core_ops.gd'), 'utf8');
  const loadSprite = source.slice(source.indexOf('func load_sprite'), source.indexOf('func save_scene'));

  assert.match(loadSprite, /scene_root\.free\(\)/);
});

test('Phase 6.B final pass add_node frees the edited scene after saving', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/scene_core_ops.gd'), 'utf8');
  const addNode = source.slice(source.indexOf('func add_node'), source.indexOf('func load_sprite'));

  assert.match(addNode, /scene_root\.free\(\)/);
});

test('Phase 6.B final pass save_scene frees the edited scene after saving', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/scene_core_ops.gd'), 'utf8');
  const saveScene = source.slice(source.indexOf('func save_scene'), source.indexOf('func modify_node_property'));

  assert.match(saveScene, /scene_root\.free\(\)/);
});

test('Phase 6.B final pass reparent_node captures old parent path before detach', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/scene_core_ops.gd'), 'utf8');
  const reparentNode = source.slice(source.indexOf('func reparent_node'), source.indexOf('# Helper: recursively set owner'));

  assert.match(reparentNode, /var old_parent_path := _scene_core_relative_path\(scene_root, old_parent\)/);
  assert.ok(reparentNode.indexOf('var old_parent_path := _scene_core_relative_path(scene_root, old_parent)') < reparentNode.indexOf('old_parent.remove_child(target_node)'));
  assert.doesNotMatch(reparentNode, /old_parent\.get_path\(\)/);
  assert.match(reparentNode, /"old_parent": old_parent_path/);
  assert.match(source, /func _scene_core_relative_path\(scene_root: Node, node: Node\) -> String:/);
});

test('Phase 6.B final pass tilemap scene edits free the edited scene after saving', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/tilemap_ops.gd'), 'utf8');
  const createTilemap = source.slice(source.indexOf('func create_tilemap'), source.indexOf('# Paint tiles in a TileMap'));
  const paintTiles = source.slice(source.indexOf('func paint_tiles'), source.indexOf('# Configure TileSet properties'));

  assert.match(createTilemap, /scene_root\.free\(\)/);
  assert.match(paintTiles, /scene_root\.free\(\)/);
});

test('Phase 6.B final pass mesh-library export frees the instantiated scene', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/mesh_library_ops.gd'), 'utf8');
  const exportMeshLibrary = source.slice(source.indexOf('func export_mesh_library'), source.indexOf('# Find files with a specific extension recursively'));

  assert.match(exportMeshLibrary, /scene_root\.free\(\)/);
});

test('Phase 6.B final pass multiplayer spawner does not assign unsupported replication_interval', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/multiplayer_ops.gd'), 'utf8');
  const manageSpawner = source.slice(source.indexOf('func manage_multiplayer_spawner'), source.indexOf('# --- Tier 14/16 shared helpers ---'));

  assert.doesNotMatch(manageSpawner, /spawner\.replication_interval\s*=/);
  assert.match(manageSpawner, /if replication_interval > 0 and _has_property\(spawner, "replication_interval"\):/);
});

test('Phase 6.B final pass update_project_uids scans the active project root', async () => {
  const source = await readFile(join(process.cwd(), 'src/index.ts'), 'utf8');
  const handler = source.slice(source.indexOf('private async handleUpdateProjectUids'), source.indexOf('private async handleListSignals'));

  assert.match(handler, /const params = \{\s*\};/s);
  assert.doesNotMatch(handler, /projectPath: args\.projectPath/);
});

test('Phase 6.B final pass registers every remaining legacy operation before fallback', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');

  for (const [fileName, className, registerName, operations] of FINAL_PASS_MODULES) {
    assert.match(registry, new RegExp(`const ${className} = preload\\("${fileName.replace('.', '\\.')}"\\)`), fileName);
    assert.match(registry, new RegExp(`func ${registerName}\\(\\) -> void:`), registerName);
    assert.ok(registry.indexOf(`${registerName}()`) < registry.indexOf('func dispatch'), `${registerName} should run during initialization`);
    for (const operation of operations) {
      assert.match(registry, new RegExp(`"${operation}"`), operation);
    }
  }
});

test('Phase 6.B final pass removes all remaining operation implementations from legacy fallback', async () => {
  const legacy = await readFile(join(process.cwd(), 'src/scripts/godot_ops/legacy_operations.gd'), 'utf8');

  for (const operation of FINAL_PASS_OPERATIONS) {
    assert.doesNotMatch(legacy, new RegExp(`"${operation}":\\r?\\n`), operation);
    const functionName = operation === 'remove_node' ? 'remove_node_op' : operation;
    assert.doesNotMatch(legacy, new RegExp(`func ${functionName}\\(params(?:: Dictionary)?\\)?`), operation);
  }
  assert.doesNotMatch(legacy, /func find_files\(path, extension\):/);
  assert.doesNotMatch(legacy, /func _add_bus_effects\(bus_idx: int, effects: Array\) -> void:/);
  assert.doesNotMatch(legacy, /func _multiplayer_peer_script_source\(\) -> String:/);
  assert.doesNotMatch(legacy, /func asset_batch_reimport\(params: Dictionary\) -> void:/);
});

test('Phase 6.B final pass keeps the public runner inspectable', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_operations.gd'), 'utf8');
  const implementationNames = [
    ...FINAL_PASS_OPERATIONS,
    ...DESIGN_OPERATIONS,
    ...GAMEPLAY_OPERATIONS,
    ...UI_THEME_OPERATIONS,
    ...NODE_REFACTOR_OPERATIONS,
    ...RESOURCE_WORKFLOW_OPERATIONS,
    ...PHYSICS_OPERATIONS,
    ...NAVIGATION_OPERATIONS,
    ...VISUAL_QA_OPERATIONS,
    ...SIGNAL_OPERATIONS,
    ...ANIMATION_OPERATIONS,
    ...SCRIPT_OPERATIONS,
    ...CAMERA_OPERATIONS,
    ...AUDIO_PLAYER_OPERATIONS,
    ...SHADER_OPERATIONS,
  ];

  assert.ok(source.split(/\r?\n/).length <= 80);
  for (const operation of implementationNames) {
    assert.doesNotMatch(source, new RegExp(`func ${operation}\\(`), operation);
  }
});

test('build output copies the Phase 6.B final pass modules', async () => {
  for (const [fileName] of FINAL_PASS_MODULES) {
    const builtPath = join(process.cwd(), 'build/scripts/godot_ops', fileName);
    const stats = await stat(builtPath);
    assert.equal(stats.isFile(), true, fileName);
  }
});
