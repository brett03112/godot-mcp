/**
 * Networking & Multiplayer Tools (Tier 13)
 *
 * Set up ENet/WebSocket multiplayer peers, configure RPCs,
 * and manage MultiplayerSpawner/MultiplayerSynchronizer nodes.
 *
 * Tools:
 *   - setup_multiplayer_peer   Create and configure an ENet/WebSocket peer helper (server/client)
 *   - configure_rpc            Register @rpc method settings on a node
 *   - manage_multiplayer_spawner  Add/configure MultiplayerSpawner and MultiplayerSynchronizer
 */

import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString } from '../utils/validation.js';

export function registerNetworkingTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    setupMultiplayerPeer(ctx),
    configureRpc(ctx),
    manageMultiplayerSpawner(ctx),
  ]);
}

// ─── Valid peer types ─────────────────────────────────────────────────────────

const VALID_PEER_TYPES = ['enet', 'websocket'] as const;
const VALID_MODES = ['server', 'client'] as const;
const VALID_RPC_MODES = ['any_peer', 'authority'] as const;
const VALID_TRANSFER_MODES = ['unreliable', 'unreliable_ordered', 'reliable'] as const;

// ─── setup_multiplayer_peer ──────────────────────────────────────────────────

function setupMultiplayerPeer(ctx: ServerContext): ToolDefinition {
  return {
    name: 'setup_multiplayer_peer',
    description: 'Create and configure a multiplayer peer (ENet or WebSocket) for a Godot project. Adds a runtime helper node that sets up the MultiplayerAPI when the scene enters the tree.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        scene_path: {
          type: 'string',
          description: 'Relative path to the scene file to configure multiplayer in (e.g., "scenes/main.tscn"). If omitted, configures project-level settings only.',
        },
        peer_type: {
          type: 'string',
          enum: VALID_PEER_TYPES,
          description: 'Multiplayer peer type: "enet" (UDP, low-latency) or "websocket" (TCP, web-compatible). WebRTC requires signaling and is not configured by this helper.',
        },
        mode: {
          type: 'string',
          enum: VALID_MODES,
          description: 'Run as "server" (listens for connections) or "client" (connects to server)',
        },
        port: {
          type: 'number',
          description: 'Port number for the server to listen on or client to connect to (default: 10567)',
        },
        address: {
          type: 'string',
          description: 'Server address for client mode (e.g., "127.0.0.1" or "localhost"). Only used in client mode.',
        },
        max_clients: {
          type: 'number',
          description: 'Maximum number of concurrent clients (server mode, default: 32)',
        },
        server_url: {
          type: 'string',
          description: 'WebSocket server URL (e.g., "ws://localhost:10567"). Only used with peer_type "websocket" in client mode.',
        },
        network_node_path: {
          type: 'string',
          description: 'Path to the node that will host the multiplayer peer (default: "." for root). The node must be a Node-derived type.',
        },
      },
      required: ['project_path', 'scene_path', 'peer_type', 'mode'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
        requiredString('peerType', 'peer_type'),
        requiredString('mode', 'mode'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const scenePath = args.scenePath as string;
      const peerType = (args.peerType as string).toLowerCase();
      const mode = (args.mode as string).toLowerCase();

      if (!VALID_PEER_TYPES.includes(peerType as any)) {
        return ctx.createErrorResponse(
          `Invalid peer type: '${peerType}'`,
          [`Valid types: ${VALID_PEER_TYPES.join(', ')}`]
        );
      }
      if (!VALID_MODES.includes(mode as any)) {
        return ctx.createErrorResponse(
          `Invalid mode: '${mode}'`,
          [`Valid modes: ${VALID_MODES.join(', ')}`]
        );
      }

      const port = args.port || 10567;
      const address = args.address || '127.0.0.1';
      const maxClients = args.maxClients || 32;
      const networkNodePath = args.networkNodePath || '.';

      try {
        const result = await ctx.executeOperation('setup_multiplayer_peer', {
          scene_path: scenePath,
          peer_type: peerType,
          mode,
          port,
          address,
          max_clients: maxClients,
          server_url: args.serverUrl || `ws://localhost:${port}`,
          network_node_path: networkNodePath,
        }, projectDir);

        const lines = result.stdout.replace(/\r\n/g, '\n').trim().split('\n');
        const jsonLine = lines.find(l => l.trimStart().startsWith('{'));
        if (!jsonLine) {
          return ctx.createErrorResponse(
            'Failed to setup multiplayer peer',
            [`Godot output: ${result.stderr || result.stdout}`]
          );
        }

        const data = JSON.parse(jsonLine.trim());
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return ctx.createErrorResponse(
          `Failed to setup multiplayer peer: ${err.message}`,
          ['Ensure Godot is installed', 'Check that the scene path is valid', 'Verify port is not in use']
        );
      }
    },
  };
}

