import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { LiveSessionManager, liveSessionManager, normalizeProjectPath } from './session-manager.js';
import { checkLiveCompatibility, isLiveHelloMessage, parseLiveProtocolMessage } from './protocol.js';
import { isProjectAllowed } from './config.js';

export type LiveTransportOptions = {
  host?: string;
  port?: number;
  path?: string;
  sharedSecret?: string;
  allowedProjectPaths?: string[];
  onError?: (message: string) => void;
};

export type LiveTransportStatus = {
  running: boolean;
  host: string;
  port: number;
  path: string;
  lastError: string | null;
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 6010;
const DEFAULT_PATH = '/godot-mcp-live';
const START_RETRY_DELAY_MS = 250;

let transport: LiveSessionTransport | null = null;

export class LiveSessionTransport {
  private manager: LiveSessionManager;
  private options: Required<Omit<LiveTransportOptions, 'sharedSecret' | 'onError'>> & Pick<LiveTransportOptions, 'sharedSecret' | 'onError'>;
  private server: WebSocketServer | null = null;
  private running = false;
  private lastError: string | null = null;
  private lastErrorAtMs = 0;

  constructor(manager: LiveSessionManager, options: LiveTransportOptions = {}) {
    this.manager = manager;
    this.options = {
      host: options.host || DEFAULT_HOST,
      port: options.port || DEFAULT_PORT,
      path: options.path || DEFAULT_PATH,
      sharedSecret: options.sharedSecret,
      allowedProjectPaths: options.allowedProjectPaths || [],
      onError: options.onError,
    };
  }

  start(): LiveTransportStatus {
    if (this.server) {
      return this.getStatus();
    }

    try {
      const server = new WebSocketServer({
        host: this.options.host,
        port: this.options.port,
        path: this.options.path,
        perMessageDeflate: false,
      });
      this.server = server;
      this.running = false;
      this.lastError = null;
      server.on('listening', () => {
        if (this.server !== server) return;
        this.running = true;
        this.lastError = null;
      });
      server.on('connection', (socket, request) => this.handleConnection(socket, request));
      server.on('error', (error) => this.recordServerError(error.message, server));
      server.on('close', () => {
        if (this.server !== server) return;
        this.server = null;
        this.running = false;
      });
    } catch (error: any) {
      this.recordError(error?.message || String(error));
    }

    return this.getStatus();
  }

  stop(): void {
    if (!this.server) return;
    const server = this.server;
    for (const client of server.clients) {
      client.close();
    }
    this.server = null;
    this.running = false;
    server.close();
  }

  getStatus(): LiveTransportStatus {
    return {
      running: this.running,
      host: this.options.host,
      port: this.options.port,
      path: this.options.path,
      lastError: this.lastError,
    };
  }

  getStatusWithRetry(): LiveTransportStatus {
    const status = this.getStatus();
    if (
      !status.running
      && status.lastError
      && Date.now() - this.lastErrorAtMs >= START_RETRY_DELAY_MS
    ) {
      return this.start();
    }
    return status;
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const remoteAddress = request.socket.remoteAddress || '';
    if (!isLoopbackAddress(remoteAddress)) {
      socket.close(1008, 'Godot MCP live bridge accepts loopback clients only.');
      return;
    }

    const url = new URL(request.url || this.options.path, `ws://${this.options.host}:${this.options.port}`);
    if (this.options.sharedSecret && url.searchParams.get('secret') !== this.options.sharedSecret) {
      socket.close(1008, 'Invalid Godot MCP live bridge secret.');
      return;
    }

    let sessionId: string | null = null;
    socket.on('error', (error) => this.recordError(error.message));
    socket.on('message', (data) => {
      try {
        const message = parseLiveProtocolMessage(data.toString());
        if (isLiveHelloMessage(message)) {
          const compatibility = checkLiveCompatibility(message.session);
          if (!compatibility.compatible) {
            const reason = `Godot MCP live protocol compatibility failed: ${compatibility.reason} ${compatibility.remediation}`;
            this.recordError(reason);
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                kind: 'error',
                error: {
                  code: 'live_protocol_incompatible',
                  message: reason,
                  compatibility,
                },
              }), () => socket.close(1008, reason.slice(0, 120)));
            } else {
              socket.close(1008, reason.slice(0, 120));
            }
            return;
          }
          const projectPath = normalizeProjectPath(String(message.session.project_path));
          if (!isProjectAllowed(projectPath, this.options.allowedProjectPaths)) {
            socket.close(1008, 'Godot MCP live bridge project path is not allowed by MCP config.');
            return;
          }
          const session = this.manager.registerHello(message, {
            remoteAddress,
            close: () => socket.close(),
            send: (payload) => socket.send(JSON.stringify(payload)),
          });
          sessionId = session.sessionId;
          return;
        }
        if (sessionId) {
          this.manager.recordMessage(sessionId, message);
        }
      } catch (error: any) {
        this.recordError(error?.message || String(error));
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            kind: 'error',
            error: {
              code: 'invalid_live_message',
              message: error?.message || String(error),
            },
          }));
        }
      }
    });
    socket.on('close', () => {
      if (sessionId) {
        try {
          this.manager.disconnectSession(sessionId);
        } catch {
          // The session may already have been removed by explicit MCP command.
        }
      }
    });
  }

  private recordError(message: string): void {
    this.lastError = message;
    this.lastErrorAtMs = Date.now();
    this.options.onError?.(message);
  }

  private recordServerError(message: string, server: WebSocketServer): void {
    this.recordError(message);
    if (this.server !== server) return;
    this.server = null;
    this.running = false;
    try {
      server.close();
    } catch {
      // The server may not have finished binding, which is expected for startup errors.
    }
  }
}

export function startLiveSessionTransport(
  manager: LiveSessionManager = liveSessionManager,
  options: LiveTransportOptions = {},
): LiveTransportStatus {
  if (!transport) {
    transport = new LiveSessionTransport(manager, options);
  }
  return transport.start();
}

export function ensureLiveSessionTransportStatus(
  manager: LiveSessionManager = liveSessionManager,
  options: LiveTransportOptions = {},
): LiveTransportStatus {
  if (!transport) {
    transport = new LiveSessionTransport(manager, options);
    return transport.start();
  }
  return transport.getStatusWithRetry();
}

export function stopLiveSessionTransport(): void {
  transport?.stop();
  transport = null;
}

export function getLiveSessionTransportStatus(): LiveTransportStatus {
  return ensureLiveSessionTransportStatus();
}

function isLoopbackAddress(remoteAddress: string): boolean {
  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1';
}
