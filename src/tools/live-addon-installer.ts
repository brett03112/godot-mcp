import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

const ADDON_ID = 'godot_mcp_live';
const PLUGIN_REF = `res://addons/${ADDON_ID}/plugin.cfg`;
const REQUIRED_GODOT_VERSION = '4.6';

export interface LiveAddonInstallerOptions {
  addonSourcePath?: string;
}

interface ResolvedProject {
  projectRoot: string;
  projectFile: string;
  addonPath: string;
}

interface AddonManifest {
  root: string;
  file_count: number;
  digest: string | null;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

export function registerLiveAddonInstallerTools(
  registry: ToolRegistry,
  ctx: ServerContext,
  options: LiveAddonInstallerOptions = {},
): void {
  registry.registerAll([
    liveAddonInstall(ctx, options),
    liveAddonUpdate(ctx, options),
    liveAddonRemove(ctx),
    liveAddonStatus(ctx, options),
    liveAddonEnableDisable(ctx, true),
    liveAddonEnableDisable(ctx, false),
  ]);
}

function liveAddonInstall(ctx: ServerContext, options: LiveAddonInstallerOptions): ToolDefinition {
  return {
    name: 'live_addon_install',
    description: 'Install the bundled Godot MCP Live editor addon into a Godot project.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        source_path: { type: 'string', description: 'Optional source folder containing the godot_mcp_live addon.' },
        enable: { type: 'boolean', description: 'Enable the addon after installing it.' },
        overwrite: { type: 'boolean', description: 'Overwrite an existing installed live addon.' },
        dry_run: { type: 'boolean' },
        godot_version: { type: 'string', description: 'Godot version to check, for example 4.6.3.' },
      }),
      required: ['project_path'],
    },
    metadata: metadata(true, 'high'),
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProject(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const source = resolveAddonSource(args.sourcePath || options.addonSourcePath);
      if ('error' in source) return failure(source.error);

      const installed = existsSync(target.addonPath);
      if (installed && !args.overwrite) {
        return jsonResponse({
          status: 'failed',
          reason: 'Live addon is already installed. Pass overwrite=true or use live_addon_update.',
          addon_id: ADDON_ID,
          installed: true,
        }, true);
      }

      const result = copyAddon(source.path, target, {
        dryRun: Boolean(args.dryRun),
        removeExisting: Boolean(installed && args.overwrite),
      });
      if ('error' in result) return failure(result.error);

      const previousEnabled = isAddonEnabled(target.projectFile);
      if (args.enable) setAddonEnabled(target.projectFile, true, Boolean(args.dryRun));
      const status = statusPayload(target, source.path, args.godotVersion);
      return jsonResponse({
        status: args.dryRun ? 'dry_run' : 'success',
        operation: 'install',
        addon_id: ADDON_ID,
        project_path: target.projectRoot,
        source_path: source.path,
        installed: !args.dryRun,
        previously_enabled: previousEnabled,
        enabled: args.dryRun ? previousEnabled : isAddonEnabled(target.projectFile),
        compatibility: status.compatibility,
        planned_files: result.files,
        copied_files: args.dryRun ? [] : result.files,
      });
    },
  };
}

function liveAddonUpdate(ctx: ServerContext, options: LiveAddonInstallerOptions): ToolDefinition {
  return {
    name: 'live_addon_update',
    description: 'Update the installed Godot MCP Live addon from the bundled source while preserving enabled state.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        source_path: { type: 'string' },
        dry_run: { type: 'boolean' },
        godot_version: { type: 'string' },
      }),
      required: ['project_path'],
    },
    metadata: metadata(true, 'high'),
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProject(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const source = resolveAddonSource(args.sourcePath || options.addonSourcePath);
      if ('error' in source) return failure(source.error);

      const enabled = isAddonEnabled(target.projectFile);
      const result = copyAddon(source.path, target, {
        dryRun: Boolean(args.dryRun),
        removeExisting: true,
      });
      if ('error' in result) return failure(result.error);
      if (enabled) setAddonEnabled(target.projectFile, true, Boolean(args.dryRun));

      const status = statusPayload(target, source.path, args.godotVersion);
      return jsonResponse({
        status: args.dryRun ? 'dry_run' : 'success',
        operation: 'update',
        addon_id: ADDON_ID,
        project_path: target.projectRoot,
        source_path: source.path,
        enabled,
        compatibility: status.compatibility,
        planned_files: result.files,
        copied_files: args.dryRun ? [] : result.files,
        same_source_and_target: result.sameSourceAndTarget,
        up_to_date: args.dryRun ? status.up_to_date : statusPayload(target, source.path, args.godotVersion).up_to_date,
      });
    },
  };
}

