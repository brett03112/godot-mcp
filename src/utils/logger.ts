/**
 * Operation Logger (Tier 3 — Phase 1B)
 *
 * Records tool invocations with parameters, duration, and status.
 * Integrated into the ToolRegistry dispatch for automatic logging
 * of all registered tools.
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { ErrorCategory } from './errors.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OperationLogEntry {
  timestamp: string;
  toolName: string;
  parameters: Record<string, any>;
  duration_ms: number;
  status: 'success' | 'error';
  errorCategory?: ErrorCategory;
  errorMessage?: string;
}

// ─── Parameter Sanitizer ────────────────────────────────────────────────────

/** Keys whose values should be redacted in logs */
const SENSITIVE_KEYS = new Set([
  'password', 'secret', 'token', 'key', 'apiKey', 'api_key',
  'credentials', 'auth', 'authorization',
]);

/**
 * Sanitize parameters for logging — redact sensitive values, truncate long strings
 */
function sanitizeParams(params: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.substring(0, 200) + `... (${value.length} chars)`;
    } else if (Array.isArray(value) && value.length > 10) {
      sanitized[key] = `[Array(${value.length})]`;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ─── Operation Logger ───────────────────────────────────────────────────────

export class OperationLogger {
  private logDir: string;
  private logFile: string;
  private sessionId: string;
  private entries: OperationLogEntry[] = [];
  private pendingOps: Map<string, { toolName: string; params: Record<string, any>; startTime: number }> = new Map();
  private opCounter = 0;

  constructor(logDir?: string) {
    this.sessionId = `session_${Date.now()}`;
    this.logDir = logDir || join(process.cwd(), '.mcp_logs');
    this.logFile = join(this.logDir, `${this.sessionId}.log`);
  }

  /**
   * Begin tracking a tool invocation. Returns an operation ID.
   */
  logStart(toolName: string, params: Record<string, any>): string {
    const opId = `op_${++this.opCounter}`;
    this.pendingOps.set(opId, {
      toolName,
      params: sanitizeParams(params || {}),
      startTime: Date.now(),
    });
    return opId;
  }

  /**
   * Complete tracking of a tool invocation.
   */
  logEnd(operationId: string, status: 'success' | 'error', errorInfo?: { category?: ErrorCategory; message?: string }): void {
    const pending = this.pendingOps.get(operationId);
    if (!pending) return;

    this.pendingOps.delete(operationId);

    const entry: OperationLogEntry = {
      timestamp: new Date().toISOString(),
      toolName: pending.toolName,
      parameters: pending.params,
      duration_ms: Date.now() - pending.startTime,
      status,
      errorCategory: errorInfo?.category,
      errorMessage: errorInfo?.message,
    };

    this.entries.push(entry);
    this.writeToDisk(entry);
  }

  /**
   * Get all logged entries for this session.
   */
  getSessionLog(): OperationLogEntry[] {
    return [...this.entries];
  }

  /**
   * Append a log entry to the session log file.
   */
  private writeToDisk(entry: OperationLogEntry): void {
    try {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      const line = JSON.stringify(entry) + '\n';
      appendFileSync(this.logFile, line, 'utf-8');
    } catch {
      // Best-effort logging — don't break tool execution
    }
  }
}
