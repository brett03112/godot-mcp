export type LiveSessionSnapshot = {
  sessionId: string;
  projectPath: string;
  godotVersion: string;
  editorPid: number | null;
  activeScene: string;
  playState: string;
  writable: boolean;
  connectionState: string;
  lastHeartbeatUnix: number | null;
  lastError: string;
  runtimeStatus?: Record<string, unknown>;
};

export type LiveHelloMessage = {
  kind: 'hello';
  session: Record<string, unknown>;
};

export type LiveHeartbeatMessage = {
  kind: 'heartbeat';
  session: Record<string, unknown>;
};

export type LiveCommandMessage = {
  kind: 'command';
  request_id: string;
  command: string;
  args: Record<string, unknown>;
};

export type LiveCommandResponseMessage = {
  kind: 'command_response';
  request_id?: string | number | null;
  status?: string;
  data?: unknown;
  error?: unknown;
  session?: Record<string, unknown>;
};

export type LiveSessionUpdateMessage =
  | LiveHelloMessage
  | LiveHeartbeatMessage
  | (LiveCommandResponseMessage & { session: Record<string, unknown> });

export type LiveProtocolMessage = LiveSessionUpdateMessage | Record<string, unknown>;

export function isLiveHelloMessage(value: unknown): value is LiveHelloMessage {
  return isObject(value) && value.kind === 'hello' && isObject(value.session);
}

export function isLiveSessionUpdateMessage(value: unknown): value is LiveSessionUpdateMessage {
  return isObject(value)
    && ['hello', 'heartbeat', 'command_response'].includes(String(value.kind))
    && isObject(value.session);
}

export function isLiveCommandResponseMessage(value: unknown): value is LiveCommandResponseMessage {
  return isObject(value)
    && value.kind === 'command_response'
    && (typeof value.request_id === 'string' || typeof value.request_id === 'number');
}

export function normalizeLiveSessionSnapshot(session: Record<string, unknown>): LiveSessionSnapshot {
  const sessionId = requiredString(session.session_id, 'session.session_id');
  const projectPath = requiredString(session.project_path, 'session.project_path');

  return {
    sessionId,
    projectPath,
    godotVersion: optionalString(session.godot_version) || 'unknown',
    editorPid: optionalNumber(session.editor_pid),
    activeScene: optionalString(session.active_scene) || '',
    playState: optionalString(session.play_state) || 'unknown',
    writable: optionalBoolean(session.writable, true),
    connectionState: optionalString(session.connection_state) || 'connected',
    lastHeartbeatUnix: optionalNumber(session.last_heartbeat_unix),
    lastError: optionalString(session.last_error) || '',
    runtimeStatus: optionalObject(session.runtime_status) || optionalObject(session.runtimeStatus) || undefined,
  };
}

export function parseLiveProtocolMessage(text: string): LiveProtocolMessage {
  const parsed = JSON.parse(text);
  if (!isObject(parsed)) {
    throw new Error('Live protocol message must be a JSON object.');
  }
  return parsed;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function optionalObject(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}
