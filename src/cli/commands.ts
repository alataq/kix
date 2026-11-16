import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { buildProject, findCCompiler } from "../build";
import { loadConfig } from "../config";
import { compileProject } from "../compiler";
import { bundledModulesDir } from "../paths";
import { asKixError, KixError } from "../compiler/errors";
import {
  SUPPORTED_TARGETS,
  hostTargetName,
  parseTarget,
} from "../target";
import {
  CliError,
  humanOut,
  initialGlobals,
  parseBuildOptions,
  parseSimpleOptions,
  writeJson,
} from "./args";
import type { BuildCommandOptions, GlobalOptions } from "./args";
import {
  PROJECT_TEMPLATES,
  projectFiles,
} from "./templates";
import type { ProjectTemplate } from "./templates";

const VERSION = "1.0.0";

export const COMMAND_NAMES = [
  "build",
  "run",
  "check",
  "new",
  "init",
  "clean",
  "doctor",
  "info",
  "targets",
  "version",
  "help",
] as const;

export function compilerVersion(): string {
  return VERSION;
}

function modulesDir(): string {
  return bundledModulesDir();
}

function formatPath(path: string): string {
  const relativePath = path.startsWith(process.cwd())
    ? path.slice(process.cwd().length + 1)
    : path;
  return relativePath || ".";
}

function buildOptions(options: BuildCommandOptions) {
  return {
    projectDir: options.projectDir,
    optimize: !options.debug,
    ...(options.cc === undefined ? {} : { cc: options.cc }),
    ...(options.cFile === undefined ? {} : { cFile: options.cFile }),
    ...(options.target === undefined ? {} : { target: options.target }),
  };
}

function buildSummary(result: ReturnType<typeof buildProject>) {
  return {
    binary: result.binary,
    cFile: result.cFile,
    compiler: result.compiler,
    modules: result.compile.modules.length,
    target: result.config.target ?? hostTargetName(),
  };
}

export function commandBuild(args: string[]): number {
  const options = parseBuildOptions(args);
  const result = buildProject({
    ...buildOptions(options),
    run: options.run,
  });

  if (options.json) {
    writeJson(buildSummary(result));
  } else {
    humanOut(
      options,
      `Built ${formatPath(result.binary)} with ${result.compiler} (${result.compile.modules.length} Kix module${result.compile.modules.length === 1 ? "" : "s"})`,
    );
    humanOut(options, `  C source: ${formatPath(result.cFile)}`);
  }
  return result.runExitCode ?? 0;
}

