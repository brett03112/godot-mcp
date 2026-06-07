# Phase 3.5 Safe Eval Plan

## Scope

Implement gated live eval for the Godot MCP live bridge:

- `live_eval_status` is always registered and reports disabled/enabled state.
- `game_eval` and `editor_eval` are registered only when MCP config explicitly enables eval.
- Eval requires a loopback live session, matching project path when supplied, and optional approval token when configured.
- Every accepted or refused eval call writes an audit record with timestamp, session, code hash, and visible reason.

## Implementation

1. Add Phase 3.5 tests for default-disabled registration, enabled registration, refusal, dispatch, and addon/runtime contract.
2. Extend `src/tools/live-editor.ts` with eval config parsing, status, gated registration, audit logging, and command forwarding.
3. Extend `command_dispatcher.gd` with `editor_eval` using Godot `Expression`.
4. Extend `runtime_bridge.gd` with `game_eval` through the existing debugger inspection path.
5. Verify with focused tests, full tests, Godot editor/runtime smokes, and `.mcp.json` live proof.

## Verification

- `npm run build && node --test tests/live-safe-eval.test.mjs tests/live-addon-skeleton.test.mjs`
- Broader live runtime regression
- `npm test`
- Godot headless editor/runtime parse smokes
- `.mcp.json` live proof against `test_mcp_enhancements`
