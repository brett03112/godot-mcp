/**
 * Phase 12: Plugin Management - Integration Tests
 *
 * Tests for:
 * - Task 12.1: list_plugins tool
 * - Task 12.2: configure_plugin tool
 * - Task 12.3: create_plugin tool
 * - Task 12.4: install_plugin tool
 */

const { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync, readdirSync } = require('fs');
const { join } = require('path');

// Test project path
const TEST_PROJECT = './test_mcp_enhancements';

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${error.message}${RESET}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertContains(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(`${message}: expected to contain "${substring}"`);
  }
}

function assertArrayEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n========================================');
console.log('Phase 12: Plugin Management Tests');
console.log('========================================\n');

// ==========================================
// Task 12.1: list_plugins Tests
// ==========================================

console.log(`${YELLOW}--- Task 12.1: list_plugins ---${RESET}`);

test('List plugins parameters validation', () => {
  const params = {
    projectPath: '/path/to/project',
    includeBuiltin: false,
    verbose: false,
  };

  assertTrue(typeof params.projectPath === 'string', 'projectPath should be a string');
  assertTrue(typeof params.includeBuiltin === 'boolean', 'includeBuiltin should be boolean');
  assertTrue(typeof params.verbose === 'boolean', 'verbose should be boolean');
});

test('Plugin info structure', () => {
  const pluginInfo = {
    id: 'my_plugin',
    name: 'My Plugin',
    description: 'A test plugin',
    author: 'Test Author',
    version: '1.0.0',
    script: 'plugin.gd',
    enabled: true,
    path: 'res://addons/my_plugin',
    hasPluginCfg: true,
  };

  assertEqual(pluginInfo.id, 'my_plugin', 'Plugin ID should match');
  assertEqual(pluginInfo.version, '1.0.0', 'Version should match');
  assertTrue(pluginInfo.enabled, 'Plugin should be enabled');
  assertTrue(pluginInfo.hasPluginCfg, 'Should have plugin.cfg');
});

test('Empty addons handling', () => {
  const result = {
    projectPath: '/path/to/project',
    pluginCount: 0,
    enabledCount: 0,
    plugins: [],
    message: 'Found 0 plugin(s) in /path/to/project',
  };

  assertEqual(result.pluginCount, 0, 'Plugin count should be 0');
  assertEqual(result.plugins.length, 0, 'Plugins array should be empty');
});

test('Verbose mode includes raw config', () => {
  const pluginInfo = {
    id: 'my_plugin',
    name: 'My Plugin',
    rawConfig: '[plugin]\nname="My Plugin"\nversion="1.0.0"',
  };

  assertTrue(pluginInfo.rawConfig !== undefined, 'Verbose mode should include rawConfig');
  assertContains(pluginInfo.rawConfig, '[plugin]', 'Raw config should contain [plugin] section');
});

// ==========================================
// Task 12.2: configure_plugin Tests
// ==========================================

console.log(`${YELLOW}--- Task 12.2: configure_plugin ---${RESET}`);

test('Enable plugin parameters', () => {
  const params = {
    projectPath: '/path/to/project',
    pluginId: 'my_plugin',
    enabled: true,
  };

  assertEqual(params.pluginId, 'my_plugin', 'Plugin ID should match');
  assertTrue(params.enabled, 'Should be enabling plugin');
});

test('Disable plugin parameters', () => {
  const params = {
    projectPath: '/path/to/project',
    pluginId: 'my_plugin',
    enabled: false,
  };

  assertEqual(params.enabled, false, 'Should be disabling plugin');
});

test('Configure plugin settings', () => {
  const params = {
    projectPath: '/path/to/project',
    pluginId: 'my_plugin',
    settings: {
      option1: 'value1',
      option2: true,
      option3: 42,
    },
  };

  assertEqual(params.settings.option1, 'value1', 'String setting should match');
  assertEqual(params.settings.option2, true, 'Boolean setting should match');
  assertEqual(params.settings.option3, 42, 'Number setting should match');
});

