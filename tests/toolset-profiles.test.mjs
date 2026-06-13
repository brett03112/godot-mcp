import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import {
  createActiveToolProfile,
  decorateToolDefinition,
  disabledToolResponse,
  filterToolDefinitions,
  getToolMetadata,
  recommendToolsetProfile,
  toolsetStatusPayload,
} from '../build/toolsets.js';
import { registerToolsetProfileTools } from '../build/tools/toolset-profile.js';
import { registerPlaytestTools } from '../build/tools/playtest.js';
import { registerProfilingTools } from '../build/tools/profiling.js';

const BUILD_INDEX = join(process.cwd(), 'build', 'index.js');

const SAMPLE_TOOLS = [
  tool('toolset_status'),
  tool('recommend_toolset_profile'),
  tool('get_godot_version'),
  tool('get_project_info'),
  tool('validate_scene'),
  tool('create_scene'),
  tool('script_patch'),
  tool('filesystem_search'),
  tool('resource_search'),
  tool('session_list'),
  tool('selection_get'),
  tool('runtime_play_scene'),
  tool('run_automated_playtest'),
  tool('capture_editor_viewport'),
  tool('quality_gate_run'),
  tool('lsp_diagnostics'),
  tool('validate_export'),
  tool('export_project'),
];

function tool(name) {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: 'object', properties: {} },
  };
}

