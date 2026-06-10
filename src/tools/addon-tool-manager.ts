/**
 * Addon and external tool manager tools for Phase 4.6.
 */

import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';
import { spawnSync } from 'child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { tmpdir } from 'os';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

interface ResolvedProject {
  projectRoot: string;
  projectFile: string;
  addonsPath: string;
}

interface PluginInfo {
  id: string;
  path: string;
  plugin_cfg_path: string | null;
  enabled: boolean;
  has_plugin_cfg: boolean;
  name: string;
  description: string;
  author: string;
  version: string;
  script: string | null;
}

interface AdapterDefinition {
  tool_id: string;
  label: string;
  kind: 'addon' | 'external' | 'hybrid';
  addon_ids: string[];
  marker_paths: string[];
  executable_names: string[];
  mcp_tools: string[];
  notes: string;
}

const ASSET_LIBRARY_API_BASE = 'https://godotengine.org/asset-library/api';

const ADAPTERS: AdapterDefinition[] = [
  {
    tool_id: 'gut',
    label: 'GUT',
    kind: 'addon',
    addon_ids: ['gut'],
    marker_paths: ['addons/gut/plugin.cfg', 'addons/gut/gut_cmdln.gd'],
    executable_names: [],
    mcp_tools: ['gut_install_or_update', 'gut_discover_tests', 'gut_run_test_file', 'gut_run_changed_tests', 'gut_run_with_coverage'],
    notes: 'GDScript unit test framework used by the Phase 4.3 GUT tools.',
  },
  {
    tool_id: 'gdunit4',
    label: 'gdUnit4',
    kind: 'addon',
    addon_ids: ['gdUnit4', 'gdunit4'],
    marker_paths: ['addons/gdUnit4/plugin.cfg', 'addons/gdUnit4/bin/GdUnitCmdTool.gd'],
    executable_names: [],
    mcp_tools: ['gdunit4_install_or_update', 'gdunit4_discover_tests', 'gdunit4_run_tests', 'gdunit4_generate_test'],
    notes: 'Alternative Godot test framework exposed through Phase 4.3 tools.',
  },
  {
    tool_id: 'godot_jolt',
    label: 'Godot Jolt',
    kind: 'addon',
    addon_ids: ['godot-jolt', 'godot_jolt', 'GodotJolt'],
    marker_paths: ['addons/godot-jolt/plugin.cfg', 'addons/godot_jolt/plugin.cfg'],
    executable_names: [],
    mcp_tools: ['create_rigid_body', 'configure_physics_material', 'validate_collision_setup'],
    notes: 'Optional physics backend; existing MCP physics tools can report whether it is installed.',
  },
  {
    tool_id: 'dialogic',
    label: 'Dialogic',
    kind: 'addon',
    addon_ids: ['dialogic', 'Dialogic'],
    marker_paths: ['addons/dialogic/plugin.cfg'],
    executable_names: [],
    mcp_tools: ['create_dialogue_resource', 'configure_localization'],
    notes: 'Dialogue authoring addon that complements MCP dialogue resource generation.',
  },
  {
    tool_id: 'limboai',
    label: 'LimboAI',
    kind: 'addon',
    addon_ids: ['limboai', 'limbo_ai', 'LimboAI'],
    marker_paths: ['addons/limboai/plugin.cfg', 'addons/limbo_ai/plugin.cfg'],
    executable_names: [],
    mcp_tools: ['create_state_machine', 'add_state', 'add_transition'],
    notes: 'Behavior tree and state machine addon that complements gameplay system tools.',
  },
  {
    tool_id: 'aseprite',
    label: 'Aseprite Importers',
    kind: 'hybrid',
    addon_ids: ['aseprite_importer', 'AsepriteWizard', 'aseprite_wizard'],
    marker_paths: ['addons/aseprite_importer/plugin.cfg', 'addons/AsepriteWizard/plugin.cfg'],
    executable_names: ['aseprite'],
    mcp_tools: ['asset_usage_report', 'texture_import_settings_get', 'texture_import_settings_set'],
    notes: 'Aseprite CLI/import addon support for sprite pipelines.',
  },
  {
    tool_id: 'blender',
    label: 'Blender Workflow Helpers',
    kind: 'external',
    addon_ids: ['blender_exporter', 'blender_importer'],
    marker_paths: ['addons/blender_exporter/plugin.cfg', 'addons/blender_importer/plugin.cfg'],
    executable_names: ['blender'],
    mcp_tools: ['model_import_settings_get', 'model_import_settings_set', 'asset_batch_reimport'],
    notes: 'Blender CLI and optional import/export helpers for model workflows.',
  },
  {
    tool_id: 'ldtk_tiled',
    label: 'LDtk/Tiled Importers',
    kind: 'hybrid',
    addon_ids: ['ldtk_importer', 'tiled_importer', 'godot-ldtk-importer'],
    marker_paths: ['addons/ldtk_importer/plugin.cfg', 'addons/tiled_importer/plugin.cfg', 'addons/godot-ldtk-importer/plugin.cfg'],
    executable_names: ['tiled'],
    mcp_tools: ['create_tilemap', 'generate_level_blockout', 'asset_batch_reimport'],
    notes: 'Level editor importers and optional Tiled executable integration.',
  },
];

