// Phase 4.7 LSP/DAP integration proof.

import { spawn } from 'node:child_process';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';

let activeChild = null;

function send(child, message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

function request(child, message, timeoutMs = 30000) {
  const response = waitForId(child, message.id, timeoutMs);
  send(child, message);
  return response;
}

function waitForId(child, id, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for response id ${id}`));
    }, timeoutMs);
    const cleanupListeners = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
    };
    const onError = (error) => {
      cleanupListeners();
      reject(error);
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.id === id) {
          cleanupListeners();
          resolve(message);
          return;
        }
      }
    };
    child.stdout.on('data', onData);
    child.once('error', onError);
  });
}

function callTool(child, id, name, args, timeoutMs = 60000) {
  return request(child, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  }, timeoutMs);
}

function listTools(child, id) {
  return request(child, { jsonrpc: '2.0', id, method: 'tools/list' });
}

function parseToolContent(result) {
  if (result.error) {
    throw new Error('Tool call returned JSON-RPC error: ' + JSON.stringify(result.error));
  }
  if (!result.result || !Array.isArray(result.result.content)) {
    throw new Error('No content in tool response: ' + JSON.stringify(result));
  }
  const parsed = JSON.parse(result.result.content[0]?.text ?? '{}');
  if (result.result.isError) {
    throw new Error('Tool returned error content: ' + JSON.stringify(parsed));
  }
  return parsed;
}

function startChild() {
  const child = spawn(MCP_COMMAND, MCP_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GODOT_PATH,
    },
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[mcp-stderr] ${chunk.toString('utf8')}`));
  return child;
}

function cleanup() {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
}

function ensureCallableResult(name, result) {
  if (!result || typeof result.status !== 'string') {
    throw new Error(`${name} did not return a structured status: ${JSON.stringify(result)}`);
  }
  if (result.status === 'failed') {
    throw new Error(`${name} failed: ${JSON.stringify(result)}`);
  }
  return result.status;
}

async function main() {
  const child = startChild();
  activeChild = child;
  try {
    await request(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase47-proof', version: '1.0.0' },
      },
    });
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    const required = [
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
    ];
    const tools = await listTools(child, 2);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    const missing = required.filter((name) => !toolNames.includes(name));
    if (missing.length > 0) {
      throw new Error('Missing tools: ' + missing.join(', '));
    }
    console.log('tools/list returned ' + toolNames.length + ' tools including all 13 Phase 4.7 tools.');

    const lspBase = {
      project_path: PROJECT_PATH,
      script_path: 'coin.gd',
      host: '127.0.0.1',
      port: 6005,
      timeout_ms: 20000,
    };
    const lspStatus = parseToolContent(await callTool(child, 10, 'lsp_status', {
      project_path: PROJECT_PATH,
      host: '127.0.0.1',
      port: 6005,
      timeout_ms: 20000,
    }));
    if (lspStatus.status !== 'available') {
      throw new Error('lsp_status expected available: ' + JSON.stringify(lspStatus));
    }
    console.log('lsp_status available on 127.0.0.1:6005.');

    const symbols = parseToolContent(await callTool(child, 11, 'lsp_symbols', lspBase));
    if (symbols.status !== 'success' || !Array.isArray(symbols.symbols)) {
      throw new Error('lsp_symbols did not return symbols: ' + JSON.stringify(symbols));
    }
    console.log('lsp_symbols returned ' + symbols.symbols.length + ' symbols.');

    const diagnostics = parseToolContent(await callTool(child, 12, 'lsp_diagnostics', lspBase));
    if (diagnostics.status !== 'success' || !Array.isArray(diagnostics.diagnostics)) {
      throw new Error('lsp_diagnostics did not return diagnostics array: ' + JSON.stringify(diagnostics));
    }
    console.log('lsp_diagnostics returned ' + diagnostics.diagnostics.length + ' diagnostics.');

    const lspOptionalCalls = [
      ['lsp_definition', { ...lspBase, line: 1, column: 1 }],
      ['lsp_references', { ...lspBase, line: 1, column: 1, include_declaration: true }],
      ['lsp_rename_preview', { ...lspBase, line: 1, column: 1, new_name: 'CoinPhase47Preview' }],
    ];
    let id = 20;
    for (const [name, args] of lspOptionalCalls) {
      const result = parseToolContent(await callTool(child, id++, name, args));
      console.log(`${name} status: ${ensureCallableResult(name, result)}`);
    }

    const dapBase = {
      project_path: PROJECT_PATH,
      host: '127.0.0.1',
      port: 6006,
      timeout_ms: 10000,
    };
    const dapCalls = [
      ['dap_status', dapBase],
      ['dap_set_breakpoint', { ...dapBase, script_path: 'coin.gd', line: 1 }],
      ['dap_clear_breakpoint', { ...dapBase, script_path: 'coin.gd' }],
      ['dap_stack_trace', dapBase],
      ['dap_variables', dapBase],
      ['dap_continue', dapBase],
      ['dap_step', { ...dapBase, step_type: 'next' }],
    ];
    for (const [name, args] of dapCalls) {
      const result = parseToolContent(await callTool(child, id++, name, args));
      console.log(`${name} status: ${ensureCallableResult(name, result)}`);
    }

    child.kill();
    activeChild = null;
    console.log('Phase 4.7 LSP/DAP integration proof PASSED');
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error('Phase 4.7 LSP/DAP integration proof FAILED:', error);
  process.exitCode = 1;
});
