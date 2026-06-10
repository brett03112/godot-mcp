# Phase 5.3 Documentation Plan

## Scope

Phase 5.3 is the documentation and distribution handoff for the live-enhanced Godot MCP. Keep the work bounded to public docs, repo metadata, and proof that the documented install path lets a fresh user reach `editor_state`.

## Checklist

1. Add a focused docs contract test that fails until README ownership, required docs, and key install/security/workflow content are present.
2. Update `README.md` so the canonical repository is `https://github.com/brett03112/godot-mcp`, the live bridge workflow is discoverable, install steps include the bundled addon, security defaults are explicit, and troubleshooting covers connector/addon reloads.
3. Add dedicated docs:
   - `docs/live-bridge-protocol.md`
   - `docs/live-bridge-security.md`
   - `docs/tooling-adapters.md`
4. Refresh `docs/autonomous-workflows.md` so it points to the new protocol/security/adapter docs and the fresh-user setup path.
5. Update `package.json` repository metadata.
6. Verify with focused docs tests, full `npm test`, a Godot smoke against `test_mcp_enhancements`, startup/socket checks, and `git diff --check`.

## Acceptance

- `README.md` contains live bridge overview, install steps, security model, tool/resource references, common workflows, troubleshooting, and only the `brett03112/godot-mcp` repository URL.
- The dedicated protocol, security, autonomous workflow, and tooling adapter docs exist and cover their Phase 5.3 responsibilities.
- `package.json` points to the correct repository.
- A fresh user has a documented path to build the MCP, install or update the addon, enable it, reload the MCP connector/addon, and call `editor_state`.