export function registerAddonToolManagerTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    assetLibraryGetDetails(ctx),
    assetLibraryInstallAddon(ctx, false),
    assetLibraryInstallAddon(ctx, true),
    assetLibraryRemoveAddon(ctx),
    addonEnableDisable(ctx, true),
    addonEnableDisable(ctx, false),
    addonList(ctx),
    addonHealthCheck(ctx),
    externalToolStatus(ctx),
    externalToolConfigure(ctx),
  ]);
}

function assetLibraryGetDetails(ctx: ServerContext): ToolDefinition {
  return {
    name: 'asset_library_get_details',
    description: 'Fetch and normalize details for a Godot Asset Library asset ID.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        asset_id: { type: ['number', 'string'] },
        api_base_url: { type: 'string' },
      }),
      required: ['asset_id'],
    },
    timeout: 60000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      if (!args.assetId) return failure('asset_id is required');
      const fetched = await fetchAssetDetails(args.assetId, args.apiBaseUrl);
      if ('error' in fetched) return failure(fetched.error);
      const asset = normalizeAssetDetails(fetched.data);
      return jsonResponse({
        status: 'success',
        asset,
        install_plan: {
          tool: 'asset_library_install_addon',
          args: {
            asset_id: asset.asset_id,
            download_url: asset.download_url,
            auto_enable: false,
          },
        },
      });
    },
  };
}

