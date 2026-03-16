/**
 * Shader Pipeline Completion Tools (Tier 1 — Step 3)
 *
 * Completes the create → apply → tune shader workflow:
 *   - apply_material             (GD)  Apply a material to a node in a scene
 *   - set_shader_parameter       (GD)  Modify shader uniform values
 *   - create_material_from_texture (TS)  Generate StandardMaterial3D from textures
 */

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';

export function registerShaderTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    applyMaterial(ctx),
    setShaderParameter(ctx),
    createMaterialFromTexture(ctx),
  ]);
}

// ─── apply_material ───────────────────────────────────────────────────────────

function applyMaterial(ctx: ServerContext): ToolDefinition {
  return {
    name: 'apply_material',
    description: 'Apply a ShaderMaterial or StandardMaterial3D to a node in a scene. Auto-detects the correct property (material_override, material, surface_material_override) based on node type.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scene_path: {
          type: 'string',
          description: 'Relative path to the .tscn file within the project',
        },
        node_path: {
          type: 'string',
          description: 'Path of the node to apply the material to (e.g., "Player/MeshInstance3D")',
        },
        material_path: {
          type: 'string',
          description: 'Relative path to the material file (.tres or .material) within the project',
        },
        slot: {
          type: 'string',
          description: 'Material slot: "override" (material_override), "surface/N" (surface_material_override/N), or "material" (CanvasItem material). Default: auto-detect',
          enum: ['override', 'surface/0', 'surface/1', 'surface/2', 'surface/3', 'material', 'auto'],
        },
      },
      required: ['project_path', 'scene_path', 'node_path', 'material_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath || !args.nodePath || !args.materialPath) {
        return ctx.createErrorResponse('project_path, scene_path, node_path, and material_path are required');
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      const materialFullPath = join(args.projectPath, args.materialPath);
      if (!existsSync(materialFullPath)) {
        return ctx.createErrorResponse(
          `Material file not found: ${args.materialPath}`,
          ['Check the material path is relative to the project root', 'Create the material first with create_shader_material or create_material_from_texture']
        );
      }

      try {
        const result = await ctx.executeOperation('apply_material', {
          scenePath: args.scenePath,
          nodePath: args.nodePath,
          materialPath: args.materialPath,
          slot: args.slot || 'auto',
        }, args.projectPath);

        if (result.stderr && result.stderr.includes('ERROR')) {
          const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
          if (errors.length > 0) {
            return ctx.createErrorResponse(
              `Failed to apply material: ${errors[0].message}`,
              errors[0].possible_solutions
            );
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              scene: args.scenePath,
              node: args.nodePath,
              material: args.materialPath,
              slot: args.slot || 'auto',
              message: `Material "${args.materialPath}" applied to node "${args.nodePath}"`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to apply material: ${msg}`);
      }
    },
  };
}

// ─── set_shader_parameter ─────────────────────────────────────────────────────

function setShaderParameter(ctx: ServerContext): ToolDefinition {
  return {
    name: 'set_shader_parameter',
    description: 'Modify a shader uniform value on a node\'s material. Supports Vector2/3/4, Color, float, int, bool, and texture path values.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scene_path: {
          type: 'string',
          description: 'Relative path to the .tscn file within the project',
        },
        node_path: {
          type: 'string',
          description: 'Path of the node whose material to modify',
        },
        parameter_name: {
          type: 'string',
          description: 'Name of the shader uniform/parameter (e.g., "dissolve_amount", "outline_color")',
        },
        parameter_value: {
          description: 'Value to set. Use Godot format for complex types: "Vector2(1, 2)", "Color(1, 0, 0, 1)", 0.5, true, "res://texture.png"',
        },
      },
      required: ['project_path', 'scene_path', 'node_path', 'parameter_name', 'parameter_value'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath || !args.nodePath || !args.parameterName || args.parameterValue === undefined) {
        return ctx.createErrorResponse('project_path, scene_path, node_path, parameter_name, and parameter_value are required');
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      try {
        const result = await ctx.executeOperation('set_shader_parameter', {
          scenePath: args.scenePath,
          nodePath: args.nodePath,
          parameterName: args.parameterName,
          parameterValue: args.parameterValue,
        }, args.projectPath);

        if (result.stderr && result.stderr.includes('ERROR')) {
          const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
          if (errors.length > 0) {
            return ctx.createErrorResponse(
              `Failed to set shader parameter: ${errors[0].message}`,
              errors[0].possible_solutions
            );
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              scene: args.scenePath,
              node: args.nodePath,
              parameter: args.parameterName,
              value: args.parameterValue,
              message: `Shader parameter "${args.parameterName}" set to "${args.parameterValue}" on node "${args.nodePath}"`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to set shader parameter: ${msg}`);
      }
    },
  };
}

// ─── create_material_from_texture ─────────────────────────────────────────────

