import { resolve } from "node:path";
export interface GlobalOptions {
  quiet: boolean;
  verbose: boolean;
  json: boolean;
  noColor: boolean;
}

export interface BuildCommandOptions extends GlobalOptions {
  projectDir: string;
  cc?: string;
  target?: string;
  cFile?: string;
  debug: boolean;
  run: boolean;
  programArgs: string[];
}

export class CliError extends Error {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, exitCode = 1, hint?: string) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    if (hint !== undefined) this.hint = hint;
  }
}

export function initialGlobals(): GlobalOptions {
  return { quiet: false, verbose: false, json: false, noColor: false };
}

export function isGlobalFlag(arg: string): boolean {
  return (
    arg === "--quiet" ||
    arg === "-q" ||
    arg === "--verbose" ||
    arg === "--json" ||
    arg === "--no-color"
  );
}

export function applyGlobalFlag(options: GlobalOptions, arg: string): boolean {
  if (arg === "--quiet" || arg === "-q") {
    options.quiet = true;
    return true;
  }
  if (arg === "--verbose") {
    options.verbose = true;
    return true;
  }
  if (arg === "--json") {
    options.json = true;
    return true;
  }
  if (arg === "--no-color") {
    options.noColor = true;
    return true;
  }
  return false;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value) throw new CliError(`${flag} requires a value`, 2);
  return value;
}

export function parseBuildOptions(args: string[]): BuildCommandOptions {
  const globals = initialGlobals();
  const options: BuildCommandOptions = {
    ...globals,
    projectDir: process.cwd(),
    debug: false,
    run: false,
    programArgs: [],
  };

  let index = 0;
  while (index < args.length) {
    const arg = args[index]!;
    if (arg === "--") {
      options.programArgs = args.slice(index + 1);
      break;
    }
    if (applyGlobalFlag(options, arg)) {
      index += 1;
      continue;
    }
    if (arg === "--cc") {
      options.cc = requireValue(args, index, "--cc");
      index += 2;
      continue;
    }
    if (arg === "--target") {
      options.target = requireValue(args, index, "--target");
      index += 2;
      continue;
    }
    if (arg === "--c-file") {
      options.cFile = requireValue(args, index, "--c-file");
      index += 2;
      continue;
    }
    if (arg === "--debug") {
      options.debug = true;
      index += 1;
      continue;
    }
    if (arg === "--release") {
      options.debug = false;
      index += 1;
      continue;
    }
    if (arg === "--run") {
      options.run = true;
      index += 1;
      continue;
    }
    if (arg === "-C") {
      options.projectDir = requireValue(args, index, "-C");
      index += 2;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliError(`unknown option '${arg}'`, 2);
    }
    options.projectDir = arg;
    index += 1;
  }

  options.projectDir = resolve(options.projectDir);
  return options;
}

export function parseSimpleOptions(
  args: string[],
  command: string,
): { globals: GlobalOptions; projectDir: string; all: boolean; force: boolean; template?: string; name?: string } {
  const globals = initialGlobals();
  let projectDir = process.cwd();
  let all = false;
  let force = false;
  let template: string | undefined;
  let name: string | undefined;

  let index = 0;
  while (index < args.length) {
    const arg = args[index]!;
    if (applyGlobalFlag(globals, arg)) {
      index += 1;
      continue;
    }
    if (arg === "--all") {
      all = true;
      index += 1;
      continue;
    }
    if (arg === "--force") {
      force = true;
      index += 1;
      continue;
    }
    if (arg === "--template") {
      template = requireValue(args, index, "--template");
      index += 2;
      continue;
    }
    if (arg === "--name") {
      name = requireValue(args, index, "--name");
      index += 2;
      continue;
    }
    if (arg === "-C") {
      projectDir = requireValue(args, index, "-C");
      index += 2;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliError(`unknown option '${arg}'`, 2);
    }
    if (command === "new" && name === undefined) {
      name = arg;
    } else {
      projectDir = arg;
    }
    index += 1;
  }

  return {
    globals,
    projectDir,
    all,
    force,
    ...(template === undefined ? {} : { template }),
    ...(name === undefined ? {} : { name }),
  };
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function humanOut(options: GlobalOptions, message: string): void {
  if (!options.quiet && !options.json) process.stdout.write(`${message}\n`);
}
