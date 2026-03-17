# Godot MCP — Enhancements & Refactoring Plan

## Current State Summary

- **52 tools** across 12 completed phases, all tested and validated
- **15,768 lines** of core code (11,355 TypeScript + 4,413 GDScript)
- **150+ tests** passing across all phases
- Single-file architecture (`src/index.ts` and `src/scripts/godot_operations.gd`)

All 12 originally planned phases are complete. This document identifies the next wave of enhancements, unimplemented tools from existing specs, and architectural improvements — organized by priority tier.

---

## Tier 1 — Critical Gaps & High-Impact Additions

These items address fundamental workflow gaps that prevent the AI from completing common game development tasks end-to-end.

### 1.1 Scene Inspection & Manipulation Tools

**Problem:** You can add nodes and set properties at creation time, but you cannot inspect, modify, or remove existing nodes. This means the AI is blind to what's already in a scene and can only build forward, never edit.

| Tool | Description | Rationale |
|------|-------------|-----------|
| `list_scene_tree` | Get the full node hierarchy of a `.tscn` file with node types, paths, and attached resources | Fundamental for understanding existing scenes before modifying them |
| `read_node_properties` | Read all properties of a specific node in a scene (transform, visibility, modulate, script, etc.) | Required for any edit-in-place workflow |
| `modify_node_property` | Change properties on existing nodes without recreating them | Currently you can only set properties when adding new nodes |
| `remove_node` | Remove a node (and optionally its children) from a scene | Scene editing requires both add and remove |
| `duplicate_node` | Clone an existing node (with children) within a scene | Common level-building and prototyping operation |
| `move_node` / `reparent_node` | Move a node to a different parent in the scene tree | Restructure scenes without teardown/rebuild |

**Impact:** Without these, the AI cannot iterate on existing scenes — it can only create from scratch. This is the single largest workflow gap.

### 1.2 Shader Pipeline Completion

**Problem:** `create_shader_material` exists but there's no way to apply materials to nodes or adjust shader uniforms after creation. The pipeline is create-only.

| Tool | Description | Status |
|------|-------------|--------|
| `apply_material` | Apply a ShaderMaterial or StandardMaterial3D to a node in a scene | Specified in enhancement docs, never built |
| `set_shader_parameter` | Modify a shader uniform value on a node's material at the scene level | Specified in enhancement docs, never built |
| `create_material_from_texture` | Auto-generate StandardMaterial3D from a base texture with optional normal/roughness/metallic maps | Specified in enhancement docs, never built |

**Impact:** Completes the shader workflow from creation through application and tuning.

### 1.3 AnimationTree Configuration

**Problem:** `create_animation_player`, `add_animation_track`, and `add_keyframe` handle simple animations, but real character animation requires AnimationTree with blend spaces and state machines.

| Tool | Description | Status |
|------|-------------|--------|
| `configure_animation_tree` | Set up AnimationTree with BlendSpace1D, BlendSpace2D, or StateMachine root types | Specified in enhancement docs, marked as future enhancement |
| `create_animation_library` | Generate a complete animation library from a high-level compact description (instead of track-by-track) | Specified in enhancement docs, marked as future enhancement |

**Impact:** Any game with character movement, combat, or complex state-driven animation needs AnimationTree. Without it, the AI can only create simple tween-style animations.

### 1.4 Refactoring Tools

**Problem:** As projects grow, renaming variables, functions, or classes across multiple scripts and scenes is essential. `extract_dependencies` already finds references but there's no tool to act on them.

| Tool | Description | Status |
|------|-------------|--------|
| `refactor_rename` | Rename a function, variable, signal, or class across all scripts and scenes in the project | Specified in enhancement docs, never built |

**Impact:** Prevents the AI from maintaining code quality at scale. Without this, refactoring requires manual find-and-replace across dozens of files.

### 1.5 Architecture: Split the Monolith

**Problem:** `src/index.ts` is 11,355 lines in a single file with a massive switch statement for tool dispatch. `godot_operations.gd` is 4,413 lines with a similar pattern.

