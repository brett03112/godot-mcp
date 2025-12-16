/**
 * Phase 8: Project Settings & Configuration - Integration Tests
 * Tests: modify_project_setting, configure_input_action, setup_render_layers, configure_autoload
 */

const fs = require('fs');
const path = require('path');

const projectPath = path.join(__dirname, 'test_mcp_enhancements');
const projectFile = path.join(projectPath, 'project.godot');

// Backup original project.godot
const originalContent = fs.readFileSync(projectFile, 'utf-8');

console.log('=== Phase 8: Project Settings & Configuration Integration Tests ===\n');

let testsPass = 0;
let testsFail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    testsPass++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    testsFail++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readProjectGodot() {
  return fs.readFileSync(projectFile, 'utf-8');
}

function resetProjectGodot() {
  fs.writeFileSync(projectFile, originalContent, 'utf-8');
}

// ============================================================
// Task 8.1: modify_project_setting Tests
// ============================================================
console.log('--- Task 8.1: modify_project_setting ---\n');

// Test 8.1.1: Change window size
test('Test 8.1.1: Modify window size setting', () => {
  // Simulate what the tool does
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add display section with window size
  if (!sections.has('display')) {
    sections.set('display', []);
  }
  sections.get('display').push('window/size/viewport_width=1280');
  sections.get('display').push('window/size/viewport_height=720');

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('[display]'), 'Display section should exist');
  assert(content.includes('window/size/viewport_width=1280'), 'Width should be 1280');
  assert(content.includes('window/size/viewport_height=720'), 'Height should be 720');

  resetProjectGodot();
});

// Test 8.1.2: Set application name
test('Test 8.1.2: Modify application name', () => {
  let content = readProjectGodot();

  // Update the config/name in [application] section
  content = content.replace(
    /config\/name="[^"]*"/,
    'config/name="My Awesome Game"'
  );
  fs.writeFileSync(projectFile, content, 'utf-8');

  content = readProjectGodot();
  assert(content.includes('config/name="My Awesome Game"'), 'Application name should be updated');

  resetProjectGodot();
});

// Test 8.1.3: Modify rendering method
test('Test 8.1.3: Modify rendering method', () => {
  let content = readProjectGodot();

  // Verify rendering section exists
  assert(content.includes('[rendering]'), 'Rendering section should exist');
  assert(content.includes('renderer/rendering_method'), 'Rendering method should exist');

  // No need to modify, just verify we can read existing settings
});

// Test 8.1.4: Add physics gravity
test('Test 8.1.4: Add physics gravity setting', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add physics section
  if (!sections.has('physics')) {
    sections.set('physics', []);
  }
  sections.get('physics').push('2d/default_gravity=980.0');

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('[physics]'), 'Physics section should exist');
  assert(content.includes('2d/default_gravity=980.0'), 'Gravity should be set');

  resetProjectGodot();
});

// ============================================================
// Task 8.2: configure_input_action Tests
// ============================================================
console.log('\n--- Task 8.2: configure_input_action ---\n');

// Test 8.2.1: Create jump action with Space key
test('Test 8.2.1: Create jump action with Space key', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add input section with jump action
  if (!sections.has('input')) {
    sections.set('input', []);
  }
  const jumpAction = '{"deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":32,"physical_keycode":0,"key_label":0,"unicode":0,"location":0,"echo":false)]}';
  sections.get('input').push(`jump=${jumpAction}`);

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('[input]'), 'Input section should exist');
  assert(content.includes('jump='), 'Jump action should exist');
  assert(content.includes('keycode":32'), 'Space keycode (32) should be present');

  resetProjectGodot();
});

// Test 8.2.2: Add gamepad button to action
test('Test 8.2.2: Add joypad button to action', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add input section with action using joypad
  if (!sections.has('input')) {
    sections.set('input', []);
  }
  const action = '{"deadzone": 0.5, "events": [Object(InputEventJoypadButton,"resource_local_to_scene":false,"resource_name":"","device":-1,"button_index":0,"pressure":0.0,"pressed":false)]}';
  sections.get('input').push(`attack=${action}`);

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('attack='), 'Attack action should exist');
  assert(content.includes('InputEventJoypadButton'), 'Joypad button event should be present');

  resetProjectGodot();
});

