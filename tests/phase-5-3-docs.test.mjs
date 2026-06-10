import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CANONICAL_REPO = 'https://github.com/brett03112/godot-mcp';
const OLD_OWNER = ['Coding', 'Solo'].join('-');
const OLD_REPO_PATTERN = new RegExp(`${OLD_OWNER}/godot-mcp|github\\.com/${OLD_OWNER}`);

async function text(path) {
  return readFile(path, 'utf8');
}

test('Phase 5.3 README documents the complete fresh-user live bridge path', async () => {
  const readme = await text('README.md');

  assert.match(readme, new RegExp(CANONICAL_REPO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(readme, OLD_REPO_PATTERN);

  for (const required of [
    '## Live Bridge Overview',
    '## Installation and Configuration',
    '### Step 3: Install and Enable the Live Addon',
    '## Security Model',
    '## Common Workflows',
    '## MCP Resource Reference',
    '## Troubleshooting',
    'live_addon_install',
    'live_addon_enable',
    'editor_state',
    'live_config_status',
    'session_list',
  ]) {
    assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(readme, /fresh user[\s\S]+install[\s\S]+addon[\s\S]+enable[\s\S]+editor_state/i);
});

test('Phase 5.3 dedicated docs cover protocol, security, workflows, and adapters', async () => {
  const protocol = await text('docs/live-bridge-protocol.md');
  const security = await text('docs/live-bridge-security.md');
  const workflows = await text('docs/autonomous-workflows.md');
  const adapters = await text('docs/tooling-adapters.md');

  assert.match(protocol, /WebSocket/i);
  assert.match(protocol, /\/godot-mcp-live/);
  assert.match(protocol, /session_list/);
  assert.match(protocol, /editor_state/);
  assert.match(protocol, /command envelope/i);

  assert.match(security, /loopback/i);
  assert.match(security, /eval-disabled|eval disabled/i);
  assert.match(security, /shared secret/i);
  assert.match(security, /allowed_project_paths/i);

  assert.match(workflows, /fresh-user setup/i);
  assert.match(workflows, /live-bridge-protocol\.md/);
  assert.match(workflows, /live-bridge-security\.md/);

  assert.match(adapters, /GDScript language server/i);
  assert.match(adapters, /Debug Adapter/i);
  assert.match(adapters, /6005/);
  assert.match(adapters, /6006/);
});

test('Phase 5.3 package metadata points to the canonical repository', async () => {
  const pkg = JSON.parse(await text('package.json'));

  assert.equal(pkg.repository.type, 'git');
  assert.equal(pkg.repository.url, `${CANONICAL_REPO}.git`);
});
