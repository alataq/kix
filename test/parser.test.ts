import { describe, expect, test } from "bun:test";
import { parse } from "../src/compiler/parser";

describe("parser", () => {
  test("parses the no-keyword declaration form", () => {
    const file = parse(
      `
      import kix.io;

      namespace kix.demo {
          public class Counter {
              private value: int;

              public bump(amount: int): void {
                  self.value = self.value + amount;
              }
          }

          public add(a: int, b: int): int {
              return a + b;
          }
      }

      public main(): int {
          io::println("!");
          return 0;
      }
      `,
      "test.kix",
    );

    expect(file.imports).toHaveLength(1);
    expect(file.declarations[0]?.kind).toBe("Namespace");

    const namespace = file.declarations[0];
    if (!namespace || namespace.kind !== "Namespace") throw new Error("bad AST");
    expect(namespace.name).toBe("kix.demo");

    const classDecl = namespace.body.find((decl) => decl.kind === "Class");
    expect(classDecl?.kind).toBe("Class");
    if (!classDecl || classDecl.kind !== "Class") throw new Error("bad AST");
    expect(classDecl.name).toBe("Counter");
    expect(classDecl.methods[0]?.name).toBe("bump");

    const main = file.declarations[1];
    expect(main?.kind).toBe("Function");
    if (!main || main.kind !== "Function") throw new Error("bad AST");
    expect(main.name).toBe("main");
    expect(main.visibility).toBe("public");
    expect(main.returnType.name).toBe("int");
    expect(main.body?.statements).toHaveLength(2);
  });

  test("parses simple enum declarations", () => {
    const file = parse(
      `
      public enum TokenKind {
          Identifier,
          Number,
          Plus,
      }
      public main(): int { return TokenKind.Number; }
      `,
      "test.kix",
    );

    const enumDecl = file.declarations[0];
    expect(enumDecl?.kind).toBe("Enum");
    if (!enumDecl || enumDecl.kind !== "Enum") throw new Error("bad AST");
    expect(enumDecl.name).toBe("TokenKind");
    expect(enumDecl.visibility).toBe("public");
    expect(enumDecl.variants.map((variant) => variant.name)).toEqual([
      "Identifier",
      "Number",
      "Plus",
    ]);
  });

  test("rejects duplicate enum variants", () => {
    expect(() =>
      parse(`public enum Bad { A, B, A } public main(): int { return 0; }`, "test.kix"),
    ).toThrow("duplicate enum variant 'A'");
  });

  test("parses return types after the parameter list", () => {
    const file = parse(
      `
      public main(): int { return 0; }
      public before(x: int): String { return "x"; }
      public after(x: int): String { return "x"; }
      private hidden(): void {}
      public noReturn() {}
      `,
      "test.kix",
    );

    expect(file.declarations.map((decl) => decl.kind)).toEqual([
      "Function",
      "Function",
      "Function",
      "Function",
      "Function",
    ]);
    const noReturn = file.declarations[4];
    if (!noReturn || noReturn.kind !== "Function") throw new Error("bad AST");
    expect(noReturn.returnType.name).toBe("void");
  });

  test("rejects the old return-type position", () => {
    expect(() => parse(`public main: int() { return 0; }`, "test.kix")).toThrow(
      "expected '(', found ':'",
    );
  });

  test("requires visibility on functions and methods", () => {
    expect(() => parse(`main(): int { return 0; }`, "test.kix")).toThrow(
      "functions must declare public or private visibility",
    );
    expect(() =>
      parse(`public class Thing { Thing() {} }`, "test.kix"),
    ).toThrow("methods must declare public or private visibility");
  });

  test("parses syscall and instance method calls", () => {
    const file = parse(
      `
      public main(): int {
          File f = new File();
          if (!f.open("a", "r")) { return 1; }
          syscall(1, 1, "x", 1);
          return 0;
      }
      `,
      "test.kix",
    );

    const main = file.declarations[0];
    if (!main || main.kind !== "Function") throw new Error("bad AST");
    expect(main.body?.statements[0]?.kind).toBe("VarDecl");
    expect(main.body?.statements[1]?.kind).toBe("If");
  });

  test("rejects duplicate parameter names", () => {
    expect(() => {
      parse(
        `
        public add(a: int, a: int): int {
            return a;
        }
        `,
        "test.kix",
      );
    }).toThrow("duplicate parameter name 'a'");
  });
});
