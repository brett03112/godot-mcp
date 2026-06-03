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
