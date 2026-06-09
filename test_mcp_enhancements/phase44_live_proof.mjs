// Phase 4.4 visual QA proof.

import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PROJECT_PATH = 'C:/Users/brett/Desktop/godot-mcp/test_mcp_enhancements';
const PROJECT_FILE = join(PROJECT_PATH, 'project.godot');
const MCP_COMMAND = process.execPath;
const MCP_ARGS = ['C:/Users/brett/Desktop/godot-mcp/build/index.js'];
const GODOT_PATH = 'C:/Users/brett/Desktop/Godot/Godot.exe';
const VISUAL_DIR = join(PROJECT_PATH, '.mcp_visual');
let activeChild = null;
let projectFileSnapshot = null;

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
    const cleanup = () => {
      clearTimeout(timer);
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

async function waitForLiveSession(child) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = parseToolContent(await callTool(child, 500 + attempt, 'session_list', {
      project_path: PROJECT_PATH,
    }, 5000));
    if (response.status === 'success' && response.count > 0) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('No live editor session connected to the proof MCP server.');
}

function ensureCleanVisualDir() {
  for (const relPath of [
    '.mcp_visual/phase44_before.png',
    '.mcp_visual/phase44_after.png',
    '.mcp_visual/baselines/phase44_baseline.png',
    '.mcp_visual/baselines/phase44_baseline.json',
    '.mcp_visual/diffs/phase44_diff.png',
    '.mcp_visual/captures/phase44_runtime.png',
    '.mcp_visual/captures/phase44_editor.png',
    'mcp_phase44_camera.tscn',
  ]) {
    rmSync(join(PROJECT_PATH, relPath), { force: true });
  }
  rmSync(VISUAL_DIR, { recursive: true, force: true });
}

function snapshotProjectFile() {
  projectFileSnapshot = readFileSync(PROJECT_FILE, 'utf8');
}

function restoreProjectFile() {
  if (projectFileSnapshot !== null) {
    writeFileSync(PROJECT_FILE, projectFileSnapshot);
  }
}

