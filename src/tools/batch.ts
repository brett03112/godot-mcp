/**
 * Batch execution tools for safer multi-step Godot project edits.
 *
 * batch_execute coordinates existing MCP tools, snapshots likely touched
 * project files, and can restore those snapshots if a later command fails.
 */

import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

type BatchCommand = {
  tool?: string;
  name?: string;
  args?: Record<string, any>;
  declaredTouchedPaths?: string[];
  declared_touched_paths?: string[];
};

type Snapshot = {
  absolutePath: string;
  relativePath: string;
  existed: boolean;
  content?: Buffer;
};

const SNAPSHOT_EXTENSIONS = new Set(['.tscn', '.gd', '.tres', '.res', '.import']);
const SNAPSHOT_FILENAMES = new Set(['project.godot', 'export_presets.cfg']);
const DEFAULT_MAX_COMMANDS = 25;
const DEFAULT_BATCH_TIMEOUT_MS = 120000;

export function registerBatchTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.register(batchExecute(registry, ctx));
}

function batchExecute(registry: ToolRegistry, ctx: ServerContext): ToolDefinition {
  return {
    name: 'batch_execute',
    description: 'Execute multiple MCP tool calls as a project-scoped batch with dry-run, conservative file snapshots, and optional rollback on failure.',
    timeout: DEFAULT_BATCH_TIMEOUT_MS,
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory.',
        },
        commands: {
          type: 'array',
          description: 'Tool calls to execute in order. Each item uses { tool, args, declared_touched_paths? }.',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string' },
              args: { type: 'object' },
              declared_touched_paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional project-relative paths this command may touch.',
              },
            },
            required: ['tool'],
          },
        },
        rollback_on_error: {
          type: 'boolean',
          description: 'Restore snapshots when a command fails. Default: false.',
        },
        dry_run: {
          type: 'boolean',
          description: 'Report planned commands and snapshots without dispatching child tools. Default: false.',
        },
        continue_on_error: {
          type: 'boolean',
          description: 'Continue dispatching after failures when rollback is disabled. Default: false.',
        },
        max_commands: {
          type: 'number',
          description: `Maximum allowed command count. Default: ${DEFAULT_MAX_COMMANDS}.`,
        },
        timeout_ms: {
          type: 'number',
          description: 'Reserved per-batch timeout hint for callers. Registry-level timeout still applies.',
        },
        allow_recursive_batch: {
          type: 'boolean',
          description: 'Allow child batch_execute calls. Default: false.',
        },
      },
      required: ['project_path', 'commands'],
    },
    handler: async (rawArgs: any) => {
      const args = normalizeBatchArgs(ctx.normalizeParameters(rawArgs || {}));
      const warnings: string[] = [];
      const commandResults: any[] = [];
      const snapshots = new Map<string, Snapshot>();

      if (!args.projectPath || !Array.isArray(args.commands)) {
        return jsonResponse({
          status: 'failed',
          executed_count: 0,
          failed_command_index: null,
          rollback_status: 'not_requested',
          commands: [],
          snapshots: [],
          warnings: ['project_path and commands[] are required'],
        }, true);
      }

      if (!ctx.validatePath(args.projectPath)) {
        return jsonResponse({
          status: 'failed',
          executed_count: 0,
          failed_command_index: null,
          rollback_status: 'not_requested',
          commands: [],
          snapshots: [],
          warnings: ['Invalid project_path'],
        }, true);
      }

      const projectRoot = resolve(args.projectPath);
      const projectFile = resolve(projectRoot, 'project.godot');
      if (!existsSync(projectFile)) {
        return jsonResponse({
          status: 'failed',
          executed_count: 0,
          failed_command_index: null,
          rollback_status: 'not_requested',
          commands: [],
          snapshots: [],
          warnings: [`Invalid project_path: ${args.projectPath} does not contain project.godot`],
        }, true);
      }

      const maxCommands = Number.isInteger(args.maxCommands) && args.maxCommands > 0
        ? args.maxCommands
        : DEFAULT_MAX_COMMANDS;

      if (args.commands.length > maxCommands) {
        return jsonResponse({
          status: 'failed',
          executed_count: 0,
          failed_command_index: null,
          rollback_status: 'not_requested',
          commands: [],
          snapshots: [],
          warnings: [`Command count ${args.commands.length} exceeds max_commands ${maxCommands}`],
        }, true);
      }

      if (args.rollbackOnError && args.continueOnError) {
        warnings.push('continue_on_error is ignored when rollback_on_error is true');
      }

      try {
        for (let index = 0; index < args.commands.length; index += 1) {
          const command = normalizeCommand(ctx.normalizeParameters(args.commands[index] || {}));
          const toolName = command.tool || command.name;

          if (!toolName) {
            return failureResponse({
              commandResults,
              failedIndex: index,
              error: 'Command tool is required',
              rollbackStatus: await maybeRollback(args.rollbackOnError, snapshots),
              snapshots,
              warnings,
            });
          }

          if (toolName === 'batch_execute' && !args.allowRecursiveBatch) {
            return failureResponse({
              commandResults,
              failedIndex: index,
              toolName,
              error: 'Recursive batch_execute calls are disabled by default',
              rollbackStatus: await maybeRollback(args.rollbackOnError, snapshots),
              snapshots,
              warnings,
            });
          }

          const commandTouchedPaths = collectTouchedPaths(projectRoot, command, command.args || {}, warnings);
          await snapshotPaths(commandTouchedPaths, snapshots);

          if (args.dryRun) {
            commandResults.push({
              index,
              tool: toolName,
              status: 'planned',
              touched_paths: commandTouchedPaths.map((snapshot) => snapshot.relativePath),
            });
            continue;
          }

          let result: ToolResponse;
          try {
            result = await registry.dispatch(toolName, command.args || {});
          } catch (error: any) {
            const errorMessage = error?.message || String(error);
            commandResults.push({
              index,
              tool: toolName,
              status: 'failed',
              error: errorMessage,
            });

            if (args.rollbackOnError || !args.continueOnError) {
              const rollbackStatus = await maybeRollback(args.rollbackOnError, snapshots);
              return failedBatch(commandResults, snapshots, warnings, index, rollbackStatus);
            }
            continue;
          }

          const childErrorText = result.isError ? extractResponseText(result) : undefined;
          commandResults.push({
            index,
            tool: toolName,
            status: result.isError ? 'failed' : 'success',
            result: result.isError ? undefined : result.content,
            error: childErrorText,
          });

          if (result.isError) {
            if (args.rollbackOnError || !args.continueOnError) {
              const rollbackStatus = await maybeRollback(args.rollbackOnError, snapshots);
              return failedBatch(commandResults, snapshots, warnings, index, rollbackStatus);
            }
          }
        }

        if (args.dryRun) {
          return jsonResponse({
            status: 'dry_run',
            executed_count: 0,
            failed_command_index: null,
            rollback_status: 'not_requested',
            commands: commandResults,
            snapshots: serializeSnapshots(snapshots),
            warnings,
          });
        }

        const failedIndex = commandResults.find((command) => command.status === 'failed')?.index ?? null;
        return jsonResponse({
          status: failedIndex === null ? 'success' : 'failed',
          executed_count: commandResults.filter((command) => command.status === 'success').length,
          failed_command_index: failedIndex,
          rollback_status: 'not_requested',
          commands: commandResults,
          snapshots: serializeSnapshots(snapshots),
          warnings,
        }, failedIndex !== null);
      } catch (error: any) {
        const rollbackStatus = await maybeRollback(args.rollbackOnError, snapshots);
        return jsonResponse({
          status: 'failed',
          executed_count: commandResults.filter((command) => command.status === 'success').length,
          failed_command_index: null,
          rollback_status: rollbackStatus,
          commands: commandResults,
          snapshots: serializeSnapshots(snapshots),
          warnings: [...warnings, error?.message || String(error)],
        }, true);
      }
    },
  };
}

function normalizeBatchArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    rollbackOnError: args.rollbackOnError ?? args.rollback_on_error ?? false,
    dryRun: args.dryRun ?? args.dry_run ?? false,
    continueOnError: args.continueOnError ?? args.continue_on_error ?? false,
    maxCommands: args.maxCommands ?? args.max_commands,
    timeoutMs: args.timeoutMs ?? args.timeout_ms,
    allowRecursiveBatch: args.allowRecursiveBatch ?? args.allow_recursive_batch ?? false,
  };
}

function normalizeCommand(command: any): BatchCommand {
  return {
    ...command,
    declaredTouchedPaths: command.declaredTouchedPaths ?? command.declared_touched_paths,
  };
}

function collectTouchedPaths(
  projectRoot: string,
  command: BatchCommand,
  commandArgs: Record<string, any>,
  warnings: string[]
): Snapshot[] {
  const candidates = new Set<string>();

  for (const declared of command.declaredTouchedPaths || []) {
    candidates.add(declared);
  }

  collectPathLikeValues(commandArgs, candidates);

  const snapshots: Snapshot[] = [];
  for (const candidate of candidates) {
    const resolved = resolveProjectPath(projectRoot, candidate);
    if (!resolved) {
      continue;
    }

    const relativePath = normalizeRelative(projectRoot, resolved);
    if (!relativePath) {
      warnings.push(`Skipped touched path outside project: ${candidate}`);
      continue;
    }

    if (!isSnapshotEligible(relativePath)) {
      continue;
    }

    snapshots.push({
      absolutePath: resolved,
      relativePath,
      existed: existsSync(resolved),
    });
  }

  return dedupeSnapshots(snapshots);
}

