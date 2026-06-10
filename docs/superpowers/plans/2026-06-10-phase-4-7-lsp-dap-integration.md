# Phase 4.7 LSP/DAP Integration Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Godot LSP and DAP integration tools that can query the open editor's language/debug servers and report cleanly when semantic or debug state is unavailable.

**Architecture:** Add a focused `src/tools/lsp-dap-integration.ts` module with small TCP clients for LSP and DAP `Content-Length` framing. Keep LSP reads non-mutating, expose rename as a preview-only workspace edit, and make DAP tools explicit about connected server state versus active debug-session state.

**Tech Stack:** TypeScript MCP tools, Node `net` TCP sockets, Godot 4.6 Language Server Protocol on port `6005`, Godot 4.6 Debug Adapter Protocol on port `6006`, and project-local GDScript file URI normalization.

---

## Scope

- Add LSP tools:
  - `lsp_status`
  - `lsp_symbols`
  - `lsp_definition`
  - `lsp_references`
  - `lsp_diagnostics`
  - `lsp_rename_preview`
- Add DAP tools:
  - `dap_status`
  - `dap_set_breakpoint`
  - `dap_clear_breakpoint`
  - `dap_stack_trace`
  - `dap_variables`
  - `dap_continue`
  - `dap_step`
- Default ports are `6005` for LSP and `6006` for DAP, matching Godot 4.6 external editor docs and the open editor state.
- All tools accept `host`, `port`, `timeout_ms`, and `project_path` where useful.
- DAP tools must return `unavailable` or `failed` with a reason when no active debug target is attached.

## Evidence

- Context7 Godot docs confirm Godot's external editor integrations use LSP and DAP, with defaults `6005` and `6006`, configurable under editor settings `Network > Language Server` and `Network > Debug Adapter`.
- The open `Test_MCP_Enhancements` editor currently owns ports `6005` and `6006`.
- `Enhancements_TODO.md` Phase 4.7 acceptance requires diagnostics/symbol retrieval from LSP and debug attach or a clear reason why DAP cannot attach.

## Tasks

- [x] Write focused RED tests in `tests/lsp-dap-integration.test.mjs` covering tool registration, LSP framing/status/symbols/definition/references/diagnostics/rename preview, and DAP status/breakpoints/stack/variables/continue/step.
- [x] Add `src/tools/lsp-dap-integration.ts` with LSP and DAP TCP clients, project path normalization, response parsing, timeout handling, and tool definitions.
- [x] Register `registerLspDapIntegrationTools` from `src/index.ts`.
- [x] Add snake_case parameter mappings in `src/index.ts` for Phase 4.7 arguments.
- [x] Add `test_mcp_enhancements/phase47_live_proof.mjs` to list all 13 tools, call safe LSP tools against the open editor, and call DAP status/debug tools with graceful unavailable handling.
- [x] Update README tool counts and tool/resource references.
- [x] Run `npm run build && node --test tests/lsp-dap-integration.test.mjs`.
- [x] Run `npm test`.
- [x] Run a Godot headless editor smoke against `test_mcp_enhancements`.
- [x] Update `Enhancements_TODO.md` checkboxes and add a dated verification note.
- [x] Run `git diff --check`.
- [ ] After addon activation/reload, prove direct Codex MCP namespace callability for Phase 4.7 tools and `session_list`.

## Verification Update, 2026-06-10

- RED failed as expected with `ERR_MODULE_NOT_FOUND` for `build/tools/lsp-dap-integration.js`.
- Focused Phase 4.7 tests passed 4/4 after adding a non-ASCII LSP payload regression for byte-accurate `Content-Length` framing.
- `test_mcp_enhancements/phase47_live_proof.mjs` listed 315 tools, found all 13 Phase 4.7 tools, proved `lsp_status` against `127.0.0.1:6005`, retrieved `coin.gd` symbols and diagnostics from the Godot language server, called definition/references/rename preview, and exercised all DAP tools against `127.0.0.1:6006`. `dap_variables` returned `unavailable` without a live variables reference, which is the expected clear report path when no paused debug frame exposes variables.
- `npm test` passed 129/129 after re-enabling `godot_mcp_live` in `project.godot`.
- Godot headless editor smoke against `test_mcp_enhancements` exited 0 and the smoke log had 0 `SCRIPT ERROR`/`ERROR:` matches.
- `session_list` remains callable and the MCP transport is listening on `127.0.0.1:6010`, but the already-open GUI editor did not hot-connect after enabling the addon on disk. Direct Codex MCP namespace callability for the new `lsp_*`/`dap_*` tools still needs connector/editor reload.
