/**
 * Refactoring Tools (Tier 1 — Step 5)
 *
 * Context-aware renaming across all GDScript and scene files in a project.
 *
 * Tools:
 *   - refactor_rename  (TS)  Rename functions, variables, signals, classes, constants
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';

export function registerRefactorTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    refactorRename(ctx),
  ]);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RenameChange {
  file: string;
  line: number;
  before: string;
  after: string;
  context: string; // surrounding text for review
}

// ─── refactor_rename ──────────────────────────────────────────────────────────

function refactorRename(ctx: ServerContext): ToolDefinition {
  return {
    name: 'refactor_rename',
    description: 'Rename a function, variable, signal, class, or constant across all GDScript (.gd) and scene (.tscn) files in a project. Defaults to dry_run mode showing planned changes before applying.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the Godot project directory',
        },
        symbol_type: {
          type: 'string',
          description: 'Type of symbol being renamed',
          enum: ['function', 'variable', 'signal', 'class', 'constant'],
        },
        old_name: {
          type: 'string',
          description: 'Current name of the symbol',
        },
        new_name: {
          type: 'string',
          description: 'New name for the symbol',
        },
        dry_run: {
          type: 'boolean',
          description: 'If true (default), only show planned changes without applying them',
        },
        scope: {
          type: 'string',
          description: 'Restrict renaming to a specific directory within the project (optional)',
        },
      },
      required: ['project_path', 'symbol_type', 'old_name', 'new_name'],
    },
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      if (!args.projectPath || !args.symbolType || !args.oldName || !args.newName) {
        return ctx.createErrorResponse('project_path, symbol_type, old_name, and new_name are required');
      }

      const validTypes = ['function', 'variable', 'signal', 'class', 'constant'];
      if (!validTypes.includes(args.symbolType)) {
        return ctx.createErrorResponse(
          `Invalid symbol_type: ${args.symbolType}`,
          [`Must be one of: ${validTypes.join(', ')}`]
        );
      }

      if (args.oldName === args.newName) {
        return ctx.createErrorResponse('old_name and new_name must be different');
      }

      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return ctx.createErrorResponse('Invalid project path: project.godot not found');
      }

      // Validate naming conventions
      if (args.symbolType === 'class' && !/^[A-Z]/.test(args.newName)) {
        ctx.logDebug('Warning: class names typically start with uppercase in GDScript');
      }

      const dryRun = args.dryRun !== false; // default true
      const searchDir = args.scope ? join(args.projectPath, args.scope) : args.projectPath;

      if (!existsSync(searchDir)) {
        return ctx.createErrorResponse(`Scope directory not found: ${args.scope || args.projectPath}`);
      }

      try {
        // Collect all relevant files
        const files = collectFiles(searchDir, ['.gd', '.tscn']);
        const patterns = buildPatterns(args.symbolType, args.oldName, args.newName);
        const changes: RenameChange[] = [];

        for (const filePath of files) {
          const content = readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');
          const relPath = relative(args.projectPath, filePath).replace(/\\/g, '/');

          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];

            for (const pattern of patterns) {
              // Skip patterns that don't apply to this file type
              if (pattern.fileType && !filePath.endsWith(pattern.fileType)) continue;

              let match;
              const regex = new RegExp(pattern.search, 'g');
              while ((match = regex.exec(line)) !== null) {
                const before = line;
                const after = line.replace(new RegExp(pattern.search, 'g'), pattern.replace);

                if (before !== after) {
                  changes.push({
                    file: relPath,
                    line: lineIdx + 1,
                    before: before.trim(),
                    after: after.trim(),
                    context: pattern.description,
                  });
                  break; // one change per line per pattern
                }
              }
            }
          }
        }

        // Apply changes if not dry run
        if (!dryRun && changes.length > 0) {
          const fileChanges = new Map<string, { content: string; lines: string[] }>();

          for (const filePath of files) {
            const content = readFileSync(filePath, 'utf-8');
            const relPath = relative(args.projectPath, filePath).replace(/\\/g, '/');
            fileChanges.set(relPath, { content, lines: content.split('\n') });
          }

          for (const change of changes) {
            const fileData = fileChanges.get(change.file);
            if (!fileData) continue;

            const lineIdx = change.line - 1;
            for (const pattern of patterns) {
              if (pattern.fileType && !change.file.endsWith(pattern.fileType.replace('.', ''))) continue;
              fileData.lines[lineIdx] = fileData.lines[lineIdx].replace(
                new RegExp(pattern.search, 'g'),
                pattern.replace
              );
            }
          }

          // Write modified files
          const modifiedFiles = new Set<string>();
          for (const [relPath, fileData] of fileChanges) {
            const newContent = fileData.lines.join('\n');
            if (newContent !== fileData.content) {
              const fullPath = join(args.projectPath, relPath);
              writeFileSync(fullPath, newContent, 'utf-8');
              modifiedFiles.add(relPath);
            }
          }
        }

        // Deduplicate changes by file+line
        const uniqueChanges = deduplicateChanges(changes);

        const filesAffected = new Set(uniqueChanges.map(c => c.file));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              dry_run: dryRun,
              symbol_type: args.symbolType,
              old_name: args.oldName,
              new_name: args.newName,
              total_changes: uniqueChanges.length,
              files_affected: filesAffected.size,
              files: Array.from(filesAffected),
              changes: uniqueChanges.slice(0, 100), // limit output size
              truncated: uniqueChanges.length > 100,
              message: dryRun
                ? `Found ${uniqueChanges.length} change(s) across ${filesAffected.size} file(s). Run with dry_run=false to apply.`
                : `Applied ${uniqueChanges.length} change(s) across ${filesAffected.size} file(s).`,
            }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return ctx.createErrorResponse(`Refactor failed: ${msg}`);
      }
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface RenamePattern {
  search: string;    // regex pattern string
  replace: string;   // replacement string (can use $1, $2, etc.)
  description: string;
  fileType?: string; // restrict to specific file extension
}

/**
 * Build context-aware regex patterns for each symbol type
 * Uses word boundaries to prevent false positives
 */