function collectPathLikeValues(value: any, candidates: Set<string>, key = ''): void {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPathLikeValues(item, candidates, key);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      collectPathLikeValues(childValue, candidates, childKey);
    }
    return;
  }

  if (typeof value !== 'string' || key === 'projectPath' || key === 'project_path') {
    return;
  }

  const lowerKey = key.toLowerCase();
  if (lowerKey.includes('path') || lowerKey.includes('file')) {
    candidates.add(value);
  }
}

function resolveProjectPath(projectRoot: string, candidate: string): string | null {
  if (!candidate || candidate.startsWith('uid://')) {
    return null;
  }

  const localPath = candidate.startsWith('res://') ? candidate.slice('res://'.length) : candidate;
  return isAbsolute(localPath) ? resolve(localPath) : resolve(projectRoot, localPath);
}

function normalizeRelative(projectRoot: string, absolutePath: string): string | null {
  const relativePath = relative(projectRoot, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || relativePath.includes(`..${sep}`) || isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.replace(/\\/g, '/');
}

function isSnapshotEligible(relativePath: string): boolean {
  const fileName = relativePath.split('/').pop() || relativePath;
  return SNAPSHOT_FILENAMES.has(fileName) || SNAPSHOT_EXTENSIONS.has(extname(fileName));
}

function dedupeSnapshots(snapshots: Snapshot[]): Snapshot[] {
  const byPath = new Map<string, Snapshot>();
  for (const snapshot of snapshots) {
    byPath.set(snapshot.absolutePath, snapshot);
  }
  return Array.from(byPath.values());
}

async function snapshotPaths(paths: Snapshot[], snapshots: Map<string, Snapshot>): Promise<void> {
  for (const snapshot of paths) {
    if (snapshots.has(snapshot.absolutePath)) {
      continue;
    }

    const content = snapshot.existed ? await readFile(snapshot.absolutePath) : undefined;
    snapshots.set(snapshot.absolutePath, {
      ...snapshot,
      content,
    });
  }
}

async function maybeRollback(rollbackOnError: boolean, snapshots: Map<string, Snapshot>): Promise<string> {
  if (!rollbackOnError) {
    return 'not_requested';
  }

  try {
    for (const snapshot of Array.from(snapshots.values()).reverse()) {
      if (snapshot.existed) {
        await mkdir(dirname(snapshot.absolutePath), { recursive: true });
        await writeFile(snapshot.absolutePath, snapshot.content || Buffer.alloc(0));
      } else if (existsSync(snapshot.absolutePath)) {
        await rm(snapshot.absolutePath, { force: true });
      }
    }
    return 'restored';
  } catch (error: any) {
    return `failed: ${error?.message || String(error)}`;
  }
}

function failureResponse(params: {
  commandResults: any[];
  failedIndex: number;
  toolName?: string;
  error: string;
  rollbackStatus: string;
  snapshots: Map<string, Snapshot>;
  warnings: string[];
}): ToolResponse {
  params.commandResults.push({
    index: params.failedIndex,
    tool: params.toolName,
    status: 'failed',
    error: params.error,
  });
  return failedBatch(
    params.commandResults,
    params.snapshots,
    params.warnings,
    params.failedIndex,
    params.rollbackStatus
  );
}

function failedBatch(
  commandResults: any[],
  snapshots: Map<string, Snapshot>,
  warnings: string[],
  failedIndex: number,
  rollbackStatus: string
): ToolResponse {
  return jsonResponse({
    status: 'failed',
    executed_count: commandResults.filter((command) => command.status === 'success').length,
    failed_command_index: failedIndex,
    rollback_status: rollbackStatus,
    commands: commandResults,
    snapshots: serializeSnapshots(snapshots),
    warnings,
  }, true);
}

function serializeSnapshots(snapshots: Map<string, Snapshot>): any[] {
  return Array.from(snapshots.values()).map((snapshot) => ({
    relative_path: snapshot.relativePath,
    existed: snapshot.existed,
    bytes: snapshot.content?.byteLength ?? 0,
  }));
}

function extractResponseText(response: ToolResponse): string {
  return response.content.map((item) => item.text).join('\n');
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) {
    response.isError = true;
  }
  return response;
}