// ─── configure_rpc ──────────────────────────────────────────────────────────

function configureRpc(ctx: ServerContext): ToolDefinition {
  return {
    name: 'configure_rpc',
    description: 'Register RPC (Remote Procedure Call) method configurations on a node for networking. Sets up @rpc annotations with call mode, channel, and transfer settings.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the scene file containing the target node' },
        node_path: { type: 'string', description: 'Path to the node in the scene (e.g., "Player", "Enemies/Enemy1")' },
        method_name: { type: 'string', description: 'Name of the RPC method (e.g., "sync_position", "broadcast_chat")' },
        call_mode: {
          type: 'string',
          enum: VALID_RPC_MODES,
          description: 'Call mode: "any_peer" (any peer can call), "authority" (only the multiplayer authority)',
        },
        transfer_mode: {
          type: 'string',
          enum: VALID_TRANSFER_MODES,
          description: 'Transfer mode: "unreliable" (UDP-like), "unreliable_ordered" (sequenced UDP), "reliable" (TCP-like)',
        },
        channel: {
          type: 'number',
          description: 'RPC channel number (0-255, default: 0). Different channels are ordered independently.',
        },
        sync: {
          type: 'boolean',
          description: 'Whether the RPC should synchronize (true) or be asynchronous (false). Default: true for reliable, false for unreliable.',
        },
      },
      required: ['project_path', 'scene_path', 'node_path', 'method_name', 'call_mode'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
        requiredString('nodePath', 'node_path'),
        requiredString('methodName', 'method_name'),
        requiredString('callMode', 'call_mode'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const callMode = (args.callMode as string).toLowerCase();
      const transferMode = (args.transferMode || 'reliable').toLowerCase();
      const channel = args.channel ?? 0;

      if (!VALID_RPC_MODES.includes(callMode as any)) {
        return ctx.createErrorResponse(`Invalid call mode: '${callMode}'`, [`Valid: ${VALID_RPC_MODES.join(', ')}`]);
      }
      if (!VALID_TRANSFER_MODES.includes(transferMode as any)) {
        return ctx.createErrorResponse(`Invalid transfer mode: '${transferMode}'`, [`Valid: ${VALID_TRANSFER_MODES.join(', ')}`]);
      }
      if (channel < 0 || channel > 255) {
        return ctx.createErrorResponse('Channel must be between 0 and 255');
      }

      const sync = args.sync ?? (transferMode === 'reliable');

      try {
        const result = await ctx.executeOperation('configure_rpc', {
          scene_path: args.scenePath,
          node_path: args.nodePath,
          method_name: args.methodName,
          call_mode: callMode,
          transfer_mode: transferMode,
          channel,
          sync,
        }, projectDir);

        const lines = result.stdout.replace(/\r\n/g, '\n').trim().split('\n');
        const jsonLine = lines.find(l => l.trimStart().startsWith('{'));
        if (!jsonLine) {
          return ctx.createErrorResponse('Failed to configure RPC', [`Godot output: ${result.stderr || result.stdout}`]);
        }
        return { content: [{ type: 'text', text: JSON.stringify(JSON.parse(jsonLine.trim()), null, 2) }] };
      } catch (err: any) {
        return ctx.createErrorResponse(
          `Failed to configure RPC: ${err.message}`,
          ['Ensure node has a script attached', 'Check that the node path is valid']
        );
      }
    },
  };
}