**Recommendations:**

| Change | Description | Benefit |
|--------|-------------|---------|
| **Module split** | Break `index.ts` into modules by domain: `tools/scene.ts`, `tools/script.ts`, `tools/animation.ts`, `tools/shader.ts`, etc. | Maintainability, parallel development, easier code review |
| **Tool registry pattern** | Replace the switch statement with a registry where each module registers its tools via a `registerTool(name, schema, handler)` function | Adding new tools no longer requires editing the central dispatch; reduces merge conflicts |
| **GDScript module split** | Similarly split `godot_operations.gd` into domain-specific files loaded by a dispatcher | Same benefits on the GDScript side |
| **Typed response interfaces** | Define TypeScript interfaces for all tool return types instead of ad-hoc `{ content: [...] }` objects | Compile-time safety, self-documenting API |

**Impact:** This is a force-multiplier for all future development. Every new tool added to a 11K-line file increases the risk of regressions and makes the code harder to navigate.

---

## Tier 2 — Significant Workflow Enhancements

These items add major new capabilities or complete partially-built systems.

### 2.1 Particle System Designer

**Problem:** GPUParticles2D/3D are one of the most commonly used visual effect systems in Godot, but there are zero tools for creating or configuring them. This was planned in the original enhancement roadmap (Phase 2 — Creative Workflows) but never implemented.

| Tool | Description |
|------|-------------|
| `create_particle_system` | Create GPUParticles2D/3D nodes with ProcessMaterial configuration |
| `configure_particle_emitter` | Set emission shape, direction, velocity, gravity, color gradient, scale curve |
| `apply_particle_preset` | Apply common presets: fire, smoke, explosion, magic sparkle, rain, snow, dust, blood splatter |
| `create_particle_material` | Create ParticleProcessMaterial with full parameter control |

**Impact:** Visual effects (explosions, ambient particles, magic effects) are a core part of game polish. Currently requires manual editor setup.

### 2.2 Performance Profiling

**Problem:** No way to programmatically detect or analyze performance issues. Listed in enhancement docs under "Additional Tools (Lower Priority)" but increasingly important as projects grow.

| Tool | Description |
|------|-------------|
| `start_profiler` | Begin a profiling session, run the game for N seconds, capture frame times and function call data |
| `get_profiling_data` | Retrieve captured performance metrics (FPS, frame time, draw calls, physics time, script time) |
| `analyze_bottlenecks` | Parse profiling data to identify slow functions, excessive draw calls, physics issues, memory spikes |

**Implementation Notes:** Godot exposes performance data via the `Performance` singleton and `--benchmark` CLI flag. Frame timing can be captured from debug output. The `OS.get_static_memory_usage()` and `RenderingServer.get_rendering_info()` APIs provide additional data.

**Impact:** Without this, performance issues are invisible to the AI until users report them manually.

### 2.3 Scene Validation

| Tool | Description |
|------|-------------|
| `validate_scene` | Check a scene for common issues: missing resources, broken script references, orphaned nodes, collision shapes without bodies, sprites without textures, signals connected to non-existent methods |

**Impact:** Catches errors before runtime. Especially valuable when the AI has made many automated changes to a scene.

### 2.4 Project Scaffolding

| Tool | Description |
|------|-------------|
| `create_project` | Scaffold a new Godot project from scratch with `project.godot`, standard folder structure (`scenes/`, `scripts/`, `assets/`, `audio/`, `shaders/`), default main scene, and sensible default settings |

**Impact:** Currently all tools require an existing project. This would let the AI bootstrap a project from zero.

### 2.5 Architecture: Caching & Validation Layer

| Change | Description | Benefit |
|--------|-------------|---------|
| **Scene parse cache** | Cache parsed `.tscn` file structures in memory with file-watcher invalidation | Avoid re-parsing the same scene file across multiple tool calls in a single session |
| **Input validation middleware** | Centralized parameter validation layer before tool handlers execute | Consistent error messages, reduce duplicated validation code across 52+ handlers |
| **Operation batching** | Support executing multiple operations in a single Godot headless invocation | Reduce process spawn overhead for multi-step workflows |

