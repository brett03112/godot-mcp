/**
 * Asset pipeline control tools for Phase 4.5.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

type ImportSections = Record<string, Record<string, any>>;

interface ImportFile {
  sections: ImportSections;
  sectionOrder: string[];
  assetPath: string;
  importPath: string;
  importAbsolutePath: string;
}

interface ResolvedProject {
  projectRoot: string;
}

interface ResolvedFile {
  absolutePath: string;
  relativePath: string;
  resPath: string;
}

const TEXT_REFERENCE_EXTENSIONS = new Set([
  '.tscn',
  '.tres',
  '.gd',
  '.cs',
  '.cfg',
  '.json',
  '.md',
]);

const ASSET_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.tga',
  '.wav',
  '.ogg',
  '.mp3',
  '.gltf',
  '.glb',
  '.fbx',
  '.obj',
]);

export function registerAssetPipelineTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    assetImportProfileCreate(ctx),
    assetImportProfileApply(ctx),
    importSettingsGet(ctx, 'texture', 'texture_import_settings_get'),
    importSettingsSet(ctx, 'texture', 'texture_import_settings_set'),
    importSettingsGet(ctx, 'audio', 'audio_import_settings_get'),
    importSettingsSet(ctx, 'audio', 'audio_import_settings_set'),
    importSettingsGet(ctx, 'model', 'model_import_settings_get'),
    importSettingsSet(ctx, 'model', 'model_import_settings_set'),
    assetBatchReimport(ctx),
    assetUsageReport(ctx),
    assetSizeBudgetReport(ctx),
    assetLicenseManifest(ctx),
  ]);
}

function assetImportProfileCreate(ctx: ServerContext): ToolDefinition {
  return {
    name: 'asset_import_profile_create',
    description: 'Create or replace a project-local asset import profile under .godot-mcp/import_profiles.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        profile_name: { type: 'string' },
        description: { type: 'string' },
        texture_settings: { type: 'object' },
        audio_settings: { type: 'object' },
        model_settings: { type: 'object' },
        overwrite: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'profile_name'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.profileName) return failure('profile_name is required');

      const profilePath = importProfilePath(target.projectRoot, args.profileName);
      if (existsSync(profilePath.absolutePath) && args.overwrite === false) {
        return failure(`profile already exists: ${profilePath.relativePath}`);
      }

      const now = new Date().toISOString();
      const profile = {
        profile_name: sanitizeProfileName(args.profileName),
        description: args.description || '',
        asset_settings: {
          texture: cleanSettings(args.textureSettings || {}),
          audio: cleanSettings(args.audioSettings || {}),
          model: cleanSettings(args.modelSettings || {}),
        },
        created_at: now,
        updated_at: now,
      };

      if (!args.dryRun) {
        mkdirSync(dirname(profilePath.absolutePath), { recursive: true });
        writeFileSync(profilePath.absolutePath, JSON.stringify(profile, null, 2), 'utf8');
      }

      return jsonResponse({
        status: 'success',
        dry_run: Boolean(args.dryRun),
        profile_path: profilePath.relativePath,
        profile,
      });
    },
  };
}

function assetImportProfileApply(ctx: ServerContext): ToolDefinition {
  return {
    name: 'asset_import_profile_apply',
    description: 'Apply a stored import profile to selected assets by asset type.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        profile_name: { type: 'string' },
        asset_paths: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean' },
        reimport: { type: 'boolean' },
        wait_for_completion: { type: 'boolean' },
      }),
      required: ['project_path', 'profile_name', 'asset_paths'],
    },
    timeout: 120000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.profileName) return failure('profile_name is required');
      const assetPaths = arrayOfStrings(args.assetPaths);
      if (assetPaths.length === 0) return failure('asset_paths is required');

      const profilePath = importProfilePath(target.projectRoot, args.profileName);
      if (!existsSync(profilePath.absolutePath)) return failure(`profile not found: ${profilePath.relativePath}`);
      const profile = JSON.parse(readFileSync(profilePath.absolutePath, 'utf8'));
      const assetSettings = profile.asset_settings || {};

      const appliedAssets: any[] = [];
      const skippedAssets: any[] = [];
      for (const assetPath of assetPaths) {
        const importFile = loadImportFile(target.projectRoot, assetPath);
        if ('error' in importFile) {
          skippedAssets.push({ asset_path: toResPath(assetPath), reason: importFile.error });
          continue;
        }
        const assetType = detectAssetType(importFile.data);
        const settings = cleanSettings(assetSettings[assetType] || {});
        if (Object.keys(settings).length === 0) {
          skippedAssets.push({ asset_path: importFile.data.assetPath, asset_type: assetType, reason: 'profile has no settings for asset type' });
          continue;
        }
        const result = applySettings(importFile.data, settings);
        if (!args.dryRun) writeImportFile(importFile.data);
        appliedAssets.push({
          asset_path: importFile.data.assetPath,
          import_path: importFile.data.importPath,
          asset_type: assetType,
          changed_keys: result.changedKeys,
          settings_after: importFile.data.sections.params || {},
        });
      }

      let reimportResult: any = null;
      if (args.reimport && !args.dryRun && appliedAssets.length > 0) {
        const parsed = await executeJsonOperation(ctx, target.projectRoot, 'asset_batch_reimport', {
          asset_paths: appliedAssets.map((asset) => asset.asset_path),
          wait_for_completion: args.waitForCompletion ?? true,
        });
        reimportResult = 'error' in parsed ? { status: 'failed', reason: parsed.error } : parsed.data;
      }

      return jsonResponse({
        status: 'success',
        dry_run: Boolean(args.dryRun),
        profile_path: profilePath.relativePath,
        applied_assets: appliedAssets,
        skipped_assets: skippedAssets,
        reimport: reimportResult,
      });
    },
  };
}

function importSettingsGet(ctx: ServerContext, expectedType: string, toolName: string): ToolDefinition {
  return {
    name: toolName,
    description: `Read ${expectedType} import settings from an asset .import file.`,
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        asset_path: { type: 'string' },
      }),
      required: ['project_path', 'asset_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.assetPath) return failure('asset_path is required');
      const loaded = loadImportFile(target.projectRoot, args.assetPath);
      if ('error' in loaded) return failure(loaded.error);
      const assetType = detectAssetType(loaded.data);
      if (assetType !== expectedType) {
        return failure(`Expected ${expectedType} asset, got ${assetType}`);
      }
      return jsonResponse(importSettingsPayload(loaded.data, assetType));
    },
  };
}

function importSettingsSet(ctx: ServerContext, expectedType: string, toolName: string): ToolDefinition {
  return {
    name: toolName,
    description: `Update ${expectedType} import settings in the asset .import [params] section.`,
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        asset_path: { type: 'string' },
        settings: { type: 'object' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'asset_path', 'settings'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.assetPath) return failure('asset_path is required');
      if (!args.settings || typeof args.settings !== 'object' || Array.isArray(args.settings)) {
        return failure('settings object is required');
      }
      const loaded = loadImportFile(target.projectRoot, args.assetPath);
      if ('error' in loaded) return failure(loaded.error);
      const assetType = detectAssetType(loaded.data);
      if (assetType !== expectedType) {
        return failure(`Expected ${expectedType} asset, got ${assetType}`);
      }
      const before = { ...(loaded.data.sections.params || {}) };
      const result = applySettings(loaded.data, cleanSettings(args.settings));
      const after = { ...(loaded.data.sections.params || {}) };
      if (!args.dryRun) writeImportFile(loaded.data);
      return jsonResponse({
        status: 'success',
        dry_run: Boolean(args.dryRun),
        asset_path: loaded.data.assetPath,
        import_path: loaded.data.importPath,
        asset_type: assetType,
        importer: loaded.data.sections.remap?.importer,
        changed_keys: result.changedKeys,
        settings_before: before,
        settings_after: after,
      });
    },
  };
}

function assetBatchReimport(ctx: ServerContext): ToolDefinition {
  return {
    name: 'asset_batch_reimport',
    description: 'Ask Godot to reimport a selected batch of assets after import setting changes.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        asset_paths: { type: 'array', items: { type: 'string' } },
        wait_for_completion: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'asset_paths'],
    },
    timeout: 120000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const assetPaths = arrayOfStrings(args.assetPaths).map(toResPath);
      if (assetPaths.length === 0) return failure('asset_paths is required');
      if (args.dryRun) {
        return jsonResponse({
          status: 'success',
          dry_run: true,
          reimported: assetPaths,
          count: assetPaths.length,
        });
      }
      const parsed = await executeJsonOperation(ctx, target.projectRoot, 'asset_batch_reimport', {
        asset_paths: assetPaths,
        wait_for_completion: args.waitForCompletion ?? true,
      });
      if ('error' in parsed) return failure(parsed.error);
      const failed = parsed.data.success === false;
      return jsonResponse({
        status: failed ? 'failed' : 'success',
        ...parsed.data,
      }, failed);
    },
  };
}

function assetUsageReport(ctx: ServerContext): ToolDefinition {
  return {
    name: 'asset_usage_report',
    description: 'Report text-resource references to selected assets across scenes, scripts, and resources.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        asset_paths: { type: 'array', items: { type: 'string' } },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const assets = resolveAssetList(target.projectRoot, args.assetPaths);
      if ('error' in assets) return failure(assets.error);
      const searchable = listFiles(target.projectRoot)
        .filter((file) => TEXT_REFERENCE_EXTENSIONS.has(extname(file).toLowerCase()))
        .filter((file) => !file.includes('/.godot/') && !file.endsWith('.import'));
      const report = assets.assets.map((asset) => {
        const references = findReferences(target.projectRoot, searchable, asset.resPath, asset.relativePath);
        return {
          asset_path: asset.resPath,
          size_bytes: existsSync(asset.absolutePath) ? statSync(asset.absolutePath).size : 0,
          reference_count: references.length,
          references,
        };
      });
      return jsonResponse({
        status: 'success',
        asset_count: report.length,
        assets: report,
      });
    },
  };
}

function assetSizeBudgetReport(ctx: ServerContext): ToolDefinition {
  return {
    name: 'asset_size_budget_report',
    description: 'Report selected asset sizes and fail when total or per-asset budgets are exceeded.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        asset_paths: { type: 'array', items: { type: 'string' } },
        max_total_bytes: { type: 'number' },
        per_asset_budget_bytes: { type: 'number' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const assets = resolveAssetList(target.projectRoot, args.assetPaths);
      if ('error' in assets) return failure(assets.error);
      const entries = assets.assets.map((asset) => ({
        asset_path: asset.resPath,
        size_bytes: existsSync(asset.absolutePath) ? statSync(asset.absolutePath).size : 0,
      }));
      const totalBytes = entries.reduce((sum, asset) => sum + asset.size_bytes, 0);
      const violations = entries
        .filter((asset) => Number.isFinite(args.perAssetBudgetBytes) && asset.size_bytes > Number(args.perAssetBudgetBytes))
        .map((asset) => ({
          kind: 'asset_size_over_budget',
          asset_path: asset.asset_path,
          size_bytes: asset.size_bytes,
          budget_bytes: Number(args.perAssetBudgetBytes),
        }));
      const totalOverBudget = Number.isFinite(args.maxTotalBytes) && totalBytes > Number(args.maxTotalBytes);
      return jsonResponse({
        status: violations.length > 0 || totalOverBudget ? 'failed' : 'success',
        asset_count: entries.length,
        total_bytes: totalBytes,
        max_total_bytes: args.maxTotalBytes ?? null,
        total_over_budget: Boolean(totalOverBudget),
        per_asset_budget_bytes: args.perAssetBudgetBytes ?? null,
        violations,
        assets: entries,
      }, violations.length > 0 || totalOverBudget);
    },
  };
}

function assetLicenseManifest(ctx: ServerContext): ToolDefinition {
  return {
    name: 'asset_license_manifest',
    description: 'Create a license manifest from selected assets and sidecar .license files.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        asset_paths: { type: 'array', items: { type: 'string' } },
        output_path: { type: 'string' },
        default_license: { type: 'string' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const assets = resolveAssetList(target.projectRoot, args.assetPaths);
      if ('error' in assets) return failure(assets.error);
      const entries = assets.assets.map((asset) => {
        const sidecar = readLicenseSidecar(asset.absolutePath);
        return {
          asset_path: asset.resPath,
          license: sidecar.license || args.defaultLicense || 'UNKNOWN',
          author: sidecar.metadata.Author || sidecar.metadata.author || null,
          source: sidecar.metadata.Source || sidecar.metadata.source || null,
          license_file: sidecar.relativePath ? normalizeSlashes(relative(target.projectRoot, sidecar.relativePath)) : null,
          size_bytes: existsSync(asset.absolutePath) ? statSync(asset.absolutePath).size : 0,
        };
      });
      const manifest = {
        status: 'success',
        generated_at: new Date().toISOString(),
        asset_count: entries.length,
        entries,
      };
      if (args.outputPath) {
        const output = resolveProjectFile(target.projectRoot, args.outputPath);
        if ('error' in output) return failure(output.error);
        mkdirSync(dirname(output.absolutePath), { recursive: true });
        writeFileSync(output.absolutePath, JSON.stringify(manifest, null, 2), 'utf8');
        return jsonResponse({ ...manifest, output_path: output.relativePath });
      }
      return jsonResponse(manifest);
    },
  };
}

function importSettingsPayload(importFile: ImportFile, assetType: string): Record<string, any> {
  return {
    status: 'success',
    asset_path: importFile.assetPath,
    import_path: importFile.importPath,
    asset_type: assetType,
    importer: importFile.sections.remap?.importer ?? null,
    resource_type: importFile.sections.remap?.type ?? null,
    uid: importFile.sections.remap?.uid ?? null,
    settings: importFile.sections.params || {},
  };
}

function applySettings(importFile: ImportFile, settings: Record<string, any>): { changedKeys: string[] } {
  if (!importFile.sections.params) {
    importFile.sections.params = {};
    if (!importFile.sectionOrder.includes('params')) importFile.sectionOrder.push('params');
  }
  const changedKeys: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    const current = importFile.sections.params[key];
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      importFile.sections.params[key] = value;
      changedKeys.push(key);
    }
  }
  return { changedKeys };
}

function loadImportFile(projectRoot: string, assetPath: string): { data: ImportFile } | { error: string } {
  const asset = resolveProjectFile(projectRoot, assetPath.replace(/\.import$/i, ''));
  if ('error' in asset) return asset;
  const importRelative = `${asset.relativePath}.import`;
  const importAbsolute = join(projectRoot, importRelative);
  if (!existsSync(importAbsolute)) {
    return { error: `import file not found: ${importRelative}` };
  }
  const parsed = parseImportFile(readFileSync(importAbsolute, 'utf8'));
  return {
    data: {
      sections: parsed.sections,
      sectionOrder: parsed.sectionOrder,
      assetPath: asset.resPath,
      importPath: normalizeSlashes(importRelative),
      importAbsolutePath: importAbsolute,
    },
  };
}

function parseImportFile(source: string): { sections: ImportSections; sectionOrder: string[] } {
  const sections: ImportSections = {};
  const sectionOrder: string[] = [];
  let currentSection = '';
  for (const rawLine of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections[currentSection]) sections[currentSection] = {};
      if (!sectionOrder.includes(currentSection)) sectionOrder.push(currentSection);
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1 || !currentSection) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    sections[currentSection][key] = parseImportValue(value);
  }
  return { sections, sectionOrder };
}

function writeImportFile(importFile: ImportFile): void {
  const sections = [...importFile.sectionOrder];
  for (const section of Object.keys(importFile.sections)) {
    if (!sections.includes(section)) sections.push(section);
  }
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`[${section}]`);
    const values = importFile.sections[section] || {};
    for (const [key, value] of Object.entries(values)) {
      lines.push(`${key}=${formatImportValue(value)}`);
    }
    lines.push('');
  }
  writeFileSync(importFile.importAbsolutePath, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

function parseImportValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

function formatImportValue(value: any): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'string') {
    if (looksLikeGodotExpression(value)) return value;
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return JSON.stringify(value);
}

function looksLikeGodotExpression(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    /^[A-Za-z_][A-Za-z0-9_]*\(/.test(trimmed)
  );
}

function detectAssetType(importFile: ImportFile): string {
  const importer = String(importFile.sections.remap?.importer || '').toLowerCase();
  if (importer.includes('texture')) return 'texture';
  if (['wav', 'oggvorbis', 'mp3'].includes(importer) || importer.includes('audio')) return 'audio';
  if (['scene', 'gltf', 'fbx', 'obj'].includes(importer) || importer.includes('scene')) return 'model';
  const ext = extname(importFile.assetPath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.tga'].includes(ext)) return 'texture';
  if (['.wav', '.ogg', '.mp3'].includes(ext)) return 'audio';
  if (['.gltf', '.glb', '.fbx', '.obj'].includes(ext)) return 'model';
  return 'unknown';
}

async function executeJsonOperation(ctx: ServerContext, projectRoot: string, operation: string, params: Record<string, any>): Promise<{ data: any } | { error: string }> {
  try {
    const result = await ctx.executeOperation(operation, params, projectRoot);
    const parsed = parseGodotJson(result.stdout);
    if (!parsed) {
      return { error: result.stderr || result.stdout || `No JSON result returned by ${operation}` };
    }
    if (parsed.success === false) {
      return { error: parsed.reason || parsed.message || `${operation} failed` };
    }
    return { data: parsed };
  } catch (error: any) {
    return { error: error?.message || String(error) };
  }
}

function parseGodotJson(stdout: string): any | null {
  const lines = stdout.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  return null;
}

function resolveAssetList(projectRoot: string, assetPaths: any): { assets: ResolvedFile[] } | { error: string } {
  const paths = arrayOfStrings(assetPaths);
  const selected = paths.length > 0 ? paths : scanProjectAssets(projectRoot);
  const assets: ResolvedFile[] = [];
  for (const assetPath of selected) {
    const resolved = resolveProjectFile(projectRoot, assetPath);
    if ('error' in resolved) return resolved;
    assets.push(resolved);
  }
  return { assets };
}

function scanProjectAssets(projectRoot: string): string[] {
  return listFiles(projectRoot)
    .filter((file) => ASSET_EXTENSIONS.has(extname(file).toLowerCase()))
    .filter((file) => !file.includes('/.godot/'))
    .sort();
}

function listFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.godot') continue;
      const absolute = join(dir, entry.name);
      const rel = normalizeSlashes(relative(root, absolute));
      if (entry.isDirectory()) {
        visit(absolute);
      } else {
        result.push(rel);
      }
    }
  };
  visit(root);
  return result;
}

function findReferences(projectRoot: string, searchableFiles: string[], resPath: string, relativePath: string): any[] {
  const references: any[] = [];
  const needles = [resPath, relativePath].filter((value, index, values) => values.indexOf(value) === index);
  for (const file of searchableFiles) {
    const absolute = join(projectRoot, file);
    const lines = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n').split('\n');
    lines.forEach((line, lineIndex) => {
      if (needles.some((needle) => line.includes(needle))) {
        references.push({
          path: file,
          line: lineIndex + 1,
          text: line.trim(),
        });
      }
    });
  }
  return references;
}

function readLicenseSidecar(assetAbsolutePath: string): { license: string | null; metadata: Record<string, string>; relativePath?: string } {
  const candidates = [
    `${assetAbsolutePath}.license`,
    `${assetAbsolutePath}.LICENSE`,
    `${assetAbsolutePath}.lic`,
    join(dirname(assetAbsolutePath), 'LICENSE'),
    join(dirname(assetAbsolutePath), 'LICENSE.txt'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const lines = readFileSync(candidate, 'utf8').replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
    const metadata: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) metadata[match[1].trim()] = match[2].trim();
    }
    return {
      license: lines[0] || null,
      metadata,
      relativePath: candidate,
    };
  }
  return { license: null, metadata: {} };
}

function importProfilePath(projectRoot: string, profileName: string): { absolutePath: string; relativePath: string } {
  const filename = `${sanitizeProfileName(profileName)}.json`;
  const relativePath = normalizeSlashes(join('.godot-mcp', 'import_profiles', filename));
  return {
    absolutePath: join(projectRoot, relativePath),
    relativePath,
  };
}

function sanitizeProfileName(value: string): string {
  return String(value || 'profile')
    .replace(/\.json$/i, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profile';
}

function cleanSettings(value: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, settingValue] of Object.entries(value)) {
    if (typeof key === 'string' && key.trim()) result[key] = settingValue;
  }
  return result;
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): ResolvedProject | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  if (!existsSync(join(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  }
  return { projectRoot };
}

function resolveProjectFile(projectRoot: string, candidate: string): ResolvedFile | { error: string } {
  if (!candidate) return { error: 'path is required' };
  const local = normalizeResourcePath(candidate);
  const absolutePath = isAbsolute(local) ? resolve(local) : resolve(projectRoot, local);
  const rel = relative(projectRoot, absolutePath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    return { error: `Path escapes project: ${candidate}` };
  }
  const relativePath = normalizeSlashes(rel);
  return {
    absolutePath,
    relativePath,
    resPath: `res://${relativePath}`,
  };
}

function normalizeResourcePath(value: string): string {
  return String(value).replace(/^res:\/\//, '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function toResPath(value: string): string {
  const normalized = normalizeResourcePath(value);
  return `res://${normalized}`;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function arrayOfStrings(value: any): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
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
    assetPath: args.assetPath ?? args.asset_path,
    assetPaths: args.assetPaths ?? args.asset_paths,
    profileName: args.profileName ?? args.profile_name,
    textureSettings: args.textureSettings ?? args.texture_settings,
    audioSettings: args.audioSettings ?? args.audio_settings,
    modelSettings: args.modelSettings ?? args.model_settings,
    dryRun: args.dryRun ?? args.dry_run,
    outputPath: args.outputPath ?? args.output_path,
    maxTotalBytes: args.maxTotalBytes ?? args.max_total_bytes,
    perAssetBudgetBytes: args.perAssetBudgetBytes ?? args.per_asset_budget_bytes,
    waitForCompletion: args.waitForCompletion ?? args.wait_for_completion,
    defaultLicense: args.defaultLicense ?? args.default_license,
  };
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
