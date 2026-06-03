/**
 * Extended Code Intelligence Tools (Tier 3 — Phase 2)
 *
 * Advanced GDScript code analysis and generation tools.
 *
 * Tools:
 *   - generate_docstring              (TS)  Generate ## doc comments for GDScript
 *   - generate_test_from_specification (TS)  Generate GUT tests from NL specs
 *   - analyze_test_coverage           (TS)  Match source functions to test methods
 *   - create_mock_node                (TS)  Generate mock classes for unit testing
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition } from '../types.js';
import { validateParams, projectPath, requiredString, optionalString } from '../utils/validation.js';

export function registerCodeIntelligenceTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    generateDocstring(ctx),
    generateTestFromSpecification(ctx),
    analyzeTestCoverage(ctx),
    createMockNode(ctx),
  ]);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface GDFunction {
  name: string;
  params: Array<{ name: string; type?: string; default?: string }>;
  returnType?: string;
  lineNumber: number;
  isStatic: boolean;
  isVirtual: boolean;
  existingDoc?: string;
}

interface GDSignal {
  name: string;
  params: Array<{ name: string; type?: string }>;
  lineNumber: number;
}

interface GDVariable {
  name: string;
  type?: string;
  isExport: boolean;
  lineNumber: number;
}

interface GDClass {
  name?: string;
  extends?: string;
  functions: GDFunction[];
  signals: GDSignal[];
  variables: GDVariable[];
}

/**
 * Parse a GDScript file to extract its structure
 */
function parseGDScript(content: string): GDClass {
  const lines = content.split('\n');
  const cls: GDClass = { functions: [], signals: [], variables: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Class name
    const classMatch = trimmed.match(/^class_name\s+(\w+)/);
    if (classMatch) {
      cls.name = classMatch[1];
      continue;
    }

    // Extends
    const extendsMatch = trimmed.match(/^extends\s+(\w+)/);
    if (extendsMatch) {
      cls.extends = extendsMatch[1];
      continue;
    }

    // Signals
    const signalMatch = trimmed.match(/^signal\s+(\w+)(?:\((.*?)\))?/);
    if (signalMatch) {
      const params = signalMatch[2]
        ? signalMatch[2].split(',').map(p => {
            const parts = p.trim().split(':').map(s => s.trim());
            return { name: parts[0], type: parts[1] };
          })
        : [];
      cls.signals.push({ name: signalMatch[1], params, lineNumber: i + 1 });
      continue;
    }

    // Variables (export and regular)
    const varMatch = trimmed.match(/^(@export(?:\([^)]*\))?\s+)?(?:var|const)\s+(\w+)\s*(?::\s*(\w+))?/);
    if (varMatch) {
      cls.variables.push({
        name: varMatch[2],
        type: varMatch[3],
        isExport: !!varMatch[1],
        lineNumber: i + 1,
      });
      continue;
    }

    // Functions
    const funcMatch = trimmed.match(/^(static\s+)?func\s+(\w+)\s*\((.*?)\)\s*(?:->\s*(\w+))?/);
    if (funcMatch) {
      const isStatic = !!funcMatch[1];
      const name = funcMatch[2];
      const paramStr = funcMatch[3];
      const returnType = funcMatch[4];

      const params = paramStr
        ? paramStr.split(',').filter(p => p.trim()).map(p => {
            const parts = p.trim().split(/\s*[:=]\s*/);
            const paramName = parts[0].trim();
            // Check for type annotation
            const typeMatch = p.trim().match(/:\s*(\w+)/);
            const defaultMatch = p.trim().match(/=\s*(.+)/);
            return {
              name: paramName,
              type: typeMatch ? typeMatch[1] : undefined,
              default: defaultMatch ? defaultMatch[1].trim() : undefined,
            };
          })
        : [];

      // Check for existing doc comment above
      let existingDoc: string | undefined;
      if (i > 0) {
        const docLines: string[] = [];
        for (let j = i - 1; j >= 0; j--) {
          const docLine = lines[j].trim();
          if (docLine.startsWith('##')) {
            docLines.unshift(docLine);
          } else {
            break;
          }
        }
        if (docLines.length > 0) {
          existingDoc = docLines.join('\n');
        }
      }

      cls.functions.push({
        name,
        params,
        returnType,
        lineNumber: i + 1,
        isStatic,
        isVirtual: name.startsWith('_'),
        existingDoc,
      });
    }
  }

  return cls;
}

