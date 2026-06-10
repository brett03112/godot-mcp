/**
 * Shared type definitions for the Godot MCP server
 */

/**
 * Interface representing a running Godot process
 */
export interface GodotProcess {
  process: any;
  output: string[];
  errors: string[];
}

/**
 * Interface for server configuration
 */
export interface GodotServerConfig {
  godotPath?: string;
  debugMode?: boolean;
  godotDebugMode?: boolean;
  strictPathValidation?: boolean;
}

/**
 * Interface for operation parameters (key-value pairs passed to GDScript)
 */
export interface OperationParams {
  [key: string]: any;
}

/**
 * Standardized tool response returned by all tool handlers
 */
export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Schema definition for a tool's input parameters (JSON Schema subset)
 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
}

export type ToolRisk = 'low' | 'medium' | 'high';

export interface ToolMetadata {
  toolset: string;
  aliases?: string[];
  risk: ToolRisk;
  mutates: boolean;
  requires_live: boolean;
  requires_display: boolean;
  requires_godot_version?: string;
  deprecated?: boolean;
  alias_for?: string;
  deprecation_message?: string;
}

/**
 * Complete definition of an MCP tool
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (args: any) => Promise<ToolResponse>;
  /** Optional timeout in milliseconds (default: 30000). Set higher for long-running tools. */
  timeout?: number;
  /** Optional Phase 5.0 profile metadata. If omitted, the registry infers a first-pass value. */
  metadata?: ToolMetadata;
}

/**
 * Parsed error from Godot output
 */
export interface ParsedGodotError {
  type: string;
  message: string;
  file?: string;
  line?: number;
  function?: string;
  raw_line: string;
  possible_solutions: string[];
}

/**
 * Result of executing a Godot operation
 */
export interface OperationResult {
  stdout: string;
  stderr: string;
}

/**
 * Interface for the server context passed to tool modules
 * Provides access to shared server functionality without coupling to the GodotServer class
 */
export interface ServerContext {
  /** Log a debug message (only outputs when DEBUG=true) */
  logDebug: (message: string) => void;
  /** Create a standardized error response */
  createErrorResponse: (message: string, possibleSolutions?: string[]) => ToolResponse;
  /** Validate a path to prevent traversal attacks */
  validatePath: (path: string) => boolean;
  /** Execute a Godot operation via godot_operations.gd */
  executeOperation: (operation: string, params: OperationParams, projectPath: string) => Promise<OperationResult>;
  /** Validate GDScript through the server's script validation path */
  validateScript?: (params: { projectPath: string; scriptPath: string; scriptContent?: string }) => Promise<ToolResponse>;
  /** Normalize parameters to camelCase format */
  normalizeParameters: (params: OperationParams) => OperationParams;
  /** Convert camelCase keys to snake_case */
  convertCamelToSnakeCase: (params: OperationParams) => OperationParams;
  /** Parse Godot error messages to extract structured information */
  parseGodotErrors: (errorLines: string[]) => ParsedGodotError[];
  /** Format a value for .tres file format */
  formatTresValue: (value: any) => string;
  /** Generate a UID for Godot resources */
  generateUID: () => string;
  /** Generate a short UID hash */
  generateShortUID: () => string;
  /** Check if a Godot version is 4.4 or later */
  isGodot44OrLater: (version: string) => boolean;
  /** Detect and return the Godot executable path */
  getGodotPath: () => Promise<string>;
  /** Format a value for project.godot file format */
  formatProjectSettingValue: (value: any) => string;
  /** Escape a value for CSV format */
  escapeCsvValue: (value: string) => string;
  /** Parse a CSV line handling quoted values */
  parseCsvLine: (line: string) => string[];
  /** Escape a string for PO format */
  escapePoString: (value: string) => string;
  /** Escape special regex characters */
  escapeRegex: (value: string) => string;
  /** Extract placeholders from a string */
  extractPlaceholders: (text: string) => string[];
  /** Get or parse a TSCN file using the scene cache (mtime-based invalidation) */
  getOrParseTscn: (filePath: string) => import('./utils/tscn-parser.js').TscnFile;
  /** Invalidate a cached TSCN file (call after write operations) */
  invalidateTscnCache: (filePath: string) => void;
}
