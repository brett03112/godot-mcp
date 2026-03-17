/**
 * Heatmap Generator (Tier 4 — Phase A)
 *
 * Computes 2D grid intensity data from playtest sessions and
 * generates both JSON (AI-readable) and HTML (human-viewable) output.
 */

import { PlaytestSession, distance, round } from './playtest-session.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export type HeatmapType = 'position' | 'death' | 'damage' | 'pickup' | 'time_spent';

export interface HeatmapCell {
  /** Grid column */
  col: number;
  /** Grid row */
  row: number;
  /** World X center */
  x: number;
  /** World Y center */
  y: number;
  /** Intensity value (raw count or accumulated time) */
  intensity: number;
  /** Normalized intensity 0-1 */
  normalized: number;
}

export interface HeatmapData {
  type: HeatmapType;
  session_ids: string[];
  cell_size: number;
  grid_cols: number;
  grid_rows: number;
  bounds: { min_x: number; min_y: number; max_x: number; max_y: number };
  total_points: number;
  max_intensity: number;
  cells: HeatmapCell[];
  /** Top hotspots sorted by intensity descending */
  hotspots: Array<{ x: number; y: number; intensity: number; normalized: number }>;
}

export interface HeatmapOptions {
  type: HeatmapType;
  sessions: PlaytestSession[];
  cellSize?: number;
  /** Max number of hotspots to return */
  maxHotspots?: number;
}

// ─── Heatmap Computation ───────────────────────────────────────────────────

/**
 * Compute heatmap grid data from playtest sessions
 */
export function computeHeatmap(options: HeatmapOptions): HeatmapData {
  const { type, sessions, cellSize = 64, maxHotspots = 20 } = options;

  // Collect relevant points based on type
  const points = collectPoints(type, sessions);

  if (points.length === 0) {
    return {
      type,
      session_ids: sessions.map(s => s.session_id),
      cell_size: cellSize,
      grid_cols: 0,
      grid_rows: 0,
      bounds: { min_x: 0, min_y: 0, max_x: 0, max_y: 0 },
      total_points: 0,
      max_intensity: 0,
      cells: [],
      hotspots: [],
    };
  }

  // Compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  // Add padding
  const padding = cellSize;
  minX = Math.floor((minX - padding) / cellSize) * cellSize;
  minY = Math.floor((minY - padding) / cellSize) * cellSize;
  maxX = Math.ceil((maxX + padding) / cellSize) * cellSize;
  maxY = Math.ceil((maxY + padding) / cellSize) * cellSize;

  const gridCols = Math.ceil((maxX - minX) / cellSize);
  const gridRows = Math.ceil((maxY - minY) / cellSize);

  // Accumulate into grid
  const grid = new Map<string, number>();
  for (const p of points) {
    const col = Math.floor((p.x - minX) / cellSize);
    const row = Math.floor((p.y - minY) / cellSize);
    const key = `${col},${row}`;
    grid.set(key, (grid.get(key) || 0) + p.weight);
  }

  // Find max intensity for normalization
  let maxIntensity = 0;
  for (const val of grid.values()) {
    if (val > maxIntensity) maxIntensity = val;
  }

  // Build cell array (only non-zero cells)
  const cells: HeatmapCell[] = [];
  for (const [key, intensity] of grid.entries()) {
    const [col, row] = key.split(',').map(Number);
    cells.push({
      col,
      row,
      x: round(minX + (col + 0.5) * cellSize, 1),
      y: round(minY + (row + 0.5) * cellSize, 1),
      intensity: round(intensity, 2),
      normalized: maxIntensity > 0 ? round(intensity / maxIntensity, 3) : 0,
    });
  }

  // Sort by intensity descending and extract hotspots
  cells.sort((a, b) => b.intensity - a.intensity);
  const hotspots = cells.slice(0, maxHotspots).map(c => ({
    x: c.x,
    y: c.y,
    intensity: c.intensity,
    normalized: c.normalized,
  }));

  return {
    type,
    session_ids: sessions.map(s => s.session_id),
    cell_size: cellSize,
    grid_cols: gridCols,
    grid_rows: gridRows,
    bounds: {
      min_x: round(minX, 1),
      min_y: round(minY, 1),
      max_x: round(maxX, 1),
      max_y: round(maxY, 1),
    },
    total_points: points.length,
    max_intensity: round(maxIntensity, 2),
    cells,
    hotspots,
  };
}

// ─── Point Collection ──────────────────────────────────────────────────────

interface WeightedPoint {
  x: number;
  y: number;
  weight: number;
}

