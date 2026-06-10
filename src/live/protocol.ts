export type LiveSessionSnapshot = {
  sessionId: string;
  projectPath: string;
  godotVersion: string;
  protocolVersion: string | null;
  addonVersion: string | null;
  compatibility: LiveCompatibilityResult;
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

export const LIVE_PROTOCOL_VERSION = '1.0.0';
export const SUPPORTED_LIVE_PROTOCOL_VERSIONS = [LIVE_PROTOCOL_VERSION] as const;
export const LIVE_ADDON_VERSION = '0.1.0';
export const SUPPORTED_GODOT_VERSION_RANGE = '>=4.6 <5.0';

export type LiveCompatibilityResult = {
  compatible: boolean;
  reason: string;
  remediation: string;
  protocol: {
    provided: string | null;
    required: string;
    supported: string[];
    compatible: boolean;
    reason: string;
  };
  godot: {
    provided: string | null;
    supported: string;
    compatible: boolean | null;
    reason: string;
  };
  addon: {
    provided: string | null;
    server_version: string;
    compatible: boolean | null;
    reason: string;
  };
};

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
    protocolVersion: optionalString(session.protocol_version) || optionalString(session.protocolVersion),
    addonVersion: optionalString(session.addon_version) || optionalString(session.addonVersion),
    compatibility: checkLiveCompatibility(session),
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

export function stringifyLiveProtocolMessage(message: LiveProtocolMessage): string {
  if (!isObject(message)) {
    throw new Error('Live protocol message must be a JSON object.');
  }
  return JSON.stringify(message);
}

export function checkLiveCompatibility(session: Record<string, unknown>): LiveCompatibilityResult {
  const protocolVersion = optionalString(session.protocol_version) || optionalString(session.protocolVersion);
  const addonVersion = optionalString(session.addon_version) || optionalString(session.addonVersion);
  const godotVersion = optionalString(session.godot_version) || optionalString(session.godotVersion);
  const protocolCompatible = Boolean(protocolVersion && SUPPORTED_LIVE_PROTOCOL_VERSIONS.includes(protocolVersion as any));
  const godotCompatible = godotVersion ? isSupportedGodotVersion(godotVersion) : null;
  const addonCompatible = addonVersion ? true : null;

  const protocolReason = protocolCompatible
    ? `Live protocol ${protocolVersion} is supported.`
    : protocolVersion
      ? `Live protocol ${protocolVersion} is not supported by this MCP server.`
      : 'Live hello is missing protocol_version.';
  const godotReason = godotCompatible === true
    ? `Godot ${godotVersion} is within ${SUPPORTED_GODOT_VERSION_RANGE}.`
    : godotCompatible === false
      ? `Godot ${godotVersion} is outside ${SUPPORTED_GODOT_VERSION_RANGE}.`
      : 'Godot version was not provided; compatibility could not be checked.';
  const addonReason = addonVersion
    ? `Addon version ${addonVersion} reported by the live editor.`
    : 'Addon version was not provided; update the bundled addon if this was unexpected.';

  const compatible = protocolCompatible && godotCompatible !== false;
  const failures = [protocolReason, godotReason].filter((reason) => /not supported|outside|missing/i.test(reason));
  const remediation = 'Update the Godot MCP Live addon from the bundled source, reload or re-enable the addon in Godot, then reload the MCP connector if server code changed.';

  return {
    compatible,
    reason: compatible ? 'Live bridge compatibility checks passed.' : failures.join(' '),
    remediation,
    protocol: {
      provided: protocolVersion,
      required: LIVE_PROTOCOL_VERSION,
      supported: [...SUPPORTED_LIVE_PROTOCOL_VERSIONS],
      compatible: protocolCompatible,
      reason: protocolReason,
    },
    godot: {
      provided: godotVersion,
      supported: SUPPORTED_GODOT_VERSION_RANGE,
      compatible: godotCompatible,
      reason: godotReason,
    },
    addon: {
      provided: addonVersion,
      server_version: LIVE_ADDON_VERSION,
      compatible: addonCompatible,
      reason: addonReason,
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSupportedGodotVersion(version: string): boolean {
  const match = version.match(/^(\d+)\.(\d+)(?:\.|$)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 4 && minor >= 6;
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
