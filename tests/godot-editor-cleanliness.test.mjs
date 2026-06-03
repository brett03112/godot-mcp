import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { ToolRegistry } from '../build/registry.js';
import { registerCodeIntelligenceTools } from '../build/tools/code-intelligence.js';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(repoRoot, 'test_mcp_enhancements');

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    output_path: 'outputPath',
    base_class: 'baseClass',
    class_name: 'className',
    methods_to_mock: 'methodsToMock',
    signals_to_track: 'signalsToTrack',
    return_value: 'return_value',
    setup_code: 'setupCode',
    teardown_code: 'teardownCode',
  };

  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return params;
    }

    const result = {};
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = mapping[key] || key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[normalizedKey] = normalizeParameters(value);
      } else if (Array.isArray(value)) {
        result[normalizedKey] = value.map((item) => normalizeParameters(item));
      } else {
        result[normalizedKey] = value;
      }
    }
    return result;
  };

  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({
      content: [{ type: 'text', text: message }],
      isError: true,
    }),
    validatePath: (path) => Boolean(path) && !path.includes('..'),
    executeOperation: async () => ({ stdout: '', stderr: '' }),
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

async function withTempProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-clean-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

async function readProjectFile(relativePath) {
  return readFile(join(projectRoot, relativePath), 'utf8');
}

test('active Godot fixture files avoid known language-server parser bombs', async () => {
  const checks = [
    ['shaders/invalid.gdshader', 'invalid_syntax_here'],
    ['test_error_syntax.gd', 'func _ready() -> void\n'],
    ['test_error_syntax.gd', '\nif true\n'],
    ['test_undefined_var.gd', 'undefined_variable'],
    ['test_undefined_var.gd', 'another_undefined'],
    ['test_error_multiple.gd', 'self.nonexistent_function()'],
    ['test_player.gd', 'health_changed.emit'],
    ['tier1_refactor_b.gd', 'var dmg = compute_damage(10)'],
    ['tier1_refactor_b.gd', 'health_changed.emit'],
    ['test/unit/test_coin_coverage.gd', 'called'],
    ['test/unit/test_coin_setup.gd', 'coin = Coin.new()'],
  ];

  for (const [relativePath, forbiddenText] of checks) {
    const content = await readProjectFile(relativePath);
    assert.equal(
      content.includes(forbiddenText),
      false,
      `${relativePath} should not contain ${JSON.stringify(forbiddenText)}`
    );
  }
});

test('active Godot fixture preloads resolve to existing project files', async () => {
  const scripts = [
    'complex_script.gd',
    'test_dependencies.gd',
    'tier1_refactor_b.gd',
    'test/unit/test_coin_coverage.gd',
    'test/unit/test_coin_spec.gd',
  ];

  for (const relativePath of scripts) {
    const content = await readProjectFile(relativePath);
    const preloadPattern = /preload\("res:\/\/([^"]+)"\)/g;
    for (const match of content.matchAll(preloadPattern)) {
      const targetPath = join(projectRoot, match[1]);
      assert.equal(
        existsSync(targetPath),
        true,
        `${relativePath} preloads missing file res://${match[1]}`
      );
    }
  }
});

test('dependency fixture static class calls resolve to declared static methods', async () => {
  const dependencyScript = await readProjectFile('test_dependencies.gd');
  const gameManagerScript = await readProjectFile('test_singleton.gd');

  assert.match(dependencyScript, /GameManager\.spawn_entity\(enemy\)/);
  assert.match(gameManagerScript, /static func spawn_entity\(/);
});

test('create_mock_node declares tracked custom signals before connecting them', async () => {
  await withTempProject(async (projectPath) => {
    const registry = new ToolRegistry();
    registerCodeIntelligenceTools(registry, createContext());

    const response = await registry.dispatch('create_mock_node', {
      project_path: projectPath,
      output_path: 'test/mocks/mock_coin_full.gd',
      base_class: 'Area2D',
      class_name: 'MockCoinFull',
      methods_to_mock: [{ name: 'collect', return_value: 'null' }],
      signals_to_track: ['collected', 'body_entered'],
    });

    assert.equal(response.isError, undefined);
    const content = await readFile(join(projectPath, 'test/mocks/mock_coin_full.gd'), 'utf8');
    assert.match(content, /signal collected/);
    assert.doesNotMatch(content, /signal body_entered/);
    assert.match(content, /func _on_signal_emitted\(_payload: Variant = null, signal_name: String = ""\)/);
  });
});

test('generate_test_from_specification declares custom setup variables and avoids bare called identifiers', async () => {
  await withTempProject(async (projectPath) => {
    const registry = new ToolRegistry();
    registerCodeIntelligenceTools(registry, createContext());

    const response = await registry.dispatch('generate_test_from_specification', {
      project_path: projectPath,
      output_path: 'test/unit/test_coin_setup.gd',
      class_name: 'Coin',
      specifications: [{ description: 'collect works correctly', expected_behavior: 'collect should be called' }],
      setup_code: 'coin = Coin.new()\nadd_child_autofree(coin)',
      teardown_code: 'coin = null',
    });

    assert.equal(response.isError, undefined);
    const content = await readFile(join(projectPath, 'test/unit/test_coin_setup.gd'), 'utf8');
    assert.match(content, /var coin/);
    assert.doesNotMatch(content, /\bcalled\b/);
  });
});