export function commandRun(args: string[]): number {
  const options = parseBuildOptions(args);
  const result = buildProject(buildOptions(options));
  if (!options.quiet && !options.json) {
    humanOut(options, `Running ${formatPath(result.binary)}`);
  }
  const runResult = Bun.spawnSync({
    cmd: [result.binary, ...options.programArgs],
    cwd: result.config.root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return runResult.exitCode ?? 1;
}

export function commandCheck(args: string[]): number {
  const options = parseBuildOptions(args);
  const config = loadConfig(options.projectDir);
  const result = compileProject({
    entryPath: config.entryPath,
    projectRoot: config.root,
    modulesDir: modulesDir(),
    ...(options.target === undefined && config.target === undefined
      ? {}
      : { target: options.target ?? config.target }),
  });
  const report = {
    name: config.name,
    modules: result.modules.length,
    bytes: result.cSource.length,
    target: options.target ?? config.target ?? hostTargetName(),
  };
  if (options.json) {
    writeJson(report);
  } else {
    humanOut(
      options,
      `Checked ${config.name}: ${report.modules} module${report.modules === 1 ? "" : "s"}, ${report.bytes} bytes of C`,
    );
  }
  return 0;
}

function prepareProjectDir(
  dir: string,
  force: boolean,
  isInit: boolean,
): void {
  if (existsSync(dir)) {
    if (!force && (isInit ? existsSync(join(dir, "kix.json")) : readdirSync(dir).length > 0)) {
      throw new CliError(
        isInit
          ? `kix.json already exists in ${dir}`
          : `directory '${dir}' already exists and is not empty`,
        2,
        "use --force to write into it anyway",
      );
    }
  } else {
    mkdirSync(dir, { recursive: true });
  }
}

function writeProject(
  dir: string,
  name: string,
  template: ProjectTemplate,
  force: boolean,
  isInit: boolean,
): { files: string[]; nextSteps: string[]; warnings: string[] } {
  prepareProjectDir(dir, force, isInit);
  const generated = projectFiles(name, template);
  const written: string[] = [];
  for (const [relativePath, contents] of Object.entries(generated.files)) {
    const path = resolve(dir, relativePath);
    if (existsSync(path) && !force) {
      throw new CliError(`refusing to overwrite existing file '${path}'`, 2);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
    written.push(path);
  }

  const warnings: string[] = [];
  const modulesLink = resolve(dir, "modules", "kix");
  if (!existsSync(modulesLink)) {
    mkdirSync(dirname(modulesLink), { recursive: true });
    try {
      symlinkSync(resolve(modulesDir(), "kix"), modulesLink, "dir");
      written.push(modulesLink);
    } catch {
      warnings.push(`could not create modules/kix symlink at ${modulesLink}`);
    }
  }

  return { files: written, nextSteps: generated.nextSteps, warnings };
}

function parseTemplate(value: string | undefined): ProjectTemplate {
  const template = (value ?? "minimal") as ProjectTemplate;
  if (!PROJECT_TEMPLATES.includes(template)) {
    throw new CliError(
      `unknown template '${template}'`,
      2,
      `supported templates: ${PROJECT_TEMPLATES.join(", ")}`,
    );
  }
  return template;
}

export function commandNew(args: string[]): number {
  const options = parseSimpleOptions(args, "new");
  if (!options.name) {
    throw new CliError("kixt new requires a project name", 2, "usage: kixt new <name> [--template minimal|cli|http-server]");
  }
  const template = parseTemplate(options.template);
  const dir = resolve(process.cwd(), options.name);
  const name = options.name.includes("/") || options.name.includes("\\")
    ? basename(dir)
    : options.name;
  const result = writeProject(dir, name, template, options.force, false);
  if (options.globals.json) {
    writeJson({ project: dir, name, template, ...result });
  } else {
    humanOut(options.globals, `Created ${name} at ${formatPath(dir)} (${template})`);
    for (const warning of result.warnings) {
      process.stderr.write(`warning: ${warning}\n`);
    }
    humanOut(options.globals, `Next:`);
    for (const step of result.nextSteps) humanOut(options.globals, `  ${step}`);
  }
  return 0;
}

export function commandInit(args: string[]): number {
  const options = parseSimpleOptions(args, "init");
  const dir = resolve(options.projectDir);
  const template = parseTemplate(options.template);
  const name = options.name ?? basename(dir);
  const result = writeProject(dir, name, template, options.force, true);
  if (options.globals.json) {
    writeJson({ project: dir, name, template, ...result });
  } else {
    humanOut(options.globals, `Initialized ${name} in ${formatPath(dir)} (${template})`);
    for (const warning of result.warnings) {
      process.stderr.write(`warning: ${warning}\n`);
    }
    humanOut(options.globals, `Next:`);
    for (const step of result.nextSteps) humanOut(options.globals, `  ${step}`);
  }
  return 0;
}

export function commandClean(args: string[]): number {
  const options = parseSimpleOptions(args, "clean");
  const config = loadConfig(options.projectDir);
  const removed: string[] = [];
  const buildDir = resolve(config.root, ".kix-build");
  if (existsSync(buildDir)) {
    rmSync(buildDir, { recursive: true, force: true });
    removed.push(buildDir);
  }
  if (options.all && existsSync(config.outputPath)) {
    rmSync(config.outputPath, { force: true });
    removed.push(config.outputPath);
  }
  if (options.globals.json) {
    writeJson({ removed });
  } else if (removed.length === 0) {
    humanOut(options.globals, "Nothing to clean");
  } else {
    for (const path of removed) humanOut(options.globals, `Removed ${formatPath(path)}`);
  }
  return 0;
}

interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

function toolPath(name: string): string | undefined {
  return Bun.which(name) ?? undefined;
}

export function commandDoctor(args: string[]): number {
  const options = parseSimpleOptions(args, "doctor");
  const checks: DoctorCheck[] = [];
  checks.push({ name: "bun", status: "ok", detail: Bun.version });

  let compiler: string | undefined;
  try {
    compiler = findCCompiler();
    checks.push({ name: "c-compiler", status: "ok", detail: compiler });
  } catch (error) {
    checks.push({
      name: "c-compiler",
      status: "fail",
      detail: asKixError(error).message,
    });
  }

  const bundledModules = modulesDir();
  checks.push({
    name: "kix-modules",
    status: existsSync(bundledModules) ? "ok" : "fail",
    detail: bundledModules,
  });
  checks.push({
    name: "host-target",
    status: SUPPORTED_TARGETS.includes(hostTargetName() as never) ? "ok" : "fail",
    detail: hostTargetName(),
  });

  const configPath = resolve(options.projectDir, "kix.json");
  if (existsSync(configPath)) {
    try {
      const config = loadConfig(options.projectDir);
      checks.push({
        name: "project",
        status: "ok",
        detail: `${config.name} (${config.root})`,
      });
      if (config.target) {
        try {
          parseTarget(config.target);
          checks.push({ name: "project-target", status: "ok", detail: config.target });
        } catch (error) {
          checks.push({
            name: "project-target",
            status: "fail",
            detail: asKixError(error).message,
          });
        }
      }
    } catch (error) {
      checks.push({
        name: "project",
        status: "fail",
        detail: asKixError(error).message,
      });
    }
  }

  for (const tool of ["gzip", "openssl"]) {
    const path = toolPath(tool);
    checks.push({
      name: tool,
      status: path ? "ok" : "warn",
      detail: path ?? "not found (optional library dependency)",
    });
  }

  const failed = checks.some((check) => check.status === "fail");
  if (options.globals.json) {
    writeJson({ ok: !failed, checks });
  } else {
    for (const check of checks) {
      const marker = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "FAIL";
      process.stdout.write(`${marker.padEnd(5)} ${check.name.padEnd(18)} ${check.detail}\n`);
    }
  }
  return failed ? 1 : 0;
}

export function commandInfo(args: string[]): number {
  const options = parseSimpleOptions(args, "info");
  const config = loadConfig(options.projectDir);
  const target = parseTarget(config.target ?? undefined).name;
  let compiler: string | undefined;
  try {
    compiler = findCCompiler(config.cc);
  } catch {
    compiler = undefined;
  }
  const projectModules = resolve(config.root, "modules");
  const info = {
    project: config.name,
    root: config.root,
    config: config.configPath,
    entry: config.entryPath,
    output: config.outputPath,
    target,
    cc: compiler ?? null,
    modules: [
      ...(existsSync(projectModules) ? [projectModules] : []),
      modulesDir(),
    ],
  };
  if (options.globals.json) {
    writeJson(info);
  } else {
    process.stdout.write(`project: ${info.project}\n`);
    process.stdout.write(`root:    ${info.root}\n`);
    process.stdout.write(`config:  ${info.config}\n`);
    process.stdout.write(`entry:   ${info.entry}\n`);
    process.stdout.write(`output:  ${info.output}\n`);
    process.stdout.write(`target:  ${info.target}\n`);
    process.stdout.write(`cc:      ${info.cc ?? "<not found>"}\n`);
    for (const path of info.modules) process.stdout.write(`modules: ${path}\n`);
  }
  return 0;
}

function crossCompilerFor(target: string): string | undefined {
  if (target === "linux-x86_64") return findCCompilerSafe();
  if (target === "linux-aarch64") {
    return Bun.which("aarch64-linux-gnu-gcc") ?? Bun.which("aarch64-linux-gnu-clang") ?? undefined;
  }
  if (target === "linux-riscv64") {
    return Bun.which("riscv64-linux-gnu-gcc") ?? Bun.which("riscv64-linux-gnu-clang") ?? undefined;
  }
  return undefined;
}

function findCCompilerSafe(): string | undefined {
  try {
    return findCCompiler();
  } catch {
    return undefined;
  }
}

export function commandTargets(args: string[]): number {
  const options = parseSimpleOptions(args, "targets");
  const host = hostTargetName();
  const targets = SUPPORTED_TARGETS.map((target) => ({
    target,
    host: target === host,
    compiler: crossCompilerFor(target) ?? null,
  }));
  if (options.globals.json) {
    writeJson({ host, targets });
  } else {
    process.stdout.write(`host: ${host}\n`);
    for (const entry of targets) {
      const marker = entry.host ? "host" : "    ";
      process.stdout.write(`${marker}  ${entry.target.padEnd(18)} ${entry.compiler ?? "<compiler not found>"}\n`);
    }
  }
  return 0;
}

export function commandVersion(args: string[]): number {
  const options = parseSimpleOptions(args, "version");
  if (options.globals.json) {
    writeJson({ version: VERSION, target: hostTargetName() });
  } else {
    process.stdout.write(`kixt ${VERSION} (${hostTargetName()})\n`);
  }
  return 0;
}

export function commandHelp(args: string[]): number {
  const command = args.find((arg) => !arg.startsWith("-"));
  if (!command) return -1;
  process.stdout.write(commandUsage(command));
  return 0;
}

export function commandUsage(command: string): string {
  switch (command) {
    case "build":
      return `kixt build [dir] [options]

Options:
  --target <name>   linux-x86_64 | linux-aarch64 | linux-riscv64
  --cc <path>       C compiler
  --c-file <path>   Intermediate C file
  --debug           -O0 -g instead of -O2
  --run             Run after building
  --quiet, --json, --verbose, --no-color
`;
    case "run":
      return `kixt run [dir] [options] [-- program-args...]

Builds and runs the program, forwarding arguments, stdio, and exit code.
`;
    case "check":
      return `kixt check [dir] [options]\n\nCompiles and type-checks without linking.\n`;
    case "new":
      return `kixt new <name> [--template minimal|cli|http-server] [--force]\n`;
    case "init":
      return `kixt init [dir] [--name <name>] [--template minimal|cli|http-server] [--force]\n`;
    case "clean":
      return `kixt clean [dir] [--all]\n\nRemoves .kix-build; --all also removes the output binary.\n`;
    case "doctor":
      return `kixt doctor [dir]\n\nChecks Bun, the C compiler, modules, target, and optional tools.\n`;
    case "info":
      return `kixt info [dir]\n\nShows resolved project, target, compiler, and module paths.\n`;
    case "targets":
      return `kixt targets\n\nLists supported targets and compiler availability.\n`;
    case "version":
      return `kixt version\n`;
    default:
      return globalUsage();
  }
}

export function globalUsage(): string {
  return `kixt ${VERSION} — the Kix compiler

Usage:
  kixt <command> [options]

Commands:
  build      Compile a project
  run        Build and run a project
  check      Type-check and generate C without linking
  new        Create a new project
  init       Initialize a project in a directory
  clean      Remove build artifacts
  doctor     Check the local toolchain
  info       Show resolved project information
  targets    List supported targets
  version    Show the compiler version
  help       Show command help

Global options:
  --quiet, -q        Suppress normal output
  --verbose          Verbose output
  --json             Machine-readable output
  --no-color         Disable color output
`;
}
