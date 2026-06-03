import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerBatchTools } from '../build/tools/batch.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    rollback_on_error: 'rollbackOnError',
    dry_run: 'dryRun',
    continue_on_error: 'continueOnError',
    max_commands: 'maxCommands',
    timeout_ms: 'timeoutMs',
    declared_touched_paths: 'declaredTouchedPaths',
    file_path: 'filePath',
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

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-batch-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry() {
  const registry = new ToolRegistry();
  const ctx = createContext();

  registry.register({
    name: 'write_text',
    description: 'Test helper that writes a project-relative text file.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => {
      const normalized = ctx.normalizeParameters(args);
      await writeFile(join(normalized.projectPath, normalized.filePath), normalized.content);
      return {
        content: [{ type: 'text', text: JSON.stringify({ status: 'success' }) }],
      };
    },
  });

  registry.register({
    name: 'fail_tool',
    description: 'Test helper that returns an error response.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({
      content: [{ type: 'text', text: 'forced failure' }],
      isError: true,
    }),
  });

  registerBatchTools(registry, ctx);
  return registry;
}

test('batch_execute runs commands and reports structured success', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const target = join(projectPath, 'scene.tscn');
    await writeFile(target, 'old');

    const response = await registry.dispatch('batch_execute', {
      project_path: projectPath,
      commands: [
        {
          tool: 'write_text',
          args: { project_path: projectPath, file_path: 'scene.tscn', content: 'new' },
        },
      ],
    });

    const data = parseResponse(response);
    assert.equal(response.isError, undefined);
    assert.equal(data.status, 'success');
    assert.equal(data.executed_count, 1);
    assert.equal(data.failed_command_index, null);
    assert.equal(data.commands[0].status, 'success');
    assert.equal(data.snapshots[0].relative_path, 'scene.tscn');
    assert.equal(await readFile(target, 'utf8'), 'new');
  });
});

test('batch_execute restores touched files after a failure when rollback is enabled', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const target = join(projectPath, 'scene.tscn');
    await writeFile(target, 'old');

    const response = await registry.dispatch('batch_execute', {
      project_path: projectPath,
      rollback_on_error: true,
      commands: [
        {
          tool: 'write_text',
          args: { project_path: projectPath, file_path: 'scene.tscn', content: 'new' },
        },
        {
          tool: 'fail_tool',
          args: {},
          declared_touched_paths: ['scene.tscn'],
        },
      ],
    });

    const data = parseResponse(response);
    assert.equal(response.isError, true);
    assert.equal(data.status, 'failed');
    assert.equal(data.executed_count, 1);
    assert.equal(data.failed_command_index, 1);
    assert.equal(data.rollback_status, 'restored');
    assert.equal(await readFile(target, 'utf8'), 'old');
  });
});

test('batch_execute leaves prior writes in place after a failure when rollback is disabled', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const target = join(projectPath, 'scene.tscn');
    await writeFile(target, 'old');

    const response = await registry.dispatch('batch_execute', {
      project_path: projectPath,
      rollback_on_error: false,
      commands: [
        {
          tool: 'write_text',
          args: { project_path: projectPath, file_path: 'scene.tscn', content: 'new' },
        },
        { tool: 'fail_tool', args: {} },
      ],
    });

    const data = parseResponse(response);
    assert.equal(response.isError, true);
    assert.equal(data.status, 'failed');
    assert.equal(data.rollback_status, 'not_requested');
    assert.equal(await readFile(target, 'utf8'), 'new');
  });
});

test('batch_execute reports the failed index for an unknown tool', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const response = await registry.dispatch('batch_execute', {
      project_path: projectPath,
      commands: [{ tool: 'missing_tool', args: {} }],
    });

    const data = parseResponse(response);
    assert.equal(response.isError, true);
    assert.equal(data.status, 'failed');
    assert.equal(data.failed_command_index, 0);
    assert.match(data.commands[0].error, /Unknown tool: missing_tool/);
  });
});

test('batch_execute rejects recursive batch calls by default', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const response = await registry.dispatch('batch_execute', {
      project_path: projectPath,
      commands: [{ tool: 'batch_execute', args: { project_path: projectPath, commands: [] } }],
    });

    const data = parseResponse(response);
    assert.equal(response.isError, true);
    assert.equal(data.status, 'failed');
    assert.equal(data.failed_command_index, 0);
    assert.match(data.commands[0].error, /Recursive batch_execute calls are disabled/);
  });
});

test('batch_execute dry run reports planned snapshots without executing commands', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const target = join(projectPath, 'scene.tscn');
    await writeFile(target, 'old');

    const response = await registry.dispatch('batch_execute', {
      project_path: projectPath,
      dry_run: true,
      commands: [
        {
          tool: 'write_text',
          args: { project_path: projectPath, file_path: 'scene.tscn', content: 'new' },
        },
      ],
    });

    const data = parseResponse(response);
    assert.equal(data.status, 'dry_run');
    assert.equal(data.executed_count, 0);
    assert.equal(data.snapshots[0].relative_path, 'scene.tscn');
    assert.equal(await readFile(target, 'utf8'), 'old');
  });
});

test('batch_execute enforces max_commands before dispatching', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const target = join(projectPath, 'scene.tscn');
    await writeFile(target, 'old');

    const response = await registry.dispatch('batch_execute', {
      project_path: projectPath,
      max_commands: 1,
      commands: [
        {
          tool: 'write_text',
          args: { project_path: projectPath, file_path: 'scene.tscn', content: 'new' },
        },
        {
          tool: 'write_text',
          args: { project_path: projectPath, file_path: 'scene.tscn', content: 'newer' },
        },
      ],
    });

    const data = parseResponse(response);
    assert.equal(response.isError, true);
    assert.equal(data.status, 'failed');
    assert.match(data.warnings[0], /exceeds max_commands/);
    assert.equal(await readFile(target, 'utf8'), 'old');
    assert.equal(existsSync(target), true);
  });
});
