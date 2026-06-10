import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerTaskLedgerTools } from '../build/tools/task-ledger.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    task_id: 'taskId',
    include_closed: 'includeClosed',
    append_notes: 'appendNotes',
    add_related_files: 'addRelatedFiles',
    add_recommendations: 'addRecommendations',
    related_files: 'relatedFiles',
    source_path: 'sourcePath',
    output_path: 'outputPath',
    session_title: 'sessionTitle',
    include_evidence: 'includeEvidence',
    since: 'since',
    dry_run: 'dryRun',
  };

  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = mapping[key] || key;
      result[normalizedKey] = Array.isArray(value)
        ? value.map((item) => normalizeParameters(item))
        : normalizeParameters(value);
    }
    return result;
  };

  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({ content: [{ type: 'text', text: message }], isError: true }),
    validatePath: (path) => Boolean(path) && !String(path).includes('..'),
    executeOperation: async () => ({ stdout: '{}\n', stderr: '' }),
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

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerTaskLedgerTools(registry, ctx);
  return registry;
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-task-ledger-'));
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await mkdir(join(projectPath, 'scripts'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="TaskLedger"\n');
  await writeFile(join(projectPath, 'scripts', 'player.gd'), 'extends Node\n');
  await writeFile(join(projectPath, 'scenes', 'main.tscn'), '[gd_scene format=3]\n[node name="Root" type="Node2D"]\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

test('Phase 4.9 task ledger tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'mcp_task_create',
    'mcp_task_update',
    'mcp_task_list',
    'mcp_task_close',
    'mcp_evidence_attach',
    'mcp_session_report',
    'mcp_changelog_draft',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('tasks can be created, listed, updated, and closed in the project-local ledger', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();

    const created = parseResponse(await registry.dispatch('mcp_task_create', {
      project_path: projectPath,
      title: 'Tune player jump feel',
      description: 'Track the work needed to make the jump less floaty.',
      priority: 'high',
      tags: ['movement', 'polish'],
      source: 'phase-4.9-test',
      related_files: ['scripts/player.gd'],
      recommendations: ['Run a short input smoke after tuning.'],
    }));
    assert.equal(created.status, 'success');
    assert.equal(created.task.id, 'task-0001');
    assert.equal(created.task.status, 'open');
    assert.equal(created.ledger_path, '.godot-mcp/task-ledger.json');
    assert.equal((await stat(join(projectPath, '.godot-mcp', 'task-ledger.json'))).isFile(), true);

    const openList = parseResponse(await registry.dispatch('mcp_task_list', {
      project_path: projectPath,
      status: 'open',
      tag: 'movement',
    }));
    assert.equal(openList.status, 'success');
    assert.equal(openList.count, 1);
    assert.equal(openList.tasks[0].title, 'Tune player jump feel');

    const updated = parseResponse(await registry.dispatch('mcp_task_update', {
      project_path: projectPath,
      task_id: created.task.id,
      status: 'in_progress',
      append_notes: ['Reduced gravity scale in local prototype.'],
      add_related_files: ['scenes/main.tscn'],
      add_recommendations: ['Check animation timing after physics changes.'],
    }));
    assert.equal(updated.status, 'success');
    assert.equal(updated.task.status, 'in_progress');
    assert.deepEqual(updated.task.notes.map((note) => note.text), ['Reduced gravity scale in local prototype.']);
    assert.equal(updated.task.related_files.includes('scenes/main.tscn'), true);

    const closed = parseResponse(await registry.dispatch('mcp_task_close', {
      project_path: projectPath,
      task_id: created.task.id,
      resolution: 'fixed',
      summary: 'Jump tuning task closed after focused verification.',
      recommendations: ['Watch for regressions in controller input tests.'],
    }));
    assert.equal(closed.status, 'success');
    assert.equal(closed.task.status, 'closed');
    assert.equal(closed.task.resolution, 'fixed');

    const hiddenClosed = parseResponse(await registry.dispatch('mcp_task_list', {
      project_path: projectPath,
    }));
    assert.equal(hiddenClosed.count, 0);

    const visibleClosed = parseResponse(await registry.dispatch('mcp_task_list', {
      project_path: projectPath,
      include_closed: true,
    }));
    assert.equal(visibleClosed.count, 1);
    assert.equal(visibleClosed.tasks[0].closed_summary, 'Jump tuning task closed after focused verification.');
  });
});

test('evidence, session reports, and changelog drafts preserve a structured evidence trail', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const created = parseResponse(await registry.dispatch('mcp_task_create', {
      project_path: projectPath,
      title: 'Verify pause menu proof',
      tags: ['qa'],
      related_files: ['scenes/main.tscn'],
    }));

    const evidence = parseResponse(await registry.dispatch('mcp_evidence_attach', {
      project_path: projectPath,
      task_id: created.task.id,
      kind: 'test',
      title: 'Focused smoke output',
      summary: 'The focused smoke covered the pause menu scene.',
      content: 'node --test tests/task-ledger.test.mjs: PASS',
      output_path: '.godot-mcp/evidence/phase49-smoke.txt',
      metadata: { command: 'node --test tests/task-ledger.test.mjs' },
    }));
    assert.equal(evidence.status, 'success');
    assert.equal(evidence.evidence.id, 'evidence-0001');
    assert.equal(evidence.evidence.stored_path, '.godot-mcp/evidence/phase49-smoke.txt');
    assert.equal((await readFile(join(projectPath, '.godot-mcp', 'evidence', 'phase49-smoke.txt'), 'utf8')).includes('PASS'), true);

    await registry.dispatch('mcp_task_close', {
      project_path: projectPath,
      task_id: created.task.id,
      resolution: 'verified',
      summary: 'Pause menu proof completed.',
    });

    const report = parseResponse(await registry.dispatch('mcp_session_report', {
      project_path: projectPath,
      session_title: 'Phase 4.9 proof',
      include_evidence: true,
      output_path: '.godot-mcp/reports/phase49-session.md',
    }));
    assert.equal(report.status, 'success');
    assert.equal(report.summary.closed_tasks, 1);
    assert.equal(report.summary.evidence_count, 1);
    assert.match(report.report_markdown, /Verify pause menu proof/);
    assert.match(report.report_markdown, /Focused smoke output/);
    assert.equal((await stat(join(projectPath, '.godot-mcp', 'reports', 'phase49-session.md'))).isFile(), true);

    const changelog = parseResponse(await registry.dispatch('mcp_changelog_draft', {
      project_path: projectPath,
      since: '1970-01-01T00:00:00.000Z',
      output_path: '.godot-mcp/reports/phase49-changelog.md',
    }));
    assert.equal(changelog.status, 'success');
    assert.equal(changelog.closed_tasks, 1);
    assert.match(changelog.changelog_markdown, /verified/);
    assert.match(changelog.changelog_markdown, /Verify pause menu proof/);
    assert.equal((await stat(join(projectPath, '.godot-mcp', 'reports', 'phase49-changelog.md'))).isFile(), true);
  });
});

test('task ledger evidence paths cannot escape the project root', async () => {
  await withProject(async (projectPath) => {
    const registry = createRegistry();
    const response = await registry.dispatch('mcp_evidence_attach', {
      project_path: projectPath,
      title: 'Escaping proof',
      content: 'should not write',
      output_path: '../outside.txt',
    });
    const payload = parseResponse(response);
    assert.equal(response.isError, true);
    assert.equal(payload.status, 'failed');
    assert.match(payload.reason, /escapes project/i);
  });
});
