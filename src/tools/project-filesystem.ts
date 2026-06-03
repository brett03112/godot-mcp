/**
 * Project and filesystem helper tools for Phase 1.3.
 */

import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

type ProjectSection = {
  name: string | null;
  lines: string[];
};

type ProjectSetting = {
  section: string;
  key: string;
  path: string;
  value: any;
  raw: string;
};

type ProjectFile = {
  content: string;
  lineEnding: string;
  sections: ProjectSection[];
};

type ProjectFileEntry = {
  absolutePath: string;
  relativePath: string;
  resourcePath: string;
  extension: string;
  size: number;
};

type DependencyEdge = {
  from: string;
  to: string;
  kind: string;
};

const DEFAULT_MAX_RESULTS = 100;
const TEXT_EXTENSIONS = new Set([
  '.gd',
  '.gdshader',
  '.tscn',
  '.tres',
  '.cfg',
  '.godot',
  '.import',
  '.svg',
  '.json',
  '.txt',
  '.md',
  '.csv',
  '.translation',
]);
const UID_SIDECAR_EXTENSIONS = new Set(['.gd', '.gdshader']);
const DEFAULT_IGNORED_DIRS = new Set(['.godot', '.git', 'node_modules', '.import']);

export function registerProjectFilesystemTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    projectSettingsGet(ctx),
    projectSettingsSet(ctx),
    autoloadList(ctx),
    autoloadAdd(ctx),
    autoloadRemove(ctx),
    filesystemSearch(ctx),
    filesystemReimport(ctx),
    filesystemScan(ctx),
    uidResolve(ctx),
    dependencyGraph(ctx),
    findOrphanedAssets(ctx),
    findMissingUidFiles(ctx),
  ]);
}