function liveAddonRemove(ctx: ServerContext): ToolDefinition {
  return {
    name: 'live_addon_remove',
    description: 'Disable and optionally remove the project-local Godot MCP Live addon.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        remove_files: { type: 'boolean', description: 'Remove addon files after disabling. Defaults to true.' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path'],
    },
    metadata: metadata(true, 'high'),
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProject(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const existed = existsSync(target.addonPath);
      const previousEnabled = isAddonEnabled(target.projectFile);
      const removeFiles = args.removeFiles !== false;

      setAddonEnabled(target.projectFile, false, Boolean(args.dryRun));
      if (removeFiles && existed && !args.dryRun) {
        if (!isInside(join(target.projectRoot, 'addons'), target.addonPath)) {
          return failure(`Refusing to remove addon path outside project addons: ${target.addonPath}`);
        }
        rmSync(target.addonPath, { recursive: true, force: true });
      }

      return jsonResponse({
        status: args.dryRun ? 'dry_run' : 'success',
        operation: 'remove',
        addon_id: ADDON_ID,
        project_path: target.projectRoot,
        existed,
        previously_enabled: previousEnabled,
        enabled: args.dryRun ? previousEnabled : false,
        removed_files: Boolean(removeFiles && existed && !args.dryRun),
      });
    },
  };
}

function liveAddonStatus(ctx: ServerContext, options: LiveAddonInstallerOptions): ToolDefinition {
  return {
    name: 'live_addon_status',
    description: 'Report Godot MCP Live addon install, enablement, version, manifest, update, and Godot 4.6 compatibility status.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        source_path: { type: 'string' },
        godot_version: { type: 'string' },
      }),
      required: ['project_path'],
    },
    metadata: metadata(false, 'low'),
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProject(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const source = resolveAddonSource(args.sourcePath || options.addonSourcePath);
      const sourcePath = 'error' in source ? null : source.path;
      const payload = statusPayload(target, sourcePath, args.godotVersion);
      if ('error' in source) {
        payload.source_status = 'missing';
        payload.source_error = source.error;
      }
      return jsonResponse(payload);
    },
  };
}

function liveAddonEnableDisable(ctx: ServerContext, enabled: boolean): ToolDefinition {
  return {
    name: enabled ? 'live_addon_enable' : 'live_addon_disable',
    description: enabled
      ? 'Enable the Godot MCP Live addon in project.godot.'
      : 'Disable the Godot MCP Live addon in project.godot.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path'],
    },
    metadata: metadata(true, 'high'),
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProject(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (enabled && !existsSync(join(target.addonPath, 'plugin.cfg'))) {
        return failure('Godot MCP Live plugin.cfg is not installed. Run live_addon_install first.');
      }
      const previousEnabled = isAddonEnabled(target.projectFile);
      setAddonEnabled(target.projectFile, enabled, Boolean(args.dryRun));
      return jsonResponse({
        status: args.dryRun ? 'dry_run' : 'success',
        addon_id: ADDON_ID,
        project_path: target.projectRoot,
        previously_enabled: previousEnabled,
        enabled: args.dryRun ? previousEnabled : enabled,
        plugin_cfg: PLUGIN_REF,
        reload_required: enabled
          ? 'Reload or re-enable the addon in the open Godot editor so the live bridge script is loaded.'
          : 'Reload or re-disable the addon in the open Godot editor so the live bridge script is unloaded.',
      });
    },
  };
}

function statusPayload(target: ResolvedProject, sourcePath: string | null, godotVersion?: string): any {
  const installed = existsSync(join(target.addonPath, 'plugin.cfg'));
  const installedMetadata = installed ? parsePluginCfg(join(target.addonPath, 'plugin.cfg')) : {};
  const sourceMetadata = sourcePath && existsSync(join(sourcePath, 'plugin.cfg')) ? parsePluginCfg(join(sourcePath, 'plugin.cfg')) : {};
  const installedManifest = installed ? manifestFor(target.addonPath) : null;
  const sourceManifest = sourcePath ? manifestFor(sourcePath) : null;
  const upToDate = Boolean(installedManifest && sourceManifest && installedManifest.digest === sourceManifest.digest);
  return {
    status: 'success',
    addon_id: ADDON_ID,
    project_path: target.projectRoot,
    installed,
    enabled: isAddonEnabled(target.projectFile),
    addon_path: `res://addons/${ADDON_ID}`,
    plugin_cfg: installed ? PLUGIN_REF : null,
    metadata: installedMetadata,
    source_metadata: sourceMetadata,
    installed_manifest: installedManifest,
    source_manifest: sourceManifest,
    up_to_date: upToDate,
    update_available: Boolean(installed && sourceManifest && installedManifest && !upToDate),
    compatibility: compatibilityFor(godotVersion),
    reload_required: 'After install, update, enable, disable, or remove, reload the Godot editor addon or restart the editor before trusting live callability.',
  };
}

