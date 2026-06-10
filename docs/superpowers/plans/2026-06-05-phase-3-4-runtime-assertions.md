# Phase 3.4 Runtime Assertions Implementation Plan

**Goal:** Add lightweight live runtime assertion tools so Codex can run short play-mode smoke checks without writing a GUT test.

**Architecture:** Reuse the Phase 3.2 debugger bridge. TypeScript registers thin `runtime_assert_*` wrappers. The live editor dispatcher forwards those commands to the runtime autoload, which evaluates live scene state, recent signal captures, and assertion history, then returns structured pass/fail data with observed values and suggested next probes.

**Tech Stack:** TypeScript, Node test runner, MCP tool schemas, Godot 4.6 live debugger messages, GDScript signal connections, runtime node/property/UI inspection, and the existing `.mcp.json` stdio server command.

### Task 1: Add Focused RED Tests

- [ ] Create `tests/live-runtime-assertions.test.mjs`.
- [ ] Assert the six Phase 3.4 tools register.
- [ ] Assert each tool dispatches the matching live command and preserves arguments.
- [ ] Extend `tests/live-addon-skeleton.test.mjs` to require dispatcher command names and runtime handler/helper names.
- [ ] Run `npm run build && node --test tests/live-runtime-assertions.test.mjs tests/live-addon-skeleton.test.mjs` and confirm RED.

### Task 2: Register MCP Assertion Tools

- [ ] Add `runtime_assert_node_exists`.
- [ ] Add `runtime_assert_property_equals`.
- [ ] Add `runtime_assert_signal_emitted`.
- [ ] Add `runtime_assert_ui_text_visible`.
- [ ] Add `runtime_assert_no_errors`.
- [ ] Add `runtime_snapshot_assertion_report`.

### Task 3: Forward Runtime Assertion Requests

- [ ] Add the six assertion command names to the runtime-inspection branch in `command_dispatcher.gd`.

### Task 4: Implement Runtime Assertion Handlers

- [ ] Return consistent assertion records with `passed`, `assertion`, `observed`, and `suggested_next_probe`.
- [ ] Track recent assertion records for `runtime_snapshot_assertion_report`.
- [ ] Track signal emissions by connecting to requested signals once and keeping emission counts.
- [ ] Track recent runtime errors from assertion/error paths where the bridge can see them.

### Task 5: Verify And Update Ledger

- [ ] Run focused assertion tests.
- [ ] Run broader live runtime regression.
- [ ] Run `npm test`.
- [ ] Run Godot headless editor/runtime smokes.
- [ ] Prove live behavior through `.mcp.json`.
- [ ] Check off Phase 3.4 in `Enhancements_TODO.md` with dated evidence.
