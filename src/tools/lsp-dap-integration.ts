/**
 * LSP and DAP integration tools for Phase 4.7.
 */

import { existsSync, readFileSync } from 'fs';
import { Socket, connect as netConnect } from 'net';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_LSP_PORT = 6005;
const DEFAULT_DAP_PORT = 6006;
const DEFAULT_TIMEOUT_MS = 10000;

type ProtocolMessage = Record<string, any>;

interface ResolvedProject {
  projectRoot: string;
}

interface ResolvedScript {
  absolutePath: string;
  relativePath: string;
  uri: string;
  text: string;
}

export function registerLspDapIntegrationTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    lspStatus(ctx),
    lspSymbols(ctx),
    lspDefinition(ctx),
    lspReferences(ctx),
    lspDiagnostics(ctx),
    lspRenamePreview(ctx),
    dapStatus(ctx),
    dapSetBreakpoint(ctx, false),
    dapSetBreakpoint(ctx, true),
    dapStackTrace(ctx),
    dapVariables(ctx),
    dapContinue(ctx),
    dapStep(ctx),
  ]);
}

function lspStatus(ctx: ServerContext): ToolDefinition {
  return {
    name: 'lsp_status',
    description: 'Check the Godot GDScript language server TCP endpoint and report initialized capabilities.',
    inputSchema: {
      type: 'object',
      properties: lspProperties(),
    },
    timeout: 10000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = args.projectPath ? resolveProjectRoot(ctx, args.projectPath) : null;
      if (project && 'error' in project) return failure(project.error);
      const client = new LspClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_LSP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const initialized = await client.initialize(project && 'projectRoot' in project ? project.projectRoot : null);
        return jsonResponse({
          status: 'available',
          host: client.host,
          port: client.port,
          server_info: initialized.serverInfo || null,
          capabilities: initialized.capabilities || {},
        });
      } catch (error: any) {
        return jsonResponse({
          status: 'unavailable',
          host: client.host,
          port: client.port,
          reason: error?.message || String(error),
        });
      } finally {
        client.dispose();
      }
    },
  };
}

function lspSymbols(ctx: ServerContext): ToolDefinition {
  return {
    name: 'lsp_symbols',
    description: 'Retrieve document symbols for a GDScript file from the Godot language server.',
    inputSchema: {
      type: 'object',
      properties: lspProperties(),
      required: ['project_path', 'script_path'],
    },
    timeout: 45000,
    handler: async (rawArgs) => {
      const prepared = prepareLspDocument(ctx, rawArgs);
      if ('error' in prepared) return failure(prepared.error);
      const { args, project, script } = prepared;
      const client = new LspClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_LSP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        await client.initialize(project.projectRoot);
        openLspDocument(client, script);
        const result = await client.request('textDocument/documentSymbol', {
          textDocument: { uri: script.uri },
        });
        return jsonResponse({
          status: 'success',
          script_path: script.relativePath,
          uri: script.uri,
          symbols: Array.isArray(result) ? result : [],
          raw: result,
        });
      } catch (error: any) {
        return unavailable(error);
      } finally {
        client.dispose();
      }
    },
  };
}

function lspDefinition(ctx: ServerContext): ToolDefinition {
  return {
    name: 'lsp_definition',
    description: 'Resolve a GDScript symbol definition location through the Godot language server.',
    inputSchema: {
      type: 'object',
      properties: lspProperties(),
      required: ['project_path', 'script_path', 'line', 'column'],
    },
    timeout: 45000,
    handler: async (rawArgs) => {
      const prepared = prepareLspDocument(ctx, rawArgs);
      if ('error' in prepared) return failure(prepared.error);
      const { args, project, script } = prepared;
      const client = new LspClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_LSP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        await client.initialize(project.projectRoot);
        openLspDocument(client, script);
        const result = await client.request('textDocument/definition', {
          textDocument: { uri: script.uri },
          position: lspPosition(args),
        });
        return jsonResponse({
          status: 'success',
          script_path: script.relativePath,
          locations: normalizeLocations(result),
          raw: result,
        });
      } catch (error: any) {
        return unavailable(error);
      } finally {
        client.dispose();
      }
    },
  };
}

