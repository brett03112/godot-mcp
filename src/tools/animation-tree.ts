/**
 * AnimationTree Configuration Tools (Tier 1 — Step 4)
 *
 * These tools fill the gap between simple keyframe animation and
 * real character animation with blend spaces and state machines.
 *
 * Tools:
 *   - configure_animation_tree  (GD)  Set up AnimationTree with state machine or blend space
 *   - create_animation_library  (GD)  Batch-create animations from compact descriptions
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';

export function registerAnimationTreeTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    configureAnimationTree(ctx),
    createAnimationLibrary(ctx),
  ]);
}

// ─── configure_animation_tree ─────────────────────────────────────────────────

function configureAnimationTree(ctx: ServerContext): ToolDefinition {
  return {
    name: 'configure_animation_tree',
    description: 'Set up an AnimationTree node with a StateMachine, BlendSpace1D, BlendSpace2D, or BlendTree root. For state machines, define states and transitions. For blend spaces, define blend points. Links to an existing AnimationPlayer.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scene_path: {
          type: 'string',
          description: 'Relative path to the .tscn file within the project',
        },
        parent_node_path: {
          type: 'string',
          description: 'Path of the parent node where the AnimationTree will be added (e.g., ".", "Player")',
        },
        animation_player_path: {
          type: 'string',
          description: 'Path to the AnimationPlayer node relative to the AnimationTree (e.g., "../AnimationPlayer")',
        },
        root_type: {
          type: 'string',
          description: 'Type of root node for the AnimationTree',
          enum: ['state_machine', 'blend_space_1d', 'blend_space_2d', 'blend_tree'],
        },
        node_name: {
          type: 'string',
          description: 'Name for the AnimationTree node (default: "AnimationTree")',
        },
        active: {
          type: 'boolean',
          description: 'Whether the AnimationTree starts active (default: true)',
        },
        states: {
          type: 'array',
          description: 'For state_machine: array of state definitions',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'State name (e.g., "Idle", "Run", "Jump")' },
              animation: { type: 'string', description: 'Animation name in the AnimationPlayer library' },
              position: {
                type: 'array',
                description: 'Editor position [x, y] for visual layout (optional)',
                items: { type: 'number' },
              },
            },
            required: ['name', 'animation'],
          },
        },
        transitions: {
          type: 'array',
          description: 'For state_machine: array of transition definitions',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Source state name' },
              to: { type: 'string', description: 'Target state name' },
              auto_advance: { type: 'boolean', description: 'Transition automatically when animation finishes (default: false)' },
              advance_condition: { type: 'string', description: 'Boolean parameter name that triggers advance (optional)' },
              switch_mode: {
                type: 'string',
                description: 'How the transition happens',
                enum: ['immediate', 'sync', 'at_end'],
              },
              xfade_time: { type: 'number', description: 'Cross-fade duration in seconds (default: 0)' },
            },
            required: ['from', 'to'],
          },
        },
        blend_points: {
          type: 'array',
          description: 'For blend_space_1d/2d: array of blend point definitions',
          items: {
            type: 'object',
            properties: {
              animation: { type: 'string', description: 'Animation name' },
              position: {
                description: 'Blend position: number for 1D, [x, y] array for 2D',
              },
            },
            required: ['animation', 'position'],
          },
        },
        blend_mode: {
          type: 'string',
          description: 'Blend mode for blend spaces',
          enum: ['interpolated', 'discrete', 'carry'],
        },
      },
      required: ['project_path', 'scene_path', 'parent_node_path', 'animation_player_path', 'root_type'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath || !args.parentNodePath || !args.animationPlayerPath || !args.rootType) {
        return ctx.createErrorResponse(
          'project_path, scene_path, parent_node_path, animation_player_path, and root_type are required'
        );
      }

      const validRootTypes = ['state_machine', 'blend_space_1d', 'blend_space_2d', 'blend_tree'];
      if (!validRootTypes.includes(args.rootType)) {
        return ctx.createErrorResponse(
          `Invalid root_type: ${args.rootType}`,
          [`Must be one of: ${validRootTypes.join(', ')}`]
        );
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      try {
        const result = await ctx.executeOperation('configure_animation_tree', {
          scenePath: args.scenePath,
          parentNodePath: args.parentNodePath,
          animationPlayerPath: args.animationPlayerPath,
          rootType: args.rootType,
          nodeName: args.nodeName || 'AnimationTree',
          active: args.active !== false,
          states: args.states || [],
          transitions: args.transitions || [],
          blendPoints: args.blendPoints || [],
          blendMode: args.blendMode || 'interpolated',
        }, args.projectPath);

        if (result.stderr && result.stderr.includes('ERROR')) {
          const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
          if (errors.length > 0) {
            return ctx.createErrorResponse(
              `Failed to configure AnimationTree: ${errors[0].message}`,
              errors[0].possible_solutions
            );
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              scene: args.scenePath,
              parent: args.parentNodePath,
              animation_tree: args.nodeName || 'AnimationTree',
              root_type: args.rootType,
              animation_player: args.animationPlayerPath,
              states: (args.states || []).length,
              transitions: (args.transitions || []).length,
              blend_points: (args.blendPoints || []).length,
              message: `AnimationTree configured with ${args.rootType} root`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to configure AnimationTree: ${msg}`);
      }
    },
  };
}

// ─── create_animation_library ─────────────────────────────────────────────────

function createAnimationLibrary(ctx: ServerContext): ToolDefinition {
  return {
    name: 'create_animation_library',
    description: 'Batch-create multiple animations in an AnimationLibrary resource from compact descriptions. More efficient than creating animations one track at a time.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        library_name: {
          type: 'string',
          description: 'Name for the animation library file (without extension)',
        },
        output_dir: {
          type: 'string',
          description: 'Directory within the project to save the library (default: "animations/")',
        },
        animations: {
          type: 'array',
          description: 'Array of animation definitions',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Animation name (e.g., "idle", "run", "jump")' },
              length: { type: 'number', description: 'Animation duration in seconds (default: 1.0)' },
              loop_mode: {
                type: 'string',
                description: 'Loop mode',
                enum: ['none', 'linear', 'pingpong'],
              },
              tracks: {
                type: 'array',
                description: 'Array of track definitions for this animation',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      description: 'Track type',
                      enum: ['position', 'rotation', 'scale', 'property', 'method', 'audio'],
                    },
                    node_path: { type: 'string', description: 'Path to the animated node (e.g., "Sprite2D", "CollisionShape2D")' },
                    property: { type: 'string', description: 'For property tracks: property name with optional subpath (e.g., "modulate:a", "visible")' },
                    keyframes: {
                      type: 'array',
                      description: 'Array of keyframes: { time, value, easing? }',
                      items: {
                        type: 'object',
                        properties: {
                          time: { type: 'number', description: 'Time in seconds' },
                          value: { description: 'Keyframe value (type depends on track type)' },
                          easing: { type: 'number', description: 'Easing curve (< 1 ease-in, 1 linear, > 1 ease-out)' },
                        },
                        required: ['time', 'value'],
                      },
                    },
                  },
                  required: ['type', 'node_path', 'keyframes'],
                },
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['project_path', 'library_name', 'animations'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.libraryName || !args.animations) {
        return ctx.createErrorResponse('project_path, library_name, and animations are required');
      }

      if (!Array.isArray(args.animations) || args.animations.length === 0) {
        return ctx.createErrorResponse('animations must be a non-empty array');
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      try {
        const result = await ctx.executeOperation('create_animation_library', {
          libraryName: args.libraryName,
          outputDir: args.outputDir || 'animations',
          animations: args.animations,
        }, args.projectPath);

        if (result.stderr && result.stderr.includes('ERROR')) {
          const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
          if (errors.length > 0) {
            return ctx.createErrorResponse(
              `Failed to create animation library: ${errors[0].message}`,
              errors[0].possible_solutions
            );
          }
        }

        const outputDir = args.outputDir || 'animations';
        const libraryPath = `${outputDir}/${args.libraryName}.tres`;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              library_path: libraryPath,
              library_res_path: `res://${libraryPath}`,
              animations: args.animations.map((a: any) => ({
                name: a.name,
                length: a.length || 1.0,
                loop_mode: a.loopMode || a.loop_mode || 'none',
                tracks: (a.tracks || []).length,
              })),
              message: `Animation library created with ${args.animations.length} animation(s)`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to create animation library: ${msg}`);
      }
    },
  };
}