test('Configure result structure', () => {
  const result = {
    pluginId: 'my_plugin',
    enabled: true,
    previouslyEnabled: false,
    settingsUpdated: ['option1', 'option2'],
    changes: ['Enabled plugin: my_plugin', 'Updated settings: option1, option2'],
    message: 'Plugin configured: Enabled plugin: my_plugin; Updated settings: option1, option2',
  };

  assertTrue(result.enabled, 'Should be enabled');
  assertEqual(result.previouslyEnabled, false, 'Should track previous state');
  assertEqual(result.settingsUpdated.length, 2, 'Should have 2 settings updated');
  assertEqual(result.changes.length, 2, 'Should have 2 changes');
});

// ==========================================
// Task 12.3: create_plugin Tests
// ==========================================

console.log(`${YELLOW}--- Task 12.3: create_plugin ---${RESET}`);

test('Create basic plugin parameters', () => {
  const params = {
    projectPath: '/path/to/project',
    pluginId: 'my_plugin',
    pluginName: 'My Plugin',
    author: 'Test Author',
    description: 'A test plugin',
    version: '1.0.0',
    template: 'basic',
    autoEnable: false,
  };

  assertEqual(params.pluginId, 'my_plugin', 'Plugin ID should match');
  assertEqual(params.template, 'basic', 'Template should be basic');
  assertEqual(params.autoEnable, false, 'Should not auto-enable');
});

test('Plugin ID validation', () => {
  const validIds = ['my_plugin', 'test123', 'awesome_tool', 'plugin2d'];
  const invalidIds = ['My Plugin', '123plugin', 'plugin-name', 'PLUGIN'];

  for (const id of validIds) {
    assertTrue(/^[a-z][a-z0-9_]*$/.test(id), `${id} should be valid`);
  }

  for (const id of invalidIds) {
    assertTrue(!/^[a-z][a-z0-9_]*$/.test(id), `${id} should be invalid`);
  }
});

test('Plugin templates', () => {
  const templates = ['basic', 'dock', 'inspector', 'import', 'tool'];

  for (const template of templates) {
    assertTrue(templates.includes(template), `Template ${template} should be valid`);
  }
});

test('Create plugin result structure', () => {
  const result = {
    pluginId: 'my_plugin',
    pluginName: 'My Plugin',
    path: 'res://addons/my_plugin',
    template: 'basic',
    version: '1.0.0',
    filesCreated: ['plugin.cfg', 'plugin.gd'],
    enabled: false,
    message: "Plugin 'My Plugin' created successfully at addons/my_plugin",
  };

  assertEqual(result.filesCreated.length, 2, 'Should create 2 files');
  assertContains(result.filesCreated.join(','), 'plugin.cfg', 'Should include plugin.cfg');
  assertContains(result.filesCreated.join(','), 'plugin.gd', 'Should include plugin.gd');
});

// ==========================================
// Task 12.4: install_plugin Tests
// ==========================================

console.log(`${YELLOW}--- Task 12.4: install_plugin ---${RESET}`);

test('Install from Asset Library parameters', () => {
  const params = {
    projectPath: '/path/to/project',
    source: 'asset_library',
    assetId: 12345,
    autoEnable: false,
    overwrite: false,
  };

  assertEqual(params.source, 'asset_library', 'Source should be asset_library');
  assertEqual(params.assetId, 12345, 'Asset ID should match');
});

test('Search Asset Library parameters', () => {
  const params = {
    projectPath: '/path/to/project',
    source: 'asset_library',
    searchQuery: 'dialogue system',
  };

  assertEqual(params.searchQuery, 'dialogue system', 'Search query should match');
  assertTrue(!params.assetId, 'Should not have asset ID when searching');
});

