// Phase 4.8 performance, memory, and quality gate proof.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';

const TEMP_FILES = [
  `${PROJECT_PATH}/.mcp_profiling/mcp_phase48_baseline.json`,
  `${PROJECT_PATH}/.mcp_profiling/mcp_phase48_current.json`,
  `${PROJECT_PATH}/.godot-mcp/performance_budgets/mcp_phase48_preexport.json`,
  `${PROJECT_PATH}/.godot-mcp/mcp_phase48_memory.json`,
  `${PROJECT_PATH}/exports/mcp_phase48_game.zip`,
  `${PROJECT_PATH}/scenes/mcp_phase48_gate.tscn`,
];

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
      cleanupProcess();
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

function cleanupProcess() {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
}

async function cleanupFiles() {
  for (const file of TEMP_FILES) {
    await rm(file, { force: true });
  }
}

async function prepareFiles() {
  await mkdir(`${PROJECT_PATH}/exports`, { recursive: true });
  await mkdir(`${PROJECT_PATH}/scenes`, { recursive: true });
  await writeFile(`${PROJECT_PATH}/exports/mcp_phase48_game.zip`, 'phase48-export');
  await writeFile(`${PROJECT_PATH}/scenes/mcp_phase48_gate.tscn`, [
    '[gd_scene format=3]',
    '[node name="Root" type="Node2D"]',
    '[node name="Hud" type="CanvasLayer" parent="."]',
    '[node name="Label" type="Label" parent="Hud"]',
    '',
  ].join('\n'));
}

function sample({ fps, drawCalls, staticMemory, textureMemory, nodes }) {
  return {
    time: 0,
    fps,
    frame_time: 1 / Math.max(fps, 1),
    render_draw_calls: drawCalls,
    memory_static: staticMemory * 1024 * 1024,
    render_texture_mem_used: textureMemory * 1024 * 1024,
    object_node_count: nodes,
    object_resource_count: 14,
  };
}

function requireSuccess(name, result) {
  if (result.status !== 'success') {
    throw new Error(`${name} expected success: ${JSON.stringify(result)}`);
  }
  return result;
}

async function main() {
  await cleanupFiles();
  await prepareFiles();
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
        clientInfo: { name: 'phase48-proof', version: '1.0.0' },
      },
    });
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    const required = [
      'performance_budget_create',
      'performance_budget_check',
      'runtime_profile_capture',
      'runtime_profile_compare',
      'memory_snapshot',
      'node_count_budget_check',
      'draw_call_budget_check',
      'texture_memory_budget_check',
      'export_size_budget_check',
      'quality_gate_run',
    ];
    const tools = await listTools(child, 2);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    const missing = required.filter((name) => !toolNames.includes(name));
    if (missing.length > 0) {
      throw new Error('Missing tools: ' + missing.join(', '));
    }
    console.log('tools/list returned ' + toolNames.length + ' tools including all 10 Phase 4.8 tools.');

    let id = 10;
    requireSuccess('runtime_profile_capture baseline', parseToolContent(await callTool(child, id++, 'runtime_profile_capture', {
      project_path: PROJECT_PATH,
      profile_id: 'mcp_phase48_baseline',
      profile_samples: [
        sample({ fps: 60, drawCalls: 95, staticMemory: 80, textureMemory: 22, nodes: 3 }),
        sample({ fps: 59, drawCalls: 100, staticMemory: 81, textureMemory: 23, nodes: 3 }),
      ],
    })));
    requireSuccess('runtime_profile_capture current', parseToolContent(await callTool(child, id++, 'runtime_profile_capture', {
      project_path: PROJECT_PATH,
      profile_id: 'mcp_phase48_current',
      profile_samples: [
        sample({ fps: 58, drawCalls: 105, staticMemory: 84, textureMemory: 24, nodes: 3 }),
        sample({ fps: 57, drawCalls: 108, staticMemory: 85, textureMemory: 25, nodes: 3 }),
      ],
    })));
    console.log('runtime_profile_capture wrote baseline and current profile artifacts.');

    requireSuccess('performance_budget_create', parseToolContent(await callTool(child, id++, 'performance_budget_create', {
      project_path: PROJECT_PATH,
      budget_name: 'mcp_phase48_preexport',
      min_avg_fps: 55,
      min_min_fps: 55,
      max_frame_time_ms: 20,
      max_draw_calls: 120,
      max_static_memory_mb: 100,
      max_texture_memory_mb: 40,
      max_node_count: 10,
      max_export_size_bytes: 100,
      export_paths: ['exports/mcp_phase48_game.zip'],
      scene_paths: ['scenes/mcp_phase48_gate.tscn'],
    })));

    requireSuccess('performance_budget_check', parseToolContent(await callTool(child, id++, 'performance_budget_check', {
      project_path: PROJECT_PATH,
      budget_name: 'mcp_phase48_preexport',
      profile_id: 'mcp_phase48_current',
    })));

    requireSuccess('runtime_profile_compare', parseToolContent(await callTool(child, id++, 'runtime_profile_compare', {
      project_path: PROJECT_PATH,
      baseline_profile_id: 'mcp_phase48_baseline',
      current_profile_id: 'mcp_phase48_current',
      max_regression_percent: 15,
    })));

    requireSuccess('memory_snapshot', parseToolContent(await callTool(child, id++, 'memory_snapshot', {
      project_path: PROJECT_PATH,
      profile_id: 'mcp_phase48_current',
      output_path: '.godot-mcp/mcp_phase48_memory.json',
    })));

    requireSuccess('node_count_budget_check', parseToolContent(await callTool(child, id++, 'node_count_budget_check', {
      project_path: PROJECT_PATH,
      scene_paths: ['scenes/mcp_phase48_gate.tscn'],
      max_node_count: 10,
    })));

    requireSuccess('draw_call_budget_check', parseToolContent(await callTool(child, id++, 'draw_call_budget_check', {
      project_path: PROJECT_PATH,
      profile_id: 'mcp_phase48_current',
      max_draw_calls: 120,
    })));

    requireSuccess('texture_memory_budget_check', parseToolContent(await callTool(child, id++, 'texture_memory_budget_check', {
      project_path: PROJECT_PATH,
      profile_id: 'mcp_phase48_current',
      max_texture_memory_mb: 40,
    })));

    requireSuccess('export_size_budget_check', parseToolContent(await callTool(child, id++, 'export_size_budget_check', {
      project_path: PROJECT_PATH,
      export_paths: ['exports/mcp_phase48_game.zip'],
      max_total_bytes: 100,
      per_file_budget_bytes: 100,
    })));

    requireSuccess('quality_gate_run', parseToolContent(await callTool(child, id++, 'quality_gate_run', {
      project_path: PROJECT_PATH,
      gate_name: 'mcp_phase48_preexport',
      budget_name: 'mcp_phase48_preexport',
      profile_id: 'mcp_phase48_current',
      run_checks: ['performance', 'memory', 'node_count', 'draw_calls', 'texture_memory', 'export_size'],
    })));

    console.log('All Phase 4.8 quality gate tools returned success through the built MCP server.');
    child.kill();
    activeChild = null;
    await cleanupFiles();
    console.log('Phase 4.8 quality gate proof PASSED');
  } finally {
    cleanupProcess();
    await cleanupFiles();
  }
}

main().catch((error) => {
  console.error('Phase 4.8 quality gate proof FAILED:', error);
  process.exitCode = 1;
});
