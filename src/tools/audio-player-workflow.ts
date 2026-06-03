/**
 * Audio player workflow tools for Phase 1.7.
 */

import { existsSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

export function registerAudioPlayerWorkflowTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    createAudioPlayer(ctx),
    setAudioStream(ctx),
    configureAudioPlayback(ctx),
    playAudioNode(ctx),
    stopAudioNode(ctx),
    listAudioPlayers(ctx),
    validateAudioRoutes(ctx),
  ]);
}

function createAudioPlayer(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'create_audio_player',
    description: 'Create an AudioStreamPlayer, AudioStreamPlayer2D, or AudioStreamPlayer3D node in a saved scene.',
    operation: 'audio_player_create',
    required: ['project_path', 'scene_path'],
    properties: audioSceneProperties({
      parent_path: { type: 'string' },
      player_name: { type: 'string' },
      player_type: { type: 'string', enum: ['plain', '2d', '3d', 'AudioStreamPlayer', 'AudioStreamPlayer2D', 'AudioStreamPlayer3D'] },
      stream_path: { type: 'string' },
      bus: { type: 'string' },
      autoplay: { type: 'boolean' },
      playing: { type: 'boolean' },
      volume_db: { type: 'number' },
      pitch_scale: { type: 'number' },
      position: {},
      max_distance: { type: 'number' },
      attenuation: { type: 'number' },
      area_mask: { type: 'number' },
      panning_strength: { type: 'number' },
      max_polyphony: { type: 'number' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      parent_path: args.parentPath || '.',
      player_name: args.playerName || defaultPlayerName(args.playerType),
      player_type: normalizePlayerType(args.playerType),
      stream_path: args.streamPath,
      bus: args.bus,
      autoplay: args.autoplay,
      playing: args.playing,
      volume_db: args.volumeDb,
      pitch_scale: args.pitchScale,
      position: args.position,
      max_distance: args.maxDistance,
      attenuation: args.attenuation,
      area_mask: args.areaMask,
      panning_strength: args.panningStrength,
      max_polyphony: args.maxPolyphony,
    }),
  });
}

function setAudioStream(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'set_audio_stream',
    description: 'Assign an AudioStream resource to an existing audio player node in a scene.',
    operation: 'audio_player_set_stream',
    required: ['project_path', 'scene_path', 'player_path', 'stream_path'],
    properties: playerSceneProperties({
      stream_path: { type: 'string' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      player_path: args.playerPath,
      stream_path: args.streamPath,
    }),
  });
}

function configureAudioPlayback(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'configure_audio_playback',
    description: 'Configure playback, routing, volume, pitch, and supported spatial audio properties on an audio player node.',
    operation: 'audio_player_configure',
    required: ['project_path', 'scene_path', 'player_path'],
    properties: playerSceneProperties({
      bus: { type: 'string' },
      autoplay: { type: 'boolean' },
      playing: { type: 'boolean' },
      volume_db: { type: 'number' },
      pitch_scale: { type: 'number' },
      position: {},
      max_distance: { type: 'number' },
      attenuation: { type: 'number' },
      area_mask: { type: 'number' },
      panning_strength: { type: 'number' },
      max_polyphony: { type: 'number' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      player_path: args.playerPath,
      bus: args.bus,
      autoplay: args.autoplay,
      playing: args.playing,
      volume_db: args.volumeDb,
      pitch_scale: args.pitchScale,
      position: args.position,
      max_distance: args.maxDistance,
      attenuation: args.attenuation,
      area_mask: args.areaMask,
      panning_strength: args.panningStrength,
      max_polyphony: args.maxPolyphony,
    }),
  });
}

function playAudioNode(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'play_audio_node',
    description: 'Persist a scene audio player as playing and optionally set the starting playback position.',
    operation: 'audio_player_play',
    required: ['project_path', 'scene_path', 'player_path'],
    properties: playerSceneProperties({
      from_position: { type: 'number' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      player_path: args.playerPath,
      from_position: args.fromPosition ?? 0,
    }),
  });
}

function stopAudioNode(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'stop_audio_node',
    description: 'Persist a scene audio player as stopped.',
    operation: 'audio_player_stop',
    required: ['project_path', 'scene_path', 'player_path'],
    properties: playerSceneProperties({}),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      player_path: args.playerPath,
    }),
  });
}

function listAudioPlayers(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'list_audio_players',
    description: 'List AudioStreamPlayer nodes in a scene with stream and route details.',
    operation: 'audio_player_list',
    required: ['project_path', 'scene_path'],
    properties: audioSceneProperties({
      include_routes: { type: 'boolean' },
    }),
    invalidateScene: false,
    mapParams: (args) => ({
      scene_path: args.scenePath,
      include_routes: args.includeRoutes ?? true,
    }),
  });
}

