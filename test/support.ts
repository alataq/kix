import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { compileProject } from "../src/compiler";

export const root = resolve(import.meta.dir, "..");
export const modulesDir = join(root, "modules");
const temporaryDirectories: string[] = [];

export function cleanupTemporaryDirectories(): void {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
}

export function createProject(
  name: string,
  files: Record<string, string>,
): { dir: string; entry: string; output: string } {
  const dir = mkdtempSync(join(tmpdir(), `kix-${name}-`));
  temporaryDirectories.push(dir);

  const allFiles: Record<string, string> = {
    "kix.json": JSON.stringify(
      {
        name,
        entry: "src/main.kix",
        output: "bin/app",
      },
      null,
      2,
    ),
    ...files,
  };

  for (const [relativePath, contents] of Object.entries(allFiles)) {
    const path = join(dir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }

  return {
    dir,
    entry: join(dir, "src/main.kix"),
    output: join(dir, "bin/app"),
  };
}

export function compile(dir: string, entry: string): string {
  return compileProject({
    entryPath: entry,
    projectRoot: dir,
    modulesDir,
  }).cSource;
}

export function run(executable: string, input?: string): string {
  if (input === undefined) {
    const result = Bun.spawnSync({ cmd: [executable], stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) {
      throw new Error(
        `program failed (${result.exitCode}): ${result.stderr.toString()}`,
      );
    }
    return result.stdout.toString();
  }

  const result = Bun.spawnSync({
    cmd: ["bash", "-c", `printf '%s' "$KIX_TEST_INPUT" | "$KIX_TEST_BIN"`],
    env: { ...process.env, KIX_TEST_INPUT: input, KIX_TEST_BIN: executable },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `program failed (${result.exitCode}): ${result.stderr.toString()}`,
    );
  }
  return result.stdout.toString();
}

export function runWithEnv(
  executable: string,
  env: Record<string, string>,
): { status: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [executable],
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    status: result.exitCode ?? -1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