/**
 * Generate a doc comment for a function
 */
function generateFunctionDoc(fn: GDFunction): string {
  const lines: string[] = [];

  // Description
  if (fn.isVirtual) {
    const friendlyName = fn.name.replace(/^_/, '');
    lines.push(`## Called when ${friendlyName} occurs.`);
  } else {
    lines.push(`## ${fn.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}.`);
  }

  // Parameters
  if (fn.params.length > 0) {
    lines.push('##');
    for (const p of fn.params) {
      const typeStr = p.type ? ` [${p.type}]` : '';
      const defaultStr = p.default ? ` (default: ${p.default})` : '';
      lines.push(`## @param ${p.name}${typeStr} —${defaultStr}`);
    }
  }

  // Return type
  if (fn.returnType && fn.returnType !== 'void') {
    lines.push(`## @return [${fn.returnType}]`);
  }

  return lines.join('\n');
}

/**
 * Recursively find all .gd files in a directory
 */
function findGDScripts(dir: string, result: string[] = []): string[] {
  if (!existsSync(dir)) return result;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        findGDScripts(full, result);
      } else if (entry.endsWith('.gd')) {
        result.push(full);
      }
    } catch {
      // Skip inaccessible entries
    }
  }
  return result;
}

// ─── generate_docstring ─────────────────────────────────────────────────────

function generateDocstring(ctx: ServerContext): ToolDefinition {
  return {
    name: 'generate_docstring',
    description: 'Generate ## doc comments for functions and classes in a GDScript file. Can target a specific function/class or generate docs for the entire file. Inserts comments above each function with @param and @return annotations.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        script_path: { type: 'string', description: 'Relative path to the GDScript file (e.g., "scripts/player.gd")' },
        target: { type: 'string', description: 'Specific function or class name to document (optional — documents entire file if omitted)' },
        overwrite: { type: 'boolean', description: 'Overwrite existing doc comments (default: false)' },
      },
      required: ['project_path', 'script_path'],
    },
    timeout: 10000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('scriptPath', 'script_path'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const scriptPath = args.scriptPath as string;
      const target = args.target as string | undefined;
      const overwrite = args.overwrite === true;

      const fullPath = join(projectDir, scriptPath);
      if (!existsSync(fullPath)) {
        return ctx.createErrorResponse(`Script not found: ${scriptPath}`);
      }

      const content = readFileSync(fullPath, 'utf-8');
      const parsed = parseGDScript(content);
      const lines = content.split('\n');

      // Determine which functions to document
      let functions = parsed.functions;
      if (target) {
        functions = functions.filter(f => f.name === target);
        if (functions.length === 0) {
          return ctx.createErrorResponse(
            `Function '${target}' not found in ${scriptPath}`,
            [`Available functions: ${parsed.functions.map(f => f.name).join(', ')}`]
          );
        }
      }

      // Skip functions that already have docs (unless overwrite)
      if (!overwrite) {
        functions = functions.filter(f => !f.existingDoc);
      }

      if (functions.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              script_path: scriptPath,
              message: 'All targeted functions already have doc comments (use overwrite: true to replace)',
              functions_documented: 0,
            }, null, 2),
          }],
        };
      }

      // Insert doc comments (process from bottom to top to preserve line numbers)
      const sorted = [...functions].sort((a, b) => b.lineNumber - a.lineNumber);
      const documented: string[] = [];

      for (const fn of sorted) {
        const doc = generateFunctionDoc(fn);
        const insertLine = fn.lineNumber - 1; // 0-indexed

        // Remove existing doc if overwriting
        if (overwrite && fn.existingDoc) {
          const docLineCount = fn.existingDoc.split('\n').length;
          lines.splice(insertLine - docLineCount, docLineCount);
          // Adjust insert position
          lines.splice(insertLine - docLineCount, 0, doc);
        } else {
          lines.splice(insertLine, 0, doc);
        }

        documented.push(fn.name);
      }

      writeFileSync(fullPath, lines.join('\n'), 'utf-8');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            script_path: scriptPath,
            functions_documented: documented.length,
            functions: documented,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── generate_test_from_specification ────────────────────────────────────────

