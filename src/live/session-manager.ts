import { resolve } from 'path';
import {
  LiveCommandMessage,
  LiveCommandResponseMessage,
  LiveHelloMessage,
  LiveProtocolMessage,
  LiveSessionSnapshot,
  isLiveCommandResponseMessage,
  isLiveHelloMessage,
  isLiveSessionUpdateMessage,
  normalizeLiveSessionSnapshot,
} from './protocol.js';

export type LiveConnectionHandle = {
  remoteAddress?: string;
  close?: () => void;
  send?: (payload: unknown) => void;
};

export type LiveSessionRecord = LiveSessionSnapshot & {
  remoteAddress: string | null;
  connectedAtMs: number;
  lastSeenMs: number;
  stale: boolean;
};

export type LiveSessionManagerOptions = {
  now?: () => number;
  staleTimeoutMs?: number;
};

export type LiveCommandResult = {
  requestId: string;
  status: 'success';
  data: unknown;
  session: LiveSessionRecord | null;
};

export type LiveCommandOptions = {
  sessionId?: string;
  projectPath?: string;
  timeoutMs?: number;
};

type StoredLiveSession = LiveSessionRecord & {
  connection?: LiveConnectionHandle;
};

type PendingLiveCommand = {
  sessionId: string;
  resolve: (result: LiveCommandResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class LiveSessionManager {
  private sessions: Map<string, StoredLiveSession> = new Map();
  private activeSessionId: string | null = null;
  private pendingCommands: Map<string, PendingLiveCommand> = new Map();
  private requestSequence = 0;
  private now: () => number;
  private staleTimeoutMs: number;

  constructor(options: LiveSessionManagerOptions = {}) {
    this.now = options.now || (() => Date.now());
    this.staleTimeoutMs = options.staleTimeoutMs ?? 15000;
  }

  configure(options: Pick<LiveSessionManagerOptions, 'staleTimeoutMs'> = {}): void {
    if (options.staleTimeoutMs !== undefined) {
      this.staleTimeoutMs = options.staleTimeoutMs;
    }
  }

  registerHello(message: LiveHelloMessage | LiveProtocolMessage, connection: LiveConnectionHandle = {}): LiveSessionRecord {
    if (!isLiveHelloMessage(message)) {
      throw new Error('Expected live hello message.');
    }

    const snapshot = normalizeLiveSessionSnapshot(message.session);
    const nowMs = this.now();
    const existing = this.sessions.get(snapshot.sessionId);
    const record: StoredLiveSession = {
      ...snapshot,
      projectPath: normalizeProjectPath(snapshot.projectPath),
      remoteAddress: connection.remoteAddress || existing?.remoteAddress || null,
      connectedAtMs: existing?.connectedAtMs || nowMs,
      lastSeenMs: nowMs,
      stale: false,
      connection,
    };

    this.sessions.set(record.sessionId, record);
    return this.toPublicRecord(record);
  }

  recordMessage(sessionId: string, message: LiveProtocolMessage): void {
    const record = this.sessions.get(sessionId);
    if (record) {
      record.lastSeenMs = this.now();
    }
    if (record && isLiveSessionUpdateMessage(message)) {
      const snapshot = normalizeLiveSessionSnapshot(message.session);
      record.activeScene = snapshot.activeScene;
      record.playState = snapshot.playState;
      record.writable = snapshot.writable;
      record.connectionState = snapshot.connectionState;
      record.lastHeartbeatUnix = snapshot.lastHeartbeatUnix;
      record.lastError = snapshot.lastError;
      if (snapshot.runtimeStatus !== undefined) {
        record.runtimeStatus = snapshot.runtimeStatus;
      }
    }
    if (isLiveCommandResponseMessage(message)) {
      this.resolvePendingCommand(sessionId, message);
    }
  }

  listSessions(projectPath?: string): LiveSessionRecord[] {
    this.cleanupStaleSessions();
    const normalizedProjectPath = projectPath ? normalizeProjectPath(projectPath) : null;
    return Array.from(this.sessions.values())
      .filter((session) => !normalizedProjectPath || session.projectPath === normalizedProjectPath)
      .map((session) => this.toPublicRecord(session));
  }

  getActiveSessionId(): string | null {
    this.cleanupStaleSessions();
    return this.activeSessionId;
  }

  getActiveSession(): LiveSessionRecord | null {
    this.cleanupStaleSessions();
    if (!this.activeSessionId) return null;
    const session = this.sessions.get(this.activeSessionId);
    return session ? this.toPublicRecord(session) : null;
  }

  activateSession(options: { sessionId?: string; projectPath?: string } = {}): LiveSessionRecord {
    this.cleanupStaleSessions();
    const session = this.resolveTargetSession(options);
    this.activeSessionId = session.sessionId;
    return this.toPublicRecord(session);
  }

  resolveTargetSession(options: { sessionId?: string; projectPath?: string } = {}): LiveSessionRecord {
    return this.toPublicRecord(this.resolveTargetStoredSession(options));
  }

  async sendCommand(command: string, args: Record<string, unknown> = {}, options: LiveCommandOptions = {}): Promise<LiveCommandResult> {
    this.cleanupStaleSessions();
    const session = this.resolveTargetStoredSession(options);

    if (!session.connection?.send) {
      throw new Error(`Live session ${session.sessionId} is not command-capable.`);
    }

    const requestId = this.nextRequestId();
    const timeoutMs = options.timeoutMs ?? 5000;
    const payload: LiveCommandMessage = {
      kind: 'command',
      request_id: requestId,
      command,
      args,
    };

    return new Promise<LiveCommandResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new Error(`Live command timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);
      timeout.unref?.();

      this.pendingCommands.set(requestId, {
        sessionId: session.sessionId,
        resolve,
        reject,
        timeout,
      });

      try {
        session.connection?.send?.(payload);
      } catch (error: any) {
        clearTimeout(timeout);
        this.pendingCommands.delete(requestId);
        reject(new Error(`Failed to send live command ${command}: ${error?.message || String(error)}`));
      }
    });
  }

  private resolveTargetStoredSession(options: { sessionId?: string; projectPath?: string } = {}): StoredLiveSession {
    this.cleanupStaleSessions();
    const normalizedProjectPath = options.projectPath ? normalizeProjectPath(options.projectPath) : null;

    if (options.sessionId) {
      const session = this.sessions.get(options.sessionId);
      if (!session) {
        throw new Error(`Live session not found: ${options.sessionId}`);
      }
      if (normalizedProjectPath && session.projectPath !== normalizedProjectPath) {
        throw new Error(`Session ${options.sessionId} project_path ${session.projectPath} does not match requested project_path ${normalizedProjectPath}.`);
      }
      return session;
    }

    const candidates = Array.from(this.sessions.values())
      .filter((session) => !normalizedProjectPath || session.projectPath === normalizedProjectPath);

    if (candidates.length === 0) {
      throw new Error(normalizedProjectPath
        ? `No live sessions match project_path ${normalizedProjectPath}.`
        : 'No live sessions are connected.');
    }

    if (candidates.length > 1) {
      throw new Error('There are multiple live sessions; provide session_id or project_path to choose one.');
    }

    return candidates[0];
  }

  disconnectSession(sessionId?: string): LiveSessionRecord {
    this.cleanupStaleSessions();
    const targetId = sessionId || this.activeSessionId || this.onlySessionId();
    if (!targetId) {
      throw new Error('No live session selected. Provide session_id or activate a session first.');
    }

    const session = this.sessions.get(targetId);
    if (!session) {
      throw new Error(`Live session not found: ${targetId}`);
    }

    this.sessions.delete(targetId);
    if (this.activeSessionId === targetId) {
      this.activeSessionId = null;
    }
    session.connection?.close?.();
    return this.toPublicRecord(session);
  }

  cleanupStaleSessions(): LiveSessionRecord[] {
    const removed: LiveSessionRecord[] = [];
    const nowMs = this.now();
    for (const [sessionId, session] of this.sessions) {
      if (nowMs - session.lastSeenMs <= this.staleTimeoutMs) {
        continue;
      }
      session.stale = true;
      this.sessions.delete(sessionId);
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
      session.connection?.close?.();
      removed.push(this.toPublicRecord(session));
    }
    return removed;
  }

  clear(): void {
    for (const session of this.sessions.values()) {
      session.connection?.close?.();
    }
    for (const [requestId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Live command cancelled during session manager cleanup: ${requestId}`));
    }
    this.pendingCommands.clear();
    this.sessions.clear();
    this.activeSessionId = null;
  }

  private resolvePendingCommand(sessionId: string, message: LiveCommandResponseMessage): void {
    const requestId = String(message.request_id);
    const pending = this.pendingCommands.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingCommands.delete(requestId);

    if (pending.sessionId !== sessionId) {
      pending.reject(new Error(`Live command response session mismatch for ${requestId}: expected ${pending.sessionId}, got ${sessionId}.`));
      return;
    }

    const status = message.status || 'success';
    if (status !== 'success') {
      pending.reject(new Error(formatLiveCommandError(message.error) || `Live command failed: ${requestId}`));
      return;
    }

    const session = this.sessions.get(sessionId);
    pending.resolve({
      requestId,
      status: 'success',
      data: message.data ?? {},
      session: session ? this.toPublicRecord(session) : null,
    });
  }

  private nextRequestId(): string {
    this.requestSequence += 1;
    return `live-${this.now()}-${this.requestSequence}`;
  }

  private onlySessionId(): string | null {
    if (this.sessions.size !== 1) return null;
    return Array.from(this.sessions.keys())[0];
  }

  private toPublicRecord(session: StoredLiveSession): LiveSessionRecord {
    return {
      sessionId: session.sessionId,
      projectPath: session.projectPath,
      godotVersion: session.godotVersion,
      editorPid: session.editorPid,
      activeScene: session.activeScene,
      playState: session.playState,
      writable: session.writable,
      connectionState: session.connectionState,
      lastHeartbeatUnix: session.lastHeartbeatUnix,
      lastError: session.lastError,
      runtimeStatus: session.runtimeStatus,
      remoteAddress: session.remoteAddress,
      connectedAtMs: session.connectedAtMs,
      lastSeenMs: session.lastSeenMs,
      stale: this.now() - session.lastSeenMs > this.staleTimeoutMs,
    };
  }
}

export const liveSessionManager = new LiveSessionManager();

export function normalizeProjectPath(projectPath: string): string {
  return resolve(projectPath);
}

function formatLiveCommandError(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && !Array.isArray(error)) {
    const data = error as Record<string, unknown>;
    const message = typeof data.message === 'string' ? data.message : '';
    const code = typeof data.code === 'string' ? data.code : '';
    if (code && message) return `${code}: ${message}`;
    return message || code || JSON.stringify(data);
  }
  return String(error);
}
