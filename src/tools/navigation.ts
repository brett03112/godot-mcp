/**
 * Navigation & AI Tools (Tier 16)
 *
 * Set up AI navigation systems including NavigationAgent, NavigationLink,
 * NavigationObstacle, AStarGrid2D, and NavigationServer configuration.
 *
 * Tools:
 *   - generate_navmesh                (GDScript)  Create/update NavigationRegion3D with navmesh
 *   - add_navigation_agent            (GDScript)  Add NavigationAgent2D/3D to an entity
 *   - add_navigation_link             (GDScript)  Connect nav regions with NavigationLink2D/3D
 *   - configure_navigation_obstacle   (GDScript)  Add NavigationObstacle2D/3D for dynamic obstacles
 *   - create_astar_grid               (GDScript)  Create AStarGrid2D for tilemap pathfinding
 *   - setup_navigation_server         (GDScript)  Configure NavigationServer global settings
 */

import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString } from '../utils/validation.js';

export function registerNavigationTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    generateNavmesh(ctx),
    addNavigationAgent(ctx),
    addNavigationLink(ctx),
    configureNavigationObstacle(ctx),
    createAstarGrid(ctx),
    setupNavigationServer(ctx),
  ]);
}

// ─── Shared helper ───────────────────────────────────────────────────────

async function runGdScript(
  ctx: ServerContext,
  operation: string,
  params: Record<string, unknown>,
  projectDir: string,
  label: string,
): Promise<any> {
  try {
    const result = await ctx.executeOperation(operation, params, projectDir);
    const lines = result.stdout.replace(/\r\n/g, '\n').trim().split('\n');
    const jsonLine = lines.find(l => l.trimStart().startsWith('{'));
    if (!jsonLine) {
      return ctx.createErrorResponse(
        `Failed to ${label}`,
        [`Godot output: ${result.stderr || result.stdout}`],
      );
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(JSON.parse(jsonLine.trim()), null, 2) }],
    };
  } catch (err: any) {
    return ctx.createErrorResponse(
      `Failed to ${label}: ${err.message}`,
      ['Ensure Godot is installed', 'Check that file paths are correct'],
    );
  }
}

// ─── generate_navmesh ─────────────────────────────────────────────────────

function generateNavmesh(ctx: ServerContext): ToolDefinition {
  return {
    name: 'generate_navmesh',
    description: 'Create or update a NavigationRegion3D with a baked navigation mesh for AI pathfinding.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the scene file' },
        region_name: { type: 'string', description: 'Name for the NavigationRegion3D node (default: "NavigationRegion3D")' },
        parent_path: { type: 'string', description: 'NodePath to parent node (default: "." for root)' },
        cell_size: { type: 'number', description: 'Voxel cell size for navigation mesh (default: 0.25)' },
        cell_height: { type: 'number', description: 'Voxel cell height (default: 0.25)' },
        agent_radius: { type: 'number', description: 'Agent radius for pathfinding (default: 0.5)' },
        agent_height: { type: 'number', description: 'Agent height (default: 2.0)' },
        agent_max_slope: { type: 'number', description: 'Maximum walkable slope in degrees (default: 45)' },
        agent_max_climb: { type: 'number', description: 'Maximum step height agent can climb (default: 0.25)' },
        source_geometry_mode: {
          type: 'string',
          enum: ['static_colliders', 'meshes', 'physics_bodies'],
          description: 'Source geometry mode for baking (default: "static_colliders")',
        },
      },
      required: ['project_path', 'scene_path'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      return runGdScript(ctx, 'generate_navmesh', {
        scene_path: args.scenePath,
        region_name: args.regionName || 'NavigationRegion3D',
        parent_path: args.parentPath || '.',
        cell_size: args.cellSize ?? 0.25,
        cell_height: args.cellHeight ?? 0.25,
        agent_radius: args.agentRadius ?? 0.5,
        agent_height: args.agentHeight ?? 2.0,
        agent_max_slope: args.agentMaxSlope ?? 45.0,
        agent_max_climb: args.agentMaxClimb ?? 0.25,
        source_geometry_mode: args.sourceGeometryMode || 'static_colliders',
      }, args.projectPath, 'generate navmesh');
    },
  };
}

