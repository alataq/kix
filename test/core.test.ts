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
  test("transpiles namespaces, classes, modules, and the runtime prelude", () => {
    const project = createProject("codegen", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.fs;

        public main(): int {
            String greeting = new String();
            greeting.append("hello");
            greeting.append("!");
            io::println(greeting);
            File file = new File();
            return 0;
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("KIX_RUNTIME_PRELUDE");
    expect(cSource).toContain("int main(void)");
    expect(cSource).toContain("mod_kix_string_String_append");
    expect(cSource).toContain("mod_kix_io_println");
    expect(cSource).toContain("mod_kix_fs_File_open");
    expect(cSource).toContain("mod_kix_syscalls_write");
    expect(cSource).not.toContain("mod_kix_str_");
  });

  test("builds and runs a hello program", () => {
    const project = createProject("hello", {
      "src/main.kix": `
        import kix.io;
        public main(): int {
            io::println("hello");
            return 0;
        }
      `,
    });

    const result = buildProject({ projectDir: project.dir });
    expect(result.binary).toBe(project.output);
    expect(run(project.output)).toBe("hello\n");
  });

  test("supports String buffers backed by typed array storage", () => {
    const project = createProject("strings", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        public main(): int {
            String buffer = new String();
            buffer.appendByte('A');
            buffer.appendByte('B');
            io::println(buffer);

            String text = "hello";
            String combined = text.concat("!");
            io::println(combined);
            io::printf("sub=%s length=%lld\\n", combined.substring(1, 3), combined.length());
            return 0;
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("calloc");
    expect(cSource).toContain("free(");
    expect(cSource).not.toContain("kix_array");
    expect(cSource).not.toContain("__kix_");

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("AB\nhello!\nsub=ell length=6\n");
  });

  test("reads a line through kix.io and syscall", () => {
    const project = createProject("readline", {
      "src/main.kix": `
        import kix.error.exceptions;
        import kix.io;
        import kix.string;

        public main(): int throws Exception {
            io::printf("name: ");
            String name = io::readLine();
            String greeting = new String();
            greeting.append("hello ");
            greeting.append(name);
            io::println(greeting);
            io::printf("length=%lld\\n", name.length());
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const output = run(project.output, "Ada\n");
    expect(output).toContain("name: hello Ada\n");
    expect(output).toContain("length=3\n");
  });

  test("generates mod_ prefix for modules and u_filename_ for user code", () => {
    const project = createProject("naming-prefixes", {
      "src/main.kix": `
        import kix.io;

        public helper(): void {
            int count = 42;
        }

        public main(): int {
            helper();
            io::println("ok");
            return 0;
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("u_main_helper");
    expect(cSource).toContain("_v_count");
    expect(cSource).toContain("mod_kix_io_println");
    expect(cSource).toContain("mod_kix_syscalls_write");
  });

  test("supports fixed-size int arrays: declare, write, read, loop", async () => {
    const project = createProject("arrays-int", {
      "src/main.kix": `
        import kix.io;

        public main(): int {
            int[4] nums;
            nums[0] = 10;
            nums[1] = 20;
            nums[2] = 30;
            nums[3] = 40;

            int total = 0;
            for (int i = 0; i < 4; i = i + 1) {
                total = total + nums[i];
            }
            io::printf("sum=%lld\\n", total);
            return 0;
        }
      `,
    });

    await buildProject({ projectRoot: project.dir, modulesDir });
    const output = run(project.output);
    expect(output.trim()).toBe("sum=100");
  });

  test("supports fixed-size char arrays as byte buffers", async () => {
    const project = createProject("arrays-char", {
      "src/main.kix": `
        import kix.io;

        public main(): int {
            char[4] buf;
            buf[0] = 'A';
            buf[1] = 'B';
            buf[2] = 'C';
            buf[3] = '\\0';
            io::printf("buf=%s\\n", buf);
            return 0;
        }
      `,
    });

    await buildProject({ projectRoot: project.dir, modulesDir });
    const output = run(project.output);
    expect(output.trim()).toBe("buf=ABC");
  });

  test("emits array typedef in generated C", () => {
    const project = createProject("arrays-typedef", {
      "src/main.kix": `
        public main(): int {
            int[8] arr;
            arr[0] = 1;
            return arr[0];
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("kix_arr_int_8");
    expect(cSource).toContain(".data[");
  });

  test("rejects binary operators on array types", () => {
    const project = createProject("arrays-binary-reject", {
      "src/main.kix": `
        public main(): int {
            int[2] a;
            int[2] b;
            int x = a + b;
            return 0;
        }
      `,
    });

    expect(() => compile(project.dir, project.entry)).toThrow(
      "cannot be applied to array types",
    );
  });

  test("passes argc and argv to main as String[]", () => {
    const project = createProject("main-argv", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        public main(argc: int, argv: String[]): int {
            io::printf("argc=%lld arg=", argc);
            if (argc > 2) {
                io::println(argv[2]);
            } else {
                io::println("none");
            }
            return 0;
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("int main(int argc, char **argv)");
    expect(cSource).toContain("kix_argv");

    buildProject({ projectDir: project.dir });
    const result = Bun.spawnSync({
      cmd: [project.output, "alpha", "beta"],
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe("argc=3 arg=beta\n");
  });

  test("allows main to take argc or argv independently", () => {
    const argcProject = createProject("main-argc", {
      "src/main.kix": `
        public main(argc: int): int {
            return argc > 0 ? 0 : 1;
        }
      `,
    });
    expect(compile(argcProject.dir, argcProject.entry)).toContain(
      "int main(int argc, char **argv)",
    );

    const argvProject = createProject("main-argv-only", {
      "src/main.kix": `
        import kix.string;

        public main(argv: String[]): int {
            String program = argv[0];
            return program.length();
        }
      `,
    });
    const cSource = compile(argvProject.dir, argvProject.entry);
    expect(cSource).toContain("int main(int argc, char **argv)");
    expect(cSource).toContain("kix_argv");
  });

  test("monomorphizes generic classes and grows Vector storage", () => {
    const project = createProject("generics-vector", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.vector;

        public main(): int {
            Vector<int> numbers = new Vector<int>();
            int i = 0;
            while (i < 100) {
                numbers.push(i);
                i = i + 1;
            }

            Vector<String> names = new Vector<String>();
            names.push("Ada");
            names.push("Lin");

            io::printf(
                "len=%lld cap=%lld last=%lld names=%s %s\\n",
                numbers.length(),
                numbers.capacity(),
                numbers.at(99),
                names.at(0),
                names.at(1)
            );
            return 0;
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("Vector_int");
    expect(cSource).toContain("Vector_mod_kix_string_String");

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("len=100 cap=128 last=99 names=Ada Lin\n");
  });

  test("rejects generic classes without type arguments", () => {
    const project = createProject("generics-missing-args", {
      "src/main.kix": `
        import kix.vector;

        public main(): int {
            Vector values = new Vector();
            return 0;
        }
      `,
    });

    expect(() => compile(project.dir, project.entry)).toThrow(
      "requires type arguments",
    );
  });

  test("runs task functions on general workers and awaits their results", () => {
    const project = createProject("tasks-general", {
      "src/main.kix": `
        $wkc 2;
        import kix.io;

        public &double(value: int): int {
            return value * 2;
        }

        public main(): int {
            int first = double(21);
            int second = double(10);
            while (!&first) {
            }
            io::printf("%lld %lld\\n", first, second);
            return 0;
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("kix_general_pool");
    expect(cSource).toContain("kix_task_submit");
    expect(cSource).toContain("kix_task_is_done");
    expect(cSource).toContain('kix_env_int("KIX_WKC", 2)');

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("42 20\n");
  });

  test("rejects invalid task declarations and task uses", () => {
    const noWorkers = createProject("tasks-zero-workers", {
      "src/main.kix": `
        public &0stop(): void {}
        public main(): int { return 0; }
      `,
    });
    expect(() => compile(noWorkers.dir, noWorkers.entry)).toThrow(
      "dedicated worker count must be at least 1",
    );

    const variadic = createProject("tasks-variadic", {
      "src/main.kix": `
        public &log(format: String, ...): void {}
        public main(): int { return 0; }
      `,
    });
    expect(() => compile(variadic.dir, variadic.entry)).toThrow(
      "task functions cannot be variadic",
    );

    const taskMain = createProject("tasks-main", {
      "src/main.kix": `public &main(): int { return 0; }`,
    });
    expect(() => compile(taskMain.dir, taskMain.entry)).toThrow(
      "entry point 'main' cannot be a task",
    );

    const ctorTask = createProject("tasks-constructor", {
      "src/main.kix": `
        class Box {
            public &Box() {}
        }
        public main(): int { return 0; }
      `,
    });
    expect(() => compile(ctorTask.dir, ctorTask.entry)).toThrow(
      "cannot be a task",
    );

    const badSetting = createProject("tasks-bad-setting", {
      "src/main.kix": `
        $wkc 0;
        public main(): int { return 0; }
      `,
    });
    expect(() => compile(badSetting.dir, badSetting.entry)).toThrow(
      "$wkc must be an integer of at least 1",
    );

    const unknownSetting = createProject("tasks-unknown-setting", {
      "src/main.kix": `
        $threads 2;
        public main(): int { return 0; }
      `,
    });
    expect(() => compile(unknownSetting.dir, unknownSetting.entry)).toThrow(
      "unknown setting '$threads'",
    );

    const notATask = createProject("tasks-done-normal-var", {
      "src/main.kix": `
        public main(): int {
            int value = 1;
            return &value ? 1 : 0;
        }
      `,
    });
    expect(() => compile(notATask.dir, notATask.entry)).toThrow(
      "does not hold a task result",
    );

    const assignTask = createProject("tasks-assign", {
      "src/main.kix": `
        public &value(): int { return 1; }
        public main(): int {
            int result = value();
            result = 2;
            return result;
        }
      `,
    });
    expect(() => compile(assignTask.dir, assignTask.entry)).toThrow(
      "cannot assign to 'result': it holds a task result",
    );
  });
});
