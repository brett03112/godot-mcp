import { ToolRegistry } from '../registry.js';
import { ToolDefinition, ToolResponse } from '../types.js';
import { LiveSessionManager, LiveSessionRecord, liveSessionManager } from '../live/session-manager.js';

export type LiveEditorToolOptions = {
  manager?: LiveSessionManager;
  getTransportStatus?: () => Record<string, unknown>;
};

export function registerLiveEditorTools(registry: ToolRegistry, options: LiveEditorToolOptions = {}): void {
  const manager = options.manager || liveSessionManager;
  registry.registerAll([
    sessionList(manager, options.getTransportStatus),
    sessionActivate(manager),
    sessionDisconnect(manager),
  ]);
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
  return {
    ...args,
    sessionId: args.sessionId ?? args.session_id,
    projectPath: args.projectPath ?? args.project_path,
  };
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