function generateTestFromSpecification(ctx: ServerContext): ToolDefinition {
  return {
    name: 'generate_test_from_specification',
    description: 'Generate GUT (Godot Unit Test) test files from natural language behavior specifications. Each specification becomes a test method with appropriate assertions.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        output_path: { type: 'string', description: 'Output path for the test file (relative, e.g., "test/unit/test_player.gd")' },
        class_name: { type: 'string', description: 'Name of the class under test (e.g., "Player")' },
        script_path: { type: 'string', description: 'Path to the script under test (e.g., "scripts/player.gd") for preload' },
        specifications: {
          type: 'array',
          description: 'Array of behavior specifications',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'What the test verifies (e.g., "should initialize with 100 health")' },
              expected_behavior: { type: 'string', description: 'Expected behavior details (e.g., "health equals 100, is_alive is true")' },
            },
            required: ['description'],
          },
        },
        setup_code: { type: 'string', description: 'GDScript code to run in before_each (e.g., "instance = Player.new()")' },
        teardown_code: { type: 'string', description: 'GDScript code to run in after_each (e.g., "instance.free()")' },
      },
      required: ['project_path', 'output_path', 'class_name', 'specifications'],
    },
    timeout: 10000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('outputPath', 'output_path'),
        requiredString('className', 'class_name'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const outputPath = args.outputPath as string;
      const className = args.className as string;
      const scriptPath = args.scriptPath as string | undefined;
      const specifications: Array<{ description: string; expected_behavior?: string }> = args.specifications || [];
      const setupCode = args.setupCode as string | undefined;
      const teardownCode = args.teardownCode as string | undefined;

      if (specifications.length === 0) {
        return ctx.createErrorResponse('At least one specification is required');
      }

      // Generate test file
      const lines: string[] = [];
      lines.push(`extends GutTest`);
      lines.push(`## Auto-generated tests for ${className}`);
      lines.push('');

      // Preload class under test
      if (scriptPath) {
        lines.push(`const ${className}Script = preload("res://${scriptPath}")`);
        lines.push('');
      }

      lines.push(`var _instance`);
      for (const variableName of inferSetupVariables(className, setupCode, teardownCode)) {
        lines.push(`var ${variableName}`);
      }
      lines.push('');

      // Setup
      lines.push('func before_each():');
      if (setupCode) {
        for (const codeLine of setupCode.split('\n')) {
          lines.push(`\t${codeLine}`);
        }
      } else {
        lines.push(`\t_instance = ${className}.new()`);
        lines.push('\tadd_child_autofree(_instance)');
      }
      lines.push('');

      // Teardown
      if (teardownCode) {
        lines.push('func after_each():');
        for (const codeLine of teardownCode.split('\n')) {
          lines.push(`\t${codeLine}`);
        }
        lines.push('');
      }

      // Generate test methods
      for (const spec of specifications) {
        const testName = specToTestName(spec.description);
        lines.push(`func ${testName}():`);
        lines.push(`\t## ${spec.description}`);

        const assertions = generateAssertions(spec.description, spec.expected_behavior || '', className);
        for (const assertion of assertions) {
          lines.push(`\t${assertion}`);
        }

        if (assertions.length === 0) {
          lines.push(`\t# TODO: Implement test for: ${spec.description}`);
          lines.push('\tpending("Not yet implemented")');
        }

        lines.push('');
      }

      // Write file
      const fullOutputPath = join(projectDir, outputPath);
      const outputDir = dirname(fullOutputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(fullOutputPath, lines.join('\n'), 'utf-8');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            output_path: outputPath,
            class_name: className,
            test_count: specifications.length,
            tests: specifications.map(s => specToTestName(s.description)),
          }, null, 2),
        }],
      };
    },
  };
}

