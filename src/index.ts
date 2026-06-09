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
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync, statSync, copyFileSync, unlinkSync, rmdirSync, createWriteStream } from 'fs';
import { spawn, exec, execSync } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import { tmpdir } from 'os';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// New modular architecture imports
import { ToolRegistry } from './registry.js';
import { ServerContext, OperationParams as OpParams, ToolResponse } from './types.js';
import { registerSceneTools } from './tools/scene.js';
import { registerShaderTools } from './tools/shader.js';
import { registerAnimationTreeTools } from './tools/animation-tree.js';
import { registerRefactorTools } from './tools/refactor.js';
// Tier 2 imports
import { TscnCache } from './utils/tscn-cache.js';
import { registerProjectTools } from './tools/project.js';
import { registerValidateTools } from './tools/validate.js';
import { registerParticleTools } from './tools/particles.js';
import { registerProfilingTools } from './tools/profiling.js';
// Tier 3 imports
import { registerCodeIntelligenceTools } from './tools/code-intelligence.js';
import { registerIntrospectionTools } from './tools/introspection.js';
import { registerAudioTools } from './tools/audio.js';
import { registerViewportTools } from './tools/viewport.js';
// Tier 4 imports
import { registerPlaytestTools } from './tools/playtest.js';
import { registerFunMetricsTools } from './tools/fun-metrics.js';
import { registerAssetGenerationTools } from './tools/asset-generation.js';
// Tier 13 imports
import { registerNetworkingTools } from './tools/networking.js';
// Tier 14 imports
import { registerPhysicsTools } from './tools/physics.js';
// Tier 16 imports
import { registerNavigationTools } from './tools/navigation.js';
import { registerBatchTools } from './tools/batch.js';
import { registerScriptPatchTools } from './tools/script-patch.js';
import { registerProjectFilesystemTools } from './tools/project-filesystem.js';
import { registerResourceWorkflowTools } from './tools/resource-workflow.js';
import { registerUiThemeWorkflowTools } from './tools/ui-theme-workflow.js';
import { registerCameraWorkflowTools } from './tools/camera-workflow.js';
import { registerAudioPlayerWorkflowTools } from './tools/audio-player-workflow.js';
import { registerNodeRefactorWorkflowTools } from './tools/node-refactor-workflow.js';
import { registerDesignToSceneTools } from './tools/design-to-scene.js';
import { registerGameplaySystemTools } from './tools/gameplay-systems.js';
import { registerTestToolingTools } from './tools/test-tooling.js';
import { registerVisualQaTools } from './tools/visual-qa.js';
import {
  getLiveResourceDescriptors,
  readLiveResource,
  registerLiveEditorTools,
} from './tools/live-editor.js';
import { liveSessionManager } from './live/session-manager.js';
import {
  ensureLiveSessionTransportStatus,
  stopLiveSessionTransport,
} from './live/transport.js';

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
  private toolRegistry: ToolRegistry = new ToolRegistry();
  private tscnCache: TscnCache = new TscnCache();
  private listToolsForResources: (() => Promise<{ tools: any[] }>) | null = null;

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
    // Tier 1: Scene manipulation
    'property_name': 'propertyName',
    'property_value': 'propertyValue',
    'keep_children': 'keepChildren',
    'new_name': 'newName',
    'new_parent_path': 'newParentPath',
    // Tier 1: Shader pipeline
    'parameter_name': 'parameterName',
    'parameter_value': 'parameterValue',
    'material_name': 'materialName',
    'albedo_texture': 'albedoTexture',
    'normal_texture': 'normalTexture',
    'roughness_texture': 'roughnessTexture',
    'metallic_texture': 'metallicTexture',
    'emission_texture': 'emissionTexture',
    'ao_texture': 'aoTexture',
    'albedo_color': 'albedoColor',
    'output_dir': 'outputDir',
    // Tier 1: AnimationTree
    'animation_player_path': 'animationPlayerPath',
    'root_type': 'rootType',
    'blend_points': 'blendPoints',
    'blend_mode': 'blendMode',
    'auto_advance': 'autoAdvance',
    'advance_condition': 'advanceCondition',
    'switch_mode': 'switchMode',
    'xfade_time': 'xfadeTime',
    'loop_mode': 'loopMode',
    'library_name': 'libraryName',
    // Tier 1: Refactoring
    'symbol_type': 'symbolType',
    'old_name': 'oldName',
    'dry_run': 'dryRun',
    // Tier 2: Project scaffolding
    'project_name': 'projectName',
    'window_width': 'windowWidth',
    'window_height': 'windowHeight',
    // Tier 2: Particles
    'parent_path': 'parentPath',
    'particle_type': 'particleType',
    'one_shot': 'oneShot',
    'emission_shape': 'emissionShape',
    'emission_sphere_radius': 'emissionSphereRadius',
    'emission_box_extents': 'emissionBoxExtents',
    'emission_ring_radius': 'emissionRingRadius',
    'emission_ring_inner_radius': 'emissionRingInnerRadius',
    'emission_ring_height': 'emissionRingHeight',
    'initial_velocity_min': 'initialVelocityMin',
    'initial_velocity_max': 'initialVelocityMax',
    'scale_amount_min': 'scaleAmountMin',
    'scale_amount_max': 'scaleAmountMax',
    'angular_velocity_min': 'angularVelocityMin',
    'angular_velocity_max': 'angularVelocityMax',
    'damping_min': 'dampingMin',
    'damping_max': 'dampingMax',
    'scale_factor': 'scaleFactor',
    'material_path': 'materialPath',
    // Tier 2: Profiling
    'sample_interval': 'sampleInterval',
    'profiler_id': 'profilerId',
    'target_fps': 'targetFps',
    // Tier 3: Code intelligence
    'script_path': 'scriptPath',
    'class_name': 'className',
    'setup_code': 'setupCode',
    'teardown_code': 'teardownCode',
    'test_dir': 'testDir',
    'test_file': 'testFile',
    'changed_files': 'changedFiles',
    'failure_output': 'failureOutput',
    'source_path': 'sourcePath',
    'test_name': 'testName',
    'include_junit': 'includeJunit',
    'junit_output_path': 'junitOutputPath',
    'exit_on_finish': 'exitOnFinish',
    'allow_network_install': 'allowNetworkInstall',
    'exclude_virtual': 'excludeVirtual',
    'base_class': 'baseClass',
    'methods_to_mock': 'methodsToMock',
    'signals_to_track': 'signalsToTrack',
    // Tier 3: Introspection
    'include_inherited': 'includeInherited',
    'godot_version': 'godotVersion',
    'max_results': 'maxResults',
    // Tier 3: Viewport
    'delay_frames': 'delayFrames',
    // Tier 4: Playtesting
    'duration_seconds': 'durationSeconds',
    'bot_type': 'botType',
    'player_node_path': 'playerNodePath',
    'sample_interval_ms': 'sampleIntervalMs',
    'record_inputs': 'recordInputs',
    'event_hooks': 'eventHooks',
    'session_name': 'sessionName',
    'session_id': 'sessionId',
    'session_ids': 'sessionIds',
    'analysis_types': 'analysisTypes',
    'heatmap_type': 'heatmapType',
    'cell_size': 'cellSize',
    'save_html': 'saveHtml',
    'group_by': 'groupBy',
    // Tier 4: Fun metrics
    'window_seconds': 'windowSeconds',
    'death_weight': 'deathWeight',
    'damage_weight': 'damageWeight',
    'scan_dirs': 'scanDirs',
    // Tier 4: Asset generation
    'transparent_background': 'transparentBackground',
    'test_connectivity': 'testConnectivity',
    // Tier 13: Networking
    'peer_type': 'peerType',
    'mode': 'mode',
    'max_clients': 'maxClients',
    'server_url': 'serverUrl',
    'network_node_path': 'networkNodePath',
    'method_name': 'methodName',
    'call_mode': 'callMode',
    'transfer_mode': 'transferMode',
    'sync': 'sync',
    'action': 'action',
    'spawn_path': 'spawnPath',
    'spawn_limit': 'spawnLimit',
    'spawn_function': 'spawnFunction',
    'sync_properties': 'syncProperties',
    'sync_interval': 'syncInterval',
    'visibility_sync': 'visibilitySync',
    'visibility_update_only': 'visibilityUpdateOnly',
    'replication_interval': 'replicationInterval',
    // Tier 14: Physics
    'physics_type': 'physicsType',
    'mat_path': 'matPath',
    'collision_layer': 'collisionLayer',
    'collision_mask': 'collisionMask',
    'collision_priority': 'collisionPriority',
    'layer_set': 'layerSet',
    'mask_set': 'maskSet',
    'body_path': 'bodyPath',
    'body_name': 'bodyName',
    'body_type': 'bodyType',
    'gravity_scale': 'gravityScale',
    'freeze_enabled': 'freezeEnabled',
    'freeze_mode': 'freezeMode',
    'can_sleep': 'canSleep',
    'lock_rotation': 'lockRotation',
    'continuous_cd': 'continuousCd',
    'add_collision_shape': 'addCollisionShape',
    'shape_type': 'shapeType',
    'shape_size': 'shapeSize',
    'shape_radius': 'shapeRadius',
    'shape_name': 'shapeName',
    'shape_height': 'shapeHeight',
    'one_way_collision': 'oneWayCollision',
    'one_way_margin': 'oneWayMargin',
    'joint_name': 'jointName',
    'joint_type': 'jointType',
    'disable_collisions': 'disableCollisions',
    'motor_enabled': 'motorEnabled',
    'motor_target_velocity': 'motorTargetVelocity',
    'motor_max_force': 'motorMaxForce',
    'angular_limit_lower': 'angularLimitLower',
    'angular_limit_upper': 'angularLimitUpper',
    'linear_limit_lower': 'linearLimitLower',
    'linear_limit_upper': 'linearLimitUpper',
    'spring_length': 'springLength',
    'spring_stiffness': 'springStiffness',
    'spring_damping': 'springDamping',
    // Tier 16: Navigation
    'region_name': 'regionName',
    'cell_height': 'cellHeight',
    'agent_radius': 'agentRadius',
    'agent_height': 'agentHeight',
    'agent_max_slope': 'agentMaxSlope',
    'agent_max_climb': 'agentMaxClimb',
    'source_geometry_mode': 'sourceGeometryMode',
    'agent_name': 'agentName',
    'agent_type': 'agentType',
    'max_speed': 'maxSpeed',
    'path_max_distance': 'pathMaxDistance',
    'path_desired_distance': 'pathDesiredDistance',
    'avoidance_enabled': 'avoidanceEnabled',
    'avoidance_layers': 'avoidanceLayers',
    'avoidance_priority': 'avoidancePriority',
    'navigation_layers': 'navigationLayers',
    'path_post_processing': 'pathPostProcessing',
    'enable_meta_flags': 'enableMetaFlags',
    'link_name': 'linkName',
    'link_type': 'linkType',
    'start_position': 'startPosition',
    'end_position': 'endPosition',
    'start_radius': 'startRadius',
    'end_radius': 'endRadius',
    'travel_cost': 'travelCost',
    'enter_cost': 'enterCost',
    'obstacle_name': 'obstacleName',
    'obstacle_type': 'obstacleType',
    'obstacle_radius': 'obstacleRadius',
    'obstacle_height': 'obstacleHeight',
    'affect_navigation': 'affectNavigation',
    'use_3d_avoidance': 'use3dAvoidance',
    'estimated_radius': 'estimatedRadius',
    'grid_size': 'gridSize',
    'cell_connect_mode': 'cellConnectMode',
    'default_heuristic': 'defaultHeuristic',
    'solid_point_weight': 'solidPointWeight',
    'default_point_weight': 'defaultPointWeight',
    'jumping_enabled': 'jumpingEnabled',
    'diagonal_mode': 'diagonalMode',
    'server_type': 'serverType',
    'avoidance_time_horizon': 'avoidanceTimeHorizon',
    'avoidance_max_neighbors': 'avoidanceMaxNeighbors',
    'avoidance_max_speed': 'avoidanceMaxSpeed',
    'avoidance_radius_scale': 'avoidanceRadiusScale',
    'edge_connection_margin': 'edgeConnectionMargin',
    'use_edge_connections': 'useEdgeConnections',
    'border_size': 'borderSize',
    'iteration_cost': 'iterationCost',
    // Phase 1 enhancements
    'rollback_on_error': 'rollbackOnError',
    'continue_on_error': 'continueOnError',
    'max_commands': 'maxCommands',
    'timeout_ms': 'timeoutMs',
    'allow_recursive_batch': 'allowRecursiveBatch',
    'declared_touched_paths': 'declaredTouchedPaths',
    'anchor_type': 'anchorType',
    'patch_text': 'patchText',
    'replacement_text': 'replacementText',
    'start_line': 'startLine',
    'end_line': 'endLine',
    'validate_after': 'validateAfter',
    'allow_append_fallback': 'allowAppendFallback',
    'include_properties': 'includeProperties',
    'references': 'references',
    'uid': 'uid',
    'dimension': 'dimension',
    'points': 'points',
    'fill': 'fill',
    'seed': 'seed',
    'frequency': 'frequency',
    'noise_type': 'noiseType',
    'seamless': 'seamless',
    'as_normal_map': 'asNormalMap',
    'min_value': 'minValue',
    'max_value': 'maxValue',
    'bake_resolution': 'bakeResolution',
    'background_mode': 'backgroundMode',
    'background_color': 'backgroundColor',
    'ambient_light_color': 'ambientLightColor',
    'ambient_light_energy': 'ambientLightEnergy',
    'glow_enabled': 'glowEnabled',
    'ssao_enabled': 'ssaoEnabled',
    'visual_node_path': 'visualNodePath',
    'replace_existing': 'replaceExisting',
    'overwrite': 'overwrite',
    'root_name': 'rootName',
    'root_size': 'rootSize',
    'theme_path': 'themePath',
    'keep_offsets': 'keepOffsets',
    'override_type': 'overrideType',
    'theme_type': 'themeType',
    'default_font_size': 'defaultFontSize',
    'font_sizes': 'fontSizes',
    'bg_color': 'bgColor',
    'border_color': 'borderColor',
    'border_width': 'borderWidth',
    'corner_radius': 'cornerRadius',
    'content_margin': 'contentMargin',
    'viewport_size': 'viewportSize',
    'safe_margin': 'safeMargin',
    'min_touch_size': 'minTouchSize',
    'camera_name': 'cameraName',
    'camera_type': 'cameraType',
    'camera_path': 'cameraPath',
    'make_current': 'makeCurrent',
    'ignore_rotation': 'ignoreRotation',
    'drag_horizontal_enabled': 'dragHorizontalEnabled',
    'drag_vertical_enabled': 'dragVerticalEnabled',
    'drag_margins': 'dragMargins',
    'keep_aspect': 'keepAspect',
    'cull_mask': 'cullMask',
    'h_offset': 'hOffset',
    'v_offset': 'vOffset',
    'target_path': 'targetPath',
    'follow_offset': 'followOffset',
    'update_mode': 'updateMode',
    'overwrite_script': 'overwriteScript',
    'limit_left': 'limitLeft',
    'limit_right': 'limitRight',
    'limit_top': 'limitTop',
    'limit_bottom': 'limitBottom',
    'limit_enabled': 'limitEnabled',
    'limit_smoothed': 'limitSmoothed',
    'editor_draw_limits': 'editorDrawLimits',
    'position_smoothing_enabled': 'positionSmoothingEnabled',
    'position_smoothing_speed': 'positionSmoothingSpeed',
    'rotation_smoothing_enabled': 'rotationSmoothingEnabled',
    'rotation_smoothing_speed': 'rotationSmoothingSpeed',
    'include_bounds': 'includeBounds',
    'player_name': 'playerName',
    'player_type': 'playerType',
    'player_path': 'playerPath',
    'stream_path': 'streamPath',
    'volume_db': 'volumeDb',
    'pitch_scale': 'pitchScale',
    'from_position': 'fromPosition',
    'max_distance': 'maxDistance',
    'area_mask': 'areaMask',
    'panning_strength': 'panningStrength',
    'max_polyphony': 'maxPolyphony',
    'include_routes': 'includeRoutes',
    'allowed_buses': 'allowedBuses',
    'require_stream': 'requireStream',
    'scene_paths': 'scenePaths',
    'group_name': 'groupName',
    'property_filters': 'propertyFilters',
    'include_connections': 'includeConnections',
    'include_dependencies': 'includeDependencies',
    'include_scripts': 'includeScripts',
    'new_type': 'newType',
    'preserve_name': 'preserveName',
    'preserve_children': 'preserveChildren',
    'preserve_groups': 'preserveGroups',
    'preserve_script': 'preserveScript',
    'keep_global_transform': 'keepGlobalTransform',
    'before_path': 'beforePath',
    'after_path': 'afterPath',
    'diff_output_path': 'diffOutputPath',
    'current_path': 'currentPath',
    'baseline_name': 'baselineName',
    'baseline_path': 'baselinePath',
    'threshold_ratio': 'thresholdRatio',
    'pixel_threshold': 'pixelThreshold',
    'min_overlap_area': 'minOverlapArea',
    'min_ratio': 'minRatio',
    'target_paths': 'targetPaths',
    'include_hidden': 'includeHidden',
    'viewport_index': 'viewportIndex',
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
          resources: {},
          tools: {},
        },
      }
    );

    // Set up tool handlers
    this.setupToolHandlers();
    this.setupResourceHandlers();
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
    stopLiveSessionTransport();
    liveSessionManager.clear();
    if (this.activeProcess) {
      this.logDebug('Killing active Godot process');
      this.activeProcess.process.kill();
      this.activeProcess = null;
    }
    await this.server.close();
  }

  /**
   * Create a ServerContext object that tool modules can use to access shared functionality.
   * This decouples tool implementations from the GodotServer class.
   */
  public getServerContext(): ServerContext {
    return {
      logDebug: (msg: string) => this.logDebug(msg),
      createErrorResponse: (msg: string, solutions?: string[]) => this.createErrorResponse(msg, solutions),
      validatePath: (path: string) => this.validatePath(path),
      executeOperation: (op: string, params: OperationParams, projectPath: string) =>
        this.executeOperation(op, params, projectPath),
      validateScript: (params: { projectPath: string; scriptPath: string; scriptContent?: string }) =>
        this.handleValidateScript(params),
      normalizeParameters: (params: OperationParams) => this.normalizeParameters(params),
      convertCamelToSnakeCase: (params: OperationParams) => this.convertCamelToSnakeCase(params),
      parseGodotErrors: (lines: string[]) => this.parseGodotErrors(lines),
      formatTresValue: (value: any) => this.formatTresValue(value),
      generateUID: () => this.generateUID(),
      generateShortUID: () => this.generateShortUID(),
      isGodot44OrLater: (version: string) => this.isGodot44OrLater(version),
      getGodotPath: async () => {
        if (!this.godotPath) await this.detectGodotPath();
        return this.godotPath || '';
      },
      formatProjectSettingValue: (value: any) => this.formatProjectSettingValue(value),
      escapeCsvValue: (value: string) => this.escapeCsvValue(value),
      parseCsvLine: (line: string) => this.parseCsvLine(line),
      escapePoString: (value: string) => this.escapePoString(value),
      escapeRegex: (value: string) => this.escapeRegex(value),
      extractPlaceholders: (text: string) => this.extractPlaceholders(text),
      getOrParseTscn: (filePath: string) => this.tscnCache.getOrParse(filePath),
      invalidateTscnCache: (filePath: string) => this.tscnCache.invalidate(filePath),
    };
  }

  /**
   * Register new modular tools with the tool registry.
   * Called during setupToolHandlers to load all Tier 1+ tools.
   */
  private registerModularTools(): void {
    const ctx = this.getServerContext();
    // Tier 1
    registerSceneTools(this.toolRegistry, ctx);
    registerShaderTools(this.toolRegistry, ctx);
    registerAnimationTreeTools(this.toolRegistry, ctx);
    registerRefactorTools(this.toolRegistry, ctx);
    // Tier 2
    registerProjectTools(this.toolRegistry, ctx);
    registerValidateTools(this.toolRegistry, ctx);
    registerParticleTools(this.toolRegistry, ctx);
    registerProfilingTools(this.toolRegistry, ctx);
    // Tier 3
    registerCodeIntelligenceTools(this.toolRegistry, ctx);
    registerIntrospectionTools(this.toolRegistry, ctx);
    registerAudioTools(this.toolRegistry, ctx);
    registerViewportTools(this.toolRegistry, ctx);
    // Tier 4
    registerPlaytestTools(this.toolRegistry, ctx);
    registerFunMetricsTools(this.toolRegistry, ctx);
    registerAssetGenerationTools(this.toolRegistry, ctx);
    // Tier 13
    registerNetworkingTools(this.toolRegistry, ctx);
    // Tier 14
    registerPhysicsTools(this.toolRegistry, ctx);
    // Tier 16
    registerNavigationTools(this.toolRegistry, ctx);
    // Phase 1 enhancements
    registerBatchTools(this.toolRegistry, ctx);
    registerScriptPatchTools(this.toolRegistry, ctx);
    registerProjectFilesystemTools(this.toolRegistry, ctx);
    registerResourceWorkflowTools(this.toolRegistry, ctx);
    registerUiThemeWorkflowTools(this.toolRegistry, ctx);
    registerCameraWorkflowTools(this.toolRegistry, ctx);
    registerAudioPlayerWorkflowTools(this.toolRegistry, ctx);
    registerNodeRefactorWorkflowTools(this.toolRegistry, ctx);
    registerDesignToSceneTools(this.toolRegistry, ctx);
    registerGameplaySystemTools(this.toolRegistry, ctx);
    registerTestToolingTools(this.toolRegistry, ctx);
    registerLiveEditorTools(this.toolRegistry, {
      manager: liveSessionManager,
      getTransportStatus: () => ensureLiveSessionTransportStatus(liveSessionManager, {
        sharedSecret: process.env.GODOT_MCP_LIVE_SECRET,
        onError: (message) => console.error(`[LIVE] ${message}`),
      }),
    });
    registerVisualQaTools(this.toolRegistry, ctx);
    this.logDebug(`Registered ${this.toolRegistry.size} modular tools`);
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

    // Most modern GDScript operations expect snake_case, but some legacy
    // operations still read camelCase keys directly.
    const operationParams = this.usesCamelCaseGodotParams(operation)
      ? params
      : this.convertCamelToSnakeCase(params);
    this.logDebug(`Godot operation params: ${JSON.stringify(operationParams)}`);


    // Ensure godotPath is set
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        throw new Error('Could not find a valid Godot executable path');
      }
    }

    try {
      // Serialize the snake_case parameters to a valid JSON string
      const paramsJson = JSON.stringify(operationParams);
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
      const logFilePath = join(tmpdir(), `godot-mcp-${operation}-${process.pid}-${Date.now()}.log`);

      // Construct the command with the operation and JSON parameters
      const cmd = [
        `"${this.godotPath}"`,
        '--headless',
        '--log-file',
        `"${logFilePath}"`,
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

      return { stdout, stderr: this.sanitizeGodotStderr(stderr) };
    } catch (error: unknown) {
      // If execAsync throws, it still contains stdout/stderr
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string };
        return {
          stdout: execError.stdout,
          stderr: this.sanitizeGodotStderr(execError.stderr),
        };
      }

      throw error;
    }
  }

  private usesCamelCaseGodotParams(operation: string): boolean {
    return new Set([
      'list_signals',
      'list_connections',
      'connect_signal',
      'disconnect_signal',
      'validate_connection',
      'analyze_script',
      'create_script',
      'modify_function',
      'add_export_variable',
      'extract_dependencies',
      'attach_script',
    ]).has(operation);
  }

  private sanitizeGodotStderr(stderr: string): string {
    if (!stderr) return stderr;

    return stderr
      .replace(/ERROR: Condition "ret != noErr" is true\. Returning: ""\n\s*at: get_system_ca_certificates[^\n]*\n?/g, '')
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        return !(
          /RIDs? of type .* were leaked/.test(trimmed) ||
          /RID allocations of type .* were leaked at exit/.test(trimmed) ||
          trimmed.includes('ObjectDB instances leaked at exit') ||
          trimmed.includes('resources still in use at exit') ||
          trimmed.includes('at: _free_rids') ||
          trimmed.includes('at: cleanup (core/object/object.cpp') ||
          trimmed.includes('at: clear (core/io/resource.cpp')
        );
      })
      .join('\n')
      .trim();
  }

  /**
   * Extract a JSON payload from Godot operation stdout.
   * The shared GDScript operations runner prints diagnostic lines before
   * operation results, so legacy handlers should not parse stdout wholesale.
   */
  private parseJsonFromGodotStdout(stdout: string): any {
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (
        (line.startsWith('{') && line.endsWith('}')) ||
        (line.startsWith('[') && line.endsWith(']') && !line.startsWith('[INFO]') && !line.startsWith('[DEBUG]'))
      ) {
        return JSON.parse(line);
      }
    }

    const objectStart = stdout.indexOf('{');
    const objectEnd = stdout.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
      return JSON.parse(stdout.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = stdout.indexOf('[');
    const arrayEnd = stdout.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(stdout.slice(arrayStart, arrayEnd + 1));
    }

    throw new Error('No JSON payload found in Godot stdout');
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
    // Register new modular tools (Tier 1+)
    this.registerModularTools();

    // Define available tools (legacy + modular)
    this.listToolsForResources = async () => ({
      tools: [
        // --- Modular tools from registry ---
        ...this.toolRegistry.getToolDefinitions(),
        // --- Legacy tools (will be migrated to registry incrementally) ---
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
        {
          name: 'modify_project_setting',
          description: 'Modify project.godot settings programmatically. Supports window size, application name, rendering method, physics gravity, and other project settings.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              settingPath: {
                type: 'string',
                description: 'Path in project settings (e.g., "display/window/size/viewport_width", "application/config/name", "physics/2d/default_gravity")',
              },
              value: {
                description: 'New value for the setting (string, number, boolean, or array)',
              },
            },
            required: ['projectPath', 'settingPath', 'value'],
          },
        },
        {
          name: 'configure_input_action',
          description: 'Create or modify input action maps in project.godot. Configure keyboard, mouse, and gamepad bindings for game actions.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              actionName: {
                type: 'string',
                description: 'Name of the input action (e.g., "jump", "move_left", "attack")',
              },
              events: {
                type: 'array',
                description: 'Array of input events to bind to the action',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['key', 'mouse_button', 'joypad_button', 'joypad_axis'],
                      description: 'Type of input event',
                    },
                    keycode: {
                      type: 'string',
                      description: 'For key events: key name (e.g., "Space", "W", "Escape", "Up")',
                    },
                    button: {
                      type: 'integer',
                      description: 'For mouse/joypad button events: button index (0=left, 1=right, 2=middle for mouse)',
                    },
                    axis: {
                      type: 'integer',
                      description: 'For joypad axis events: axis index (0=left_x, 1=left_y, 2=right_x, 3=right_y)',
                    },
                    axisValue: {
                      type: 'number',
                      description: 'For joypad axis: axis direction (-1.0 or 1.0)',
                    },
                  },
                  required: ['type'],
                },
              },
              deadzone: {
                type: 'number',
                description: 'Input deadzone (0.0 - 1.0), default is 0.5',
              },
            },
            required: ['projectPath', 'actionName', 'events'],
          },
        },
        {
          name: 'setup_render_layers',
          description: 'Configure physics and render layer names in project settings. Layer names improve editor usability and code readability.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              layerType: {
                type: 'string',
                enum: ['2d_physics', '3d_physics', '2d_render', '3d_render'],
                description: 'Type of layers to configure',
              },
              layerNames: {
                type: 'object',
                description: 'Layer number → name mapping (e.g., {"1": "Player", "2": "Enemy", "3": "World"}). Layer numbers are 1-32 for physics, 1-20 for render.',
                additionalProperties: {
                  type: 'string',
                },
              },
            },
            required: ['projectPath', 'layerType', 'layerNames'],
          },
        },
        {
          name: 'configure_autoload',
          description: 'Add or remove autoload singletons (global scripts) in project settings. Autoloads are accessible globally at runtime.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              name: {
                type: 'string',
                description: 'Name for the singleton (e.g., "GameManager", "AudioManager")',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to script (e.g., "res://autoload/game_manager.gd") or scene file',
              },
              enabled: {
                type: 'boolean',
                description: 'Whether the autoload is enabled (default: true)',
              },
              remove: {
                type: 'boolean',
                description: 'Set to true to remove the autoload instead of adding/updating it',
              },
            },
            required: ['projectPath', 'name'],
          },
        },
        {
          name: 'create_export_preset',
          description: 'Generate export presets for target platforms (Windows, Linux, macOS, Web, Android, iOS). Creates or updates export_presets.cfg in the project directory.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              presetName: {
                type: 'string',
                description: 'Name for the export preset (e.g., "Windows Release", "Web Build")',
              },
              platform: {
                type: 'string',
                enum: ['Windows Desktop', 'Linux/X11', 'macOS', 'Web', 'Android', 'iOS'],
                description: 'Target platform for the export',
              },
              exportPath: {
                type: 'string',
                description: 'Default export path for the built game (e.g., "builds/windows/game.exe")',
              },
              runnable: {
                type: 'boolean',
                description: 'Make this preset the runnable one (used for one-click deploy)',
              },
              debugMode: {
                type: 'boolean',
                description: 'Enable debug mode for the export (default: false for release builds)',
              },
              includeFilter: {
                type: 'string',
                description: 'File patterns to include (comma-separated, e.g., "*.json,*.cfg")',
              },
              excludeFilter: {
                type: 'string',
                description: 'File patterns to exclude (comma-separated, e.g., "*.md,test/*")',
              },
              encryptionKey: {
                type: 'string',
                description: 'Optional 256-bit AES encryption key for PCK files (64 hex characters)',
              },
            },
            required: ['projectPath', 'presetName', 'platform'],
          },
        },
        {
          name: 'export_project',
          description: 'Build/export a Godot project for a specific platform using an existing export preset. Creates executable, PCK, or web build.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              presetName: {
                type: 'string',
                description: 'Name of the export preset to use (must exist in export_presets.cfg)',
              },
              outputPath: {
                type: 'string',
                description: 'Path where the exported game will be saved (e.g., "builds/game.exe")',
              },
              releaseMode: {
                type: 'boolean',
                description: 'Use release export (optimized, no debug symbols). Default: true',
              },
              packOnly: {
                type: 'boolean',
                description: 'Generate only the PCK file (for updates/patches). Default: false',
              },
            },
            required: ['projectPath', 'presetName', 'outputPath'],
          },
        },
        {
          name: 'validate_export',
          description: 'Check a Godot project for export issues before building. Validates resources, dependencies, scripts, and export templates.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              presetName: {
                type: 'string',
                description: 'Optional: specific export preset to validate against',
              },
              checkTemplates: {
                type: 'boolean',
                description: 'Check if required export templates are installed (default: true)',
              },
              checkScripts: {
                type: 'boolean',
                description: 'Validate all GDScript files for syntax errors (default: true)',
              },
              warnLargeAssets: {
                type: 'boolean',
                description: 'Warn about large asset files (default: true)',
              },
              largeAssetThreshold: {
                type: 'number',
                description: 'Size in MB above which assets are considered large (default: 10)',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'create_tilemap',
          description: 'Create a TileMap node in a scene with a configured TileSet. Supports Godot 4.x TileMap format with layers.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project, e.g., "scenes/level.tscn")',
              },
              tilemapName: {
                type: 'string',
                description: 'Name for the TileMap node (default: "TileMap")',
              },
              parentPath: {
                type: 'string',
                description: 'NodePath to parent node (default: "." for root)',
              },
              tileSize: {
                type: 'object',
                description: 'Size of each tile in pixels (e.g., {x: 16, y: 16})',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
              },
              tilesetPath: {
                type: 'string',
                description: 'Optional: path to existing TileSet resource (.tres)',
              },
              layers: {
                type: 'array',
                description: 'Optional: array of layer names to create',
                items: { type: 'string' },
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'paint_tiles',
          description: 'Place tiles programmatically in a TileMap. Supports single tiles, rectangular regions, and bulk operations.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file containing the TileMap',
              },
              tilemapPath: {
                type: 'string',
                description: 'NodePath to the TileMap node in the scene',
              },
              layer: {
                type: 'number',
                description: 'Layer index to paint on (default: 0)',
              },
              sourceId: {
                type: 'number',
                description: 'TileSet source ID (default: 0)',
              },
              tiles: {
                type: 'array',
                description: 'Array of tiles to paint: [{x, y, atlasCoords: {x, y}}]',
                items: {
                  type: 'object',
                  properties: {
                    x: { type: 'number', description: 'Cell X coordinate' },
                    y: { type: 'number', description: 'Cell Y coordinate' },
                    atlasCoords: {
                      type: 'object',
                      description: 'Atlas coordinates of the tile in the TileSet',
                      properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                      },
                    },
                  },
                },
              },
              pattern: {
                type: 'string',
                enum: ['single', 'rect', 'line', 'erase'],
                description: 'Painting pattern type (default: "single")',
              },
              rectStart: {
                type: 'object',
                description: 'Start position for rect/line patterns',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
              },
              rectEnd: {
                type: 'object',
                description: 'End position for rect/line patterns',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
              },
            },
            required: ['projectPath', 'scenePath', 'tilemapPath'],
          },
        },
        {
          name: 'configure_tileset',
          description: 'Configure tile properties in a TileSet resource including collisions, navigation, and terrain sets.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              tilesetPath: {
                type: 'string',
                description: 'Path to TileSet resource (.tres) relative to project',
              },
              texturePath: {
                type: 'string',
                description: 'Path to texture atlas for TileSet source',
              },
              tileSize: {
                type: 'object',
                description: 'Size of each tile in the atlas',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
              },
              tileConfig: {
                type: 'array',
                description: 'Array of tile configurations',
                items: {
                  type: 'object',
                  properties: {
                    atlasCoords: {
                      type: 'object',
                      description: 'Atlas coordinates of the tile',
                      properties: { x: { type: 'number' }, y: { type: 'number' } },
                    },
                    collision: {
                      type: 'array',
                      description: 'Collision polygon points [[x1,y1], [x2,y2], ...]',
                      items: { type: 'array', items: { type: 'number' } },
                    },
                    navigation: {
                      type: 'array',
                      description: 'Navigation polygon points [[x1,y1], [x2,y2], ...]',
                      items: { type: 'array', items: { type: 'number' } },
                    },
                    terrainSet: {
                      type: 'number',
                      description: 'Terrain set ID for autotiling',
                    },
                    terrain: {
                      type: 'number',
                      description: 'Terrain ID within the terrain set',
                    },
                  },
                },
              },
              physicsLayer: {
                type: 'number',
                description: 'Physics layer index for collisions (default: 0)',
              },
              navigationLayer: {
                type: 'number',
                description: 'Navigation layer index (default: 0)',
              },
            },
            required: ['projectPath', 'tilesetPath'],
          },
        },
        // Phase 11: Dialogue & Localization Management
        {
          name: 'create_translation_file',
          description: 'Create a new translation file for localization (CSV, PO, or Godot translation format).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              translationPath: {
                type: 'string',
                description: 'Output path for translation file (e.g., "localization/translations.csv")',
              },
              format: {
                type: 'string',
                enum: ['csv', 'po'],
                description: 'Translation file format (default: "csv")',
              },
              locales: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of locale codes (e.g., ["en", "es", "fr", "de", "ja"])',
              },
              initialKeys: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    translations: { type: 'object' },
                  },
                },
                description: 'Initial translation keys to add',
              },
            },
            required: ['projectPath', 'translationPath', 'locales'],
          },
        },
        {
          name: 'add_translation',
          description: 'Add or update a translation entry in an existing translation file.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              translationPath: {
                type: 'string',
                description: 'Path to the translation file',
              },
              key: {
                type: 'string',
                description: 'Translation key (e.g., "MENU_START", "DIALOG_GREETING")',
              },
              translations: {
                type: 'object',
                description: 'Locale to translation mapping (e.g., {"en": "Hello", "es": "Hola"})',
              },
              context: {
                type: 'string',
                description: 'Context hint for translators (PO format only)',
              },
              comment: {
                type: 'string',
                description: 'Comment for translators',
              },
            },
            required: ['projectPath', 'translationPath', 'key', 'translations'],
          },
        },
        {
          name: 'remove_translation',
          description: 'Remove translation keys from a translation file.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              translationPath: {
                type: 'string',
                description: 'Path to the translation file',
              },
              keys: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of translation keys to remove',
              },
              pattern: {
                type: 'string',
                description: 'Regex pattern to match keys for removal',
              },
              dryRun: {
                type: 'boolean',
                description: 'Preview removals without modifying file (default: false)',
              },
            },
            required: ['projectPath', 'translationPath'],
          },
        },
        {
          name: 'validate_translations',
          description: 'Validate translation files for completeness and consistency.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              translationPath: {
                type: 'string',
                description: 'Path to translation file or directory',
              },
              referenceLocale: {
                type: 'string',
                description: 'Base locale to compare against (default: "en" or first locale)',
              },
              checkPlaceholders: {
                type: 'boolean',
                description: 'Verify placeholders match across translations (default: true)',
              },
              reportUnused: {
                type: 'boolean',
                description: 'Find keys not used in scripts (default: false)',
              },
            },
            required: ['projectPath', 'translationPath'],
          },
        },
        {
          name: 'create_dialogue_resource',
          description: 'Create a dialogue resource for in-game conversations with branching support.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              dialoguePath: {
                type: 'string',
                description: 'Output path for dialogue resource (e.g., "dialogues/intro.tres")',
              },
              dialogueId: {
                type: 'string',
                description: 'Unique identifier for this dialogue',
              },
              entries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Entry ID' },
                    speaker: { type: 'string', description: 'Speaker character ID' },
                    text: { type: 'string', description: 'Translation key for dialogue text' },
                    choices: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          text: { type: 'string' },
                          nextId: { type: 'string' },
                          condition: { type: 'string' },
                        },
                      },
                    },
                    nextId: { type: 'string', description: 'Next entry ID (for linear flow)' },
                    signals: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Signals to emit when this entry is shown',
                    },
                  },
                },
                description: 'Dialogue entries in sequence',
              },
              characters: {
                type: 'object',
                description: 'Character metadata (portraits, colors, voice)',
              },
              variables: {
                type: 'array',
                items: { type: 'string' },
                description: 'Dialogue-local variable names',
              },
            },
            required: ['projectPath', 'dialoguePath', 'dialogueId', 'entries'],
          },
        },
        {
          name: 'configure_localization',
          description: 'Configure project localization settings in project.godot.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              locales: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of supported locales to add (e.g., ["en", "es", "fr"])',
              },
              translationFiles: {
                type: 'array',
                items: { type: 'string' },
                description: 'Paths to translation files to register',
              },
              fallbackLocale: {
                type: 'string',
                description: 'Locale to use when translation missing (default: "en")',
              },
              testLocale: {
                type: 'string',
                description: 'Override locale for testing',
              },
              removeLocales: {
                type: 'array',
                items: { type: 'string' },
                description: 'Locales to remove from project',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'extract_translatable_strings',
          description: 'Scan project files to extract strings that need translation.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              outputPath: {
                type: 'string',
                description: 'Output file for extracted strings',
              },
              outputFormat: {
                type: 'string',
                enum: ['csv', 'po', 'json'],
                description: 'Output format (default: "csv")',
              },
              scanPaths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific paths to scan (default: entire project)',
              },
              includeScenes: {
                type: 'boolean',
                description: 'Scan .tscn files for UI text (default: true)',
              },
              excludePatterns: {
                type: 'array',
                items: { type: 'string' },
                description: 'Patterns to exclude (e.g., ["test/*", "addons/*"])',
              },
            },
            required: ['projectPath'],
          },
        },
        // Phase 12: Plugin Management
        {
          name: 'list_plugins',
          description: 'List all installed plugins in a Godot project with their configuration status.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              includeBuiltin: {
                type: 'boolean',
                description: 'Include editor built-in plugins (default: false)',
              },
              verbose: {
                type: 'boolean',
                description: 'Include full plugin.cfg contents (default: false)',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'configure_plugin',
          description: 'Enable, disable, or configure plugin settings in project.godot.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              pluginId: {
                type: 'string',
                description: 'Plugin folder name in addons/ directory',
              },
              enabled: {
                type: 'boolean',
                description: 'Enable (true) or disable (false) the plugin',
              },
              settings: {
                type: 'object',
                description: 'Plugin-specific settings to configure',
                additionalProperties: true,
              },
            },
            required: ['projectPath', 'pluginId'],
          },
        },
        {
          name: 'create_plugin',
          description: 'Generate a new plugin scaffold with plugin.cfg, main script, and directory structure.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              pluginId: {
                type: 'string',
                description: 'Plugin folder name (snake_case recommended)',
              },
              pluginName: {
                type: 'string',
                description: 'Display name for the plugin',
              },
              author: {
                type: 'string',
                description: 'Plugin author name',
              },
              description: {
                type: 'string',
                description: 'Plugin description',
              },
              version: {
                type: 'string',
                description: 'Initial version (default: "1.0.0")',
              },
              template: {
                type: 'string',
                enum: ['basic', 'dock', 'inspector', 'import', 'tool'],
                description: 'Plugin template type (default: "basic")',
              },
              autoEnable: {
                type: 'boolean',
                description: 'Enable plugin after creation (default: false)',
              },
            },
            required: ['projectPath', 'pluginId', 'pluginName', 'author'],
          },
        },
        {
          name: 'install_plugin',
          description: 'Install plugins from the Godot Asset Library or Git repositories.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              source: {
                type: 'string',
                enum: ['asset_library', 'git'],
                description: 'Installation source: "asset_library" or "git"',
              },
              assetId: {
                type: 'number',
                description: 'Asset Library asset ID (for asset_library source)',
              },
              searchQuery: {
                type: 'string',
                description: 'Search Asset Library by name (for asset_library source)',
              },
              gitUrl: {
                type: 'string',
                description: 'Git repository URL (for git source)',
              },
              gitBranch: {
                type: 'string',
                description: 'Git branch/tag to checkout (default: "main")',
              },
              gitSubfolder: {
                type: 'string',
                description: 'Subfolder within repo containing addon (default: "addons/")',
              },
              autoEnable: {
                type: 'boolean',
                description: 'Enable plugin after installation (default: false)',
              },
              overwrite: {
                type: 'boolean',
                description: 'Overwrite existing plugin (default: false)',
              },
            },
            required: ['projectPath', 'source'],
          },
        },
      ],
    });

    this.server.setRequestHandler(ListToolsRequestSchema, this.listToolsForResources);

    // Handle tool calls — registry-first dispatch with legacy fallback
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logDebug(`Handling tool request: ${request.params.name}`);

      // Check modular tool registry first
      if (this.toolRegistry.has(request.params.name)) {
        return await this.toolRegistry.dispatch(request.params.name, request.params.arguments);
      }

      // Legacy dispatch for existing tools
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
        case 'modify_project_setting':
          return await this.handleModifyProjectSetting(request.params.arguments);
        case 'configure_input_action':
          return await this.handleConfigureInputAction(request.params.arguments);
        case 'setup_render_layers':
          return await this.handleSetupRenderLayers(request.params.arguments);
        case 'configure_autoload':
          return await this.handleConfigureAutoload(request.params.arguments);
        case 'create_export_preset':
          return await this.handleCreateExportPreset(request.params.arguments);
        case 'export_project':
          return await this.handleExportProject(request.params.arguments);
        case 'validate_export':
          return await this.handleValidateExport(request.params.arguments);
        case 'create_tilemap':
          return await this.handleCreateTilemap(request.params.arguments);
        case 'paint_tiles':
          return await this.handlePaintTiles(request.params.arguments);
        case 'configure_tileset':
          return await this.handleConfigureTileset(request.params.arguments);
        // Phase 11: Dialogue & Localization Management
        case 'create_translation_file':
          return await this.handleCreateTranslationFile(request.params.arguments);
        case 'add_translation':
          return await this.handleAddTranslation(request.params.arguments);
        case 'remove_translation':
          return await this.handleRemoveTranslation(request.params.arguments);
        case 'validate_translations':
          return await this.handleValidateTranslations(request.params.arguments);
        case 'create_dialogue_resource':
          return await this.handleCreateDialogueResource(request.params.arguments);
        case 'configure_localization':
          return await this.handleConfigureLocalization(request.params.arguments);
        case 'extract_translatable_strings':
          return await this.handleExtractTranslatableStrings(request.params.arguments);
        // Phase 12: Plugin Management
        case 'list_plugins':
          return await this.handleListPlugins(request.params.arguments);
        case 'configure_plugin':
          return await this.handleConfigurePlugin(request.params.arguments);
        case 'create_plugin':
          return await this.handleCreatePlugin(request.params.arguments);
        case 'install_plugin':
          return await this.handleInstallPlugin(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  /**
   * Set up read-only MCP resources for clients that inspect resources/list.
   * These resources intentionally describe the tool surface; tool execution
   * remains available only through tools/call.
   */
  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: await this.getMcpResources(),
    }));

    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: [
        {
          uriTemplate: 'godot-mcp://tools/{name}',
          name: 'Godot MCP tool definition',
          description: 'Read the description and input schema for an individual Godot MCP tool.',
          mimeType: 'application/json',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resource = await this.readMcpResource(request.params.uri);
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: 'application/json',
            text: JSON.stringify(resource, null, 2),
          },
        ],
      };
    });
  }

  private async getAvailableToolDefinitions(): Promise<any[]> {
    if (!this.listToolsForResources) {
      return this.toolRegistry.getToolDefinitions();
    }

    const result = await this.listToolsForResources();
    return result.tools;
  }

  private async getMcpResources(): Promise<any[]> {
    const tools = await this.getAvailableToolDefinitions();
    const toolResources = tools.map((tool) => ({
      uri: this.getToolResourceUri(tool.name),
      name: `Tool: ${tool.name}`,
      description: tool.description,
      mimeType: 'application/json',
    }));

    return [
      {
        uri: 'godot-mcp://server/info',
        name: 'Godot MCP server info',
        description: 'Server capabilities, configured Godot path, and resource compatibility notes.',
        mimeType: 'application/json',
      },
      {
        uri: 'godot-mcp://tools/catalog',
        name: 'Godot MCP tool catalog',
        description: 'Complete list of Godot MCP tools with descriptions and input schemas.',
        mimeType: 'application/json',
      },
      {
        uri: 'godot-mcp://runtime/debug-output',
        name: 'Godot runtime debug output',
        description: 'Current captured output for the active Godot process, if one is running.',
        mimeType: 'application/json',
      },
      ...getLiveResourceDescriptors(),
      ...toolResources,
    ];
  }

  private getToolResourceUri(toolName: string): string {
    return `godot-mcp://tools/${encodeURIComponent(toolName)}`;
  }

  private async readMcpResource(uri: string): Promise<any> {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new McpError(ErrorCode.InvalidParams, `Invalid resource URI: ${uri}`);
    }

    if (parsed.protocol !== 'godot-mcp:') {
      throw new McpError(ErrorCode.InvalidParams, `Unsupported resource URI scheme: ${parsed.protocol}`);
    }

    const resourcePath = parsed.pathname.replace(/^\//, '');

    if (parsed.hostname === 'server' && resourcePath === 'info') {
      const tools = await this.getAvailableToolDefinitions();
      return {
        name: 'godot-mcp',
        version: '0.1.0',
        capabilities: {
          resources: true,
          tools: true,
        },
        godotPath: this.godotPath,
        configuredGodotPath: process.env.GODOT_PATH || null,
        operationsScriptPath: this.operationsScriptPath,
        strictPathValidation: this.strictPathValidation,
        toolCount: tools.length,
        resources: [
          'godot-mcp://server/info',
          'godot-mcp://tools/catalog',
          'godot-mcp://runtime/debug-output',
          ...getLiveResourceDescriptors().map((resource) => resource.uri),
          'godot-mcp://tools/{name}',
        ],
        note: 'These resources expose read-only metadata for resource-oriented MCP clients. Use MCP tools/call to execute Godot operations.',
      };
    }

    if (parsed.hostname === 'tools' && resourcePath === 'catalog') {
      const tools = await this.getAvailableToolDefinitions();
      return {
        count: tools.length,
        tools,
      };
    }

    if (parsed.hostname === 'tools' && resourcePath) {
      const toolName = decodeURIComponent(resourcePath);
      const tools = await this.getAvailableToolDefinitions();
      const tool = tools.find((candidate) => candidate.name === toolName);

      if (!tool) {
        throw new McpError(ErrorCode.InvalidParams, `Tool resource not found: ${toolName}`);
      }

      return {
        ...tool,
        callMethod: 'tools/call',
        resourceUri: this.getToolResourceUri(tool.name),
      };
    }

    if (parsed.hostname === 'runtime' && resourcePath === 'debug-output') {
      return {
        isRunning: this.activeProcess !== null,
        output: this.activeProcess?.output || [],
        errors: this.activeProcess?.errors || [],
      };
    }

    if (parsed.hostname === 'live') {
      return readLiveResource(uri, liveSessionManager);
    }

    throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
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
        const projectFileContent = readFileSync(projectFile, 'utf8');
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

      const relativeScenePath = args.scenePath.replace(/^res:\/\//, '');
      const sceneDirectory = dirname(join(args.projectPath, relativeScenePath));
      mkdirSync(sceneDirectory, { recursive: true });

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
        result = this.parseJsonFromGodotStdout(stdout);
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
        result = this.parseJsonFromGodotStdout(stdout);
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

      let validationScriptPath = args.scriptPath;
      let tempScriptFile: string | null = null;
      if (typeof args.scriptContent === 'string') {
        const scriptDir = dirname(args.scriptPath);
        const tempName = `.${basename(args.scriptPath, '.gd')}.mcp-validate-${process.pid}-${Date.now()}.gd`;
        validationScriptPath = (scriptDir === '.' ? tempName : join(scriptDir, tempName)).replace(/\\/g, '/');
        tempScriptFile = join(args.projectPath, validationScriptPath);
        writeFileSync(tempScriptFile, args.scriptContent, 'utf8');
      }

      // Use Godot's --check-only flag to validate the script
      const logFilePath = join(tmpdir(), `godot-mcp-validate-script-${process.pid}-${Date.now()}.log`);
      const cmdArgs = ['--headless', '--log-file', logFilePath, '--path', args.projectPath, '--script', validationScriptPath, '--check-only'];

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
          if (tempScriptFile && existsSync(tempScriptFile)) {
            unlinkSync(tempScriptFile);
          }

          // Parse errors from both stdout and stderr
          const sanitizedErrors = this.sanitizeGodotStderr(errors.join('\n'))
            .split(/\r?\n/)
            .filter(line => line.trim());
          const allLines = [...sanitizedErrors, ...output];
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
                    validated_script_path: validationScriptPath,
                    exit_code: code,
                    errors: parsedErrors,
                    error_count: parsedErrors.length,
                    raw_output: output.filter(line => line.trim()),
                    raw_errors: sanitizedErrors,
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
          if (tempScriptFile && existsSync(tempScriptFile)) {
            unlinkSync(tempScriptFile);
          }
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
        const result = this.parseJsonFromGodotStdout(stdout);
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
   * Handle the modify_project_setting tool
   * Modifies project.godot settings programmatically
   */
  private async handleModifyProjectSetting(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.settingPath || args.value === undefined) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, settingPath, and value']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
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

      // Read project.godot file
      const { readFileSync, writeFileSync } = await import('fs');
      let content = readFileSync(projectFile, 'utf-8');

      // Parse setting path - first segment is section, rest is key
      const settingPath = args.settingPath as string;
      const pathParts = settingPath.split('/');
      if (pathParts.length < 2) {
        return this.createErrorResponse(
          'Invalid setting path format',
          [
            'Setting path must have at least section/key format',
            'Example: "display/window/size/viewport_width"',
            'Example: "application/config/name"',
          ]
        );
      }

      const section = pathParts[0];
      const key = pathParts.slice(1).join('/');

      // Format the value for project.godot format
      const formattedValue = this.formatProjectSettingValue(args.value);

      // Parse the file into sections
      const lines = content.split('\n');
      const sections: Map<string, string[]> = new Map();
      let currentSection = '';
      let headerLines: string[] = [];

      for (const line of lines) {
        const sectionMatch = line.match(/^\[(\w+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1];
          if (!sections.has(currentSection)) {
            sections.set(currentSection, []);
          }
        } else if (currentSection) {
          sections.get(currentSection)!.push(line);
        } else {
          // Lines before first section (header/config_version)
          headerLines.push(line);
        }
      }

      // Update or add the setting
      let keyFound = false;
      if (sections.has(section)) {
        const sectionLines = sections.get(section)!;
        for (let i = 0; i < sectionLines.length; i++) {
          const line = sectionLines[i];
          // Match the key at the start of the line
          const keyPattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
          if (keyPattern.test(line)) {
            sectionLines[i] = `${key}=${formattedValue}`;
            keyFound = true;
            break;
          }
        }
        if (!keyFound) {
          // Add the key to the section
          sectionLines.push(`${key}=${formattedValue}`);
        }
      } else {
        // Create new section
        sections.set(section, [`${key}=${formattedValue}`]);
      }

      // Rebuild the file content
      let newContent = headerLines.join('\n');
      if (!newContent.endsWith('\n')) {
        newContent += '\n';
      }

      for (const [sectionName, sectionLines] of sections) {
        newContent += `\n[${sectionName}]\n`;
        newContent += sectionLines.filter(l => l.trim() !== '').join('\n');
        newContent += '\n';
      }

      // Write the file
      writeFileSync(projectFile, newContent, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              setting_path: settingPath,
              section: section,
              key: key,
              value: args.value,
              formatted_value: formattedValue,
              action: keyFound ? 'updated' : 'created',
              message: `Project setting [${section}] ${key} has been ${keyFound ? 'updated' : 'created'}`,
            }, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to modify project setting: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Check file permissions',
          'Ensure the setting path is valid',
        ]
      );
    }
  }

  /**
   * Format a value for project.godot file format
   */
  private formatProjectSettingValue(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      // Check if it's already a Godot type like Vector2(), Color(), etc.
      if (value.match(/^(Color|Vector2|Vector2i|Vector3|Vector3i|Vector4|Rect2|Transform2D|Transform3D|PackedStringArray|PackedInt32Array|PackedFloat32Array)\s*\(/)) {
        return value;
      }
      // Regular string - quote it
      return `"${value.replace(/"/g, '\\"')}"`;
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toString();
      }
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (Array.isArray(value)) {
      // Check if all elements are strings - use PackedStringArray
      if (value.every(item => typeof item === 'string')) {
        const formattedItems = value.map(item => `"${String(item).replace(/"/g, '\\"')}"`);
        return `PackedStringArray(${formattedItems.join(', ')})`;
      }
      // Generic array format
      const formattedItems = value.map(item => this.formatProjectSettingValue(item));
      return `[${formattedItems.join(', ')}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      const formattedEntries = entries.map(([k, v]) => `"${k}": ${this.formatProjectSettingValue(v)}`);
      return `{${formattedEntries.join(', ')}}`;
    }

    return String(value);
  }

  /**
   * Handle the configure_input_action tool
   * Creates or modifies input action maps in project.godot
   */
  private async handleConfigureInputAction(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.actionName || !args.events) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, actionName, and events array']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
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

      // Read project.godot file
      const { readFileSync, writeFileSync } = await import('fs');
      let content = readFileSync(projectFile, 'utf-8');

      const actionName = args.actionName as string;
      const events = args.events as any[];
      const deadzone = args.deadzone !== undefined ? args.deadzone : 0.5;

      // Build the input action value in Godot 4.x format
      const eventObjects: string[] = [];

      for (const event of events) {
        if (event.type === 'key') {
          // Keyboard key event
          const keycode = event.keycode || 'Space';
          // Convert key name to Godot key constant
          const keyConstant = this.getGodotKeyConstant(keycode);
          eventObjects.push(`Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":${keyConstant},"physical_keycode":0,"key_label":0,"unicode":0,"location":0,"echo":false)`);
        } else if (event.type === 'mouse_button') {
          // Mouse button event
          const button = event.button !== undefined ? event.button : 0;
          eventObjects.push(`Object(InputEventMouseButton,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"button_mask":0,"position":Vector2(0, 0),"global_position":Vector2(0, 0),"factor":1.0,"button_index":${button + 1},"canceled":false,"pressed":false,"double_click":false)`);
        } else if (event.type === 'joypad_button') {
          // Joypad button event
          const button = event.button !== undefined ? event.button : 0;
          eventObjects.push(`Object(InputEventJoypadButton,"resource_local_to_scene":false,"resource_name":"","device":-1,"button_index":${button},"pressure":0.0,"pressed":false)`);
        } else if (event.type === 'joypad_axis') {
          // Joypad axis event
          const axis = event.axis !== undefined ? event.axis : 0;
          const axisValue = event.axisValue !== undefined ? event.axisValue : 1.0;
          eventObjects.push(`Object(InputEventJoypadMotion,"resource_local_to_scene":false,"resource_name":"","device":-1,"axis":${axis},"axis_value":${axisValue})`);
        }
      }

      // Build the complete action value
      const actionValue = `{"deadzone": ${deadzone}, "events": [${eventObjects.join(', ')}]}`;

      // Parse the file and update/add the input action
      const lines = content.split('\n');
      const sections: Map<string, string[]> = new Map();
      let currentSection = '';
      let headerLines: string[] = [];

      for (const line of lines) {
        const sectionMatch = line.match(/^\[(\w+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1];
          if (!sections.has(currentSection)) {
            sections.set(currentSection, []);
          }
        } else if (currentSection) {
          sections.get(currentSection)!.push(line);
        } else {
          headerLines.push(line);
        }
      }

      // Update or add the input action in [input] section
      const inputKey = actionName;
      let keyFound = false;

      if (sections.has('input')) {
        const sectionLines = sections.get('input')!;
        for (let i = 0; i < sectionLines.length; i++) {
          const line = sectionLines[i];
          const keyPattern = new RegExp(`^${inputKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
          if (keyPattern.test(line)) {
            sectionLines[i] = `${inputKey}=${actionValue}`;
            keyFound = true;
            break;
          }
        }
        if (!keyFound) {
          sectionLines.push(`${inputKey}=${actionValue}`);
        }
      } else {
        sections.set('input', [`${inputKey}=${actionValue}`]);
      }

      // Rebuild the file content
      let newContent = headerLines.join('\n');
      if (!newContent.endsWith('\n')) {
        newContent += '\n';
      }

      for (const [sectionName, sectionLines] of sections) {
        newContent += `\n[${sectionName}]\n`;
        newContent += sectionLines.filter(l => l.trim() !== '').join('\n');
        newContent += '\n';
      }

      writeFileSync(projectFile, newContent, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              action_name: actionName,
              events_count: events.length,
              deadzone: deadzone,
              action: keyFound ? 'updated' : 'created',
              events_summary: events.map(e => `${e.type}: ${e.keycode || e.button || e.axis || 'default'}`),
              message: `Input action "${actionName}" has been ${keyFound ? 'updated' : 'created'} with ${events.length} event(s)`,
            }, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to configure input action: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Check file permissions',
          'Ensure event types are valid (key, mouse_button, joypad_button, joypad_axis)',
        ]
      );
    }
  }

  /**
   * Convert a key name to Godot's key constant value
   */
  private getGodotKeyConstant(keyName: string): number {
    // Common key mappings to Godot 4.x Key enum values
    const keyMap: Record<string, number> = {
      // Letters (ASCII values)
      'A': 65, 'B': 66, 'C': 67, 'D': 68, 'E': 69, 'F': 70, 'G': 71, 'H': 72,
      'I': 73, 'J': 74, 'K': 75, 'L': 76, 'M': 77, 'N': 78, 'O': 79, 'P': 80,
      'Q': 81, 'R': 82, 'S': 83, 'T': 84, 'U': 85, 'V': 86, 'W': 87, 'X': 88,
      'Y': 89, 'Z': 90,
      // Numbers
      '0': 48, '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57,
      // Special keys (Godot 4.x Key enum)
      'Space': 32,
      'Escape': 4194305,
      'Tab': 4194306,
      'Backspace': 4194308,
      'Enter': 4194309,
      'Return': 4194309,
      'Insert': 4194311,
      'Delete': 4194312,
      'Pause': 4194313,
      'Home': 4194315,
      'End': 4194316,
      'Left': 4194319,
      'Up': 4194320,
      'Right': 4194321,
      'Down': 4194322,
      'PageUp': 4194323,
      'PageDown': 4194324,
      'Shift': 4194325,
      'Ctrl': 4194326,
      'Control': 4194326,
      'Alt': 4194328,
      'CapsLock': 4194327,
      'F1': 4194332, 'F2': 4194333, 'F3': 4194334, 'F4': 4194335,
      'F5': 4194336, 'F6': 4194337, 'F7': 4194338, 'F8': 4194339,
      'F9': 4194340, 'F10': 4194341, 'F11': 4194342, 'F12': 4194343,
    };

    // Try exact match first
    if (keyMap[keyName]) {
      return keyMap[keyName];
    }

    // Try uppercase
    const upper = keyName.toUpperCase();
    if (keyMap[upper]) {
      return keyMap[upper];
    }

    // Try lowercase first letter uppercase
    const capitalized = keyName.charAt(0).toUpperCase() + keyName.slice(1).toLowerCase();
    if (keyMap[capitalized]) {
      return keyMap[capitalized];
    }

    // Default to the ASCII value if single character
    if (keyName.length === 1) {
      return keyName.toUpperCase().charCodeAt(0);
    }

    // Default to Space
    return 32;
  }

  /**
   * Handle the setup_render_layers tool
   * Configures physics and render layer names in project settings
   */
  private async handleSetupRenderLayers(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.layerType || !args.layerNames) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, layerType, and layerNames object']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
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

      const { readFileSync, writeFileSync } = await import('fs');
      let content = readFileSync(projectFile, 'utf-8');

      const layerType = args.layerType as string;
      const layerNames = args.layerNames as Record<string, string>;

      // Determine section and key prefix based on layer type
      let section: string;
      let keyPrefix: string;
      let maxLayer: number;

      switch (layerType) {
        case '2d_physics':
          section = 'layer_names';
          keyPrefix = '2d_physics/layer_';
          maxLayer = 32;
          break;
        case '3d_physics':
          section = 'layer_names';
          keyPrefix = '3d_physics/layer_';
          maxLayer = 32;
          break;
        case '2d_render':
          section = 'layer_names';
          keyPrefix = '2d_render/layer_';
          maxLayer = 20;
          break;
        case '3d_render':
          section = 'layer_names';
          keyPrefix = '3d_render/layer_';
          maxLayer = 20;
          break;
        default:
          return this.createErrorResponse(
            'Invalid layer type',
            ['Valid types: 2d_physics, 3d_physics, 2d_render, 3d_render']
          );
      }

      // Validate layer numbers
      const invalidLayers: string[] = [];
      for (const layerNum of Object.keys(layerNames)) {
        const num = parseInt(layerNum, 10);
        if (isNaN(num) || num < 1 || num > maxLayer) {
          invalidLayers.push(layerNum);
        }
      }

      if (invalidLayers.length > 0) {
        return this.createErrorResponse(
          `Invalid layer numbers: ${invalidLayers.join(', ')}`,
          [`Layer numbers must be between 1 and ${maxLayer} for ${layerType}`]
        );
      }

      // Parse the file into sections
      const lines = content.split('\n');
      const sections: Map<string, string[]> = new Map();
      let currentSection = '';
      let headerLines: string[] = [];

      for (const line of lines) {
        const sectionMatch = line.match(/^\[(\w+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1];
          if (!sections.has(currentSection)) {
            sections.set(currentSection, []);
          }
        } else if (currentSection) {
          sections.get(currentSection)!.push(line);
        } else {
          headerLines.push(line);
        }
      }

      // Ensure section exists
      if (!sections.has(section)) {
        sections.set(section, []);
      }

      const sectionLines = sections.get(section)!;
      const updatedLayers: string[] = [];
      const createdLayers: string[] = [];

      // Update or add each layer name
      for (const [layerNum, layerName] of Object.entries(layerNames)) {
        const key = `${keyPrefix}${layerNum}`;
        const formattedValue = `"${layerName}"`;
        let found = false;

        for (let i = 0; i < sectionLines.length; i++) {
          const line = sectionLines[i];
          const keyPattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
          if (keyPattern.test(line)) {
            sectionLines[i] = `${key}=${formattedValue}`;
            found = true;
            updatedLayers.push(`Layer ${layerNum}: ${layerName}`);
            break;
          }
        }

        if (!found) {
          sectionLines.push(`${key}=${formattedValue}`);
          createdLayers.push(`Layer ${layerNum}: ${layerName}`);
        }
      }

      // Rebuild the file content
      let newContent = headerLines.join('\n');
      if (!newContent.endsWith('\n')) {
        newContent += '\n';
      }

      for (const [sectionName, sectionLinesArr] of sections) {
        newContent += `\n[${sectionName}]\n`;
        newContent += sectionLinesArr.filter(l => l.trim() !== '').join('\n');
        newContent += '\n';
      }

      writeFileSync(projectFile, newContent, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              layer_type: layerType,
              layers_configured: Object.keys(layerNames).length,
              updated: updatedLayers,
              created: createdLayers,
              message: `Configured ${Object.keys(layerNames).length} layer name(s) for ${layerType}`,
            }, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to setup render layers: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Check file permissions',
          'Ensure layer numbers are valid (1-32 for physics, 1-20 for render)',
        ]
      );
    }
  }

  /**
   * Handle the configure_autoload tool
   * Adds or removes autoload singletons in project settings
   */
  private async handleConfigureAutoload(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.name) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and name']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
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

      const { readFileSync, writeFileSync } = await import('fs');
      let content = readFileSync(projectFile, 'utf-8');

      const name = args.name as string;
      const scriptPath = args.scriptPath as string | undefined;
      const enabled = args.enabled !== undefined ? args.enabled : true;
      const remove = args.remove === true;

      // For adding/updating, scriptPath is required
      if (!remove && !scriptPath) {
        return this.createErrorResponse(
          'scriptPath is required when adding an autoload',
          ['Provide the path to the script or scene file (e.g., "res://autoload/game_manager.gd")']
        );
      }

      // Verify script exists if adding
      if (!remove && scriptPath) {
        // Convert res:// path to actual path
        let actualScriptPath = scriptPath;
        if (scriptPath.startsWith('res://')) {
          actualScriptPath = join(args.projectPath, scriptPath.substring(6));
        } else if (!scriptPath.startsWith('/') && !scriptPath.match(/^[A-Za-z]:/)) {
          actualScriptPath = join(args.projectPath, scriptPath);
        }

        if (!existsSync(actualScriptPath)) {
          return this.createErrorResponse(
            `Script file not found: ${scriptPath}`,
            [
              'Ensure the script file exists at the specified path',
              'Use create_script to create a new script first',
            ]
          );
        }
      }

      // Parse the file into sections
      const lines = content.split('\n');
      const sections: Map<string, string[]> = new Map();
      let currentSection = '';
      let headerLines: string[] = [];

      for (const line of lines) {
        const sectionMatch = line.match(/^\[(\w+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1];
          if (!sections.has(currentSection)) {
            sections.set(currentSection, []);
          }
        } else if (currentSection) {
          sections.get(currentSection)!.push(line);
        } else {
          headerLines.push(line);
        }
      }

      // Ensure autoload section exists
      if (!sections.has('autoload')) {
        sections.set('autoload', []);
      }

      const sectionLines = sections.get('autoload')!;
      let action: 'created' | 'updated' | 'removed' | 'not_found' = 'created';

      if (remove) {
        // Remove the autoload
        const keyPattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
        const originalLength = sectionLines.length;
        const newLines = sectionLines.filter(line => !keyPattern.test(line));

        if (newLines.length < originalLength) {
          sections.set('autoload', newLines);
          action = 'removed';
        } else {
          action = 'not_found';
        }
      } else {
        // Add or update the autoload
        // Format: Name="*res://path/to/script.gd" (* prefix means enabled)
        const prefix = enabled ? '*' : '';
        const resPath = scriptPath!.startsWith('res://') ? scriptPath : `res://${scriptPath}`;
        const autoloadValue = `"${prefix}${resPath}"`;

        let found = false;
        for (let i = 0; i < sectionLines.length; i++) {
          const line = sectionLines[i];
          const keyPattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
          if (keyPattern.test(line)) {
            sectionLines[i] = `${name}=${autoloadValue}`;
            found = true;
            action = 'updated';
            break;
          }
        }

        if (!found) {
          sectionLines.push(`${name}=${autoloadValue}`);
          action = 'created';
        }
      }

      // Rebuild the file content
      let newContent = headerLines.join('\n');
      if (!newContent.endsWith('\n')) {
        newContent += '\n';
      }

      for (const [sectionName, sectionLinesArr] of sections) {
        newContent += `\n[${sectionName}]\n`;
        newContent += sectionLinesArr.filter(l => l.trim() !== '').join('\n');
        newContent += '\n';
      }

      writeFileSync(projectFile, newContent, 'utf-8');

      const response: any = {
        success: action !== 'not_found',
        name: name,
        action: action,
      };

      if (!remove && action !== 'not_found') {
        response.script_path = scriptPath;
        response.enabled = enabled;
        response.message = `Autoload "${name}" has been ${action}. Access it globally as ${name} in your scripts.`;
      } else if (action === 'removed') {
        response.message = `Autoload "${name}" has been removed from the project.`;
      } else {
        response.message = `Autoload "${name}" was not found in the project.`;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to configure autoload: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Check file permissions',
          'Ensure the script path is valid',
        ]
      );
    }
  }

  /**
   * Handle the create_export_preset tool
   * Creates or updates export presets for target platforms
   * @param args Tool arguments
   */
  private async handleCreateExportPreset(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.presetName) {
      return this.createErrorResponse(
        'Preset name is required',
        ['Provide a name for the export preset (e.g., "Windows Release", "Web Debug")']
      );
    }

    if (!args.platform) {
      return this.createErrorResponse(
        'Platform is required',
        ['Specify the target platform: Windows Desktop, Linux/X11, macOS, Web, Android, iOS']
      );
    }

    const validPlatforms = ['Windows Desktop', 'Linux/X11', 'macOS', 'Web', 'Android', 'iOS'];
    if (!validPlatforms.includes(args.platform)) {
      return this.createErrorResponse(
        `Invalid platform: ${args.platform}`,
        [`Valid platforms: ${validPlatforms.join(', ')}`]
      );
    }

    try {
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          ['Ensure the directory contains a project.godot file']
        );
      }

      const exportPresetsPath = join(args.projectPath, 'export_presets.cfg');
      let existingContent = '';
      let presetCount = 0;

      // Read existing export_presets.cfg if it exists
      if (existsSync(exportPresetsPath)) {
        existingContent = readFileSync(exportPresetsPath, 'utf8');
        // Count existing presets
        const presetMatches = existingContent.match(/\[preset\.\d+\]/g);
        if (presetMatches) {
          presetCount = presetMatches.length;
        }
      }

      // Check if preset with same name already exists
      const nameRegex = new RegExp(`name="${args.presetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
      if (nameRegex.test(existingContent)) {
        return this.createErrorResponse(
          `Preset with name "${args.presetName}" already exists`,
          ['Use a different name or modify the existing preset manually']
        );
      }

      // Get platform-specific file extension
      const getExportExtension = (platform: string): string => {
        switch (platform) {
          case 'Windows Desktop': return '.exe';
          case 'Linux/X11': return '.x86_64';
          case 'macOS': return '.zip';
          case 'Web': return '.html';
          case 'Android': return '.apk';
          case 'iOS': return '.ipa';
          default: return '';
        }
      };

      // Default export path if not provided
      const exportPath = args.exportPath || `export/${args.platform.replace(/[\/\\]/g, '_')}/${args.presetName.replace(/\s+/g, '_')}${getExportExtension(args.platform)}`;

      // Build the preset configuration
      const runnable = args.runnable !== false; // Default to true
      const debugMode = args.debugMode !== false; // Default to true (for debug builds)

      let presetSection = `
[preset.${presetCount}]

name="${args.presetName}"
platform="${args.platform}"
runnable=${runnable}
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter="${args.includeFilter || ''}"
exclude_filter="${args.excludeFilter || ''}"
export_path="${exportPath}"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=${args.encryptionKey ? 'true' : 'false'}
encrypt_directory=false
`;

      // Add platform-specific options section
      presetSection += `
[preset.${presetCount}.options]

`;

      // Add platform-specific options
      switch (args.platform) {
        case 'Windows Desktop':
          presetSection += `custom_template/debug=""
custom_template/release=""
debug/export_console_wrapper=1
binary_format/embed_pck=false
texture_format/bptc=true
texture_format/s3tc=true
texture_format/etc=false
texture_format/etc2=false
binary_format/architecture="x86_64"
codesign/enable=false
application/modify_resources=true
application/icon=""
application/icon_interpolation=4
application/file_version=""
application/product_version=""
application/company_name=""
application/product_name=""
application/file_description=""
application/copyright=""
application/trademarks=""
ssh_remote_deploy/enabled=false
`;
          break;
        case 'Linux/X11':
          presetSection += `custom_template/debug=""
custom_template/release=""
debug/export_console_wrapper=1
binary_format/embed_pck=false
texture_format/bptc=true
texture_format/s3tc=true
texture_format/etc=false
texture_format/etc2=false
binary_format/architecture="x86_64"
ssh_remote_deploy/enabled=false
`;
          break;
        case 'macOS':
          presetSection += `custom_template/debug=""
custom_template/release=""
debug/export_console_wrapper=1
binary_format/architecture="universal"
application/icon=""
application/icon_interpolation=4
application/bundle_identifier=""
application/signature=""
application/app_category="Games"
application/short_version=""
application/version=""
application/copyright=""
application/copyright_localized={}
application/min_macos_version="10.12"
display/high_res=true
codesign/codesign=1
codesign/installer_identity=""
codesign/apple_team_id=""
codesign/identity=""
codesign/entitlements/custom_file=""
codesign/entitlements/allow_jit_code_execution=false
codesign/entitlements/allow_unsigned_executable_memory=false
codesign/entitlements/allow_dyld_environment_variables=false
codesign/custom_options=PackedStringArray()
notarization/notarization=0
ssh_remote_deploy/enabled=false
`;
          break;
        case 'Web':
          presetSection += `custom_template/debug=""
custom_template/release=""
variant/extensions_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell=""
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false
progressive_web_app/offline_page=""
progressive_web_app/display=1
progressive_web_app/orientation=0
progressive_web_app/icon_144x144=""
progressive_web_app/icon_180x180=""
progressive_web_app/icon_512x512=""
progressive_web_app/background_color=Color(0, 0, 0, 1)
`;
          break;
        case 'Android':
          presetSection += `custom_template/debug=""
custom_template/release=""
gradle_build/use_gradle_build=false
gradle_build/export_format=0
gradle_build/min_sdk=""
gradle_build/target_sdk=""
architectures/armeabi-v7a=true
architectures/arm64-v8a=true
architectures/x86=false
architectures/x86_64=false
version/code=1
version/name=""
package/unique_name="com.example.$genname"
package/name=""
package/signed=true
package/app_category=2
package/retain_data_on_uninstall=false
package/exclude_from_recents=false
package/show_in_android_tv=false
package/show_in_app_library=true
package/show_as_launcher_app=false
launcher_icons/main_192x192=""
launcher_icons/adaptive_foreground_432x432=""
launcher_icons/adaptive_background_432x432=""
graphics/opengl_debug=false
xr_features/xr_mode=0
screen/immersive_mode=true
screen/support_small=true
screen/support_normal=true
screen/support_large=true
screen/support_xlarge=true
user_data_backup/allow=false
command_line/extra_args=""
apk_expansion/enable=false
apk_expansion/SALT=""
apk_expansion/public_key=""
permissions/custom_permissions=PackedStringArray()
permissions/access_checkin_properties=false
permissions/access_coarse_location=false
permissions/access_fine_location=false
permissions/access_location_extra_commands=false
permissions/access_mock_location=false
permissions/access_network_state=false
permissions/access_surface_flinger=false
permissions/access_wifi_state=false
permissions/account_manager=false
permissions/add_voicemail=false
permissions/authenticate_accounts=false
permissions/battery_stats=false
permissions/bind_accessibility_service=false
permissions/bind_appwidget=false
permissions/bind_device_admin=false
permissions/bind_input_method=false
permissions/bind_nfc_service=false
permissions/bind_notification_listener_service=false
permissions/bind_print_service=false
permissions/bind_remoteviews=false
permissions/bind_text_service=false
permissions/bind_vpn_service=false
permissions/bind_wallpaper=false
permissions/bluetooth=false
permissions/bluetooth_admin=false
permissions/bluetooth_privileged=false
permissions/brick=false
permissions/broadcast_package_removed=false
permissions/broadcast_sms=false
permissions/broadcast_sticky=false
permissions/broadcast_wap_push=false
permissions/call_phone=false
permissions/call_privileged=false
permissions/camera=false
permissions/capture_audio_output=false
permissions/capture_secure_video_output=false
permissions/capture_video_output=false
permissions/change_component_enabled_state=false
permissions/change_configuration=false
permissions/change_network_state=false
permissions/change_wifi_multicast_state=false
permissions/change_wifi_state=false
permissions/clear_app_cache=false
permissions/clear_app_user_data=false
permissions/control_location_updates=false
permissions/delete_cache_files=false
permissions/delete_packages=false
permissions/device_power=false
permissions/diagnostic=false
permissions/disable_keyguard=false
permissions/dump=false
permissions/expand_status_bar=false
permissions/factory_test=false
permissions/flashlight=false
permissions/force_back=false
permissions/get_accounts=false
permissions/get_package_size=false
permissions/get_tasks=false
permissions/get_top_activity_info=false
permissions/global_search=false
permissions/hardware_test=false
permissions/inject_events=false
permissions/install_location_provider=false
permissions/install_packages=false
permissions/install_shortcut=false
permissions/internal_system_window=false
permissions/internet=false
permissions/kill_background_processes=false
permissions/location_hardware=false
permissions/manage_accounts=false
permissions/manage_app_tokens=false
permissions/manage_documents=false
permissions/manage_external_storage=false
permissions/master_clear=false
permissions/media_content_control=false
permissions/modify_audio_settings=false
permissions/modify_phone_state=false
permissions/mount_format_filesystems=false
permissions/mount_unmount_filesystems=false
permissions/nfc=false
permissions/persistent_activity=false
permissions/process_outgoing_calls=false
permissions/read_calendar=false
permissions/read_call_log=false
permissions/read_contacts=false
permissions/read_external_storage=false
permissions/read_frame_buffer=false
permissions/read_history_bookmarks=false
permissions/read_input_state=false
permissions/read_logs=false
permissions/read_phone_state=false
permissions/read_profile=false
permissions/read_sms=false
permissions/read_social_stream=false
permissions/read_sync_settings=false
permissions/read_sync_stats=false
permissions/read_user_dictionary=false
permissions/reboot=false
permissions/receive_boot_completed=false
permissions/receive_mms=false
permissions/receive_sms=false
permissions/receive_wap_push=false
permissions/record_audio=false
permissions/reorder_tasks=false
permissions/request_ignore_battery_optimizations=false
permissions/request_install_packages=false
permissions/restart_packages=false
permissions/send_respond_via_message=false
permissions/send_sms=false
permissions/set_activity_watcher=false
permissions/set_alarm=false
permissions/set_always_finish=false
permissions/set_animation_scale=false
permissions/set_debug_app=false
permissions/set_orientation=false
permissions/set_pointer_speed=false
permissions/set_preferred_applications=false
permissions/set_process_limit=false
permissions/set_time=false
permissions/set_time_zone=false
permissions/set_wallpaper=false
permissions/set_wallpaper_hints=false
permissions/signal_persistent_processes=false
permissions/status_bar=false
permissions/subscribed_feeds_read=false
permissions/subscribed_feeds_write=false
permissions/system_alert_window=false
permissions/transmit_ir=false
permissions/uninstall_shortcut=false
permissions/update_device_stats=false
permissions/use_credentials=false
permissions/use_sip=false
permissions/vibrate=false
permissions/wake_lock=false
permissions/write_apn_settings=false
permissions/write_calendar=false
permissions/write_call_log=false
permissions/write_contacts=false
permissions/write_external_storage=false
permissions/write_gservices=false
permissions/write_history_bookmarks=false
permissions/write_profile=false
permissions/write_secure_settings=false
permissions/write_settings=false
permissions/write_sms=false
permissions/write_social_stream=false
permissions/write_sync_settings=false
permissions/write_user_dictionary=false
`;
          break;
        case 'iOS':
          presetSection += `custom_template/debug=""
custom_template/release=""
architectures/arm64=true
application/icon=""
application/icon_interpolation=4
application/launch_screens_interpolation=4
application/export_project_only=false
application/bundle_identifier=""
application/signature=""
application/short_version=""
application/version=""
application/min_ios_version="12.0"
capabilities/access_wifi=false
capabilities/push_notifications=false
user_data/accessible_from_files_app=false
user_data/accessible_from_itunes_sharing=false
privacy/camera_usage_description=""
privacy/camera_usage_description_localized={}
privacy/microphone_usage_description=""
privacy/microphone_usage_description_localized={}
privacy/photolibrary_usage_description=""
privacy/photolibrary_usage_description_localized={}
icons/iphone_120x120=""
icons/iphone_180x180=""
icons/ipad_76x76=""
icons/ipad_152x152=""
icons/ipad_167x167=""
icons/app_store_1024x1024=""
storyboard/use_launch_screen_storyboard=false
storyboard/image_scale_mode=0
storyboard/custom_image@2x=""
storyboard/custom_image@3x=""
storyboard/use_custom_bg_color=false
storyboard/custom_bg_color=Color(0, 0, 0, 1)
`;
          break;
      }

      // Write or append to export_presets.cfg
      const finalContent = existingContent + presetSection;
      writeFileSync(exportPresetsPath, finalContent, 'utf8');

      const response = {
        success: true,
        message: `Created export preset "${args.presetName}" for ${args.platform}`,
        presetIndex: presetCount,
        exportPath: exportPath,
        platform: args.platform,
        runnable: runnable,
        debugMode: debugMode,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to create export preset: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Check file permissions',
          'Ensure Godot 4.x is installed',
        ]
      );
    }
  }

  /**
   * Handle the export_project tool
   * Build/export a Godot project for a specific platform
   * @param args Tool arguments
   */
  private async handleExportProject(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.presetName) {
      return this.createErrorResponse(
        'Preset name is required',
        ['Provide the name of an export preset defined in export_presets.cfg']
      );
    }

    if (!args.outputPath) {
      return this.createErrorResponse(
        'Output path is required',
        ['Provide the destination path for the exported build']
      );
    }

    try {
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          ['Ensure the directory contains a project.godot file']
        );
      }

      const exportPresetsPath = join(args.projectPath, 'export_presets.cfg');
      if (!existsSync(exportPresetsPath)) {
        return this.createErrorResponse(
          'No export presets found',
          [
            'Create an export preset first using create_export_preset',
            'Or configure export presets in the Godot editor (Project → Export...)',
          ]
        );
      }

      // Verify preset exists
      const presetsContent = readFileSync(exportPresetsPath, 'utf8');
      const nameRegex = new RegExp(`name="${args.presetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
      if (!nameRegex.test(presetsContent)) {
        return this.createErrorResponse(
          `Export preset "${args.presetName}" not found`,
          [
            'Check the preset name matches exactly',
            'List available presets in export_presets.cfg',
            'Create a new preset using create_export_preset',
          ]
        );
      }

      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable',
            ]
          );
        }
      }

      // Create output directory if it doesn't exist
      const outputDir = dirname(args.outputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Build export command
      const releaseMode = args.releaseMode === true;
      const packOnly = args.packOnly === true;

      let exportFlag = '--headless';
      if (packOnly) {
        exportFlag += releaseMode ? ' --export-pack' : ' --export-debug-pack';
      } else {
        exportFlag += releaseMode ? ' --export-release' : ' --export-debug';
      }

      // Construct the command
      const exportArgs = [
        '--headless',
        '--path', args.projectPath,
        releaseMode
          ? (packOnly ? '--export-pack' : '--export-release')
          : (packOnly ? '--export-debug-pack' : '--export-debug'),
        args.presetName,
        args.outputPath,
      ];

      // Execute export
      const startTime = Date.now();

      return new Promise((resolve) => {
        const exportProcess = spawn(this.godotPath!, exportArgs, {
          cwd: args.projectPath,
        });

        let stdout = '';
        let stderr = '';

        exportProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        exportProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        exportProcess.on('close', (code: number) => {
          const duration = Date.now() - startTime;

          if (code === 0) {
            // Check if output file was created
            const outputExists = existsSync(args.outputPath);

            const response = {
              success: true,
              message: outputExists
                ? `Successfully exported project to ${args.outputPath}`
                : `Export completed but output file may need verification`,
              presetName: args.presetName,
              outputPath: args.outputPath,
              releaseMode: releaseMode,
              packOnly: packOnly,
              duration: `${duration}ms`,
              exitCode: code,
              outputExists: outputExists,
            };

            resolve({
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            });
          } else {
            resolve(this.createErrorResponse(
              `Export failed with exit code ${code}`,
              [
                'Check if export templates are installed in Godot',
                'Verify the preset configuration is correct',
                'Check the output path is writable',
                stderr ? `Error output: ${stderr.substring(0, 500)}` : 'No error output available',
              ]
            ));
          }
        });

        exportProcess.on('error', (error: Error) => {
          resolve(this.createErrorResponse(
            `Failed to start export process: ${error.message}`,
            [
              'Verify Godot executable path is correct',
              'Check if Godot is properly installed',
            ]
          ));
        });
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to export project: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Check file permissions',
          'Ensure export templates are installed',
        ]
      );
    }
  }

  /**
   * Handle the validate_export tool
   * Check a Godot project for export issues before building
   * @param args Tool arguments
   */
  private async handleValidateExport(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    try {
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          ['Ensure the directory contains a project.godot file']
        );
      }

      const issues: Array<{ type: string; severity: 'error' | 'warning' | 'info'; message: string; file?: string }> = [];
      const checkTemplates = args.checkTemplates !== false;
      const checkScripts = args.checkScripts !== false;
      const warnLargeAssets = args.warnLargeAssets !== false;
      const largeAssetThreshold = args.largeAssetThreshold || 10 * 1024 * 1024; // 10MB default

      // Check for export_presets.cfg
      const exportPresetsPath = join(args.projectPath, 'export_presets.cfg');
      let presetFound = false;
      let availablePresets: string[] = [];

      if (!existsSync(exportPresetsPath)) {
        issues.push({
          type: 'missing_presets',
          severity: 'error',
          message: 'No export_presets.cfg file found - export presets need to be configured',
        });
      } else {
        const presetsContent = readFileSync(exportPresetsPath, 'utf8');
        const presetMatches = presetsContent.match(/name="([^"]+)"/g);
        if (presetMatches) {
          availablePresets = presetMatches.map((m: string) => m.replace('name="', '').replace('"', ''));
          presetFound = true;
        }

        // Check for specific preset if provided
        if (args.presetName) {
          const nameRegex = new RegExp(`name="${args.presetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
          if (!nameRegex.test(presetsContent)) {
            issues.push({
              type: 'preset_not_found',
              severity: 'error',
              message: `Preset "${args.presetName}" not found in export_presets.cfg`,
            });
          }
        }
      }

      // Check export templates if requested
      if (checkTemplates && this.godotPath) {
        // Get Godot version to check templates path
        try {
          const { stdout: versionResult } = await execAsync(`"${this.godotPath}" --version`);
          const version = versionResult.trim().split('.').slice(0, 2).join('.');

          // Common template paths
          const homeDir = process.env.HOME || process.env.USERPROFILE || '';
          const templatePaths = [
            // Windows
            join(homeDir, 'AppData', 'Roaming', 'Godot', 'export_templates', version),
            // macOS/Linux
            join(homeDir, '.local', 'share', 'godot', 'export_templates', version),
            join(homeDir, 'Library', 'Application Support', 'Godot', 'export_templates', version),
          ];

          let templatesFound = false;
          for (const templatePath of templatePaths) {
            if (existsSync(templatePath)) {
              templatesFound = true;
              break;
            }
          }

          if (!templatesFound) {
            issues.push({
              type: 'missing_templates',
              severity: 'warning',
              message: `Export templates for Godot ${version} may not be installed`,
            });
          }
        } catch (e) {
          issues.push({
            type: 'template_check_failed',
            severity: 'info',
            message: 'Could not verify export templates installation',
          });
        }
      }

      // Validate scripts if requested
      if (checkScripts) {
        const findScripts = (dir: string, scripts: string[] = []): string[] => {
          try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = join(dir, entry.name);
              if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '.godot') {
                findScripts(fullPath, scripts);
              } else if (entry.isFile() && entry.name.endsWith('.gd')) {
                scripts.push(fullPath);
              }
            }
          } catch (e) {
            // Skip directories we can't read
          }
          return scripts;
        };

        const scripts = findScripts(args.projectPath);

        // Check each script for basic issues
        for (const scriptPath of scripts) {
          try {
            const content = readFileSync(scriptPath, 'utf8');
            const relativePath = scriptPath.replace(args.projectPath, '').replace(/^[\/\\]/, '');

            // Check for common issues
            if (content.includes('print(') && !content.includes('#')) {
              // Many print statements without comments might indicate debug code
              const printCount = (content.match(/print\(/g) || []).length;
              if (printCount > 10) {
                issues.push({
                  type: 'debug_code',
                  severity: 'info',
                  message: `Script contains ${printCount} print statements - consider removing debug code for release`,
                  file: relativePath,
                });
              }
            }

            // Check for TODO/FIXME comments
            const todoMatches = content.match(/(?:#|\/\/)\s*(TODO|FIXME|XXX|HACK):/gi);
            if (todoMatches && todoMatches.length > 0) {
              issues.push({
                type: 'todo_comments',
                severity: 'info',
                message: `Script contains ${todoMatches.length} TODO/FIXME comments`,
                file: relativePath,
              });
            }

            // Check for breakpoint() calls
            if (content.includes('breakpoint()')) {
              issues.push({
                type: 'breakpoint',
                severity: 'warning',
                message: 'Script contains breakpoint() call - remove before release',
                file: relativePath,
              });
            }

          } catch (e) {
            // Skip files we can't read
          }
        }
      }

      // Check for large assets if requested
      if (warnLargeAssets) {
        const checkLargeFiles = (dir: string, files: Array<{ path: string; size: number }> = []): Array<{ path: string; size: number }> => {
          try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = join(dir, entry.name);
              if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '.godot') {
                checkLargeFiles(fullPath, files);
              } else if (entry.isFile()) {
                const stat = statSync(fullPath);
                if (stat.size > largeAssetThreshold) {
                  files.push({
                    path: fullPath.replace(args.projectPath, '').replace(/^[\/\\]/, ''),
                    size: stat.size,
                  });
                }
              }
            }
          } catch (e) {
            // Skip directories we can't read
          }
          return files;
        };

        const largeFiles = checkLargeFiles(args.projectPath);
        for (const file of largeFiles) {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
          issues.push({
            type: 'large_asset',
            severity: 'warning',
            message: `Large asset (${sizeMB} MB) may increase build size significantly`,
            file: file.path,
          });
        }
      }

      // Check for common missing files
      const commonFiles = ['icon.svg', 'icon.png'];
      let hasIcon = false;
      for (const iconFile of commonFiles) {
        if (existsSync(join(args.projectPath, iconFile))) {
          hasIcon = true;
          break;
        }
      }
      if (!hasIcon) {
        issues.push({
          type: 'missing_icon',
          severity: 'info',
          message: 'No project icon found (icon.svg or icon.png) - default icon will be used',
        });
      }

      // Compile summary
      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warningCount = issues.filter(i => i.severity === 'warning').length;
      const infoCount = issues.filter(i => i.severity === 'info').length;

      const response = {
        success: errorCount === 0,
        projectPath: args.projectPath,
        presetName: args.presetName || null,
        availablePresets: availablePresets,
        summary: {
          errors: errorCount,
          warnings: warningCount,
          info: infoCount,
          total: issues.length,
          exportReady: errorCount === 0 && presetFound,
        },
        issues: issues,
        recommendations: [] as string[],
      };

      // Add recommendations based on issues
      if (!presetFound) {
        response.recommendations.push('Create export presets using create_export_preset or the Godot editor');
      }
      if (errorCount === 0 && warningCount > 0) {
        response.recommendations.push('Review warnings before creating a release build');
      }
      if (errorCount === 0 && presetFound) {
        response.recommendations.push('Project is ready for export - use export_project to build');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to validate export: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Check file permissions',
        ]
      );
    }
  }

  /**
   * Handle the create_tilemap tool
   * Creates a TileMap node in a scene with optional TileSet configuration
   * @param args Tool arguments
   */
  private async handleCreateTilemap(args: any) {
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
        ['Provide the path to a scene file (e.g., "scenes/level.tscn")']
      );
    }

    try {
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          ['Ensure the directory contains a project.godot file']
        );
      }

      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file not found: ${args.scenePath}`,
          ['Ensure the scene file exists', 'Create the scene first using create_scene']
        );
      }

      // Prepare parameters for GDScript operation
      const params = {
        scene_path: args.scenePath,
        tilemap_name: args.tilemapName || 'TileMap',
        parent_path: args.parentPath || '.',
        tile_size: args.tileSize || { x: 16, y: 16 },
        tileset_path: args.tilesetPath || '',
        layers: args.layers || [],
      };

      // Execute GDScript operation
      const { stdout, stderr } = await this.executeOperation(
        'create_tilemap',
        params,
        args.projectPath
      );

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to create tilemap: ${stderr}`,
          ['Check the scene file exists', 'Verify the parent path is correct']
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: stdout,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to create tilemap: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Ensure the scene file exists',
          'Check file permissions',
        ]
      );
    }
  }

  /**
   * Handle the paint_tiles tool
   * Paints tiles in a TileMap at specified positions
   * @param args Tool arguments
   */
  private async handlePaintTiles(args: any) {
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
        ['Provide the path to the scene file containing the TileMap']
      );
    }

    if (!args.tilemapPath) {
      return this.createErrorResponse(
        'TileMap path is required',
        ['Provide the NodePath to the TileMap node (e.g., "TileMap" or "World/TileMap")']
      );
    }

    try {
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          ['Ensure the directory contains a project.godot file']
        );
      }

      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file not found: ${args.scenePath}`,
          ['Ensure the scene file exists']
        );
      }

      // Prepare parameters for GDScript operation
      const params = {
        scene_path: args.scenePath,
        tilemap_path: args.tilemapPath,
        layer: args.layer ?? 0,
        source_id: args.sourceId ?? 0,
        tiles: args.tiles || [],
        pattern: args.pattern || 'single',
        rect_start: args.rectStart || null,
        rect_end: args.rectEnd || null,
      };

      // Execute GDScript operation
      const { stdout, stderr } = await this.executeOperation(
        'paint_tiles',
        params,
        args.projectPath
      );

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to paint tiles: ${stderr}`,
          ['Check the TileMap node exists', 'Verify the TileSet is configured']
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: stdout,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to paint tiles: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Ensure the TileMap node exists in the scene',
          'Check that the TileSet is configured',
        ]
      );
    }
  }

  /**
   * Handle the configure_tileset tool
   * Configures TileSet resource with collision, navigation, and terrain settings
   * @param args Tool arguments
   */
  private async handleConfigureTileset(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.tilesetPath) {
      return this.createErrorResponse(
        'TileSet path is required',
        ['Provide the path to the TileSet resource (.tres file)']
      );
    }

    try {
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          ['Ensure the directory contains a project.godot file']
        );
      }

      // Prepare parameters for GDScript operation
      const params = {
        tileset_path: args.tilesetPath,
        texture_path: args.texturePath || '',
        tile_size: args.tileSize || { x: 16, y: 16 },
        tile_config: args.tileConfig || [],
        physics_layer: args.physicsLayer ?? 0,
        navigation_layer: args.navigationLayer ?? 0,
      };

      // Execute GDScript operation
      const { stdout, stderr } = await this.executeOperation(
        'configure_tileset',
        params,
        args.projectPath
      );

      if (stderr && stderr.includes('ERROR')) {
        return this.createErrorResponse(
          `Failed to configure tileset: ${stderr}`,
          ['Check the TileSet path is correct', 'Verify the texture file exists']
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: stdout,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to configure tileset: ${errorMessage}`,
        [
          'Verify the project path is correct',
          'Ensure the texture file exists if specified',
          'Check file permissions',
        ]
      );
    }
  }

  // ==========================================
  // Phase 11: Dialogue & Localization Management
  // ==========================================

  /**
   * Handle the create_translation_file tool
   * Creates a new translation file (CSV or PO format)
   */
  private async handleCreateTranslationFile(args: any) {
    args = this.normalizeParameters(args);

    const projectPath = args.projectPath;
    const translationPath = args.translationPath;
    const format = args.format || 'csv';
    const locales: string[] = args.locales || [];
    const initialKeys: Array<{ key: string; translations: Record<string, string> }> = args.initialKeys || [];

    if (!projectPath) {
      return this.createErrorResponse('Project path is required');
    }

    if (!translationPath) {
      return this.createErrorResponse('Translation path is required');
    }

    if (!locales || locales.length === 0) {
      return this.createErrorResponse('At least one locale is required');
    }

    const fullPath = join(projectPath, translationPath);
    const dirPath = dirname(fullPath);

    try {
      // Create directory if it doesn't exist
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }

      let content = '';

      if (format === 'csv') {
        // CSV format: key,locale1,locale2,...
        const header = ['key', ...locales].join(',');
        const rows = [header];

        for (const entry of initialKeys) {
          const row = [this.escapeCsvValue(entry.key)];
          for (const locale of locales) {
            const translation = entry.translations[locale] || '';
            row.push(this.escapeCsvValue(translation));
          }
          rows.push(row.join(','));
        }

        content = rows.join('\n') + '\n';
      } else if (format === 'po') {
        // PO format: GNU gettext
        const poHeader = `# Translation file
# Language: ${locales[0]}
msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: ${locales[0]}\\n"

`;
        const entries: string[] = [poHeader];

        for (const entry of initialKeys) {
          const translation = entry.translations[locales[0]] || '';
          entries.push(`msgid "${this.escapePoString(entry.key)}"\nmsgstr "${this.escapePoString(translation)}"\n`);
        }

        content = entries.join('\n');
      } else {
        return this.createErrorResponse(`Unsupported format: ${format}. Use 'csv' or 'po'.`);
      }

      writeFileSync(fullPath, content, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              translationPath: translationPath,
              format: format,
              locales: locales,
              keysAdded: initialKeys.length,
              message: `Translation file created at ${translationPath}`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to create translation file: ${errorMessage}`);
    }
  }

  /**
   * Handle the add_translation tool
   * Add or update a translation entry
   */
  private async handleAddTranslation(args: any) {
    args = this.normalizeParameters(args);

    const projectPath = args.projectPath;
    const translationPath = args.translationPath;
    const key = args.key;
    const translations: Record<string, string> = args.translations || {};
    const comment = args.comment;

    if (!projectPath || !translationPath || !key) {
      return this.createErrorResponse('Project path, translation path, and key are required');
    }

    const fullPath = join(projectPath, translationPath);

    if (!existsSync(fullPath)) {
      return this.createErrorResponse(`Translation file not found: ${translationPath}`);
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const ext = translationPath.toLowerCase();

      if (ext.endsWith('.csv')) {
        // Parse and update CSV
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length === 0) {
          return this.createErrorResponse('Translation file is empty');
        }

        const header = this.parseCsvLine(lines[0]);
        const locales = header.slice(1);

        // Find or add the key
        let found = false;
        const newLines = [lines[0]];

        for (let i = 1; i < lines.length; i++) {
          const row = this.parseCsvLine(lines[i]);
          if (row[0] === key) {
            // Update existing key
            found = true;
            const newRow = [this.escapeCsvValue(key)];
            for (const locale of locales) {
              const translation = translations[locale] !== undefined ? translations[locale] : (row[locales.indexOf(locale) + 1] || '');
              newRow.push(this.escapeCsvValue(translation));
            }
            newLines.push(newRow.join(','));
          } else {
            newLines.push(lines[i]);
          }
        }

        if (!found) {
          // Add new key
          const newRow = [this.escapeCsvValue(key)];
          for (const locale of locales) {
            newRow.push(this.escapeCsvValue(translations[locale] || ''));
          }
          newLines.push(newRow.join(','));
        }

        writeFileSync(fullPath, newLines.join('\n') + '\n', 'utf-8');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                key: key,
                action: found ? 'updated' : 'added',
                translations: translations,
              }, null, 2),
            },
          ],
        };
      } else if (ext.endsWith('.po')) {
        // Parse and update PO file
        let newContent = content;
        const msgidPattern = new RegExp(`msgid "${this.escapeRegex(key)}"\\nmsgstr "[^"]*"`, 'g');

        if (msgidPattern.test(content)) {
          // Update existing entry
          const locale = Object.keys(translations)[0];
          const translation = translations[locale] || '';
          newContent = content.replace(msgidPattern, `msgid "${this.escapePoString(key)}"\nmsgstr "${this.escapePoString(translation)}"`);
        } else {
          // Add new entry
          const locale = Object.keys(translations)[0];
          const translation = translations[locale] || '';
          let entry = '';
          if (comment) {
            entry += `# ${comment}\n`;
          }
          entry += `msgid "${this.escapePoString(key)}"\nmsgstr "${this.escapePoString(translation)}"\n`;
          newContent = content.trimEnd() + '\n\n' + entry;
        }

        writeFileSync(fullPath, newContent, 'utf-8');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                key: key,
                action: msgidPattern.test(content) ? 'updated' : 'added',
                translations: translations,
              }, null, 2),
            },
          ],
        };
      } else {
        return this.createErrorResponse('Unsupported file format. Use .csv or .po files.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to add translation: ${errorMessage}`);
    }
  }

  /**
   * Handle the remove_translation tool
   * Remove translation keys from a file
   */
  private async handleRemoveTranslation(args: any) {
    args = this.normalizeParameters(args);

    const projectPath = args.projectPath;
    const translationPath = args.translationPath;
    const keys: string[] = args.keys || [];
    const pattern = args.pattern;
    const dryRun = args.dryRun || false;

    if (!projectPath || !translationPath) {
      return this.createErrorResponse('Project path and translation path are required');
    }

    if (!keys.length && !pattern) {
      return this.createErrorResponse('Either keys or pattern is required');
    }

    const fullPath = join(projectPath, translationPath);

    if (!existsSync(fullPath)) {
      return this.createErrorResponse(`Translation file not found: ${translationPath}`);
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const ext = translationPath.toLowerCase();
      const removedKeys: string[] = [];

      if (ext.endsWith('.csv')) {
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length === 0) {
          return this.createErrorResponse('Translation file is empty');
        }

        const newLines = [lines[0]]; // Keep header
        const patternRegex = pattern ? new RegExp(pattern) : null;

        for (let i = 1; i < lines.length; i++) {
          const row = this.parseCsvLine(lines[i]);
          const rowKey = row[0];

          const shouldRemove = keys.includes(rowKey) || (patternRegex && patternRegex.test(rowKey));

          if (shouldRemove) {
            removedKeys.push(rowKey);
          } else {
            newLines.push(lines[i]);
          }
        }

        if (!dryRun && removedKeys.length > 0) {
          writeFileSync(fullPath, newLines.join('\n') + '\n', 'utf-8');
        }
      } else if (ext.endsWith('.po')) {
        const patternRegex = pattern ? new RegExp(pattern) : null;
        let newContent = content;

        // Find all msgid entries
        const msgidRegex = /msgid "([^"]+)"\nmsgstr "[^"]*"\n?/g;
        let match;
        const entriesToRemove: string[] = [];

        while ((match = msgidRegex.exec(content)) !== null) {
          const msgid = match[1];
          const shouldRemove = keys.includes(msgid) || (patternRegex && patternRegex.test(msgid));
          if (shouldRemove) {
            entriesToRemove.push(match[0]);
            removedKeys.push(msgid);
          }
        }

        if (!dryRun && entriesToRemove.length > 0) {
          for (const entry of entriesToRemove) {
            newContent = newContent.replace(entry, '');
          }
          // Clean up extra newlines
          newContent = newContent.replace(/\n{3,}/g, '\n\n');
          writeFileSync(fullPath, newContent, 'utf-8');
        }
      } else {
        return this.createErrorResponse('Unsupported file format. Use .csv or .po files.');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              dryRun: dryRun,
              removedCount: removedKeys.length,
              removedKeys: removedKeys,
              message: dryRun ? 'Dry run - no changes made' : `Removed ${removedKeys.length} translation(s)`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to remove translation: ${errorMessage}`);
    }
  }

  /**
   * Handle the validate_translations tool
   * Validate translation files for completeness
   */
  private async handleValidateTranslations(args: any) {
    args = this.normalizeParameters(args);

    const projectPath = args.projectPath;
    const translationPath = args.translationPath;
    const referenceLocale = args.referenceLocale;
    const checkPlaceholders = args.checkPlaceholders !== false;

    if (!projectPath || !translationPath) {
      return this.createErrorResponse('Project path and translation path are required');
    }

    const fullPath = join(projectPath, translationPath);

    if (!existsSync(fullPath)) {
      return this.createErrorResponse(`Translation file not found: ${translationPath}`);
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const ext = translationPath.toLowerCase();

      const issues: Array<{
        type: string;
        severity: string;
        key?: string;
        locale?: string;
        message: string;
        details?: any;
      }> = [];

      let totalKeys = 0;
      let completeKeys = 0;
      let missingTranslations = 0;
      let placeholderMismatches = 0;
      let duplicateKeys = 0;

      if (ext.endsWith('.csv')) {
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length === 0) {
          return this.createErrorResponse('Translation file is empty');
        }

        const header = this.parseCsvLine(lines[0]);
        const locales = header.slice(1);
        const refLocaleIndex = referenceLocale ? locales.indexOf(referenceLocale) : 0;
        const refLocale = locales[refLocaleIndex] || locales[0];
        const seenKeys = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
          const row = this.parseCsvLine(lines[i]);
          const key = row[0];
          totalKeys++;

          // Check for duplicates
          if (seenKeys.has(key)) {
            duplicateKeys++;
            issues.push({
              type: 'duplicate_key',
              severity: 'error',
              key: key,
              message: `Duplicate key: '${key}'`,
            });
          }
          seenKeys.add(key);

          // Check for missing translations
          let keyComplete = true;
          const refTranslation = row[refLocaleIndex + 1] || '';

          for (let j = 0; j < locales.length; j++) {
            const translation = row[j + 1] || '';
            if (!translation.trim()) {
              keyComplete = false;
              missingTranslations++;
              issues.push({
                type: 'missing_translation',
                severity: 'warning',
                key: key,
                locale: locales[j],
                message: `Missing ${locales[j]} translation for key '${key}'`,
              });
            }

            // Check placeholders
            if (checkPlaceholders && translation.trim() && refTranslation.trim() && j !== refLocaleIndex) {
              const refPlaceholders = this.extractPlaceholders(refTranslation);
              const transPlaceholders = this.extractPlaceholders(translation);

              if (refPlaceholders.length !== transPlaceholders.length ||
                  !refPlaceholders.every(p => transPlaceholders.includes(p))) {
                placeholderMismatches++;
                issues.push({
                  type: 'placeholder_mismatch',
                  severity: 'error',
                  key: key,
                  message: `Placeholder mismatch in '${key}' between ${refLocale} and ${locales[j]}`,
                  details: {
                    [refLocale]: refTranslation,
                    [locales[j]]: translation,
                    refPlaceholders: refPlaceholders,
                    transPlaceholders: transPlaceholders,
                  },
                });
              }
            }
          }

          if (keyComplete) {
            completeKeys++;
          }
        }
      } else if (ext.endsWith('.po')) {
        // Basic PO validation
        const msgidRegex = /msgid "([^"]+)"\nmsgstr "([^"]*)"/g;
        let match;
        const seenKeys = new Set<string>();

        while ((match = msgidRegex.exec(content)) !== null) {
          const msgid = match[1];
          const msgstr = match[2];
          totalKeys++;

          if (seenKeys.has(msgid)) {
            duplicateKeys++;
            issues.push({
              type: 'duplicate_key',
              severity: 'error',
              key: msgid,
              message: `Duplicate key: '${msgid}'`,
            });
          }
          seenKeys.add(msgid);

          if (!msgstr.trim()) {
            missingTranslations++;
            issues.push({
              type: 'missing_translation',
              severity: 'warning',
              key: msgid,
              message: `Missing translation for key '${msgid}'`,
            });
          } else {
            completeKeys++;

            // Check placeholders
            if (checkPlaceholders) {
              const refPlaceholders = this.extractPlaceholders(msgid);
              const transPlaceholders = this.extractPlaceholders(msgstr);

              if (refPlaceholders.length > 0 &&
                  (refPlaceholders.length !== transPlaceholders.length ||
                   !refPlaceholders.every(p => transPlaceholders.includes(p)))) {
                placeholderMismatches++;
                issues.push({
                  type: 'placeholder_mismatch',
                  severity: 'error',
                  key: msgid,
                  message: `Placeholder mismatch in '${msgid}'`,
                  details: {
                    msgid: msgid,
                    msgstr: msgstr,
                  },
                });
              }
            }
          }
        }
      }

      const errors = issues.filter(i => i.severity === 'error').length;
      const warnings = issues.filter(i => i.severity === 'warning').length;

      const recommendations: string[] = [];
      if (missingTranslations > 0) {
        recommendations.push(`Add missing translations (${missingTranslations} total)`);
      }
      if (placeholderMismatches > 0) {
        recommendations.push('Fix placeholder mismatches to ensure proper variable substitution');
      }
      if (duplicateKeys > 0) {
        recommendations.push('Remove or rename duplicate keys');
      }
      if (issues.length === 0) {
        recommendations.push('All translations are complete and valid');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              valid: errors === 0,
              translationPath: translationPath,
              summary: {
                totalKeys: totalKeys,
                completeKeys: completeKeys,
                missingTranslations: missingTranslations,
                placeholderMismatches: placeholderMismatches,
                duplicateKeys: duplicateKeys,
                warnings: warnings,
                errors: errors,
              },
              issues: issues,
              recommendations: recommendations,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to validate translations: ${errorMessage}`);
    }
  }

  /**
   * Handle the create_dialogue_resource tool
   * Create a dialogue resource file
   */
  private async handleCreateDialogueResource(args: any) {
    args = this.normalizeParameters(args);

    const projectPath = args.projectPath;
    const dialoguePath = args.dialoguePath;
    const dialogueId = args.dialogueId;
    const entries: Array<{
      id: string;
      speaker?: string;
      text: string;
      choices?: Array<{ text: string; nextId?: string; condition?: string }>;
      nextId?: string;
      signals?: string[];
    }> = args.entries || [];
    const characters = args.characters || {};
    const variables: string[] = args.variables || [];

    if (!projectPath || !dialoguePath || !dialogueId) {
      return this.createErrorResponse('Project path, dialogue path, and dialogue ID are required');
    }

    if (!entries || entries.length === 0) {
      return this.createErrorResponse('At least one dialogue entry is required');
    }

    const fullPath = join(projectPath, dialoguePath);
    const dirPath = dirname(fullPath);

    try {
      // Create directory if it doesn't exist
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }

      // Generate .tres file content
      const uid = this.generateUID();

      // Build entries array for the resource
      const entriesContent: string[] = [];
      for (const entry of entries) {
        const entryLines: string[] = ['{'];
        entryLines.push(`"id": "${entry.id}",`);
        if (entry.speaker) {
          entryLines.push(`"speaker": "${entry.speaker}",`);
        }
        entryLines.push(`"text": "${entry.text}",`);

        if (entry.choices && entry.choices.length > 0) {
          const choicesContent = entry.choices.map(c => {
            const parts = [`"text": "${c.text}"`];
            if (c.nextId !== undefined) {
              parts.push(`"next_id": ${c.nextId === null ? 'null' : `"${c.nextId}"`}`);
            }
            if (c.condition) {
              parts.push(`"condition": "${c.condition}"`);
            }
            return `{ ${parts.join(', ')} }`;
          });
          entryLines.push(`"choices": [${choicesContent.join(', ')}],`);
        }

        if (entry.nextId !== undefined) {
          entryLines.push(`"next_id": ${entry.nextId === null ? 'null' : `"${entry.nextId}"`},`);
        }

        if (entry.signals && entry.signals.length > 0) {
          entryLines.push(`"signals": [${entry.signals.map(s => `"${s}"`).join(', ')}],`);
        }

        // Remove trailing comma from last property
        const lastLine = entryLines[entryLines.length - 1];
        entryLines[entryLines.length - 1] = lastLine.replace(/,$/, '');
        entryLines.push('}');

        entriesContent.push(entryLines.join('\n'));
      }

      // Build characters dictionary
      const charsContent: string[] = [];
      for (const [charId, charData] of Object.entries(characters)) {
        const charProps: string[] = [];
        for (const [key, value] of Object.entries(charData as Record<string, any>)) {
          if (typeof value === 'string') {
            charProps.push(`"${key}": "${value}"`);
          } else {
            charProps.push(`"${key}": ${JSON.stringify(value)}`);
          }
        }
        charsContent.push(`"${charId}": { ${charProps.join(', ')} }`);
      }

      const tresContent = `[gd_resource type="Resource" script_class="DialogueResource" format=3 uid="uid://${uid}"]

[resource]
script = null
dialogue_id = "${dialogueId}"
entries = [${entriesContent.join(',\n')}]
characters = {${charsContent.join(', ')}}
variables = [${variables.map(v => `"${v}"`).join(', ')}]
`;

      writeFileSync(fullPath, tresContent, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              dialoguePath: dialoguePath,
              dialogueId: dialogueId,
              entryCount: entries.length,
              characterCount: Object.keys(characters).length,
              variableCount: variables.length,
              message: `Dialogue resource created at ${dialoguePath}`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to create dialogue resource: ${errorMessage}`);
    }
  }

  /**
   * Handle the configure_localization tool
   * Configure project localization settings
   */
  private async handleConfigureLocalization(args: any) {
    args = this.normalizeParameters(args);

    const projectPath = args.projectPath;
    const locales: string[] = args.locales || [];
    const translationFiles: string[] = args.translationFiles || [];
    const fallbackLocale = args.fallbackLocale;
    const testLocale = args.testLocale;
    const removeLocales: string[] = args.removeLocales || [];

    if (!projectPath) {
      return this.createErrorResponse('Project path is required');
    }

    const projectFile = join(projectPath, 'project.godot');

    if (!existsSync(projectFile)) {
      return this.createErrorResponse(`Project file not found: ${projectFile}`);
    }

    try {
      let content = readFileSync(projectFile, 'utf-8');
      const changes: string[] = [];

      // Ensure [internationalization] section exists
      if (!content.includes('[internationalization]')) {
        content = content.trimEnd() + '\n\n[internationalization]\n';
      }

      // Add translation files
      if (translationFiles.length > 0) {
        const filesArray = translationFiles
          .map(f => f.startsWith('res://') ? f : `res://${f}`)
          .map(f => `"${f}"`)
          .join(', ');
        const translationsLine = `locale/translations=PackedStringArray(${filesArray})`;

        if (content.includes('locale/translations=')) {
          content = content.replace(/locale\/translations=.*/, translationsLine);
        } else {
          content = content.replace('[internationalization]', `[internationalization]\n${translationsLine}`);
        }
        changes.push(`Registered ${translationFiles.length} translation file(s)`);
      }

      // Set fallback locale
      if (fallbackLocale) {
        const fallbackLine = `locale/fallback="${fallbackLocale}"`;

        if (content.includes('locale/fallback=')) {
          content = content.replace(/locale\/fallback=.*/, fallbackLine);
        } else {
          content = content.replace('[internationalization]', `[internationalization]\n${fallbackLine}`);
        }
        changes.push(`Set fallback locale to ${fallbackLocale}`);
      }

      // Set test locale
      if (testLocale) {
        const testLine = `locale/test="${testLocale}"`;

        if (content.includes('locale/test=')) {
          content = content.replace(/locale\/test=.*/, testLine);
        } else {
          content = content.replace('[internationalization]', `[internationalization]\n${testLine}`);
        }
        changes.push(`Set test locale to ${testLocale}`);
      }

      // Configure locale filter (enabled locales)
      if (locales.length > 0 || removeLocales.length > 0) {
        // Get existing locales
        let existingLocales: string[] = [];
        const filterMatch = content.match(/locale\/locale_filter=\[(\d+),\s*PackedStringArray\(([^)]*)\)\]/);
        if (filterMatch) {
          existingLocales = filterMatch[2].split(',').map(s => s.trim().replace(/"/g, '')).filter(s => s);
        }

        // Add new locales
        for (const locale of locales) {
          if (!existingLocales.includes(locale)) {
            existingLocales.push(locale);
          }
        }

        // Remove specified locales
        existingLocales = existingLocales.filter(l => !removeLocales.includes(l));

        const localesArray = existingLocales.map(l => `"${l}"`).join(', ');
        const filterLine = `locale/locale_filter=[1, PackedStringArray(${localesArray})]`;

        if (content.includes('locale/locale_filter=')) {
          content = content.replace(/locale\/locale_filter=.*/, filterLine);
        } else {
          content = content.replace('[internationalization]', `[internationalization]\n${filterLine}`);
        }

        if (locales.length > 0) {
          changes.push(`Added locales: ${locales.join(', ')}`);
        }
        if (removeLocales.length > 0) {
          changes.push(`Removed locales: ${removeLocales.join(', ')}`);
        }
      }

      writeFileSync(projectFile, content, 'utf-8');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              changes: changes,
              message: changes.length > 0 ? 'Localization settings updated' : 'No changes made',
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to configure localization: ${errorMessage}`);
    }
  }

  /**
   * Handle the extract_translatable_strings tool
   * Scan project files for translatable strings
   */
  private async handleExtractTranslatableStrings(args: any) {
    args = this.normalizeParameters(args);

    const projectPath = args.projectPath;
    const outputPath = args.outputPath;
    const outputFormat = args.outputFormat || 'csv';
    const scanPaths: string[] = args.scanPaths || ['.'];
    const includeScenes = args.includeScenes !== false;
    const excludePatterns: string[] = args.excludePatterns || ['addons/*', '.godot/*'];

    if (!projectPath) {
      return this.createErrorResponse('Project path is required');
    }

    if (!existsSync(projectPath)) {
      return this.createErrorResponse(`Project path not found: ${projectPath}`);
    }

    try {
      const extractedStrings: Map<string, {
        key: string;
        sources: string[];
        context?: string;
        occurrences: number;
      }> = new Map();

      const warnings: string[] = [];
      let fromScripts = 0;
      let fromScenes = 0;

      // Helper to check if path should be excluded
      const shouldExclude = (filePath: string): boolean => {
        const relativePath = filePath.replace(projectPath, '').replace(/^[\/\\]/, '');
        return excludePatterns.some(pattern => {
          const regexPattern = pattern.replace(/\*/g, '.*');
          return new RegExp(`^${regexPattern}`).test(relativePath);
        });
      };

      // Recursively scan directory
      const scanDirectory = (dir: string) => {
        if (!existsSync(dir)) return;

        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullEntryPath = join(dir, entry.name);

          if (shouldExclude(fullEntryPath)) continue;

          if (entry.isDirectory()) {
            scanDirectory(fullEntryPath);
          } else if (entry.isFile()) {
            if (entry.name.endsWith('.gd')) {
              // Scan GDScript file
              const content = readFileSync(fullEntryPath, 'utf-8');
              const relativePath = fullEntryPath.replace(projectPath, '').replace(/^[\/\\]/, '');

              // Find tr() calls
              const trRegex = /tr\s*\(\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?\s*\)/g;
              let match;
              let lineNum = 0;
              const lines = content.split('\n');

              for (const line of lines) {
                lineNum++;
                const lineRegex = /tr\s*\(\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?\s*\)/g;
                while ((match = lineRegex.exec(line)) !== null) {
                  const key = match[1];
                  const context = match[2];
                  const source = `res://${relativePath}:${lineNum}`;

                  if (extractedStrings.has(key)) {
                    const existing = extractedStrings.get(key)!;
                    existing.sources.push(source);
                    existing.occurrences++;
                  } else {
                    extractedStrings.set(key, {
                      key: key,
                      sources: [source],
                      context: context,
                      occurrences: 1,
                    });
                  }
                  fromScripts++;
                }

                // Detect potential hardcoded strings (simple heuristic)
                const hardcodedRegex = /(?:text|title|hint_tooltip)\s*=\s*"([^"]+)"/g;
                while ((match = hardcodedRegex.exec(line)) !== null) {
                  const str = match[1];
                  if (str.length > 2 && !/^[A-Z_]+$/.test(str) && !/^res:\/\//.test(str)) {
                    warnings.push(`Potential hardcoded string at res://${relativePath}:${lineNum} - consider using tr()`);
                  }
                }
              }
            } else if (includeScenes && entry.name.endsWith('.tscn')) {
              // Scan scene file for UI text
              const content = readFileSync(fullEntryPath, 'utf-8');
              const relativePath = fullEntryPath.replace(projectPath, '').replace(/^[\/\\]/, '');

              // Find text properties
              const textRegex = /(?:text|placeholder_text|tooltip_text|window_title)\s*=\s*"([^"]+)"/g;
              let match;

              while ((match = textRegex.exec(content)) !== null) {
                const text = match[1];
                // Skip if it looks like a translation key
                if (/^[A-Z_]+$/.test(text)) {
                  const source = `res://${relativePath}`;
                  if (extractedStrings.has(text)) {
                    const existing = extractedStrings.get(text)!;
                    if (!existing.sources.includes(source)) {
                      existing.sources.push(source);
                    }
                    existing.occurrences++;
                  } else {
                    extractedStrings.set(text, {
                      key: text,
                      sources: [source],
                      occurrences: 1,
                    });
                  }
                  fromScenes++;
                } else if (text.length > 2) {
                  warnings.push(`Hardcoded UI text in res://${relativePath}: "${text.substring(0, 50)}..." - consider using tr()`);
                }
              }
            }
          }
        }
      };

      // Scan specified paths
      for (const scanPath of scanPaths) {
        const fullScanPath = join(projectPath, scanPath);
        scanDirectory(fullScanPath);
      }

      // Generate output
      const stringsArray = Array.from(extractedStrings.values());
      const duplicates = stringsArray.filter(s => s.occurrences > 1).length;

      if (outputPath) {
        const fullOutputPath = join(projectPath, outputPath);
        const outputDir = dirname(fullOutputPath);

        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        if (outputFormat === 'csv') {
          const lines = ['key,context,sources'];
          for (const str of stringsArray) {
            lines.push(`${this.escapeCsvValue(str.key)},${this.escapeCsvValue(str.context || '')},${this.escapeCsvValue(str.sources.join(';'))}`);
          }
          writeFileSync(fullOutputPath, lines.join('\n') + '\n', 'utf-8');
        } else if (outputFormat === 'po') {
          const entries = [`# Extracted strings
msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
`];
          for (const str of stringsArray) {
            let entry = '';
            if (str.sources.length > 0) {
              entry += `#: ${str.sources.join(' ')}\n`;
            }
            entry += `msgid "${this.escapePoString(str.key)}"\nmsgstr ""\n`;
            entries.push(entry);
          }
          writeFileSync(fullOutputPath, entries.join('\n'), 'utf-8');
        } else if (outputFormat === 'json') {
          writeFileSync(fullOutputPath, JSON.stringify(stringsArray, null, 2), 'utf-8');
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              outputPath: outputPath || null,
              summary: {
                totalStrings: stringsArray.length,
                fromScripts: fromScripts,
                fromScenes: fromScenes,
                uniqueKeys: stringsArray.length,
                duplicates: duplicates,
              },
              strings: stringsArray.slice(0, 50), // Limit output
              warnings: warnings.slice(0, 20), // Limit warnings
              message: outputPath ? `Extracted ${stringsArray.length} strings to ${outputPath}` : `Found ${stringsArray.length} translatable strings`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to extract translatable strings: ${errorMessage}`);
    }
  }

  // ==================== Phase 12: Plugin Management ====================

  /**
   * Handle the list_plugins tool
   * Lists all installed plugins in a Godot project with their status
   */
  private async handleListPlugins(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse('Project path is required');
    }

    const projectPath = normalize(args.projectPath);
    const projectFile = join(projectPath, 'project.godot');
    const addonsPath = join(projectPath, 'addons');
    const includeBuiltin = args.includeBuiltin || false;
    const verbose = args.verbose || false;

    if (!existsSync(projectFile)) {
      return this.createErrorResponse(
        `Invalid project path: ${projectPath}`,
        ['Ensure the path contains a project.godot file']
      );
    }

    try {
      const plugins: any[] = [];

      // Get enabled plugins from project.godot
      const enabledPlugins: string[] = [];
      const projectContent = readFileSync(projectFile, 'utf-8');
      const enabledMatch = projectContent.match(/\[editor_plugins\][\s\S]*?enabled\s*=\s*PackedStringArray\(([\s\S]*?)\)/);
      if (enabledMatch) {
        const enabledStr = enabledMatch[1];
        const matches = enabledStr.matchAll(/"([^"]+)"/g);
        for (const match of matches) {
          enabledPlugins.push(match[1]);
        }
      }

      // Scan addons directory
      if (existsSync(addonsPath)) {
        const addonFolders = readdirSync(addonsPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        for (const folder of addonFolders) {
          const pluginCfgPath = join(addonsPath, folder, 'plugin.cfg');
          const pluginInfo: any = {
            id: folder,
            path: `res://addons/${folder}`,
            enabled: enabledPlugins.some(p => p.includes(`addons/${folder}/plugin.cfg`)),
          };

          if (existsSync(pluginCfgPath)) {
            const cfgContent = readFileSync(pluginCfgPath, 'utf-8');

            // Parse INI-style plugin.cfg
            const getName = cfgContent.match(/name\s*=\s*"([^"]+)"/);
            const getDesc = cfgContent.match(/description\s*=\s*"([^"]+)"/);
            const getAuthor = cfgContent.match(/author\s*=\s*"([^"]+)"/);
            const getVersion = cfgContent.match(/version\s*=\s*"([^"]+)"/);
            const getScript = cfgContent.match(/script\s*=\s*"([^"]+)"/);

            pluginInfo.name = getName ? getName[1] : folder;
            pluginInfo.description = getDesc ? getDesc[1] : '';
            pluginInfo.author = getAuthor ? getAuthor[1] : '';
            pluginInfo.version = getVersion ? getVersion[1] : '';
            pluginInfo.script = getScript ? getScript[1] : '';
            pluginInfo.hasPluginCfg = true;

            if (verbose) {
              pluginInfo.rawConfig = cfgContent;
            }
          } else {
            pluginInfo.name = folder;
            pluginInfo.hasPluginCfg = false;
            pluginInfo.warning = 'Missing plugin.cfg file';
          }

          plugins.push(pluginInfo);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              projectPath: projectPath,
              pluginCount: plugins.length,
              enabledCount: plugins.filter(p => p.enabled).length,
              plugins: plugins,
              message: `Found ${plugins.length} plugin(s) in ${projectPath}`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to list plugins: ${errorMessage}`);
    }
  }

  /**
   * Handle the configure_plugin tool
   * Enable, disable, or configure plugin settings
   */
  private async handleConfigurePlugin(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse('Project path is required');
    }
    if (!args.pluginId) {
      return this.createErrorResponse('Plugin ID is required');
    }

    const projectPath = normalize(args.projectPath);
    const projectFile = join(projectPath, 'project.godot');
    const addonsPath = join(projectPath, 'addons');
    const pluginPath = join(addonsPath, args.pluginId);
    const pluginCfgPath = join(pluginPath, 'plugin.cfg');

    if (!existsSync(projectFile)) {
      return this.createErrorResponse(
        `Invalid project path: ${projectPath}`,
        ['Ensure the path contains a project.godot file']
      );
    }

    if (!existsSync(pluginPath)) {
      return this.createErrorResponse(
        `Plugin not found: ${args.pluginId}`,
        ['Ensure the plugin is installed in addons/ directory', `Use list_plugins to see available plugins`]
      );
    }

    try {
      let projectContent = readFileSync(projectFile, 'utf-8');
      const pluginCfgRef = `res://addons/${args.pluginId}/plugin.cfg`;
      const results: any = {
        pluginId: args.pluginId,
        changes: [],
      };

      // Handle enable/disable
      if (args.enabled !== undefined) {
        // Find or create [editor_plugins] section
        let enabledPlugins: string[] = [];
        const enabledMatch = projectContent.match(/\[editor_plugins\][\s\S]*?enabled\s*=\s*PackedStringArray\(([\s\S]*?)\)/);

        if (enabledMatch) {
          const enabledStr = enabledMatch[1];
          const matches = enabledStr.matchAll(/"([^"]+)"/g);
          for (const match of matches) {
            enabledPlugins.push(match[1]);
          }
        }

        const wasEnabled = enabledPlugins.includes(pluginCfgRef);
        results.previouslyEnabled = wasEnabled;
        results.enabled = args.enabled;

        if (args.enabled && !wasEnabled) {
          // Enable plugin
          enabledPlugins.push(pluginCfgRef);
          results.changes.push(`Enabled plugin: ${args.pluginId}`);
        } else if (!args.enabled && wasEnabled) {
          // Disable plugin
          enabledPlugins = enabledPlugins.filter(p => p !== pluginCfgRef);
          results.changes.push(`Disabled plugin: ${args.pluginId}`);
        } else {
          results.changes.push(`Plugin already ${args.enabled ? 'enabled' : 'disabled'}`);
        }

        // Update project.godot
        const newEnabledArray = enabledPlugins.map(p => `"${p}"`).join(', ');
        const newEditorPlugins = `[editor_plugins]\n\nenabled=PackedStringArray(${newEnabledArray})`;

        if (projectContent.includes('[editor_plugins]')) {
          // Replace existing section
          projectContent = projectContent.replace(
            /\[editor_plugins\][\s\S]*?enabled\s*=\s*PackedStringArray\([^)]*\)/,
            newEditorPlugins
          );
        } else {
          // Add new section
          projectContent = projectContent.trimEnd() + '\n\n' + newEditorPlugins + '\n';
        }
      }

      // Handle custom settings
      if (args.settings && typeof args.settings === 'object') {
        const settingsSection = `[${args.pluginId}]`;
        const settingsUpdated: string[] = [];

        for (const [key, value] of Object.entries(args.settings)) {
          let formattedValue: string;
          if (typeof value === 'string') {
            formattedValue = `"${value}"`;
          } else if (typeof value === 'boolean') {
            formattedValue = value ? 'true' : 'false';
          } else if (typeof value === 'number') {
            formattedValue = String(value);
          } else {
            formattedValue = JSON.stringify(value);
          }

          // Check if section exists
          if (projectContent.includes(settingsSection)) {
            // Check if key exists in section
            const keyRegex = new RegExp(`(\\[${args.pluginId}\\][\\s\\S]*?)${key}\\s*=\\s*[^\\n]+`);
            if (keyRegex.test(projectContent)) {
              // Update existing key
              projectContent = projectContent.replace(keyRegex, `$1${key}=${formattedValue}`);
            } else {
              // Add key to section
              projectContent = projectContent.replace(
                new RegExp(`(\\[${args.pluginId}\\]\\n)`),
                `$1${key}=${formattedValue}\n`
              );
            }
          } else {
            // Create new section
            projectContent = projectContent.trimEnd() + `\n\n${settingsSection}\n${key}=${formattedValue}\n`;
          }
          settingsUpdated.push(key);
        }

        results.settingsUpdated = settingsUpdated;
        results.changes.push(`Updated settings: ${settingsUpdated.join(', ')}`);
      }

      // Write updated project.godot
      writeFileSync(projectFile, projectContent, 'utf-8');

      results.message = results.changes.length > 0
        ? `Plugin configured: ${results.changes.join('; ')}`
        : 'No changes made';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to configure plugin: ${errorMessage}`);
    }
  }

  /**
   * Handle the create_plugin tool
   * Generate a new plugin scaffold with plugin.cfg and main script
   */
  private async handleCreatePlugin(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse('Project path is required');
    }
    if (!args.pluginId) {
      return this.createErrorResponse('Plugin ID is required');
    }
    if (!args.pluginName) {
      return this.createErrorResponse('Plugin name is required');
    }
    if (!args.author) {
      return this.createErrorResponse('Author is required');
    }

    const projectPath = normalize(args.projectPath);
    const projectFile = join(projectPath, 'project.godot');

    if (!existsSync(projectFile)) {
      return this.createErrorResponse(
        `Invalid project path: ${projectPath}`,
        ['Ensure the path contains a project.godot file']
      );
    }

    // Validate plugin ID format
    if (!/^[a-z][a-z0-9_]*$/.test(args.pluginId)) {
      return this.createErrorResponse(
        `Invalid plugin ID: ${args.pluginId}`,
        ['Plugin ID should be lowercase alphanumeric with underscores', 'Example: my_plugin, awesome_tool']
      );
    }

    const addonsPath = join(projectPath, 'addons');
    const pluginPath = join(addonsPath, args.pluginId);

    if (existsSync(pluginPath)) {
      return this.createErrorResponse(
        `Plugin already exists: ${args.pluginId}`,
        ['Use a different plugin ID', 'Or delete the existing plugin first']
      );
    }

    try {
      const template = args.template || 'basic';
      const version = args.version || '1.0.0';
      const description = args.description || '';
      const filesCreated: string[] = [];

      // Create directory structure
      mkdirSync(pluginPath, { recursive: true });

      // Generate plugin.cfg
      const pluginCfg = `[plugin]