// ─── add_navigation_agent ─────────────────────────────────────────────────

const VALID_NAV_AGENT_TYPES = ['2d', '3d'];
const VALID_PATH_POST_MODE = ['edge_centered', 'center'];
const VALID_PATH_META_FLAGS = [
  'path', 'closest', 'request', 'update', 'navigation_layers',
];

function addNavigationAgent(ctx: ServerContext): ToolDefinition {
  return {
    name: 'add_navigation_agent',
    description: 'Add a NavigationAgent2D or NavigationAgent3D node to a character/entity in a scene for autonomous pathfinding and avoidance.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        parent_path: { type: 'string', description: 'Path to the parent entity node (e.g., "Player" or "Enemy/Goblin")' },
        agent_name: { type: 'string', description: 'Name for the agent node (default: "NavigationAgent")' },
        agent_type: { type: 'string', enum: VALID_NAV_AGENT_TYPES, description: '"2d" or "3d"' },
        agent_radius: { type: 'number', description: 'Agent radius for avoidance (default: 10 for 2D, 0.5 for 3D)' },
        agent_height: { type: 'number', description: 'Agent height for avoidance (3D only, default: 2.0)' },
        max_speed: { type: 'number', description: 'Maximum movement speed (default: 200 for 2D, 10 for 3D)' },
        acceleration: { type: 'number', description: 'Maximum acceleration (default: 1000 for 2D, 50 for 3D)' },
        path_max_distance: { type: 'number', description: 'Maximum path search distance, 0 = infinite (default: 0)' },
        path_desired_distance: { type: 'number', description: 'Stop distance from target (default: 5 for 2D, 1.0 for 3D)' },
        avoidance_enabled: { type: 'boolean', description: 'Enable avoidance with other agents (default: true)' },
        avoidance_layers: { type: 'number', description: 'Bitmask for which avoidance layers to interact with (default: 1)' },
        avoidance_priority: { type: 'number', description: 'Priority in avoidance (lower = higher priority, default: 1.0)' },
        navigation_layers: { type: 'number', description: 'Navigation layers bitmask for pathfinding (default: 1)' },
        path_post_processing: { type: 'string', enum: VALID_PATH_POST_MODE, description: 'Path post-processing mode (default: "edge_centered")' },
        enable_meta_flags: { type: 'array', items: { type: 'string', enum: VALID_PATH_META_FLAGS }, description: 'Enabled navigation debug flags (default: all)' },
      },
      required: ['project_path', 'scene_path', 'parent_path'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
        requiredString('parentPath', 'parent_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      if (args.agentType && !VALID_NAV_AGENT_TYPES.includes(args.agentType)) {
        return ctx.createErrorResponse(
          `Invalid agent_type: '${args.agentType}'`,
          [`Valid types: ${VALID_NAV_AGENT_TYPES.join(', ')}`],
        );
      }

      return runGdScript(ctx, 'add_navigation_agent', {
        scene_path: args.scenePath,
        parent_path: args.parentPath,
        agent_name: args.agentName || 'NavigationAgent',
        agent_type: args.agentType || '2d',
        agent_radius: args.agentRadius,
        agent_height: args.agentHeight,
        max_speed: args.maxSpeed,
        acceleration: args.acceleration,
        path_max_distance: args.pathMaxDistance,
        path_desired_distance: args.pathDesiredDistance,
        avoidance_enabled: args.avoidanceEnabled ?? true,
        avoidance_layers: args.avoidanceLayers ?? 1,
        avoidance_priority: args.avoidancePriority ?? 1.0,
        navigation_layers: args.navigationLayers ?? 1,
        path_post_processing: args.pathPostProcessing || 'edge_centered',
        enable_meta_flags: args.enableMetaFlags || ['path', 'closest', 'request', 'update'],
      }, args.projectPath, 'add navigation agent');
    },
  };
}

