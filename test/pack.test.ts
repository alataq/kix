import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const dist = join(root, "dist");
const installDirs: string[] = [];

afterEach(() => {
  rmSync(dist, { recursive: true, force: true });
  while (installDirs.length > 0) {
    rmSync(installDirs.pop()!, { recursive: true, force: true });
  }
});

describe("packaging", () => {
  test("bun run pack creates a runnable dist/kixt", () => {
    const result = Bun.spawnSync({
      cmd: ["bun", "run", "pack"],
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dist, "kixt"))).toBe(true);
    expect(existsSync(join(dist, "modules", "kix", "io.kix"))).toBe(true);
    expect(existsSync(join(dist, "docs", "language.md"))).toBe(true);
    expect(existsSync(join(dist, "docs", "stdlib", "syscalls.md"))).toBe(true);
    expect(existsSync(join(dist, "Makefile"))).toBe(true);
    expect(existsSync(join(dist, "scripts", "install.sh"))).toBe(true);

    const version = Bun.spawnSync({
      cmd: [join(dist, "kixt"), "version"],
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(version.exitCode).toBe(0);
    expect(version.stdout.toString()).toContain("kixt 1.0.0");
  }, 60000);
});

describe("installation", () => {
  test("make install uses executable-relative global modules", () => {
    const prefix = mkdtempSync(join(tmpdir(), "kixt-install-"));
    installDirs.push(prefix);
    const pack = Bun.spawnSync({
      cmd: ["bun", "run", "pack"],
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(pack.exitCode).toBe(0);
    const install = Bun.spawnSync({
      cmd: ["make", "install", `DESTDIR=${prefix}`],
      cwd: join(root, "dist"),
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(install.exitCode).toBe(0);
    const installed = join(prefix, "usr/local/bin/kixt");
    const modules = join(prefix, "usr/local/lib/kix/modules");
    expect(existsSync(installed)).toBe(true);
    expect(existsSync(join(modules, "kix", "io.kix"))).toBe(true);

    const doctor = Bun.spawnSync({
      cmd: [installed, "doctor", "--json"],
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, KIX_MODULES_DIR: "", KIX_GLOBAL_MODULES: "" },
    });
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout.toString()).toContain(modules);
  }, 60000);
});