name="${args.pluginName}"
description="${description}"
author="${args.author}"
version="${version}"
script="plugin.gd"
`;
      writeFileSync(join(pluginPath, 'plugin.cfg'), pluginCfg, 'utf-8');
      filesCreated.push('plugin.cfg');

      // Generate main script based on template
      let pluginScript = '';

      switch (template) {
        case 'dock':
          // Create dock.tscn
          const dockScene = `[gd_scene format=3]

[node name="Dock" type="Control"]
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2

[node name="VBoxContainer" type="VBoxContainer" parent="."]
layout_mode = 1
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2

[node name="Label" type="Label" parent="VBoxContainer"]
layout_mode = 2
text = "${args.pluginName}"
horizontal_alignment = 1
`;
          writeFileSync(join(pluginPath, 'dock.tscn'), dockScene, 'utf-8');
          filesCreated.push('dock.tscn');

          pluginScript = `@tool
extends EditorPlugin

var dock: Control

func _enter_tree() -> void:
	dock = preload("res://addons/${args.pluginId}/dock.tscn").instantiate()
	add_control_to_dock(DOCK_SLOT_LEFT_UL, dock)

func _exit_tree() -> void:
	remove_control_from_docks(dock)
	dock.free()
`;
          break;

        case 'inspector':
          // Create inspector plugin script
          const inspectorScript = `@tool
