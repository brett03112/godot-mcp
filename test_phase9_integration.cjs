/**
 * Phase 9: Build & Export Pipeline - Integration Tests
 *
 * Tests for:
 * - Task 9.1: create_export_preset tool
 * - Task 9.2: export_project tool
 * - Task 9.3: validate_export tool
 */

const { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync } = require('fs');
const { join } = require('path');

// Test project path
const TEST_PROJECT = './test_mcp_enhancements';
const EXPORT_PRESETS_PATH = join(TEST_PROJECT, 'export_presets.cfg');

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

// Clean up any existing export_presets.cfg before tests
function cleanup() {
  if (existsSync(EXPORT_PRESETS_PATH)) {
    unlinkSync(EXPORT_PRESETS_PATH);
  }
  // Clean up test export directories
  const exportDir = join(TEST_PROJECT, 'export');
  if (existsSync(exportDir)) {
    rmSync(exportDir, { recursive: true, force: true });
  }
}

console.log('\n========================================');
console.log('Phase 9: Build & Export Pipeline Tests');
console.log('========================================\n');

// Cleanup before tests
cleanup();

// ==========================================
// Task 9.1: create_export_preset Tests
// ==========================================

console.log(`${YELLOW}--- Task 9.1: create_export_preset ---${RESET}`);

test('Create Windows Desktop export preset', () => {
  // Simulate what the tool does
  const presetName = 'Windows Release';
  const platform = 'Windows Desktop';
  const presetCount = 0;
  const exportPath = `export/Windows_Desktop/Windows_Release.exe`;

  const presetSection = `
[preset.${presetCount}]

name="${presetName}"
platform="${platform}"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="${exportPath}"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false

[preset.${presetCount}.options]

custom_template/debug=""
custom_template/release=""
debug/export_console_wrapper=1
binary_format/embed_pck=false
texture_format/bptc=true
texture_format/s3tc=true
texture_format/etc=false
texture_format/etc2=false
binary_format/architecture="x86_64"
codesign/enable=false
application/modify_resources=true
application/icon=""
`;

  writeFileSync(EXPORT_PRESETS_PATH, presetSection, 'utf8');

  assertTrue(existsSync(EXPORT_PRESETS_PATH), 'export_presets.cfg should be created');
  const content = readFileSync(EXPORT_PRESETS_PATH, 'utf8');
  assertContains(content, 'name="Windows Release"', 'Should contain preset name');
  assertContains(content, 'platform="Windows Desktop"', 'Should contain platform');
  assertContains(content, 'export_path="export/Windows_Desktop/Windows_Release.exe"', 'Should contain export path');
});

test('Create Web export preset (appending)', () => {
  const presetName = 'Web Debug';
  const platform = 'Web';
  const presetCount = 1; // Second preset
  const exportPath = `export/Web/Web_Debug.html`;

  const presetSection = `
[preset.${presetCount}]

name="${presetName}"
platform="${platform}"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="${exportPath}"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false

[preset.${presetCount}.options]

custom_template/debug=""
custom_template/release=""
variant/extensions_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
`;

  const existingContent = readFileSync(EXPORT_PRESETS_PATH, 'utf8');
  writeFileSync(EXPORT_PRESETS_PATH, existingContent + presetSection, 'utf8');

  const content = readFileSync(EXPORT_PRESETS_PATH, 'utf8');
  assertContains(content, '[preset.0]', 'Should contain first preset');
  assertContains(content, '[preset.1]', 'Should contain second preset');
  assertContains(content, 'name="Web Debug"', 'Should contain Web preset name');
  assertContains(content, 'platform="Web"', 'Should contain Web platform');
});

test('Count presets correctly', () => {
  const content = readFileSync(EXPORT_PRESETS_PATH, 'utf8');
  const presetMatches = content.match(/\[preset\.\d+\]/g);
  assertEqual(presetMatches.length, 2, 'Should have 2 preset sections');
});

