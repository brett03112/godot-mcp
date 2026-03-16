/**
 * Scene Validation Tools (Tier 2 — Phase 2C)
 *
 * Checks scenes for common issues before runtime: missing resources,
 * broken scripts, orphaned collision shapes, etc. Uses the TypeScript
 * TSCN parser (no Godot process needed).
 *
 * Tools:
 *   - validate_scene  (TS)  Check a scene for common issues
 */

import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';
import { validateParams, requiredString, projectPath } from '../utils/validation.js';
import {
  TscnFile,
  TscnNode,
  TscnConnection,
  resolveExtResource,
  getChildren,
} from '../utils/tscn-parser.js';

export function registerValidateTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    validateScene(ctx),
  ]);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface SceneIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  node_path: string;
  message: string;
  recommendation: string;
}

// Physics body types that can have collision shapes as children
const PHYSICS_BODY_TYPES = new Set([
  'StaticBody2D', 'RigidBody2D', 'CharacterBody2D', 'Area2D',
  'StaticBody3D', 'RigidBody3D', 'CharacterBody3D', 'Area3D',
  'AnimatableBody2D', 'AnimatableBody3D',
]);

const COLLISION_SHAPE_TYPES = new Set([
  'CollisionShape2D', 'CollisionShape3D',
  'CollisionPolygon2D', 'CollisionPolygon3D',
]);

const SPRITE_TYPES = new Set([
  'Sprite2D', 'Sprite3D', 'AnimatedSprite2D', 'AnimatedSprite3D', 'TextureRect',
]);

const CONTAINER_TYPES = new Set([
  'VBoxContainer', 'HBoxContainer', 'GridContainer', 'FlowContainer',
  'MarginContainer', 'PanelContainer', 'TabContainer', 'ScrollContainer',
  'HSplitContainer', 'VSplitContainer', 'CenterContainer', 'AspectRatioContainer',
  'SubViewportContainer',
]);

const ALL_CHECKS = [
  'missing_resources',
  'broken_scripts',
  'collision_without_body',
  'sprite_without_texture',
  'signal_method_missing',
  'duplicate_node_names',
  'empty_containers',
  'deep_nesting',
];

// ─── validate_scene ─────────────────────────────────────────────────────────

