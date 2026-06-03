import { ToolRegistry } from '../registry.js';
import { ToolDefinition, ToolResponse } from '../types.js';
import {
  LiveCommandResult,
  LiveSessionManager,
  LiveSessionRecord,
  liveSessionManager,
  normalizeProjectPath,
} from '../live/session-manager.js';

export type LiveEditorToolOptions = {
  manager?: LiveSessionManager;
  getTransportStatus?: () => Record<string, unknown>;
};

type LiveToolConfig = {
  name: string;
  command: string;
  description: string;
  properties?: Record<string, unknown>;
  required?: string[];
  timeout?: number;
};

const LIVE_RESOURCE_DESCRIPTORS = [
  {
    uri: 'godot-mcp://live/sessions',
    name: 'Godot MCP live sessions',
    description: 'Connected Godot editor live sessions tracked by the MCP server.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/editor/state',
    name: 'Godot MCP live editor state',
    description: 'Current state snapshot from the active Godot editor session.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/scene/current',
    name: 'Godot MCP live current scene',
    description: 'Current active scene metadata from the live Godot editor.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/scene/hierarchy',
    name: 'Godot MCP live scene hierarchy',
    description: 'Compact hierarchy for the active live Godot editor scene.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/selection/current',
    name: 'Godot MCP live current selection',
    description: 'Current selected nodes in the live Godot editor scene tree.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/logs/recent',
    name: 'Godot MCP live recent logs',
    description: 'Recent logs retained by the live Godot editor addon.',
    mimeType: 'application/json',
  },
];

