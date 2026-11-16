import type { KixType } from "./program";
import { cVarIdent } from "./program";
import { KixError } from "./errors";
import type { SourceLocation } from "./errors";

export type VariableKind = "param" | "local" | "self";

export interface VariableSymbol {
  name: string;
  cName: string;
  type: KixType;
  kind: VariableKind;
  mutable: boolean;
  /**
   * When set, this variable holds the result of a task. The C name refers to a
   * `KixTask *`; reading the variable waits for completion.
   */
  taskFuture?: string;
}

export class Scope {
  private readonly parent: Scope | undefined;
  private readonly symbols = new Map<string, VariableSymbol>();

  constructor(parent?: Scope) {
    this.parent = parent;
  }

  child(): Scope {
    return new Scope(this);
  }

  define(
    name: string,
    type: KixType,
    kind: VariableKind,
    location: SourceLocation,
    mutable = true,
  ): VariableSymbol {
    if (this.symbols.has(name)) {
      throw new KixError(`duplicate declaration of '${name}'`, location);
    }
    const existing = this.parent?.resolve(name);
    if (existing) {
      throw new KixError(
        `duplicate declaration of '${name}': already declared in an enclosing scope`,
        location,
      );
    }

    const symbol: VariableSymbol = {
      name,
      cName: cVarIdent(name),
      type,
      kind,
      mutable,
    };
    this.symbols.set(name, symbol);
    return symbol;
  }

  resolve(name: string): VariableSymbol | undefined {
    return this.symbols.get(name) ?? this.parent?.resolve(name);
  }
}