/**
 * Convert a specification description to a test function name
 */
function specToTestName(description: string): string {
  let name = description
    .toLowerCase()
    .replace(/should\s+/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!name.startsWith('test_')) {
    name = `test_${name}`;
  }
  return name;
}

/**
 * Generate assertions from spec description and expected behavior
 */
function generateAssertions(description: string, expected: string, className: string): string[] {
  const assertions: string[] = [];
  const combined = `${description} ${expected}`.toLowerCase();

  // Pattern: "X equals Y" or "X is Y" or "X == Y"
  const equalsPatterns = expected.match(/(\w+)\s+(?:equals?|is|==)\s+(.+?)(?:,|$)/gi);
  if (equalsPatterns) {
    for (const pattern of equalsPatterns) {
      const match = pattern.match(/(\w+)\s+(?:equals?|is|==)\s+(.+?)(?:,|$)/i);
      if (match) {
        const prop = match[1].trim();
        const value = match[2].trim();
        assertions.push(`assert_eq(_instance.${prop}, ${value}, "${prop} should be ${value}")`);
      }
    }
  }

  // Pattern: "should be true" / "should be false"
  if (combined.includes('should be true') || combined.includes('is true')) {
    const propMatch = combined.match(/(\w+)\s+(?:should be|is)\s+true/i);
    if (propMatch) {
      assertions.push(`assert_true(_instance.${propMatch[1]}, "${propMatch[1]} should be true")`);
    }
  }
  if (combined.includes('should be false') || combined.includes('is false')) {
    const propMatch = combined.match(/(\w+)\s+(?:should be|is)\s+false/i);
    if (propMatch) {
      assertions.push(`assert_false(_instance.${propMatch[1]}, "${propMatch[1]} should be false")`);
    }
  }

  // Pattern: "should not be null" / "should exist"
  if (combined.includes('not null') || combined.includes('not be null') || combined.includes('should exist')) {
    assertions.push(`assert_not_null(_instance, "${className} instance should not be null")`);
  }

  // Pattern: "should emit signal X"
  const signalMatch = combined.match(/emit.*signal\s+(\w+)/i);
  if (signalMatch) {
    assertions.push(`watch_signals(_instance)`);
    assertions.push(`# TODO: trigger action that emits ${signalMatch[1]}`);
    assertions.push(`assert_signal_emitted(_instance, "${signalMatch[1]}")`);
  }

  // Pattern: "should have N items" / "count is N" / "size is N"
  const countMatch = combined.match(/(?:have|count|size|length)\s+(?:is\s+)?(\d+)/i);
  if (countMatch) {
    assertions.push(`# TODO: assert collection size equals ${countMatch[1]}`);
  }

  // Pattern: "should throw" / "should error"
  if (combined.includes('should throw') || combined.includes('should error')) {
    assertions.push('# TODO: assert error is raised');
  }

  // Pattern: "should return X"
  const returnMatch = combined.match(/should return\s+(.+?)(?:\.|,|$)/i);
  if (returnMatch) {
    assertions.push(`# TODO: assert return value equals ${returnMatch[1].trim()}`);
  }

  return assertions;
}

