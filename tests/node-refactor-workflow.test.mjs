import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerNodeRefactorWorkflowTools } from '../build/tools/node-refactor-workflow.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext(options = {}) {
  const mapping = {
    project_path: 'projectPath',
    scene_path: 'scenePath',
    scene_paths: 'scenePaths',
    scan_paths: 'scanPaths',
    node_path: 'nodePath',
    new_name: 'newName',
    new_parent_path: 'newParentPath',
    update_references: 'updateReferences',
    keep_global_transform: 'keepGlobalTransform',
    group_name: 'groupName',
    persistent: 'persistent',
    new_type: 'newType',
    preserve_name: 'preserveName',
    preserve_children: 'preserveChildren',
    preserve_groups: 'preserveGroups',
    preserve_script: 'preserveScript',
    property_name: 'propertyName',
    property_value: 'propertyValue',
    property_filters: 'propertyFilters',
    include_properties: 'includeProperties',
    include_connections: 'includeConnections',
    include_dependencies: 'includeDependencies',
    include_scripts: 'includeScripts',
    max_results: 'maxResults',
  };

  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = mapping[key] || key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[normalizedKey] = normalizeParameters(value);
      } else if (Array.isArray(value)) {
        result[normalizedKey] = value.map((item) => normalizeParameters(item));
      } else {
        result[normalizedKey] = value;
      }
    }
    return result;
  };

  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({ content: [{ type: 'text', text: message }], isError: true }),
    validatePath: (path) => Boolean(path) && !path.includes('..'),
    executeOperation: options.executeOperation || (async () => ({ stdout: '{"success":true}', stderr: '' })),
    normalizeParameters,
    convertCamelToSnakeCase: (params) => params,
    parseGodotErrors: () => [],
    formatTresValue: (value) => String(value),
    generateUID: () => 'uid://test',
    generateShortUID: () => 'testuid',
    isGodot44OrLater: () => true,
    getGodotPath: async () => 'godot',
    formatProjectSettingValue: (value) => String(value),
    escapeCsvValue: (value) => value,
    parseCsvLine: (line) => line.split(','),
    escapePoString: (value) => value,
    escapeRegex: (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    extractPlaceholders: () => [],
    getOrParseTscn: () => ({}),
    invalidateTscnCache: options.invalidateTscnCache || (() => {}),
  };
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-node-refactor-'));
  await mkdir(join(projectPath, 'scenes'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="NodeRefactorWorkflow"\n');
  await writeFile(join(projectPath, 'scenes', 'level.tscn'), [
    '[gd_scene load_steps=1 format=3]',
    '',
    '[node name="Level" type="Node2D"]',
    '',
    '[node name="Player" type="CharacterBody2D" parent="." groups=["actors"]]',
    'position = Vector2(32, 48)',
    '',
    '[node name="Spawn" type="Marker2D" parent="."]',
    '',
  ].join('\n'));
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerNodeRefactorWorkflowTools(registry, ctx);
  return registry;
}

test('node refactor workflow tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'node_find',
    'node_rename',
    'node_move',
    'node_add_to_group',
    'node_remove_from_group',
    'node_replace_type',
    'node_bulk_property_set',
    'scene_find_references',
    'scene_dependency_report',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('node find and scene reports map search inputs and return parsed JSON', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params, projectDir) => {
        calls.push({ operation, params, projectDir });
        if (operation === 'node_find') {
          return {
            stdout: JSON.stringify({
              success: true,
              count: 1,
              matches: [{ scene_path: 'res://scenes/level.tscn', path: 'Player', type: 'CharacterBody2D' }],
            }) + '\n',
            stderr: '',
          };
        }
        if (operation === 'scene_find_references') {
          return {
            stdout: JSON.stringify({
              success: true,
              target: 'Player',
              references: [{ scene_path: 'res://scenes/level.tscn', kind: 'connection', path: 'Player' }],
              count: 1,
            }) + '\n',
            stderr: '',
          };
        }
        return {
          stdout: JSON.stringify({
            success: true,
            scenes: [{ scene_path: 'res://scenes/level.tscn', node_count: 3 }],
            dependencies: [{ from: 'res://scenes/level.tscn', to: 'res://scripts/player.gd', kind: 'script' }],
            count: 1,
          }) + '\n',
          stderr: '',
        };
      },
    }));

    const found = parseResponse(await registry.dispatch('node_find', {
      project_path: projectPath,
      scene_paths: ['scenes/level.tscn'],
      name: 'Player',
      type: 'CharacterBody2D',
      group_name: 'actors',
      script_path: 'scripts/player.gd',
      property_filters: { visible: true },
      include_properties: true,
      max_results: 12,
    }));
    const refs = parseResponse(await registry.dispatch('scene_find_references', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      node_path: 'Player',
      include_connections: true,
      include_properties: true,
    }));
    const deps = parseResponse(await registry.dispatch('scene_dependency_report', {
      project_path: projectPath,
      scan_paths: ['scenes'],
      include_scripts: true,
    }));

    assert.equal(found.status, 'success');
    assert.equal(found.matches[0].path, 'Player');
    assert.equal(refs.status, 'success');
    assert.equal(refs.references[0].kind, 'connection');
    assert.equal(deps.status, 'success');
    assert.deepEqual(calls.map((call) => call.operation), [
      'node_find',
      'scene_find_references',
      'scene_dependency_report',
    ]);
    assert.deepEqual(calls[0].params.scene_paths, ['scenes/level.tscn']);
    assert.equal(calls[0].params.group_name, 'actors');
    assert.deepEqual(calls[0].params.property_filters, { visible: true });
    assert.equal(calls[0].params.include_properties, true);
    assert.equal(calls[0].params.max_results, 12);
    assert.equal(calls[1].params.node_path, 'Player');
    assert.equal(calls[1].params.include_connections, true);
    assert.deepEqual(calls[2].params.scan_paths, ['scenes']);
    assert.equal(calls.every((call) => call.projectDir === projectPath), true);
  });
});