function projectSettingsGet(ctx: ServerContext): ToolDefinition {
  return {
    name: 'project_settings_get',
    description: 'Read project.godot settings by setting path, returning parsed values and raw file values.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        setting_path: { type: 'string', description: 'Single setting path, e.g. application/config/name.' },
        setting_paths: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      const settingPaths = normalizeSettingPaths(args);
      try {
        const project = await readProjectFile(target.projectRoot);
        const allSettings = readAllSettings(project);
        const selected = settingPaths.length > 0
          ? allSettings.filter((setting) => settingPaths.includes(setting.path))
          : allSettings;

        const settings: Record<string, any> = {};
        for (const setting of selected) {
          settings[setting.path] = {
            section: setting.section,
            key: setting.key,
            value: setting.value,
            raw: setting.raw,
          };
        }

        return jsonResponse({
          status: 'success',
          project_path: target.projectRoot,
          settings,
          missing: settingPaths.filter((path) => !(path in settings)),
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function projectSettingsSet(ctx: ServerContext): ToolDefinition {
  return {
    name: 'project_settings_set',
    description: 'Safely set one project.godot setting with dry-run and explicit allowlist guardrails.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        setting_path: { type: 'string' },
        setting_value: { description: 'Value to write. Use { raw: "..." } for a preformatted project.godot value.' },
        dry_run: { type: 'boolean' },
        allowed_settings: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_path', 'setting_path', 'setting_value'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.settingPath) return failure('setting_path is required');

      const settingTarget = splitSettingPath(args.settingPath);
      if ('error' in settingTarget) return failure(settingTarget.error);

      const allowedSettings = Array.isArray(args.allowedSettings) ? args.allowedSettings : [];
      if (allowedSettings.length === 0 && !args.dryRun) {
        return failure('allowed_settings is required for writes; use dry_run to preview unrestricted changes');
      }
      if (allowedSettings.length > 0 && !allowedSettings.includes(args.settingPath)) {
        return failure(`${args.settingPath} is not in allowed_settings`);
      }

      try {
        const project = await readProjectFile(target.projectRoot);
        const next = setProjectSetting(project, settingTarget.section, settingTarget.key, formatProjectSetting(ctx, args.settingValue));
        const diff = createUnifiedDiff('project.godot', project.content, next);

        if (args.dryRun) {
          return jsonResponse({
            status: 'dry_run',
            setting_path: args.settingPath,
            changed: project.content !== next,
            diff,
          });
        }

        await writeFile(resolve(target.projectRoot, 'project.godot'), next, 'utf8');
        return jsonResponse({
          status: 'success',
          setting_path: args.settingPath,
          changed: project.content !== next,
          diff,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function autoloadList(ctx: ServerContext): ToolDefinition {
  return {
    name: 'autoload_list',
    description: 'List project.godot autoload singletons with enabled state and resource paths.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        include_disabled: { type: 'boolean' },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      try {
        const project = await readProjectFile(target.projectRoot);
        const autoloads = readAutoloads(project)
          .filter((entry) => args.includeDisabled !== false || entry.enabled);
        return jsonResponse({ status: 'success', autoloads });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function autoloadAdd(ctx: ServerContext): ToolDefinition {
  return {
    name: 'autoload_add',
    description: 'Add or update an autoload singleton entry in project.godot.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        singleton_name: { type: 'string' },
        resource_path: { type: 'string' },
        enabled: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      },
      required: ['project_path', 'singleton_name', 'resource_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!isValidAutoloadName(args.singletonName)) return failure('singleton_name must be a valid Godot identifier');
      const resourcePath = normalizeResourcePath(args.resourcePath);
      if (!resourcePath) return failure('resource_path must be a project resource path');

      try {
        const project = await readProjectFile(target.projectRoot);
        const enabled = args.enabled !== false;
        const value = `"${enabled ? '*' : ''}${resourcePath}"`;
        const next = setProjectSetting(project, 'autoload', args.singletonName, value);
        const diff = createUnifiedDiff('project.godot', project.content, next);

        if (args.dryRun) {
          return jsonResponse({ status: 'dry_run', singleton_name: args.singletonName, resource_path: resourcePath, enabled, diff });
        }

        await writeFile(resolve(target.projectRoot, 'project.godot'), next, 'utf8');
        return jsonResponse({ status: 'success', singleton_name: args.singletonName, resource_path: resourcePath, enabled, diff });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function autoloadRemove(ctx: ServerContext): ToolDefinition {
  return {
    name: 'autoload_remove',
    description: 'Remove an autoload singleton entry from project.godot.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        singleton_name: { type: 'string' },
        dry_run: { type: 'boolean' },
      },
      required: ['project_path', 'singleton_name'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!isValidAutoloadName(args.singletonName)) return failure('singleton_name must be a valid Godot identifier');

      try {
        const project = await readProjectFile(target.projectRoot);
        const next = removeProjectSetting(project, 'autoload', args.singletonName);
        const diff = createUnifiedDiff('project.godot', project.content, next);

        if (args.dryRun) {
          return jsonResponse({ status: 'dry_run', singleton_name: args.singletonName, changed: project.content !== next, diff });
        }

        await writeFile(resolve(target.projectRoot, 'project.godot'), next, 'utf8');
        return jsonResponse({ status: 'success', singleton_name: args.singletonName, changed: project.content !== next, diff });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function filesystemSearch(ctx: ServerContext): ToolDefinition {
  return {
    name: 'filesystem_search',
    description: 'Search project files by glob, class name, resource type, and text content.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        glob: { type: 'string' },
        class_name: { type: 'string' },
        resource_type: { type: 'string' },
        text_query: { type: 'string' },
        scan_paths: { type: 'array', items: { type: 'string' } },
        max_results: { type: 'number' },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      try {
        const entries = await walkProject(target.projectRoot, args.scanPaths);
        const maxResults = positiveInteger(args.maxResults, DEFAULT_MAX_RESULTS);
        const globMatcher = args.glob ? globToRegExp(args.glob) : null;
        const matches: any[] = [];

        for (const entry of entries) {
          if (globMatcher && !globMatcher.test(entry.relativePath)) {
            continue;
          }

          const reasons: string[] = [];
          let content: string | null = null;
          if (args.className || args.resourceType || args.textQuery) {
            content = await readTextIfSupported(entry.absolutePath, entry.extension);
          }

          if (args.className) {
            if (!content || !new RegExp(`(^|\\n)\\s*class_name\\s+${escapeRegex(args.className)}\\b`).test(content)) {
              continue;
            }
            reasons.push('class_name');
          }

          if (args.resourceType) {
            const resourceType = content ? detectResourceType(content) : null;
            if (resourceType !== args.resourceType) {
              continue;
            }
            reasons.push('resource_type');
          }

          if (args.textQuery) {
            if (!content || !content.includes(args.textQuery)) {
              continue;
            }
            reasons.push('text_query');
          }

          matches.push({
            path: entry.resourcePath,
            relative_path: entry.relativePath,
            extension: entry.extension,
            size: entry.size,
            reasons: reasons.length ? reasons : ['glob'],
          });

          if (matches.length >= maxResults) {
            break;
          }
        }

        return jsonResponse({
          status: 'success',
          count: matches.length,
          truncated: matches.length >= maxResults,
          matches,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function filesystemReimport(ctx: ServerContext): ToolDefinition {
  return {
    name: 'filesystem_reimport',
    description: 'Ask Godot to refresh imports for a project. Non-live mode runs Godot import for the whole project.',
    timeout: 120000,
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        import_paths: { type: 'array', items: { type: 'string' }, description: 'Selected resources to report; non-live import is project-wide.' },
        wait_for_completion: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      try {
        const godotPath = await ctx.getGodotPath();
        const command = [godotPath, '--headless', '--path', target.projectRoot, '--import', '--quit'];
        const importPaths = Array.isArray(args.importPaths)
          ? args.importPaths.map((path: string) => normalizeResourcePath(path)).filter(Boolean)
          : [];

        if (args.dryRun) {
          return jsonResponse({
            status: 'dry_run',
            command,
            import_paths: importPaths,
            note: 'Non-live filesystem_reimport invokes Godot import for the whole project; selected import_paths are returned for caller traceability.',
          });
        }

        const result = await runCommand(command[0], command.slice(1), args.waitForCompletion !== false);
        return jsonResponse({
          status: result.exit_code === 0 ? 'success' : 'failed',
          command,
          import_paths: importPaths,
          exit_code: result.exit_code,
          stdout: result.stdout,
          stderr: result.stderr,
          note: 'Non-live filesystem_reimport invokes Godot import for the whole project.',
        }, result.exit_code !== 0);
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function filesystemScan(ctx: ServerContext): ToolDefinition {
  return {
    name: 'filesystem_scan',
    description: 'Scan the project filesystem and return file counts, extension counts, and resource summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        scan_paths: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      try {
        const entries = await walkProject(target.projectRoot, args.scanPaths);
        const byExtension: Record<string, number> = {};
        const resources: any[] = [];
        for (const entry of entries) {
          byExtension[entry.extension] = (byExtension[entry.extension] || 0) + 1;
          if (['.tscn', '.tres'].includes(entry.extension)) {
            const content = await readTextIfSupported(entry.absolutePath, entry.extension);
            resources.push({
              path: entry.resourcePath,
              type: content ? detectResourceType(content) : null,
              uid: content ? detectEmbeddedUid(content) : null,
            });
          }
        }

        return jsonResponse({
          status: 'success',
          total_files: entries.length,
          by_extension: byExtension,
          resources,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function uidResolve(ctx: ServerContext): ToolDefinition {
  return {
    name: 'uid_resolve',
    description: 'Resolve a uid:// value to project resources, or return the UID for a resource path.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        uid_or_path: { type: 'string' },
        resource_path: { type: 'string' },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const query = args.uidOrPath ?? args.resourcePath;
      if (!query) return failure('uid_or_path or resource_path is required');

      try {
        const entries = await buildUidIndex(target.projectRoot);
        const normalizedPath = normalizeResourcePath(query);
        const matches = entries.filter((entry) => {
          if (query.startsWith('uid://')) return entry.uid === query;
          return normalizedPath ? entry.path === normalizedPath : false;
        });

        return jsonResponse({
          status: matches.length > 0 ? 'success' : 'not_found',
          query,
          uid: normalizedPath && matches[0] ? matches[0].uid : undefined,
          matches,
        }, matches.length === 0);
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function dependencyGraph(ctx: ServerContext): ToolDefinition {
  return {
    name: 'dependency_graph',
    description: 'Build a lightweight dependency graph across project.godot, scenes, scripts, and text resources.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        scan_paths: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      try {
        const graph = await buildDependencyGraph(target.projectRoot, args.scanPaths);
        return jsonResponse({
          status: 'success',
          nodes: graph.nodes,
          edges: graph.edges,
          missing: graph.missing,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function findOrphanedAssets(ctx: ServerContext): ToolDefinition {
  return {
    name: 'find_orphaned_assets',
    description: 'Report project files that have no inbound dependency from project.godot, scenes, scripts, or resources.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        scan_paths: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      try {
        const graph = await buildDependencyGraph(target.projectRoot, args.scanPaths);
        const inbound = new Set(graph.edges.map((edge) => edge.to));
        const roots = new Set(graph.edges.filter((edge) => edge.from === 'res://project.godot').map((edge) => edge.to));
        const orphaned = graph.nodes
          .filter((node) => isOrphanCandidate(node.path))
          .filter((node) => !inbound.has(node.path) && !roots.has(node.path))
          .map((node) => ({
            path: node.path,
            extension: node.extension,
            size: node.size,
          }));

        return jsonResponse({
          status: 'success',
          orphaned_assets: orphaned,
          count: orphaned.length,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function findMissingUidFiles(ctx: ServerContext): ToolDefinition {
  return {
    name: 'find_missing_uid_files',
    description: 'Find script and shader files that do not have Godot .uid sidecar files.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        scan_paths: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);

      try {
        const entries = await walkProject(target.projectRoot, args.scanPaths);
        const missing = entries
          .filter((entry) => UID_SIDECAR_EXTENSIONS.has(entry.extension))
          .filter((entry) => !existsSync(`${entry.absolutePath}.uid`))
          .map((entry) => ({
            path: entry.resourcePath,
            expected_uid_path: `${entry.resourcePath}.uid`,
          }));

        return jsonResponse({
          status: 'success',
          missing_uid_files: missing,
          count: missing.length,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    settingPath: args.settingPath ?? args.setting_path,
    settingPaths: args.settingPaths ?? args.setting_paths,
    settingValue: args.settingValue ?? args.setting_value,
    dryRun: args.dryRun ?? args.dry_run ?? false,
    allowedSettings: args.allowedSettings ?? args.allowed_settings,
    singletonName: args.singletonName ?? args.singleton_name,
    resourcePath: args.resourcePath ?? args.resource_path,
    includeDisabled: args.includeDisabled ?? args.include_disabled,
    scanPaths: args.scanPaths ?? args.scan_paths,
    className: args.className ?? args.class_name,
    resourceType: args.resourceType ?? args.resource_type,
    textQuery: args.textQuery ?? args.text_query,
    maxResults: args.maxResults ?? args.max_results,
    importPaths: args.importPaths ?? args.import_paths,
    waitForCompletion: args.waitForCompletion ?? args.wait_for_completion,
    uidOrPath: args.uidOrPath ?? args.uid_or_path,
  };
}

function normalizeSettingPaths(args: any): string[] {
  const paths = new Set<string>();
  if (typeof args.settingPath === 'string') paths.add(args.settingPath);
  if (Array.isArray(args.settingPaths)) {
    for (const path of args.settingPaths) {
      if (typeof path === 'string') paths.add(path);
    }
  }
  return Array.from(paths);
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): { projectRoot: string } | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  if (!existsSync(resolve(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  }
  return { projectRoot };
}

async function readProjectFile(projectRoot: string): Promise<ProjectFile> {
  const content = await readFile(resolve(projectRoot, 'project.godot'), 'utf8');
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  const normalized = normalizeNewlines(content);
  const sections: ProjectSection[] = [{ name: null, lines: [] }];

  for (const line of normalized.split('\n')) {
    const sectionMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      sections.push({ name: sectionMatch[1], lines: [] });
      continue;
    }
    sections[sections.length - 1].lines.push(line);
  }

  return { content, lineEnding, sections };
}

function renderProjectFile(project: ProjectFile, sections = project.sections): string {
  const lines: string[] = [];
  for (const section of sections) {
    if (section.name !== null) {
      lines.push(`[${section.name}]`);
    }
    lines.push(...section.lines);
  }
  return denormalizeNewlines(lines.join('\n'), project.lineEnding);
}

function readAllSettings(project: ProjectFile): ProjectSetting[] {
  const settings: ProjectSetting[] = [];
  for (const section of project.sections) {
    if (!section.name) continue;
    for (const line of section.lines) {
      const parsed = parseSettingLine(line);
      if (!parsed) continue;
      settings.push({
        section: section.name,
        key: parsed.key,
        path: `${section.name}/${parsed.key}`,
        value: parseProjectValue(parsed.raw),
        raw: parsed.raw,
      });
    }
  }
  return settings;
}

function readAutoloads(project: ProjectFile): any[] {
  const section = project.sections.find((item) => item.name === 'autoload');
  if (!section) return [];
  const autoloads: any[] = [];
  for (const line of section.lines) {
    const parsed = parseSettingLine(line);
    if (!parsed) continue;
    const value = parseProjectValue(parsed.raw);
    if (typeof value !== 'string') continue;
    const enabled = value.startsWith('*');
    const resourcePath = enabled ? value.slice(1) : value;
    autoloads.push({
      name: parsed.key,
      path: resourcePath,
      enabled,
      raw: parsed.raw,
    });
  }
  return autoloads;
}

function parseSettingLine(line: string): { key: string; raw: string } | null {
  if (!line || line.trimStart().startsWith(';')) return null;
  const match = line.match(/^([^=\s][^=]*?)=(.*)$/);
  if (!match) return null;
  return {
    key: match[1].trim(),
    raw: match[2].trim(),
  };
}

function splitSettingPath(settingPath: string): { section: string; key: string } | { error: string } {
  const slash = settingPath.indexOf('/');
  if (slash <= 0 || slash === settingPath.length - 1) {
    return { error: 'setting_path must use section/key format, e.g. application/config/name' };
  }
  return {
    section: settingPath.slice(0, slash),
    key: settingPath.slice(slash + 1),
  };
}

function setProjectSetting(project: ProjectFile, sectionName: string, key: string, rawValue: string): string {
  const sections = cloneSections(project.sections);
  let section = sections.find((item) => item.name === sectionName);
  if (!section) {
    const last = sections[sections.length - 1];
    if (last && last.lines.length > 0 && last.lines[last.lines.length - 1] !== '') {
      last.lines.push('');
    }
    section = { name: sectionName, lines: [] };
    sections.push(section);
  }

  const nextLine = `${key}=${rawValue}`;
  const existingIndex = section.lines.findIndex((line) => parseSettingLine(line)?.key === key);
  if (existingIndex >= 0) {
    section.lines[existingIndex] = nextLine;
  } else {
    section.lines.push(nextLine);
  }

  return renderProjectFile(project, sections);
}

function removeProjectSetting(project: ProjectFile, sectionName: string, key: string): string {
  const sections = cloneSections(project.sections);
  const section = sections.find((item) => item.name === sectionName);
  if (!section) return project.content;
  section.lines = section.lines.filter((line) => parseSettingLine(line)?.key !== key);
  return renderProjectFile(project, sections);
}

function cloneSections(sections: ProjectSection[]): ProjectSection[] {
  return sections.map((section) => ({
    name: section.name,
    lines: [...section.lines],
  }));
}

function parseProjectValue(raw: string): any {
  if (/^".*"$/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function formatProjectSetting(ctx: ServerContext, value: any): string {
  if (value && typeof value === 'object' && typeof value.raw === 'string') {
    return value.raw;
  }
  return ctx.formatProjectSettingValue(value);
}

function isValidAutoloadName(value: string | undefined): boolean {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function normalizeResourcePath(value: string | undefined): string | null {
  if (!value || value.startsWith('uid://') || value.includes('..')) return null;
  return value.startsWith('res://') ? value : `res://${value.replace(/\\/g, '/')}`;
}

async function walkProject(projectRoot: string, scanPaths?: string[]): Promise<ProjectFileEntry[]> {
  const roots = Array.isArray(scanPaths) && scanPaths.length > 0 ? scanPaths : ['.'];
  const entries: ProjectFileEntry[] = [];

  for (const scanPath of roots) {
    const absolute = resolveProjectPath(projectRoot, scanPath);
    if (!absolute) continue;
    if (existsSync(absolute)) {
      await walkPath(projectRoot, absolute, entries);
    }
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}

async function walkPath(projectRoot: string, currentPath: string, entries: ProjectFileEntry[]): Promise<void> {
  const { readdir, stat } = await import('fs/promises');
  const currentStat = await stat(currentPath);
  if (currentStat.isDirectory()) {
    const dirName = currentPath === projectRoot ? '' : currentPath.split(/[\\/]/).pop() || '';
    if (dirName && DEFAULT_IGNORED_DIRS.has(dirName)) return;
    const children = await readdir(currentPath, { withFileTypes: true });
    for (const child of children) {
      await walkPath(projectRoot, join(currentPath, child.name), entries);
    }
    return;
  }

  if (!currentStat.isFile()) return;
  const relativePath = normalizeRelative(projectRoot, currentPath);
  if (!relativePath) return;
  entries.push({
    absolutePath: currentPath,
    relativePath,
    resourcePath: relativePath === 'project.godot' ? 'res://project.godot' : `res://${relativePath}`,
    extension: relativePath === 'project.godot' ? '.godot' : extname(relativePath),
    size: currentStat.size,
  });
}

function resolveProjectPath(projectRoot: string, candidate: string): string | null {
  if (!candidate || candidate.startsWith('uid://')) return null;
  const localPath = candidate.startsWith('res://') ? candidate.slice('res://'.length) : candidate;
  const absolutePath = isAbsolute(localPath) ? resolve(localPath) : resolve(projectRoot, localPath);
  return normalizeRelative(projectRoot, absolutePath) === null ? null : absolutePath;
}

function normalizeRelative(projectRoot: string, absolutePath: string): string | null {
  const rel = relative(projectRoot, absolutePath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    return absolutePath === projectRoot ? '.' : null;
  }
  return rel.replace(/\\/g, '/');
}

async function readTextIfSupported(filePath: string, extension: string): Promise<string | null> {
  if (!TEXT_EXTENSIONS.has(extension)) return null;
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function detectResourceType(content: string): string | null {
  const match = content.match(/^\[(?:gd_resource|gd_scene)\b[^\]]*\btype="([^"]+)"/m);
  if (match) return match[1];
  if (/^\[gd_scene\b/m.test(content)) return 'PackedScene';
  return null;
}

function detectEmbeddedUid(content: string): string | null {
  return content.match(/^\[(?:gd_resource|gd_scene)\b[^\]]*\buid="([^"]+)"/m)?.[1] || null;
}

async function buildUidIndex(projectRoot: string): Promise<Array<{ uid: string; path: string; source: string }>> {
  const entries = await walkProject(projectRoot);
  const uidEntries: Array<{ uid: string; path: string; source: string }> = [];
  for (const entry of entries) {
    if (entry.relativePath.endsWith('.uid')) {
      const targetPath = entry.resourcePath.replace(/\.uid$/, '');
      const content = (await readFile(entry.absolutePath, 'utf8')).trim();
      if (content) uidEntries.push({ uid: content, path: targetPath, source: entry.resourcePath });
      continue;
    }

    if (['.tscn', '.tres'].includes(entry.extension)) {
      const content = await readTextIfSupported(entry.absolutePath, entry.extension);
      const uid = content ? detectEmbeddedUid(content) : null;
      if (uid) uidEntries.push({ uid, path: entry.resourcePath, source: entry.resourcePath });
    }
  }
  return uidEntries;
}

async function buildDependencyGraph(projectRoot: string, scanPaths?: string[]): Promise<{ nodes: any[]; edges: DependencyEdge[]; missing: any[] }> {
  const entries = await walkProject(projectRoot, scanPaths);
  const entryPaths = new Set(entries.map((entry) => entry.resourcePath));
  const edges: DependencyEdge[] = [];
  const missing: any[] = [];

  const project = await readProjectFile(projectRoot);
  for (const edge of projectSettingEdges(project)) {
    edges.push(edge);
  }

  for (const entry of entries) {
    const content = await readTextIfSupported(entry.absolutePath, entry.extension);
    if (!content) continue;
    for (const dependency of extractResourceDependencies(content)) {
      if (dependency === entry.resourcePath) continue;
      edges.push({ from: entry.resourcePath, to: dependency, kind: dependencyKind(entry.extension) });
    }
  }

  for (const edge of edges) {
    if (!entryPaths.has(edge.to) && edge.to.startsWith('res://')) {
      missing.push(edge);
    }
  }

  return {
    nodes: entries
      .filter((entry) => !entry.relativePath.endsWith('.uid') && !entry.relativePath.endsWith('.import'))
      .map((entry) => ({
        path: entry.resourcePath,
        extension: entry.extension,
        size: entry.size,
      })),
    edges: dedupeEdges(edges),
    missing: dedupeEdges(missing),
  };
}

function projectSettingEdges(project: ProjectFile): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const setting of readAllSettings(project)) {
    if (setting.path === 'application/run/main_scene' && typeof setting.value === 'string') {
      edges.push({ from: 'res://project.godot', to: setting.value, kind: 'main_scene' });
    }
  }
  for (const autoload of readAutoloads(project)) {
    edges.push({ from: 'res://project.godot', to: autoload.path, kind: 'autoload' });
  }
  return edges;
}

function extractResourceDependencies(content: string): string[] {
  const dependencies = new Set<string>();
  const pathRegex = /["'](res:\/\/[^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(content)) !== null) {
    dependencies.add(match[1]);
  }
  return Array.from(dependencies);
}

function dependencyKind(extension: string): string {
  if (extension === '.tscn') return 'scene_resource';
  if (extension === '.gd') return 'script_resource';
  if (extension === '.tres') return 'resource_reference';
  return 'text_reference';
}

function dedupeEdges<T extends DependencyEdge>(edges: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const edge of edges) {
    byKey.set(`${edge.from}\0${edge.to}\0${edge.kind}`, edge);
  }
  return Array.from(byKey.values());
}

function isOrphanCandidate(path: string): boolean {
  if (path === 'res://project.godot') return false;
  if (path.endsWith('.uid') || path.endsWith('.import')) return false;
  return true;
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  let out = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    const afterNext = normalized[index + 2];
    if (char === '*' && next === '*' && afterNext === '/') {
      out += '(?:.*/)?';
      index += 2;
    } else if (char === '*' && next === '*') {
      out += '.*';
      index += 1;
    } else if (char === '*') {
      out += '[^/]*';
    } else if (char === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(char);
    }
  }
  out += '$';
  return new RegExp(out);
}

function positiveInteger(value: any, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function runCommand(command: string, args: string[], waitForCompletion: boolean): Promise<{ exit_code: number; stdout: string; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', rejectRun);
    if (!waitForCompletion) {
      resolveRun({ exit_code: 0, stdout: '', stderr: `Started process ${child.pid ?? 'unknown'}` });
      return;
    }
    child.on('close', (code) => {
      resolveRun({ exit_code: code ?? -1, stdout, stderr });
    });
  });
}

function createUnifiedDiff(filePath: string, original: string, next: string): string {
  if (original === next) return '';
  const originalLines = trimFinalEmptyLine(normalizeNewlines(original).split('\n'));
  const nextLines = trimFinalEmptyLine(normalizeNewlines(next).split('\n'));
  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ -1,${originalLines.length} +1,${nextLines.length} @@`,
    ...originalLines.map((line) => `-${line}`),
    ...nextLines.map((line) => `+${line}`),
  ].join('\n');
}

function trimFinalEmptyLine(lines: string[]): string[] {
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    return lines.slice(0, -1);
  }
  return lines;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function denormalizeNewlines(value: string, lineEnding: string): string {
  return lineEnding === '\n' ? value : value.replace(/\n/g, lineEnding);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
