import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

export type LiveMcpConfig = {
  live: {
    enabled: boolean;
    host: string;
    port: number;
    sharedSecret?: string;
    allowedProjectPaths: string[];
  };
  eval: {
    enabled: boolean;
    approvalToken?: string;
    projectPath?: string;
    auditLogPath: string;
  };
  logRetentionDays: number;
  screenshotOutputDir: string;
  staleSessionTimeoutMs: number;
};

export type LiveConfigIssue = {
  path: string;
  message: string;
  remediation: string;
};

export type LiveConfigValidation = {
  valid: boolean;
  issues: LiveConfigIssue[];
};

export type LiveConfigLoadResult = {
  status: 'success' | 'failed';
  config: LiveMcpConfig;
  sources: string[];
  validation: LiveConfigValidation;
  warnings: string[];
};

export type LoadLiveConfigOptions = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  projectPath?: string;
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 6010;
const DEFAULT_STALE_TIMEOUT_MS = 15000;

export function loadLiveConfig(options: LoadLiveConfigOptions = {}): LiveConfigLoadResult {
  const env = options.env || process.env;
  const cwd = resolve(options.cwd || process.cwd());
  const projectPath = options.projectPath ? resolve(options.projectPath) : undefined;
  const sources: string[] = ['defaults'];
  const warnings: string[] = [];
  const baseDir = projectPath || cwd;
  const config: LiveMcpConfig = {
    live: {
      enabled: true,
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      sharedSecret: undefined,
      allowedProjectPaths: [],
    },
    eval: {
      enabled: false,
      approvalToken: undefined,
      projectPath: undefined,
      auditLogPath: resolve(cwd, '.mcp_logs', 'live_eval_audit.jsonl'),
    },
    logRetentionDays: 14,
    screenshotOutputDir: resolve(baseDir, '.godot-mcp', 'screenshots'),
    staleSessionTimeoutMs: DEFAULT_STALE_TIMEOUT_MS,
  };

  applyEnvConfig(config, env, baseDir, sources);

  if (projectPath) {
    const projectConfigPath = join(projectPath, '.godot-mcp', 'config.json');
    if (existsSync(projectConfigPath)) {
      sources.push(projectConfigPath);
      try {
        const parsed = JSON.parse(readFileSync(projectConfigPath, 'utf8'));
        applyObjectConfig(config, parsed, projectPath);
      } catch (error: any) {
        warnings.push(`Failed to read ${projectConfigPath}: ${error?.message || String(error)}`);
      }
    }
  }

  const validation = validateLiveConfig(config);
  if (warnings.length > 0) {
    validation.issues.push(...warnings.map((warning) => ({
      path: 'config.file',
      message: warning,
      remediation: 'Fix the JSON syntax or remove the invalid per-project config file.',
    })));
  }
  validation.valid = validation.issues.length === 0;

  return {
    status: validation.valid ? 'success' : 'failed',
    config,
    sources,
    validation,
    warnings,
  };
}

