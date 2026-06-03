import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerResourceWorkflowTools } from '../build/tools/resource-workflow.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    scene_path: 'scenePath',
    node_path: 'nodePath',
    body_path: 'bodyPath',
    visual_node_path: 'visualNodePath',
    property_name: 'propertyName',
    resource_path: 'resourcePath',
    output_path: 'outputPath',
    include_properties: 'includeProperties',
    resource_type: 'resourceType',
    text_query: 'textQuery',
    scan_paths: 'scanPaths',
    max_results: 'maxResults',
    validate_after: 'validateAfter',
    noise_type: 'noiseType',
    as_normal_map: 'asNormalMap',
    min_value: 'minValue',
    max_value: 'maxValue',
    bake_resolution: 'bakeResolution',
    background_mode: 'backgroundMode',
    background_color: 'backgroundColor',
    ambient_light_color: 'ambientLightColor',
    ambient_light_energy: 'ambientLightEnergy',
    glow_enabled: 'glowEnabled',
    ssao_enabled: 'ssaoEnabled',
    shape_name: 'shapeName',
    shape_type: 'shapeType',
    shape_size: 'shapeSize',
    shape_radius: 'shapeRadius',
    shape_height: 'shapeHeight',
    replace_existing: 'replaceExisting',
  };

  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = mapping[key] || key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[normalizedKey] = normalizeParameters(value);
      } else if (Array.isArray(value)) {
        result[normalizedKey] = value.map((item) => normalizeParameters(item));
      } else {
        result[normalizedKey] = value;
      }
    }
    return result;
  };

  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({ content: [{ type: 'text', text: message }], isError: true }),
    validatePath: (path) => Boolean(path) && !path.includes('..'),
    executeOperation: options.executeOperation || (async () => ({ stdout: '{"success":true}', stderr: '' })),
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
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-resources-'));
  await mkdir(join(projectPath, 'resources'), { recursive: true });
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="Resources"\n');
  await writeFile(join(projectPath, 'resources', 'theme.tres'), [
    '[gd_resource type="Theme" format=3 uid="uid://theme_uid"]',
    '',
    '[ext_resource type="Texture2D" path="res://resources/icon.svg" id="1_icon"]',
    '',
    '[resource]',
    'default_font_size = 18',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'resources', 'curve.tres'), [
    '[gd_resource type="Curve" format=3 uid="uid://curve_uid"]',
    '',
    '[resource]',
    'min_value = 0.0',
    'max_value = 1.0',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'scenes', 'main.tscn'), [
    '[gd_scene load_steps=1 format=3 uid="uid://main_uid"]',
    '',
    '[node name="Main" type="Node2D"]',
    '',
  ].join('\n'));
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerResourceWorkflowTools(registry, ctx);
  return registry;
}

test('resource workflow tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'resource_search',
    'resource_get_info',
    'resource_assign',
    'resource_preview_metadata',
    'create_gradient_texture',
    'create_noise_texture',
    'create_curve_resource',
    'set_curve_points',
    'create_environment_resource',
    'create_physics_material',
    'autofit_physics_shape',
    'resource_convert_format',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('resource_search and resource_get_info inspect text resources', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const search = parseResponse(await registry.dispatch('resource_search', {
      project_path: projectPath,
      resource_type: 'Theme',
      references: 'res://resources/icon.svg',
    }));
    assert.equal(search.status, 'success');
    assert.equal(search.matches[0].path, 'res://resources/theme.tres');
    assert.equal(search.matches[0].uid, 'uid://theme_uid');

    const info = parseResponse(await registry.dispatch('resource_get_info', {
      project_path: projectPath,
      resource_path: 'res://resources/theme.tres',
    }));
    assert.equal(info.type, 'Theme');
    assert.equal(info.properties.default_font_size, '18');

    const preview = parseResponse(await registry.dispatch('resource_preview_metadata', {
      project_path: projectPath,
      resource_path: 'resources/curve.tres',
    }));
    assert.equal(preview.type, 'Curve');
    assert.equal(preview.previewable, true);
    assert.deepEqual(preview.property_names, ['min_value', 'max_value']);
  });
});

test('resource creation tools dispatch narrow Godot operations', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params, projectDir) => {
        calls.push({ operation, params, projectDir });
        return { stdout: JSON.stringify({ success: true, operation, resource_path: params.output_path || params.resource_path }) + '\n', stderr: '' };
      },
    }));

    await registry.dispatch('create_gradient_texture', {
      project_path: projectPath,
      output_path: 'resources/grad.tres',
      dimension: '2d',
      points: [{ offset: 0, color: [1, 0, 0, 1] }],
    });
    await registry.dispatch('create_noise_texture', {
      project_path: projectPath,
      output_path: 'resources/noise.tres',
      noise_type: 2,
    });
    await registry.dispatch('create_environment_resource', {
      project_path: projectPath,
      output_path: 'resources/env.tres',
      ambient_light_energy: 0.75,
    });
    await registry.dispatch('create_physics_material', {
      project_path: projectPath,
      output_path: 'resources/physics.tres',
      bounce: 0.4,
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'resource_create_gradient_texture',
      'resource_create_noise_texture',
      'resource_create_environment',
      'resource_create_physics_material',
    ]);
    assert.equal(calls[0].params.dimension, '2d');
    assert.equal(calls[1].params.noise_type, 2);
    assert.equal(calls[2].params.ambient_light_energy, 0.75);
    assert.equal(calls[3].params.bounce, 0.4);
    assert.equal(calls.every((call) => call.projectDir === projectPath), true);
  });
});

test('curve, assign, autofit, and convert tools map scene/resource parameters', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return { stdout: JSON.stringify({ success: true, operation }) + '\n', stderr: '' };
      },
    }));

    await registry.dispatch('create_curve_resource', {
      project_path: projectPath,
      output_path: 'resources/curve2.tres',
      min_value: -1,
      max_value: 2,
      points: [{ offset: 0, value: 0 }],
    });
    await registry.dispatch('set_curve_points', {
      project_path: projectPath,
      resource_path: 'resources/curve.tres',
      points: [{ offset: 1, value: 1 }],
    });
    await registry.dispatch('resource_assign', {
      project_path: projectPath,
      scene_path: 'scenes/main.tscn',
      node_path: '.',
      property_name: 'material',
      resource_path: 'resources/physics.tres',
    });
    await registry.dispatch('autofit_physics_shape', {
      project_path: projectPath,
      scene_path: 'scenes/main.tscn',
      body_path: 'Player',
      shape_size: [32, 64],
    });
    await registry.dispatch('resource_convert_format', {
      project_path: projectPath,
      resource_path: 'resources/curve.tres',
      output_path: 'resources/curve.res',
      overwrite: true,
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'resource_create_curve',
      'resource_set_curve_points',
      'resource_assign',
      'resource_autofit_physics_shape',
      'resource_convert_format',
    ]);
    assert.equal(calls[0].params.min_value, -1);
    assert.equal(calls[1].params.resource_path, 'resources/curve.tres');
    assert.equal(calls[2].params.property_name, 'material');
    assert.deepEqual(calls[3].params.shape_size, [32, 64]);
    assert.equal(calls[4].params.overwrite, true);
  });
});
