import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerVisualQaTools } from '../build/tools/visual-qa.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    before_path: 'beforePath',
    after_path: 'afterPath',
    diff_output_path: 'diffOutputPath',
    source_path: 'sourcePath',
    current_path: 'currentPath',
    baseline_name: 'baselineName',
    baseline_path: 'baselinePath',
    output_path: 'outputPath',
    scene_path: 'scenePath',
    viewport_size: 'viewportSize',
    min_overlap_area: 'minOverlapArea',
    min_ratio: 'minRatio',
    threshold_ratio: 'thresholdRatio',
    pixel_threshold: 'pixelThreshold',
    camera_path: 'cameraPath',
    target_paths: 'targetPaths',
    margin: 'margin',
    include_hidden: 'includeHidden',
    delay_frames: 'delayFrames',
    viewport_index: 'viewportIndex',
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
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-visual-qa-'));
  await mkdir(join(projectPath, 'screenshots'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="VisualQA"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registry.register({
    name: 'capture_viewport',
    description: 'test runtime capture',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => jsonResponse({ status: 'success', delegated_tool: 'capture_viewport', args }),
  });
  registry.register({
    name: 'editor_screenshot',
    description: 'test editor capture',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => jsonResponse({ status: 'success', delegated_tool: 'editor_screenshot', args }),
  });
  registerVisualQaTools(registry, ctx);
  return registry;
}

test('Phase 4.4 visual QA tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'screenshot_compare',
    'capture_editor_viewport',
    'capture_runtime_viewport',
    'visual_regression_baseline_create',
    'visual_regression_check',
    'ui_overlap_check',
    'ui_contrast_check',
    'sprite_bounds_check',
    'camera_framing_check',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('screenshot_compare reports changed pixels, bounds, and writes an optional diff image', async () => {
  await withProject(async (projectPath) => {
    await writePng(join(projectPath, 'screenshots', 'before.png'), 3, 2, [
      [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255],
      [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255],
    ]);
    await writePng(join(projectPath, 'screenshots', 'after.png'), 3, 2, [
      [0, 0, 0, 255], [255, 0, 0, 255], [0, 0, 0, 255],
      [0, 0, 0, 255], [0, 0, 255, 255], [0, 0, 0, 255],
    ]);

    const registry = createRegistry();
    const response = parseResponse(await registry.dispatch('screenshot_compare', {
      project_path: projectPath,
      before_path: 'screenshots/before.png',
      after_path: 'screenshots/after.png',
      diff_output_path: '.mcp_visual/diffs/before_after.png',
      pixel_threshold: 0,
      threshold_ratio: 0.5,
    }));

    assert.equal(response.status, 'success');
    assert.equal(response.changed_pixels, 2);
    assert.equal(response.total_pixels, 6);
    assert.deepEqual(response.diff_bounds, { x: 1, y: 0, width: 1, height: 2 });
    assert.equal(response.diff_output_path, '.mcp_visual/diffs/before_after.png');
    assert.equal((await stat(join(projectPath, '.mcp_visual', 'diffs', 'before_after.png'))).isFile(), true);
  });
});

test('visual regression tools create project-local baselines and compare against them', async () => {
  await withProject(async (projectPath) => {
    await writePng(join(projectPath, 'screenshots', 'baseline.png'), 2, 2, [
      [20, 20, 20, 255], [20, 20, 20, 255],
      [20, 20, 20, 255], [20, 20, 20, 255],
    ]);
    await writePng(join(projectPath, 'screenshots', 'current.png'), 2, 2, [
      [20, 20, 20, 255], [20, 20, 20, 255],
      [20, 20, 20, 255], [200, 20, 20, 255],
    ]);

    const registry = createRegistry();
    const baseline = parseResponse(await registry.dispatch('visual_regression_baseline_create', {
      project_path: projectPath,
      baseline_name: 'main_menu',
      source_path: 'screenshots/baseline.png',
    }));
    assert.equal(baseline.status, 'success');
    assert.equal(baseline.baseline_path, '.mcp_visual/baselines/main_menu.png');

    const check = parseResponse(await registry.dispatch('visual_regression_check', {
      project_path: projectPath,
      baseline_name: 'main_menu',
      current_path: 'screenshots/current.png',
      threshold_ratio: 0,
    }));
    assert.equal(check.status, 'failed');
    assert.equal(check.changed_pixels, 1);
    assert.equal(check.regression, true);
    assert.equal(check.baseline_path, '.mcp_visual/baselines/main_menu.png');
  });
});

test('UI overlap and contrast checks report obvious geometry and color issues', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        assert.equal(operation, 'ui_inspect_layout');
        return {
          stdout: JSON.stringify({
            success: true,
            scene_path: params.scene_path,
            viewport_size: params.viewport_size,
            controls: [
              { path: '.', type: 'Control', visible: true, rect: { x: 0, y: 0, width: 320, height: 180 } },
              { path: 'ButtonA', type: 'Button', visible: true, text: 'A', rect: { x: 10, y: 10, width: 100, height: 40 } },
              { path: 'ButtonB', type: 'Button', visible: true, text: 'B', rect: { x: 50, y: 20, width: 120, height: 40 } },
            ],
          }) + '\n',
          stderr: '',
        };
      },
    }));

    const overlap = parseResponse(await registry.dispatch('ui_overlap_check', {
      project_path: projectPath,
      scene_path: 'res://ui/menu.tscn',
      viewport_size: [320, 180],
      min_overlap_area: 50,
    }));
    assert.equal(overlap.status, 'failed');
    assert.equal(overlap.issue_count, 1);
    assert.deepEqual(overlap.issues[0].controls, ['ButtonA', 'ButtonB']);

    const contrast = parseResponse(await registry.dispatch('ui_contrast_check', {
      project_path: projectPath,
      scene_path: 'res://ui/menu.tscn',
      samples: [
        { path: 'DimLabel', foreground: '#777777', background: '#777777' },
        { path: 'ReadableLabel', foreground: '#ffffff', background: '#111111' },
      ],
      min_ratio: 4.5,
    }));
    assert.equal(contrast.status, 'failed');
    assert.equal(contrast.issue_count, 1);
    assert.equal(contrast.issues[0].path, 'DimLabel');
  });
});

