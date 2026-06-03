import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerCameraWorkflowTools } from '../build/tools/camera-workflow.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    scene_path: 'scenePath',
    parent_path: 'parentPath',
    camera_name: 'cameraName',
    camera_type: 'cameraType',
    camera_path: 'cameraPath',
    make_current: 'makeCurrent',
    target_path: 'targetPath',
    follow_offset: 'followOffset',
    update_mode: 'updateMode',
    overwrite_script: 'overwriteScript',
    limit_left: 'limitLeft',
    limit_right: 'limitRight',
    limit_top: 'limitTop',
    limit_bottom: 'limitBottom',
    limit_enabled: 'limitEnabled',
    limit_smoothed: 'limitSmoothed',
    editor_draw_limits: 'editorDrawLimits',
    position_smoothing_enabled: 'positionSmoothingEnabled',
    position_smoothing_speed: 'positionSmoothingSpeed',
    rotation_smoothing_enabled: 'rotationSmoothingEnabled',
    rotation_smoothing_speed: 'rotationSmoothingSpeed',
    drag_margin_enabled: 'dragMarginEnabled',
    drag_margins: 'dragMargins',
    viewport_size: 'viewportSize',
    include_bounds: 'includeBounds',
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
    invalidateTscnCache: options.invalidateTscnCache || (() => {}),
  };
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-camera-'));
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="CameraWorkflow"\n');
  await writeFile(join(projectPath, 'scenes', 'level.tscn'), [
    '[gd_scene load_steps=1 format=3]',
    '',
    '[node name="Level" type="Node2D"]',
    '',
    '[node name="Player" type="Node2D" parent="."]',
    'position = Vector2(32, 48)',
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
  registerCameraWorkflowTools(registry, ctx);
  return registry;
}

test('camera workflow tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'create_camera',
    'configure_camera',
    'setup_camera_follow_2d',
    'set_camera_limits_2d',
    'set_camera_smoothing_2d',
    'apply_camera_preset',
    'list_cameras',
    'preview_camera_bounds',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('camera creation and configuration tools map scene parameters', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params, projectDir) => {
        calls.push({ operation, params, projectDir });
        return { stdout: JSON.stringify({ success: true, operation, camera_path: params.camera_path || 'CameraRig' }) + '\n', stderr: '' };
      },
    }));

    await registry.dispatch('create_camera', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      parent_path: '.',
      camera_name: 'CameraRig',
      camera_type: '2d',
      make_current: true,
      position: [128, 96],
      zoom: [1.5, 1.5],
    });
    await registry.dispatch('configure_camera', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      camera_path: 'CameraRig',
      make_current: true,
      enabled: true,
      zoom: [1.25, 1.25],
      offset: [8, -4],
      ignore_rotation: true,
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'camera_create',
      'camera_configure',
    ]);
    assert.equal(calls[0].params.scene_path, 'scenes/level.tscn');
    assert.equal(calls[0].params.parent_path, '.');
    assert.equal(calls[0].params.camera_name, 'CameraRig');
    assert.equal(calls[0].params.camera_type, '2d');
    assert.equal(calls[0].params.make_current, true);
    assert.deepEqual(calls[0].params.position, [128, 96]);
    assert.deepEqual(calls[0].params.zoom, [1.5, 1.5]);
    assert.equal(calls[1].params.camera_path, 'CameraRig');
    assert.deepEqual(calls[1].params.offset, [8, -4]);
    assert.equal(calls.every((call) => call.projectDir === projectPath), true);
  });
});

test('Camera2D follow, limits, smoothing, and preset tools map focused payloads', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return { stdout: JSON.stringify({ success: true, operation, camera_path: params.camera_path || 'CameraRig' }) + '\n', stderr: '' };
      },
    }));

    await registry.dispatch('setup_camera_follow_2d', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      camera_path: 'CameraRig',
      target_path: 'Player',
      follow_offset: [0, -24],
      update_mode: 'physics',
      overwrite_script: true,
    });
    await registry.dispatch('set_camera_limits_2d', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      camera_path: 'CameraRig',
      limit_left: -128,
      limit_right: 2048,
      limit_top: -96,
      limit_bottom: 1024,
      limit_enabled: true,
      editor_draw_limits: true,
    });
    await registry.dispatch('set_camera_smoothing_2d', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      camera_path: 'CameraRig',
      position_smoothing_enabled: true,
      position_smoothing_speed: 7.5,
      rotation_smoothing_enabled: false,
    });
    await registry.dispatch('apply_camera_preset', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      camera_path: 'CameraRig',
      preset: 'platformer_2d',
      viewport_size: [960, 540],
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'camera_setup_follow_2d',
      'camera_set_limits_2d',
      'camera_set_smoothing_2d',
      'camera_apply_preset',
    ]);
    assert.equal(calls[0].params.target_path, 'Player');
    assert.deepEqual(calls[0].params.follow_offset, [0, -24]);
    assert.equal(calls[0].params.update_mode, 'physics');
    assert.equal(calls[1].params.limit_right, 2048);
    assert.equal(calls[1].params.editor_draw_limits, true);
    assert.equal(calls[2].params.position_smoothing_speed, 7.5);
    assert.equal(calls[3].params.preset, 'platformer_2d');
    assert.deepEqual(calls[3].params.viewport_size, [960, 540]);
  });
});

test('camera listing and bounds preview tools return parsed JSON responses', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        if (operation === 'camera_list') {
          return {
            stdout: JSON.stringify({
              success: true,
              cameras: [{ path: 'CameraRig', type: 'Camera2D', current: true }],
              count: 1,
            }) + '\n',
            stderr: '',
          };
        }
        return {
          stdout: JSON.stringify({
            success: true,
            camera_path: params.camera_path,
            viewport_size: params.viewport_size,
            bounds: { x: -320, y: -180, width: 640, height: 360 },
          }) + '\n',
          stderr: '',
        };
      },
    }));

    const list = parseResponse(await registry.dispatch('list_cameras', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      include_bounds: true,
      viewport_size: [640, 360],
    }));
    const preview = parseResponse(await registry.dispatch('preview_camera_bounds', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      camera_path: 'CameraRig',
      viewport_size: [640, 360],
    }));

    assert.equal(list.status, 'success');
    assert.equal(list.count, 1);
    assert.equal(list.cameras[0].path, 'CameraRig');
    assert.equal(preview.status, 'success');
    assert.deepEqual(preview.bounds, { x: -320, y: -180, width: 640, height: 360 });
    assert.deepEqual(calls.map((call) => call.operation), [
      'camera_list',
      'camera_preview_bounds',
    ]);
    assert.deepEqual(calls[0].params.viewport_size, [640, 360]);
    assert.equal(calls[0].params.include_bounds, true);
    assert.equal(calls[1].params.camera_path, 'CameraRig');
  });
});
