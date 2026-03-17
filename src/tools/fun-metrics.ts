/**
 * Fun Metrics Framework Tools (Tier 4 — Phase B)
 *
 * Game feel scoring, difficulty analysis, genre comparison,
 * frustration detection, and juice coverage analysis.
 *
 * Tools:
 *   - calculate_game_feel_metrics    (TS)  Score responsiveness, pacing, difficulty, engagement
 *   - analyze_difficulty_curve        (TS)  Time-windowed difficulty analysis
 *   - compare_to_genre_benchmarks    (TS)  Compare against genre standards
 *   - detect_frustration_points      (TS)  Identify frustration signals
 *   - analyze_juice_coverage         (TS)  Scan scripts for feedback/juice
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, optionalString, optionalEnum } from '../utils/validation.js';
import {
  readSession, readSessions, listSessionIds, round, stats,
  PlaytestSession,
} from '../utils/playtest-session.js';
import {
  calculateResponsiveness, calculatePacing, calculateDifficulty,
  calculateEngagement, detectFrustrationPoints, analyzeJuiceCoverage,
  GameFeelScore, FrustrationPoint,
} from '../utils/metrics-calculator.js';
import {
  getBenchmark, getAvailableGenres, compareToBenchmarkRange,
  GenreBenchmark,
} from '../utils/genre-benchmarks.js';

export function registerFunMetricsTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    calculateGameFeelMetrics(ctx),
    analyzeDifficultyCurve(ctx),
    compareToGenreBenchmarks(ctx),
    detectFrustrationPointsTool(ctx),
    analyzeJuiceCoverageTool(ctx),
  ]);
}

// ─── Tool 7: calculate_game_feel_metrics ───────────────────────────────────

function calculateGameFeelMetrics(ctx: ServerContext): ToolDefinition {
  return {
    name: 'calculate_game_feel_metrics',
    description: 'Calculate game feel scores (0-100) for responsiveness, pacing, difficulty, and engagement from playtest session data. Returns per-metric scores with explanations and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        session_ids: { type: 'array', items: { type: 'string' }, description: 'Session IDs to analyze (default: all)' },
        metrics: {
          type: 'array',
          items: { type: 'string', enum: ['responsiveness', 'pacing', 'difficulty', 'engagement'] },
          description: 'Metrics to compute (default: all)',
        },
      },
      required: ['project_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [projectPath('projectPath')], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const sessions = readSessions(projectDir, args.sessionIds);
      if (sessions.length === 0) {
        return ctx.createErrorResponse('No playtest sessions found', ['Run run_automated_playtest first']);
      }

      const requestedMetrics = (args.metrics as string[]) || ['responsiveness', 'pacing', 'difficulty', 'engagement'];
      const scores: GameFeelScore[] = [];

      if (requestedMetrics.includes('responsiveness')) {
        scores.push(calculateResponsiveness(sessions));
      }
      if (requestedMetrics.includes('pacing')) {
        scores.push(calculatePacing(sessions));
      }
      if (requestedMetrics.includes('difficulty')) {
        scores.push(calculateDifficulty(sessions));
      }
      if (requestedMetrics.includes('engagement')) {
        scores.push(calculateEngagement(sessions));
      }

      // Overall score
      const avgScore = scores.length > 0
        ? round(scores.reduce((s, m) => s + m.score, 0) / scores.length)
        : 0;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_count: sessions.length,
            overall_score: avgScore,
            overall_assessment: avgScore >= 85 ? 'excellent' : avgScore >= 70 ? 'good' : avgScore >= 50 ? 'average' : 'needs_improvement',
            metrics: scores,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 8: analyze_difficulty_curve ──────────────────────────────────────

function analyzeDifficultyCurve(ctx: ServerContext): ToolDefinition {
  return {
    name: 'analyze_difficulty_curve',
    description: 'Analyze the difficulty progression over time in a playtest session. Divides the session into time windows and computes difficulty scores based on deaths and damage. Detects spikes, valleys, and classifies the overall curve shape.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        session_id: { type: 'string', description: 'Session ID (default: most recent)' },
        window_seconds: { type: 'number', description: 'Time window size in seconds (default: 30)' },
        death_weight: { type: 'number', description: 'Weight for death events (default: 10)' },
        damage_weight: { type: 'number', description: 'Weight for damage events (default: 2)' },
      },
      required: ['project_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [projectPath('projectPath')], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const sessionId = args.sessionId as string | undefined;
      const windowSeconds = (args.windowSeconds as number) || 30;
      const deathWeight = (args.deathWeight as number) || 10;
      const damageWeight = (args.damageWeight as number) || 2;

      let session: PlaytestSession | null;
      if (sessionId) {
        session = readSession(projectDir, sessionId);
      } else {
        const ids = listSessionIds(projectDir);
        session = ids.length > 0 ? readSession(projectDir, ids[0]) : null;
      }

      if (!session) {
        return ctx.createErrorResponse('Session not found');
      }

      const duration = session.duration_seconds;
      const windowCount = Math.ceil(duration / windowSeconds);
      const windows: Array<{ time_start: number; time_end: number; difficulty_score: number; deaths: number; damage_events: number; damage_amount: number }> = [];

      for (let i = 0; i < windowCount; i++) {
        const tStart = i * windowSeconds;
        const tEnd = Math.min((i + 1) * windowSeconds, duration);
        const windowEvents = session.events.filter(e => e.t >= tStart && e.t < tEnd);

        const deaths = windowEvents.filter(e => e.type === 'death').length;
        const damageEvents = windowEvents.filter(e => e.type === 'damage');
        const damageAmount = damageEvents.reduce((s, e) => s + (e.details?.amount || 1), 0);
        const score = deaths * deathWeight + damageEvents.length * damageWeight;

        windows.push({
          time_start: round(tStart, 1),
          time_end: round(tEnd, 1),
          difficulty_score: score,
          deaths,
          damage_events: damageEvents.length,
          damage_amount: round(damageAmount, 1),
        });
      }

      // Detect spikes and valleys
      const spikes: Array<{ window_index: number; time_start: number; score: number; multiplier: number }> = [];
      const valleys: Array<{ window_index: number; time_start: number; duration_windows: number }> = [];

      for (let i = 1; i < windows.length; i++) {
        if (windows[i - 1].difficulty_score > 0 && windows[i].difficulty_score > windows[i - 1].difficulty_score * 2) {
          spikes.push({
            window_index: i,
            time_start: windows[i].time_start,
            score: windows[i].difficulty_score,
            multiplier: round(windows[i].difficulty_score / windows[i - 1].difficulty_score, 1),
          });
        }
      }

      // Find valleys (3+ consecutive zero-score windows)
      let zeroStart: number | null = null;
      for (let i = 0; i < windows.length; i++) {
        if (windows[i].difficulty_score === 0) {
          if (zeroStart === null) zeroStart = i;
        } else {
          if (zeroStart !== null && i - zeroStart >= 3) {
            valleys.push({
              window_index: zeroStart,
              time_start: windows[zeroStart].time_start,
              duration_windows: i - zeroStart,
            });
          }
          zeroStart = null;
        }
      }

      // Classify shape
      const scores = windows.map(w => w.difficulty_score);
      const shape = classifyCurve(scores);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_id: session.session_id,
            window_seconds: windowSeconds,
            total_windows: windows.length,
            windows,
            spikes,
            valleys,
            curve_shape: shape,
            assessment: spikes.length > 3
              ? 'Difficulty curve has many sharp spikes — consider smoothing'
              : valleys.length > 2
                ? 'Several long quiet periods — consider adding more encounters'
                : 'Difficulty curve looks balanced',
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 9: compare_to_genre_benchmarks ───────────────────────────────────

function compareToGenreBenchmarks(ctx: ServerContext): ToolDefinition {
  return {
    name: 'compare_to_genre_benchmarks',
    description: `Compare playtest session metrics against genre-specific benchmarks. Genres: ${getAvailableGenres().join(', ')}. Reports each metric as within/above/below expected range with a genre fit score.`,
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        genre: { type: 'string', enum: getAvailableGenres(), description: 'Target genre for comparison' },
        session_ids: { type: 'array', items: { type: 'string' }, description: 'Session IDs (default: all)' },
      },
      required: ['project_path', 'genre'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [projectPath('projectPath')], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const genre = args.genre as string;
      const benchmark = getBenchmark(genre);

      if (!benchmark) {
        return ctx.createErrorResponse(
          `Unknown genre: ${genre}`,
          [`Available genres: ${getAvailableGenres().join(', ')}`]
        );
      }

      const sessions = readSessions(projectDir, args.sessionIds);
      if (sessions.length === 0) {
        return ctx.createErrorResponse('No playtest sessions found');
      }

      // Calculate session metrics
      const durations = sessions.map(s => s.duration_seconds);
      const deathRates = sessions.map(s => s.duration_seconds > 0 ? s.summary.total_deaths / (s.duration_seconds / 60) : 0);
      const damageRates = sessions.map(s => {
        const dmgEvents = s.events.filter(e => e.type === 'damage').length;
        return s.duration_seconds > 0 ? dmgEvents / (s.duration_seconds / 60) : 0;
      });
      const fpsValues = sessions.map(s => s.summary.avg_fps);
      const idleRatios = sessions.map(s => {
        const samples = s.samples.filter(x => x.pos && x.pos.length >= 2);
        if (samples.length < 10) return 0.1;
        let idle = 0;
        for (let i = 1; i < samples.length; i++) {
          if (distance(samples[i].pos, samples[i - 1].pos) < 2) idle++;
        }
        return idle / (samples.length - 1);
      });

      const comparisons: Array<{ metric: string; value: number; range: string; assessment: string }> = [];
      let withinCount = 0;
      const totalMetrics = 5;

      // Deaths per minute
      const avgDeathRate = round(stats(deathRates).avg, 2);
      const deathAssessment = compareToBenchmarkRange(avgDeathRate, benchmark.deaths_per_minute);
      comparisons.push({ metric: 'deaths_per_minute', value: avgDeathRate, range: `${benchmark.deaths_per_minute.low}-${benchmark.deaths_per_minute.high}`, assessment: deathAssessment });
      if (deathAssessment === 'within_range' || deathAssessment === 'low_end' || deathAssessment === 'high_end') withinCount++;

      // Session duration
      const avgDuration = round(stats(durations).avg, 0);
      const durationAssessment = compareToBenchmarkRange(avgDuration, benchmark.session_duration);
      comparisons.push({ metric: 'session_duration', value: avgDuration, range: `${benchmark.session_duration.low}-${benchmark.session_duration.high}s`, assessment: durationAssessment });
      if (durationAssessment === 'within_range' || durationAssessment === 'low_end' || durationAssessment === 'high_end') withinCount++;

      // Damage per minute
      const avgDamageRate = round(stats(damageRates).avg, 1);
      const damageAssessment = compareToBenchmarkRange(avgDamageRate, benchmark.damage_per_minute);
      comparisons.push({ metric: 'damage_per_minute', value: avgDamageRate, range: `${benchmark.damage_per_minute.low}-${benchmark.damage_per_minute.high}`, assessment: damageAssessment });
      if (damageAssessment === 'within_range' || damageAssessment === 'low_end' || damageAssessment === 'high_end') withinCount++;

      // FPS vs target
      const avgFps = round(stats(fpsValues).avg, 1);
      const fpsAssessment = avgFps >= benchmark.target_fps ? 'meets_target' : avgFps >= benchmark.target_fps * 0.8 ? 'close_to_target' : 'below_target';
      comparisons.push({ metric: 'avg_fps', value: avgFps, range: `>= ${benchmark.target_fps}`, assessment: fpsAssessment });
      if (fpsAssessment === 'meets_target' || fpsAssessment === 'close_to_target') withinCount++;

      // Idle ratio
      const avgIdleRatio = round(stats(idleRatios).avg, 3);
      const idleAssessment = compareToBenchmarkRange(avgIdleRatio, benchmark.idle_ratio);
      comparisons.push({ metric: 'idle_ratio', value: avgIdleRatio, range: `${benchmark.idle_ratio.low}-${benchmark.idle_ratio.high}`, assessment: idleAssessment });
      if (idleAssessment === 'within_range' || idleAssessment === 'low_end' || idleAssessment === 'high_end') withinCount++;

      const fitScore = round((withinCount / totalMetrics) * 100);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            genre: benchmark.label,
            genre_notes: benchmark.notes,
            session_count: sessions.length,
            genre_fit_score: fitScore,
            genre_fit_assessment: fitScore >= 80 ? 'excellent_fit' : fitScore >= 60 ? 'good_fit' : fitScore >= 40 ? 'partial_fit' : 'poor_fit',
            comparisons,
            recommendations: comparisons
              .filter(c => c.assessment === 'above_range' || c.assessment === 'below_range')
              .map(c => `${c.metric}: ${c.value} is ${c.assessment} for ${benchmark.label} (expected ${c.range})`),
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 10: detect_frustration_points ────────────────────────────────────

function detectFrustrationPointsTool(ctx: ServerContext): ToolDefinition {
  return {
    name: 'detect_frustration_points',
    description: 'Identify likely player frustration points in a playtest session. Detects: repeated deaths in same area, long idle periods (confusion), rapid input spam (button mashing), and backtracking loops. Each point includes location, evidence, severity, and suggested fix.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        session_id: { type: 'string', description: 'Session ID (default: most recent)' },
        sensitivity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Detection sensitivity (default: medium)' },
      },
      required: ['project_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [projectPath('projectPath')], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const sessionId = args.sessionId as string | undefined;
      const sensitivity = (args.sensitivity as 'low' | 'medium' | 'high') || 'medium';

      let session: PlaytestSession | null;
      if (sessionId) {
        session = readSession(projectDir, sessionId);
      } else {
        const ids = listSessionIds(projectDir);
        session = ids.length > 0 ? readSession(projectDir, ids[0]) : null;
      }

      if (!session) {
        return ctx.createErrorResponse('Session not found');
      }

      const points = detectFrustrationPoints(session, sensitivity);

      const highCount = points.filter(p => p.severity === 'high').length;
      const mediumCount = points.filter(p => p.severity === 'medium').length;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_id: session.session_id,
            sensitivity,
            total_frustration_points: points.length,
            by_severity: { high: highCount, medium: mediumCount, low: points.length - highCount - mediumCount },
            by_type: Object.fromEntries(
              [...new Set(points.map(p => p.type))].map(t => [t, points.filter(p => p.type === t).length])
            ),
            points,
            overall_assessment: highCount >= 3 ? 'high_frustration'
              : highCount >= 1 || mediumCount >= 3 ? 'moderate_frustration'
              : points.length > 0 ? 'mild_frustration'
              : 'no_frustration_detected',
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Tool 11: analyze_juice_coverage ───────────────────────────────────────

function analyzeJuiceCoverageTool(ctx: ServerContext): ToolDefinition {
  return {
    name: 'analyze_juice_coverage',
    description: 'Analyze GDScript files for "juice" — visual/audio feedback on player actions. Scans for action functions (attack, jump, dash, etc.) and checks if they include audio, particles, animation, tween, or screen effects. Reports coverage percentage and identifies unjuiced actions.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scan_dirs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Directories to scan (default: ["scripts", "src", "."])',
        },
      },
      required: ['project_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);
      const v = validateParams(args, [projectPath('projectPath')], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const scanDirs = (args.scanDirs as string[]) || ['scripts', 'src', '.'];

      // Collect all .gd files
      const scripts: Array<{ path: string; content: string }> = [];

      function scanDir(dir: string): void {
        if (!existsSync(dir)) return;
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              if (entry.name.startsWith('.') || entry.name === 'addons' || entry.name === '.mcp_playtest' || entry.name === '.mcp_profiling') continue;
              scanDir(fullPath);
            } else if (entry.name.endsWith('.gd')) {
              try {
                scripts.push({
                  path: relative(projectDir, fullPath),
                  content: readFileSync(fullPath, 'utf-8'),
                });
              } catch {
                // Skip unreadable files
              }
            }
          }
        } catch {
          // Skip inaccessible directories
        }
      }

      for (const dir of scanDirs) {
        scanDir(join(projectDir, dir));
      }

      if (scripts.length === 0) {
        return ctx.createErrorResponse('No GDScript files found in the project');
      }

      const result = analyzeJuiceCoverage(scripts);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            scripts_scanned: scripts.length,
            ...result,
            overall_assessment: result.coverage_percentage >= 80 ? 'well_juiced'
              : result.coverage_percentage >= 50 ? 'partially_juiced'
              : result.actions_found === 0 ? 'no_actions_found'
              : 'needs_more_juice',
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function classifyCurve(scores: number[]): string {
  if (scores.length < 3) return 'too_short';
  const nonZero = scores.filter(s => s > 0);
  if (nonZero.length === 0) return 'flat_zero';

  let increasing = 0, decreasing = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[i - 1]) increasing++;
    else if (scores[i] < scores[i - 1]) decreasing++;
  }

  const total = increasing + decreasing;
  if (total === 0) return 'flat';
  if (increasing > total * 0.7) return 'gradually_increasing';
  if (decreasing > total * 0.7) return 'gradually_decreasing';
  if (Math.abs(increasing - decreasing) < total * 0.3) return 'sawtooth';
  return 'variable';
}