function createMaterialFromTexture(ctx: ServerContext): ToolDefinition {
  return {
    name: 'create_material_from_texture',
    description: 'Auto-generate a StandardMaterial3D .tres file from texture maps. Provide an albedo (base color) texture and optionally normal, roughness, metallic, and emission maps.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        material_name: {
          type: 'string',
          description: 'Name for the material file (without extension)',
        },
        output_dir: {
          type: 'string',
          description: 'Directory within the project to save the material (default: "materials/")',
        },
        albedo_texture: {
          type: 'string',
          description: 'Relative path to the albedo/base color texture (e.g., "assets/textures/brick_albedo.png")',
        },
        normal_texture: {
          type: 'string',
          description: 'Relative path to the normal map texture (optional)',
        },
        roughness_texture: {
          type: 'string',
          description: 'Relative path to the roughness map texture (optional)',
        },
        metallic_texture: {
          type: 'string',
          description: 'Relative path to the metallic map texture (optional)',
        },
        emission_texture: {
          type: 'string',
          description: 'Relative path to the emission map texture (optional)',
        },
        ao_texture: {
          type: 'string',
          description: 'Relative path to the ambient occlusion texture (optional)',
        },
        albedo_color: {
          type: 'string',
          description: 'Tint color in Godot format: "Color(1, 1, 1, 1)" (default: white)',
        },
        roughness: {
          type: 'number',
          description: 'Roughness value 0.0-1.0 (default: 1.0, overridden by roughness_texture)',
        },
        metallic: {
          type: 'number',
          description: 'Metallic value 0.0-1.0 (default: 0.0, overridden by metallic_texture)',
        },
      },
      required: ['project_path', 'material_name', 'albedo_texture'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.materialName || !args.albedoTexture) {
        return ctx.createErrorResponse('project_path, material_name, and albedo_texture are required');
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      // Validate albedo texture exists
      const albedoFullPath = join(args.projectPath, args.albedoTexture);
      if (!existsSync(albedoFullPath)) {
        return ctx.createErrorResponse(`Albedo texture not found: ${args.albedoTexture}`);
      }

      try {
        const outputDir = args.outputDir || 'materials';
        const outputDirFull = join(args.projectPath, outputDir);
        if (!existsSync(outputDirFull)) {
          mkdirSync(outputDirFull, { recursive: true });
        }

        const materialFileName = `${args.materialName}.tres`;
        const materialPath = join(outputDir, materialFileName);
        const materialFullPath = join(args.projectPath, materialPath);

        // Build ext_resource references
        const extResources: Array<{ path: string; type: string; id: string }> = [];
        let resourceId = 1;

        function addTexture(texturePath: string | undefined): string | null {
          if (!texturePath) return null;
          const fullPath = join(args.projectPath, texturePath);
          if (!existsSync(fullPath)) {
            ctx.logDebug(`Texture not found, skipping: ${texturePath}`);
            return null;
          }
          const id = `${resourceId}_${ctx.generateShortUID()}`;
          extResources.push({
            path: `res://${texturePath.replace(/\\/g, '/')}`,
            type: 'Texture2D',
            id,
          });
          resourceId++;
          return id;
        }

        const albedoId = addTexture(args.albedoTexture)!;
        const normalId = addTexture(args.normalTexture);
        const roughnessId = addTexture(args.roughnessTexture);
        const metallicId = addTexture(args.metallicTexture);
        const emissionId = addTexture(args.emissionTexture);
        const aoId = addTexture(args.aoTexture);

        // Generate .tres content
        const uid = ctx.generateUID();
        const loadSteps = 1 + extResources.length; // 1 for the material itself

        let tres = `[gd_resource type="StandardMaterial3D" load_steps=${loadSteps} format=3 uid="uid://${uid}"]\n\n`;

        // External resources
        for (const res of extResources) {
          tres += `[ext_resource type="${res.type}" path="${res.path}" id="${res.id}"]\n`;
        }
        if (extResources.length > 0) tres += '\n';

        // Material resource
        tres += `[resource]\n`;

        // Albedo
        if (args.albedoColor) {
          tres += `albedo_color = ${args.albedoColor}\n`;
        }
        tres += `albedo_texture = ExtResource("${albedoId}")\n`;

        // Metallic
        if (metallicId) {
          tres += `metallic = 1.0\n`;
          tres += `metallic_texture = ExtResource("${metallicId}")\n`;
        } else if (args.metallic !== undefined) {
          tres += `metallic = ${args.metallic}\n`;
        }

        // Roughness
        if (roughnessId) {
          tres += `roughness = 1.0\n`;
          tres += `roughness_texture = ExtResource("${roughnessId}")\n`;
        } else if (args.roughness !== undefined) {
          tres += `roughness = ${args.roughness}\n`;
        }

        // Normal map
        if (normalId) {
          tres += `normal_enabled = true\n`;
          tres += `normal_texture = ExtResource("${normalId}")\n`;
        }

        // Emission
        if (emissionId) {
          tres += `emission_enabled = true\n`;
          tres += `emission_texture = ExtResource("${emissionId}")\n`;
        }

        // Ambient occlusion
        if (aoId) {
          tres += `ao_enabled = true\n`;
          tres += `ao_texture = ExtResource("${aoId}")\n`;
        }

        writeFileSync(materialFullPath, tres, 'utf-8');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              material_path: materialPath,
              material_res_path: `res://${materialPath.replace(/\\/g, '/')}`,
              textures: {
                albedo: args.albedoTexture,
                normal: args.normalTexture || null,
                roughness: args.roughnessTexture || null,
                metallic: args.metallicTexture || null,
                emission: args.emissionTexture || null,
                ao: args.aoTexture || null,
              },
              message: `StandardMaterial3D created at ${materialPath}`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to create material: ${msg}`);
      }
    },
  };
}
