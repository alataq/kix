import { CodeGenerator } from "./codegen";
import { KixError } from "./errors";
import { loadProject } from "./loader";
import type { LoadedProject } from "./loader";
import { ProgramTable } from "./program";
import { parseTarget } from "../target";

export interface CompileOptions {
  entryPath: string;
  /** Bundled official module directory, e.g. <repo>/modules. */
  modulesDir: string;
  /** Project root used to find <project>/modules and local imports. */
  projectRoot?: string;
  /** Target name, for example linux-x86_64. */
  target?: string;
}

export interface CompileResult {
  cSource: string;
  modules: string[];
  program: ProgramTable;
  loaded: LoadedProject;
}

/**
 * Compile a Kix project (entry file plus recursively imported modules) into a
 * single C translation unit. No files are written by this function.
 */
export function compileProject(options: CompileOptions): CompileResult {
  if (!options.entryPath) {
    throw new KixError("missing entry file");
  }
  if (!options.modulesDir) {
    throw new KixError("missing standard module directory");
  }

  const target = parseTarget(options.target);
  const loaded = loadProject({
    entryPath: options.entryPath,
    modulesDir: options.modulesDir,
    ...(options.projectRoot === undefined
      ? {}
      : { projectRoot: options.projectRoot }),
    target: target.name,
  });
  const program = new ProgramTable(loaded.modules, loaded.entry);
  const generator = new CodeGenerator(program);

  return {
    cSource: generator.generate(),
    modules: loaded.modules.map((module) => module.path),
    program,
    loaded,
  };
}
