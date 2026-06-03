import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerProjectFilesystemTools } from '../build/tools/project-filesystem.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    setting_path: 'settingPath',
    setting_paths: 'settingPaths',
    setting_value: 'settingValue',
    dry_run: 'dryRun',
    allowed_settings: 'allowedSettings',
    singleton_name: 'singletonName',
    resource_path: 'resourcePath',
    include_disabled: 'includeDisabled',
    scan_paths: 'scanPaths',
    include_patterns: 'includePatterns',
    exclude_patterns: 'excludePatterns',
    class_name: 'className',
    resource_type: 'resourceType',
    text_query: 'textQuery',
    max_results: 'maxResults',
    import_paths: 'importPaths',
    wait_for_completion: 'waitForCompletion',
    uid_or_path: 'uidOrPath',
  };

  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return params;
    }

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
    createErrorResponse: (message) => ({
      content: [{ type: 'text', text: message }],
      isError: true,
    }),
    validatePath: (path) => Boolean(path) && !path.includes('..'),
    executeOperation: async () => ({ stdout: '', stderr: '' }),
    normalizeParameters,
    convertCamelToSnakeCase: (params) => params,
    parseGodotErrors: () => [],
    formatTresValue: (value) => JSON.stringify(value),
    generateUID: () => 'uid://test',
    generateShortUID: () => 'testuid',
    isGodot44OrLater: () => true,
    getGodotPath: options.getGodotPath || (async () => 'godot'),
    formatProjectSettingValue: (value) => {
      if (typeof value === 'string') return JSON.stringify(value);
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      return String(value);
    },
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
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-pfs-'));
  await mkdir(join(projectPath, 'scripts'), { recursive: true });
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await mkdir(join(projectPath, 'resources'), { recursive: true });
  await mkdir(join(projectPath, 'assets'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), [
    'config_version=5',
    '',
    '[application]',
    'config/name="Phase13"',
    'run/main_scene="res://scenes/main.tscn"',
    '',
    '[autoload]',
    'GameState="*res://scripts/game_state.gd"',
    'DisabledService="res://scripts/disabled_service.gd"',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'scripts', 'game_state.gd'), 'class_name GameState\nextends Node\nconst ICON = preload("res://assets/icon.svg")\n');
  await writeFile(join(projectPath, 'scripts', 'game_state.gd.uid'), 'uid://game_state_uid\n');
  await writeFile(join(projectPath, 'scripts', 'disabled_service.gd'), 'extends Node\n');
  await writeFile(join(projectPath, 'scripts', 'unused.gd'), 'class_name UnusedScript\nextends Node\n');
  await writeFile(join(projectPath, 'scenes', 'main.tscn'), [
    '[gd_scene load_steps=2 format=3 uid="uid://main_scene_uid"]',
    '',
    '[ext_resource type="Script" path="res://scripts/game_state.gd" id="1_state"]',
    '',
    '[node name="Main" type="Node"]',
    'script = ExtResource("1_state")',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'resources', 'theme.tres'), '[gd_resource type="Theme" format=3 uid="uid://theme_uid"]\n\n[resource]\n');
  await writeFile(join(projectPath, 'assets', 'icon.svg'), '<svg><!-- player icon --></svg>');
  await writeFile(join(projectPath, 'assets', 'icon.svg.import'), '[remap]\nimporter="svg"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerProjectFilesystemTools(registry, ctx);
  return registry;
}

test('project filesystem tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'project_settings_get',
    'project_settings_set',
    'autoload_list',
    'autoload_add',
    'autoload_remove',
    'filesystem_search',
    'filesystem_reimport',
    'filesystem_scan',
    'uid_resolve',
    'dependency_graph',
    'find_orphaned_assets',
    'find_missing_uid_files',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('project_settings_get reads requested settings and project metadata', async () => {
  await withProject(async (projectPath) => {
    const response = await createRegistry().dispatch('project_settings_get', {
      project_path: projectPath,
      setting_paths: ['application/config/name', 'application/run/main_scene'],
    });

    const data = parseResponse(response);
    assert.equal(data.status, 'success');
    assert.equal(data.settings['application/config/name'].value, 'Phase13');
    assert.equal(data.settings['application/run/main_scene'].value, 'res://scenes/main.tscn');
  });
});

test('project_settings_set supports dry run and allowlist rejection', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const original = await readFile(join(projectPath, 'project.godot'), 'utf8');

    const blocked = await registry.dispatch('project_settings_set', {
      project_path: projectPath,
      setting_path: 'rendering/renderer/rendering_method',
      setting_value: 'mobile',
      allowed_settings: ['application/config/name'],
    });
    const blockedData = parseResponse(blocked);
    assert.equal(blocked.isError, true);
    assert.match(blockedData.reason, /not in allowed_settings/);

    const dryRun = await registry.dispatch('project_settings_set', {
      project_path: projectPath,
      setting_path: 'application/config/name',
      setting_value: 'DryRunName',
      dry_run: true,
      allowed_settings: ['application/config/name'],
    });
    const dryRunData = parseResponse(dryRun);
    assert.equal(dryRunData.status, 'dry_run');
    assert.match(dryRunData.diff, /DryRunName/);
    assert.equal(await readFile(join(projectPath, 'project.godot'), 'utf8'), original);

    const write = await registry.dispatch('project_settings_set', {
      project_path: projectPath,
      setting_path: 'application/config/name',
      setting_value: 'WrittenName',
      allowed_settings: ['application/config/name'],
    });
    const writeData = parseResponse(write);
    assert.equal(writeData.status, 'success');
    assert.match(await readFile(join(projectPath, 'project.godot'), 'utf8'), /config\/name="WrittenName"/);
  });
});