function assetLibraryInstallAddon(ctx: ServerContext, updateMode: boolean): ToolDefinition {
  return {
    name: updateMode ? 'asset_library_update_addon' : 'asset_library_install_addon',
    description: updateMode
      ? 'Update selected addon folders from an Asset Library archive or local source directory.'
      : 'Install addon folders from an Asset Library archive or local source directory.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        asset_id: { type: ['number', 'string'] },
        api_base_url: { type: 'string' },
        download_url: { type: 'string' },
        source_directory: { type: 'string' },
        addon_ids: { type: 'array', items: { type: 'string' } },
        overwrite: { type: 'boolean' },
        auto_enable: { type: 'boolean' },
        dry_run: { type: 'boolean' },
        allow_network_install: { type: 'boolean' },
      }),
      required: ['project_path'],
    },
    timeout: 180000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      let asset: any = null;
      let sourceDirectory = args.sourceDirectory ? resolve(String(args.sourceDirectory)) : null;
      let cleanupDirectory: string | null = null;
      let downloadUrl = args.downloadUrl;

      if (!sourceDirectory) {
        if (!downloadUrl && args.assetId) {
          const fetched = await fetchAssetDetails(args.assetId, args.apiBaseUrl);
          if ('error' in fetched) return failure(fetched.error);
          asset = normalizeAssetDetails(fetched.data);
          downloadUrl = asset.download_url;
        }
        if (!downloadUrl) return failure('source_directory, download_url, or asset_id with a downloadable asset is required');
        if (!args.allowNetworkInstall && !args.dryRun) {
          return jsonResponse({
            status: 'planned',
            source: 'asset_library',
            asset,
            download_url: downloadUrl,
            note: 'Network install was not attempted. Pass allow_network_install=true or use source_directory.',
          });
        }
        if (args.dryRun) {
          return jsonResponse({
            status: 'dry_run',
            source: 'asset_library',
            asset,
            download_url: downloadUrl,
            requested_addons: arrayOfStrings(args.addonIds),
          });
        }

        const tempRoot = join(tmpdir(), `godot-mcp-addon-${Date.now()}`);
        const zipPath = join(tempRoot, 'asset.zip');
        const extractPath = join(tempRoot, 'extracted');
        mkdirSync(extractPath, { recursive: true });
        const downloaded = await downloadFile(downloadUrl, zipPath);
        if ('error' in downloaded) return failure(downloaded.error);
        const extracted = extractZip(zipPath, extractPath);
        if ('error' in extracted) return failure(extracted.error);
        sourceDirectory = extractPath;
        cleanupDirectory = tempRoot;
      }

      try {
        if (!sourceDirectory || !existsSync(sourceDirectory)) return failure(`source_directory not found: ${args.sourceDirectory}`);
        const addons = discoverSourceAddons(sourceDirectory, arrayOfStrings(args.addonIds));
        if ('error' in addons) return failure(addons.error);
        const result = installSourceAddons(target, addons.addons, {
          dryRun: Boolean(args.dryRun),
          overwrite: updateMode ? args.overwrite !== false : Boolean(args.overwrite),
          autoEnable: Boolean(args.autoEnable),
          updateMode,
        });
        return jsonResponse({
          status: args.dryRun ? 'dry_run' : 'success',
          source: args.sourceDirectory ? 'local_directory' : 'asset_library',
          asset,
          ...result,
        });
      } finally {
        if (cleanupDirectory) rmSync(cleanupDirectory, { recursive: true, force: true });
      }
    },
  };
}

function assetLibraryRemoveAddon(ctx: ServerContext): ToolDefinition {
  return {
    name: 'asset_library_remove_addon',
    description: 'Disable and optionally remove a project-local addon folder under addons/.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        addon_id: { type: 'string' },
        remove_files: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'addon_id'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const addonId = validateAddonId(args.addonId);
      if ('error' in addonId) return failure(addonId.error);
      const addonPath = join(target.addonsPath, addonId.value);
      const existed = existsSync(addonPath);
      const previousEnabled = readEnabledPluginRefs(target.projectFile).includes(pluginCfgRef(addonId.value));
      setAddonEnabled(target, addonId.value, false, Boolean(args.dryRun));

      const shouldRemove = args.removeFiles !== false;
      if (shouldRemove && existed && !args.dryRun) {
        if (!isInside(target.addonsPath, addonPath)) return failure(`Refusing to remove path outside addons: ${addonPath}`);
        rmSync(addonPath, { recursive: true, force: true });
      }

      return jsonResponse({
        status: args.dryRun ? 'dry_run' : 'success',
        addon_id: addonId.value,
        existed,
        previously_enabled: previousEnabled,
        enabled: false,
        removed_files: Boolean(shouldRemove && existed && !args.dryRun),
      });
    },
  };
}

function addonEnableDisable(ctx: ServerContext, enabled: boolean): ToolDefinition {
  return {
    name: enabled ? 'addon_enable' : 'addon_disable',
    description: enabled ? 'Enable a project editor addon by adding its plugin.cfg to project.godot.' : 'Disable a project editor addon by removing its plugin.cfg from project.godot.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        addon_id: { type: 'string' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'addon_id'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const addonId = validateAddonId(args.addonId);
      if ('error' in addonId) return failure(addonId.error);
      const addonPath = join(target.addonsPath, addonId.value);
      if (enabled && !existsSync(join(addonPath, 'plugin.cfg'))) {
        return failure(`plugin.cfg not found for addon: ${addonId.value}`);
      }
      const previousEnabled = readEnabledPluginRefs(target.projectFile).includes(pluginCfgRef(addonId.value));
      setAddonEnabled(target, addonId.value, enabled, Boolean(args.dryRun));
      return jsonResponse({
        status: args.dryRun ? 'dry_run' : 'success',
        addon_id: addonId.value,
        previously_enabled: previousEnabled,
        enabled,
        plugin_cfg: pluginCfgRef(addonId.value),
      });
    },
  };
}

