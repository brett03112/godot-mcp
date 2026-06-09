/**
 * Test tooling expansion tools for Phase 4.3.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { spawn, spawnSync } from 'child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { tmpdir } from 'os';
import { ToolRegistry } from '../registry.js';
import { ServerContext, ToolDefinition, ToolResponse } from '../types.js';

interface TestFileInfo {
  path: string;
  absolute_path: string;
  tests: string[];
  framework: 'gut' | 'gdunit4';
}

interface CommandPlan {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
}

const GUT_REPO = 'https://github.com/bitwes/Gut.git';
const GDUNIT4_REPO = 'https://github.com/godot-gdunit-labs/gdUnit4.git';

export function registerTestToolingTools(registry: ToolRegistry, ctx: ServerContext): void {
  registry.registerAll([
    gutInstallOrUpdate(ctx),
    gutDiscoverTests(ctx),
    gutRunTestFile(ctx),
    gutRunChangedTests(ctx),
    gutRunWithCoverage(ctx),
    gdUnit4InstallOrUpdate(ctx),
    gdUnit4RunTests(ctx),
    gdUnit4DiscoverTests(ctx),
    gdUnit4GenerateTest(ctx),
    testWatchPlan(ctx),
    failureToPatchPlan(ctx),
  ]);
}

function gutInstallOrUpdate(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gut_install_or_update',
    description: 'Detect, install, or update the GUT addon under addons/gut. Existing addons are preserved unless overwrite is true.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path'],
    },
    timeout: 120000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      return installOrUpdateAddon(target.projectRoot, {
        framework: 'gut',
        addonDir: 'gut',
        markerPath: join('addons', 'gut', 'gut_cmdln.gd'),
        repo: GUT_REPO,
        dryRun: args.dryRun ?? false,
        allowNetworkInstall: args.allowNetworkInstall ?? false,
        overwrite: args.overwrite ?? false,
        version: args.version,
      });
    },
  };
}

function gutDiscoverTests(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gut_discover_tests',
    description: 'Discover GUT test scripts and test methods in a Godot project.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const testDir = args.testDir || 'test';
      const testFiles = discoverTests(target.projectRoot, testDir, 'gut');
      return jsonResponse({
        status: 'success',
        framework: 'gut',
        addon_installed: isGutInstalled(target.projectRoot),
        test_dir: testDir,
        test_files: stripAbsolutePaths(testFiles),
        test_count: testFiles.reduce((sum, file) => sum + file.tests.length, 0),
      });
    },
  };
}

function gutRunTestFile(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gut_run_test_file',
    description: 'Run one GUT test file through the Godot command-line runner, or return the command in dry-run mode.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path', 'test_file'],
    },
    timeout: 180000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.testFile) return failure('test_file is required');
      const relTestFile = resolveProjectRelative(target.projectRoot, args.testFile);
      if ('error' in relTestFile) return failure(relTestFile.error);
      if (!existsSync(join(target.projectRoot, relTestFile.relativePath))) {
        return failure(`test_file not found: ${args.testFile}`);
      }
      if (!isGutInstalled(target.projectRoot)) {
        return failure('GUT framework not found in addons/gut');
      }

      const command = await buildGutCommand(ctx, target.projectRoot, {
        testFile: relTestFile.relativePath,
        verbosity: args.verbosity,
        includeJunit: args.includeJunit,
        junitOutputPath: args.junitOutputPath,
        exitOnFinish: args.exitOnFinish,
      });

      if (args.dryRun ?? false) {
        return jsonResponse({
          status: 'dry_run',
          framework: 'gut',
          command,
        });
      }

      const result = await runCommand(command, args.timeoutMs ?? 120000);
      const parsed = parseTestRunnerOutput(result);
      return jsonResponse({
        status: parsed.success ? 'success' : 'failed',
        framework: 'gut',
        command,
        ...parsed,
      }, !parsed.success);
    },
  };
}

function gutRunChangedTests(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gut_run_changed_tests',
    description: 'Select and run GUT tests related to changed project files.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path', 'changed_files'],
    },
    timeout: 240000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!Array.isArray(args.changedFiles)) return failure('changed_files is required');
      const testFiles = discoverTests(target.projectRoot, args.testDir || 'test', 'gut');
      const selected = selectTestsForChangedFiles(target.projectRoot, args.changedFiles, testFiles);
      const commands: CommandPlan[] = [];
      for (const testFile of selected) {
        commands.push(await buildGutCommand(ctx, target.projectRoot, {
          testFile: testFile.path,
          verbosity: args.verbosity,
          includeJunit: args.includeJunit,
          exitOnFinish: args.exitOnFinish,
        }));
      }

      if (args.dryRun ?? false) {
        return jsonResponse({
          status: 'dry_run',
          framework: 'gut',
          changed_files: args.changedFiles,
          selected_tests: stripAbsolutePaths(selected),
          commands,
        });
      }
      if (!isGutInstalled(target.projectRoot)) {
        return failure('GUT framework not found in addons/gut');
      }

      const results = [];
      for (const command of commands) {
        const result = await runCommand(command, args.timeoutMs ?? 120000);
        results.push({ command, ...parseTestRunnerOutput(result) });
      }
      const success = results.every((result) => result.success);
      return jsonResponse({
        status: success ? 'success' : 'failed',
        framework: 'gut',
        changed_files: args.changedFiles,
        selected_tests: stripAbsolutePaths(selected),
        results,
      }, !success);
    },
  };
}

function gutRunWithCoverage(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gut_run_with_coverage',
    description: 'Run or plan GUT test execution with coverage reporting when an external coverage tool is present.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path'],
    },
    timeout: 180000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const coverageTool = detectCoverageTool(target.projectRoot);
      const fallbackCommand = await buildGutCommand(ctx, target.projectRoot, {
        testDir: args.testDir || 'test',
        verbosity: args.verbosity,
        includeJunit: true,
        junitOutputPath: args.junitOutputPath || 'user://gut_results.xml',
        exitOnFinish: args.exitOnFinish,
      });
      if (!coverageTool) {
        return jsonResponse({
          status: 'unavailable',
          framework: 'gut',
          reason: 'GUT does not provide built-in GDScript coverage reporting; no external coverage addon or artifact was detected.',
          fallback_command: fallbackCommand,
          coverage_tool: null,
        });
      }
      return jsonResponse({
        status: 'planned',
        framework: 'gut',
        coverage_tool: coverageTool,
        command: fallbackCommand,
        note: 'Run the detected coverage tool around this GUT command and collect its report artifact.',
      });
    },
  };
}

function gdUnit4InstallOrUpdate(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gdunit4_install_or_update',
    description: 'Detect, install, or update the gdUnit4 addon under addons/gdUnit4. Existing addons are preserved unless overwrite is true.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path'],
    },
    timeout: 120000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      return installOrUpdateAddon(target.projectRoot, {
        framework: 'gdunit4',
        addonDir: 'gdUnit4',
        markerPath: join('addons', 'gdUnit4', 'plugin.cfg'),
        repo: GDUNIT4_REPO,
        dryRun: args.dryRun ?? false,
        allowNetworkInstall: args.allowNetworkInstall ?? false,
        overwrite: args.overwrite ?? false,
        version: args.version,
      });
    },
  };
}

function gdUnit4RunTests(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gdunit4_run_tests',
    description: 'Run gdUnit4 tests or return the gdUnit4 command in dry-run mode.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path'],
    },
    timeout: 240000,
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const command = await buildGdUnitCommand(ctx, target.projectRoot, args.testDir || args.testFile || 'test');
      if (args.dryRun ?? false) {
        return jsonResponse({
          status: 'dry_run',
          framework: 'gdunit4',
          addon_installed: isGdUnitInstalled(target.projectRoot),
          command,
        });
      }
      if (!isGdUnitInstalled(target.projectRoot)) {
        return failure('gdUnit4 framework not found in addons/gdUnit4');
      }
      const result = await runCommand(command, args.timeoutMs ?? 180000);
      const parsed = parseTestRunnerOutput(result);
      return jsonResponse({
        status: parsed.success ? 'success' : 'failed',
        framework: 'gdunit4',
        command,
        ...parsed,
      }, !parsed.success);
    },
  };
}

function gdUnit4DiscoverTests(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gdunit4_discover_tests',
    description: 'Discover gdUnit4-style test scripts and test methods in a Godot project.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      const testDir = args.testDir || 'test';
      const testFiles = discoverTests(target.projectRoot, testDir, 'gdunit4');
      return jsonResponse({
        status: 'success',
        framework: 'gdunit4',
        addon_installed: isGdUnitInstalled(target.projectRoot),
        test_dir: testDir,
        test_files: stripAbsolutePaths(testFiles),
        test_count: testFiles.reduce((sum, file) => sum + file.tests.length, 0),
      });
    },
  };
}

function gdUnit4GenerateTest(ctx: ServerContext): ToolDefinition {
  return {
    name: 'gdunit4_generate_test',
    description: 'Generate a gdUnit4 test script template for a GDScript source file.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path', 'source_path', 'output_path'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.sourcePath) return failure('source_path is required');
      if (!args.outputPath) return failure('output_path is required');
      const source = resolveProjectRelative(target.projectRoot, args.sourcePath);
      if ('error' in source) return failure(source.error);
      const output = resolveProjectRelative(target.projectRoot, args.outputPath);
      if ('error' in output) return failure(output.error);
      const className = args.className || pascalCase(basename(source.relativePath, '.gd'));
      const testName = normalizeTestName(args.testName || `${basename(source.relativePath, '.gd')}_smoke`);
      const content = generateGdUnitTestContent(source.relativePath, className, testName);
      if (args.dryRun ?? false) {
        return jsonResponse({
          status: 'dry_run',
          framework: 'gdunit4',
          source_path: source.relativePath,
          output_path: output.relativePath,
          content,
        });
      }
      mkdirSync(dirname(join(target.projectRoot, output.relativePath)), { recursive: true });
      writeFileSync(join(target.projectRoot, output.relativePath), content, 'utf8');
      return jsonResponse({
        status: 'success',
        framework: 'gdunit4',
        source_path: source.relativePath,
        output_path: output.relativePath,
        content,
      });
    },
  };
}

function testWatchPlan(ctx: ServerContext): ToolDefinition {
  return {
    name: 'test_watch_plan',
    description: 'Recommend which Godot test tools to run after a set of changed files.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path', 'changed_files'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!Array.isArray(args.changedFiles)) return failure('changed_files is required');
      const gutTests = discoverTests(target.projectRoot, args.testDir || 'test', 'gut');
      const gdUnitTests = discoverTests(target.projectRoot, args.testDir || 'test', 'gdunit4');
      const selectedGut = selectTestsForChangedFiles(target.projectRoot, args.changedFiles, gutTests);
      const selectedGdUnit = selectTestsForChangedFiles(target.projectRoot, args.changedFiles, gdUnitTests);
      const recommendedCommands: any[] = [];
      const reasons: string[] = [];

      if (selectedGut.length > 0 || args.changedFiles.some((file: string) => isSourceLike(file))) {
        recommendedCommands.push({
          tool: 'gut_run_changed_tests',
          args: {
            project_path: target.projectRoot,
            changed_files: args.changedFiles,
            dry_run: false,
          },
        });
        reasons.push(`GUT can cover changed source/test files: ${args.changedFiles.join(', ')}`);
      }
      if (selectedGdUnit.length > 0 && isGdUnitInstalled(target.projectRoot)) {
        recommendedCommands.push({
          tool: 'gdunit4_run_tests',
          args: {
            project_path: target.projectRoot,
            test_dir: args.testDir || 'test',
          },
        });
        reasons.push('gdUnit4 tests are present and the addon is installed.');
      }
      if (args.changedFiles.some((file: string) => file.endsWith('.ts') || file.endsWith('.mjs'))) {
        recommendedCommands.push({ command: 'npm test' });
        reasons.push('TypeScript or Node test harness files changed.');
      }
      if (args.changedFiles.some((file: string) => file.endsWith('.tscn') || file.endsWith('.gd'))) {
        recommendedCommands.push({
          command: 'Godot headless editor smoke',
          args: ['--headless', '--editor', '--path', target.projectRoot, '--quit'],
        });
        reasons.push('Godot scripts or scenes changed, so an editor parse/load smoke is useful.');
      }

      return jsonResponse({
        status: 'success',
        changed_files: args.changedFiles,
        selected_gut_tests: stripAbsolutePaths(selectedGut),
        selected_gdunit4_tests: stripAbsolutePaths(selectedGdUnit),
        recommended_commands: recommendedCommands,
        reasons,
      });
    },
  };
}

function failureToPatchPlan(ctx: ServerContext): ToolDefinition {
  return {
    name: 'failure_to_patch_plan',
    description: 'Map test failure output to likely project files, test files, and next investigation commands.',
    inputSchema: {
      type: 'object',
      properties: testToolProperties(),
      required: ['project_path', 'failure_output'],
    },
    handler: async (rawArgs) => {
      const args = normalizeArgs(ctx.normalizeParameters(rawArgs || {}));
      const target = resolveProjectRoot(ctx, args.projectPath);
      if ('error' in target) return failure(target.error);
      if (!args.failureOutput) return failure('failure_output is required');
      const references = extractPathReferences(args.failureOutput);
      const patchCandidates = references
        .filter((entry) => !isTestPath(entry.path) && !entry.path.startsWith('addons/'))
        .map((entry) => ({
          ...entry,
          exists: existsSync(join(target.projectRoot, entry.path)),
          reason: classifyFailureLine(args.failureOutput, entry.path),
        }));
      const testContext = references
        .filter((entry) => isTestPath(entry.path))
        .map((entry) => ({
          ...entry,
          exists: existsSync(join(target.projectRoot, entry.path)),
        }));
      return jsonResponse({
        status: 'success',
        patch_candidates: uniquePathEntries(patchCandidates),
        test_context: uniquePathEntries(testContext),
        suggested_next_commands: [
          { tool: 'gut_run_changed_tests', args: { project_path: target.projectRoot, changed_files: patchCandidates.map((entry) => entry.path), dry_run: true } },
          { tool: 'test_watch_plan', args: { project_path: target.projectRoot, changed_files: patchCandidates.map((entry) => entry.path) } },
        ],
      });
    },
  };
}

function testToolProperties(): Record<string, any> {
  return {
    project_path: { type: 'string' },
    test_dir: { type: 'string' },
    test_file: { type: 'string' },
    changed_files: { type: 'array', items: { type: 'string' } },
    failure_output: { type: 'string' },
    source_path: { type: 'string' },
    output_path: { type: 'string' },
    class_name: { type: 'string' },
    test_name: { type: 'string' },
    version: { type: 'string' },
    verbosity: { type: 'number' },
    timeout_ms: { type: 'number' },
    include_junit: { type: 'boolean' },
    junit_output_path: { type: 'string' },
    exit_on_finish: { type: 'boolean' },
    dry_run: { type: 'boolean' },
    allow_network_install: { type: 'boolean' },
    overwrite: { type: 'boolean' },
  };
}

function normalizeArgs(args: any): any {
  return {
    ...args,
    projectPath: args.projectPath ?? args.project_path,
    testDir: args.testDir ?? args.test_dir,
    testFile: args.testFile ?? args.test_file,
    changedFiles: args.changedFiles ?? args.changed_files,
    failureOutput: args.failureOutput ?? args.failure_output,
    sourcePath: args.sourcePath ?? args.source_path,
    outputPath: args.outputPath ?? args.output_path,
    className: args.className ?? args.class_name,
    testName: args.testName ?? args.test_name,
    version: args.version,
    verbosity: args.verbosity,
    timeoutMs: args.timeoutMs ?? args.timeout_ms,
    includeJunit: args.includeJunit ?? args.include_junit,
    junitOutputPath: args.junitOutputPath ?? args.junit_output_path,
    exitOnFinish: args.exitOnFinish ?? args.exit_on_finish,
    dryRun: args.dryRun ?? args.dry_run,
    allowNetworkInstall: args.allowNetworkInstall ?? args.allow_network_install,
    overwrite: args.overwrite,
  };
}

function resolveProjectRoot(ctx: ServerContext, projectPath: string | undefined): { projectRoot: string } | { error: string } {
  if (!projectPath) return { error: 'project_path is required' };
  if (!ctx.validatePath(projectPath)) return { error: 'Invalid project_path' };
  const projectRoot = resolve(projectPath);
  if (!existsSync(join(projectRoot, 'project.godot'))) {
    return { error: `Invalid project_path: ${projectPath} does not contain project.godot` };
  }
  return { projectRoot };
}

function resolveProjectRelative(projectRoot: string, candidate: string): { relativePath: string } | { error: string } {
  const local = normalizeResourcePath(candidate);
  const absolute = isAbsolute(local) ? resolve(local) : resolve(projectRoot, local);
  const rel = relative(projectRoot, absolute);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    return { error: `Path escapes project: ${candidate}` };
  }
  return { relativePath: rel.replace(/\\/g, '/') };
}

function normalizeResourcePath(value: string): string {
  return String(value).replace(/^res:\/\//, '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function toResPath(value: string): string {
  return `res://${normalizeResourcePath(value)}`;
}

function isGutInstalled(projectRoot: string): boolean {
  return existsSync(join(projectRoot, 'addons', 'gut', 'gut_cmdln.gd'));
}

function isGdUnitInstalled(projectRoot: string): boolean {
  return existsSync(join(projectRoot, 'addons', 'gdUnit4', 'plugin.cfg'));
}

function installOrUpdateAddon(projectRoot: string, options: {
  framework: 'gut' | 'gdunit4';
  addonDir: string;
  markerPath: string;
  repo: string;
  dryRun: boolean;
  allowNetworkInstall: boolean;
  overwrite: boolean;
  version?: string;
}): ToolResponse {
  const addonPath = join(projectRoot, 'addons', options.addonDir);
  const markerAbsolute = join(projectRoot, options.markerPath);
  const installed = existsSync(markerAbsolute);
  const version = readAddonVersion(addonPath);
  const installPlan = {
    source: 'git',
    repository: options.repo,
    version: options.version || 'default branch',
    target: addonPath,
    command: `git clone --depth 1 ${options.version ? `--branch ${options.version} ` : ''}${options.repo}`,
    requires_network: true,
  };
  if (installed && !options.overwrite) {
    return jsonResponse({
      status: 'installed',
      framework: options.framework,
      addon_path: addonPath,
      version,
      install_plan: installPlan,
      note: 'Existing addon preserved. Pass overwrite=true with allow_network_install=true to replace it.',
    });
  }
  if (options.dryRun || !options.allowNetworkInstall) {
    return jsonResponse({
      status: installed ? 'update_available_if_requested' : 'missing',
      framework: options.framework,
      addon_path: addonPath,
      version,
      install_plan: installPlan,
      note: 'Network install was not attempted. Pass allow_network_install=true to clone and copy the addon.',
    });
  }

  const tempRoot = join(tmpdir(), `godot-mcp-${options.framework}-${Date.now()}`);
  try {
    const cloneArgs = ['clone', '--depth', '1'];
    if (options.version) cloneArgs.push('--branch', options.version);
    cloneArgs.push(options.repo, tempRoot);
    const clone = spawnSync('git', cloneArgs, { encoding: 'utf8' });
    if (clone.status !== 0) {
      return jsonResponse({
        status: 'failed',
        framework: options.framework,
        reason: clone.stderr || clone.stdout || 'git clone failed',
        install_plan: installPlan,
      }, true);
    }
    const sourceAddon = findAddonSource(tempRoot, options.addonDir);
    if (!sourceAddon) {
      return jsonResponse({
        status: 'failed',
        framework: options.framework,
        reason: `Could not find addons/${options.addonDir} in cloned repository`,
      }, true);
    }
    if (existsSync(addonPath)) rmSync(addonPath, { recursive: true, force: true });
    mkdirSync(dirname(addonPath), { recursive: true });
    cpSync(sourceAddon, addonPath, { recursive: true });
    return jsonResponse({
      status: 'installed',
      framework: options.framework,
      addon_path: addonPath,
      version: readAddonVersion(addonPath),
      source: options.repo,
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function findAddonSource(root: string, addonDir: string): string | null {
  const direct = join(root, 'addons', addonDir);
  if (existsSync(direct)) return direct;
  const nested = join(root, addonDir);
  if (existsSync(nested)) return nested;
  return null;
}

function readAddonVersion(addonPath: string): string | null {
  const pluginCfg = join(addonPath, 'plugin.cfg');
  if (existsSync(pluginCfg)) {
    const content = readFileSync(pluginCfg, 'utf8');
    const match = content.match(/version\s*=\s*"([^"]+)"/i);
    if (match) return match[1];
  }
  const gutVersion = join(addonPath, 'version_numbers.gd');
  if (existsSync(gutVersion)) {
    const content = readFileSync(gutVersion, 'utf8');
    const match = content.match(/gut_version\s*=\s*'([^']+)'/i);
    if (match) return match[1];
  }
  return null;
}

function discoverTests(projectRoot: string, testDir: string, framework: 'gut' | 'gdunit4'): TestFileInfo[] {
  const relDir = normalizeResourcePath(testDir || 'test');
  const absoluteDir = join(projectRoot, relDir);
  if (!existsSync(absoluteDir)) return [];
  const files = listGdFiles(absoluteDir)
    .map((absolutePath) => {
      const relPath = relative(projectRoot, absolutePath).replace(/\\/g, '/');
      const content = readFileSync(absolutePath, 'utf8');
      const tests = extractTestMethods(content);
      const looksLikeGut = /extends\s+GutTest\b/.test(content) || basename(relPath).startsWith('test_');
      const looksLikeGdUnit = /extends\s+GdUnitTestSuite\b/.test(content) || /(?:_test|Test)\.gd$/.test(basename(relPath));
      if (framework === 'gut' && !looksLikeGut && tests.length === 0) return null;
      if (framework === 'gdunit4' && !looksLikeGdUnit) return null;
      return {
        path: relPath,
        absolute_path: absolutePath,
        tests,
        framework,
      };
    })
    .filter((entry): entry is TestFileInfo => Boolean(entry));
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function listGdFiles(root: string): string[] {
  const result: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        if (entry === '.godot' || entry === '.git' || entry === '.import') continue;
        walk(absolute);
      } else if (entry.endsWith('.gd')) {
        result.push(absolute);
      }
    }
  };
  walk(root);
  return result;
}

function extractTestMethods(content: string): string[] {
  const tests: string[] = [];
  const regex = /^\s*func\s+(test_[A-Za-z0-9_]+)\s*\(/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    tests.push(match[1]);
  }
  return tests;
}

function stripAbsolutePaths(files: TestFileInfo[]): Array<Omit<TestFileInfo, 'absolute_path'>> {
  return files.map(({ absolute_path: _absolutePath, ...rest }) => rest);
}

async function buildGutCommand(ctx: ServerContext, projectRoot: string, options: {
  testDir?: string;
  testFile?: string;
  verbosity?: number;
  includeJunit?: boolean;
  junitOutputPath?: string;
  exitOnFinish?: boolean;
}): Promise<CommandPlan> {
  const godotPath = await ctx.getGodotPath();
  const args = [
    '--headless',
    '-s',
    'addons/gut/gut_cmdln.gd',
    '--path',
    projectRoot,
  ];
  if (options.testFile) {
    args.push(`-gtest=${toResPath(options.testFile)}`);
  } else {
    args.push(`-gdir=${toResPath(options.testDir || 'test')}`);
  }
  args.push(`-glog=${options.verbosity ?? 1}`);
  if (options.includeJunit) {
    args.push(`-gjunit_xml_file=${options.junitOutputPath || 'user://gut_results.xml'}`);
    args.push('-gjunit_xml_timestamp');
  }
  if (options.exitOnFinish ?? true) args.push('-gexit');
  return {
    executable: godotPath || 'godot',
    args,
    cwd: projectRoot,
  };
}

async function buildGdUnitCommand(ctx: ServerContext, projectRoot: string, testTarget: string): Promise<CommandPlan> {
  const godotPath = await ctx.getGodotPath();
  const target = toResPath(testTarget);
  const cmdRunner = join(projectRoot, 'addons', 'gdUnit4', 'runtest.cmd');
  const shRunner = join(projectRoot, 'addons', 'gdUnit4', 'runtest.sh');
  const gdRunner = join(projectRoot, 'addons', 'gdUnit4', 'bin', 'GdUnitCmdTool.gd');
  if (existsSync(cmdRunner)) {
    return { executable: cmdRunner, args: ['-a', target], cwd: projectRoot, env: { GODOT_BIN: godotPath || 'godot' } };
  }
  if (existsSync(shRunner)) {
    return { executable: shRunner, args: ['-a', target], cwd: projectRoot, env: { GODOT_BIN: godotPath || 'godot' } };
  }
  return {
    executable: godotPath || 'godot',
    args: ['--headless', '--path', projectRoot, '-s', existsSync(gdRunner) ? 'addons/gdUnit4/bin/GdUnitCmdTool.gd' : 'addons/gdUnit4/runtest.sh', '-a', target],
    cwd: projectRoot,
    env: { GODOT_BIN: godotPath || 'godot' },
  };
}

function runCommand(command: CommandPlan, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: { ...process.env, ...(command.env || {}) },
      stdio: 'pipe',
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      resolveCommand({ stdout, stderr, exit_code: code ?? 0, timed_out: timedOut });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectCommand(error);
    });
  });
}

export function parseTestRunnerOutput(result: CommandResult): any {
  const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const runnerWarnings = lines.filter((line) => /(SCRIPT ERROR|ERROR:)/i.test(line));
  const allPassed = /All tests passed/i.test(output) || /\b\d+\/\d+\s+passed\b/i.test(output);
  const failingLines = lines.filter((line) => {
    if (runnerWarnings.includes(line) && allPassed) return false;
    if (/All tests passed/i.test(line)) return false;
    return /(FAIL|FAILED|Failure|Failing Tests)/i.test(line);
  });
  const fraction = output.match(/\b(\d+)\/(\d+)\s+passed\b/i);
  const summary = {
    tests: extractLabeledCount(output, 'Tests') ?? (fraction ? Number.parseInt(fraction[2], 10) : null),
    passing: extractLabeledCount(output, 'Passing Tests') ?? (fraction ? Number.parseInt(fraction[1], 10) : null),
    failing: extractLabeledCount(output, 'Failing Tests') ?? extractLabeledCount(output, 'Failures'),
    pending: extractLabeledCount(output, 'Pending'),
  };
  const success = !result.timed_out
    && result.exit_code === 0
    && (summary.failing === null || summary.failing === 0)
    && (allPassed || failingLines.length === 0);
  return {
    success,
    exit_code: result.exit_code,
    timed_out: result.timed_out,
    summary,
    failures: failingLines,
    runner_warnings: runnerWarnings,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function extractCount(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  return match ? Number.parseInt(match[1], 10) : null;
}

function extractLabeledCount(text: string, label: string): number | null {
  const pattern = new RegExp(`^\\s*${label.replace(/\s+/g, '\\s+')}\\s+(\\d+)\\s*$`, 'im');
  return extractCount(text, pattern);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[0-9;]*m/g, '');
}

function selectTestsForChangedFiles(projectRoot: string, changedFiles: string[], tests: TestFileInfo[]): TestFileInfo[] {
  const selected = new Map<string, TestFileInfo>();
  for (const changed of changedFiles) {
    const normalized = normalizeResourcePath(changed);
    if (isTestPath(normalized)) {
      const direct = tests.find((file) => file.path === normalized);
      if (direct) selected.set(direct.path, direct);
      continue;
    }
    const stem = basename(normalized, '.gd').replace(/_controller$|_system$|_manager$/, '');
    for (const testFile of tests) {
      const content = existsSync(join(projectRoot, testFile.path))
        ? readFileSync(join(projectRoot, testFile.path), 'utf8')
        : '';
      if (testFile.path.toLowerCase().includes(stem.toLowerCase()) || content.toLowerCase().includes(normalized.toLowerCase())) {
        selected.set(testFile.path, testFile);
      }
    }
  }
  return Array.from(selected.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function detectCoverageTool(projectRoot: string): string | null {
  const candidates = [
    join(projectRoot, 'addons', 'gut_coverage'),
    join(projectRoot, 'addons', 'gdscript-coverage'),
    join(projectRoot, 'coverage'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  return found || null;
}

function generateGdUnitTestContent(sourcePath: string, className: string, testName: string): string {
  const constName = `${pascalCase(className)}Script`;
  return [
    'extends GdUnitTestSuite',
    '',
    `const ${constName} = preload("${toResPath(sourcePath)}")`,
    '',
    `func ${testName}() -> void:`,
    `\tvar subject = ${constName}.new()`,
    '\tassert_object(subject).is_not_null()',
    '\tif subject is Node:',
    '\t\tsubject.queue_free()',
    '',
  ].join('\n');
}

function normalizeTestName(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized.startsWith('test_') ? sanitized : `test_${sanitized || 'generated'}`;
}

function pascalCase(value: string): string {
  return value
    .replace(/\.gd$/i, '')
    .split(/[^A-Za-z0-9]+|_/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') || 'Generated';
}

function isSourceLike(file: string): boolean {
  return file.endsWith('.gd') || file.endsWith('.tscn') || file.endsWith('.tres') || file.endsWith('.res');
}

function isTestPath(file: string): boolean {
  const normalized = normalizeResourcePath(file).toLowerCase();
  return normalized.startsWith('test/') || normalized.includes('/test/') || basename(normalized).startsWith('test_') || normalized.endsWith('_test.gd');
}

function extractPathReferences(output: string): Array<{ path: string; line: number | null; raw: string }> {
  const refs: Array<{ path: string; line: number | null; raw: string }> = [];
  const regex = /(?:res:\/\/)?((?:[A-Za-z0-9_. -]+\/)*[A-Za-z0-9_. -]+\.gd)(?::(\d+))?/g;
  for (const line of output.split(/\r?\n/)) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      refs.push({
        path: normalizeResourcePath(match[1]),
        line: match[2] ? Number.parseInt(match[2], 10) : null,
        raw: line.trim(),
      });
    }
  }
  return refs;
}

function classifyFailureLine(output: string, path: string): string {
  const pathLines = output.split(/\r?\n/).filter((line) => line.includes(path) || line.includes(toResPath(path)));
  const combined = pathLines.join(' ');
  if (/parse error|unexpected|expected/i.test(combined)) return 'parser_or_syntax_error';
  if (/assert|fail/i.test(output)) return 'assertion_failure_related_source';
  if (/null|invalid get index|method not found/i.test(output)) return 'runtime_api_or_node_state';
  return 'referenced_in_failure_output';
}

function uniquePathEntries<T extends { path: string; line?: number | null }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const entry of entries) {
    const key = `${entry.path}:${entry.line ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
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
