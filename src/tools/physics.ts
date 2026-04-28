/**
 * Physics Tools (Tier 3 — Phase 5)
 *
 * Create physics materials, configure collision layers, add physics bodies
 * with collision shapes, and set up joints/constraints.
 *
 * Tools:
 *   - configure_physics_material  (GDScript)  Create PhysicsMaterial .tres
 *   - set_collision_config         (GDScript)  Configure collision layer/mask/priority
 *   - create_physics_body          (GDScript)  Add RigidBody/StaticBody/CharacterBody/Area/etc.
 *   - manage_collision_shape       (GDScript)  Add/replace/remove collision shapes on a body
 *   - setup_joint                  (GDScript)  Create joints and constraints
 */

import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString } from '../utils/validation.js';

export function registerPhysicsTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    configurePhysicsMaterial(ctx),
    setCollisionConfig(ctx),
    createPhysicsBody(ctx),
    manageCollisionShape(ctx),
    setupJoint(ctx),
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

// ─── configure_physics_material ───────────────────────────────────────────

function configurePhysicsMaterial(ctx: ServerContext): ToolDefinition {
  return {
    name: 'configure_physics_material',
    description: 'Create a PhysicsMaterial resource (.tres) with friction, bounce, roughness, and damping settings.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        physics_type: { type: 'string', description: '"2d" or "3d"', enum: ['2d', '3d'] },
        mat_path: { type: 'string', description: 'Output path for the PhysicsMaterial (.tres), relative to project' },
        friction: { type: 'number', description: 'Friction coefficient (default: 1.0)' },
        rough: { type: 'boolean', description: 'Rough surface flag (default: false)' },
        bounce: { type: 'number', description: 'Bounciness (default: 0.0)' },
        absorbent: { type: 'boolean', description: 'Absorbent flag (default: false)' },
        linear_damp: { type: 'number', description: 'Linear damping (default: -1, disabled)' },
        angular_damp: { type: 'number', description: 'Angular damping (default: -1, disabled)' },
      },
      required: ['project_path', 'mat_path'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('matPath', 'mat_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      return runGdScript(ctx, 'configure_physics_material', {
        physics_type: args.physicsType || '2d',
        mat_path: args.matPath,
        friction: args.friction ?? 1.0,
        rough: args.rough ?? false,
        bounce: args.bounce ?? 0.0,
        absorbent: args.absorbent ?? false,
        linear_damp: args.linearDamp ?? -1.0,
        angular_damp: args.angularDamp ?? -1.0,
      }, args.projectPath, 'configure physics material');
    },
  };
}

// ─── set_collision_config ─────────────────────────────────────────────────

function setCollisionConfig(ctx: ServerContext): ToolDefinition {
  return {
    name: 'set_collision_config',
    description: 'Set collision layer, mask, and priority on a CollisionObject2D/3D in a scene.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        node_path: { type: 'string', description: 'Path to the CollisionObject node within the scene' },
        collision_layer: { type: 'number', description: 'Collision layer bitmask (default: 1)' },
        collision_mask: { type: 'number', description: 'Collision mask bitmask (default: 1)' },
        collision_priority: { type: 'number', description: 'Collision priority (default: 1.0)' },
        layer_set: { type: 'boolean', description: 'Whether to set the collision layer (default: true)' },
        mask_set: { type: 'boolean', description: 'Whether to set the collision mask (default: true)' },
      },
      required: ['project_path', 'scene_path', 'node_path'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
        requiredString('nodePath', 'node_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      return runGdScript(ctx, 'set_collision_config', {
        scene_path: args.scenePath,
        node_path: args.nodePath,
        collision_layer: args.collisionLayer ?? 1,
        collision_mask: args.collisionMask ?? 1,
        collision_priority: args.collisionPriority ?? 1.0,
        layer_set: args.layerSet ?? true,
        mask_set: args.maskSet ?? true,
      }, args.projectPath, 'set collision config');
    },
  };
}

// ─── create_physics_body ──────────────────────────────────────────────────

const VALID_BODY_TYPES = [
  'rigid_body_2d', 'rigid_body_3d',
  'static_body_2d', 'static_body_3d',
  'character_body_2d', 'character_body_3d',
  'animatable_body_2d', 'animatable_body_3d',
  'area_2d', 'area_3d',
];

