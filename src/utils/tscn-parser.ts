/**
 * TSCN File Parser
 *
 * Parses Godot's text scene (.tscn) format into structured objects.
 * Used by scene inspection tools (list_scene_tree, read_node_properties)
 * to avoid spawning Godot for read-only operations.
 *
 * TSCN format reference:
 *   [gd_scene load_steps=N format=3 uid="uid://..."]
 *   [ext_resource type="..." path="..." id="..."]
 *   [sub_resource type="..." id="..."]
 *   [node name="..." type="..." parent="."]
 *   key = value
 *   [connection signal="..." from="..." to="..." method="..."]
 */

import { readFileSync } from 'fs';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface TscnFile {
  header: TscnHeader;
  extResources: TscnExtResource[];
  subResources: TscnSubResource[];
  nodes: TscnNode[];
  connections: TscnConnection[];
}

export interface TscnHeader {
  type: string; // "gd_scene" or "gd_resource"
  loadSteps?: number;
  format?: number;
  uid?: string;
  [key: string]: any;
}

export interface TscnExtResource {
  type: string;
  path: string;
  id: string;
  uid?: string;
}

export interface TscnSubResource {
  type: string;
  id: string;
  properties: Record<string, string>; // raw string values
}

export interface TscnNode {
  name: string;
  type?: string;
  parent?: string; // absent for root node
  instance?: string; // ExtResource reference for instanced scenes
  uniqueId?: number;
  groups?: string[];
  properties: Record<string, string>; // raw string values
  /** Computed full path in the scene tree (e.g., "Player/Arm/Hand") */
  path: string;
}

export interface TscnConnection {
  signal: string;
  from: string;
  to: string;
  method: string;
  flags?: number;
  binds?: string;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a .tscn or .tres file from disk
 */
export function parseTscnFile(filePath: string): TscnFile {
  const content = readFileSync(filePath, 'utf-8');
  return parseTscn(content);
}

/**
 * Parse TSCN content string into a structured object
 */
export function parseTscn(content: string): TscnFile {
  const result: TscnFile = {
    header: { type: 'gd_scene' },
    extResources: [],
    subResources: [],
    nodes: [],
    connections: [],
  };

  const lines = content.split(/\r?\n/);
  let currentSection: 'none' | 'ext_resource' | 'sub_resource' | 'node' | 'connection' = 'none';
  let currentProperties: Record<string, string> = {};
  let currentHeading: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(';')) continue;

    // Check for heading line: [type key=value ...]
    if (trimmed.startsWith('[')) {
      // Flush previous section
      flushSection(result, currentSection, currentHeading, currentProperties);

      // Parse heading
      const headingMatch = trimmed.match(/^\[(\w+)(.*?)\]\s*$/);
      if (!headingMatch) continue;

      const sectionType = headingMatch[1];
      const attrs = headingMatch[2].trim();
      currentHeading = parseHeadingAttributes(attrs);
      currentProperties = {};

      if (sectionType === 'gd_scene' || sectionType === 'gd_resource') {
        currentSection = 'none';
        result.header = {
          type: sectionType,
          ...parseHeaderValues(currentHeading),
        };
      } else if (sectionType === 'ext_resource') {
        currentSection = 'ext_resource';
      } else if (sectionType === 'sub_resource') {
        currentSection = 'sub_resource';
      } else if (sectionType === 'node') {
        currentSection = 'node';
      } else if (sectionType === 'connection') {
        currentSection = 'connection';
      } else {
        currentSection = 'none';
      }
    } else {
      // Property line: key = value
      const propMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_/:.]*)\s*=\s*(.*)/);
      if (propMatch) {
        const key = propMatch[1];
        let value = propMatch[2];

        // Handle multi-line values (arrays, dictionaries that span lines)
        value = readMultiLineValue(value, lines, i, (newIndex) => { i = newIndex; });

        currentProperties[key] = value;
      }
    }
  }

  // Flush final section
  flushSection(result, currentSection, currentHeading, currentProperties);

  // Compute full paths for all nodes
  computeNodePaths(result.nodes);

  return result;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Parse heading attributes like: type="Script" path="res://..." id="1_abc"
 */
