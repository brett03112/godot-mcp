// Phase 4.9 task ledger proof.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';

const LEDGER_FILE = `${PROJECT_PATH}/.godot-mcp/task-ledger.json`;
const TEMP_FILES = [
  `${PROJECT_PATH}/.godot-mcp/evidence/phase49-smoke.txt`,
  `${PROJECT_PATH}/.godot-mcp/reports/phase49-session.md`,
  `${PROJECT_PATH}/.godot-mcp/reports/phase49-changelog.md`,
];

let activeChild = null;
let originalLedger = null;

function send(child, message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

function request(child, message, timeoutMs = 30000) {
  const response = waitForId(child, message.id, timeoutMs);
  send(child, message);
  return response;
}

function waitForId(child, id, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanupProcess();
      reject(new Error(`Timed out waiting for response id ${id}`));
    }, timeoutMs);
    const cleanupListeners = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
    };
    const onError = (error) => {
      cleanupListeners();
      reject(error);
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.id === id) {
          cleanupListeners();
          resolve(message);
          return;
        }
      }
    };
    child.stdout.on('data', onData);
    child.once('error', onError);
  });
}

function callTool(child, id, name, args, timeoutMs = 60000) {
  return request(child, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  }, timeoutMs);
}

function listTools(child, id) {
  return request(child, { jsonrpc: '2.0', id, method: 'tools/list' });
}

function parseToolContent(result) {
  if (result.error) {
    throw new Error('Tool call returned JSON-RPC error: ' + JSON.stringify(result.error));
  }
  if (!result.result || !Array.isArray(result.result.content)) {
    throw new Error('No content in tool response: ' + JSON.stringify(result));
  }
  const parsed = JSON.parse(result.result.content[0]?.text ?? '{}');
  if (result.result.isError) {
    throw new Error('Tool returned error content: ' + JSON.stringify(parsed));
  }
  return parsed;
}

function startChild() {
  const child = spawn(MCP_COMMAND, MCP_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GODOT_PATH,
    },
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[mcp-stderr] ${chunk.toString('utf8')}`));
  return child;
}

function cleanupProcess() {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
}

async function rememberLedger() {
  originalLedger = existsSync(LEDGER_FILE) ? await readFile(LEDGER_FILE, 'utf8') : null;
}

async function cleanupFiles() {
  for (const file of TEMP_FILES) {
    await rm(file, { force: true });
  }
  if (originalLedger === null) {
    await rm(LEDGER_FILE, { force: true });
  } else {
    await mkdir(`${PROJECT_PATH}/.godot-mcp`, { recursive: true });
    await writeFile(LEDGER_FILE, originalLedger, 'utf8');
  }
}

function requireSuccess(name, result) {
  if (result.status !== 'success') {
    throw new Error(`${name} expected success: ${JSON.stringify(result)}`);
  }
  return result;
}

async function main() {
  await rememberLedger();
  await cleanupFiles();
  const child = startChild();
  activeChild = child;
  try {
    await request(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase49-proof', version: '1.0.0' },
      },
    });
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    const required = [
      'mcp_task_create',
      'mcp_task_update',
      'mcp_task_list',
      'mcp_task_close',
      'mcp_evidence_attach',
      'mcp_session_report',
      'mcp_changelog_draft',
    ];
    const tools = await listTools(child, 2);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    const missing = required.filter((name) => !toolNames.includes(name));
    if (missing.length > 0) {
      throw new Error('Missing tools: ' + missing.join(', '));
    }
    console.log('tools/list returned ' + toolNames.length + ' tools including all 7 Phase 4.9 tools.');

    let id = 10;
    const created = requireSuccess('mcp_task_create', parseToolContent(await callTool(child, id++, 'mcp_task_create', {
      project_path: PROJECT_PATH,
      title: 'Phase 4.9 disposable proof task',
      description: 'Created by phase49_live_proof.mjs and restored after proof.',
      priority: 'normal',
      tags: ['phase49', 'proof'],
      related_files: ['project.godot'],
      recommendations: ['Remove disposable evidence after proof.'],
    })));

    requireSuccess('mcp_task_update', parseToolContent(await callTool(child, id++, 'mcp_task_update', {
      project_path: PROJECT_PATH,
      task_id: created.task.id,
      status: 'in_progress',
      append_notes: ['Built MCP server can update task ledger state.'],
      add_recommendations: ['Use session reports in phase closeouts.'],
    })));

    const listBeforeClose = requireSuccess('mcp_task_list', parseToolContent(await callTool(child, id++, 'mcp_task_list', {
      project_path: PROJECT_PATH,
      tag: 'phase49',
    })));
    if (listBeforeClose.count !== 1) {
      throw new Error('mcp_task_list expected one open proof task: ' + JSON.stringify(listBeforeClose));
    }

    requireSuccess('mcp_evidence_attach', parseToolContent(await callTool(child, id++, 'mcp_evidence_attach', {
      project_path: PROJECT_PATH,
      task_id: created.task.id,
      kind: 'test',
      title: 'Phase 4.9 proof evidence',
      summary: 'Built MCP server called every task ledger tool successfully.',
      content: 'phase49_live_proof.mjs exercised create, update, list, close, evidence, report, and changelog tools.',
      output_path: '.godot-mcp/evidence/phase49-smoke.txt',
      metadata: { proof_script: 'phase49_live_proof.mjs' },
    })));

    requireSuccess('mcp_task_close', parseToolContent(await callTool(child, id++, 'mcp_task_close', {
      project_path: PROJECT_PATH,
      task_id: created.task.id,
      resolution: 'verified',
      summary: 'Disposable Phase 4.9 proof task completed.',
    })));

    const report = requireSuccess('mcp_session_report', parseToolContent(await callTool(child, id++, 'mcp_session_report', {
      project_path: PROJECT_PATH,
      session_title: 'Phase 4.9 proof',
      include_evidence: true,
      output_path: '.godot-mcp/reports/phase49-session.md',
    })));
    if (report.summary.closed_tasks < 1) {
      throw new Error('mcp_session_report expected at least one closed task: ' + JSON.stringify(report));
    }

    const changelog = requireSuccess('mcp_changelog_draft', parseToolContent(await callTool(child, id++, 'mcp_changelog_draft', {
      project_path: PROJECT_PATH,
      since: '1970-01-01T00:00:00.000Z',
      output_path: '.godot-mcp/reports/phase49-changelog.md',
    })));
    if (!changelog.changelog_markdown.includes('Phase 4.9 disposable proof task')) {
      throw new Error('mcp_changelog_draft did not include proof task: ' + JSON.stringify(changelog));
    }

    console.log('All Phase 4.9 task ledger tools returned success through the built MCP server.');
    child.kill();
    activeChild = null;
    await cleanupFiles();
    console.log('Phase 4.9 task ledger proof PASSED');
  } finally {
    cleanupProcess();
    await cleanupFiles();
  }
}

main().catch((error) => {
  console.error('Phase 4.9 task ledger proof FAILED:', error);
  process.exitCode = 1;
});
