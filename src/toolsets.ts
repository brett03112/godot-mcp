/**
 * Toolset profile helpers for Phase 5.0.
 *
 * The MCP protocol exposes tools/list without per-request arguments, so the
 * active profile is resolved at server startup from env vars and optional
 * project-local profile files. Default startup remains fully backward
 * compatible: all tools are visible when no profile filter is configured.
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { ToolMetadata, ToolResponse } from './types.js';

export const TOOLSET_KEYS = [
  'core',
  'project',
  'scene',
  'script',
  'assets',
  'live',
  'runtime',
  'playtest',
  'visual',
  'quality',
  'debug',
  'release',
] as const;

export type ToolsetKey = typeof TOOLSET_KEYS[number];

export interface ToolDefinitionLike {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, any>; required?: string[] };
  metadata?: ToolMetadata;
}

export interface ActiveToolProfile {
  mode: 'all' | 'filtered';
  activeToolsets: string[];
  explicitTools: string[];
  namedProfile?: string;
  loadedToolNames: string[];
  hiddenToolNames: string[];
  allToolNames: string[];
  requiredCoreTools: string[];
  configSources: string[];
  warnings: string[];
}

export interface CreateActiveToolProfileOptions {
  env?: Record<string, string | undefined>;
  allToolNames: string[];
  projectPath?: string;
}

export interface ToolsetStatusOptions {
  profile: ActiveToolProfile;
  allToolDefinitions: ToolDefinitionLike[];
}

export interface RecommendToolsetProfileArgs {
  featureRequest?: string;
  feature_request?: string;
  projectFacts?: Record<string, any>;
  project_facts?: Record<string, any>;
  includeOptional?: boolean;
  include_optional?: boolean;
}

export interface RecommendToolsetProfileOptions {
  allToolDefinitions?: ToolDefinitionLike[];
}

export interface BuiltInToolsetProfile {
  name: string;
  description: string;
  toolsets: string[];
  tools: string[];
  resources: string[];
  verification_commands: string[];
  powershell: string;
  toolsets_json: {
    profiles: Record<string, {
      description: string;
      toolsets: string[];
      tools: string[];
    }>;
  };
  example_counts?: {
    loaded_tool_count: number;
    hidden_tool_count: number;
  };
}

interface BuiltInToolsetProfileConfig {
  description: string;
  toolsets: string[];
  tools: string[];
  resources: string[];
  verificationCommands: string[];
}

const CORE_SUPPORT_TOOLS = [
  'toolset_status',
  'recommend_toolset_profile',
  'live_config_status',
  'get_godot_version',
  'list_projects',
  'get_project_info',
  'capability_matrix',
  'recommend_next_tool',
  'plan_feature_implementation',
  'plan_test_strategy',
  'risk_scan',
  'preflight_project_health',
  'postchange_verification_plan',
];

const BUILT_IN_TOOLSET_PROFILES: Record<string, BuiltInToolsetProfileConfig> = {
  'planning-readonly': {
    description: 'Read-only project inspection, diagnostics, planning, recommendation, and verification planning.',
    toolsets: ['core'],
    tools: [
      'get_godot_version',
      'list_projects',
      'get_project_info',
      'project_settings_get',
      'autoload_list',
      'filesystem_search',
      'dependency_graph',
      'find_orphaned_assets',
      'find_missing_uid_files',
      'validate_scene',
      'analyze_script',
      'extract_dependencies',
      'lsp_status',
      'lsp_diagnostics',
      'capability_matrix',
      'recommend_next_tool',
      'plan_feature_implementation',
      'plan_test_strategy',
      'risk_scan',
      'preflight_project_health',
      'postchange_verification_plan',
    ],
    resources: [
      'godot-mcp://server/info',
      'godot-mcp://tools/catalog',
    ],
    verificationCommands: [
      'toolset_status',
      'recommend_toolset_profile(feature_request="inspect and plan this Godot task")',
    ],
  },
  'scene-edit': {
    description: 'File-backed scene, node, script, resource, and quality-gate changes without requiring a live editor session.',
    toolsets: ['core', 'project', 'scene', 'script', 'assets', 'quality'],
    tools: ['filesystem_search', 'validate_scene', 'script_patch'],
    resources: [
      'godot-mcp://server/info',
      'godot-mcp://tools/catalog',
    ],
    verificationCommands: [
      'toolset_status',
      'validate_scene(project_path, scene_path)',
      'npm test',
    ],
  },
  'live-editor': {
    description: 'Active editor state, selection, screenshots, filesystem refresh, and live scene work.',
    toolsets: ['core', 'project', 'scene', 'script', 'live', 'visual'],
    tools: ['session_list', 'editor_state', 'capture_editor_viewport'],
    resources: [
      'godot-mcp://server/info',
      'godot-mcp://tools/catalog',
      'godot-mcp://live/sessions',
    ],
    verificationCommands: [
      'toolset_status',
      'session_list(project_path)',
      'editor_state(project_path)',
    ],
  },
  'runtime-debug': {
    description: 'Running-game inspection, runtime input, assertions, logs, LSP, and DAP debugging.',
    toolsets: ['core', 'project', 'live', 'runtime', 'debug'],
    tools: ['session_list', 'runtime_play_scene', 'lsp_diagnostics', 'dap_status'],
    resources: [
      'godot-mcp://server/info',
      'godot-mcp://tools/catalog',
      'godot-mcp://live/sessions',
    ],
    verificationCommands: [
      'toolset_status',
      'session_list(project_path)',
      'lsp_status(project_path)',
      'dap_status(project_path)',
    ],
  },
  'playtest-loop': {
    description: 'Automated and manual playtests, runtime state, visual proof, fun metrics, and quality gates.',
    toolsets: ['core', 'project', 'playtest', 'runtime', 'visual', 'quality'],
    tools: ['run_automated_playtest', 'analyze_playtest_session', 'quality_gate_run'],
    resources: [
      'godot-mcp://server/info',
      'godot-mcp://tools/catalog',
    ],
    verificationCommands: [
      'toolset_status',
      'run_automated_playtest(project_path, duration_seconds=30)',
      'quality_gate_run(project_path)',
    ],
  },
  'visual-qa': {
    description: 'Screenshots, viewport capture, visual regression, sprite bounds, camera framing, overlap, and contrast checks.',
    toolsets: ['core', 'project', 'scene', 'live', 'runtime', 'visual', 'quality'],
    tools: ['capture_editor_viewport', 'screenshot_compare', 'visual_regression_check'],
    resources: [
      'godot-mcp://server/info',
      'godot-mcp://tools/catalog',
      'godot-mcp://live/sessions',
    ],
    verificationCommands: [
      'toolset_status',
      'capture_editor_viewport(project_path)',
      'ui_overlap_check(project_path, scene_path)',
      'ui_contrast_check(project_path, scene_path)',
    ],
  },
  'release-check': {
    description: 'Export validation, release/build tools, quality gates, diagnostics, and project metadata.',
    toolsets: ['core', 'project', 'quality', 'release', 'debug'],
    tools: ['validate_export', 'quality_gate_run', 'lsp_diagnostics'],
    resources: [
      'godot-mcp://server/info',
      'godot-mcp://tools/catalog',
    ],
    verificationCommands: [
      'toolset_status',
      'validate_export(project_path)',
      'quality_gate_run(project_path)',
    ],
  },
};

const DEPRECATED_ALIASES: Record<string, Partial<ToolMetadata>> = {
  start_playtest_recording: {
    toolset: 'playtest',
    risk: 'high',
    mutates: true,
    requires_live: false,
    requires_display: true,
    deprecated: true,
    alias_for: 'playtest_recording',
    aliases: ['playtest_recording?action=start'],
    deprecation_message: 'Use playtest_recording with action "start".',
  },
  stop_playtest_recording: {
    toolset: 'playtest',
    risk: 'high',
    mutates: true,
    requires_live: false,
    requires_display: true,
    deprecated: true,
    alias_for: 'playtest_recording',
    aliases: ['playtest_recording?action=stop'],
    deprecation_message: 'Use playtest_recording with action "stop".',
  },
  start_profiler: {
    toolset: 'quality',
    risk: 'high',
    mutates: true,
    requires_live: false,
    requires_display: true,
    deprecated: true,
    alias_for: 'profiler',
    aliases: ['profiler?action=start'],
    deprecation_message: 'Use profiler with action "start".',
  },
  get_profiling_data: {
    toolset: 'quality',
    risk: 'low',
    mutates: false,
    requires_live: false,
    requires_display: false,
    deprecated: true,
    alias_for: 'profiler',
    aliases: ['profiler?action=get'],
    deprecation_message: 'Use profiler with action "get".',
  },
  analyze_bottlenecks: {
    toolset: 'quality',
    risk: 'low',
    mutates: false,
    requires_live: false,
    requires_display: false,
    deprecated: true,
    alias_for: 'profiler',
    aliases: ['profiler?action=analyze'],
    deprecation_message: 'Use profiler with action "analyze".',
  },
};

const EXPLICIT_TOOL_METADATA: Record<string, Partial<ToolMetadata>> = {
  editor_screenshot: {
    toolset: 'live',
    risk: 'low',
    mutates: false,
    requires_live: true,
    requires_display: true,
  },
  runtime_profile_capture: {
    toolset: 'runtime',
    risk: 'low',
    mutates: false,
    requires_live: true,
    requires_display: true,
  },
  asset_library_install_addon: {
    toolset: 'project',
    risk: 'high',
    mutates: true,
    requires_live: false,
    requires_display: false,
  },
  asset_library_update_addon: {
    toolset: 'project',
    risk: 'high',
    mutates: true,
    requires_live: false,
    requires_display: false,
  },
  asset_library_remove_addon: {
    toolset: 'project',
    risk: 'high',
    mutates: true,
    requires_live: false,
    requires_display: false,
  },
  filesystem_reimport: {
    toolset: 'project',
    risk: 'medium',
    mutates: true,
    requires_live: false,
    requires_display: false,
  },
  live_addon_status: {
    toolset: 'project',
    risk: 'low',
    mutates: false,
    requires_live: false,
    requires_display: false,
  },
};

const READ_ONLY_PREFIXES = [
  'get_',
  'list_',
  'validate_',
  'inspect_',
  'search_',
  'find_',
  'preview_',
  'analyze_',
  'recommend_',
  'plan_',
  'risk_',
  'preflight_',
  'postchange_',
  'capability_',
  'toolset_',
  'lsp_',
  'dap_status',
  'dap_stack',
  'dap_variables',
];

export function createActiveToolProfile(options: CreateActiveToolProfileOptions): ActiveToolProfile {
  const env = options.env || process.env;
  const allToolNames = uniqueStrings(options.allToolNames).sort();
  const configSources: string[] = [];
  const warnings: string[] = [];
  const envToolsets = parseList(env.GODOT_MCP_TOOLSETS);
  const envTools = parseList(env.GODOT_MCP_TOOLS);
  const projectPath = options.projectPath || env.GODOT_MCP_PROJECT_PATH || '';
  const namedProfile = env.GODOT_MCP_PROFILE || env.GODOT_MCP_TOOLSET_PROFILE || undefined;
  const profileConfig = namedProfile
    ? readNamedProfile(projectPath, namedProfile, configSources, warnings)
    : null;

  const profileToolsets = normalizeToolsets(profileConfig?.toolsets || []);
  const profileTools = parseList(profileConfig?.tools || []);
  const activeToolsets = normalizeToolsets([...envToolsets, ...profileToolsets]);
  const explicitTools = uniqueStrings([...envTools, ...profileTools]);
  const filterConfigured = activeToolsets.length > 0 || explicitTools.length > 0 || Boolean(profileConfig);

  if (!filterConfigured) {
    return {
      mode: 'all',
      activeToolsets: [],
      explicitTools: [],
      namedProfile,
      loadedToolNames: allToolNames,
      hiddenToolNames: [],
      allToolNames,
      requiredCoreTools: CORE_SUPPORT_TOOLS.filter((tool) => allToolNames.includes(tool)),
      configSources: ['default: all tools'],
      warnings,
    };
  }

  const loaded = new Set<string>();
  for (const tool of CORE_SUPPORT_TOOLS) {
    if (allToolNames.includes(tool)) loaded.add(tool);
  }
  for (const tool of explicitTools) {
    if (allToolNames.includes(tool)) loaded.add(tool);
  }
  for (const tool of allToolNames) {
    const metadata = getToolMetadata(tool);
    if (activeToolsets.includes(metadata.toolset)) loaded.add(tool);
  }

  const loadedToolNames = Array.from(loaded).sort();
  const hiddenToolNames = allToolNames.filter((tool) => !loaded.has(tool)).sort();
  const sources = [
    envToolsets.length ? 'env:GODOT_MCP_TOOLSETS' : '',
    envTools.length ? 'env:GODOT_MCP_TOOLS' : '',
    ...configSources,
  ].filter(Boolean);

  return {
    mode: 'filtered',
    activeToolsets,
    explicitTools,
    namedProfile,
    loadedToolNames,
    hiddenToolNames,
    allToolNames,
    requiredCoreTools: CORE_SUPPORT_TOOLS.filter((tool) => allToolNames.includes(tool)),
    configSources: sources.length ? sources : ['profile: empty filter'],
    warnings,
  };
}

export function getToolMetadata(name: string, explicit?: Partial<ToolMetadata>): ToolMetadata {
  const aliasMetadata = DEPRECATED_ALIASES[name] || {};
  const auditMetadata = EXPLICIT_TOOL_METADATA[name] || {};
  const toolset = normalizeToolset(String(explicit?.toolset || auditMetadata.toolset || aliasMetadata.toolset || inferToolset(name)));
  const mutates = explicit?.mutates ?? auditMetadata.mutates ?? aliasMetadata.mutates ?? inferMutates(name);
  const requiresLive = explicit?.requires_live ?? auditMetadata.requires_live ?? aliasMetadata.requires_live ?? inferRequiresLive(name, toolset);
  const requiresDisplay = explicit?.requires_display ?? auditMetadata.requires_display ?? aliasMetadata.requires_display ?? inferRequiresDisplay(name, toolset);
  return {
    toolset,
    aliases: uniqueStrings([...(aliasMetadata.aliases || []), ...(auditMetadata.aliases || []), ...(explicit?.aliases || [])]),
    risk: explicit?.risk || auditMetadata.risk || aliasMetadata.risk || inferRisk(name, toolset, mutates),
    mutates,
    requires_live: requiresLive,
    requires_display: requiresDisplay,
    requires_godot_version: explicit?.requires_godot_version || auditMetadata.requires_godot_version || aliasMetadata.requires_godot_version || inferGodotVersion(name),
    deprecated: explicit?.deprecated ?? auditMetadata.deprecated ?? aliasMetadata.deprecated ?? false,
    alias_for: explicit?.alias_for || auditMetadata.alias_for || aliasMetadata.alias_for,
    deprecation_message: explicit?.deprecation_message || auditMetadata.deprecation_message || aliasMetadata.deprecation_message,
  };
}

export function getBuiltInToolsetProfiles(allToolNames: string[] = []): BuiltInToolsetProfile[] {
  return Object.entries(BUILT_IN_TOOLSET_PROFILES).map(([name, profile]) => {
    const payload: BuiltInToolsetProfile = {
      name,
      description: profile.description,
      toolsets: normalizeToolsets(profile.toolsets),
      tools: uniqueStrings(profile.tools).sort(),
      resources: uniqueStrings(profile.resources).sort(),
      verification_commands: uniqueStrings(profile.verificationCommands),
      powershell: builtInProfilePowerShell(name),
      toolsets_json: builtInProfileJson(name, profile),
    };

    if (allToolNames.length > 0) {
      const exampleProfile = createActiveToolProfile({
        env: { GODOT_MCP_PROFILE: name },
        allToolNames,
      });
      payload.example_counts = {
        loaded_tool_count: exampleProfile.loadedToolNames.length,
        hidden_tool_count: exampleProfile.hiddenToolNames.length,
      };
    }

    return payload;
  });
}

export function decorateToolDefinition<T extends ToolDefinitionLike>(tool: T): T & { metadata: ToolMetadata } {
  return {
    ...tool,
    metadata: getToolMetadata(tool.name, tool.metadata),
  };
}

export function filterToolDefinitions<T extends ToolDefinitionLike>(tools: T[], profile: ActiveToolProfile): Array<T & { metadata: ToolMetadata }> {
  return tools
    .filter((tool) => isToolEnabled(tool.name, profile))
    .map((tool) => decorateToolDefinition(tool));
}

export function isToolEnabled(toolName: string, profile: ActiveToolProfile): boolean {
  return profile.mode === 'all' || profile.loadedToolNames.includes(toolName);
}

export function disabledToolResponse(toolName: string, profile: ActiveToolProfile, explicitMetadata?: Partial<ToolMetadata>): ToolResponse {
  const metadata = getToolMetadata(toolName, explicitMetadata);
  const toolsets = uniqueStrings([...profile.activeToolsets, metadata.toolset]).join(',');
  const tools = uniqueStrings([...profile.explicitTools, toolName]).join(',');
  const payload = {
    status: 'disabled',
    tool: toolName,
    message: `Tool "${toolName}" exists but is not loaded by the active Godot MCP tool profile.`,
    metadata,
    active_toolsets: profile.activeToolsets,
    explicit_tools: profile.explicitTools,
    config_sources: profile.configSources,
    remediation: {
      summary: `Reload the MCP server with toolset "${metadata.toolset}" or explicitly add "${toolName}".`,
      env: {
        GODOT_MCP_TOOLSETS: toolsets || metadata.toolset,
        GODOT_MCP_TOOLS: tools || toolName,
      },
    },
  };
  return jsonResponse(payload, true);
}

export function toolsetStatusPayload(options: ToolsetStatusOptions): any {
  const decorated = options.allToolDefinitions.map((tool) => decorateToolDefinition(tool));
  const loaded = filterToolDefinitions(options.allToolDefinitions, options.profile);
  const allToolNames = decorated.map((tool) => tool.name).sort();
  return {
    status: 'success',
    mode: options.profile.mode,
    active_toolsets: options.profile.activeToolsets,
    explicit_tools: options.profile.explicitTools,
    named_profile: options.profile.namedProfile || null,
    loaded_tool_count: loaded.length,
    hidden_tool_count: Math.max(0, decorated.length - loaded.length),
    loaded_tools: loaded.map((tool) => tool.name).sort(),
    hidden_tools: decorated.filter((tool) => !isToolEnabled(tool.name, options.profile)).map((tool) => tool.name).sort(),
    config_sources: options.profile.configSources,
    warnings: options.profile.warnings,
    available_toolsets: [...TOOLSET_KEYS],
    built_in_profiles: getBuiltInToolsetProfiles(allToolNames),
    resources: {
      catalog_filtered: options.profile.mode !== 'all',
      per_tool_resources_filtered: options.profile.mode !== 'all',
    },
    disabled_tool_remediation: 'Use GODOT_MCP_TOOLSETS to add a toolset, GODOT_MCP_TOOLS to add exact tool names, or GODOT_MCP_PROFILE with GODOT_MCP_PROJECT_PATH for .godot-mcp/toolsets.json.',
  };
}

export function recommendToolsetProfile(rawArgs: RecommendToolsetProfileArgs, options: RecommendToolsetProfileOptions = {}): any {
  const args = normalizeRecommendArgs(rawArgs);
  const request = args.featureRequest.toLowerCase();
  const projectFacts = args.projectFacts || {};
  const catalog = decorateCatalog(options.allToolDefinitions || []);
  const availableToolNames = new Set(catalog.map((tool) => tool.name));
  const toolsets = new Set<string>(['core', 'project']);
  const requiredTools = new Set<string>(['toolset_status', 'recommend_toolset_profile']);
  const optionalTools = new Set<string>();
  const resources = new Set<string>(['godot-mcp://server/info', 'godot-mcp://tools/catalog']);
  const verification = new Set<string>(['npm run build', 'npm test', 'git diff --check']);

  if (/(pause|menu|hud|ui|button|dialog|screen|scene|node|level)/.test(request)) {
    toolsets.add('scene');
    toolsets.add('script');
    toolsets.add('visual');
    requiredTools.add('script_patch');
    requiredTools.add('validate_scene');
    optionalTools.add('capture_editor_viewport');
    verification.add('Godot headless editor smoke');
  }
  if (/(asset|texture|audio|model|import|resource|theme|material)/.test(request)) {
    toolsets.add('assets');
    requiredTools.add('filesystem_search');
    optionalTools.add('resource_search');
  }
  if (/(live|editor|selected|selection|open editor|viewport|screenshot|capture)/.test(request) || projectFacts.has_live_editor) {
    toolsets.add('live');
    optionalTools.add('session_list');
    optionalTools.add('editor_state');
    resources.add('godot-mcp://live/sessions');
  }
  if (/(runtime|running game|input|assert|state)/.test(request)) {
    toolsets.add('runtime');
    optionalTools.add('runtime_play_scene');
  }
  if (/(playtest|frustrat|difficulty|less fun|death|heatmap|session)/.test(request)) {
    toolsets.add('playtest');
    toolsets.add('runtime');
    toolsets.add('visual');
    toolsets.add('quality');
    requiredTools.add('run_automated_playtest');
    optionalTools.add('playtest_recording');
    optionalTools.add('quality_gate_run');
    verification.add('playtest proof with session analysis');
  }
  if (/(debug|diagnostic|symbol|breakpoint|lsp|dap|stack|variable)/.test(request)) {
    toolsets.add('debug');
    requiredTools.add('lsp_diagnostics');
    optionalTools.add('dap_status');
  }
  if (/(quality|performance|memory|fps|budget|profile|draw call)/.test(request)) {
    toolsets.add('quality');
    requiredTools.add('quality_gate_run');
    optionalTools.add('profiler');
  }
  if (/(export|release|build|preset)/.test(request)) {
    toolsets.add('release');
    requiredTools.add('validate_export');
    optionalTools.add('export_project');
  }

  if (projectFacts.has_tests) {
    optionalTools.add('gut_run_changed_tests');
    verification.add('focused changed-test run');
  }

  const catalogMatches = findCatalogMatches(catalog, request, toolsets, requiredTools, optionalTools);
  const namedProfileSuggestions = scoreBuiltInProfiles({
    request,
    projectFacts,
    toolsets,
    requiredTools,
    optionalTools,
    resources,
    catalogMatches,
    allToolNames: Array.from(availableToolNames),
  });
  const primaryProfile = namedProfileSuggestions[0] || null;

  if (primaryProfile) {
    for (const toolset of primaryProfile.toolsets) toolsets.add(toolset);
    for (const resource of primaryProfile.resources) resources.add(resource);
    for (const command of primaryProfile.verification_commands) verification.add(command);
  }

  const requiredIndividualTools = filterKnownOrAll(Array.from(requiredTools), availableToolNames);
  const optionalToolList = args.includeOptional
    ? filterKnownOrAll(Array.from(optionalTools), availableToolNames)
    : [];
  const exactExtraTools = filterKnownOrAll(uniqueStrings([
    ...requiredIndividualTools,
    ...optionalToolList,
    ...catalogMatches.map((tool) => tool.name),
    ...(primaryProfile?.tools || []),
  ]), availableToolNames);
  const recommendedToolsets = Array.from(toolsets).sort();
  const profileName = primaryProfile?.name || null;

  return {
    status: 'success',
    feature_request: args.featureRequest,
    primary_named_profile: profileName,
    named_profile_suggestions: namedProfileSuggestions,
    recommended_toolsets: recommendedToolsets,
    exact_extra_tools: exactExtraTools,
    required_individual_tools: requiredIndividualTools,
    optional_tools: optionalToolList,
    available_tool_matches: catalogMatches.map(serializeToolMatch),
    needed_mcp_resources: Array.from(resources).sort(),
    env_snippet: `GODOT_MCP_TOOLSETS=${recommendedToolsets.join(',')}`,
    profile_env_snippet: profileName ? `GODOT_MCP_PROFILE=${profileName}` : null,
    config_snippet: JSON.stringify({
      profiles: {
        'recommended-session': {
          toolsets: recommendedToolsets,
          tools: exactExtraTools,
        },
      },
    }, null, 2),
    profile_config_snippet: primaryProfile ? JSON.stringify(primaryProfile.toolsets_json, null, 2) : null,
    verification_commands: Array.from(verification),
    reload_required: 'Reload/restart the MCP connector after changing profile env vars so tools/list is rebuilt.',
  };
}

function decorateCatalog(tools: ToolDefinitionLike[]): Array<ToolDefinitionLike & { metadata: ToolMetadata }> {
  return tools.map((tool) => decorateToolDefinition(tool));
}

function findCatalogMatches(
  catalog: Array<ToolDefinitionLike & { metadata: ToolMetadata }>,
  request: string,
  toolsets: Set<string>,
  requiredTools: Set<string>,
  optionalTools: Set<string>,
): Array<ToolDefinitionLike & { metadata: ToolMetadata }> {
  if (catalog.length === 0) return [];

  const exactNames = new Set<string>([
    ...requiredTools,
    ...optionalTools,
    ...semanticToolHints(request),
  ]);
  const requestTokens = tokenize(request);
  const scored = catalog
    .map((tool) => {
      let score = 0;
      const haystack = `${tool.name} ${tool.description}`.toLowerCase().replace(/[_-]+/g, ' ');
      if (exactNames.has(tool.name)) score += 12;
      if (toolsets.has(tool.metadata.toolset)) score += 2;
      for (const token of requestTokens) {
        if (haystack.includes(token)) score += 2;
      }
      return { tool, score };
    })
    .filter((entry) => entry.score >= 6)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));

  return scored.slice(0, 24).map((entry) => entry.tool);
}

function semanticToolHints(request: string): string[] {
  const hints = new Set<string>();
  if (/(live|editor|open editor)/.test(request)) {
    hints.add('session_list');
    hints.add('editor_state');
    hints.add('scene_current');
  }
  if (/(selected|selection|select)/.test(request)) {
    hints.add('selection_get');
    hints.add('selection_set');
  }
  if (/(screenshot|capture|viewport|visual)/.test(request)) {
    hints.add('capture_editor_viewport');
    hints.add('editor_screenshot');
    hints.add('capture_runtime_viewport');
    hints.add('screenshot_compare');
  }
  if (/(release|export|preset|build)/.test(request)) {
    hints.add('validate_export');
    hints.add('export_project');
  }
  if (/(diagnostic|lsp|debug|symbol|dap)/.test(request)) {
    hints.add('lsp_diagnostics');
    hints.add('lsp_status');
    hints.add('dap_status');
  }
  if (/(playtest|frustrat|difficulty|death|heatmap)/.test(request)) {
    hints.add('run_automated_playtest');
    hints.add('analyze_playtest_session');
    hints.add('playtest_recording');
  }
  if (/(runtime|running game|input|assert)/.test(request)) {
    hints.add('runtime_play_scene');
    hints.add('runtime_assert_no_errors');
    hints.add('runtime_get_scene_tree');
  }
  if (/(scene|node|menu|hud|ui|button|level)/.test(request)) {
    hints.add('validate_scene');
    hints.add('script_patch');
  }
  return Array.from(hints);
}

function scoreBuiltInProfiles(options: {
  request: string;
  projectFacts: Record<string, any>;
  toolsets: Set<string>;
  requiredTools: Set<string>;
  optionalTools: Set<string>;
  resources: Set<string>;
  catalogMatches: Array<ToolDefinitionLike & { metadata: ToolMetadata }>;
  allToolNames: string[];
}): any[] {
  const exactTools = new Set<string>([
    ...options.requiredTools,
    ...options.optionalTools,
    ...options.catalogMatches.map((tool) => tool.name),
  ]);

  return getBuiltInToolsetProfiles(options.allToolNames)
    .map((profile) => {
      let score = profileRequestBoost(profile.name, options.request, options.projectFacts);
      for (const toolset of profile.toolsets) {
        if (options.toolsets.has(toolset)) score += 3;
      }
      for (const tool of profile.tools) {
        if (exactTools.has(tool)) score += 4;
      }
      for (const resource of profile.resources) {
        if (options.resources.has(resource)) score += 2;
      }
      return {
        name: profile.name,
        score,
        description: profile.description,
        toolsets: profile.toolsets,
        tools: profile.tools,
        resources: profile.resources,
        verification_commands: profile.verification_commands,
        env_snippet: `GODOT_MCP_PROFILE=${profile.name}`,
        powershell: profile.powershell,
        toolsets_json: profile.toolsets_json,
        example_counts: profile.example_counts,
      };
    })
    .filter((profile) => profile.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 3);
}

function profileRequestBoost(profileName: string, request: string, projectFacts: Record<string, any>): number {
  switch (profileName) {
    case 'planning-readonly':
      return /(plan|inspect|audit|read.?only|catalog|metadata)/.test(request) ? 8 : 0;
    case 'scene-edit':
      return /(scene|node|menu|hud|ui|button|level|script)/.test(request) ? 8 : 0;
    case 'live-editor':
      return (/(live|editor|selected|selection|open editor|screenshot|viewport)/.test(request) || projectFacts.has_live_editor) ? 10 : 0;
    case 'runtime-debug':
      return /(runtime|running game|input|assert|debug|diagnostic|lsp|dap|stack|variable)/.test(request) ? 9 : 0;
    case 'playtest-loop':
      return /(playtest|frustrat|difficulty|less fun|death|heatmap|session)/.test(request) ? 10 : 0;
    case 'visual-qa':
      return /(visual|screenshot|capture|viewport|overlap|contrast|sprite|camera)/.test(request) ? 8 : 0;
    case 'release-check':
      return /(export|release|build|preset|ship|package)/.test(request) ? 10 : 0;
    default:
      return 0;
  }
}

function serializeToolMatch(tool: ToolDefinitionLike & { metadata: ToolMetadata }): any {
  return {
    name: tool.name,
    description: tool.description,
    metadata: tool.metadata,
  };
}

function filterKnownOrAll(names: string[], availableToolNames: Set<string>): string[] {
  const unique = uniqueStrings(names).sort();
  if (availableToolNames.size === 0) return unique;
  return unique.filter((name) => availableToolNames.has(name));
}

function tokenize(value: string): string[] {
  return uniqueStrings(value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4));
}

function inferToolset(name: string): string {
  if (CORE_SUPPORT_TOOLS.includes(name)) return 'core';
  if (/^(session_|editor_|live_|selection_|scene_current)/.test(name)) return 'live';
  if (/^(runtime_|game_|logs_|input_|assert_)/.test(name)) return 'runtime';
  if (/(playtest|heatmap|session|fun_|fun_metrics|recording)/.test(name)) return 'playtest';
  if (/^(lsp_|dap_)|debug|diagnostic|breakpoint|stack_trace|variables|symbol|definition|references|rename/.test(name)) return 'debug';
  if (/(screenshot|viewport|visual|overlap|contrast|sprite_bounds|camera_framing)/.test(name)) return 'visual';
  if (/(quality|performance|memory|budget|profile|profiler|draw_call|texture_memory|node_count)/.test(name)) return 'quality';
  if (/(export|build|release|preset)/.test(name)) return 'release';
  if (/(asset|resource|texture|audio|model|import|theme|material|shader|particle|navigation|physics|curve|environment)/.test(name)) return 'assets';
  if (/(script|function|class|symbol|refactor|patch|dependency|autoload|uid)/.test(name)) return 'script';
  if (/(scene|node|camera|ui|hud|menu|layout|control|animation|tile|signal|connection)/.test(name)) return 'scene';
  if (/(project|filesystem|file|directory|plugin|addon|setting|input_action|network)/.test(name)) return 'project';
  return 'project';
}

function inferMutates(name: string): boolean {
  if (name === 'playtest_recording' || name === 'profiler') return true;
  if (READ_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix))) return false;
  if (/(status|matrix|diagnostics|symbols|references|definition|preview|report|list|search|find)/.test(name)) return false;
  return true;
}

function inferRequiresLive(name: string, toolset: string): boolean {
  return toolset === 'live' || /^runtime_/.test(name) || name === 'capture_editor_viewport';
}

function inferRequiresDisplay(name: string, toolset: string): boolean {
  return toolset === 'visual' || name === 'launch_editor' || name.includes('viewport') || name.includes('playtest');
}

function inferRisk(name: string, toolset: string, mutates: boolean): 'low' | 'medium' | 'high' {
  if (!mutates) return 'low';
  if (['live', 'runtime', 'playtest', 'release'].includes(toolset)) return 'high';
  if (/(remove|delete|clear|stop|export|install|update|configure|autoload)/.test(name)) return 'high';
  return 'medium';
}

function inferGodotVersion(name: string): string | undefined {
  if (/uid|lsp|dap|live|editor_|session_|runtime_/.test(name)) return '4.6';
  return undefined;
}

function readNamedProfile(projectPath: string, profileName: string, configSources: string[], warnings: string[]): { toolsets?: any; tools?: any } | null {
  const builtInProfile = BUILT_IN_TOOLSET_PROFILES[profileName];

  if (projectPath) {
    const configPath = join(resolve(projectPath), '.godot-mcp', 'toolsets.json');
    if (existsSync(configPath)) {
      try {
        const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
        const profile = parsed.profiles?.[profileName] || parsed[profileName];
        if (profile) {
          configSources.push(configPath);
          if (Array.isArray(profile)) return { toolsets: profile };
          return profile;
        }
      } catch (error: any) {
        warnings.push(`Failed to read ${configPath}: ${error.message || String(error)}`);
      }
    } else if (!builtInProfile) {
      warnings.push(`Named profile "${profileName}" requested, but ${configPath} does not exist.`);
      return null;
    }
  }

  if (builtInProfile) {
    configSources.push(`built-in:${profileName}`);
    return {
      toolsets: builtInProfile.toolsets,
      tools: builtInProfile.tools,
    };
  }

  if (projectPath) {
    const configPath = join(resolve(projectPath), '.godot-mcp', 'toolsets.json');
    warnings.push(`Named profile "${profileName}" was not found in ${configPath}.`);
  } else {
    warnings.push(`Named profile "${profileName}" was not found in built-in profiles and no GODOT_MCP_PROJECT_PATH was provided.`);
  }
  return null;
}

function builtInProfilePowerShell(name: string): string {
  return [
    `$env:GODOT_MCP_PROFILE = "${name}"`,
    '# Reload/restart the MCP connector after changing this value.',
  ].join('\n');
}

function builtInProfileJson(name: string, profile: BuiltInToolsetProfileConfig): BuiltInToolsetProfile['toolsets_json'] {
  return {
    profiles: {
      [name]: {
        description: profile.description,
        toolsets: normalizeToolsets(profile.toolsets),
        tools: uniqueStrings(profile.tools).sort(),
      },
    },
  };
}

function normalizeRecommendArgs(rawArgs: RecommendToolsetProfileArgs): { featureRequest: string; projectFacts: Record<string, any>; includeOptional: boolean } {
  return {
    featureRequest: String(rawArgs.featureRequest ?? rawArgs.feature_request ?? '').trim(),
    projectFacts: rawArgs.projectFacts ?? rawArgs.project_facts ?? {},
    includeOptional: rawArgs.includeOptional ?? rawArgs.include_optional ?? true,
  };
}

function normalizeToolsets(values: string[]): string[] {
  return uniqueStrings(values.map(normalizeToolset).filter(Boolean)).sort();
}

function normalizeToolset(value: string): string {
  const key = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  return TOOLSET_KEYS.includes(key as ToolsetKey) ? key : key;
}

function parseList(value: any): string[] {
  if (Array.isArray(value)) return uniqueStrings(value.map((entry) => String(entry).trim()).filter(Boolean));
  if (typeof value !== 'string') return [];
  return uniqueStrings(value.split(',').map((entry) => entry.trim()).filter(Boolean));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
