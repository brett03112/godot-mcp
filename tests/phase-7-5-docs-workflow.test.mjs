import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const BUILT_IN_PROFILES = [
  'planning-readonly',
  'scene-edit',
  'live-editor',
  'runtime-debug',
  'playtest-loop',
  'visual-qa',
  'release-check',
];

async function text(path) {
  return readFile(path, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Phase 7.5 README recommends profile-first startup', async () => {
  const readme = await text('README.md');

  assert.match(readme, /### Profile-First Startup \(Recommended\)/);
  assert.match(readme, /Pick a profile before starting normal feature work/i);
  assert.match(readme, /Changing `GODOT_MCP_TOOLSETS`, `GODOT_MCP_TOOLS`, or `GODOT_MCP_PROFILE` requires reloading the MCP connector/);
  assert.match(readme, /Full catalog mode exists for backward compatibility and broad audits/i);
  assert.match(readme, /should not be the default for normal feature work/i);
  assert.match(readme, /toolset_status[\s\S]+active profile[\s\S]+loaded count[\s\S]+hidden count[\s\S]+active toolsets[\s\S]+explicit tools[\s\S]+config sources/i);
});

test('Phase 7.5 autonomous docs give LLMs a pick-a-profile-first workflow', async () => {
  const workflows = await text('docs/autonomous-workflows.md');

  assert.match(workflows, /## Pick A Profile First/);
  for (const required of [
    'Call `toolset_status`',
    'Call `recommend_toolset_profile`',
    'Set `GODOT_MCP_PROFILE`',
    'Reload/restart the MCP connector',
    'Call `toolset_status` again',
  ]) {
    assert.match(workflows, new RegExp(escapeRegExp(required)));
  }
  assert.match(workflows, /full catalog mode exists for compatibility and broad audits/i);
  assert.match(workflows, /not the default for normal feature work/i);
});

test('Phase 7.5 docs include copy/paste profile snippets', async () => {
  const readme = await text('README.md');
  const workflows = await text('docs/autonomous-workflows.md');

  for (const profile of BUILT_IN_PROFILES) {
    const envPattern = new RegExp(`\\$env:GODOT_MCP_PROFILE = "${escapeRegExp(profile)}"`);
    const jsonPattern = new RegExp(`"${escapeRegExp(profile)}"\\s*:\\s*\\{[\\s\\S]*?"toolsets"`);
    assert.match(readme, envPattern, `README env snippet for ${profile}`);
    assert.match(workflows, envPattern, `workflow env snippet for ${profile}`);
    assert.match(readme, jsonPattern, `README toolsets.json snippet for ${profile}`);
    assert.match(workflows, jsonPattern, `workflow toolsets.json snippet for ${profile}`);
  }

  assert.match(readme, /\.godot-mcp\/toolsets\.json/);
  assert.match(workflows, /\.godot-mcp\/toolsets\.json/);
});