function inferSetupVariables(className: string, setupCode?: string, teardownCode?: string): string[] {
  const combined = `${setupCode || ''}\n${teardownCode || ''}`;
  const lowerClassName = className.charAt(0).toLowerCase() + className.slice(1);
  const assignmentPattern = new RegExp(`(^|\\n)\\s*${lowerClassName}\\s*=`);
  return assignmentPattern.test(combined) ? [lowerClassName] : [];
}

// ─── analyze_test_coverage ──────────────────────────────────────────────────

function analyzeTestCoverage(ctx: ServerContext): ToolDefinition {
  return {
    name: 'analyze_test_coverage',
    description: 'Analyze which functions in GDScript source files have corresponding test methods. Scans source scripts for function declarations and test directories for test_* methods, matching by naming convention.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        script_path: { type: 'string', description: 'Specific script to analyze (optional — analyzes all if omitted)' },
        test_dir: { type: 'string', description: 'Test directory relative to project (default: "test")' },
        exclude_virtual: { type: 'boolean', description: 'Exclude virtual functions like _ready, _process (default: true)' },
      },
      required: ['project_path'],
    },
    timeout: 15000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const testDir = args.testDir || 'test';
      const excludeVirtual = args.excludeVirtual !== false;
      const specificScript = args.scriptPath as string | undefined;

      // Collect source scripts
      let sourceScripts: string[];
      if (specificScript) {
        const fullPath = join(projectDir, specificScript);
        if (!existsSync(fullPath)) {
          return ctx.createErrorResponse(`Script not found: ${specificScript}`);
        }
        sourceScripts = [fullPath];
      } else {
        sourceScripts = findGDScripts(projectDir).filter(p => {
          const rel = relative(projectDir, p);
          return !rel.startsWith(testDir) && !rel.startsWith('addons') && !rel.startsWith('.');
        });
      }

      // Collect test scripts
      const testDirPath = join(projectDir, testDir);
      const testScripts = findGDScripts(testDirPath);

      // Parse all test files to extract test method names
      const testMethods = new Set<string>();
      const testMethodsByFile: Record<string, string[]> = {};

      for (const testFile of testScripts) {
        const content = readFileSync(testFile, 'utf-8');
        const parsed = parseGDScript(content);
        const methods = parsed.functions
          .filter(f => f.name.startsWith('test_'))
          .map(f => f.name);

        testMethodsByFile[relative(projectDir, testFile)] = methods;
        for (const m of methods) {
          testMethods.add(m);
        }
      }

      // Virtual functions to exclude
      const virtualFunctions = new Set([
        '_init', '_ready', '_process', '_physics_process', '_input',
        '_unhandled_input', '_unhandled_key_input', '_notification',
        '_enter_tree', '_exit_tree', '_draw', '_gui_input',
        '_get_configuration_warnings',
      ]);

      // Analyze each source script
      interface ScriptCoverage {
        script: string;
        total_functions: number;
        covered_functions: string[];
        uncovered_functions: string[];
        coverage_percent: number;
      }

      const results: ScriptCoverage[] = [];
      let totalFunctions = 0;
      let totalCovered = 0;

      for (const scriptFile of sourceScripts) {
        const content = readFileSync(scriptFile, 'utf-8');
        const parsed = parseGDScript(content);
        const relPath = relative(projectDir, scriptFile);

        let functions = parsed.functions.map(f => f.name);
        if (excludeVirtual) {
          functions = functions.filter(f => !virtualFunctions.has(f));
        }

        const covered: string[] = [];
        const uncovered: string[] = [];

        for (const fn of functions) {
          // Match patterns: test_functionName, test_ClassName_functionName
          const testPatterns = [
            `test_${fn}`,
            `test_${basename(scriptFile, '.gd')}_${fn}`,
          ];
          const isCovered = testPatterns.some(p => testMethods.has(p));
          if (isCovered) {
            covered.push(fn);
          } else {
            uncovered.push(fn);
          }
        }

        totalFunctions += functions.length;
        totalCovered += covered.length;

        results.push({
          script: relPath,
          total_functions: functions.length,
          covered_functions: covered,
          uncovered_functions: uncovered,
          coverage_percent: functions.length > 0
            ? Math.round((covered.length / functions.length) * 100)
            : 100,
        });
      }

      const overallCoverage = totalFunctions > 0
        ? Math.round((totalCovered / totalFunctions) * 100)
        : 100;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            overall_coverage_percent: overallCoverage,
            total_functions: totalFunctions,
            covered_functions: totalCovered,
            uncovered_functions: totalFunctions - totalCovered,
            source_scripts_analyzed: results.length,
            test_scripts_found: testScripts.length,
            scripts: results,
            test_files: testMethodsByFile,
          }, null, 2),
        }],
      };
    },
  };
}

