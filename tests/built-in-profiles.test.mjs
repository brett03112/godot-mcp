import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createActiveToolProfile,
  filterToolDefinitions,
  getBuiltInToolsetProfiles,
  toolsetStatusPayload,
} from '../build/toolsets.js';

const BUILT_IN_PROFILE_NAMES = [
  'planning-readonly',
  'scene-edit',
  'live-editor',
  'runtime-debug',
  'playtest-loop',
  'visual-qa',
  'release-check',
];

const SAMPLE_TOOLS = [
  tool('toolset_status'),
  tool('recommend_toolset_profile'),
  tool('live_config_status'),
  tool('get_godot_version'),
  tool('list_projects'),
  tool('get_project_info'),
  tool('capability_matrix'),
  tool('recommend_next_tool'),
  tool('plan_feature_implementation'),
  tool('plan_test_strategy'),
  tool('risk_scan'),
  tool('preflight_project_health'),
  tool('postchange_verification_plan'),
  tool('project_settings_get'),
  tool('autoload_list'),
  tool('filesystem_search'),
  tool('dependency_graph'),
  tool('find_orphaned_assets'),
  tool('find_missing_uid_files'),
  tool('validate_scene'),
  tool('create_scene'),
  tool('add_node'),
  tool('save_scene'),
  tool('script_patch'),
  tool('create_script'),
  tool('analyze_script'),
  tool('resource_search'),
  tool('create_gradient_texture'),
  tool('session_list'),
  tool('editor_state'),
  tool('selection_get'),
  tool('scene_current'),
  tool('editor_screenshot'),
  tool('capture_editor_viewport'),
  tool('runtime_play_scene'),
  tool('runtime_scene_tree'),
  tool('runtime_node_snapshot'),
  tool('input_action_press'),
  tool('assert_runtime_state'),
  tool('lsp_diagnostics'),
  tool('dap_status'),
  tool('dap_stack_trace'),
  tool('run_automated_playtest'),
  tool('playtest_recording'),
  tool('analyze_playtest_session'),
  tool('capture_runtime_viewport'),
  tool('screenshot_compare'),
  tool('visual_regression_check'),
  tool('ui_overlap_check'),
  tool('ui_contrast_check'),
  tool('sprite_bounds_check'),
  tool('camera_framing_check'),
  tool('quality_gate_run'),
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

function filteredNamesFor(profileName, extraEnv = {}) {
  const profile = createActiveToolProfile({
    env: { GODOT_MCP_PROFILE: profileName, ...extraEnv },
    allToolNames: names(SAMPLE_TOOLS),
  });
  return {
    profile,
    filteredNames: names(filterToolDefinitions(SAMPLE_TOOLS, profile)),
  };
}

test('built-in example profiles are listed with copy/paste snippets', () => {
  const profiles = getBuiltInToolsetProfiles();
  assert.deepEqual(profiles.map((entry) => entry.name), BUILT_IN_PROFILE_NAMES);

  for (const profile of profiles) {
    assert.equal(typeof profile.description, 'string', `${profile.name} description`);
    assert.equal(profile.description.length > 10, true, `${profile.name} useful description`);
    assert.equal(Array.isArray(profile.toolsets), true, `${profile.name} toolsets`);
    assert.equal(Array.isArray(profile.tools), true, `${profile.name} tools`);
    assert.equal(Array.isArray(profile.resources), true, `${profile.name} resources`);
    assert.equal(Array.isArray(profile.verification_commands), true, `${profile.name} verification`);
    assert.equal(profile.resources.length > 0, true, `${profile.name} resources present`);
    assert.equal(profile.verification_commands.length > 0, true, `${profile.name} verification present`);
    assert.match(profile.powershell, new RegExp(`GODOT_MCP_PROFILE = "${profile.name}"`));
    assert.deepEqual(profile.toolsets_json.profiles[profile.name].toolsets, profile.toolsets);
    assert.deepEqual(profile.toolsets_json.profiles[profile.name].tools || [], profile.tools);
  }
});

test('built-in named profiles activate without project-local toolsets.json', () => {
  const expectations = {
    'planning-readonly': {
      loaded: ['filesystem_search', 'lsp_diagnostics', 'recommend_next_tool'],
      hidden: ['create_scene', 'script_patch', 'run_automated_playtest'],
    },
    'scene-edit': {
      loaded: ['create_scene', 'script_patch', 'resource_search', 'quality_gate_run'],
      hidden: ['runtime_play_scene', 'run_automated_playtest'],
    },
    'live-editor': {
      loaded: ['session_list', 'editor_state', 'capture_editor_viewport'],
      hidden: ['run_automated_playtest', 'export_project'],
    },
    'runtime-debug': {
      loaded: ['runtime_play_scene', 'runtime_node_snapshot', 'input_action_press', 'lsp_diagnostics', 'dap_status'],
      hidden: ['run_automated_playtest', 'export_project'],
    },
    'playtest-loop': {
      loaded: ['run_automated_playtest', 'playtest_recording', 'analyze_playtest_session', 'capture_runtime_viewport', 'quality_gate_run'],
      hidden: ['export_project'],
    },
    'visual-qa': {
      loaded: ['screenshot_compare', 'ui_overlap_check', 'camera_framing_check', 'capture_editor_viewport'],
      hidden: ['export_project'],
    },
    'release-check': {
      loaded: ['validate_export', 'export_project', 'quality_gate_run', 'lsp_diagnostics'],
      hidden: ['run_automated_playtest'],
    },
  };

  for (const [profileName, expected] of Object.entries(expectations)) {
    const { profile, filteredNames } = filteredNamesFor(profileName);
    assert.equal(profile.mode, 'filtered', `${profileName} mode`);
    assert.equal(profile.namedProfile, profileName, `${profileName} named profile`);
    assert.equal(profile.configSources.includes(`built-in:${profileName}`), true, `${profileName} source`);
    assert.equal(profile.warnings.length, 0, `${profileName} warnings`);
    assert.equal(profile.hiddenToolNames.length > 0, true, `${profileName} hidden tools`);

    for (const name of expected.loaded) {
      assert.equal(filteredNames.includes(name), true, `${profileName} loads ${name}`);
    }
    for (const name of expected.hidden) {
      assert.equal(filteredNames.includes(name), false, `${profileName} hides ${name}`);
    }
  }
});

test('project-local named profiles override built-in examples', async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-built-in-profile-'));
  try {
    await mkdir(join(projectPath, '.godot-mcp'), { recursive: true });
    await writeFile(join(projectPath, '.godot-mcp', 'toolsets.json'), JSON.stringify({
      profiles: {
        'scene-edit': {
          toolsets: ['core', 'debug'],
          tools: ['filesystem_search'],
        },
      },
    }, null, 2));

    const { profile, filteredNames } = filteredNamesFor('scene-edit', { GODOT_MCP_PROJECT_PATH: projectPath });
    assert.equal(profile.configSources.some((source) => source.includes('toolsets.json')), true);
    assert.equal(profile.configSources.includes('built-in:scene-edit'), false);
    assert.equal(filteredNames.includes('lsp_diagnostics'), true);
    assert.equal(filteredNames.includes('filesystem_search'), true);
    assert.equal(filteredNames.includes('create_scene'), false);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('toolset_status includes built-in profile count examples', () => {
  const { profile } = filteredNamesFor('scene-edit');
  const status = toolsetStatusPayload({
    profile,
    allToolDefinitions: SAMPLE_TOOLS,
  });

  assert.equal(Array.isArray(status.built_in_profiles), true);
  assert.deepEqual(status.built_in_profiles.map((entry) => entry.name), BUILT_IN_PROFILE_NAMES);

  const sceneEdit = status.built_in_profiles.find((entry) => entry.name === 'scene-edit');
  assert.ok(sceneEdit);
  assert.match(sceneEdit.powershell, /GODOT_MCP_PROFILE = "scene-edit"/);
  assert.equal(sceneEdit.example_counts.loaded_tool_count > 0, true);
  assert.equal(sceneEdit.example_counts.hidden_tool_count > 0, true);
  assert.equal(
    sceneEdit.example_counts.loaded_tool_count + sceneEdit.example_counts.hidden_tool_count,
    SAMPLE_TOOLS.length,
  );
  assert.deepEqual(sceneEdit.toolsets_json.profiles['scene-edit'].toolsets, sceneEdit.toolsets);
});
