/**
 * Performance, memory, and quality gate tools for Phase 4.8.
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

interface ResolvedProject {
  projectRoot: string;
}

interface ResolvedFile {
  absolutePath: string;
  relativePath: string;
  resPath: string;
}

interface ProfileLoadResult {
  profileId: string;
  profilePath: string;
  absolutePath: string;
  data: any;
  summary: ProfileSummary;
}

interface ProfileSummary {
  avg_fps: number;
  min_fps: number;
  max_fps: number;
  avg_frame_time_ms: number;
  max_frame_time_ms: number;
  avg_draw_calls: number;
  max_draw_calls: number;
  avg_static_memory_mb: number;
  max_static_memory_mb: number;
  avg_texture_memory_mb: number;
  max_texture_memory_mb: number;
  avg_node_count: number;
  max_node_count: number;
  avg_resource_count: number;
  max_resource_count: number;
  sample_count: number;
}

interface BudgetCheck {
  metric: string;
  status: 'success' | 'failed';
  value: number;
  threshold: number;
  comparator: '>=' | '<=';
  recommendation: string;
}

const BUDGET_DIR = '.godot-mcp/performance_budgets';
const PROFILE_DIR = '.mcp_profiling';
const SNAPSHOT_DIR = '.godot-mcp';

const PROFILE_EXT = '.json';

export function registerQualityGateTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    performanceBudgetCreate(ctx),
    performanceBudgetCheck(ctx),
    runtimeProfileCapture(ctx),
    runtimeProfileCompare(ctx),
    memorySnapshot(ctx),
    nodeCountBudgetCheck(ctx),
    drawCallBudgetCheck(ctx),
    textureMemoryBudgetCheck(ctx),
    exportSizeBudgetCheck(ctx),
    qualityGateRun(ctx),
  ]);
}

function performanceBudgetCreate(ctx: ServerContext): ToolDefinition {
  return {
    name: 'performance_budget_create',
    description: 'Create or replace a project-local named performance budget under .godot-mcp/performance_budgets.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        budget_name: { type: 'string' },
        description: { type: 'string' },
        min_avg_fps: { type: 'number' },
        min_min_fps: { type: 'number' },
        max_frame_time_ms: { type: 'number' },
        max_draw_calls: { type: 'number' },
        max_static_memory_mb: { type: 'number' },
        max_texture_memory_mb: { type: 'number' },
        max_node_count: { type: 'number' },
        max_export_size_bytes: { type: 'number' },
        export_paths: { type: 'array', items: { type: 'string' } },
        scene_paths: { type: 'array', items: { type: 'string' } },
        overwrite: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'budget_name'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      if (!args.budgetName) return failure('budget_name is required');

      const pathInfo = budgetPath(project.projectRoot, args.budgetName);
      if (existsSync(pathInfo.absolutePath) && args.overwrite === false) {
        return failure(`budget already exists: ${pathInfo.relativePath}`);
      }

      const now = new Date().toISOString();
      const budget = {
        budget_name: sanitizeName(args.budgetName),
        description: args.description || '',
        thresholds: thresholdsFromArgs(args),
        export_paths: arrayOfStrings(args.exportPaths),
        scene_paths: arrayOfStrings(args.scenePaths),
        created_at: now,
        updated_at: now,
      };

      if (!args.dryRun) {
        mkdirSync(dirname(pathInfo.absolutePath), { recursive: true });
        writeFileSync(pathInfo.absolutePath, JSON.stringify(budget, null, 2), 'utf8');
      }

      return jsonResponse({
        status: 'success',
        dry_run: Boolean(args.dryRun),
        budget_path: pathInfo.relativePath,
        budget,
      });
    },
  };
}

function performanceBudgetCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'performance_budget_check',
    description: 'Check a profile summary against a named or inline performance budget.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        budget_name: { type: 'string' },
        profile_id: { type: 'string' },
        min_avg_fps: { type: 'number' },
        min_min_fps: { type: 'number' },
        max_frame_time_ms: { type: 'number' },
        max_draw_calls: { type: 'number' },
        max_static_memory_mb: { type: 'number' },
        max_texture_memory_mb: { type: 'number' },
        max_node_count: { type: 'number' },
        max_export_size_bytes: { type: 'number' },
        export_paths: { type: 'array', items: { type: 'string' } },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const result = runPerformanceBudgetCheck(ctx, args);
      return resultToResponse(result);
    },
  };
}

function runtimeProfileCapture(ctx: ServerContext): ToolDefinition {
  return {
    name: 'runtime_profile_capture',
    description: 'Persist runtime profile samples or summarize an existing project-local profile artifact.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        profile_id: { type: 'string' },
        profile_samples: { type: 'array', items: { type: 'object' } },
        duration_seconds: { type: 'number' },
        sample_interval: { type: 'number' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path'],
    },
    timeout: 120000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);

      const suppliedSamples = Array.isArray(args.profileSamples) ? args.profileSamples : null;
      if (!suppliedSamples) {
        const existing = loadProfile(project.projectRoot, args.profileId);
        if ('error' in existing) {
          return jsonResponse({
            status: 'unavailable',
            reason: 'No profile_samples were provided and no existing profile artifact could be loaded.',
            detail: existing.error,
            recommendation: 'Run start_profiler first, pass profile_samples, or provide an existing profile_id.',
          });
        }
        return jsonResponse({
          status: 'success',
          captured: false,
          profile_id: existing.profileId,
          profile_path: existing.profilePath,
          sample_count: existing.summary.sample_count,
          summary: existing.summary,
        });
      }

      const profileId = sanitizeProfileId(args.profileId || `profile_${Date.now()}`);
      const profile = profilePath(project.projectRoot, profileId);
      const data = {
        samples: suppliedSamples,
        duration: durationFromSamples(suppliedSamples),
        sample_count: suppliedSamples.length,
        captured_at: new Date().toISOString(),
      };
      const summary = summarizeProfile(suppliedSamples);
      if (!args.dryRun) {
        mkdirSync(dirname(profile.absolutePath), { recursive: true });
        writeFileSync(profile.absolutePath, JSON.stringify(data, null, 2), 'utf8');
      }
      return jsonResponse({
        status: 'success',
        captured: true,
        dry_run: Boolean(args.dryRun),
        profile_id: profileId,
        profile_path: profile.relativePath,
        sample_count: suppliedSamples.length,
        summary,
      });
    },
  };
}

function runtimeProfileCompare(ctx: ServerContext): ToolDefinition {
  return {
    name: 'runtime_profile_compare',
    description: 'Compare two runtime profile summaries and fail when regressions exceed a percentage budget.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        baseline_profile_id: { type: 'string' },
        current_profile_id: { type: 'string' },
        max_regression_percent: { type: 'number' },
      }),
      required: ['project_path', 'baseline_profile_id', 'current_profile_id'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const baseline = loadProfile(project.projectRoot, args.baselineProfileId);
      if ('error' in baseline) return failure(baseline.error);
      const current = loadProfile(project.projectRoot, args.currentProfileId);
      if ('error' in current) return failure(current.error);
      const maxRegression = numberOrDefault(args.maxRegressionPercent, 10);
      const comparisons = compareProfiles(baseline.summary, current.summary);
      const regressions = comparisons.filter((entry) => entry.regression_percent > maxRegression);
      return jsonResponse({
        status: regressions.length > 0 ? 'failed' : 'success',
        max_regression_percent: maxRegression,
        baseline_profile_id: baseline.profileId,
        current_profile_id: current.profileId,
        comparisons,
        regressions,
        recommendations: regressions.map((entry) => regressionRecommendation(entry)),
      }, regressions.length > 0);
    },
  };
}

function memorySnapshot(ctx: ServerContext): ToolDefinition {
  return {
    name: 'memory_snapshot',
    description: 'Create a structured memory snapshot from a runtime profile artifact.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        profile_id: { type: 'string' },
        output_path: { type: 'string' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const profile = loadProfile(project.projectRoot, args.profileId);
      if ('error' in profile) return failure(profile.error);
      const snapshot = {
        profile_id: profile.profileId,
        static_memory_mb: profile.summary.max_static_memory_mb,
        texture_memory_mb: profile.summary.max_texture_memory_mb,
        node_count: profile.summary.max_node_count,
        resource_count: profile.summary.max_resource_count,
        sample_count: profile.summary.sample_count,
      };
      let outputPath: string | null = null;
      if (args.outputPath) {
        const output = resolveProjectFile(project.projectRoot, args.outputPath);
        if ('error' in output) return failure(output.error);
        mkdirSync(dirname(output.absolutePath), { recursive: true });
        writeFileSync(output.absolutePath, JSON.stringify({ status: 'success', snapshot }, null, 2), 'utf8');
        outputPath = output.relativePath;
      }
      return jsonResponse({
        status: 'success',
        snapshot,
        output_path: outputPath,
      });
    },
  };
}

function nodeCountBudgetCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'node_count_budget_check',
    description: 'Count nodes in selected scenes and fail when the total exceeds a budget.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        scene_paths: { type: 'array', items: { type: 'string' } },
        max_node_count: { type: 'number' },
      }),
      required: ['project_path', 'max_node_count'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const result = runNodeCountCheck(ctx, args);
      return resultToResponse(result);
    },
  };
}

function drawCallBudgetCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'draw_call_budget_check',
    description: 'Check max draw calls from a runtime profile against a budget.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        profile_id: { type: 'string' },
        max_draw_calls: { type: 'number' },
      }),
      required: ['project_path', 'max_draw_calls'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const result = runDrawCallCheck(ctx, args);
      return resultToResponse(result);
    },
  };
}

function textureMemoryBudgetCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'texture_memory_budget_check',
    description: 'Check texture memory from a runtime profile against a megabyte budget.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        profile_id: { type: 'string' },
        max_texture_memory_mb: { type: 'number' },
      }),
      required: ['project_path', 'max_texture_memory_mb'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const result = runTextureMemoryCheck(ctx, args);
      return resultToResponse(result);
    },
  };
}

function exportSizeBudgetCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'export_size_budget_check',
    description: 'Check exported files or directories against total and per-file byte budgets.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        export_paths: { type: 'array', items: { type: 'string' } },
        max_total_bytes: { type: 'number' },
        per_file_budget_bytes: { type: 'number' },
      }),
      required: ['project_path', 'export_paths'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const result = runExportSizeCheck(ctx, args);
      return resultToResponse(result);
    },
  };
}

function qualityGateRun(ctx: ServerContext): ToolDefinition {
  return {
    name: 'quality_gate_run',
    description: 'Run a named quality gate and produce pass/fail results with recommendations.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        gate_name: { type: 'string' },
        budget_name: { type: 'string' },
        profile_id: { type: 'string' },
        scene_paths: { type: 'array', items: { type: 'string' } },
        export_paths: { type: 'array', items: { type: 'string' } },
        run_checks: { type: 'array', items: { type: 'string' } },
      }),
      required: ['project_path'],
    },
    timeout: 120000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const budget = args.budgetName ? loadBudget(project.projectRoot, args.budgetName) : null;
      if (budget && 'error' in budget) return failure(budget.error);
      const mergedArgs = mergeBudgetArgs(args, budget && 'data' in budget ? budget.data : null);
      const checks = arrayOfStrings(args.runChecks);
      const selectedChecks = checks.length > 0
        ? checks
        : ['performance', 'memory', 'node_count', 'draw_calls', 'texture_memory', 'export_size'];

      const results: any[] = [];
      for (const check of selectedChecks) {
        if (check === 'performance') {
          results.push({ check, ...stripPayload(runPerformanceBudgetCheck(ctx, mergedArgs)) });
        } else if (check === 'memory') {
          results.push({ check, ...stripPayload(runMemoryCheck(ctx, mergedArgs)) });
        } else if (check === 'node_count') {
          results.push({ check, ...stripPayload(runNodeCountCheck(ctx, mergedArgs)) });
        } else if (check === 'draw_calls') {
          results.push({ check, ...stripPayload(runDrawCallCheck(ctx, mergedArgs)) });
        } else if (check === 'texture_memory') {
          results.push({ check, ...stripPayload(runTextureMemoryCheck(ctx, mergedArgs)) });
        } else if (check === 'export_size') {
          results.push({ check, ...stripPayload(runExportSizeCheck(ctx, mergedArgs)) });
        } else {
          results.push({
            check,
            status: 'failed',
            reason: `Unknown quality gate check: ${check}`,
            recommendations: [`Remove or implement the unknown check "${check}".`],
          });
        }
      }

      const failed = results.filter((result) => result.status === 'failed');
      const recommendations = uniqueStrings(results.flatMap((result) => arrayOfStrings(result.recommendations)));
      return jsonResponse({
        status: failed.length > 0 ? 'failed' : 'success',
        gate_name: args.gateName || args.budgetName || 'quality-gate',
        budget_name: args.budgetName || null,
        results,
        failed_checks: failed.length,
        recommendations,
      }, failed.length > 0);
    },
  };
}

function runPerformanceBudgetCheck(ctx: ServerContext, args: any): any {
  const project = resolveProjectRoot(ctx, args.projectPath);
  if ('error' in project) return failedPayload(project.error);
  const budget = args.budgetName ? loadBudget(project.projectRoot, args.budgetName) : null;
  if (budget && 'error' in budget) return failedPayload(budget.error);
  const budgetData = budget && 'data' in budget ? budget.data : null;
  const mergedArgs = mergeBudgetArgs(args, budgetData);
  const thresholds = thresholdsFromArgs(mergedArgs);
  const profile = loadProfile(project.projectRoot, mergedArgs.profileId);
  if ('error' in profile) return failedPayload(profile.error);

  const checks = buildBudgetChecks(profile.summary, thresholds);
  if (Number.isFinite(thresholds.max_export_size_bytes)) {
    const exportResult = runExportSizeCheck(ctx, {
      ...mergedArgs,
      maxTotalBytes: thresholds.max_export_size_bytes,
      exportPaths: mergedArgs.exportPaths,
    });
    if (exportResult.status !== 'skipped') {
      checks.push({
        metric: 'max_export_size_bytes',
        status: exportResult.status === 'success' ? 'success' : 'failed',
        value: Number(exportResult.total_bytes || 0),
        threshold: Number(thresholds.max_export_size_bytes),
        comparator: '<=',
        recommendation: exportResult.status === 'success'
          ? 'Export size is within budget.'
          : 'Reduce export size by removing unused files, compressing assets, or reviewing export filters.',
      });
    }
  }

  const failed = checks.filter((check) => check.status === 'failed');
  return {
    status: failed.length > 0 ? 'failed' : 'success',
    budget_name: mergedArgs.budgetName || null,
    profile_id: profile.profileId,
    profile_path: profile.profilePath,
    summary: profile.summary,
    checks,
    failed_checks: failed.length,
    recommendations: failed.map((check) => check.recommendation),
  };
}

function runMemoryCheck(ctx: ServerContext, args: any): any {
  const project = resolveProjectRoot(ctx, args.projectPath);
  if ('error' in project) return failedPayload(project.error);
  const profile = loadProfile(project.projectRoot, args.profileId);
  if ('error' in profile) return failedPayload(profile.error);
  const thresholds = thresholdsFromArgs(args);
  const checks = buildBudgetChecks(profile.summary, {
    max_static_memory_mb: thresholds.max_static_memory_mb,
    max_texture_memory_mb: thresholds.max_texture_memory_mb,
  });
  const failed = checks.filter((check) => check.status === 'failed');
  return {
    status: failed.length > 0 ? 'failed' : 'success',
    profile_id: profile.profileId,
    snapshot: {
      static_memory_mb: profile.summary.max_static_memory_mb,
      texture_memory_mb: profile.summary.max_texture_memory_mb,
      node_count: profile.summary.max_node_count,
      resource_count: profile.summary.max_resource_count,
    },
    checks,
    recommendations: failed.map((check) => check.recommendation),
  };
}

function runNodeCountCheck(ctx: ServerContext, args: any): any {
  const project = resolveProjectRoot(ctx, args.projectPath);
  if ('error' in project) return failedPayload(project.error);
  const scenePaths = arrayOfStrings(args.scenePaths);
  const selectedScenes = scenePaths.length > 0 ? scenePaths : listProjectFiles(project.projectRoot).filter((file) => extname(file) === '.tscn');
  const scenes = selectedScenes.map((scenePath) => {
    const resolved = resolveProjectFile(project.projectRoot, scenePath);
    if ('error' in resolved || !existsSync(resolved.absolutePath)) {
      return { scene_path: scenePath, node_count: 0, error: 'scene not found' };
    }
    return {
      scene_path: resolved.relativePath,
      node_count: countSceneNodes(resolved.absolutePath),
    };
  });
  const nodeCount = scenes.reduce((sum, scene) => sum + scene.node_count, 0);
  const maxNodeCount = numberOrUndefined(args.maxNodeCount);
  const violations = Number.isFinite(maxNodeCount) && nodeCount > Number(maxNodeCount)
    ? [{ kind: 'node_count_over_budget', node_count: nodeCount, budget: Number(maxNodeCount) }]
    : [];
  return {
    status: violations.length > 0 ? 'failed' : 'success',
    node_count: nodeCount,
    max_node_count: maxNodeCount ?? null,
    scene_count: scenes.length,
    scenes,
    violations,
    recommendations: violations.length > 0
      ? ['Reduce scene complexity by instancing repeated structures, pooling runtime nodes, or splitting dense scenes.']
      : ['Scene complexity is within the node-count budget.'],
  };
}

function runDrawCallCheck(ctx: ServerContext, args: any): any {
  const project = resolveProjectRoot(ctx, args.projectPath);
  if ('error' in project) return failedPayload(project.error);
  const profile = loadProfile(project.projectRoot, args.profileId);
  if ('error' in profile) return failedPayload(profile.error);
  const threshold = numberOrUndefined(args.maxDrawCalls);
  if (!Number.isFinite(threshold)) return failedPayload('max_draw_calls is required');
  const value = profile.summary.max_draw_calls;
  const failed = value > Number(threshold);
  return {
    status: failed ? 'failed' : 'success',
    profile_id: profile.profileId,
    metric: 'max_draw_calls',
    value,
    threshold,
    recommendations: failed
      ? ['Reduce draw calls by batching materials, merging static geometry, using MultiMesh, or reducing visible CanvasItems.']
      : ['Draw calls are within budget.'],
  };
}

function runTextureMemoryCheck(ctx: ServerContext, args: any): any {
  const project = resolveProjectRoot(ctx, args.projectPath);
  if ('error' in project) return failedPayload(project.error);
  const profile = loadProfile(project.projectRoot, args.profileId);
  if ('error' in profile) return failedPayload(profile.error);
  const threshold = numberOrUndefined(args.maxTextureMemoryMb);
  if (!Number.isFinite(threshold)) return failedPayload('max_texture_memory_mb is required');
  const value = profile.summary.max_texture_memory_mb;
  const failed = value > Number(threshold);
  return {
    status: failed ? 'failed' : 'success',
    profile_id: profile.profileId,
    metric: 'max_texture_memory_mb',
    value_mb: value,
    threshold_mb: threshold,
    recommendations: failed
      ? ['Reduce texture memory by using import compression, mipmap policy, atlas packing, or lower-resolution source textures.']
      : ['Texture memory is within budget.'],
  };
}

function runExportSizeCheck(ctx: ServerContext, args: any): any {
  const project = resolveProjectRoot(ctx, args.projectPath);
  if ('error' in project) return failedPayload(project.error);
  const exportPaths = arrayOfStrings(args.exportPaths);
  if (exportPaths.length === 0) {
    return {
      status: 'skipped',
      reason: 'No export_paths were provided.',
      recommendations: ['Provide export_paths or store them in the named budget.'],
    };
  }
  const entries = exportPaths.map((entryPath) => {
    const resolved = resolveProjectFile(project.projectRoot, entryPath);
    if ('error' in resolved || !existsSync(resolved.absolutePath)) {
      return { export_path: entryPath, size_bytes: 0, exists: false };
    }
    return {
      export_path: resolved.relativePath,
      size_bytes: sizeOfPath(resolved.absolutePath),
      exists: true,
    };
  });
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size_bytes, 0);
  const maxTotalBytes = numberOrUndefined(args.maxTotalBytes ?? args.maxExportSizeBytes);
  const perFileBudgetBytes = numberOrUndefined(args.perFileBudgetBytes);
  const violations: any[] = [];
  if (Number.isFinite(maxTotalBytes) && totalBytes > Number(maxTotalBytes)) {
    violations.push({
      kind: 'total_export_size_over_budget',
      total_bytes: totalBytes,
      budget_bytes: Number(maxTotalBytes),
    });
  }
  for (const entry of entries) {
    if (Number.isFinite(perFileBudgetBytes) && entry.size_bytes > Number(perFileBudgetBytes)) {
      violations.push({
        kind: 'export_file_size_over_budget',
        export_path: entry.export_path,
        size_bytes: entry.size_bytes,
        budget_bytes: Number(perFileBudgetBytes),
      });
    }
    if (!entry.exists) {
      violations.push({
        kind: 'export_missing',
        export_path: entry.export_path,
      });
    }
  }
  return {
    status: violations.length > 0 ? 'failed' : 'success',
    total_bytes: totalBytes,
    max_total_bytes: maxTotalBytes ?? null,
    per_file_budget_bytes: perFileBudgetBytes ?? null,
    exports: entries,
    violations,
    recommendations: violations.length > 0
      ? ['Reduce export size by reviewing included resources, compression settings, and export preset filters.']
      : ['Export size is within budget.'],
  };
}

function buildBudgetChecks(summary: ProfileSummary, thresholds: Record<string, any>): BudgetCheck[] {
  const checks: BudgetCheck[] = [];
  addMinCheck(checks, 'min_avg_fps', summary.avg_fps, thresholds.min_avg_fps, (value, threshold) => (
    `Average FPS ${value} is below minimum ${threshold}; profile frame spikes and expensive scripts.`
  ));
  addMinCheck(checks, 'min_min_fps', summary.min_fps, thresholds.min_min_fps, (value, threshold) => (
    `Minimum FPS ${value} is below minimum ${threshold}; investigate loading spikes, physics, and GC pauses.`
  ));
  addMaxCheck(checks, 'max_frame_time_ms', summary.max_frame_time_ms, thresholds.max_frame_time_ms, (value, threshold) => (
    `Peak frame time ${value}ms exceeds ${threshold}ms; inspect slow _process and _physics_process paths.`
  ));
  addMaxCheck(checks, 'max_draw_calls', summary.max_draw_calls, thresholds.max_draw_calls, (value, threshold) => (
    `Draw calls ${value} exceed ${threshold}; batch or merge visible content.`
  ));
  addMaxCheck(checks, 'max_static_memory_mb', summary.max_static_memory_mb, thresholds.max_static_memory_mb, (value, threshold) => (
    `Static memory ${value}MB exceeds ${threshold}MB; review resource lifetimes and loaded scenes.`
  ));
  addMaxCheck(checks, 'max_texture_memory_mb', summary.max_texture_memory_mb, thresholds.max_texture_memory_mb, (value, threshold) => (
    `Texture memory ${value}MB exceeds ${threshold}MB; compress or resize textures.`
  ));
  addMaxCheck(checks, 'max_node_count', summary.max_node_count, thresholds.max_node_count, (value, threshold) => (
    `Node count ${value} exceeds ${threshold}; reduce scene complexity or instance repeated structures.`
  ));
  return checks;
}

function addMinCheck(
  checks: BudgetCheck[],
  metric: string,
  value: number,
  threshold: any,
  recommendation: (value: number, threshold: number) => string,
): void {
  const parsed = numberOrUndefined(threshold);
  if (!Number.isFinite(parsed)) return;
  const failed = value < Number(parsed);
  checks.push({
    metric,
    status: failed ? 'failed' : 'success',
    value,
    threshold: Number(parsed),
    comparator: '>=',
    recommendation: failed ? recommendation(value, Number(parsed)) : `${metric} is within budget.`,
  });
}

function addMaxCheck(
  checks: BudgetCheck[],
  metric: string,
  value: number,
  threshold: any,
  recommendation: (value: number, threshold: number) => string,
): void {
  const parsed = numberOrUndefined(threshold);
  if (!Number.isFinite(parsed)) return;
  const failed = value > Number(parsed);
  checks.push({
    metric,
    status: failed ? 'failed' : 'success',
    value,
    threshold: Number(parsed),
    comparator: '<=',
    recommendation: failed ? recommendation(value, Number(parsed)) : `${metric} is within budget.`,
  });
}

function compareProfiles(baseline: ProfileSummary, current: ProfileSummary): any[] {
  return [
    compareHigherIsBetter('avg_fps', baseline.avg_fps, current.avg_fps),
    compareHigherIsBetter('min_fps', baseline.min_fps, current.min_fps),
    compareLowerIsBetter('max_frame_time_ms', baseline.max_frame_time_ms, current.max_frame_time_ms),
    compareLowerIsBetter('max_draw_calls', baseline.max_draw_calls, current.max_draw_calls),
    compareLowerIsBetter('max_static_memory_mb', baseline.max_static_memory_mb, current.max_static_memory_mb),
    compareLowerIsBetter('max_texture_memory_mb', baseline.max_texture_memory_mb, current.max_texture_memory_mb),
    compareLowerIsBetter('max_node_count', baseline.max_node_count, current.max_node_count),
  ];
}

function compareHigherIsBetter(metric: string, baseline: number, current: number): any {
  const regressionPercent = baseline <= 0 ? 0 : ((baseline - current) / baseline) * 100;
  return {
    metric,
    direction: 'higher_is_better',
    baseline,
    current,
    regression_percent: round(Math.max(0, regressionPercent), 2),
  };
}

function compareLowerIsBetter(metric: string, baseline: number, current: number): any {
  const regressionPercent = baseline <= 0 ? 0 : ((current - baseline) / baseline) * 100;
  return {
    metric,
    direction: 'lower_is_better',
    baseline,
    current,
    regression_percent: round(Math.max(0, regressionPercent), 2),
  };
}

function regressionRecommendation(entry: any): string {
  if (entry.metric.includes('fps')) return `${entry.metric} regressed by ${entry.regression_percent}%; profile frame timing before export.`;
  if (entry.metric.includes('draw')) return `${entry.metric} regressed by ${entry.regression_percent}%; review batching and visible scene complexity.`;
  if (entry.metric.includes('memory')) return `${entry.metric} regressed by ${entry.regression_percent}%; review loaded resources and import settings.`;
  return `${entry.metric} regressed by ${entry.regression_percent}%; inspect the changed content before export.`;
}

function summarizeProfile(samples: any[]): ProfileSummary {
  const normalized = samples.map((sample) => ({
    fps: numeric(sample.fps ?? sample.TIME_FPS ?? sample.time_fps),
    frameTimeMs: frameTimeMs(sample.frame_time ?? sample.frameTime ?? sample.frame_time_seconds ?? sample.frame_time_ms),
    drawCalls: numeric(sample.render_draw_calls ?? sample.render_total_draw_calls_in_frame ?? sample.draw_calls ?? sample.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
    staticMemoryMb: memoryMb(sample.memory_static ?? sample.static_memory_bytes ?? sample.static_memory_mb ?? sample.MEMORY_STATIC),
    textureMemoryMb: memoryMb(sample.render_texture_mem_used ?? sample.texture_memory_bytes ?? sample.texture_memory_mb ?? sample.RENDER_TEXTURE_MEM_USED),
    nodeCount: numeric(sample.object_node_count ?? sample.node_count ?? sample.OBJECT_NODE_COUNT),
    resourceCount: numeric(sample.object_resource_count ?? sample.resource_count ?? sample.OBJECT_RESOURCE_COUNT),
  }));
  const fps = normalized.map((sample) => sample.fps);
  const frameTimes = normalized.map((sample) => sample.frameTimeMs);
  const drawCalls = normalized.map((sample) => sample.drawCalls);
  const staticMemory = normalized.map((sample) => sample.staticMemoryMb);
  const textureMemory = normalized.map((sample) => sample.textureMemoryMb);
  const nodeCounts = normalized.map((sample) => sample.nodeCount);
  const resourceCounts = normalized.map((sample) => sample.resourceCount);
  return {
    avg_fps: round(avg(fps), 1),
    min_fps: round(min(fps), 1),
    max_fps: round(max(fps), 1),
    avg_frame_time_ms: round(avg(frameTimes), 2),
    max_frame_time_ms: round(max(frameTimes), 2),
    avg_draw_calls: Math.round(avg(drawCalls)),
    max_draw_calls: Math.round(max(drawCalls)),
    avg_static_memory_mb: round(avg(staticMemory), 1),
    max_static_memory_mb: round(max(staticMemory), 1),
    avg_texture_memory_mb: round(avg(textureMemory), 1),
    max_texture_memory_mb: round(max(textureMemory), 1),
    avg_node_count: Math.round(avg(nodeCounts)),
    max_node_count: Math.round(max(nodeCounts)),
    avg_resource_count: Math.round(avg(resourceCounts)),
    max_resource_count: Math.round(max(resourceCounts)),
    sample_count: samples.length,
  };
}

function loadProfile(projectRoot: string, profileId?: string): ProfileLoadResult | { error: string } {
  const selectedProfileId = profileId ? sanitizeProfileId(profileId) : latestProfileId(projectRoot);
  if (!selectedProfileId) return { error: 'No profile artifacts found under .mcp_profiling' };
  const pathInfo = profilePath(projectRoot, selectedProfileId);
  if (!existsSync(pathInfo.absolutePath)) return { error: `profile not found: ${pathInfo.relativePath}` };
  try {
    const data = JSON.parse(readFileSync(pathInfo.absolutePath, 'utf8'));
    const samples = Array.isArray(data.samples) ? data.samples : [];
    if (samples.length === 0) return { error: `profile has no samples: ${pathInfo.relativePath}` };
    return {
      profileId: selectedProfileId,
      profilePath: pathInfo.relativePath,
      absolutePath: pathInfo.absolutePath,
      data,
      summary: summarizeProfile(samples),
    };
  } catch (error: any) {
    return { error: `failed to parse profile ${pathInfo.relativePath}: ${error?.message || String(error)}` };
  }
}

function latestProfileId(projectRoot: string): string | null {
  const dir = join(projectRoot, PROFILE_DIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(PROFILE_EXT))
    .sort()
    .reverse();
  return files.length > 0 ? files[0].slice(0, -PROFILE_EXT.length) : null;
}

function loadBudget(projectRoot: string, budgetName: string): { data: any; path: string } | { error: string } {
  const pathInfo = budgetPath(projectRoot, budgetName);
  if (!existsSync(pathInfo.absolutePath)) return { error: `budget not found: ${pathInfo.relativePath}` };
  try {
    return {
      data: JSON.parse(readFileSync(pathInfo.absolutePath, 'utf8')),
      path: pathInfo.relativePath,
    };
  } catch (error: any) {
    return { error: `failed to parse budget ${pathInfo.relativePath}: ${error?.message || String(error)}` };
  }
}

function mergeBudgetArgs(args: any, budget: any | null): any {
  if (!budget) return args;
  const thresholds = budget.thresholds || {};
  return {
    ...args,
    minAvgFps: args.minAvgFps ?? thresholds.min_avg_fps,
    minMinFps: args.minMinFps ?? thresholds.min_min_fps,
    maxFrameTimeMs: args.maxFrameTimeMs ?? thresholds.max_frame_time_ms,
    maxDrawCalls: args.maxDrawCalls ?? thresholds.max_draw_calls,
    maxStaticMemoryMb: args.maxStaticMemoryMb ?? thresholds.max_static_memory_mb,
    maxTextureMemoryMb: args.maxTextureMemoryMb ?? thresholds.max_texture_memory_mb,
    maxNodeCount: args.maxNodeCount ?? thresholds.max_node_count,
    maxExportSizeBytes: args.maxExportSizeBytes ?? thresholds.max_export_size_bytes,
    exportPaths: arrayOfStrings(args.exportPaths).length > 0 ? args.exportPaths : budget.export_paths,
    scenePaths: arrayOfStrings(args.scenePaths).length > 0 ? args.scenePaths : budget.scene_paths,
  };
}

function thresholdsFromArgs(args: any): Record<string, any> {
  const thresholds: Record<string, any> = {};
  const entries: Array<[string, any]> = [
    ['min_avg_fps', args.minAvgFps],
    ['min_min_fps', args.minMinFps],
    ['max_frame_time_ms', args.maxFrameTimeMs],
    ['max_draw_calls', args.maxDrawCalls],
    ['max_static_memory_mb', args.maxStaticMemoryMb],
    ['max_texture_memory_mb', args.maxTextureMemoryMb],
    ['max_node_count', args.maxNodeCount],
    ['max_export_size_bytes', args.maxExportSizeBytes],
  ];
  for (const [key, value] of entries) {
    const numericValue = numberOrUndefined(value);
    if (Number.isFinite(numericValue)) thresholds[key] = Number(numericValue);
  }
  return thresholds;
}

function budgetPath(projectRoot: string, budgetName: string): { absolutePath: string; relativePath: string } {
  const filename = `${sanitizeName(budgetName)}.json`;
  const relativePath = normalizeSlashes(join(BUDGET_DIR, filename));
  return {
    absolutePath: join(projectRoot, relativePath),
    relativePath,
  };
}

function profilePath(projectRoot: string, profileId: string): { absolutePath: string; relativePath: string } {
  const filename = `${sanitizeProfileId(profileId)}${PROFILE_EXT}`;
  const relativePath = normalizeSlashes(join(PROFILE_DIR, filename));
  return {
    absolutePath: join(projectRoot, relativePath),
    relativePath,
  };
}

function countSceneNodes(sceneAbsolutePath: string): number {
  const source = readFileSync(sceneAbsolutePath, 'utf8');
  return source.split(/\r?\n/).filter((line) => /^\s*\[node\b/.test(line)).length;
}

function listProjectFiles(projectRoot: string): string[] {
  const result: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.godot') continue;
      const absolute = join(dir, entry.name);
      const rel = normalizeSlashes(relative(projectRoot, absolute));
      if (entry.isDirectory()) {
        visit(absolute);
      } else {
        result.push(rel);
      }
    }
  };
  visit(projectRoot);
  return result;
}

function sizeOfPath(absolutePath: string): number {
  const stats = statSync(absolutePath);
  if (stats.isDirectory()) {
    return readdirSync(absolutePath, { withFileTypes: true }).reduce((sum, entry) => (
      sum + sizeOfPath(join(absolutePath, entry.name))
    ), 0);
  }
  return stats.size;
}

function durationFromSamples(samples: any[]): number {
  const times = samples.map((sample) => numeric(sample.time)).filter((value) => Number.isFinite(value));
  return times.length > 0 ? max(times) : samples.length;
}

function frameTimeMs(value: any): number {
  const parsed = numeric(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 1 ? parsed : parsed * 1000;
}

function memoryMb(value: any): number {
  const parsed = numeric(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 1024 * 1024 ? parsed / (1024 * 1024) : parsed;
}

function numeric(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function min(values: number[]): number {
  return values.length ? Math.min(...values) : 0;
}

function max(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
  return String(value || '').replace(/^res:\/\//, '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function sanitizeName(value: string): string {
  return String(value || 'budget')
    .replace(/\.json$/i, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'budget';
}

function sanitizeProfileId(value: string): string {
  return sanitizeName(value).replace(/\.json$/i, '') || `profile_${Date.now()}`;
}

function arrayOfStrings(value: any): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => value && all.indexOf(value) === index);
}

function numberOrUndefined(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberOrDefault(value: any, fallback: number): number {
  const parsed = numberOrUndefined(value);
  return Number.isFinite(parsed) ? Number(parsed) : fallback;
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    budgetName: args.budgetName ?? args.budget_name,
    gateName: args.gateName ?? args.gate_name,
    profileId: args.profileId ?? args.profile_id,
    baselineProfileId: args.baselineProfileId ?? args.baseline_profile_id,
    currentProfileId: args.currentProfileId ?? args.current_profile_id,
    maxRegressionPercent: args.maxRegressionPercent ?? args.max_regression_percent,
    outputPath: args.outputPath ?? args.output_path,
    minAvgFps: args.minAvgFps ?? args.min_avg_fps,
    minMinFps: args.minMinFps ?? args.min_min_fps,
    maxFrameTimeMs: args.maxFrameTimeMs ?? args.max_frame_time_ms,
    maxDrawCalls: args.maxDrawCalls ?? args.max_draw_calls,
    maxStaticMemoryMb: args.maxStaticMemoryMb ?? args.max_static_memory_mb,
    maxTextureMemoryMb: args.maxTextureMemoryMb ?? args.max_texture_memory_mb,
    maxNodeCount: args.maxNodeCount ?? args.max_node_count,
    maxExportSizeBytes: args.maxExportSizeBytes ?? args.max_export_size_bytes,
    maxTotalBytes: args.maxTotalBytes ?? args.max_total_bytes,
    perFileBudgetBytes: args.perFileBudgetBytes ?? args.per_file_budget_bytes,
    exportPaths: args.exportPaths ?? args.export_paths,
    scenePaths: args.scenePaths ?? args.scene_paths,
    profileSamples: args.profileSamples ?? args.profile_samples,
    runChecks: args.runChecks ?? args.run_checks,
    dryRun: args.dryRun ?? args.dry_run,
  };
}

function commonProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    ...extra,
  };
}

function stripPayload(result: any): any {
  const copy = { ...result };
  delete copy.isError;
  return copy;
}

function resultToResponse(result: any): ToolResponse {
  return jsonResponse(result, result.status === 'failed');
}

function failedPayload(reason: string): any {
  return {
    status: 'failed',
    reason,
    recommendations: [reason],
  };
}

function failure(reason: string): ToolResponse {
  return jsonResponse(failedPayload(reason), true);
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
