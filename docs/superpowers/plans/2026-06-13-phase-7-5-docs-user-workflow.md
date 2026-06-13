# Phase 7.5 Docs And User Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make profile-first startup the documented normal workflow for Godot MCP sessions.

**Architecture:** This is a docs-and-contract-test phase. Keep behavior in the existing Phase 7.1-7.4 code, add a focused docs contract test, update `README.md` and `docs/autonomous-workflows.md`, then prove profile filtering with tests, smokes, and a local MCP call.

**Tech Stack:** Markdown docs, Node test runner, MCP stdio smoke scripts, Godot MCP live bridge.

---

### Task 1: RED Docs Contract

**Files:**
- Create: `tests/phase-7-5-docs-workflow.test.mjs`

- [ ] **Step 1: Write the failing docs test**

Assert that `README.md` documents profile-first startup as the recommended path, that `docs/autonomous-workflows.md` has a "Pick A Profile First" LLM workflow, that all seven built-in profiles have PowerShell snippets and `.godot-mcp/toolsets.json` snippets, and that `toolset_status` is the post-reload proof command.

- [ ] **Step 2: Run RED**

Run:

```powershell
node --test tests/phase-7-5-docs-workflow.test.mjs
```

Expected: FAIL because the exact Phase 7.5 workflow section text is not present yet.

### Task 2: Docs Update

**Files:**
- Modify: `README.md`
- Modify: `docs/autonomous-workflows.md`

- [ ] **Step 1: Update README**

Add a "Profile-First Startup (Recommended)" section that says to pick a profile before normal feature work, reload the MCP connector after changing `GODOT_MCP_TOOLSETS`, `GODOT_MCP_TOOLS`, or `GODOT_MCP_PROFILE`, and use full catalog mode only for backward compatibility or broad audits.

- [ ] **Step 2: Update autonomous workflows**

Add a short "Pick A Profile First" workflow for LLM sessions and keep the built-in profile PowerShell and `.godot-mcp/toolsets.json` examples copy/paste ready.

- [ ] **Step 3: Run GREEN**

Run:

```powershell
node --test tests/phase-7-5-docs-workflow.test.mjs
```

Expected: PASS.

### Task 3: Verification And Ledger

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Run profile/docs focused checks**

Run:

```powershell
npm run build && node --test tests/phase-7-5-docs-workflow.test.mjs tests/toolset-profiles.test.mjs tests/built-in-profiles.test.mjs tests/tool-metadata-audit.test.mjs
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run smoke:non-live
npm run smoke:live
git diff --check
```

- [ ] **Step 3: Update ledger**

Check off Phase 7.5 and Phase 7 acceptance criteria that are now satisfied. Add a dated verification note with focused counts, full test counts, smoke results, direct MCP proof, and reload status.
