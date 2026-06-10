import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ToolRegistry } from '../build/registry.js';
import { registerLspDapIntegrationTools } from '../build/tools/lsp-dap-integration.js';

function parseResponse(response) {
  assert.equal(response.content.length, 1);
  return JSON.parse(response.content[0].text);
}

function createContext() {
  const mapping = {
    project_path: 'projectPath',
    script_path: 'scriptPath',
    line: 'line',
    column: 'column',
    new_name: 'newName',
    include_declaration: 'includeDeclaration',
    timeout_ms: 'timeoutMs',
    thread_id: 'threadId',
    frame_id: 'frameId',
    variables_reference: 'variablesReference',
    breakpoint_id: 'breakpointId',
    step_type: 'stepType',
  };
  const normalizeParameters = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = mapping[key] || key;
      result[normalizedKey] = Array.isArray(value)
        ? value.map((item) => normalizeParameters(item))
        : normalizeParameters(value);
    }
    return result;
  };
  return {
    logDebug: () => {},
    createErrorResponse: (message) => ({ content: [{ type: 'text', text: message }], isError: true }),
    validatePath: (path) => Boolean(path) && !String(path).includes('..'),
    executeOperation: async () => ({ stdout: '{}\n', stderr: '' }),
    normalizeParameters,
    convertCamelToSnakeCase: (params) => params,
    parseGodotErrors: () => [],
    formatTresValue: (value) => String(value),
    generateUID: () => 'uid://test',
    generateShortUID: () => 'testuid',
    isGodot44OrLater: () => true,
    getGodotPath: async () => 'godot',
    formatProjectSettingValue: (value) => String(value),
    escapeCsvValue: (value) => value,
    parseCsvLine: (line) => line.split(','),
    escapePoString: (value) => value,
    escapeRegex: (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    extractPlaceholders: () => [],
    getOrParseTscn: () => ({}),
    invalidateTscnCache: () => {},
  };
}

function createRegistry(ctx = createContext()) {
  const registry = new ToolRegistry();
  registerLspDapIntegrationTools(registry, ctx);
  return registry;
}