function validateAudioRoutes(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'validate_audio_routes',
    description: 'Validate audio player stream assignments and bus route names in a scene.',
    operation: 'audio_player_validate_routes',
    required: ['project_path', 'scene_path'],
    properties: audioSceneProperties({
      allowed_buses: { type: 'array', items: { type: 'string' } },
      require_stream: { type: 'boolean' },
    }),
    invalidateScene: false,
    mapParams: (args) => ({
      scene_path: args.scenePath,
      allowed_buses: args.allowedBuses || [],
      require_stream: args.requireStream ?? true,
    }),
  });
}

function operationTool(ctx: ServerContext, config: {
  name: string;
  description: string;
  operation: string;
  properties: Record<string, any>;
  required: string[];
  invalidateScene?: boolean;
  mapParams: (args: any) => Record<string, any>;
}): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: {
      type: 'object',
      properties: config.properties,
      required: config.required,
    },
    timeout: 60000,
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      for (const required of config.required) {
        if (required === 'project_path') continue;
        const camel = snakeToCamel(required);
        if (args[camel] === undefined || args[camel] === null || args[camel] === '') {
          return failure(`${required} is required`);
        }
      }

      try {
        const params = config.mapParams(args);
        const result = await ctx.executeOperation(config.operation, params, target.projectRoot);
        const parsed = parseGodotJson(result.stdout);
        if (!parsed) {
          return jsonResponse({
            status: 'failed',
            reason: result.stderr || result.stdout || `No JSON result returned by ${config.operation}`,
          }, true);
        }
        if (parsed.success === false) {
          return jsonResponse({ status: 'failed', ...parsed }, true);
        }
        if (config.invalidateScene !== false) {
          invalidateSceneCache(ctx, target.projectRoot, args.scenePath);
        }
        return jsonResponse({ status: 'success', ...parsed });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function audioSceneProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    scene_path: { type: 'string' },
    ...extra,
  };
}

function playerSceneProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    scene_path: { type: 'string' },
    player_path: { type: 'string' },
    ...extra,
  };
}

function parseGodotJson(stdout: string): any | null {
  const lines = stdout.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    scenePath: args.scenePath ?? args.scene_path,
    parentPath: args.parentPath ?? args.parent_path,
    playerName: args.playerName ?? args.player_name,
    playerType: args.playerType ?? args.player_type,
    playerPath: args.playerPath ?? args.player_path,
    streamPath: args.streamPath ?? args.stream_path,
    volumeDb: args.volumeDb ?? args.volume_db,
    pitchScale: args.pitchScale ?? args.pitch_scale,
    fromPosition: args.fromPosition ?? args.from_position,
    maxDistance: args.maxDistance ?? args.max_distance,
    areaMask: args.areaMask ?? args.area_mask,
    panningStrength: args.panningStrength ?? args.panning_strength,
    maxPolyphony: args.maxPolyphony ?? args.max_polyphony,
    includeRoutes: args.includeRoutes ?? args.include_routes,
    allowedBuses: args.allowedBuses ?? args.allowed_buses,
    requireStream: args.requireStream ?? args.require_stream,
  };
}

function normalizePlayerType(value: string | undefined): 'plain' | '2d' | '3d' {
  const text = String(value || 'plain').toLowerCase();
  if (text.includes('3')) return '3d';
  if (text.includes('2')) return '2d';
  return 'plain';
}

function defaultPlayerName(playerType: string | undefined): string {
  const type = normalizePlayerType(playerType);
  if (type === '3d') return 'AudioStreamPlayer3D';
  if (type === '2d') return 'AudioStreamPlayer2D';
  return 'AudioStreamPlayer';
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): { projectRoot: string } | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  if (!existsSync(resolve(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  }
  return { projectRoot };
}

function resolveProjectPath(projectRoot: string, candidate: string | undefined): string | null {
  if (!candidate || candidate.startsWith('uid://')) return null;
  const localPath = candidate.startsWith('res://') ? candidate.slice('res://'.length) : candidate;
  const absolutePath = isAbsolute(localPath) ? resolve(localPath) : resolve(projectRoot, localPath);
  return normalizeRelative(projectRoot, absolutePath) === null ? null : absolutePath;
}

function normalizeRelative(projectRoot: string, absolutePath: string): string | null {
  const rel = relative(projectRoot, absolutePath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    return absolutePath === projectRoot ? '.' : null;
  }
  return rel.replace(/\\/g, '/');
}

function invalidateSceneCache(ctx: ServerContext, projectRoot: string, scenePath: string | undefined): void {
  const absolute = resolveProjectPath(projectRoot, scenePath);
  if (absolute) ctx.invalidateTscnCache(absolute);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function failure(reason: string): ToolResponse {
  return jsonResponse({ status: 'failed', reason }, true);
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
