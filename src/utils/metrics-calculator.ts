/**
 * Metrics Calculator (Tier 4 — Phase B)
 *
 * Computation algorithms for game feel metrics, difficulty analysis,
 * frustration detection, and juice coverage.
 */

import { PlaytestSession, distance, stats, round } from './playtest-session.js';
import { compareToBenchmarkRange, GenreBenchmark } from './genre-benchmarks.js';

// ─── Game Feel Metrics ─────────────────────────────────────────────────────

export interface GameFeelScore {
  name: string;
  score: number;        // 0-100
  assessment: string;   // poor, below_average, average, good, excellent
  explanation: string;
  recommendations: string[];
}

export function calculateResponsiveness(sessions: PlaytestSession[]): GameFeelScore {
  // Measure input-to-movement latency by checking velocity changes after input events
  const latencies: number[] = [];

  for (const session of sessions) {
    if (session.inputs.length === 0 || session.samples.length === 0) continue;

    for (const input of session.inputs) {
      if (!input.pressed) continue;
      // Find the first sample after this input with velocity change
      const inputTime = input.t;
      let foundResponse = false;

      for (const sample of session.samples) {
        if (sample.t <= inputTime) continue;
        if (sample.t > inputTime + 0.5) break; // Give up after 500ms

        if (sample.vel) {
          const speed = Math.sqrt(sample.vel.reduce((s, v) => s + v * v, 0));
          if (speed > 1) {
            latencies.push((sample.t - inputTime) * 1000); // Convert to ms
            foundResponse = true;
            break;
          }
        }
      }
    }
  }

  if (latencies.length === 0) {
    return {
      name: 'responsiveness',
      score: 50,
      assessment: 'unknown',
      explanation: 'Insufficient input/movement data to measure responsiveness',
      recommendations: ['Enable input recording (record_inputs: true) for accurate measurement'],
    };
  }

  const s = stats(latencies);
  // Score: 100ms = 50 points, 16ms = 100 points, 200ms+ = 0 points
  const score = Math.max(0, Math.min(100, 100 - (s.avg - 16) * (50 / 84)));

  return {
    name: 'responsiveness',
    score: round(score),
    assessment: assessScore(score),
    explanation: `Average input-to-response latency: ${round(s.avg)}ms (best: ${round(s.min)}ms, worst: ${round(s.max)}ms)`,
    recommendations: score < 60
      ? ['Reduce _process() overhead', 'Check for frame-rate dependent input handling', 'Consider using _physics_process() for movement']
      : [],
  };
}

export function calculatePacing(sessions: PlaytestSession[]): GameFeelScore {
  // Measure event intensity variance over time
  const allVariances: number[] = [];

  for (const session of sessions) {
    if (session.events.length < 3 || session.duration_seconds < 10) continue;

    const windowSize = 15; // seconds
    const windowCount = Math.ceil(session.duration_seconds / windowSize);
    const intensities: number[] = [];

    for (let i = 0; i < windowCount; i++) {
      const tStart = i * windowSize;
      const tEnd = (i + 1) * windowSize;
      const count = session.events.filter(e => e.t >= tStart && e.t < tEnd).length;
      intensities.push(count);
    }

    if (intensities.length >= 3) {
      const s = stats(intensities);
      // Coefficient of variation — higher means more varied pacing
      const cv = s.avg > 0 ? s.stddev / s.avg : 0;
      allVariances.push(cv);
    }
  }

  if (allVariances.length === 0) {
    return {
      name: 'pacing',
      score: 50,
      assessment: 'unknown',
      explanation: 'Insufficient event data to analyze pacing',
      recommendations: ['Ensure the game emits events (damage, pickups, etc.) for pacing analysis'],
    };
  }

  const avgCV = stats(allVariances).avg;
  // Good pacing has moderate variance (CV ~0.5-0.8)
  // Too flat (CV < 0.2) or too chaotic (CV > 1.5) scores low
  let score: number;
  if (avgCV < 0.1) score = 20; // Very flat
  else if (avgCV < 0.3) score = 50; // Somewhat flat
  else if (avgCV < 0.5) score = 70; // Decent variation
  else if (avgCV < 0.8) score = 90; // Good tension/release
  else if (avgCV < 1.2) score = 70; // High variation
  else score = 40; // Chaotic

  return {
    name: 'pacing',
    score: round(score),
    assessment: assessScore(score),
    explanation: `Pacing coefficient of variation: ${round(avgCV, 2)} (ideal: 0.5-0.8)`,
    recommendations: score < 60
      ? avgCV < 0.3
        ? ['Add more varied encounters', 'Create alternating intensity sections', 'Consider adding risk/reward choices']
        : ['Smooth out difficulty spikes', 'Add rest areas between intense sections', 'Balance encounter density']
      : [],
  };
}

