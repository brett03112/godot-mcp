import { resolve } from 'path';
import {
  LiveHelloMessage,
  LiveProtocolMessage,
  LiveSessionSnapshot,
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

type StoredLiveSession = LiveSessionRecord & {
  connection?: LiveConnectionHandle;
};

export class LiveSessionManager {
  private sessions: Map<string, StoredLiveSession> = new Map();
  private activeSessionId: string | null = null;
  private now: () => number;
  private staleTimeoutMs: number;

  constructor(options: LiveSessionManagerOptions = {}) {
    this.now = options.now || (() => Date.now());
    this.staleTimeoutMs = options.staleTimeoutMs ?? 15000;
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
    if (!record) return;
    record.lastSeenMs = this.now();
    if (isLiveSessionUpdateMessage(message)) {
      const snapshot = normalizeLiveSessionSnapshot(message.session);
      record.activeScene = snapshot.activeScene;
      record.playState = snapshot.playState;
      record.writable = snapshot.writable;
      record.connectionState = snapshot.connectionState;
      record.lastHeartbeatUnix = snapshot.lastHeartbeatUnix;
      record.lastError = snapshot.lastError;
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
      return this.toPublicRecord(session);
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

    return this.toPublicRecord(candidates[0]);
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
    this.sessions.clear();
    this.activeSessionId = null;
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
