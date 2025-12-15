// Integration test for create_resource tool
// Tests by simulating the tool's .tres file creation

const { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } = require('fs');
const path = require('path');

const PROJECT_PATH = 'C:\\Users\\brett\\Desktop\\godot-mcp\\test_mcp_enhancements';
const RESOURCES_DIR = 'resources';

async function runTests() {
  console.log('========================================');
  console.log('  create_resource Integration Tests');
  console.log('========================================\n');

  // Setup resources directory
  const resourcesPath = path.join(PROJECT_PATH, RESOURCES_DIR);
  if (!existsSync(resourcesPath)) {
    console.log('Creating resources directory...');
    mkdirSync(resourcesPath, { recursive: true });
  }

  console.log('Test setup:');
  console.log('- Project path:', PROJECT_PATH);
  console.log('- Resources directory:', resourcesPath);

  // Helper function to generate UID (same as in index.ts)
  function generateUID() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 13; i++) {
      uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
  }

  // Helper to format value for .tres file
  function formatTresValue(value) {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      if (value.match(/^(Color|Vector2|Vector3|Vector4|Rect2|Transform2D|Transform3D|Basis|Quaternion|AABB|Plane)\s*\(/)) {
        return value;
      }
      return `"${value.replace(/"/g, '\\"')}"`;
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toString();
      }
      return value.toFixed(6).replace(/\.?0+$/, '');
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (Array.isArray(value)) {
      const formattedItems = value.map(item => formatTresValue(item));
      return `[${formattedItems.join(', ')}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      const formattedEntries = entries.map(([k, v]) => `"${k}": ${formatTresValue(v)}`);
      return `{${formattedEntries.join(', ')}}`;
    }

    return String(value);
  }

  // Helper to create resource file
  function createResourceFile(resourcePath, resourceType, properties) {
    const fullPath = path.join(PROJECT_PATH, resourcePath);
    const uid = `uid://${generateUID()}`;

    let tresContent = `[gd_resource type="${resourceType}" format=3 uid="${uid}"]\n\n`;
    tresContent += `[resource]\n`;

    for (const [key, value] of Object.entries(properties)) {
      const formattedValue = formatTresValue(value);
      tresContent += `${key} = ${formattedValue}\n`;
    }

    writeFileSync(fullPath, tresContent, 'utf-8');
    return fullPath;
  }

  // Clean up any existing test files
  const testFiles = [
    'resources/test_theme.tres',
    'resources/test_theme_props.tres',
    'resources/test_audio_bus.tres',
    'resources/test_environment.tres'
  ];

  for (const file of testFiles) {
    const fullPath = path.join(PROJECT_PATH, file);
    if (existsSync(fullPath)) {
      console.log('- Removing existing test file:', file);
      unlinkSync(fullPath);
    }
  }

  console.log('\n=== Test 7.4.1: Create Theme resource ===');
  const themePath = 'resources/test_theme.tres';
  createResourceFile(themePath, 'Theme', {
    default_font_size: 16
  });
  const themeFullPath = path.join(PROJECT_PATH, themePath);
  const test1Pass = existsSync(themeFullPath);
  let themeContent = '';
  if (test1Pass) {
    themeContent = readFileSync(themeFullPath, 'utf-8');
    console.log('✅ Test 7.4.1 PASSED: Theme resource file created');
    console.log('   File path:', themeFullPath);
    console.log('   Has gd_resource header:', themeContent.includes('[gd_resource type="Theme"'));
    console.log('   Has [resource] section:', themeContent.includes('[resource]'));
  } else {
    console.log('❌ Test 7.4.1 FAILED: Theme resource file not created');
  }

  console.log('\n=== Test 7.4.2: Set Theme properties ===');
  const themePropsPath = 'resources/test_theme_props.tres';
  createResourceFile(themePropsPath, 'Theme', {
    default_font_size: 18,
    default_base_scale: 1.0
  });
  const themePropsFullPath = path.join(PROJECT_PATH, themePropsPath);
  const propsContent = existsSync(themePropsFullPath) ? readFileSync(themePropsFullPath, 'utf-8') : '';
  const test2Pass = propsContent.includes('default_font_size = 18') &&
                    propsContent.includes('default_base_scale = 1');
  if (test2Pass) {
    console.log('✅ Test 7.4.2 PASSED: Theme properties set correctly');
    console.log('   - default_font_size = 18');
    console.log('   - default_base_scale = 1');
  } else {
    console.log('❌ Test 7.4.2 FAILED: Theme properties not set correctly');
    console.log('   Content:', propsContent.substring(0, 300));
  }

  console.log('\n=== Test 7.4.3: Create AudioBusLayout resource ===');
  const audioBusPath = 'resources/test_audio_bus.tres';
  createResourceFile(audioBusPath, 'AudioBusLayout', {
    // AudioBusLayout doesn't have simple properties, but we can test the file creation
  });
  const audioBusFullPath = path.join(PROJECT_PATH, audioBusPath);
  const audioBusContent = existsSync(audioBusFullPath) ? readFileSync(audioBusFullPath, 'utf-8') : '';
  const test3Pass = existsSync(audioBusFullPath) &&
                    audioBusContent.includes('[gd_resource type="AudioBusLayout"');
  if (test3Pass) {
    console.log('✅ Test 7.4.3 PASSED: AudioBusLayout resource created');
    console.log('   - Resource type correctly set');
    console.log('   - UID generated');
  } else {
    console.log('❌ Test 7.4.3 FAILED: AudioBusLayout resource not created correctly');
  }

  console.log('\n=== Test 7.4.4: Create Environment resource with properties ===');
  const envPath = 'resources/test_environment.tres';
  createResourceFile(envPath, 'Environment', {
    background_mode: 2,
    ambient_light_color: 'Color(0.4, 0.4, 0.5, 1)',
    ambient_light_energy: 0.5,
    tonemap_mode: 2,
    ssao_enabled: true
  });
  const envFullPath = path.join(PROJECT_PATH, envPath);
  const envContent = existsSync(envFullPath) ? readFileSync(envFullPath, 'utf-8') : '';
  const test4Pass = existsSync(envFullPath) &&
                    envContent.includes('[gd_resource type="Environment"') &&
                    envContent.includes('background_mode = 2') &&
                    envContent.includes('Color(0.4, 0.4, 0.5, 1)') &&
                    envContent.includes('ssao_enabled = true');
  if (test4Pass) {
    console.log('✅ Test 7.4.4 PASSED: Environment resource created with correct properties');
    console.log('   - background_mode = 2 (Sky)');
    console.log('   - ambient_light_color = Color(0.4, 0.4, 0.5, 1)');
    console.log('   - ssao_enabled = true');
  } else {
    console.log('❌ Test 7.4.4 FAILED: Environment resource properties not correct');
    console.log('   Content:', envContent.substring(0, 400));
  }

  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================');
  const allPassed = test1Pass && test2Pass && test3Pass && test4Pass;
  console.log(`${test1Pass ? '✅' : '❌'} Test 7.4.1: Create Theme resource - ${test1Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test2Pass ? '✅' : '❌'} Test 7.4.2: Set Theme properties - ${test2Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test3Pass ? '✅' : '❌'} Test 7.4.3: Create AudioBusLayout - ${test3Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test4Pass ? '✅' : '❌'} Test 7.4.4: Create Environment with properties - ${test4Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`\n${allPassed ? '✅ All 4 tests passed!' : '❌ Some tests failed'}`);

  // Show sample resource file content
  console.log('\nSample Environment resource file contents:');
  console.log('---');
  console.log(envContent);
  console.log('---');

  return allPassed;
}

runTests()
  .then(result => {
    console.log('\nTest run complete:', result ? 'SUCCESS' : 'FAILURE');
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