function validateScene(ctx: ServerContext): ToolDefinition {
  return {
    name: 'validate_scene',
    description: 'Check a scene for common issues: missing resources, broken script references, collision shapes without bodies, sprites without textures, signal connections to non-existent methods, and more. Returns issues with severity levels and recommendations.',
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
        checks: {
          type: 'array',
          items: { type: 'string' },
          description: `Specific checks to run (default: all). Available: ${ALL_CHECKS.join(', ')}`,
        },
      },
      required: ['project_path', 'scene_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const scenePath = args.scenePath as string;
      const fullPath = join(projectDir, scenePath);

      if (!existsSync(fullPath)) {
        return ctx.createErrorResponse(
          `Scene file not found: ${scenePath}`,
          ['Check the scene path is relative to the project root']
        );
      }

      // Parse scene using cache
      let tscn: TscnFile;
      try {
        tscn = ctx.getOrParseTscn(fullPath);
      } catch (err: any) {
        return ctx.createErrorResponse(`Failed to parse scene: ${err.message}`);
      }

      // Determine which checks to run
      const requestedChecks = args.checks as string[] | undefined;
      const checksToRun = requestedChecks && requestedChecks.length > 0
        ? requestedChecks.filter(c => ALL_CHECKS.includes(c))
        : ALL_CHECKS;

      const issues: SceneIssue[] = [];

      // Build lookup structures
      const nodesByPath = new Map<string, TscnNode>();
      const nodeTypeByPath = new Map<string, string>();
      for (const node of tscn.nodes) {
        nodesByPath.set(node.path, node);
        if (node.type) nodeTypeByPath.set(node.path, node.type);
      }

      // ─── Check: missing_resources ─────────────────────────────
      if (checksToRun.includes('missing_resources')) {
        for (const extRes of tscn.extResources) {
          if (extRes.path.startsWith('res://')) {
            const resPath = extRes.path.replace('res://', '');
            const absPath = join(projectDir, resPath);
            if (!existsSync(absPath)) {
              issues.push({
                severity: 'error',
                category: 'missing_resources',
                node_path: '',
                message: `External resource not found: ${extRes.path} (type: ${extRes.type}, id: ${extRes.id})`,
                recommendation: `Ensure the file exists at ${resPath} or update the resource reference`,
              });
            }
          }
        }
      }

      // ─── Check: broken_scripts ────────────────────────────────
      if (checksToRun.includes('broken_scripts')) {
        for (const extRes of tscn.extResources) {
          if (extRes.type === 'Script' || extRes.type === 'GDScript') {
            if (extRes.path.startsWith('res://')) {
              const scriptPath = extRes.path.replace('res://', '');
              const absPath = join(projectDir, scriptPath);
              if (!existsSync(absPath)) {
                issues.push({
                  severity: 'error',
                  category: 'broken_scripts',
                  node_path: '',
                  message: `Script file not found: ${extRes.path}`,
                  recommendation: `Create the script at ${scriptPath} or remove the script reference`,
                });
              }
            }
          }
        }

        // Also check nodes that reference scripts
        for (const node of tscn.nodes) {
          if (node.properties['script']) {
            const scriptRef = resolveExtResource(tscn, node.properties['script']);
            if (scriptRef && scriptRef.path.startsWith('res://')) {
              const scriptPath = scriptRef.path.replace('res://', '');
              const absPath = join(projectDir, scriptPath);
              if (!existsSync(absPath)) {
                issues.push({
                  severity: 'error',
                  category: 'broken_scripts',
                  node_path: node.path,
                  message: `Node "${node.name}" references missing script: ${scriptRef.path}`,
                  recommendation: `Create the script or detach it from the node`,
                });
              }
            }
          }
        }
      }

      // ─── Check: collision_without_body ────────────────────────
      if (checksToRun.includes('collision_without_body')) {
        for (const node of tscn.nodes) {
          if (node.type && COLLISION_SHAPE_TYPES.has(node.type)) {
            // Find parent type
            let parentType: string | undefined;
            if (node.parent === '.') {
              // Parent is root
              parentType = tscn.nodes.find(n => !n.parent)?.type;
            } else if (node.parent) {
              parentType = nodeTypeByPath.get(node.parent);
            }

            if (parentType && !PHYSICS_BODY_TYPES.has(parentType)) {
              issues.push({
                severity: 'warning',
                category: 'collision_without_body',
                node_path: node.path,
                message: `${node.type} "${node.name}" is not a child of a physics body (parent type: ${parentType})`,
                recommendation: `Move this node under a StaticBody, RigidBody, CharacterBody, or Area node`,
              });
            }
          }
        }
      }

      // ─── Check: sprite_without_texture ────────────────────────
      if (checksToRun.includes('sprite_without_texture')) {
        for (const node of tscn.nodes) {
          if (node.type && SPRITE_TYPES.has(node.type)) {
            const hasTexture = node.properties['texture'] ||
                               node.properties['sprite_frames'] ||
                               node.properties['texture_normal'] ||
                               node.instance; // Instanced scenes may provide texture
            if (!hasTexture) {
              issues.push({
                severity: 'warning',
                category: 'sprite_without_texture',
                node_path: node.path,
                message: `${node.type} "${node.name}" has no texture assigned`,
                recommendation: `Assign a texture resource to this sprite node`,
              });
            }
          }
        }
      }

      // ─── Check: signal_method_missing ─────────────────────────
      if (checksToRun.includes('signal_method_missing')) {
        for (const conn of tscn.connections) {
          // Resolve the target node
          const targetPath = conn.to === '.' ? '.' : conn.to;
          const targetNode = nodesByPath.get(targetPath);

          if (!targetNode) {
            issues.push({
              severity: 'warning',
              category: 'signal_method_missing',
              node_path: conn.from,
              message: `Signal "${conn.signal}" connected to non-existent node path: "${conn.to}"`,
              recommendation: `Update the signal connection target or create the missing node`,
            });
            continue;
          }

          // Try to find the script on the target node
          if (targetNode.properties['script']) {
            const scriptRef = resolveExtResource(tscn, targetNode.properties['script']);
            if (scriptRef && scriptRef.path.startsWith('res://')) {
              const scriptPath = scriptRef.path.replace('res://', '');
              const absPath = join(projectDir, scriptPath);
              if (existsSync(absPath)) {
                try {
                  const scriptContent = readFileSync(absPath, 'utf-8');
                  // Simple check: look for func method_name
                  const methodRegex = new RegExp(`func\\s+${escapeRegexChars(conn.method)}\\s*\\(`);
                  if (!methodRegex.test(scriptContent)) {
                    issues.push({
                      severity: 'warning',
                      category: 'signal_method_missing',
                      node_path: conn.from,
                      message: `Signal "${conn.signal}" connects to method "${conn.method}" on "${conn.to}", but method not found in ${scriptPath}`,
                      recommendation: `Add "func ${conn.method}(...):" to the script or update the signal connection`,
                    });
                  }
                } catch {
                  // Can't read script, skip this check
                }
              }
            }
          }
        }
      }

      // ─── Check: duplicate_node_names ──────────────────────────
      if (checksToRun.includes('duplicate_node_names')) {
        // Group nodes by parent
        const childrenByParent = new Map<string, string[]>();
        for (const node of tscn.nodes) {
          if (node.parent !== undefined) {
            const parentKey = node.parent;
            if (!childrenByParent.has(parentKey)) {
              childrenByParent.set(parentKey, []);
            }
            childrenByParent.get(parentKey)!.push(node.name);
          }
        }

        for (const [parentPath, children] of childrenByParent) {
          const seen = new Set<string>();
          for (const name of children) {
            if (seen.has(name)) {
              issues.push({
                severity: 'warning',
                category: 'duplicate_node_names',
                node_path: parentPath === '.' ? name : `${parentPath}/${name}`,
                message: `Duplicate node name "${name}" under parent "${parentPath}"`,
                recommendation: `Rename one of the duplicate nodes to avoid confusion`,
              });
            }
            seen.add(name);
          }
        }
      }

      // ─── Check: empty_containers ──────────────────────────────
      if (checksToRun.includes('empty_containers')) {
        for (const node of tscn.nodes) {
          if (node.type && CONTAINER_TYPES.has(node.type)) {
            const children = getChildren(tscn, node.path);
            if (children.length === 0) {
              issues.push({
                severity: 'info',
                category: 'empty_containers',
                node_path: node.path,
                message: `${node.type} "${node.name}" has no children`,
                recommendation: `Add child nodes or remove the empty container`,
              });
            }
          }
        }
      }

      // ─── Check: deep_nesting ──────────────────────────────────
      if (checksToRun.includes('deep_nesting')) {
        for (const node of tscn.nodes) {
          if (node.path && node.path !== '.') {
            const depth = node.path.split('/').length;
            if (depth > 10) {
              issues.push({
                severity: 'info',
                category: 'deep_nesting',
                node_path: node.path,
                message: `Node "${node.name}" is nested ${depth} levels deep`,
                recommendation: `Consider flattening the hierarchy or using scenes for deeply nested structures`,
              });
            }
          }
        }
      }

      // Build summary
      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warningCount = issues.filter(i => i.severity === 'warning').length;
      const infoCount = issues.filter(i => i.severity === 'info').length;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: errorCount === 0,
            scene_path: scenePath,
            checks_run: checksToRun,
            issues,
            summary: {
              errors: errorCount,
              warnings: warningCount,
              info: infoCount,
              total: issues.length,
            },
          }, null, 2),
        }],
      };
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegexChars(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
