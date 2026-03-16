/**
 * Project Scaffolding Tools (Tier 2 — Phase 2B)
 *
 * Bootstraps new Godot projects from scratch with standard directory
 * structure, project.godot configuration, and template main scenes.
 *
 * Tools:
 *   - create_project  (TS)  Scaffold a new Godot project
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, requiredString, optionalEnum, optionalNumber, projectPath } from '../utils/validation.js';

export function registerProjectTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    createProject(ctx),
  ]);
}

// ─── Templates ──────────────────────────────────────────────────────────────

const STANDARD_DIRS = [
  'scenes',
  'scripts',
  'assets',
  'assets/textures',
  'assets/models',
  'assets/fonts',
  'audio',
  'audio/music',
  'audio/sfx',
  'shaders',
  'resources',
  'addons',
];

function generateProjectGodot(opts: {
  projectName: string;
  renderer: string;
  windowWidth: number;
  windowHeight: number;
  mainScene: string;
}): string {
  const rendererMap: Record<string, string> = {
    'forward_plus': 'Forward+',
    'mobile': 'Mobile',
    'gl_compatibility': 'GL Compatibility',
  };
  const rendererName = rendererMap[opts.renderer] || 'Forward+';

  return `; Engine configuration file.
; It's best edited using the editor UI and not directly,
; since the parameters that go here are not all obvious.
;
; Format:
;   [section]
;   key=value

config_version=5

[application]

config/name="${opts.projectName}"
run/main_scene="res://${opts.mainScene}"
config/features=PackedStringArray("4.3", "${rendererName}")

[display]

window/size/viewport_width=${opts.windowWidth}
window/size/viewport_height=${opts.windowHeight}

[rendering]

renderer/rendering_method="${opts.renderer}"
`;
}

function generateBlankScene(rootName: string): string {
  return `[gd_scene format=3]

[node name="${rootName}" type="Node"]
`;
}

function generate2DScene(rootName: string): string {
  return `[gd_scene format=3]

[node name="${rootName}" type="Node2D"]

[node name="Camera2D" type="Camera2D" parent="."]
position = Vector2(576, 324)
`;
}

function generate3DScene(rootName: string): string {
  return `[gd_scene load_steps=2 format=3]

[sub_resource type="Environment" id="Environment_1"]
background_mode = 1
ambient_light_color = Color(0.3, 0.3, 0.3, 1)

[node name="${rootName}" type="Node3D"]

[node name="Camera3D" type="Camera3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 0.939693, 0.34202, 0, -0.34202, 0.939693, 0, 3, 5)

[node name="DirectionalLight3D" type="DirectionalLight3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 0.866025, 0.5, 0, -0.5, 0.866025, 0, 5, 0)
shadow_enabled = true

[node name="WorldEnvironment" type="WorldEnvironment" parent="."]
environment = SubResource("Environment_1")
`;
}

function generateUIScene(rootName: string): string {
  return `[gd_scene format=3]

[node name="${rootName}" type="Control"]
layout_mode = 3
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2

[node name="VBoxContainer" type="VBoxContainer" parent="."]
layout_mode = 1
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2
`;
}

// ─── create_project ─────────────────────────────────────────────────────────

function createProject(ctx: ServerContext): ToolDefinition {
  return {
    name: 'create_project',
    description: 'Scaffold a new Godot project from scratch with project.godot, standard folder structure, and a default main scene. Templates: blank, 2d_game, 3d_game, ui_app.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Directory to create the project in (will be created if it does not exist)',
        },
        project_name: {
          type: 'string',
          description: 'Name of the project',
        },
        template: {
          type: 'string',
          enum: ['blank', '2d_game', '3d_game', 'ui_app'],
          description: 'Project template (default: "blank")',
        },
        renderer: {
          type: 'string',
          enum: ['forward_plus', 'mobile', 'gl_compatibility'],
          description: 'Rendering backend (default: "forward_plus")',
        },
        window_width: {
          type: 'number',
          description: 'Viewport width in pixels (default: 1152)',
        },
        window_height: {
          type: 'number',
          description: 'Viewport height in pixels (default: 648)',
        },
      },
      required: ['project_path', 'project_name'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      // Validate
      const v = validateParams(args, [
        requiredString('projectPath', 'project_path'),
        requiredString('projectName', 'project_name'),
        optionalEnum('template', ['blank', '2d_game', '3d_game', 'ui_app']),
        optionalEnum('renderer', ['forward_plus', 'mobile', 'gl_compatibility']),
        optionalNumber('windowWidth', 'window_width'),
        optionalNumber('windowHeight', 'window_height'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectPath = args.projectPath as string;
      const projectName = args.projectName as string;
      const template = (args.template as string) || 'blank';
      const renderer = (args.renderer as string) || 'forward_plus';
      const windowWidth = (args.windowWidth as number) || 1152;
      const windowHeight = (args.windowHeight as number) || 648;

      // Check if project already exists
      if (existsSync(join(projectPath, 'project.godot'))) {
        return ctx.createErrorResponse(
          `A Godot project already exists at: ${projectPath}`,
          ['Choose a different directory', 'Remove the existing project first']
        );
      }

      // Create directory structure
      if (!existsSync(projectPath)) {
        mkdirSync(projectPath, { recursive: true });
      }
      const createdDirs: string[] = [];
      for (const dir of STANDARD_DIRS) {
        const dirPath = join(projectPath, dir);
        if (!existsSync(dirPath)) {
          mkdirSync(dirPath, { recursive: true });
          createdDirs.push(dir);
        }
      }

      // Determine main scene path and content
      const mainScenePath = 'scenes/main.tscn';
      const rootName = projectName.replace(/[^a-zA-Z0-9_]/g, '') || 'Main';
      let sceneContent: string;

      switch (template) {
        case '2d_game':
          sceneContent = generate2DScene(rootName);
          break;
        case '3d_game':
          sceneContent = generate3DScene(rootName);
          break;
        case 'ui_app':
          sceneContent = generateUIScene(rootName);
          break;
        default:
          sceneContent = generateBlankScene(rootName);
      }

      // Write project.godot
      const projectGodot = generateProjectGodot({
        projectName,
        renderer,
        windowWidth,
        windowHeight,
        mainScene: mainScenePath,
      });
      writeFileSync(join(projectPath, 'project.godot'), projectGodot, 'utf-8');

      // Write main scene
      writeFileSync(join(projectPath, mainScenePath), sceneContent, 'utf-8');

      // Write .gdignore in addons to prevent import scanning of empty dir
      // (optional, Godot handles this fine without it)

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            project_path: projectPath,
            project_name: projectName,
            template,
            renderer,
            window_size: `${windowWidth}x${windowHeight}`,
            main_scene: mainScenePath,
            directories_created: createdDirs,
            files_created: ['project.godot', mainScenePath],
          }, null, 2),
        }],
      };
    },
  };
}