extends EditorInspectorPlugin

func _can_handle(object: Object) -> bool:
	# Return true for objects this plugin should handle
	return false

func _parse_begin(object: Object) -> void:
	pass

func _parse_property(object: Object, type: Variant.Type, name: String, hint_type: PropertyHint, hint_string: String, usage_flags: int, wide: bool) -> bool:
	# Return true if property was handled
	return false

func _parse_end(object: Object) -> void:
	pass
`;
          writeFileSync(join(pluginPath, 'inspector_plugin.gd'), inspectorScript, 'utf-8');
          filesCreated.push('inspector_plugin.gd');

          pluginScript = `@tool
extends EditorPlugin

var inspector_plugin: EditorInspectorPlugin

func _enter_tree() -> void:
	inspector_plugin = preload("res://addons/${args.pluginId}/inspector_plugin.gd").new()
	add_inspector_plugin(inspector_plugin)

func _exit_tree() -> void:
	remove_inspector_plugin(inspector_plugin)
`;
          break;

        case 'import':
          // Create import plugin script
          const importScript = `@tool
extends EditorImportPlugin

func _get_importer_name() -> String:
	return "${args.pluginId}_importer"

func _get_visible_name() -> String:
	return "${args.pluginName} Importer"

func _get_recognized_extensions() -> PackedStringArray:
	return PackedStringArray(["example"])