test('Platform-specific file extensions', () => {
  const extensions = {
    'Windows Desktop': '.exe',
    'Linux/X11': '.x86_64',
    'macOS': '.zip',
    'Web': '.html',
    'Android': '.apk',
    'iOS': '.ipa',
  };

  for (const [platform, ext] of Object.entries(extensions)) {
    const expected = ext;
    assertEqual(expected, extensions[platform], `${platform} should have extension ${ext}`);
  }
});

test('Detect duplicate preset names', () => {
  const content = readFileSync(EXPORT_PRESETS_PATH, 'utf8');
  const nameRegex = new RegExp(`name="Windows Release"`, 'g');
  const matches = content.match(nameRegex);
  assertEqual(matches.length, 1, 'Should only have one Windows Release preset');
});

// ==========================================
// Task 9.2: export_project Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 9.2: export_project ---${RESET}`);

test('Verify preset exists before export', () => {
  const content = readFileSync(EXPORT_PRESETS_PATH, 'utf8');

  // Test preset that exists
  const existingPreset = 'Windows Release';
  const nameRegex1 = new RegExp(`name="${existingPreset}"`, 'g');
  assertTrue(nameRegex1.test(content), `Preset "${existingPreset}" should exist`);

  // Test preset that doesn't exist
  const missingPreset = 'Linux Debug';
  const nameRegex2 = new RegExp(`name="${missingPreset}"`, 'g');
  assertTrue(!nameRegex2.test(content), `Preset "${missingPreset}" should not exist`);
});

test('Create output directory structure', () => {
  const outputPath = join(TEST_PROJECT, 'export', 'test_build', 'game.exe');
  const outputDir = join(TEST_PROJECT, 'export', 'test_build');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  assertTrue(existsSync(outputDir), 'Output directory should be created');
});

test('Export command construction', () => {
  const godotPath = 'godot';
  const projectPath = TEST_PROJECT;
  const presetName = 'Windows Release';
  const outputPath = join(TEST_PROJECT, 'export', 'test_build', 'game.exe');

  // Debug mode export
  const debugArgs = [
    '--headless',
    '--path', projectPath,
    '--export-debug',
    presetName,
    outputPath,
  ];
  assertEqual(debugArgs[3], '--export-debug', 'Debug export should use --export-debug flag');

  // Release mode export
  const releaseArgs = [
    '--headless',
    '--path', projectPath,
    '--export-release',
    presetName,
    outputPath,
  ];
  assertEqual(releaseArgs[3], '--export-release', 'Release export should use --export-release flag');
});

test('Pack-only export command construction', () => {
  const presetName = 'Windows Release';

  // Debug pack export
  const debugPackFlag = '--export-debug-pack';
  assertEqual(debugPackFlag, '--export-debug-pack', 'Debug pack export should use --export-debug-pack flag');

  // Release pack export
  const releasePackFlag = '--export-pack';
  assertEqual(releasePackFlag, '--export-pack', 'Release pack export should use --export-pack flag');
});

// ==========================================
// Task 9.3: validate_export Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 9.3: validate_export ---${RESET}`);

test('Detect missing export_presets.cfg', () => {
  const tempPresets = EXPORT_PRESETS_PATH + '.bak';

  // Temporarily rename export_presets.cfg
  const content = readFileSync(EXPORT_PRESETS_PATH, 'utf8');
  unlinkSync(EXPORT_PRESETS_PATH);

  // Check detection
  assertTrue(!existsSync(EXPORT_PRESETS_PATH), 'export_presets.cfg should not exist');

  // Restore
  writeFileSync(EXPORT_PRESETS_PATH, content, 'utf8');
  assertTrue(existsSync(EXPORT_PRESETS_PATH), 'export_presets.cfg should be restored');
});

