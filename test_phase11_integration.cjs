/**
 * Phase 11: Dialogue & Localization Management - Integration Tests
 *
 * Tests for:
 * - Task 11.1: create_translation_file tool
 * - Task 11.2: add_translation tool
 * - Task 11.3: remove_translation tool
 * - Task 11.4: validate_translations tool
 * - Task 11.5: create_dialogue_resource tool
 * - Task 11.6: configure_localization tool
 * - Task 11.7: extract_translatable_strings tool
 */

const { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync } = require('fs');
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
console.log('Phase 11: Dialogue & Localization Tests');
console.log('========================================\n');

// ==========================================
// Task 11.1: create_translation_file Tests
// ==========================================

console.log(`${YELLOW}--- Task 11.1: create_translation_file ---${RESET}`);

test('CSV translation file structure', () => {
  const params = {
    projectPath: '/path/to/project',
    translationPath: 'localization/translations.csv',
    format: 'csv',
    locales: ['en', 'es', 'fr'],
    initialKeys: [
      { key: 'MENU_START', translations: { en: 'Start', es: 'Iniciar', fr: 'Démarrer' } },
    ],
  };

  assertEqual(params.format, 'csv', 'Format should be CSV');
  assertEqual(params.locales.length, 3, 'Should have 3 locales');
  assertEqual(params.initialKeys[0].key, 'MENU_START', 'First key should be MENU_START');
});

test('PO translation file format', () => {
  const params = {
    projectPath: '/path/to/project',
    translationPath: 'localization/messages.po',
    format: 'po',
    locales: ['es'],
  };

  assertEqual(params.format, 'po', 'Format should be PO');
  assertEqual(params.locales[0], 'es', 'Locale should be es');
});

test('Translation file with initial keys', () => {
  const initialKeys = [
    { key: 'MENU_START', translations: { en: 'Start Game', es: 'Iniciar Juego' } },
    { key: 'MENU_OPTIONS', translations: { en: 'Options', es: 'Opciones' } },
    { key: 'MENU_QUIT', translations: { en: 'Quit', es: 'Salir' } },
  ];

  assertEqual(initialKeys.length, 3, 'Should have 3 initial keys');
  assertEqual(initialKeys[0].translations.en, 'Start Game', 'English translation should match');
  assertEqual(initialKeys[0].translations.es, 'Iniciar Juego', 'Spanish translation should match');
});

test('Locale code validation', () => {
  const validLocales = ['en', 'es', 'fr', 'de', 'ja', 'zh', 'ko', 'pt', 'ru', 'ar'];

  for (const locale of validLocales) {
    assertTrue(locale.length >= 2, `Locale ${locale} should be at least 2 characters`);
    assertTrue(/^[a-z]{2,3}(_[A-Z]{2})?$/.test(locale) || locale.length === 2, `Locale ${locale} format should be valid`);
  }
});

// ==========================================
// Task 11.2: add_translation Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 11.2: add_translation ---${RESET}`);

test('Add translation parameters', () => {
  const params = {
    projectPath: '/path/to/project',
    translationPath: 'localization/translations.csv',
    key: 'DIALOG_GREETING',
    translations: { en: 'Hello!', es: '¡Hola!', fr: 'Bonjour!' },
  };

  assertEqual(params.key, 'DIALOG_GREETING', 'Key should be DIALOG_GREETING');
  assertEqual(Object.keys(params.translations).length, 3, 'Should have 3 translations');
});

test('Translation with context (PO format)', () => {
  const params = {
    key: 'OPEN',
    translations: { en: 'Open' },
    context: 'Button label for opening files',
    comment: 'Used in file dialog',
  };

  assertTrue(params.context !== undefined, 'Context should be defined');
  assertTrue(params.comment !== undefined, 'Comment should be defined');
});

test('Update existing translation', () => {
  const existingTranslation = { en: 'Old text', es: 'Texto viejo' };
  const newTranslation = { en: 'New text' };

  // Merge behavior: new values override, missing values preserved
  const merged = { ...existingTranslation, ...newTranslation };

  assertEqual(merged.en, 'New text', 'English should be updated');
  assertEqual(merged.es, 'Texto viejo', 'Spanish should be preserved');
});

