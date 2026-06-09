import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { parseTestRunnerOutput, registerTestToolingTools } from '../build/tools/test-tooling.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    test_dir: 'testDir',
    test_file: 'testFile',
    changed_files: 'changedFiles',
    failure_output: 'failureOutput',
    source_path: 'sourcePath',
    output_path: 'outputPath',
    class_name: 'className',
    test_name: 'testName',
    dry_run: 'dryRun',
    include_junit: 'includeJunit',
    junit_output_path: 'junitOutputPath',
    allow_network_install: 'allowNetworkInstall',
    overwrite: 'overwrite',
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
    getGodotPath: async () => options.godotPath || 'godot',
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

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-test-tooling-'));
  await mkdir(join(projectPath, 'addons', 'gut'), { recursive: true });
  await mkdir(join(projectPath, 'addons', 'gdUnit4'), { recursive: true });
  await mkdir(join(projectPath, 'scripts'), { recursive: true });
  await mkdir(join(projectPath, 'test', 'unit'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="TestTooling"\n');
  await writeFile(join(projectPath, 'addons', 'gut', 'gut_cmdln.gd'), 'extends SceneTree\n');
  await writeFile(join(projectPath, 'addons', 'gut', 'plugin.cfg'), '[plugin]\nname="GUT"\nversion="9.5.0"\n');
  await writeFile(join(projectPath, 'addons', 'gdUnit4', 'plugin.cfg'), '[plugin]\nname="gdUnit4"\nversion="5.0.0"\n');
  await writeFile(join(projectPath, 'scripts', 'player.gd'), 'extends Node\nfunc take_damage(amount: int) -> void:\n\tpass\n');
  await writeFile(join(projectPath, 'test', 'unit', 'test_player.gd'), [
    'extends GutTest',
    '',
    'func test_take_damage_reduces_health():',
    '\tassert_true(true)',
    '',
  ].join('\n'));

  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry() {
  const registry = new ToolRegistry();
  registerTestToolingTools(registry, createContext());
  return registry;
}

test('Phase 4.3 test tooling tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
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
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('GUT tools detect installed addon, discover tests, and build targeted dry-run commands', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const install = parseResponse(await registry.dispatch('gut_install_or_update', {
      project_path: projectPath,
      dry_run: true,
    }));
    assert.equal(install.status, 'installed');
    assert.match(install.addon_path, /addons[\\/]gut$/);

    const discovered = parseResponse(await registry.dispatch('gut_discover_tests', {
      project_path: projectPath,
      test_dir: 'test',
    }));
    assert.equal(discovered.status, 'success');
    assert.equal(discovered.framework, 'gut');
    assert.equal(discovered.test_files.length, 1);
    assert.equal(discovered.test_files[0].path, 'test/unit/test_player.gd');
    assert.deepEqual(discovered.test_files[0].tests, ['test_take_damage_reduces_health']);

    const dryRun = parseResponse(await registry.dispatch('gut_run_test_file', {
      project_path: projectPath,
      test_file: 'test/unit/test_player.gd',
      dry_run: true,
      include_junit: true,
      junit_output_path: 'user://phase43_gut.xml',
    }));
    assert.equal(dryRun.status, 'dry_run');
    assert.equal(dryRun.command.executable, 'godot');
    assert.ok(dryRun.command.args.includes('addons/gut/gut_cmdln.gd'));
    assert.ok(dryRun.command.args.includes('-gtest=res://test/unit/test_player.gd'));
    assert.ok(dryRun.command.args.includes('-gjunit_xml_file=user://phase43_gut.xml'));

    const changed = parseResponse(await registry.dispatch('gut_run_changed_tests', {
      project_path: projectPath,
      changed_files: ['scripts/player.gd'],
      dry_run: true,
    }));
    assert.equal(changed.status, 'dry_run');
    assert.deepEqual(changed.selected_tests.map((entry) => entry.path), ['test/unit/test_player.gd']);
  });
});

test('gdUnit4 helpers discover and generate gdUnit-style tests without touching files in dry-run mode', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const discovered = parseResponse(await registry.dispatch('gdunit4_discover_tests', {
      project_path: projectPath,
      test_dir: 'test',
    }));
    assert.equal(discovered.status, 'success');
    assert.equal(discovered.framework, 'gdunit4');

    const generated = parseResponse(await registry.dispatch('gdunit4_generate_test', {
      project_path: projectPath,
      source_path: 'scripts/player.gd',
      output_path: 'test/unit/player_test.gd',
      class_name: 'Player',
      test_name: 'take_damage_reduces_health',
      dry_run: true,
    }));
    assert.equal(generated.status, 'dry_run');
    assert.equal(generated.output_path, 'test/unit/player_test.gd');
    assert.match(generated.content, /extends GdUnitTestSuite/);
    assert.match(generated.content, /func test_take_damage_reduces_health/);

    await assert.rejects(readFile(join(projectPath, 'test', 'unit', 'player_test.gd'), 'utf8'));
  });
});

test('planning tools map changed files and failure output to likely tests and source files', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const watch = parseResponse(await registry.dispatch('test_watch_plan', {
      project_path: projectPath,
      changed_files: ['scripts/player.gd', 'scenes/main.tscn'],
    }));
    assert.equal(watch.status, 'success');
    assert.ok(watch.recommended_commands.some((command) => command.tool === 'gut_run_changed_tests'));
    assert.ok(watch.reasons.some((reason) => reason.includes('scripts/player.gd')));

    const failure = parseResponse(await registry.dispatch('failure_to_patch_plan', {
      project_path: projectPath,
      failure_output: [
        'SCRIPT ERROR: Parse Error: Unexpected identifier',
        'at: res://scripts/player.gd:12',
        'Failing test: res://test/unit/test_player.gd::test_take_damage_reduces_health',
      ].join('\n'),
    }));
    assert.equal(failure.status, 'success');
    assert.ok(failure.patch_candidates.some((candidate) => candidate.path === 'scripts/player.gd'));
    assert.ok(failure.test_context.some((entry) => entry.path === 'test/unit/test_player.gd'));
  });
});

test('GUT runner warnings do not turn an all-passing run into a failed test result', async () => {
  const result = parseTestRunnerOutput({
    stdout: [
      'Godot Engine v4.6.3.stable.official',
      '---  GUT  ---',
      'res://test/unit/test_example.gd',
      '* test_addition',
      '1/1 passed.',
      'Totals',
      '------',
      'Scripts               1',
      'Tests                 1',
      'Passing Tests         1',
      'Asserts               2',
      '---- All tests passed! ----',
    ].join('\n'),
    stderr: [
      'SCRIPT ERROR: Trying to assign value of type Nil to a variable of type bool.',
      '   at: _static_init (res://addons/gut/gut_loader.gd:35)',
    ].join('\n'),
    exit_code: 0,
    timed_out: false,
  });

  assert.equal(result.success, true);
  assert.equal(result.summary.tests, 1);
  assert.equal(result.summary.passing, 1);
  assert.equal(result.runner_warnings.length, 1);
  assert.deepEqual(result.failures, []);
});
