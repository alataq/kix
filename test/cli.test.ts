import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const directories: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kixt-cli-"));
  directories.push(dir);
  return dir;
}

function cli(args: string[]): { status: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", "src/cli.ts", ...args],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    status: result.exitCode ?? -1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop()!, { recursive: true, force: true });
  }
});

describe("cli", () => {
  test("version, targets, and doctor expose machine-readable output", () => {
    const version = cli(["version", "--json"]);
    expect(version.status).toBe(0);
    expect(JSON.parse(version.stdout).version).toBe("1.0.0");

    const targets = cli(["targets", "--json"]);
    expect(targets.status).toBe(0);
    const targetData = JSON.parse(targets.stdout);
    expect(targetData.targets.length).toBe(3);
    expect(targetData.targets.some((entry: { host: boolean }) => entry.host)).toBe(true);

    const doctor = cli(["doctor", "--json"]);
    expect(doctor.status).toBe(0);
    expect(JSON.parse(doctor.stdout).ok).toBe(true);
  }, 30000);

  test("new, info, run, and clean work together", () => {
    const project = join(tempDir(), "app");
    const created = cli(["new", project, "--template", "minimal"]);
    expect(created.status).toBe(0);
    expect(existsSync(join(project, "kix.json"))).toBe(true);
    expect(existsSync(join(project, "src/main.kix"))).toBe(true);

    const info = cli(["info", project, "--json"]);
    expect(info.status).toBe(0);
    expect(JSON.parse(info.stdout).target).toBe("linux-x86_64");

    const run = cli(["run", project]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Hello from Kix!");

    const clean = cli(["clean", project, "--all", "--json"]);
    expect(clean.status).toBe(0);
    expect(existsSync(join(project, "bin/app"))).toBe(false);
    expect(existsSync(join(project, ".kix-build"))).toBe(false);
  }, 60000);

  test("cli template forwards program arguments", () => {
    const project = join(tempDir(), "tool");
    expect(cli(["new", project, "--template", "cli"]).status).toBe(0);
    const run = cli(["run", project, "--", "--name", "demo", "--verbose"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("options=1 flags=1");
  }, 60000);
});