function lspReferences(ctx: ServerContext): ToolDefinition {
  return {
    name: 'lsp_references',
    description: 'Find references for a GDScript symbol through the Godot language server.',
    inputSchema: {
      type: 'object',
      properties: lspProperties(),
      required: ['project_path', 'script_path', 'line', 'column'],
    },
    timeout: 45000,
    handler: async (rawArgs) => {
      const prepared = prepareLspDocument(ctx, rawArgs);
      if ('error' in prepared) return failure(prepared.error);
      const { args, project, script } = prepared;
      const client = new LspClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_LSP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        await client.initialize(project.projectRoot);
        openLspDocument(client, script);
        const result = await client.request('textDocument/references', {
          textDocument: { uri: script.uri },
          position: lspPosition(args),
          context: { includeDeclaration: args.includeDeclaration !== false },
        });
        return jsonResponse({
          status: 'success',
          script_path: script.relativePath,
          references: normalizeLocations(result),
          raw: result,
        });
      } catch (error: any) {
        return unavailable(error);
      } finally {
        client.dispose();
      }
    },
  };
}

function lspDiagnostics(ctx: ServerContext): ToolDefinition {
  return {
    name: 'lsp_diagnostics',
    description: 'Open a GDScript document in the Godot language server and collect published diagnostics.',
    inputSchema: {
      type: 'object',
      properties: lspProperties(),
      required: ['project_path', 'script_path'],
    },
    timeout: 45000,
    handler: async (rawArgs) => {
      const prepared = prepareLspDocument(ctx, rawArgs);
      if ('error' in prepared) return failure(prepared.error);
      const { args, project, script } = prepared;
      const client = new LspClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_LSP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        await client.initialize(project.projectRoot);
        const diagnosticsPromise = client.waitForNotification(
          'textDocument/publishDiagnostics',
          (message) => message.params?.uri === script.uri,
          args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
        client.notify('textDocument/didOpen', {
          textDocument: {
            uri: script.uri,
            languageId: 'gdscript',
            version: 1,
            text: script.text,
          },
        });
        const notification = await diagnosticsPromise.catch(() => null);
        return jsonResponse({
          status: 'success',
          script_path: script.relativePath,
          diagnostics: notification?.params?.diagnostics || [],
          note: notification ? undefined : 'No diagnostics were published before the timeout.',
        });
      } catch (error: any) {
        return unavailable(error);
      } finally {
        client.dispose();
      }
    },
  };
}

function lspRenamePreview(ctx: ServerContext): ToolDefinition {
  return {
    name: 'lsp_rename_preview',
    description: 'Request a GDScript rename workspace edit from the Godot language server without applying it.',
    inputSchema: {
      type: 'object',
      properties: lspProperties(),
      required: ['project_path', 'script_path', 'line', 'column', 'new_name'],
    },
    timeout: 45000,
    handler: async (rawArgs) => {
      const prepared = prepareLspDocument(ctx, rawArgs);
      if ('error' in prepared) return failure(prepared.error);
      const { args, project, script } = prepared;
      if (!args.newName) return failure('new_name is required');
      const client = new LspClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_LSP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        await client.initialize(project.projectRoot);
        openLspDocument(client, script);
        const workspaceEdit = await client.request('textDocument/rename', {
          textDocument: { uri: script.uri },
          position: lspPosition(args),
          newName: args.newName,
        });
        return jsonResponse({
          status: 'success',
          preview_only: true,
          script_path: script.relativePath,
          new_name: args.newName,
          workspace_edit: workspaceEdit || { changes: {} },
        });
      } catch (error: any) {
        return unavailable(error);
      } finally {
        client.dispose();
      }
    },
  };
}

function dapStatus(ctx: ServerContext): ToolDefinition {
  return {
    name: 'dap_status',
    description: 'Check the Godot Debug Adapter TCP endpoint and report initialized capabilities.',
    inputSchema: {
      type: 'object',
      properties: dapProperties(),
    },
    timeout: 10000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = args.projectPath ? resolveProjectRoot(ctx, args.projectPath) : null;
      if (project && 'error' in project) return failure(project.error);
      const client = new DapClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_DAP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const initialized = await client.initialize(project && 'projectRoot' in project ? project.projectRoot : null);
        return jsonResponse({
          status: 'available',
          host: client.host,
          port: client.port,
          capabilities: initialized.body || {},
        });
      } catch (error: any) {
        return jsonResponse({
          status: 'unavailable',
          host: client.host,
          port: client.port,
          reason: error?.message || String(error),
        });
      } finally {
        client.dispose();
      }
    },
  };
}