async function withProject(fn) {
  const projectPath = await mkdtemp(join(tmpdir(), 'godot-mcp-lsp-dap-'));
  await mkdir(join(projectPath, 'scripts'), { recursive: true });
  await writeFile(join(projectPath, 'project.godot'), '[application]\nconfig/name="LspDap"\n');
  await writeFile(join(projectPath, 'scripts', 'player.gd'), [
    'extends Node',
    'class_name Player',
    '',
    'var health := 10',
    '',
    'func _ready() -> void:',
    '\tprint(health)',
    '',
    'func take_damage(amount: int) -> void:',
    '\thealth -= amount',
    '',
  ].join('\n'));
  try {
    await fn(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

function encodeMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function decodeMessages(state, chunk) {
  state.buffer += chunk.toString('utf8');
  const messages = [];
  while (true) {
    const headerEnd = state.buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = state.buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error(`Missing Content-Length in ${header}`);
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (state.buffer.length < bodyStart + length) break;
    messages.push(JSON.parse(state.buffer.slice(bodyStart, bodyStart + length)));
    state.buffer = state.buffer.slice(bodyStart + length);
  }
  return messages;
}

async function withLspServer(handler, fn) {
  const received = [];
  const server = createServer((socket) => {
    const state = { buffer: '' };
    socket.on('data', (chunk) => {
      for (const message of decodeMessages(state, chunk)) {
        received.push(message);
        const responses = handler(message, socket) || [];
        for (const response of Array.isArray(responses) ? responses : [responses]) {
          if (response) socket.write(encodeMessage(response));
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(port, received);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withDapServer(handler, fn) {
  const received = [];
  await withLspServer((message, socket) => {
    received.push(message);
    return handler(message, socket);
  }, async (port) => fn(port, received));
}

test('Phase 4.7 LSP/DAP tools register with the tool registry', () => {
  const registry = createRegistry();
  for (const toolName of [
    'lsp_status',
    'lsp_symbols',
    'lsp_definition',
    'lsp_references',
    'lsp_diagnostics',
    'lsp_rename_preview',
    'dap_status',
    'dap_set_breakpoint',
    'dap_clear_breakpoint',
    'dap_stack_trace',
    'dap_variables',
    'dap_continue',
    'dap_step',
  ]) {
    assert.equal(registry.has(toolName), true, toolName);
  }
});

test('lsp_status reports an available Godot language server over TCP', async () => {
  await withLspServer((message) => {
    if (message.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          capabilities: {
            documentSymbolProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            renameProvider: { prepareProvider: true },
          },
          serverInfo: { name: 'godot', version: '4.6.test' },
        },
      };
    }
    return null;
  }, async (port) => {
    const registry = createRegistry();
    const status = parseResponse(await registry.dispatch('lsp_status', {
      host: '127.0.0.1',
      port,
      timeout_ms: 1000,
    }));
    assert.equal(status.status, 'available');
    assert.equal(status.port, port);
    assert.equal(status.server_info.name, 'godot');
    assert.equal(status.capabilities.documentSymbolProvider, true);
  });
});

test('LSP symbol, definition, references, diagnostics, and rename-preview tools send valid protocol requests', async () => {
  await withProject(async (projectPath) => {
    await withLspServer((message, socket) => {
      if (message.method === 'initialize') {
        return { jsonrpc: '2.0', id: message.id, result: { capabilities: {}, serverInfo: { name: 'godot' } } };
      }
      if (message.method === 'textDocument/documentSymbol') {
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: [
            { name: 'Player', kind: 5, range: range(1, 0, 10, 0), selectionRange: range(1, 11, 1, 17) },
            { name: 'take_damage', kind: 12, documentation: 'Called when ready occurs. @param amount [int] —', range: range(8, 0, 9, 15), selectionRange: range(8, 5, 8, 16) },
          ],
        };
      }
      if (message.method === 'textDocument/definition') {
        return { jsonrpc: '2.0', id: message.id, result: { uri: message.params.textDocument.uri, range: range(8, 5, 8, 16) } };
      }
      if (message.method === 'textDocument/references') {
        return { jsonrpc: '2.0', id: message.id, result: [{ uri: message.params.textDocument.uri, range: range(6, 7, 6, 13) }] };
      }
      if (message.method === 'textDocument/rename') {
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            changes: {
              [message.params.textDocument.uri]: [
                { range: range(8, 5, 8, 16), newText: message.params.newName },
              ],
            },
          },
        };
      }
      if (message.method === 'textDocument/didOpen') {
        socket.write(encodeMessage({
          jsonrpc: '2.0',
          method: 'textDocument/publishDiagnostics',
          params: {
            uri: message.params.textDocument.uri,
            diagnostics: [
              { range: range(3, 4, 3, 10), severity: 2, message: 'fixture warning', source: 'gdscript' },
            ],
          },
        }));
      }
      return null;
    }, async (port, received) => {
      const registry = createRegistry();
      const baseArgs = { project_path: projectPath, script_path: 'scripts/player.gd', host: '127.0.0.1', port, timeout_ms: 1000 };

      const symbols = parseResponse(await registry.dispatch('lsp_symbols', baseArgs));
      assert.equal(symbols.status, 'success');
      assert.deepEqual(symbols.symbols.map((symbol) => symbol.name), ['Player', 'take_damage']);
      assert.match(symbols.symbols[1].documentation, /—/);

      const definition = parseResponse(await registry.dispatch('lsp_definition', { ...baseArgs, line: 9, column: 7 }));
      assert.equal(definition.status, 'success');
      assert.equal(definition.locations[0].range.start.line, 8);

      const references = parseResponse(await registry.dispatch('lsp_references', { ...baseArgs, line: 9, column: 7, include_declaration: true }));
      assert.equal(references.status, 'success');
      assert.equal(references.references.length, 1);

      const diagnostics = parseResponse(await registry.dispatch('lsp_diagnostics', baseArgs));
      assert.equal(diagnostics.status, 'success');
      assert.equal(diagnostics.diagnostics[0].message, 'fixture warning');

      const rename = parseResponse(await registry.dispatch('lsp_rename_preview', { ...baseArgs, line: 9, column: 7, new_name: 'apply_damage' }));
      assert.equal(rename.status, 'success');
      assert.equal(rename.preview_only, true);
      assert.equal(rename.workspace_edit.changes[Object.keys(rename.workspace_edit.changes)[0]][0].newText, 'apply_damage');

      assert.equal(received.some((message) => message.method === 'textDocument/documentSymbol'), true);
      assert.equal(received.some((message) => message.method === 'textDocument/didOpen'), true);
    });
  });
});

test('DAP status, breakpoint, stack, variables, continue, and step tools speak Debug Adapter Protocol', async () => {
  await withProject(async (projectPath) => {
    await withDapServer((message) => {
      if (message.command === 'initialize') {
        return {
          type: 'response',
          seq: 100 + message.seq,
          request_seq: message.seq,
          command: message.command,
          success: true,
          body: { supportsConfigurationDoneRequest: true, supportsStepBack: false },
        };
      }
      if (message.command === 'setBreakpoints') {
        return {
          type: 'response',
          seq: 100 + message.seq,
          request_seq: message.seq,
          command: message.command,
          success: true,
          body: { breakpoints: (message.arguments.breakpoints || []).map((entry, index) => ({ id: index + 1, verified: true, line: entry.line })) },
        };
      }
      if (message.command === 'threads') {
        return { type: 'response', seq: 100 + message.seq, request_seq: message.seq, command: message.command, success: true, body: { threads: [{ id: 7, name: 'Main' }] } };
      }
      if (message.command === 'stackTrace') {
        return { type: 'response', seq: 100 + message.seq, request_seq: message.seq, command: message.command, success: true, body: { stackFrames: [{ id: 8, name: '_ready', line: 6, column: 1, source: { path: join(projectPath, 'scripts', 'player.gd') } }] } };
      }
      if (message.command === 'scopes') {
        return { type: 'response', seq: 100 + message.seq, request_seq: message.seq, command: message.command, success: true, body: { scopes: [{ name: 'Locals', variablesReference: 9 }] } };
      }
      if (message.command === 'variables') {
        return { type: 'response', seq: 100 + message.seq, request_seq: message.seq, command: message.command, success: true, body: { variables: [{ name: 'health', value: '10', type: 'int', variablesReference: 0 }] } };
      }
      if (['continue', 'next', 'stepIn', 'stepOut'].includes(message.command)) {
        return { type: 'response', seq: 100 + message.seq, request_seq: message.seq, command: message.command, success: true, body: { allThreadsContinued: true } };
      }
      return { type: 'response', seq: 100 + message.seq, request_seq: message.seq, command: message.command, success: false, message: `Unhandled ${message.command}` };
    }, async (port, received) => {
      const registry = createRegistry();
      const baseArgs = { project_path: projectPath, host: '127.0.0.1', port, timeout_ms: 1000 };

      const status = parseResponse(await registry.dispatch('dap_status', baseArgs));
      assert.equal(status.status, 'available');
      assert.equal(status.capabilities.supportsConfigurationDoneRequest, true);

      const setBreakpoint = parseResponse(await registry.dispatch('dap_set_breakpoint', { ...baseArgs, script_path: 'scripts/player.gd', line: 6 }));
      assert.equal(setBreakpoint.status, 'success');
      assert.equal(setBreakpoint.breakpoints[0].verified, true);

      const clearBreakpoint = parseResponse(await registry.dispatch('dap_clear_breakpoint', { ...baseArgs, script_path: 'scripts/player.gd' }));
      assert.equal(clearBreakpoint.status, 'success');
      assert.deepEqual(clearBreakpoint.breakpoints, []);

      const stack = parseResponse(await registry.dispatch('dap_stack_trace', baseArgs));
      assert.equal(stack.status, 'success');
      assert.equal(stack.stack_frames[0].name, '_ready');

      const variables = parseResponse(await registry.dispatch('dap_variables', { ...baseArgs, frame_id: 8 }));
      assert.equal(variables.status, 'success');
      assert.equal(variables.variables[0].name, 'health');

      const continued = parseResponse(await registry.dispatch('dap_continue', { ...baseArgs, thread_id: 7 }));
      assert.equal(continued.status, 'success');

      const stepped = parseResponse(await registry.dispatch('dap_step', { ...baseArgs, thread_id: 7, step_type: 'in' }));
      assert.equal(stepped.status, 'success');
      assert.equal(stepped.command, 'stepIn');

      assert.equal(received.some((message) => message.command === 'setBreakpoints'), true);
      assert.equal(received.some((message) => message.command === 'variables'), true);
    });
  });
});

function range(startLine, startCharacter, endLine, endCharacter) {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  };
}