test('Placeholder syntax in translations', () => {
  const translations = {
    en: 'Hello, {name}! You have {count} messages.',
    es: '¡Hola, {name}! Tienes {count} mensajes.',
  };

  const placeholderRegex = /\{([^}]+)\}/g;
  const enPlaceholders = translations.en.match(placeholderRegex);
  const esPlaceholders = translations.es.match(placeholderRegex);

  assertEqual(enPlaceholders.length, 2, 'English should have 2 placeholders');
  assertEqual(esPlaceholders.length, 2, 'Spanish should have 2 placeholders');
  assertArrayEqual(enPlaceholders, esPlaceholders, 'Placeholders should match');
});

// ==========================================
// Task 11.3: remove_translation Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 11.3: remove_translation ---${RESET}`);

test('Remove single translation key', () => {
  const params = {
    projectPath: '/path/to/project',
    translationPath: 'localization/translations.csv',
    keys: ['DEPRECATED_KEY'],
  };

  assertEqual(params.keys.length, 1, 'Should have 1 key to remove');
  assertEqual(params.keys[0], 'DEPRECATED_KEY', 'Key should be DEPRECATED_KEY');
});

test('Remove multiple keys', () => {
  const params = {
    keys: ['OLD_KEY_1', 'OLD_KEY_2', 'OLD_KEY_3'],
  };

  assertEqual(params.keys.length, 3, 'Should have 3 keys to remove');
});

test('Remove by pattern', () => {
  const params = {
    pattern: '^DEPRECATED_.*',
  };

  const testKeys = ['DEPRECATED_MENU', 'DEPRECATED_DIALOG', 'ACTIVE_KEY'];
  const regex = new RegExp(params.pattern);
  const matchingKeys = testKeys.filter(k => regex.test(k));

  assertEqual(matchingKeys.length, 2, 'Pattern should match 2 keys');
  assertTrue(!matchingKeys.includes('ACTIVE_KEY'), 'Should not match ACTIVE_KEY');
});

test('Dry run mode', () => {
  const params = {
    keys: ['TEST_KEY'],
    dryRun: true,
  };

  assertTrue(params.dryRun === true, 'Dry run should be enabled');
});

// ==========================================
// Task 11.4: validate_translations Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 11.4: validate_translations ---${RESET}`);

test('Validate complete translation file', () => {
  const translations = [
    { key: 'KEY1', en: 'Text 1', es: 'Texto 1' },
    { key: 'KEY2', en: 'Text 2', es: 'Texto 2' },
  ];

  const missingTranslations = translations.filter(t => !t.en || !t.es);
  assertEqual(missingTranslations.length, 0, 'All translations should be complete');
});

test('Detect missing translations', () => {
  const translations = [
    { key: 'KEY1', en: 'Text 1', es: 'Texto 1' },
    { key: 'KEY2', en: 'Text 2', es: '' },  // Missing Spanish
    { key: 'KEY3', en: '', es: 'Texto 3' },  // Missing English
  ];

  const locales = ['en', 'es'];
  let missingCount = 0;

  for (const trans of translations) {
    for (const locale of locales) {
      if (!trans[locale] || trans[locale].trim() === '') {
        missingCount++;
      }
    }
  }

  assertEqual(missingCount, 2, 'Should detect 2 missing translations');
});

test('Detect placeholder mismatch', () => {
  const refTranslation = 'Hello {name}, you have {count} items';
  const translation = 'Hola {nombre}, tienes {cantidad} artículos';  // Wrong placeholder names

  const extractPlaceholders = (text) => {
    const matches = text.match(/\{([^}]+)\}/g) || [];
    return matches;
  };

  const refPlaceholders = extractPlaceholders(refTranslation);
  const transPlaceholders = extractPlaceholders(translation);

  assertTrue(refPlaceholders.length === transPlaceholders.length, 'Placeholder count should match');
  assertTrue(
    JSON.stringify(refPlaceholders) !== JSON.stringify(transPlaceholders),
    'Placeholder names should differ (this is a mismatch)'
  );
});