async function main() {
  ensureCleanVisualDir();
  snapshotProjectFile();
  mkdirSync(VISUAL_DIR, { recursive: true });
  writePng(join(PROJECT_PATH, '.mcp_visual', 'phase44_before.png'), 2, 2, [
    [10, 10, 10, 255], [10, 10, 10, 255],
    [10, 10, 10, 255], [10, 10, 10, 255],
  ]);
  writePng(join(PROJECT_PATH, '.mcp_visual', 'phase44_after.png'), 2, 2, [
    [10, 10, 10, 255], [10, 10, 10, 255],
    [10, 10, 10, 255], [200, 10, 10, 255],
  ]);
  copyFileSync(join(PROJECT_PATH, 'tier1_test_scene.tscn'), join(PROJECT_PATH, 'mcp_phase44_camera.tscn'));

  const child = startChild();
  activeChild = child;
  await request(child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'phase44-proof', version: '1.0.0' },
    },
  });
  send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const required = [
    'camera_framing_check',
    'capture_editor_viewport',
    'capture_runtime_viewport',
    'screenshot_compare',
    'sprite_bounds_check',
    'ui_contrast_check',
    'ui_overlap_check',
    'visual_regression_baseline_create',
    'visual_regression_check',
  ];
  const tools = await listTools(child, 2);
  const toolNames = tools.result.tools.map((tool) => tool.name).sort();
  const missing = required.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error('Missing tools: ' + missing.join(', '));
  }
  console.log('tools/list returned ' + toolNames.length + ' tools including all 9 Phase 4.4 tools.');

  const compare = parseToolContent(await callTool(child, 10, 'screenshot_compare', {
    project_path: PROJECT_PATH,
    before_path: '.mcp_visual/phase44_before.png',
    after_path: '.mcp_visual/phase44_after.png',
    diff_output_path: '.mcp_visual/diffs/phase44_diff.png',
    threshold_ratio: 0.5,
  }));
  if (compare.status !== 'success' || compare.changed_pixels !== 1 || !existsSync(join(PROJECT_PATH, '.mcp_visual/diffs/phase44_diff.png'))) {
    throw new Error('screenshot_compare proof failed: ' + JSON.stringify(compare));
  }

  const baseline = parseToolContent(await callTool(child, 11, 'visual_regression_baseline_create', {
    project_path: PROJECT_PATH,
    baseline_name: 'phase44_baseline',
    source_path: '.mcp_visual/phase44_before.png',
  }));
  if (baseline.status !== 'success') {
    throw new Error('baseline create failed: ' + JSON.stringify(baseline));
  }

  const regression = parseToolContent(await callTool(child, 12, 'visual_regression_check', {
    project_path: PROJECT_PATH,
    baseline_name: 'phase44_baseline',
    current_path: '.mcp_visual/phase44_after.png',
    threshold_ratio: 0,
  }));
  if (regression.status !== 'failed' || regression.changed_pixels !== 1) {
    throw new Error('visual regression check failed: ' + JSON.stringify(regression));
  }

  const overlap = parseToolContent(await callTool(child, 13, 'ui_overlap_check', {
    project_path: PROJECT_PATH,
    scene_path: 'pause_menu.tscn',
    viewport_size: [1152, 648],
    min_overlap_area: 200000,
  }));
  if (!['success', 'failed'].includes(overlap.status)) {
    throw new Error('ui_overlap_check returned unexpected status: ' + JSON.stringify(overlap));
  }

  const contrast = parseToolContent(await callTool(child, 14, 'ui_contrast_check', {
    project_path: PROJECT_PATH,
    scene_path: 'pause_menu.tscn',
    samples: [
      { path: 'LowContrast', foreground: '#777777', background: '#777777' },
      { path: 'Readable', foreground: '#ffffff', background: '#111111' },
    ],
    min_ratio: 4.5,
  }));
  if (contrast.status !== 'failed' || contrast.issue_count !== 1) {
    throw new Error('ui_contrast_check proof failed: ' + JSON.stringify(contrast));
  }

  const sprite = parseToolContent(await callTool(child, 15, 'sprite_bounds_check', {
    project_path: PROJECT_PATH,
    scene_path: 'tier1_test_scene.tscn',
    viewport_size: [1152, 648],
    include_hidden: true,
  }));
  if (!['success', 'failed'].includes(sprite.status) || sprite.sprite_count < 1) {
    throw new Error('sprite_bounds_check proof failed: ' + JSON.stringify(sprite));
  }

  const cameraCreate = parseToolContent(await callTool(child, 16, 'create_camera', {
    project_path: PROJECT_PATH,
    scene_path: 'mcp_phase44_camera.tscn',
    camera_name: 'McpPhase44Camera',
    camera_type: '2d',
    position: [0, 0],
    zoom: [1, 1],
  }));
  if (cameraCreate.status !== 'success') {
    throw new Error('create_camera for phase44 proof failed: ' + JSON.stringify(cameraCreate));
  }

  const framing = parseToolContent(await callTool(child, 17, 'camera_framing_check', {
    project_path: PROJECT_PATH,
    scene_path: 'mcp_phase44_camera.tscn',
    camera_path: 'McpPhase44Camera',
    target_paths: ['NewParent'],
    viewport_size: [1152, 648],
    margin: 0,
  }));
  if (!['success', 'failed'].includes(framing.status) || framing.target_count !== 1) {
    throw new Error('camera_framing_check proof failed: ' + JSON.stringify(framing));
  }

  const runtimeCapture = parseToolContent(await callTool(child, 18, 'capture_runtime_viewport', {
    project_path: PROJECT_PATH,
    scene_path: 'res://test_connect.tscn',
    output_path: '.mcp_visual/captures/phase44_runtime.png',
    delay_frames: 3,
    width: 320,
    height: 180,
  }, 90000));
  if (!(runtimeCapture.status === 'success' || runtimeCapture.success === true) || !existsSync(join(PROJECT_PATH, '.mcp_visual/captures/phase44_runtime.png'))) {
    throw new Error('capture_runtime_viewport proof failed: ' + JSON.stringify(runtimeCapture));
  }

  const live = await waitForLiveSession(child);
  console.log('session_list saw ' + live.count + ' live editor session(s).');
  const editorCapture = parseToolContent(await callTool(child, 19, 'capture_editor_viewport', {
    project_path: PROJECT_PATH,
    output_path: '.mcp_visual/captures/phase44_editor.png',
    viewport: '2d',
  }, 60000));
  if (editorCapture.status !== 'success' || !existsSync(join(PROJECT_PATH, '.mcp_visual/captures/phase44_editor.png'))) {
    throw new Error('capture_editor_viewport proof failed: ' + JSON.stringify(editorCapture));
  }

  child.kill();
  activeChild = null;
  restoreProjectFile();
  ensureCleanVisualDir();
  console.log('Phase 4.4 visual QA proof PASSED');
}

main().catch((error) => {
  if (activeChild) {
    activeChild.kill();
  }
  restoreProjectFile();
  ensureCleanVisualDir();
  console.error('Phase 4.4 visual QA proof FAILED:', error);
  process.exitCode = 1;
});

function writePng(path, width, height, pixels) {
  mkdirSync(dirname(path), { recursive: true });
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = pixels[y * width + x];
      const target = rowStart + 1 + x * 4;
      raw[target] = source[0];
      raw[target + 1] = source[1];
      raw[target + 2] = source[2];
      raw[target + 3] = source[3];
    }
  }
  const chunks = [
    pngChunk('IHDR', Buffer.from([...u32(width), ...u32(height), 8, 6, 0, 0, 0])),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ];
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]));
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([
    Buffer.from(u32(data.length)),
    typeBuffer,
    data,
    Buffer.from(u32(crc32(Buffer.concat([typeBuffer, data])))),
  ]);
}

function u32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
