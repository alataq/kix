import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { KixError } from "./compiler/errors";

export interface KixtConfigFile {
  name: string;
  entry: string;
  output: string;
  cc?: string;
  target?: string;
}

export interface LoadedConfig {
  name: string;
  entry: string;
  output: string;
  cc?: string;
  target?: string;
  root: string;
  configPath: string;
  entryPath: string;
  outputPath: string;
}

function stringField(
  value: unknown,
  field: string,
  configPath: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new KixError(
      `kix.json field '${field}' must be a non-empty string`,
      { file: configPath, line: 1, column: 1 },
    );
  }
  return value;
}

export function parseConfig(raw: unknown, configPath: string): KixtConfigFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new KixError("kix.json must contain a JSON object", {
      file: configPath,
      line: 1,
      column: 1,
    });
  }

  const object = raw as Record<string, unknown>;
  const name = stringField(object.name, "name", configPath);
  const entry = stringField(object.entry, "entry", configPath);
  const output = stringField(object.output, "output", configPath);
  const cc =
    object.cc === undefined
      ? undefined
      : stringField(object.cc, "cc", configPath);
  const target =
    object.target === undefined
      ? undefined
      : stringField(object.target, "target", configPath);

  if (!entry.endsWith(".kix")) {
    throw new KixError("kix.json field 'entry' must point to a .kix file", {
      file: configPath,
      line: 1,
      column: 1,
    });
  }

  return {
    name,
    entry,
    output,
    ...(cc === undefined ? {} : { cc }),
    ...(target === undefined ? {} : { target }),
  };
}

export function loadConfig(projectDir = process.cwd()): LoadedConfig {
  const root = resolve(projectDir);
  const configPath = resolve(root, "kix.json");

  if (!existsSync(configPath)) {
    throw new KixError(`cannot find ${configPath}`, undefined, "run `kixt build` from the project root or pass its directory");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new KixError(
      `invalid kix.json: ${(error as Error).message}`,
      { file: configPath, line: 1, column: 1 },
    );
  }

  const config = parseConfig(parsed, configPath);
  const entryPath = isAbsolute(config.entry)
    ? config.entry
    : resolve(root, config.entry);
  const outputPath = isAbsolute(config.output)
    ? config.output
    : resolve(root, config.output);

  if (!existsSync(entryPath)) {
    throw new KixError(`entry file does not exist: ${entryPath}`, {
      file: configPath,
      line: 1,
      column: 1,
    });
  }

  return {
    ...config,
    root,
    configPath,
    entryPath,
    outputPath,
  };
}