test('sprite bounds and camera framing tools delegate to Godot visual operations', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        const payload = operation === 'visual_sprite_bounds_check'
          ? { success: true, valid: false, issue_count: 1, issues: [{ kind: 'sprite_outside_viewport', path: 'HeroSprite' }] }
          : { success: true, valid: false, issue_count: 1, issues: [{ kind: 'target_outside_camera', path: 'Enemy' }] };
        return { stdout: JSON.stringify(payload) + '\n', stderr: '' };
      },
    }));

    const sprite = parseResponse(await registry.dispatch('sprite_bounds_check', {
      project_path: projectPath,
      scene_path: 'res://level.tscn',
      viewport_size: [640, 360],
      margin: 8,
    }));
    const camera = parseResponse(await registry.dispatch('camera_framing_check', {
      project_path: projectPath,
      scene_path: 'res://level.tscn',
      camera_path: 'Camera2D',
      target_paths: ['Enemy'],
      viewport_size: [640, 360],
      margin: 16,
    }));

    assert.deepEqual(calls.map((call) => call.operation), ['visual_sprite_bounds_check', 'visual_camera_framing_check']);
    assert.equal(calls[0].params.margin, 8);
    assert.deepEqual(calls[1].params.target_paths, ['Enemy']);
    assert.equal(sprite.status, 'failed');
    assert.equal(camera.status, 'failed');
  });
});

test('capture wrappers delegate to existing editor and runtime capture tools', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const runtime = parseResponse(await registry.dispatch('capture_runtime_viewport', {
      project_path: projectPath,
      scene_path: 'res://main.tscn',
      output_path: '.mcp_visual/captures/runtime.png',
      width: 320,
      height: 180,
    }));
    assert.equal(runtime.status, 'success');
    assert.equal(runtime.delegated_tool, 'capture_viewport');
    assert.equal(runtime.args.output_path, '.mcp_visual/captures/runtime.png');

    const editor = parseResponse(await registry.dispatch('capture_editor_viewport', {
      project_path: projectPath,
      output_path: '.mcp_visual/captures/editor.png',
      viewport: '2d',
    }));
    assert.equal(editor.status, 'success');
    assert.equal(editor.delegated_tool, 'editor_screenshot');
    assert.equal(editor.args.output_path, '.mcp_visual/captures/editor.png');
  });
});

test('visual QA GDScript module owns Phase 4.4 handlers', async () => {
  const runner = await readFile(join(process.cwd(), 'src/scripts/godot_operations.gd'), 'utf8');
  const registry = await readFile(join(process.cwd(), 'src/scripts/godot_ops/operation_registry.gd'), 'utf8');
  const source = await readFile(join(process.cwd(), 'src/scripts/godot_ops/visual_qa_ops.gd'), 'utf8');
  assert.match(runner, /OperationRegistry/);
  assert.match(registry, /VisualQaOps/);
  for (const operation of [
    'visual_sprite_bounds_check',
    'visual_camera_framing_check',
  ]) {
    assert.match(source, new RegExp(`func ${operation}\\(params: Dictionary\\) -> void:`));
  }
});

function jsonResponse(data, isError = false) {
  const response = { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  if (isError) response.isError = true;
  return response;
}

async function writePng(path, width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = pixels[y * width + x];
      const target = rowStart + 1 + x * 4;
      raw[target] = source[0];
      raw[target + 1] = source[1];
      raw[target + 2] = source[2];
      raw[target + 3] = source[3];
    }
  }

  const chunks = [
    pngChunk('IHDR', Buffer.from([
      ...u32(width),
      ...u32(height),
      8,
      6,
      0,
      0,
      0,
    ])),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ];
  await writeFile(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]));
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([
    Buffer.from(u32(data.length)),
    typeBuffer,
    data,
    Buffer.from(u32(crc32(crcInput))),
  ]);
}

function u32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
