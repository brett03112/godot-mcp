# 🐛 Quick fixes first

1. **Your README's install instructions clone the wrong repo.** Step 1 says `git clone https://github.com/Coding-Solo/godot-mcp.git` — a leftover from the upstream project. Anyone following your docs installs someone else's server.
2. **Tool count consistency**: The header says **116 tools**, but the architecture section says 58 modular + 57 legacy = 115, and the resources section says "115 per-tool definition resources." Worth auto-generating these counts from the registry at build time so they can never drift.
3. **Repo hygiene**: `2026-06-03 16_48_41-Greenshot.png` sits in the repo root (move to `docs/images/`), and `.serena/cache/` + `.codex/` look like local tooling state that should be gitignored. Also: no repo description, no topics (`godot`, `mcp`, `model-context-protocol`, `ai-agents`), no releases. These cost you discoverability for free.

---

## 🔧 High-impact improvements

### 1. Tame the tool surface (this is your biggest architectural risk)
116 tools is a lot of context-window weight. Every MCP client injects all tool schemas into the model's context on every turn — at your scale that's likely tens of thousands of tokens before the user types anything, and some clients degrade or truncate beyond ~50–100 tools. Recommendations:

- **Toolset profiles**: an env var like `GODOT_MCP_TOOLSETS=core,scene,playtest` so users only load what they need. GitHub's official MCP server does exactly this for the same reason.
- **Consolidate sibling tools**: e.g., `start_playtest_recording`/`stop_playtest_recording` → one `playtest_recording` tool with an `action` param; the three profiler tools could merge similarly. Fewer, slightly fatter tools beat many thin ones for LLM tool selection.
- **Reconsider the 115 per-tool resources.** They duplicate `tools/list` and `godot-mcp://tools/catalog`. The template (`godot-mcp://tools/{name}`) alone covers the use case — dropping the per-tool static resources would simplify the catalog with no functional loss.

### 2. Finish the registry migration
The hybrid dispatch (registry-first, fall back to a 57-case switch in `index.ts`) was a smart incremental strategy, but now it means legacy tools miss your timeout enforcement, operation logging, and validation middleware. Porting the remaining 57 tools to `ToolRegistry` makes the infrastructure you already built (error taxonomy, logger, per-tool timeouts) universal — and unlocks per-tool metadata you'll want for `batch_execute` touched-file prediction anyway.

### 3. Break up `godot_operations.gd`
~7,200 lines in one GDScript file is a maintenance hazard and slows Godot's parse on every headless invocation. Split into domain files (`ops/scene.gd`, `ops/physics.gd`, …) loaded by a thin dispatcher, and consider generating the dispatcher from the same metadata that drives the TS registry. This also makes the GDScript side independently unit-testable with GUT.

### 4. Distribution & CI
- **Publish to npm** so users get `npx godot-mcp` instead of clone-and-build, and submit to the MCP registries (official registry, Smithery, Glama, mcp.so).
- **GitHub Actions matrix**: build + `npm test`, plus headless Godot integration tests against `test_mcp_enhancements` across Godot 4.2/4.3/4.4+ — you already have a verification harness planned in Phase 5.4; CI is where it pays off.
- **Dockerfile with Xvfb baked in** — your own troubleshooting notes say `capture_viewport` and playtesting fail on headless servers. A container image with a virtual display makes your most unique features (playtesting, screenshots, heatmaps) work in CI pipelines, which is a killer use case.

### 5. Security posture
- Your README's Cline example **auto-approves all 100+ tools**, including `install_plugin` (arbitrary git repos), `export_project`, and `modify_project_setting`. Recommend a curated read-only auto-approve list and explicitly flagging the risky ones.
- Add a `GODOT_MCP_ALLOWED_PATHS` allowlist so the server can't be steered into touching arbitrary directories — important once `batch_execute` and the future live bridge exist.
- You already gate `game_eval` as opt-in in the Phase 3 plan — good. Apply the same gating philosophy to `install_plugin` from git URLs.

<details>
<summary>📚 Documentation improvements (expand)</summary>