function buildPatterns(symbolType: string, oldName: string, newName: string): RenamePattern[] {
  // Escape special regex characters in the names
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const old = esc(oldName);
  const nw = newName;

  switch (symbolType) {
    case 'function':
      return [
        { search: `\\bfunc\\s+${old}\\b`, replace: `func ${nw}`, description: 'function definition', fileType: '.gd' },
        { search: `\\.${old}\\s*\\(`, replace: `.${nw}(`, description: 'method call', fileType: '.gd' },
        { search: `(?<=^|[\\s(,=])${old}\\s*\\(`, replace: `${nw}(`, description: 'function call', fileType: '.gd' },
        { search: `"${old}"`, replace: `"${nw}"`, description: 'string reference (signal connection, callable)', fileType: '.gd' },
        { search: `method="${old}"`, replace: `method="${nw}"`, description: 'signal connection method in scene', fileType: '.tscn' },
      ];

    case 'variable':
      return [
        { search: `\\bvar\\s+${old}\\b`, replace: `var ${nw}`, description: 'variable declaration', fileType: '.gd' },
        { search: `\\b@export\\s+var\\s+${old}\\b`, replace: `@export var ${nw}`, description: 'export variable', fileType: '.gd' },
        { search: `\\b@onready\\s+var\\s+${old}\\b`, replace: `@onready var ${nw}`, description: 'onready variable', fileType: '.gd' },
        { search: `\\bself\\.${old}\\b`, replace: `self.${nw}`, description: 'self reference', fileType: '.gd' },
        { search: `(?<=\\.)${old}\\b(?!\\s*\\()`, replace: nw, description: 'property access', fileType: '.gd' },
        // Standalone usage (assignment, comparison, etc.) - be more careful
        { search: `(?<=^|[\\s(,=!<>+\\-*/])${old}(?=[\\s=,)\\]:.+\\-*/<>!])`, replace: nw, description: 'variable usage', fileType: '.gd' },
      ];

    case 'signal':
      return [
        { search: `\\bsignal\\s+${old}\\b`, replace: `signal ${nw}`, description: 'signal declaration', fileType: '.gd' },
        { search: `\\.${old}\\.emit\\(`, replace: `.${nw}.emit(`, description: 'signal emit', fileType: '.gd' },
        { search: `\\.${old}\\.connect\\(`, replace: `.${nw}.connect(`, description: 'signal connect', fileType: '.gd' },
        { search: `\\.${old}\\.disconnect\\(`, replace: `.${nw}.disconnect(`, description: 'signal disconnect', fileType: '.gd' },
        { search: `"${old}"`, replace: `"${nw}"`, description: 'string reference', fileType: '.gd' },
        { search: `signal="${old}"`, replace: `signal="${nw}"`, description: 'signal in scene connection', fileType: '.tscn' },
      ];

    case 'class':
      return [
        { search: `\\bclass_name\\s+${old}\\b`, replace: `class_name ${nw}`, description: 'class_name declaration', fileType: '.gd' },
        { search: `\\bextends\\s+${old}\\b`, replace: `extends ${nw}`, description: 'extends clause', fileType: '.gd' },
        { search: `\\b${old}\\.new\\(`, replace: `${nw}.new(`, description: 'constructor call', fileType: '.gd' },
        { search: `:\\s*${old}\\b`, replace: `: ${nw}`, description: 'type hint', fileType: '.gd' },
        { search: `->\\s*${old}\\b`, replace: `-> ${nw}`, description: 'return type hint', fileType: '.gd' },
        { search: `\\bas\\s+${old}\\b`, replace: `as ${nw}`, description: 'type cast', fileType: '.gd' },
        { search: `\\bis\\s+${old}\\b`, replace: `is ${nw}`, description: 'type check', fileType: '.gd' },
      ];

    case 'constant':
      return [
        { search: `\\bconst\\s+${old}\\b`, replace: `const ${nw}`, description: 'constant declaration', fileType: '.gd' },
        { search: `\\b${old}\\b`, replace: nw, description: 'constant usage', fileType: '.gd' },
      ];

    default:
      return [];
  }
}

/**
 * Recursively collect files with given extensions
 */
function collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip hidden directories, addons (can optionally include later), and .godot cache
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === '.godot') continue;
        results.push(...collectFiles(fullPath, extensions));
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return results;
}

/**
 * Remove duplicate changes on the same file+line
 */
function deduplicateChanges(changes: RenameChange[]): RenameChange[] {
  const seen = new Set<string>();
  const result: RenameChange[] = [];

  for (const change of changes) {
    const key = `${change.file}:${change.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(change);
    }
  }

  return result;
}