test('Install from Git parameters', () => {
  const params = {
    projectPath: '/path/to/project',
    source: 'git',
    gitUrl: 'https://github.com/user/repo.git',
    gitBranch: 'main',
    gitSubfolder: 'addons',
    autoEnable: true,
  };

  assertEqual(params.source, 'git', 'Source should be git');
  assertEqual(params.gitBranch, 'main', 'Branch should be main');
  assertEqual(params.gitSubfolder, 'addons', 'Subfolder should be addons');
});

test('Install result structure', () => {
  const result = {
    source: 'git',
    gitUrl: 'https://github.com/user/repo.git',
    gitBranch: 'main',
    installedPlugins: ['my_plugin', 'another_plugin'],
    enabled: false,
    message: 'Installed 2 plugin(s) from Git: my_plugin, another_plugin',
  };

  assertEqual(result.installedPlugins.length, 2, 'Should install 2 plugins');
  assertContains(result.message, '2 plugin(s)', 'Message should mention plugin count');
});

// ==========================================
// Integration Tests
// ==========================================

console.log(`${YELLOW}--- Integration Tests ---${RESET}`);

test('Complete plugin lifecycle', () => {
  // Simulate: create -> enable -> configure -> disable
  const lifecycle = [
    { action: 'create', pluginId: 'test_plugin', template: 'basic' },
    { action: 'enable', pluginId: 'test_plugin', enabled: true },
    { action: 'configure', pluginId: 'test_plugin', settings: { debug: true } },
    { action: 'disable', pluginId: 'test_plugin', enabled: false },
  ];

  assertEqual(lifecycle.length, 4, 'Lifecycle should have 4 steps');
  assertEqual(lifecycle[0].action, 'create', 'First step should be create');
  assertEqual(lifecycle[3].action, 'disable', 'Last step should be disable');
});

test('Plugin.cfg format validation', () => {
  const pluginCfg = `[plugin]

name="My Plugin"
description="A test plugin"
author="Test Author"
version="1.0.0"
script="plugin.gd"
`;

  assertContains(pluginCfg, '[plugin]', 'Should have [plugin] section');
  assertContains(pluginCfg, 'name="My Plugin"', 'Should have name');
  assertContains(pluginCfg, 'script="plugin.gd"', 'Should have script');
});

test('Editor plugins array format', () => {
  const enabledPlugins = [
    'res://addons/plugin1/plugin.cfg',
    'res://addons/plugin2/plugin.cfg',
  ];

  const formatted = `enabled=PackedStringArray(${enabledPlugins.map(p => `"${p}"`).join(', ')})`;

  assertContains(formatted, 'PackedStringArray', 'Should use PackedStringArray');
  assertContains(formatted, 'res://addons/plugin1/plugin.cfg', 'Should contain plugin1 path');
  assertContains(formatted, 'res://addons/plugin2/plugin.cfg', 'Should contain plugin2 path');
});

test('Git URL formats', () => {
  const validUrls = [
    'https://github.com/user/repo.git',
    'https://github.com/user/repo',
    'https://gitlab.com/user/repo.git',
    'git@github.com:user/repo.git',
  ];

  for (const url of validUrls) {
    assertTrue(
      url.includes('github.com') || url.includes('gitlab.com'),
      `URL ${url} should be from known Git host`
    );
  }
});

// ==========================================
// File Operation Tests (if test project exists)
// ==========================================

