/**
 * Asset Generation Bridge Tools (Tier 4 — Phase C)
 *
 * Lightweight integration with external generation APIs (DALL-E 3, ElevenLabs)
 * and placeholder backends for workflow testing.
 *
 * Tools:
 *   - generate_sprite              (TS)  Generate 2D sprite from text description
 *   - generate_texture             (TS)  Generate tileable texture from description
 *   - generate_sfx                 (TS)  Generate sound effect from description
 *   - generate_music               (TS)  Generate background music from description
 *   - configure_asset_generation   (TS)  View/test backend configuration
 */

import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString, optionalString, optionalNumber, optionalEnum } from '../utils/validation.js';
import {
  generateImage, generateAudio, getBackendStatus,
  ImageGenerationOptions, AudioGenerationOptions,
} from '../utils/generation-backends.js';

export function registerAssetGenerationTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    generateSprite(ctx),
    generateTexture(ctx),
    generateSfx(ctx),
    generateMusic(ctx),
    configureAssetGeneration(ctx),
  ]);
}

// ─── Tool 12: generate_sprite ──────────────────────────────────────────────

function generateSprite(ctx: ServerContext): ToolDefinition {
  return {
    name: 'generate_sprite',
    description: 'Generate a 2D sprite image from a text description using AI image generation (DALL-E 3) or a placeholder. Saves the PNG to the project assets directory. Set OPENAI_API_KEY and ASSET_GEN_IMAGE_BACKEND=dalle3 for real generation.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        description: { type: 'string', description: 'Text description of the sprite to generate (e.g. "a warrior character with a sword, side view")' },
        style: { type: 'string', enum: ['pixel_art', 'hand_drawn', 'realistic', 'cartoon', 'flat'], description: 'Art style (default: pixel_art)' },
        output_path: { type: 'string', description: 'Output path relative to project (default: assets/generated/sprite_<timestamp>.png)' },
        size: { type: 'string', description: 'Image size (default: "1024x1024")' },
        transparent_background: { type: 'boolean', description: 'Request transparent background (default: true)' },
      },
      required: ['project_path', 'description'],
    },
    timeout: 90000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('description'),
        optionalEnum('style', ['pixel_art', 'hand_drawn', 'realistic', 'cartoon', 'flat']),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const description = args.description as string;
      const style = (args.style as any) || 'pixel_art';
      const size = (args.size as string) || '1024x1024';
      const transparentBg = args.transparentBackground !== false;

      const outputRelPath = args.outputPath || `assets/generated/sprite_${Date.now()}.png`;
      const outputFullPath = join(projectDir, outputRelPath);

      const options: ImageGenerationOptions = {
        description: `Game sprite: ${description}`,
        style,
        size,
        outputPath: outputFullPath,
        transparentBackground: transparentBg,
      };

      const result = await generateImage(options);

      if (!result.success) {
        return ctx.createErrorResponse(
          result.error || 'Image generation failed',
          result.backend_used === 'dalle3'
            ? ['Check your OPENAI_API_KEY is valid', 'Verify API quota/billing']
            : ['Set OPENAI_API_KEY and ASSET_GEN_IMAGE_BACKEND=dalle3 for real generation']
        );
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            output_path: outputRelPath,
            backend: result.backend_used,
            description,
            style,
            metadata: result.metadata,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 13: generate_texture ─────────────────────────────────────────────

function generateTexture(ctx: ServerContext): ToolDefinition {
  return {
    name: 'generate_texture',
    description: 'Generate a tileable texture image from a text description. The texture is created to be seamlessly tileable for use in 2D tilemaps or 3D materials. Set OPENAI_API_KEY and ASSET_GEN_IMAGE_BACKEND=dalle3 for real generation.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        description: { type: 'string', description: 'Text description (e.g. "grass ground texture with small flowers")' },
        style: { type: 'string', enum: ['pixel_art', 'hand_drawn', 'realistic', 'cartoon', 'flat'], description: 'Art style (default: realistic)' },
        output_path: { type: 'string', description: 'Output path relative to project (default: assets/generated/texture_<timestamp>.png)' },
        size: { type: 'string', description: 'Image size (default: "1024x1024")' },
      },
      required: ['project_path', 'description'],
    },
    timeout: 90000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('description'),
        optionalEnum('style', ['pixel_art', 'hand_drawn', 'realistic', 'cartoon', 'flat']),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const description = args.description as string;
      const style = (args.style as any) || 'realistic';
      const size = (args.size as string) || '1024x1024';

      const outputRelPath = args.outputPath || `assets/generated/texture_${Date.now()}.png`;
      const outputFullPath = join(projectDir, outputRelPath);

      const options: ImageGenerationOptions = {
        description: `Tileable game texture: ${description}`,
        style,
        size,
        outputPath: outputFullPath,
        transparentBackground: false,
        tileable: true,
      };

      const result = await generateImage(options);

      if (!result.success) {
        return ctx.createErrorResponse(result.error || 'Texture generation failed');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            output_path: outputRelPath,
            backend: result.backend_used,
            tileable: true,
            description,
            style,
            metadata: result.metadata,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 14: generate_sfx ────────────────────────────────────────────────

function generateSfx(ctx: ServerContext): ToolDefinition {
  return {
    name: 'generate_sfx',
    description: 'Generate a sound effect from a text description using AI audio generation (ElevenLabs) or a placeholder tone. Saves WAV to the project audio directory. Set ELEVENLABS_API_KEY and ASSET_GEN_AUDIO_BACKEND=elevenlabs for real generation.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        description: { type: 'string', description: 'Text description (e.g. "sword swing whoosh", "coin pickup chime", "explosion boom")' },
        duration_seconds: { type: 'number', description: 'Duration in seconds (default: 1, max: 10)' },
        output_path: { type: 'string', description: 'Output path relative to project (default: audio/generated/sfx_<timestamp>.wav)' },
      },
      required: ['project_path', 'description'],
    },
    timeout: 60000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('description'),
        optionalNumber('durationSeconds', 'duration_seconds'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const description = args.description as string;
      const durationSeconds = Math.min(Math.max((args.durationSeconds as number) || 1, 0.1), 10);

      const outputRelPath = args.outputPath || `audio/generated/sfx_${Date.now()}.wav`;
      const outputFullPath = join(projectDir, outputRelPath);

      const options: AudioGenerationOptions = {
        description,
        durationSeconds,
        outputPath: outputFullPath,
        format: 'wav',
      };

      const result = await generateAudio(options);

      if (!result.success) {
        return ctx.createErrorResponse(
          result.error || 'SFX generation failed',
          ['Check ELEVENLABS_API_KEY', 'Set ASSET_GEN_AUDIO_BACKEND=elevenlabs']
        );
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            output_path: outputRelPath,
            backend: result.backend_used,
            duration_seconds: durationSeconds,
            description,
            metadata: result.metadata,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 15: generate_music ───────────────────────────────────────────────

function generateMusic(ctx: ServerContext): ToolDefinition {
  return {
    name: 'generate_music',
    description: 'Generate background music from a description. Currently uses placeholder backend (sine tone). Configure external music generation APIs for real output. Saves WAV to the project audio directory.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        description: { type: 'string', description: 'Description of the music (e.g. "upbeat chiptune adventure theme", "dark ambient dungeon music")' },
        mood: { type: 'string', description: 'Mood keyword (e.g. "happy", "tense", "melancholy", "epic")' },
        duration_seconds: { type: 'number', description: 'Duration in seconds (default: 30, max: 120)' },
        bpm: { type: 'number', description: 'Beats per minute (default: 120)' },
        loop: { type: 'boolean', description: 'Whether the music should loop (default: true)' },
        output_path: { type: 'string', description: 'Output path relative to project' },
      },
      required: ['project_path', 'description'],
    },
    timeout: 120000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('description'),
        optionalString('mood'),
        optionalNumber('durationSeconds', 'duration_seconds'),
        optionalNumber('bpm'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const description = args.description as string;
      const mood = (args.mood as string) || '';
      const durationSeconds = Math.min(Math.max((args.durationSeconds as number) || 30, 1), 120);
      const bpm = (args.bpm as number) || 120;
      const loop = args.loop !== false;

      const outputRelPath = args.outputPath || `audio/generated/music_${Date.now()}.wav`;
      const outputFullPath = join(projectDir, outputRelPath);

      const fullDescription = mood ? `${mood} ${description}` : description;

      const options: AudioGenerationOptions = {
        description: fullDescription,
        durationSeconds,
        outputPath: outputFullPath,
        format: 'wav',
        loop,
        bpm,
        mood,
      };

      const result = await generateAudio(options);

      if (!result.success) {
        return ctx.createErrorResponse(result.error || 'Music generation failed');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            output_path: outputRelPath,
            backend: result.backend_used,
            duration_seconds: durationSeconds,
            bpm,
            loop,
            description,
            mood: mood || undefined,
            metadata: result.metadata,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 16: configure_asset_generation ───────────────────────────────────

function configureAssetGeneration(ctx: ServerContext): ToolDefinition {
  return {
    name: 'configure_asset_generation',
    description: 'View current asset generation backend configuration and API key status. Shows which backends are configured for image and audio generation, and tests API connectivity.',
    inputSchema: {
      type: 'object',
      properties: {
        test_connectivity: { type: 'boolean', description: 'Test API connectivity (default: false)' },
      },
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args) || {};
      const testConnectivity = args.testConnectivity === true;

      const status = getBackendStatus();
      const result: Record<string, any> = {
        image_backend: {
          active: status.image.backend,
          api_key_configured: status.image.api_key_set,
          env_var: 'OPENAI_API_KEY',
          switch_command: 'Set ASSET_GEN_IMAGE_BACKEND=dalle3 to use DALL-E 3',
        },
        audio_backend: {
          active: status.audio.backend,
          api_key_configured: status.audio.api_key_set,
          env_var: 'ELEVENLABS_API_KEY',
          switch_command: 'Set ASSET_GEN_AUDIO_BACKEND=elevenlabs to use ElevenLabs',
        },
        environment_variables: {
          OPENAI_API_KEY: status.image.api_key_set ? 'set (masked)' : 'not set',
          ELEVENLABS_API_KEY: status.audio.api_key_set ? 'set (masked)' : 'not set',
          ASSET_GEN_IMAGE_BACKEND: process.env.ASSET_GEN_IMAGE_BACKEND || 'not set (default: placeholder)',
          ASSET_GEN_AUDIO_BACKEND: process.env.ASSET_GEN_AUDIO_BACKEND || 'not set (default: placeholder)',
        },
      };

      if (testConnectivity) {
        const connectivityResults: Record<string, any> = {};

        // Test DALL-E 3
        if (status.image.api_key_set && status.image.backend === 'dalle3') {
          try {
            const axios = (await import('axios')).default;
            const resp = await axios.get('https://api.openai.com/v1/models', {
              headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
              timeout: 10000,
            });
            connectivityResults.dalle3 = { status: 'connected', models_available: true };
          } catch (err: any) {
            connectivityResults.dalle3 = {
              status: 'error',
              message: err.response?.status === 401 ? 'Invalid API key' : err.message,
            };
          }
        } else {
          connectivityResults.dalle3 = { status: 'not_configured' };
        }

        // Test ElevenLabs
        if (status.audio.api_key_set && status.audio.backend === 'elevenlabs') {
          try {
            const axios = (await import('axios')).default;
            const resp = await axios.get('https://api.elevenlabs.io/v1/user', {
              headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
              timeout: 10000,
            });
            connectivityResults.elevenlabs = { status: 'connected' };
          } catch (err: any) {
            connectivityResults.elevenlabs = {
              status: 'error',
              message: err.response?.status === 401 ? 'Invalid API key' : err.message,
            };
          }
        } else {
          connectivityResults.elevenlabs = { status: 'not_configured' };
        }

        result.connectivity = connectivityResults;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  };
}
