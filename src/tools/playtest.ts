/**
 * Automated Playtesting Tools (Tier 4 — Phase A)
 *
 * Playtest recording, automated bots, session analysis, heatmaps, and comparison.
 *
 * Tools:
 *   - run_automated_playtest    (TS+GD)  Run game with bot + recorder
 *   - start_playtest_recording  (TS+GD)  Start manual playtest recording
 *   - stop_playtest_recording   (TS)     Stop recording and collect data
 *   - analyze_playtest_session  (TS)     Analyze session data
 *   - generate_heatmap          (TS)     Generate heatmap from sessions
 *   - compare_sessions          (TS)     Compare metrics across sessions
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn, ChildProcess } from 'child_process';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, optionalString, optionalNumber, optionalEnum, optionalRange } from '../utils/validation.js';
import {
  PlaytestSession, PlaytestEvent,
  PLAYTEST_OUTPUT_DIR, RECORDER_SCRIPT_NAME, BOT_SCRIPT_NAME,
  RECORDER_AUTOLOAD_NAME, BOT_AUTOLOAD_NAME,
  ensurePlaytestDir, generateSessionId, readSession, readSessions, listSessionIds,
  distance, stats, round,
} from '../utils/playtest-session.js';
import { generateRecorderScript, RecorderConfig } from '../utils/playtest-recorder-gen.js';
import { generateBotScript, BotType } from '../utils/playtest-bot-gen.js';
import { computeHeatmap, generateHeatmapHtml, HeatmapType } from '../utils/heatmap-generator.js';

export function registerPlaytestTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    runAutomatedPlaytest(ctx),
    startPlaytestRecording(ctx),
    stopPlaytestRecording(ctx),
    analyzePlaytestSession(ctx),
    generateHeatmap(ctx),
    compareSessions(ctx),
  ]);
}

// ─── Active Recording State ────────────────────────────────────────────────

interface ActiveRecording {
  sessionId: string;
  projectPath: string;
  process: ChildProcess;
  startTime: number;
}

const activeRecordings = new Map<string, ActiveRecording>();

// ─── Autoload Injection/Cleanup ────────────────────────────────────────────

function injectAutoload(projectDir: string, name: string, scriptName: string): void {
  const projectGodotPath = join(projectDir, 'project.godot');
  let content = readFileSync(projectGodotPath, 'utf-8');
  const entry = `${name}="*res://${scriptName}"`;

  if (content.includes(entry)) return;

  if (content.includes('[autoload]')) {
    content = content.replace('[autoload]', `[autoload]\n${entry}`);
  } else {
    content += `\n[autoload]\n${entry}\n`;
  }
  writeFileSync(projectGodotPath, content, 'utf-8');
}

function removeAutoload(projectDir: string, name: string, scriptName: string): void {
  const projectGodotPath = join(projectDir, 'project.godot');
  if (!existsSync(projectGodotPath)) return;

  let content = readFileSync(projectGodotPath, 'utf-8');
  const entry = `${name}="*res://${scriptName}"`;
  content = content.replace(entry + '\n', '');
  content = content.replace(entry, '');
  content = content.replace(/\n\[autoload\]\n\s*\n/g, '\n');
  writeFileSync(projectGodotPath, content, 'utf-8');
}

function cleanup(projectDir: string, includeBot: boolean): void {
  try {
    const recorderPath = join(projectDir, RECORDER_SCRIPT_NAME);
    if (existsSync(recorderPath)) unlinkSync(recorderPath);
    removeAutoload(projectDir, RECORDER_AUTOLOAD_NAME, RECORDER_SCRIPT_NAME);

    if (includeBot) {
      const botPath = join(projectDir, BOT_SCRIPT_NAME);
      if (existsSync(botPath)) unlinkSync(botPath);
      removeAutoload(projectDir, BOT_AUTOLOAD_NAME, BOT_SCRIPT_NAME);
    }
  } catch {
    // Best-effort cleanup
  }
}

// ─── Tool 1: run_automated_playtest ────────────────────────────────────────

function runAutomatedPlaytest(ctx: ServerContext): ToolDefinition {
  return {
    name: 'run_automated_playtest',
    description: 'Run a Godot project with an automated input bot and playtest recorder. Collects player position, events, performance data, and optionally input events. Returns a session ID for analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        duration_seconds: { type: 'number', description: 'How long to run the playtest (default: 60, max: 600)' },
        bot_type: { type: 'string', enum: ['random', 'waypoint', 'idle', 'stress'], description: 'Bot behavior type (default: random)' },
        scene: { type: 'string', description: 'Specific scene to run (default: main scene)' },
        player_node_path: { type: 'string', description: 'Path to player node (e.g. "/root/Level/Player"). Auto-detects if omitted.' },
        sample_interval_ms: { type: 'number', description: 'Milliseconds between samples (default: 100)' },
        record_inputs: { type: 'boolean', description: 'Whether to record input events (default: true)' },
        event_hooks: { type: 'object', description: 'Map of signal names to event categories (e.g. {"died": "death"})' },
        session_name: { type: 'string', description: 'Optional label for this session' },
      },
      required: ['project_path'],
    },
    timeout: 660000, // 11 minutes max (600s playtest + 60s overhead)
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        optionalNumber('durationSeconds', 'duration_seconds'),
        optionalEnum('botType', ['random', 'waypoint', 'idle', 'stress'], 'bot_type'),
        optionalString('scene', 'scene'),
        optionalString('playerNodePath', 'player_node_path'),
        optionalNumber('sampleIntervalMs', 'sample_interval_ms'),
        optionalString('sessionName', 'session_name'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const duration = Math.min(Math.max((args.durationSeconds as number) || 60, 1), 600);
      const botType = (args.botType as BotType) || 'random';
      const scenePath = args.scene as string | undefined;
      const playerNodePath = args.playerNodePath as string | undefined;
      const sampleIntervalMs = (args.sampleIntervalMs as number) || 100;
      const recordInputs = args.recordInputs !== false;
      const eventHooks = args.eventHooks as Record<string, string> | undefined;
      const sessionName = args.sessionName as string | undefined;

      const sessionId = generateSessionId();
      ensurePlaytestDir(projectDir);

      // Generate recorder script
      const recorderConfig: RecorderConfig = {
        outputPath: `res://${PLAYTEST_OUTPUT_DIR}/${sessionId}.json`,
        sessionId,
        sampleIntervalMs,
        duration,
        playerNodePath,
        recordInputs,
        eventHooks,
        sessionName,
        scenePath,
      };

      const recorderScript = generateRecorderScript(recorderConfig);
      writeFileSync(join(projectDir, RECORDER_SCRIPT_NAME), recorderScript, 'utf-8');

      // Generate bot script
      const botScript = generateBotScript({ botType });
      writeFileSync(join(projectDir, BOT_SCRIPT_NAME), botScript, 'utf-8');

      // Inject autoloads (recorder first, then bot)
      injectAutoload(projectDir, RECORDER_AUTOLOAD_NAME, RECORDER_SCRIPT_NAME);
      injectAutoload(projectDir, BOT_AUTOLOAD_NAME, BOT_SCRIPT_NAME);

      // Run the game
      let godotPath: string;
      try {
        godotPath = await ctx.getGodotPath();
      } catch {
        cleanup(projectDir, true);
        return ctx.createErrorResponse('Could not detect Godot executable path');
      }

      const cmdArgs = ['--path', projectDir];
      if (scenePath) {
        cmdArgs.push(scenePath);
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(godotPath, cmdArgs, { cwd: projectDir });
          let stderr = '';

          proc.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          const timeout = setTimeout(() => {
            proc.kill();
            resolve();
          }, (duration + 30) * 1000);

          proc.on('close', () => {
            clearTimeout(timeout);
            resolve();
          });

          proc.on('error', (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      } catch (err: any) {
        cleanup(projectDir, true);
        return ctx.createErrorResponse(`Failed to run Godot: ${err.message}`);
      }

      // Cleanup autoloads and scripts
      cleanup(projectDir, true);

      // Read session data
      const outputFile = join(projectDir, PLAYTEST_OUTPUT_DIR, `${sessionId}.json`);
      if (!existsSync(outputFile)) {
        return ctx.createErrorResponse(
          'Playtest session data was not generated',
          [
            'The game may have crashed before the recorder could write results',
            'Check if the game runs successfully without the recorder',
            'Try a shorter duration or the idle bot',
          ]
        );
      }

      let session: PlaytestSession;
      try {
        session = JSON.parse(readFileSync(outputFile, 'utf-8'));
        // Patch bot_type into session data
        session.bot_type = botType;
        writeFileSync(outputFile, JSON.stringify(session, null, 2), 'utf-8');
      } catch (err: any) {
        return ctx.createErrorResponse(`Failed to read session data: ${err.message}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            session_id: sessionId,
            bot_type: botType,
            duration_seconds: session.duration_seconds,
            player_detected: session.player_node_path !== 'none',
            is_3d: session.is_3d,
            sample_count: session.samples.length,
            event_count: session.events.length,
            input_count: session.inputs.length,
            summary: session.summary,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 2: start_playtest_recording ──────────────────────────────────────

function startPlaytestRecording(ctx: ServerContext): ToolDefinition {
  return {
    name: 'start_playtest_recording',
    description: 'Start recording a manual playtest session. Injects a recorder autoload into the project and runs the game. The user plays manually while the recorder captures position, events, and performance. Use stop_playtest_recording to end the session.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene: { type: 'string', description: 'Specific scene to run (default: main scene)' },
        player_node_path: { type: 'string', description: 'Path to player node. Auto-detects if omitted.' },
        sample_interval_ms: { type: 'number', description: 'Milliseconds between samples (default: 100)' },
        record_inputs: { type: 'boolean', description: 'Whether to record input events (default: true)' },
        event_hooks: { type: 'object', description: 'Map of signal names to event categories' },
        session_name: { type: 'string', description: 'Optional label for this session' },
      },
      required: ['project_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        optionalString('scene', 'scene'),
        optionalString('playerNodePath', 'player_node_path'),
        optionalNumber('sampleIntervalMs', 'sample_interval_ms'),
        optionalString('sessionName', 'session_name'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const scenePath = args.scene as string | undefined;
      const playerNodePath = args.playerNodePath as string | undefined;
      const sampleIntervalMs = (args.sampleIntervalMs as number) || 100;
      const recordInputs = args.recordInputs !== false;
      const eventHooks = args.eventHooks as Record<string, string> | undefined;
      const sessionName = args.sessionName as string | undefined;

      const sessionId = generateSessionId();
      ensurePlaytestDir(projectDir);

      // Generate recorder script (duration=0 for unlimited)
      const recorderConfig: RecorderConfig = {
        outputPath: `res://${PLAYTEST_OUTPUT_DIR}/${sessionId}.json`,
        sessionId,
        sampleIntervalMs,
        duration: 0,
        playerNodePath,
        recordInputs,
        eventHooks,
        sessionName,
        scenePath,
      };

      const recorderScript = generateRecorderScript(recorderConfig);
      writeFileSync(join(projectDir, RECORDER_SCRIPT_NAME), recorderScript, 'utf-8');
      injectAutoload(projectDir, RECORDER_AUTOLOAD_NAME, RECORDER_SCRIPT_NAME);

      // Run the game non-blocking
      let godotPath: string;
      try {
        godotPath = await ctx.getGodotPath();
      } catch {
        cleanup(projectDir, false);
        return ctx.createErrorResponse('Could not detect Godot executable path');
      }

      const cmdArgs = ['--path', projectDir];
      if (scenePath) {
        cmdArgs.push(scenePath);
      }

      const proc = spawn(godotPath, cmdArgs, {
        cwd: projectDir,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      activeRecordings.set(sessionId, {
        sessionId,
        projectPath: projectDir,
        process: proc,
        startTime: Date.now(),
      });

      // Auto-cleanup on process exit
      proc.on('close', () => {
        activeRecordings.delete(sessionId);
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            session_id: sessionId,
            status: 'recording',
            message: 'Playtest recording started. Play the game normally. Use stop_playtest_recording to end the session.',
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 3: stop_playtest_recording ───────────────────────────────────────

function stopPlaytestRecording(ctx: ServerContext): ToolDefinition {
  return {
    name: 'stop_playtest_recording',
    description: 'Stop a running playtest recording session. Terminates the Godot process, collects the session data, and cleans up injected autoloads.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        session_id: { type: 'string', description: 'Session ID from start_playtest_recording' },
      },
      required: ['project_path', 'session_id'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const sessionId = args.sessionId as string;

      // Find and stop the recording
      const recording = activeRecordings.get(sessionId);
      if (recording) {
        try {
          recording.process.kill();
        } catch {
          // Process may have already exited
        }
        activeRecordings.delete(sessionId);

        // Give the process a moment to write its output
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Cleanup
      cleanup(projectDir, false);

      // Read session data
      const outputFile = join(projectDir, PLAYTEST_OUTPUT_DIR, `${sessionId}.json`);
      if (!existsSync(outputFile)) {
        return ctx.createErrorResponse(
          'Session data was not generated',
          [
            'The game may not have been running or may have crashed',
            'The session may not have had time to write data',
            'Check if the session_id is correct',
          ]
        );
      }

      let session: PlaytestSession;
      try {
        session = JSON.parse(readFileSync(outputFile, 'utf-8'));
      } catch (err: any) {
        return ctx.createErrorResponse(`Failed to read session data: ${err.message}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            session_id: sessionId,
            status: 'completed',
            duration_seconds: session.duration_seconds,
            sample_count: session.samples.length,
            event_count: session.events.length,
            input_count: session.inputs.length,
            summary: session.summary,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 4: analyze_playtest_session ──────────────────────────────────────

function analyzePlaytestSession(ctx: ServerContext): ToolDefinition {
  return {
    name: 'analyze_playtest_session',
    description: 'Analyze a recorded playtest session for patterns. Identifies death clusters, backtracking, difficulty spikes, time distribution, and event frequency. Returns structured analysis with recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        session_id: { type: 'string', description: 'Session ID to analyze (default: most recent)' },
        analysis_types: {
          type: 'array',
          items: { type: 'string', enum: ['death_locations', 'backtracking', 'difficulty_spikes', 'time_distribution', 'event_frequency', 'movement_patterns'] },
          description: 'Types of analysis to perform (default: all)',
        },
      },
      required: ['project_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const sessionId = args.sessionId as string | undefined;

      // Load session
      let session: PlaytestSession | null;
      if (sessionId) {
        session = readSession(projectDir, sessionId);
      } else {
        const ids = listSessionIds(projectDir);
        if (ids.length === 0) {
          return ctx.createErrorResponse('No playtest sessions found', ['Run run_automated_playtest or start_playtest_recording first']);
        }
        session = readSession(projectDir, ids[0]);
      }

      if (!session) {
        return ctx.createErrorResponse(`Session not found: ${sessionId || 'latest'}`);
      }

      const analysisTypes = (args.analysisTypes as string[]) || [
        'death_locations', 'backtracking', 'difficulty_spikes', 'time_distribution', 'event_frequency', 'movement_patterns',
      ];

      const analysis: Record<string, any> = {
        session_id: session.session_id,
        duration_seconds: session.duration_seconds,
        sample_count: session.samples.length,
        event_count: session.events.length,
      };

      if (analysisTypes.includes('death_locations')) {
        analysis.death_locations = analyzeDeathLocations(session);
      }
      if (analysisTypes.includes('backtracking')) {
        analysis.backtracking = analyzeBacktracking(session);
      }
      if (analysisTypes.includes('difficulty_spikes')) {
        analysis.difficulty_spikes = analyzeDifficultySpikes(session);
      }
      if (analysisTypes.includes('time_distribution')) {
        analysis.time_distribution = analyzeTimeDistribution(session);
      }
      if (analysisTypes.includes('event_frequency')) {
        analysis.event_frequency = analyzeEventFrequency(session);
      }
      if (analysisTypes.includes('movement_patterns')) {
        analysis.movement_patterns = analyzeMovementPatterns(session);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 5: generate_heatmap ──────────────────────────────────────────────

function generateHeatmap(ctx: ServerContext): ToolDefinition {
  return {
    name: 'generate_heatmap',
    description: 'Generate a heatmap from playtest session data. Returns structured grid data (JSON) and optionally saves an HTML visualization. Types: position (where player spent time), death, damage, pickup, time_spent.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        session_ids: { type: 'array', items: { type: 'string' }, description: 'Session IDs to include (default: all)' },
        heatmap_type: { type: 'string', enum: ['position', 'death', 'damage', 'pickup', 'time_spent'], description: 'Type of heatmap (default: position)' },
        cell_size: { type: 'number', description: 'Grid cell size in game units (default: 64)' },
        save_html: { type: 'boolean', description: 'Save an HTML visualization file (default: true)' },
      },
      required: ['project_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        optionalEnum('heatmapType', ['position', 'death', 'damage', 'pickup', 'time_spent'], 'heatmap_type'),
        optionalNumber('cellSize', 'cell_size'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const sessionIds = args.sessionIds as string[] | undefined;
      const heatmapType = (args.heatmapType as HeatmapType) || 'position';
      const cellSize = (args.cellSize as number) || 64;
      const saveHtml = args.saveHtml !== false;

      const sessions = readSessions(projectDir, sessionIds);
      if (sessions.length === 0) {
        return ctx.createErrorResponse('No playtest sessions found', ['Run run_automated_playtest first']);
      }

      const heatmapData = computeHeatmap({
        type: heatmapType,
        sessions,
        cellSize,
      });

      // Optionally save HTML
      let htmlPath: string | undefined;
      if (saveHtml && heatmapData.cells.length > 0) {
        const html = generateHeatmapHtml(heatmapData);
        const outputDir = ensurePlaytestDir(projectDir);
        htmlPath = join(outputDir, `heatmap_${heatmapType}_${Date.now()}.html`);
        writeFileSync(htmlPath, html, 'utf-8');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...heatmapData,
            html_file: htmlPath || null,
            // Truncate cells to top 100 for response size
            cells: heatmapData.cells.slice(0, 100),
            total_cells: heatmapData.cells.length,
            cells_truncated: heatmapData.cells.length > 100,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 6: compare_sessions ──────────────────────────────────────────────

function compareSessions(ctx: ServerContext): ToolDefinition {
  return {
    name: 'compare_sessions',
    description: 'Compare metrics across multiple playtest sessions. Returns per-session breakdown, aggregates (min/max/avg), and trend detection for duration, deaths, damage, distance, FPS, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        session_ids: { type: 'array', items: { type: 'string' }, description: 'Session IDs to compare (default: all)' },
        metrics: {
          type: 'array',
          items: { type: 'string', enum: ['duration', 'deaths', 'damage', 'distance', 'events', 'fps', 'areas_visited', 'inputs'] },
          description: 'Metrics to compare (default: all)',
        },
        group_by: { type: 'string', enum: ['bot_type', 'session_name', 'scene'], description: 'Group sessions by this field' },
      },
      required: ['project_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        optionalEnum('groupBy', ['bot_type', 'session_name', 'scene'], 'group_by'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const sessionIds = args.sessionIds as string[] | undefined;
      const groupBy = args.groupBy as string | undefined;

      const sessions = readSessions(projectDir, sessionIds);
      if (sessions.length === 0) {
        return ctx.createErrorResponse('No playtest sessions found');
      }

      const metrics = (args.metrics as string[]) || [
        'duration', 'deaths', 'damage', 'distance', 'events', 'fps', 'areas_visited', 'inputs',
      ];

      // Per-session metrics
      const perSession = sessions.map(s => {
        const m: Record<string, any> = {
          session_id: s.session_id,
          session_name: s.session_name || null,
          bot_type: s.bot_type || null,
          scene: s.scene || null,
        };

        if (metrics.includes('duration')) m.duration = s.duration_seconds;
        if (metrics.includes('deaths')) m.deaths = s.summary.total_deaths;
        if (metrics.includes('damage')) m.damage = s.summary.total_damage_taken;
        if (metrics.includes('distance')) m.distance = round(s.summary.distance_traveled, 1);
        if (metrics.includes('events')) m.total_events = s.events.length;
        if (metrics.includes('fps')) {
          m.avg_fps = s.summary.avg_fps;
          m.min_fps = s.summary.min_fps;
        }
        if (metrics.includes('areas_visited')) m.areas_visited = s.summary.areas_visited;
        if (metrics.includes('inputs')) m.total_inputs = s.summary.total_inputs;

        return m;
      });

      // Aggregate statistics
      const aggregates: Record<string, any> = {};
      const numericKeys = ['duration', 'deaths', 'damage', 'distance', 'total_events', 'avg_fps', 'min_fps', 'areas_visited', 'total_inputs'];
      for (const key of numericKeys) {
        const values = perSession.map(s => s[key]).filter((v: any) => typeof v === 'number');
        if (values.length > 0) {
          const s = stats(values);
          aggregates[key] = {
            avg: round(s.avg, 1),
            min: round(s.min, 1),
            max: round(s.max, 1),
            stddev: round(s.stddev, 2),
          };
        }
      }

      // Trend detection (chronological order)
      const trends: Record<string, string> = {};
      if (sessions.length >= 3) {
        for (const key of ['deaths', 'duration', 'avg_fps', 'distance']) {
          const values = perSession.map(s => s[key]).filter((v: any) => typeof v === 'number');
          if (values.length >= 3) {
            const trend = detectTrend(values);
            if (trend !== 'stable') {
              trends[key] = trend;
            }
          }
        }
      }

      // Grouping
      let groups: Record<string, any> | undefined;
      if (groupBy) {
        groups = {};
        for (const s of perSession) {
          const groupKey = String(s[groupBy] || 'unknown');
          if (!groups[groupKey]) groups[groupKey] = [];
          groups[groupKey].push(s);
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_count: sessions.length,
            per_session: perSession,
            aggregates,
            trends: Object.keys(trends).length > 0 ? trends : undefined,
            groups: groups || undefined,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Analysis Helpers ──────────────────────────────────────────────────────

function analyzeDeathLocations(session: PlaytestSession): any {
  const deaths = session.events.filter(e => e.type === 'death' && e.pos);
  if (deaths.length === 0) {
    return { total_deaths: 0, clusters: [], message: 'No deaths recorded' };
  }

  // Cluster deaths by proximity (within 100 units)
  const clusters: Array<{ center: number[]; count: number; deaths: PlaytestEvent[] }> = [];
  const clusterRadius = 100;
  const used = new Set<number>();

  for (let i = 0; i < deaths.length; i++) {
    if (used.has(i)) continue;
    const cluster = { center: deaths[i].pos!, count: 1, deaths: [deaths[i]] };
    used.add(i);

    for (let j = i + 1; j < deaths.length; j++) {
      if (used.has(j)) continue;
      if (distance(deaths[i].pos!, deaths[j].pos!) < clusterRadius) {
        cluster.deaths.push(deaths[j]);
        cluster.count++;
        used.add(j);
      }
    }

    // Recompute center
    if (cluster.count > 1) {
      const dims = cluster.deaths[0].pos!.length;
      cluster.center = Array(dims).fill(0);
      for (const d of cluster.deaths) {
        for (let k = 0; k < dims; k++) {
          cluster.center[k] += d.pos![k];
        }
      }
      cluster.center = cluster.center.map(v => round(v / cluster.count, 1));
    }

    clusters.push(cluster);
  }

  clusters.sort((a, b) => b.count - a.count);

  return {
    total_deaths: deaths.length,
    cluster_count: clusters.length,
    clusters: clusters.map(c => ({
      center: c.center,
      death_count: c.count,
      severity: c.count >= 5 ? 'critical' : c.count >= 3 ? 'high' : c.count >= 2 ? 'moderate' : 'low',
      times: c.deaths.map(d => round(d.t, 1)),
    })),
    recommendation: clusters.some(c => c.count >= 3)
      ? 'Multiple death clusters detected — consider adjusting difficulty in these areas'
      : 'Death distribution is spread out — no major chokepoints',
  };
}

function analyzeBacktracking(session: PlaytestSession): any {
  const samples = session.samples.filter(s => s.pos && s.pos.length >= 2);
  if (samples.length < 10) {
    return { backtracking_ratio: 0, message: 'Insufficient samples for backtracking analysis' };
  }

  // Detect revisits: check if player returns to within 50 units of a previous position
  const revisitRadius = 50;
  const windowSize = 20; // Look back 20 samples to avoid counting adjacent samples
  let revisitCount = 0;

  for (let i = windowSize; i < samples.length; i++) {
    for (let j = 0; j < i - windowSize; j++) {
      if (distance(samples[i].pos, samples[j].pos) < revisitRadius) {
        revisitCount++;
        break;
      }
    }
  }

  const backtrackingRatio = round(revisitCount / (samples.length - windowSize), 3);

  return {
    backtracking_ratio: backtrackingRatio,
    revisit_count: revisitCount,
    total_samples: samples.length,
    assessment: backtrackingRatio > 0.5 ? 'heavy_backtracking'
      : backtrackingRatio > 0.2 ? 'moderate_backtracking'
      : 'minimal_backtracking',
    recommendation: backtrackingRatio > 0.3
      ? 'High backtracking suggests the player may be lost or confused — consider adding visual guidance or waypoints'
      : 'Backtracking levels are normal',
  };
}

function analyzeDifficultySpikes(session: PlaytestSession, windowSeconds: number = 30): any {
  if (session.events.length === 0) {
    return { windows: [], spikes: [], message: 'No events to analyze' };
  }

  const duration = session.duration_seconds;
  const windowCount = Math.ceil(duration / windowSeconds);
  const windows: Array<{ time_start: number; time_end: number; difficulty_score: number; deaths: number; damage_events: number }> = [];

  for (let i = 0; i < windowCount; i++) {
    const tStart = i * windowSeconds;
    const tEnd = Math.min((i + 1) * windowSeconds, duration);

    const windowEvents = session.events.filter(e => e.t >= tStart && e.t < tEnd);
    const deaths = windowEvents.filter(e => e.type === 'death').length;
    const damageEvents = windowEvents.filter(e => e.type === 'damage').length;
    const score = deaths * 10 + damageEvents * 2;

    windows.push({
      time_start: round(tStart, 1),
      time_end: round(tEnd, 1),
      difficulty_score: score,
      deaths,
      damage_events: damageEvents,
    });
  }

  // Detect spikes (>2x previous window)
  const spikes: Array<{ time_start: number; score: number; previous_score: number; multiplier: number }> = [];
  for (let i = 1; i < windows.length; i++) {
    if (windows[i - 1].difficulty_score > 0 && windows[i].difficulty_score > windows[i - 1].difficulty_score * 2) {
      spikes.push({
        time_start: windows[i].time_start,
        score: windows[i].difficulty_score,
        previous_score: windows[i - 1].difficulty_score,
        multiplier: round(windows[i].difficulty_score / windows[i - 1].difficulty_score, 1),
      });
    }
  }

  // Classify curve shape
  const scores = windows.map(w => w.difficulty_score);
  const curveShape = classifyCurveShape(scores);

  return {
    window_seconds: windowSeconds,
    windows,
    spikes,
    spike_count: spikes.length,
    curve_shape: curveShape,
    recommendation: spikes.length > 2
      ? 'Multiple difficulty spikes detected — consider smoothing the difficulty curve'
      : 'Difficulty progression looks reasonable',
  };
}

function analyzeTimeDistribution(session: PlaytestSession): any {
  const samples = session.samples.filter(s => s.pos && s.pos.length >= 2);
  if (samples.length < 5) {
    return { message: 'Insufficient samples' };
  }

  // Grid-based time accumulation
  const cellSize = 100;
  const cells = new Map<string, { x: number; y: number; time: number; visits: number }>();

  for (let i = 0; i < samples.length; i++) {
    const cx = Math.floor(samples[i].pos[0] / cellSize);
    const cy = Math.floor(samples[i].pos[1] / cellSize);
    const key = `${cx},${cy}`;

    const dt = i < samples.length - 1 ? samples[i + 1].t - samples[i].t : 0.1;

    if (!cells.has(key)) {
      cells.set(key, {
        x: (cx + 0.5) * cellSize,
        y: (cy + 0.5) * cellSize,
        time: 0,
        visits: 0,
      });
    }
    const cell = cells.get(key)!;
    cell.time += dt;
    cell.visits++;
  }

  // Sort by time spent
  const sorted = Array.from(cells.values()).sort((a, b) => b.time - a.time);
  const topAreas = sorted.slice(0, 10).map(c => ({
    position: [round(c.x, 1), round(c.y, 1)],
    time_spent: round(c.time, 1),
    visits: c.visits,
    percentage: round((c.time / session.duration_seconds) * 100, 1),
  }));

  return {
    total_areas: cells.size,
    top_areas: topAreas,
    time_concentration: round(
      sorted.slice(0, 3).reduce((s, c) => s + c.time, 0) / session.duration_seconds * 100, 1
    ),
    recommendation: topAreas[0] && topAreas[0].percentage > 40
      ? 'Player spent over 40% of time in one area — possible stuck point or central hub'
      : 'Time distribution across areas looks healthy',
  };
}

function analyzeEventFrequency(session: PlaytestSession): any {
  if (session.events.length === 0) {
    return { total_events: 0, by_type: {}, message: 'No events recorded' };
  }

  const byType: Record<string, { count: number; first: number; last: number; avg_interval: number }> = {};

  for (const event of session.events) {
    if (!byType[event.type]) {
      byType[event.type] = { count: 0, first: event.t, last: event.t, avg_interval: 0 };
    }
    byType[event.type].count++;
    byType[event.type].last = event.t;
  }

  // Calculate average intervals
  for (const type in byType) {
    const data = byType[type];
    if (data.count > 1) {
      data.avg_interval = round((data.last - data.first) / (data.count - 1), 1);
    }
    data.first = round(data.first, 1);
    data.last = round(data.last, 1);
  }

  // Events per minute
  const eventsPerMinute = session.duration_seconds > 0
    ? round(session.events.length / (session.duration_seconds / 60), 1)
    : 0;

  return {
    total_events: session.events.length,
    events_per_minute: eventsPerMinute,
    by_type: byType,
  };
}

function analyzeMovementPatterns(session: PlaytestSession): any {
  const samples = session.samples.filter(s => s.pos && s.pos.length >= 2);
  if (samples.length < 10) {
    return { message: 'Insufficient samples for movement analysis' };
  }

  // Calculate movement speeds
  const speeds: number[] = [];
  let totalDistance = 0;
  let idleFrames = 0;
  const idleThreshold = 1.0; // units

  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt <= 0) continue;
    const dist = distance(samples[i].pos, samples[i - 1].pos);
    totalDistance += dist;
    const speed = dist / dt;
    speeds.push(speed);
    if (dist < idleThreshold) idleFrames++;
  }

  const speedStats = stats(speeds);
  const idleRatio = round(idleFrames / Math.max(1, samples.length - 1), 3);

  return {
    total_distance: round(totalDistance, 1),
    avg_speed: round(speedStats.avg, 1),
    max_speed: round(speedStats.max, 1),
    speed_stddev: round(speedStats.stddev, 1),
    idle_ratio: idleRatio,
    idle_assessment: idleRatio > 0.5 ? 'mostly_idle'
      : idleRatio > 0.3 ? 'frequently_idle'
      : idleRatio > 0.1 ? 'occasionally_idle'
      : 'active',
    recommendation: idleRatio > 0.4
      ? 'High idle ratio suggests the player may be confused or stuck — consider adding movement incentives'
      : 'Movement patterns look normal',
  };
}

function classifyCurveShape(scores: number[]): string {
  if (scores.length < 3) return 'too_short';

  const nonZero = scores.filter(s => s > 0);
  if (nonZero.length === 0) return 'flat_zero';

  // Check if generally increasing
  let increasing = 0, decreasing = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[i - 1]) increasing++;
    else if (scores[i] < scores[i - 1]) decreasing++;
  }

  const total = increasing + decreasing;
  if (total === 0) return 'flat';
  if (increasing > total * 0.7) return 'gradually_increasing';
  if (decreasing > total * 0.7) return 'gradually_decreasing';
  if (increasing > 0 && decreasing > 0 && Math.abs(increasing - decreasing) < total * 0.3) return 'sawtooth';
  return 'variable';
}

function detectTrend(values: number[]): string {
  if (values.length < 3) return 'stable';

  // Simple linear regression
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgY = sumY / n;

  // Normalize slope by average value
  const normalizedSlope = avgY !== 0 ? slope / avgY : 0;

  if (normalizedSlope > 0.1) return 'increasing';
  if (normalizedSlope < -0.1) return 'decreasing';
  return 'stable';
}