function createPhysicsBody(ctx: ServerContext): ToolDefinition {
  return {
    name: 'create_physics_body',
    description: 'Add a physics body (RigidBody, StaticBody, CharacterBody, AnimatableBody, or Area) to a scene with optional collision shape.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        parent_path: { type: 'string', description: 'Path to the parent node (default: ".")' },
        body_name: { type: 'string', description: 'Name for the new body node (default: "PhysicsBody")' },
        body_type: { type: 'string', description: 'Type of physics body', enum: VALID_BODY_TYPES },
        mass: { type: 'number', description: 'Mass (default: 1.0)' },
        gravity_scale: { type: 'number', description: 'Gravity scale (default: 1.0)' },
        freeze_enabled: { type: 'boolean', description: 'Enable freeze (default: false)' },
        freeze_mode: { type: 'string', description: 'Freeze mode: "kinematic" or "static"', enum: ['kinematic', 'static'] },
        can_sleep: { type: 'boolean', description: 'Allow body to sleep (default: true)' },
        lock_rotation: { type: 'boolean', description: 'Lock rotation (default: false)' },
        continuous_cd: { type: 'string', description: 'Continuous collision detection mode', enum: ['disabled', 'cast_ray', 'cast_shape'] },
        add_collision_shape: { type: 'boolean', description: 'Add a collision shape to the body (default: false)' },
        shape_type: { type: 'string', description: 'Collision shape type (default: "rectangle")' },
        shape_size: { type: 'string', description: 'Shape size as Godot vector string (e.g., "Vector2(64, 64)")' },
        shape_radius: { type: 'number', description: 'Shape radius for circle/sphere/capsule (default: 32)' },
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

      if (args.bodyType && !VALID_BODY_TYPES.includes(args.bodyType)) {
        return ctx.createErrorResponse(
          `Invalid body_type: '${args.bodyType}'`,
          [`Valid types: ${VALID_BODY_TYPES.join(', ')}`],
        );
      }

      return runGdScript(ctx, 'create_physics_body', {
        scene_path: args.scenePath,
        parent_path: args.parentPath || '.',
        body_name: args.bodyName || 'PhysicsBody',
        body_type: args.bodyType || 'rigid_body_2d',
        mass: args.mass ?? 1.0,
        gravity_scale: args.gravityScale ?? 1.0,
        freeze_enabled: args.freezeEnabled ?? false,
        freeze_mode: args.freezeMode || 'kinematic',
        can_sleep: args.canSleep ?? true,
        lock_rotation: args.lockRotation ?? false,
        continuous_cd: args.continuousCd || 'disabled',
        add_collision_shape: args.addCollisionShape ?? false,
        shape_type: args.shapeType || 'rectangle',
        shape_size: args.shapeSize || 'Vector2(64, 64)',
        shape_radius: args.shapeRadius ?? 32,
      }, args.projectPath, 'create physics body');
    },
  };
}

// ─── manage_collision_shape ───────────────────────────────────────────────

const VALID_SHAPE_ACTIONS = ['add', 'remove', 'replace'];

function manageCollisionShape(ctx: ServerContext): ToolDefinition {
  return {
    name: 'manage_collision_shape',
    description: 'Add, remove, or replace collision shapes on a physics body in a scene. Supports rectangle, circle, capsule, segment, world_boundary shapes.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        body_path: { type: 'string', description: 'Path to the physics body node containing the shape' },
        action: { type: 'string', description: 'Action: "add", "remove", or "replace"', enum: VALID_SHAPE_ACTIONS },
        shape_name: { type: 'string', description: 'Name for the collision shape node' },
        shape_type: { type: 'string', description: 'Shape type (rectangle, circle, capsule, box, sphere, cylinder, capsule_3d, segment, world_boundary)' },
        shape_size: { type: 'string', description: 'Shape size as Godot vector (e.g., "Vector2(64, 64)")' },
        shape_radius: { type: 'number', description: 'Shape radius (for circle/sphere/cylinder/capsule)' },
        shape_height: { type: 'number', description: 'Shape height (for capsule/cylinder)' },
        disabled: { type: 'boolean', description: 'Disable the collision shape (default: false)' },
        one_way_collision: { type: 'boolean', description: 'Enable one-way collision (2D only, default: false)' },
        one_way_margin: { type: 'number', description: 'One-way collision margin (2D only, default: 1.0)' },
      },
      required: ['project_path', 'scene_path', 'body_path'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
        requiredString('bodyPath', 'body_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      if (args.action && !VALID_SHAPE_ACTIONS.includes(args.action)) {
        return ctx.createErrorResponse(
          `Invalid action: '${args.action}'`,
          [`Valid actions: ${VALID_SHAPE_ACTIONS.join(', ')}`],
        );
      }

      return runGdScript(ctx, 'manage_collision_shape', {
        scene_path: args.scenePath,
        body_path: args.bodyPath,
        action: args.action || 'add',
        shape_name: args.shapeName || 'CollisionShape',
        shape_type: args.shapeType || 'rectangle',
        shape_size: args.shapeSize || 'Vector2(64, 64)',
        shape_radius: args.shapeRadius ?? 32,
        shape_height: args.shapeHeight ?? 64,
        disabled: args.disabled ?? false,
        one_way_collision: args.oneWayCollision ?? false,
        one_way_margin: args.oneWayMargin ?? 1.0,
      }, args.projectPath, 'manage collision shape');
    },
  };
}

