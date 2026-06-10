import { ToolRegistry } from '../registry.js';
import { ToolDefinition, ToolResponse } from '../types.js';
import { createHash } from 'crypto';
import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import {
  LiveCommandResult,
  LiveSessionManager,
  LiveSessionRecord,
  liveSessionManager,
  normalizeProjectPath,
} from '../live/session-manager.js';

export type LiveEditorToolOptions = {
  manager?: LiveSessionManager;
  getTransportStatus?: () => Record<string, unknown>;
  evalConfig?: Partial<LiveEvalConfig>;
};

type LiveToolConfig = {
  name: string;
  command: string;
  description: string;
  properties?: Record<string, unknown>;
  required?: string[];
  timeout?: number;
};

type LiveEvalConfig = {
  enabled: boolean;
  approvalToken?: string;
  projectPath?: string;
  auditLogPath: string;
};

const LIVE_RESOURCE_DESCRIPTORS = [
  {
    uri: 'godot-mcp://live/sessions',
    name: 'Godot MCP live sessions',
    description: 'Connected Godot editor live sessions tracked by the MCP server.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/editor/state',
    name: 'Godot MCP live editor state',
    description: 'Current state snapshot from the active Godot editor session.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/scene/current',
    name: 'Godot MCP live current scene',
    description: 'Current active scene metadata from the live Godot editor.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/scene/hierarchy',
    name: 'Godot MCP live scene hierarchy',
    description: 'Compact hierarchy for the active live Godot editor scene.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/selection/current',
    name: 'Godot MCP live current selection',
    description: 'Current selected nodes in the live Godot editor scene tree.',
    mimeType: 'application/json',
  },
  {
    uri: 'godot-mcp://live/logs/recent',
    name: 'Godot MCP live recent logs',
    description: 'Recent logs retained by the live Godot editor addon.',
    mimeType: 'application/json',
  },
];