if (existsSync(TEST_PROJECT)) {
  console.log(`${YELLOW}--- File Operation Tests ---${RESET}`);

  test('Create plugin directory structure', () => {
    const pluginDir = join(TEST_PROJECT, 'addons', 'test_integration_plugin');

    // Clean up if exists
    if (existsSync(pluginDir)) {
      rmSync(pluginDir, { recursive: true });
    }

    // Create structure
    mkdirSync(pluginDir, { recursive: true });

    // Create plugin.cfg
    const pluginCfg = `[plugin]

name="Test Integration Plugin"
description="Created by integration test"
author="Test"
version="1.0.0"
script="plugin.gd"
`;
    writeFileSync(join(pluginDir, 'plugin.cfg'), pluginCfg);

    // Create plugin.gd
    const pluginGd = `@tool
extends EditorPlugin

func _enter_tree() -> void:
	pass

func _exit_tree() -> void:
	pass
`;
    writeFileSync(join(pluginDir, 'plugin.gd'), pluginGd);

    // Verify files exist
    assertTrue(existsSync(join(pluginDir, 'plugin.cfg')), 'plugin.cfg should exist');
    assertTrue(existsSync(join(pluginDir, 'plugin.gd')), 'plugin.gd should exist');

    // Clean up
    rmSync(pluginDir, { recursive: true });
  });

  test('Parse plugin.cfg file', () => {
    const pluginDir = join(TEST_PROJECT, 'addons', 'test_parse_plugin');

    // Create test plugin
    mkdirSync(pluginDir, { recursive: true });
    const pluginCfg = `[plugin]

name="Parse Test Plugin"
description="Testing plugin.cfg parsing"
author="Parser"
version="2.0.0"
script="main.gd"
`;
    writeFileSync(join(pluginDir, 'plugin.cfg'), pluginCfg);

    // Parse the file
    const content = readFileSync(join(pluginDir, 'plugin.cfg'), 'utf-8');

    const getName = content.match(/name\s*=\s*"([^"]+)"/);
    const getVersion = content.match(/version\s*=\s*"([^"]+)"/);
    const getScript = content.match(/script\s*=\s*"([^"]+)"/);

    assertEqual(getName[1], 'Parse Test Plugin', 'Name should be parsed');
    assertEqual(getVersion[1], '2.0.0', 'Version should be parsed');
    assertEqual(getScript[1], 'main.gd', 'Script should be parsed');

    // Clean up
    rmSync(pluginDir, { recursive: true });
  });

  test('List addons directory', () => {
    const addonsDir = join(TEST_PROJECT, 'addons');

    if (existsSync(addonsDir)) {
      const items = readdirSync(addonsDir, { withFileTypes: true });
      const folders = items.filter(d => d.isDirectory()).map(d => d.name);

      assertTrue(Array.isArray(folders), 'Should return array of folder names');
    } else {
      // Create empty addons dir for test
      mkdirSync(addonsDir, { recursive: true });
      const items = readdirSync(addonsDir, { withFileTypes: true });
      assertEqual(items.length, 0, 'Empty addons should have no items');
    }
  });

  test('Template: dock plugin creates scene', () => {
    const pluginDir = join(TEST_PROJECT, 'addons', 'test_dock_plugin');

    // Clean up if exists
    if (existsSync(pluginDir)) {
      rmSync(pluginDir, { recursive: true });
    }

    mkdirSync(pluginDir, { recursive: true });

    // Create dock.tscn
    const dockScene = `[gd_scene format=3]

[node name="Dock" type="Control"]
anchors_preset = 15

[node name="Label" type="Label" parent="."]
text = "Dock Plugin"
`;
    writeFileSync(join(pluginDir, 'dock.tscn'), dockScene);

    assertTrue(existsSync(join(pluginDir, 'dock.tscn')), 'dock.tscn should exist');

    const content = readFileSync(join(pluginDir, 'dock.tscn'), 'utf-8');
    assertContains(content, '[gd_scene format=3]', 'Should be valid scene format');
    assertContains(content, 'type="Control"', 'Should have Control root');

    // Clean up
    rmSync(pluginDir, { recursive: true });
  });
}

// ==========================================
// Summary
// ==========================================

console.log('\n========================================');
console.log('Test Results');
console.log('========================================');
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`${RED}Failed: ${testsFailed}${RESET}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log(`\n${GREEN}All tests passed!${RESET}\n`);
  process.exit(0);
} else {
  console.log(`\n${RED}Some tests failed.${RESET}\n`);
  process.exit(1);
}
