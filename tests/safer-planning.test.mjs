import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerSaferPlanningTools } from '../build/tools/safer-planning.js';

const PHASE_410_TOOLS = [
  'capability_matrix',
  'recommend_next_tool',
  'plan_feature_implementation',
  'plan_test_strategy',
  'risk_scan',
  'preflight_project_health',
  'postchange_verification_plan',
];

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    available_tools: 'availableTools',
    changed_files: 'changedFiles',
    current_state: 'currentState',
    include_validation: 'includeValidation',
    include_reload_guidance: 'includeReloadGuidance',
    planned_actions: 'plannedActions',
    risk_tolerance: 'riskTolerance',
    max_results: 'maxResults',
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
  registerSaferPlanningTools(registry, ctx);
  return registry;
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-safer-planning-'));
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await mkdir(join(projectPath, 'scripts'), { recursive: true });
  await mkdir(join(projectPath, 'test', 'unit'), { recursive: true });
  await mkdir(join(projectPath, 'addons', 'godot_mcp_live'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), [
    '[application]',
    'config/name="SaferPlanning"',
    '',
    '[autoload]',
    'GameState="*res://scripts/game_state.gd"',
    '',
    '[editor_plugins]',
    'enabled=PackedStringArray("res://addons/godot_mcp_live/plugin.cfg")',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'scenes', 'main.tscn'), '[gd_scene format=3]\n[node name="Main" type="Node2D"]\n');
  await writeFile(join(projectPath, 'scripts', 'player.gd'), 'extends CharacterBody2D\n');
  await writeFile(join(projectPath, 'scripts', 'game_state.gd'), 'extends Node\n');
  await writeFile(join(projectPath, 'test', 'unit', 'test_player.gd'), 'extends GutTest\n');
  await writeFile(join(projectPath, 'addons', 'godot_mcp_live', 'plugin.cfg'), '[plugin]\nname="Godot MCP Live"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

test('Phase 4.10 safer planning tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of PHASE_410_TOOLS) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('capability_matrix filters the available catalog into planning categories', async () => {
  const registry = createRegistry();
  const result = parseResponse(await registry.dispatch('capability_matrix', {
    goal: 'add a pause menu and verify it',
    available_tools: [
      'generate_menu_flow',
      'create_scene',
      'gut_run_test_file',
      'ui_overlap_check',
      'quality_gate_run',
      'mcp_task_create',
      'unrelated_tool',
    ],
  }));

  assert.equal(result.status, 'success');
  assert.equal(result.tool_count, 7);
  assert.equal(result.categories.design_to_scene.available_tools.includes('generate_menu_flow'), true);
  assert.equal(result.categories.testing.available_tools.includes('gut_run_test_file'), true);
  assert.equal(result.categories.visual_qa.available_tools.includes('ui_overlap_check'), true);
  assert.equal(result.matched_tools.includes('generate_menu_flow'), true);
});

test('recommend_next_tool returns a pause-menu tool sequence and validation path', async () => {
  const registry = createRegistry();
  const result = parseResponse(await registry.dispatch('recommend_next_tool', {
    goal: 'add a pause menu',
    available_tools: [
      'plan_feature_implementation',
      'generate_menu_flow',
      'create_scene',
      'add_node',
      'gut_run_test_file',
      'ui_overlap_check',
      'quality_gate_run',
      'mcp_task_create',
    ],
    current_state: 'No pause menu exists yet.',
  }));

  assert.equal(result.status, 'success');
  assert.equal(result.goal_type, 'menu_ui');
  assert.equal(result.recommended_sequence[0].tool, 'plan_feature_implementation');
  assert.equal(result.recommended_sequence.some((step) => step.tool === 'generate_menu_flow'), true);
  assert.equal(result.validation_path.some((step) => step.tool === 'gut_run_test_file'), true);
  assert.equal(result.validation_path.some((step) => step.tool === 'ui_overlap_check'), true);
  assert.match(result.summary, /pause menu/i);
});

test('feature and test planners return implementation, test, and evidence steps', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const featurePlan = parseResponse(await registry.dispatch('plan_feature_implementation', {
      project_path: projectPath,
      goal: 'add a pause menu',
      available_tools: ['generate_menu_flow', 'plan_test_strategy', 'mcp_evidence_attach', 'quality_gate_run'],
    }));

    assert.equal(featurePlan.status, 'success');
    assert.equal(featurePlan.project.found, true);
    assert.equal(featurePlan.implementation_plan.some((step) => step.name === 'Generate or edit menu flow'), true);
    assert.equal(featurePlan.suggested_files.some((file) => file.endsWith('pause_menu.tscn')), true);
    assert.equal(featurePlan.evidence_plan.some((step) => step.tool === 'mcp_evidence_attach'), true);

    const testPlan = parseResponse(await registry.dispatch('plan_test_strategy', {
      project_path: projectPath,
      goal: 'add a pause menu',
      changed_files: ['scenes/pause_menu.tscn', 'scripts/pause_menu.gd'],
    }));

    assert.equal(testPlan.status, 'success');
    assert.equal(testPlan.test_layers.some((layer) => layer.tool === 'gut_run_changed_tests'), true);
    assert.equal(testPlan.test_layers.some((layer) => layer.tool === 'ui_overlap_check'), true);
    assert.equal(testPlan.commands.some((command) => command.includes('npm test')), true);
  });
});

test('risk_scan and preflight_project_health inspect project facts before changes', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const risks = parseResponse(await registry.dispatch('risk_scan', {
      project_path: projectPath,
      goal: 'change autoload and addon behavior for a pause menu',
      changed_files: ['project.godot', 'addons/godot_mcp_live/plugin.gd', 'scenes/main.tscn'],
      planned_actions: ['enable addon', 'edit autoload', 'save scene'],
    }));

    assert.equal(risks.status, 'success');
    assert.equal(risks.risks.some((risk) => risk.category === 'project_settings'), true);
    assert.equal(risks.risks.some((risk) => risk.category === 'live_addon_reload'), true);
    assert.equal(risks.required_verification.some((step) => step.includes('session_list')), true);

    const health = parseResponse(await registry.dispatch('preflight_project_health', {
      project_path: projectPath,
    }));

    assert.equal(health.status, 'success');
    assert.equal(health.checks.project_godot_exists.status, 'pass');
    assert.equal(health.inventory.scene_count, 1);
    assert.equal(health.inventory.script_count, 2);
    assert.equal(health.inventory.test_count, 1);
    assert.equal(health.recommended_tools.includes('lsp_status'), true);
  });
});

test('postchange_verification_plan identifies reload and layered verification needs', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const plan = parseResponse(await registry.dispatch('postchange_verification_plan', {
      project_path: projectPath,
      goal: 'add safer planning tools',
      changed_files: [
        'src/tools/safer-planning.ts',
        'src/index.ts',
        'test_mcp_enhancements/addons/godot_mcp_live/plugin.gd',
      ],
      include_reload_guidance: true,
    }));

    assert.equal(plan.status, 'success');
    assert.equal(plan.commands.some((entry) => entry.command === 'npm run build'), true);
    assert.equal(plan.commands.some((entry) => entry.command === 'npm test'), true);
    assert.equal(plan.godot_checks.some((entry) => entry.includes('headless editor smoke')), true);
    assert.equal(plan.reload.required, true);
    assert.match(plan.reload.reason, /addon|connector|editor/i);
  });
});