// ─── manage_multiplayer_spawner ─────────────────────────────────────────────

function manageMultiplayerSpawner(ctx: ServerContext): ToolDefinition {
  return {
    name: 'manage_multiplayer_spawner',
    description: 'Add or configure a MultiplayerSpawner and MultiplayerSynchronizer to a scene for automated networked object spawning and state synchronization.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        scene_path: { type: 'string', description: 'Relative path to the scene file' },
        parent_path: { type: 'string', description: 'Path to the parent node (default: "." for root)' },
        action: {
          type: 'string',
          enum: ['add_spawner', 'add_synchronizer', 'configure_spawner', 'configure_synchronizer', 'add_both'],
          description: 'What to do: "add_spawner", "add_synchronizer", "configure_spawner", "configure_synchronizer", or "add_both"',
        },
        spawn_path: { type: 'string', description: 'Path to scene (.tscn) that should be spawned (e.g., "res://scenes/bullet.tscn")' },
        spawn_limit: { type: 'number', description: 'Maximum number of spawned nodes (default: 0 = unlimited)' },
        spawn_function: { type: 'string', description: 'Custom spawn function name' },
        sync_properties: {
          type: 'array', items: { type: 'string' },
          description: 'Array of property names to synchronize (e.g., ["position", "rotation", "health"])',
        },
        sync_interval: { type: 'number', description: 'Sync interval in seconds (default: 0 = every frame)' },
        visibility_sync: { type: 'boolean', description: 'Sync node visibility (default: false)' },
        visibility_update_only: { type: 'boolean', description: 'Only update visibility (default: false)' },
        replication_interval: { type: 'number', description: 'Replication interval in seconds (default: 0 = every frame)' },
      },
      required: ['project_path', 'scene_path', 'action'],
    },
    timeout: 30000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scenePath', 'scene_path'),
        requiredString('action', 'action'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const action = (args.action as string).toLowerCase();
      const validActions = ['add_spawner', 'add_synchronizer', 'configure_spawner', 'configure_synchronizer', 'add_both'];
      if (!validActions.includes(action)) {
        return ctx.createErrorResponse(`Invalid action: '${action}'`, [`Valid: ${validActions.join(', ')}`]);
      }

      try {
        const result = await ctx.executeOperation('manage_multiplayer_spawner', {
          scene_path: args.scenePath,
          parent_path: args.parentPath || '.',
          action,
          spawn_path: args.spawnPath || '',
          spawn_limit: args.spawnLimit ?? 0,
          spawn_function: args.spawnFunction || '',
          sync_properties: args.syncProperties || [],
          sync_interval: args.syncInterval ?? 0,
          visibility_sync: args.visibilitySync ?? false,
          visibility_update_only: args.visibilityUpdateOnly ?? false,
          replication_interval: args.replicationInterval ?? 0,
        }, projectDir);

        const lines = result.stdout.replace(/\r\n/g, '\n').trim().split('\n');
        const jsonLine = lines.find(l => l.trimStart().startsWith('{'));
        if (!jsonLine) {
          return ctx.createErrorResponse('Failed to manage multiplayer spawner', [`Godot output: ${result.stderr || result.stdout}`]);
        }
        return { content: [{ type: 'text', text: JSON.stringify(JSON.parse(jsonLine.trim()), null, 2) }] };
      } catch (err: any) {
        return ctx.createErrorResponse(
          `Failed to manage multiplayer spawner: ${err.message}`,
          ['Ensure Godot is installed', 'Check that the scene path is valid']
        );
      }
    },
  };
}