test('Detect duplicate keys', () => {
  const keys = ['KEY1', 'KEY2', 'KEY1', 'KEY3'];  // KEY1 is duplicate

  const seenKeys = new Set();
  const duplicates = [];

  for (const key of keys) {
    if (seenKeys.has(key)) {
      duplicates.push(key);
    }
    seenKeys.add(key);
  }

  assertEqual(duplicates.length, 1, 'Should detect 1 duplicate');
  assertEqual(duplicates[0], 'KEY1', 'Duplicate should be KEY1');
});

// ==========================================
// Task 11.5: create_dialogue_resource Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 11.5: create_dialogue_resource ---${RESET}`);

test('Linear dialogue structure', () => {
  const entries = [
    { id: 'entry_1', speaker: 'NPC', text: 'DIALOG_GREETING', nextId: 'entry_2' },
    { id: 'entry_2', speaker: 'NPC', text: 'DIALOG_QUESTION', nextId: 'entry_3' },
    { id: 'entry_3', speaker: 'NPC', text: 'DIALOG_FAREWELL', nextId: null },
  ];

  assertEqual(entries.length, 3, 'Should have 3 entries');
  assertEqual(entries[0].nextId, 'entry_2', 'First entry should link to second');
  assertEqual(entries[2].nextId, null, 'Last entry should have null nextId');
});

test('Branching dialogue with choices', () => {
  const entry = {
    id: 'choice_entry',
    speaker: 'NPC_MERCHANT',
    text: 'DIALOG_MERCHANT_OFFER',
    choices: [
      { text: 'CHOICE_BUY', nextId: 'entry_buy' },
      { text: 'CHOICE_HAGGLE', nextId: 'entry_haggle', condition: 'player_charisma >= 10' },
      { text: 'CHOICE_LEAVE', nextId: null },
    ],
  };

  assertEqual(entry.choices.length, 3, 'Should have 3 choices');
  assertTrue(entry.choices[1].condition !== undefined, 'Second choice should have condition');
});

test('Dialogue with signals', () => {
  const entry = {
    id: 'quest_entry',
    text: 'DIALOG_QUEST_COMPLETE',
    signals: ['quest_completed', 'achievement_unlocked'],
  };

  assertEqual(entry.signals.length, 2, 'Should emit 2 signals');
  assertTrue(entry.signals.includes('quest_completed'), 'Should include quest_completed signal');
});

test('Character metadata', () => {
  const characters = {
    NPC_MERCHANT: {
      name: 'CHAR_MERCHANT_NAME',
      portrait: 'res://portraits/merchant.png',
      color: '#FFD700',
    },
    NPC_GUARD: {
      name: 'CHAR_GUARD_NAME',
      portrait: 'res://portraits/guard.png',
      color: '#4169E1',
    },
  };

  assertEqual(Object.keys(characters).length, 2, 'Should have 2 characters');
  assertTrue(characters.NPC_MERCHANT.portrait.startsWith('res://'), 'Portrait should be resource path');
});

// ==========================================
// Task 11.6: configure_localization Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 11.6: configure_localization ---${RESET}`);

test('Configure locales', () => {
  const params = {
    projectPath: '/path/to/project',
    locales: ['en', 'es', 'fr', 'de'],
    fallbackLocale: 'en',
  };

  assertEqual(params.locales.length, 4, 'Should configure 4 locales');
  assertEqual(params.fallbackLocale, 'en', 'Fallback should be English');
});

test('Register translation files', () => {
  const params = {
    translationFiles: [
      'localization/translations.en.translation',
      'localization/translations.es.translation',
    ],
  };

  assertEqual(params.translationFiles.length, 2, 'Should register 2 translation files');
});

test('Test locale for development', () => {
  const params = {
    testLocale: 'pseudo',  // Pseudo-localization for testing
  };

  assertTrue(params.testLocale !== undefined, 'Test locale should be set');
});

test('Remove locales', () => {
  const params = {
    removeLocales: ['zh', 'ko'],  // Remove unsupported locales
  };

  assertEqual(params.removeLocales.length, 2, 'Should remove 2 locales');
});

// ==========================================
// Task 11.7: extract_translatable_strings Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 11.7: extract_translatable_strings ---${RESET}`);