// ─── setup_joint ───────────────────────────────────────────────────────────

const VALID_JOINT_TYPES = [
  'pin_joint_2d',
  'groove_joint_2d',
  'damped_spring_joint_2d',
  'hinge_joint_3d',
  'slider_joint_3d',
  'cone_twist_joint_3d',
  'generic_6dof_joint_3d',
  'spring_arm_3d',
];

function setupJoint(ctx: ServerContext): ToolDefinition {
  return {
    name: 'setup_joint',
    description: 'Create a joint/constraint (PinJoint2D, GrooveJoint2D, DampedSpringJoint2D, HingeJoint3D, SliderJoint3D, ConeTwistJoint3D, Generic6DOFJoint3D, SpringArm3D) between physics bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the .tscn file' },
        parent_path: { type: 'string', description: 'Path to the parent node (default: ".")' },
        joint_name: { type: 'string', description: 'Name for the joint node (default: "Joint")' },
        joint_type: { type: 'string', description: 'Type of joint', enum: VALID_JOINT_TYPES },
        bias: { type: 'number', description: 'Joint bias (default: 0.5)' },
        softness: { type: 'number', description: 'Joint softness (default: 0.0)' },
        disable_collisions: { type: 'boolean', description: 'Disable collisions between connected bodies (default: true)' },
        motor_enabled: { type: 'boolean', description: 'Enable motor (default: false)' },
        motor_target_velocity: { type: 'number', description: 'Motor target velocity (default: 0)' },
        motor_max_force: { type: 'number', description: 'Motor max force/impulse (default: 100)' },
        angular_limit_lower: { type: 'number', description: 'Lower angular limit in degrees (default: -90)' },
        angular_limit_upper: { type: 'number', description: 'Upper angular limit in degrees (default: 90)' },
        linear_limit_lower: { type: 'number', description: 'Lower linear limit (default: 0)' },
        linear_limit_upper: { type: 'number', description: 'Upper linear limit (default: 1)' },
        spring_length: { type: 'number', description: 'Spring rest length (default: 1.0)' },
        spring_stiffness: { type: 'number', description: 'Spring stiffness (default: 20)' },
        spring_damping: { type: 'number', description: 'Spring damping (default: 1.0)' },
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

      if (args.jointType && !VALID_JOINT_TYPES.includes(args.jointType)) {
        return ctx.createErrorResponse(
          `Invalid joint_type: '${args.jointType}'`,
          [`Valid types: ${VALID_JOINT_TYPES.join(', ')}`],
        );
      }

      return runGdScript(ctx, 'setup_joint', {
        scene_path: args.scenePath,
        parent_path: args.parentPath || '.',
        joint_name: args.jointName || 'Joint',
        joint_type: args.jointType || 'pin_joint_2d',
        bias: args.bias ?? 0.5,
        softness: args.softness ?? 0.0,
        disable_collisions: args.disableCollisions ?? true,
        motor_enabled: args.motorEnabled ?? false,
        motor_target_velocity: args.motorTargetVelocity ?? 0,
        motor_max_force: args.motorMaxForce ?? 100,
        angular_limit_lower: args.angularLimitLower ?? -90,
        angular_limit_upper: args.angularLimitUpper ?? 90,
        linear_limit_lower: args.linearLimitLower ?? 0,
        linear_limit_upper: args.linearLimitUpper ?? 1,
        spring_length: args.springLength ?? 1.0,
        spring_stiffness: args.springStiffness ?? 20,
        spring_damping: args.springDamping ?? 1.0,
      }, args.projectPath, 'setup joint');
    },
  };
}