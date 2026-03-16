/**
 * Performance Profiling Tools (Tier 2 — Phase 2E)
 *
 * Programmatic performance analysis of running Godot games.
 * Injects a profiler autoload, runs the game, collects metrics,
 * and analyzes bottlenecks.
 *
 * Tools:
 *   - start_profiler      (TS+GD)  Run game with profiler and collect data
 *   - get_profiling_data   (TS)    Read and summarize profiling results
 *   - analyze_bottlenecks  (TS)    Threshold-based bottleneck analysis
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString, requiredNumber, optionalString, optionalNumber } from '../utils/validation.js';

export function registerProfilingTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    startProfiler(ctx),
    getProfilingData(ctx),
    analyzeBottlenecks(ctx),
  ]);
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROFILER_SCRIPT_NAME = '_mcp_profiler.gd';
const PROFILER_OUTPUT_DIR = '.mcp_profiling';
const PROFILER_AUTOLOAD_NAME = '_McpProfiler';

/**
 * GDScript profiler autoload that collects Performance monitor data
 * and writes it to a JSON file on exit.
 */
function getProfilerScript(outputPath: string, sampleInterval: number, duration: number): string {
  return `extends Node
# MCP Performance Profiler — auto-generated, do not edit
# Collects Performance monitor samples and writes to JSON on exit

var _samples := []
var _elapsed := 0.0
var _sample_timer := 0.0
var _duration := ${duration.toFixed(1)}
var _sample_interval := ${sampleInterval.toFixed(2)}
var _output_path := "${outputPath.replace(/\\/g, '/')}"

func _ready() -> void:
\tprint("[MCP Profiler] Started — collecting for ", _duration, "s at ", _sample_interval, "s intervals")

func _process(delta: float) -> void:
\t_elapsed += delta
\t_sample_timer += delta
\tif _sample_timer >= _sample_interval:
\t\t_sample_timer = 0.0
\t\t_collect_sample()
\tif _elapsed >= _duration:
\t\t_write_results()
\t\tget_tree().quit()

func _collect_sample() -> void:
\tvar sample := {
\t\t"time": _elapsed,
\t\t"fps": Performance.get_monitor(Performance.TIME_FPS),
\t\t"frame_time": Performance.get_monitor(Performance.TIME_PROCESS) + Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS),
\t\t"process_time": Performance.get_monitor(Performance.TIME_PROCESS),
\t\t"physics_time": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS),
\t\t"render_objects": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
\t\t"render_draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
\t\t"render_primitives": Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
\t\t"memory_static": Performance.get_monitor(Performance.MEMORY_STATIC),
\t\t"memory_message_buffer": Performance.get_monitor(Performance.MEMORY_MESSAGE_BUFFER_MAX),
\t\t"object_count": Performance.get_monitor(Performance.OBJECT_COUNT),
\t\t"object_resource_count": Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),
\t\t"object_node_count": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
\t\t"object_orphan_node_count": Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT),
\t\t"navigation_active_maps": Performance.get_monitor(Performance.NAVIGATION_ACTIVE_MAPS),
\t}
\t_samples.append(sample)

func _write_results() -> void:
\tvar dir_path = _output_path.get_base_dir()
\tif not DirAccess.dir_exists_absolute(dir_path):
\t\tDirAccess.make_dir_recursive_absolute(dir_path)
\tvar file = FileAccess.open(_output_path, FileAccess.WRITE)
\tif file:
\t\tvar data := {"samples": _samples, "duration": _elapsed, "sample_count": _samples.size()}
\t\tfile.store_string(JSON.stringify(data, "  "))
\t\tfile.close()
\t\tprint("[MCP Profiler] Results written to: ", _output_path)
\telse:
\t\tpush_error("[MCP Profiler] Failed to write results to: " + _output_path)
`;
}

// ─── start_profiler ─────────────────────────────────────────────────────────

