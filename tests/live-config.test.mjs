import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import {
  liveConfigStatusPayload,
  loadLiveConfig,
  validateLiveConfig,
} from '../build/live/config.js';
import { registerLiveConfigTools } from '../build/tools/live-config.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext() {
  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({ content: [{ type: 'text', text: message }], isError: true }),
    validatePath: (path) => Boolean(path) && !String(path).includes('..'),
    executeOperation: async () => ({ stdout: '{}\n', stderr: '' }),
    normalizeParameters: (params) => {
      if (!params || typeof params !== 'object') return params;
      return {
        ...params,
        projectPath: params.projectPath ?? params.project_path,
      };
    },
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
    escapeRegex: (value) => value,
    extractPlaceholders: () => [],
    getOrParseTscn: () => ({}),
    invalidateTscnCache: () => {},
  };
}

test('default live config is loopback-only and eval-disabled', () => {
  const result = loadLiveConfig({ env: {}, cwd: process.cwd() });

  assert.equal(result.config.live.enabled, true);
  assert.equal(result.config.live.host, '127.0.0.1');
  assert.equal(result.config.live.port, 6010);
  assert.equal(result.config.live.sharedSecret, undefined);
  assert.deepEqual(result.config.live.allowedProjectPaths, []);
  assert.equal(result.config.eval.enabled, false);
  assert.equal(result.config.staleSessionTimeoutMs, 15000);
  assert.equal(result.status, 'success');
});

test('env and project config merge with project config taking precedence', async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-live-config-'));
  try {
    await mkdir(join(projectPath, '.godot-mcp'), { recursive: true });
    await writeFile(join(projectPath, '.godot-mcp', 'config.json'), JSON.stringify({
      live: {
        port: 6123,
        allowed_project_paths: ['.'],
      },
      eval: {
        enabled: true,
        approval_token: 'project-token',
      },
      log_retention_days: 9,
      screenshot_output_dir: '.godot-mcp/screens',
      stale_session_timeout_ms: 32000,
    }, null, 2));

    const result = loadLiveConfig({
      env: {
        GODOT_MCP_LIVE_HOST: 'localhost',
        GODOT_MCP_LIVE_PORT: '6111',
        GODOT_MCP_LIVE_SECRET: 'env-secret',
        GODOT_MCP_ENABLE_EVAL: 'false',
      },
      cwd: process.cwd(),
      projectPath,
    });

    assert.equal(result.config.live.host, 'localhost');
    assert.equal(result.config.live.port, 6123);
    assert.equal(result.config.live.sharedSecret, 'env-secret');
    assert.deepEqual(result.config.live.allowedProjectPaths, [resolve(projectPath)]);
    assert.equal(result.config.eval.enabled, true);
    assert.equal(result.config.eval.approvalToken, 'project-token');
    assert.equal(result.config.logRetentionDays, 9);
    assert.equal(result.config.screenshotOutputDir, resolve(projectPath, '.godot-mcp/screens'));
    assert.equal(result.config.staleSessionTimeoutMs, 32000);
    assert.equal(result.sources.some((source) => source.endsWith('.godot-mcp\\config.json') || source.endsWith('.godot-mcp/config.json')), true);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('invalid config reports clear remediation without exposing secrets', () => {
  const result = loadLiveConfig({
    env: {
      GODOT_MCP_LIVE_PORT: '70000',
      GODOT_MCP_LIVE_HOST: '0.0.0.0',
      GODOT_MCP_LIVE_SECRET: 'top-secret',
      GODOT_MCP_LOG_RETENTION_DAYS: '-2',
      GODOT_MCP_STALE_SESSION_TIMEOUT_MS: '100',
    },
    cwd: process.cwd(),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.validation.valid, false);
  assert.equal(result.validation.issues.length >= 3, true);
  assert.equal(JSON.stringify(liveConfigStatusPayload(result)).includes('top-secret'), false);
  assert.equal(result.validation.issues.some((issue) => issue.path === 'live.host' && /loopback/i.test(issue.remediation)), true);
  assert.equal(result.validation.issues.some((issue) => issue.path === 'live.port'), true);
});

test('live_config_status reports redacted effective config and validation', async () => {
  const registry = new ToolRegistry();
  registerLiveConfigTools(registry, createContext(), {
    getConfigStatus: (projectPath) => loadLiveConfig({
      env: {
        GODOT_MCP_LIVE_SECRET: 'status-secret',
        GODOT_MCP_ALLOWED_PROJECT_PATHS: projectPath,
      },
      cwd: process.cwd(),
      projectPath,
    }),
  });

  assert.equal(registry.has('live_config_status'), true);
  const projectPath = resolve('test_mcp_enhancements');
  const status = parseResponse(await registry.dispatch('live_config_status', {
    project_path: projectPath,
  }));

  assert.equal(status.status, 'success');
  assert.equal(status.config.live.shared_secret_configured, true);
  assert.equal(status.config.live.shared_secret, undefined);
  assert.deepEqual(status.config.live.allowed_project_paths, [projectPath]);
  assert.equal(status.config.eval.enabled, false);
  assert.equal(status.validation.valid, true);
  assert.equal(JSON.stringify(status).includes('status-secret'), false);
});

test('validateLiveConfig rejects non-local allowed paths that do not exist', () => {
  const validation = validateLiveConfig({
    live: {
      enabled: true,
      host: '127.0.0.1',
      port: 6010,
      allowedProjectPaths: [resolve(tmpdir(), 'definitely-not-a-godot-project')],
    },
    eval: {
      enabled: false,
    },
    logRetentionDays: 14,
    screenshotOutputDir: resolve('.godot-mcp/screenshots'),
    staleSessionTimeoutMs: 15000,
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.path === 'live.allowed_project_paths'), true);
});