function addonList(ctx: ServerContext): ToolDefinition {
  return {
    name: 'addon_list',
    description: 'List project addons with plugin.cfg metadata, enabled state, and optional health or adapter mapping.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        include_health: { type: 'boolean' },
        include_adapters: { type: 'boolean' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const addons = listProjectAddons(target).map((addon) => {
        const adapters = ADAPTERS.filter((adapter) => adapter.addon_ids.includes(addon.id)).map((adapter) => adapter.tool_id);
        return {
          ...addon,
          adapters: args.includeAdapters ? adapters : undefined,
          health: args.includeHealth ? healthForAddon(target, addon.id) : undefined,
        };
      });
      return jsonResponse({
        status: 'success',
        project_path: target.projectRoot,
        addon_count: addons.length,
        enabled_count: addons.filter((addon) => addon.enabled).length,
        addons,
      });
    },
  };
}

function addonHealthCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'addon_health_check',
    description: 'Check addon install health, plugin.cfg metadata, script presence, enabled state, and adapter mapping.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        addon_id: { type: 'string' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const ids = args.addonId ? [args.addonId] : listProjectAddons(target).map((addon) => addon.id);
      const addons = ids.map((id: string) => healthForAddon(target, id));
      return jsonResponse({
        status: addons.every((addon) => addon.status === 'success') ? 'success' : 'failed',
        addon_count: addons.length,
        addons,
      });
    },
  };
}

function externalToolStatus(ctx: ServerContext): ToolDefinition {
  return {
    name: 'external_tool_status',
    description: 'Report optional addon/external tool adapter status and MCP tool connections.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        tool_id: { type: 'string' },
        include_adapters: { type: 'boolean' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const config = readExternalToolConfig(target.projectRoot);
      const adapters = args.toolId ? ADAPTERS.filter((adapter) => adapter.tool_id === args.toolId) : ADAPTERS;
      if (args.toolId && adapters.length === 0) return failure(`Unknown external tool adapter: ${args.toolId}`);
      const tools = adapters.map((adapter) => adapterStatus(target, adapter, config.tools[adapter.tool_id]));
      return jsonResponse({
        status: 'success',
        project_path: target.projectRoot,
        tool_count: tools.length,
        tools,
      });
    },
  };
}

function externalToolConfigure(ctx: ServerContext): ToolDefinition {
  return {
    name: 'external_tool_configure',
    description: 'Create, update, disable, or remove a project-local external tool adapter configuration.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        tool_id: { type: 'string' },
        executable_path: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        env: { type: 'object' },
        enabled: { type: 'boolean' },
        metadata: { type: 'object' },
        remove: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'tool_id'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const adapter = ADAPTERS.find((entry) => entry.tool_id === args.toolId);
      if (!adapter) return failure(`Unknown external tool adapter: ${args.toolId}`);
      const config = readExternalToolConfig(target.projectRoot);
      const previous = config.tools[adapter.tool_id] || {};

      if (args.remove) {
        if (!args.dryRun) {
          delete config.tools[adapter.tool_id];
          writeExternalToolConfig(target.projectRoot, config);
        }
        return jsonResponse({
          status: args.dryRun ? 'dry_run' : 'success',
          removed: true,
          tool_id: adapter.tool_id,
          previous,
        });
      }

      const next = {
        ...previous,
        tool_id: adapter.tool_id,
        executable_path: args.executablePath ?? previous.executable_path ?? null,
        args: arrayOfStrings(args.args ?? previous.args ?? []),
        env: cleanRecord(args.env ?? previous.env ?? {}),
        enabled: args.enabled ?? previous.enabled ?? true,
        metadata: cleanRecord({ ...(previous.metadata || {}), ...(args.metadata || {}) }),
        updated_at: new Date().toISOString(),
      };
      if (!args.dryRun) {
        config.tools[adapter.tool_id] = next;
        writeExternalToolConfig(target.projectRoot, config);
      }
      return jsonResponse({
        status: args.dryRun ? 'dry_run' : 'success',
        config: next,
        adapter: adapterStatus(target, adapter, next),
      });
    },
  };
}