function startProfiler(ctx: ServerContext): ToolDefinition {
  return {
    name: 'start_profiler',
    description: 'Run a Godot project with a performance profiler for a specified duration. Injects a profiler autoload, runs the game, collects Performance monitor samples (FPS, frame time, draw calls, memory, etc.), and returns a profiler ID for retrieving results.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        duration: { type: 'number', description: 'Duration to profile in seconds' },
        scene_path: { type: 'string', description: 'Specific scene to run (default: main scene)' },
        sample_interval: { type: 'number', description: 'Seconds between metric samples (default: 0.5)' },
      },
      required: ['project_path', 'duration'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredNumber('duration', 'duration'),
        optionalNumber('sampleInterval', 'sample_interval'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const duration = args.duration as number;
      const sampleInterval = (args.sampleInterval as number) || 0.5;
      const scenePath = args.scenePath as string | undefined;

      if (duration <= 0 || duration > 300) {
        return ctx.createErrorResponse('Duration must be between 0 and 300 seconds');
      }

      // Generate profiler ID
      const profilerId = `profile_${Date.now()}`;
      const outputDir = join(projectDir, PROFILER_OUTPUT_DIR);
      const outputFile = join(outputDir, `${profilerId}.json`);
      const profilerScriptPath = join(projectDir, PROFILER_SCRIPT_NAME);

      // Ensure output directory exists
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Write profiler autoload script
      const godotOutputPath = `res://${PROFILER_OUTPUT_DIR}/${profilerId}.json`;
      const profilerScript = getProfilerScript(godotOutputPath, sampleInterval, duration);
      writeFileSync(profilerScriptPath, profilerScript, 'utf-8');

      // Read project.godot and add autoload
      const projectGodotPath = join(projectDir, 'project.godot');
      let projectContent = readFileSync(projectGodotPath, 'utf-8');
      const autoloadEntry = `${PROFILER_AUTOLOAD_NAME}="*res://${PROFILER_SCRIPT_NAME}"`;

      // Add autoload section or append to existing
      if (projectContent.includes('[autoload]')) {
        projectContent = projectContent.replace(
          '[autoload]',
          `[autoload]\n${autoloadEntry}`
        );
      } else {
        projectContent += `\n[autoload]\n${autoloadEntry}\n`;
      }
      writeFileSync(projectGodotPath, projectContent, 'utf-8');

      // Run the game
      let godotPath: string;
      try {
        godotPath = await ctx.getGodotPath();
      } catch {
        // Cleanup before returning error
        cleanupProfiler(projectDir, profilerScriptPath);
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

          // Timeout: give extra time beyond the profiling duration
          const timeout = setTimeout(() => {
            proc.kill();
            resolve();
          }, (duration + 15) * 1000);

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
        cleanupProfiler(projectDir, profilerScriptPath);
        return ctx.createErrorResponse(`Failed to run Godot: ${err.message}`);
      }

      // Cleanup: remove autoload and profiler script
      cleanupProfiler(projectDir, profilerScriptPath);

      // Check if output file was written
      if (!existsSync(outputFile)) {
        return ctx.createErrorResponse(
          'Profiler output file was not generated',
          [
            'The game may have crashed before the profiler could write results',
            'Check if the game runs successfully without the profiler',
            'Try a shorter duration',
          ]
        );
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            profiler_id: profilerId,
            output_file: `${PROFILER_OUTPUT_DIR}/${profilerId}.json`,
            duration,
            sample_interval: sampleInterval,
            status: 'completed',
          }, null, 2),
        }],
      };
    },
  };
}

// ─── get_profiling_data ─────────────────────────────────────────────────────

function getProfilingData(ctx: ServerContext): ToolDefinition {
  return {
    name: 'get_profiling_data',
    description: 'Read profiling results from a completed profiler session. Returns raw samples and a statistical summary (avg/min/max FPS, frame times, draw calls, memory usage).',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        profiler_id: { type: 'string', description: 'Profiler session ID (from start_profiler). If omitted, uses the most recent session.' },
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
      const outputDir = join(projectDir, PROFILER_OUTPUT_DIR);

      if (!existsSync(outputDir)) {
        return ctx.createErrorResponse(
          'No profiling data found',
          ['Run start_profiler first to collect performance data']
        );
      }

      // Find the profiler output file
      let profileFile: string;
      if (args.profilerId) {
        profileFile = join(outputDir, `${args.profilerId}.json`);
      } else {
        // Find the most recent profile
        const files = readdirSync(outputDir)
          .filter((f: string) => f.startsWith('profile_') && f.endsWith('.json'))
          .sort()
          .reverse();
        if (files.length === 0) {
          return ctx.createErrorResponse('No profiling data found');
        }
        profileFile = join(outputDir, files[0]);
      }

      if (!existsSync(profileFile)) {
        return ctx.createErrorResponse(`Profiling data not found: ${args.profilerId}`);
      }

      // Parse the data
      let data: any;
      try {
        data = JSON.parse(readFileSync(profileFile, 'utf-8'));
      } catch (err: any) {
        return ctx.createErrorResponse(`Failed to parse profiling data: ${err.message}`);
      }

      const samples = data.samples || [];
      if (samples.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              profiler_id: args.profilerId || 'latest',
              samples: [],
              summary: { message: 'No samples collected' },
            }, null, 2),
          }],
        };
      }

      // Calculate summary statistics
      const summary = calculateSummary(samples);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            profiler_id: args.profilerId || 'latest',
            duration: data.duration,
            sample_count: samples.length,
            samples,
            summary,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── analyze_bottlenecks ────────────────────────────────────────────────────

