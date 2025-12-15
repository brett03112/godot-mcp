#!/usr/bin/env node
/**
 * Godot MCP Server
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */

import { fileURLToPath } from 'url';
import { join, dirname, basename, normalize } from 'path';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';
const GODOT_DEBUG_MODE: boolean = true; // Always use GODOT DEBUG MODE

const execAsync = promisify(exec);

// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Interface representing a running Godot process
 */
interface GodotProcess {
  process: any;
  output: string[];
  errors: string[];
}

/**
 * Interface for server configuration
 */
interface GodotServerConfig {
  godotPath?: string;
  debugMode?: boolean;
  godotDebugMode?: boolean;
  strictPathValidation?: boolean; // New option to control path validation behavior
}

/**
 * Interface for operation parameters
 */
interface OperationParams {
  [key: string]: any;
}

/**
 * Main server class for the Godot MCP server
 */
class GodotServer {
  private server: Server;
  private activeProcess: GodotProcess | null = null;
  private godotPath: string | null = null;
  private operationsScriptPath: string;
  private validatedPaths: Map<string, boolean> = new Map();
  private strictPathValidation: boolean = false;

  /**
   * Parameter name mappings between snake_case and camelCase
   * This allows the server to accept both formats
   */
  private parameterMappings: Record<string, string> = {
    'project_path': 'projectPath',
    'scene_path': 'scenePath',
    'root_node_type': 'rootNodeType',
    'parent_node_path': 'parentNodePath',
    'node_type': 'nodeType',
    'node_name': 'nodeName',
    'texture_path': 'texturePath',
    'node_path': 'nodePath',
    'output_path': 'outputPath',
    'mesh_item_names': 'meshItemNames',
    'new_path': 'newPath',
    'file_path': 'filePath',
    'directory': 'directory',
    'recursive': 'recursive',
    'scene': 'scene',
  };

  /**
   * Reverse mapping from camelCase to snake_case
   * Generated from parameterMappings for quick lookups
   */
  private reverseParameterMappings: Record<string, string> = {};

