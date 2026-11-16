import type { SourceLocation } from "./errors";
import { PRIMITIVE_TYPE_NAMES } from "./core-types";

export { PRIMITIVE_TYPE_NAMES } from "./core-types";

export type TokenKind =
  | "identifier"
  | "keyword"
  | "int"
  | "float"
  | "string"
  | "char"
  | "symbol"
  | "eof";

export interface Token {
  kind: TokenKind;
  lexeme: string;
  /** Decoded value for string/char/number tokens. */
  value?: string | number | boolean;
  location: SourceLocation;
}

/**
 * Language keywords. Note that `function` is deliberately not a keyword:
 * Kix declarations are written as `public name(...): type {}` or
 * `public name: type() {}`.
 */
export const KEYWORDS = new Set([
  "import",
  "as",
  "namespace",
  "class",
  "struct",
  "interface",
  "implements",
  "extends",
  "is",
  "abstract",
  "super",
  "await",
  "enum",
  "public",
  "private",
  "static",
  "return",
  "if",
  "else",
  "while",
  "for",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "throw",
  "throws",
  "defer",
  "new",
  "delete",
  "self",
  "true",
  "false",
  "null",
  "let",
  "var",
  "const",
  ...PRIMITIVE_TYPE_NAMES,
]);

/** Symbols are ordered longest-first so the lexer can greedily match. */
export const MULTI_CHAR_SYMBOLS = [
  "::",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "++",
  "--",
  "...",
] as const;

export const SINGLE_CHAR_SYMBOLS = new Set([
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  ";",
  ",",
  ":",
  ".",
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  "<",
  ">",
  "!",
  "?",
  "&",
  "|",
  "^",
  "$",
  "~",
]);

export function isTypeKeyword(token: Token): boolean {
  return token.kind === "keyword" && PRIMITIVE_TYPE_NAMES.has(token.lexeme);
}

export function isIdentifierToken(token: Token): boolean {
  return token.kind === "identifier";
}
