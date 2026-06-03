/**
 * Anchor-based GDScript patching tools.
 */

import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'path';

type PatchMode = 'insert_before' | 'insert_after' | 'replace_block' | 'replace_range' | 'append_to_file';
type AnchorType = 'exact_text' | 'function_name' | 'class_member' | 'regex';

type PatchArgs = {
  projectPath?: string;
  scriptPath?: string;
  filePath?: string;
  mode?: PatchMode;
  anchorType?: AnchorType;
  anchor?: string;
  patchText?: string;
  replacementText?: string;
  startLine?: number;
  endLine?: number;
  occurrence?: number;
  regex?: boolean;
  dryRun?: boolean;
  validateAfter?: boolean;
  allowAppendFallback?: boolean;
};

type ResolvedTarget = {
  projectRoot: string;
  scriptPath: string;
  absolutePath: string;
};

type MatchRange = {
  start: number;
  end: number;
  label: string;
};

export function registerScriptPatchTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.register(scriptPatch(ctx));
}

function scriptPatch(ctx: ServerContext): ToolDefinition {
  return {
    name: 'script_patch',
    description: 'Patch a GDScript file using exact, function, class member, range, or opt-in regex anchors without regenerating the whole file.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory.' },
        script_path: { type: 'string', description: 'Project-relative path to the .gd file.' },
        file_path: { type: 'string', description: 'Alias for script_path.' },
        mode: {
          type: 'string',
          enum: ['insert_before', 'insert_after', 'replace_block', 'replace_range', 'append_to_file'],
        },
        anchor_type: {
          type: 'string',
          enum: ['exact_text', 'function_name', 'class_member', 'regex'],
        },
        anchor: { type: 'string', description: 'Anchor text, symbol name, or regex pattern.' },
        patch_text: { type: 'string', description: 'Text to insert or use as replacement.' },
        replacement_text: { type: 'string', description: 'Alias for patch_text.' },
        start_line: { type: 'number', description: 'One-based inclusive start line for replace_range.' },
        end_line: { type: 'number', description: 'One-based inclusive end line for replace_range.' },
        occurrence: { type: 'number', description: 'One-based match occurrence to patch when an anchor appears multiple times.' },
        regex: { type: 'boolean', description: 'Required true when anchor_type is regex.' },
        dry_run: { type: 'boolean', description: 'Return a unified diff without writing.' },
        validate_after: { type: 'boolean', description: 'Run existing script validation before writing.' },
        allow_append_fallback: { type: 'boolean', description: 'Append patch text when the requested anchor is missing.' },
      },
      required: ['project_path', 'mode'],
    },
    handler: async (rawArgs: any) => {
      const args = ctx.normalizeParameters(rawArgs || {}) as PatchArgs;
      const target = resolveTarget(ctx, args);

      if ('error' in target) {
        return failure(target.error);
      }

      const patchText = normalizeNewlines(args.patchText ?? args.replacementText ?? '');
      if (!args.mode) {
        return failure('mode is required');
      }

      if (!patchText && args.mode !== 'replace_range') {
        return failure('patch_text or replacement_text is required');
      }

      try {
        const originalDiskContent = await readFile(target.absolutePath, 'utf8');
        const lineEnding = detectLineEnding(originalDiskContent);
        const original = normalizeNewlines(originalDiskContent);
        const result = computePatchedContent(original, args, patchText);

        if ('error' in result) {
          return failure(result.error);
        }

        if (args.validateAfter) {
          if (ctx.validateScript) {
            const validation = await ctx.validateScript({
              projectPath: target.projectRoot,
              scriptPath: target.scriptPath,
              scriptContent: result.content,
            });

            if (validation.isError) {
              return failure(`Script validation failed: ${extractResponseText(validation)}`);
            }

            const parsed = parseValidationResponse(validation);
            if (parsed && parsed.valid === false) {
              return failure(`Script validation failed: ${extractResponseText(validation)}`);
            }
          } else {
            const validation = await ctx.executeOperation(
              'validate_script',
              {
                script_path: target.scriptPath,
                script_content: result.content,
              },
              target.projectRoot
            );

            const combinedOutput = `${validation.stdout || ''}\n${validation.stderr || ''}`;
            if (/error|failed/i.test(combinedOutput) && !/"status"\s*:\s*"ok"/i.test(combinedOutput)) {
              return failure(`Script validation failed: ${combinedOutput.trim()}`);
            }
          }
        }

        const diff = createUnifiedDiff(target.scriptPath, original, result.content);
        if (args.dryRun) {
          return jsonResponse({
            status: 'dry_run',
            script_path: target.scriptPath,
            changed: original !== result.content,
            fallback_used: result.fallbackUsed,
            diff,
          });
        }

        const diskContent = denormalizeNewlines(result.content, lineEnding);
        await writeFile(target.absolutePath, diskContent, 'utf8');

        return jsonResponse({
          status: 'success',
          script_path: target.scriptPath,
          changed: original !== result.content,
          fallback_used: result.fallbackUsed,
          diff,
        });
      } catch (error: any) {
        return failure(error?.message || String(error));
      }
    },
  };
}