  constructor(config?: GodotServerConfig) {
    // Initialize reverse parameter mappings
    for (const [snakeCase, camelCase] of Object.entries(this.parameterMappings)) {
      this.reverseParameterMappings[camelCase] = snakeCase;
    }
    // Apply configuration if provided
    let debugMode = DEBUG_MODE;
    let godotDebugMode = GODOT_DEBUG_MODE;

    if (config) {
      if (config.debugMode !== undefined) {
        debugMode = config.debugMode;
      }
      if (config.godotDebugMode !== undefined) {
        godotDebugMode = config.godotDebugMode;
      }
      if (config.strictPathValidation !== undefined) {
        this.strictPathValidation = config.strictPathValidation;
      }

      // Store and validate custom Godot path if provided
      if (config.godotPath) {
        const normalizedPath = normalize(config.godotPath);
        this.godotPath = normalizedPath;
        this.logDebug(`Custom Godot path provided: ${this.godotPath}`);

        // Validate immediately with sync check
        if (!this.isValidGodotPathSync(this.godotPath)) {
          console.warn(`[SERVER] Invalid custom Godot path provided: ${this.godotPath}`);
          this.godotPath = null; // Reset to trigger auto-detection later
        }
      }
    }

    // Set the path to the operations script
    this.operationsScriptPath = join(__dirname, 'scripts', 'godot_operations.gd');
    if (debugMode) console.debug(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);

    // Initialize the MCP server
    this.server = new Server(
      {
        name: 'godot-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up tool handlers
    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);

    // Cleanup on exit
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Log debug messages if debug mode is enabled
   */
  private logDebug(message: string): void {
    if (DEBUG_MODE) {
      console.debug(`[DEBUG] ${message}`);
    }
  }

  /**
   * Create a standardized error response with possible solutions
   */
  private createErrorResponse(message: string, possibleSolutions: string[] = []): any {
    // Log the error
    console.error(`[SERVER] Error response: ${message}`);
    if (possibleSolutions.length > 0) {
      console.error(`[SERVER] Possible solutions: ${possibleSolutions.join(', ')}`);
    }

    const response: any = {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };

    if (possibleSolutions.length > 0) {
      response.content.push({
        type: 'text',
        text: 'Possible solutions:\n- ' + possibleSolutions.join('\n- '),
      });
    }

    return response;
  }

  /**
   * Validate a path to prevent path traversal attacks
   */
  private validatePath(path: string): boolean {
    // Basic validation to prevent path traversal
    if (!path || path.includes('..')) {
      return false;
    }

    // Add more validation as needed
    return true;
  }

  /**
   * Synchronous validation for constructor use
   * This is a quick check that only verifies file existence, not executable validity
   * Full validation will be performed later in detectGodotPath
   * @param path Path to check
   * @returns True if the path exists or is 'godot' (which might be in PATH)
   */
  private isValidGodotPathSync(path: string): boolean {
    try {
      this.logDebug(`Quick-validating Godot path: ${path}`);
      return path === 'godot' || existsSync(path);
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      return false;
    }
  }

  /**
   * Validate if a Godot path is valid and executable
   */
  private async isValidGodotPath(path: string): Promise<boolean> {
    // Check cache first
    if (this.validatedPaths.has(path)) {
      return this.validatedPaths.get(path)!;
    }

    try {
      this.logDebug(`Validating Godot path: ${path}`);

      // Check if the file exists (skip for 'godot' which might be in PATH)
      if (path !== 'godot' && !existsSync(path)) {
        this.logDebug(`Path does not exist: ${path}`);
        this.validatedPaths.set(path, false);
        return false;
      }

      // Try to execute Godot with --version flag
      const command = path === 'godot' ? 'godot --version' : `"${path}" --version`;
      await execAsync(command);

      this.logDebug(`Valid Godot path: ${path}`);
      this.validatedPaths.set(path, true);
      return true;
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      this.validatedPaths.set(path, false);
      return false;
    }
  }

  /**
   * Detect the Godot executable path based on the operating system
   */
  private async detectGodotPath() {
    // If godotPath is already set and valid, use it
    if (this.godotPath && await this.isValidGodotPath(this.godotPath)) {
      this.logDebug(`Using existing Godot path: ${this.godotPath}`);
      return;
    }

    // Check environment variable next
    if (process.env.GODOT_PATH) {
      const normalizedPath = normalize(process.env.GODOT_PATH);
      this.logDebug(`Checking GODOT_PATH environment variable: ${normalizedPath}`);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Using Godot path from environment: ${this.godotPath}`);
        return;
      } else {
        this.logDebug(`GODOT_PATH environment variable is invalid`);
      }
    }

    // Auto-detect based on platform
    const osPlatform = process.platform;
    this.logDebug(`Auto-detecting Godot path for platform: ${osPlatform}`);

    const possiblePaths: string[] = [
      'godot', // Check if 'godot' is in PATH first
    ];

    // Add platform-specific paths
    if (osPlatform === 'darwin') {
      possiblePaths.push(
        '/Applications/Godot.app/Contents/MacOS/Godot',
        '/Applications/Godot_4.app/Contents/MacOS/Godot',
        `${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`
      );
    } else if (osPlatform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\Godot\\Godot.exe',
        'C:\\Program Files (x86)\\Godot\\Godot.exe',
        'C:\\Program Files\\Godot_4\\Godot.exe',
        'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
        `${process.env.USERPROFILE}\\Godot\\Godot.exe`
      );
    } else if (osPlatform === 'linux') {
      possiblePaths.push(
        '/usr/bin/godot',
        '/usr/local/bin/godot',
        '/snap/bin/godot',
        `${process.env.HOME}/.local/bin/godot`
      );
    }

    // Try each possible path
    for (const path of possiblePaths) {
      const normalizedPath = normalize(path);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Found Godot at: ${normalizedPath}`);
        return;
      }
    }

    // If we get here, we couldn't find Godot
    this.logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
    console.warn(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
    console.warn(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);

    if (this.strictPathValidation) {
      // In strict mode, throw an error
      throw new Error(`Could not find a valid Godot executable. Set GODOT_PATH or provide a valid path in config.`);
    } else {
      // Fallback to a default path in non-strict mode; this may not be valid and requires user configuration for reliability
      if (osPlatform === 'win32') {
        this.godotPath = normalize('C:\\Program Files\\Godot\\Godot.exe');
      } else if (osPlatform === 'darwin') {
        this.godotPath = normalize('/Applications/Godot.app/Contents/MacOS/Godot');
      } else {
        this.godotPath = normalize('/usr/bin/godot');
      }

      this.logDebug(`Using default path: ${this.godotPath}, but this may not work.`);
      console.warn(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
      console.warn(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
    }
  }

  /**
   * Set a custom Godot path
   * @param customPath Path to the Godot executable
   * @returns True if the path is valid and was set, false otherwise
   */
  public async setGodotPath(customPath: string): Promise<boolean> {
    if (!customPath) {
      return false;
    }

    // Normalize the path to ensure consistent format across platforms
    // (e.g., backslashes to forward slashes on Windows, resolving relative paths)
    const normalizedPath = normalize(customPath);
    if (await this.isValidGodotPath(normalizedPath)) {
      this.godotPath = normalizedPath;
      this.logDebug(`Godot path set to: ${normalizedPath}`);
      return true;
    }

    this.logDebug(`Failed to set invalid Godot path: ${normalizedPath}`);
    return false;
  }

  /**
   * Clean up resources when shutting down
   */
  private async cleanup() {
    this.logDebug('Cleaning up resources');
    if (this.activeProcess) {
      this.logDebug('Killing active Godot process');
      this.activeProcess.process.kill();
      this.activeProcess = null;
    }
    await this.server.close();
  }

  /**
   * Check if the Godot version is 4.4 or later
   * @param version The Godot version string
   * @returns True if the version is 4.4 or later
   */
  private isGodot44OrLater(version: string): boolean {
    const match = version.match(/^(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      return major > 4 || (major === 4 && minor >= 4);
    }
    return false;
  }

  /**
   * Normalize parameters to camelCase format
   * @param params Object with either snake_case or camelCase keys
   * @returns Object with all keys in camelCase format
   */
  private normalizeParameters(params: OperationParams): OperationParams {
    if (!params || typeof params !== 'object') {
      return params;
    }
    
    const result: OperationParams = {};
    
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        let normalizedKey = key;
        
        // If the key is in snake_case, convert it to camelCase using our mapping
        if (key.includes('_') && this.parameterMappings[key]) {
          normalizedKey = this.parameterMappings[key];
        }
        
        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[normalizedKey] = this.normalizeParameters(params[key] as OperationParams);
        } else {
          result[normalizedKey] = params[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Convert camelCase keys to snake_case
   * @param params Object with camelCase keys
   * @returns Object with snake_case keys
   */
  private convertCamelToSnakeCase(params: OperationParams): OperationParams {
    const result: OperationParams = {};
    
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        // Convert camelCase to snake_case
        const snakeKey = this.reverseParameterMappings[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        
        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[snakeKey] = this.convertCamelToSnakeCase(params[key] as OperationParams);
        } else {
          result[snakeKey] = params[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Execute a Godot operation using the operations script
   * @param operation The operation to execute
   * @param params The parameters for the operation
   * @param projectPath The path to the Godot project
   * @returns The stdout and stderr from the operation
   */
  private async executeOperation(
    operation: string,
    params: OperationParams,
    projectPath: string
  ): Promise<{ stdout: string; stderr: string }> {
    this.logDebug(`Executing operation: ${operation} in project: ${projectPath}`);
    this.logDebug(`Original operation params: ${JSON.stringify(params)}`);

    // Convert camelCase parameters to snake_case for Godot script
    const snakeCaseParams = this.convertCamelToSnakeCase(params);
    this.logDebug(`Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);


    // Ensure godotPath is set
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        throw new Error('Could not find a valid Godot executable path');
      }
    }

    try {
      // Serialize the snake_case parameters to a valid JSON string
      const paramsJson = JSON.stringify(snakeCaseParams);
      // Escape single quotes in the JSON string to prevent command injection
      const escapedParams = paramsJson.replace(/'/g, "'\\''");
      // On Windows, cmd.exe does not strip single quotes, so we use
      // double quotes and escape them to ensure the JSON is parsed
      // correctly by Godot.
      const isWindows = process.platform === 'win32';
      const quotedParams = isWindows
        ? `\"${paramsJson.replace(/\"/g, '\\"')}\"`
        : `'${escapedParams}'`;


      // Add debug arguments if debug mode is enabled
      const debugArgs = GODOT_DEBUG_MODE ? ['--debug-godot'] : [];

      // Construct the command with the operation and JSON parameters
      const cmd = [
        `"${this.godotPath}"`,
        '--headless',
        '--path',
        `"${projectPath}"`,
        '--script',
        `"${this.operationsScriptPath}"`,
        operation,
        quotedParams, // Pass the JSON string as a single argument
        ...debugArgs,
      ].join(' ');

      this.logDebug(`Command: ${cmd}`);

      const { stdout, stderr } = await execAsync(cmd);

      return { stdout, stderr };
    } catch (error: unknown) {
      // If execAsync throws, it still contains stdout/stderr
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string };
        return {
          stdout: execError.stdout,
          stderr: execError.stderr,
        };
      }

      throw error;
    }
  }

  /**
   * Get the structure of a Godot project
   * @param projectPath Path to the Godot project
   * @returns Object representing the project structure
   */
  private async getProjectStructure(projectPath: string): Promise<any> {
    try {
      // Get top-level directories in the project
      const entries = readdirSync(projectPath, { withFileTypes: true });

      const structure: any = {
        scenes: [],
        scripts: [],
        assets: [],
        other: [],
      };

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirName = entry.name.toLowerCase();

          // Skip hidden directories
          if (dirName.startsWith('.')) {
            continue;
          }

          // Count files in common directories
          if (dirName === 'scenes' || dirName.includes('scene')) {
            structure.scenes.push(entry.name);
          } else if (dirName === 'scripts' || dirName.includes('script')) {
            structure.scripts.push(entry.name);
          } else if (
            dirName === 'assets' ||
            dirName === 'textures' ||
            dirName === 'models' ||
            dirName === 'sounds' ||
            dirName === 'music'
          ) {
            structure.assets.push(entry.name);
          } else {
            structure.other.push(entry.name);
          }
        }
      }

      return structure;
    } catch (error) {
      this.logDebug(`Error getting project structure: ${error}`);
      return { error: 'Failed to get project structure' };
    }
  }

  /**
   * Find Godot projects in a directory
   * @param directory Directory to search
   * @param recursive Whether to search recursively
   * @returns Array of Godot projects
   */
  private findGodotProjects(directory: string, recursive: boolean): Array<{ path: string; name: string }> {
    const projects: Array<{ path: string; name: string }> = [];

    try {
      // Check if the directory itself is a Godot project
      const projectFile = join(directory, 'project.godot');
      if (existsSync(projectFile)) {
        projects.push({
          path: directory,
          name: basename(directory),
        });
      }

      // If not recursive, only check immediate subdirectories
      if (!recursive) {
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = join(directory, entry.name);
            const projectFile = join(subdir, 'project.godot');
            if (existsSync(projectFile)) {
              projects.push({
                path: subdir,
                name: entry.name,
              });
            }
          }
        }
      } else {
        // Recursive search
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = join(directory, entry.name);
            // Skip hidden directories
            if (entry.name.startsWith('.')) {
              continue;
            }
            // Check if this directory is a Godot project
            const projectFile = join(subdir, 'project.godot');
            if (existsSync(projectFile)) {
              projects.push({
                path: subdir,
                name: entry.name,
              });
            } else {
              // Recursively search this directory
              const subProjects = this.findGodotProjects(subdir, true);
              projects.push(...subProjects);
            }
          }
        }
      }
    } catch (error) {
      this.logDebug(`Error searching directory ${directory}: ${error}`);
    }

    return projects;
  }

  /**
   * Set up the tool handlers for the MCP server
   */
  private setupToolHandlers() {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'launch_editor',
          description: 'Launch Godot editor for a specific project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'run_project',
          description: 'Run the Godot project and capture output',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scene: {
                type: 'string',
                description: 'Optional: Specific scene to run',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'get_debug_output',
          description: 'Get the current debug output and errors',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'stop_project',
          description: 'Stop the currently running Godot project',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_godot_version',
          description: 'Get the installed Godot version',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'list_projects',
          description: 'List Godot projects in a directory',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'Directory to search for Godot projects',
              },
              recursive: {
                type: 'boolean',
                description: 'Whether to search recursively (default: false)',
              },
            },
            required: ['directory'],
          },
        },
        {
          name: 'get_project_info',
          description: 'Retrieve metadata about a Godot project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'create_scene',
          description: 'Create a new Godot scene file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path where the scene file will be saved (relative to project)',
              },
              rootNodeType: {
                type: 'string',
                description: 'Type of the root node (e.g., Node2D, Node3D)',
                default: 'Node2D',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'add_node',
          description: 'Add a node to an existing scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node (e.g., "root" or "root/Player")',
                default: 'root',
              },
              nodeType: {
                type: 'string',
                description: 'Type of node to add (e.g., Sprite2D, CollisionShape2D)',
              },
              nodeName: {
                type: 'string',
                description: 'Name for the new node',
              },
              properties: {
                type: 'object',
                description: 'Optional properties to set on the node',
              },
            },
            required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
          },
        },
        {
          name: 'load_sprite',
          description: 'Load a sprite into a Sprite2D node',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the Sprite2D node (e.g., "root/Player/Sprite2D")',
              },
              texturePath: {
                type: 'string',
                description: 'Path to the texture file (relative to project)',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'texturePath'],
          },
        },
        {
          name: 'export_mesh_library',
          description: 'Export a scene as a MeshLibrary resource',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (.tscn) to export',
              },
              outputPath: {
                type: 'string',
                description: 'Path where the mesh library (.res) will be saved',
              },
              meshItemNames: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Optional: Names of specific mesh items to include (defaults to all)',
              },
            },
            required: ['projectPath', 'scenePath', 'outputPath'],
          },
        },
        {
          name: 'save_scene',
          description: 'Save changes to a scene file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              newPath: {
                type: 'string',
                description: 'Optional: New path to save the scene to (for creating variants)',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'get_uid',
          description: 'Get the UID for a specific file in a Godot project (for Godot 4.4+)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              filePath: {
                type: 'string',
                description: 'Path to the file (relative to project) for which to get the UID',
              },
            },
            required: ['projectPath', 'filePath'],
          },
        },
        {
          name: 'update_project_uids',
          description: 'Update UID references in a Godot project by resaving resources (for Godot 4.4+)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'list_signals',
          description: 'List all signals available on a node type or instance',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              nodeType: {
                type: 'string',
                description: 'Type of node to inspect (e.g., "Button", "Area2D")',
              },
              scenePath: {
                type: 'string',
                description: 'Optional: Path to scene file to inspect a specific node instance',
              },
              nodePath: {
                type: 'string',
                description: 'Optional: Path to specific node in scene (e.g., "root/Player")',
              },
            },
            required: ['projectPath', 'nodeType'],
          },
        },
        {
          name: 'list_connections',
          description: 'List all signal connections in a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Optional: Filter connections for a specific node path',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'connect_signal',
          description: 'Connect a signal from a source node to a target node method',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              sourceNodePath: {
                type: 'string',
                description: 'Path to the source node that emits the signal (e.g., "Button", "Player/Area2D")',
              },
              signalName: {
                type: 'string',
                description: 'Name of the signal to connect (e.g., "pressed", "body_entered")',
              },
              targetNodePath: {
                type: 'string',
                description: 'Path to the target node that receives the signal (e.g., ".", "Player")',
              },
              methodName: {
                type: 'string',
                description: 'Name of the method to call on the target node (e.g., "_on_button_pressed")',
              },
              binds: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Optional: Array of values to bind to the signal',
              },
              flags: {
                type: 'number',
                description: 'Optional: Connection flags (e.g., CONNECT_DEFERRED = 1, CONNECT_PERSIST = 2, CONNECT_ONE_SHOT = 4)',
              },
            },
            required: ['projectPath', 'scenePath', 'sourceNodePath', 'signalName', 'targetNodePath', 'methodName'],
          },
        },
        {
          name: 'disconnect_signal',
          description: 'Disconnect an existing signal connection in a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              sourceNodePath: {
                type: 'string',
                description: 'Path to the source node that emits the signal',
              },
              signalName: {
                type: 'string',
                description: 'Name of the signal to disconnect',
              },
              targetNodePath: {
                type: 'string',
                description: 'Path to the target node',
              },
              methodName: {
                type: 'string',
                description: 'Name of the method that was connected',
              },
            },
            required: ['projectPath', 'scenePath', 'sourceNodePath', 'signalName', 'targetNodePath', 'methodName'],
          },
        },
        {
          name: 'validate_connection',
          description: 'Validate if a signal connection is valid before attempting to create it. Checks if nodes exist, signal exists, and method exists (warning if not)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              sourceNodePath: {
                type: 'string',
                description: 'Path to the source node that emits the signal',
              },
              signalName: {
                type: 'string',
                description: 'Name of the signal to validate',
              },
              targetNodePath: {
                type: 'string',
                description: 'Path to the target node',
              },
              methodName: {
                type: 'string',
                description: 'Name of the method to call on the target node',
              },
            },
            required: ['projectPath', 'scenePath', 'sourceNodePath', 'signalName', 'targetNodePath', 'methodName'],
          },
        },
        {
          name: 'analyze_script',
          description: 'Parse a GDScript file and extract its complete structure including class name, functions, signals, variables, and dependencies',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the GDScript file (relative to project)',
              },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'create_script',
          description: 'Generate a complete GDScript file from a template with proper structure and boilerplate code',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path where the script should be created (relative to project)',
              },
              className: {
                type: 'string',
                description: 'Optional class_name for the script',
              },
              extends: {
                type: 'string',
                description: 'Base class to extend (e.g., Node, Node2D, CharacterBody2D)',
              },
              template: {
                type: 'string',
                description: 'Template to use: basic, state_machine, singleton, component, character_controller',
                enum: ['basic', 'state_machine', 'singleton', 'component', 'character_controller'],
              },
            },
            required: ['projectPath', 'scriptPath', 'extends', 'template'],
          },
        },
        {
          name: 'modify_function',
          description: 'Update an existing function in a GDScript file, optionally preserving or updating its signature',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the GDScript file (relative to project)',
              },
              functionName: {
                type: 'string',
                description: 'Name of the function to modify',
              },
              newBody: {
                type: 'string',
                description: 'New implementation for the function body',
              },
              newSignature: {
                type: 'string',
                description: 'Optional new function signature (e.g., "func my_func(param: int) -> void:")',
              },
            },
            required: ['projectPath', 'scriptPath', 'functionName', 'newBody'],
          },
        },
        {
          name: 'add_export_variable',
          description: 'Add an @export variable to a GDScript file for editor exposure with optional export hints',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the GDScript file (relative to project)',
              },
              variableName: {
                type: 'string',
                description: 'Name of the variable to add',
              },
              variableType: {
                type: 'string',
                description: 'Type of the variable (e.g., "int", "float", "String", "Vector2")',
              },
              defaultValue: {
                type: 'string',
                description: 'Default value for the variable (e.g., "0", "1.0", \'""\')',
              },
              exportHint: {
                type: 'string',
                description: 'Optional export hint: RANGE, FILE, DIR, ENUM, FLAGS, etc.',
              },
              hintString: {
                type: 'string',
                description: 'Optional hint string for the export hint (e.g., "0,100,1" for RANGE)',
              },
            },
            required: ['projectPath', 'scriptPath', 'variableName', 'variableType', 'defaultValue'],
          },
        },
        {
          name: 'extract_dependencies',
          description: 'Extract all dependencies from a GDScript file (preloads, loads, class references, resource paths)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the GDScript file (relative to project)',
              },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'attach_script',
          description: 'Attach a GDScript file to a node in a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the node within the scene (e.g., "." for root, "Player/Sprite" for child)',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the GDScript file to attach (relative to project)',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'scriptPath'],
          },
        },
        {
          name: 'validate_script',
          description: 'Validate a GDScript file for syntax errors without running it. Uses Godot\'s --check-only flag to parse the script and return any errors with line numbers.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the GDScript file to validate (relative to project)',
              },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'create_animation_player',
          description: 'Add an AnimationPlayer node to a scene and optionally create an initial animation.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node (e.g., "root" or "root/Player"). Default is "root".',
                default: 'root',
              },
              animationPlayerName: {
                type: 'string',
                description: 'Name for the AnimationPlayer node. Default is "AnimationPlayer".',
                default: 'AnimationPlayer',
              },
              initialAnimationName: {
                type: 'string',
                description: 'Optional: Name for an initial animation to create',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'add_animation_track',
          description: 'Add a track to an existing animation in an AnimationPlayer node. Supports position, rotation, scale, property, method call, and audio tracks.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              animationPlayerPath: {
                type: 'string',
                description: 'Path to the AnimationPlayer node (e.g., "root/AnimationPlayer")',
              },
              animationName: {
                type: 'string',
                description: 'Name of the animation to add the track to',
              },
              trackType: {
                type: 'string',
                description: 'Type of track: "position", "rotation", "scale", "property", "method", or "audio"',
                enum: ['position', 'rotation', 'scale', 'property', 'method', 'audio'],
              },
              targetNodePath: {
                type: 'string',
                description: 'Path to the node the track will affect (relative to AnimationPlayer\'s parent)',
              },
              propertyPath: {
                type: 'string',
                description: 'For property tracks: the property path (e.g., "modulate:a" for alpha). For position/rotation/scale, use "position", "rotation", or "scale".',
              },
            },
            required: ['projectPath', 'scenePath', 'animationPlayerPath', 'animationName', 'trackType', 'targetNodePath'],
          },
        },
        {
          name: 'add_keyframe',
          description: 'Add a keyframe to an animation track at a specific time. Supports easing for smooth transitions.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              animationPlayerPath: {
                type: 'string',
                description: 'Path to the AnimationPlayer node (e.g., "root/AnimationPlayer")',
              },
              animationName: {
                type: 'string',
                description: 'Name of the animation',
              },
              trackIndex: {
                type: 'number',
                description: 'Index of the track to add the keyframe to (0-based)',
              },
              time: {
                type: 'number',
                description: 'Time in seconds where the keyframe should be placed',
              },
              value: {
                description: 'Value for the keyframe (type depends on track type: number for property, Vector2/Vector3 for position, etc.)',
              },
              easing: {
                type: 'number',
                description: 'Optional: Easing value for the transition (default: 1.0 for linear). Use values like 0.5 for ease-in, 2.0 for ease-out.',
                default: 1.0,
              },
            },
            required: ['projectPath', 'scenePath', 'animationPlayerPath', 'animationName', 'trackIndex', 'time', 'value'],
          },
        },
        {
          name: 'create_shader_material',
          description: 'Create a shader material with custom shader code or from a template. Creates both .gdshader and .tres files, validates shader compilation.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              shaderPath: {
                type: 'string',
                description: 'Path where the .gdshader file should be saved (relative to project, e.g., "shaders/hologram.gdshader")',
              },
              materialPath: {
                type: 'string',
                description: 'Path where the .tres ShaderMaterial should be saved (relative to project, e.g., "materials/hologram.tres")',
              },
              shaderCode: {
                type: 'string',
                description: 'Complete shader source code including shader_type declaration. Not required if using a template.',
              },
              template: {
                type: 'string',
                enum: ['dissolve', 'outline', 'damage_flash', 'hologram'],
                description: 'Optional: Use a predefined shader template instead of custom code. Templates: "dissolve" (fade effect), "outline" (colored border), "damage_flash" (hit effect), "hologram" (scan lines)',
              },
              shaderType: {
                type: 'string',
                enum: ['canvas_item', 'spatial', 'particles'],
                description: 'Type of shader: "canvas_item" (2D), "spatial" (3D), or "particles". Auto-determined from template if not specified.',
              },
              shaderParameters: {
                type: 'object',
                description: 'Optional: Default values for shader parameters/uniforms (e.g., {"speed": 2.0, "tint_color": [1.0, 0.0, 0.0, 1.0]})',
              },
            },
            required: ['projectPath', 'shaderPath', 'materialPath'],
          },
        },
        {
          name: 'create_test_suite',
          description: 'Create a GUT (Godot Unit Test) test file with test cases. Generates a test script extending GutTest with proper test methods.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              testPath: {
                type: 'string',
                description: 'Path where the test file should be saved (relative to project, e.g., "test/unit/test_player.gd")',
              },
              targetScript: {
                type: 'string',
                description: 'Optional: Path to the script being tested (e.g., "player.gd") for reference in test file',
              },
              testCases: {
                type: 'array',
                description: 'Array of test case definitions. Each test case should have: name (string), description (optional), assertions (array of assertion calls)',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Test method name (will be prefixed with "test_" if not already)',
                    },
                    description: {
                      type: 'string',
                      description: 'Optional: Description of what the test checks',
                    },
                    setup: {
                      type: 'string',
                      description: 'Optional: Setup code to run before assertions',
                    },
                    assertions: {
                      type: 'array',
                      description: 'Array of assertion calls (e.g., ["assert_eq(1 + 1, 2)", "assert_true(player.is_alive)"])',
                      items: {
                        type: 'string',
                      },
                    },
                  },
                  required: ['name'],
                },
              },
              includeHooks: {
                type: 'boolean',
                description: 'Optional: Include before_all, after_all, before_each, after_each hook methods (default: false)',
              },
            },
            required: ['projectPath', 'testPath'],
          },
        },
        {
          name: 'run_tests',
          description: 'Execute GUT (Godot Unit Test) tests and return structured results. Runs tests in headless mode and parses output for pass/fail/error details.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              testDir: {
                type: 'string',
                description: 'Optional: Directory containing tests (relative to project, default: "test/")',
              },
              testFile: {
                type: 'string',
                description: 'Optional: Specific test file to run (relative to project, e.g., "test/unit/test_player.gd")',
              },
              verbosity: {
                type: 'number',
                description: 'Optional: Log verbosity level (0=quiet, 1=normal, 2=verbose, default: 1)',
              },
              exitOnFinish: {
                type: 'boolean',
                description: 'Optional: Exit Godot after tests complete (default: true)',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'import_texture',
          description: 'Configure texture import settings for optimal game performance. Modifies the .import file for a texture to control filtering, mipmaps, compression, and other settings.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              texturePath: {
                type: 'string',
                description: 'Path to the texture file (relative to project, e.g., "assets/player.png")',
              },
              filter: {
                type: 'string',
                enum: ['Linear', 'Nearest', 'Linear Mipmap', 'Nearest Mipmap'],
                description: 'Texture filter mode. Use "Nearest" for pixel art, "Linear" for smooth textures.',
              },
              mipmaps: {
                type: 'boolean',
                description: 'Generate mipmaps for better quality at distance (recommended for 3D textures)',
              },
              compression: {
                type: 'string',
                enum: ['Lossless', 'Lossy', 'VRAM Compressed', 'VRAM Uncompressed', 'Basis Universal'],
                description: 'Compression mode. "VRAM Compressed" for most cases, "Lossless" for pixel art.',
              },
              repeatMode: {
                type: 'string',
                enum: ['Disabled', 'Enabled', 'Mirrored'],
                description: 'Texture repeat/wrap mode for tiling textures.',
              },
              srgb: {
                type: 'string',
                enum: ['Detect', 'Enable', 'Disable'],
                description: 'sRGB color space handling. "Detect" auto-detects, "Enable" for color textures, "Disable" for data textures.',
              },
              normalMap: {
                type: 'boolean',
                description: 'Set to true if this is a normal map texture (enables special processing)',
              },
            },
            required: ['projectPath', 'texturePath'],
          },
        },
        {
          name: 'import_audio',
          description: 'Configure audio import settings for music and sound effects. Modifies the .import file for audio to control looping, BPM, and compression settings.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              audioPath: {
                type: 'string',
                description: 'Path to the audio file (relative to project, e.g., "audio/music.ogg")',
              },
              loop: {
                type: 'boolean',
                description: 'Enable looping for background music or ambient sounds',
              },
              loopMode: {
                type: 'string',
                enum: ['Disabled', 'Forward', 'Ping-Pong', 'Backward'],
                description: 'Loop mode. "Forward" for standard loops, "Ping-Pong" for back-and-forth.',
              },
              loopOffset: {
                type: 'number',
                description: 'Loop start point in seconds (useful to skip intro sections)',
              },
              bpm: {
                type: 'number',
                description: 'Beats per minute for music synchronization (rhythm games, beat matching)',
              },
              beatCount: {
                type: 'integer',
                description: 'Number of beats in the audio (for precise loop points)',
              },
              barBeats: {
                type: 'integer',
                description: 'Beats per bar (time signature numerator, e.g., 4 for 4/4 time)',
              },
            },
            required: ['projectPath', 'audioPath'],
          },
        },
        {
          name: 'import_3d_model',
          description: 'Configure 3D model import settings for GLTF, FBX, OBJ, and other 3D formats. Controls collision generation, material import, animation import, and scale.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              modelPath: {
                type: 'string',
                description: 'Path to the 3D model file (relative to project, e.g., "models/character.glb")',
              },
              generateCollision: {
                type: 'string',
                enum: ['None', 'Mesh', 'Convex', 'Multiple Convex', 'Decomposed'],
                description: 'Collision shape generation mode. "Convex" for simple shapes, "Multiple Convex" for complex objects.',
              },
              importMaterials: {
                type: 'boolean',
                description: 'Import materials embedded in the model file',
              },
              importAnimations: {
                type: 'boolean',
                description: 'Import animation tracks from the model file',
              },
              scale: {
                type: 'number',
                description: 'Scale multiplier for the imported model (e.g., 0.01 to convert from cm to m)',
              },
              generateLOD: {
                type: 'boolean',
                description: 'Generate Level of Detail (LOD) meshes for performance optimization',
              },
              rootType: {
                type: 'string',
                enum: ['Node3D', 'AnimatableBody3D', 'RigidBody3D', 'Area3D', 'CharacterBody3D', 'StaticBody3D'],
                description: 'Root node type for the imported scene',
              },
            },
            required: ['projectPath', 'modelPath'],
          },
        },
        {
          name: 'create_resource',
          description: 'Create custom Godot Resource files (.tres) programmatically. Supports Theme, Environment, Material, AudioBusLayout, and other resource types.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              resourcePath: {
                type: 'string',
                description: 'Path for the .tres file (relative to project, e.g., "resources/my_theme.tres")',
              },
              resourceType: {
                type: 'string',
                description: 'Godot resource class name (e.g., "Theme", "Environment", "StandardMaterial3D", "AudioBusLayout")',
              },
              properties: {
                type: 'object',
                description: 'Key-value pairs of resource properties to set',
                additionalProperties: true,
              },
              template: {
                type: 'string',
                enum: ['theme_dark', 'theme_light', 'environment_outdoor', 'environment_indoor', 'material_standard', 'material_unshaded'],
                description: 'Optional template to use as a starting point for the resource',
              },
            },
            required: ['projectPath', 'resourcePath', 'resourceType'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logDebug(`Handling tool request: ${request.params.name}`);
      switch (request.params.name) {
        case 'launch_editor':
          return await this.handleLaunchEditor(request.params.arguments);
        case 'run_project':
          return await this.handleRunProject(request.params.arguments);
        case 'get_debug_output':
          return await this.handleGetDebugOutput();
        case 'stop_project':
          return await this.handleStopProject();
        case 'get_godot_version':
          return await this.handleGetGodotVersion();
        case 'list_projects':
          return await this.handleListProjects(request.params.arguments);
        case 'get_project_info':
          return await this.handleGetProjectInfo(request.params.arguments);
        case 'create_scene':
          return await this.handleCreateScene(request.params.arguments);
        case 'add_node':
          return await this.handleAddNode(request.params.arguments);
        case 'load_sprite':
          return await this.handleLoadSprite(request.params.arguments);
        case 'export_mesh_library':
          return await this.handleExportMeshLibrary(request.params.arguments);
        case 'save_scene':
          return await this.handleSaveScene(request.params.arguments);
        case 'get_uid':
          return await this.handleGetUid(request.params.arguments);
        case 'update_project_uids':
          return await this.handleUpdateProjectUids(request.params.arguments);
        case 'list_signals':
          return await this.handleListSignals(request.params.arguments);
        case 'list_connections':
          return await this.handleListConnections(request.params.arguments);
        case 'connect_signal':
          return await this.handleConnectSignal(request.params.arguments);
        case 'disconnect_signal':
          return await this.handleDisconnectSignal(request.params.arguments);
        case 'validate_connection':
          return await this.handleValidateConnection(request.params.arguments);
        case 'analyze_script':
          return await this.handleAnalyzeScript(request.params.arguments);
        case 'create_script':
          return await this.handleCreateScript(request.params.arguments);
        case 'modify_function':
          return await this.handleModifyFunction(request.params.arguments);
        case 'add_export_variable':
          return await this.handleAddExportVariable(request.params.arguments);
        case 'extract_dependencies':
          return await this.handleExtractDependencies(request.params.arguments);
        case 'attach_script':
          return await this.handleAttachScript(request.params.arguments);
        case 'validate_script':
          return await this.handleValidateScript(request.params.arguments);
        case 'create_animation_player':
          return await this.handleCreateAnimationPlayer(request.params.arguments);
        case 'add_animation_track':
          return await this.handleAddAnimationTrack(request.params.arguments);
        case 'add_keyframe':
          return await this.handleAddKeyframe(request.params.arguments);
        case 'create_shader_material':
          return await this.handleCreateShaderMaterial(request.params.arguments);
        case 'create_test_suite':
          return await this.handleCreateTestSuite(request.params.arguments);
        case 'run_tests':
          return await this.handleRunTests(request.params.arguments);
        case 'import_texture':
          return await this.handleImportTexture(request.params.arguments);
        case 'import_audio':
          return await this.handleImportAudio(request.params.arguments);
        case 'import_3d_model':
          return await this.handleImport3DModel(request.params.arguments);
        case 'create_resource':
          return await this.handleCreateResource(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  /**
   * Handle the launch_editor tool
   * @param args Tool arguments
   */
  private async handleLaunchEditor(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Launching Godot editor for project: ${args.projectPath}`);
      const process = spawn(this.godotPath, ['-e', '--path', args.projectPath], {
        stdio: 'pipe',
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot editor:', err);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Godot editor launched successfully for project at ${args.projectPath}.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to launch Godot editor: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the run_project tool
   * @param args Tool arguments
   */
  private async handleRunProject(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Kill any existing process
      if (this.activeProcess) {
        this.logDebug('Killing existing Godot process before starting a new one');
        this.activeProcess.process.kill();
      }

      const cmdArgs = ['-d', '--path', args.projectPath];
      if (args.scene && this.validatePath(args.scene)) {
        this.logDebug(`Adding scene parameter: ${args.scene}`);
        cmdArgs.push(args.scene);
      }

      this.logDebug(`Running Godot project: ${args.projectPath}`);
      const process = spawn(this.godotPath!, cmdArgs, { stdio: 'pipe' });
      const output: string[] = [];
      const errors: string[] = [];

      process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        output.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stdout] ${line}`);
        });
      });

      process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        errors.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stderr] ${line}`);
        });
      });

      process.on('exit', (code: number | null) => {
        this.logDebug(`Godot process exited with code ${code}`);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot process:', err);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      this.activeProcess = { process, output, errors };

      return {
        content: [
          {
            type: 'text',
            text: `Godot project started in debug mode. Use get_debug_output to see output.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to run Godot project: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_debug_output tool
   */
  private async handleGetDebugOutput() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process.',
        [
          'Use run_project to start a Godot project first',
          'Check if the Godot process crashed unexpectedly',
        ]
      );
    }

    // Parse errors from both stderr and stdout (some errors appear in stdout)
    const allLines = [...this.activeProcess.errors, ...this.activeProcess.output];
    const parsedErrors = this.parseGodotErrors(allLines);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              output: this.activeProcess.output,
              errors: this.activeProcess.errors,
              parsed_errors: parsedErrors,
              error_count: parsedErrors.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Parse Godot error messages to extract structured information
   * Detects common error patterns and provides actionable solutions
   */
  private parseGodotErrors(errorLines: string[]): Array<{
    type: string;
    message: string;
    file?: string;
    line?: number;
    function?: string;
    raw_line: string;
    possible_solutions: string[];
  }> {
    const parsedErrors: Array<{
      type: string;
      message: string;
      file?: string;
      line?: number;
      function?: string;
      raw_line: string;
      possible_solutions: string[];
    }> = [];

    // Common Godot 4.x error patterns
    const errorPatterns = [
      // Debugger Break format: Debugger Break, Reason: 'Parser Error: <message>'
      // *Frame 0 - <file>:<line> in function '<function>'
      {
        pattern: /Debugger Break, Reason: '(?:Parser Error: )?(.+?)'/,
        framePattern: /\*Frame \d+ - (.+?):(\d+) in function '(.*)'/,
        type: 'PARSE_ERROR',
      },
      // ERROR: <message>
      //   at: <function> (<file>:<line>)
      {
        pattern: /ERROR:\s*(.+)/,
        atPattern: /at:\s*(.+?)\s*\((.+?):(\d+)\)/,
        type: 'ERROR',
      },
      // SCRIPT ERROR: <message>
      //   at: <function> (<file>:<line>)
      {
        pattern: /SCRIPT ERROR:\s*(.+)/,
        atPattern: /at:\s*(.+?)\s*\((.+?):(\d+)\)/,
        type: 'SCRIPT_ERROR',
      },
      // Parse error: <message>
      //   at: <file>:<line>
      {
        pattern: /Parse error:\s*(.+)/,
        atPattern: /at:\s*(.+?):(\d+)/,
        type: 'PARSE_ERROR',
      },
      // WARNING: <message>
      //   at: <function> (<file>:<line>)
      {
        pattern: /WARNING:\s*(.+)/,
        atPattern: /at:\s*(.+?)\s*\((.+?):(\d+)\)/,
        type: 'WARNING',
      },
      // Single-line error format: ERROR: <message> at <function> (<file>:<line>)
      {
        pattern: /ERROR:\s*(.+?)\s+at\s+(.+?)\s*\((.+?):(\d+)\)/,
        type: 'ERROR',
      },
    ];

    for (let i = 0; i < errorLines.length; i++) {
      const line = errorLines[i].trim();
      if (!line) continue;

      // Try to match error patterns
      for (const errorPattern of errorPatterns) {
        const match = line.match(errorPattern.pattern);
        if (match) {
          let errorInfo: {
            type: string;
            message: string;
            file?: string;
            line?: number;
            function?: string;
            raw_line: string;
            possible_solutions: string[];
          } = {
            type: errorPattern.type,
            message: match[1].trim(),
            raw_line: line,
            possible_solutions: [],
          };

          // Single-line format with location info in same line
          if (match.length >= 5) {
            errorInfo.function = match[2].trim();
            errorInfo.file = match[3].trim();
            errorInfo.line = parseInt(match[4]);
          }
          // Debugger Break with *Frame format
          else if (errorPattern.framePattern && i + 1 < errorLines.length) {
            const nextLine = errorLines[i + 1].trim();
            const frameMatch = nextLine.match(errorPattern.framePattern);
            if (frameMatch) {
              // Format: *Frame 0 - file:line in function 'function_name'
              errorInfo.file = frameMatch[1].trim();
              errorInfo.line = parseInt(frameMatch[2]);
              errorInfo.function = frameMatch[3].trim();
              i++; // Skip the frame line since we processed it
            }
          }
          // Multi-line format: check next line for location info
          else if (errorPattern.atPattern && i + 1 < errorLines.length) {
            const nextLine = errorLines[i + 1].trim();
            const atMatch = nextLine.match(errorPattern.atPattern);
            if (atMatch) {
              if (atMatch.length >= 4) {
                // Format: at: function (file:line)
                errorInfo.function = atMatch[1].trim();
                errorInfo.file = atMatch[2].trim();
                errorInfo.line = parseInt(atMatch[3]);
              } else if (atMatch.length === 3) {
                // Format: at: file:line
                errorInfo.file = atMatch[1].trim();
                errorInfo.line = parseInt(atMatch[2]);
              }
              i++; // Skip the "at:" line since we processed it
            }
          }

          // Add context-specific solutions based on error type and message
          errorInfo.possible_solutions = this.getSolutionsForError(errorInfo);

          parsedErrors.push(errorInfo);
          break; // Found a match, don't try other patterns for this line
        }
      }
    }

    return parsedErrors;
  }

  /**
   * Provide actionable solutions based on error type and message
   */
  private getSolutionsForError(error: {
    type: string;
    message: string;
    file?: string;
    line?: number;
  }): string[] {
    const solutions: string[] = [];
    const msg = error.message.toLowerCase();

    // Null reference errors
    if (msg.includes('null') && (msg.includes('instance') || msg.includes('reference') || msg.includes('access'))) {
      solutions.push('Check if the object is properly initialized before accessing it');
      solutions.push('Verify the node exists in the scene tree (use get_node() or $NodeName)');
      solutions.push('Add null checks before accessing properties or methods');
      if (error.file && error.line) {
        solutions.push(`Review the code at ${error.file}:${error.line} for uninitialized variables`);
      }
    }

    // Invalid get index errors
    if (msg.includes('invalid get index') || msg.includes('index out of bounds')) {
      solutions.push('Check array/dictionary bounds before accessing elements');
      solutions.push('Verify the key exists in the dictionary before accessing it');
      solutions.push('Ensure the array has elements before indexing');
    }

    // Parse errors
    if (error.type === 'PARSE_ERROR') {
      solutions.push('Check for syntax errors (missing colons, parentheses, etc.)');
      solutions.push('Verify proper indentation (use tabs consistently)');
      solutions.push('Check for typos in keywords or function names');
      if (error.file && error.line) {
        solutions.push(`Fix the syntax error at ${error.file}:${error.line}`);
      }
    }

    // Function not found errors
    if (msg.includes('not found') && (msg.includes('function') || msg.includes('method'))) {
      solutions.push('Verify the function name spelling');
      solutions.push('Check if the function is defined in the script or base class');
      solutions.push('Ensure the function is not private (starts with underscore) when calling from outside');
    }

    // Type errors
    if (msg.includes('type') && (msg.includes('expected') || msg.includes('mismatch'))) {
      solutions.push('Check the type annotations match the actual values');
      solutions.push('Verify function parameters are passed with correct types');
      solutions.push('Use type conversion functions if needed (int(), float(), str(), etc.)');
    }

    // Scene/resource not found
    if (msg.includes('not found') && (msg.includes('scene') || msg.includes('resource') || msg.includes('file'))) {
      solutions.push('Verify the resource path is correct (use res:// prefix)');
      solutions.push('Check if the file exists in the project directory');
      solutions.push('Ensure the resource is not excluded from export');
    }

    // Signal connection errors
    if (msg.includes('signal') && (msg.includes('connect') || msg.includes('not found'))) {
      solutions.push('Verify the signal name is spelled correctly');
      solutions.push('Check if the signal is defined in the emitting object');
      solutions.push('Ensure the target method exists and has correct signature');
    }

    // If no specific solutions, provide generic debugging advice
    if (solutions.length === 0) {
      solutions.push('Check the Godot documentation for this error type');
      solutions.push('Review the stack trace for the error origin');
      if (error.file && error.line) {
        solutions.push(`Examine the code at ${error.file}:${error.line}`);
      }
      solutions.push('Use print() statements to debug variable values');
    }

    return solutions;
  }

  /**
   * Handle the stop_project tool
   */
  private async handleStopProject() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process to stop.',
        [
          'Use run_project to start a Godot project first',
          'The process may have already terminated',
        ]
      );
    }

    this.logDebug('Stopping active Godot process');
    this.activeProcess.process.kill();
    const output = this.activeProcess.output;
    const errors = this.activeProcess.errors;
    this.activeProcess = null;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Godot project stopped',
              finalOutput: output,
              finalErrors: errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle the get_godot_version tool
   */
  private async handleGetGodotVersion() {
    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      this.logDebug('Getting Godot version');
      const { stdout } = await execAsync(`"${this.godotPath}" --version`);
      return {
        content: [
          {
            type: 'text',
            text: stdout.trim(),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to get Godot version: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the list_projects tool
   */
  private async handleListProjects(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.directory) {
      return this.createErrorResponse(
        'Directory is required',
        ['Provide a valid directory path to search for Godot projects']
      );
    }

    if (!this.validatePath(args.directory)) {
      return this.createErrorResponse(
        'Invalid directory path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      this.logDebug(`Listing Godot projects in directory: ${args.directory}`);
      if (!existsSync(args.directory)) {
        return this.createErrorResponse(
          `Directory does not exist: ${args.directory}`,
          ['Provide a valid directory path that exists on the system']
        );
      }

      const recursive = args.recursive === true;
      const projects = this.findGodotProjects(args.directory, recursive);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list projects: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the directory exists and is accessible',
          'Check if you have permission to read the directory',
        ]
      );
    }
  }

  /**
   * Get the structure of a Godot project asynchronously by counting files recursively
   * @param projectPath Path to the Godot project
   * @returns Promise resolving to an object with counts of scenes, scripts, assets, and other files
   */
  private getProjectStructureAsync(projectPath: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        const structure = {
          scenes: 0,
          scripts: 0,
          assets: 0,
          other: 0,
        };

        const scanDirectory = (currentPath: string) => {
          const entries = readdirSync(currentPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const entryPath = join(currentPath, entry.name);
            
            // Skip hidden files and directories
            if (entry.name.startsWith('.')) {
              continue;
            }
            
            if (entry.isDirectory()) {
              // Recursively scan subdirectories
              scanDirectory(entryPath);
            } else if (entry.isFile()) {
              // Count file by extension
              const ext = entry.name.split('.').pop()?.toLowerCase();
              
              if (ext === 'tscn') {
                structure.scenes++;
              } else if (ext === 'gd' || ext === 'gdscript' || ext === 'cs') {
                structure.scripts++;
              } else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'ttf', 'wav', 'mp3', 'ogg'].includes(ext || '')) {
                structure.assets++;
              } else {
                structure.other++;
              }
            }
          }
        };
        
        // Start scanning from the project root
        scanDirectory(projectPath);
        resolve(structure);
      } catch (error) {
        this.logDebug(`Error getting project structure asynchronously: ${error}`);
        resolve({ 
          error: 'Failed to get project structure',
          scenes: 0,
          scripts: 0,
          assets: 0,
          other: 0
        });
      }
    });
  }

  /**
   * Handle the get_project_info tool
   */
  private async handleGetProjectInfo(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }
  
    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }
  
    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }
  
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }
  
      this.logDebug(`Getting project info for: ${args.projectPath}`);
  
      // Get Godot version
      const execOptions = { timeout: 10000 }; // 10 second timeout
      const { stdout } = await execAsync(`"${this.godotPath}" --version`, execOptions);
  
      // Get project structure using the recursive method
      const projectStructure = await this.getProjectStructureAsync(args.projectPath);
  
      // Extract project name from project.godot file
      let projectName = basename(args.projectPath);
      try {
        const fs = require('fs');
        const projectFileContent = fs.readFileSync(projectFile, 'utf8');
        const configNameMatch = projectFileContent.match(/config\/name="([^"]+)"/);
        if (configNameMatch && configNameMatch[1]) {
          projectName = configNameMatch[1];
          this.logDebug(`Found project name in config: ${projectName}`);
        }
      } catch (error) {
        this.logDebug(`Error reading project file: ${error}`);
        // Continue with default project name if extraction fails
      }
  
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: projectName,
                path: args.projectPath,
                godotVersion: stdout.trim(),
                structure: projectStructure,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get project info: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_scene tool
   */
  private async handleCreateScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Project path and scene path are required',
        ['Provide valid paths for both the project and the scene']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        rootNodeType: args.rootNodeType || 'Node2D',
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to create scene: ${stderr}`,
          [
            'Check if the root node type is valid',
            'Ensure you have write permissions to the scene path',
            'Verify the scene path is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Scene created successfully at: ${args.scenePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the add_node tool
   */
  private async handleAddNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.nodeType || !args.nodeName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodeType, and nodeName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        nodeType: args.nodeType,
        nodeName: args.nodeName,
      };

      // Add optional parameters
      if (args.parentNodePath) {
        params.parentNodePath = args.parentNodePath;
      }

      if (args.properties) {
        params.properties = args.properties;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('add_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to add node: ${stderr}`,
          [
            'Check if the node type is valid',
            'Ensure the parent node path exists',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node '${args.nodeName}' of type '${args.nodeType}' added successfully to '${args.scenePath}'.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add node: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the load_sprite tool
   */
  private async handleLoadSprite(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.texturePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and texturePath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.nodePath) ||
      !this.validatePath(args.texturePath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Check if the texture file exists
      const texturePath = join(args.projectPath, args.texturePath);
      if (!existsSync(texturePath)) {
        return this.createErrorResponse(
          `Texture file does not exist: ${args.texturePath}`,
          [
            'Ensure the texture path is correct',
            'Upload or create the texture file first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        texturePath: args.texturePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('load_sprite', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to load sprite: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node is a Sprite2D, Sprite3D, or TextureRect',
            'Verify the texture file is a valid image format',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Sprite loaded successfully with texture: ${args.texturePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to load sprite: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the export_mesh_library tool
   */
  private async handleExportMeshLibrary(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.outputPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and outputPath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.outputPath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        outputPath: args.outputPath,
      };

      // Add optional parameters
      if (args.meshItemNames && Array.isArray(args.meshItemNames)) {
        params.meshItemNames = args.meshItemNames;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('export_mesh_library', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to export mesh library: ${stderr}`,
          [
            'Check if the scene contains valid 3D meshes',
            'Ensure the output path is valid',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `MeshLibrary exported successfully to: ${args.outputPath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to export mesh library: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the save_scene tool
   */
  private async handleSaveScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scenePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    // If newPath is provided, validate it
    if (args.newPath && !this.validatePath(args.newPath)) {
      return this.createErrorResponse(
        'Invalid new path',
        ['Provide a valid new path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
      };

      // Add optional parameters
      if (args.newPath) {
        params.newPath = args.newPath;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('save_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to save scene: ${stderr}`,
          [
            'Check if the scene file is valid',
            'Ensure you have write permissions to the output path',
            'Verify the scene can be properly packed',
          ]
        );
      }

      const savePath = args.newPath || args.scenePath;
      return {
        content: [
          {
            type: 'text',
            text: `Scene saved successfully to: ${savePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to save scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_uid tool
   */
  private async handleGetUid(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.filePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and filePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.filePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the file exists
      const filePath = join(args.projectPath, args.filePath);
      if (!existsSync(filePath)) {
        return this.createErrorResponse(
          `File does not exist: ${args.filePath}`,
          ['Ensure the file path is correct']
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execAsync(`"${this.godotPath}" --version`);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
          `UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
          [
            'Upgrade to Godot 4.4 or later to use UIDs',
            'Use resource paths instead of UIDs for this version of Godot',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        filePath: args.filePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('get_uid', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to get UID: ${stderr}`,
          [
            'Check if the file is a valid Godot resource',
            'Ensure the file path is correct',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `UID for ${args.filePath}: ${stdout.trim()}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get UID: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the update_project_uids tool
   */
  private async handleUpdateProjectUids(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execAsync(`"${this.godotPath}" --version`);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
          `UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
          [
            'Upgrade to Godot 4.4 or later to use UIDs',
            'Use resource paths instead of UIDs for this version of Godot',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        projectPath: args.projectPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('resave_resources', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to update project UIDs: ${stderr}`,
          [
            'Check if the project is valid',
            'Ensure you have write permissions to the project directory',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Project UIDs updated successfully.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to update project UIDs: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle list_signals tool - List all signals available on a node type or instance
   */
  private async handleListSignals(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.nodeType) {
      return this.createErrorResponse(
        'Node type is required',
        ['Provide a valid Godot node type (e.g., "Button", "Area2D")']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Listing signals for node type: ${args.nodeType}`);

      // Prepare parameters for the operation
      const params: any = {
        nodeType: args.nodeType,
      };

      // Add optional parameters if provided
      if (args.scenePath) {
        params.scenePath = args.scenePath;
      }
      if (args.nodePath) {
        params.nodePath = args.nodePath;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('list_signals', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to list signals: ${stderr}`,
          [
            'Check if the node type is valid',
            'Verify the scene path and node path if provided',
            'Ensure the project is valid and loadable',
          ]
        );
      }

      // Parse the JSON output
      let result;
      try {
        result = JSON.parse(stdout);
      } catch (parseError) {
        return this.createErrorResponse(
          `Failed to parse signal list output: ${stdout}`,
          [
            'Check Godot logs for errors',
            'Ensure the operation completed successfully',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Signals for ${args.nodeType}:\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list signals: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the node type is valid',
        ]
      );
    }
  }

  /**
   * Handle list_connections tool - List all signal connections in a scene
   */
  private async handleListConnections(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scenePath) {
      return this.createErrorResponse(
        'Scene path is required',
        ['Provide a valid path to a scene file (relative to project)']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Listing connections for scene: ${args.scenePath}`);

      // Prepare parameters for the operation
      const params: any = {
        scenePath: args.scenePath,
      };

      // Add optional node path filter if provided
      if (args.nodePath) {
        params.nodePath = args.nodePath;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('list_connections', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to list connections: ${stderr}`,
          [
            'Check if the scene path is valid',
            'Verify the scene file exists and is loadable',
            'Ensure the project is valid',
          ]
        );
      }

      // Parse the JSON output
      let result;
      try {
        result = JSON.parse(stdout);
      } catch (parseError) {
        return this.createErrorResponse(
          `Failed to parse connections output: ${stdout}`,
          [
            'Check Godot logs for errors',
            'Ensure the operation completed successfully',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Connections in ${args.scenePath}:\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list connections: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the scene path is valid',
        ]
      );
    }
  }

  /**
   * Handle connect_signal tool - Connect a signal from source node to target node method
   */
  private async handleConnectSignal(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scenePath) {
      return this.createErrorResponse(
        'Scene path is required',
        ['Provide a valid path to a scene file (relative to project)']
      );
    }

    if (!args.sourceNodePath) {
      return this.createErrorResponse(
        'Source node path is required',
        ['Provide the path to the node that emits the signal']
      );
    }

    if (!args.signalName) {
      return this.createErrorResponse(
        'Signal name is required',
        ['Provide the name of the signal to connect']
      );
    }

    if (!args.targetNodePath) {
      return this.createErrorResponse(
        'Target node path is required',
        ['Provide the path to the node that will receive the signal']
      );
    }

    if (!args.methodName) {
      return this.createErrorResponse(
        'Method name is required',
        ['Provide the name of the method to call when the signal is emitted']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Connecting signal ${args.signalName} from ${args.sourceNodePath} to ${args.targetNodePath}.${args.methodName}`);

      // Prepare parameters for the operation
      const params: any = {
        scenePath: args.scenePath,
        sourceNodePath: args.sourceNodePath,
        signalName: args.signalName,
        targetNodePath: args.targetNodePath,
        methodName: args.methodName,
      };

      // Add optional parameters if provided
      if (args.binds && Array.isArray(args.binds)) {
        params.binds = args.binds;
      }

      if (args.flags !== undefined) {
        params.flags = args.flags;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('connect_signal', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to connect signal: ${stderr}`,
          [
            'Check if the source node exists and has the specified signal',
            'Verify the target node exists',
            'Ensure the scene file is valid and loadable',
            'Use list_signals to see available signals on the source node',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Successfully connected signal!\n\nConnection details:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to connect signal: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify all node paths and signal names are correct',
          'Use list_signals and list_connections to inspect the scene',
        ]
      );
    }
  }

  /**
   * Handle disconnect_signal tool - Remove an existing signal connection
   */
  private async handleDisconnectSignal(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scenePath) {
      return this.createErrorResponse(
        'Scene path is required',
        ['Provide a valid path to a scene file (relative to project)']
      );
    }

    if (!args.sourceNodePath) {
      return this.createErrorResponse(
        'Source node path is required',
        ['Provide the path to the node that emits the signal']
      );
    }

    if (!args.signalName) {
      return this.createErrorResponse(
        'Signal name is required',
        ['Provide the name of the signal to disconnect']
      );
    }

    if (!args.targetNodePath) {
      return this.createErrorResponse(
        'Target node path is required',
        ['Provide the path to the target node']
      );
    }

    if (!args.methodName) {
      return this.createErrorResponse(
        'Method name is required',
        ['Provide the name of the method that was connected']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Disconnecting signal ${args.signalName} from ${args.sourceNodePath} to ${args.targetNodePath}.${args.methodName}`);

      // Prepare parameters for the operation
      const params: any = {
        scenePath: args.scenePath,
        sourceNodePath: args.sourceNodePath,
        signalName: args.signalName,
        targetNodePath: args.targetNodePath,
        methodName: args.methodName,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('disconnect_signal', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to disconnect signal: ${stderr}`,
          [
            'Check if the connection exists using list_connections',
            'Verify the scene file is valid and loadable',
            'Ensure all node paths and signal names are correct',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Successfully disconnected signal!\n\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to disconnect signal: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the connection exists before trying to disconnect it',
          'Use list_connections to inspect existing connections',
        ]
      );
    }
  }

  /**
   * Handle the validate_connection tool
   * @param args Tool arguments
   */
  private async handleValidateConnection(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scenePath) {
      return this.createErrorResponse(
        'Scene path is required',
        ['Provide a valid path to a scene file (relative to project)']
      );
    }

    if (!args.sourceNodePath) {
      return this.createErrorResponse(
        'Source node path is required',
        ['Provide the path to the node that emits the signal']
      );
    }

    if (!args.signalName) {
      return this.createErrorResponse(
        'Signal name is required',
        ['Provide the name of the signal to validate']
      );
    }

    if (!args.targetNodePath) {
      return this.createErrorResponse(
        'Target node path is required',
        ['Provide the path to the target node']
      );
    }

    if (!args.methodName) {
      return this.createErrorResponse(
        'Method name is required',
        ['Provide the name of the method to validate']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Validating connection ${args.signalName} from ${args.sourceNodePath} to ${args.targetNodePath}.${args.methodName}`);

      // Prepare parameters for the operation
      const params: any = {
        scenePath: args.scenePath,
        sourceNodePath: args.sourceNodePath,
        signalName: args.signalName,
        targetNodePath: args.targetNodePath,
        methodName: args.methodName,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('validate_connection', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Validation failed: ${stderr}`,
          [
            'Check if the source node exists',
            'Verify the signal name is correct using list_signals',
            'Ensure the target node exists',
            'Verify method name matches the target node\'s script',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Validation complete!\n\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to validate connection: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the scene file exists and is valid',
          'Use list_signals to check available signals on the source node',
        ]
      );
    }
  }

  /**
   * Handle the analyze_script tool
   * @param args Tool arguments
   */
  private async handleAnalyzeScript(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scriptPath) {
      return this.createErrorResponse(
        'Script path is required',
        ['Provide a valid path to a GDScript file (relative to project)']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Analyzing script ${args.scriptPath}`);

      // Prepare parameters for the operation
      const params: any = {
        scriptPath: args.scriptPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('analyze_script', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to analyze script: ${stderr}`,
          [
            'Check if the script file exists',
            'Verify the script path is correct (relative to project)',
            'Ensure the script is valid GDScript',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Script analysis complete!\n\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to analyze script: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the script file exists and is readable',
          'Ensure the script contains valid GDScript',
        ]
      );
    }
  }

  /**
   * Handle the create_script tool
   * @param args Tool arguments
   */
  private async handleCreateScript(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scriptPath) {
      return this.createErrorResponse(
        'Script path is required',
        ['Provide a valid path for the new script file (relative to project)']
      );
    }

    if (!args.extends) {
      return this.createErrorResponse(
        'Extends parameter is required',
        ['Specify the base class to extend (e.g., Node, Node2D, CharacterBody2D)']
      );
    }

    if (!args.template) {
      return this.createErrorResponse(
        'Template parameter is required',
        ['Choose a template: basic, state_machine, singleton, component, character_controller']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Creating script ${args.scriptPath} with template ${args.template}`);

      // Prepare parameters for the operation
      const params: any = {
        scriptPath: args.scriptPath,
        extends: args.extends,
        template: args.template,
      };

      // Add optional className if provided
      if (args.className) {
        params.className = args.className;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_script', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to create script: ${stderr}`,
          [
            'Check if the script path is valid',
            'Verify the extends class is a valid Godot class',
            'Ensure the template name is correct',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Script created successfully!\n\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create script: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the script path is writable',
          'Ensure the template and extends parameters are valid',
        ]
      );
    }
  }

  /**
   * Handle the modify_function tool
   * @param args Tool arguments
   */
  private async handleModifyFunction(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scriptPath) {
      return this.createErrorResponse(
        'Script path is required',
        ['Provide a valid path to a GDScript file (relative to project)']
      );
    }

    if (!args.functionName) {
      return this.createErrorResponse(
        'Function name is required',
        ['Specify the name of the function to modify']
      );
    }

    if (!args.newBody) {
      return this.createErrorResponse(
        'New body is required',
        ['Provide the new implementation for the function']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Modifying function ${args.functionName} in ${args.scriptPath}`);

      // Prepare parameters for the operation
      const params: any = {
        scriptPath: args.scriptPath,
        functionName: args.functionName,
        newBody: args.newBody,
      };

      // Add optional newSignature if provided
      if (args.newSignature) {
        params.newSignature = args.newSignature;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('modify_function', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to modify function: ${stderr}`,
          [
            'Check if the function exists in the script',
            'Verify the script path is correct',
            'Ensure the new body has proper GDScript syntax',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Function modified successfully!\n\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to modify function: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the script file exists and is writable',
          'Ensure the function name is correct',
        ]
      );
    }
  }

  /**
   * Handle the add_export_variable tool
   * @param args Tool arguments
   */
  private async handleAddExportVariable(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scriptPath) {
      return this.createErrorResponse(
        'Script path is required',
        ['Provide a valid path to a GDScript file (relative to project)']
      );
    }

    if (!args.variableName) {
      return this.createErrorResponse(
        'Variable name is required',
        ['Specify the name of the variable to add']
      );
    }

    if (!args.variableType) {
      return this.createErrorResponse(
        'Variable type is required',
        ['Specify the type (e.g., "int", "float", "String", "Vector2")']
      );
    }

    if (args.defaultValue === undefined || args.defaultValue === null) {
      return this.createErrorResponse(
        'Default value is required',
        ['Provide a default value for the variable']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Adding export variable ${args.variableName} to ${args.scriptPath}`);

      // Prepare parameters for the operation
      const params: any = {
        scriptPath: args.scriptPath,
        variableName: args.variableName,
        variableType: args.variableType,
        defaultValue: args.defaultValue,
      };

      // Add optional export hint and hint string if provided
      if (args.exportHint) {
        params.exportHint = args.exportHint;
      }
      if (args.hintString) {
        params.hintString = args.hintString;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('add_export_variable', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to add export variable: ${stderr}`,
          [
            'Check if the script file exists and is writable',
            'Verify the variable type is valid',
            'Ensure the default value matches the type',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Export variable added successfully!\n\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add export variable: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the script file exists and is writable',
        ]
      );
    }
  }

  /**
   * Handle the extract_dependencies tool
   * @param args Tool arguments
   */
  private async handleExtractDependencies(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scriptPath) {
      return this.createErrorResponse(
        'Script path is required',
        ['Provide a valid path to a GDScript file (relative to project)']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Extracting dependencies from ${args.scriptPath}`);

      // Prepare parameters for the operation
      const params: any = {
        scriptPath: args.scriptPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('extract_dependencies', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to extract dependencies: ${stderr}`,
          [
            'Check if the script file exists',
            'Verify the script path is correct',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Dependencies extracted successfully!\n\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to extract dependencies: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the script file exists',
        ]
      );
    }
  }

  /**
   * Handle the attach_script tool
   * @param args Tool arguments
   */
  private async handleAttachScript(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scenePath) {
      return this.createErrorResponse(
        'Scene path is required',
        ['Provide a valid path to a scene file (relative to project)']
      );
    }

    if (!args.nodePath) {
      return this.createErrorResponse(
        'Node path is required',
        ['Specify the path to the node (e.g., "." for root, "Player/Sprite" for child)']
      );
    }

    if (!args.scriptPath) {
      return this.createErrorResponse(
        'Script path is required',
        ['Provide a valid path to a GDScript file (relative to project)']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Attaching script ${args.scriptPath} to node ${args.nodePath} in ${args.scenePath}`);

      // Prepare parameters for the operation
      const params: any = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        scriptPath: args.scriptPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('attach_script', params, args.projectPath);

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to attach script: ${stderr}`,
          [
            'Check if the scene file exists',
            'Verify the node path is correct',
            'Ensure the script file exists',
            'Verify the script extends the correct base class for the node type',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Script attached successfully!\n\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to attach script: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the scene file and script file exist',
        ]
      );
    }
  }

  /**
   * Handle the validate_script tool
   * Validates a GDScript file for syntax errors without executing it
   */
  private async handleValidateScript(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    // Validate required parameters
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.scriptPath) {
      return this.createErrorResponse(
        'Script path is required',
        ['Provide a valid path to a GDScript file (relative to project)']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the script file exists
      const scriptFile = join(args.projectPath, args.scriptPath);
      if (!existsSync(scriptFile)) {
        return this.createErrorResponse(
          `Script file not found: ${args.scriptPath}`,
          [
            'Ensure the script path is correct and relative to the project directory',
            'Check for typos in the file path',
          ]
        );
      }

      this.logDebug(`Validating script: ${args.scriptPath} in project: ${args.projectPath}`);

      // Use Godot's --check-only flag to validate the script
      const cmdArgs = ['--headless', '--path', args.projectPath, '--script', args.scriptPath, '--check-only'];

      this.logDebug(`Running Godot command: ${this.godotPath} ${cmdArgs.join(' ')}`);

      return new Promise((resolve) => {
        const godotProcess = spawn(this.godotPath!, cmdArgs, { stdio: 'pipe' });
        const output: string[] = [];
        const errors: string[] = [];

        godotProcess.stdout?.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n');
          output.push(...lines);
        });

        godotProcess.stderr?.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n');
          errors.push(...lines);
        });

        godotProcess.on('close', (code: number | null) => {
          this.logDebug(`Godot validation process exited with code ${code}`);

          // Parse errors from both stdout and stderr
          const allLines = [...errors, ...output];
          const parsedErrors = this.parseGodotErrors(allLines);

          // If exit code is 0, the script is valid
          const isValid = code === 0 && parsedErrors.length === 0;

          resolve({
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    valid: isValid,
                    script_path: args.scriptPath,
                    exit_code: code,
                    errors: parsedErrors,
                    error_count: parsedErrors.length,
                    raw_output: output.filter(line => line.trim()),
                    raw_errors: errors.filter(line => line.trim()),
                  },
                  null,
                  2
                ),
              },
            ],
          });
        });

        godotProcess.on('error', (err: Error) => {
          console.error('Failed to start Godot validation process:', err);
          resolve(this.createErrorResponse(
            `Failed to validate script: ${err.message}`,
            [
              'Ensure Godot is installed correctly',
              'Check if the GODOT_PATH environment variable is set correctly',
              'Verify the script file exists and has correct syntax',
            ]
          ));
        });
      });
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to validate script: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the script file exists',
        ]
      );
    }
  }

  /**
   * Handle the create_animation_player tool
   * Adds an AnimationPlayer node to a scene and optionally creates an initial animation
   */
  private async handleCreateAnimationPlayer(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scenePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Execute the create_animation_player operation using the bundled script
      const params = {
        scene_path: args.scenePath,
        parent_node_path: args.parentNodePath || 'root',
        animation_player_name: args.animationPlayerName || 'AnimationPlayer',
        initial_animation_name: args.initialAnimationName,
      };

      const { stdout, stderr } = await this.executeOperation('create_animation_player', params, args.projectPath);

      // Check for errors in stderr
      if (stderr && stderr.length > 0) {
        return this.createErrorResponse(
          `Error creating AnimationPlayer: ${stderr}`,
          [
            'Ensure the scene file exists',
            'Check if the parent node path is valid',
            'Verify you have write permissions to the scene file',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `AnimationPlayer node added successfully to: ${args.scenePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create AnimationPlayer: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the scene file exists and is accessible',
        ]
      );
    }
  }

  /**
   * Handle the add_animation_track tool
   * Adds a track to an existing animation in an AnimationPlayer node
   */
  private async handleAddAnimationTrack(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.animationPlayerPath || !args.animationName || !args.trackType || !args.targetNodePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, animationPlayerPath, animationName, trackType, and targetNodePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Execute the add_animation_track operation using the bundled script
      const params = {
        scene_path: args.scenePath,
        animation_player_path: args.animationPlayerPath,
        animation_name: args.animationName,
        track_type: args.trackType,
        target_node_path: args.targetNodePath,
        property_path: args.propertyPath,
      };

      const { stdout, stderr } = await this.executeOperation('add_animation_track', params, args.projectPath);

      // Check for errors in stderr
      if (stderr && stderr.length > 0) {
        return this.createErrorResponse(
          `Error adding animation track: ${stderr}`,
          [
            'Ensure the scene file exists',
            'Check if the AnimationPlayer node path is valid',
            'Verify the animation exists in the AnimationPlayer',
            'Ensure the target node path is correct',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Animation track added successfully to: ${args.animationName}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add animation track: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the scene file and AnimationPlayer exist',
        ]
      );
    }
  }

  /**
   * Handle the add_keyframe tool
   * Adds a keyframe to an animation track at a specific time
   */
  private async handleAddKeyframe(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.animationPlayerPath || !args.animationName ||
        args.trackIndex === undefined || args.time === undefined || args.value === undefined) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, animationPlayerPath, animationName, trackIndex, time, and value']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Execute the add_keyframe operation using the bundled script
      const params = {
        scene_path: args.scenePath,
        animation_player_path: args.animationPlayerPath,
        animation_name: args.animationName,
        track_index: args.trackIndex,
        time: args.time,
        value: args.value,
        easing: args.easing !== undefined ? args.easing : 1.0,
      };

      const { stdout, stderr } = await this.executeOperation('add_keyframe', params, args.projectPath);

      // Check for errors in stderr
      if (stderr && stderr.length > 0) {
        return this.createErrorResponse(
          `Error adding keyframe: ${stderr}`,
          [
            'Ensure the scene file exists',
            'Check if the AnimationPlayer node path is valid',
            'Verify the animation and track index exist',
            'Ensure the value type matches the track type',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Keyframe added successfully at time ${args.time}s\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add keyframe: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the scene file and AnimationPlayer exist',
        ]
      );
    }
  }

  /**
   * Create a shader material with custom shader code or from a template
   */
  private async handleCreateShaderMaterial(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.shaderPath || !args.materialPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, shaderPath, and materialPath']
      );
    }

    // Either shaderCode or template must be provided
    if (!args.shaderCode && !args.template) {
      return this.createErrorResponse(
        'Missing shader code or template',
        ['Provide either shaderCode or template parameter']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.shaderPath) || !this.validatePath(args.materialPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    // Validate shader type if provided
    if (args.shaderType) {
      const validShaderTypes = ['canvas_item', 'spatial', 'particles'];
      if (!validShaderTypes.includes(args.shaderType)) {
        return this.createErrorResponse(
          `Invalid shader type: ${args.shaderType}`,
          ['Use one of: canvas_item (2D), spatial (3D), or particles']
        );
      }
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Execute the create_shader_material operation using the bundled script
      const params = {
        shader_path: args.shaderPath,
        material_path: args.materialPath,
        shader_code: args.shaderCode || null,
        shader_type: args.shaderType || null,
        shader_parameters: args.shaderParameters || {},
        template: args.template || null,
      };

      const { stdout, stderr } = await this.executeOperation('create_shader_material', params, args.projectPath);

      // Check for errors in stderr
      if (stderr && stderr.length > 0) {
        return this.createErrorResponse(
          `Error creating shader material: ${stderr}`,
          [
            'Check if the shader code is valid',
            'Ensure shader_type declaration matches the shaderType parameter',
            'Verify the file paths are correct',
            'Check for syntax errors in the shader code',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Shader material created successfully\n\nShader: ${args.shaderPath}\nMaterial: ${args.materialPath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create shader material: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the shader code syntax is valid',
        ]
      );
    }
  }

  /**
   * Handle the create_test_suite tool
   * @param args Tool arguments
   */
  private async handleCreateTestSuite(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.testPath) {
      return this.createErrorResponse(
        'Missing required parameters: projectPath and testPath are required',
        ['Provide a valid project path and test file path']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.testPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Execute the create_test_suite operation using the bundled script
      const params = {
        test_path: args.testPath,
        target_script: args.targetScript || null,
        test_cases: args.testCases || [],
        include_hooks: args.includeHooks || false,
      };

      const { stdout, stderr } = await this.executeOperation('create_test_suite', params, args.projectPath);

      // Check for errors
      if (stderr && stderr.trim() !== '') {
        return this.createErrorResponse(
          'Failed to create test suite',
          ['Check the error message for details', stderr]
        );
      }

      // Parse the JSON output
      try {
        const result = JSON.parse(stdout);
        return {
          content: [
            {
              type: 'text',
              text: `Test suite created successfully at ${result.test_path}\n\nTest file contains ${result.test_count} test method(s).\n\nTo run tests:\n1. Install GUT framework from Godot Asset Library\n2. Run via editor: Project > Tools > GUT\n3. Run via command line: godot --headless -s addons/gut/gut_cmdln.gd --path "$PWD" -gdir res://test/ -gexit`,
            },
          ],
        };
      } catch (parseError) {
        return {
          content: [
            {
              type: 'text',
              text: `Test suite created successfully.\n\nOutput: ${stdout}`,
            },
          ],
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Error creating test suite: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Ensure you have write permissions',
          'Check that the test path directory exists or can be created',
        ]
      );
    }
  }

  /**
   * Run GUT tests and return structured results
   */
  private async handleRunTests(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Missing required parameter: projectPath is required',
        ['Provide a valid project path']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if GUT is installed
      const gutPath = join(args.projectPath, 'addons', 'gut', 'gut_cmdln.gd');
      if (!existsSync(gutPath)) {
        return this.createErrorResponse(
          'GUT framework not found',
          [
            'Install GUT from https://github.com/bitwes/Gut/releases',
            'Extract to addons/gut directory in your project',
            'Run "godot --headless --import" to register GUT classes',
          ]
        );
      }

      // Build GUT command
      const testDir = args.testDir || 'test/';
      const verbosity = args.verbosity !== undefined ? args.verbosity : 1;
      const exitOnFinish = args.exitOnFinish !== undefined ? args.exitOnFinish : true;

      const gutArgs = [
        '--headless',
        '-s', 'addons/gut/gut_cmdln.gd',
        '--path', args.projectPath,
        '-gdir', `res://${testDir}`,
        `-glog=${verbosity}`,
      ];

      // Add specific test file if provided
      if (args.testFile) {
        gutArgs.push('-gtest', `res://${args.testFile}`);
      }

      // Add exit flag if needed
      if (exitOnFinish) {
        gutArgs.push('-gexit');
      }

      this.logDebug(`Running GUT with args: ${gutArgs.join(' ')}`);

      // Execute Godot with GUT
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
        const process = spawn(this.godotPath!, gutArgs, { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';

        process.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        process.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        process.on('close', (code: number | null) => {
          resolve({ stdout, stderr, exitCode: code || 0 });
        });

        process.on('error', (error: Error) => {
          reject(error);
        });
      });

      // Parse GUT output
      const testResults = this.parseGutOutput(result.stdout, result.stderr);

      // Return structured results
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(testResults, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Error running tests: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Ensure GUT is installed in addons/gut',
          'Check that test files exist in the specified directory',
        ]
      );
    }
  }

  /**
   * Parse GUT output to extract structured test results
   */
  private parseGutOutput(stdout: string, stderr: string): any {
    // Remove ANSI color codes from output for easier parsing
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[0-9;]*m/g, '');

    const cleanOutput = stripAnsi(stdout);
    const lines = cleanOutput.split('\n');
    const result: any = {
      success: false,
      exit_code: 0,
      summary: {
        scripts: 0,
        tests: 0,
        passing_tests: 0,
        failing_tests: 0,
        asserts: 0,
        time: '0s',
      },
      test_files: [],
      raw_output: stdout,
      raw_errors: stderr,
    };

    let currentFile: any = null;
    let currentTest: any = null;
    let inSummary = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect test file (but not if we're in the summary section)
      if (!inSummary && trimmed.startsWith('res://') && trimmed.endsWith('.gd')) {
        if (currentFile) {
          result.test_files.push(currentFile);
        }
        currentFile = {
          file: trimmed,
          tests: [],
          passed: 0,
          failed: 0,
        };
        currentTest = null;
      }

      // Detect test method
      else if (currentFile && trimmed.startsWith('* test_')) {
        if (currentTest) {
          currentFile.tests.push(currentTest);
        }
        currentTest = {
          name: trimmed.substring(2),
          passed: true,
          assertions: [],
        };
      }

      // Detect assertion results
      else if (currentTest && (trimmed.includes('[Passed]:') || trimmed.includes('[Failed]:'))) {
        const isPassed = trimmed.includes('[Passed]:');
        const assertion = {
          passed: isPassed,
          message: trimmed,
        };
        currentTest.assertions.push(assertion);

        if (!isPassed) {
          currentTest.passed = false;
        }
      }

      // Detect test summary line (e.g., "1/1 passed.")
      else if (currentFile && /^\d+\/\d+\s+(passed|failed)/.test(trimmed)) {
        if (currentTest) {
          currentFile.tests.push(currentTest);
          currentTest = null;
        }

        const match = trimmed.match(/^(\d+)\/(\d+)\s+(passed|failed)/);
        if (match) {
          currentFile.passed = parseInt(match[1]);
          currentFile.failed = parseInt(match[2]) - parseInt(match[1]);
        }
      }

      // Detect summary section
      else if (trimmed.includes('= Run Summary')) {
        if (currentFile) {
          result.test_files.push(currentFile);
          currentFile = null;
        }
        inSummary = true;
      }

      // Parse summary statistics
      else if (inSummary) {
        if (trimmed.startsWith('Scripts')) {
          const match = trimmed.match(/Scripts\s+(\d+)/);
          if (match) result.summary.scripts = parseInt(match[1]);
        } else if (trimmed.startsWith('Tests')) {
          const match = trimmed.match(/Tests\s+(\d+)/);
          if (match) result.summary.tests = parseInt(match[1]);
        } else if (trimmed.startsWith('Passing Tests')) {
          const match = trimmed.match(/Passing Tests\s+(\d+)/);
          if (match) result.summary.passing_tests = parseInt(match[1]);
        } else if (trimmed.startsWith('Asserts')) {
          const match = trimmed.match(/Asserts\s+(\d+)/);
          if (match) result.summary.asserts = parseInt(match[1]);
        } else if (trimmed.startsWith('Time')) {
          const match = trimmed.match(/Time\s+([\d.]+s)/);
          if (match) result.summary.time = match[1];
        } else if (trimmed.includes('All tests passed!')) {
          result.success = true;
        }
      }
    }

    // Add last file if exists
    if (currentFile) {
      result.test_files.push(currentFile);
    }

    // Calculate failing tests
    result.summary.failing_tests = result.summary.tests - result.summary.passing_tests;

    return result;
  }

  /**
   * Handle the import_texture tool
   * Configures texture import settings by modifying the .import file
   */
  private async handleImportTexture(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.texturePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and texturePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.texturePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the texture file exists
      const texturePath = join(args.projectPath, args.texturePath);
      if (!existsSync(texturePath)) {
        return this.createErrorResponse(
          `Texture file does not exist: ${args.texturePath}`,
          [
            'Ensure the texture path is correct',
            'Provide a path relative to the project directory',
          ]
        );
      }

      // Build the .import file path
      const importFilePath = texturePath + '.import';

      // Read existing .import file or create default settings
      let importContent: string;
      const { readFileSync, writeFileSync } = await import('fs');

      if (existsSync(importFilePath)) {
        importContent = readFileSync(importFilePath, 'utf-8');
      } else {
        // Create default import file structure for Godot 4.x
        importContent = `[remap]

importer="texture"
type="CompressedTexture2D"
uid="uid://${this.generateUID()}"
path="res://.godot/imported/${basename(args.texturePath)}-${this.generateShortUID()}.ctex"

[deps]

source_file="res://${args.texturePath}"
dest_files=["res://.godot/imported/${basename(args.texturePath)}-${this.generateShortUID()}.ctex"]

[params]

compress/mode=0
compress/high_quality=false
compress/lossy_quality=0.7
compress/hdr_compression=1
compress/normal_map=0
compress/channel_pack=0
mipmaps/generate=false
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/fix_alpha_border=true
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=1
`;
      }

      // Parse and modify settings based on arguments
      const lines = importContent.split('\n');
      const modifiedLines: string[] = [];
      let inParams = false;
      const settingsToApply: Record<string, string> = {};

      // Map user-friendly options to Godot import settings
      if (args.filter !== undefined) {
        // Filter mode mapping for Godot 4.x
        // In Godot 4, filtering is controlled differently - through the texture itself
        // The import file uses compress/mode and other settings
        const filterMap: Record<string, { generate: string; mode: string }> = {
          'Linear': { generate: 'false', mode: '0' },
          'Nearest': { generate: 'false', mode: '0' },
          'Linear Mipmap': { generate: 'true', mode: '0' },
          'Nearest Mipmap': { generate: 'true', mode: '0' },
        };
        const filterSettings = filterMap[args.filter];
        if (filterSettings) {
          settingsToApply['mipmaps/generate'] = filterSettings.generate;
        }
      }

      if (args.mipmaps !== undefined) {
        settingsToApply['mipmaps/generate'] = args.mipmaps ? 'true' : 'false';
      }

      if (args.compression !== undefined) {
        // Compression mode mapping for Godot 4.x
        const compressionMap: Record<string, string> = {
          'Lossless': '0',
          'Lossy': '1',
          'VRAM Compressed': '2',
          'VRAM Uncompressed': '3',
          'Basis Universal': '4',
        };
        const compressionMode = compressionMap[args.compression];
        if (compressionMode !== undefined) {
          settingsToApply['compress/mode'] = compressionMode;
        }
      }

      if (args.normalMap !== undefined) {
        settingsToApply['compress/normal_map'] = args.normalMap ? '1' : '0';
      }

      if (args.srgb !== undefined) {
        const srgbMap: Record<string, string> = {
          'Detect': '0',
          'Enable': '1',
          'Disable': '2',
        };
        // Note: sRGB handling in Godot 4.x is automatic for most cases
        // process/hdr_as_srgb controls this behavior
        if (args.srgb === 'Enable') {
          settingsToApply['process/hdr_as_srgb'] = 'true';
        } else if (args.srgb === 'Disable') {
          settingsToApply['process/hdr_as_srgb'] = 'false';
        }
      }

      // Process and modify the import file
      const appliedSettings = new Set<string>();

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '[params]') {
          inParams = true;
          modifiedLines.push(line);
          continue;
        }

        if (trimmed.startsWith('[') && trimmed !== '[params]') {
          // Before leaving params section, add any unapplied settings
          if (inParams) {
            for (const [key, value] of Object.entries(settingsToApply)) {
              if (!appliedSettings.has(key)) {
                modifiedLines.push(`${key}=${value}`);
                appliedSettings.add(key);
              }
            }
          }
          inParams = false;
        }

        if (inParams) {
          // Check if this line is a setting we want to modify
          const equalsIndex = trimmed.indexOf('=');
          if (equalsIndex > 0) {
            const settingKey = trimmed.substring(0, equalsIndex);
            if (settingsToApply[settingKey] !== undefined) {
              modifiedLines.push(`${settingKey}=${settingsToApply[settingKey]}`);
              appliedSettings.add(settingKey);
              continue;
            }
          }
        }

        modifiedLines.push(line);
      }

      // If we ended in params section, add remaining settings
      if (inParams) {
        for (const [key, value] of Object.entries(settingsToApply)) {
          if (!appliedSettings.has(key)) {
            modifiedLines.push(`${key}=${value}`);
          }
        }
      }

      // Write the modified import file
      const newContent = modifiedLines.join('\n');
      writeFileSync(importFilePath, newContent, 'utf-8');

      // Build response with applied settings
      const appliedSettingsReport: string[] = [];
      for (const [key, value] of Object.entries(settingsToApply)) {
        appliedSettingsReport.push(`${key}=${value}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              texture_path: args.texturePath,
              import_file: importFilePath,
              settings_applied: appliedSettingsReport,
              message: `Texture import settings updated for ${args.texturePath}. Re-import in Godot editor or run "godot --headless --import" to apply changes.`,
            }, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to configure texture import: ${errorMessage}`,
        [
          'Verify the texture file exists',
          'Check file permissions for the .import file',
          'Ensure the project path is correct',
        ]
      );
    }
  }

  /**
   * Handle the import_audio tool
   * Configures audio import settings by modifying the .import file
   */
  private async handleImportAudio(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.audioPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and audioPath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.audioPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the audio file exists
      const audioPath = join(args.projectPath, args.audioPath);
      if (!existsSync(audioPath)) {
        return this.createErrorResponse(
          `Audio file does not exist: ${args.audioPath}`,
          [
            'Ensure the audio path is correct',
            'Provide a path relative to the project directory',
          ]
        );
      }

      // Determine audio type from file extension
      const ext = args.audioPath.toLowerCase().split('.').pop() || '';
      const supportedFormats = ['wav', 'ogg', 'mp3'];
      if (!supportedFormats.includes(ext)) {
        return this.createErrorResponse(
          `Unsupported audio format: ${ext}`,
          [
            'Supported formats: WAV, OGG, MP3',
            'Convert your audio to one of these formats',
          ]
        );
      }

      // Build the .import file path
      const importFilePath = audioPath + '.import';

      // Read existing .import file or create default settings
      let importContent: string;
      const { readFileSync, writeFileSync } = await import('fs');

      // Determine importer type based on file extension
      let importerType: string;
      let resourceType: string;
      switch (ext) {
        case 'wav':
          importerType = 'wav';
          resourceType = 'AudioStreamWAV';
          break;
        case 'ogg':
          importerType = 'oggvorbisstr';
          resourceType = 'AudioStreamOggVorbis';
          break;
        case 'mp3':
          importerType = 'mp3';
          resourceType = 'AudioStreamMP3';
          break;
        default:
          importerType = 'wav';
          resourceType = 'AudioStreamWAV';
      }

      if (existsSync(importFilePath)) {
        importContent = readFileSync(importFilePath, 'utf-8');
      } else {
        // Create default import file structure for Godot 4.x
        const audioFileName = basename(args.audioPath);
        importContent = `[remap]

importer="${importerType}"
type="${resourceType}"
uid="uid://${this.generateUID()}"
path="res://.godot/imported/${audioFileName}-${this.generateShortUID()}.${ext === 'ogg' ? 'oggvorbisstr' : ext}"

[deps]

source_file="res://${args.audioPath}"
dest_files=["res://.godot/imported/${audioFileName}-${this.generateShortUID()}.${ext === 'ogg' ? 'oggvorbisstr' : ext}"]

[params]

loop=false
loop_offset=0.0
bpm=0.0
beat_count=0
bar_beats=4
`;
      }

      // Parse and modify settings based on arguments
      const lines = importContent.split('\n');
      const modifiedLines: string[] = [];
      let inParams = false;
      const settingsToApply: Record<string, string> = {};

      // Map user-friendly options to Godot import settings
      if (args.loop !== undefined) {
        settingsToApply['loop'] = args.loop ? 'true' : 'false';
      }

      if (args.loopMode !== undefined) {
        // Godot 4.x loop mode mapping
        const loopModeMap: Record<string, string> = {
          'Disabled': '0',
          'Forward': '1',
          'Ping-Pong': '2',
          'Backward': '3',
        };
        const loopModeValue = loopModeMap[args.loopMode];
        if (loopModeValue !== undefined) {
          settingsToApply['loop_mode'] = loopModeValue;
          // If setting a loop mode other than Disabled, enable looping
          if (loopModeValue !== '0') {
            settingsToApply['loop'] = 'true';
          }
        }
      }

      if (args.loopOffset !== undefined) {
        settingsToApply['loop_offset'] = args.loopOffset.toString();
      }

      if (args.bpm !== undefined) {
        settingsToApply['bpm'] = args.bpm.toString();
      }

      if (args.beatCount !== undefined) {
        settingsToApply['beat_count'] = args.beatCount.toString();
      }

      if (args.barBeats !== undefined) {
        settingsToApply['bar_beats'] = args.barBeats.toString();
      }

      // Process and modify the import file
      const appliedSettings = new Set<string>();

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '[params]') {
          inParams = true;
          modifiedLines.push(line);
          continue;
        }

        if (trimmed.startsWith('[') && trimmed !== '[params]') {
          // Before leaving params section, add any unapplied settings
          if (inParams) {
            for (const [key, value] of Object.entries(settingsToApply)) {
              if (!appliedSettings.has(key)) {
                modifiedLines.push(`${key}=${value}`);
                appliedSettings.add(key);
              }
            }
          }
          inParams = false;
        }

        if (inParams) {
          // Check if this line is a setting we want to modify
          const equalsIndex = trimmed.indexOf('=');
          if (equalsIndex > 0) {
            const settingKey = trimmed.substring(0, equalsIndex);
            if (settingsToApply[settingKey] !== undefined) {
              modifiedLines.push(`${settingKey}=${settingsToApply[settingKey]}`);
              appliedSettings.add(settingKey);
              continue;
            }
          }
        }

        modifiedLines.push(line);
      }

      // If we ended in params section, add remaining settings
      if (inParams) {
        for (const [key, value] of Object.entries(settingsToApply)) {
          if (!appliedSettings.has(key)) {
            modifiedLines.push(`${key}=${value}`);
          }
        }
      }

      // Write the modified import file
      const newContent = modifiedLines.join('\n');
      writeFileSync(importFilePath, newContent, 'utf-8');

      // Build response with applied settings
      const appliedSettingsReport: string[] = [];
      for (const [key, value] of Object.entries(settingsToApply)) {
        appliedSettingsReport.push(`${key}=${value}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              audio_path: args.audioPath,
              audio_type: resourceType,
              import_file: importFilePath,
              settings_applied: appliedSettingsReport,
              message: `Audio import settings updated for ${args.audioPath}. Re-import in Godot editor or run "godot --headless --import" to apply changes.`,
            }, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to configure audio import: ${errorMessage}`,
        [
          'Verify the audio file exists',
          'Check file permissions for the .import file',
          'Ensure the project path is correct',
        ]
      );
    }
  }

  /**
   * Handle the import_3d_model tool
   * Configures 3D model import settings by modifying the .import file
   */
  private async handleImport3DModel(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.modelPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and modelPath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.modelPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the model file exists
      const modelPath = join(args.projectPath, args.modelPath);
      if (!existsSync(modelPath)) {
        return this.createErrorResponse(
          `Model file does not exist: ${args.modelPath}`,
          [
            'Ensure the model path is correct',
            'Provide a path relative to the project directory',
          ]
        );
      }

      // Determine model type from file extension
      const ext = args.modelPath.toLowerCase().split('.').pop() || '';
      const supportedFormats = ['gltf', 'glb', 'fbx', 'obj', 'dae', 'blend'];
      if (!supportedFormats.includes(ext)) {
        return this.createErrorResponse(
          `Unsupported 3D model format: ${ext}`,
          [
            'Supported formats: GLTF, GLB, FBX, OBJ, DAE, BLEND',
            'Convert your model to one of these formats (GLTF/GLB recommended)',
          ]
        );
      }

      // Build the .import file path
      const importFilePath = modelPath + '.import';

      // Read existing .import file or create default settings
      let importContent: string;
      const { readFileSync, writeFileSync } = await import('fs');

      // Determine importer type based on file extension
      let importerType: string;
      switch (ext) {
        case 'gltf':
        case 'glb':
          importerType = 'scene';
          break;
        case 'fbx':
          importerType = 'scene';
          break;
        case 'obj':
          importerType = 'wavefront_obj';
          break;
        case 'dae':
          importerType = 'scene';
          break;
        case 'blend':
          importerType = 'scene';
          break;
        default:
          importerType = 'scene';
      }

      const modelFileName = basename(args.modelPath);
      const shortUID = this.generateShortUID();

      if (existsSync(importFilePath)) {
        importContent = readFileSync(importFilePath, 'utf-8');
      } else {
        // Create default import file structure for Godot 4.x 3D models
        importContent = `[remap]

importer="${importerType}"
importer_version=1
type="PackedScene"
uid="uid://${this.generateUID()}"
path="res://.godot/imported/${modelFileName}-${shortUID}.scn"

[deps]

source_file="res://${args.modelPath}"
dest_files=["res://.godot/imported/${modelFileName}-${shortUID}.scn"]

[params]

nodes/root_type="Node3D"
nodes/root_name=""
nodes/apply_root_scale=true
nodes/root_scale=1.0
meshes/ensure_tangents=true
meshes/generate_lods=true
meshes/create_shadow_meshes=true
meshes/light_baking=1
meshes/lightmap_texel_size=0.2
meshes/force_disable_compression=false
skins/use_named_skins=true
animation/import=true
animation/fps=30
animation/trimming=false
animation/remove_immutable_tracks=true
import_script/path=""
_subresources={}
gltf/naming_version=1
gltf/embedded_image_handling=1
`;
      }

      // Parse and modify settings based on arguments
      const lines = importContent.split('\n');
      const modifiedLines: string[] = [];
      let inParams = false;
      const settingsToApply: Record<string, string> = {};

      // Map user-friendly options to Godot import settings
      if (args.generateCollision !== undefined) {
        // Collision generation mapping for Godot 4.x
        // These are handled via physics/generate settings
        const collisionMap: Record<string, { generate: string; type: string }> = {
          'None': { generate: 'false', type: '0' },
          'Mesh': { generate: 'true', type: '1' },
          'Convex': { generate: 'true', type: '2' },
          'Multiple Convex': { generate: 'true', type: '3' },
          'Decomposed': { generate: 'true', type: '4' },
        };
        const collisionSettings = collisionMap[args.generateCollision];
        if (collisionSettings) {
          settingsToApply['physics/generate'] = collisionSettings.generate;
          settingsToApply['physics/shape_type'] = collisionSettings.type;
        }
      }

      if (args.importMaterials !== undefined) {
        settingsToApply['materials/export'] = args.importMaterials ? 'true' : 'false';
      }

      if (args.importAnimations !== undefined) {
        settingsToApply['animation/import'] = args.importAnimations ? 'true' : 'false';
      }

      if (args.scale !== undefined) {
        settingsToApply['nodes/root_scale'] = args.scale.toString();
      }

      if (args.generateLOD !== undefined) {
        settingsToApply['meshes/generate_lods'] = args.generateLOD ? 'true' : 'false';
      }

      if (args.rootType !== undefined) {
        settingsToApply['nodes/root_type'] = `"${args.rootType}"`;
      }

      // Process and modify the import file
      const appliedSettings = new Set<string>();

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '[params]') {
          inParams = true;
          modifiedLines.push(line);
          continue;
        }

        if (trimmed.startsWith('[') && trimmed !== '[params]') {
          // Before leaving params section, add any unapplied settings
          if (inParams) {
            for (const [key, value] of Object.entries(settingsToApply)) {
              if (!appliedSettings.has(key)) {
                modifiedLines.push(`${key}=${value}`);
                appliedSettings.add(key);
              }
            }
          }
          inParams = false;
        }

        if (inParams) {
          // Check if this line is a setting we want to modify
          const equalsIndex = trimmed.indexOf('=');
          if (equalsIndex > 0) {
            const settingKey = trimmed.substring(0, equalsIndex);
            if (settingsToApply[settingKey] !== undefined) {
              modifiedLines.push(`${settingKey}=${settingsToApply[settingKey]}`);
              appliedSettings.add(settingKey);
              continue;
            }
          }
        }

        modifiedLines.push(line);
      }

      // If we ended in params section, add remaining settings
      if (inParams) {
        for (const [key, value] of Object.entries(settingsToApply)) {
          if (!appliedSettings.has(key)) {
            modifiedLines.push(`${key}=${value}`);
          }
        }
      }

      // Write the modified import file
      const newContent = modifiedLines.join('\n');
      writeFileSync(importFilePath, newContent, 'utf-8');

      // Build response with applied settings
      const appliedSettingsReport: string[] = [];
      for (const [key, value] of Object.entries(settingsToApply)) {
        appliedSettingsReport.push(`${key}=${value}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              model_path: args.modelPath,
              model_format: ext.toUpperCase(),
              import_file: importFilePath,
              settings_applied: appliedSettingsReport,
              message: `3D model import settings updated for ${args.modelPath}. Re-import in Godot editor or run "godot --headless --import" to apply changes.`,
            }, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to configure 3D model import: ${errorMessage}`,
        [
          'Verify the model file exists',
          'Check file permissions for the .import file',
          'Ensure the project path is correct',
        ]
      );
    }
  }

  /**
   * Handle the create_resource tool
   * Creates custom Godot Resource files (.tres) programmatically
   */
  private async handleCreateResource(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.resourcePath || !args.resourceType) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, resourcePath, and resourceType']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.resourcePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Ensure resource path ends with .tres
      let resourcePath = args.resourcePath;
      if (!resourcePath.endsWith('.tres')) {
        resourcePath += '.tres';
      }

      // Build full path
      const fullResourcePath = join(args.projectPath, resourcePath);

      // Ensure directory exists
      const resourceDir = dirname(fullResourcePath);
      const { mkdirSync, writeFileSync } = await import('fs');

      if (!existsSync(resourceDir)) {
        mkdirSync(resourceDir, { recursive: true });
      }

      // Resource templates for common resource types
      const resourceTemplates: Record<string, Record<string, any>> = {
        'theme_dark': {
          default_font_size: 14,
          // Dark theme colors would be added via properties
        },
        'theme_light': {
          default_font_size: 14,
          // Light theme colors would be added via properties
        },
        'environment_outdoor': {
          background_mode: 2, // Sky
          ambient_light_color: 'Color(0.4, 0.4, 0.5, 1)',
          ambient_light_energy: 0.5,
          tonemap_mode: 2, // ACES
          ssao_enabled: true,
        },
        'environment_indoor': {
          background_mode: 1, // Color
          background_color: 'Color(0.1, 0.1, 0.1, 1)',
          ambient_light_color: 'Color(0.3, 0.3, 0.3, 1)',
          ambient_light_energy: 0.3,
        },
        'material_standard': {
          albedo_color: 'Color(1, 1, 1, 1)',
          metallic: 0.0,
          roughness: 1.0,
        },
        'material_unshaded': {
          shading_mode: 0, // Unshaded
          albedo_color: 'Color(1, 1, 1, 1)',
        },
      };

      // Start building the .tres file content
      const resourceType = args.resourceType;
      let properties = args.properties || {};

      // Apply template if specified
      if (args.template && resourceTemplates[args.template]) {
        properties = { ...resourceTemplates[args.template], ...properties };
      }

      // Generate UID for the resource
      const uid = `uid://${this.generateUID()}`;

      // Build .tres file content in Godot's text resource format
      let tresContent = `[gd_resource type="${resourceType}" format=3 uid="${uid}"]\n\n`;
      tresContent += `[resource]\n`;

      // Format properties based on type
      for (const [key, value] of Object.entries(properties)) {
        const formattedValue = this.formatTresValue(value);
        tresContent += `${key} = ${formattedValue}\n`;
      }

      // Write the .tres file
      writeFileSync(fullResourcePath, tresContent, 'utf-8');

      // Build response
      const propertiesReport: string[] = [];
      for (const [key, value] of Object.entries(properties)) {
        propertiesReport.push(`${key} = ${this.formatTresValue(value)}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              resource_path: resourcePath,
              resource_type: resourceType,
              full_path: fullResourcePath,
              uid: uid,
              properties_set: propertiesReport,
              template_used: args.template || null,
              message: `Resource file created at ${resourcePath}. You can load it in Godot editor or via load("res://${resourcePath}").`,
            }, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to create resource: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Check file permissions',
          'Ensure the resource type is valid',
        ]
      );
    }
  }

  /**
   * Format a value for .tres file format
   */
  private formatTresValue(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      // Check if it's already a Godot type like Color(), Vector2(), etc.
      if (value.match(/^(Color|Vector2|Vector3|Vector4|Rect2|Transform2D|Transform3D|Basis|Quaternion|AABB|Plane)\s*\(/)) {
        return value;
      }
      // Regular string - quote it
      return `"${value.replace(/"/g, '\\"')}"`;
    }

    if (typeof value === 'number') {
      // Format numbers - Godot uses decimals for floats
      if (Number.isInteger(value)) {
        return value.toString();
      }
      return value.toFixed(6).replace(/\.?0+$/, '');
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (Array.isArray(value)) {
      // Format as Godot array
      const formattedItems = value.map(item => this.formatTresValue(item));
      return `[${formattedItems.join(', ')}]`;
    }

    if (typeof value === 'object') {
      // Attempt to format as sub-resource or dictionary
      const entries = Object.entries(value);
      const formattedEntries = entries.map(([k, v]) => `"${k}": ${this.formatTresValue(v)}`);
      return `{${formattedEntries.join(', ')}}`;
    }

    return String(value);
  }

  /**
   * Generate a simple UID for import files
   */
  private generateUID(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 13; i++) {
      uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
  }

  /**
   * Generate a short UID hash for imported file paths
   */
  private generateShortUID(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 8; i++) {
      uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
  }

  /**
   * Run the MCP server
   */
  async run() {
    try {
      // Detect Godot path before starting the server
      await this.detectGodotPath();

      if (!this.godotPath) {
        console.error('[SERVER] Failed to find a valid Godot executable path');
        console.error('[SERVER] Please set GODOT_PATH environment variable or provide a valid path');
        process.exit(1);
      }

      // Check if the path is valid
      const isValid = await this.isValidGodotPath(this.godotPath);

      if (!isValid) {
        if (this.strictPathValidation) {
          // In strict mode, exit if the path is invalid
          console.error(`[SERVER] Invalid Godot path: ${this.godotPath}`);
          console.error('[SERVER] Please set a valid GODOT_PATH environment variable or provide a valid path');
          process.exit(1);
        } else {
          // In compatibility mode, warn but continue with the default path
          console.warn(`[SERVER] Warning: Using potentially invalid Godot path: ${this.godotPath}`);
          console.warn('[SERVER] This may cause issues when executing Godot commands');
          console.warn('[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.');
        }
      }

      console.log(`[SERVER] Using Godot at: ${this.godotPath}`);

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Godot MCP server running on stdio');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SERVER] Failed to start:', errorMessage);
      process.exit(1);
    }
  }
}

// Create and run the server
const server = new GodotServer();
server.run().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Failed to run server:', errorMessage);
  process.exit(1);
});
