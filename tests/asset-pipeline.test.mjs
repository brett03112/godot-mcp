import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerAssetPipelineTools } from '../build/tools/asset-pipeline.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    asset_path: 'assetPath',
    asset_paths: 'assetPaths',
    profile_name: 'profileName',
    texture_settings: 'textureSettings',
    audio_settings: 'audioSettings',
    model_settings: 'modelSettings',
    dry_run: 'dryRun',
    output_path: 'outputPath',
    max_total_bytes: 'maxTotalBytes',
    per_asset_budget_bytes: 'perAssetBudgetBytes',
    wait_for_completion: 'waitForCompletion',
    default_license: 'defaultLicense',
  };

  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = mapping[key] || key;
      result[normalizedKey] = Array.isArray(value)
        ? value.map((item) => normalizeParameters(item))
        : normalizeParameters(value);
    }
    return result;
  };

  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({ content: [{ type: 'text', text: message }], isError: true }),
    validatePath: (path) => Boolean(path) && !String(path).includes('..'),
    executeOperation: options.executeOperation || (async () => ({ stdout: '{}\n', stderr: '' })),
    normalizeParameters,
    convertCamelToSnakeCase: (params) => params,
    parseGodotErrors: () => [],
    formatTresValue: (value) => String(value),
    generateUID: () => 'uid://test',
    generateShortUID: () => 'testuid',
    isGodot44OrLater: () => true,
    getGodotPath: async () => 'godot',
    formatProjectSettingValue: (value) => String(value),
    escapeCsvValue: (value) => value,
    parseCsvLine: (line) => line.split(','),
    escapePoString: (value) => value,
    escapeRegex: (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    extractPlaceholders: () => [],
    getOrParseTscn: () => ({}),
    invalidateTscnCache: () => {},
  };
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-asset-pipeline-'));
  await mkdir(join(projectPath, 'assets'), { recursive: true });
  await mkdir(join(projectPath, 'audio'), { recursive: true });
  await mkdir(join(projectPath, 'models'), { recursive: true });
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="AssetPipeline"\n');
  await writeFile(join(projectPath, 'assets', 'hero.png'), 'png-bytes');
  await writeFile(join(projectPath, 'audio', 'music.wav'), 'wav-bytes');
  await writeFile(join(projectPath, 'models', 'crate.gltf'), '{"asset":{}}\n');
  await writeFile(join(projectPath, 'assets', 'hero.png.import'), [
    '[remap]',
    'importer="texture"',
    'type="CompressedTexture2D"',
    'uid="uid://hero"',
    'path="res://.godot/imported/hero.ctex"',
    '',
    '[params]',
    'compress/mode=0',
    'mipmaps/generate=false',
    'process/fix_alpha_border=true',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'audio', 'music.wav.import'), [
    '[remap]',
    'importer="wav"',
    'type="AudioStreamWAV"',
    'uid="uid://music"',
    '',
    '[params]',
    'edit/loop_mode=0',
    'compress/mode=2',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'models', 'crate.gltf.import'), [
    '[remap]',
    'importer="scene"',
    'type="PackedScene"',
    'uid="uid://crate"',
    '',
    '[params]',
    'nodes/root_type="Node3D"',
    'meshes/create_shadow_meshes=true',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'scenes', 'main.tscn'), [
    '[gd_scene format=3]',
    '[ext_resource type="Texture2D" path="res://assets/hero.png" id="1"]',
    '[node name="Sprite2D" type="Sprite2D"]',
    'texture = ExtResource("1")',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'assets', 'hero.png.license'), 'CC0-1.0\nAuthor: Test Artist\nSource: local-fixture\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerAssetPipelineTools(registry, ctx);
  return registry;
}

test('Phase 4.5 asset pipeline tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'asset_import_profile_create',
    'asset_import_profile_apply',
    'texture_import_settings_get',
    'texture_import_settings_set',
    'audio_import_settings_get',
    'audio_import_settings_set',
    'model_import_settings_get',
    'model_import_settings_set',
    'asset_batch_reimport',
    'asset_usage_report',
    'asset_size_budget_report',
    'asset_license_manifest',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('import setting get and set tools read and update the [params] section only', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const textureBefore = parseResponse(await registry.dispatch('texture_import_settings_get', {
      project_path: projectPath,
      asset_path: 'res://assets/hero.png',
    }));
    assert.equal(textureBefore.status, 'success');
    assert.equal(textureBefore.importer, 'texture');
    assert.equal(textureBefore.settings['mipmaps/generate'], false);

    const textureSet = parseResponse(await registry.dispatch('texture_import_settings_set', {
      project_path: projectPath,
      asset_path: 'assets/hero.png',
      settings: {
        'compress/mode': 2,
        'mipmaps/generate': true,
      },
    }));
    assert.equal(textureSet.status, 'success');
    assert.deepEqual(textureSet.changed_keys.sort(), ['compress/mode', 'mipmaps/generate']);

    const textureAfter = parseResponse(await registry.dispatch('texture_import_settings_get', {
      project_path: projectPath,
      asset_path: 'assets/hero.png',
    }));
    assert.equal(textureAfter.settings['compress/mode'], 2);
    assert.equal(textureAfter.settings['mipmaps/generate'], true);
    assert.equal(textureAfter.uid, 'uid://hero');

    const audioDryRun = parseResponse(await registry.dispatch('audio_import_settings_set', {
      project_path: projectPath,
      asset_path: 'audio/music.wav',
      settings: { 'edit/loop_mode': 1 },
      dry_run: true,
    }));
    assert.equal(audioDryRun.status, 'success');
    assert.equal(audioDryRun.dry_run, true);
    const audioAfterDryRun = parseResponse(await registry.dispatch('audio_import_settings_get', {
      project_path: projectPath,
      asset_path: 'audio/music.wav',
    }));
    assert.equal(audioAfterDryRun.settings['edit/loop_mode'], 0);

    const modelSet = parseResponse(await registry.dispatch('model_import_settings_set', {
      project_path: projectPath,
      asset_path: 'models/crate.gltf',
      settings: { 'nodes/root_type': 'StaticBody3D' },
    }));
    assert.equal(modelSet.status, 'success');
    const modelAfter = parseResponse(await registry.dispatch('model_import_settings_get', {
      project_path: projectPath,
      asset_path: 'models/crate.gltf',
    }));
    assert.equal(modelAfter.settings['nodes/root_type'], 'StaticBody3D');
  });
});