// ─── add_navigation_link ──────────────────────────────────────────────────

const VALID_NAV_LINK_TYPES = ['2d', '3d'];
const VALID_TRAVEL_DIR = ['bidirectional', 'forward', 'backward'];

function addNavigationLink(ctx: ServerContext): ToolDefinition {
  return {
    name: 'add_navigation_link',
    description: 'Add a NavigationLink2D or NavigationLink3D to connect navigation regions. Useful for jump pads, teleporters, ladders, and edges.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        parent_path: { type: 'string', description: 'Path to the parent node (default: ".")' },
        link_name: { type: 'string', description: 'Name for the link node (default: "NavigationLink")' },
        link_type: { type: 'string', enum: VALID_NAV_LINK_TYPES, description: '"2d" or "3d"' },
        start_position: { type: 'string', description: 'Start position as Godot vector (e.g., "Vector2(0, 0)" or "Vector3(0, 0, 0)")' },
        end_position: { type: 'string', description: 'End position as Godot vector (e.g., "Vector2(100, 0)" or "Vector3(0, 0, 100)")' },
        bidirectional: { type: 'boolean', description: 'Link works in both directions (default: true)' },
        start_radius: { type: 'number', description: 'Radius around start position (default: 10 for 2D, 0.5 for 3D)' },
        end_radius: { type: 'number', description: 'Radius around end position (default: 10 for 2D, 0.5 for 3D)' },
        navigation_layers: { type: 'number', description: 'Navigation layers bitmask (default: 1)' },
        travel_cost: { type: 'number', description: 'Travel cost multiplier (default: 1.0)' },
        enter_cost: { type: 'number', description: 'Cost to enter the link (default: 0.0)' },
      },
      required: ['project_path', 'scene_path'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      return runGdScript(ctx, 'add_navigation_link', {
        scene_path: args.scenePath,
        parent_path: args.parentPath || '.',
        link_name: args.linkName || 'NavigationLink',
        link_type: args.linkType || '2d',
        start_position: args.startPosition || 'Vector2(0, 0)',
        end_position: args.endPosition || 'Vector2(100, 0)',
        bidirectional: args.bidirectional ?? true,
        start_radius: args.startRadius,
        end_radius: args.endRadius,
        navigation_layers: args.navigationLayers ?? 1,
        travel_cost: args.travelCost ?? 1.0,
        enter_cost: args.enterCost ?? 0.0,
      }, args.projectPath, 'add navigation link');
    },
  };
}

// ─── configure_navigation_obstacle ────────────────────────────────────────

const VALID_OBSTACLE_TYPES = ['2d', '3d'];
const VALID_OBSTACLE_ACTIONS = ['add', 'update', 'remove', 'toggle'];