func _get_save_extension() -> String:
	return "res"

func _get_resource_type() -> String:
	return "Resource"

func _get_preset_count() -> int:
	return 1

func _get_preset_name(preset_index: int) -> String:
	return "Default"

func _get_import_options(path: String, preset_index: int) -> Array[Dictionary]:
	return []

func _import(source_file: String, save_path: String, options: Dictionary, platform_variants: Array[String], gen_files: Array[String]) -> Error:
	# Implement import logic here
	return OK
`;
          writeFileSync(join(pluginPath, 'import_plugin.gd'), importScript, 'utf-8');
          filesCreated.push('import_plugin.gd');

          pluginScript = `@tool
extends EditorPlugin

var import_plugin: EditorImportPlugin

func _enter_tree() -> void:
	import_plugin = preload("res://addons/${args.pluginId}/import_plugin.gd").new()
	add_import_plugin(import_plugin)

func _exit_tree() -> void:
	remove_import_plugin(import_plugin)
`;
          break;

        case 'tool':
          pluginScript = `@tool
extends EditorPlugin

const TOOL_NAME = "${args.pluginName}"

func _enter_tree() -> void:
	add_tool_menu_item(TOOL_NAME, _on_tool_pressed)

func _exit_tree() -> void:
	remove_tool_menu_item(TOOL_NAME)