export function registerLiveEditorTools(registry: ToolRegistry, options: LiveEditorToolOptions = {}): void {
  const manager = options.manager || liveSessionManager;
  const evalConfig = resolveEvalConfig(options.evalConfig);
  const tools: ToolDefinition[] = [
    liveEvalStatus(manager, evalConfig),
  ];
  if (evalConfig.enabled) {
    tools.push(evalTool(manager, evalConfig, 'editor_eval', 'Evaluate a harmless Godot Expression in the live editor after explicit MCP eval approval.'));
    tools.push(evalTool(manager, evalConfig, 'game_eval', 'Evaluate a harmless Godot Expression in the running game after explicit MCP eval approval.'));
  }
  registry.registerAll(tools);
  registry.registerAll([
    editorState(manager),
    sessionList(manager, options.getTransportStatus),
    sessionActivate(manager),
    sessionDisconnect(manager),
    liveCommandTool(manager, {
      name: 'runtime_ping',
      command: 'runtime_ping',
      description: 'Send a debugger-bridge ping to the running Godot game and return the runtime pong metadata.',
      properties: {
        runtime_session_id: { type: 'number', description: 'Specific Godot debugger session ID to target. Defaults to the active runtime session.' },
        payload: { type: 'object', description: 'Optional JSON payload echoed by the runtime bridge.' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_play_scene',
      command: 'runtime_play_scene',
      description: 'Start a Godot runtime from the live editor by playing a specific scene through EditorInterface.',
      properties: {
        scene_path: { type: 'string', description: 'Scene path to play, for example res://scenes/main.tscn.' },
      },
      required: ['scene_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_stop',
      command: 'runtime_stop',
      description: 'Stop the currently playing Godot runtime through the live editor.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_scene_tree',
      command: 'runtime_get_scene_tree',
      description: 'Inspect the live running Godot scene tree through the debugger runtime bridge.',
      properties: {
        max_depth: { type: 'number', description: 'Maximum runtime scene depth to include (default: 8).' },
        include_properties: { type: 'boolean', description: 'Include compact serialized node properties (default: false).' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_node_info',
      command: 'runtime_get_node_info',
      description: 'Inspect a node in the live running Godot scene tree.',
      properties: {
        node_path: { type: 'string', description: 'Runtime node path relative to the current scene root. Use "." for the root node.' },
        include_properties: { type: 'boolean', description: 'Include compact serialized node properties (default: false).' },
        include_groups: { type: 'boolean', description: 'Include node group membership (default: true).' },
      },
      required: ['node_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_node_property',
      command: 'runtime_get_node_property',
      description: 'Read one property from a node in the live running Godot scene tree.',
      properties: {
        node_path: { type: 'string', description: 'Runtime node path relative to the current scene root. Use "." for the root node.' },
        property: { type: 'string', description: 'Property name to read.' },
      },
      required: ['node_path', 'property'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_watch_node',
      command: 'runtime_watch_node',
      description: 'Read a compact watched-property snapshot for a runtime node.',
      properties: {
        node_path: { type: 'string', description: 'Runtime node path relative to the current scene root. Use "." for the root node.' },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional property names to watch. Defaults to common node state.',
        },
      },
      required: ['node_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_ui_elements',
      command: 'runtime_get_ui_elements',
      description: 'List Control nodes in the live running scene with text, bounds, visibility, disabled, and focus metadata.',
      properties: {
        include_hidden: { type: 'boolean', description: 'Include hidden Control nodes (default: false).' },
        include_disabled: { type: 'boolean', description: 'Include disabled Control nodes (default: true).' },
        max_depth: { type: 'number', description: 'Maximum runtime scene depth to scan (default: 12).' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_focus_owner',
      command: 'runtime_get_focus_owner',
      description: 'Read the currently focused Control in the live running Godot viewport.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_viewport_info',
      command: 'runtime_get_viewport_info',
      description: 'Read live runtime viewport size, visible rect, mouse position, and focus metadata.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_performance_metrics',
      command: 'runtime_get_performance_metrics',
      description: 'Read common Godot Performance monitor values from the live runtime process.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_input_map',
      command: 'runtime_get_input_map',
      description: 'Read runtime InputMap actions and serialized input events from the live game.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_get_groups',
      command: 'runtime_get_groups',
      description: 'List runtime scene-tree groups and member node paths from the live game.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_input_key',
      command: 'runtime_input_key',
      description: 'Send a key press or release event to the live running Godot game.',
      properties: {
        key: { type: ['string', 'number'], description: 'Godot key name such as Space, Enter, A, or a numeric keycode.' },
        pressed: { type: 'boolean', description: 'Whether the key is pressed (default: true).' },
        echo: { type: 'boolean', description: 'Whether this is an echo/repeat key event (default: false).' },
      },
      required: ['key'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_input_mouse',
      command: 'runtime_input_mouse',
      description: 'Send a mouse button or motion event to the live running Godot game.',
      properties: {
        event_type: { type: 'string', enum: ['button', 'motion'], description: 'Mouse event kind (default: button).' },
        position: { type: 'object', description: 'Viewport position as { x, y } or { value: [x, y] }.' },
        relative: { type: 'object', description: 'Motion relative delta as { x, y } or { value: [x, y] }.' },
        button_index: { type: 'number', description: 'Mouse button index for button events (default: 1 / left).' },
        pressed: { type: 'boolean', description: 'Whether the mouse button is pressed (default: true).' },
        factor: { type: 'number', description: 'Mouse button factor or wheel factor (default: 1).' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_input_gamepad',
      command: 'runtime_input_gamepad',
      description: 'Send a joypad button or axis event to the live running Godot game.',
      properties: {
        device: { type: 'number', description: 'Joypad device ID (default: 0).' },
        control: { type: 'string', enum: ['button', 'axis'], description: 'Joypad control kind.' },
        index: { type: 'number', description: 'Button or axis index.' },
        value: { type: 'number', description: 'Axis value or button pressure (default: 1).' },
        pressed: { type: 'boolean', description: 'Whether a joypad button is pressed (default: true).' },
      },
      required: ['control', 'index'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_input_action',
      command: 'runtime_input_action',
      description: 'Send an InputEventAction to the live running Godot game.',
      properties: {
        action: { type: 'string', description: 'InputMap action name, such as ui_accept or jump.' },
        pressed: { type: 'boolean', description: 'Whether the action is pressed (default: true).' },
        strength: { type: 'number', description: 'Action strength from 0 to 1 (default: 1 when pressed, 0 when released).' },
      },
      required: ['action'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_input_text',
      command: 'runtime_input_text',
      description: 'Type text into the live running Godot game by sending key events for each character.',
      properties: {
        text: { type: 'string', description: 'Text to type.' },
      },
      required: ['text'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_input_state',
      command: 'runtime_input_state',
      description: 'Read live input state for requested actions, keys, mouse buttons, and gamepad buttons.',
      properties: {
        actions: { type: 'array', items: { type: 'string' }, description: 'Input action names to read.' },
        keys: { type: 'array', items: { type: ['string', 'number'] }, description: 'Keys to read by name or numeric keycode.' },
        mouse_buttons: { type: 'array', items: { type: 'number' }, description: 'Mouse button indexes to read.' },
        gamepad_buttons: { type: 'array', items: { type: 'number' }, description: 'Joypad button indexes to read.' },
        device: { type: 'number', description: 'Joypad device ID (default: 0).' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_wait_for_condition',
      command: 'runtime_wait_for_condition',
      description: 'Poll live runtime state until a condition matches or a timeout expires.',
      properties: {
        kind: { type: 'string', enum: ['node_property', 'ui_text', 'action'], description: 'Condition kind to poll.' },
        node_path: { type: 'string', description: 'Runtime node path for node_property waits.' },
        property: { type: 'string', description: 'Property name for node_property waits.' },
        equals: { description: 'Expected value for equality checks.' },
        contains: { type: 'string', description: 'Expected substring for string/list checks.' },
        action: { type: 'string', description: 'Input action name for action waits.' },
        pressed: { type: 'boolean', description: 'Expected action pressed state (default: true).' },
        text: { type: 'string', description: 'UI text to search for in ui_text waits.' },
        exact: { type: 'boolean', description: 'Use exact UI text matching (default: true).' },
        wait_timeout_ms: { type: 'number', description: 'Maximum condition wait duration in milliseconds (default: 1000).' },
        poll_interval_ms: { type: 'number', description: 'Polling interval in milliseconds (default: 50).' },
      },
      required: ['kind'],
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_click_ui_text',
      command: 'runtime_click_ui_text',
      description: 'Click the center of a visible live runtime Control found by text.',
      properties: {
        text: { type: 'string', description: 'Control text to find.' },
        exact: { type: 'boolean', description: 'Use exact text matching (default: true).' },
        button_index: { type: 'number', description: 'Mouse button index to click with (default: 1 / left).' },
      },
      required: ['text'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_click_ui_path',
      command: 'runtime_click_ui_path',
      description: 'Click the center of a visible live runtime Control by node path.',
      properties: {
        node_path: { type: 'string', description: 'Runtime Control path relative to current scene root.' },
        button_index: { type: 'number', description: 'Mouse button index to click with (default: 1 / left).' },
      },
      required: ['node_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_assert_node_exists',
      command: 'runtime_assert_node_exists',
      description: 'Assert that a node exists in the live running Godot scene tree.',
      properties: {
        node_path: { type: 'string', description: 'Runtime node path relative to current scene root. Use "." for the root node.' },
        assertion_id: { type: 'string', description: 'Optional caller-defined assertion ID for reports.' },
      },
      required: ['node_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_assert_property_equals',
      command: 'runtime_assert_property_equals',
      description: 'Assert that a runtime node property equals an expected JSON value.',
      properties: {
        node_path: { type: 'string', description: 'Runtime node path relative to current scene root. Use "." for the root node.' },
        property: { type: 'string', description: 'Property name to read.' },
        expected: { description: 'Expected JSON value.' },
        assertion_id: { type: 'string', description: 'Optional caller-defined assertion ID for reports.' },
      },
      required: ['node_path', 'property', 'expected'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_assert_signal_emitted',
      command: 'runtime_assert_signal_emitted',
      description: 'Assert that a runtime node signal has been emitted at least min_count times while tracked.',
      properties: {
        node_path: { type: 'string', description: 'Runtime node path relative to current scene root.' },
        signal_name: { type: 'string', description: 'Signal name to track.' },
        min_count: { type: 'number', description: 'Minimum observed emission count (default: 1).' },
        since_unix: { type: 'number', description: 'Optional lower bound for emission timestamps.' },
        assertion_id: { type: 'string', description: 'Optional caller-defined assertion ID for reports.' },
      },
      required: ['node_path', 'signal_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_assert_ui_text_visible',
      command: 'runtime_assert_ui_text_visible',
      description: 'Assert that visible runtime UI text exists.',
      properties: {
        text: { type: 'string', description: 'Control text to search for.' },
        exact: { type: 'boolean', description: 'Use exact text matching (default: true).' },
        assertion_id: { type: 'string', description: 'Optional caller-defined assertion ID for reports.' },
      },
      required: ['text'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_assert_no_errors',
      command: 'runtime_assert_no_errors',
      description: 'Assert that the runtime assertion bridge has not observed recent runtime errors.',
      properties: {
        since_unix: { type: 'number', description: 'Only include tracked errors at or after this Unix timestamp.' },
        include_warnings: { type: 'boolean', description: 'Include tracked warnings when available (default: false).' },
        assertion_id: { type: 'string', description: 'Optional caller-defined assertion ID for reports.' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'runtime_snapshot_assertion_report',
      command: 'runtime_snapshot_assertion_report',
      description: 'Return a compact report of recent live runtime assertion results.',
      properties: {
        include_passed: { type: 'boolean', description: 'Include passing assertions (default: true).' },
        limit: { type: 'number', description: 'Maximum assertion records to return (default: 50).' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'scene_current',
      command: 'scene_current',
      description: 'Read the active scene path, root metadata, and compact hierarchy from the live Godot editor.',
      properties: {
        include_hierarchy: { type: 'boolean', description: 'Include compact scene hierarchy (default: true).' },
      },
    }),
    liveCommandTool(manager, {
      name: 'scene_open',
      command: 'scene_open',
      description: 'Open a scene in the live Godot editor by res:// path.',
      properties: {
        scene_path: { type: 'string', description: 'Scene path to open, for example res://scenes/main.tscn.' },
      },
      required: ['scene_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'scene_save_active',
      command: 'scene_save_active',
      description: 'Save the currently active scene through the live Godot editor.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'scene_reload_active',
      command: 'scene_reload_active',
      description: 'Reload the currently active scene through the live Godot editor.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'selection_get',
      command: 'selection_get',
      description: 'Read selected node paths from the live Godot editor scene tree.',
    }),
    liveCommandTool(manager, {
      name: 'selection_set',
      command: 'selection_set',
      description: 'Set selected node paths in the live Godot editor scene tree.',
      properties: {
        node_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node paths relative to the active scene root. Use "." for the root node.',
        },
        replace: { type: 'boolean', description: 'Clear existing selection before selecting nodes (default: true).' },
      },
      required: ['node_paths'],
    }),
    liveCommandTool(manager, {
      name: 'editor_screenshot',
      command: 'editor_screenshot',
      description: 'Capture a live Godot editor viewport screenshot to a project-relative PNG path.',
      properties: {
        output_path: { type: 'string', description: 'Project-relative output path, for example screenshots/editor.png.' },
        viewport: { type: 'string', enum: ['2d', '3d'], description: 'Editor viewport to capture (default: 2d).' },
        viewport_index: { type: 'number', description: '3D viewport index from 0 to 3 (default: 0).' },
      },
      required: ['output_path'],
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'logs_read_editor',
      command: 'logs_read_editor',
      description: 'Read recent log messages retained by the live Godot editor addon.',
      properties: {
        limit: { type: 'number', description: 'Maximum number of log records to return.' },
      },
    }),
    liveCommandTool(manager, {
      name: 'logs_clear',
      command: 'logs_clear',
      description: 'Clear recent log messages retained by the live Godot editor addon.',
    }),
    liveCommandTool(manager, {
      name: 'editor_monitors_get',
      command: 'editor_monitors_get',
      description: 'Read selected Godot Performance monitor values from the live editor process.',
      properties: {
        monitors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional monitor names such as TIME_FPS or OBJECT_NODE_COUNT.',
        },
      },
    }),
    liveCommandTool(manager, {
      name: 'editor_quit',
      command: 'editor_quit',
      description: 'Quit or restart the live Godot editor. Requires confirm: true.',
      properties: {
        confirm: { type: 'boolean', description: 'Must be true to quit the editor.' },
        save: { type: 'boolean', description: 'Save before quitting/restarting when supported (default: true).' },
      },
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_scene_get_hierarchy',
      command: 'live_scene_get_hierarchy',
      description: 'Read the active live editor scene hierarchy without requiring a scene file path.',
      properties: {
        max_depth: { type: 'number', description: 'Maximum hierarchy depth to include (default: 8).' },
        include_properties: { type: 'boolean', description: 'Include compact serialized node properties (default: false).' },
      },
    }),
    liveCommandTool(manager, {
      name: 'live_node_get_properties',
      command: 'live_node_get_properties',
      description: 'Read properties for a node in the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. Use "." for the root node.' },
        property_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional property names to read. If omitted, editor/storage/script properties are returned.',
        },
      },
      required: ['node_path'],
    }),
    liveCommandTool(manager, {
      name: 'live_node_set_property',
      command: 'live_node_set_property',
      description: 'Set a property on a node in the active live editor scene and mark the scene dirty by default.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. Use "." for the root node.' },
        property_name: { type: 'string', description: 'Property name to set.' },
        property_value: { description: 'JSON value to assign. Typed values may use { "type": "Vector2", "value": [x, y] } and similar forms.' },
        mark_dirty: { type: 'boolean', description: 'Mark the current scene unsaved after mutation (default: true).' },
      },
      required: ['node_path', 'property_name', 'property_value'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_create',
      command: 'live_node_create',
      description: 'Create a node under a parent in the active live editor scene.',
      properties: {
        parent_path: { type: 'string', description: 'Parent node path relative to the active scene root. Use "." for the root node.' },
        node_type: { type: 'string', description: 'Godot class name to instantiate, for example Node2D, Sprite2D, or Button.' },
        node_name: { type: 'string', description: 'Name for the new node.' },
        properties: { type: 'object', description: 'Optional properties to set on the new node.' },
        select: { type: 'boolean', description: 'Select the new node in the editor after creation (default: false).' },
      },
      required: ['parent_path', 'node_type', 'node_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_delete',
      command: 'live_node_delete',
      description: 'Delete a node from the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. The root node cannot be deleted.' },
        keep_children: { type: 'boolean', description: 'Reparent children to the deleted node parent before deletion (default: false).' },
      },
      required: ['node_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_duplicate',
      command: 'live_node_duplicate',
      description: 'Duplicate a node in the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. The root node cannot be duplicated.' },
        new_name: { type: 'string', description: 'Optional name for the duplicated node.' },
        select: { type: 'boolean', description: 'Select the duplicated node in the editor after duplication (default: false).' },
      },
      required: ['node_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_reparent',
      command: 'live_node_reparent',
      description: 'Move a node under a new parent in the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root. The root node cannot be reparented.' },
        new_parent_path: { type: 'string', description: 'New parent node path relative to the active scene root. Use "." for the root node.' },
        keep_global_transform: { type: 'boolean', description: 'Preserve global transform where Godot supports it (default: true).' },
      },
      required: ['node_path', 'new_parent_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_rename',
      command: 'live_node_rename',
      description: 'Rename a node in the active live editor scene.',
      properties: {
        node_path: { type: 'string', description: 'Node path relative to the active scene root.' },
        new_name: { type: 'string', description: 'New node name.' },
      },
      required: ['node_path', 'new_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_connect_signal',
      command: 'live_node_connect_signal',
      description: 'Connect a signal between two nodes in the active live editor scene.',
      properties: {
        source_node_path: { type: 'string', description: 'Source node path relative to the active scene root.' },
        signal_name: { type: 'string', description: 'Signal name on the source node.' },
        target_node_path: { type: 'string', description: 'Target node path relative to the active scene root.' },
        method_name: { type: 'string', description: 'Target method name.' },
        flags: { type: 'number', description: 'Godot connect flags. Defaults to CONNECT_PERSIST in the addon.' },
        binds: { type: 'array', description: 'Optional bound arguments for the callable.' },
      },
      required: ['source_node_path', 'signal_name', 'target_node_path', 'method_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_node_disconnect_signal',
      command: 'live_node_disconnect_signal',
      description: 'Disconnect a signal between two nodes in the active live editor scene.',
      properties: {
        source_node_path: { type: 'string', description: 'Source node path relative to the active scene root.' },
        signal_name: { type: 'string', description: 'Signal name on the source node.' },
        target_node_path: { type: 'string', description: 'Target node path relative to the active scene root.' },
        method_name: { type: 'string', description: 'Target method name.' },
        binds: { type: 'array', description: 'Optional bound arguments used when the connection was created.' },
      },
      required: ['source_node_path', 'signal_name', 'target_node_path', 'method_name'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_scene_mark_dirty',
      command: 'live_scene_mark_dirty',
      description: 'Mark the current live editor scene as unsaved.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'live_scene_save',
      command: 'live_scene_save',
      description: 'Save the current live editor scene.',
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'editor_filesystem_scan',
      command: 'editor_filesystem_scan',
      description: 'Ask the live Godot editor filesystem to scan externally changed project files.',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional project resource paths to update before scanning. Omit to scan the whole project.',
        },
        wait_for_scan: { type: 'boolean', description: 'Wait briefly for the scan to settle before returning metadata (default: true).' },
      },
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'editor_filesystem_reimport',
      command: 'editor_filesystem_reimport',
      description: 'Ask the live Godot editor to reimport selected project resources.',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Project resource paths to reimport, for example res://icon.svg.',
        },
      },
      required: ['paths'],
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'editor_resource_reload',
      command: 'editor_resource_reload',
      description: 'Reload a resource through the live Godot editor process.',
      properties: {
        resource_path: { type: 'string', description: 'Project resource path to reload, for example res://materials/theme.tres.' },
        cache_mode: {
          type: 'string',
          enum: ['reuse', 'ignore', 'replace', 'ignore_deep', 'replace_deep'],
          description: 'ResourceLoader cache mode to use (default: replace).',
        },
      },
      required: ['resource_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'editor_resource_uid_update',
      command: 'editor_resource_uid_update',
      description: 'Ask the live Godot editor to refresh UID metadata for selected resources.',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Project resource paths whose UID metadata should be refreshed.',
        },
      },
      required: ['paths'],
      timeout: 15000,
    }),
    liveCommandTool(manager, {
      name: 'editor_open_resource',
      command: 'editor_open_resource',
      description: 'Open or edit a project resource in the live Godot editor.',
      properties: {
        resource_path: { type: 'string', description: 'Project resource path to open, for example res://coin_v2.gd.' },
      },
      required: ['resource_path'],
      timeout: 10000,
    }),
    liveCommandTool(manager, {
      name: 'editor_focus_file',
      command: 'editor_focus_file',
      description: 'Focus a project resource path in the live Godot editor filesystem dock.',
      properties: {
        resource_path: { type: 'string', description: 'Project resource path to reveal in the filesystem dock.' },
      },
      required: ['resource_path'],
      timeout: 10000,
    }),
  ]);
}

export function getLiveResourceDescriptors(): Array<Record<string, unknown>> {
  return LIVE_RESOURCE_DESCRIPTORS.map((resource) => ({ ...resource }));
}

export async function readLiveResource(uri: string, manager: LiveSessionManager = liveSessionManager): Promise<Record<string, unknown>> {
  const parsed = new URL(uri);
  const resourcePath = parsed.pathname.replace(/^\//, '');

  if (parsed.protocol !== 'godot-mcp:' || parsed.hostname !== 'live') {
    throw new Error(`Unsupported live resource URI: ${uri}`);
  }

  if (resourcePath === 'sessions') {
    const sessions = manager.listSessions();
    return {
      status: 'success',
      count: sessions.length,
      active_session_id: manager.getActiveSessionId(),
      sessions: sessions.map(serializeSession),
    };
  }

  const commandByResource: Record<string, { command: string; args?: Record<string, unknown> }> = {
    'editor/state': { command: 'editor_state' },
    'scene/current': { command: 'scene_current' },
    'scene/hierarchy': { command: 'scene_current', args: { include_hierarchy: true } },
    'selection/current': { command: 'selection_get' },
    'logs/recent': { command: 'logs_read_editor', args: { limit: 200 } },
  };

  const config = commandByResource[resourcePath];
  if (!config) {
    throw new Error(`Live resource not found: ${uri}`);
  }

  const result = await manager.sendCommand(config.command, config.args || {});
  return serializeCommandResult(result);
}

function liveEvalStatus(manager: LiveSessionManager, evalConfig: LiveEvalConfig): ToolDefinition {
  return {
    name: 'live_eval_status',
    description: 'Report whether live editor/game eval is enabled and what safety gates are required.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Optional project path to check against connected live sessions.' },
      },
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      const sessions = manager.listSessions(args.projectPath);
      return jsonResponse({
        status: 'success',
        eval: {
          enabled: evalConfig.enabled,
          reason: evalConfig.enabled ? 'Eval is explicitly enabled by MCP config.' : 'Eval is disabled by default. Set GODOT_MCP_ENABLE_EVAL=true in MCP config to expose eval tools.',
          tools_registered: evalConfig.enabled ? ['game_eval', 'editor_eval'] : [],
          loopback_required: true,
          approval_token_required: Boolean(evalConfig.approvalToken),
          configured_project_path: evalConfig.projectPath ? normalizeProjectPath(evalConfig.projectPath) : null,
          audit_log_path: evalConfig.auditLogPath,
        },
        sessions: sessions.map(serializeSession),
      });
    },
  };
}

function evalTool(manager: LiveSessionManager, evalConfig: LiveEvalConfig, toolName: 'game_eval' | 'editor_eval', description: string): ToolDefinition {
  return {
    name: toolName,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Specific live editor session ID to target.' },
        project_path: { type: 'string', description: 'Required project path gate for the target live session.' },
        timeout_ms: { type: 'number', description: 'Command timeout in milliseconds.' },
        code: { type: 'string', description: 'Godot Expression text to evaluate.' },
        reason: { type: 'string', description: 'Caller-visible reason for this eval request. Written to the audit log.' },
        approval_token: { type: 'string', description: 'Optional per-session approval token when MCP config requires one.' },
      },
      required: ['code', 'reason'],
    },
    timeout: 10000,
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      const code = String(args.code ?? '');
      const callerReason = String(args.reason ?? '');
      const auditBase = {
        tool: toolName,
        session_id: args.sessionId ?? null,
        project_path: args.projectPath ? normalizeProjectPath(args.projectPath) : null,
        code_hash: hashCode(code),
        code_length: code.length,
        caller_reason: callerReason,
      };

      if (!evalConfig.enabled) {
        await writeEvalAudit(evalConfig, { ...auditBase, decision: 'refused', reason: 'eval_disabled' });
        return failure('eval_disabled');
      }
      if (code.trim() === '') {
        await writeEvalAudit(evalConfig, { ...auditBase, decision: 'refused', reason: 'eval_code_required' });
        return failure('eval_code_required');
      }
      if (callerReason.trim() === '') {
        await writeEvalAudit(evalConfig, { ...auditBase, decision: 'refused', reason: 'eval_reason_required' });
        return failure('eval_reason_required');
      }
      if (evalConfig.approvalToken && String(args.approvalToken ?? args.approval_token ?? '') !== evalConfig.approvalToken) {
        await writeEvalAudit(evalConfig, { ...auditBase, decision: 'refused', reason: 'eval_approval_token_mismatch' });
        return failure('eval_approval_token_mismatch');
      }

      let session: LiveSessionRecord;
      try {
        session = manager.resolveTargetSession({
          sessionId: args.sessionId,
          projectPath: args.projectPath,
        });
      } catch (error: any) {
        await writeEvalAudit(evalConfig, { ...auditBase, decision: 'refused', reason: 'eval_session_unavailable', detail: error?.message || String(error) });
        return failure('eval_session_unavailable');
      }

      if (!isLoopbackAddress(session.remoteAddress)) {
        await writeEvalAudit(evalConfig, { ...auditBase, session_id: session.sessionId, decision: 'refused', reason: 'eval_requires_loopback', remote_address: session.remoteAddress });
        return failure('eval_requires_loopback');
      }

      if (evalConfig.projectPath && session.projectPath !== normalizeProjectPath(evalConfig.projectPath)) {
        await writeEvalAudit(evalConfig, { ...auditBase, session_id: session.sessionId, decision: 'refused', reason: 'eval_project_path_not_allowed', session_project_path: session.projectPath });
        return failure('eval_project_path_not_allowed');
      }

      await writeEvalAudit(evalConfig, { ...auditBase, session_id: session.sessionId, decision: 'accepted', reason: 'accepted' });
      try {
        const outboundArgs = commandArgs(args);
        delete outboundArgs.approval_token;
        delete outboundArgs.approvalToken;
        const result = await manager.sendCommand(toolName, outboundArgs, {
          sessionId: session.sessionId,
          projectPath: session.projectPath,
          timeoutMs: args.timeoutMs || 10000,
        });
        return jsonResponse(serializeCommandResult(result));
      } catch (error: any) {
        await writeEvalAudit(evalConfig, { ...auditBase, session_id: session.sessionId, decision: 'failed', reason: 'eval_command_failed', detail: error?.message || String(error) });
        return failure(error?.message || String(error));
      }
    },
  };
}

function editorState(manager: LiveSessionManager): ToolDefinition {
  return liveCommandTool(manager, {
    name: 'editor_state',
    command: 'editor_state',
    description: 'Read the current live Godot editor state, including active scene, selected nodes, open scenes, play state, and writable status.',
  });
}

function liveCommandTool(manager: LiveSessionManager, config: LiveToolConfig): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Specific live editor session ID to target.' },
        project_path: { type: 'string', description: 'Only target a session for this project path.' },
        timeout_ms: { type: 'number', description: 'Command timeout in milliseconds.' },
        ...(config.properties || {}),
      },
      required: config.required,
    },
    timeout: config.timeout || 30000,
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      try {
        const result = await manager.sendCommand(config.command, commandArgs(args), {
          sessionId: args.sessionId,
          projectPath: args.projectPath,
          timeoutMs: args.timeoutMs || config.timeout,
        });
        return jsonResponse(serializeCommandResult(result));
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function sessionList(manager: LiveSessionManager, getTransportStatus?: () => Record<string, unknown>): ToolDefinition {
  return {
    name: 'session_list',
    description: 'List connected Godot editor live sessions tracked by the MCP-side session manager.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
      },
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      const sessions = manager.listSessions(args.projectPath);
      return jsonResponse({
        status: 'success',
        count: sessions.length,
        active_session_id: manager.getActiveSessionId(),
        transport: getTransportStatus ? getTransportStatus() : undefined,
        sessions: sessions.map(serializeSession),
      });
    },
  };
}

function sessionActivate(manager: LiveSessionManager): ToolDefinition {
  return {
    name: 'session_activate',
    description: 'Select the active Godot editor live session by session ID or project path.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        project_path: { type: 'string' },
      },
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      try {
        const session = manager.activateSession({
          sessionId: args.sessionId,
          projectPath: args.projectPath,
        });
        return jsonResponse({
          status: 'success',
          active_session_id: session.sessionId,
          session: serializeSession(session),
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function sessionDisconnect(manager: LiveSessionManager): ToolDefinition {
  return {
    name: 'session_disconnect',
    description: 'Disconnect a Godot editor live session and remove it from the MCP session table.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
      },
    },
    handler: async (rawArgs: any) => {
      const args = normalizeArgs(rawArgs || {});
      try {
        const session = manager.disconnectSession(args.sessionId);
        return jsonResponse({
          status: 'success',
          disconnected_session_id: session.sessionId,
          session: serializeSession(session),
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function serializeCommandResult(result: LiveCommandResult): Record<string, unknown> {
  return {
    status: result.status,
    request_id: result.requestId,
    session: result.session ? serializeSession(result.session) : null,
    data: result.data ?? {},
  };
}

function serializeSession(session: LiveSessionRecord): Record<string, unknown> {
  return {
    session_id: session.sessionId,
    project_path: session.projectPath,
    godot_version: session.godotVersion,
    protocol_version: session.protocolVersion,
    addon_version: session.addonVersion,
    compatibility: session.compatibility,
    editor_pid: session.editorPid,
    active_scene: session.activeScene,
    play_state: session.playState,
    writable: session.writable,
    connection_state: session.connectionState,
    last_heartbeat_unix: session.lastHeartbeatUnix,
    last_error: session.lastError,
    last_seen_ms: session.lastSeenMs,
    connected_at_ms: session.connectedAtMs,
    stale: session.stale,
    remote_address: session.remoteAddress,
    runtime_status: session.runtimeStatus ?? null,
  };
}

function normalizeArgs(args: any): any {
  const projectPath = args.projectPath ?? args.project_path;
  return {
    ...args,
    sessionId: args.sessionId ?? args.session_id,
    projectPath,
    normalizedProjectPath: projectPath ? normalizeProjectPath(projectPath) : undefined,
    timeoutMs: args.timeoutMs ?? args.timeout_ms,
  };
}

function commandArgs(args: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    if (['session_id', 'sessionId', 'project_path', 'projectPath', 'normalizedProjectPath', 'timeout_ms', 'timeoutMs'].includes(key)) {
      continue;
    }
    result[key] = value;
  }
  if (args.normalizedProjectPath) {
    result.project_path = args.normalizedProjectPath;
  }
  return result;
}

function resolveEvalConfig(overrides: Partial<LiveEvalConfig> = {}): LiveEvalConfig {
  const enabled = overrides.enabled ?? ['1', 'true', 'yes', 'on'].includes(String(process.env.GODOT_MCP_ENABLE_EVAL || '').toLowerCase());
  const approvalToken = overrides.approvalToken ?? process.env.GODOT_MCP_EVAL_APPROVAL_TOKEN;
  const projectPath = overrides.projectPath ?? process.env.GODOT_MCP_EVAL_PROJECT_PATH;
  const auditLogPath = overrides.auditLogPath ?? process.env.GODOT_MCP_EVAL_AUDIT_LOG ?? join(process.cwd(), '.mcp_logs', 'live_eval_audit.jsonl');
  return {
    enabled,
    approvalToken: approvalToken || undefined,
    projectPath: projectPath || undefined,
    auditLogPath,
  };
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function isLoopbackAddress(remoteAddress: string | null | undefined): boolean {
  if (!remoteAddress) return false;
  const normalized = remoteAddress.toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1' || normalized === 'localhost';
}

async function writeEvalAudit(evalConfig: LiveEvalConfig, entry: Record<string, unknown>): Promise<void> {
  const payload = {
    timestamp_unix_ms: Date.now(),
    ...entry,
  };
  await mkdir(dirname(evalConfig.auditLogPath), { recursive: true });
  await appendFile(evalConfig.auditLogPath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function failure(reason: string): ToolResponse {
  return jsonResponse({ status: 'failed', reason }, true);
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