---

## Tier 3 — Workflow Completeness & Polish

These items round out existing capabilities and address secondary gaps.

### 3.1 Extended Code Intelligence

| Tool | Description | Status |
|------|-------------|--------|
| `generate_docstring` | Create/update documentation comments for classes and functions in GDScript files | Specified in enhancement docs, never built |
| `generate_test_from_specification` | Generate GUT test cases from natural language behavior descriptions | Specified in enhancement docs, never built |
| `analyze_test_coverage` | Determine which functions in a script have corresponding test cases | Specified in enhancement docs, never built |
| `create_mock_node` | Generate mock objects for isolated unit testing | Specified in enhancement docs, never built |

### 3.2 Class & Engine Introspection

| Tool | Description |
|------|-------------|
| `get_class_info` | Query Godot's built-in class database for properties, methods, signals, and inheritance of any node type | Helps the AI make correct decisions about node capabilities without guessing |
| `search_asset_library` | Search the Godot Asset Library by keyword, category, or tag (public REST API) | Currently embedded inside `install_plugin`; deserves standalone access |

### 3.3 Audio Bus Configuration

| Tool | Description |
|------|-------------|
| `configure_audio_bus` | Set up audio bus layouts (Master, Music, SFX, Voice, Ambient) with volume, effects, and routing | `create_resource` can technically make an AudioBusLayout but a dedicated tool would handle effects chains (reverb, compressor, limiter) and bus routing properly |

### 3.4 Viewport & Screenshot Capture

| Tool | Description |
|------|-------------|
| `capture_viewport` | Take a screenshot of a running game's viewport and save to disk | Enables visual verification of scene composition; could be combined with AI vision for automated visual QA |

### 3.5 Architecture: Error Handling & Logging

| Change | Description | Benefit |
|--------|-------------|---------|
| **Structured error taxonomy** | Define error categories (validation, runtime, file-not-found, Godot-process, timeout) with consistent error codes | Enables AI to programmatically handle different error types rather than parsing error strings |
| **Operation logging** | Log all tool invocations with parameters and results to a session log file | Debugging, audit trail, replay capability |
| **Timeout configuration** | Per-tool configurable timeouts (some operations like export can take minutes) | Prevent premature termination of long-running operations |

---

## Tier 4 — Future Vision (from Fully AI Gamedev Roadmap)

These items represent the next major evolution toward fully AI-driven game development. They require significant infrastructure and may involve separate MCP servers.

### 4.1 Automated Playtesting Harness

| Tool | Description |
|------|-------------|
| `run_automated_playtest` | Run the game with an automated input bot (random, pathfinding, stress-test) for N seconds and record events |
| `start_playtest_recording` | Begin recording a playtest session (inputs, game state, events, optionally video) |
| `stop_playtest_recording` | Stop recording and save session data |
| `analyze_playtest_session` | Analyze recorded session for death locations, backtracking, difficulty spikes, unused mechanics, frustration indicators |
| `generate_heatmap` | Generate visual heatmaps from aggregated playtest data (position, death, damage, pickup locations) |
| `compare_sessions` | Compare metrics across multiple playtest sessions grouped by version, bot type, or player |

**Prerequisite:** Requires a `playtest_recorder.gd` autoload singleton injected into the game project.

### 4.2 Fun Metrics Framework

| Tool | Description |
|------|-------------|
| `calculate_game_feel_metrics` | Calculate responsiveness, juice, pacing, difficulty, and engagement metrics from playtest data |
| `analyze_difficulty_curve` | Plot difficulty progression and identify spikes/valleys |
| `compare_to_genre_benchmarks` | Compare game metrics against genre standards (platformer, roguelike, FPS, RPG, etc.) |
| `detect_frustration_points` | Identify likely frustration points with evidence, causes, and suggested fixes |
| `analyze_juice_coverage` | Analyze which game actions have satisfying visual/audio/haptic feedback and which don't |

