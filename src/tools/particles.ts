/**
 * Particle System Designer Tools (Tier 2 — Phase 2D)
 *
 * Create and configure GPU particle systems for visual effects.
 * All three tools delegate to GDScript operations since they
 * create nodes and resources within Godot's scene system.
 *
 * Tools:
 *   - create_particle_system  (GD)  Create GPUParticles2D/3D with ProcessMaterial
 *   - apply_particle_preset   (GD)  Apply a named preset (fire, smoke, etc.)
 *   - create_particle_material (TS) Create standalone ParticleProcessMaterial .tres
 */

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString, optionalString, optionalEnum, optionalNumber, optionalRange } from '../utils/validation.js';

export function registerParticleTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    createParticleSystem(ctx),
    applyParticlePreset(ctx),
    createParticleMaterial(ctx),
  ]);
}

// ─── create_particle_system ─────────────────────────────────────────────────

function createParticleSystem(ctx: ServerContext): ToolDefinition {
  return {
    name: 'create_particle_system',
    description: 'Create a GPUParticles2D or GPUParticles3D node in a scene with ParticleProcessMaterial configuration. Supports emission shapes (point, sphere, box, ring), direction, velocity, gravity, and scale settings.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        parent_path: { type: 'string', description: 'Path to the parent node (e.g., "." for root)' },
        node_name: { type: 'string', description: 'Name for the particle node (default: "Particles")' },
        particle_type: { type: 'string', enum: ['2d', '3d'], description: 'Particle dimension type (default: "2d")' },
        amount: { type: 'number', description: 'Number of particles (default: 16)' },
        lifetime: { type: 'number', description: 'Particle lifetime in seconds (default: 1.0)' },
        one_shot: { type: 'boolean', description: 'Emit all particles once then stop (default: false)' },
        explosiveness: { type: 'number', description: 'Emission timing ratio 0.0-1.0 (default: 0.0)' },
        emission_shape: { type: 'string', enum: ['point', 'sphere', 'sphere_surface', 'box', 'ring'], description: 'Emission shape (default: "point")' },
        emission_sphere_radius: { type: 'number', description: 'Radius for sphere emission shape' },
        emission_box_extents: { type: 'array', items: { type: 'number' }, description: 'Box extents [x, y, z] for box emission shape' },
        emission_ring_radius: { type: 'number', description: 'Outer radius for ring emission shape' },
        emission_ring_inner_radius: { type: 'number', description: 'Inner radius for ring emission shape' },
        emission_ring_height: { type: 'number', description: 'Height for ring emission shape' },
        direction: { type: 'array', items: { type: 'number' }, description: 'Emission direction [x, y, z]' },
        spread: { type: 'number', description: 'Emission spread angle in degrees (default: 45)' },
        gravity: { type: 'array', items: { type: 'number' }, description: 'Gravity vector [x, y, z]' },
        initial_velocity_min: { type: 'number', description: 'Minimum initial velocity' },
        initial_velocity_max: { type: 'number', description: 'Maximum initial velocity' },
        scale_amount_min: { type: 'number', description: 'Minimum scale' },
        scale_amount_max: { type: 'number', description: 'Maximum scale' },
        color: { type: 'array', items: { type: 'number' }, description: 'Particle color [r, g, b, a] (0.0-1.0)' },
      },
      required: ['project_path', 'scene_path', 'parent_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
        requiredString('parentPath', 'parent_path'),
        optionalEnum('particleType', ['2d', '3d']),
        optionalEnum('emissionShape', ['point', 'sphere', 'sphere_surface', 'box', 'ring']),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const snakeParams = ctx.convertCamelToSnakeCase(args);
      const result = await ctx.executeOperation('create_particle_system', snakeParams, args.projectPath);

      if (result.stderr && result.stderr.includes('ERROR')) {
        const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
        if (errors.length > 0) {
          return ctx.createErrorResponse(
            `Failed to create particle system: ${errors[0].message}`,
            errors[0].possible_solutions
          );
        }
      }

      try {
        const output = JSON.parse(result.stdout.trim().split('\n').pop() || '{}');
        // Invalidate scene cache since we modified it
        ctx.invalidateTscnCache(join(args.projectPath, args.scenePath));
        return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: result.stdout }] };
      }
    },
  };
}

