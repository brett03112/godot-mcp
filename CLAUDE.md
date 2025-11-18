# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Godot MCP is a Model Context Protocol (MCP) server that enables AI assistants to interact with the Godot game engine. It provides tools for launching the editor, running projects, capturing debug output, manipulating scenes, and managing project resources.

## Active Development

**IMPORTANT:** This project has an active enhancement roadmap. See `TODO.md` for the implementation plan and `godot-mcp-enhancements.md` for the complete enhancement specifications.

**Development Rules:**
1. **NO TASK MAY PROCEED UNTIL THE PREVIOUS TASK IS FULLY TESTED AND VALIDATED**
2. All tests must pass before marking any task complete
3. Each task has explicit testing requirements that MUST be completed
4. Document all test results in TODO.md before proceeding

The current implementation plan follows a phased approach:
- **Phase 1:** Signal & Event Connection System (CRITICAL)
- **Phase 2:** GDScript Code Intelligence (CRITICAL)
- **Phase 3:** Enhanced Debugging & Error Analysis
- **Phase 4:** Animation & Timeline Orchestration
- **Phase 5:** Shader & Material Pipeline
- **Phase 6:** Testing & Quality Assurance
- Future phases cover asset management, build pipelines, and specialized workflows

## Build and Development Commands

### Essential Commands

- **Install dependencies**: `npm install`
- **Build the project**: `npm run build`
  - Compiles TypeScript from `src/` to `build/`
  - Copies `src/scripts/godot_operations.gd` to `build/scripts/`
  - Makes `build/index.js` executable
- **Development mode**: `npm run watch`
  - Runs TypeScript compiler in watch mode for continuous rebuilding
- **Test with MCP Inspector**: `npm run inspector`
  - Launches the MCP Inspector for interactive debugging

### Build Process

The build process involves two steps:
1. TypeScript compilation (`tsc`)
2. Post-build script (`scripts/build.js`) that:
   - Sets executable permissions on `build/index.js`
   - Copies the GDScript operations file to the build directory

## Architecture

### Core Components

**Main Server (`src/index.ts`)**: A ~2200 line TypeScript file containing the entire MCP server implementation in a single `GodotServer` class.

**Bundled Operations Script (`src/scripts/godot_operations.gd`)**: A comprehensive GDScript file (~50KB) that handles all complex Godot operations. This script:
- Accepts operation type and JSON parameters via command-line arguments
- Executes operations directly within Godot's headless mode
- Eliminates the need for temporary script files
- Provides consistent error handling and logging

### Key Design Patterns

**Operation Dispatch**: The server uses a "bundled operation" approach rather than generating temporary scripts:
1. Simple CLI operations (launch editor, get version) use Godot's built-in commands directly
2. Complex operations (scene manipulation, node creation) invoke `godot_operations.gd` with operation type and JSON parameters
3. The GDScript file uses pattern matching to route to specific operation handlers

**Parameter Mapping**: The server supports both snake_case and camelCase parameter names:
- `parameterMappings` converts snake_case to camelCase
- `reverseParameterMappings` converts camelCase to snake_case
- This dual support accommodates different MCP client conventions

**Process Management**: Maintains a single active Godot process (`activeProcess: GodotProcess | null`) for running projects, capturing stdout/stderr output and errors.

**Godot Path Detection**: Implements multi-stage fallback logic:
1. Custom path from config
2. GODOT_PATH environment variable
3. Platform-specific common installation paths
4. Fallback defaults with warnings

### Available MCP Tools

The server exposes 12 tools via the MCP protocol:

**Project Management**:
- `launch_editor` - Open Godot editor for a project
- `run_project` - Execute a project in debug mode with optional scene
- `stop_project` - Terminate running project
- `get_debug_output` - Retrieve captured console output
- `get_godot_version` - Query installed Godot version
- `list_projects` - Find project.godot files in directories
- `get_project_info` - Analyze project structure and assets

**Scene Manipulation**:
- `create_scene` - Create new .tscn files with specified root node types
- `add_node` - Add nodes to scenes with properties
- `load_sprite` - Assign textures to Sprite2D nodes
- `save_scene` - Save or create scene variants

**Resource Management**:
- `export_mesh_library` - Convert 3D scenes to MeshLibrary resources
- `get_uid` - Retrieve UIDs for files (Godot 4.4+)
- `update_project_uids` - Resave resources to update UID references (Godot 4.4+)

## Configuration

### Environment Variables

- `GODOT_PATH`: Override Godot executable path (avoids auto-detection)
- `DEBUG`: Set to "true" to enable detailed server-side logging

### Server Configuration Options

When instantiating `GodotServer`, you can pass a `GodotServerConfig`:
- `godotPath`: Custom path to Godot executable
- `debugMode`: Enable debug logging (overrides DEBUG env var)
- `godotDebugMode`: Always true for operations script
- `strictPathValidation`: When true, throws error if Godot not found (default: false)

## Cross-Platform Considerations

- Always use Node.js `path` utilities (`join`, `normalize`, `dirname`) for path operations
- Godot executable locations vary by platform:
  - **macOS**: `/Applications/Godot.app/Contents/MacOS/Godot`
  - **Windows**: `C:\Program Files\Godot\Godot.exe`
  - **Linux**: `/usr/bin/godot` or `/usr/local/bin/godot`
- The server normalizes all paths to ensure consistent format

## Code Style and Patterns

- TypeScript with strict mode enabled
- ES2022 target, ESNext module format
- JSDoc comments for all classes and methods
- Error responses include `isError: true` and optional `possibleSolutions` array
- Debug logging gated by `DEBUG_MODE` constant
- Path validation to prevent traversal attacks

## Adding New Tools

To add a new MCP tool:

1. Add tool definition to `setupToolHandlers()` in the `ListToolsRequestSchema` handler
2. Add tool name to the switch statement in `CallToolRequestSchema` handler
3. Implement handler method (e.g., `private async handleNewTool(args: any)`)
4. If it requires GDScript operations, add operation to `godot_operations.gd`
5. Update README.md Features section
6. Update configuration examples with new tool in `autoApprove` array

## Testing and Debugging

- Use `npm run inspector` to interactively test tools
- Enable DEBUG mode for verbose logging
- Check both server logs (TypeScript side) and Godot logs (GDScript side)
- The GDScript operations file includes its own debug logging controlled by `--debug-godot` flag

## Common Patterns

**Executing Godot Operations**:
```typescript
const result = await this.executeGodotOperation(
  projectPath,
  'operation_name',
  { param1: value1, param2: value2 }
);
```

**Creating Error Responses**:
```typescript
return this.createErrorResponse(
  'Error message',
  ['Solution 1', 'Solution 2']
);
```

**Validating Project Paths**:
```typescript
const projectFile = join(projectPath, 'project.godot');
if (!existsSync(projectFile)) {
  return this.createErrorResponse('Invalid project path');
}
```
