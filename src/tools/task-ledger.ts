/**
 * Project-local task ledger, evidence, report, and changelog tools for Phase 4.9.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'closed';

interface ResolvedProject {
  projectRoot: string;
}

interface ResolvedFile {
  absolutePath: string;
  relativePath: string;
}

interface LedgerNote {
  text: string;
  created_at: string;
}

interface LedgerTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  assignee: string | null;
  tags: string[];
  source: string | null;
  related_files: string[];
  recommendations: string[];
  evidence_ids: string[];
  notes: LedgerNote[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
  resolution?: string;
  closed_summary?: string;
}

interface LedgerEvidence {
  id: string;
  task_id: string | null;
  kind: string;
  title: string;
  summary: string;
  source_path: string | null;
  stored_path: string | null;
  content_preview: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface TaskLedger {
  schema_version: 1;
  next_task_number: number;
  next_evidence_number: number;
  updated_at: string;
  tasks: LedgerTask[];
  evidence: LedgerEvidence[];
}

const LEDGER_PATH = '.godot-mcp/task-ledger.json';
const EVIDENCE_DIR = '.godot-mcp/evidence';

export function registerTaskLedgerTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    mcpTaskCreate(ctx),
    mcpTaskUpdate(ctx),
    mcpTaskList(ctx),
    mcpTaskClose(ctx),
    mcpEvidenceAttach(ctx),
    mcpSessionReport(ctx),
    mcpChangelogDraft(ctx),
  ]);
}

function mcpTaskCreate(ctx: ServerContext): ToolDefinition {
  return {
    name: 'mcp_task_create',
    description: 'Create a project-local MCP task in .godot-mcp/task-ledger.json.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        assignee: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        related_files: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'title'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      if (!stringValue(args.title)) return failure('title is required');

      const ledger = loadLedger(project.projectRoot);
      if ('error' in ledger) return failure(ledger.error);
      const now = new Date().toISOString();
      const task: LedgerTask = {
        id: nextTaskId(ledger),
        title: stringValue(args.title),
        description: stringValue(args.description),
        status: normalizeStatus(args.status, 'open'),
        priority: stringValue(args.priority) || 'normal',
        assignee: stringValue(args.assignee) || null,
        tags: arrayOfStrings(args.tags),
        source: stringValue(args.source) || null,
        related_files: normalizeProjectPaths(args.relatedFiles),
        recommendations: arrayOfStrings(args.recommendations),
        evidence_ids: [],
        notes: [],
        created_at: now,
        updated_at: now,
      };
      if (task.status === 'closed') task.closed_at = now;
      ledger.tasks.push(task);
      ledger.next_task_number += 1;
      ledger.updated_at = now;
      if (!args.dryRun) saveLedger(project.projectRoot, ledger);

      return jsonResponse({
        status: 'success',
        dry_run: Boolean(args.dryRun),
        ledger_path: LEDGER_PATH,
        task,
      });
    },
  };
}

function mcpTaskUpdate(ctx: ServerContext): ToolDefinition {
  return {
    name: 'mcp_task_update',
    description: 'Update a project-local MCP task, append notes, and add related files or recommendations.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        task_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        assignee: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        related_files: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
        append_notes: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        add_related_files: { type: 'array', items: { type: 'string' } },
        add_recommendations: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'task_id'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const ledger = loadLedger(project.projectRoot);
      if ('error' in ledger) return failure(ledger.error);
      const task = findTask(ledger, args.taskId);
      if (!task) return failure(`task not found: ${args.taskId || ''}`);

      const now = new Date().toISOString();
      if (args.title !== undefined) task.title = stringValue(args.title);
      if (args.description !== undefined) task.description = stringValue(args.description);
      if (args.status !== undefined) {
        task.status = normalizeStatus(args.status, task.status);
        if (task.status === 'closed' && !task.closed_at) task.closed_at = now;
      }
      if (args.priority !== undefined) task.priority = stringValue(args.priority) || 'normal';
      if (args.assignee !== undefined) task.assignee = stringValue(args.assignee) || null;
      if (args.tags !== undefined) task.tags = arrayOfStrings(args.tags);
      if (args.relatedFiles !== undefined) task.related_files = normalizeProjectPaths(args.relatedFiles);
      if (args.recommendations !== undefined) task.recommendations = arrayOfStrings(args.recommendations);
      task.related_files = uniqueStrings([
        ...task.related_files,
        ...normalizeProjectPaths(args.addRelatedFiles),
      ]);
      task.recommendations = uniqueStrings([
        ...task.recommendations,
        ...arrayOfStrings(args.addRecommendations),
      ]);
      for (const note of arrayOfStrings(singleOrArray(args.appendNotes))) {
        task.notes.push({ text: note, created_at: now });
      }
      task.updated_at = now;
      ledger.updated_at = now;
      if (!args.dryRun) saveLedger(project.projectRoot, ledger);

      return jsonResponse({
        status: 'success',
        dry_run: Boolean(args.dryRun),
        ledger_path: LEDGER_PATH,
        task,
      });
    },
  };
}

function mcpTaskList(ctx: ServerContext): ToolDefinition {
  return {
    name: 'mcp_task_list',
    description: 'List project-local MCP tasks with optional status, tag, text, and closed-task filters.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        status: { type: 'string' },
        tag: { type: 'string' },
        query: { type: 'string' },
        include_closed: { type: 'boolean' },
        limit: { type: 'number' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const ledger = loadLedger(project.projectRoot);
      if ('error' in ledger) return failure(ledger.error);

      let tasks = [...ledger.tasks];
      if (!args.includeClosed) tasks = tasks.filter((task) => task.status !== 'closed');
      if (args.status) tasks = tasks.filter((task) => task.status === normalizeStatus(args.status, task.status));
      if (args.tag) tasks = tasks.filter((task) => task.tags.includes(stringValue(args.tag)));
      if (args.query) {
        const query = stringValue(args.query).toLowerCase();
        tasks = tasks.filter((task) => taskSearchText(task).includes(query));
      }
      tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const limit = numberOrUndefined(args.limit);
      if (Number.isFinite(limit) && Number(limit) >= 0) tasks = tasks.slice(0, Number(limit));

      return jsonResponse({
        status: 'success',
        ledger_path: LEDGER_PATH,
        count: tasks.length,
        tasks,
      });
    },
  };
}

function mcpTaskClose(ctx: ServerContext): ToolDefinition {
  return {
    name: 'mcp_task_close',
    description: 'Close a project-local MCP task with resolution, summary, and follow-up recommendations.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        task_id: { type: 'string' },
        resolution: { type: 'string' },
        summary: { type: 'string' },
        recommendations: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path', 'task_id'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const ledger = loadLedger(project.projectRoot);
      if ('error' in ledger) return failure(ledger.error);
      const task = findTask(ledger, args.taskId);
      if (!task) return failure(`task not found: ${args.taskId || ''}`);

      const now = new Date().toISOString();
      task.status = 'closed';
      task.closed_at = now;
      task.updated_at = now;
      task.resolution = stringValue(args.resolution) || 'closed';
      task.closed_summary = stringValue(args.summary);
      task.recommendations = uniqueStrings([
        ...task.recommendations,
        ...arrayOfStrings(args.recommendations),
      ]);
      ledger.updated_at = now;
      if (!args.dryRun) saveLedger(project.projectRoot, ledger);

      return jsonResponse({
        status: 'success',
        dry_run: Boolean(args.dryRun),
        ledger_path: LEDGER_PATH,
        task,
      });
    },
  };
}

function mcpEvidenceAttach(ctx: ServerContext): ToolDefinition {
  return {
    name: 'mcp_evidence_attach',
    description: 'Attach inline or file-backed evidence to the project-local MCP task ledger.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        task_id: { type: 'string' },
        kind: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        content: { type: 'string' },
        source_path: { type: 'string' },
        output_path: { type: 'string' },
        metadata: { type: 'object' },
        dry_run: { type: 'boolean' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const ledger = loadLedger(project.projectRoot);
      if ('error' in ledger) return failure(ledger.error);

      const task = args.taskId ? findTask(ledger, args.taskId) : null;
      if (args.taskId && !task) return failure(`task not found: ${args.taskId}`);

      const now = new Date().toISOString();
      const evidenceId = nextEvidenceId(ledger);
      let sourcePath: string | null = null;
      let content = args.content !== undefined ? stringValue(args.content) : '';
      if (args.sourcePath) {
        const source = resolveProjectFile(project.projectRoot, args.sourcePath);
        if ('error' in source) return failure(source.error);
        if (!existsSync(source.absolutePath)) return failure(`source_path not found: ${source.relativePath}`);
        sourcePath = source.relativePath;
        if (!content) content = readFileSync(source.absolutePath, 'utf8');
      }

      let storedPath: string | null = null;
      if (content) {
        const outputCandidate = args.outputPath
          ? stringValue(args.outputPath)
          : defaultEvidencePath(evidenceId, sourcePath || args.title || 'evidence');
        const output = resolveProjectFile(project.projectRoot, outputCandidate);
        if ('error' in output) return failure(output.error);
        storedPath = output.relativePath;
        if (!args.dryRun) {
          mkdirSync(dirname(output.absolutePath), { recursive: true });
          writeFileSync(output.absolutePath, content, 'utf8');
        }
      } else if (args.outputPath) {
        const output = resolveProjectFile(project.projectRoot, args.outputPath);
        if ('error' in output) return failure(output.error);
        storedPath = output.relativePath;
      }

      const evidence: LedgerEvidence = {
        id: evidenceId,
        task_id: task?.id || null,
        kind: stringValue(args.kind) || 'note',
        title: stringValue(args.title) || evidenceId,
        summary: stringValue(args.summary),
        source_path: sourcePath,
        stored_path: storedPath,
        content_preview: content ? truncate(content, 240) : null,
        metadata: isPlainObject(args.metadata) ? args.metadata : {},
        created_at: now,
      };

      ledger.evidence.push(evidence);
      ledger.next_evidence_number += 1;
      ledger.updated_at = now;
      if (task) {
        task.evidence_ids = uniqueStrings([...task.evidence_ids, evidence.id]);
        task.updated_at = now;
      }
      if (!args.dryRun) saveLedger(project.projectRoot, ledger);

      return jsonResponse({
        status: 'success',
        dry_run: Boolean(args.dryRun),
        ledger_path: LEDGER_PATH,
        evidence,
      });
    },
  };
}

function mcpSessionReport(ctx: ServerContext): ToolDefinition {
  return {
    name: 'mcp_session_report',
    description: 'Generate a Markdown session report from the project-local MCP task ledger and evidence.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        session_title: { type: 'string' },
        include_evidence: { type: 'boolean' },
        output_path: { type: 'string' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const ledger = loadLedger(project.projectRoot);
      if ('error' in ledger) return failure(ledger.error);

      const includeEvidence = args.includeEvidence !== false;
      const title = stringValue(args.sessionTitle) || 'MCP Session Report';
      const summary = summarizeLedger(ledger);
      const reportMarkdown = buildSessionReport(title, ledger, summary, includeEvidence);
      const outputPath = writeOptionalOutput(project.projectRoot, args.outputPath, reportMarkdown);
      if ('error' in outputPath) return failure(outputPath.error);

      return jsonResponse({
        status: 'success',
        ledger_path: LEDGER_PATH,
        output_path: outputPath.relativePath,
        summary,
        report_markdown: reportMarkdown,
      });
    },
  };
}

function mcpChangelogDraft(ctx: ServerContext): ToolDefinition {
  return {
    name: 'mcp_changelog_draft',
    description: 'Draft a Markdown changelog from closed project-local MCP tasks and attached evidence.',
    inputSchema: {
      type: 'object',
      properties: commonProperties({
        since: { type: 'string' },
        output_path: { type: 'string' },
      }),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const project = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in project) return failure(project.error);
      const ledger = loadLedger(project.projectRoot);
      if ('error' in ledger) return failure(ledger.error);

      const since = parseDate(args.since);
      const closedTasks = ledger.tasks.filter((task) => {
        if (task.status !== 'closed') return false;
        if (!since) return true;
        const closedAt = parseDate(task.closed_at || task.updated_at);
        return closedAt ? closedAt >= since : false;
      });
      const changelogMarkdown = buildChangelog(closedTasks, ledger.evidence);
      const outputPath = writeOptionalOutput(project.projectRoot, args.outputPath, changelogMarkdown);
      if ('error' in outputPath) return failure(outputPath.error);

      return jsonResponse({
        status: 'success',
        ledger_path: LEDGER_PATH,
        output_path: outputPath.relativePath,
        closed_tasks: closedTasks.length,
        changelog_markdown: changelogMarkdown,
      });
    },
  };
}

function loadLedger(projectRoot: string): TaskLedger | { error: string } {
  const ledgerFile = join(projectRoot, LEDGER_PATH);
  if (!existsSync(ledgerFile)) return emptyLedger();
  try {
    const parsed = JSON.parse(readFileSync(ledgerFile, 'utf8'));
    const ledger: TaskLedger = {
      schema_version: 1,
      next_task_number: Number(parsed.next_task_number) || 1,
      next_evidence_number: Number(parsed.next_evidence_number) || 1,
      updated_at: stringValue(parsed.updated_at) || new Date(0).toISOString(),
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(normalizeEvidence) : [],
    };
    ledger.next_task_number = Math.max(ledger.next_task_number, nextNumberAfter(ledger.tasks.map((task) => task.id), 'task'));
    ledger.next_evidence_number = Math.max(ledger.next_evidence_number, nextNumberAfter(ledger.evidence.map((entry) => entry.id), 'evidence'));
    return ledger;
  } catch (error: any) {
    return { error: `failed to parse ${LEDGER_PATH}: ${error?.message || String(error)}` };
  }
}

function saveLedger(projectRoot: string, ledger: TaskLedger): void {
  const ledgerFile = join(projectRoot, LEDGER_PATH);
  mkdirSync(dirname(ledgerFile), { recursive: true });
  writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2), 'utf8');
}

function emptyLedger(): TaskLedger {
  return {
    schema_version: 1,
    next_task_number: 1,
    next_evidence_number: 1,
    updated_at: new Date(0).toISOString(),
    tasks: [],
    evidence: [],
  };
}

function normalizeTask(value: any): LedgerTask {
  const now = new Date(0).toISOString();
  return {
    id: stringValue(value.id),
    title: stringValue(value.title),
    description: stringValue(value.description),
    status: normalizeStatus(value.status, 'open'),
    priority: stringValue(value.priority) || 'normal',
    assignee: stringValue(value.assignee) || null,
    tags: arrayOfStrings(value.tags),
    source: stringValue(value.source) || null,
    related_files: normalizeProjectPaths(value.related_files),
    recommendations: arrayOfStrings(value.recommendations),
    evidence_ids: arrayOfStrings(value.evidence_ids),
    notes: Array.isArray(value.notes)
      ? value.notes.map((note: any) => ({
        text: stringValue(note.text),
        created_at: stringValue(note.created_at) || now,
      })).filter((note: LedgerNote) => note.text)
      : [],
    created_at: stringValue(value.created_at) || now,
    updated_at: stringValue(value.updated_at) || now,
    ...(value.closed_at ? { closed_at: stringValue(value.closed_at) } : {}),
    ...(value.resolution ? { resolution: stringValue(value.resolution) } : {}),
    ...(value.closed_summary ? { closed_summary: stringValue(value.closed_summary) } : {}),
  };
}

function normalizeEvidence(value: any): LedgerEvidence {
  const now = new Date(0).toISOString();
  return {
    id: stringValue(value.id),
    task_id: stringValue(value.task_id) || null,
    kind: stringValue(value.kind) || 'note',
    title: stringValue(value.title),
    summary: stringValue(value.summary),
    source_path: stringValue(value.source_path) || null,
    stored_path: stringValue(value.stored_path) || null,
    content_preview: stringValue(value.content_preview) || null,
    metadata: isPlainObject(value.metadata) ? value.metadata : {},
    created_at: stringValue(value.created_at) || now,
  };
}

function findTask(ledger: TaskLedger, taskId: any): LedgerTask | undefined {
  const id = stringValue(taskId);
  return ledger.tasks.find((task) => task.id === id);
}

function nextTaskId(ledger: TaskLedger): string {
  return `task-${String(ledger.next_task_number).padStart(4, '0')}`;
}

function nextEvidenceId(ledger: TaskLedger): string {
  return `evidence-${String(ledger.next_evidence_number).padStart(4, '0')}`;
}

function nextNumberAfter(ids: string[], prefix: string): number {
  const numbers = ids
    .map((id) => id.match(new RegExp(`^${prefix}-(\\d+)$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

function summarizeLedger(ledger: TaskLedger): Record<string, any> {
  const status_counts: Record<string, number> = {};
  for (const task of ledger.tasks) {
    status_counts[task.status] = (status_counts[task.status] || 0) + 1;
  }
  return {
    total_tasks: ledger.tasks.length,
    open_tasks: ledger.tasks.filter((task) => task.status !== 'closed').length,
    closed_tasks: ledger.tasks.filter((task) => task.status === 'closed').length,
    evidence_count: ledger.evidence.length,
    status_counts,
    recommendations: uniqueStrings(ledger.tasks.flatMap((task) => task.recommendations)),
  };
}

function buildSessionReport(
  title: string,
  ledger: TaskLedger,
  summary: Record<string, any>,
  includeEvidence: boolean,
): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Total tasks: ${summary.total_tasks}`,
    `- Open tasks: ${summary.open_tasks}`,
    `- Closed tasks: ${summary.closed_tasks}`,
    `- Evidence items: ${summary.evidence_count}`,
    '',
    '## Open Tasks',
    '',
  ];
  const openTasks = ledger.tasks.filter((task) => task.status !== 'closed');
  appendTaskLines(lines, openTasks, '- No open tasks.');
  lines.push('', '## Closed Tasks', '');
  appendTaskLines(lines, ledger.tasks.filter((task) => task.status === 'closed'), '- No closed tasks.');

  if (includeEvidence) {
    lines.push('', '## Evidence', '');
    if (ledger.evidence.length === 0) {
      lines.push('- No evidence attached.');
    } else {
      for (const evidence of ledger.evidence) {
        const taskSuffix = evidence.task_id ? ` for ${evidence.task_id}` : '';
        const pathSuffix = evidence.stored_path ? ` (${evidence.stored_path})` : '';
        lines.push(`- [${evidence.kind}] ${evidence.title}${taskSuffix}${pathSuffix}: ${evidence.summary}`);
      }
    }
  }

  const recommendations = uniqueStrings(summary.recommendations || []);
  lines.push('', '## Recommendations', '');
  if (recommendations.length === 0) {
    lines.push('- No recommendations recorded.');
  } else {
    for (const recommendation of recommendations) lines.push(`- ${recommendation}`);
  }
  return `${lines.join('\n')}\n`;
}

function buildChangelog(tasks: LedgerTask[], evidence: LedgerEvidence[]): string {
  const lines: string[] = [
    '# Changelog Draft',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];
  if (tasks.length === 0) {
    lines.push('- No closed tasks found for this range.');
    return `${lines.join('\n')}\n`;
  }

  const byResolution = new Map<string, LedgerTask[]>();
  for (const task of tasks) {
    const resolution = task.resolution || 'closed';
    byResolution.set(resolution, [...(byResolution.get(resolution) || []), task]);
  }

  for (const [resolution, groupedTasks] of byResolution) {
    lines.push(`## ${resolution}`, '');
    for (const task of groupedTasks) {
      const taskEvidence = evidence.filter((entry) => task.evidence_ids.includes(entry.id));
      const evidenceSuffix = taskEvidence.length > 0
        ? ` Evidence: ${taskEvidence.map((entry) => entry.title).join(', ')}.`
        : '';
      lines.push(`- ${task.title}: ${task.closed_summary || task.description || 'No summary recorded.'}${evidenceSuffix}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

function appendTaskLines(lines: string[], tasks: LedgerTask[], emptyLine: string): void {
  if (tasks.length === 0) {
    lines.push(emptyLine);
    return;
  }
  for (const task of tasks) {
    const tags = task.tags.length > 0 ? ` [${task.tags.join(', ')}]` : '';
    const summary = task.closed_summary || task.description;
    lines.push(`- ${task.id} ${task.status} ${task.priority}${tags}: ${task.title}${summary ? ` - ${summary}` : ''}`);
  }
}

function writeOptionalOutput(projectRoot: string, outputPath: any, content: string): { relativePath: string | null } | { error: string } {
  if (!outputPath) return { relativePath: null };
  const output = resolveProjectFile(projectRoot, outputPath);
  if ('error' in output) return output;
  mkdirSync(dirname(output.absolutePath), { recursive: true });
  writeFileSync(output.absolutePath, content, 'utf8');
  return { relativePath: output.relativePath };
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): ResolvedProject | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  if (!existsSync(join(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  }
  return { projectRoot };
}

function resolveProjectFile(projectRoot: string, candidate: string): ResolvedFile | { error: string } {
  if (!candidate) return { error: 'path is required' };
  const local = normalizeResourcePath(candidate);
  const absolutePath = isAbsolute(local) ? resolve(local) : resolve(projectRoot, local);
  const rel = relative(projectRoot, absolutePath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    return { error: `Path escapes project: ${candidate}` };
  }
  return {
    absolutePath,
    relativePath: normalizeSlashes(rel),
  };
}

function defaultEvidencePath(evidenceId: string, seed: string): string {
  const cleanName = sanitizeName(basename(seed, extname(seed)) || seed || 'evidence');
  const extension = extname(seed) || '.txt';
  return normalizeSlashes(join(EVIDENCE_DIR, `${evidenceId}-${cleanName}${extension}`));
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    taskId: args.taskId ?? args.task_id,
    includeClosed: args.includeClosed ?? args.include_closed,
    appendNotes: args.appendNotes ?? args.append_notes,
    addRelatedFiles: args.addRelatedFiles ?? args.add_related_files,
    addRecommendations: args.addRecommendations ?? args.add_recommendations,
    relatedFiles: args.relatedFiles ?? args.related_files,
    sourcePath: args.sourcePath ?? args.source_path,
    outputPath: args.outputPath ?? args.output_path,
    sessionTitle: args.sessionTitle ?? args.session_title,
    includeEvidence: args.includeEvidence ?? args.include_evidence,
    dryRun: args.dryRun ?? args.dry_run,
  };
}

function normalizeStatus(value: any, fallback: TaskStatus): TaskStatus {
  const normalized = stringValue(value).toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'open' || normalized === 'in_progress' || normalized === 'blocked' || normalized === 'closed') {
    return normalized;
  }
  return fallback;
}

function normalizeProjectPaths(value: any): string[] {
  return arrayOfStrings(value).map(normalizeResourcePath);
}

function normalizeResourcePath(value: string): string {
  return String(value || '').replace(/^res:\/\//, '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function commonProperties(extra: Record<string, any>): Record<string, any> {
  return {
    project_path: { type: 'string' },
    ...extra,
  };
}

function taskSearchText(task: LedgerTask): string {
  return [
    task.id,
    task.title,
    task.description,
    task.status,
    task.priority,
    task.assignee || '',
    task.tags.join(' '),
    task.related_files.join(' '),
    task.recommendations.join(' '),
    task.notes.map((note) => note.text).join(' '),
  ].join(' ').toLowerCase();
}

function singleOrArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function arrayOfStrings(value: any): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => value && all.indexOf(value) === index);
}

function stringValue(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeName(value: string): string {
  return String(value || 'evidence')
    .replace(/\.[A-Za-z0-9]+$/i, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'evidence';
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function parseDate(value: any): Date | null {
  const text = stringValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberOrUndefined(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function failure(reason: string): ToolResponse {
  return jsonResponse({
    status: 'failed',
    reason,
    recommendations: [reason],
  }, true);
}

function jsonResponse(data: any, isError = false): ToolResponse {
  const response: ToolResponse = {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
  if (isError) response.isError = true;
  return response;
}