function installSourceAddons(target: ResolvedProject, addons: Array<{ id: string; sourcePath: string }>, options: {
  dryRun: boolean;
  overwrite: boolean;
  autoEnable: boolean;
  updateMode: boolean;
}): Record<string, any> {
  mkdirSync(target.addonsPath, { recursive: true });
  const installedAddons: any[] = [];
  const skippedAddons: any[] = [];
  const enabledAddons: string[] = [];

  for (const addon of addons) {
    const targetPath = join(target.addonsPath, addon.id);
    if (existsSync(targetPath) && !options.overwrite) {
      skippedAddons.push({ id: addon.id, reason: 'already exists; pass overwrite=true or use asset_library_update_addon' });
      continue;
    }
    if (!options.dryRun) {
      if (existsSync(targetPath)) {
        if (!isInside(target.addonsPath, targetPath)) throw new Error(`Refusing to overwrite path outside addons: ${targetPath}`);
        rmSync(targetPath, { recursive: true, force: true });
      }
      cpSync(addon.sourcePath, targetPath, { recursive: true });
    }
    const pluginInfo = existsSync(join(options.dryRun ? addon.sourcePath : targetPath, 'plugin.cfg'))
      ? parsePluginCfg(join(options.dryRun ? addon.sourcePath : targetPath, 'plugin.cfg'))
      : {};
    installedAddons.push({
      id: addon.id,
      operation: options.updateMode ? 'updated' : 'installed',
      path: `res://addons/${addon.id}`,
      name: pluginInfo.name || addon.id,
      version: pluginInfo.version || '',
    });
    if (options.autoEnable) {
      setAddonEnabled(target, addon.id, true, options.dryRun);
      enabledAddons.push(addon.id);
    }
  }

  return {
    installed_addons: installedAddons,
    skipped_addons: skippedAddons,
    enabled_addons: enabledAddons,
  };
}

function discoverSourceAddons(sourceRoot: string, requestedIds: string[]): { addons: Array<{ id: string; sourcePath: string }> } | { error: string } {
  const root = resolve(sourceRoot);
  const addonsRoot = existsSync(join(root, 'addons')) ? join(root, 'addons') : root;
  if (!existsSync(addonsRoot)) return { error: `source addons directory not found: ${sourceRoot}` };

  const candidates = readdirSync(addonsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, sourcePath: join(addonsRoot, entry.name) }))
    .filter((entry) => existsSync(join(entry.sourcePath, 'plugin.cfg')));
  const filtered = requestedIds.length > 0 ? candidates.filter((entry) => requestedIds.includes(entry.id)) : candidates;
  if (filtered.length === 0) {
    return { error: requestedIds.length > 0 ? `No requested addon_ids found: ${requestedIds.join(', ')}` : 'No addon folders with plugin.cfg found in source_directory' };
  }
  for (const addon of filtered) {
    const id = validateAddonId(addon.id);
    if ('error' in id) return id;
  }
  return { addons: filtered };
}