// ─── create_mock_node ───────────────────────────────────────────────────────

function createMockNode(ctx: ServerContext): ToolDefinition {
  return {
    name: 'create_mock_node',
    description: 'Generate a GDScript mock class that extends a given base class. Overrides specified methods with configurable return values and tracks all calls for assertion-based verification in tests.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Path to the Godot project directory' },
        output_path: { type: 'string', description: 'Output path for the mock file (relative, e.g., "test/mocks/mock_player.gd")' },
        base_class: { type: 'string', description: 'Class to mock (e.g., "Node2D", "CharacterBody2D", or a script class name)' },
        class_name: { type: 'string', description: 'Name for the mock class (e.g., "MockPlayer")' },
        methods_to_mock: {
          type: 'array',
          description: 'Methods to override with mock implementations',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Method name' },
              params: {
                type: 'array',
                description: 'Parameter names',
                items: { type: 'string' },
              },
              return_value: { type: 'string', description: 'GDScript expression for the return value (e.g., "true", "0", "null")' },
            },
            required: ['name'],
          },
        },
        signals_to_track: {
          type: 'array',
          description: 'Signal names to track emissions',
          items: { type: 'string' },
        },
      },
      required: ['project_path', 'output_path', 'base_class', 'class_name'],
    },
    timeout: 10000,
    handler: async (args: any) => {
      args = ctx.normalizeParameters(args);

      const v = validateParams(args, [
        projectPath('projectPath'),
        requiredString('outputPath', 'output_path'),
        requiredString('baseClass', 'base_class'),
        requiredString('className', 'class_name'),
      ], ctx.createErrorResponse);
      if (!v.valid) return v.error!;

      const projectDir = args.projectPath as string;
      const outputPath = args.outputPath as string;
      const baseClass = args.baseClass as string;
      const mockClassName = args.className as string;
      const methodsToMock: Array<{ name: string; params?: string[]; return_value?: string }> =
        args.methodsToMock || [];
      const signalsToTrack: string[] = args.signalsToTrack || [];

      // Generate mock class
      const lines: string[] = [];
      lines.push(`extends ${baseClass}`);
      lines.push(`class_name ${mockClassName}`);
      lines.push(`## Auto-generated mock for ${baseClass}`);
      lines.push('');

      // Call tracking
      lines.push('## Call tracking — each entry is { "method": String, "args": Array }');
      lines.push('var _calls: Array[Dictionary] = []');
      lines.push('');

      // Configurable return values
      lines.push('## Override return values at runtime: _return_values["method_name"] = value');
      lines.push('var _return_values: Dictionary = {}');
      lines.push('');

      // Signal tracking
      if (signalsToTrack.length > 0) {
        for (const sig of signalsToTrack) {
          if (!isInheritedSignal(baseClass, sig)) {
            lines.push(`signal ${sig}`);
          }
        }
        lines.push('');
        lines.push('## Signal emission tracking');
        lines.push('var _emitted_signals: Array[Dictionary] = []');
        lines.push('');
        lines.push('func _ready() -> void:');
        for (const sig of signalsToTrack) {
          lines.push(`\t${sig}.connect(_on_signal_emitted.bind("${sig}"))`);
        }
        lines.push('');
        lines.push('func _on_signal_emitted(_payload: Variant = null, signal_name: String = "") -> void:');
        lines.push('\t_emitted_signals.append({"signal": signal_name, "time": Time.get_ticks_msec()})');
        lines.push('');
      }

      // Mock methods
      for (const method of methodsToMock) {
        const params = method.params || [];
        const paramStr = params.join(', ');
        const returnValue = method.return_value || 'null';

        lines.push(`func ${method.name}(${paramStr}):`);
        lines.push(`\t_calls.append({"method": "${method.name}", "args": [${paramStr}]})`);
        lines.push(`\tif _return_values.has("${method.name}"):`);
        lines.push(`\t\treturn _return_values["${method.name}"]`);
        lines.push(`\treturn ${returnValue}`);
        lines.push('');
      }

      // Assertion helpers
      lines.push('# ─── Assertion Helpers ─────────────────────────────────────────────────');
      lines.push('');
      lines.push('## Returns true if the method was called at least once');
      lines.push('func assert_called(method_name: String) -> bool:');
      lines.push('\tfor call in _calls:');
      lines.push('\t\tif call["method"] == method_name:');
      lines.push('\t\t\treturn true');
      lines.push('\treturn false');
      lines.push('');
      lines.push('## Returns true if the method was called with the given arguments');
      lines.push('func assert_called_with(method_name: String, expected_args: Array) -> bool:');
      lines.push('\tfor call in _calls:');
      lines.push('\t\tif call["method"] == method_name and call["args"] == expected_args:');
      lines.push('\t\t\treturn true');
      lines.push('\treturn false');
      lines.push('');
      lines.push('## Returns the number of times a method was called');
      lines.push('func call_count(method_name: String) -> int:');
      lines.push('\tvar count := 0');
      lines.push('\tfor call in _calls:');
      lines.push('\t\tif call["method"] == method_name:');
      lines.push('\t\t\tcount += 1');
      lines.push('\treturn count');
      lines.push('');
      lines.push('## Returns all arguments from all calls to a method');
      lines.push('func get_calls(method_name: String) -> Array:');
      lines.push('\tvar result := []');
      lines.push('\tfor call in _calls:');
      lines.push('\t\tif call["method"] == method_name:');
      lines.push('\t\t\tresult.append(call["args"])');
      lines.push('\treturn result');
      lines.push('');
      lines.push('## Reset all call tracking');
      lines.push('func reset_mock() -> void:');
      lines.push('\t_calls.clear()');
      if (signalsToTrack.length > 0) {
        lines.push('\t_emitted_signals.clear()');
      }
      lines.push('');

      // Write file
      const fullOutputPath = join(projectDir, outputPath);
      const outputDir = dirname(fullOutputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(fullOutputPath, lines.join('\n'), 'utf-8');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            output_path: outputPath,
            mock_class: mockClassName,
            base_class: baseClass,
            mocked_methods: methodsToMock.map(m => m.name),
            tracked_signals: signalsToTrack,
            features: [
              'Call tracking (_calls array)',
              'Configurable return values (_return_values dictionary)',
              'assert_called(method) helper',
              'assert_called_with(method, args) helper',
              'call_count(method) helper',
              'get_calls(method) helper',
              'reset_mock() to clear tracking',
              ...(signalsToTrack.length > 0 ? ['Signal emission tracking'] : []),
            ],
          }, null, 2),
        }],
      };
    },
  };
}

function isInheritedSignal(baseClass: string, signalName: string): boolean {
  const inheritedSignals: Record<string, Set<string>> = {
    Area2D: new Set([
      'area_entered',
      'area_exited',
      'area_shape_entered',
      'area_shape_exited',
      'body_entered',
      'body_exited',
      'body_shape_entered',
      'body_shape_exited',
      'input_event',
      'mouse_entered',
      'mouse_exited',
    ]),
  };

  return inheritedSignals[baseClass]?.has(signalName) || false;
}
