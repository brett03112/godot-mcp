// Phase 4.3 test-tooling proof.

import { spawn } from 'node:child_process';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';
let activeChild = null;

function send(child, message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

function request(child, message) {
  const response = waitForId(child, message.id);
  send(child, message);
  return response;
}

function waitForId(child, id) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      child.stdout.off('data', onData);
      child.off('error', onError);
    };
    const onError = (error) => {
      cleanup();
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
          cleanup();
          resolve(message);
          return;
        }
      }
    };
    child.stdout.on('data', onData);
    child.once('error', onError);
  });
}

function callTool(child, id, name, args) {
  return request(child, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
}

function listTools(child, id) {
  return request(child, { jsonrpc: '2.0', id, method: 'tools/list' });
}

function parseToolContent(result) {
  if (!result.result || !Array.isArray(result.result.content)) {
    throw new Error('No content in tool response: ' + JSON.stringify(result));
  }
  const text = result.result.content.map((c) => c.text ?? '').join('\n');
  return JSON.parse(text);
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

async function main() {
  const child = startChild();
  activeChild = child;
  await request(child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'phase43-proof', version: '1.0.0' },
    },
  });
  send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const required = [
    'failure_to_patch_plan',
    'gdunit4_discover_tests',
    'gdunit4_generate_test',
    'gdunit4_install_or_update',
    'gdunit4_run_tests',
    'gut_discover_tests',
    'gut_install_or_update',
    'gut_run_changed_tests',
    'gut_run_test_file',
    'gut_run_with_coverage',
    'test_watch_plan',
  ];
  const tools = await listTools(child, 2);
  const toolNames = tools.result.tools.map((tool) => tool.name).sort();
  const missing = required.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error('Missing tools: ' + missing.join(', '));
  }
  console.log('tools/list returned ' + toolNames.length + ' tools including all 11 Phase 4.3 tools.');

  const gutInstall = parseToolContent(await callTool(child, 10, 'gut_install_or_update', {
    project_path: PROJECT_PATH,
    dry_run: true,
  }));
  if (gutInstall.status !== 'installed') {
    throw new Error('Expected installed GUT addon: ' + JSON.stringify(gutInstall));
  }
  console.log('gut_install_or_update detected GUT ' + gutInstall.version + '.');

  const gutDiscovery = parseToolContent(await callTool(child, 11, 'gut_discover_tests', {
    project_path: PROJECT_PATH,
    test_dir: 'test',
  }));
  if (gutDiscovery.status !== 'success' || !gutDiscovery.test_files.some((file) => file.path === 'test/unit/test_example.gd')) {
    throw new Error('GUT discovery missed test_example: ' + JSON.stringify(gutDiscovery));
  }
  console.log('gut_discover_tests found ' + gutDiscovery.test_files.length + ' files and ' + gutDiscovery.test_count + ' tests.');

  const gutDryRun = parseToolContent(await callTool(child, 12, 'gut_run_test_file', {
    project_path: PROJECT_PATH,
    test_file: 'test/unit/test_example.gd',
    dry_run: true,
    include_junit: true,
    junit_output_path: 'user://phase43_gut.xml',
  }));
  if (gutDryRun.status !== 'dry_run' || !gutDryRun.command.args.includes('-gtest=res://test/unit/test_example.gd')) {
    throw new Error('GUT dry-run command was wrong: ' + JSON.stringify(gutDryRun));
  }

  const gutRun = parseToolContent(await callTool(child, 13, 'gut_run_test_file', {
    project_path: PROJECT_PATH,
    test_file: 'test/unit/test_example.gd',
    verbosity: 1,
  }));
  if (gutRun.status !== 'success') {
    throw new Error('GUT real test run failed: ' + JSON.stringify(gutRun));
  }
  console.log('gut_run_test_file executed test/unit/test_example.gd with exit ' + gutRun.exit_code + '.');

  const changed = parseToolContent(await callTool(child, 14, 'gut_run_changed_tests', {
    project_path: PROJECT_PATH,
    changed_files: ['coin.gd'],
    dry_run: true,
  }));
  if (changed.status !== 'dry_run' || changed.selected_tests.length === 0) {
    throw new Error('Changed-test selection failed: ' + JSON.stringify(changed));
  }

  const coverage = parseToolContent(await callTool(child, 15, 'gut_run_with_coverage', {
    project_path: PROJECT_PATH,
    dry_run: true,
  }));
  if (!['unavailable', 'planned'].includes(coverage.status)) {
    throw new Error('Coverage response should be unavailable or planned: ' + JSON.stringify(coverage));
  }

  const gdInstall = parseToolContent(await callTool(child, 20, 'gdunit4_install_or_update', {
    project_path: PROJECT_PATH,
    dry_run: true,
  }));
  if (!['missing', 'installed', 'update_available_if_requested'].includes(gdInstall.status)) {
    throw new Error('gdUnit4 install status was unexpected: ' + JSON.stringify(gdInstall));
  }

  const gdDiscovery = parseToolContent(await callTool(child, 21, 'gdunit4_discover_tests', {
    project_path: PROJECT_PATH,
    test_dir: 'test',
  }));
  if (gdDiscovery.status !== 'success') {
    throw new Error('gdUnit4 discovery failed: ' + JSON.stringify(gdDiscovery));
  }

  const gdGenerated = parseToolContent(await callTool(child, 22, 'gdunit4_generate_test', {
    project_path: PROJECT_PATH,
    source_path: 'coin.gd',
    output_path: 'test/unit/coin_gdunit_test.gd',
    class_name: 'Coin',
    test_name: 'collect_smoke',
    dry_run: true,
  }));
  if (gdGenerated.status !== 'dry_run' || !gdGenerated.content.includes('extends GdUnitTestSuite')) {
    throw new Error('gdUnit4 generation dry-run failed: ' + JSON.stringify(gdGenerated));
  }

  const gdRunDry = parseToolContent(await callTool(child, 23, 'gdunit4_run_tests', {
    project_path: PROJECT_PATH,
    test_dir: 'test',
    dry_run: true,
  }));
  if (gdRunDry.status !== 'dry_run') {
    throw new Error('gdUnit4 run dry-run failed: ' + JSON.stringify(gdRunDry));
  }

  const watch = parseToolContent(await callTool(child, 30, 'test_watch_plan', {
    project_path: PROJECT_PATH,
    changed_files: ['coin.gd', 'test/unit/test_coin_direct.gd'],
  }));
  if (watch.status !== 'success' || watch.recommended_commands.length === 0) {
    throw new Error('test_watch_plan returned no commands: ' + JSON.stringify(watch));
  }

  const failurePlan = parseToolContent(await callTool(child, 31, 'failure_to_patch_plan', {
    project_path: PROJECT_PATH,
    failure_output: [
      'SCRIPT ERROR: Parse Error: Unexpected identifier',
      'at: res://coin.gd:12',
      'Failing test: res://test/unit/test_coin_direct.gd::test_collect',
    ].join('\n'),
  }));
  if (failurePlan.status !== 'success' || !failurePlan.patch_candidates.some((entry) => entry.path === 'coin.gd')) {
    throw new Error('failure_to_patch_plan missed coin.gd: ' + JSON.stringify(failurePlan));
  }

  child.kill();
  activeChild = null;
  console.log('Phase 4.3 test-tooling proof PASSED');
}

main().catch((error) => {
  if (activeChild) {
    activeChild.kill();
  }
  console.error('Phase 4.3 test-tooling proof FAILED:', error);
  process.exitCode = 1;
});