function dapSetBreakpoint(ctx: ServerContext, clear: boolean): ToolDefinition {
  return {
    name: clear ? 'dap_clear_breakpoint' : 'dap_set_breakpoint',
    description: clear
      ? 'Clear breakpoints for a GDScript source file through the Godot Debug Adapter.'
      : 'Set a breakpoint for a GDScript source file through the Godot Debug Adapter.',
    inputSchema: {
      type: 'object',
      properties: dapProperties(),
      required: clear ? ['project_path', 'script_path'] : ['project_path', 'script_path', 'line'],
    },
    timeout: 30000,
    handler: async (rawArgs) => {
      const prepared = prepareDapSource(ctx, rawArgs);
      if ('error' in prepared) return failure(prepared.error);
      const { args, project, script } = prepared;
      if (!clear && !Number.isFinite(args.line)) return failure('line is required');
      const client = new DapClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_DAP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        await client.initialize(project.projectRoot);
        const response = await client.request('setBreakpoints', {
          source: {
            name: script.relativePath,
            path: script.absolutePath,
          },
          breakpoints: clear ? [] : [{ line: args.line, column: args.column || 1 }],
          sourceModified: false,
        });
        if (!response.success) return dapUnavailable(response);
        return jsonResponse({
          status: 'success',
          script_path: script.relativePath,
          breakpoints: response.body?.breakpoints || [],
        });
      } catch (error: any) {
        return unavailable(error);
      } finally {
        client.dispose();
      }
    },
  };
}

function dapStackTrace(ctx: ServerContext): ToolDefinition {
  return {
    name: 'dap_stack_trace',
    description: 'Retrieve a stack trace from the active Godot Debug Adapter thread.',
    inputSchema: {
      type: 'object',
      properties: dapProperties(),
      required: ['project_path'],
    },
    timeout: 30000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const client = new DapClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_DAP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        await client.initialize(project.projectRoot);
        const threadId = args.threadId || await firstThreadId(client);
        if (!threadId) return jsonResponse({ status: 'unavailable', reason: 'No debug threads are available.' });
        const response = await client.request('stackTrace', {
          threadId,
          startFrame: args.startFrame || 0,
          levels: args.levels || 20,
        });
        if (!response.success) return dapUnavailable(response);
        return jsonResponse({
          status: 'success',
          thread_id: threadId,
          stack_frames: response.body?.stackFrames || [],
          total_frames: response.body?.totalFrames ?? null,
        });
      } catch (error: any) {
        return unavailable(error);
      } finally {
        client.dispose();
      }
    },
  };
}

function dapVariables(ctx: ServerContext): ToolDefinition {
  return {
    name: 'dap_variables',
    description: 'Retrieve variables from an active Godot Debug Adapter frame, scope, or variables reference.',
    inputSchema: {
      type: 'object',
      properties: dapProperties(),
      required: ['project_path'],
    },
    timeout: 30000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const client = new DapClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_DAP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        await client.initialize(project.projectRoot);
        let variablesReference = args.variablesReference;
        let scopes: any[] = [];
        if (!variablesReference) {
          const frameId = args.frameId || await firstFrameId(client, args.threadId);
          if (!frameId) return jsonResponse({ status: 'unavailable', reason: 'No stack frame is available for variable lookup.' });
          const scopesResponse = await client.request('scopes', { frameId });
          if (!scopesResponse.success) return dapUnavailable(scopesResponse);
          scopes = scopesResponse.body?.scopes || [];
          variablesReference = scopes[0]?.variablesReference;
        }
        if (!variablesReference) return jsonResponse({ status: 'unavailable', reason: 'No variablesReference is available.' });
        const response = await client.request('variables', { variablesReference });
        if (!response.success) return dapUnavailable(response);
        return jsonResponse({
          status: 'success',
          variables_reference: variablesReference,
          scopes,
          variables: response.body?.variables || [],
        });
      } catch (error: any) {
        return unavailable(error);
      } finally {
        client.dispose();
      }
    },
  };
}

function dapContinue(ctx: ServerContext): ToolDefinition {
  return {
    name: 'dap_continue',
    description: 'Continue execution for the active Godot Debug Adapter thread.',
    inputSchema: {
      type: 'object',
      properties: dapProperties(),
      required: ['project_path'],
    },
    timeout: 30000,
    handler: async (rawArgs) => dapThreadControl(ctx, rawArgs, 'continue'),
  };
}