function analyzeBottlenecks(ctx: ServerContext): ToolDefinition {
  return {
    name: 'analyze_bottlenecks',
    description: 'Analyze profiling data to identify performance bottlenecks. Checks FPS, frame time, draw calls, memory usage, and object counts against configurable thresholds. Returns issues with severity, recommendations, and an overall grade (A-F).',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        profiler_id: { type: 'string', description: 'Profiler session ID (default: most recent)' },
        target_fps: { type: 'number', description: 'Target FPS for threshold calculations (default: 60)' },
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
      const targetFps = (args.targetFps as number) || 60;
      const outputDir = join(projectDir, PROFILER_OUTPUT_DIR);

      if (!existsSync(outputDir)) {
        return ctx.createErrorResponse('No profiling data found');
      }

      // Find profile file
      let profileFile: string;
      if (args.profilerId) {
        profileFile = join(outputDir, `${args.profilerId}.json`);
      } else {
        const files = readdirSync(outputDir)
          .filter((f: string) => f.startsWith('profile_') && f.endsWith('.json'))
          .sort()
          .reverse();
        if (files.length === 0) {
          return ctx.createErrorResponse('No profiling data found');
        }
        profileFile = join(outputDir, files[0]);
      }

      if (!existsSync(profileFile)) {
        return ctx.createErrorResponse(`Profiling data not found: ${args.profilerId}`);
      }

      let data: any;
      try {
        data = JSON.parse(readFileSync(profileFile, 'utf-8'));
      } catch (err: any) {
        return ctx.createErrorResponse(`Failed to parse profiling data: ${err.message}`);
      }

      const samples = data.samples || [];
      if (samples.length === 0) {
        return ctx.createErrorResponse('No samples in profiling data');
      }

      const summary = calculateSummary(samples);
      const bottlenecks = detectBottlenecks(summary, targetFps);
      const grade = calculateGrade(bottlenecks);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            profiler_id: args.profilerId || 'latest',
            target_fps: targetFps,
            summary,
            bottlenecks,
            overall_grade: grade,
            recommendations: generateRecommendations(bottlenecks),
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanupProfiler(projectDir: string, profilerScriptPath: string): void {
  try {
    // Remove profiler script
    if (existsSync(profilerScriptPath)) {
      unlinkSync(profilerScriptPath);
    }

    // Remove autoload from project.godot
    const projectGodotPath = join(projectDir, 'project.godot');
    if (existsSync(projectGodotPath)) {
      let content = readFileSync(projectGodotPath, 'utf-8');
      // Remove the autoload line
      const autoloadLine = `${PROFILER_AUTOLOAD_NAME}="*res://${PROFILER_SCRIPT_NAME}"`;
      content = content.replace(autoloadLine + '\n', '');
      content = content.replace(autoloadLine, '');
      // Clean up empty autoload section if we created it
      content = content.replace(/\n\[autoload\]\n\s*\n/g, '\n');
      writeFileSync(projectGodotPath, content, 'utf-8');
    }
  } catch {
    // Best-effort cleanup
  }
}

interface ProfileSummary {
  avg_fps: number;
  min_fps: number;
  max_fps: number;
  avg_frame_time_ms: number;
  max_frame_time_ms: number;
  avg_process_time_ms: number;
  avg_physics_time_ms: number;
  avg_draw_calls: number;
  max_draw_calls: number;
  avg_objects: number;
  max_objects: number;
  avg_memory_mb: number;
  max_memory_mb: number;
  avg_node_count: number;
  max_orphan_nodes: number;
  fps_stability: number; // std dev of FPS
}

function calculateSummary(samples: any[]): ProfileSummary {
  const fps = samples.map((s: any) => s.fps || 0);
  const frameTime = samples.map((s: any) => (s.frame_time || 0) * 1000); // to ms
  const processTime = samples.map((s: any) => (s.process_time || 0) * 1000);
  const physicsTime = samples.map((s: any) => (s.physics_time || 0) * 1000);
  const drawCalls = samples.map((s: any) => s.render_draw_calls || 0);
  const objects = samples.map((s: any) => s.render_objects || 0);
  const memory = samples.map((s: any) => (s.memory_static || 0) / (1024 * 1024)); // to MB
  const nodeCount = samples.map((s: any) => s.object_node_count || 0);
  const orphanNodes = samples.map((s: any) => s.object_orphan_node_count || 0);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const min = (arr: number[]) => arr.length ? Math.min(...arr) : 0;
  const max = (arr: number[]) => arr.length ? Math.max(...arr) : 0;
  const stdDev = (arr: number[]) => {
    const mean = avg(arr);
    const variance = avg(arr.map(v => (v - mean) ** 2));
    return Math.sqrt(variance);
  };

  return {
    avg_fps: Math.round(avg(fps) * 10) / 10,
    min_fps: Math.round(min(fps) * 10) / 10,
    max_fps: Math.round(max(fps) * 10) / 10,
    avg_frame_time_ms: Math.round(avg(frameTime) * 100) / 100,
    max_frame_time_ms: Math.round(max(frameTime) * 100) / 100,
    avg_process_time_ms: Math.round(avg(processTime) * 100) / 100,
    avg_physics_time_ms: Math.round(avg(physicsTime) * 100) / 100,
    avg_draw_calls: Math.round(avg(drawCalls)),
    max_draw_calls: Math.round(max(drawCalls)),
    avg_objects: Math.round(avg(objects)),
    max_objects: Math.round(max(objects)),
    avg_memory_mb: Math.round(avg(memory) * 10) / 10,
    max_memory_mb: Math.round(max(memory) * 10) / 10,
    avg_node_count: Math.round(avg(nodeCount)),
    max_orphan_nodes: Math.round(max(orphanNodes)),
    fps_stability: Math.round(stdDev(fps) * 10) / 10,
  };
}

interface Bottleneck {
  category: string;
  severity: 'error' | 'warning' | 'info';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  recommendation: string;
}

function detectBottlenecks(summary: ProfileSummary, targetFps: number): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];
  const targetFrameTime = 1000 / targetFps;

  // FPS checks
  if (summary.avg_fps < targetFps * 0.5) {
    bottlenecks.push({
      category: 'fps', severity: 'error', metric: 'avg_fps',
      value: summary.avg_fps, threshold: targetFps * 0.5,
      message: `Average FPS (${summary.avg_fps}) is critically below target (${targetFps})`,
      recommendation: 'Major optimization needed — profile specific systems to identify the bottleneck',
    });
  } else if (summary.avg_fps < targetFps * 0.9) {
    bottlenecks.push({
      category: 'fps', severity: 'warning', metric: 'avg_fps',
      value: summary.avg_fps, threshold: targetFps * 0.9,
      message: `Average FPS (${summary.avg_fps}) is below target (${targetFps})`,
      recommendation: 'Review draw calls, scene complexity, and script performance',
    });
  }

  if (summary.min_fps < targetFps * 0.3) {
    bottlenecks.push({
      category: 'fps', severity: 'error', metric: 'min_fps',
      value: summary.min_fps, threshold: targetFps * 0.3,
      message: `Minimum FPS (${summary.min_fps}) indicates severe frame drops`,
      recommendation: 'Investigate spikes — possible causes: scene loading, garbage collection, physics',
    });
  }

  // FPS stability
  if (summary.fps_stability > 10) {
    bottlenecks.push({
      category: 'stability', severity: 'warning', metric: 'fps_stability',
      value: summary.fps_stability, threshold: 10,
      message: `FPS instability (std dev: ${summary.fps_stability}) indicates frame time variance`,
      recommendation: 'Look for periodic spikes — possible causes: GC pauses, loading, heavy physics frames',
    });
  }

  // Frame time
  if (summary.max_frame_time_ms > targetFrameTime * 3) {
    bottlenecks.push({
      category: 'frame_time', severity: 'error', metric: 'max_frame_time_ms',
      value: summary.max_frame_time_ms, threshold: targetFrameTime * 3,
      message: `Peak frame time (${summary.max_frame_time_ms}ms) is ${Math.round(summary.max_frame_time_ms / targetFrameTime)}x the target`,
      recommendation: 'Identify and fix the frame spike source — check _process() and _physics_process() implementations',
    });
  }

  // Draw calls
  if (summary.max_draw_calls > 3000) {
    bottlenecks.push({
      category: 'rendering', severity: 'error', metric: 'max_draw_calls',
      value: summary.max_draw_calls, threshold: 3000,
      message: `Draw calls (${summary.max_draw_calls}) are very high`,
      recommendation: 'Use mesh merging, LODs, occlusion culling, or MultiMeshInstance for repeated objects',
    });
  } else if (summary.max_draw_calls > 1000) {
    bottlenecks.push({
      category: 'rendering', severity: 'warning', metric: 'max_draw_calls',
      value: summary.max_draw_calls, threshold: 1000,
      message: `Draw calls (${summary.max_draw_calls}) are elevated`,
      recommendation: 'Consider batching materials, reducing unique materials, or using MultiMesh',
    });
  }

  // Memory
  if (summary.max_memory_mb > 1024) {
    bottlenecks.push({
      category: 'memory', severity: 'error', metric: 'max_memory_mb',
      value: summary.max_memory_mb, threshold: 1024,
      message: `Memory usage (${summary.max_memory_mb}MB) exceeds 1GB`,
      recommendation: 'Review texture sizes, use compressed textures, unload unused resources',
    });
  } else if (summary.max_memory_mb > 512) {
    bottlenecks.push({
      category: 'memory', severity: 'warning', metric: 'max_memory_mb',
      value: summary.max_memory_mb, threshold: 512,
      message: `Memory usage (${summary.max_memory_mb}MB) is elevated`,
      recommendation: 'Consider texture compression and resource pooling',
    });
  }

  // Orphan nodes
  if (summary.max_orphan_nodes > 50) {
    bottlenecks.push({
      category: 'nodes', severity: 'warning', metric: 'max_orphan_nodes',
      value: summary.max_orphan_nodes, threshold: 50,
      message: `${summary.max_orphan_nodes} orphan nodes detected (memory leak indicator)`,
      recommendation: 'Ensure freed nodes are properly queue_free()d and not just removed from tree',
    });
  }

  return bottlenecks;
}