function collectPoints(type: HeatmapType, sessions: PlaytestSession[]): WeightedPoint[] {
  const points: WeightedPoint[] = [];

  for (const session of sessions) {
    switch (type) {
      case 'position':
        for (const sample of session.samples) {
          if (sample.pos && sample.pos.length >= 2) {
            points.push({ x: sample.pos[0], y: sample.pos[1], weight: 1 });
          }
        }
        break;

      case 'death':
        for (const event of session.events) {
          if (event.type === 'death' && event.pos && event.pos.length >= 2) {
            points.push({ x: event.pos[0], y: event.pos[1], weight: 1 });
          }
        }
        break;

      case 'damage':
        for (const event of session.events) {
          if (event.type === 'damage' && event.pos && event.pos.length >= 2) {
            const amount = event.details?.amount || 1;
            points.push({ x: event.pos[0], y: event.pos[1], weight: amount });
          }
        }
        break;

      case 'pickup':
        for (const event of session.events) {
          if (event.type === 'pickup' && event.pos && event.pos.length >= 2) {
            points.push({ x: event.pos[0], y: event.pos[1], weight: 1 });
          }
        }
        break;

      case 'time_spent': {
        // Weight each position sample by the time between samples
        const samples = session.samples.filter(s => s.pos && s.pos.length >= 2);
        for (let i = 0; i < samples.length; i++) {
          const dt = i < samples.length - 1
            ? samples[i + 1].t - samples[i].t
            : session.samples.length > 0
              ? (session.samples[session.samples.length - 1].t - session.samples[0].t) / session.samples.length
              : 1;
          points.push({ x: samples[i].pos[0], y: samples[i].pos[1], weight: dt });
        }
        break;
      }
    }
  }

  return points;
}

// ─── HTML Visualization ────────────────────────────────────────────────────

/**
 * Generate an HTML file with interactive SVG heatmap visualization
 */
export function generateHeatmapHtml(data: HeatmapData): string {
  if (data.cells.length === 0) {
    return `<!DOCTYPE html><html><body><h2>Empty Heatmap</h2><p>No data points for type: ${data.type}</p></body></html>`;
  }

  const { bounds, cell_size } = data;
  const width = bounds.max_x - bounds.min_x;
  const height = bounds.max_y - bounds.min_y;

  // Scale to fit in a reasonable viewport
  const maxViewSize = 800;
  const scale = Math.min(maxViewSize / width, maxViewSize / height, 1);
  const viewWidth = Math.ceil(width * scale);
  const viewHeight = Math.ceil(height * scale);
  const cellW = Math.ceil(cell_size * scale);
  const cellH = Math.ceil(cell_size * scale);

  // Generate SVG cells
  const svgCells = data.cells.map(cell => {
    const x = Math.round((cell.x - cell_size / 2 - bounds.min_x) * scale);
    const y = Math.round((cell.y - cell_size / 2 - bounds.min_y) * scale);
    const color = intensityToColor(cell.normalized);
    return `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${color}" opacity="0.7"><title>(${cell.x}, ${cell.y}) intensity: ${cell.intensity}</title></rect>`;
  }).join('\n    ');

  // Generate hotspot markers
  const hotspotMarkers = data.hotspots.slice(0, 10).map((h, i) => {
    const x = Math.round((h.x - bounds.min_x) * scale);
    const y = Math.round((h.y - bounds.min_y) * scale);
    return `<circle cx="${x}" cy="${y}" r="6" fill="white" stroke="black" stroke-width="1.5"><title>#${i + 1}: (${h.x}, ${h.y}) intensity: ${h.intensity}</title></circle>`;
  }).join('\n    ');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Heatmap: ${data.type} — ${data.session_ids.join(', ')}</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #1a1a2e; color: #e0e0e0; margin: 20px; }
    h2 { margin: 0 0 10px; }
    .info { font-size: 13px; color: #aaa; margin-bottom: 15px; }
    svg { border: 1px solid #333; background: #16213e; display: block; }
    .legend { display: flex; align-items: center; margin-top: 10px; gap: 5px; font-size: 12px; }
    .legend-bar { width: 200px; height: 15px; background: linear-gradient(to right, #0d1b2a, #1b3a4b, #2d6a4f, #95d5b2, #ffd166, #ef476f, #ff0000); border-radius: 3px; }
  </style>
</head>
<body>
  <h2>Heatmap: ${data.type}</h2>
  <div class="info">
    Sessions: ${data.session_ids.length} | Points: ${data.total_points} |
    Cell size: ${data.cell_size} | Max intensity: ${data.max_intensity} |
    Grid: ${data.grid_cols}x${data.grid_rows}
  </div>
  <svg width="${viewWidth}" height="${viewHeight}" viewBox="0 0 ${viewWidth} ${viewHeight}">
    ${svgCells}
    ${hotspotMarkers}
  </svg>
  <div class="legend">
    <span>Low</span>
    <div class="legend-bar"></div>
    <span>High</span>
  </div>
</body>
</html>`;
}

/**
 * Map normalized intensity (0-1) to a hex color
 */
function intensityToColor(normalized: number): string {
  // Blue -> Cyan -> Green -> Yellow -> Red
  const stops = [
    [0.0, 13, 27, 42],      // dark blue
    [0.2, 27, 58, 75],      // blue
    [0.4, 45, 106, 79],     // green
    [0.6, 149, 213, 178],   // light green
    [0.8, 255, 209, 102],   // yellow
    [1.0, 239, 71, 111],    // red
  ];

  // Find the two stops to interpolate between
  let lower = stops[0], upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (normalized >= stops[i][0] && normalized <= stops[i + 1][0]) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = (upper[0] as number) - (lower[0] as number);
  const t = range > 0 ? (normalized - (lower[0] as number)) / range : 0;

  const r = Math.round((lower[1] as number) + t * ((upper[1] as number) - (lower[1] as number)));
  const g = Math.round((lower[2] as number) + t * ((upper[2] as number) - (lower[2] as number)));
  const b = Math.round((lower[3] as number) + t * ((upper[3] as number) - (lower[3] as number)));

  return `rgb(${r},${g},${b})`;
}