function configureNavigationObstacle(ctx: ServerContext): ToolDefinition {
  return {
    name: 'configure_navigation_obstacle',
    description: 'Add, update, remove, or toggle a NavigationObstacle2D or NavigationObstacle3D for dynamic obstacles that block AI navigation.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        parent_path: { type: 'string', description: 'Path to the parent node (default: ".")' },
        obstacle_name: { type: 'string', description: 'Name for the obstacle node (default: "NavigationObstacle")' },
        obstacle_type: { type: 'string', enum: VALID_OBSTACLE_TYPES, description: '"2d" or "3d"' },
        action: { type: 'string', enum: VALID_OBSTACLE_ACTIONS, description: '"add", "update", "remove", or "toggle" (default: "add")' },
        obstacle_radius: { type: 'number', description: 'Obstacle radius (default: 32 for 2D, 1.0 for 3D)' },
        obstacle_height: { type: 'number', description: 'Obstacle height (3D only, default: 2.0)' },
        avoidance_layers: { type: 'number', description: 'Avoidance layers bitmask (default: 1)' },
        avoidance_enabled: { type: 'boolean', description: 'Enable avoidance behavior (default: true)' },
        velocity: { type: 'string', description: 'Estimated velocity for avoidance (e.g., "Vector2(0, 0)" or "Vector3(0, 0, 0)")' },
        affect_navigation: { type: 'boolean', description: 'Affect navigation map (carve shape) (default: true)' },
        use_3d_avoidance: { type: 'boolean', description: 'Use 3D avoidance (3D only, default: true)' },
        estimated_radius: { type: 'number', description: 'Estimated obstacle radius for avoidance (default: same as obstacle_radius)' },
      },
      required: ['project_path', 'scene_path'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      if (args.obstacleType && !VALID_OBSTACLE_TYPES.includes(args.obstacleType)) {
        return ctx.createErrorResponse(
          `Invalid obstacle_type: '${args.obstacleType}'`,
          [`Valid types: ${VALID_OBSTACLE_TYPES.join(', ')}`],
        );
      }

      return runGdScript(ctx, 'configure_navigation_obstacle', {
        scene_path: args.scenePath,
        parent_path: args.parentPath || '.',
        obstacle_name: args.obstacleName || 'NavigationObstacle',
        obstacle_type: args.obstacleType || '2d',
        action: args.action || 'add',
        obstacle_radius: args.obstacleRadius,
        obstacle_height: args.obstacleHeight,
        avoidance_layers: args.avoidanceLayers ?? 1,
        avoidance_enabled: args.avoidanceEnabled ?? true,
        velocity: args.velocity,
        affect_navigation: args.affectNavigation ?? true,
        use_3d_avoidance: args.use3dAvoidance ?? true,
        estimated_radius: args.estimatedRadius,
      }, args.projectPath, 'configure navigation obstacle');
    },
  };
}

// ─── create_astar_grid ────────────────────────────────────────────────────

const VALID_ASTAR_DIMENSIONS = ['2d', '3d'];
const VALID_CELL_SIZE_MODES = ['orthogonal', 'diagonal'];

function createAstarGrid(ctx: ServerContext): ToolDefinition {
  return {
    name: 'create_astar_grid',
    description: 'Create an AStarGrid2D resource for grid-based pathfinding, ideal for tilemap-based games. Configures grid size, cell size, connectivity, and default heuristic.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        output_path: { type: 'string', description: 'Relative path to save the AStarGrid2D .tres resource (e.g., "resources/astar_grid.tres")' },
        grid_size: { type: 'string', description: 'Grid dimensions as Godot vector (e.g., "Vector2i(100, 100)" for 100x100 grid)' },
        cell_size: { type: 'string', description: 'Cell size in pixels (e.g., "Vector2(16, 16)")' },
        cell_connect_mode: { type: 'string', enum: VALID_CELL_SIZE_MODES, description: '"orthogonal" (4-way) or "diagonal" (8-way) (default: "orthogonal")' },
        default_heuristic: { type: 'string', description: 'Default heuristic: "euclidean", "manhattan", "octile", "chebyshev", "custom" (default: "euclidean")' },
        offset: { type: 'string', description: 'Grid offset from origin (e.g., "Vector2(0, 0)")' },
        solid_point_weight: { type: 'number', description: 'Weight scale for solid cells, 0 = solid points are disabled (default: 1.0)' },
        default_point_weight: { type: 'number', description: 'Default scale for cell weight (default: 1.0)' },
        jumping_enabled: { type: 'boolean', description: 'Enable jumping between cells (default: false)' },
        diagonal_mode: { type: 'string', description: 'Diagonal cost when diagonal is enabled: "always" or "at_least_one_walkable" (default: "always")' },
      },
      required: ['project_path', 'output_path', 'grid_size'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('outputPath', 'output_path'),
        requiredString('gridSize', 'grid_size'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      return runGdScript(ctx, 'create_astar_grid', {
        output_path: args.outputPath,
        grid_size: args.gridSize,
        cell_size: args.cellSize || 'Vector2(16, 16)',
        cell_connect_mode: args.cellConnectMode || 'orthogonal',
        default_heuristic: args.defaultHeuristic || 'euclidean',
        offset: args.offset || 'Vector2(0, 0)',
        solid_point_weight: args.solidPointWeight ?? 1.0,
        default_point_weight: args.defaultPointWeight ?? 1.0,
        jumping_enabled: args.jumpingEnabled ?? false,
        diagonal_mode: args.diagonalMode || 'always',
      }, args.projectPath, 'create AStar grid');
    },
  };
}

