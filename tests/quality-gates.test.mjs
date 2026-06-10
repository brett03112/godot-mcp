import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerQualityGateTools } from '../build/tools/quality-gates.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    budget_name: 'budgetName',
    output_path: 'outputPath',
    profile_id: 'profileId',
    baseline_profile_id: 'baselineProfileId',
    current_profile_id: 'currentProfileId',
    max_regression_percent: 'maxRegressionPercent',
    min_avg_fps: 'minAvgFps',
    min_min_fps: 'minMinFps',
    max_frame_time_ms: 'maxFrameTimeMs',
    max_draw_calls: 'maxDrawCalls',
    max_static_memory_mb: 'maxStaticMemoryMb',
    max_texture_memory_mb: 'maxTextureMemoryMb',
    max_node_count: 'maxNodeCount',
    max_export_size_bytes: 'maxExportSizeBytes',
    max_total_bytes: 'maxTotalBytes',
    per_file_budget_bytes: 'perFileBudgetBytes',
    export_paths: 'exportPaths',
    scene_paths: 'scenePaths',
    profile_samples: 'profileSamples',
    gate_name: 'gateName',
    run_checks: 'runChecks',
    dry_run: 'dryRun',
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
  registerQualityGateTools(registry, ctx);
  return registry;
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-quality-gates-'));
  await mkdir(join(projectPath, '.mcp_profiling'), { recursive: true });
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await mkdir(join(projectPath, 'exports'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="QualityGates"\n');
  await writeFile(join(projectPath, 'exports', 'game.zip'), '1234567890');
  await writeFile(join(projectPath, 'scenes', 'main.tscn'), [
    '[gd_scene format=3]',
    '[node name="Root" type="Node2D"]',
    '[node name="Player" type="Node2D" parent="."]',
    '[node name="Sprite" type="Sprite2D" parent="Player"]',
    '',
  ].join('\n'));
  await writeProfile(projectPath, 'profile_baseline', [
    profileSample({ fps: 60, drawCalls: 90, staticMemory: 80, textureMemory: 20, nodes: 3 }),
    profileSample({ fps: 58, drawCalls: 100, staticMemory: 82, textureMemory: 21, nodes: 3 }),
  ]);
  await writeProfile(projectPath, 'profile_current', [
    profileSample({ fps: 55, drawCalls: 120, staticMemory: 96, textureMemory: 25, nodes: 4 }),
    profileSample({ fps: 50, drawCalls: 125, staticMemory: 98, textureMemory: 26, nodes: 4 }),
  ]);
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

async function writeProfile(projectPath, profileId, samples) {
  await writeFile(join(projectPath, '.mcp_profiling', `${profileId}.json`), JSON.stringify({
    samples,
    duration: samples.at(-1)?.time ?? 0,
    sample_count: samples.length,
  }, null, 2));
}

function profileSample({ fps, drawCalls, staticMemory, textureMemory, nodes }) {
  return {
    time: 0,
    fps,
    frame_time: 1 / Math.max(fps, 1),
    process_time: 0.004,
    physics_time: 0.002,
    render_draw_calls: drawCalls,
    render_total_draw_calls_in_frame: drawCalls,
    memory_static: staticMemory * 1024 * 1024,
    render_texture_mem_used: textureMemory * 1024 * 1024,
    object_node_count: nodes,
    object_resource_count: 12,
    object_count: 24,
  };
}

test('Phase 4.8 quality gate tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'performance_budget_create',
    'performance_budget_check',
    'runtime_profile_capture',
    'runtime_profile_compare',
    'memory_snapshot',
    'node_count_budget_check',
    'draw_call_budget_check',
    'texture_memory_budget_check',
    'export_size_budget_check',
    'quality_gate_run',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('performance budgets are stored project-locally and checked against profile summaries', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const created = parseResponse(await registry.dispatch('performance_budget_create', {
      project_path: projectPath,
      budget_name: 'pre-export',
      min_avg_fps: 50,
      min_min_fps: 45,
      max_frame_time_ms: 25,
      max_draw_calls: 150,
      max_static_memory_mb: 128,
      max_texture_memory_mb: 32,
      max_node_count: 10,
      max_export_size_bytes: 20,
      export_paths: ['exports/game.zip'],
    }));
    assert.equal(created.status, 'success');
    assert.equal(created.budget_path, '.godot-mcp/performance_budgets/pre-export.json');
    assert.equal((await stat(join(projectPath, '.godot-mcp', 'performance_budgets', 'pre-export.json'))).isFile(), true);

    const passing = parseResponse(await registry.dispatch('performance_budget_check', {
      project_path: projectPath,
      budget_name: 'pre-export',
      profile_id: 'profile_current',
    }));
    assert.equal(passing.status, 'success');
    assert.equal(passing.failed_checks, 0);
    assert.equal(passing.summary.min_fps, 50);

    const failing = parseResponse(await registry.dispatch('performance_budget_check', {
      project_path: projectPath,
      profile_id: 'profile_current',
      max_draw_calls: 90,
      max_static_memory_mb: 90,
    }));
    assert.equal(failing.status, 'failed');
    assert.equal(failing.failed_checks, 2);
    assert.deepEqual(failing.checks.filter((check) => check.status === 'failed').map((check) => check.metric).sort(), [
      'max_draw_calls',
      'max_static_memory_mb',
    ]);
  });
});

