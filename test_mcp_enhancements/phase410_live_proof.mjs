// Phase 4.10 safer planning proof.

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
      cleanupProcess();
      reject(new Error(`Timed out waiting for response id ${id}`));
    }, timeoutMs);
    timer.unref?.();
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

function requireSuccess(name, result) {
  if (result.status !== 'success') {
    throw new Error(`${name} expected success: ${JSON.stringify(result)}`);
  }
  return result;
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
        clientInfo: { name: 'phase410-proof', version: '1.0.0' },
      },
    });
    send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    const required = [
      'capability_matrix',
      'recommend_next_tool',
      'plan_feature_implementation',
      'plan_test_strategy',
      'risk_scan',
      'preflight_project_health',
      'postchange_verification_plan',
    ];
    const tools = await listTools(child, 2);
    const toolNames = tools.result.tools.map((tool) => tool.name).sort();
    const missing = required.filter((name) => !toolNames.includes(name));
    if (missing.length > 0) {
      throw new Error('Missing tools: ' + missing.join(', '));
    }
    console.log('tools/list returned ' + toolNames.length + ' tools including all 7 Phase 4.10 tools.');

    let id = 10;
    const matrix = requireSuccess('capability_matrix', parseToolContent(await callTool(child, id++, 'capability_matrix', {
      goal: 'add a pause menu',
      available_tools: toolNames,
      max_results: 12,
    })));
    if (!matrix.categories.design_to_scene.available_tools.includes('generate_menu_flow')) {
      throw new Error('capability_matrix did not expose generate_menu_flow for pause menu planning.');
    }

    const recommendation = requireSuccess('recommend_next_tool', parseToolContent(await callTool(child, id++, 'recommend_next_tool', {
      goal: 'add a pause menu',
      project_path: PROJECT_PATH,
      available_tools: toolNames,
      current_state: 'Proof run for Phase 4.10.',
    })));
    if (!recommendation.recommended_sequence.some((step) => step.tool === 'generate_menu_flow')) {
      throw new Error('recommend_next_tool did not recommend generate_menu_flow.');
    }
    if (!recommendation.validation_path.some((step) => step.tool === 'ui_overlap_check')) {
      throw new Error('recommend_next_tool did not include visual validation.');
    }

    const featurePlan = requireSuccess('plan_feature_implementation', parseToolContent(await callTool(child, id++, 'plan_feature_implementation', {
      goal: 'add a pause menu',
      project_path: PROJECT_PATH,
      available_tools: toolNames,
    })));
    if (!featurePlan.suggested_files.includes('scenes/pause_menu.tscn')) {
      throw new Error('plan_feature_implementation did not suggest pause_menu.tscn.');
    }

    const testPlan = requireSuccess('plan_test_strategy', parseToolContent(await callTool(child, id++, 'plan_test_strategy', {
      goal: 'add a pause menu',
      project_path: PROJECT_PATH,
      changed_files: ['scenes/pause_menu.tscn', 'scripts/pause_menu.gd'],
    })));
    if (!testPlan.test_layers.some((layer) => layer.tool === 'ui_overlap_check')) {
      throw new Error('plan_test_strategy did not include UI visual checks.');
    }

    const risks = requireSuccess('risk_scan', parseToolContent(await callTool(child, id++, 'risk_scan', {
      goal: 'add safer planning tools',
      project_path: PROJECT_PATH,
      changed_files: ['src/tools/safer-planning.ts', 'src/index.ts'],
      planned_actions: ['register new MCP tools'],
    })));
    if (!risks.risks.some((risk) => risk.category === 'mcp_catalog_reload')) {
      throw new Error('risk_scan did not flag MCP catalog reload risk.');
    }

    const health = requireSuccess('preflight_project_health', parseToolContent(await callTool(child, id++, 'preflight_project_health', {
      project_path: PROJECT_PATH,
    })));
    if (health.checks.project_godot_exists.status !== 'pass') {
      throw new Error('preflight_project_health did not pass project.godot check.');
    }

    const verification = requireSuccess('postchange_verification_plan', parseToolContent(await callTool(child, id++, 'postchange_verification_plan', {
      goal: 'add safer planning tools',
      project_path: PROJECT_PATH,
      changed_files: ['src/tools/safer-planning.ts', 'src/index.ts'],
      include_reload_guidance: true,
    })));
    if (!verification.reload.required) {
      throw new Error('postchange_verification_plan did not require MCP connector reload for tool catalog changes.');
    }

    console.log('All Phase 4.10 safer planning tools returned success through the built MCP server.');
    child.kill();
    activeChild = null;
    console.log('Phase 4.10 safer planning proof PASSED');
  } finally {
    cleanupProcess();
  }
}

main().catch((error) => {
  console.error('Phase 4.10 safer planning proof FAILED:', error);
  process.exitCode = 1;
});
