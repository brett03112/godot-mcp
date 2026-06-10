import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveAddonInstallerTools } from '../build/tools/live-addon-installer.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    source_path: 'sourcePath',
    dry_run: 'dryRun',
    godot_version: 'godotVersion',
    remove_files: 'removeFiles',
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
    executeOperation: async () => ({ stdout: '{}\n', stderr: '' }),
    normalizeParameters,
    convertCamelToSnakeCase: (params) => params,
    parseGodotErrors: () => [],
    formatTresValue: (value) => String(value),
    generateUID: () => 'uid://test',
    generateShortUID: () => 'testuid',
    isGodot44OrLater: (version) => /^4\.(?:[4-9]|\d{2,})/.test(String(version)),
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

function createRegistry(ctx = createContext(), options = {}) {
  const registry = new ToolRegistry();
  registerLiveAddonInstallerTools(registry, ctx, options);
  return registry;
}

async function createSourceAddon(root, version = '0.1.0', scriptText = '@tool\nextends EditorPlugin\n') {
  const sourcePath = join(root, 'source', 'godot_mcp_live');
  await mkdir(sourcePath, { recursive: true });
  await writeFile(join(sourcePath, 'plugin.cfg'), [
    '[plugin]',
    'name="Godot MCP Live"',
    'description="Live editor bridge skeleton for Godot MCP sessions."',
    'author="Godot MCP"',
    `version="${version}"`,
    'script="godot_mcp_live.gd"',
    '',
  ].join('\n'));
  await writeFile(join(sourcePath, 'godot_mcp_live.gd'), scriptText);
  await writeFile(join(sourcePath, 'session_state.gd'), 'class_name GodotMCPLiveSessionState\nextends RefCounted\n');
  return sourcePath;
}

async function withProject(fn) {
  const root = await mkdtemp(join(tmpdir(), 'godot-mcp-live-addon-'));
  const projectPath = join(root, 'project');
  await mkdir(projectPath, { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), [
    '[application]',
    'config/name="LiveAddonInstaller"',
    '',
  ].join('\n'));
  try {
    await fn({ root, projectPath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('Phase 5.2 live addon installer tools register with the tool registry', async () => {
  const registry = createRegistry();
  for (const toolName of [
    'live_addon_install',
    'live_addon_update',
    'live_addon_remove',
    'live_addon_status',
    'live_addon_enable',
    'live_addon_disable',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('live addon install, enable, disable, and remove manage project files', async () => {
  await withProject(async ({ root, projectPath }) => {
    const sourcePath = await createSourceAddon(root);
    const registry = createRegistry(createContext(), { addonSourcePath: sourcePath });

    const installed = parseResponse(await registry.dispatch('live_addon_install', {
      project_path: projectPath,
      enable: true,
      godot_version: '4.6.3',
    }));
    assert.equal(installed.status, 'success');
    assert.equal(installed.addon_id, 'godot_mcp_live');
    assert.equal(installed.enabled, true);
    assert.equal(installed.compatibility.compatible, true);
    assert.equal((await stat(join(projectPath, 'addons', 'godot_mcp_live', 'plugin.cfg'))).isFile(), true);
    assert.match(await readFile(join(projectPath, 'project.godot'), 'utf8'), /addons\/godot_mcp_live\/plugin\.cfg/);

    const disabled = parseResponse(await registry.dispatch('live_addon_disable', {
      project_path: projectPath,
    }));
    assert.equal(disabled.status, 'success');
    assert.equal(disabled.enabled, false);
    assert.doesNotMatch(await readFile(join(projectPath, 'project.godot'), 'utf8'), /addons\/godot_mcp_live\/plugin\.cfg/);

    const enabled = parseResponse(await registry.dispatch('live_addon_enable', {
      project_path: projectPath,
    }));
    assert.equal(enabled.status, 'success');
    assert.equal(enabled.enabled, true);

    const removed = parseResponse(await registry.dispatch('live_addon_remove', {
      project_path: projectPath,
    }));
    assert.equal(removed.status, 'success');
    assert.equal(removed.removed_files, true);
    assert.doesNotMatch(await readFile(join(projectPath, 'project.godot'), 'utf8'), /addons\/godot_mcp_live\/plugin\.cfg/);
  });
});

test('live addon status detects update availability and Godot 4.6 compatibility', async () => {
  await withProject(async ({ root, projectPath }) => {
    const sourcePath = await createSourceAddon(root, '0.1.0', '@tool\nextends EditorPlugin\nvar source_version = 1\n');
    const registry = createRegistry(createContext(), { addonSourcePath: sourcePath });

    const missing = parseResponse(await registry.dispatch('live_addon_status', {
      project_path: projectPath,
      godot_version: '4.5.0',
    }));
    assert.equal(missing.installed, false);
    assert.equal(missing.compatibility.compatible, false);
    assert.match(missing.compatibility.reason, /4\.6/);

    await registry.dispatch('live_addon_install', { project_path: projectPath });
    let current = parseResponse(await registry.dispatch('live_addon_status', {
      project_path: projectPath,
      godot_version: '4.6.3',
    }));
    assert.equal(current.installed, true);
    assert.equal(current.up_to_date, true);
    assert.equal(current.source_manifest.file_count, current.installed_manifest.file_count);

    await writeFile(join(sourcePath, 'godot_mcp_live.gd'), '@tool\nextends EditorPlugin\nvar source_version = 2\n');
    current = parseResponse(await registry.dispatch('live_addon_status', {
      project_path: projectPath,
      godot_version: '4.6.3',
    }));
    assert.equal(current.up_to_date, false);
    assert.equal(current.update_available, true);

    const updated = parseResponse(await registry.dispatch('live_addon_update', {
      project_path: projectPath,
    }));
    assert.equal(updated.status, 'success');
    assert.equal(updated.up_to_date, true);
  });
});

test('live addon dry-run reports planned changes without mutating project', async () => {
  await withProject(async ({ root, projectPath }) => {
    const sourcePath = await createSourceAddon(root);
    const registry = createRegistry(createContext(), { addonSourcePath: sourcePath });

    const dryRun = parseResponse(await registry.dispatch('live_addon_install', {
      project_path: projectPath,
      enable: true,
      dry_run: true,
    }));
    assert.equal(dryRun.status, 'dry_run');
    assert.equal(dryRun.planned_files.length >= 2, true);

    await assert.rejects(stat(join(projectPath, 'addons', 'godot_mcp_live', 'plugin.cfg')));
    assert.doesNotMatch(await readFile(join(projectPath, 'project.godot'), 'utf8'), /editor_plugins/);
  });
});
