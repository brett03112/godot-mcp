/**
 * Input Validation Middleware (Tier 2 — Phase 2A)
 *
 * Centralized parameter validation for tool handlers.
 * Reduces boilerplate by providing declarative validation rules
 * that return consistent error responses.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { ToolResponse } from '../types.js';

// ─── Validation Rule Types ──────────────────────────────────────────────────

export type ValidatorType =
  | 'required'
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'array'
  | 'range'
  | 'path_exists'
  | 'file_exists'
  | 'project_path';

export interface ValidationRule {
  /** The parameter name (camelCase) */
  field: string;
  /** Validator type */
  type: ValidatorType;
  /** Human-readable field name for error messages (defaults to field) */
  label?: string;
  /** Whether this field is required (default: true for 'required' type, false otherwise) */
  required?: boolean;
  /** Valid enum values (for 'enum' type) */
  values?: string[];
  /** Min value (for 'range' type) */
  min?: number;
  /** Max value (for 'range' type) */
  max?: number;
  /** Base path to join with the field value (for 'file_exists') */
  basePath?: string;
  /** The field name holding the base path (for 'file_exists', e.g., 'projectPath') */
  basePathField?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: ToolResponse;
}

// ─── Core Validator ─────────────────────────────────────────────────────────

/**
 * Validate parameters against a set of rules.
 * Returns { valid: true } on success, or { valid: false, error: ToolResponse } on failure.
 */
export function validateParams(
  args: any,
  rules: ValidationRule[],
  createErrorResponse: (message: string, solutions?: string[]) => ToolResponse
): ValidationResult {
  for (const rule of rules) {
    const value = args[rule.field];
    const label = rule.label || rule.field;

    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          return {
            valid: false,
            error: createErrorResponse(`Missing required parameter: ${label}`),
          };
        }
        break;

      case 'string':
        if (rule.required !== false && (value === undefined || value === null || value === '')) {
          return {
            valid: false,
            error: createErrorResponse(`Missing required parameter: ${label}`),
          };
        }
        if (value !== undefined && value !== null && typeof value !== 'string') {
          return {
            valid: false,
            error: createErrorResponse(`Parameter '${label}' must be a string`),
          };
        }
        break;

      case 'number':
        if (rule.required !== false && (value === undefined || value === null)) {
          return {
            valid: false,
            error: createErrorResponse(`Missing required parameter: ${label}`),
          };
        }
        if (value !== undefined && value !== null && typeof value !== 'number') {
          return {
            valid: false,
            error: createErrorResponse(`Parameter '${label}' must be a number`),
          };
        }
        break;

      case 'boolean':
        if (value !== undefined && value !== null && typeof value !== 'boolean') {
          return {
            valid: false,
            error: createErrorResponse(`Parameter '${label}' must be a boolean`),
          };
        }
        break;

      case 'enum':
        if (rule.required !== false && (value === undefined || value === null || value === '')) {
          return {
            valid: false,
            error: createErrorResponse(`Missing required parameter: ${label}`),
          };
        }
        if (value !== undefined && value !== null && rule.values && !rule.values.includes(value)) {
          return {
            valid: false,
            error: createErrorResponse(
              `Invalid value for '${label}': '${value}'. Must be one of: ${rule.values.join(', ')}`
            ),
          };
        }
        break;

      case 'array':
        if (rule.required !== false && (value === undefined || value === null)) {
          return {
            valid: false,
            error: createErrorResponse(`Missing required parameter: ${label}`),
          };
        }
        if (value !== undefined && value !== null && !Array.isArray(value)) {
          return {
            valid: false,
            error: createErrorResponse(`Parameter '${label}' must be an array`),
          };
        }
        break;

      case 'range':
        if (rule.required !== false && (value === undefined || value === null)) {
          return {
            valid: false,
            error: createErrorResponse(`Missing required parameter: ${label}`),
          };
        }
        if (value !== undefined && value !== null) {
          if (typeof value !== 'number') {
            return {
              valid: false,
              error: createErrorResponse(`Parameter '${label}' must be a number`),
            };
          }
          if (rule.min !== undefined && value < rule.min) {
            return {
              valid: false,
              error: createErrorResponse(`Parameter '${label}' must be >= ${rule.min}`),
            };
          }
          if (rule.max !== undefined && value > rule.max) {
            return {
              valid: false,
              error: createErrorResponse(`Parameter '${label}' must be <= ${rule.max}`),
            };
          }
        }
        break;

      case 'path_exists':
        if (rule.required !== false && (value === undefined || value === null || value === '')) {
          return {
            valid: false,
            error: createErrorResponse(`Missing required parameter: ${label}`),
          };
        }
        if (value && !existsSync(value)) {
          return {
            valid: false,
            error: createErrorResponse(
              `Path not found: ${value}`,
              ['Check the path exists', 'Verify the path is absolute']
            ),
          };
        }
        break;

      case 'file_exists': {
        if (rule.required !== false && (value === undefined || value === null || value === '')) {
          return {
            valid: false,
            error: createErrorResponse(`Missing required parameter: ${label}`),
          };
        }
        if (value) {
          const basePath = rule.basePathField ? args[rule.basePathField] : rule.basePath;
          const fullPath = basePath ? join(basePath, value) : value;
          if (!existsSync(fullPath)) {
            return {
              valid: false,
              error: createErrorResponse(
                `File not found: ${value}`,
                ['Check the file path is correct', 'Verify the file exists in the project']
              ),
            };
          }
        }
        break;
      }

      case 'project_path':
        if (value === undefined || value === null || value === '') {
          return {
            valid: false,
            error: createErrorResponse('Missing required parameter: project_path'),
          };
        }
        if (!existsSync(value)) {
          return {
            valid: false,
            error: createErrorResponse(
              `Project directory not found: ${value}`,
              ['Check the project path exists']
            ),
          };
        }
        if (!existsSync(join(value, 'project.godot'))) {
          return {
            valid: false,
            error: createErrorResponse(
              `No project.godot found in: ${value}`,
              ['Verify this is a Godot project directory', 'Check the path points to the project root']
            ),
          };
        }
        break;
    }
  }

  return { valid: true };
}

// ─── Convenience Rule Builders ──────────────────────────────────────────────

/** Require a valid Godot project path */
export function projectPath(field: string = 'projectPath'): ValidationRule {
  return { field, type: 'project_path' };
}

/** Require a string parameter */
export function requiredString(field: string, label?: string): ValidationRule {
  return { field, type: 'string', label };
}

/** Optional string parameter */
export function optionalString(field: string, label?: string): ValidationRule {
  return { field, type: 'string', label, required: false };
}

/** Require an enum parameter */
export function requiredEnum(field: string, values: string[], label?: string): ValidationRule {
  return { field, type: 'enum', values, label };
}

/** Optional enum parameter */
export function optionalEnum(field: string, values: string[], label?: string): ValidationRule {
  return { field, type: 'enum', values, label, required: false };
}

/** Optional number with range */
export function optionalRange(field: string, min?: number, max?: number, label?: string): ValidationRule {
  return { field, type: 'range', min, max, label, required: false };
}

/** Required number */
export function requiredNumber(field: string, label?: string): ValidationRule {
  return { field, type: 'number', label };
}

/** Optional number */
export function optionalNumber(field: string, label?: string): ValidationRule {
  return { field, type: 'number', label, required: false };
}

/** Require a file exists relative to a base path field */
export function fileExists(field: string, basePathField: string, label?: string): ValidationRule {
  return { field, type: 'file_exists', basePathField, label };
}
