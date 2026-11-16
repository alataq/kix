import { KixError } from "./errors";
import type { SourceLocation } from "./errors";
import {
  KEYWORDS,
  MULTI_CHAR_SYMBOLS,
  SINGLE_CHAR_SYMBOLS,
} from "./token";
import type { Token } from "./token";

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isHexDigit(ch: string): boolean {
  return (
    isDigit(ch) ||
    (ch >= "a" && ch <= "f") ||
    (ch >= "A" && ch <= "F")
  );
}

function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isIdentifierStart(ch: string): boolean {
  return isAlpha(ch) || ch === "_";
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}

export class Lexer {
  private readonly source: string;
  private readonly file: string;
  private index = 0;
  private line = 1;
  private column = 1;

  constructor(source: string, file: string) {
    this.source = source;
    this.file = file;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.atEnd()) {
      this.skipTrivia();
      if (this.atEnd()) break;

      const start = this.location();
      const ch = this.peek();

      if (isIdentifierStart(ch)) {
        tokens.push(this.readIdentifier(start));
        continue;
      }

      if (isDigit(ch)) {
        tokens.push(this.readNumber(start));
        continue;
      }

      if (ch === '"') {
        tokens.push(this.readString(start));
        continue;
      }

      if (ch === "'") {
        tokens.push(this.readChar(start));
        continue;
      }

      const symbol = this.readSymbol(start);
      tokens.push(symbol);
    }

    tokens.push({
      kind: "eof",
      lexeme: "",
      location: this.location(),
    });

    return tokens;
  }

  private atEnd(): boolean {
    return this.index >= this.source.length;
  }

  private peek(offset = 0): string {
    return this.source[this.index + offset] ?? "";
  }

  private location(): SourceLocation {
    return { file: this.file, line: this.line, column: this.column };
  }

  private advance(): string {
    const ch = this.source[this.index] ?? "";
    this.index += 1;

    if (ch === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }

    return ch;
  }

  private skipTrivia(): void {
    for (;;) {
      const ch = this.peek();

      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        this.advance();
        continue;
      }

      if (ch === "/" && this.peek(1) === "/") {
        while (!this.atEnd() && this.peek() !== "\n") this.advance();
        continue;
      }

      if (ch === "/" && this.peek(1) === "*") {
        const start = this.location();
        this.advance();
        this.advance();

        let closed = false;
        while (!this.atEnd()) {
          if (this.peek() === "*" && this.peek(1) === "/") {
            this.advance();
            this.advance();
            closed = true;
            break;
          }
          this.advance();
        }

        if (!closed) {
          throw new KixError("unterminated block comment", start);
        }

        continue;
      }

      break;
    }
  }

  private readIdentifier(start: SourceLocation): Token {
    let text = "";

    while (!this.atEnd() && isIdentifierPart(this.peek())) {
      text += this.advance();
    }

    return {
      kind: KEYWORDS.has(text) ? "keyword" : "identifier",
      lexeme: text,
      location: start,
    };
  }

  private readNumber(start: SourceLocation): Token {
    let raw = "";

    if (this.peek() === "0" && (this.peek(1) === "x" || this.peek(1) === "X")) {
      raw += this.advance();
      raw += this.advance();

      if (!isHexDigit(this.peek())) {
        throw new KixError("expected hexadecimal digits after 0x", start);
      }

      while (!this.atEnd() && isHexDigit(this.peek())) {
        raw += this.advance();
      }

      return {
        kind: "int",
        lexeme: raw,
        value: Number.parseInt(raw.slice(2), 16),
        location: start,
      };
    }

    while (!this.atEnd() && isDigit(this.peek())) raw += this.advance();

    let isFloat = false;

    if (this.peek() === "." && isDigit(this.peek(1))) {
      isFloat = true;
      raw += this.advance();
      while (!this.atEnd() && isDigit(this.peek())) raw += this.advance();
    }

    if (this.peek() === "e" || this.peek() === "E") {
      const next = this.peek(1);
      const afterSign = this.peek(2);
      if (isDigit(next) || ((next === "+" || next === "-") && isDigit(afterSign))) {
        isFloat = true;
        raw += this.advance();
        if (this.peek() === "+" || this.peek() === "-") raw += this.advance();
        while (!this.atEnd() && isDigit(this.peek())) raw += this.advance();
      }
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new KixError(`invalid numeric literal '${raw}'`, start);
    }

    return {
      kind: isFloat ? "float" : "int",
      lexeme: raw,
      value,
      location: start,
    };
  }

  private readString(start: SourceLocation): Token {
    this.advance(); // opening quote
    let value = "";

    while (!this.atEnd()) {
      const ch = this.peek();

      if (ch === '"') {
        this.advance();
        return {
          kind: "string",
          lexeme: value,
          value,
          location: start,
        };
      }

      if (ch === "\n") {
        throw new KixError("unterminated string literal", start);
      }

      if (ch === "\\") {
        this.advance();
        value += this.readEscape(start);
        continue;
      }

      value += this.advance();
    }

    throw new KixError("unterminated string literal", start);
  }

  private readChar(start: SourceLocation): Token {
    this.advance(); // opening quote

    if (this.atEnd() || this.peek() === "\n") {
      throw new KixError("unterminated character literal", start);
    }

    let value = "";
    if (this.peek() === "\\") {
      this.advance();
      value = this.readEscape(start);
    } else {
      value = this.advance();
    }

    if (this.peek() !== "'") {
      throw new KixError(
        "character literal must contain exactly one character",
        start,
      );
    }
    this.advance();

    return {
      kind: "char",
      lexeme: value,
      value,
      location: start,
    };
  }

  private readEscape(start: SourceLocation): string {
    if (this.atEnd()) {
      throw new KixError("unterminated escape sequence", start);
    }

    const ch = this.advance();
    switch (ch) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "0":
        return "\0";
      case "\\":
        return "\\";
      case "'":
        return "'";
      case '"':
        return '"';
      case "x": {
        let hex = "";
        for (let i = 0; i < 2; i += 1) {
          const next = this.peek();
          if (!isHexDigit(next)) break;
          hex += this.advance();
        }
        if (hex.length === 0) {
          throw new KixError("expected hexadecimal digits after \\x", start);
        }
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      default:
        throw new KixError(`unknown escape sequence '\\${ch}'`, start);
    }
  }

  private readSymbol(start: SourceLocation): Token {
    for (const symbol of MULTI_CHAR_SYMBOLS) {
      if (this.source.startsWith(symbol, this.index)) {
        for (let i = 0; i < symbol.length; i += 1) this.advance();
        return {
          kind: "symbol",
          lexeme: symbol,
          location: start,
        };
      }
    }

    const ch = this.peek();
    if (SINGLE_CHAR_SYMBOLS.has(ch)) {
      this.advance();
      return {
        kind: "symbol",
        lexeme: ch,
        location: start,
      };
    }

    throw new KixError(`unexpected character '${ch}'`, start);
  }
}

export function tokenize(source: string, file = "<input>"): Token[] {
  return new Lexer(source, file).tokenize();
}
