/**
 * Safer autonomous planning tools for Phase 4.10.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { extname, join, resolve } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';
import { getToolMetadata } from '../toolsets.js';

interface CapabilityCategory {
  key: string;
  title: string;
  phase: string;
  description: string;
  keywords: string[];
  tools: string[];
}

interface ProjectFacts {
  found: boolean;
  root: string | null;
  name: string | null;
  inventory: {
    scene_count: number;
    script_count: number;
    test_count: number;
    addon_count: number;
    asset_count: number;
    autoload_count: number;
    enabled_plugin_count: number;
  };
  files: string[];
  autoloads: string[];
  enabled_plugins: string[];
}

type Severity = 'low' | 'medium' | 'high';

const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
  {
    key: 'planning',
    title: 'Safer Planning',
    phase: '4.10',
    description: 'Plan tool sequences, inspect risk, and define verification before editing.',
    keywords: ['plan', 'planning', 'risk', 'health', 'preflight', 'verification', 'verify', 'sequence', 'recommend'],
    tools: [
      'capability_matrix',
      'recommend_next_tool',
      'plan_feature_implementation',
      'plan_test_strategy',
      'risk_scan',
      'preflight_project_health',
      'postchange_verification_plan',
    ],
  },
  {
    key: 'design_to_scene',
    title: 'Design To Scene',
    phase: '4.1',
    description: 'Generate scenes, menus, HUDs, enemies, collectibles, and small feature packages from briefs.',
    keywords: ['scene', 'menu', 'hud', 'ui', 'pause', 'level', 'brief', 'enemy', 'collectible', 'feature'],
    tools: [
      'generate_scene_from_brief',
      'generate_level_blockout',
      'generate_menu_flow',
      'generate_hud',
      'generate_enemy_archetype',
      'generate_collectible',
      'generate_gameplay_pickup',
      'generate_interactable',
      'generate_scene_validation_plan',
      'generate_feature_from_brief',
      'create_scene',
      'add_node',
    ],
  },
  {
    key: 'gameplay_systems',
    title: 'Gameplay Systems',
    phase: '4.2',
    description: 'Create state machines, character controllers, interaction systems, inventory, dialogue, saves, and settings.',
    keywords: ['gameplay', 'state', 'controller', 'interaction', 'inventory', 'dialogue', 'save', 'settings', 'player'],
    tools: [
      'create_state_machine',
      'add_state',
      'connect_state_transition',
      'generate_character_controller',
      'generate_interaction_system',
      'generate_inventory_system',
      'generate_dialogue_system',
      'generate_save_system',
      'generate_settings_system',
    ],
  },
  {
    key: 'testing',
    title: 'Testing',
    phase: '4.3',
    description: 'Install, discover, generate, and run GUT or gdUnit4 tests, then map failures to likely patches.',
    keywords: ['test', 'tests', 'gut', 'gdunit', 'failure', 'coverage', 'watch', 'qa'],
    tools: [
      'gut_install_or_update',
      'gut_discover_tests',
      'gut_run_test_file',
      'gut_run_changed_tests',
      'gut_run_with_coverage',
      'gdunit4_install_or_update',
      'gdunit4_run_tests',
      'gdunit4_discover_tests',
      'gdunit4_generate_test',
      'test_watch_plan',
      'failure_to_patch_plan',
      'run_tests',
      'create_test_suite',
    ],
  },
  {
    key: 'visual_qa',
    title: 'Visual QA',
    phase: '4.4',
    description: 'Compare screenshots, capture viewports, and check UI overlap, contrast, sprite bounds, and camera framing.',
    keywords: ['visual', 'screenshot', 'overlap', 'contrast', 'viewport', 'camera', 'sprite', 'ui'],
    tools: [
      'screenshot_compare',
      'capture_editor_viewport',
      'capture_runtime_viewport',
      'visual_regression_baseline_create',
      'visual_regression_check',
      'ui_overlap_check',
      'ui_contrast_check',
      'sprite_bounds_check',
      'camera_framing_check',
    ],
  },
  {
    key: 'asset_pipeline',
    title: 'Asset Pipeline',
    phase: '4.5',
    description: 'Control import profiles, import settings, batch reimports, usage reports, size budgets, and licenses.',
    keywords: ['asset', 'texture', 'audio', 'model', 'import', 'reimport', 'license', 'size', 'budget'],
    tools: [
      'asset_import_profile_create',
      'asset_import_profile_apply',
      'texture_import_settings_get',
      'texture_import_settings_set',
      'audio_import_settings_get',
      'audio_import_settings_set',
      'model_import_settings_get',
      'model_import_settings_set',
      'asset_batch_reimport',
      'asset_usage_report',
      'asset_size_budget_check',
      'asset_license_manifest',
      'import_texture',
      'import_audio',
    ],
  },
  {
    key: 'addons_external_tools',
    title: 'Addons And External Tools',
    phase: '4.6',
    description: 'Inspect, install, enable, disable, update, remove, and health-check addons and optional tool adapters.',
    keywords: ['addon', 'plugin', 'asset library', 'external', 'adapter', 'blender', 'aseprite'],
    tools: [
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
      'list_plugins',
      'configure_plugin',
      'install_plugin',
    ],
  },
  {
    key: 'lsp_dap',
    title: 'LSP And DAP',
    phase: '4.7',
    description: 'Use Godot language-server and debug-adapter data for symbols, diagnostics, breakpoints, stack frames, and variables.',
    keywords: ['lsp', 'dap', 'diagnostic', 'symbol', 'definition', 'reference', 'rename', 'debug', 'breakpoint'],
    tools: [
      'lsp_status',
      'lsp_symbols',
      'lsp_definition',
      'lsp_references',
      'lsp_diagnostics',
      'lsp_rename_preview',
      'dap_status',
      'dap_set_breakpoint',
      'dap_clear_breakpoint',
      'dap_stack_trace',
      'dap_variables',
      'dap_continue',
      'dap_step',
    ],
  },
  {
    key: 'quality_gates',
    title: 'Performance, Memory, And Quality Gates',
    phase: '4.8',
    description: 'Create and check performance, memory, node-count, draw-call, texture-memory, export-size, and quality gates.',
    keywords: ['performance', 'memory', 'quality', 'gate', 'fps', 'draw', 'export', 'profile'],
    tools: [
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
    ],
  },
  {
    key: 'task_ledger',
    title: 'Task Ledger And Evidence',
    phase: '4.9',
    description: 'Create tasks, attach evidence, produce session reports, and draft changelogs.',
    keywords: ['task', 'ledger', 'evidence', 'report', 'changelog', 'recommendation'],
    tools: [
      'mcp_task_create',
      'mcp_task_update',
      'mcp_task_list',
      'mcp_task_close',
      'mcp_evidence_attach',
      'mcp_session_report',
      'mcp_changelog_draft',
    ],
  },
  {
    key: 'live_bridge',
    title: 'Live Editor And Runtime Bridge',
    phase: '2-3',
    description: 'Inspect and mutate live editor state, run runtime scenes, drive inputs, assert runtime behavior, and capture logs.',
    keywords: ['live', 'runtime', 'editor', 'session', 'input', 'assert', 'logs', 'play', 'bridge'],
    tools: [
      'session_list',
      'editor_scene_open',
      'editor_selection_get',
      'editor_selection_set',
      'editor_logs_get',
      'runtime_play_scene',
      'runtime_stop',
      'runtime_input_action',
      'runtime_wait_for_condition',
      'runtime_assert_node_exists',
      'runtime_assert_no_errors',
    ],
  },
];

export function registerSaferPlanningTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    capabilityMatrix(ctx),
    recommendNextTool(ctx),
    planFeatureImplementation(ctx),
    planTestStrategy(ctx),
    riskScan(ctx),
    preflightProjectHealth(ctx),
    postchangeVerificationPlan(ctx),
  ]);
}

function capabilityMatrix(ctx: ServerContext): ToolDefinition {
  return {
    name: 'capability_matrix',
    description: 'Map MCP tools into capability categories and highlight tools relevant to a goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string' },
        available_tools: { type: 'array', items: { type: 'string' } },
        category: { type: 'string' },
        max_results: { type: 'number' },
      },
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const availableTools = arrayOfStrings(args.availableTools);
      const goal = stringValue(args.goal);
      const requestedCategory = stringValue(args.category);
      const maxResults = numberOrUndefined(args.maxResults);
      const selected = CAPABILITY_CATEGORIES
        .filter((category) => !requestedCategory || category.key === requestedCategory || category.title.toLowerCase() === requestedCategory.toLowerCase());
      const categories: Record<string, any> = {};
      const matchedTools = new Set<string>();
      const sorted = selected
        .map((category) => ({ category, score: categoryScore(category, goal, availableTools) }))
        .sort((a, b) => b.score - a.score || a.category.key.localeCompare(b.category.key));

      const limited = Number.isFinite(maxResults) && Number(maxResults) >= 0 ? sorted.slice(0, Number(maxResults)) : sorted;
      for (const entry of limited) {
        const available = availableTools.length > 0
          ? entry.category.tools.filter((tool) => availableTools.includes(tool))
          : [...entry.category.tools];
        const goalMatched = goal ? categoryMatchesGoal(entry.category, goal) : false;
        for (const tool of available) {
          if (!goal || goalMatched || toolMatchesGoal(tool, goal)) matchedTools.add(tool);
        }
        categories[entry.category.key] = {
          title: entry.category.title,
          phase: entry.category.phase,
          description: entry.category.description,
          tools: entry.category.tools,
          available_tools: available,
          missing_tools: availableTools.length > 0 ? entry.category.tools.filter((tool) => !availableTools.includes(tool)) : [],
          matched_goal: goalMatched,
          score: entry.score,
        };
      }

      return jsonResponse({
        status: 'success',
        goal,
        tool_count: availableTools.length || uniqueTools(CAPABILITY_CATEGORIES.flatMap((category) => category.tools)).length,
        categories,
        matched_tools: Array.from(matchedTools).sort(),
        recommendations: matrixRecommendations(goal, categories),
      });
    },
  };
}

function recommendNextTool(ctx: ServerContext): ToolDefinition {
  return {
    name: 'recommend_next_tool',
    description: 'Recommend a safer next MCP tool sequence and validation path for a goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string' },
        available_tools: { type: 'array', items: { type: 'string' } },
        current_state: { type: 'string' },
        active_toolsets: { type: 'array', items: { type: 'string' } },
        active_tools: { type: 'array', items: { type: 'string' } },
        project_path: { type: 'string' },
        include_validation: { type: 'boolean' },
      },
      required: ['goal'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const goal = stringValue(args.goal);
      if (!goal) return failure('goal is required');
      const availableTools = arrayOfStrings(args.availableTools);
      const goalType = classifyGoal(goal);
      const sequence = buildRecommendedSequence(goalType, goal, availableTools);
      const validationPath = args.includeValidation === false
        ? []
        : buildValidationPath(goalType, availableTools, []);
      const project = args.projectPath ? inspectProject(ctx, args.projectPath) : null;

      return jsonResponse({
        status: 'success',
        goal,
        goal_type: goalType,
        summary: `For "${goal}", start with planning, use ${sequence.map((step) => step.tool).join(' -> ')}, then verify with ${validationPath.map((step) => step.tool || step.command).join(' -> ')}.`,
        current_state: stringValue(args.currentState),
        project: projectSummary(project),
        recommended_sequence: sequence,
        validation_path: validationPath,
        profile_awareness: profileAwareness(args, [
          ...sequence.map((step) => step.tool).filter(Boolean),
          ...validationPath.map((step) => step.tool).filter(Boolean),
        ]),
        stop_conditions: [
          'Stop before mutation if risk_scan reports an unmitigated high risk.',
          'Stop before completion unless postchange_verification_plan has fresh evidence for each changed surface.',
        ],
      });
    },
  };
}

function planFeatureImplementation(ctx: ServerContext): ToolDefinition {
  return {
    name: 'plan_feature_implementation',
    description: 'Create a scoped implementation plan for a Godot feature, including tools, files, tests, risks, and evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        goal: { type: 'string' },
        available_tools: { type: 'array', items: { type: 'string' } },
        current_state: { type: 'string' },
      },
      required: ['goal'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const goal = stringValue(args.goal);
      if (!goal) return failure('goal is required');
      const goalType = classifyGoal(goal);
      const availableTools = arrayOfStrings(args.availableTools);
      const project = args.projectPath ? inspectProject(ctx, args.projectPath) : null;
      if (project && 'error' in project) return failure(project.error);
      const suggestedFiles = suggestedFeatureFiles(goalType, goal);

      return jsonResponse({
        status: 'success',
        goal,
        goal_type: goalType,
        project: projectSummary(project),
        suggested_files: suggestedFiles,
        implementation_plan: [
          {
            name: 'Preflight project health',
            tool: 'preflight_project_health',
            reason: 'Confirm the project, tests, addons, and likely live reload constraints before editing.',
          },
          {
            name: domainImplementationStepName(goalType),
            tool: preferredDomainTool(goalType, availableTools),
            reason: domainImplementationReason(goalType),
            files: suggestedFiles,
          },
          {
            name: 'Scan implementation risk',
            tool: 'risk_scan',
            reason: 'Catch project settings, scene ownership, addon reload, script parsing, and import risks before mutation.',
          },
          {
            name: 'Plan tests before edits',
            tool: 'plan_test_strategy',
            reason: 'Choose the focused Node, GDScript, visual, live, and quality-gate checks before changing files.',
          },
          {
            name: 'Run post-change verification',
            tool: 'postchange_verification_plan',
            reason: 'Collect build, focused tests, full tests, Godot smoke, and reload proof steps for closeout.',
          },
        ],
        evidence_plan: [
          {
            tool: 'mcp_task_create',
            purpose: 'Open a project-local task before editing if this is user-facing or multi-step work.',
          },
          {
            tool: 'mcp_evidence_attach',
            purpose: 'Attach focused test, full test, Godot smoke, and live proof evidence after verification.',
          },
          {
            tool: 'mcp_session_report',
            purpose: 'Generate a session report when the feature touches multiple files or services.',
          },
        ],
        acceptance_checks: acceptanceChecks(goalType),
        profile_awareness: profileAwareness(args, [
          'preflight_project_health',
          preferredDomainTool(goalType, availableTools),
          'risk_scan',
          'plan_test_strategy',
          'postchange_verification_plan',
          'mcp_task_create',
          'mcp_evidence_attach',
          'mcp_session_report',
        ]),
      });
    },
  };
}

function planTestStrategy(ctx: ServerContext): ToolDefinition {
  return {
    name: 'plan_test_strategy',
    description: 'Plan layered tests and commands for a Godot change based on goal and changed files.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        goal: { type: 'string' },
        changed_files: { type: 'array', items: { type: 'string' } },
        available_tools: { type: 'array', items: { type: 'string' } },
        active_toolsets: { type: 'array', items: { type: 'string' } },
        active_tools: { type: 'array', items: { type: 'string' } },
      },
      required: ['goal'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const goal = stringValue(args.goal);
      if (!goal) return failure('goal is required');
      const changedFiles = normalizeProjectPaths(args.changedFiles);
      const goalType = classifyGoal(goal);
      const project = args.projectPath ? inspectProject(ctx, args.projectPath) : null;
      if (project && 'error' in project) return failure(project.error);

      const layers = buildTestLayers(goalType, changedFiles, project && !('error' in project) ? project : null);
      return jsonResponse({
        status: 'success',
        goal,
        goal_type: goalType,
        changed_files: changedFiles,
        project: projectSummary(project),
        test_layers: layers,
        commands: buildVerificationCommands(changedFiles),
        profile_awareness: profileAwareness(args, layers.map((layer) => layer.tool).filter(Boolean)),
        evidence_to_capture: [
          'Focused RED/GREEN test output for this phase or feature.',
          'Full npm test output.',
          'Godot headless editor smoke exit status and error scan.',
          'Live session/tool call proof when the MCP catalog, addon, runtime, or editor bridge changed.',
        ],
      });
    },
  };
}

function riskScan(ctx: ServerContext): ToolDefinition {
  return {
    name: 'risk_scan',
    description: 'Scan a goal, changed files, and planned actions for Godot MCP implementation risks and verification needs.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        goal: { type: 'string' },
        changed_files: { type: 'array', items: { type: 'string' } },
        planned_actions: { type: 'array', items: { type: 'string' } },
        risk_tolerance: { type: 'string' },
        active_toolsets: { type: 'array', items: { type: 'string' } },
        active_tools: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = args.projectPath ? inspectProject(ctx, args.projectPath) : null;
      if (project && 'error' in project) return failure(project.error);
      const changedFiles = normalizeProjectPaths(args.changedFiles);
      const plannedActions = arrayOfStrings(args.plannedActions);
      const risks = detectRisks(stringValue(args.goal), changedFiles, plannedActions, project && !('error' in project) ? project : null);
      const requiredVerification = requiredVerificationForRisks(risks, changedFiles);

      return jsonResponse({
        status: 'success',
        risk_tolerance: stringValue(args.riskTolerance) || 'normal',
        project: projectSummary(project),
        changed_files: changedFiles,
        planned_actions: plannedActions,
        highest_severity: highestSeverity(risks),
        risks,
        required_verification: requiredVerification,
        profile_awareness: profileAwareness(args, requiredVerification
          .map((entry) => entry.match(/\b[a-z][a-z0-9_]+\b/g) || [])
          .flat()
          .filter((token) => token.includes('_'))),
        recommendation: risks.some((risk) => risk.severity === 'high')
          ? 'Resolve or explicitly verify high-risk items before applying broad changes.'
          : 'Proceed with the planned verification layers.',
      });
    },
  };
}

function preflightProjectHealth(ctx: ServerContext): ToolDefinition {
  return {
    name: 'preflight_project_health',
    description: 'Inspect project-local health signals before autonomous edits.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
      },
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = inspectProject(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const checks = {
        project_godot_exists: check(existsSync(join(project.root || '', 'project.godot')), 'project.godot exists', 'project.godot is missing'),
        has_scenes: check(project.inventory.scene_count > 0, 'Project has at least one scene', 'No .tscn scenes found', 'warn'),
        has_scripts: check(project.inventory.script_count > 0, 'Project has scripts or scriptless scene-only content', 'No .gd scripts found', 'warn'),
        has_tests: check(project.inventory.test_count > 0, 'Project has test files', 'No GUT/gdUnit-style tests found', 'warn'),
        live_addon_present: check(project.enabled_plugins.some((plugin) => plugin.includes('godot_mcp_live')) || project.inventory.addon_count > 0, 'Addon metadata found', 'No addon metadata found', 'warn'),
      };
      const failing = Object.values(checks).filter((entry) => entry.status === 'fail');
      return jsonResponse({
        status: failing.length > 0 ? 'failed' : 'success',
        project: {
          found: project.found,
          root: project.root,
          name: project.name,
        },
        inventory: project.inventory,
        checks,
        autoloads: project.autoloads,
        enabled_plugins: project.enabled_plugins,
        recommended_tools: recommendedHealthTools(project),
      }, failing.length > 0);
    },
  };
}

function postchangeVerificationPlan(ctx: ServerContext): ToolDefinition {
  return {
    name: 'postchange_verification_plan',
    description: 'Plan post-change verification commands, Godot checks, MCP tool calls, evidence, and reload guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        goal: { type: 'string' },
        changed_files: { type: 'array', items: { type: 'string' } },
        include_reload_guidance: { type: 'boolean' },
        active_toolsets: { type: 'array', items: { type: 'string' } },
        active_tools: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const changedFiles = normalizeProjectPaths(args.changedFiles);
      const project = args.projectPath ? inspectProject(ctx, args.projectPath) : null;
      if (project && 'error' in project) return failure(project.error);
      const reload = reloadGuidance(changedFiles, args.includeReloadGuidance !== false);
      return jsonResponse({
        status: 'success',
        goal: stringValue(args.goal),
        project: projectSummary(project),
        changed_files: changedFiles,
        commands: buildVerificationCommands(changedFiles).map((command) => ({ command, purpose: commandPurpose(command) })),
        godot_checks: [
          'Run a Godot headless editor smoke against test_mcp_enhancements and scan the log for SCRIPT ERROR and ERROR: matches.',
          'For Godot-backed operation changes, run a proof script that calls the built MCP server and verifies returned JSON.',
        ],
        mcp_tool_checks: [
          'Run tools/list against the built server and confirm all expected new tools are present.',
          'Call session_list after connector/editor reload when the exposed Codex MCP namespace is available.',
          'Call at least one representative new tool through the exposed namespace after reload.',
        ],
        reload,
        profile_awareness: profileAwareness(args, [
          'session_list',
          'toolset_status',
          'recommend_toolset_profile',
        ]),
        evidence: [
          'Focused test output.',
          'Full npm test output.',
          'Godot smoke exit status and error scan.',
          'Live listener/session_list/tool-call proof.',
          'git diff --check output.',
        ],
      });
    },
  };
}

function buildRecommendedSequence(goalType: string, goal: string, availableTools: string[]): any[] {
  const sequence = [
    toolStep('plan_feature_implementation', 'Create a bounded implementation plan before mutation.', availableTools),
  ];
  if (goalType === 'menu_ui') {
    sequence.push(
      toolStep('generate_menu_flow', 'Generate or update the pause/menu scene flow.', availableTools),
      toolStep('ui_overlap_check', 'Check menu controls for overlap or offscreen placement.', availableTools),
    );
  } else if (goalType === 'gameplay_system') {
    sequence.push(
      toolStep('create_state_machine', 'Create or update the gameplay state structure.', availableTools),
      toolStep('generate_character_controller', 'Generate controller or interaction scripts when movement/input is in scope.', availableTools),
    );
  } else if (goalType === 'asset_pipeline') {
    sequence.push(toolStep('asset_import_profile_apply', 'Apply import settings before reimporting assets.', availableTools));
  } else if (goalType === 'debugging') {
    sequence.push(toolStep('lsp_diagnostics', 'Collect diagnostics before patching code.', availableTools));
  } else {
    sequence.push(toolStep('risk_scan', `Scan risks for "${goal}" before selecting mutation tools.`, availableTools));
  }
  sequence.push(
    toolStep('plan_test_strategy', 'Choose focused tests and live checks before editing.', availableTools),
    toolStep('postchange_verification_plan', 'Prepare the closeout verification ladder.', availableTools),
  );
  return sequence;
}

function buildValidationPath(goalType: string, availableTools: string[], changedFiles: string[]): any[] {
  const testTool = availableTools.length > 0 && availableTools.includes('gut_run_test_file') && !availableTools.includes('gut_run_changed_tests')
    ? 'gut_run_test_file'
    : 'gut_run_changed_tests';
  const path = [
    toolStep(testTool, 'Run focused tests related to changed scripts/scenes.', availableTools),
  ];
  if (goalType === 'menu_ui' || changedFiles.some((file) => file.endsWith('.tscn'))) {
    path.push(toolStep('ui_overlap_check', 'Validate UI controls are not overlapping or offscreen.', availableTools));
  }
  path.push(
    toolStep('quality_gate_run', 'Run the configured quality gate before export or completion.', availableTools),
    { command: 'Godot headless editor smoke', reason: 'Catch GDScript parser and editor-load issues Node tests can miss.' },
  );
  return path;
}

function buildTestLayers(goalType: string, changedFiles: string[], project: ProjectFacts | null): any[] {
  const layers: any[] = [
    { name: 'TypeScript build', command: 'npm run build', reason: 'Verify MCP server TypeScript and build artifact generation.' },
  ];
  if (changedFiles.some((file) => file.startsWith('src/tools/safer-planning') || file.includes('safer-planning'))) {
    layers.push({ name: 'Focused Node tests', command: 'node --test tests/safer-planning.test.mjs', reason: 'Verify Phase 4.10 behavior directly.' });
  }
  if (project && project.inventory.test_count > 0) {
    layers.push({ name: 'Changed GUT tests', tool: 'gut_run_changed_tests', reason: 'Run project tests related to changed gameplay/UI files.' });
  } else {
    layers.push({ name: 'Generate test plan', tool: 'test_watch_plan', reason: 'No test inventory was detected; plan the smallest safe test target.' });
  }
  if (goalType === 'menu_ui' || changedFiles.some((file) => file.endsWith('.tscn'))) {
    layers.push({ name: 'Visual UI validation', tool: 'ui_overlap_check', reason: 'Menu and scene changes need layout checks.' });
  }
  if (changedFiles.some((file) => file.includes('addons/godot_mcp_live') || file.includes('live-editor'))) {
    layers.push({ name: 'Live bridge validation', tool: 'session_list', reason: 'Live addon or bridge changes require callable session proof after reload.' });
  }
  layers.push({ name: 'Full regression', command: 'npm test', reason: 'Run the complete repository test suite.' });
  return layers;
}

function buildVerificationCommands(changedFiles: string[]): string[] {
  const commands = ['npm run build'];
  if (changedFiles.some((file) => file.includes('safer-planning'))) {
    commands.push('node --test tests/safer-planning.test.mjs');
  }
  commands.push('npm test');
  commands.push('git diff --check');
  return uniqueStrings(commands);
}

function detectRisks(goal: string, changedFiles: string[], plannedActions: string[], project: ProjectFacts | null): any[] {
  const risks: any[] = [];
  const combined = `${goal} ${changedFiles.join(' ')} ${plannedActions.join(' ')}`.toLowerCase();
  if (changedFiles.includes('project.godot') || combined.includes('autoload') || combined.includes('project setting')) {
    risks.push(risk('project_settings', 'high', 'Project settings or autoload changes can affect startup and editor reload behavior.', ['project.godot']));
  }
  if (changedFiles.some((file) => file.includes('addons/godot_mcp_live')) || combined.includes('addon') || combined.includes('plugin')) {
    risks.push(risk('live_addon_reload', 'high', 'Live addon changes need editor/addon reload before GUI proof is trustworthy.', changedFiles.filter((file) => file.includes('addon'))));
  }
  if (changedFiles.some((file) => file.endsWith('.tscn'))) {
    risks.push(risk('scene_ownership', 'medium', 'Scene edits can lose ownership or persistence without a Godot load/save proof.', changedFiles.filter((file) => file.endsWith('.tscn'))));
  }
  if (changedFiles.some((file) => file.endsWith('.gd'))) {
    risks.push(risk('gdscript_parse', 'medium', 'GDScript edits need parser/editor smoke validation.', changedFiles.filter((file) => file.endsWith('.gd'))));
  }
  if (changedFiles.some((file) => file === 'src/index.ts' || file.startsWith('src/tools/'))) {
    risks.push(risk('mcp_catalog_reload', 'medium', 'MCP tool registration changes need build, tools/list, and connector reload proof.', changedFiles.filter((file) => file === 'src/index.ts' || file.startsWith('src/tools/'))));
  }
  if (changedFiles.some((file) => file === 'src/scripts/godot_operations.gd')) {
    risks.push(risk('godot_operation_handler', 'high', 'Godot operation handler changes need headless Godot proof, not only Node tests.', ['src/scripts/godot_operations.gd']));
  }
  if (combined.includes('delete') || combined.includes('remove')) {
    risks.push(risk('destructive_change', 'high', 'Remove/delete actions need explicit path containment and restoration proof.', changedFiles));
  }
  if (project && project.inventory.autoload_count > 0 && combined.includes('state')) {
    risks.push(risk('autoload_state', 'medium', 'Existing autoloads can affect runtime state and test isolation.', project.autoloads));
  }
  if (risks.length === 0) {
    risks.push(risk('normal_change', 'low', 'No specific high-risk surface was detected; keep the standard build/test/Godot smoke ladder.', changedFiles));
  }
  return risks;
}

function requiredVerificationForRisks(risks: any[], changedFiles: string[]): string[] {
  const required = ['npm run build', 'npm test'];
  if (risks.some((risk) => risk.category === 'mcp_catalog_reload')) {
    required.push('tools/list includes the new or changed tools');
  }
  if (risks.some((risk) => risk.category === 'live_addon_reload' || risk.category === 'mcp_catalog_reload')) {
    required.push('session_list returns the target test_mcp_enhancements editor after reload');
  }
  if (risks.some((risk) => risk.category === 'gdscript_parse' || risk.category === 'scene_ownership' || risk.category === 'godot_operation_handler')) {
    required.push('Godot headless editor smoke exits 0 with no SCRIPT ERROR or ERROR: matches');
  }
  if (changedFiles.some((file) => file.endsWith('.tscn'))) required.push('visual/layout checks for changed scenes');
  required.push('git diff --check');
  return uniqueStrings(required);
}

function inspectProject(ctx: ServerContext, projectPath: any): ProjectFacts | { error: string } {
  const rawPath = stringValue(projectPath);
  if (!rawPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(rawPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(rawPath);
  const projectFile = join(projectRoot, 'project.godot');
  if (!existsSync(projectFile)) return { error: `Invalid project_path: ${rawPath} does not contain project.godot` };
  const files = listProjectFiles(projectRoot);
  const projectText = readFileSync(projectFile, 'utf8');
  const autoloads = parseSectionEntries(projectText, 'autoload');
  const enabledPlugins = parseEnabledPlugins(projectText);
  return {
    found: true,
    root: projectRoot,
    name: parseProjectName(projectText),
    inventory: {
      scene_count: files.filter((file) => file.endsWith('.tscn')).length,
      script_count: files.filter((file) => file.endsWith('.gd') && !/(^|\/)(test|tests)\//.test(file)).length,
      test_count: files.filter((file) => /(^|\/)(test|tests)\//.test(file) && file.endsWith('.gd')).length,
      addon_count: files.filter((file) => file.endsWith('plugin.cfg') && file.includes('addons/')).length,
      asset_count: files.filter((file) => isAssetFile(file)).length,
      autoload_count: autoloads.length,
      enabled_plugin_count: enabledPlugins.length,
    },
    files,
    autoloads,
    enabled_plugins: enabledPlugins,
  };
}

function listProjectFiles(projectRoot: string): string[] {
  const result: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.godot' || entry.name === 'node_modules') continue;
      const absolute = join(dir, entry.name);
      const relative = absolute.slice(projectRoot.length + 1).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        visit(absolute);
      } else {
        result.push(relative);
      }
    }
  };
  visit(projectRoot);
  return result;
}

function parseSectionEntries(projectText: string, sectionName: string): string[] {
  const lines = projectText.split(/\r?\n/);
  const entries: string[] = [];
  let active = false;
  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      active = section[1] === sectionName;
      continue;
    }
    if (active && /^\s*[^;#\s][^=]*=/.test(line)) entries.push(line.trim());
  }
  return entries;
}

function parseEnabledPlugins(projectText: string): string[] {
  const match = projectText.match(/enabled\s*=\s*PackedStringArray\(([^)]*)\)/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function parseProjectName(projectText: string): string | null {
  const match = projectText.match(/config\/name\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function isAssetFile(file: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.wav', '.ogg', '.mp3', '.glb', '.gltf', '.fbx', '.obj'].includes(extname(file).toLowerCase());
}

function projectSummary(project: ProjectFacts | { error: string } | null): any {
  if (!project) return { found: false };
  if ('error' in project) return { found: false, error: project.error };
  return {
    found: project.found,
    root: project.root,
    name: project.name,
    inventory: project.inventory,
  };
}

function categoryScore(category: CapabilityCategory, goal: string, availableTools: string[]): number {
  let score = 0;
  if (goal && categoryMatchesGoal(category, goal)) score += 10;
  score += category.tools.filter((tool) => availableTools.includes(tool)).length;
  return score;
}

function categoryMatchesGoal(category: CapabilityCategory, goal: string): boolean {
  const text = goal.toLowerCase();
  return category.keywords.some((keyword) => text.includes(keyword));
}

function toolMatchesGoal(tool: string, goal: string): boolean {
  const words = tokenize(goal);
  const toolText = tool.replace(/_/g, ' ').toLowerCase();
  return words.some((word) => word.length > 2 && toolText.includes(word));
}

function matrixRecommendations(goal: string, categories: Record<string, any>): string[] {
  const recommendations: string[] = [];
  if (goal) recommendations.push('Run recommend_next_tool with this goal to get an ordered tool sequence.');
  if (categories.planning) recommendations.push('Use risk_scan before applying mutations and postchange_verification_plan before closeout.');
  if (categories.testing?.available_tools?.length) recommendations.push('Use plan_test_strategy to choose focused and full tests.');
  return recommendations;
}

function classifyGoal(goal: string): string {
  const text = goal.toLowerCase();
  if (/(pause|menu|hud|ui|button|screen|panel)/.test(text)) return 'menu_ui';
  if (/(state|controller|interaction|inventory|dialogue|save|settings|player|enemy|pickup)/.test(text)) return 'gameplay_system';
  if (/(asset|texture|audio|model|import|license)/.test(text)) return 'asset_pipeline';
  if (/(addon|plugin|external tool|adapter)/.test(text)) return 'addon_tooling';
  if (/(debug|diagnostic|symbol|breakpoint|lsp|dap)/.test(text)) return 'debugging';
  if (/(performance|memory|quality|fps|export)/.test(text)) return 'quality_gate';
  if (/(test|qa|gut|gdunit)/.test(text)) return 'testing';
  return 'feature';
}

function preferredDomainTool(goalType: string, availableTools: string[]): string {
  const preferences: Record<string, string[]> = {
    menu_ui: ['generate_menu_flow', 'generate_hud', 'create_scene'],
    gameplay_system: ['create_state_machine', 'generate_character_controller', 'generate_interaction_system'],
    asset_pipeline: ['asset_import_profile_apply', 'asset_batch_reimport'],
    addon_tooling: ['addon_list', 'addon_health_check'],
    debugging: ['lsp_diagnostics', 'lsp_symbols'],
    quality_gate: ['quality_gate_run', 'performance_budget_check'],
    testing: ['gut_run_changed_tests', 'gdunit4_run_tests'],
    feature: ['generate_feature_from_brief', 'create_scene'],
  };
  const candidates = preferences[goalType] || preferences.feature;
  return candidates.find((tool) => availableTools.length === 0 || availableTools.includes(tool)) || candidates[0];
}

function domainImplementationStepName(goalType: string): string {
  if (goalType === 'menu_ui') return 'Generate or edit menu flow';
  if (goalType === 'gameplay_system') return 'Generate or edit gameplay system';
  if (goalType === 'asset_pipeline') return 'Configure asset pipeline';
  if (goalType === 'debugging') return 'Collect diagnostics before patching';
  return 'Generate or edit feature files';
}

function domainImplementationReason(goalType: string): string {
  if (goalType === 'menu_ui') return 'Menus need scene/control generation plus layout and input validation.';
  if (goalType === 'gameplay_system') return 'Gameplay systems need scripts, scene nodes, and behavior tests.';
  if (goalType === 'asset_pipeline') return 'Asset changes need import-setting control and reimport proof.';
  if (goalType === 'debugging') return 'Diagnostics reduce guesswork before code edits.';
  return 'Use the narrowest domain tool that can create the requested feature.';
}

function suggestedFeatureFiles(goalType: string, goal: string): string[] {
  if (goalType === 'menu_ui') return ['scenes/pause_menu.tscn', 'scripts/pause_menu.gd', 'test/unit/test_pause_menu.gd'];
  if (goalType === 'gameplay_system') return ['scripts/gameplay_state_machine.gd', 'scenes/gameplay_controller.tscn', 'test/unit/test_gameplay_system.gd'];
  if (goalType === 'asset_pipeline') return ['.godot-mcp/import_profiles/default.json', '.godot-mcp/reports/asset-usage.json'];
  const slug = sanitizeSlug(goal || 'feature');
  return [`scenes/${slug}.tscn`, `scripts/${slug}.gd`, `test/unit/test_${slug}.gd`];
}

function acceptanceChecks(goalType: string): string[] {
  const checks = ['Focused implementation tests pass.', 'Full npm test passes.', 'Godot headless editor smoke exits 0 with no script errors.'];
  if (goalType === 'menu_ui') checks.push('UI overlap/contrast checks pass for the menu scene.');
  checks.push('Evidence is attached or summarized for the changed surface.');
  return checks;
}

function recommendedHealthTools(project: ProjectFacts): string[] {
  const tools = ['capability_matrix', 'risk_scan', 'lsp_status', 'lsp_diagnostics'];
  if (project.inventory.test_count > 0) tools.push('gut_discover_tests', 'gut_run_changed_tests');
  if (project.inventory.addon_count > 0) tools.push('addon_health_check');
  if (project.inventory.scene_count > 0) tools.push('visual_regression_check');
  return uniqueStrings(tools);
}

function reloadGuidance(changedFiles: string[], includeReloadGuidance: boolean): any {
  if (!includeReloadGuidance) return { required: false, reason: 'Reload guidance disabled by caller.', steps: [] };
  const touchesToolCatalog = changedFiles.some((file) => file === 'src/index.ts' || file.startsWith('src/tools/'));
  const touchesAddon = changedFiles.some((file) => file.includes('addons/godot_mcp_live'));
  const touchesOperations = changedFiles.some((file) => file === 'src/scripts/godot_operations.gd');
  const required = touchesToolCatalog || touchesAddon || touchesOperations;
  const reasons: string[] = [];
  if (touchesToolCatalog) reasons.push('MCP connector catalog changed');
  if (touchesAddon) reasons.push('Godot live addon/editor code changed');
  if (touchesOperations) reasons.push('Godot operation script changed');
  const steps = required
    ? [
      'Rebuild the MCP server.',
      'Reload/restart the Codex MCP connector so tools/list exposes the new catalog.',
      touchesAddon ? 'Reload/restart the open Godot editor or live addon so the GUI session uses the new addon code.' : '',
      'Confirm exactly one listener owns 127.0.0.1:6010.',
      'Call session_list and at least one new Phase 4.10 tool through the exposed namespace.',
    ].filter(Boolean)
    : ['No connector/editor reload is required for documentation-only changes.'];
  return {
    required,
    reason: reasons.join('; ') || 'No reload-sensitive files detected.',
    steps,
  };
}

function commandPurpose(command: string): string {
  if (command === 'npm run build') return 'Compile TypeScript and copy built Godot operation scripts.';
  if (command.includes('safer-planning')) return 'Run focused Phase 4.10 planning tool tests.';
  if (command === 'npm test') return 'Run the full repository regression suite.';
  if (command === 'git diff --check') return 'Catch whitespace and patch formatting errors.';
  return 'Verification command.';
}

function toolStep(tool: string, reason: string, availableTools: string[]): any {
  return {
    tool,
    available: availableTools.length === 0 || availableTools.includes(tool),
    reason,
  };
}

function risk(category: string, severity: Severity, reason: string, affectedPaths: string[]): any {
  return {
    category,
    severity,
    reason,
    affected_paths: uniqueStrings(affectedPaths.filter(Boolean)),
  };
}

function highestSeverity(risks: any[]): Severity {
  if (risks.some((risk) => risk.severity === 'high')) return 'high';
  if (risks.some((risk) => risk.severity === 'medium')) return 'medium';
  return 'low';
}

function check(condition: boolean, pass: string, fail: string, failStatus: 'warn' | 'fail' = 'fail'): any {
  return {
    status: condition ? 'pass' : failStatus,
    message: condition ? pass : fail,
  };
}

function profileAwareness(args: any, recommendedTools: string[]): any {
  const activeToolsets = arrayOfStrings(args.activeToolsets);
  const activeTools = arrayOfStrings(args.activeTools);
  const filterActive = activeToolsets.length > 0 || activeTools.length > 0;
  const tools = uniqueStrings(recommendedTools.filter(Boolean));
  const neededToolsets = uniqueStrings(tools.map((tool) => getToolMetadata(tool).toolset)).sort();
  const missingToolsets = filterActive && activeToolsets.length > 0
    ? neededToolsets.filter((toolset) => !activeToolsets.includes(toolset))
    : [];
  const missingTools = filterActive && activeTools.length > 0
    ? tools.filter((tool) => !activeTools.includes(tool))
    : [];
  return {
    profile_filter_active: filterActive,
    active_toolsets: activeToolsets,
    active_tools: activeTools,
    needed_toolsets: neededToolsets,
    checked_tools: tools,
    missing_toolsets: missingToolsets,
    missing_tools: missingTools,
    remediation: missingToolsets.length || missingTools.length
      ? {
        GODOT_MCP_TOOLSETS: uniqueStrings([...activeToolsets, ...missingToolsets]).join(','),
        GODOT_MCP_TOOLS: uniqueStrings([...activeTools, ...missingTools]).join(','),
        reload_required: 'Reload/restart the MCP connector after changing the profile env vars.',
      }
      : null,
  };
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    availableTools: args.availableTools ?? args.available_tools,
    changedFiles: args.changedFiles ?? args.changed_files,
    currentState: args.currentState ?? args.current_state,
    includeValidation: args.includeValidation ?? args.include_validation,
    includeReloadGuidance: args.includeReloadGuidance ?? args.include_reload_guidance,
    plannedActions: args.plannedActions ?? args.planned_actions,
    riskTolerance: args.riskTolerance ?? args.risk_tolerance,
    maxResults: args.maxResults ?? args.max_results,
    activeToolsets: args.activeToolsets ?? args.active_toolsets,
    activeTools: args.activeTools ?? args.active_tools,
  };
}

function normalizeProjectPaths(value: any): string[] {
  return arrayOfStrings(value).map((item) => item.replace(/^res:\/\//, '').replace(/\\/g, '/').replace(/^\/+/, ''));
}

function arrayOfStrings(value: any): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function stringValue(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrUndefined(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => value && all.indexOf(value) === index);
}

function uniqueTools(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function sanitizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'feature';
}

function failure(reason: string): ToolResponse {
  return jsonResponse({
    status: 'failed',
    reason,
    recommendations: [reason],
  }, true);
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