- The README is ~90KB rendered; the 115-item resource list alone is several screens. Split into a `docs/` site (one page per category), keep the README to: pitch, demo GIF, quickstart, category overview table, links.
- Auto-generate the tool reference from your tool schemas (`npm run docs`) — you already expose schemas via resources, so this is nearly free and eliminates drift.
- Add a **demo GIF or short video** at the top. "AI runs a playtest bot, generates a death heatmap, and recommends a checkpoint" is an extremely compelling 30-second demo no other Godot MCP can show.
- Add `CHANGELOG.md`, `CONTRIBUTING.md`, and a Godot version compatibility table (UID tools need 4.4+, your AStarGrid note references 4.6 — make the support matrix explicit).
</details>

---

## 💡 New development ideas

Beyond what's already in your Phase 2–5 plan (the live editor bridge is absolutely the right next priority — `editor_state`, `selection_get`, and `live_scene_get_hierarchy` from your milestone list are the highest-leverage items):

**1. Godot LSP/DAP bridge (promote from Phase 4.7 — do it sooner).** The editor already runs a Language Server on port 6005 and Debug Adapter on 6006. Connecting to the LSP gives you *real* diagnostics, hover docs, completions, and — crucially — semantic rename that would make `refactor_rename` rock-solid instead of regex-based. The DAP gives breakpoints, stepping, and stack/variable inspection, which combined with your playtest harness would be unmatched: "the bot died unexpectedly at 0:42 — here's the stack trace and variable state."

**2. Semantic `.tscn` diff + git merge driver.** A `diff_scenes` tool that compares two scene files (or working tree vs. HEAD) structurally — "Player moved, HealthBar's `modulate` changed, new node EnemySpawner added" — instead of raw text. Ship a git merge driver for `.tscn` as a bonus; scene merge conflicts are one of Godot's most-hated team pain points, and you already own a TSCN parser.

**3. C# project support.** Godot 4 .NET is widely used and your server is GDScript-only. Even a minimal tier — `validate_csharp` (wrap `dotnet build`), `analyze_csharp_script`, attach `.cs` scripts to nodes — would meaningfully widen your audience.

**4. gdtoolkit integration.** Wrap `gdformat` and `gdlint` as `format_script` / `lint_script` tools. Cheap to add, and lets an agent self-enforce style after every `script_patch`.

**5. MCP Prompts capability.** You have tools and resources but apparently no prompts. Ship workflow prompts like `create-game-loop`, `debug-crash`, `polish-pass` (runs juice coverage → suggests particles/shaders → applies them), `pre-ship-checklist` (validate scenes → run tests → validate export). Prompts are how you encode the *orchestration knowledge* of when to chain your 116 tools.

**6. Structured tool output (`outputSchema`).** The MCP spec now supports declared output schemas and structured content. Your tools return rich JSON already — declaring schemas makes clients and agents handle results far more reliably, and you'd be ahead of most servers.

**7. Local asset-generation backends.** You support DALL-E 3 and ElevenLabs; add a ComfyUI/Stable Diffusion local backend (many gamedevs run these) and post-processing helpers: sprite-sheet slicing, `AnimatedSprite2D` frame import, and palette quantization for pixel art so generated assets drop straight into scenes.

**8. Visual regression testing.** You have `capture_viewport`; add `compare_screenshots` with perceptual diffing (SSIM + diff image output) and a baseline directory convention. Combined with CI + Xvfb, that's automated visual QA for game scenes — your Phase 4.4 hints at this; I'd rank it above most of Phase 4.

**9. `TileMapLayer` modernization check.** Godot 4.3+ deprecated the monolithic `TileMap` node in favor of `TileMapLayer`. Make sure `create_tilemap`/`paint_tiles` target the new node, and consider a migration tool — agents generating deprecated nodes will frustrate users.

**10. Universal undo journal.** Generalize `batch_execute`'s snapshot system into a global transaction log: every mutating tool records before-state, and an `undo_last_operation` / `restore_checkpoint` tool rolls back. For autonomous agent sessions, this is the single biggest trust-builder you could ship.

---

## Bottom line

The foundation is excellent and the playtest/fun-metrics/heatmap stack is a real differentiator — nothing else in the Godot MCP ecosystem does closed-loop "play it, measure it, fix it." My priority order: **fix the clone URL → npm publish + CI + Docker/Xvfb → toolset profiles → finish the live bridge milestone → LSP/DAP bridge**. That sequence gets you from "great personal tool" to "the Godot MCP server people standardize on."