import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLiveEditorTools } from '../build/tools/live-editor.js';
import { LiveSessionManager } from '../build/live/session-manager.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-safe-eval-'));
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LiveSafeEval"\n');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function hello(projectPath, overrides = {}) {
  return {
    kind: 'hello',
    session: {
      session_id: overrides.session_id || 'session-1',
      project_path: projectPath,
      godot_version: '4.6.3.stable',
      editor_pid: 4242,
      active_scene: 'res://test_connect.tscn',
      play_state: 'playing',
      writable: true,
      connection_state: 'connected',
      last_heartbeat_unix: 1770000000,
      runtime_status: {
        state: 'running',
        active_session_id: 7,
        sessions: [{ session_id: 7, state: 'running', last_message: 'godot_mcp:runtime_ready' }],
      },
      ...overrides,
    },
  };
}

function createRegistry(manager, evalConfig = {}) {
  const registry = new ToolRegistry();
  registerLiveEditorTools(registry, { manager, evalConfig });
  return registry;
}

test('Phase 3.5 eval status is visible but eval tools are disabled by default', async () => {
  const registry = createRegistry(new LiveSessionManager());
  assert.equal(registry.has('live_eval_status'), true);
  assert.equal(registry.has('game_eval'), false);
  assert.equal(registry.has('editor_eval'), false);

  const data = parseResponse(await registry.dispatch('live_eval_status', {}));
  assert.equal(data.status, 'success');
  assert.equal(data.eval.enabled, false);
  assert.match(data.eval.reason, /disabled/i);
});

test('Phase 3.5 eval tools register only when explicitly enabled', async () => {
  const registry = createRegistry(new LiveSessionManager(), {
    enabled: true,
    approvalToken: 'phase35',
  });

  assert.equal(registry.has('live_eval_status'), true);
  assert.equal(registry.has('game_eval'), true);
  assert.equal(registry.has('editor_eval'), true);
});

test('enabled eval refuses unsafe sessions and bad approval tokens with audit records', async () => {
  await withProject(async (projectPath) => {
    const auditPath = join(projectPath, 'eval-audit.jsonl');
    const manager = new LiveSessionManager({ now: () => 5000 });
    manager.registerHello(hello(projectPath), {
      remoteAddress: '192.168.1.50',
      send: () => {},
    });
    const registry = createRegistry(manager, {
      enabled: true,
      approvalToken: 'phase35',
      auditLogPath: auditPath,
    });

    const remoteRefusal = parseResponse(await registry.dispatch('editor_eval', {
      session_id: 'session-1',
      project_path: projectPath,
      code: '1 + 1',
      reason: 'unit refusal',
      approval_token: 'phase35',
    }));
    assert.equal(remoteRefusal.status, 'failed');
    assert.equal(remoteRefusal.reason, 'eval_requires_loopback');

    manager.clear();
    manager.registerHello(hello(projectPath), {
      remoteAddress: '127.0.0.1',
      send: () => {},
    });
    const tokenRefusal = parseResponse(await registry.dispatch('editor_eval', {
      session_id: 'session-1',
      project_path: projectPath,
      code: '1 + 1',
      reason: 'unit refusal',
      approval_token: 'wrong',
    }));
    assert.equal(tokenRefusal.status, 'failed');
    assert.equal(tokenRefusal.reason, 'eval_approval_token_mismatch');

    const lines = (await readFile(auditPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((line) => line.decision), ['refused', 'refused']);
    assert.equal(lines[0].tool, 'editor_eval');
    assert.equal(lines[0].code_hash.length, 64);
    assert.equal(lines[0].caller_reason, 'unit refusal');
  });
});

test('enabled eval forwards editor and game eval commands with hashed audit records', async () => {
  await withProject(async (projectPath) => {
    const auditPath = join(projectPath, 'eval-audit.jsonl');
    const sent = [];
    const manager = new LiveSessionManager({ now: () => 6000 });
    const session = hello(projectPath).session;
    manager.registerHello({ kind: 'hello', session }, {
      remoteAddress: '127.0.0.1',
      send: (payload) => sent.push(payload),
    });
    const registry = createRegistry(manager, {
      enabled: true,
      approvalToken: 'phase35',
      auditLogPath: auditPath,
    });

    const editorPromise = registry.dispatch('editor_eval', {
      session_id: 'session-1',
      project_path: projectPath,
      code: '1 + 1',
      reason: 'unit harmless editor eval',
      approval_token: 'phase35',
    });
    await waitForCondition(() => sent.length === 1);
    assert.equal(sent[0].command, 'editor_eval');
    assert.equal(sent[0].args.code, '1 + 1');
    assert.equal(sent[0].args.project_path, resolve(projectPath));
    manager.recordMessage('session-1', {
      kind: 'command_response',
      request_id: sent[0].request_id,
      status: 'success',
      data: { result: 2, result_type: 'int' },
      session,
    });
    assert.equal(parseResponse(await editorPromise).data.result, 2);

    sent.length = 0;
    const gamePromise = registry.dispatch('game_eval', {
      session_id: 'session-1',
      project_path: projectPath,
      code: '2 + 3',
      reason: 'unit harmless game eval',
      approval_token: 'phase35',
    });
    await waitForCondition(() => sent.length === 1);
    assert.equal(sent[0].command, 'game_eval');
    assert.equal(sent[0].args.code, '2 + 3');
    manager.recordMessage('session-1', {
      kind: 'command_response',
      request_id: sent[0].request_id,
      status: 'success',
      data: { result: 5, result_type: 'int' },
      session,
    });
    assert.equal(parseResponse(await gamePromise).data.result, 5);

    const lines = (await readFile(auditPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((line) => line.decision), ['accepted', 'accepted']);
    assert.deepEqual(lines.map((line) => line.tool), ['editor_eval', 'game_eval']);
  });
});

async function waitForCondition(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  }
  throw new Error('Timed out waiting for condition.');
}
