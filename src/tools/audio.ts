/**
 * Audio Bus Configuration Tools (Tier 3 — Phase 4)
 *
 * Set up audio bus layouts with volume, routing, and effects.
 *
 * Tools:
 *   - configure_audio_bus  (GDScript)  Create AudioBusLayout with effects
 */

import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString } from '../utils/validation.js';

export function registerAudioTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    configureAudioBus(ctx),
  ]);
}

// ─── Audio effect types for validation ──────────────────────────────────────

const VALID_EFFECT_TYPES = [
  'reverb', 'compressor', 'limiter', 'eq', 'eq6', 'eq10', 'eq21',
  'delay', 'chorus', 'phaser', 'distortion',
  'lowpassfilter', 'low_pass', 'highpassfilter', 'high_pass',
  'bandpassfilter', 'band_pass', 'amplify', 'panner',
];

// ─── configure_audio_bus ────────────────────────────────────────────────────

function configureAudioBus(ctx: ServerContext): ToolDefinition {
  return {
    name: 'configure_audio_bus',
    description: 'Create an AudioBusLayout resource with named buses, volume levels, routing, and audio effects (Reverb, Compressor, Limiter, EQ, Delay, Chorus, Phaser, Distortion, filters). Saves a .tres file that can be loaded as the default bus layout.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        output_path: { type: 'string', description: 'Output path for the AudioBusLayout (relative res:// path, e.g., "res://audio/default_bus_layout.tres")' },
        buses: {
          type: 'array',
          description: 'Array of bus definitions. First entry named "Master" configures the Master bus.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Bus name (e.g., "Master", "Music", "SFX", "Voice", "Ambient")' },
              volume_db: { type: 'number', description: 'Volume in dB (default: 0.0)' },
              mute: { type: 'boolean', description: 'Mute the bus (default: false)' },
              solo: { type: 'boolean', description: 'Solo the bus (default: false)' },
              bypass_effects: { type: 'boolean', description: 'Bypass all effects (default: false)' },
              send_to: { type: 'string', description: 'Name of bus to route output to (default: "Master")' },
              effects: {
                type: 'array',
                description: 'Audio effects to add to this bus',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      description: 'Effect type: reverb, compressor, limiter, eq/eq6/eq10/eq21, delay, chorus, phaser, distortion, low_pass, high_pass, band_pass, amplify, panner',
                    },
                    // Effect-specific params passed through
                  },
                  required: ['type'],
                },
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['project_path', 'output_path', 'buses'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('outputPath', 'output_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const outputPath = args.outputPath as string;
      const buses: any[] = args.buses || [];

      if (buses.length === 0) {
        return ctx.createErrorResponse('At least one bus definition is required');
      }

      // Validate effect types
      for (const bus of buses) {
        for (const effect of (bus.effects || [])) {
          if (!VALID_EFFECT_TYPES.includes(effect.type?.toLowerCase())) {
            return ctx.createErrorResponse(
              `Invalid effect type: '${effect.type}'`,
              [`Valid types: ${VALID_EFFECT_TYPES.join(', ')}`]
            );
          }
        }
      }

      // Ensure output_path is res:// format
      let resPath = outputPath;
      if (!resPath.startsWith('res://')) {
        resPath = `res://${resPath}`;
      }

      try {
        const result = await ctx.executeOperation('configure_audio_bus', {
          output_path: resPath,
          buses,
        }, projectDir);

        const stdout = result.stdout.trim();
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) {
          return ctx.createErrorResponse(
            'Failed to configure audio buses',
            [`Godot output: ${result.stderr || result.stdout}`]
          );
        }

        const data = JSON.parse(stdout.substring(jsonStart));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (err: any) {
        return ctx.createErrorResponse(
          `Failed to configure audio buses: ${err.message}`,
          ['Ensure Godot is installed', 'Check that output path is writable']
        );
      }
    },
  };
}
