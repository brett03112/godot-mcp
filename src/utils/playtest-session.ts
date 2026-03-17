/**
 * Playtest Session Types & I/O (Tier 4 — Phase A)
 *
 * Defines the session data format for playtest recordings,
 * provides file I/O, and resolves Godot user:// paths per OS.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { platform, homedir } from 'os';

// ─── Session Data Types ────────────────────────────────────────────────────

export interface PlaytestSample {
  /** Elapsed time in seconds */
  t: number;
  /** Position [x, y] for 2D or [x, y, z] for 3D */
  pos: number[];
  /** Velocity [x, y] or [x, y, z] */
  vel?: number[];
  /** State label (e.g. "idle", "running", "attacking") */
  state?: string;
  /** Health value if available */
  hp?: number;
  /** Current FPS */
  fps: number;
  /** Frame time in ms */
  frame_time?: number;
}

export interface PlaytestEvent {
  /** Elapsed time in seconds */
  t: number;
  /** Event type (death, damage, pickup, level_complete, custom) */
  type: string;
  /** Position where event occurred */
  pos?: number[];
  /** Additional event data */
  details?: Record<string, any>;
}

export interface PlaytestInput {
  /** Elapsed time in seconds */
  t: number;
  /** Input action name */
  action: string;
  /** Whether the action was pressed or released */
  pressed: boolean;
}

export interface PlaytestSessionSummary {
  total_deaths: number;
  total_damage_taken: number;
  distance_traveled: number;
  areas_visited: number;
  avg_fps: number;
  min_fps: number;
  max_fps: number;
  events_by_type: Record<string, number>;
  total_inputs: number;
  duration_seconds: number;
}

export interface PlaytestSession {
  session_id: string;
  session_name?: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  scene?: string;
  bot_type?: string;
  player_node_path?: string;
  is_3d: boolean;
  metadata: {
    godot_version?: string;
    project_name: string;
    resolution?: number[];
  };
  samples: PlaytestSample[];
  events: PlaytestEvent[];
  inputs: PlaytestInput[];
  summary: PlaytestSessionSummary;
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const PLAYTEST_OUTPUT_DIR = '.mcp_playtest';
export const RECORDER_SCRIPT_NAME = '_mcp_playtest_recorder.gd';
export const BOT_SCRIPT_NAME = '_mcp_playtest_bot.gd';
export const RECORDER_AUTOLOAD_NAME = '_McpPlaytestRecorder';
export const BOT_AUTOLOAD_NAME = '_McpPlaytestBot';

// ─── User:// Path Resolution ───────────────────────────────────────────────

/**
 * Resolve the Godot user:// data directory for a project.
 * Godot stores user data at platform-specific locations based on project name.
 */
export function resolveUserDataDir(projectPath: string): string {
  const projectName = getProjectName(projectPath);

  switch (platform()) {
    case 'win32': {
      const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
      return join(appData, 'Godot', 'app_userdata', projectName);
    }
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Godot', 'app_userdata', projectName);
    default: // linux and others
      return join(homedir(), '.local', 'share', 'godot', 'app_userdata', projectName);
  }
}

/**
 * Extract the project name from project.godot
 */
function getProjectName(projectPath: string): string {
  const projectGodotPath = join(projectPath, 'project.godot');
  if (!existsSync(projectGodotPath)) {
    return 'Unknown';
  }

  const content = readFileSync(projectGodotPath, 'utf-8');
  const match = content.match(/config\/name\s*=\s*"([^"]+)"/);
  return match ? match[1] : 'Unknown';
}

// ─── Session I/O ───────────────────────────────────────────────────────────

/**
 * Get the playtest output directory for a project
 */
export function getPlaytestDir(projectPath: string): string {
  return join(projectPath, PLAYTEST_OUTPUT_DIR);
}

/**
 * Ensure the playtest output directory exists
 */
export function ensurePlaytestDir(projectPath: string): string {
  const dir = getPlaytestDir(projectPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').replace(/\.\d+Z$/, '');
  return `playtest_${ts}`;
}

/**
 * Read a playtest session from file
 */
export function readSession(projectPath: string, sessionId: string): PlaytestSession | null {
  const dir = getPlaytestDir(projectPath);
  const filePath = join(dir, `${sessionId}.json`);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Read multiple sessions. If sessionIds is empty, reads all sessions.
 */
export function readSessions(projectPath: string, sessionIds?: string[]): PlaytestSession[] {
  const dir = getPlaytestDir(projectPath);
  if (!existsSync(dir)) return [];

  const ids = sessionIds && sessionIds.length > 0
    ? sessionIds
    : readdirSync(dir)
        .filter(f => f.startsWith('playtest_') && f.endsWith('.json'))
        .map(f => f.replace('.json', ''));

  const sessions: PlaytestSession[] = [];
  for (const id of ids) {
    const session = readSession(projectPath, id);
    if (session) sessions.push(session);
  }
  return sessions;
}

/**
 * List available session IDs in a project
 */
export function listSessionIds(projectPath: string): string[] {
  const dir = getPlaytestDir(projectPath);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.startsWith('playtest_') && f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse(); // newest first
}

// ─── Session Analysis Helpers ──────────────────────────────────────────────

/**
 * Calculate Euclidean distance between two position arrays
 */
export function distance(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Compute basic statistics for a number array
 */
export function stats(arr: number[]): { avg: number; min: number; max: number; stddev: number; sum: number } {
  if (arr.length === 0) return { avg: 0, min: 0, max: 0, stddev: 0, sum: 0 };

  const sum = arr.reduce((a, b) => a + b, 0);
  const avg = sum / arr.length;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const variance = arr.reduce((acc, v) => acc + (v - avg) ** 2, 0) / arr.length;
  return { avg, min, max, stddev: Math.sqrt(variance), sum };
}

/**
 * Round a number to specified decimal places
 */
export function round(value: number, decimals: number = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