function calculateGrade(bottlenecks: Bottleneck[]): string {
  const errors = bottlenecks.filter(b => b.severity === 'error').length;
  const warnings = bottlenecks.filter(b => b.severity === 'warning').length;

  if (errors === 0 && warnings === 0) return 'A';
  if (errors === 0 && warnings <= 1) return 'B';
  if (errors === 0 && warnings <= 3) return 'C';
  if (errors <= 1) return 'D';
  return 'F';
}

function generateRecommendations(bottlenecks: Bottleneck[]): string[] {
  const recs: string[] = [];
  const categories = new Set(bottlenecks.map(b => b.category));

  if (categories.has('fps') || categories.has('frame_time')) {
    recs.push('Profile with Godot\'s built-in profiler to identify which scripts consume the most time');
  }
  if (categories.has('rendering')) {
    recs.push('Use Godot\'s "Visible Collision Shapes" and "Visible Navigation" debug options to verify scene complexity');
    recs.push('Consider implementing LOD (Level of Detail) for 3D scenes');
  }
  if (categories.has('memory')) {
    recs.push('Use Resource.unreference() or queue_free() to release unused resources');
    recs.push('Check texture import settings — use Lossy or VRAM Compressed for large textures');
  }
  if (categories.has('nodes')) {
    recs.push('Audit node lifecycle — ensure every add_child() has a corresponding queue_free()');
  }
  if (categories.has('stability')) {
    recs.push('Move heavy computations to background threads or spread across frames');
  }

  if (recs.length === 0) {
    recs.push('Performance looks good! No major bottlenecks detected.');
  }

  return recs;
}