**Prerequisite:** Depends on the Playtesting Harness (4.1).

### 4.3 Asset Generation Integration (Separate MCP Servers)

These would be separate MCP servers that integrate with Godot MCP:

| Server | Tools | Backend Options |
|--------|-------|-----------------|
| **Image Generation MCP** | `generate_sprite`, `generate_spritesheet`, `generate_tileset`, `generate_ui_element`, `generate_texture`, `generate_particle_texture`, `create_style_guide`, `generate_variations`, `upscale_asset` | Stable Diffusion (local), DALL-E 3, Midjourney, ComfyUI |
| **Audio Generation MCP** | `generate_sfx`, `generate_footsteps`, `generate_ui_sounds`, `generate_music`, `generate_adaptive_music`, `generate_stinger`, `generate_ambience`, `generate_voice_placeholder`, `process_audio`, `create_sound_bank` | Suno, ElevenLabs, AudioCraft (Meta), Stable Audio |

**Ultimate Vision:** AI generates a complete, polished, fun game from a single high-level prompt — assets, code, scenes, audio, testing, and iteration all handled autonomously.

---

## Implementation Priority Summary

| Tier | Focus | Estimated New Tools | Complexity |
|------|-------|---------------------|------------|
| **Tier 1** | Critical gaps + architecture split | 9 tools + major refactor | High |
| **Tier 2** | Major new capabilities | 8 tools + caching layer | Medium-High |
| **Tier 3** | Workflow completeness | 8 tools + error improvements | Medium |
| **Tier 4** | Future vision | 16 tools (integrated bridge) | Very High — COMPLETE ✅ |

### Suggested Execution Order Within Tiers

**Tier 1 (do first):**

1. Architecture split (enables everything else)
2. Scene inspection tools (`list_scene_tree` first, then read/modify/remove)
3. Shader pipeline completion (`apply_material`, `set_shader_parameter`)
4. `configure_animation_tree`
5. `refactor_rename`

**Tier 2 (do second):**

1. Particle System Designer
2. `validate_scene`
3. `create_project`
4. Performance Profiling
5. Caching layer

**Tier 3 (do third):**

1. Extended code intelligence tools
2. `get_class_info`
3. Audio bus configuration
4. Viewport capture
5. Error handling improvements

**Tier 4 (long-term):**

1. Playtest Harness
2. Fun Metrics Framework
3. Image Generation MCP (separate project)
4. Audio Generation MCP (separate project)

---

## Appendix: All Unimplemented Tools from Existing Specs

These tools were explicitly specified in `godot-mcp-enhancements.md` but were not built during the original 12 phases:

| Tool | Original Section | Reason Skipped |
|------|-----------------|----------------|
| `refactor_rename` | GDScript Code Intelligence | Scope reduction |
| `generate_docstring` | GDScript Code Intelligence | Scope reduction |
| `create_animation_library` | Animation & Timeline | Marked as future enhancement |
| `configure_animation_tree` | Animation & Timeline | Marked as future enhancement |
| `generate_shader_from_description` | Shader & Material Pipeline | Scope reduction (AI already generates shader code inline) |
| `apply_material` | Shader & Material Pipeline | Not implemented |
| `set_shader_parameter` | Shader & Material Pipeline | Not implemented |
| `create_material_from_texture` | Shader & Material Pipeline | Not implemented |
| `generate_test_from_specification` | Testing & QA | Scope reduction |
| `analyze_test_coverage` | Testing & QA | Scope reduction |
| `create_mock_node` | Testing & QA | Scope reduction |
| `start_profiler` | Performance Analysis | Entire category deferred |
| `get_profiling_data` | Performance Analysis | Entire category deferred |
| `analyze_bottlenecks` | Performance Analysis | Entire category deferred |
| Particle System Designer (category) | Creative Workflows | Entire category deferred |