export function calculateDifficulty(sessions: PlaytestSession[]): GameFeelScore {
  const deathRates: number[] = [];
  const damageRates: number[] = [];

  for (const session of sessions) {
    if (session.duration_seconds < 5) continue;
    const minutes = session.duration_seconds / 60;
    deathRates.push(session.summary.total_deaths / minutes);
    damageRates.push(session.events.filter(e => e.type === 'damage').length / minutes);
  }

  if (deathRates.length === 0) {
    return {
      name: 'difficulty',
      score: 50,
      assessment: 'unknown',
      explanation: 'No session data to assess difficulty',
      recommendations: [],
    };
  }

  const avgDeathRate = stats(deathRates).avg;
  const avgDamageRate = stats(damageRates).avg;

  // Score based on death rate (moderate is ideal for most genres)
  // 0 deaths = might be too easy, >5/min = probably too hard
  let score: number;
  if (avgDeathRate === 0 && avgDamageRate < 1) score = 30; // Too easy
  else if (avgDeathRate < 0.5) score = 60;
  else if (avgDeathRate < 2.0) score = 85; // Sweet spot for action games
  else if (avgDeathRate < 5.0) score = 65; // Challenging
  else score = 35; // Very hard

  return {
    name: 'difficulty',
    score: round(score),
    assessment: assessScore(score),
    explanation: `Average death rate: ${round(avgDeathRate, 2)}/min, damage events: ${round(avgDamageRate, 1)}/min`,
    recommendations: score < 50
      ? avgDeathRate === 0
        ? ['Consider adding more challenge', 'Increase enemy aggression or add hazards']
        : ['Reduce enemy damage or add more health pickups', 'Consider adding difficulty options', 'Add more telegraphing before attacks']
      : [],
  };
}

export function calculateEngagement(sessions: PlaytestSession[]): GameFeelScore {
  const explorationScores: number[] = [];
  const progressScores: number[] = [];

  for (const session of sessions) {
    if (session.samples.length < 10) continue;

    // Exploration: ratio of unique areas visited to total samples
    const cellSize = 100;
    const cells = new Set<string>();
    for (const sample of session.samples) {
      if (sample.pos && sample.pos.length >= 2) {
        cells.add(`${Math.floor(sample.pos[0] / cellSize)},${Math.floor(sample.pos[1] / cellSize)}`);
      }
    }
    explorationScores.push(cells.size / Math.max(1, session.samples.length) * 100);

    // Forward progress: how much distance was covered vs time
    if (session.summary.distance_traveled > 0 && session.duration_seconds > 0) {
      const speed = session.summary.distance_traveled / session.duration_seconds;
      progressScores.push(speed);
    }
  }

  if (explorationScores.length === 0) {
    return {
      name: 'engagement',
      score: 50,
      assessment: 'unknown',
      explanation: 'Insufficient data to assess engagement',
      recommendations: [],
    };
  }

  const avgExploration = stats(explorationScores).avg;
  // Normalize: 5% unique cells per sample = good exploration, <1% = stuck
  let score: number;
  if (avgExploration > 8) score = 90;
  else if (avgExploration > 4) score = 75;
  else if (avgExploration > 2) score = 55;
  else score = 35;

  return {
    name: 'engagement',
    score: round(score),
    assessment: assessScore(score),
    explanation: `Exploration diversity: ${round(avgExploration, 1)}% unique areas per sample`,
    recommendations: score < 50
      ? ['Player appears stuck or unengaged', 'Consider adding movement incentives', 'Check for confusing level design']
      : [],
  };
}

// ─── Frustration Detection ─────────────────────────────────────────────────

export interface FrustrationPoint {
  type: string;
  location?: number[];
  time_range?: [number, number];
  severity: 'low' | 'medium' | 'high';
  evidence: string;
  suggestion: string;
}

