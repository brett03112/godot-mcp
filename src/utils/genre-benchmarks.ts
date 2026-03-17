/**
 * Genre Benchmark Data (Tier 4 — Phase B)
 *
 * Research-based approximate benchmarks for common game genres.
 * Used by compare_to_genre_benchmarks to evaluate playtest sessions.
 */

export interface GenreBenchmark {
  genre: string;
  label: string;
  /** Typical deaths per minute of gameplay */
  deaths_per_minute: { low: number; typical: number; high: number };
  /** Typical session/run duration in seconds */
  session_duration: { low: number; typical: number; high: number };
  /** Acceptable FPS target */
  target_fps: number;
  /** Input-to-action responsiveness target in ms */
  responsiveness_ms: { acceptable: number; good: number; excellent: number };
  /** Expected pacing variance (0=flat, 1=highly varied) */
  pacing_variance: { low: number; typical: number; high: number };
  /** Expected damage events per minute */
  damage_per_minute: { low: number; typical: number; high: number };
  /** Expected idle ratio (0=always moving, 1=never moving) */
  idle_ratio: { low: number; typical: number; high: number };
  /** Description and design notes */
  notes: string;
}

export const GENRE_BENCHMARKS: Record<string, GenreBenchmark> = {
  platformer: {
    genre: 'platformer',
    label: 'Platformer',
    deaths_per_minute: { low: 0.5, typical: 2.0, high: 5.0 },
    session_duration: { low: 30, typical: 120, high: 300 },
    target_fps: 60,
    responsiveness_ms: { acceptable: 100, good: 50, excellent: 16 },
    pacing_variance: { low: 0.2, typical: 0.4, high: 0.7 },
    damage_per_minute: { low: 2, typical: 6, high: 15 },
    idle_ratio: { low: 0.02, typical: 0.08, high: 0.15 },
    notes: 'Platformers demand tight controls and quick responsiveness. Deaths should feel fair. Pacing alternates between challenging and rest sections.',
  },
  roguelike: {
    genre: 'roguelike',
    label: 'Roguelike',
    deaths_per_minute: { low: 0.01, typical: 0.05, high: 0.15 },
    session_duration: { low: 600, typical: 1800, high: 3600 },
    target_fps: 60,
    responsiveness_ms: { acceptable: 150, good: 80, excellent: 33 },
    pacing_variance: { low: 0.3, typical: 0.6, high: 0.9 },
    damage_per_minute: { low: 1, typical: 4, high: 10 },
    idle_ratio: { low: 0.05, typical: 0.15, high: 0.3 },
    notes: 'Roguelikes have long runs with permanent death. Difficulty should ramp over the run. Each death should feel like a learning opportunity.',
  },
  fps: {
    genre: 'fps',
    label: 'First-Person Shooter',
    deaths_per_minute: { low: 0.1, typical: 0.5, high: 1.5 },
    session_duration: { low: 300, typical: 900, high: 1800 },
    target_fps: 60,
    responsiveness_ms: { acceptable: 50, good: 16, excellent: 8 },
    pacing_variance: { low: 0.3, typical: 0.5, high: 0.8 },
    damage_per_minute: { low: 3, typical: 8, high: 20 },
    idle_ratio: { low: 0.01, typical: 0.05, high: 0.1 },
    notes: 'FPS games require the lowest input latency. High action density with brief pauses. Movement should feel fluid and responsive.',
  },
  rpg: {
    genre: 'rpg',
    label: 'Role-Playing Game',
    deaths_per_minute: { low: 0.005, typical: 0.02, high: 0.1 },
    session_duration: { low: 1800, typical: 3600, high: 7200 },
    target_fps: 30,
    responsiveness_ms: { acceptable: 200, good: 100, excellent: 50 },
    pacing_variance: { low: 0.1, typical: 0.3, high: 0.5 },
    damage_per_minute: { low: 0.5, typical: 2, high: 5 },
    idle_ratio: { low: 0.1, typical: 0.25, high: 0.5 },
    notes: 'RPGs have long sessions with varied pacing. Combat is punctuated by exploration and dialogue. Higher idle ratio is expected due to menus and reading.',
  },
  puzzle: {
    genre: 'puzzle',
    label: 'Puzzle',
    deaths_per_minute: { low: 0, typical: 0, high: 0.1 },
    session_duration: { low: 60, typical: 300, high: 900 },
    target_fps: 30,
    responsiveness_ms: { acceptable: 200, good: 100, excellent: 50 },
    pacing_variance: { low: 0.05, typical: 0.15, high: 0.3 },
    damage_per_minute: { low: 0, typical: 0, high: 1 },
    idle_ratio: { low: 0.1, typical: 0.35, high: 0.6 },
    notes: 'Puzzle games have minimal combat. High idle ratio is expected as players think. Frustration comes from confusion, not death.',
  },
  metroidvania: {
    genre: 'metroidvania',
    label: 'Metroidvania',
    deaths_per_minute: { low: 0.3, typical: 1.0, high: 3.0 },
    session_duration: { low: 600, typical: 1800, high: 3600 },
    target_fps: 60,
    responsiveness_ms: { acceptable: 100, good: 50, excellent: 16 },
    pacing_variance: { low: 0.3, typical: 0.5, high: 0.7 },
    damage_per_minute: { low: 2, typical: 5, high: 12 },
    idle_ratio: { low: 0.05, typical: 0.12, high: 0.25 },
    notes: 'Metroidvanias blend exploration with combat. Some backtracking is expected (new abilities unlock paths). Difficulty should feel rewarding.',
  },
  action: {
    genre: 'action',
    label: 'Action',
    deaths_per_minute: { low: 0.2, typical: 0.8, high: 2.0 },
    session_duration: { low: 300, typical: 900, high: 1800 },
    target_fps: 60,
    responsiveness_ms: { acceptable: 80, good: 33, excellent: 16 },
    pacing_variance: { low: 0.3, typical: 0.5, high: 0.8 },
    damage_per_minute: { low: 3, typical: 8, high: 18 },
    idle_ratio: { low: 0.02, typical: 0.08, high: 0.15 },
    notes: 'Action games demand responsive controls and high event density. Good game feel requires strong visual/audio feedback on every action.',
  },
  survival: {
    genre: 'survival',
    label: 'Survival',
    deaths_per_minute: { low: 0.01, typical: 0.05, high: 0.15 },
    session_duration: { low: 1200, typical: 3600, high: 7200 },
    target_fps: 30,
    responsiveness_ms: { acceptable: 150, good: 80, excellent: 33 },
    pacing_variance: { low: 0.2, typical: 0.4, high: 0.6 },
    damage_per_minute: { low: 0.5, typical: 2, high: 5 },
    idle_ratio: { low: 0.1, typical: 0.2, high: 0.4 },
    notes: 'Survival games have long sessions with resource management. Tension comes from scarcity and environmental threats. Deaths should be avoidable but consequential.',
  },
};

/**
 * Get a benchmark by genre name, case-insensitive
 */
export function getBenchmark(genre: string): GenreBenchmark | undefined {
  return GENRE_BENCHMARKS[genre.toLowerCase()];
}

/**
 * Get all available genre names
 */
export function getAvailableGenres(): string[] {
  return Object.keys(GENRE_BENCHMARKS);
}

/**
 * Compare a value against a benchmark range
 */
export function compareToBenchmarkRange(
  value: number,
  range: { low: number; typical: number; high: number }
): 'below_range' | 'low_end' | 'within_range' | 'high_end' | 'above_range' {
  if (value < range.low) return 'below_range';
  if (value < range.typical * 0.7) return 'low_end';
  if (value <= range.typical * 1.3) return 'within_range';
  if (value <= range.high) return 'high_end';
  return 'above_range';
}
