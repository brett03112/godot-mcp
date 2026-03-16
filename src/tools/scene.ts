/**
 * Scene Inspection & Manipulation Tools (Tier 1 — Step 2)
 *
 * These tools address the biggest workflow gap: the inability to inspect or
 * edit existing scenes. Read-only tools use the TypeScript TSCN parser for
 * speed; write tools delegate to GDScript via Godot headless for safety.
 *
 * Tools:
 *   - list_scene_tree      (TS)   Full node hierarchy
 *   - read_node_properties  (TS)   All properties of a specific node
 *   - modify_node_property  (GD)   Change a property on an existing node
 *   - remove_node           (GD)   Remove a node from a scene
 *   - duplicate_node        (GD)   Clone a node with children
 *   - reparent_node         (GD)   Move a node to a different parent
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import {
  parseTscnFile,
  buildSceneTree,
  getNodeByPath,
  getChildren,
  resolveExtResource,
  resolveSubResource,
  SceneTreeNode,
} from '../utils/tscn-parser.js';

export function registerSceneTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    listSceneTree(ctx),
    readNodeProperties(ctx),
    modifyNodeProperty(ctx),
    removeNode(ctx),
    duplicateNode(ctx),
    reparentNode(ctx),
  ]);
}

// ─── list_scene_tree ──────────────────────────────────────────────────────────

function listSceneTree(ctx: ServerContext): ToolDefinition {
  return {
    name: 'list_scene_tree',
    description: 'Get the full node hierarchy of a .tscn scene file with node types, paths, and attached resources. Enables understanding existing scenes before modifying them.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scene_path: {
          type: 'string',
          description: 'Relative path to the .tscn file within the project (e.g., "scenes/main.tscn")',
        },
        flat: {
          type: 'boolean',
          description: 'If true, return a flat list instead of a tree hierarchy (default: false)',
        },
      },
      required: ['project_path', 'scene_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath) {
        return ctx.createErrorResponse('project_path and scene_path are required');
      }
      if (!ctx.validatePath(args.projectPath) || !ctx.validatePath(args.scenePath)) {
        return ctx.createErrorResponse('Invalid path');
      }

      const fullPath = join(args.projectPath, args.scenePath);
      if (!existsSync(fullPath)) {
        return ctx.createErrorResponse(
          `Scene file not found: ${args.scenePath}`,
          ['Check the scene path is relative to the project root', 'Verify the file exists']
        );
      }

      try {
        const tscn = parseTscnFile(fullPath);

        if (args.flat) {
          // Flat list with all details
          const nodes = tscn.nodes.map(n => {
            const info: any = {
              name: n.name,
              path: n.path,
            };
            if (n.type) info.type = n.type;
            if (n.parent) info.parent = n.parent;
            if (n.instance) {
              const res = resolveExtResource(tscn, n.instance);
              info.instance = res ? res.path : n.instance;
            }
            if (n.groups && n.groups.length > 0) info.groups = n.groups;

            // Report attached script
            if (n.properties['script']) {
              const scriptRes = resolveExtResource(tscn, n.properties['script']);
              info.script = scriptRes ? scriptRes.path : n.properties['script'];
            }

            return info;
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                scene_file: args.scenePath,
                node_count: nodes.length,
                ext_resources: tscn.extResources.length,
                sub_resources: tscn.subResources.length,
                connections: tscn.connections.length,
                nodes,
              }, null, 2),
            }],
          };
        }

        // Hierarchical tree
        const tree = buildSceneTree(tscn);

        function formatTree(node: SceneTreeNode, indent: string = ''): string {
          let line = `${indent}${node.name}`;
          if (node.type) line += ` (${node.type})`;
          if (node.instance) {
            const res = resolveExtResource(tscn, node.instance);
            line += ` [instance: ${res ? res.path : node.instance}]`;
          }
          let result = line + '\n';
          for (const child of node.children) {
            result += formatTree(child, indent + '  ');
          }
          return result;
        }

        const treeText = tree ? formatTree(tree) : '(empty scene)';

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              scene_file: args.scenePath,
              node_count: tscn.nodes.length,
              ext_resources: tscn.extResources.length,
              sub_resources: tscn.subResources.length,
              connections: tscn.connections.length,
              tree: treeText,
              tree_data: tree,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(
          `Failed to parse scene file: ${msg}`,
          ['Ensure the file is a valid .tscn file', 'Check file permissions']
        );
      }
    },
  };
}

// ─── read_node_properties ─────────────────────────────────────────────────────

function readNodeProperties(ctx: ServerContext): ToolDefinition {
  return {
    name: 'read_node_properties',
    description: 'Read all properties of a specific node in a scene file. Returns transform, visibility, script, material, and all other set properties.',
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
          description: 'Path of the node within the scene tree (e.g., "." for root, "Player", "Player/Sprite2D")',
        },
      },
      required: ['project_path', 'scene_path', 'node_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath || !args.nodePath) {
        return ctx.createErrorResponse('project_path, scene_path, and node_path are required');
      }
      if (!ctx.validatePath(args.projectPath) || !ctx.validatePath(args.scenePath)) {
        return ctx.createErrorResponse('Invalid path');
      }

      const fullPath = join(args.projectPath, args.scenePath);
      if (!existsSync(fullPath)) {
        return ctx.createErrorResponse(`Scene file not found: ${args.scenePath}`);
      }

      try {
        const tscn = parseTscnFile(fullPath);
        const node = getNodeByPath(tscn, args.nodePath);

        if (!node) {
          const available = tscn.nodes.map(n => n.path).join(', ');
          return ctx.createErrorResponse(
            `Node not found at path: ${args.nodePath}`,
            [`Available nodes: ${available}`, 'Use list_scene_tree to see the full hierarchy']
          );
        }

        // Build rich property info
        const properties: Record<string, any> = {};
        for (const [key, rawValue] of Object.entries(node.properties)) {
          // Resolve resource references to readable paths
          if (rawValue.includes('ExtResource(')) {
            const res = resolveExtResource(tscn, rawValue);
            properties[key] = {
              raw: rawValue,
              resolved: res ? { type: res.type, path: res.path } : undefined,
            };
          } else if (rawValue.includes('SubResource(')) {
            const res = resolveSubResource(tscn, rawValue);
            properties[key] = {
              raw: rawValue,
              resolved: res ? { type: res.type, id: res.id, properties: res.properties } : undefined,
            };
          } else {
            properties[key] = rawValue;
          }
        }

        // Include children info
        const children = getChildren(tscn, args.nodePath);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              name: node.name,
              type: node.type,
              path: node.path,
              parent: node.parent || '(root)',
              groups: node.groups || [],
              instance: node.instance ? resolveExtResource(tscn, node.instance)?.path : undefined,
              property_count: Object.keys(properties).length,
              properties,
              children: children.map(c => ({ name: c.name, type: c.type, path: c.path })),
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to read node properties: ${msg}`);
      }
    },
  };
}

// ─── modify_node_property ─────────────────────────────────────────────────────

function modifyNodeProperty(ctx: ServerContext): ToolDefinition {
  return {
    name: 'modify_node_property',
    description: 'Change a property on an existing node in a scene without recreating it. Supports transform, visibility, modulate, material, and any other node property.',
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
          description: 'Path of the node in the scene tree (e.g., ".", "Player", "Player/Sprite2D")',
        },
        property_name: {
          type: 'string',
          description: 'Name of the property to set (e.g., "position", "visible", "modulate", "transform")',
        },
        property_value: {
          description: 'Value to set. Use Godot format strings for complex types: "Vector2(100, 200)", "Color(1, 0, 0, 1)", "Transform3D(...)"',
        },
      },
      required: ['project_path', 'scene_path', 'node_path', 'property_name', 'property_value'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath || !args.nodePath || !args.propertyName || args.propertyValue === undefined) {
        return ctx.createErrorResponse('project_path, scene_path, node_path, property_name, and property_value are required');
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      const fullPath = join(args.projectPath, args.scenePath);
      if (!existsSync(fullPath)) {
        return ctx.createErrorResponse(`Scene file not found: ${args.scenePath}`);
      }

      try {
        const result = await ctx.executeOperation('modify_node_property', {
          scenePath: args.scenePath,
          nodePath: args.nodePath,
          propertyName: args.propertyName,
          propertyValue: args.propertyValue,
        }, args.projectPath);

        // Check for errors in output
        if (result.stderr && result.stderr.includes('ERROR')) {
          const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
          if (errors.length > 0) {
            return ctx.createErrorResponse(
              `Failed to modify property: ${errors[0].message}`,
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
              property: args.propertyName,
              value: args.propertyValue,
              message: `Property "${args.propertyName}" set to "${args.propertyValue}" on node "${args.nodePath}"`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to modify node property: ${msg}`);
      }
    },
  };
}

// ─── remove_node ──────────────────────────────────────────────────────────────

function removeNode(ctx: ServerContext): ToolDefinition {
  return {
    name: 'remove_node',
    description: 'Remove a node (and optionally its children) from a scene. If keep_children is true, children are reparented to the removed node\'s parent.',
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
          description: 'Path of the node to remove (e.g., "Player/OldSprite")',
        },
        keep_children: {
          type: 'boolean',
          description: 'If true, reparent children to the removed node\'s parent instead of deleting them (default: false)',
        },
      },
      required: ['project_path', 'scene_path', 'node_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath || !args.nodePath) {
        return ctx.createErrorResponse('project_path, scene_path, and node_path are required');
      }

      if (args.nodePath === '.') {
        return ctx.createErrorResponse(
          'Cannot remove the root node',
          ['Remove child nodes instead', 'Create a new scene if you need a different root type']
        );
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      try {
        const result = await ctx.executeOperation('remove_node', {
          scenePath: args.scenePath,
          nodePath: args.nodePath,
          keepChildren: args.keepChildren || false,
        }, args.projectPath);

        if (result.stderr && result.stderr.includes('ERROR')) {
          const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
          if (errors.length > 0) {
            return ctx.createErrorResponse(
              `Failed to remove node: ${errors[0].message}`,
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
              removed_node: args.nodePath,
              keep_children: args.keepChildren || false,
              message: `Node "${args.nodePath}" removed from scene`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to remove node: ${msg}`);
      }
    },
  };
}

// ─── duplicate_node ───────────────────────────────────────────────────────────

function duplicateNode(ctx: ServerContext): ToolDefinition {
  return {
    name: 'duplicate_node',
    description: 'Clone an existing node (with its children and properties) within a scene. The duplicate is added as a sibling of the original.',
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
          description: 'Path of the node to duplicate (e.g., "Enemies/Goblin")',
        },
        new_name: {
          type: 'string',
          description: 'Name for the duplicated node (default: original name with numeric suffix)',
        },
      },
      required: ['project_path', 'scene_path', 'node_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath || !args.nodePath) {
        return ctx.createErrorResponse('project_path, scene_path, and node_path are required');
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      try {
        const result = await ctx.executeOperation('duplicate_node', {
          scenePath: args.scenePath,
          nodePath: args.nodePath,
          newName: args.newName || '',
        }, args.projectPath);

        if (result.stderr && result.stderr.includes('ERROR')) {
          const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
          if (errors.length > 0) {
            return ctx.createErrorResponse(
              `Failed to duplicate node: ${errors[0].message}`,
              errors[0].possible_solutions
            );
          }
        }

        // Parse output for the new node's details
        let outputData: any = { success: true };
        try {
          const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            outputData = JSON.parse(jsonMatch[0]);
          }
        } catch { /* use default */ }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              scene: args.scenePath,
              original_node: args.nodePath,
              new_name: args.newName || outputData.new_name || '(auto)',
              message: `Node "${args.nodePath}" duplicated successfully`,
              ...outputData,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to duplicate node: ${msg}`);
      }
    },
  };
}

// ─── reparent_node ────────────────────────────────────────────────────────────

function reparentNode(ctx: ServerContext): ToolDefinition {
  return {
    name: 'reparent_node',
    description: 'Move a node to a different parent in the scene tree. The node keeps all its properties and children.',
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
          description: 'Current path of the node to move (e.g., "UI/OldParent/Button")',
        },
        new_parent_path: {
          type: 'string',
          description: 'Path of the new parent node (e.g., "UI/NewParent", or "." for root)',
        },
      },
      required: ['project_path', 'scene_path', 'node_path', 'new_parent_path'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.scenePath || !args.nodePath || !args.newParentPath) {
        return ctx.createErrorResponse('project_path, scene_path, node_path, and new_parent_path are required');
      }

      if (args.nodePath === '.') {
        return ctx.createErrorResponse('Cannot reparent the root node');
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      try {
        const result = await ctx.executeOperation('reparent_node', {
          scenePath: args.scenePath,
          nodePath: args.nodePath,
          newParentPath: args.newParentPath,
        }, args.projectPath);

        if (result.stderr && result.stderr.includes('ERROR')) {
          const errors = ctx.parseGodotErrors(result.stderr.split('\n'));
          if (errors.length > 0) {
            return ctx.createErrorResponse(
              `Failed to reparent node: ${errors[0].message}`,
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
              new_parent: args.newParentPath,
              message: `Node "${args.nodePath}" moved to parent "${args.newParentPath}"`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Failed to reparent node: ${msg}`);
      }
    },
  };
}