function copyAddon(sourcePath: string, target: ResolvedProject, options: { dryRun: boolean; removeExisting: boolean }): { files: string[]; sameSourceAndTarget: boolean } | { error: string } {
  const source = resolve(sourcePath);
  const destination = target.addonPath;
  const sameSourceAndTarget = source === resolve(destination);
  const files = manifestFor(source).files.map((file) => file.path);
  if (!existsSync(join(source, 'plugin.cfg'))) return { error: `Live addon source plugin.cfg not found: ${source}` };
  if (options.dryRun || sameSourceAndTarget) return { files, sameSourceAndTarget };

  mkdirSync(join(target.projectRoot, 'addons'), { recursive: true });
  if (existsSync(destination) && options.removeExisting) {
    if (!isInside(join(target.projectRoot, 'addons'), destination)) {
      return { error: `Refusing to overwrite addon path outside project addons: ${destination}` };
    }
    rmSync(destination, { recursive: true, force: true });
  }
  cpSync(source, destination, { recursive: true });
  return { files, sameSourceAndTarget };
}

function resolveProject(ctx: ServerContext, projectPath: string | undefined): ResolvedProject | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  const projectFile = join(projectRoot, 'project.godot');
  if (!existsSync(projectFile)) return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  return {
    projectRoot,
    projectFile,
    addonPath: join(projectRoot, 'addons', ADDON_ID),
  };
}

function resolveAddonSource(explicitPath?: string): { path: string } | { error: string } {
  const candidates = explicitPath ? [explicitPath] : defaultSourceCandidates();
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (existsSync(join(resolved, 'plugin.cfg'))) return { path: resolved };
  }
  return { error: `Godot MCP Live addon source not found. Checked: ${candidates.map((entry) => resolve(entry)).join(', ')}` };
}

function defaultSourceCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, '..', 'addons', ADDON_ID),
    join(here, '..', '..', 'src', 'addons', ADDON_ID),
    join(process.cwd(), 'src', 'addons', ADDON_ID),
    join(process.cwd(), 'test_mcp_enhancements', 'addons', ADDON_ID),
  ];
}

function manifestFor(rootPath: string): AddonManifest {
  const root = resolve(rootPath);
  if (!existsSync(root)) {
    return { root, file_count: 0, digest: null, files: [] };
  }
  const files = walkFiles(root)
    .map((filePath) => {
      const content = readFileSync(filePath);
      return {
        path: relative(root, filePath).replace(/\\/g, '/'),
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: content.length,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const digest = files.length
    ? createHash('sha256').update(JSON.stringify(files.map((file) => [file.path, file.sha256]))).digest('hex')
    : null;
  return {
    root,
    file_count: files.length,
    digest,
    files,
  };
}

function walkFiles(rootPath: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      found.push(fullPath);
    }
  }
  return found;
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

function compatibilityFor(godotVersion?: string): any {
  const version = String(godotVersion || '').trim();
  if (!version) {
    return {
      required_godot_version: REQUIRED_GODOT_VERSION,
      provided_godot_version: null,
      checked: false,
      compatible: null,
      reason: 'No godot_version was provided; the live addon requires Godot 4.6 or later.',
    };
  }
  const compatible = /^4\.(?:[6-9]|\d{2,})(?:\.|$)/.test(version);
  return {
    required_godot_version: REQUIRED_GODOT_VERSION,
    provided_godot_version: version,
    checked: true,
    compatible,
    reason: compatible ? 'Godot version is compatible with the live addon.' : 'The live addon requires Godot 4.6 or later.',
  };
}

function isAddonEnabled(projectFile: string): boolean {
  return readEnabledPluginRefs(projectFile).includes(PLUGIN_REF);
}

function setAddonEnabled(projectFile: string, enabled: boolean, dryRun = false): void {
  const refs = readEnabledPluginRefs(projectFile);
  const nextRefs = enabled
    ? refs.includes(PLUGIN_REF) ? refs : [...refs, PLUGIN_REF]
    : refs.filter((entry) => entry !== PLUGIN_REF);
  if (!dryRun) writeEnabledPluginRefs(projectFile, nextRefs);
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
    sourcePath: args.sourcePath ?? args.source_path,
    dryRun: args.dryRun ?? args.dry_run,
    godotVersion: args.godotVersion ?? args.godot_version,
    removeFiles: args.removeFiles ?? args.remove_files,
  };
}

function metadata(mutates: boolean, risk: 'low' | 'medium' | 'high'): any {
  return {
    toolset: 'project',
    aliases: [],
    risk,
    mutates,
    requires_live: false,
    requires_display: false,
    requires_godot_version: REQUIRED_GODOT_VERSION,
  };
}

function isInside(root: string, candidate: string): boolean {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const rel = relative(rootPath, candidatePath);
  return Boolean(rel) && !rel.startsWith('..') && !rel.includes(`..${sep}`) && !isAbsolute(rel);
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
