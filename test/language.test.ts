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
  test("checked exceptions support try/catch/finally and throw", () => {
    const project = createProject("exceptions", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.error.exceptions;

        public fail(value: int): int throws Exception {
            if (value < 0) {
                throw new Exception(ExceptionKind.InvalidArgument, -22, "negative");
            }
            return value;
        }

        public safe(value: int): int {
            try {
                int result = fail(value);
                io::printf("try=%lld\\n", result);
            } catch (error: Exception) {
                io::printf("caught=%s\\n", error.message());
            } finally {
                io::println("finally");
            }
            return 0;
        }

        public main(): int {
            safe(5);
            safe(-1);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe(
      "try=5\nfinally\ncaught=negative\nfinally\n",
    );
  });

  test("checked exceptions reject uncaught throwing calls", () => {
    const project = createProject("exceptions-uncaught", {
      "src/main.kix": `
        import kix.error.exceptions;

        public fail(): int throws Exception {
            throw new Exception(ExceptionKind.Io, -5, "bad");
            return 0;
        }

        public main(): int {
            int value = fail();
            return value;
        }
      `,
    });

    expect(() => buildProject({ projectDir: project.dir })).toThrow(
      "uncaught exception",
    );
  });

  test("defer runs on normal scope exit and return", () => {
    const project = createProject("defer", {
      "src/main.kix": `
        import kix.io;

        public main(): int {
            io::println("start");
            defer io::println("deferred");
            io::println("end");
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("start\nend\ndeferred\n");
  });

  test("bounds-checks fixed and dynamic array access", () => {
    const fixed = createProject("bounds-fixed", {
      "src/main.kix": `
        public main(): int {
            int[3] values;
            values[3] = 1;
            return 0;
        }
      `,
    });
    buildProject({ projectDir: fixed.dir });
    const fixedResult = runWithEnv(fixed.output, {});
    expect(fixedResult.status).not.toBe(0);
    expect(fixedResult.stderr).toContain("out of bounds");

    const dynamic = createProject("bounds-dynamic", {
      "src/main.kix": `
        public main(): int {
            int[] values = int[3];
            values[5] = 1;
            return 0;
        }
      `,
    });
    buildProject({ projectDir: dynamic.dir });
    const dynamicResult = runWithEnv(dynamic.output, {});
    expect(dynamicResult.status).not.toBe(0);
    expect(dynamicResult.stderr).toContain("out of bounds");
  });

  test("supports typed throws and custom throwable subclasses", () => {
    const project = createProject("typed-throws", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.error.exceptions;

        public class ValidationException extends Exception {
            public ValidationException(message: String) {
                super(ExceptionKind.InvalidArgument, -22, message);
            }
        }

        public parse(value: int): int throws ValidationException {
            if (value < 0) {
                throw new ValidationException("negative");
            }
            return value * 2;
        }

        public parseWide(value: int): int throws Exception {
            return parse(value);
        }

        public main(): int {
            try {
                parse(-1);
            } catch (error: ValidationException) {
                io::printf("custom=%s\\n", error.message());
            }

            try {
                parseWide(-2);
            } catch (error: Error) {
                io::printf("base=%s\\n", error.message());
            }
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("custom=negative\nbase=negative\n");
  });

  test("supports primitive and checked class/interface casts", () => {
    const project = createProject("casts", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        public interface Named {
            name(): String;
        }

        public class Base {
            public Base() {}
        }

        public class Child extends Base implements Named {
            public Child() {}
            public name(): String { return "child"; }
        }

        public main(): int {
            int value = 65;
            char letter = value as char;
            float decimal = value as float;
            io::printf("%c %lld %.1f\\n", letter, value as int, decimal);

            Child child = new Child();
            Base base = child;
            io::printf("is=%lld\\n", base is Child ? 1 : 0);
            Child down = base as Child;
            io::printf("%s\\n", down.name());

            Named named = child;
            io::printf("iface_is=%lld\\n", named is Child ? 1 : 0);
            Child fromInterface = named as Child;
            io::printf("%s\\n", fromInterface.name());
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("A 65 65.0\nis=1\nchild\niface_is=1\nchild\n");
  });

  test("allows return, break, and continue inside try/catch with finally", () => {
    const project = createProject("try-control-flow", {
      "src/main.kix": `
        import kix.io;

        public compute(): int {
            try {
                return 7;
            } finally {
                io::println("return-finally");
            }
        }

        public main(): int {
            int i = 0;
            while (i < 3) {
                i = i + 1;
                try {
                    if (i == 2) {
                        continue;
                    }
                    if (i == 3) {
                        break;
                    }
                    io::printf("body=%lld\\n", i);
                } finally {
                    io::println("loop-finally");
                }
            }
            io::printf("value=%lld\\n", compute());
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe(
      "body=1\nloop-finally\nloop-finally\nloop-finally\nreturn-finally\nvalue=7\n",
    );
  });

  test("supports switch statements with case and default", () => {
    const project = createProject("switch", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        public enum Kind { A, B, C }

        public main(): int {
            int value = 2;
            switch (value) {
                case 0:
                    io::println("zero");
                    break;
                case 2:
                    io::println("two");
                    break;
                default:
                    io::println("other");
            }

            Kind kind = Kind.B;
            switch (kind) {
                case Kind.A:
                    io::println("a");
                    break;
                case Kind.B:
                    io::println("b");
                    break;
                default:
                    io::println("unknown");
            }
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("two\nb\n");
  });

  test("enforces immutable bindings and const initializers", () => {
    const assignment = createProject("immutable-assignment", {
      "src/main.kix": `
        public main(): int {
            let value: int = 1;
            value = 2;
            return value;
        }
      `,
    });
    expect(() => buildProject({ projectDir: assignment.dir })).toThrow(
      "immutable",
    );

    const uninitialized = createProject("immutable-uninitialized", {
      "src/main.kix": `
        public main(): int {
            const value: int;
            return value;
        }
      `,
    });
    expect(() => buildProject({ projectDir: uninitialized.dir })).toThrow(
      "must be initialized",
    );

    const mutable = createProject("mutable-var", {
      "src/main.kix": `
        public main(): int {
            var value: int = 1;
            value = 2;
            return 0;
        }
      `,
    });
    buildProject({ projectDir: mutable.dir });
    expect(run(mutable.output)).toBe("");
  });

  test("supports bitwise and shift operators", () => {
    const project = createProject("bitwise", {
      "src/main.kix": `
        import kix.io;

        public main(): int {
            io::printf("%lld %lld %lld %lld %lld\\n",
                6 & 3,
                6 | 3,
                6 ^ 3,
                1 << 4,
                16 >> 2);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("2 7 5 16 4\n");
  });

  test("rejects duplicate variable declarations in nested scopes", () => {
    const project = createProject("dup-var", {
      "src/main.kix": `
        public main(): int {
            int x = 1;
            if (true) {
                int x = 2;
            }
            return 0;
        }
      `,
    });

    expect(() => buildProject({ projectDir: project.dir })).toThrow(
      "duplicate declaration of 'x'",
    );
  });

  test("escapes C macros and reserved identifiers used as variable names", () => {
    const project = createProject("escaped-vars", {
      "src/main.kix": `
        import kix.io;
        public main(): int {
            int stdin = 10;
            int stdout = 20;
            int NULL = 30;
            io::printf("%lld\\n", stdin + stdout + NULL);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("60\n");
  });

  test("rejects C symbol collision between distinct Kix symbols", () => {
    const project = createProject("c-collision", {
      "src/main.kix": `
        namespace a.b {
            public helper(): void {}
        }
        namespace a_b {
            public helper(): void {}
        }
        public main(): int { return 0; }
      `,
    });

    expect(() => buildProject({ projectDir: project.dir })).toThrow(
      "produces C identifier 'u_main_a_b_helper', which collides with",
    );
  });

  test("supports simple enums, default values, and enum arrays", () => {
    const project = createProject("enum", {
      "src/main.kix": `
        import kix.io;

        public enum TokenKind {
            Identifier,
            Number,
            Plus,
        }

        public main(): int {
            TokenKind empty;
            if (empty != TokenKind.Identifier) return 1;

            TokenKind kind = TokenKind.Number;
            if (kind == TokenKind.Number) {
                io::println("number");
            }

            TokenKind[] kinds = TokenKind[3];
            kinds[0] = TokenKind.Plus;
            kinds[2] = TokenKind.Number;
            if (kinds[0] == TokenKind.Plus) {
                io::println("plus");
            }
            if (kinds[2] == TokenKind.Number) {
                io::println("array");
            }
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("number\nplus\narray\n");
  });

  test("emits enum typedefs and rejects unknown variants", () => {
    const project = createProject("enum-codegen", {
      "src/main.kix": `
        public enum Color { Red, Green }
        public main(): int { Color color = Color.Green; return 0; }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("typedef enum");
    expect(cSource).toContain("Color_Green = 1");

    const bad = createProject("enum-bad-variant", {
      "src/main.kix": `
        public enum Color { Red, Green }
        public main(): int { return Color.Blue; }
      `,
    });
    expect(() => buildProject({ projectDir: bad.dir })).toThrow(
      "enum 'Color' has no variant 'Blue'",
    );

    const wrongSyntax = createProject("enum-wrong-syntax", {
      "src/main.kix": `
        public enum Color { Red, Green }
        public main(): int { return Color::Green; }
      `,
    });
    expect(() => buildProject({ projectDir: wrongSyntax.dir })).toThrow(
      "'Color::Green' must be called",
    );
  });
});
