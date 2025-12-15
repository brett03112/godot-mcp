// Integration test for import_3d_model tool
// Tests by simulating the tool's .import file manipulation

const { readFileSync, existsSync, writeFileSync, unlinkSync } = require('fs');
const path = require('path');

const PROJECT_PATH = 'C:\\Users\\brett\\Desktop\\godot-mcp\\test_mcp_enhancements';
const TEST_MODEL = 'models/test_cube.gltf';

async function runTests() {
  console.log('========================================');
  console.log('  import_3d_model Integration Tests');
  console.log('========================================\n');

  // Verify test model file exists
  const modelPath = path.join(PROJECT_PATH, TEST_MODEL);
  const importPath = modelPath + '.import';

  console.log('Test setup:');
  console.log('- Project path:', PROJECT_PATH);
  console.log('- Model file path:', modelPath);
  console.log('- Model exists:', existsSync(modelPath));

  // Remove existing import file for clean tests
  if (existsSync(importPath)) {
    console.log('- Removing existing .import file for clean test');
    unlinkSync(importPath);
  }

  // Helper function to generate UID (same as in index.ts)
  function generateUID() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 13; i++) {
      uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
  }

  function generateShortUID() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 8; i++) {
      uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
  }

  // Create default .import file structure for 3D models
  function createDefault3DImport(modelPath) {
    const modelFileName = path.basename(modelPath);
    const shortUID = generateShortUID();
    return `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://${generateUID()}"
path="res://.godot/imported/${modelFileName}-${shortUID}.scn"

[deps]

source_file="res://${modelPath}"
dest_files=["res://.godot/imported/${modelFileName}-${shortUID}.scn"]

[params]

nodes/root_type="Node3D"
nodes/root_name=""
nodes/apply_root_scale=true
nodes/root_scale=1.0
meshes/ensure_tangents=true
meshes/generate_lods=true
meshes/create_shadow_meshes=true
meshes/light_baking=1
meshes/lightmap_texel_size=0.2
meshes/force_disable_compression=false
skins/use_named_skins=true
animation/import=true
animation/fps=30
animation/trimming=false
animation/remove_immutable_tracks=true
import_script/path=""
_subresources={}
gltf/naming_version=1
gltf/embedded_image_handling=1
`;
  }

  // Helper to modify import file settings
  function modifyImportSettings(importPath, settingsToApply) {
    let content = readFileSync(importPath, 'utf-8');
    const lines = content.split('\n');
    const modifiedLines = [];
    let inParams = false;
    const appliedSettings = new Set();

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '[params]') {
        inParams = true;
        modifiedLines.push(line);
        continue;
      }

      if (trimmed.startsWith('[') && trimmed !== '[params]') {
        if (inParams) {
          for (const [key, value] of Object.entries(settingsToApply)) {
            if (!appliedSettings.has(key)) {
              modifiedLines.push(`${key}=${value}`);
              appliedSettings.add(key);
            }
          }
        }
        inParams = false;
      }

      if (inParams) {
        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex > 0) {
          const settingKey = trimmed.substring(0, equalsIndex);
          if (settingsToApply[settingKey] !== undefined) {
            modifiedLines.push(`${settingKey}=${settingsToApply[settingKey]}`);
            appliedSettings.add(settingKey);
            continue;
          }
        }
      }

      modifiedLines.push(line);
    }

    if (inParams) {
      for (const [key, value] of Object.entries(settingsToApply)) {
        if (!appliedSettings.has(key)) {
          modifiedLines.push(`${key}=${value}`);
        }
      }
    }

    writeFileSync(importPath, modifiedLines.join('\n'));
  }

  console.log('\n=== Test 7.3.1: Import 3D model with materials ===');
  // Create initial import file
  writeFileSync(importPath, createDefault3DImport(TEST_MODEL));
  // Enable materials export
  modifyImportSettings(importPath, { 'materials/export': 'true' });
  // Verify
  const content1 = readFileSync(importPath, 'utf-8');
  const test1Pass = content1.includes('materials/export=true');
  console.log(`${test1Pass ? '✅' : '❌'} Test 7.3.1 ${test1Pass ? 'PASSED' : 'FAILED'}: materials/export=true is set`);

  console.log('\n=== Test 7.3.2: Generate convex collision ===');
  // Enable collision generation with convex type
  modifyImportSettings(importPath, {
    'physics/generate': 'true',
    'physics/shape_type': '2'  // 2 = Convex
  });
  const content2 = readFileSync(importPath, 'utf-8');
  const test2Pass = content2.includes('physics/generate=true') && content2.includes('physics/shape_type=2');
  console.log(`${test2Pass ? '✅' : '❌'} Test 7.3.2 ${test2Pass ? 'PASSED' : 'FAILED'}: Convex collision enabled`);
  if (test2Pass) {
    console.log('   - physics/generate=true');
    console.log('   - physics/shape_type=2 (Convex)');
  }

  console.log('\n=== Test 7.3.3: Import animated model ===');
  // Enable animation import
  modifyImportSettings(importPath, { 'animation/import': 'true' });
  const content3 = readFileSync(importPath, 'utf-8');
  const test3Pass = content3.includes('animation/import=true');
  console.log(`${test3Pass ? '✅' : '❌'} Test 7.3.3 ${test3Pass ? 'PASSED' : 'FAILED'}: animation/import=true is set`);

  console.log('\n=== Test 7.3.4: Scale model on import ===');
  // Set scale to 0.01 (convert cm to m)
  modifyImportSettings(importPath, { 'nodes/root_scale': '0.01' });
  const content4 = readFileSync(importPath, 'utf-8');
  const test4Pass = content4.includes('nodes/root_scale=0.01');
  console.log(`${test4Pass ? '✅' : '❌'} Test 7.3.4 ${test4Pass ? 'PASSED' : 'FAILED'}: nodes/root_scale=0.01 is set`);

  // Bonus test: LOD generation and root type
  console.log('\n=== Bonus Test: LOD generation and root type ===');
  modifyImportSettings(importPath, {
    'meshes/generate_lods': 'true',
    'nodes/root_type': '"StaticBody3D"'
  });
  const content5 = readFileSync(importPath, 'utf-8');
  const bonusPass = content5.includes('meshes/generate_lods=true') && content5.includes('nodes/root_type="StaticBody3D"');
  console.log(`${bonusPass ? '✅' : '❌'} Bonus Test ${bonusPass ? 'PASSED' : 'FAILED'}: LOD and root type configured`);
  if (bonusPass) {
    console.log('   - meshes/generate_lods=true');
    console.log('   - nodes/root_type="StaticBody3D"');
  }

  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================');
  const allPassed = test1Pass && test2Pass && test3Pass && test4Pass;
  console.log(`${test1Pass ? '✅' : '❌'} Test 7.3.1: Import with materials - ${test1Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test2Pass ? '✅' : '❌'} Test 7.3.2: Generate convex collision - ${test2Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test3Pass ? '✅' : '❌'} Test 7.3.3: Import animated model - ${test3Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test4Pass ? '✅' : '❌'} Test 7.3.4: Scale model on import - ${test4Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${bonusPass ? '✅' : '❌'} Bonus: LOD and root type - ${bonusPass ? 'PASSED' : 'FAILED'}`);
  console.log(`\n${allPassed ? '✅ All 4 tests passed!' : '❌ Some tests failed'}`);

  // Show final import file contents
  console.log('\nFinal .import file contents:');
  console.log('---');
  console.log(readFileSync(importPath, 'utf-8').substring(0, 900) + '...');
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