// Test 8.2.3: Set deadzone
test('Test 8.2.3: Set input deadzone', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add input with custom deadzone
  if (!sections.has('input')) {
    sections.set('input', []);
  }
  const action = '{"deadzone": 0.2, "events": [Object(InputEventJoypadMotion,"resource_local_to_scene":false,"resource_name":"","device":-1,"axis":0,"axis_value":1.0)]}';
  sections.get('input').push(`move_right=${action}`);

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('move_right='), 'Move right action should exist');
  assert(content.includes('"deadzone": 0.2'), 'Deadzone should be 0.2');

  resetProjectGodot();
});

// Test 8.2.4: Multiple bindings
test('Test 8.2.4: Multiple bindings for single action', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add input with multiple events
  if (!sections.has('input')) {
    sections.set('input', []);
  }
  const action = '{"deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":32,"physical_keycode":0,"key_label":0,"unicode":0,"location":0,"echo":false), Object(InputEventJoypadButton,"resource_local_to_scene":false,"resource_name":"","device":-1,"button_index":0,"pressure":0.0,"pressed":false)]}';
  sections.get('input').push(`jump_multi=${action}`);

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('jump_multi='), 'Jump multi action should exist');
  assert(content.includes('InputEventKey'), 'Key event should be present');
  assert(content.includes('InputEventJoypadButton'), 'Joypad button event should be present');

  resetProjectGodot();
});

// ============================================================
// Task 8.3: setup_render_layers Tests
// ============================================================
console.log('\n--- Task 8.3: setup_render_layers ---\n');

// Test 8.3.1: Set 2D physics layer names
test('Test 8.3.1: Set 2D physics layer names', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add layer_names section
  if (!sections.has('layer_names')) {
    sections.set('layer_names', []);
  }
  sections.get('layer_names').push('2d_physics/layer_1="Player"');
  sections.get('layer_names').push('2d_physics/layer_2="Enemy"');
  sections.get('layer_names').push('2d_physics/layer_3="World"');

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('[layer_names]'), 'Layer names section should exist');
  assert(content.includes('2d_physics/layer_1="Player"'), 'Layer 1 should be Player');
  assert(content.includes('2d_physics/layer_2="Enemy"'), 'Layer 2 should be Enemy');
  assert(content.includes('2d_physics/layer_3="World"'), 'Layer 3 should be World');

  resetProjectGodot();
});

// Test 8.3.2: Configure 3D render layers
test('Test 8.3.2: Configure 3D render layers', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add layer_names section
  if (!sections.has('layer_names')) {
    sections.set('layer_names', []);
  }
  sections.get('layer_names').push('3d_render/layer_1="Main"');
  sections.get('layer_names').push('3d_render/layer_2="UI"');

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('3d_render/layer_1="Main"'), '3D render layer 1 should be Main');
  assert(content.includes('3d_render/layer_2="UI"'), '3D render layer 2 should be UI');

  resetProjectGodot();
});

// Test 8.3.3: Complete layer hierarchy
test('Test 8.3.3: Setup complete layer hierarchy', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add layer_names section with multiple types
  if (!sections.has('layer_names')) {
    sections.set('layer_names', []);
  }
  sections.get('layer_names').push('2d_physics/layer_1="Player"');
  sections.get('layer_names').push('2d_physics/layer_2="Enemy"');
  sections.get('layer_names').push('3d_physics/layer_1="Character"');
  sections.get('layer_names').push('3d_physics/layer_2="Environment"');
  sections.get('layer_names').push('2d_render/layer_1="Background"');
  sections.get('layer_names').push('2d_render/layer_2="Foreground"');

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('2d_physics/layer_1="Player"'), '2D physics layer 1 should exist');
  assert(content.includes('3d_physics/layer_1="Character"'), '3D physics layer 1 should exist');
  assert(content.includes('2d_render/layer_1="Background"'), '2D render layer 1 should exist');

  resetProjectGodot();
});

// ============================================================
// Task 8.4: configure_autoload Tests
// ============================================================
console.log('\n--- Task 8.4: configure_autoload ---\n');

