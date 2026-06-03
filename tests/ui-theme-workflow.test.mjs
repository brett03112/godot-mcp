import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerUiThemeWorkflowTools } from '../build/tools/ui-theme-workflow.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    output_path: 'outputPath',
    root_name: 'rootName',
    root_size: 'rootSize',
    scene_path: 'scenePath',
    node_path: 'nodePath',
    keep_offsets: 'keepOffsets',
    override_type: 'overrideType',
    theme_path: 'themePath',
    theme_type: 'themeType',
    bg_color: 'bgColor',
    border_color: 'borderColor',
    border_width: 'borderWidth',
    corner_radius: 'cornerRadius',
    content_margin: 'contentMargin',
    viewport_size: 'viewportSize',
    safe_margin: 'safeMargin',
    min_touch_size: 'minTouchSize',
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
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-ui-theme-'));
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await mkdir(join(projectPath, 'resources'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="UITheme"\n');
  await writeFile(join(projectPath, 'scenes', 'menu.tscn'), [
    '[gd_scene load_steps=1 format=3]',
    '',
    '[node name="Menu" type="Control"]',
    'layout_mode = 3',
    'anchors_preset = 15',
    'anchor_right = 1.0',
    'anchor_bottom = 1.0',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'resources', 'theme.tres'), [
    '[gd_resource type="Theme" format=3]',
    '',
    '[resource]',
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
  registerUiThemeWorkflowTools(registry, ctx);
  return registry;
}

test('UI and theme workflow tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'create_ui_layout',
    'draw_ui_recipe',
    'set_control_anchor_preset',
    'set_control_offsets',
    'set_control_text',
    'set_control_theme_override',
    'create_theme',
    'theme_set_color',
    'theme_set_constant',
    'theme_set_font_size',
    'theme_set_stylebox_flat',
    'apply_theme',
    'inspect_ui_layout',
    'validate_ui_safe_area',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('layout creation tools dispatch declarative UI payloads', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params, projectDir) => {
        calls.push({ operation, params, projectDir });
        return { stdout: JSON.stringify({ success: true, operation, scene_path: params.output_path }) + '\n', stderr: '' };
      },
    }));

    await registry.dispatch('create_ui_layout', {
      project_path: projectPath,
      output_path: 'scenes/generated_menu.tscn',
      root_name: 'GeneratedMenu',
      root_size: [960, 540],
      controls: [{ type: 'Button', name: 'PlayButton', text: 'Play' }],
    });
    await registry.dispatch('draw_ui_recipe', {
      project_path: projectPath,
      output_path: 'scenes/pause_menu.tscn',
      recipe: 'pause_menu',
      title: 'Paused',
      buttons: ['Resume', 'Settings', 'Quit'],
      theme_path: 'resources/theme.tres',
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'ui_create_layout',
      'ui_draw_recipe',
    ]);
    assert.equal(calls[0].params.root_name, 'GeneratedMenu');
    assert.deepEqual(calls[0].params.root_size, [960, 540]);
    assert.equal(calls[0].params.controls[0].text, 'Play');
    assert.equal(calls[1].params.recipe, 'pause_menu');
    assert.deepEqual(calls[1].params.buttons, ['Resume', 'Settings', 'Quit']);
    assert.equal(calls.every((call) => call.projectDir === projectPath), true);
  });
});

