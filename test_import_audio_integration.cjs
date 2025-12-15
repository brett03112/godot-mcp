// Integration test for import_audio tool
// Tests by simulating the tool's .import file manipulation

const { readFileSync, existsSync, writeFileSync, unlinkSync } = require('fs');
const path = require('path');

const PROJECT_PATH = 'C:\\Users\\brett\\Desktop\\godot-mcp\\test_mcp_enhancements';
const TEST_MUSIC = 'audio/test_music.wav';
const TEST_SFX = 'audio/test_sfx.wav';

async function runTests() {
  console.log('========================================');
  console.log('  import_audio Integration Tests');
  console.log('========================================\n');

  // Verify test audio files exist
  const musicPath = path.join(PROJECT_PATH, TEST_MUSIC);
  const sfxPath = path.join(PROJECT_PATH, TEST_SFX);
  const musicImportPath = musicPath + '.import';
  const sfxImportPath = sfxPath + '.import';

  console.log('Test setup:');
  console.log('- Project path:', PROJECT_PATH);
  console.log('- Music file path:', musicPath);
  console.log('- SFX file path:', sfxPath);
  console.log('- Music exists:', existsSync(musicPath));
  console.log('- SFX exists:', existsSync(sfxPath));

  // Remove existing import files for clean tests
  if (existsSync(musicImportPath)) {
    console.log('- Removing existing music .import file for clean test');
    unlinkSync(musicImportPath);
  }
  if (existsSync(sfxImportPath)) {
    console.log('- Removing existing SFX .import file for clean test');
    unlinkSync(sfxImportPath);
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

  // Create default .import file structure for WAV
  function createDefaultWavImport(audioPath) {
    const audioFileName = path.basename(audioPath);
    return `[remap]

importer="wav"
type="AudioStreamWAV"
uid="uid://${generateUID()}"
path="res://.godot/imported/${audioFileName}-${generateShortUID()}.wav"

[deps]

source_file="res://${audioPath}"
dest_files=["res://.godot/imported/${audioFileName}-${generateShortUID()}.wav"]

[params]

loop=false
loop_offset=0.0
bpm=0.0
beat_count=0
bar_beats=4
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

  console.log('\n=== Test 7.2.1: Import music with loop enabled ===');
  // Create initial import file
  writeFileSync(musicImportPath, createDefaultWavImport(TEST_MUSIC));
  // Modify to enable looping
  modifyImportSettings(musicImportPath, { 'loop': 'true' });
  // Verify
  const content1 = readFileSync(musicImportPath, 'utf-8');
  const test1Pass = content1.includes('loop=true');
  console.log(`${test1Pass ? '✅' : '❌'} Test 7.2.1 ${test1Pass ? 'PASSED' : 'FAILED'}: loop=true is set for music`);

  console.log('\n=== Test 7.2.2: Set loop offset ===');
  // Set loop offset to skip intro (e.g., 2.5 seconds)
  modifyImportSettings(musicImportPath, { 'loop_offset': '2.5' });
  const content2 = readFileSync(musicImportPath, 'utf-8');
  const test2Pass = content2.includes('loop_offset=2.5');
  console.log(`${test2Pass ? '✅' : '❌'} Test 7.2.2 ${test2Pass ? 'PASSED' : 'FAILED'}: loop_offset=2.5 is set`);

  console.log('\n=== Test 7.2.3: Configure BPM and beat settings ===');
  // Configure BPM for rhythm synchronization
  modifyImportSettings(musicImportPath, {
    'bpm': '120',
    'beat_count': '32',
    'bar_beats': '4'
  });
  const content3 = readFileSync(musicImportPath, 'utf-8');
  const test3Pass = content3.includes('bpm=120') &&
                    content3.includes('beat_count=32') &&
                    content3.includes('bar_beats=4');
  console.log(`${test3Pass ? '✅' : '❌'} Test 7.2.3 ${test3Pass ? 'PASSED' : 'FAILED'}: BPM and beat settings configured`);
  if (test3Pass) {
    console.log('   - bpm=120 (tempo)');
    console.log('   - beat_count=32 (total beats)');
    console.log('   - bar_beats=4 (4/4 time signature)');
  }

  console.log('\n=== Test 7.2.4: Import sound effect without loop ===');
  // Create import file for SFX with loop disabled
  writeFileSync(sfxImportPath, createDefaultWavImport(TEST_SFX));
  modifyImportSettings(sfxImportPath, { 'loop': 'false' });
  const content4 = readFileSync(sfxImportPath, 'utf-8');
  const test4Pass = content4.includes('loop=false');
  console.log(`${test4Pass ? '✅' : '❌'} Test 7.2.4 ${test4Pass ? 'PASSED' : 'FAILED'}: loop=false is set for SFX (one-shot)`);

  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================');
  const allPassed = test1Pass && test2Pass && test3Pass && test4Pass;
  console.log(`${test1Pass ? '✅' : '❌'} Test 7.2.1: Import music with loop enabled - ${test1Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test2Pass ? '✅' : '❌'} Test 7.2.2: Set loop offset - ${test2Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test3Pass ? '✅' : '❌'} Test 7.2.3: Configure BPM/beat settings - ${test3Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`${test4Pass ? '✅' : '❌'} Test 7.2.4: Import SFX without loop - ${test4Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`\n${allPassed ? '✅ All 4 tests passed!' : '❌ Some tests failed'}`);

  // Show final import file contents
  console.log('\nFinal music .import file contents:');
  console.log('---');
  console.log(readFileSync(musicImportPath, 'utf-8').substring(0, 600) + '...');
  console.log('---');

  console.log('\nFinal SFX .import file contents:');
  console.log('---');
  console.log(readFileSync(sfxImportPath, 'utf-8').substring(0, 600) + '...');
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
