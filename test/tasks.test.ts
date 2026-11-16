import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildProject } from "../src/build";
import { compileProject } from "../src/compiler";
import { KixError } from "../src/compiler/errors";
import {
  cleanupTemporaryDirectories,
  compile,
  createProject,
  modulesDir,
  run,
  runWithEnv,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("compiler pipeline", () => {
  test("gives &N tasks their own dedicated workers", () => {
    const project = createProject("tasks-dedicated", {
      "src/main.kix": `
        import kix.io;

        public &2tick(value: int): int {
            return value + 1;
        }

        public main(): int {
            int a = tick(1);
            int b = tick(2);
            io::printf("%lld %lld\\n", a, b);
            return 0;
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("kix_task_pool_0 = kix_pool_create(2)");

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("2 3\n");
  });

  test("supports task methods and waits before using their result", () => {
    const project = createProject("tasks-method", {
      "src/main.kix": `
        import kix.io;

        class Box {
            private value: int;

            public Box(value: int) {
                self.value = value;
            }

            public &add(extra: int): int {
                return self.value + extra;
            }
        }

        public main(): int {
            Box box = new Box(5);
            int result = box.add(7);
            io::printf("%lld\\n", result);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("12\n");
  });

  test("waits for fire-and-forget tasks before the process exits", () => {
    const project = createProject("tasks-fire-and-forget", {
      "src/main.kix": `
        import kix.io;

        public &say(): void {
            io::println("finished");
        }

        public main(): int {
            say();
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("finished\n");
  });

  test("task class results are GC-rooted and task exceptions propagate", () => {
    const project = createProject("tasks-gc-errors", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.error.exceptions;

        class Box {
            public value: int;
            public Box(value: int) { self.value = value; }
        }

        public &makeBox(value: int): Box {
            return new Box(value);
        }

        public &fail(): int throws Exception {
            throw new Exception(ExceptionKind.Io, -5, "task failed");
        }

        public main(): int {
            Box first = makeBox(7);
            int i = 0;
            while (i < 1000) {
                String text = "x";
                i = i + 1;
            }
            io::printf("box=%lld\\n", first.value);

            try {
                int value = fail();
                io::printf("value=%lld\\n", value);
            } catch (error: Exception) {
                io::printf("task error=%s\\n", error.message());
            }
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const result = runWithEnv(project.output, { KIX_GC_STRESS: "1" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("box=7\ntask error=task failed\n");
  });

  test("uncaught fire-and-forget task exceptions fail the process", () => {
    const project = createProject("tasks-fire-error", {
      "src/main.kix": `
        import kix.error.exceptions;

        public &fire(): void throws Exception {
            throw new Exception(ExceptionKind.Io, -5, "fire failed");
        }

        public main(): int throws Exception {
            fire();
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const result = runWithEnv(project.output, {});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("task exception");
  });
});
