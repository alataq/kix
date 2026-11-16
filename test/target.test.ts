import { afterEach, describe, expect, test } from "bun:test";
import { compileProject } from "../src/compiler";
import { cleanupTemporaryDirectories, createProject, modulesDir } from "./support";

afterEach(cleanupTemporaryDirectories);

describe("targets", () => {
  test("selects target-specific syscall modules and architecture prelude", () => {
    const project = createProject("target-aarch64", {
      "src/main.kix": `import kix.syscalls;\npublic main(): int { return 0; }`,
    });

    const result = compileProject({
      entryPath: project.entry,
      projectRoot: project.dir,
      modulesDir,
      target: "linux-aarch64",
    });

    expect(result.modules.some((path) => path.endsWith("linux_aarch64.kix"))).toBe(true);
    expect(result.cSource).toContain("svc 0");
    expect(result.cSource).toContain("Kix supports Linux x86_64, aarch64, and riscv64");
  });

  test("defaults to the host target and rejects unsupported targets", () => {
    const project = createProject("target-default", {
      "src/main.kix": `import kix.syscalls;\npublic main(): int { return 0; }`,
    });

    const result = compileProject({
      entryPath: project.entry,
      projectRoot: project.dir,
      modulesDir,
    });
    expect(result.modules.some((path) => path.endsWith("linux_x86_64.kix"))).toBe(true);

    expect(() =>
      compileProject({
        entryPath: project.entry,
        projectRoot: project.dir,
        modulesDir,
        target: "darwin-arm64",
      }),
    ).toThrow("unsupported operating system target");
  });
});