test('node rename, move, and group tools map mutation payloads and invalidate touched scenes', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const invalidated = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params, projectDir) => {
        calls.push({ operation, params, projectDir });
        return {
          stdout: JSON.stringify({
            success: true,
            operation,
            scene_path: params.scene_path,
            node_path: params.node_path,
          }) + '\n',
          stderr: '',
        };
      },
      invalidateTscnCache: (path) => invalidated.push(path),
    }));

    await registry.dispatch('node_rename', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      node_path: 'Player',
      new_name: 'Hero',
      update_references: true,
    });
    await registry.dispatch('node_move', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      node_path: 'Hero',
      new_parent_path: 'Spawn',
      keep_global_transform: true,
      update_references: true,
    });
    await registry.dispatch('node_add_to_group', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      node_path: 'Hero',
      group_name: 'playable',
      persistent: true,
    });
    await registry.dispatch('node_remove_from_group', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      node_path: 'Hero',
      group_name: 'actors',
    });

    assert.deepEqual(calls.map((call) => call.operation), [
      'node_rename',
      'node_move',
      'node_add_to_group',
      'node_remove_from_group',
    ]);
    assert.equal(calls[0].params.new_name, 'Hero');
    assert.equal(calls[0].params.update_references, true);
    assert.equal(calls[1].params.new_parent_path, 'Spawn');
    assert.equal(calls[1].params.keep_global_transform, true);
    assert.equal(calls[2].params.group_name, 'playable');
    assert.equal(calls[2].params.persistent, true);
    assert.equal(calls[3].params.group_name, 'actors');
    assert.equal(invalidated.length, 4);
  });
});

test('node type replacement and bulk property tools map focused mutation payloads', async () => {
  await withProject(async (projectPath) => {
    const calls = [];
    const registry = createRegistry(createContext({
      executeOperation: async (operation, params) => {
        calls.push({ operation, params });
        return {
          stdout: JSON.stringify({
            success: true,
            operation,
            changed_count: operation === 'node_bulk_property_set' ? params.nodes.length : undefined,
          }) + '\n',
          stderr: '',
        };
      },
    }));

    const replacement = parseResponse(await registry.dispatch('node_replace_type', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      node_path: 'Spawn',
      new_type: 'Node2D',
      preserve_name: true,
      preserve_children: true,
      preserve_groups: true,
      preserve_script: false,
    }));
    const bulk = parseResponse(await registry.dispatch('node_bulk_property_set', {
      project_path: projectPath,
      scene_path: 'scenes/level.tscn',
      nodes: ['Player', 'Spawn'],
      property_name: 'visible',
      property_value: false,
    }));

    assert.equal(replacement.status, 'success');
    assert.equal(bulk.status, 'success');
    assert.deepEqual(calls.map((call) => call.operation), [
      'node_replace_type',
      'node_bulk_property_set',
    ]);
    assert.equal(calls[0].params.new_type, 'Node2D');
    assert.equal(calls[0].params.preserve_children, true);
    assert.equal(calls[0].params.preserve_script, false);
    assert.deepEqual(calls[1].params.nodes, ['Player', 'Spawn']);
    assert.equal(calls[1].params.property_name, 'visible');
    assert.equal(calls[1].params.property_value, false);
  });
});
