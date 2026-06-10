# Tooling Adapters

Godot MCP includes adapters for Godot editor tooling that is useful during autonomous development. These adapters are optional: each status tool reports whether the target endpoint or project addon is available before mutation-oriented tools are used.

## GDScript Language Server

The GDScript language server usually listens on `127.0.0.1:6005` when enabled by the Godot editor. Phase 4.7 added MCP tools that can inspect this endpoint:

- `lsp_status`
- `lsp_symbols`
- `lsp_definition`
- `lsp_references`
- `lsp_diagnostics`
- `lsp_rename_preview`

Use `lsp_status` first. Then use diagnostics, symbols, definitions, and references to plan script changes before applying `script_patch` or file edits. Rename remains preview-only so the user or agent can inspect the workspace edit before committing changes.

## Debug Adapter

The Godot Debug Adapter usually listens on `127.0.0.1:6006` while the editor debug adapter server is enabled. Phase 4.7 added:

- `dap_status`
- `dap_set_breakpoint`
- `dap_clear_breakpoint`
- `dap_stack_trace`
- `dap_variables`
- `dap_continue`
- `dap_step`

Use `dap_status` before breakpoint or stepping tools. Stack and variable tools require an active debug session and paused thread.

## Addon And External Tool Adapters

Project addon management and external adapter discovery are exposed through:

- `addon_list`
- `addon_enable`
- `addon_disable`
- `addon_health_check`
- `external_tool_status`
- `external_tool_configure`

Use addon health before relying on addon-specific behavior. Use external tool status to see which optional adapters are configured and which MCP tools map to them.

## Verification Pattern

1. Check the adapter status tool first.
2. Run the smallest read-only query, such as diagnostics or stack trace.
3. Apply the intended mutation only after the endpoint and project state are known.
4. Re-run the status/readback tool to confirm the adapter still responds.

For the local `Test_MCP_Enhancements` proof project, the expected development ports are the Godot GDScript language server on `6005` and the Debug Adapter server on `6006`.