test('runtime profile capture, compare, and memory snapshot use project profile artifacts', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const captured = parseResponse(await registry.dispatch('runtime_profile_capture', {
      project_path: projectPath,
      profile_id: 'profile_new',
      profile_samples: [
        profileSample({ fps: 61, drawCalls: 88, staticMemory: 75, textureMemory: 18, nodes: 3 }),
        profileSample({ fps: 60, drawCalls: 92, staticMemory: 76, textureMemory: 19, nodes: 3 }),
      ],
    }));
    assert.equal(captured.status, 'success');
    assert.equal(captured.profile_id, 'profile_new');
    assert.equal(captured.summary.avg_fps, 60.5);

    const compare = parseResponse(await registry.dispatch('runtime_profile_compare', {
      project_path: projectPath,
      baseline_profile_id: 'profile_baseline',
      current_profile_id: 'profile_current',
      max_regression_percent: 10,
    }));
    assert.equal(compare.status, 'failed');
    assert.equal(compare.regressions.some((entry) => entry.metric === 'avg_fps'), true);
    assert.equal(compare.regressions.some((entry) => entry.metric === 'max_draw_calls'), true);

    const memory = parseResponse(await registry.dispatch('memory_snapshot', {
      project_path: projectPath,
      profile_id: 'profile_current',
      output_path: '.godot-mcp/memory_snapshot.json',
    }));
    assert.equal(memory.status, 'success');
    assert.equal(memory.snapshot.static_memory_mb, 98);
    assert.equal(memory.snapshot.texture_memory_mb, 26);
    assert.equal((await stat(join(projectPath, '.godot-mcp', 'memory_snapshot.json'))).isFile(), true);
  });
});

test('individual budget checks report precise failures and recommendations', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const nodeCount = parseResponse(await registry.dispatch('node_count_budget_check', {
      project_path: projectPath,
      scene_paths: ['scenes/main.tscn'],
      max_node_count: 2,
    }));
    assert.equal(nodeCount.status, 'failed');
    assert.equal(nodeCount.node_count, 3);
    assert.match(nodeCount.recommendations[0], /scene complexity/i);

    const drawCalls = parseResponse(await registry.dispatch('draw_call_budget_check', {
      project_path: projectPath,
      profile_id: 'profile_current',
      max_draw_calls: 100,
    }));
    assert.equal(drawCalls.status, 'failed');
    assert.equal(drawCalls.value, 125);

    const textureMemory = parseResponse(await registry.dispatch('texture_memory_budget_check', {
      project_path: projectPath,
      profile_id: 'profile_current',
      max_texture_memory_mb: 20,
    }));
    assert.equal(textureMemory.status, 'failed');
    assert.equal(textureMemory.value_mb, 26);

    const exportSize = parseResponse(await registry.dispatch('export_size_budget_check', {
      project_path: projectPath,
      export_paths: ['exports/game.zip'],
      max_total_bytes: 9,
      per_file_budget_bytes: 9,
    }));
    assert.equal(exportSize.status, 'failed');
    assert.equal(exportSize.total_bytes, 10);
    assert.equal(exportSize.violations.length, 2);
  });
});

test('quality_gate_run composes a named gate into pass/fail results', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    await registry.dispatch('performance_budget_create', {
      project_path: projectPath,
      budget_name: 'pre-export',
      min_avg_fps: 54,
      min_min_fps: 48,
      max_draw_calls: 130,
      max_static_memory_mb: 100,
      max_texture_memory_mb: 30,
      max_node_count: 4,
      max_export_size_bytes: 20,
      export_paths: ['exports/game.zip'],
    });

    const gate = parseResponse(await registry.dispatch('quality_gate_run', {
      project_path: projectPath,
      gate_name: 'pre-export',
      budget_name: 'pre-export',
      profile_id: 'profile_current',
      scene_paths: ['scenes/main.tscn'],
      run_checks: ['performance', 'memory', 'node_count', 'draw_calls', 'texture_memory', 'export_size'],
    }));
    assert.equal(gate.status, 'failed');
    assert.equal(gate.gate_name, 'pre-export');
    assert.equal(gate.results.length, 6);
    assert.deepEqual(gate.results.filter((result) => result.status === 'failed').map((result) => result.check).sort(), [
      'performance',
    ]);
    assert.match(gate.recommendations.join('\n'), /Average FPS/);
  });
});
