# Phase 7.3 Profile Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `recommend_toolset_profile` return catalog-aware profile, tool, resource, verification, and reload guidance.

**Architecture:** Keep recommendation logic centralized in `src/toolsets.ts`. Pass the registered tool catalog from `src/tools/toolset-profile.ts` so recommendations can use real tool metadata and built-in profile definitions.

**Tech Stack:** TypeScript, MCP stdio JSON-RPC, Node test runner, existing Godot MCP smoke scripts.

---

### Task 1: RED Profile Recommendation Tests

**Files:**
- Modify: `tests/toolset-profiles.test.mjs`

- [ ] **Step 1: Write failing tests**

Add focused assertions that `recommendToolsetProfile`:

```js
const recommendation = recommendToolsetProfile({
  featureRequest: 'inspect the open editor, verify selected nodes, and take a screenshot',
  projectFacts: { has_live_editor: true },
}, { allToolDefinitions: SAMPLE_TOOLS });
```

Expected fields:

```js
recommendation.primary_named_profile === 'live-editor'
recommendation.named_profile_suggestions[0].name === 'live-editor'
recommendation.exact_extra_tools includes 'capture_editor_viewport'
recommendation.needed_mcp_resources includes 'godot-mcp://live/sessions'
recommendation.verification_commands includes 'session_list(project_path)'
recommendation.reload_required includes 'Reload'
```

Add a second test proving the registry-dispatched `recommend_toolset_profile` uses the provider catalog and returns real available tool metadata.

- [ ] **Step 2: Run RED**

Run: `npm run build && node --test tests/toolset-profiles.test.mjs`

Expected: FAIL because these fields do not exist yet.

### Task 2: Catalog-Aware Recommendation

**Files:**
- Modify: `src/toolsets.ts`
- Modify: `src/tools/toolset-profile.ts`
- Test: `tests/toolset-profiles.test.mjs`

- [ ] **Step 1: Add options**

Add an optional `RecommendToolsetProfileOptions` argument:

```ts
{
  allToolDefinitions?: ToolDefinitionLike[];
}
```

- [ ] **Step 2: Score built-in profiles**

Use request text, project facts, built-in profile toolsets, explicit tools, resources, and matching catalog tool names/descriptions to return:

```ts
primary_named_profile
named_profile_suggestions
recommended_toolsets
exact_extra_tools
required_individual_tools
optional_tools
needed_mcp_resources
verification_commands
env_snippet
config_snippet
reload_required
```

- [ ] **Step 3: Use real metadata**

Decorate `allToolDefinitions` with `getToolMetadata`, prefer matching available tools, and avoid suggesting unavailable exact tools.

- [ ] **Step 4: Pass provider catalog**

Update `registerToolsetProfileTools` so `recommend_toolset_profile` calls:

```ts
recommendToolsetProfile(args, { allToolDefinitions: provider.getAllToolDefinitions() })
```

- [ ] **Step 5: Run GREEN**

Run: `npm run build && node --test tests/toolset-profiles.test.mjs`

Expected: PASS.

### Task 3: Ledger And Verification

**Files:**
- Modify: `Enhancements_TODO.md`

- [ ] **Step 1: Update Phase 7.3 checkboxes**

Check all Phase 7.3 items after verification.

- [ ] **Step 2: Add verification note**

Include focused test count, full test count, non-live smoke, live smoke, direct MCP proof, and reload status.

- [ ] **Step 3: Run final checks**

Run:

```powershell
npm run build && node --test tests/toolset-profiles.test.mjs tests/built-in-profiles.test.mjs tests/tool-metadata-audit.test.mjs
npm test
npm run smoke:non-live
npm run smoke:live
git diff --check
```