export function registerLiveEditorTools(registry: ToolRegistry, options: LiveEditorToolOptions = {}): void {
  const manager = options.manager || liveSessionManager;
  registry.registerAll([
    editorState(manager),
    sessionList(manager, options.getTransportStatus),
    sessionActivate(manager),
    sessionDisconnect(manager),
    liveCommandTool(manager, {
      name: 'scene_current',
      command: 'scene_current',
      description: 'Read the active scene path, root metadata, and compact hierarchy from the live Godot editor.',
      properties: {
        include_hierarchy: { type: 'boolean', description: 'Include compact scene hierarchy (default: true).' },
      },
    }),
    liveCommandTool(manager, {
      name: 'scene_open',
      command: 'scene_open',
      description: 'Open a scene in the live Godot editor by res:// path.',
      properties: {
        scene_path: { type: 'string', description: 'Scene path to open, for example res://scenes/main.tscn.' },
      },
      required: ['scene_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'scene_save_active',
      command: 'scene_save_active',
      description: 'Save the currently active scene through the live Godot editor.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'scene_reload_active',
      command: 'scene_reload_active',
      description: 'Reload the currently active scene through the live Godot editor.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'selection_get',
      command: 'selection_get',
      description: 'Read selected node paths from the live Godot editor scene tree.',
    }),
    liveCommandTool(manager, {
      name: 'selection_set',
      command: 'selection_set',
      description: 'Set selected node paths in the live Godot editor scene tree.',
      properties: {
        node_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node paths relative to the active scene root. Use "." for the root node.',
        },
        replace: { type: 'boolean', description: 'Clear existing selection before selecting nodes (default: true).' },
      },
      required: ['node_paths'],
    }),
    liveCommandTool(manager, {
      name: 'editor_screenshot',
      command: 'editor_screenshot',
      description: 'Capture a live Godot editor viewport screenshot to a project-relative PNG path.',
      properties: {
        output_path: { type: 'string', description: 'Project-relative output path, for example screenshots/editor.png.' },
        viewport: { type: 'string', enum: ['2d', '3d'], description: 'Editor viewport to capture (default: 2d).' },
        viewport_index: { type: 'number', description: '3D viewport index from 0 to 3 (default: 0).' },
      },
      required: ['output_path'],
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'logs_read_editor',
      command: 'logs_read_editor',
      description: 'Read recent log messages retained by the live Godot editor addon.',
      properties: {
        limit: { type: 'number', description: 'Maximum number of log records to return.' },
      },
    }),
    liveCommandTool(manager, {
      name: 'logs_clear',
      command: 'logs_clear',
      description: 'Clear recent log messages retained by the live Godot editor addon.',
    }),
    liveCommandTool(manager, {
      name: 'editor_monitors_get',
      command: 'editor_monitors_get',
      description: 'Read selected Godot Performance monitor values from the live editor process.',
      properties: {
        monitors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional monitor names such as TIME_FPS or OBJECT_NODE_COUNT.',
        },
      },
    }),
    liveCommandTool(manager, {
      name: 'editor_quit',
      command: 'editor_quit',
      description: 'Quit or restart the live Godot editor. Requires confirm: true.',
      properties: {
        confirm: { type: 'boolean', description: 'Must be true to quit the editor.' },
        save: { type: 'boolean', description: 'Save before quitting/restarting when supported (default: true).' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_scene_get_hierarchy',
      command: 'live_scene_get_hierarchy',
      description: 'Read the active live editor scene hierarchy without requiring a scene file path.',
      properties: {
        max_depth: { type: 'number', description: 'Maximum hierarchy depth to include (default: 8).' },
        include_properties: { type: 'boolean', description: 'Include compact serialized node properties (default: false).' },
      },
    }),
    liveCommandTool(manager, {
      name: 'live_node_get_properties',
      command: 'live_node_get_properties',
      description: 'Read properties for a node in the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. Use "." for the root node.' },
        property_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional property names to read. If omitted, editor/storage/script properties are returned.',
        },
      },
      required: ['node_path'],
    }),
    liveCommandTool(manager, {
      name: 'live_node_set_property',
      command: 'live_node_set_property',
      description: 'Set a property on a node in the active live editor scene and mark the scene dirty by default.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. Use "." for the root node.' },
        property_name: { type: 'string', description: 'Property name to set.' },
        property_value: { description: 'JSON value to assign. Typed values may use { "type": "Vector2", "value": [x, y] } and similar forms.' },
        mark_dirty: { type: 'boolean', description: 'Mark the current scene unsaved after mutation (default: true).' },
      },
      required: ['node_path', 'property_name', 'property_value'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_create',
      command: 'live_node_create',
      description: 'Create a node under a parent in the active live editor scene.',
      properties: {
        parent_path: { type: 'string', description: 'Parent node path relative to the active scene root. Use "." for the root node.' },
        node_type: { type: 'string', description: 'Godot class name to instantiate, for example Node2D, Sprite2D, or Button.' },
        node_name: { type: 'string', description: 'Name for the new node.' },
        properties: { type: 'object', description: 'Optional properties to set on the new node.' },
        select: { type: 'boolean', description: 'Select the new node in the editor after creation (default: false).' },
      },
      required: ['parent_path', 'node_type', 'node_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_delete',
      command: 'live_node_delete',
      description: 'Delete a node from the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. The root node cannot be deleted.' },
        keep_children: { type: 'boolean', description: 'Reparent children to the deleted node parent before deletion (default: false).' },
      },
      required: ['node_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_duplicate',
      command: 'live_node_duplicate',
      description: 'Duplicate a node in the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. The root node cannot be duplicated.' },
        new_name: { type: 'string', description: 'Optional name for the duplicated node.' },
        select: { type: 'boolean', description: 'Select the duplicated node in the editor after duplication (default: false).' },
      },
      required: ['node_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_reparent',
      command: 'live_node_reparent',
      description: 'Move a node under a new parent in the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. The root node cannot be reparented.' },
        new_parent_path: { type: 'string', description: 'New parent node path relative to the active scene root. Use "." for the root node.' },
        keep_global_transform: { type: 'boolean', description: 'Preserve global transform where Godot supports it (default: true).' },
      },
      required: ['node_path', 'new_parent_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_rename',
      command: 'live_node_rename',
      description: 'Rename a node in the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root.' },
        new_name: { type: 'string', description: 'New node name.' },
      },
      required: ['node_path', 'new_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_connect_signal',
      command: 'live_node_connect_signal',
      description: 'Connect a signal between two nodes in the active live editor scene.',
      properties: {
        source_node_path: { type: 'string', description: 'Source node path relative to the active scene root.' },
        signal_name: { type: 'string', description: 'Signal name on the source node.' },
        target_node_path: { type: 'string', description: 'Target node path relative to the active scene root.' },
        method_name: { type: 'string', description: 'Target method name.' },
        flags: { type: 'number', description: 'Godot connect flags. Defaults to CONNECT_PERSIST in the addon.' },
        binds: { type: 'array', description: 'Optional bound arguments for the callable.' },
      },
      required: ['source_node_path', 'signal_name', 'target_node_path', 'method_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_disconnect_signal',
      command: 'live_node_disconnect_signal',
      description: 'Disconnect a signal between two nodes in the active live editor scene.',
      properties: {
        source_node_path: { type: 'string', description: 'Source node path relative to the active scene root.' },
        signal_name: { type: 'string', description: 'Signal name on the source node.' },
        target_node_path: { type: 'string', description: 'Target node path relative to the active scene root.' },
        method_name: { type: 'string', description: 'Target method name.' },
        binds: { type: 'array', description: 'Optional bound arguments used when the connection was created.' },
      },
      required: ['source_node_path', 'signal_name', 'target_node_path', 'method_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_scene_mark_dirty',
      command: 'live_scene_mark_dirty',
      description: 'Mark the current live editor scene as unsaved.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_scene_save',
      command: 'live_scene_save',
      description: 'Save the current live editor scene.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'editor_filesystem_scan',
      command: 'editor_filesystem_scan',
      description: 'Ask the live Godot editor filesystem to scan externally changed project files.',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional project resource paths to update before scanning. Omit to scan the whole project.',
        },
        wait_for_scan: { type: 'boolean', description: 'Wait briefly for the scan to settle before returning metadata (default: true).' },
      },
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'editor_filesystem_reimport',
      command: 'editor_filesystem_reimport',
      description: 'Ask the live Godot editor to reimport selected project resources.',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Project resource paths to reimport, for example res://icon.svg.',
        },
      },
      required: ['paths'],
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'editor_resource_reload',
      command: 'editor_resource_reload',
      description: 'Reload a resource through the live Godot editor process.',
      properties: {
        resource_path: { type: 'string', description: 'Project resource path to reload, for example res://materials/theme.tres.' },
        cache_mode: {
          type: 'string',
          enum: ['reuse', 'ignore', 'replace', 'ignore_deep', 'replace_deep'],
          description: 'ResourceLoader cache mode to use (default: replace).',
        },
      },
      required: ['resource_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'editor_resource_uid_update',
      command: 'editor_resource_uid_update',
      description: 'Ask the live Godot editor to refresh UID metadata for selected resources.',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Project resource paths whose UID metadata should be refreshed.',
        },
      },
      required: ['paths'],
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'editor_open_resource',
      command: 'editor_open_resource',
      description: 'Open or edit a project resource in the live Godot editor.',
      properties: {
        resource_path: { type: 'string', description: 'Project resource path to open, for example res://coin_v2.gd.' },
      },
      required: ['resource_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'editor_focus_file',
      command: 'editor_focus_file',
      description: 'Focus a project resource path in the live Godot editor filesystem dock.',
      properties: {
        resource_path: { type: 'string', description: 'Project resource path to reveal in the filesystem dock.' },
      },
      required: ['resource_path'],
      timeout: 10000,
    }),
  ]);
}

