import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerAudioPlayerWorkflowTools } from '../build/tools/audio-player-workflow.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    scene_path: 'scenePath',
    parent_path: 'parentPath',
    player_name: 'playerName',
    player_type: 'playerType',
    player_path: 'playerPath',
    stream_path: 'streamPath',
    volume_db: 'volumeDb',
    pitch_scale: 'pitchScale',
    from_position: 'fromPosition',
    max_distance: 'maxDistance',
    attenuation: 'attenuation',
    area_mask: 'areaMask',
    panning_strength: 'panningStrength',
    include_routes: 'includeRoutes',
    allowed_buses: 'allowedBuses',
    require_stream: 'requireStream',
  };

  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = mapping[key] || key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[normalizedKey] = normalizeParameters(value);
      } else if (Array.isArray(value)) {
        result[normalizedKey] = value.map((item) => normalizeParameters(item));
      } else {
        result[normalizedKey] = value;
      }
    }
    return result;
  };

  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({ content: [{ type: 'text', text: message }], isError: true }),
    validatePath: (path) => Boolean(path) && !path.includes('..'),
    executeOperation: options.executeOperation || (async () => ({ stdout: '{"success":true}', stderr: '' })),
    normalizeParameters,
    convertCamelToSnakeCase: (params) => params,
    parseGodotErrors: () => [],
    formatTresValue: (value) => String(value),
    generateUID: () => 'uid://test',
    generateShortUID: () => 'testuid',
    isGodot44OrLater: () => true,
    getGodotPath: async () => 'godot',
    formatProjectSettingValue: (value) => String(value),
    escapeCsvValue: (value) => value,
    parseCsvLine: (line) => line.split(','),
    escapePoString: (value) => value,
    escapeRegex: (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    extractPlaceholders: () => [],
    getOrParseTscn: () => ({}),
    invalidateTscnCache: options.invalidateTscnCache || (() => {}),
  };
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-audio-player-'));
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await mkdir(join(projectPath, 'audio'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="AudioPlayerWorkflow"\n');
  await writeFile(join(projectPath, 'scenes', 'level.tscn'), [
    '[gd_scene load_steps=1 format=3]',
    '',
    '[node name="Level" type="Node2D"]',
    '',
  ].join('\n'));
  await writeFile(join(projectPath, 'audio', 'theme.ogg'), 'fake audio fixture');
  await writeFile(join(projectPath, 'audio', 'hit.wav'), 'fake audio fixture');
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerAudioPlayerWorkflowTools(registry, ctx);
  return registry;
}

test('audio player workflow tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'create_audio_player',
    'set_audio_stream',
    'configure_audio_playback',
    'play_audio_node',
    'stop_audio_node',
    'list_audio_players',
    'validate_audio_routes',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('audio player creation, stream assignment, and playback configuration map scene parameters', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const invalidated = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params, projectDir) => {
        calls.push({ operation, params, projectDir });
        return { stdout: JSON.stringify({ success: true, operation, player_path: params.player_path || 'MusicPlayer' }) + '\n', stderr: '' };
      },
      invalidateTscnCache: (path) => invalidated.push(path),
    }));

    await registry.dispatch('create_audio_player', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      parent_path: '.',
      player_name: 'MusicPlayer',
      player_type: '2d',
      stream_path: 'audio/theme.ogg',
      bus: 'Music',
      autoplay: true,
      volume_db: -6,
      pitch_scale: 1.05,
      position: [32, 48],
    });
    await registry.dispatch('set_audio_stream', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      player_path: 'MusicPlayer',
      stream_path: 'audio/hit.wav',
    });
    await registry.dispatch('configure_audio_playback', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      player_path: 'MusicPlayer',
      bus: 'SFX',
      autoplay: false,
      playing: false,
      volume_db: -3,
      pitch_scale: 0.95,
      max_distance: 1600,
      attenuation: 1.25,
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'audio_player_create',
      'audio_player_set_stream',
      'audio_player_configure',
    ]);
    assert.equal(calls[0].params.scene_path, 'scenes/level.tscn');
    assert.equal(calls[0].params.parent_path, '.');
    assert.equal(calls[0].params.player_name, 'MusicPlayer');
    assert.equal(calls[0].params.player_type, '2d');
    assert.equal(calls[0].params.stream_path, 'audio/theme.ogg');
    assert.equal(calls[0].params.bus, 'Music');
    assert.equal(calls[0].params.autoplay, true);
    assert.equal(calls[0].params.volume_db, -6);
    assert.equal(calls[0].params.pitch_scale, 1.05);
    assert.deepEqual(calls[0].params.position, [32, 48]);
    assert.equal(calls[1].params.player_path, 'MusicPlayer');
    assert.equal(calls[1].params.stream_path, 'audio/hit.wav');
    assert.equal(calls[2].params.bus, 'SFX');
    assert.equal(calls[2].params.playing, false);
    assert.equal(calls[2].params.max_distance, 1600);
    assert.equal(calls[2].params.attenuation, 1.25);
    assert.equal(calls.every((call) => call.projectDir === projectPath), true);
    assert.equal(invalidated.length, 3);
  });
});

test('play and stop tools map playback control payloads', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return { stdout: JSON.stringify({ success: true, operation, player_path: params.player_path }) + '\n', stderr: '' };
      },
    }));

    await registry.dispatch('play_audio_node', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      player_path: 'MusicPlayer',
      from_position: 1.5,
    });
    await registry.dispatch('stop_audio_node', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      player_path: 'MusicPlayer',
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'audio_player_play',
      'audio_player_stop',
    ]);
    assert.equal(calls[0].params.player_path, 'MusicPlayer');
    assert.equal(calls[0].params.from_position, 1.5);
    assert.equal(calls[1].params.scene_path, 'scenes/level.tscn');
  });
});

test('audio player listing and route validation tools return parsed JSON responses', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        if (operation === 'audio_player_list') {
          return {
            stdout: JSON.stringify({
              success: true,
              players: [{ path: 'MusicPlayer', type: 'AudioStreamPlayer2D', bus: 'Music' }],
              count: 1,
            }) + '\n',
            stderr: '',
          };
        }
        return {
          stdout: JSON.stringify({
            success: true,
            valid: true,
            players_checked: 1,
            issues: [],
          }) + '\n',
          stderr: '',
        };
      },
    }));

    const list = parseResponse(await registry.dispatch('list_audio_players', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      include_routes: true,
    }));
    const validation = parseResponse(await registry.dispatch('validate_audio_routes', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      allowed_buses: ['Master', 'Music'],
      require_stream: true,
    }));

    assert.equal(list.status, 'success');
    assert.equal(list.count, 1);
    assert.equal(list.players[0].path, 'MusicPlayer');
    assert.equal(validation.status, 'success');
    assert.equal(validation.valid, true);
    assert.deepEqual(calls.map((call) => call.operation), [
      'audio_player_list',
      'audio_player_validate_routes',
    ]);
    assert.equal(calls[0].params.include_routes, true);
    assert.deepEqual(calls[1].params.allowed_buses, ['Master', 'Music']);
    assert.equal(calls[1].params.require_stream, true);
  });
});