// ─── apply_particle_preset ──────────────────────────────────────────────────

function applyParticlePreset(ctx: ServerContext): ToolDefinition {
  return {
    name: 'apply_particle_preset',
    description: 'Create a particle system with a pre-configured visual effect preset. Available presets: fire, smoke, explosion, magic_sparkle, rain, snow, dust, sparks. Each preset configures appropriate emission shape, velocity, gravity, color, and scale values.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        parent_path: { type: 'string', description: 'Path to the parent node' },
        node_name: { type: 'string', description: 'Name for the particle node (default: based on preset)' },
        preset: { type: 'string', enum: ['fire', 'smoke', 'explosion', 'magic_sparkle', 'rain', 'snow', 'dust', 'sparks'], description: 'Particle preset name' },
        particle_type: { type: 'string', enum: ['2d', '3d'], description: 'Particle dimension type (default: "2d")' },
        scale_factor: { type: 'number', description: 'Scale multiplier for the preset (default: 1.0)' },
      },
      required: ['project_path', 'scene_path', 'parent_path', 'preset'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
        requiredString('parentPath', 'parent_path'),
        { field: 'preset', type: 'enum', values: ['fire', 'smoke', 'explosion', 'magic_sparkle', 'rain', 'snow', 'dust', 'sparks'], label: 'preset' },
        optionalEnum('particleType', ['2d', '3d']),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const snakeParams = ctx.convertCamelToSnakeCase(args);
      const result = await ctx.executeOperation('apply_particle_preset', snakeParams, args.projectPath);

      if (result.stderr && result.stderr.includes('ERROR')) {
        const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
        if (errors.length > 0) {
          return ctx.createErrorResponse(
            `Failed to apply particle preset: ${errors[0].message}`,
            errors[0].possible_solutions
          );
        }
      }

      try {
        const output = JSON.parse(result.stdout.trim().split('\n').pop() || '{}');
        ctx.invalidateTscnCache(join(args.projectPath, args.scenePath));
        return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: result.stdout }] };
      }
    },
  };
}

// ─── create_particle_material ───────────────────────────────────────────────

/** Particle presets for standalone material creation */
const MATERIAL_PRESETS: Record<string, Record<string, any>> = {
  fire: {
    emission_shape: 1, // sphere
    emission_sphere_radius: 0.5,
    direction: [0, -1, 0],
    spread: 15,
    gravity: [0, -2, 0],
    initial_velocity_min: 2,
    initial_velocity_max: 4,
    scale_amount_min: 0.5,
    scale_amount_max: 1.5,
  },
  smoke: {
    emission_shape: 1,
    emission_sphere_radius: 0.3,
    direction: [0, -1, 0],
    spread: 25,
    gravity: [0, -0.5, 0],
    initial_velocity_min: 0.5,
    initial_velocity_max: 1.5,
    scale_amount_min: 1.0,
    scale_amount_max: 3.0,
  },
  explosion: {
    emission_shape: 1,
    emission_sphere_radius: 0.1,
    direction: [0, -1, 0],
    spread: 180,
    gravity: [0, 2, 0],
    initial_velocity_min: 5,
    initial_velocity_max: 12,
    scale_amount_min: 0.3,
    scale_amount_max: 1.0,
  },
  magic_sparkle: {
    emission_shape: 1,
    emission_sphere_radius: 1.0,
    direction: [0, -1, 0],
    spread: 180,
    gravity: [0, 0, 0],
    initial_velocity_min: 0.5,
    initial_velocity_max: 2.0,
    scale_amount_min: 0.1,
    scale_amount_max: 0.4,
  },
  rain: {
    emission_shape: 3, // box
    emission_box_extents: [10, 0.1, 10],
    direction: [0, 1, 0],
    spread: 5,
    gravity: [0, 9.8, 0],
    initial_velocity_min: 5,
    initial_velocity_max: 8,
    scale_amount_min: 0.02,
    scale_amount_max: 0.05,
  },
  snow: {
    emission_shape: 3,
    emission_box_extents: [10, 0.1, 10],
    direction: [0, 1, 0],
    spread: 30,
    gravity: [0, 1.5, 0],
    initial_velocity_min: 0.3,
    initial_velocity_max: 1.0,
    scale_amount_min: 0.05,
    scale_amount_max: 0.15,
  },
  dust: {
    emission_shape: 3,
    emission_box_extents: [2, 0.5, 2],
    direction: [1, 0, 0],
    spread: 90,
    gravity: [0, 0.2, 0],
    initial_velocity_min: 0.1,
    initial_velocity_max: 0.5,
    scale_amount_min: 0.05,
    scale_amount_max: 0.2,
  },
  sparks: {
    emission_shape: 0, // point
    direction: [0, -1, 0],
    spread: 60,
    gravity: [0, 5, 0],
    initial_velocity_min: 3,
    initial_velocity_max: 8,
    scale_amount_min: 0.05,
    scale_amount_max: 0.15,
  },
};