function dapStep(ctx: ServerContext): ToolDefinition {
  return {
    name: 'dap_step',
    description: 'Step the active Godot Debug Adapter thread using next, in, or out semantics.',
    inputSchema: {
      type: 'object',
      properties: dapProperties(),
      required: ['project_path'],
    },
    timeout: 30000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const command = stepCommand(args.stepType || 'next');
      return dapThreadControl(ctx, rawArgs, command);
    },
  };
}

async function dapThreadControl(ctx: ServerContext, rawArgs: any, command: string): Promise<ToolResponse> {
  const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
  const project = resolveProjectRoot(ctx, args.projectPath);
  if ('error' in project) return failure(project.error);
  const client = new DapClient(args.host || DEFAULT_HOST, args.port ?? DEFAULT_DAP_PORT, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    await client.initialize(project.projectRoot);
    const threadId = args.threadId || await firstThreadId(client);
    if (!threadId) return jsonResponse({ status: 'unavailable', command, reason: 'No debug threads are available.' });
    const response = await client.request(command, { threadId });
    if (!response.success) return dapUnavailable(response);
    return jsonResponse({
      status: 'success',
      command,
      thread_id: threadId,
      body: response.body || {},
    });
  } catch (error: any) {
    return unavailable(error);
  } finally {
    client.dispose();
  }
}

class LspClient {
  private connection: FramedConnection;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private notifications: ProtocolMessage[] = [];
  private notificationWaiters: Array<{
    method: string;
    predicate: (message: ProtocolMessage) => boolean;
    resolve: (message: ProtocolMessage) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(public host: string, public port: number, private timeoutMs: number) {
    this.connection = new FramedConnection(host, port, timeoutMs, (message) => this.handleMessage(message));
  }

  async initialize(projectRoot: string | null): Promise<any> {
    await this.connection.connect();
    const rootUri = projectRoot ? pathToFileURL(projectRoot).href : null;
    const result = await this.request('initialize', {
      processId: process.pid,
      rootPath: projectRoot,
      rootUri,
      workspaceFolders: projectRoot && rootUri
        ? [{ uri: rootUri, name: projectRoot.split(/[\\/]/).filter(Boolean).pop() || 'Godot Project' }]
        : null,
      capabilities: {
        textDocument: {
          documentSymbol: {},
          definition: {},
          references: {},
          rename: {},
          publishDiagnostics: {},
        },
        workspace: {},
      },
      clientInfo: { name: 'godot-mcp', version: 'phase-4.7' },
    });
    this.notify('initialized', {});
    return result || {};
  }

  request(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    const timer = setTimeout(() => {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        pending.reject(new Error(`LSP request timed out: ${method}`));
      }
    }, this.timeoutMs);
    timer.unref?.();
    const promise = new Promise<any>((resolveRequest, rejectRequest) => {
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
    });
    this.connection.send({ jsonrpc: '2.0', id, method, params });
    return promise;
  }

  notify(method: string, params: any): void {
    this.connection.send({ jsonrpc: '2.0', method, params });
  }

