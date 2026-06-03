import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerScriptPatchTools } from '../build/tools/script-patch.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    script_path: 'scriptPath',
    file_path: 'filePath',
    anchor_type: 'anchorType',
    replacement_text: 'replacementText',
    patch_text: 'patchText',
    start_line: 'startLine',
    end_line: 'endLine',
    dry_run: 'dryRun',
    validate_after: 'validateAfter',
    allow_append_fallback: 'allowAppendFallback',
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
    executeOperation: options.executeOperation || (async () => ({ stdout: '', stderr: '' })),
    validateScript: options.validateScript,
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

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-script-patch-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerScriptPatchTools(registry, ctx);
  return registry;
}

test('script_patch registers with the tool registry', () => {
  const registry = createRegistry();
  assert.equal(registry.has('script_patch'), true);
});

test('script_patch inserts after an exact anchor and preserves CRLF line endings', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const scriptPath = join(projectPath, 'player.gd');
    await writeFile(scriptPath, 'extends Node\r\n\r\nfunc _ready():\r\n\tpass\r\n');

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'insert_after',
      anchor_type: 'exact_text',
      anchor: 'func _ready():\r\n\tpass',
      patch_text: 'func greet():\n\tprint("hello")',
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'success');
    assert.equal(data.changed, true);
    assert.equal(await readFile(scriptPath, 'utf8'), 'extends Node\r\n\r\nfunc _ready():\r\n\tpass\r\nfunc greet():\r\n\tprint("hello")\r\n');
  });
});

test('script_patch replaces a function block without touching the following function', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const scriptPath = join(projectPath, 'player.gd');
    await writeFile(scriptPath, [
      'extends Node',
      '',
      'func _physics_process(delta):',
      '\tvelocity += delta',
      '\tmove_and_slide()',
      '',
      'func keep_me():',
      '\treturn true',
      '',
    ].join('\n'));

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'replace_block',
      anchor_type: 'function_name',
      anchor: '_physics_process',
      replacement_text: 'func _physics_process(delta):\n\tvelocity = Vector2.ZERO',
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'success');
    const content = await readFile(scriptPath, 'utf8');
    assert.match(content, /func _physics_process\(delta\):\n\tvelocity = Vector2.ZERO\n\nfunc keep_me\(\):/);
    assert.doesNotMatch(content, /move_and_slide/);
  });
});

test('script_patch rejects ambiguous exact anchors unless occurrence is provided', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const scriptPath = join(projectPath, 'player.gd');
    const original = 'extends Node\n\nfunc a():\n\tpass\n\nfunc b():\n\tpass\n';
    await writeFile(scriptPath, original);

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'insert_before',
      anchor_type: 'exact_text',
      anchor: '\tpass',
      patch_text: '\tprint("hit")',
    });

    const data = parseResponse(response);
    assert.equal(response.isError, true);
    assert.equal(data.status, 'failed');
    assert.match(data.reason, /Ambiguous anchor/);
    assert.equal(await readFile(scriptPath, 'utf8'), original);
  });
});

test('script_patch dry run returns a unified diff without writing', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const scriptPath = join(projectPath, 'player.gd');
    const original = 'extends Node\n\nfunc _ready():\n\tpass\n';
    await writeFile(scriptPath, original);

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'insert_after',
      anchor_type: 'function_name',
      anchor: '_ready',
      patch_text: 'func added():\n\treturn 1',
      dry_run: true,
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'dry_run');
    assert.match(data.diff, /--- player\.gd/);
    assert.match(data.diff, /\+func added\(\):/);
    assert.equal(await readFile(scriptPath, 'utf8'), original);
  });
});

test('script_patch supports replace_range with one-based inclusive line numbers', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const scriptPath = join(projectPath, 'player.gd');
    await writeFile(scriptPath, 'extends Node\nvar health = 10\nvar speed = 3\nfunc _ready():\n\tpass\n');

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'replace_range',
      start_line: 2,
      end_line: 3,
      patch_text: 'var health = 20',
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'success');
    assert.equal(await readFile(scriptPath, 'utf8'), 'extends Node\nvar health = 20\nfunc _ready():\n\tpass\n');
  });
});

test('script_patch replaces a class member block by member name', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const scriptPath = join(projectPath, 'player.gd');
    await writeFile(scriptPath, 'extends Node\n@export var speed := 10\nvar health := 3\nfunc _ready():\n\tpass\n');

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'replace_block',
      anchor_type: 'class_member',
      anchor: 'speed',
      patch_text: '@export var speed := 24',
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'success');
    assert.equal(await readFile(scriptPath, 'utf8'), 'extends Node\n@export var speed := 24\nvar health := 3\nfunc _ready():\n\tpass\n');
  });
});

test('script_patch requires regex opt-in and applies regex anchors when enabled', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const scriptPath = join(projectPath, 'player.gd');
    await writeFile(scriptPath, 'extends Node\n\nfunc attack_light():\n\tpass\n');

    const blocked = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'insert_before',
      anchor_type: 'regex',
      anchor: 'func attack_\\w+\\(\\):',
      patch_text: 'var combo := 0',
    });

    const blockedData = parseResponse(blocked);
    assert.equal(blocked.isError, true);
    assert.match(blockedData.reason, /regex.*opt-in/i);

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'insert_before',
      anchor_type: 'regex',
      anchor: 'func attack_\\w+\\(\\):',
      regex: true,
      patch_text: 'var combo := 0',
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'success');
    assert.equal(await readFile(scriptPath, 'utf8'), 'extends Node\n\nvar combo := 0\nfunc attack_light():\n\tpass\n');
  });
});

test('script_patch can append when a missing anchor allows append fallback', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const scriptPath = join(projectPath, 'player.gd');
    await writeFile(scriptPath, 'extends Node\n');

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'insert_after',
      anchor_type: 'function_name',
      anchor: 'missing',
      patch_text: 'func added():\n\tpass',
      allow_append_fallback: true,
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'success');
    assert.equal(data.fallback_used, true);
    assert.equal(await readFile(scriptPath, 'utf8'), 'extends Node\nfunc added():\n\tpass\n');
  });
});

test('script_patch validates patched content before writing when validate_after is enabled', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const ctx = createContext({
      validateScript: async (params) => {
        calls.push(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ valid: true }) }],
        };
      },
    });
    const registry = createRegistry(ctx);
    const scriptPath = join(projectPath, 'player.gd');
    await writeFile(scriptPath, 'extends Node\n');

    const response = await registry.dispatch('script_patch', {
      project_path: projectPath,
      script_path: 'player.gd',
      mode: 'append_to_file',
      patch_text: 'func added():\n\tpass',
      validate_after: true,
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'success');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].scriptPath, 'player.gd');
    assert.match(calls[0].scriptContent, /func added/);
    assert.equal(await readFile(scriptPath, 'utf8'), 'extends Node\nfunc added():\n\tpass\n');
  });
});