function names(tools) {
  return tools.map((entry) => entry.name).sort();
}

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function send(child, message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

function waitForId(child, id, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let stderr = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for response id ${id}. stderr=${stderr}`));
    }, timeoutMs);
    timer.unref?.();

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onStderr);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    const onStderr = (chunk) => {
      stderr += chunk.toString('utf8');
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`MCP server exited before response id ${id}. code=${code} stderr=${stderr}`));
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.id === id) {
          cleanup();
          resolve(message);
          return;
        }
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

async function request(child, message, timeoutMs) {
  const response = waitForId(child, message.id, timeoutMs);
  send(child, message);
  return response;
}

async function withMcpServer(env, fn) {
  const child = spawn(process.execPath, [BUILD_INDEX], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GODOT_PATH: process.env.GODOT_PATH || 'C:/Users/brett/Desktop/Godot/Godot.exe',
      ...env,
    },
    windowsHide: true,
  });

  try {
    const initialize = await request(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase-7-4-runtime-behavior', version: '1.0.0' },
      },
    });
    assert.equal(initialize.error, undefined);
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    await fn(child);
  } finally {
    child.kill();
  }
}

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    feature_request: 'featureRequest',
    project_facts: 'projectFacts',
    active_toolsets: 'activeToolsets',
    active_tools: 'activeTools',
    include_optional: 'includeOptional',
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

test('default profile exposes every tool with registry metadata', () => {
  const profile = createActiveToolProfile({
    env: {},
    allToolNames: names(SAMPLE_TOOLS),
  });
  const filtered = filterToolDefinitions(SAMPLE_TOOLS, profile);

  assert.equal(profile.mode, 'all');
  assert.equal(filtered.length, SAMPLE_TOOLS.length);
  assert.deepEqual(names(filtered), names(SAMPLE_TOOLS));

  const decorated = decorateToolDefinition(tool('script_patch'));
  assert.equal(decorated.metadata.toolset, 'script');
  assert.equal(decorated.metadata.mutates, true);
  assert.equal(decorated.metadata.risk, 'medium');
});

test('default full-catalog mode is marked heavy but remains backward-compatible', () => {
  const profile = createActiveToolProfile({
    env: {},
    allToolNames: names(SAMPLE_TOOLS),
  });
  const status = toolsetStatusPayload({
    profile,
    allToolDefinitions: SAMPLE_TOOLS,
  });

  assert.equal(status.mode, 'all');
  assert.equal(status.loaded_tool_count, SAMPLE_TOOLS.length);
  assert.equal(status.hidden_tool_count, 0);
  assert.equal(status.catalog_summary.loaded_tool_count, SAMPLE_TOOLS.length);
  assert.equal(status.catalog_summary.hidden_tool_count, 0);
  assert.equal(status.full_catalog.heavy, true);
  assert.equal(status.full_catalog.recommended_normal_mode, false);
});

test('invalid profile config reports startup/status warnings', () => {
  const profile = createActiveToolProfile({
    env: {
      GODOT_MCP_TOOLSETS: 'core,bad-set',
      GODOT_MCP_TOOLS: 'missing_tool',
      GODOT_MCP_PROFILE: 'missing-profile',
    },
    allToolNames: names(SAMPLE_TOOLS),
  });
  const warningText = profile.warnings.join('\n');

  assert.equal(profile.mode, 'filtered');
  assert.match(warningText, /bad-set/);
  assert.match(warningText, /missing_tool/);
  assert.match(warningText, /missing-profile/);
});

test('GODOT_MCP_TOOLSETS filters tools and leaves remediation for hidden known tools', () => {
  const profile = createActiveToolProfile({
    env: { GODOT_MCP_TOOLSETS: 'core,scene' },
    allToolNames: names(SAMPLE_TOOLS),
  });
  const filteredNames = names(filterToolDefinitions(SAMPLE_TOOLS, profile));

  assert.equal(profile.mode, 'filtered');
  assert.deepEqual(profile.activeToolsets.sort(), ['core', 'scene']);
  assert.equal(filteredNames.includes('toolset_status'), true);
  assert.equal(filteredNames.includes('validate_scene'), true);
  assert.equal(filteredNames.includes('create_scene'), true);
  assert.equal(filteredNames.includes('run_automated_playtest'), false);
  assert.equal(filteredNames.includes('export_project'), false);

  const disabled = parseResponse(disabledToolResponse('run_automated_playtest', profile));
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.tool, 'run_automated_playtest');
  assert.match(disabled.remediation.env.GODOT_MCP_TOOLSETS, /playtest/);
});

test('GODOT_MCP_TOOLS explicit allowlist includes only named tools plus core support', () => {
  const profile = createActiveToolProfile({
    env: { GODOT_MCP_TOOLS: 'script_patch,validate_scene' },
    allToolNames: names(SAMPLE_TOOLS),
  });
  const filteredNames = names(filterToolDefinitions(SAMPLE_TOOLS, profile));

  assert.equal(profile.mode, 'filtered');
  assert.equal(filteredNames.includes('script_patch'), true);
  assert.equal(filteredNames.includes('validate_scene'), true);
  assert.equal(filteredNames.includes('toolset_status'), true);
  assert.equal(filteredNames.includes('recommend_toolset_profile'), true);
  assert.equal(filteredNames.includes('run_automated_playtest'), false);
  assert.equal(filteredNames.includes('resource_search'), false);
});

test('per-project toolsets.json named profiles can seed the active catalog', async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-toolsets-'));
  try {
    await mkdir(join(projectPath, '.godot-mcp'), { recursive: true });
    await writeFile(join(projectPath, '.godot-mcp', 'toolsets.json'), JSON.stringify({
      profiles: {
        'feature-scene-edit': {
          toolsets: ['core', 'scene', 'script', 'visual'],
          tools: ['filesystem_search'],
        },
      },
    }, null, 2));

    const profile = createActiveToolProfile({
      env: {
        GODOT_MCP_PROJECT_PATH: projectPath,
        GODOT_MCP_PROFILE: 'feature-scene-edit',
      },
      allToolNames: names(SAMPLE_TOOLS),
    });
    const filteredNames = names(filterToolDefinitions(SAMPLE_TOOLS, profile));

    assert.equal(profile.namedProfile, 'feature-scene-edit');
    assert.equal(profile.configSources.some((source) => source.includes('toolsets.json')), true);
    assert.equal(filteredNames.includes('script_patch'), true);
    assert.equal(filteredNames.includes('capture_editor_viewport'), true);
    assert.equal(filteredNames.includes('filesystem_search'), true);
    assert.equal(filteredNames.includes('run_automated_playtest'), false);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('registry dispatch returns a clear disabled-tool error for filtered known tools', async () => {
  const registry = new ToolRegistry();
  registry.registerAll([
    {
      name: 'script_patch',
      description: 'allowed',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: '{"status":"success"}' }] }),
    },
    {
      name: 'run_automated_playtest',
      description: 'hidden',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        throw new Error('hidden handler should not run');
      },
    },
  ]);
  registry.configureToolProfile(createActiveToolProfile({
    env: { GODOT_MCP_TOOLSETS: 'core,script' },
    allToolNames: registry.getToolNames(),
  }));

  const response = await registry.dispatch('run_automated_playtest', {});
  const payload = parseResponse(response);
  assert.equal(response.isError, true);
  assert.equal(payload.status, 'disabled');
  assert.match(payload.message, /not loaded by the active Godot MCP tool profile/i);
});

test('toolset_status and recommend_toolset_profile report active profile and setup snippets', async () => {
  const profile = createActiveToolProfile({
    env: { GODOT_MCP_TOOLSETS: 'core,scene' },
    allToolNames: names(SAMPLE_TOOLS),
  });
  const registry = new ToolRegistry();
  registerToolsetProfileTools(registry, createContext(), {
    getActiveProfile: () => profile,
    getAllToolDefinitions: () => SAMPLE_TOOLS,
  });

  const status = parseResponse(await registry.dispatch('toolset_status', {}));
  assert.equal(status.status, 'success');
  assert.equal(status.active_toolsets.includes('scene'), true);
  assert.equal(status.loaded_tool_count, filterToolDefinitions(SAMPLE_TOOLS, profile).length);
  assert.equal(status.hidden_tool_count > 0, true);

  const pause = parseResponse(await registry.dispatch('recommend_toolset_profile', {
    feature_request: 'add a pause menu',
    project_facts: { has_tests: true, has_live_editor: true },
  }));
  assert.equal(pause.status, 'success');
  assert.equal(pause.recommended_toolsets.includes('scene'), true);
  assert.equal(pause.recommended_toolsets.includes('script'), true);
  assert.equal(pause.recommended_toolsets.includes('visual'), true);
  assert.match(pause.env_snippet, /GODOT_MCP_TOOLSETS=/);

  const playtest = recommendToolsetProfile({
    featureRequest: 'run a playtest and make the level less frustrating',
    projectFacts: { has_live_editor: true },
  });
  assert.equal(playtest.recommended_toolsets.includes('playtest'), true);
  assert.equal(playtest.recommended_toolsets.includes('runtime'), true);
  assert.equal(playtest.recommended_toolsets.includes('quality'), true);
});

test('recommend_toolset_profile uses catalog metadata and built-in profiles', () => {
  const recommendation = recommendToolsetProfile({
    featureRequest: 'inspect the open editor, verify selected nodes, and take a screenshot',
    projectFacts: { has_live_editor: true },
  }, { allToolDefinitions: SAMPLE_TOOLS });

  assert.equal(recommendation.status, 'success');
  assert.equal(recommendation.primary_named_profile, 'live-editor');
  assert.equal(recommendation.named_profile_suggestions[0].name, 'live-editor');
  assert.equal(recommendation.exact_extra_tools.includes('capture_editor_viewport'), true);
  assert.equal(recommendation.exact_extra_tools.includes('selection_get'), true);
  assert.equal(recommendation.needed_mcp_resources.includes('godot-mcp://live/sessions'), true);
  assert.equal(recommendation.verification_commands.includes('session_list(project_path)'), true);
  assert.match(recommendation.profile_env_snippet, /GODOT_MCP_PROFILE=live-editor/);
  assert.match(recommendation.reload_required, /Reload/);

  const selectionMatch = recommendation.available_tool_matches.find((entry) => entry.name === 'selection_get');
  assert.ok(selectionMatch);
  assert.equal(selectionMatch.metadata.toolset, 'live');
  assert.equal(selectionMatch.metadata.requires_live, true);
});

test('registry recommend_toolset_profile passes the real provider catalog', async () => {
  const profile = createActiveToolProfile({
    env: {},
    allToolNames: names(SAMPLE_TOOLS),
  });
  const registry = new ToolRegistry();
  registerToolsetProfileTools(registry, createContext(), {
    getActiveProfile: () => profile,
    getAllToolDefinitions: () => SAMPLE_TOOLS,
  });

  const recommendation = parseResponse(await registry.dispatch('recommend_toolset_profile', {
    feature_request: 'prepare a release export check with diagnostics',
  }));

  assert.equal(recommendation.primary_named_profile, 'release-check');
  assert.equal(recommendation.exact_extra_tools.includes('validate_export'), true);
  assert.equal(recommendation.available_tool_matches.some((entry) => entry.name === 'export_project' && entry.metadata.toolset === 'release'), true);
  assert.equal(recommendation.verification_commands.includes('validate_export(project_path)'), true);
});

test('consolidated lifecycle tools validate actions and legacy names stay deprecated aliases', async () => {
  const ctx = createContext();
  const registry = new ToolRegistry();
  registerPlaytestTools(registry, ctx);
  registerProfilingTools(registry, ctx);

  assert.equal(registry.has('playtest_recording'), true);
  assert.equal(registry.has('start_playtest_recording'), true);
  assert.equal(registry.has('stop_playtest_recording'), true);
  assert.equal(getToolMetadata('start_playtest_recording').deprecated, true);
  assert.equal(getToolMetadata('stop_playtest_recording').alias_for, 'playtest_recording');

  const badPlaytestAction = parseResponse(await registry.dispatch('playtest_recording', {
    action: 'pause',
    project_path: 'C:/tmp/project',
  }));
  assert.equal(badPlaytestAction.status, 'failed');
  assert.match(badPlaytestAction.reason, /action must be "start" or "stop"/);

  assert.equal(registry.has('profiler'), true);
  assert.equal(registry.has('start_profiler'), true);
  assert.equal(getToolMetadata('start_profiler').deprecated, true);
  assert.equal(getToolMetadata('analyze_bottlenecks').alias_for, 'profiler');

  const badProfilerAction = parseResponse(await registry.dispatch('profiler', {
    action: 'pause',
    project_path: 'C:/tmp/project',
  }));
  assert.equal(badProfilerAction.status, 'failed');
  assert.match(badProfilerAction.reason, /action must be "start", "get", or "analyze"/);
});

test('status payloads include catalog/resource filtering facts', () => {
  const profile = createActiveToolProfile({
    env: { GODOT_MCP_TOOLSETS: 'core,debug' },
    allToolNames: names(SAMPLE_TOOLS),
  });
  const status = toolsetStatusPayload({
    profile,
    allToolDefinitions: SAMPLE_TOOLS,
  });

  assert.equal(status.loaded_tool_count, filterToolDefinitions(SAMPLE_TOOLS, profile).length);
  assert.equal(status.hidden_tool_count, SAMPLE_TOOLS.length - status.loaded_tool_count);
  assert.equal(status.resources.catalog_filtered, true);
  assert.equal(status.disabled_tool_remediation.includes('GODOT_MCP_TOOLSETS'), true);
  assert.equal(status.available_toolsets.includes('debug'), true);
});

test('stdio tools, resources, and dispatch use the same filtered catalog', async () => {
  await withMcpServer({ GODOT_MCP_TOOLSETS: 'core,script' }, async (child) => {
    const listed = await request(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(listed.error, undefined);
    const listedNames = listed.result.tools.map((tool) => tool.name);
    assert.equal(listedNames.includes('script_patch'), true);
    assert.equal(listedNames.includes('run_automated_playtest'), false);

    const catalog = await request(child, {
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/read',
      params: { uri: 'godot-mcp://tools/catalog' },
    });
    assert.equal(catalog.error, undefined);
    const catalogPayload = JSON.parse(catalog.result.contents[0].text);
    const catalogNames = catalogPayload.tools.map((tool) => tool.name);
    assert.equal(catalogNames.includes('script_patch'), true);
    assert.equal(catalogNames.includes('run_automated_playtest'), false);

    const hiddenResource = await request(child, {
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/read',
      params: { uri: 'godot-mcp://tools/run_automated_playtest' },
    });
    assert.ok(hiddenResource.error);
    assert.match(hiddenResource.error.message, /not found/i);

    const hiddenCall = await request(child, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'run_automated_playtest',
        arguments: { project_path: 'C:/tmp/project' },
      },
    });
    assert.equal(hiddenCall.error, undefined);
    const disabled = JSON.parse(hiddenCall.result.content[0].text);
    assert.equal(disabled.status, 'disabled');
    assert.match(disabled.remediation.env.GODOT_MCP_TOOLSETS, /playtest/);
  });
});