function listProjectAddons(target: ResolvedProject): PluginInfo[] {
  const enabledRefs = readEnabledPluginRefs(target.projectFile);
  if (!existsSync(target.addonsPath)) return [];
  return readdirSync(target.addonsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => pluginInfoForAddon(target, entry.name, enabledRefs))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function pluginInfoForAddon(target: ResolvedProject, addonId: string, enabledRefs = readEnabledPluginRefs(target.projectFile)): PluginInfo {
  const cfgPath = join(target.addonsPath, addonId, 'plugin.cfg');
  const cfg = existsSync(cfgPath) ? parsePluginCfg(cfgPath) : {};
  return {
    id: addonId,
    path: `res://addons/${addonId}`,
    plugin_cfg_path: existsSync(cfgPath) ? `res://addons/${addonId}/plugin.cfg` : null,
    enabled: enabledRefs.includes(pluginCfgRef(addonId)),
    has_plugin_cfg: existsSync(cfgPath),
    name: cfg.name || addonId,
    description: cfg.description || '',
    author: cfg.author || '',
    version: cfg.version || '',
    script: cfg.script || null,
  };
}

function healthForAddon(target: ResolvedProject, addonId: string): any {
  const addonPath = join(target.addonsPath, addonId);
  const cfgPath = join(addonPath, 'plugin.cfg');
  const cfg = existsSync(cfgPath) ? parsePluginCfg(cfgPath) : {};
  const scriptPath = cfg.script ? join(addonPath, cfg.script) : null;
  const adapters = ADAPTERS.filter((adapter) => adapter.addon_ids.includes(addonId)).map((adapter) => adapter.tool_id);
  const checks = [
    { name: 'addon_directory_exists', ok: existsSync(addonPath), path: `res://addons/${addonId}` },
    { name: 'plugin_cfg_exists', ok: existsSync(cfgPath), path: `res://addons/${addonId}/plugin.cfg` },
    { name: 'plugin_name_present', ok: Boolean(cfg.name), value: cfg.name || null },
    { name: 'script_declared', ok: Boolean(cfg.script), value: cfg.script || null },
    { name: 'script_exists', ok: Boolean(scriptPath && existsSync(scriptPath)), path: cfg.script ? `res://addons/${addonId}/${cfg.script}` : null },
  ];
  const failedChecks = checks.filter((check) => !check.ok);
  return {
    addon_id: addonId,
    status: failedChecks.length === 0 ? 'success' : 'failed',
    enabled: readEnabledPluginRefs(target.projectFile).includes(pluginCfgRef(addonId)),
    adapters,
    checks,
    issues: failedChecks.map((check) => check.name),
  };
}

function setAddonEnabled(target: ResolvedProject, addonId: string, enabled: boolean, dryRun = false): void {
  const ref = pluginCfgRef(addonId);
  const refs = readEnabledPluginRefs(target.projectFile);
  const nextRefs = enabled
    ? refs.includes(ref) ? refs : [...refs, ref]
    : refs.filter((entry) => entry !== ref);
  if (!dryRun) writeEnabledPluginRefs(target.projectFile, nextRefs);
}

function readEnabledPluginRefs(projectFile: string): string[] {
  if (!existsSync(projectFile)) return [];
  const content = readFileSync(projectFile, 'utf8');
  const section = matchEditorPluginsSection(content);
  if (!section) return [];
  const enabledMatch = section.match(/enabled\s*=\s*PackedStringArray\(([\s\S]*?)\)/);
  if (!enabledMatch) return [];
  return Array.from(enabledMatch[1].matchAll(/"([^"]+)"/g)).map((match) => match[1]);
}

function writeEnabledPluginRefs(projectFile: string, refs: string[]): void {
  const content = existsSync(projectFile) ? readFileSync(projectFile, 'utf8') : '';
  const uniqueRefs = refs.filter((entry, index, values) => values.indexOf(entry) === index).sort();
  const enabledLine = `enabled=PackedStringArray(${uniqueRefs.map((entry) => `"${entry}"`).join(', ')})`;
  const sectionMatch = content.match(/\[editor_plugins\][\s\S]*?(?=\n\[[^\]]+\]|\s*$)/);
  let nextContent: string;
  if (sectionMatch) {
    const section = sectionMatch[0];
    const nextSection = /enabled\s*=\s*PackedStringArray\([\s\S]*?\)/.test(section)
      ? section.replace(/enabled\s*=\s*PackedStringArray\([\s\S]*?\)/, enabledLine)
      : `${section.replace(/\s*$/, '')}\n${enabledLine}\n`;
    nextContent = content.replace(section, nextSection);
  } else {
    nextContent = `${content.trimEnd()}\n\n[editor_plugins]\n\n${enabledLine}\n`;
  }
  writeFileSync(projectFile, nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`, 'utf8');
}

function matchEditorPluginsSection(content: string): string | null {
  const match = content.match(/\[editor_plugins\][\s\S]*?(?=\n\[[^\]]+\]|\s*$)/);
  return match ? match[0] : null;
}

function parsePluginCfg(pluginCfgPath: string): Record<string, string> {
  const content = readFileSync(pluginCfgPath, 'utf8');
  const values: Record<string, string> = {};
  let inPluginSection = false;
  for (const rawLine of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      inPluginSection = section[1] === 'plugin';
      continue;
    }
    if (!inPluginSection) continue;
    const equals = line.indexOf('=');
    if (equals === -1) continue;
    const key = line.slice(0, equals).trim();
    values[key] = parseConfigValue(line.slice(equals + 1).trim());
  }
  return values;
}

function parseConfigValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

function adapterStatus(target: ResolvedProject, adapter: AdapterDefinition, config: any): any {
  const enabledRefs = readEnabledPluginRefs(target.projectFile);
  const addonMatches = adapter.addon_ids
    .map((addonId) => ({
      addon_id: addonId,
      installed: existsSync(join(target.addonsPath, addonId)),
      enabled: enabledRefs.includes(pluginCfgRef(addonId)),
    }))
    .filter((entry) => entry.installed);
  const markerMatches = adapter.marker_paths
    .map((marker) => ({ path: marker.replace(/\\/g, '/'), exists: existsSync(join(target.projectRoot, marker)) }))
    .filter((entry) => entry.exists);
  const executablePath = config?.executable_path || findExecutableOnPath(adapter.executable_names);
  const executableExists = Boolean(executablePath && existsSync(String(executablePath)));
  const available = addonMatches.length > 0 || executableExists;
  return {
    tool_id: adapter.tool_id,
    label: adapter.label,
    kind: adapter.kind,
    status: available ? 'available' : 'missing',
    configured: Boolean(config),
    enabled: config?.enabled ?? available,
    addon_installed: addonMatches.length > 0,
    addon_enabled: addonMatches.some((entry) => entry.enabled),
    addon_matches: addonMatches,
    marker_matches: markerMatches,
    executable_path: executablePath || null,
    executable_exists: executableExists,
    mcp_tools: adapter.mcp_tools,
    notes: adapter.notes,
  };
}

function readExternalToolConfig(projectRoot: string): { version: number; tools: Record<string, any> } {
  const configPath = externalToolConfigPath(projectRoot);
  if (!existsSync(configPath)) return { version: 1, tools: {} };
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return { version: 1, tools: parsed.tools && typeof parsed.tools === 'object' ? parsed.tools : {} };
  } catch {
    return { version: 1, tools: {} };
  }
}

function writeExternalToolConfig(projectRoot: string, config: { version: number; tools: Record<string, any> }): void {
  const configPath = externalToolConfigPath(projectRoot);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ version: 1, tools: config.tools }, null, 2), 'utf8');
}

function externalToolConfigPath(projectRoot: string): string {
  return join(projectRoot, '.godot-mcp', 'external_tools.json');
}

async function fetchAssetDetails(assetId: string | number, apiBaseUrl?: string): Promise<{ data: any } | { error: string }> {
  const base = String(apiBaseUrl || ASSET_LIBRARY_API_BASE).replace(/\/+$/, '');
  return fetchJson(`${base}/asset/${encodeURIComponent(String(assetId))}`);
}

function normalizeAssetDetails(asset: any): any {
  return {
    asset_id: Number.isFinite(Number(asset.asset_id)) ? Number(asset.asset_id) : asset.asset_id,
    title: asset.title || '',
    author: asset.author || '',
    category: asset.category || '',
    version: asset.version_string || asset.version || '',
    godot_version: asset.godot_version || '',
    download_url: asset.download_url || '',
    browse_url: asset.browse_url || asset.asset_url || '',
    rating: asset.rating ?? null,
    raw: asset,
  };
}

function fetchJson(url: string, redirectCount = 0): Promise<{ data: any } | { error: string }> {
  return new Promise((resolveFetch) => {
    const getter = url.startsWith('http://') ? httpGet : httpsGet;
    const request = getter(url, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location && redirectCount < 5) {
        response.resume();
        fetchJson(new URL(location, url).toString(), redirectCount + 1).then(resolveFetch);
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (status < 200 || status >= 300) {
          resolveFetch({ error: `Asset Library returned HTTP ${status}` });
          return;
        }
        try {
          resolveFetch({ data: JSON.parse(body) });
        } catch (error: any) {
          resolveFetch({ error: `Failed to parse Asset Library JSON: ${error?.message || String(error)}` });
        }
      });
    });
    request.on('error', (error) => resolveFetch({ error: error.message }));
    request.setTimeout(30000, () => {
      request.destroy();
      resolveFetch({ error: 'Asset Library request timed out' });
    });
  });
}

function downloadFile(url: string, destination: string, redirectCount = 0): Promise<{ ok: true } | { error: string }> {
  return new Promise((resolveDownload) => {
    mkdirSync(dirname(destination), { recursive: true });
    const getter = url.startsWith('http://') ? httpGet : httpsGet;
    const request = getter(url, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location && redirectCount < 5) {
        response.resume();
        downloadFile(new URL(location, url).toString(), destination, redirectCount + 1).then(resolveDownload);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        resolveDownload({ error: `Download returned HTTP ${status}` });
        return;
      }
      const file = createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolveDownload({ ok: true });
      });
      file.on('error', (error) => resolveDownload({ error: error.message }));
    });
    request.on('error', (error) => resolveDownload({ error: error.message }));
    request.setTimeout(60000, () => {
      request.destroy();
      resolveDownload({ error: 'Download timed out' });
    });
  });
}

function extractZip(zipPath: string, destination: string): { ok: true } | { error: string } {
  mkdirSync(destination, { recursive: true });
  const result = spawnSync('tar', ['-xf', zipPath, '-C', destination], { encoding: 'utf8' });
  if (result.status !== 0) {
    return { error: result.stderr || result.stdout || 'tar extraction failed' };
  }
  return { ok: true };
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): ResolvedProject | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  const projectFile = join(projectRoot, 'project.godot');
  if (!existsSync(projectFile)) return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  return {
    projectRoot,
    projectFile,
    addonsPath: join(projectRoot, 'addons'),
  };
}

function validateAddonId(value: string): { value: string } | { error: string } {
  const id = String(value || '').trim();
  if (!id) return { error: 'addon_id is required' };
  if (id.includes('/') || id.includes('\\') || id.includes('..') || isAbsolute(id)) {
    return { error: `Invalid addon_id: ${value}` };
  }
  return { value: id };
}

function pluginCfgRef(addonId: string): string {
  return `res://addons/${addonId}/plugin.cfg`;
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return Boolean(rel) && !rel.startsWith('..') && !rel.includes(`..${sep}`) && !isAbsolute(rel);
}

function findExecutableOnPath(names: string[]): string | null {
  const pathValue = process.env.PATH || '';
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of pathValue.split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir) continue;
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = join(dir, name.endsWith(extension) ? name : `${name}${extension}`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function commonProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    ...extra,
  };
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    assetId: args.assetId ?? args.asset_id,
    apiBaseUrl: args.apiBaseUrl ?? args.api_base_url,
    downloadUrl: args.downloadUrl ?? args.download_url,
    sourceDirectory: args.sourceDirectory ?? args.source_directory,
    addonId: args.addonId ?? args.addon_id,
    addonIds: args.addonIds ?? args.addon_ids,
    dryRun: args.dryRun ?? args.dry_run,
    autoEnable: args.autoEnable ?? args.auto_enable,
    allowNetworkInstall: args.allowNetworkInstall ?? args.allow_network_install,
    removeFiles: args.removeFiles ?? args.remove_files,
    includeHealth: args.includeHealth ?? args.include_health,
    includeAdapters: args.includeAdapters ?? args.include_adapters,
    toolId: args.toolId ?? args.tool_id,
    executablePath: args.executablePath ?? args.executable_path,
  };
}

function arrayOfStrings(value: any): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

function cleanRecord(value: any): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, any> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof key === 'string' && key.trim()) result[key] = entryValue;
  }
  return result;
}

function failure(reason: string): ToolResponse {
  return jsonResponse({ status: 'failed', reason }, true);
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