test('import profiles are stored project-locally and can apply type-specific settings', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const created = parseResponse(await registry.dispatch('asset_import_profile_create', {
      project_path: projectPath,
      profile_name: 'mobile-fast',
      texture_settings: { 'compress/mode': 2, 'mipmaps/generate': true },
      audio_settings: { 'compress/mode': 1 },
      model_settings: { 'meshes/create_shadow_meshes': false },
    }));
    assert.equal(created.status, 'success');
    assert.equal(created.profile_path, '.godot-mcp/import_profiles/mobile-fast.json');
    assert.equal((await stat(join(projectPath, '.godot-mcp', 'import_profiles', 'mobile-fast.json'))).isFile(), true);

    const applied = parseResponse(await registry.dispatch('asset_import_profile_apply', {
      project_path: projectPath,
      profile_name: 'mobile-fast',
      asset_paths: ['assets/hero.png', 'audio/music.wav', 'models/crate.gltf'],
    }));
    assert.equal(applied.status, 'success');
    assert.equal(applied.applied_assets.length, 3);
    assert.deepEqual(applied.applied_assets.map((asset) => asset.asset_type).sort(), ['audio', 'model', 'texture']);

    const textureAfter = parseResponse(await registry.dispatch('texture_import_settings_get', {
      project_path: projectPath,
      asset_path: 'assets/hero.png',
    }));
    assert.equal(textureAfter.settings['compress/mode'], 2);
    assert.equal(textureAfter.settings['mipmaps/generate'], true);
  });
});

test('asset_batch_reimport delegates selected files to the Godot operation', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params, operationProjectPath) => {
        calls.push({ operation, params, operationProjectPath });
        return {
          stdout: JSON.stringify({
            success: true,
            reimported: params.asset_paths,
            count: params.asset_paths.length,
          }) + '\n',
          stderr: '',
        };
      },
    }));

    const response = parseResponse(await registry.dispatch('asset_batch_reimport', {
      project_path: projectPath,
      asset_paths: ['assets/hero.png', 'audio/music.wav'],
      wait_for_completion: true,
    }));
    assert.equal(response.status, 'success');
    assert.equal(response.count, 2);
    assert.equal(calls[0].operation, 'asset_batch_reimport');
    assert.deepEqual(calls[0].params.asset_paths, ['res://assets/hero.png', 'res://audio/music.wav']);
    assert.equal(calls[0].operationProjectPath, projectPath);
  });
});

test('usage, size budget, and license tools report project asset metadata', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const usage = parseResponse(await registry.dispatch('asset_usage_report', {
      project_path: projectPath,
      asset_paths: ['assets/hero.png', 'audio/music.wav'],
    }));
    assert.equal(usage.status, 'success');
    assert.equal(usage.assets[0].reference_count, 1);
    assert.equal(usage.assets[0].references[0].path, 'scenes/main.tscn');
    assert.equal(usage.assets[1].reference_count, 0);

    const budget = parseResponse(await registry.dispatch('asset_size_budget_report', {
      project_path: projectPath,
      asset_paths: ['assets/hero.png', 'audio/music.wav'],
      max_total_bytes: 4,
      per_asset_budget_bytes: 6,
    }));
    assert.equal(budget.status, 'failed');
    assert.equal(budget.total_bytes, 18);
    assert.equal(budget.violations.length, 2);

    const manifest = parseResponse(await registry.dispatch('asset_license_manifest', {
      project_path: projectPath,
      asset_paths: ['assets/hero.png', 'audio/music.wav'],
      output_path: '.godot-mcp/asset_licenses.json',
      default_license: 'UNKNOWN',
    }));
    assert.equal(manifest.status, 'success');
    assert.equal(manifest.entries[0].license, 'CC0-1.0');
    assert.equal(manifest.entries[1].license, 'UNKNOWN');
    assert.equal((await stat(join(projectPath, '.godot-mcp', 'asset_licenses.json'))).isFile(), true);
    const written = JSON.parse(await readFile(join(projectPath, '.godot-mcp', 'asset_licenses.json'), 'utf8'));
    assert.equal(written.entries.length, 2);
  });
});

test('asset pipeline GDScript registry targets Phase 4.5 reimport handler', async () => {
  const runner = await readFile(join(process.cwd(), 'src/scripts/godot_operations.gd'), 'utf8');
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');
  const assetOps = await readFile(join(process.cwd(), 'src/scripts/godot_ops/asset_pipeline_ops.gd'), 'utf8');
  assert.match(runner, /OperationRegistry/);
  assert.match(registry, /"asset_batch_reimport"/);
  assert.match(assetOps, /func asset_batch_reimport\(params: Dictionary\) -> void:/);
});
