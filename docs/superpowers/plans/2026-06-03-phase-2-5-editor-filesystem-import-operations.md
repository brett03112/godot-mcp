# Phase 2.5 Editor Filesystem And Import Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live editor filesystem and import operations so Codex can ask the connected Godot editor to scan externally-created files, reimport selected resources, reload resources, update UIDs, open resources, and focus files in the editor dock.

**Architecture:** Keep `src/tools/live-editor.ts` as a thin MCP schema and command-forwarding layer. Put Godot editor behavior in `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`, using `EditorInterface.get_resource_filesystem()`, `EditorFileSystem.update_file()`, `scan()`, `reimport_files()`, `ResourceLoader`, and `FileSystemDock.navigate_to_path()` where available. Responses should include normalized `res://` paths, per-file results, and clear unsupported or missing-file errors.

**Tech Stack:** TypeScript, Node test runner, MCP tool schemas, Godot 4.6 `EditorPlugin`, `EditorInterface`, `EditorFileSystem`, `FileSystemDock`, `ResourceLoader`, and the existing live websocket command envelope.

---

### Task 1: Add Focused RED Tests

**Files:**
- Create: `tests/live-editor-filesystem.test.mjs`
- Modify: `tests/live-addon-skeleton.test.mjs`

- [ ] **Step 1: Test Phase 2.5 tool registration**

Assert the registry contains:

```javascript
[
  'editor_filesystem_scan',
  'editor_filesystem_reimport',
  'editor_resource_reload',
  'editor_resource_uid_update',
  'editor_open_resource',
  'editor_focus_file',
]
```

- [ ] **Step 2: Test MCP command mapping**

Dispatch each Phase 2.5 tool through a fake `LiveSessionManager` session, assert the outbound command name matches the tool name, assert snake_case command fields are forwarded unchanged, and resolve the fake `command_response`.

- [ ] **Step 3: Test addon dispatcher contract**

Extend `tests/live-addon-skeleton.test.mjs` to require every new command branch and handler:

```text
_handle_editor_filesystem_scan(args)
_handle_editor_filesystem_reimport(args)
_handle_editor_resource_reload(args)
_handle_editor_resource_uid_update(args)
_handle_editor_open_resource(args)
_handle_editor_focus_file(args)
```

- [ ] **Step 4: Verify RED**

Run: `npm run build && node --test tests/live-editor-filesystem.test.mjs tests/live-addon-skeleton.test.mjs`

Expected: FAIL because Phase 2.5 tools and addon handlers are not implemented yet.

### Task 2: Add MCP Tool Definitions

**Files:**
- Modify: `src/tools/live-editor.ts`

- [ ] **Step 1: Register six Phase 2.5 tools**

Add `liveCommandTool()` entries for `editor_filesystem_scan`, `editor_filesystem_reimport`, `editor_resource_reload`, `editor_resource_uid_update`, `editor_open_resource`, and `editor_focus_file`.

- [ ] **Step 2: Use narrow schemas**

Use these command arguments:

```text
editor_filesystem_scan: paths?, wait_for_scan?
editor_filesystem_reimport: paths
editor_resource_reload: resource_path, cache_mode?
editor_resource_uid_update: paths
editor_open_resource: resource_path
editor_focus_file: resource_path
```

Set `timeout: 15000` for scan/reimport/UID update and `timeout: 10000` for open/focus/reload.

### Task 3: Add Addon Filesystem Helpers

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`

- [ ] **Step 1: Add dispatch branches**

Add match branches for all six Phase 2.5 commands and route them to the handlers named in Task 1.

- [ ] **Step 2: Normalize and validate resource paths**

Add helpers that accept project-relative or `res://` paths, reject empty paths and `..`, and return canonical `res://` paths.

- [ ] **Step 3: Add filesystem metadata collection**

Add a recursive helper over `EditorFileSystem.get_filesystem()` to report whether each requested resource is visible to the editor filesystem, its type from `get_file_type()`, UID when available, and whether the backing file exists on disk.

### Task 4: Implement Editor Filesystem Operations

**Files:**
- Modify: `test_mcp_enhancements/addons/godot_mcp_live/command_dispatcher.gd`

- [ ] **Step 1: Implement scan**

For each requested path, call `EditorFileSystem.update_file(path)` before `scan()`. If no paths are supplied, call `scan()` only. Return requested paths, scan mode, and collected metadata after the scan call.

- [ ] **Step 2: Implement reimport**

Require a non-empty `paths` array, normalize the paths, call `update_file()` for each path, then call `reimport_files(paths)`. Return per-path metadata after reimport.

- [ ] **Step 3: Implement reload and UID update**

For reload, call `ResourceLoader.load(resource_path, "", cache_mode)` and return serialized resource class/path data. For UID update, call `update_file()` and `scan()` for each path, then return the editor filesystem UID metadata when available.

- [ ] **Step 4: Implement open and focus**

For open, load the resource and use `EditorInterface.edit_resource(resource)`; if the path is a scene, also support `open_scene_from_path()`. For focus, call `EditorInterface.get_file_system_dock().navigate_to_path(resource_path)` and return focused metadata.

### Task 5: Verification And Ledger Update

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run focused tests**

Run: `npm run build && node --test tests/live-editor-filesystem.test.mjs tests/live-editor-state.test.mjs tests/live-session-manager.test.mjs tests/live-addon-skeleton.test.mjs`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run live editor acceptance**

Against the connected `test_mcp_enhancements` session, prove:

```text
session_list shows the connected GUI editor session
an external temporary file is created under res://
editor_filesystem_scan reports the file visible in the editor filesystem
editor_filesystem_reimport returns metadata for the file
editor_resource_reload loads the resource
editor_resource_uid_update returns UID metadata when Godot exposes it
editor_focus_file focuses the file in the filesystem dock
editor_open_resource opens or edits the resource
temporary files are removed afterward
```

- [ ] **Step 4: Update TODO evidence**

Check off Phase 2.5 items and add a dated verification note with focused/full test counts, live session ID, active project, temporary resource path, scan/reimport/reload/open/focus proof, and any documented Godot limitation around UID metadata.