function resolveTarget(ctx: ServerContext, args: PatchArgs): ResolvedTarget | { error: string } {
  if (!args.projectPath) {
    return { error: 'project_path is required' };
  }

  if (!ctx.validatePath(args.projectPath)) {
    return { error: 'Invalid project_path' };
  }

  const projectRoot = resolve(args.projectPath);
  if (!existsSync(resolve(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${args.projectPath} does not contain project.godot` };
  }

  const requestedPath = args.scriptPath ?? args.filePath;
  if (!requestedPath) {
    return { error: 'script_path or file_path is required' };
  }

  if (!ctx.validatePath(requestedPath) || requestedPath.startsWith('uid://')) {
    return { error: 'Invalid script_path' };
  }

  const localPath = requestedPath.startsWith('res://') ? requestedPath.slice('res://'.length) : requestedPath;
  const absolutePath = isAbsolute(localPath) ? resolve(localPath) : resolve(projectRoot, localPath);
  const relativePath = relative(projectRoot, absolutePath);

  if (!relativePath || relativePath.startsWith('..') || relativePath.includes(`..${sep}`) || isAbsolute(relativePath)) {
    return { error: `script_path must stay inside project_path: ${requestedPath}` };
  }

  if (extname(relativePath) !== '.gd') {
    return { error: `script_patch only supports .gd files: ${requestedPath}` };
  }

  if (!existsSync(absolutePath)) {
    return { error: `Script not found: ${requestedPath}` };
  }

  return {
    projectRoot,
    scriptPath: relativePath.replace(/\\/g, '/'),
    absolutePath,
  };
}

function computePatchedContent(
  original: string,
  args: PatchArgs,
  patchText: string
): { content: string; fallbackUsed: boolean } | { error: string } {
  if (args.mode === 'append_to_file') {
    return { content: appendToFile(original, patchText), fallbackUsed: false };
  }

  if (args.mode === 'replace_range') {
    const range = rangeFromLines(original, args.startLine, args.endLine);
    if ('error' in range) {
      return range;
    }
    return { content: replaceRange(original, range, patchText), fallbackUsed: false };
  }

  const match = resolveAnchor(original, args);
  if ('error' in match) {
    if (args.allowAppendFallback && /not found/i.test(match.error)) {
      return { content: appendToFile(original, patchText), fallbackUsed: true };
    }
    return match;
  }

  if (args.mode === 'insert_before') {
    return {
      content: insertAt(original, match.start, `${trimTrailingNewlines(patchText)}\n`),
      fallbackUsed: false,
    };
  }

  if (args.mode === 'insert_after') {
    return {
      content: insertAt(original, match.end, `\n${trimTrailingNewlines(patchText)}`),
      fallbackUsed: false,
    };
  }

  if (args.mode === 'replace_block') {
    return {
      content: replaceRange(original, match, patchText),
      fallbackUsed: false,
    };
  }

  return { error: `Unsupported mode: ${args.mode}` };
}

function resolveAnchor(original: string, args: PatchArgs): MatchRange | { error: string } {
  if (!args.anchorType) {
    return { error: 'anchor_type is required' };
  }

  if (!args.anchor) {
    return { error: 'anchor is required' };
  }

  if (args.anchorType === 'exact_text') {
    return selectMatch(findExactMatches(original, normalizeNewlines(args.anchor)), args.occurrence, 'exact text anchor');
  }

  if (args.anchorType === 'function_name') {
    return selectMatch(findFunctionMatches(original, args.anchor), args.occurrence, `function ${args.anchor}`);
  }

  if (args.anchorType === 'class_member') {
    return selectMatch(findClassMemberMatches(original, args.anchor), args.occurrence, `class member ${args.anchor}`);
  }

  if (args.anchorType === 'regex') {
    if (args.regex !== true) {
      return { error: 'regex anchor requires explicit regex opt-in' };
    }
    return selectMatch(findRegexMatches(original, args.anchor), args.occurrence, `regex ${args.anchor}`);
  }

  return { error: `Unsupported anchor_type: ${args.anchorType}` };
}

function findExactMatches(content: string, anchor: string): MatchRange[] {
  if (!anchor) {
    return [];
  }

  const matches: MatchRange[] = [];
  let offset = 0;
  while (offset <= content.length) {
    const index = content.indexOf(anchor, offset);
    if (index === -1) {
      break;
    }
    matches.push({ start: index, end: index + anchor.length, label: 'exact text anchor' });
    offset = index + Math.max(anchor.length, 1);
  }
  return matches;
}

function findFunctionMatches(content: string, functionName: string): MatchRange[] {
  const lines = content.split('\n');
  const offsets = lineOffsets(content);
  const namePattern = escapeRegex(functionName);
  const pattern = new RegExp(`^(\\s*)func\\s+${namePattern}\\s*\\(`);
  const matches: MatchRange[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) {
      continue;
    }

    const baseIndent = indentationWidth(match[1] || '');
    let lastIncludedLine = index;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() === '') {
        continue;
      }

      if (indentationWidth(line.match(/^\s*/)?.[0] || '') <= baseIndent) {
        break;
      }
      lastIncludedLine = cursor;
    }

    matches.push({
      start: offsets[index],
      end: offsets[lastIncludedLine] + lines[lastIncludedLine].length,
      label: `function ${functionName}`,
    });
  }

  return matches;
}

function findClassMemberMatches(content: string, memberName: string): MatchRange[] {
  const lines = content.split('\n');
  const offsets = lineOffsets(content);
  const escapedName = escapeRegex(memberName);
  const pattern = new RegExp(`^\\s*(?:@export\\s+)?(?:var|const|signal|enum)\\s+${escapedName}\\b`);
  const matches: MatchRange[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      matches.push({
        start: offsets[index],
        end: offsets[index] + lines[index].length,
        label: `class member ${memberName}`,
      });
    }
  }

  return matches;
}

function findRegexMatches(content: string, patternText: string): MatchRange[] {
  const flags = patternText.startsWith('(?m)') ? 'g' : 'gm';
  const pattern = new RegExp(patternText, flags);
  const matches: MatchRange[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      label: `regex ${patternText}`,
    });

    if (match[0].length === 0) {
      pattern.lastIndex += 1;
    }
  }

  return matches;
}

function selectMatch(matches: MatchRange[], occurrence: number | undefined, label: string): MatchRange | { error: string } {
  if (matches.length === 0) {
    return { error: `${label} not found` };
  }

  if (matches.length > 1 && !occurrence) {
    return { error: `Ambiguous anchor: ${label} matched ${matches.length} times; provide occurrence` };
  }

  const selectedOccurrence = occurrence ?? 1;
  if (!Number.isInteger(selectedOccurrence) || selectedOccurrence < 1 || selectedOccurrence > matches.length) {
    return { error: `occurrence must be between 1 and ${matches.length}` };
  }

  return matches[selectedOccurrence - 1];
}

function rangeFromLines(content: string, startLine: number | undefined, endLine: number | undefined): MatchRange | { error: string } {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return { error: 'start_line and end_line are required for replace_range' };
  }

  const lines = content.split('\n');
  if (startLine! < 1 || endLine! < startLine! || endLine! > lines.length) {
    return { error: `Invalid replace_range lines: ${startLine}-${endLine}` };
  }

  const offsets = lineOffsets(content);
  const start = offsets[startLine! - 1];
  const end = offsets[endLine! - 1] + lines[endLine! - 1].length;
  return { start, end, label: `lines ${startLine}-${endLine}` };
}

function replaceRange(content: string, range: MatchRange, patchText: string): string {
  return `${content.slice(0, range.start)}${trimTrailingNewlines(patchText)}${content.slice(range.end)}`;
}

function insertAt(content: string, offset: number, text: string): string {
  return `${content.slice(0, offset)}${text}${content.slice(offset)}`;
}

function appendToFile(content: string, patchText: string): string {
  const prefix = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  return `${content}${prefix}${trimTrailingNewlines(patchText)}\n`;
}

function createUnifiedDiff(scriptPath: string, original: string, next: string): string {
  if (original === next) {
    return '';
  }

  const originalLines = trimFinalEmptyLine(original.split('\n'));
  const nextLines = trimFinalEmptyLine(next.split('\n'));
  return [
    `--- ${scriptPath}`,
    `+++ ${scriptPath}`,
    `@@ -1,${originalLines.length} +1,${nextLines.length} @@`,
    ...originalLines.map((line) => `-${line}`),
    ...nextLines.map((line) => `+${line}`),
  ].join('\n');
}

function trimFinalEmptyLine(lines: string[]): string[] {
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    return lines.slice(0, -1);
  }
  return lines;
}

function lineOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function indentationWidth(indent: string): number {
  return indent.replace(/\t/g, '  ').length;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function denormalizeNewlines(value: string, lineEnding: string): string {
  return lineEnding === '\n' ? value : value.replace(/\n/g, lineEnding);
}

function detectLineEnding(value: string): string {
  return value.includes('\r\n') ? '\r\n' : '\n';
}

function trimTrailingNewlines(value: string): string {
  return normalizeNewlines(value).replace(/\n+$/g, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function failure(reason: string): ToolResponse {
  return jsonResponse({
    status: 'failed',
    reason,
  }, true);
}

function parseValidationResponse(response: ToolResponse): any | null {
  try {
    return JSON.parse(extractResponseText(response));
  } catch {
    return null;
  }
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