test('control mutation tools map scene parameters', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return { stdout: JSON.stringify({ success: true, operation }) + '\n', stderr: '' };
      },
    }));

    await registry.dispatch('set_control_anchor_preset', {
      project_path: projectPath,
      scene_path: 'scenes/menu.tscn',
      node_path: '.',
      preset: 'full_rect',
      keep_offsets: false,
    });
    await registry.dispatch('set_control_offsets', {
      project_path: projectPath,
      scene_path: 'scenes/menu.tscn',
      node_path: 'PlayButton',
      left: 10,
      top: 20,
      right: 210,
      bottom: 76,
    });
    await registry.dispatch('set_control_text', {
      project_path: projectPath,
      scene_path: 'scenes/menu.tscn',
      node_path: 'PlayButton',
      text: 'Begin',
    });
    await registry.dispatch('set_control_theme_override', {
      project_path: projectPath,
      scene_path: 'scenes/menu.tscn',
      node_path: 'PlayButton',
      override_type: 'color',
      name: 'font_color',
      value: '#ffffff',
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'ui_set_control_anchor_preset',
      'ui_set_control_offsets',
      'ui_set_control_text',
      'ui_set_control_theme_override',
    ]);
    assert.equal(calls[0].params.preset, 'full_rect');
    assert.equal(calls[0].params.keep_offsets, false);
    assert.equal(calls[1].params.right, 210);
    assert.equal(calls[2].params.text, 'Begin');
    assert.equal(calls[3].params.override_type, 'color');
  });
});

test('theme tools map Theme and StyleBoxFlat payloads', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return { stdout: JSON.stringify({ success: true, operation, theme_path: params.theme_path || params.output_path }) + '\n', stderr: '' };
      },
    }));

    await registry.dispatch('create_theme', {
      project_path: projectPath,
      output_path: 'resources/generated_theme.tres',
      default_font_size: 18,
    });
    await registry.dispatch('theme_set_color', {
      project_path: projectPath,
      theme_path: 'resources/generated_theme.tres',
      theme_type: 'Button',
      name: 'font_color',
      color: '#f0f0f0',
    });
    await registry.dispatch('theme_set_constant', {
      project_path: projectPath,
      theme_path: 'resources/generated_theme.tres',
      theme_type: 'Button',
      name: 'h_separation',
      value: 12,
    });
    await registry.dispatch('theme_set_font_size', {
      project_path: projectPath,
      theme_path: 'resources/generated_theme.tres',
      theme_type: 'Label',
      name: 'font_size',
      size: 24,
    });
    await registry.dispatch('theme_set_stylebox_flat', {
      project_path: projectPath,
      theme_path: 'resources/generated_theme.tres',
      theme_type: 'Panel',
      name: 'panel',
      bg_color: '#20242a',
      border_color: '#6bd4ff',
      border_width: 2,
      corner_radius: 6,
      content_margin: 10,
    });
    await registry.dispatch('apply_theme', {
      project_path: projectPath,
      scene_path: 'scenes/menu.tscn',
      node_path: '.',
      theme_path: 'resources/generated_theme.tres',
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'ui_create_theme',
      'ui_theme_set_color',
      'ui_theme_set_constant',
      'ui_theme_set_font_size',
      'ui_theme_set_stylebox_flat',
      'ui_apply_theme',
    ]);
    assert.equal(calls[0].params.default_font_size, 18);
    assert.equal(calls[1].params.color, '#f0f0f0');
    assert.equal(calls[2].params.value, 12);
    assert.equal(calls[3].params.size, 24);
    assert.equal(calls[4].params.border_width, 2);
    assert.equal(calls[5].params.theme_path, 'resources/generated_theme.tres');
  });
});

test('inspection and validation tools dispatch viewport constraints', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return { stdout: JSON.stringify({ success: true, operation, issues: [] }) + '\n', stderr: '' };
      },
    }));

    const inspect = parseResponse(await registry.dispatch('inspect_ui_layout', {
      project_path: projectPath,
      scene_path: 'scenes/menu.tscn',
      viewport_size: [1024, 576],
    }));
    const validate = parseResponse(await registry.dispatch('validate_ui_safe_area', {
      project_path: projectPath,
      scene_path: 'scenes/menu.tscn',
      viewport_size: [1024, 576],
      safe_margin: 24,
      min_touch_size: [44, 44],
    }));

    assert.equal(inspect.status, 'success');
    assert.equal(validate.status, 'success');
    assert.deepEqual(calls.map((call) => call.operation), [
      'ui_inspect_layout',
      'ui_validate_safe_area',
    ]);
    assert.deepEqual(calls[0].params.viewport_size, [1024, 576]);
    assert.equal(calls[1].params.safe_margin, 24);
    assert.deepEqual(calls[1].params.min_touch_size, [44, 44]);
  });
});