export function getLiveResourceDescriptors(): Array<Record<string, unknown>> {
  return LIVE_RESOURCE_DESCRIPTORS.map((resource) => ({ ...resource }));
}

export async function readLiveResource(uri: string, manager: LiveSessionManager = liveSessionManager): Promise<Record<string, unknown>> {
  const parsed = new URL(uri);
  const resourcePath = parsed.pathname.replace(/^\//, '');

  if (parsed.protocol !== 'godot-mcp:' || parsed.hostname !== 'live') {
    throw new Error(`Unsupported live resource URI: ${uri}`);
  }

  if (resourcePath === 'sessions') {
    const sessions = manager.listSessions();
    return {
      status: 'success',
      count: sessions.length,
      active_session_id: manager.getActiveSessionId(),
      sessions: sessions.map(serializeSession),
    };
  }

  const commandByResource: Record<string, { command: string; args?: Record<string, unknown> }> = {
    'editor/state': { command: 'editor_state' },
    'scene/current': { command: 'scene_current' },
    'scene/hierarchy': { command: 'scene_current', args: { include_hierarchy: true } },
    'selection/current': { command: 'selection_get' },
    'logs/recent': { command: 'logs_read_editor', args: { limit: 200 } },
  };

  const config = commandByResource[resourcePath];
  if (!config) {
    throw new Error(`Live resource not found: ${uri}`);
  }

  const result = await manager.sendCommand(config.command, config.args || {});
  return serializeCommandResult(result);
}

function editorState(manager: LiveSessionManager): ToolDefinition {
  return liveCommandTool(manager, {
    name: 'editor_state',
    command: 'editor_state',
    description: 'Read the current live Godot editor state, including active scene, selected nodes, open scenes, play state, and writable status.',
  });
}

function liveCommandTool(manager: LiveSessionManager, config: LiveToolConfig): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Specific live editor session ID to target.' },
        project_path: { type: 'string', description: 'Only target a session for this project path.' },
        timeout_ms: { type: 'number', description: 'Command timeout in milliseconds.' },
        ...(config.properties || {}),
      },
      required: config.required,
    },
    timeout: config.timeout || 30000,
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      try {
        const result = await manager.sendCommand(config.command, commandArgs(args), {
          sessionId: args.sessionId,
          projectPath: args.projectPath,
          timeoutMs: args.timeoutMs || config.timeout,
        });
        return jsonResponse(serializeCommandResult(result));
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function sessionList(manager: LiveSessionManager, getTransportStatus?: () => Record<string, unknown>): ToolDefinition {
  return {
    name: 'session_list',
    description: 'List connected Godot editor live sessions tracked by the MCP-side session manager.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
      },
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      const sessions = manager.listSessions(args.projectPath);
      return jsonResponse({
        status: 'success',
        count: sessions.length,
        active_session_id: manager.getActiveSessionId(),
        transport: getTransportStatus ? getTransportStatus() : undefined,
        sessions: sessions.map(serializeSession),
      });
    },
  };
}

