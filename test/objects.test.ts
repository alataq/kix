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
  test("rejects access to private fields", () => {
    const project = createProject("private", {
      "src/main.kix": `
        import kix.io;
        import kix.fs;
        public main(): int {
            File file = new File();
            file.handle = 1;
            return 0;
        }
      `,
    });

    expect(() => compile(project.dir, project.entry)).toThrow(KixError);
    try {
      compile(project.dir, project.entry);
    } catch (error) {
      expect((error as KixError).message).toContain("private");
    }
  });

  test("classes are references, nullable, and require local initializers", () => {
    const project = createProject("class-refs", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        class Box {
            public value: int;

            public Box(value: int) {
                self.value = value;
            }

            public set(value: int): void {
                self.value = value;
            }
        }

        public main(): int {
            Box a = new Box(1);
            Box b = a;
            b.set(7);
            io::printf("%lld\\n", a.value);

            Box missing = null;
            io::printf("null=%lld\\n", missing == null ? 1 : 0);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("7\nnull=1\n");

    const uninitialized = createProject("class-uninitialized", {
      "src/main.kix": `
        class Box {
            public Box() {}
        }
        public main(): int {
            Box box;
            return 0;
        }
      `,
    });
    expect(() => buildProject({ projectDir: uninitialized.dir })).toThrow(
      "must be initialized",
    );
  });

  test("null class access aborts at run time", () => {
    const project = createProject("class-null-access", {
      "src/main.kix": `
        import kix.io;

        class Box {
            public value: int;
            public Box(value: int) { self.value = value; }
        }

        public main(): int {
            Box box = null;
            io::printf("%lld\\n", box.value);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const result = runWithEnv(project.output, {});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("null");
  });

  test("GC stress reclaims unreachable class and string allocations", () => {
    const project = createProject("gc-stress", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.vector;

        class Node {
            public value: int;
            public next: Node;

            public Node(value: int) {
                self.value = value;
                self.next = null;
            }
        }

        public main(): int {
            Vector<String> names = new Vector<String>();
            int i = 0;
            while (i < 1000) {
                Node node = new Node(i);
                String text = "hello";
                names.push(text);
                i = i + 1;
            }
            io::printf("len=%lld first=%s\\n", names.length(), names.at(0));
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const result = runWithEnv(project.output, { KIX_GC_STRESS: "1" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("len=1000 first=hello\n");
  });

  test("destructors run on delete and on GC shutdown", () => {
    const project = createProject("destructors", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        class Res {
            public id: int;

            public Res(id: int) {
                self.id = id;
            }

            public ~Res() {
                io::printf("destroy %lld\\n", self.id);
            }
        }

        public main(): int {
            Res first = new Res(1);
            delete first;
            delete first;

            Res second = new Res(2);
            io::println("end");
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("destroy 1\nend\ndestroy 2\n");
  });

  test("using a destroyed object aborts", () => {
    const project = createProject("destroyed-access", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        class Res {
            public id: int;
            public Res(id: int) { self.id = id; }
            public ~Res() {}
        }

        public main(): int {
            Res first = new Res(1);
            delete first;
            io::printf("%lld\\n", first.id);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const result = runWithEnv(project.output, {});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("destroyed");
  });

  test("interfaces provide dynamic dispatch for class implementations", () => {
    const project = createProject("interfaces", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        public interface Named {
            name(): String;
        }

        public interface Valued {
            value(): int;
        }

        public class Item implements Named, Valued {
            private label: String;
            private amount: int;

            public Item(label: String, amount: int) {
                self.label = label;
                self.amount = amount;
            }

            public name(): String { return self.label; }
            public value(): int { return self.amount; }
        }

        public describe(item: Named): String {
            return item.name();
        }

        public total(item: Valued): int {
            return item.value();
        }

        public main(): int {
            Item item = new Item("Ada", 42);
            Named named = item;
            Valued valued = item;
            io::printf("%s %lld\\n", describe(named), total(valued));
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const result = runWithEnv(project.output, { KIX_GC_STRESS: "1" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("Ada 42\n");
  });

  test("supports structs, struct literals, and struct interfaces", () => {
    const project = createProject("structs", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        public interface Named {
            name(): String;
        }

        public struct Point implements Named {
            public x: int;
            public y: int;
            public label: String;

            public name(): String {
                return self.label;
            }

            public sum(): int {
                return self.x + self.y;
            }
        }

        public main(): int {
            Point point = Point { x: 3, y: 4, label: "point" };
            io::printf("%lld %s\\n", point.sum(), point.name());
            Named named = point;
            point.x = 10;
            io::printf("%s %lld\\n", named.name(), point.sum());
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const result = runWithEnv(project.output, { KIX_GC_STRESS: "1" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("7 point\npoint 14\n");
  });

  test("supports abstract classes and multi-level inheritance", () => {
    const project = createProject("inheritance", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        public abstract class Base {
            protected label: String;

            public Base(label: String) {
                self.label = label;
            }

            public abstract kind(): String;

            public describe(): String {
                return self.kind();
            }
        }

        public class Mid extends Base {
            protected extra: int;

            public Mid(label: String, extra: int) {
                super(label);
                self.extra = extra;
            }

            public kind(): String { return "mid"; }
        }

        public class Leaf extends Mid {
            public Leaf(label: String, extra: int) {
                super(label, extra);
            }

            public kind(): String { return "leaf"; }

            public labelValue(): String {
                return self.label;
            }
        }

        public main(): int {
            Leaf leaf = new Leaf("x", 1);
            Base base = leaf;
            io::printf("%s %s %s\\n", base.kind(), base.describe(), leaf.labelValue());
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("leaf leaf x\n");
  });

  test("rejects abstract instantiation and protected external access", () => {
    const abstractNew = createProject("abstract-new", {
      "src/main.kix": `
        public abstract class Base {
            public abstract value(): int;
        }
        public main(): int {
            Base base = new Base();
            return 0;
        }
      `,
    });
    expect(() => buildProject({ projectDir: abstractNew.dir })).toThrow(
      "abstract class",
    );

    const protectedAccess = createProject("protected-access", {
      "src/main.kix": `
        import kix.string;

        public class Base {
            protected value: int;
            public Base(value: int) { self.value = value; }
        }

        public main(): int {
            Base base = new Base(1);
            return base.value;
        }
      `,
    });
    expect(() => buildProject({ projectDir: protectedAccess.dir })).toThrow(
      "protected",
    );
  });

  test("rejects missing interface method implementations", () => {
    const project = createProject("interface-missing", {
      "src/main.kix": `
        import kix.string;

        public interface Named {
            name(): String;
        }

        public class Empty implements Named {
            public Empty() {}
        }

        public main(): int { return 0; }
      `,
    });

    expect(() => buildProject({ projectDir: project.dir })).toThrow(
      "does not implement",
    );
  });

  test("rejects collision between function and class in same namespace", () => {
    const project = createProject("dup-fn-class", {
      "src/main.kix": `
        public class Foo {
            private x: int;
        }
        public Foo(): void {}
        public main(): int { return 0; }
      `,
    });

    expect(() => buildProject({ projectDir: project.dir })).toThrow(
      "cannot declare both a function and a class with the same name",
    );
  });

  test("rejects collision between field and method in class", () => {
    const project = createProject("dup-field-method", {
      "src/main.kix": `
        public class Bar {
            private run: int;
            public run(): void {}
        }
        public main(): int { return 0; }
      `,
    });

    expect(() => buildProject({ projectDir: project.dir })).toThrow(
      "cannot be both a field and a method",
    );
  });

  test("supports array fields in classes", async () => {
    const project = createProject("arrays-class-field", {
      "src/main.kix": `
        import kix.io;

        class Point {
            public coords: int[3];
        }

        public main(): int {
            Point p = new Point();
            p.coords[0] = 7;
            p.coords[1] = 8;
            p.coords[2] = 9;
            io::printf("xyz=%lld %lld %lld\\n", p.coords[0], p.coords[1], p.coords[2]);
            return 0;
        }
      `,
    });

    await buildProject({ projectRoot: project.dir, modulesDir });
    const output = run(project.output);
    expect(output.trim()).toBe("xyz=7 8 9");
  });

  test("supports class constructors invoked with new", () => {
    const project = createProject("constructors", {
      "src/main.kix": `
        import kix.io;

        class Point {
            private x: int;
            private y: int;

            public Point(x: int, y: int) {
                self.x = x;
                self.y = y;
            }

            public sum(): int {
                return self.x + self.y;
            }
        }

        public main(): int {
            Point p = new Point(3, 4);
            io::printf("sum=%lld\\n", p.sum());
            return 0;
        }
      `,
    });

    const cSource = compile(project.dir, project.entry);
    expect(cSource).toContain("Point_new");

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("sum=7\n");
  });

  test("resolves overloaded constructors by argument types", () => {
    const project = createProject("constructor-overloads", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        class Box {
            private value: int;

            public Box() {
                self.value = 0;
            }

            public Box(value: int) {
                self.value = value;
            }

            public valueOf(): int {
                return self.value;
            }
        }

        public main(): int {
            Box empty = new Box();
            Box seven = new Box(7);

            String nothing = new String();
            String literal = new String("hello");
            char[] bytes = " world".address();
            String joined = new String(bytes);

            String first = nothing.concat(literal);
            String all = first.concat(joined);
            io::println(all);
            io::printf("%lld %lld\\n", empty.valueOf(), seven.valueOf());
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("hello world\n0 7\n");
  });

  test("resolves function and method overloads by argument types", () => {
    const project = createProject("overloads", {
      "src/main.kix": `
        import kix.io;
        import kix.string;

        public describe(value: int): int {
            return value;
        }

        public describe(value: String): int {
            return value.length();
        }

        public describe(value: int, extra: int): int {
            return value + extra;
        }

        class Box {
            private value: int;

            public Box(value: int) {
                self.value = value;
            }

            public show(extra: int): int {
                return self.value + extra;
            }

            public show(text: String): int {
                return self.value + text.length();
            }
        }

        public main(): int {
            Box box = new Box(10);
            io::printf(
                "%lld %lld %lld %lld %lld\\n",
                describe(7),
                describe("abcd"),
                describe(2, 3),
                box.show(5),
                box.show("xyz")
            );
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("7 4 5 15 13\n");
  });

  test("rejects duplicate overload signatures", () => {
    const project = createProject("duplicate-overloads", {
      "src/main.kix": `
        public pick(value: int): int { return value; }
        public pick(value: int): int { return value + 1; }
        public main(): int { return pick(1); }
      `,
    });

    expect(() => compile(project.dir, project.entry)).toThrow(
      "same parameter types",
    );
  });

  test("rejects constructor argument mismatches", () => {
    const project = createProject("constructor-arity", {
      "src/main.kix": `
        class Point {
            public Point(x: int) {}
        }

        public main(): int {
            Point p = new Point();
            return 0;
        }
      `,
    });

    expect(() => compile(project.dir, project.entry)).toThrow(
      "expected at least 1 argument, got 0",
    );
  });
});