function createParticleMaterial(ctx: ServerContext): ToolDefinition {
  return {
    name: 'create_particle_material',
    description: 'Create a standalone ParticleProcessMaterial .tres file for reuse across scenes. Supports emission shapes, direction, velocity, gravity, scale, and color settings. Can also apply a named preset.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        material_path: { type: 'string', description: 'Relative path for the .tres output file' },
        preset: { type: 'string', enum: ['fire', 'smoke', 'explosion', 'magic_sparkle', 'rain', 'snow', 'dust', 'sparks'], description: 'Optional preset to base the material on' },
        emission_shape: { type: 'number', description: 'Emission shape enum (0=point, 1=sphere, 2=sphere_surface, 3=box, 6=ring)' },
        emission_sphere_radius: { type: 'number', description: 'Sphere radius (when emission_shape=1 or 2)' },
        emission_box_extents: { type: 'array', items: { type: 'number' }, description: 'Box extents [x,y,z] (when emission_shape=3)' },
        emission_ring_radius: { type: 'number', description: 'Ring outer radius (when emission_shape=6)' },
        emission_ring_inner_radius: { type: 'number', description: 'Ring inner radius (when emission_shape=6)' },
        emission_ring_height: { type: 'number', description: 'Ring height (when emission_shape=6)' },
        direction: { type: 'array', items: { type: 'number' }, description: 'Direction vector [x,y,z]' },
        spread: { type: 'number', description: 'Spread angle in degrees' },
        flatness: { type: 'number', description: 'Flatness (0=sphere, 1=flat)' },
        gravity: { type: 'array', items: { type: 'number' }, description: 'Gravity vector [x,y,z]' },
        initial_velocity_min: { type: 'number', description: 'Minimum initial velocity' },
        initial_velocity_max: { type: 'number', description: 'Maximum initial velocity' },
        angular_velocity_min: { type: 'number', description: 'Minimum angular velocity' },
        angular_velocity_max: { type: 'number', description: 'Maximum angular velocity' },
        scale_amount_min: { type: 'number', description: 'Minimum scale' },
        scale_amount_max: { type: 'number', description: 'Maximum scale' },
        color: { type: 'array', items: { type: 'number' }, description: 'Particle color [r,g,b,a]' },
        damping_min: { type: 'number', description: 'Minimum damping' },
        damping_max: { type: 'number', description: 'Maximum damping' },
      },
      required: ['project_path', 'material_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('materialPath', 'material_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const materialPath = args.materialPath as string;
      const fullPath = join(projectDir, materialPath);

      // Start with preset defaults if specified
      let params: Record<string, any> = {};
      if (args.preset && MATERIAL_PRESETS[args.preset]) {
        params = { ...MATERIAL_PRESETS[args.preset] };
      }

      // Override with explicit parameters
      const overrideKeys = [
        'emissionShape', 'emissionSphereRadius', 'emissionBoxExtents',
        'emissionRingRadius', 'emissionRingInnerRadius', 'emissionRingHeight',
        'direction', 'spread', 'flatness', 'gravity',
        'initialVelocityMin', 'initialVelocityMax',
        'angularVelocityMin', 'angularVelocityMax',
        'scaleAmountMin', 'scaleAmountMax',
        'color', 'dampingMin', 'dampingMax',
      ];
      for (const key of overrideKeys) {
        if (args[key] !== undefined) {
          // Convert camelCase to snake_case for the params
          const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
          params[snakeKey] = args[key];
        }
      }

      // Generate .tres content
      const uid = ctx.generateUID();
      let tres = `[gd_resource type="ParticleProcessMaterial" format=3 uid="${uid}"]\n\n`;
      tres += `[resource]\n`;

      // Emission shape
      if (params.emission_shape !== undefined) {
        tres += `emission_shape = ${params.emission_shape}\n`;
      }
      if (params.emission_sphere_radius !== undefined) {
        tres += `emission_sphere_radius = ${params.emission_sphere_radius}\n`;
      }
      if (params.emission_box_extents) {
        const e = params.emission_box_extents;
        tres += `emission_box_extents = Vector3(${e[0]}, ${e[1]}, ${e[2]})\n`;
      }
      if (params.emission_ring_radius !== undefined) {
        tres += `emission_ring_radius = ${params.emission_ring_radius}\n`;
      }
      if (params.emission_ring_inner_radius !== undefined) {
        tres += `emission_ring_inner_radius = ${params.emission_ring_inner_radius}\n`;
      }
      if (params.emission_ring_height !== undefined) {
        tres += `emission_ring_height = ${params.emission_ring_height}\n`;
      }

      // Direction
      if (params.direction) {
        const d = params.direction;
        tres += `direction = Vector3(${d[0]}, ${d[1]}, ${d[2]})\n`;
      }
      if (params.spread !== undefined) {
        tres += `spread = ${params.spread}\n`;
      }
      if (params.flatness !== undefined) {
        tres += `flatness = ${params.flatness}\n`;
      }

      // Gravity
      if (params.gravity) {
        const g = params.gravity;
        tres += `gravity = Vector3(${g[0]}, ${g[1]}, ${g[2]})\n`;
      }

      // Velocity
      if (params.initial_velocity_min !== undefined) {
        tres += `initial_velocity_min = ${params.initial_velocity_min}\n`;
      }
      if (params.initial_velocity_max !== undefined) {
        tres += `initial_velocity_max = ${params.initial_velocity_max}\n`;
      }

      // Angular velocity
      if (params.angular_velocity_min !== undefined) {
        tres += `angular_velocity_min = ${params.angular_velocity_min}\n`;
      }
      if (params.angular_velocity_max !== undefined) {
        tres += `angular_velocity_max = ${params.angular_velocity_max}\n`;
      }

      // Scale
      if (params.scale_amount_min !== undefined) {
        tres += `scale_amount_min = ${params.scale_amount_min}\n`;
      }
      if (params.scale_amount_max !== undefined) {
        tres += `scale_amount_max = ${params.scale_amount_max}\n`;
      }

      // Color
      if (params.color) {
        const c = params.color;
        tres += `color = Color(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] !== undefined ? c[3] : 1.0})\n`;
      }

      // Damping
      if (params.damping_min !== undefined) {
        tres += `damping_min = ${params.damping_min}\n`;
      }
      if (params.damping_max !== undefined) {
        tres += `damping_max = ${params.damping_max}\n`;
      }

      // Ensure output directory exists
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, tres, 'utf-8');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            material_path: materialPath,
            preset: args.preset || null,
            properties_set: Object.keys(params),
          }, null, 2),
        }],
      };
    },
  };
}