function sessionActivate(manager: LiveSessionManager): ToolDefinition {
  return {
    name: 'session_activate',
    description: 'Select the active Godot editor live session by session ID or project path.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        project_path: { type: 'string' },
      },
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      try {
        const session = manager.activateSession({
          sessionId: args.sessionId,
          projectPath: args.projectPath,
        });
        return jsonResponse({
          status: 'success',
          active_session_id: session.sessionId,
          session: serializeSession(session),
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function sessionDisconnect(manager: LiveSessionManager): ToolDefinition {
  return {
    name: 'session_disconnect',
    description: 'Disconnect a Godot editor live session and remove it from the MCP session table.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
      },
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      try {
        const session = manager.disconnectSession(args.sessionId);
        return jsonResponse({
          status: 'success',
          disconnected_session_id: session.sessionId,
          session: serializeSession(session),
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function serializeCommandResult(result: LiveCommandResult): Record<string, unknown> {
  return {
    status: result.status,
    request_id: result.requestId,
    session: result.session ? serializeSession(result.session) : null,
    data: result.data ?? {},
  };
}

function serializeSession(session: LiveSessionRecord): Record<string, unknown> {
  return {
    session_id: session.sessionId,
    project_path: session.projectPath,
    godot_version: session.godotVersion,
    editor_pid: session.editorPid,
    active_scene: session.activeScene,
    play_state: session.playState,
    writable: session.writable,
    connection_state: session.connectionState,
    last_heartbeat_unix: session.lastHeartbeatUnix,
    last_error: session.lastError,
    last_seen_ms: session.lastSeenMs,
    connected_at_ms: session.connectedAtMs,
    stale: session.stale,
    remote_address: session.remoteAddress,
  };
}

function normalizeArgs(args: any): any {
  const projectPath = args.projectPath ?? args.project_path;
  return {
    ...args,
    sessionId: args.sessionId ?? args.session_id,
    projectPath,
    normalizedProjectPath: projectPath ? normalizeProjectPath(projectPath) : undefined,
    timeoutMs: args.timeoutMs ?? args.timeout_ms,
  };
}

function commandArgs(args: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    if (['session_id', 'sessionId', 'project_path', 'projectPath', 'normalizedProjectPath', 'timeout_ms', 'timeoutMs'].includes(key)) {
      continue;
    }
    result[key] = value;
  }
  if (args.normalizedProjectPath) {
    result.project_path = args.normalizedProjectPath;
  }
  return result;
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