export function validateLiveConfig(config: LiveMcpConfig): LiveConfigValidation {
  const issues: LiveConfigIssue[] = [];

  if (typeof config.live.enabled !== 'boolean') {
    issues.push(issue('live.enabled', 'live.enabled must be a boolean.', 'Use true or false.'));
  }
  if (!isLoopbackHost(config.live.host)) {
    issues.push(issue('live.host', 'The live bridge host must be loopback-only.', 'Use a loopback host: 127.0.0.1, localhost, or ::1.'));
  }
  if (!Number.isInteger(config.live.port) || config.live.port < 1 || config.live.port > 65535) {
    issues.push(issue('live.port', 'The live bridge port must be an integer from 1 to 65535.', 'Use a valid local TCP port, normally 6010.'));
  }
  if (config.live.sharedSecret !== undefined && String(config.live.sharedSecret).trim() === '') {
    issues.push(issue('live.shared_secret', 'Configured shared secrets cannot be empty.', 'Remove the value or set a non-empty shared secret.'));
  }
  for (const projectPath of config.live.allowedProjectPaths) {
    if (!existsSync(projectPath)) {
      issues.push(issue('live.allowed_project_paths', `Allowed project path does not exist: ${projectPath}`, 'Use an existing Godot project directory or remove it from the allowlist.'));
    }
  }
  if (typeof config.eval.enabled !== 'boolean') {
    issues.push(issue('eval.enabled', 'eval.enabled must be a boolean.', 'Use true or false; defaults to false.'));
  }
  if (config.eval.enabled && config.eval.projectPath && !existsSync(config.eval.projectPath)) {
    issues.push(issue('eval.project_path', `Eval project path does not exist: ${config.eval.projectPath}`, 'Use an existing project path or remove the eval project gate.'));
  }
  if (!Number.isInteger(config.logRetentionDays) || config.logRetentionDays < 0 || config.logRetentionDays > 3650) {
    issues.push(issue('log_retention_days', 'log_retention_days must be an integer from 0 to 3650.', 'Use a non-negative retention period in days.'));
  }
  if (!config.screenshotOutputDir || typeof config.screenshotOutputDir !== 'string') {
    issues.push(issue('screenshot_output_dir', 'screenshot_output_dir must be a non-empty path.', 'Set a project-relative or absolute screenshot output directory.'));
  }
  if (!Number.isInteger(config.staleSessionTimeoutMs) || config.staleSessionTimeoutMs < 1000) {
    issues.push(issue('stale_session_timeout_ms', 'stale_session_timeout_ms must be at least 1000.', 'Use a timeout in milliseconds, normally 15000 or higher.'));
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function liveConfigStatusPayload(result: LiveConfigLoadResult): Record<string, unknown> {
  return {
    status: result.status,
    config: sanitizeConfig(result.config),
    sources: result.sources,
    validation: result.validation,
    warnings: result.warnings,
    remediation: result.status === 'success'
      ? []
      : result.validation.issues.map((entry) => `${entry.path}: ${entry.remediation}`),
  };
}

export function isProjectAllowed(projectPath: string, allowedProjectPaths: string[]): boolean {
  if (allowedProjectPaths.length === 0) return true;
  const normalized = resolve(projectPath);
  return allowedProjectPaths.some((allowedPath) => (
    normalized === allowedPath
    || normalized.startsWith(`${allowedPath}\\`)
    || normalized.startsWith(`${allowedPath}/`)
  ));
}

function applyEnvConfig(config: LiveMcpConfig, env: Record<string, string | undefined>, baseDir: string, sources: string[]): void {
  if (hasEnv(env, 'GODOT_MCP_LIVE_ENABLED')) config.live.enabled = parseBoolean(env.GODOT_MCP_LIVE_ENABLED, config.live.enabled);
  if (hasEnv(env, 'GODOT_MCP_LIVE_HOST')) config.live.host = String(env.GODOT_MCP_LIVE_HOST);
  if (hasEnv(env, 'GODOT_MCP_LIVE_PORT')) config.live.port = parseInteger(env.GODOT_MCP_LIVE_PORT, Number.NaN);
  if (hasEnv(env, 'GODOT_MCP_LIVE_SECRET')) config.live.sharedSecret = env.GODOT_MCP_LIVE_SECRET || undefined;
  const allowed = env.GODOT_MCP_ALLOWED_PROJECT_PATHS ?? env.GODOT_MCP_LIVE_ALLOWED_PROJECT_PATHS;
  if (allowed) config.live.allowedProjectPaths = parsePathList(allowed, baseDir);
  if (hasEnv(env, 'GODOT_MCP_ENABLE_EVAL')) config.eval.enabled = parseBoolean(env.GODOT_MCP_ENABLE_EVAL, config.eval.enabled);
  if (hasEnv(env, 'GODOT_MCP_EVAL_APPROVAL_TOKEN')) config.eval.approvalToken = env.GODOT_MCP_EVAL_APPROVAL_TOKEN || undefined;
  if (hasEnv(env, 'GODOT_MCP_EVAL_PROJECT_PATH')) config.eval.projectPath = normalizeOptionalPath(env.GODOT_MCP_EVAL_PROJECT_PATH, baseDir);
  if (hasEnv(env, 'GODOT_MCP_EVAL_AUDIT_LOG')) config.eval.auditLogPath = normalizePath(String(env.GODOT_MCP_EVAL_AUDIT_LOG), baseDir);
  if (hasEnv(env, 'GODOT_MCP_LOG_RETENTION_DAYS')) config.logRetentionDays = parseInteger(env.GODOT_MCP_LOG_RETENTION_DAYS, Number.NaN);
  if (hasEnv(env, 'GODOT_MCP_SCREENSHOT_OUTPUT_DIR')) config.screenshotOutputDir = normalizePath(String(env.GODOT_MCP_SCREENSHOT_OUTPUT_DIR), baseDir);
  if (hasEnv(env, 'GODOT_MCP_STALE_SESSION_TIMEOUT_MS')) config.staleSessionTimeoutMs = parseInteger(env.GODOT_MCP_STALE_SESSION_TIMEOUT_MS, Number.NaN);

  const used = [
    'GODOT_MCP_LIVE_ENABLED',
    'GODOT_MCP_LIVE_HOST',
    'GODOT_MCP_LIVE_PORT',
    'GODOT_MCP_LIVE_SECRET',
    'GODOT_MCP_ALLOWED_PROJECT_PATHS',
    'GODOT_MCP_LIVE_ALLOWED_PROJECT_PATHS',
    'GODOT_MCP_ENABLE_EVAL',
    'GODOT_MCP_EVAL_APPROVAL_TOKEN',
    'GODOT_MCP_EVAL_PROJECT_PATH',
    'GODOT_MCP_EVAL_AUDIT_LOG',
    'GODOT_MCP_LOG_RETENTION_DAYS',
    'GODOT_MCP_SCREENSHOT_OUTPUT_DIR',
    'GODOT_MCP_STALE_SESSION_TIMEOUT_MS',
  ].filter((key) => hasEnv(env, key));
  if (used.length > 0) sources.push(`env:${used.join(',')}`);
}

function applyObjectConfig(config: LiveMcpConfig, raw: any, baseDir: string): void {
  const live = objectValue(raw.live);
  if (live) {
    if (hasOwn(live, 'enabled')) config.live.enabled = Boolean(live.enabled);
    if (hasOwn(live, 'host')) config.live.host = String(live.host);
    if (hasOwn(live, 'port')) config.live.port = parseInteger(live.port, Number.NaN);
    const secret = live.shared_secret ?? live.sharedSecret;
    if (secret !== undefined) config.live.sharedSecret = secret ? String(secret) : undefined;
    const allowed = live.allowed_project_paths ?? live.allowedProjectPaths;
    if (allowed !== undefined) config.live.allowedProjectPaths = parsePathList(allowed, baseDir);
  }

  const evalConfig = objectValue(raw.eval);
  if (evalConfig) {
    if (hasOwn(evalConfig, 'enabled')) config.eval.enabled = Boolean(evalConfig.enabled);
    const approvalToken = evalConfig.approval_token ?? evalConfig.approvalToken;
    if (approvalToken !== undefined) config.eval.approvalToken = approvalToken ? String(approvalToken) : undefined;
    const projectPath = evalConfig.project_path ?? evalConfig.projectPath;
    if (projectPath !== undefined) config.eval.projectPath = normalizeOptionalPath(projectPath, baseDir);
    const auditLogPath = evalConfig.audit_log_path ?? evalConfig.auditLogPath;
    if (auditLogPath !== undefined) config.eval.auditLogPath = normalizePath(String(auditLogPath), baseDir);
  }

  if (hasOwn(raw, 'log_retention_days') || hasOwn(raw, 'logRetentionDays')) {
    config.logRetentionDays = parseInteger(raw.log_retention_days ?? raw.logRetentionDays, Number.NaN);
  }
  if (hasOwn(raw, 'screenshot_output_dir') || hasOwn(raw, 'screenshotOutputDir')) {
    config.screenshotOutputDir = normalizePath(String(raw.screenshot_output_dir ?? raw.screenshotOutputDir), baseDir);
  }
  if (hasOwn(raw, 'stale_session_timeout_ms') || hasOwn(raw, 'staleSessionTimeoutMs')) {
    config.staleSessionTimeoutMs = parseInteger(raw.stale_session_timeout_ms ?? raw.staleSessionTimeoutMs, Number.NaN);
  }
}

function sanitizeConfig(config: LiveMcpConfig): Record<string, unknown> {
  return {
    live: {
      enabled: config.live.enabled,
      host: config.live.host,
      port: config.live.port,
      shared_secret_configured: Boolean(config.live.sharedSecret),
      allowed_project_paths: config.live.allowedProjectPaths,
    },
    eval: {
      enabled: config.eval.enabled,
      approval_token_configured: Boolean(config.eval.approvalToken),
      project_path: config.eval.projectPath || null,
      audit_log_path: config.eval.auditLogPath,
    },
    log_retention_days: config.logRetentionDays,
    screenshot_output_dir: config.screenshotOutputDir,
    stale_session_timeout_ms: config.staleSessionTimeoutMs,
  };
}

function issue(path: string, message: string, remediation: string): LiveConfigIssue {
  return { path, message, remediation };
}

function isLoopbackHost(host: string): boolean {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parsePathList(value: unknown, baseDir: string): string[] {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(values.map((entry) => normalizePath(String(entry), baseDir)).filter(Boolean)));
}

function normalizeOptionalPath(value: unknown, baseDir: string): string | undefined {
  const text = String(value || '').trim();
  return text ? normalizePath(text, baseDir) : undefined;
}

function normalizePath(value: string, baseDir: string): string {
  const text = value.trim();
  if (!text) return '';
  return resolve(baseDir, text);
}

function objectValue(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function hasEnv(env: Record<string, string | undefined>, key: string): boolean {
  return env[key] !== undefined;
}

function hasOwn(value: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
