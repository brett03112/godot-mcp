import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerAddonToolManagerTools } from '../build/tools/addon-tool-manager.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    asset_id: 'assetId',
    api_base_url: 'apiBaseUrl',
    download_url: 'downloadUrl',
    source_directory: 'sourceDirectory',
    addon_id: 'addonId',
    addon_ids: 'addonIds',
    dry_run: 'dryRun',
    auto_enable: 'autoEnable',
    allow_network_install: 'allowNetworkInstall',
    remove_files: 'removeFiles',
    include_health: 'includeHealth',
    include_adapters: 'includeAdapters',
    tool_id: 'toolId',
    executable_path: 'executablePath',
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

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerAddonToolManagerTools(registry, ctx);
  return registry;
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-addon-manager-'));
  await mkdir(join(projectPath, 'addons', 'gut'), { recursive: true });
  await mkdir(join(projectPath, 'addons', 'dialogic'), { recursive: true });
  await mkdir(join(projectPath, 'addons', 'broken_addon'), { recursive: true });
  await mkdir(join(projectPath, 'tools'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), [
    '[application]',
    'config/name="AddonManager"',
    '',
    '[editor_plugins]',
    '',
    'enabled=PackedStringArray("res://addons/gut/plugin.cfg")',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'addons', 'gut', 'plugin.cfg'), [
    '[plugin]',
    'name="GUT"',
    'description="Testing framework"',
    'author="bitwes"',
    'version="9.5.0"',
    'script="plugin.gd"',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'addons', 'gut', 'plugin.gd'), '@tool\nextends EditorPlugin\n');
  await writeFile(join(projectPath, 'addons', 'gut', 'gut_cmdln.gd'), 'extends SceneTree\n');
  await writeFile(join(projectPath, 'addons', 'dialogic', 'plugin.cfg'), [
    '[plugin]',
    'name="Dialogic"',
    'description="Dialogue editor"',
    'author="Dialogic Team"',
    'version="2.0"',
    'script="plugin.gd"',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'addons', 'dialogic', 'plugin.gd'), '@tool\nextends EditorPlugin\n');
  await writeFile(join(projectPath, 'addons', 'broken_addon', 'plugin.cfg'), [
    '[plugin]',
    'name="Broken Addon"',
    'script="missing.gd"',
    '',
  ].join('\n'));
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

async function withAssetApi(asset, fn) {
  const server = createServer((request, response) => {
    if (request.url === `/asset/${asset.asset_id}`) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(asset));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createSourceAddon(root, addonId, version) {
  const sourceRoot = join(root, `source-${addonId}-${version}`);
  await mkdir(join(sourceRoot, 'addons', addonId), { recursive: true });
  await writeFile(join(sourceRoot, 'addons', addonId, 'plugin.cfg'), [
    '[plugin]',
    `name="${addonId}"`,
    'description="Phase 4.6 fixture addon"',
    'author="Fixture"',
    `version="${version}"`,
    'script="plugin.gd"',
    '',
  ].join('\n'));
  await writeFile(join(sourceRoot, 'addons', addonId, 'plugin.gd'), '@tool\nextends EditorPlugin\n');
  return sourceRoot;
}

test('Phase 4.6 addon and external tool manager tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'asset_library_get_details',
    'asset_library_install_addon',
    'asset_library_update_addon',
    'asset_library_remove_addon',
    'addon_enable',
    'addon_disable',
    'addon_list',
    'addon_health_check',
    'external_tool_status',
    'external_tool_configure',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('asset_library_get_details normalizes Asset Library metadata', async () => {
  const registry = createRegistry();
  await withAssetApi({
    asset_id: 123,
    title: 'Dialogic',
    author: 'Dialogic Team',
    version_string: '2.0',
    godot_version: '4.4',
    category: 'Tools',
    download_url: 'https://example.test/dialogic.zip',
    browse_url: 'https://godotengine.org/asset-library/asset/123',
  }, async (apiBaseUrl) => {
    const details = parseResponse(await registry.dispatch('asset_library_get_details', {
      asset_id: 123,
      api_base_url: apiBaseUrl,
    }));
    assert.equal(details.status, 'success');
    assert.equal(details.asset.asset_id, 123);
    assert.equal(details.asset.title, 'Dialogic');
    assert.equal(details.asset.download_url, 'https://example.test/dialogic.zip');
    assert.equal(details.install_plan.tool, 'asset_library_install_addon');
  });
});

test('addon list, enable, disable, and health checks read plugin.cfg and project.godot state', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const listed = parseResponse(await registry.dispatch('addon_list', {
      project_path: projectPath,
      include_health: true,
    }));
    assert.equal(listed.status, 'success');
    assert.equal(listed.addons.find((addon) => addon.id === 'gut').enabled, true);
    assert.equal(listed.addons.find((addon) => addon.id === 'dialogic').enabled, false);
    assert.equal(listed.addons.find((addon) => addon.id === 'broken_addon').health.status, 'failed');

    const disabled = parseResponse(await registry.dispatch('addon_disable', {
      project_path: projectPath,
      addon_id: 'gut',
    }));
    assert.equal(disabled.status, 'success');
    assert.equal(disabled.enabled, false);
    assert.doesNotMatch(await readFile(join(projectPath, 'project.godot'), 'utf8'), /addons\/gut\/plugin\.cfg/);

    const enabled = parseResponse(await registry.dispatch('addon_enable', {
      project_path: projectPath,
      addon_id: 'dialogic',
    }));
    assert.equal(enabled.status, 'success');
    assert.equal(enabled.enabled, true);
    assert.match(await readFile(join(projectPath, 'project.godot'), 'utf8'), /addons\/dialogic\/plugin\.cfg/);

    const health = parseResponse(await registry.dispatch('addon_health_check', {
      project_path: projectPath,
      addon_id: 'dialogic',
    }));
    assert.equal(health.status, 'success');
    assert.equal(health.addons[0].checks.some((check) => check.name === 'script_exists' && check.ok), true);
  });
});