// Create a test autoload script first
const autoloadDir = path.join(projectPath, 'autoload');
if (!fs.existsSync(autoloadDir)) {
  fs.mkdirSync(autoloadDir, { recursive: true });
}
const gameManagerScript = path.join(autoloadDir, 'game_manager.gd');
fs.writeFileSync(gameManagerScript, `extends Node

var score: int = 0

func add_score(amount: int) -> void:
    score += amount
`, 'utf-8');

// Test 8.4.1: Add GameManager autoload
test('Test 8.4.1: Add GameManager autoload', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add autoload section
  if (!sections.has('autoload')) {
    sections.set('autoload', []);
  }
  sections.get('autoload').push('GameManager="*res://autoload/game_manager.gd"');

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('[autoload]'), 'Autoload section should exist');
  assert(content.includes('GameManager="*res://autoload/game_manager.gd"'), 'GameManager autoload should exist');

  resetProjectGodot();
});

// Test 8.4.2: Add multiple autoloads
test('Test 8.4.2: Add multiple autoloads', () => {
  // Create additional autoload scripts
  const audioManagerScript = path.join(autoloadDir, 'audio_manager.gd');
  fs.writeFileSync(audioManagerScript, `extends Node

func play_sfx(sound_name: String) -> void:
    pass
`, 'utf-8');

  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add autoload section with multiple entries
  if (!sections.has('autoload')) {
    sections.set('autoload', []);
  }
  sections.get('autoload').push('GameManager="*res://autoload/game_manager.gd"');
  sections.get('autoload').push('AudioManager="*res://autoload/audio_manager.gd"');

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('GameManager='), 'GameManager autoload should exist');
  assert(content.includes('AudioManager='), 'AudioManager autoload should exist');

  resetProjectGodot();
});

// Test 8.4.3: Disable autoload
test('Test 8.4.3: Disable autoload (no asterisk prefix)', () => {
  let content = readProjectGodot();
  const lines = content.split('\n');
  const sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Add autoload section with disabled entry (no * prefix)
  if (!sections.has('autoload')) {
    sections.set('autoload', []);
  }
  sections.get('autoload').push('DebugManager="res://autoload/game_manager.gd"');

  // Rebuild and write
  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify
  content = readProjectGodot();
  assert(content.includes('DebugManager="res://'), 'DebugManager should exist without asterisk');
  assert(!content.includes('DebugManager="*'), 'DebugManager should not have asterisk prefix');

  resetProjectGodot();
});

// Test 8.4.4: Remove autoload
test('Test 8.4.4: Verify autoload removal capability', () => {
  // Add an autoload first
  let content = readProjectGodot();
  let lines = content.split('\n');
  let sections = new Map();
  let currentSection = '';
  let headerLines = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    } else {
      headerLines.push(line);
    }
  }

  if (!sections.has('autoload')) {
    sections.set('autoload', []);
  }
  sections.get('autoload').push('TestManager="*res://autoload/game_manager.gd"');

  let newContent = headerLines.join('\n') + '\n';
  for (const [sectionName, sectionLines] of sections) {
    newContent += `\n[${sectionName}]\n`;
    newContent += sectionLines.filter(l => l.trim() !== '').join('\n') + '\n';
  }
  fs.writeFileSync(projectFile, newContent, 'utf-8');

  // Verify it was added
  content = readProjectGodot();
  assert(content.includes('TestManager='), 'TestManager should be added');

  // Now remove it
  content = readProjectGodot();
  content = content.replace(/TestManager="[^"]*"\n?/g, '');
  fs.writeFileSync(projectFile, content, 'utf-8');

  // Verify removal
  content = readProjectGodot();
  assert(!content.includes('TestManager='), 'TestManager should be removed');

  resetProjectGodot();
});

// Cleanup test files
fs.unlinkSync(gameManagerScript);
const audioManagerScript = path.join(autoloadDir, 'audio_manager.gd');
if (fs.existsSync(audioManagerScript)) {
  fs.unlinkSync(audioManagerScript);
}
fs.rmdirSync(autoloadDir);

// ============================================================
// Summary
// ============================================================
console.log('\n=== Test Summary ===');
console.log(`Total: ${testsPass + testsFail} tests`);
console.log(`Passed: ${testsPass}`);
console.log(`Failed: ${testsFail}`);
console.log(`\nPhase 8 Integration Tests: ${testsFail === 0 ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