test('autoload tools list, add, and remove singleton entries', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const list = parseResponse(await registry.dispatch('autoload_list', { project_path: projectPath }));
    assert.deepEqual(list.autoloads.map((entry) => [entry.name, entry.enabled]), [
      ['GameState', true],
      ['DisabledService', false],
    ]);

    const add = parseResponse(await registry.dispatch('autoload_add', {
      project_path: projectPath,
      singleton_name: 'AudioBus',
      resource_path: 'res://scripts/audio_bus.gd',
      enabled: true,
    }));
    assert.equal(add.status, 'success');
    assert.match(await readFile(join(projectPath, 'project.godot'), 'utf8'), /AudioBus="\*res:\/\/scripts\/audio_bus\.gd"/);

    const remove = parseResponse(await registry.dispatch('autoload_remove', {
      project_path: projectPath,
      singleton_name: 'AudioBus',
    }));
    assert.equal(remove.status, 'success');
    assert.doesNotMatch(await readFile(join(projectPath, 'project.godot'), 'utf8'), /AudioBus=/);
  });
});

test('filesystem_search finds files by glob, class name, resource type, and text', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const glob = parseResponse(await registry.dispatch('filesystem_search', {
      project_path: projectPath,
      glob: '**/*.gd',
    }));
    assert.ok(glob.matches.some((match) => match.path === 'res://scripts/game_state.gd'));

    const className = parseResponse(await registry.dispatch('filesystem_search', {
      project_path: projectPath,
      class_name: 'GameState',
    }));
    assert.equal(className.matches[0].path, 'res://scripts/game_state.gd');

    const resourceType = parseResponse(await registry.dispatch('filesystem_search', {
      project_path: projectPath,
      resource_type: 'Theme',
    }));
    assert.equal(resourceType.matches[0].path, 'res://resources/theme.tres');

    const text = parseResponse(await registry.dispatch('filesystem_search', {
      project_path: projectPath,
      text_query: 'player icon',
    }));
    assert.equal(text.matches[0].path, 'res://assets/icon.svg');
  });
});

test('filesystem_scan summarizes project files and filesystem_reimport wires Godot import command', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry(createContext({ getGodotPath: async () => process.execPath }));

    const scan = parseResponse(await registry.dispatch('filesystem_scan', { project_path: projectPath }));
    assert.equal(scan.status, 'success');
    assert.ok(scan.total_files >= 8);
    assert.ok(scan.by_extension['.gd'] >= 3);

    const reimport = parseResponse(await registry.dispatch('filesystem_reimport', {
      project_path: projectPath,
      import_paths: ['res://assets/icon.svg'],
      wait_for_completion: true,
      dry_run: true,
    }));
    assert.equal(reimport.status, 'dry_run');
    assert.deepEqual(reimport.import_paths, ['res://assets/icon.svg']);
    assert.match(reimport.command.join(' '), /--import/);
  });
});

test('uid_resolve maps UID files, resource paths, and embedded resource UIDs', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const byUid = parseResponse(await registry.dispatch('uid_resolve', {
      project_path: projectPath,
      uid_or_path: 'uid://game_state_uid',
    }));
    assert.equal(byUid.status, 'success');
    assert.equal(byUid.matches[0].path, 'res://scripts/game_state.gd');

    const byPath = parseResponse(await registry.dispatch('uid_resolve', {
      project_path: projectPath,
      uid_or_path: 'res://resources/theme.tres',
    }));
    assert.equal(byPath.uid, 'uid://theme_uid');
  });
});

test('dependency_graph, find_orphaned_assets, and find_missing_uid_files report project relationships', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const graph = parseResponse(await registry.dispatch('dependency_graph', { project_path: projectPath }));
    assert.ok(graph.edges.some((edge) => edge.from === 'res://scenes/main.tscn' && edge.to === 'res://scripts/game_state.gd'));
    assert.ok(graph.edges.some((edge) => edge.from === 'res://scripts/game_state.gd' && edge.to === 'res://assets/icon.svg'));

    const orphaned = parseResponse(await registry.dispatch('find_orphaned_assets', { project_path: projectPath }));
    assert.ok(orphaned.orphaned_assets.some((asset) => asset.path === 'res://scripts/unused.gd'));
    assert.ok(!orphaned.orphaned_assets.some((asset) => asset.path === 'res://scripts/game_state.gd'));

    const missing = parseResponse(await registry.dispatch('find_missing_uid_files', { project_path: projectPath }));
    assert.ok(missing.missing_uid_files.some((entry) => entry.path === 'res://scripts/unused.gd'));
    assert.ok(!missing.missing_uid_files.some((entry) => entry.path === 'res://scripts/game_state.gd'));
  });
});