function parseHeadingAttributes(attrs: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match key=value or key="value" patterns
  const regex = /(\w+)\s*=\s*(?:"([^"]*?)"|(\S+))/g;
  let match;
  while ((match = regex.exec(attrs)) !== null) {
    result[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return result;
}

/**
 * Convert header string values to appropriate types
 */
function parseHeaderValues(attrs: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'load_steps' || key === 'format') {
      result[key === 'load_steps' ? 'loadSteps' : key] = parseInt(value, 10);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Handle values that might span multiple lines (e.g., arrays, SubResource())
 */
function readMultiLineValue(
  value: string,
  lines: string[],
  currentIndex: number,
  setIndex: (i: number) => void
): string {
  // Count open/close brackets/parens to detect multi-line values
  let openBrackets = 0;
  let openParens = 0;

  for (const ch of value) {
    if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
    else if (ch === '(') openParens++;
    else if (ch === ')') openParens--;
  }

  // If balanced, return as-is
  if (openBrackets <= 0 && openParens <= 0) return value;

  // Read continuation lines
  let result = value;
  let idx = currentIndex + 1;
  while (idx < lines.length && (openBrackets > 0 || openParens > 0)) {
    const nextLine = lines[idx].trim();
    if (!nextLine || nextLine.startsWith('[')) break; // new section
    result += '\n' + nextLine;
    for (const ch of nextLine) {
      if (ch === '[') openBrackets++;
      else if (ch === ']') openBrackets--;
      else if (ch === '(') openParens++;
      else if (ch === ')') openParens--;
    }
    idx++;
  }
  setIndex(idx - 1);
  return result;
}

/**
 * Flush the current section's data into the result object
 */
function flushSection(
  result: TscnFile,
  section: string,
  heading: Record<string, string>,
  properties: Record<string, string>
): void {
  switch (section) {
    case 'ext_resource':
      result.extResources.push({
        type: heading['type'] || '',
        path: heading['path'] || '',
        id: heading['id'] || '',
        uid: heading['uid'],
      });
      break;

    case 'sub_resource':
      result.subResources.push({
        type: heading['type'] || '',
        id: heading['id'] || '',
        properties: { ...properties },
      });
      break;

    case 'node': {
      const node: TscnNode = {
        name: heading['name'] || '',
        properties: { ...properties },
        path: '', // computed later
      };
      if (heading['type']) node.type = heading['type'];
      if (heading['parent']) node.parent = heading['parent'];
      if (heading['instance']) node.instance = heading['instance'];
      if (heading['unique_name_in_owner']) node.uniqueId = parseInt(heading['unique_name_in_owner']);
      if (heading['groups']) {
        // groups=["group1", "group2"]
        node.groups = heading['groups']
          .replace(/[\[\]"]/g, '')
          .split(',')
          .map(g => g.trim())
          .filter(g => g);
      }
      result.nodes.push(node);
      break;
    }

    case 'connection':
      result.connections.push({
        signal: heading['signal'] || '',
        from: heading['from'] || '',
        to: heading['to'] || '',
        method: heading['method'] || '',
        flags: heading['flags'] ? parseInt(heading['flags']) : undefined,
        binds: heading['binds'],
      });
      break;
  }
}

/**
 * Compute the full scene tree path for every node
 * Root node (no parent) gets path = "."
 * Direct children of root (parent=".") get path = "NodeName"
 * Deeper nodes get path = "Parent/Child/..."
 */
function computeNodePaths(nodes: TscnNode[]): void {
  if (nodes.length === 0) return;

  // Root node is the one without a parent
  const root = nodes.find(n => !n.parent);
  if (root) {
    root.path = '.';
  }

  // Build path for each non-root node
  for (const node of nodes) {
    if (!node.parent) continue;

    if (node.parent === '.') {
      node.path = node.name;
    } else {
      node.path = `${node.parent}/${node.name}`;
    }
  }
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Get a node by its scene tree path
 * @param path "." for root, "NodeName" for direct child, "Parent/Child" for deeper
 */
export function getNodeByPath(tscn: TscnFile, path: string): TscnNode | undefined {
  return tscn.nodes.find(n => n.path === path);
}

/**
 * Get all nodes of a specific type
 */
export function getNodesByType(tscn: TscnFile, type: string): TscnNode[] {
  return tscn.nodes.filter(n => n.type === type);
}

/**
 * Get direct children of a node
 */
export function getChildren(tscn: TscnFile, parentPath: string): TscnNode[] {
  if (parentPath === '.') {
    // Children of root have parent="."
    return tscn.nodes.filter(n => n.parent === '.');
  }
  return tscn.nodes.filter(n => n.parent === parentPath);
}

/**
 * Get all descendants of a node (recursive)
 */
export function getDescendants(tscn: TscnFile, parentPath: string): TscnNode[] {
  const results: TscnNode[] = [];
  const prefix = parentPath === '.' ? '' : parentPath + '/';

  for (const node of tscn.nodes) {
    if (!node.parent) continue; // skip root

    if (parentPath === '.') {
      // All non-root nodes are descendants of root
      results.push(node);
    } else if (node.path.startsWith(prefix) || node.parent === parentPath) {
      results.push(node);
    }
  }
  return results;
}

/**
 * Resolve an ExtResource reference like "ExtResource("1_abc")" to its resource info
 */
export function resolveExtResource(tscn: TscnFile, ref: string): TscnExtResource | undefined {
  const match = ref.match(/ExtResource\(\s*"?([^")\s]+)"?\s*\)/);
  if (!match) return undefined;
  return tscn.extResources.find(r => r.id === match[1]);
}

/**
 * Resolve a SubResource reference like "SubResource("sub_id")" to its resource info
 */
export function resolveSubResource(tscn: TscnFile, ref: string): TscnSubResource | undefined {
  const match = ref.match(/SubResource\(\s*"?([^")\s]+)"?\s*\)/);
  if (!match) return undefined;
  return tscn.subResources.find(r => r.id === match[1]);
}

/**
 * Build a hierarchical tree structure from flat node list
 */
export interface SceneTreeNode {
  name: string;
  type?: string;
  path: string;
  instance?: string;
  children: SceneTreeNode[];
}

export function buildSceneTree(tscn: TscnFile): SceneTreeNode | null {
  const root = tscn.nodes.find(n => !n.parent);
  if (!root) return null;

  const tree: SceneTreeNode = {
    name: root.name,
    type: root.type,
    path: '.',
    instance: root.instance,
    children: [],
  };

  // Build children recursively
  function addChildren(parent: SceneTreeNode, parentPath: string): void {
    const children = getChildren(tscn, parentPath);
    for (const child of children) {
      const childTree: SceneTreeNode = {
        name: child.name,
        type: child.type,
        path: child.path,
        instance: child.instance,
        children: [],
      };
      addChildren(childTree, child.path);
      parent.children.push(childTree);
    }
  }

  addChildren(tree, '.');
  return tree;
}