export function detectFrustrationPoints(
  session: PlaytestSession,
  sensitivity: 'low' | 'medium' | 'high' = 'medium'
): FrustrationPoint[] {
  const points: FrustrationPoint[] = [];
  const thresholds = {
    low: { deathCluster: 5, idleSeconds: 10, inputRate: 15, backtrackVisits: 4 },
    medium: { deathCluster: 3, idleSeconds: 5, inputRate: 10, backtrackVisits: 3 },
    high: { deathCluster: 2, idleSeconds: 3, inputRate: 8, backtrackVisits: 2 },
  }[sensitivity];

  // 1. Repeated deaths in same area
  const deaths = session.events.filter(e => e.type === 'death' && e.pos);
  const deathClusters = new Map<string, { pos: number[]; count: number; times: number[] }>();
  const clusterRadius = 100;

  for (const death of deaths) {
    let added = false;
    for (const [key, cluster] of deathClusters) {
      if (distance(death.pos!, cluster.pos) < clusterRadius) {
        cluster.count++;
        cluster.times.push(death.t);
        added = true;
        break;
      }
    }
    if (!added) {
      const key = `${Math.round(death.pos![0])},${Math.round(death.pos![1])}`;
      deathClusters.set(key, { pos: death.pos!, count: 1, times: [death.t] });
    }
  }

  for (const [_, cluster] of deathClusters) {
    if (cluster.count >= thresholds.deathCluster) {
      points.push({
        type: 'repeated_deaths',
        location: cluster.pos.map(v => round(v, 1)),
        severity: cluster.count >= 5 ? 'high' : cluster.count >= 3 ? 'medium' : 'low',
        evidence: `${cluster.count} deaths within ${clusterRadius} units at times [${cluster.times.map(t => round(t, 1)).join(', ')}]`,
        suggestion: 'Consider reducing difficulty in this area, adding checkpoints, or improving enemy telegraphing',
      });
    }
  }

  // 2. Long idle periods
  const samples = session.samples.filter(s => s.pos && s.pos.length >= 2);
  let idleStart: number | null = null;

  for (let i = 1; i < samples.length; i++) {
    const dist = distance(samples[i].pos, samples[i - 1].pos);
    if (dist < 2) {
      if (idleStart === null) idleStart = samples[i - 1].t;
    } else {
      if (idleStart !== null) {
        const idleDuration = samples[i].t - idleStart;
        if (idleDuration >= thresholds.idleSeconds) {
          points.push({
            type: 'idle_period',
            location: samples[i - 1].pos.map(v => round(v, 1)),
            time_range: [round(idleStart, 1), round(samples[i].t, 1)],
            severity: idleDuration >= 15 ? 'high' : idleDuration >= 8 ? 'medium' : 'low',
            evidence: `Player idle for ${round(idleDuration, 1)}s`,
            suggestion: 'Player may be confused or stuck — add visual hints, tutorials, or waypoint indicators',
          });
        }
        idleStart = null;
      }
    }
  }

  // 3. Input spam (rapid button mashing)
  if (session.inputs.length > 0) {
    const windowSize = 1.0; // 1 second windows
    for (let t = 0; t < session.duration_seconds; t += windowSize) {
      const windowInputs = session.inputs.filter(i => i.t >= t && i.t < t + windowSize);
      if (windowInputs.length >= thresholds.inputRate) {
        // Find player position at this time
        const posSample = samples.find(s => s.t >= t);
        points.push({
          type: 'input_spam',
          location: posSample?.pos?.map(v => round(v, 1)),
          time_range: [round(t, 1), round(t + windowSize, 1)],
          severity: windowInputs.length >= 15 ? 'high' : 'medium',
          evidence: `${windowInputs.length} inputs in 1 second`,
          suggestion: 'Rapid input spam may indicate frustration — check if the player is stuck or if controls feel unresponsive',
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  points.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return points;
}

// ─── Juice Coverage ────────────────────────────────────────────────────────

export interface JuiceAnalysisResult {
  actions_found: number;
  actions_with_feedback: number;
  coverage_percentage: number;
  actions: Array<{
    name: string;
    file: string;
    line: number;
    has_audio: boolean;
    has_particles: boolean;
    has_animation: boolean;
    has_tween: boolean;
    has_screen_effect: boolean;
    feedback_count: number;
  }>;
  unjuiced_actions: string[];
  recommendations: string[];
}

/**
 * Analyze GDScript files for juice/feedback coverage on player actions.
 * Scans for action functions and checks for associated feedback calls.
 */
export function analyzeJuiceCoverage(scripts: Array<{ path: string; content: string }>): JuiceAnalysisResult {
  const actions: JuiceAnalysisResult['actions'] = [];

  // Patterns that indicate player actions
  const actionPatterns = [
    /func\s+(attack|shoot|fire|slash|swing|cast|throw|punch|kick|hit)\b/gi,
    /func\s+(jump|dash|dodge|roll|slide|sprint|climb)\b/gi,
    /func\s+(pickup|collect|grab|use_item|consume|equip)\b/gi,
    /func\s+(interact|open|activate|toggle|switch|push|pull)\b/gi,
    /func\s+(take_damage|hurt|die|respawn|heal)\b/gi,
    /func\s+(land|wall_jump|double_jump|ground_pound)\b/gi,
  ];

  // Patterns that indicate feedback
  const feedbackPatterns = {
    audio: /\b(play|stream|AudioStreamPlayer|\.play\(\)|sfx|sound|audio)/i,
    particles: /\b(GPUParticles|particles|emit|emitting|particle_system)/i,
    animation: /\b(AnimationPlayer|\.play\(|animation|anim_player|sprite_frames)/i,
    tween: /\b(Tween|create_tween|tween_property|tween_method|interpolate)/i,
    screen_effect: /\b(shake|screen_shake|flash|camera_shake|modulate|ChromaticAberration|hitstop|freeze_frame)/i,
  };

  for (const script of scripts) {
    const lines = script.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of actionPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (!match) continue;

        const funcName = match[1];
        // Check lines within the function body (next 30 lines or until next func)
        const bodyLines: string[] = [];
        for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
          if (/^func\s+/.test(lines[j]) || /^class\s+/.test(lines[j])) break;
          bodyLines.push(lines[j]);
        }
        const body = bodyLines.join('\n');

        const hasAudio = feedbackPatterns.audio.test(body);
        const hasParticles = feedbackPatterns.particles.test(body);
        const hasAnimation = feedbackPatterns.animation.test(body);
        const hasTween = feedbackPatterns.tween.test(body);
        const hasScreenEffect = feedbackPatterns.screen_effect.test(body);

        const feedbackCount = [hasAudio, hasParticles, hasAnimation, hasTween, hasScreenEffect].filter(Boolean).length;

        actions.push({
          name: funcName,
          file: script.path,
          line: i + 1,
          has_audio: hasAudio,
          has_particles: hasParticles,
          has_animation: hasAnimation,
          has_tween: hasTween,
          has_screen_effect: hasScreenEffect,
          feedback_count: feedbackCount,
        });
      }
    }
  }

  // Deduplicate by function name (keep richest feedback)
  const uniqueActions = new Map<string, typeof actions[0]>();
  for (const action of actions) {
    const existing = uniqueActions.get(action.name);
    if (!existing || action.feedback_count > existing.feedback_count) {
      uniqueActions.set(action.name, action);
    }
  }

  const deduped = Array.from(uniqueActions.values());
  const withFeedback = deduped.filter(a => a.feedback_count > 0);
  const unjuiced = deduped.filter(a => a.feedback_count === 0).map(a => a.name);

  const coverage = deduped.length > 0 ? round((withFeedback.length / deduped.length) * 100, 1) : 0;

  const recommendations: string[] = [];
  if (unjuiced.length > 0) {
    recommendations.push(`Add audio/visual feedback to: ${unjuiced.join(', ')}`);
  }
  const noAudio = deduped.filter(a => !a.has_audio && a.feedback_count > 0);
  if (noAudio.length > 0) {
    recommendations.push(`Add sound effects to: ${noAudio.map(a => a.name).join(', ')}`);
  }
  const noScreenEffect = deduped.filter(a => ['attack', 'take_damage', 'die', 'hit', 'hurt'].includes(a.name) && !a.has_screen_effect);
  if (noScreenEffect.length > 0) {
    recommendations.push(`Consider adding screen shake/flash for: ${noScreenEffect.map(a => a.name).join(', ')}`);
  }

  return {
    actions_found: deduped.length,
    actions_with_feedback: withFeedback.length,
    coverage_percentage: coverage,
    actions: deduped,
    unjuiced_actions: unjuiced,
    recommendations,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function assessScore(score: number): string {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  if (score >= 30) return 'below_average';
  return 'poor';
}
