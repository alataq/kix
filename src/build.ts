import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { loadConfig } from "./config";
import { bundledModulesDir } from "./paths";
import type { LoadedConfig } from "./config";
import { compileProject } from "./compiler";
import type { CompileResult } from "./compiler";
import { KixError } from "./compiler/errors";

export interface BuildOptions {
  /** Directory containing kix.json. */
  projectDir?: string;
  /** Alias for projectDir, matching CompileOptions. */
  projectRoot?: string;
  /** Bundled module directory; defaults to <repo>/modules. */
  modulesDir?: string;
  target?: string;
  cc?: string;
  cFile?: string;
  run?: boolean;
  optimize?: boolean;
}

export interface BuildResult {
  config: LoadedConfig;
  compile: CompileResult;
  cFile: string;
  binary: string;
  compiler: string;
  runExitCode?: number;
}

function outputText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  return String(value);
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

export function findCCompiler(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.CC,
    "cc",
    "gcc",
    "clang",
  ].filter((value): value is string => Boolean(value));

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) return candidate;
      continue;
    }

    const resolved = Bun.which(candidate);
    if (resolved) return resolved;
  }

  throw new KixError(
    "no C compiler found",
    undefined,
    "install gcc or clang, set CC, or pass --cc <path>",
  );
}

export function buildProject(options: BuildOptions = {}): BuildResult {
  const config = loadConfig(
    options.projectDir ?? options.projectRoot ?? process.cwd(),
  );
  const compile = compileProject({
    entryPath: config.entryPath,
    modulesDir: options.modulesDir
      ? resolve(options.modulesDir)
      : bundledModulesDir(),
    projectRoot: options.projectRoot ? resolve(options.projectRoot) : config.root,
    ...((options.target ?? config.target) === undefined
      ? {}
      : { target: options.target ?? config.target }),
  });

  const cFile = options.cFile
    ? isAbsolute(options.cFile)
      ? options.cFile
      : resolve(config.root, options.cFile)
    : resolve(config.root, ".kix-build", `${safeName(config.name)}.c`);

  mkdirSync(dirname(cFile), { recursive: true });
  writeFileSync(cFile, compile.cSource, "utf8");

  mkdirSync(dirname(config.outputPath), { recursive: true });

  const compiler = findCCompiler(options.cc ?? config.cc);
  const optimize = options.optimize ?? true;
  const command = [
    compiler,
    "-std=c11",
    "-pthread",
    optimize ? "-O2" : "-O0",
    ...(optimize ? [] : ["-g"]),
    "-Wall",
    "-Wextra",
    "-Wno-unused-parameter",
    "-o",
    config.outputPath,
    cFile,
  ];

  const result = Bun.spawnSync({
    cmd: command,
    cwd: config.root,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const details = [
      outputText(result.stdout).trim(),
      outputText(result.stderr).trim(),
    ]
      .filter(Boolean)
      .join("\n");
    throw new KixError(
      `${compiler} failed with exit code ${result.exitCode ?? "unknown"}\n` +
        `  command: ${command.join(" ")}` +
        (details ? `\n\n${details}` : ""),
      undefined,
      `the intermediate C file was kept at ${cFile}`,
    );
  }

  const built: BuildResult = {
    config,
    compile,
    cFile,
    binary: config.outputPath,
    compiler,
  };

  if (options.run) {
    const runResult = Bun.spawnSync({
      cmd: [config.outputPath],
      cwd: config.root,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    built.runExitCode = runResult.exitCode ?? 1;
  }

  return built;
}
