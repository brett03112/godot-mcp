/**
 * Visual QA and screenshot diff tools for Phase 4.4.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { deflateSync, inflateSync } from 'zlib';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

interface DecodedPng {
  width: number;
  height: number;
  data: Buffer;
}

interface DiffResult {
  changedPixels: number;
  totalPixels: number;
  changeRatio: number;
  maxDelta: number;
  diffBounds: { x: number; y: number; width: number; height: number } | null;
  diffImage: Buffer;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContrastCheck {
  path: string;
  ratio: number | null;
  passes: boolean;
  reason?: string;
  foreground?: string;
  background?: string;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function registerVisualQaTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    screenshotCompare(ctx),
    captureEditorViewport(registry),
    captureRuntimeViewport(registry),
    visualRegressionBaselineCreate(ctx),
    visualRegressionCheck(ctx),
    uiOverlapCheck(ctx),
    uiContrastCheck(ctx),
    spriteBoundsCheck(ctx),
    cameraFramingCheck(ctx),
  ]);
}

function screenshotCompare(ctx: ServerContext): ToolDefinition {
  return {
    name: 'screenshot_compare',
    description: 'Compare two PNG screenshots and report changed pixels, change ratio, and changed bounding region.',
    inputSchema: {
      type: 'object',
      properties: visualQaProperties({
        before_path: { type: 'string' },
        after_path: { type: 'string' },
        diff_output_path: { type: 'string' },
        pixel_threshold: { type: 'number' },
        threshold_ratio: { type: 'number' },
      }),
      required: ['project_path', 'before_path', 'after_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.beforePath) return failure('before_path is required');
      if (!args.afterPath) return failure('after_path is required');

      const before = resolveProjectFile(target.projectRoot, args.beforePath);
      if ('error' in before) return failure(before.error);
      const after = resolveProjectFile(target.projectRoot, args.afterPath);
      if ('error' in after) return failure(after.error);
      if (!existsSync(before.absolutePath)) return failure(`before_path not found: ${args.beforePath}`);
      if (!existsSync(after.absolutePath)) return failure(`after_path not found: ${args.afterPath}`);

      try {
        const diff = comparePngFiles(before.absolutePath, after.absolutePath, args.pixelThreshold ?? 0);
        let diffOutputPath: string | null = null;
        if (args.diffOutputPath) {
          const output = resolveProjectFile(target.projectRoot, args.diffOutputPath);
          if ('error' in output) return failure(output.error);
          mkdirSync(dirname(output.absolutePath), { recursive: true });
          writePng(output.absolutePath, diff.diffImage, readPng(before.absolutePath).width, readPng(before.absolutePath).height);
          diffOutputPath = output.relativePath;
        }
        const thresholdRatio = args.thresholdRatio ?? 0;
        const status = diff.changeRatio <= thresholdRatio ? 'success' : 'failed';
        return jsonResponse({
          status,
          before_path: before.relativePath,
          after_path: after.relativePath,
          diff_output_path: diffOutputPath,
          changed_pixels: diff.changedPixels,
          total_pixels: diff.totalPixels,
          change_ratio: diff.changeRatio,
          threshold_ratio: thresholdRatio,
          pixel_threshold: args.pixelThreshold ?? 0,
          max_delta: diff.maxDelta,
          diff_bounds: diff.diffBounds,
        }, status === 'failed');
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function captureEditorViewport(registry: ToolRegistry): ToolDefinition {
  return {
    name: 'capture_editor_viewport',
    description: 'Capture a live Godot editor viewport screenshot through the existing editor_screenshot live tool.',
    inputSchema: {
      type: 'object',
      properties: visualQaProperties({
        output_path: { type: 'string' },
        viewport: { type: 'string', enum: ['2d', '3d'] },
        viewport_index: { type: 'number' },
        session_id: { type: 'string' },
        timeout_ms: { type: 'number' },
      }),
      required: ['project_path'],
    },
    timeout: 60000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(rawArgs || {});
      const outputPath = args.outputPath || defaultCapturePath('editor');
      try {
        return await registry.dispatch('editor_screenshot', {
          project_path: args.projectPath,
          session_id: args.sessionId,
          output_path: outputPath,
          viewport: args.viewport || '2d',
          viewport_index: args.viewportIndex ?? 0,
          timeout_ms: args.timeoutMs,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function captureRuntimeViewport(registry: ToolRegistry): ToolDefinition {
  return {
    name: 'capture_runtime_viewport',
    description: 'Capture a runtime viewport screenshot by delegating to the existing capture_viewport scene runner.',
    inputSchema: {
      type: 'object',
      properties: visualQaProperties({
        output_path: { type: 'string' },
        scene_path: { type: 'string' },
        delay_frames: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      }),
      required: ['project_path'],
    },
    timeout: 90000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(rawArgs || {});
      const outputPath = args.outputPath || defaultCapturePath('runtime');
      try {
        return await registry.dispatch('capture_viewport', {
          project_path: args.projectPath,
          output_path: outputPath,
          scene_path: args.scenePath,
          delay_frames: args.delayFrames,
          width: args.width,
          height: args.height,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function visualRegressionBaselineCreate(ctx: ServerContext): ToolDefinition {
  return {
    name: 'visual_regression_baseline_create',
    description: 'Create or replace a project-local .mcp_visual PNG baseline from an existing screenshot.',
    inputSchema: {
      type: 'object',
      properties: visualQaProperties({
        baseline_name: { type: 'string' },
        source_path: { type: 'string' },
        overwrite: { type: 'boolean' },
      }),
      required: ['project_path', 'baseline_name', 'source_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.baselineName) return failure('baseline_name is required');
      if (!args.sourcePath) return failure('source_path is required');

      const source = resolveProjectFile(target.projectRoot, args.sourcePath);
      if ('error' in source) return failure(source.error);
      if (!existsSync(source.absolutePath)) return failure(`source_path not found: ${args.sourcePath}`);
      const baseline = baselinePath(target.projectRoot, args.baselineName);
      if (existsSync(baseline.absolutePath) && args.overwrite === false) {
        return failure(`baseline already exists: ${baseline.relativePath}`);
      }
      mkdirSync(dirname(baseline.absolutePath), { recursive: true });
      copyFileSync(source.absolutePath, baseline.absolutePath);
      const image = readPng(baseline.absolutePath);
      const metadata = {
        baseline_name: sanitizeBaselineName(args.baselineName),
        baseline_path: baseline.relativePath,
        source_path: source.relativePath,
        width: image.width,
        height: image.height,
        created_at: new Date().toISOString(),
      };
      writeFileSync(baseline.absolutePath.replace(/\.png$/i, '.json'), JSON.stringify(metadata, null, 2), 'utf8');
      return jsonResponse({
        status: 'success',
        ...metadata,
      });
    },
  };
}

function visualRegressionCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'visual_regression_check',
    description: 'Compare a current screenshot against a .mcp_visual baseline and fail when changed ratio exceeds threshold.',
    inputSchema: {
      type: 'object',
      properties: visualQaProperties({
        baseline_name: { type: 'string' },
        baseline_path: { type: 'string' },
        current_path: { type: 'string' },
        diff_output_path: { type: 'string' },
        pixel_threshold: { type: 'number' },
        threshold_ratio: { type: 'number' },
      }),
      required: ['project_path', 'current_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.currentPath) return failure('current_path is required');
      if (!args.baselineName && !args.baselinePath) return failure('baseline_name or baseline_path is required');

      const baseline = args.baselinePath
        ? resolveProjectFile(target.projectRoot, args.baselinePath)
        : baselinePath(target.projectRoot, args.baselineName);
      if ('error' in baseline) return failure(baseline.error);
      const current = resolveProjectFile(target.projectRoot, args.currentPath);
      if ('error' in current) return failure(current.error);
      if (!existsSync(baseline.absolutePath)) return failure(`baseline not found: ${baseline.relativePath}`);
      if (!existsSync(current.absolutePath)) return failure(`current_path not found: ${args.currentPath}`);

      try {
        const diff = comparePngFiles(baseline.absolutePath, current.absolutePath, args.pixelThreshold ?? 0);
        let diffOutputPath: string | null = null;
        if (args.diffOutputPath) {
          const output = resolveProjectFile(target.projectRoot, args.diffOutputPath);
          if ('error' in output) return failure(output.error);
          mkdirSync(dirname(output.absolutePath), { recursive: true });
          const baselineImage = readPng(baseline.absolutePath);
          writePng(output.absolutePath, diff.diffImage, baselineImage.width, baselineImage.height);
          diffOutputPath = output.relativePath;
        }
        const thresholdRatio = args.thresholdRatio ?? 0;
        const regression = diff.changeRatio > thresholdRatio;
        return jsonResponse({
          status: regression ? 'failed' : 'success',
          regression,
          baseline_path: baseline.relativePath,
          current_path: current.relativePath,
          diff_output_path: diffOutputPath,
          changed_pixels: diff.changedPixels,
          total_pixels: diff.totalPixels,
          change_ratio: diff.changeRatio,
          threshold_ratio: thresholdRatio,
          pixel_threshold: args.pixelThreshold ?? 0,
          max_delta: diff.maxDelta,
          diff_bounds: diff.diffBounds,
        }, regression);
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function uiOverlapCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'ui_overlap_check',
    description: 'Inspect a UI scene and report visible Control rectangles that overlap above a minimum area.',
    inputSchema: {
      type: 'object',
      properties: visualQaProperties({
        scene_path: { type: 'string' },
        viewport_size: {},
        min_overlap_area: { type: 'number' },
        include_hidden: { type: 'boolean' },
      }),
      required: ['project_path', 'scene_path'],
    },
    timeout: 60000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.scenePath) return failure('scene_path is required');
      const parsed = await executeJsonOperation(ctx, target.projectRoot, 'ui_inspect_layout', {
        scene_path: args.scenePath,
        viewport_size: args.viewportSize || [1152, 648],
      });
      if ('error' in parsed) return failure(parsed.error);

      const controls = Array.isArray(parsed.data.controls) ? parsed.data.controls : [];
      const issues = findOverlapIssues(controls, args.minOverlapArea ?? 1, args.includeHidden ?? false);
      return jsonResponse({
        status: issues.length === 0 ? 'success' : 'failed',
        scene_path: parsed.data.scene_path || args.scenePath,
        viewport_size: parsed.data.viewport_size || args.viewportSize || [1152, 648],
        checked_controls: controls.length,
        issue_count: issues.length,
        issues,
      }, issues.length > 0);
    },
  };
}

function uiContrastCheck(ctx: ServerContext): ToolDefinition {
  return {
    name: 'ui_contrast_check',
    description: 'Check UI foreground/background color samples against a WCAG-style contrast ratio threshold.',
    inputSchema: {
      type: 'object',
      properties: visualQaProperties({
        scene_path: { type: 'string' },
        samples: { type: 'array', items: { type: 'object' } },
        min_ratio: { type: 'number' },
      }),
      required: ['project_path', 'scene_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.scenePath) return failure('scene_path is required');
      const minRatio = args.minRatio ?? 4.5;
      const samples = Array.isArray(args.samples) ? args.samples : [];
      const checks: ContrastCheck[] = samples.map((sample: any) => {
        const foreground = parseColor(sample.foreground ?? sample.fg ?? sample.text_color ?? sample.font_color);
        const background = parseColor(sample.background ?? sample.bg ?? sample.background_color ?? sample.panel_color);
        if (!foreground || !background) {
          return {
            path: sample.path || '',
            ratio: null,
            passes: false,
            reason: 'invalid_color_sample',
          };
        }
        const ratio = contrastRatio(foreground, background);
        return {
          path: sample.path || '',
          ratio,
          passes: ratio >= minRatio,
          foreground: colorToHex(foreground),
          background: colorToHex(background),
        };
      });
      const issues = checks
        .filter((check: ContrastCheck) => check.passes === false)
        .map((check: ContrastCheck) => ({
          kind: check.reason || 'low_contrast',
          path: check.path,
          ratio: check.ratio,
          min_ratio: minRatio,
          foreground: check.foreground,
          background: check.background,
        }));
      return jsonResponse({
        status: issues.length === 0 ? 'success' : 'failed',
        scene_path: args.scenePath,
        checked_samples: checks.length,
        min_ratio: minRatio,
        issue_count: issues.length,
        issues,
        checks,
        warnings: checks.length === 0 ? ['No color samples were provided; pass samples with foreground and background colors for deterministic contrast checks.'] : [],
      }, issues.length > 0);
    },
  };
}

function spriteBoundsCheck(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'sprite_bounds_check',
    description: 'Inspect Sprite2D bounds in a scene and report missing textures or sprites outside the viewport.',
    operation: 'visual_sprite_bounds_check',
    required: ['project_path', 'scene_path'],
    properties: visualQaProperties({
      scene_path: { type: 'string' },
      viewport_size: {},
      margin: { type: 'number' },
      include_hidden: { type: 'boolean' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      viewport_size: args.viewportSize || [1152, 648],
      margin: args.margin ?? 0,
      include_hidden: args.includeHidden ?? false,
    }),
  });
}

function cameraFramingCheck(ctx: ServerContext): ToolDefinition {
  return operationTool(ctx, {
    name: 'camera_framing_check',
    description: 'Check that target nodes are inside a Camera2D viewport framing rectangle.',
    operation: 'visual_camera_framing_check',
    required: ['project_path', 'scene_path', 'camera_path'],
    properties: visualQaProperties({
      scene_path: { type: 'string' },
      camera_path: { type: 'string' },
      target_paths: { type: 'array', items: { type: 'string' } },
      viewport_size: {},
      margin: { type: 'number' },
    }),
    mapParams: (args) => ({
      scene_path: args.scenePath,
      camera_path: args.cameraPath,
      target_paths: Array.isArray(args.targetPaths) ? args.targetPaths : [],
      viewport_size: args.viewportSize || [1152, 648],
      margin: args.margin ?? 0,
    }),
  });
}

function operationTool(ctx: ServerContext, config: {
  name: string;
  description: string;
  operation: string;
  properties: Record<string, any>;
  required: string[];
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
    handler: async (rawArgs) => {
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
      const parsed = await executeJsonOperation(ctx, target.projectRoot, config.operation, config.mapParams(args));
      if ('error' in parsed) return failure(parsed.error);
      const issueCount = Number(parsed.data.issue_count ?? 0);
      const failed = parsed.data.valid === false || issueCount > 0;
      return jsonResponse({
        status: failed ? 'failed' : 'success',
        ...parsed.data,
      }, failed);
    },
  };
}

async function executeJsonOperation(ctx: ServerContext, projectRoot: string, operation: string, params: Record<string, any>): Promise<{ data: any } | { error: string }> {
  try {
    const result = await ctx.executeOperation(operation, params, projectRoot);
    const parsed = parseGodotJson(result.stdout);
    if (!parsed) {
      return { error: result.stderr || result.stdout || `No JSON result returned by ${operation}` };
    }
    if (parsed.success === false) {
      return { error: parsed.reason || parsed.message || `${operation} failed` };
    }
    return { data: parsed };
  } catch (error: any) {
    return { error: error?.message || String(error) };
  }
}

function comparePngFiles(beforePath: string, afterPath: string, pixelThreshold: number): DiffResult {
  const before = readPng(beforePath);
  const after = readPng(afterPath);
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error(`PNG dimensions differ: ${before.width}x${before.height} vs ${after.width}x${after.height}`);
  }
  return diffPng(before, after, pixelThreshold);
}

function diffPng(before: DecodedPng, after: DecodedPng, pixelThreshold: number): DiffResult {
  const diffImage = Buffer.alloc(before.width * before.height * 4);
  let changedPixels = 0;
  let maxDelta = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < before.height; y += 1) {
    for (let x = 0; x < before.width; x += 1) {
      const index = (y * before.width + x) * 4;
      const delta = Math.max(
        Math.abs(before.data[index] - after.data[index]),
        Math.abs(before.data[index + 1] - after.data[index + 1]),
        Math.abs(before.data[index + 2] - after.data[index + 2]),
        Math.abs(before.data[index + 3] - after.data[index + 3]),
      );
      maxDelta = Math.max(maxDelta, delta);
      if (delta > pixelThreshold) {
        changedPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        diffImage[index] = 255;
        diffImage[index + 1] = 0;
        diffImage[index + 2] = 0;
        diffImage[index + 3] = 255;
      } else {
        diffImage[index] = 0;
        diffImage[index + 1] = 0;
        diffImage[index + 2] = 0;
        diffImage[index + 3] = 0;
      }
    }
  }
  const totalPixels = before.width * before.height;
  return {
    changedPixels,
    totalPixels,
    changeRatio: totalPixels === 0 ? 0 : changedPixels / totalPixels,
    maxDelta,
    diffBounds: changedPixels === 0 ? null : {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    diffImage,
  };
}

function readPng(filePath: string): DecodedPng {
  const bytes = readFileSync(filePath);
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    offset += 4;
    const type = bytes.subarray(offset, offset + 4).toString('ascii');
    offset += 4;
    const data = bytes.subarray(offset, offset + length);
    offset += length + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
  if (interlace !== 0) throw new Error('Interlaced PNG files are not supported');
  const channels = channelsForColorType(colorType);
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const raw = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    unfilterRow(filter, row, raw, y, stride, channels);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    if (colorType === 6) {
      raw.copy(rgba, target, source, source + 4);
    } else if (colorType === 2) {
      rgba[target] = raw[source];
      rgba[target + 1] = raw[source + 1];
      rgba[target + 2] = raw[source + 2];
      rgba[target + 3] = 255;
    } else if (colorType === 0) {
      rgba[target] = raw[source];
      rgba[target + 1] = raw[source];
      rgba[target + 2] = raw[source];
      rgba[target + 3] = 255;
    } else if (colorType === 4) {
      rgba[target] = raw[source];
      rgba[target + 1] = raw[source];
      rgba[target + 2] = raw[source];
      rgba[target + 3] = raw[source + 1];
    }
  }
  return { width, height, data: rgba };
}

function channelsForColorType(colorType: number): number {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type: ${colorType}`);
}

function unfilterRow(filter: number, row: Buffer, output: Buffer, y: number, stride: number, bpp: number): void {
  const rowStart = y * stride;
  const prevStart = (y - 1) * stride;
  for (let x = 0; x < stride; x += 1) {
    const raw = row[x];
    const left = x >= bpp ? output[rowStart + x - bpp] : 0;
    const up = y > 0 ? output[prevStart + x] : 0;
    const upLeft = y > 0 && x >= bpp ? output[prevStart + x - bpp] : 0;
    let value: number;
    if (filter === 0) value = raw;
    else if (filter === 1) value = raw + left;
    else if (filter === 2) value = raw + up;
    else if (filter === 3) value = raw + Math.floor((left + up) / 2);
    else if (filter === 4) value = raw + paeth(left, up, upLeft);
    else throw new Error(`Unsupported PNG filter: ${filter}`);
    output[rowStart + x] = value & 255;
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function writePng(filePath: string, rgba: Buffer, width: number, height: number): void {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunks = [
    pngChunk('IHDR', Buffer.from([...u32(width), ...u32(height), 8, 6, 0, 0, 0])),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ];
  writeFileSync(filePath, Buffer.concat([PNG_SIGNATURE, ...chunks]));
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([
    Buffer.from(u32(data.length)),
    typeBuffer,
    data,
    Buffer.from(u32(crc32(Buffer.concat([typeBuffer, data])))),
  ]);
}

function u32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findOverlapIssues(controls: any[], minArea: number, includeHidden: boolean): any[] {
  const visibleControls = controls.filter((control) => {
    if (control.path === '.') return false;
    if (includeHidden) return true;
    return control.visible !== false;
  });
  const issues: any[] = [];
  for (let i = 0; i < visibleControls.length; i += 1) {
    for (let j = i + 1; j < visibleControls.length; j += 1) {
      const a = rectFromControl(visibleControls[i]);
      const b = rectFromControl(visibleControls[j]);
      if (!a || !b) continue;
      const overlap = intersectRect(a, b);
      if (!overlap) continue;
      const area = overlap.width * overlap.height;
      if (area >= minArea) {
        issues.push({
          kind: 'ui_overlap',
          controls: [visibleControls[i].path, visibleControls[j].path],
          area,
          overlap_rect: overlap,
        });
      }
    }
  }
  return issues;
}

function rectFromControl(control: any): Rect | null {
  const rect = control?.rect;
  if (!rect) return null;
  const candidate = {
    x: Number(rect.x ?? 0),
    y: Number(rect.y ?? 0),
    width: Number(rect.width ?? 0),
    height: Number(rect.height ?? 0),
  };
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) || !Number.isFinite(candidate.width) || !Number.isFinite(candidate.height)) {
    return null;
  }
  if (candidate.width <= 0 || candidate.height <= 0) return null;
  return candidate;
}

function intersectRect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function parseColor(value: any): [number, number, number] | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
    }
    const colorMatch = trimmed.match(/Color\(([^)]+)\)/i);
    if (colorMatch) {
      return parseColor(colorMatch[1].split(',').map((part) => Number.parseFloat(part.trim())));
    }
  }
  if (Array.isArray(value) && value.length >= 3) {
    const rgb = value.slice(0, 3).map((part) => Number(part));
    if (rgb.every((part) => Number.isFinite(part))) {
      const scale = rgb.every((part) => part >= 0 && part <= 1) ? 255 : 1;
      return [clampColor(rgb[0] * scale), clampColor(rgb[1] * scale), clampColor(rgb[2] * scale)];
    }
  }
  if (value && typeof value === 'object') {
    return parseColor([value.r, value.g, value.b]);
  }
  return null;
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: [number, number, number]): number {
  const [r, g, b] = color.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorToHex(color: [number, number, number]): string {
  return `#${color.map((channel) => clampColor(channel).toString(16).padStart(2, '0')).join('')}`;
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

function baselinePath(projectRoot: string, name: string): { absolutePath: string; relativePath: string } {
  const filename = `${sanitizeBaselineName(name)}.png`;
  const relativePath = join('.mcp_visual', 'baselines', filename).replace(/\\/g, '/');
  return {
    absolutePath: join(projectRoot, relativePath),
    relativePath,
  };
}

function sanitizeBaselineName(value: string): string {
  return String(value || 'baseline')
    .replace(/\.png$/i, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'baseline';
}

function defaultCapturePath(kind: string): string {
  return `.mcp_visual/captures/${kind}_${Date.now()}.png`;
}

function visualQaProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    ...extra,
  };
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    beforePath: args.beforePath ?? args.before_path,
    afterPath: args.afterPath ?? args.after_path,
    diffOutputPath: args.diffOutputPath ?? args.diff_output_path,
    sourcePath: args.sourcePath ?? args.source_path,
    currentPath: args.currentPath ?? args.current_path,
    baselineName: args.baselineName ?? args.baseline_name,
    baselinePath: args.baselinePath ?? args.baseline_path,
    outputPath: args.outputPath ?? args.output_path,
    scenePath: args.scenePath ?? args.scene_path,
    viewportSize: args.viewportSize ?? args.viewport_size,
    minOverlapArea: args.minOverlapArea ?? args.min_overlap_area,
    minRatio: args.minRatio ?? args.min_ratio,
    thresholdRatio: args.thresholdRatio ?? args.threshold_ratio,
    pixelThreshold: args.pixelThreshold ?? args.pixel_threshold,
    cameraPath: args.cameraPath ?? args.camera_path,
    targetPaths: args.targetPaths ?? args.target_paths,
    includeHidden: args.includeHidden ?? args.include_hidden,
    delayFrames: args.delayFrames ?? args.delay_frames,
    viewportIndex: args.viewportIndex ?? args.viewport_index,
    sessionId: args.sessionId ?? args.session_id,
    timeoutMs: args.timeoutMs ?? args.timeout_ms,
  };
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): { projectRoot: string } | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  if (!existsSync(join(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  }
  return { projectRoot };
}

function resolveProjectFile(projectRoot: string, candidate: string): { absolutePath: string; relativePath: string } | { error: string } {
  if (!candidate) return { error: 'path is required' };
  const local = normalizeResourcePath(candidate);
  const absolutePath = isAbsolute(local) ? resolve(local) : resolve(projectRoot, local);
  const rel = relative(projectRoot, absolutePath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    return { error: `Path escapes project: ${candidate}` };
  }
  return {
    absolutePath,
    relativePath: rel.replace(/\\/g, '/'),
  };
}

function normalizeResourcePath(value: string): string {
  return String(value).replace(/^res:\/\//, '').replace(/\\/g, '/').replace(/^\/+/, '');
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
