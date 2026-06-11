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

test('Phase 6.B has a dedicated design-to-scene operation module', async () => {
  const modulePath = join(process.cwd(), 'src/scripts/godot_ops/design_to_scene_ops.gd');
  assert.equal(existsSync(modulePath), true);
  const source = await readFile(modulePath, 'utf8');

  assert.match(source, /extends RefCounted/);
  assert.match(source, /func setup\(context, legacy\) -> void:/);
  assert.match(source, /func _to_res_path\(path: String\) -> String:/);
  assert.match(source, /func _save_scene_root\(scene: Node, full_path: String\) -> bool:/);
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