// ─── setup_navigation_server ──────────────────────────────────────────────

const VALID_NAV_SERVER_TYPES = ['2d', '3d'];

function setupNavigationServer(ctx: ServerContext): ToolDefinition {
  return {
    name: 'setup_navigation_server',
    description: 'Configure NavigationServer2D or NavigationServer3D global settings including avoidance, navigation map defaults, and agent parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        server_type: { type: 'string', enum: VALID_NAV_SERVER_TYPES, description: '"2d" or "3d"' },
        avoidance_enabled: { type: 'boolean', description: 'Enable avoidance system (default: true)' },
        avoidance_time_horizon: { type: 'number', description: 'Seconds to look ahead for avoidance (default: 1.5 for 2D, 2.0 for 3D)' },
        avoidance_max_neighbors: { type: 'number', description: 'Maximum avoidance neighbors considered (default: 512 for 2D, 256 for 3D)' },
        avoidance_max_speed: { type: 'number', description: 'Maximum speed for avoidance (default: 300 for 2D, 10 for 3D)' },
        avoidance_radius_scale: { type: 'number', description: 'Scale factor for avoidance radius (default: 2.0)' },
        cell_size: { type: 'number', description: 'Navigation map cell size (default: 1.0 for 2D, 0.25 for 3D)' },
        cell_height: { type: 'number', description: 'Navigation map cell height (3D only, default: 0.25)' },
        edge_connection_margin: { type: 'number', description: 'Edge connection margin for linking regions (default: 5.0 for 2D, 1.0 for 3D)' },
        use_edge_connections: { type: 'boolean', description: 'Use edge connections to link maps (default: true)' },
        border_size: { type: 'number', description: 'Navigation map border size (default: 10 for 2D, 1.0 for 3D)' },
        iteration_cost: { type: 'number', description: 'Pathfinding iteration weight (default: 1.0). Higher = better path, slower.' },
        agent_radius: { type: 'number', description: 'Default agent radius (default: 10 for 2D, 0.5 for 3D)' },
        agent_height: { type: 'number', description: 'Default agent height (3D only, default: 2.0)' },
        agent_max_slope: { type: 'number', description: 'Default max slope in degrees (3D only, default: 45)' },
        agent_max_climb: { type: 'number', description: 'Default max climb step (3D only, default: 0.25)' },
      },
      required: ['project_path'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      return runGdScript(ctx, 'setup_navigation_server', {
        server_type: args.serverType || '2d',
        avoidance_enabled: args.avoidanceEnabled ?? true,
        avoidance_time_horizon: args.avoidanceTimeHorizon,
        avoidance_max_neighbors: args.avoidanceMaxNeighbors,
        avoidance_max_speed: args.avoidanceMaxSpeed,
        avoidance_radius_scale: args.avoidanceRadiusScale ?? 2.0,
        cell_size: args.cellSize,
        cell_height: args.cellHeight,
        edge_connection_margin: args.edgeConnectionMargin,
        use_edge_connections: args.useEdgeConnections ?? true,
        border_size: args.borderSize,
        iteration_cost: args.iterationCost ?? 1.0,
        agent_radius: args.agentRadius,
        agent_height: args.agentHeight,
        agent_max_slope: args.agentMaxSlope,
        agent_max_climb: args.agentMaxClimb,
      }, args.projectPath, 'setup navigation server');
    },
  };
}