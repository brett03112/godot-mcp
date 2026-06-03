import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { LiveSessionManager, liveSessionManager } from './session-manager.js';
import { isLiveHelloMessage, parseLiveProtocolMessage } from './protocol.js';

export type LiveTransportOptions = {
  host?: string;
  port?: number;
  path?: string;
  sharedSecret?: string;
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

let transport: LiveSessionTransport | null = null;

export class LiveSessionTransport {
  private manager: LiveSessionManager;
  private options: Required<Omit<LiveTransportOptions, 'sharedSecret' | 'onError'>> & Pick<LiveTransportOptions, 'sharedSecret' | 'onError'>;
  private server: WebSocketServer | null = null;
  private running = false;
  private lastError: string | null = null;

  constructor(manager: LiveSessionManager, options: LiveTransportOptions = {}) {
    this.manager = manager;
    this.options = {
      host: options.host || DEFAULT_HOST,
      port: options.port || DEFAULT_PORT,
      path: options.path || DEFAULT_PATH,
      sharedSecret: options.sharedSecret,
      onError: options.onError,
    };
  }

  start(): LiveTransportStatus {
    if (this.server) {
      return this.getStatus();
    }

    try {
      this.server = new WebSocketServer({
        host: this.options.host,
        port: this.options.port,
        path: this.options.path,
        perMessageDeflate: false,
      });
      this.running = true;
      this.lastError = null;
      this.server.on('connection', (socket, request) => this.handleConnection(socket, request));
      this.server.on('error', (error) => this.recordError(error.message));
      this.server.on('close', () => {
        this.running = false;
      });
    } catch (error: any) {
      this.recordError(error?.message || String(error));
    }

    return this.getStatus();
  }

  stop(): void {
    if (!this.server) return;
    for (const client of this.server.clients) {
      client.close();
    }
    this.server.close();
    this.server = null;
    this.running = false;
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
    this.running = this.server !== null;
    this.options.onError?.(message);
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

export function stopLiveSessionTransport(): void {
  transport?.stop();
  transport = null;
}

export function getLiveSessionTransportStatus(): LiveTransportStatus {
  return transport?.getStatus() || {
    running: false,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    path: DEFAULT_PATH,
    lastError: null,
  };
}

function isLoopbackAddress(remoteAddress: string): boolean {
  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1';
}
