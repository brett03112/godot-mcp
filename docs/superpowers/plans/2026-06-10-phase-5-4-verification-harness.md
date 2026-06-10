# Phase 5.4 Verification Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable verification harness for the live-enhanced Godot MCP.

**Architecture:** Keep the harness outside the main tool surface: Node smoke scripts under `scripts/`, a manual notes template under `docs/templates/`, and focused Node tests for protocol/session/eval behavior. Reuse `test_mcp_enhancements` as the disposable fixture project because it already carries the live addon and phase fixtures.

**Tech Stack:** TypeScript, Node test runner, MCP JSON-RPC over stdio, PowerShell/Windows loopback checks, Godot 4.6.3.

---

## Scope

Phase 5.4 covers verification assets only. It does not add new MCP tools or change the live addon command surface.

## Checklist

1. Add `tests/phase-5-4-verification-harness.test.mjs` with RED coverage for:
   - non-live smoke script and package script
   - semi-live smoke script and package script
   - manual verification note template
   - protocol encode/decode helper
   - stale cleanup, project-path mismatch rejection, and disabled eval refusal
2. Add `stringifyLiveProtocolMessage()` in `src/live/protocol.ts`.
3. Add `scripts/smoke-non-live.mjs` to initialize the built MCP server and call file-backed tools against `test_mcp_enhancements`.
4. Add `scripts/smoke-live-editor.mjs` to check the open-editor socket facts and, when it can own the listener, call `session_list`/`editor_state`.
5. Add `docs/templates/manual-verification-note.md`.
6. Add package scripts:
   - `smoke:non-live`
   - `smoke:live`
7. Verify with focused tests, full `npm test`, the smoke scripts, Godot headless editor parse, live callability after reload, and `git diff --check`.

## Acceptance

- `npm run build` passes.
- Existing tests pass.
- `npm run smoke:non-live` passes against `test_mcp_enhancements`.
- `npm run smoke:live` proves one listener and an actual Godot editor socket on `127.0.0.1:6010`.
- The live tool surface is callable after MCP/Godot reload, including `session_list` and a representative live editor call.
