#!/usr/bin/env bun
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { hostTargetName } from "../src/target";

const root = resolve(import.meta.dir, "..");
const dist = join(root, "dist");
const target = hostTargetName();
const binary = join(dist, "kixt");

function run(command: string[]): void {
  const result = Bun.spawnSync({
    cmd: command,
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((result.exitCode ?? 1) !== 0) {
    throw new Error(`command failed: ${command.join(" ")}`);
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const bunTarget =
  target === "linux-x86_64"
    ? "bun-linux-x64"
    : target === "linux-aarch64"
      ? "bun-linux-arm64"
      : undefined;

if (!bunTarget) {
  throw new Error(`Bun standalone packaging is not available for target '${target}'`);
}

run([
  "bun",
  "build",
  "--compile",
  `--target=${bunTarget}`,
  "src/cli.ts",
  "--outfile",
  binary,
]);

cpSync(join(root, "modules"), join(dist, "modules"), {
  recursive: true,
  dereference: true,
});
cpSync(join(root, "docs"), join(dist, "docs"), {
  recursive: true,
});
copyFileSync(join(root, "Makefile"), join(dist, "Makefile"));
mkdirSync(join(dist, "scripts"), { recursive: true });
copyFileSync(join(root, "scripts", "install.sh"), join(dist, "scripts", "install.sh"));
chmodSync(join(dist, "scripts", "install.sh"), 0o755);
for (const file of ["LICENSE", "README.md"]) {
  const source = join(root, file);
  if (existsSync(source)) copyFileSync(source, join(dist, file));
}

chmodSync(binary, 0o755);
process.stdout.write(`Packed kixt for ${target}\n`);
process.stdout.write(`  executable: ${binary}\n`);
process.stdout.write(`  modules:    ${join(dist, "modules")}\n`);
process.stdout.write(`  docs:       ${join(dist, "docs")}\n`);
process.stdout.write(`  installer:  ${join(dist, "Makefile")}\n`);
