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
  test("prefers the project's modules/kix tree over the bundled modules", () => {
    const project = createProject("project-modules", {
      "src/main.kix": `
        import kix.io;
        public main(): int {
            io::println("project kix.io");
            return 0;
        }
      `,
      "modules/kix/io.kix": `
        import kix.string;
        import kix.syscalls;
        namespace io {
            public println(message: String): void {
                syscalls::write(1, message, message.length());
                syscalls::write(1, "\\n", 1);
            }
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("project kix.io\n");
  });

  test("resolves local modules relative to the project", () => {
    const project = createProject("local", {
      "src/main.kix": `
        import util;
        import kix.io;

        public main(): int {
            io::println("local module");
            return util::answer();
        }
      `,
      "src/util.kix": `
        namespace util {
            public answer(): int {
                return 0;
            }
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("local module\n");
  });

  test("supports multi-level imports and package index modules", () => {
    const project = createProject("multi-import", {
      "src/main.kix": `
        import kix.io;
        import app.models.user;
        import app.util;

        public main(): int {
            io::printf("%s %lld\\n", user::name(), util::answer());
            return 0;
        }
      `,
      "src/app/models/user.kix": `
        import kix.string;
        namespace app.models.user {
            public name(): String {
                return "Ada";
            }
        }
      `,
      "src/app/util.kix": `
        namespace app.util {
            public answer(): int {
                return 42;
            }
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("Ada 42\n");
  });

  test("supports nested namespace declarations", () => {
    const project = createProject("nested-namespaces", {
      "src/main.kix": `
        import kix.io;

        namespace outer {
            namespace inner {
                public value(): int {
                    return 7;
                }
            }
        }

        public main(): int {
            io::printf("%lld\\n", outer.inner::value());
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("7\n");
  });
});
