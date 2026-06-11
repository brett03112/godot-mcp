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