  waitForNotification(method: string, predicate: (message: ProtocolMessage) => boolean, timeoutMs: number): Promise<ProtocolMessage> {
    const existing = this.notifications.find((message) => message.method === method && predicate(message));
    if (existing) return Promise.resolve(existing);
    return new Promise((resolveNotification, rejectNotification) => {
      const timer = setTimeout(() => {
        this.notificationWaiters = this.notificationWaiters.filter((waiter) => waiter.timer !== timer);
        rejectNotification(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.notificationWaiters.push({ method, predicate, resolve: resolveNotification, reject: rejectNotification, timer });
    });
  }

  dispose(): void {
    this.connection.dispose();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }
    for (const waiter of this.notificationWaiters) {
      clearTimeout(waiter.timer);
    }
    this.pending.clear();
    this.notificationWaiters = [];
  }

  private handleMessage(message: ProtocolMessage): void {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    this.notifications.push(message);
    for (const waiter of [...this.notificationWaiters]) {
      if (message.method === waiter.method && waiter.predicate(message)) {
        this.notificationWaiters = this.notificationWaiters.filter((entry) => entry !== waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  }
}

class DapClient {
  private connection: FramedConnection;
  private nextSeq = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; command: string }>();

  constructor(public host: string, public port: number, private timeoutMs: number) {
    this.connection = new FramedConnection(host, port, timeoutMs, (message) => this.handleMessage(message));
  }

  async initialize(projectRoot: string | null): Promise<any> {
    await this.connection.connect();
    return this.request('initialize', {
      adapterID: 'godot',
      clientID: 'godot-mcp',
      clientName: 'Godot MCP',
      locale: 'en-US',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
      supportsVariablePaging: true,
      project: projectRoot || undefined,
    });
  }

  request(command: string, args: any): Promise<any> {
    const seq = this.nextSeq++;
    const timer = setTimeout(() => {
      const pending = this.pending.get(seq);
      if (pending) {
        this.pending.delete(seq);
        pending.reject(new Error(`DAP request timed out: ${command}`));
      }
    }, this.timeoutMs);
    timer.unref?.();
    const promise = new Promise<any>((resolveRequest, rejectRequest) => {
      this.pending.set(seq, { resolve: resolveRequest, reject: rejectRequest, timer, command });
    });
    this.connection.send({ type: 'request', seq, command, arguments: args || {} });
    return promise;
  }

  dispose(): void {
    this.connection.dispose();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
  }

  private handleMessage(message: ProtocolMessage): void {
    if (message.type !== 'response' || message.request_seq === undefined) return;
    const pending = this.pending.get(message.request_seq);
    if (!pending) return;
    this.pending.delete(message.request_seq);
    clearTimeout(pending.timer);
    pending.resolve(message);
  }
}

class FramedConnection {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private connected = false;

  constructor(
    private host: string,
    private port: number,
    private timeoutMs: number,
    private onMessage: (message: ProtocolMessage) => void,
  ) {}

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve();
    return new Promise((resolveConnect, rejectConnect) => {
      const socket = netConnect({ host: this.host, port: this.port });
      this.socket = socket;
      const timer = setTimeout(() => {
        cleanup();
        socket.destroy();
        rejectConnect(new Error(`Timed out connecting to ${this.host}:${this.port}`));
      }, this.timeoutMs);
      timer.unref?.();
      const cleanup = () => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        socket.off('error', onError);
      };
      const onConnect = () => {
        cleanup();
        this.connected = true;
        socket.on('data', (chunk) => this.handleData(chunk));
        socket.on('error', () => {});
        resolveConnect();
      };
      const onError = (error: Error) => {
        cleanup();
        rejectConnect(error);
      };
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
  }

  send(message: ProtocolMessage): void {
    if (!this.socket || !this.connected) {
      throw new Error('Protocol socket is not connected.');
    }
    const body = JSON.stringify(message);
    this.socket.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  }

  dispose(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const headerSeparator = Buffer.from('\r\n\r\n', 'ascii');
    while (true) {
      const headerEnd = this.buffer.indexOf(headerSeparator);
      if (headerEnd === -1) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = Buffer.alloc(0);
        return;
      }
      const length = Number.parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + length);
      this.onMessage(JSON.parse(body));
    }
  }
}

function prepareLspDocument(ctx: ServerContext, rawArgs: any): { args: any; project: ResolvedProject; script: ResolvedScript } | { error: string } {
  const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
  const project = resolveProjectRoot(ctx, args.projectPath);
  if ('error' in project) return project;
  const script = resolveScript(project.projectRoot, args.scriptPath);
  if ('error' in script) return script;
  return { args, project, script };
}

function prepareDapSource(ctx: ServerContext, rawArgs: any): { args: any; project: ResolvedProject; script: ResolvedScript } | { error: string } {
  return prepareLspDocument(ctx, rawArgs);
}

function openLspDocument(client: LspClient, script: ResolvedScript): void {
  client.notify('textDocument/didOpen', {
    textDocument: {
      uri: script.uri,
      languageId: 'gdscript',
      version: 1,
      text: script.text,
    },
  });
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): ResolvedProject | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  if (!existsSync(join(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  }
  return { projectRoot };
}

function resolveScript(projectRoot: string, scriptPath: string | undefined): ResolvedScript | { error: string } {
  if (!scriptPath) return { error: 'script_path is required' };
  const normalized = normalizeResourcePath(scriptPath);
  const absolutePath = isAbsolute(normalized) ? resolve(normalized) : resolve(projectRoot, normalized);
  const rel = relative(projectRoot, absolutePath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    return { error: `Path escapes project: ${scriptPath}` };
  }
  if (!existsSync(absolutePath)) return { error: `script_path not found: ${scriptPath}` };
  return {
    absolutePath,
    relativePath: rel.replace(/\\/g, '/'),
    uri: pathToFileURL(absolutePath).href,
    text: readFileSync(absolutePath, 'utf8'),
  };
}

function normalizeResourcePath(value: string): string {
  return String(value || '').replace(/^res:\/\//, '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    scriptPath: args.scriptPath ?? args.script_path,
    host: args.host ?? DEFAULT_HOST,
    port: numberOrUndefined(args.port),
    line: numberOrUndefined(args.line),
    column: numberOrUndefined(args.column),
    newName: args.newName ?? args.new_name,
    includeDeclaration: args.includeDeclaration ?? args.include_declaration,
    timeoutMs: numberOrUndefined(args.timeoutMs ?? args.timeout_ms),
    threadId: numberOrUndefined(args.threadId ?? args.thread_id),
    frameId: numberOrUndefined(args.frameId ?? args.frame_id),
    variablesReference: numberOrUndefined(args.variablesReference ?? args.variables_reference),
    breakpointId: numberOrUndefined(args.breakpointId ?? args.breakpoint_id),
    stepType: args.stepType ?? args.step_type,
    startFrame: numberOrUndefined(args.startFrame ?? args.start_frame),
    levels: numberOrUndefined(args.levels),
  };
}

function numberOrUndefined(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function lspPosition(args: any): { line: number; character: number } {
  return {
    line: Math.max(0, (args.line || 1) - 1),
    character: Math.max(0, (args.column || 1) - 1),
  };
}

function normalizeLocations(result: any): any[] {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

async function firstThreadId(client: DapClient): Promise<number | null> {
  const response = await client.request('threads', {});
  if (!response.success) return null;
  const thread = response.body?.threads?.[0];
  return Number.isFinite(thread?.id) ? thread.id : null;
}

async function firstFrameId(client: DapClient, threadId?: number): Promise<number | null> {
  const resolvedThreadId = threadId || await firstThreadId(client);
  if (!resolvedThreadId) return null;
  const response = await client.request('stackTrace', { threadId: resolvedThreadId, startFrame: 0, levels: 1 });
  if (!response.success) return null;
  const frame = response.body?.stackFrames?.[0];
  return Number.isFinite(frame?.id) ? frame.id : null;
}

function stepCommand(value: string): string {
  if (value === 'in' || value === 'stepIn') return 'stepIn';
  if (value === 'out' || value === 'stepOut') return 'stepOut';
  return 'next';
}

function lspProperties(): Record<string, any> {
  return {
    project_path: { type: 'string' },
    script_path: { type: 'string' },
    host: { type: 'string', default: DEFAULT_HOST },
    port: { type: 'number', default: DEFAULT_LSP_PORT },
    timeout_ms: { type: 'number', default: DEFAULT_TIMEOUT_MS },
    line: { type: 'number', description: 'One-based source line for symbol position requests.' },
    column: { type: 'number', description: 'One-based source column for symbol position requests.' },
    new_name: { type: 'string' },
    include_declaration: { type: 'boolean' },
  };
}

function dapProperties(): Record<string, any> {
  return {
    project_path: { type: 'string' },
    script_path: { type: 'string' },
    host: { type: 'string', default: DEFAULT_HOST },
    port: { type: 'number', default: DEFAULT_DAP_PORT },
    timeout_ms: { type: 'number', default: DEFAULT_TIMEOUT_MS },
    line: { type: 'number', description: 'One-based source line for breakpoints.' },
    column: { type: 'number', description: 'One-based source column for breakpoints.' },
    thread_id: { type: 'number' },
    frame_id: { type: 'number' },
    variables_reference: { type: 'number' },
    breakpoint_id: { type: 'number' },
    step_type: { type: 'string', enum: ['next', 'in', 'out', 'stepIn', 'stepOut'] },
    start_frame: { type: 'number' },
    levels: { type: 'number' },
  };
}

function dapUnavailable(response: any): ToolResponse {
  return jsonResponse({
    status: 'unavailable',
    command: response.command,
    reason: response.message || response.body?.error?.format || 'Debug adapter request was not accepted.',
    body: response.body || {},
  });
}

function unavailable(error: any): ToolResponse {
  return jsonResponse({
    status: 'unavailable',
    reason: error?.message || String(error),
  });
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
