import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolRegistry } from '../build/registry.js';
import { registerAssetPipelineTools } from '../build/tools/asset-pipeline.js';

function parseResponse(response) {
  assert.equal(response.content?.[0]?.type, 'text');
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const aliases = {
    project_path: 'projectPath',
    asset_paths: 'assetPaths',
    wait_for_completion: 'waitForCompletion',
  };
  return {
    validatePath: (path) => Boolean(path) && !String(path).includes('..'),
    executeOperation: options.executeOperation || (async () => ({ stdout: '{}\n', stderr: '' })),
    normalizeParameters: (params) => params,
    convertCamelToSnakeCase: (params) => Object.fromEntries(
      Object.entries(params).map(([key, value]) => [aliases[key] || key, value]),
    ),
    parseGodotJson: (stdout) => JSON.parse(stdout.trim()),
  };
}

test('Phase 6.A runner entrypoint is small and delegates through godot_ops modules', async () => {
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_operations.gd'), 'utf8');
  const lineCount = source.trimEnd().split(/\r?\n/).length;

  assert.ok(lineCount < 180, `expected small runner, got ${lineCount} lines`);
  assert.match(source, /operation_registry\.gd/);
  assert.match(source, /OperationContext/);
  assert.doesNotMatch(source, /func asset_batch_reimport\(params: Dictionary\) -> void:/);
  assert.doesNotMatch(source, /func camera_create\(params: Dictionary\) -> void:/);
});

test('Phase 6.A registry exposes moved asset and camera operation names', async () => {
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');
  const assetOps = await readFile(join(process.cwd(), 'src/scripts/godot_ops/asset_pipeline_ops.gd'), 'utf8');
  const cameraOps = await readFile(join(process.cwd(), 'src/scripts/godot_ops/camera_ops.gd'), 'utf8');

  assert.match(registry, /asset_batch_reimport/);
  assert.match(assetOps, /func asset_batch_reimport\(params: Dictionary\) -> void:/);
  assert.match(assetOps, /func _asset_pipeline_to_res_path\(path: String\) -> String:/);

  for (const operation of [
    'camera_create',
    'camera_configure',
    'camera_setup_follow_2d',
    'camera_set_limits_2d',
    'camera_set_smoothing_2d',
    'camera_apply_preset',
    'camera_list',
    'camera_preview_bounds',
  ]) {
    assert.match(registry, new RegExp(operation));
    assert.match(cameraOps, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`));
  }
});

test('build output keeps the stable entrypoint and copies godot_ops modules', async () => {
  assert.equal(existsSync(join(process.cwd(), 'build/scripts/godot_operations.gd')), true);
  for (const relativePath of [
    'operation_context.gd',
    'operation_registry.gd',
    'asset_pipeline_ops.gd',
    'camera_ops.gd',
    'legacy_operations.gd',
  ]) {
    const builtPath = join(process.cwd(), 'build/scripts/godot_ops', relativePath);
    const stats = await stat(builtPath);
    assert.equal(stats.isFile(), true, relativePath);
  }
});

test('asset_batch_reimport still runs through ctx.executeOperation unchanged', async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-phase6a-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="Phase6A"\n');
  const calls = [];
  const registry = new ToolRegistry();
  registerAssetPipelineTools(registry, createContext({
    executeOperation: async (operation, params, projectPath) => {
      calls.push({ operation, params, projectPath });
      return {
        stdout: JSON.stringify({
          success: true,
          operation,
          count: params.asset_paths.length,
          reimported: params.asset_paths,
        }) + '\n',
        stderr: '',
      };
    },
  }));

  const response = parseResponse(await registry.dispatch('asset_batch_reimport', {
    project_path: projectPath,
    asset_paths: ['res://icon.svg'],
    wait_for_completion: false,
  }));

  assert.equal(response.status, 'success');
  assert.equal(response.operation, 'asset_batch_reimport');
  assert.equal(response.count, 1);
  assert.deepEqual(calls, [{
    operation: 'asset_batch_reimport',
    params: {
      asset_paths: ['res://icon.svg'],
      wait_for_completion: false,
    },
    projectPath,
  }]);
});