test('asset library install, update, and remove manage project-local addon folders safely', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const sourceV1 = await createSourceAddon(projectPath, 'phase46_plugin', '1.0.0');
    const sourceV2 = await createSourceAddon(projectPath, 'phase46_plugin', '1.1.0');

    const installed = parseResponse(await registry.dispatch('asset_library_install_addon', {
      project_path: projectPath,
      source_directory: sourceV1,
      addon_ids: ['phase46_plugin'],
      auto_enable: true,
    }));
    assert.equal(installed.status, 'success');
    assert.equal(installed.installed_addons[0].id, 'phase46_plugin');
    assert.equal((await stat(join(projectPath, 'addons', 'phase46_plugin', 'plugin.cfg'))).isFile(), true);
    assert.match(await readFile(join(projectPath, 'project.godot'), 'utf8'), /addons\/phase46_plugin\/plugin\.cfg/);

    const updated = parseResponse(await registry.dispatch('asset_library_update_addon', {
      project_path: projectPath,
      source_directory: sourceV2,
      addon_ids: ['phase46_plugin'],
    }));
    assert.equal(updated.status, 'success');
    const listed = parseResponse(await registry.dispatch('addon_list', { project_path: projectPath }));
    assert.equal(listed.addons.find((addon) => addon.id === 'phase46_plugin').version, '1.1.0');

    const removed = parseResponse(await registry.dispatch('asset_library_remove_addon', {
      project_path: projectPath,
      addon_id: 'phase46_plugin',
    }));
    assert.equal(removed.status, 'success');
    assert.equal(removed.removed_files, true);
    assert.doesNotMatch(await readFile(join(projectPath, 'project.godot'), 'utf8'), /addons\/phase46_plugin\/plugin\.cfg/);
  });
});

test('external tool status and configure expose optional adapter definitions', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const initial = parseResponse(await registry.dispatch('external_tool_status', {
      project_path: projectPath,
      include_adapters: true,
    }));
    assert.equal(initial.status, 'success');
    for (const toolId of ['gut', 'gdunit4', 'godot_jolt', 'dialogic', 'limboai', 'aseprite', 'blender', 'ldtk_tiled']) {
      assert.equal(initial.tools.some((tool) => tool.tool_id === toolId), true, toolId);
    }
    assert.equal(initial.tools.find((tool) => tool.tool_id === 'gut').addon_installed, true);

    const blenderPath = join(projectPath, 'tools', 'blender.exe');
    await writeFile(blenderPath, 'fixture');
    const configured = parseResponse(await registry.dispatch('external_tool_configure', {
      project_path: projectPath,
      tool_id: 'blender',
      executable_path: blenderPath,
      args: ['--background'],
      enabled: true,
      metadata: { source: 'test' },
    }));
    assert.equal(configured.status, 'success');
    assert.equal(configured.config.tool_id, 'blender');
    assert.equal((await stat(join(projectPath, '.godot-mcp', 'external_tools.json'))).isFile(), true);

    const status = parseResponse(await registry.dispatch('external_tool_status', {
      project_path: projectPath,
      tool_id: 'blender',
    }));
    assert.equal(status.tools[0].configured, true);
    assert.equal(status.tools[0].enabled, true);
    assert.equal(status.tools[0].executable_exists, true);
  });
});