func _on_tool_pressed() -> void:
	print("${args.pluginName} tool activated!")
	# Add your tool logic here
`;
          break;

        case 'basic':
        default:
          pluginScript = `@tool
extends EditorPlugin

func _enter_tree() -> void:
	# Called when the plugin is enabled
	print("${args.pluginName} enabled")

func _exit_tree() -> void:
	# Called when the plugin is disabled
	print("${args.pluginName} disabled")
`;
          break;
      }

      writeFileSync(join(pluginPath, 'plugin.gd'), pluginScript, 'utf-8');
      filesCreated.push('plugin.gd');

      // Auto-enable if requested
      let enabled = false;
      if (args.autoEnable) {
        const configResult = await this.handleConfigurePlugin({
          projectPath: projectPath,
          pluginId: args.pluginId,
          enabled: true,
        });
        enabled = true;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              pluginId: args.pluginId,
              pluginName: args.pluginName,
              path: `res://addons/${args.pluginId}`,
              template: template,
              version: version,
              filesCreated: filesCreated,
              enabled: enabled,
              message: `Plugin '${args.pluginName}' created successfully at addons/${args.pluginId}`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to create plugin: ${errorMessage}`);
    }
  }

  /**
   * Handle the install_plugin tool
   * Install plugins from Asset Library or Git repositories
   */
  private async handleInstallPlugin(args: any) {
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse('Project path is required');
    }
    if (!args.source) {
      return this.createErrorResponse('Source is required ("asset_library" or "git")');
    }

    const projectPath = normalize(args.projectPath);
    const projectFile = join(projectPath, 'project.godot');
    const addonsPath = join(projectPath, 'addons');

    if (!existsSync(projectFile)) {
      return this.createErrorResponse(
        `Invalid project path: ${projectPath}`,
        ['Ensure the path contains a project.godot file']
      );
    }

    try {
      if (args.source === 'asset_library') {
        // Handle Asset Library installation
        if (!args.assetId && !args.searchQuery) {
          return this.createErrorResponse(
            'Asset ID or search query required for Asset Library installation',
            ['Provide assetId for direct installation', 'Or provide searchQuery to search']
          );
        }

        if (args.searchQuery && !args.assetId) {
          // Search Asset Library
          const searchUrl = `https://godotengine.org/asset-library/api/asset?filter=${encodeURIComponent(args.searchQuery)}&godot_version=4.0`;

          return new Promise((resolve) => {
            https.get(searchUrl, (res: any) => {
              let data = '';
              res.on('data', (chunk: any) => data += chunk);
              res.on('end', () => {
                try {
                  const results = JSON.parse(data);
                  const assets = results.result || [];

                  if (assets.length === 0) {
                    resolve(this.createErrorResponse(
                      `No assets found for "${args.searchQuery}"`,
                      ['Try a different search query', 'Check Asset Library directly at https://godotengine.org/asset-library']
                    ));
                    return;
                  }

                  resolve({
                    content: [
                      {
                        type: 'text',
                        text: JSON.stringify({
                          searchQuery: args.searchQuery,
                          resultCount: assets.length,
                          assets: assets.slice(0, 10).map((a: any) => ({
                            assetId: a.asset_id,
                            title: a.title,
                            author: a.author,
                            category: a.category,
                            version: a.version_string,
                            godotVersion: a.godot_version,
                            rating: a.rating,
                          })),
                          message: `Found ${assets.length} assets. Use assetId to install.`,
                        }, null, 2),
                      },
                    ],
                  });
                } catch (e) {
                  resolve(this.createErrorResponse(`Failed to parse Asset Library response: ${e}`));
                }
              });
            }).on('error', (e: any) => {
              resolve(this.createErrorResponse(`Failed to search Asset Library: ${e.message}`));
            });
          });
        }

        // Download and install asset by ID
        const assetId = args.assetId;
        const assetUrl = `https://godotengine.org/asset-library/api/asset/${assetId}`;

        return new Promise((resolve) => {
          https.get(assetUrl, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', async () => {
              try {
                const asset = JSON.parse(data);

                if (!asset.download_url) {
                  resolve(this.createErrorResponse(`Asset ${assetId} not found or has no download URL`));
                  return;
                }

                const downloadUrl = asset.download_url;
                const tempDir = join(projectPath, '.godot', 'temp_plugin_download');
                const zipPath = join(tempDir, 'plugin.zip');

                // Create temp directory
                mkdirSync(tempDir, { recursive: true });

                // Download ZIP
                const downloadFile = (url: string, dest: string): Promise<void> => {
                  return new Promise((resolveDownload, rejectDownload) => {
                    const file = createWriteStream(dest);
                    https.get(url, (response: any) => {
                      // Handle redirects
                      if (response.statusCode === 301 || response.statusCode === 302) {
                        downloadFile(response.headers.location, dest).then(resolveDownload).catch(rejectDownload);
                        return;
                      }
                      response.pipe(file);
                      file.on('finish', () => {
                        file.close();
                        resolveDownload();
                      });
                    }).on('error', (e: any) => {
                      rejectDownload(e);
                    });
                  });
                };

                await downloadFile(downloadUrl, zipPath);

                // Extract ZIP using Node.js built-in or spawn unzip
                const extractDir = join(tempDir, 'extracted');
                mkdirSync(extractDir, { recursive: true });

                // Try to extract using tar (works on most systems with modern Node)
                try {
                  // Use PowerShell on Windows, unzip on Unix
                  if (process.platform === 'win32') {
                    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe' });
                  } else {
                    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' });
                  }
                } catch (extractError) {
                  // Clean up
                  this.removeDirectorySync(tempDir);
                  resolve(this.createErrorResponse(
                    `Failed to extract ZIP: ${extractError}`,
                    ['Ensure unzip is installed on your system']
                  ));
                  return;
                }

                // Find addons folder in extracted content
                const findAddons = (dir: string): string | null => {
                  const items = readdirSync(dir, { withFileTypes: true });
                  for (const item of items) {
                    if (item.isDirectory()) {
                      if (item.name === 'addons') {
                        return join(dir, item.name);
                      }
                      const nested = findAddons(join(dir, item.name));
                      if (nested) return nested;
                    }
                  }
                  return null;
                };

                const extractedAddons = findAddons(extractDir);
                if (!extractedAddons) {
                  this.removeDirectorySync(tempDir);
                  resolve(this.createErrorResponse(
                    'No addons folder found in downloaded asset',
                    ['This asset may not be a plugin', 'Check the asset structure on Asset Library']
                  ));
                  return;
                }

                // Copy addons to project
                mkdirSync(addonsPath, { recursive: true });
                const installedPlugins: string[] = [];

                const copyDir = (src: string, dest: string) => {
                  mkdirSync(dest, { recursive: true });
                  const items = readdirSync(src, { withFileTypes: true });
                  for (const item of items) {
                    const srcPath = join(src, item.name);
                    const destPath = join(dest, item.name);
                    if (item.isDirectory()) {
                      copyDir(srcPath, destPath);
                    } else {
                      copyFileSync(srcPath, destPath);
                    }
                  }
                };

                const addonFolders = readdirSync(extractedAddons, { withFileTypes: true })
                  .filter(d => d.isDirectory());

                for (const folder of addonFolders) {
                  const targetPath = join(addonsPath, folder.name);
                  if (existsSync(targetPath) && !args.overwrite) {
                    continue; // Skip existing
                  }
                  if (existsSync(targetPath)) {
                    this.removeDirectorySync(targetPath);
                  }
                  copyDir(join(extractedAddons, folder.name), targetPath);
                  installedPlugins.push(folder.name);
                }

                // Clean up temp
                this.removeDirectorySync(tempDir);

                // Auto-enable if requested
                if (args.autoEnable && installedPlugins.length > 0) {
                  for (const pluginId of installedPlugins) {
                    await this.handleConfigurePlugin({
                      projectPath: projectPath,
                      pluginId: pluginId,
                      enabled: true,
                    });
                  }
                }

                resolve({
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        source: 'asset_library',
                        assetId: assetId,
                        assetTitle: asset.title,
                        assetAuthor: asset.author,
                        assetVersion: asset.version_string,
                        installedPlugins: installedPlugins,
                        enabled: args.autoEnable || false,
                        message: `Installed ${installedPlugins.length} plugin(s) from Asset Library: ${installedPlugins.join(', ')}`,
                      }, null, 2),
                    },
                  ],
                });
              } catch (e) {
                resolve(this.createErrorResponse(`Failed to install from Asset Library: ${e}`));
              }
            });
          }).on('error', (e: any) => {
            resolve(this.createErrorResponse(`Failed to fetch asset info: ${e.message}`));
          });
        });

      } else if (args.source === 'git') {
        // Handle Git installation
        if (!args.gitUrl) {
          return this.createErrorResponse(
            'Git URL required for Git installation',
            ['Provide gitUrl parameter with repository URL']
          );
        }

        const gitUrl = args.gitUrl;
        const gitBranch = args.gitBranch || 'main';
        const gitSubfolder = args.gitSubfolder || 'addons';
        const tempDir = join(projectPath, '.godot', 'temp_git_clone');

        try {
          // Clean up any existing temp dir
          if (existsSync(tempDir)) {
            this.removeDirectorySync(tempDir);
          }

          // Clone repository
          execSync(`git clone --depth 1 --branch ${gitBranch} "${gitUrl}" "${tempDir}"`, {
            stdio: 'pipe',
            timeout: 60000 // 60 second timeout
          });

          // Find addons in cloned repo
          let sourceAddons = join(tempDir, gitSubfolder);
          if (!existsSync(sourceAddons)) {
            // Try common alternatives
            const alternatives = ['addons', 'addon', 'plugin', 'plugins'];
            for (const alt of alternatives) {
              const altPath = join(tempDir, alt);
              if (existsSync(altPath)) {
                sourceAddons = altPath;
                break;
              }
            }
          }

          if (!existsSync(sourceAddons)) {
            this.removeDirectorySync(tempDir);
            return this.createErrorResponse(
              `No addons folder found at "${gitSubfolder}"`,
              ['Check the repository structure', 'Use gitSubfolder parameter to specify correct path']
            );
          }

          // Copy addons to project
          mkdirSync(addonsPath, { recursive: true });
          const installedPlugins: string[] = [];

          const copyDir = (src: string, dest: string) => {
            mkdirSync(dest, { recursive: true });
            const items = readdirSync(src, { withFileTypes: true });
            for (const item of items) {
              const srcPath = join(src, item.name);
              const destPath = join(dest, item.name);
              if (item.isDirectory()) {
                copyDir(srcPath, destPath);
              } else {
                copyFileSync(srcPath, destPath);
              }
            }
          };

          const addonFolders = readdirSync(sourceAddons, { withFileTypes: true })
            .filter(d => d.isDirectory());

          for (const folder of addonFolders) {
            const targetPath = join(addonsPath, folder.name);
            if (existsSync(targetPath) && !args.overwrite) {
              continue; // Skip existing
            }
            if (existsSync(targetPath)) {
              this.removeDirectorySync(targetPath);
            }
            copyDir(join(sourceAddons, folder.name), targetPath);
            installedPlugins.push(folder.name);
          }

          // Clean up
          this.removeDirectorySync(tempDir);

          // Auto-enable if requested
          if (args.autoEnable && installedPlugins.length > 0) {
            for (const pluginId of installedPlugins) {
              await this.handleConfigurePlugin({
                projectPath: projectPath,
                pluginId: pluginId,
                enabled: true,
              });
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  source: 'git',
                  gitUrl: gitUrl,
                  gitBranch: gitBranch,
                  installedPlugins: installedPlugins,
                  enabled: args.autoEnable || false,
                  message: `Installed ${installedPlugins.length} plugin(s) from Git: ${installedPlugins.join(', ')}`,
                }, null, 2),
              },
            ],
          };

        } catch (gitError: any) {
          // Clean up on error
          if (existsSync(tempDir)) {
            this.removeDirectorySync(tempDir);
          }
          return this.createErrorResponse(
            `Failed to clone Git repository: ${gitError.message}`,
            ['Ensure git is installed and accessible', 'Check the repository URL is correct', 'Try a different branch with gitBranch parameter']
          );
        }

      } else {
        return this.createErrorResponse(
          `Invalid source: ${args.source}`,
          ['Use "asset_library" or "git"']
        );
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to install plugin: ${errorMessage}`);
    }
  }

  /**
   * Helper to recursively remove a directory
   */
  private removeDirectorySync(dir: string): void {
    if (existsSync(dir)) {
      const items = readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const itemPath = join(dir, item.name);
        if (item.isDirectory()) {
          this.removeDirectorySync(itemPath);
        } else {
          unlinkSync(itemPath);
        }
      }
      rmdirSync(dir);
    }
  }

  // Helper methods for localization

  /**
   * Escape a value for CSV format
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current);
    return result;
  }

  /**
   * Escape a string for PO format
   */
  private escapePoString(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extract placeholders from a string
   */
  private extractPlaceholders(text: string): string[] {
    const placeholders: string[] = [];

    // Match {variable} style
    const braceRegex = /\{([^}]+)\}/g;
    let match;
    while ((match = braceRegex.exec(text)) !== null) {
      placeholders.push(match[0]);
    }

    // Match %s, %d, %f style
    const percentRegex = /%[sdfiox]/gi;
    while ((match = percentRegex.exec(text)) !== null) {
      placeholders.push(match[0]);
    }

    return placeholders;
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

      // Keep stdout clean for MCP JSON-RPC frames; send diagnostics to stderr.
      console.error(`[SERVER] Using Godot at: ${this.godotPath}`);

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
