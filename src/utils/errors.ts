/**
 * Structured Error Taxonomy (Tier 3 — Phase 1A)
 *
 * Defines error categories and structured error types for consistent
 * error reporting across all tools. Backward-compatible with the
 * existing string-based createErrorResponse.
 */

import { ToolResponse } from '../types.js';

// ─── Error Categories ───────────────────────────────────────────────────────

export enum ErrorCategory {
  /** Bad input parameters */
  VALIDATION = 'validation',
  /** Errors during tool execution */
  RUNTIME = 'runtime',
  /** Missing files or resources */
  FILE_NOT_FOUND = 'file_not_found',
  /** Godot child process failures */
  GODOT_PROCESS = 'godot_process',
  /** Operation exceeded time limit */
  TIMEOUT = 'timeout',
  /** Failed to parse GDScript, TSCN, JSON, etc. */
  PARSE_ERROR = 'parse_error',
  /** HTTP/API errors (asset library, external services) */
  NETWORK = 'network',
}

// ─── Structured Error Interface ─────────────────────────────────────────────

export interface StructuredError {
  category: ErrorCategory;
  code: string;
  message: string;
  details?: Record<string, any>;
  solutions?: string[];
}

// ─── Error Codes ────────────────────────────────────────────────────────────

export const ErrorCodes = {
  // Validation
  MISSING_PARAM: 'VALIDATION_MISSING_PARAM',
  INVALID_PARAM: 'VALIDATION_INVALID_PARAM',
  INVALID_PATH: 'VALIDATION_INVALID_PATH',
  INVALID_PROJECT: 'VALIDATION_INVALID_PROJECT',

  // File system
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  DIR_NOT_FOUND: 'DIR_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',

  // Godot process
  GODOT_NOT_FOUND: 'GODOT_NOT_FOUND',
  GODOT_CRASH: 'GODOT_CRASH',
  GODOT_EXIT_ERROR: 'GODOT_EXIT_ERROR',

  // Timeout
  OPERATION_TIMEOUT: 'TIMEOUT_OPERATION',
  PROCESS_TIMEOUT: 'TIMEOUT_PROCESS',

  // Parse
  TSCN_PARSE_ERROR: 'PARSE_TSCN',
  GDSCRIPT_PARSE_ERROR: 'PARSE_GDSCRIPT',
  JSON_PARSE_ERROR: 'PARSE_JSON',

  // Network
  HTTP_ERROR: 'NETWORK_HTTP',
  API_ERROR: 'NETWORK_API',
  CONNECTION_ERROR: 'NETWORK_CONNECTION',

  // Runtime
  OPERATION_FAILED: 'RUNTIME_OPERATION_FAILED',
  UNEXPECTED_ERROR: 'RUNTIME_UNEXPECTED',
} as const;

// ─── Factory Functions ──────────────────────────────────────────────────────

/**
 * Create a structured error object
 */
export function createStructuredError(
  category: ErrorCategory,
  code: string,
  message: string,
  solutions?: string[],
  details?: Record<string, any>,
): StructuredError {
  return { category, code, message, solutions, details };
}

/**
 * Convert a structured error to a ToolResponse.
 * Compatible with the existing createErrorResponse pattern.
 */
export function structuredErrorToResponse(error: StructuredError): ToolResponse {
  const content: Array<{ type: string; text: string }> = [
    {
      type: 'text',
      text: JSON.stringify({
        error: true,
        category: error.category,
        code: error.code,
        message: error.message,
        details: error.details,
      }, null, 2),
    },
  ];

  if (error.solutions && error.solutions.length > 0) {
    content.push({
      type: 'text',
      text: `Possible solutions:\n${error.solutions.map(s => `  - ${s}`).join('\n')}`,
    });
  }

  return { content, isError: true };
}

/**
 * Create a timeout error
 */
export function createTimeoutError(toolName: string, timeoutMs: number): StructuredError {
  return createStructuredError(
    ErrorCategory.TIMEOUT,
    ErrorCodes.OPERATION_TIMEOUT,
    `Tool '${toolName}' timed out after ${timeoutMs}ms`,
    ['Try again with a shorter operation', 'Check if Godot is responsive'],
    { toolName, timeoutMs },
  );
}
