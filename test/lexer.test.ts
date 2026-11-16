import { describe, expect, test } from "bun:test";
import { tokenize } from "../src/compiler/lexer";

function lexemes(source: string): string[] {
  return tokenize(source, "test.kix")
    .filter((token) => token.kind !== "eof")
    .map((token) => token.lexeme);
}

describe("lexer", () => {
  test("handles module separators, members, and builtin names", () => {
    expect(lexemes('import kix.io; io::println(String::length(s)); f.open("x");')).toEqual([
      "import",
      "kix",
      ".",
      "io",
      ";",
      "io",
      "::",
      "println",
      "(",
      "String",
      "::",
      "length",
      "(",
      "s",
      ")",
      ")",
      ";",
      "f",
      ".",
      "open",
      "(",
      "x",
      ")",
      ";",
    ]);
  });

  test("decodes escapes and keeps literal values out of operator matching", () => {
    const tokens = tokenize('"hello\\n" "!" 42 3.5', "test.kix");
    expect(tokens[0]?.kind).toBe("string");
    expect(tokens[0]?.value).toBe("hello\n");
    expect(tokens[1]?.kind).toBe("string");
    expect(tokens[1]?.value).toBe("!");
    expect(tokens[2]?.kind).toBe("int");
    expect(tokens[3]?.kind).toBe("float");
  });
});
