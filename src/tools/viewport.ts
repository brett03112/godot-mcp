/**
 * Viewport & Screenshot Capture Tools (Tier 3 — Phase 5)
 *
 * Capture viewport screenshots from running Godot scenes.
 *
 * Tools:
 *   - capture_viewport  (TS+GD)  Run scene and capture a screenshot
 */

import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString, optionalString, optionalNumber } from '../utils/validation.js';

export function registerViewportTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    captureViewport(ctx),
  ]);
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CAPTURE_SCRIPT_NAME = '_mcp_viewport_capture.gd';
const CAPTURE_AUTOLOAD_NAME = '_McpViewportCapture';

/**
 * GDScript autoload that captures the viewport after a delay and saves to PNG.
 */
function getCaptureScript(outputPath: string, delayFrames: number, width: number, height: number): string {
  return `extends Node
# MCP Viewport Capture — auto-generated, do not edit
# Waits for frames to render, then captures viewport to PNG and quits

var _frame_count := 0
var _delay_frames := ${delayFrames}
var _output_path := "${outputPath.replace(/\\/g, '/')}"
var _target_width := ${width}
var _target_height := ${height}

func _ready() -> void:
\tprint("[MCP Capture] Waiting ${delayFrames} frames before capture...")
\t# Resize viewport if requested
\tif _target_width > 0 and _target_height > 0:
\t\tget_window().size = Vector2i(_target_width, _target_height)

func _process(_delta: float) -> void:
\t_frame_count += 1
\tif _frame_count >= _delay_frames:
\t\t_capture()

func _capture() -> void:
\tawait RenderingServer.frame_post_draw
\tvar image := get_viewport().get_texture().get_image()
\tif image == null:
\t\tpush_error("[MCP Capture] Failed to get viewport image")
\t\tget_tree().quit(1)
\t\treturn
\t
\t# Ensure output directory exists
\tvar dir_path = _output_path.get_base_dir()
\tif not DirAccess.dir_exists_absolute(dir_path):
\t\tDirAccess.make_dir_recursive_absolute(dir_path)
\t
\tvar err = image.save_png(_output_path)
\tif err != OK:
\t\tpush_error("[MCP Capture] Failed to save PNG: " + str(err))
\t\tget_tree().quit(1)
\t\treturn
\t
\tprint("[MCP Capture] Saved to: " + _output_path)
\tprint("[MCP Capture] Size: " + str(image.get_width()) + "x" + str(image.get_height()))
\tget_tree().quit()
`;
}

// ─── capture_viewport ───────────────────────────────────────────────────────

function captureViewport(ctx: ServerContext): ToolDefinition {
  return {
    name: 'capture_viewport',
    description: 'Take a screenshot of a Godot scene by running it briefly and capturing the viewport. Saves as PNG. Requires a display (won\'t work on headless servers without Xvfb). Useful for visual verification of scene composition.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        output_path: { type: 'string', description: 'Output path for the screenshot (relative to project, e.g., "screenshots/capture.png")' },
        scene_path: { type: 'string', description: 'Scene to capture (res:// path, default: project main scene)' },
        delay_frames: { type: 'number', description: 'Frames to wait before capturing (default: 10, increase for scenes that need loading time)' },
        width: { type: 'number', description: 'Viewport width in pixels (default: project setting)' },
        height: { type: 'number', description: 'Viewport height in pixels (default: project setting)' },
      },
      required: ['project_path', 'output_path'],
    },
    timeout: 60000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('outputPath', 'output_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const outputPath = args.outputPath as string;
      const scenePath = args.scenePath as string | undefined;
      const delayFrames = (args.delayFrames as number) || 10;
      const width = (args.width as number) || 0;
      const height = (args.height as number) || 0;

      // Determine res:// output path for GDScript
      const resOutputPath = `res://${outputPath}`;
      const captureScriptPath = join(projectDir, CAPTURE_SCRIPT_NAME);

      // Ensure output directory exists on disk
      const fullOutputPath = join(projectDir, outputPath);
      const outputDir = dirname(fullOutputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Write capture autoload script
      const captureScript = getCaptureScript(resOutputPath, delayFrames, width, height);
      writeFileSync(captureScriptPath, captureScript, 'utf-8');

      // Add autoload to project.godot
      const projectGodotPath = join(projectDir, 'project.godot');
      let projectContent = readFileSync(projectGodotPath, 'utf-8');
      const autoloadEntry = `${CAPTURE_AUTOLOAD_NAME}="*res://${CAPTURE_SCRIPT_NAME}"`;

      if (projectContent.includes('[autoload]')) {
        projectContent = projectContent.replace(
          '[autoload]',
          `[autoload]\n${autoloadEntry}`
        );
      } else {
        projectContent += `\n[autoload]\n${autoloadEntry}\n`;
      }
      writeFileSync(projectGodotPath, projectContent, 'utf-8');

      // Run the game (NOT headless — needs rendering)
      let godotPath: string;
      try {
        godotPath = await ctx.getGodotPath();
      } catch {
        cleanupCapture(projectDir, captureScriptPath);
        return ctx.createErrorResponse('Could not detect Godot executable path');
      }

      const cmdArgs = ['--path', projectDir, '--quit-after', '30'];
      if (scenePath) {
        cmdArgs.push(scenePath);
      }

      let stdout = '';
      let stderr = '';

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(godotPath, cmdArgs, { cwd: projectDir });

          proc.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
          });
          proc.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          // Timeout after 30 seconds
          const timeout = setTimeout(() => {
            proc.kill();
            resolve();
          }, 30000);

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
        cleanupCapture(projectDir, captureScriptPath);
        return ctx.createErrorResponse(`Failed to run Godot: ${err.message}`);
      }

      // Cleanup
      cleanupCapture(projectDir, captureScriptPath);

      // Check if output file was written
      if (!existsSync(fullOutputPath)) {
        return ctx.createErrorResponse(
          'Screenshot was not captured',
          [
            'The scene may have crashed before rendering',
            'Try increasing delay_frames for scenes that need loading time',
            'Ensure the scene renders correctly in the editor',
            'This tool requires a display — it won\'t work on headless servers',
            stderr ? `Godot stderr: ${stderr.substring(0, 500)}` : '',
          ].filter(Boolean)
        );
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            output_path: outputPath,
            full_path: fullOutputPath,
            delay_frames: delayFrames,
            scene: scenePath || '(main scene)',
            resolution: width > 0 && height > 0 ? `${width}x${height}` : '(project default)',
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Cleanup Helper ─────────────────────────────────────────────────────────

function cleanupCapture(projectDir: string, captureScriptPath: string): void {
  try {
    if (existsSync(captureScriptPath)) {
      unlinkSync(captureScriptPath);
    }

    const projectGodotPath = join(projectDir, 'project.godot');
    if (existsSync(projectGodotPath)) {
      let content = readFileSync(projectGodotPath, 'utf-8');
      const autoloadLine = `${CAPTURE_AUTOLOAD_NAME}="*res://${CAPTURE_SCRIPT_NAME}"`;
      content = content.replace(autoloadLine + '\n', '');
      content = content.replace(autoloadLine, '');
      content = content.replace(/\n\[autoload\]\n\s*\n/g, '\n');
      writeFileSync(projectGodotPath, content, 'utf-8');
    }
  } catch {
    // Best-effort cleanup
  }
}
