# Phase 1.7 Audio Player Workflow Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MCP tools that create, configure, control, list, and validate Godot audio player nodes in saved scenes.

**Architecture:** Follow the Phase 1.6 camera workflow pattern: one TypeScript registration module maps MCP tool parameters to focused Godot operations, while `godot_operations.gd` performs real scene edits and returns JSON summaries. The workflow supports `AudioStreamPlayer`, `AudioStreamPlayer2D`, and `AudioStreamPlayer3D`, with bus validation based on saved node route names and the current AudioServer layout available during the operation.

**Tech Stack:** TypeScript ESM, Node test runner, MCP ToolRegistry, Godot 4.6 GDScript scene/resource APIs.

---

### Task 1: Focused Registry And Payload Tests

**Files:**
- Create: `tests/audio-player-workflow.test.mjs`

- [ ] **Step 1: Write the failing test**

Add Node tests that import `registerAudioPlayerWorkflowTools` from `../build/tools/audio-player-workflow.js`, assert all seven Phase 1.7 tool names register, and verify MCP snake_case input maps to Godot operations:

```js
await registry.dispatch('create_audio_player', {
  project_path: projectPath,
  scene_path: 'scenes/level.tscn',
  parent_path: '.',
  player_name: 'MusicPlayer',
  player_type: '2d',
  stream_path: 'audio/theme.ogg',
  bus: 'Music',
  autoplay: true,
  volume_db: -6,
  pitch_scale: 1.05,
});
```

Expected mapped operation: `audio_player_create` with `scene_path`, `parent_path`, `player_name`, `player_type`, `stream_path`, `bus`, `autoplay`, `volume_db`, and `pitch_scale`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/audio-player-workflow.test.mjs`

Expected: FAIL because `build/tools/audio-player-workflow.js` does not exist.

### Task 2: TypeScript MCP Tool Module

**Files:**
- Create: `src/tools/audio-player-workflow.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement minimal tool registrations**

Create `registerAudioPlayerWorkflowTools(registry, ctx)` and seven tool definitions:

```ts
create_audio_player
set_audio_stream
configure_audio_playback
play_audio_node
stop_audio_node
list_audio_players
validate_audio_routes
```

Each handler resolves `project_path`, validates `project.godot`, calls `ctx.executeOperation()`, parses the last JSON line from Godot stdout, invalidates scene cache for scene-touching tools, and returns the JSON response.

- [ ] **Step 2: Register module in server**

Import `registerAudioPlayerWorkflowTools`, add audio-specific snake_case mappings, and call the registration after camera workflow tools.

- [ ] **Step 3: Run focused test**

Run: `npm run build && node --test tests/audio-player-workflow.test.mjs`

Expected: PASS for registration and payload mapping.

### Task 3: Godot Operation Implementations

**Files:**
- Modify: `src/scripts/godot_operations.gd`

- [ ] **Step 1: Add dispatch cases**

Add operation names:

```gdscript
audio_player_create
audio_player_set_stream
audio_player_configure
audio_player_play
audio_player_stop
audio_player_list
audio_player_validate_routes
```

- [ ] **Step 2: Add scene editing helpers**

Implement helper functions that load scenes, find player nodes, normalize player type, load `AudioStream` resources, assign supported player properties, summarize players, and collect route issues.

- [ ] **Step 3: Run focused test and full test suite**

Run: `npm run build && node --test tests/audio-player-workflow.test.mjs`

Run: `npm test`

Expected: focused test passes, then full suite passes.

### Task 4: Godot Smoke Against Test Project

**Files:**
- Temporary scene copy under `test_mcp_enhancements`, removed after smoke if absent before test.

- [ ] **Step 1: Build tools**

Run: `npm run build`

- [ ] **Step 2: Execute real Godot operations**

Use the built operation script or MCP batch tool against `test_mcp_enhancements` to copy a test scene, create an audio player with an existing stream under `res://audio`, route it to `Master` or an existing bus, list players, validate routes, then clean temporary artifacts.

- [ ] **Step 3: Update TODO evidence**

Mark Phase 1.7 checklist items complete and add a dated verification note with the exact commands and live/headless proof.
