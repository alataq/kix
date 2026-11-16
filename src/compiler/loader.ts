import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ImportDecl, ParsedFile } from "./ast";
import { KixError } from "./errors";
import { parse } from "./parser";

export interface ImportBinding {
  alias: string;
  importPath: string;
  target: ModuleRecord;
  /** Canonical namespace exposed by the imported module. */
  namespace: string;
}

export interface ModuleRecord {
  path: string;
  source: string;
  ast: ParsedFile;
  /** Imports keyed by their local alias (`io`, `str`, ...). */
  bindings: Map<string, ImportBinding>;
  primaryNamespace: string;
}

export interface LoadedProject {
  entry: ModuleRecord;
  modules: ModuleRecord[];
  entryPath: string;
}

export interface LoadOptions {
  entryPath: string;
  /** The compiler's bundled module directory (contains kix/io.kix, ...). */
  modulesDir: string;
  /** Project root containing kix.json and optionally modules/. */
  projectRoot?: string;
  /** Target name, for example linux-x86_64. */
  target?: string;
}

function modulePath(root: string, importPath: string): string[] {
  const dotted = importPath.replace(/::/g, ".");
  const slashed = dotted.split(".").filter(Boolean).join("/");
  return [join(root, `${slashed}.kix`), join(root, `${dotted}.kix`)];
}

function targetModulePath(root: string, importPath: string, target: string): string[] {
  if (importPath !== "kix.syscalls") return [];
  const stem = target.replace(/-/g, "_");
  return modulePath(join(root, "kix", "syscalls"), stem);
}

function importCandidates(
  importPath: string,
  fromFile: string,
  projectRoot: string,
  modulesDir: string,
  target: string,
): string[] {
  const fromDir = dirname(fromFile);

  // Local source first, then the project's vendored modules/ tree, then the
  // compiler-bundled modules/ directory. This is what makes `import kix.io`
  // resolve to <project>/modules/kix/io.kix when a project supplies its own
  // copy and to the compiler's official copy otherwise.
  return [
    ...targetModulePath(fromDir, importPath, target),
    ...modulePath(fromDir, importPath),
    ...targetModulePath(join(projectRoot, "modules"), importPath, target),
    ...modulePath(join(projectRoot, "modules"), importPath),
    ...targetModulePath(modulesDir, importPath, target),
    ...modulePath(modulesDir, importPath),
  ];
}

export class ModuleLoader {
  private readonly entryPath: string;
  private readonly projectRoot: string;
  private readonly modulesDir: string;
  private readonly target: string;
  private readonly modulesByPath = new Map<string, ModuleRecord>();
  private readonly loading = new Set<string>();
  private readonly order: ModuleRecord[] = [];

  constructor(options: LoadOptions) {
    this.entryPath = resolve(options.entryPath);
    this.projectRoot = resolve(
      options.projectRoot ?? dirname(this.entryPath),
    );
    this.modulesDir = resolve(options.modulesDir);
    this.target = options.target ?? "linux-x86_64";
  }

  load(): LoadedProject {
    const entry = this.loadModule(this.entryPath, []);
    return {
      entry,
      modules: this.order,
      entryPath: this.entryPath,
    };
  }

  private loadModule(filePath: string, importStack: string[]): ModuleRecord {
    const absolute = resolve(filePath);
    const canonical = existsSync(absolute) ? realpathSync(absolute) : absolute;

    if (this.loading.has(canonical)) {
      const cycle = [...importStack, canonical].join(" -> ");
      throw new KixError(`cyclic module import detected:\n  ${cycle}`, {
        file: filePath,
        line: 1,
        column: 1,
      });
    }

    const existing = this.modulesByPath.get(canonical);
    if (existing) return existing;

    if (!existsSync(canonical)) {
      const location = importStack.length
        ? { file: importStack[importStack.length - 1]!, line: 1, column: 1 }
        : { file: this.entryPath, line: 1, column: 1 };
      throw new KixError(`cannot find module '${filePath}'`, location);
    }

    let source: string;
    try {
      source = readFileSync(canonical, "utf8");
    } catch (error) {
      throw new KixError(
        `cannot read '${canonical}': ${(error as Error).message}`,
      );
    }

    this.loading.add(canonical);
    const ast = parse(source, canonical);
    const record: ModuleRecord = {
      path: canonical,
      source,
      ast,
      bindings: new Map(),
      primaryNamespace: "",
    };

    // Install before descending so self-references produce the cycle error
    // instead of duplicate parsing.
    this.modulesByPath.set(canonical, record);

    for (const declaration of ast.declarations) {
      if (declaration.kind === "Namespace") {
        record.primaryNamespace = declaration.name;
        break;
      }
    }

    for (const importDecl of ast.imports) {
      this.bindImport(record, importDecl, [...importStack, canonical]);
    }

    this.loading.delete(canonical);
    this.order.push(record);
    return record;
  }

  private bindImport(
    record: ModuleRecord,
    importDecl: ImportDecl,
    importStack: string[],
  ): void {
    const targetPath = this.resolveImport(
      importDecl.path,
      record.path,
      importDecl.location,
    );
    const target = this.loadModule(targetPath, importStack);
    const alias =
      importDecl.alias ?? importDecl.path.split(".").pop() ?? importDecl.path;
    const namespace = target.primaryNamespace || importDecl.path;

    const previous = record.bindings.get(alias);
    if (previous) {
      if (previous.target.path === target.path) return;
      throw new KixError(
        `import alias '${alias}' refers to both '${previous.importPath}' and '${importDecl.path}'`,
        importDecl.location,
      );
    }

    record.bindings.set(alias, {
      alias,
      importPath: importDecl.path,
      target,
      namespace,
    });
  }

  private resolveImport(
    importPath: string,
    fromFile: string,
    location: ImportDecl["location"],
  ): string {
    const candidates = importCandidates(
      importPath,
      fromFile,
      this.projectRoot,
      this.modulesDir,
      this.target,
    );

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }

    throw new KixError(
      `cannot resolve import '${importPath}'`,
      location,
      `looked in:\n    ${candidates.join("\n    ")}`,
    );
  }
}

export function loadProject(options: LoadOptions): LoadedProject {
  return new ModuleLoader(options).load();
}