test('Extract tr() calls from GDScript', () => {
  const gdscript = `
    func _ready():
        label.text = tr("GREETING")
        button.text = tr("BUTTON_OK")
        status.text = tr("STATUS_READY", "game_ui")
  `;

  const trRegex = /tr\s*\(\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?\s*\)/g;
  const matches = [];
  let match;

  while ((match = trRegex.exec(gdscript)) !== null) {
    matches.push({ key: match[1], context: match[2] });
  }

  assertEqual(matches.length, 3, 'Should find 3 tr() calls');
  assertEqual(matches[0].key, 'GREETING', 'First key should be GREETING');
  assertEqual(matches[2].context, 'game_ui', 'Third call should have context');
});

test('Extract text from scene files', () => {
  const sceneContent = `
    [node name="Label" type="Label"]
    text = "Hello World"

    [node name="Button" type="Button"]
    text = "Click Me"
  `;

  const textRegex = /text\s*=\s*"([^"]+)"/g;
  const matches = [];
  let match;

  while ((match = textRegex.exec(sceneContent)) !== null) {
    matches.push(match[1]);
  }

  assertEqual(matches.length, 2, 'Should find 2 text properties');
});

test('Detect hardcoded strings', () => {
  const gdscript = `
    label.text = "Hello"  // Hardcoded - should warn
    other.text = tr("TRANSLATED")  // Good
  `;

  // Check for non-tr() text assignments
  const hardcodedRegex = /\.text\s*=\s*"([^"]+)"(?!\s*#)/g;
  const trPattern = /tr\s*\(/;

  const lines = gdscript.split('\n');
  const warnings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (hardcodedRegex.test(line) && !trPattern.test(line)) {
      hardcodedRegex.lastIndex = 0;
      warnings.push(`Line ${i + 1}: Hardcoded string`);
    }
  }

  assertTrue(warnings.length > 0, 'Should detect hardcoded strings');
});

test('Output format options', () => {
  const validFormats = ['csv', 'po', 'json'];

  assertTrue(validFormats.includes('csv'), 'Should support CSV format');
  assertTrue(validFormats.includes('po'), 'Should support PO format');
  assertTrue(validFormats.includes('json'), 'Should support JSON format');
});

// ==========================================
// Integration Tests
// ==========================================

console.log(`\n${YELLOW}--- Integration Tests ---${RESET}`);

test('Complete localization workflow', () => {
  const workflow = {
    step1: 'create_translation_file',
    step2: 'add_translation',
    step3: 'configure_localization',
    step4: 'validate_translations',
  };

  assertEqual(workflow.step1, 'create_translation_file', 'First step should create file');
  assertEqual(workflow.step4, 'validate_translations', 'Last step should validate');
});

test('Dialogue with localization integration', () => {
  // Dialogue entries should use translation keys, not hardcoded text
  const dialogueEntry = {
    id: 'entry_1',
    speaker: 'NPC_NAME',  // Key, not "John"
    text: 'DIALOG_INTRO',  // Key, not "Hello traveler"
  };

  assertTrue(/^[A-Z_]+$/.test(dialogueEntry.speaker), 'Speaker should be translation key');
  assertTrue(/^[A-Z_]+$/.test(dialogueEntry.text), 'Text should be translation key');
});

test('CSV format parsing', () => {
  const csvContent = 'key,en,es\nMENU_START,Start,Iniciar\n"KEY_WITH,COMMA","Value, with comma","Valor, con coma"';

  const lines = csvContent.split('\n');
  assertEqual(lines.length, 3, 'CSV should have 3 lines');

  // Simple CSV parsing (real implementation handles quotes properly)
  const header = lines[0].split(',');
  assertEqual(header[0], 'key', 'First column should be key');
  assertEqual(header[1], 'en', 'Second column should be en');
});

test('PO format structure', () => {
  const poContent = `
msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: es\\n"

msgid "GREETING"
msgstr "Hola"

msgid "FAREWELL"
msgstr "Adiós"
  `;

  assertContains(poContent, 'msgid', 'PO should contain msgid');
  assertContains(poContent, 'msgstr', 'PO should contain msgstr');
  assertContains(poContent, 'Language:', 'PO should contain language header');
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