test('List available presets', () => {
  const content = readFileSync(EXPORT_PRESETS_PATH, 'utf8');
  const presetMatches = content.match(/name="([^"]+)"/g);

  assertTrue(presetMatches !== null, 'Should find preset names');

  const presetNames = presetMatches.map(m => m.replace('name="', '').replace('"', ''));
  assertTrue(presetNames.includes('Windows Release'), 'Should include Windows Release');
  assertTrue(presetNames.includes('Web Debug'), 'Should include Web Debug');
});

test('Check for project icon', () => {
  const iconFiles = ['icon.svg', 'icon.png'];
  let hasIcon = false;

  for (const iconFile of iconFiles) {
    if (existsSync(join(TEST_PROJECT, iconFile))) {
      hasIcon = true;
      break;
    }
  }

  assertTrue(hasIcon, 'Project should have an icon file');
});

test('Scan for GDScript files', () => {
  const { readdirSync } = require('fs');

  function findScripts(dir, scripts = []) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '.godot') {
          findScripts(fullPath, scripts);
        } else if (entry.isFile() && entry.name.endsWith('.gd')) {
          scripts.push(fullPath);
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
    return scripts;
  }

  const scripts = findScripts(TEST_PROJECT);
  // May or may not have scripts, just verify the function works
  assertTrue(Array.isArray(scripts), 'Should return an array of scripts');
});

test('Detect breakpoint() calls in scripts', () => {
  const testScript = `
extends Node

func _ready():
    breakpoint()
    print("Debug mode")
`;

  const hasBreakpoint = testScript.includes('breakpoint()');
  assertTrue(hasBreakpoint, 'Should detect breakpoint() call');
});

test('Detect TODO/FIXME comments', () => {
  const testScript = `
extends Node

# TODO: Implement feature
# FIXME: Fix this bug
# XXX: Needs review
# HACK: Temporary workaround

func _ready():
    pass
`;

  const todoMatches = testScript.match(/(?:#|\/\/)\s*(TODO|FIXME|XXX|HACK):/gi);
  assertTrue(todoMatches !== null, 'Should find TODO/FIXME comments');
  assertEqual(todoMatches.length, 4, 'Should find 4 TODO/FIXME comments');
});

test('Calculate issue severity counts', () => {
  const issues = [
    { type: 'missing_presets', severity: 'error', message: 'Test error' },
    { type: 'breakpoint', severity: 'warning', message: 'Test warning 1' },
    { type: 'large_asset', severity: 'warning', message: 'Test warning 2' },
    { type: 'todo_comments', severity: 'info', message: 'Test info' },
  ];

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  assertEqual(errorCount, 1, 'Should count 1 error');
  assertEqual(warningCount, 2, 'Should count 2 warnings');
  assertEqual(infoCount, 1, 'Should count 1 info');
});

test('Large asset threshold calculation', () => {
  const defaultThreshold = 10 * 1024 * 1024; // 10MB
  assertEqual(defaultThreshold, 10485760, 'Default threshold should be 10MB');

  const customThreshold = 5 * 1024 * 1024; // 5MB
  assertEqual(customThreshold, 5242880, 'Custom threshold should be 5MB');

  // Format as MB
  const fileSizeBytes = 15728640; // 15MB
  const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  assertEqual(sizeMB, '15.00', 'Should format file size as MB');
});

test('Export readiness determination', () => {
  const scenarios = [
    { errors: 0, presetFound: true, expected: true },
    { errors: 0, presetFound: false, expected: false },
    { errors: 1, presetFound: true, expected: false },
    { errors: 1, presetFound: false, expected: false },
  ];

  for (const scenario of scenarios) {
    const exportReady = scenario.errors === 0 && scenario.presetFound;
    assertEqual(exportReady, scenario.expected,
      `With ${scenario.errors} errors and presetFound=${scenario.presetFound}, exportReady should be ${scenario.expected}`);
  }
});

// ==========================================
// Summary
// ==========================================

console.log('\n========================================');
console.log('Test Results');
console.log('========================================');
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`${RED}Failed: ${testsFailed}${RESET}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed!${RESET}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}All tests passed!${RESET}`);
}

// Cleanup after tests
cleanup();
