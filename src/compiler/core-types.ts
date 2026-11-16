import type { ClassInfo, EnumInfo, InterfaceInfo } from "./program";

/**
 * Central primitive registry. Add a primitive here, then add its lexer keyword
 * automatically through PRIMITIVE_TYPE_NAMES. The parser, type checker, and C
 * emitter all derive their primitive behavior from this table.
 */
export const PRIMITIVE_DEFS = {
  int: {
    cType: "kix_int",
    defaultValue: "0",
    condition: true,
    widensTo: "float",
  },
  float: {
    cType: "kix_float",
    defaultValue: "0.0",
    condition: false,
  },
  bool: {
    cType: "kix_bool",
    defaultValue: "false",
    condition: true,
  },
  char: {
    cType: "kix_char",
    defaultValue: "'\\0'",
    condition: false,
    widensTo: "int",
  },
  void: {
    cType: "void",
    defaultValue: null,
    condition: false,
  },
} as const;

export type PrimitiveName = keyof typeof PRIMITIVE_DEFS;

export interface PrimitiveType {
  kind: "primitive";
  name: PrimitiveName;
}

export interface ClassType {
  kind: "class";
  info: ClassInfo;
}

export interface EnumType {
  kind: "enum";
  info: EnumInfo;
}

export interface InterfaceType {
  kind: "interface";
  info: InterfaceInfo;
}

export interface ArrayType {
  kind: "array";
  element: KixType;
  /** `null` means a dynamically sized array declared as `T[]`. */
  size: number | null;
}

export interface NullType {
  kind: "null";
}

export type KixType =
  | PrimitiveType
  | ClassType
  | EnumType
  | InterfaceType
  | ArrayType
  | NullType;

export const PRIMITIVE_NAMES = Object.keys(
  PRIMITIVE_DEFS,
) as PrimitiveName[];

export const PRIMITIVE_TYPE_NAMES = new Set<string>(PRIMITIVE_NAMES);

export const PRIMITIVES = Object.fromEntries(
  PRIMITIVE_NAMES.map((name) => [name, { kind: "primitive", name }]),
) as Record<PrimitiveName, PrimitiveType>;

export const INT = PRIMITIVES.int;
export const FLOAT = PRIMITIVES.float;
export const BOOL = PRIMITIVES.bool;
export const CHAR = PRIMITIVES.char;
export const VOID = PRIMITIVES.void;
export const NULL_TYPE: NullType = { kind: "null" };

export function primitiveType(name: string): PrimitiveType | undefined {
  return PRIMITIVE_TYPE_NAMES.has(name)
    ? PRIMITIVES[name as PrimitiveName]
    : undefined;
}

function arrayElementSuffix(type: KixType): string {
  if (type.kind === "primitive") return type.name;
  if (type.kind === "class" || type.kind === "enum" || type.kind === "interface") {
    return type.info.cName;
  }
  if (type.kind === "null") return "null";
  return `array_${type.element.kind === "primitive" ? type.element.name : "nested"}`;
}

export function cType(type: KixType): string {
  if (type.kind === "class") {
    return type.info.isStruct ? type.info.cName : `${type.info.cName} *`;
  }
  if (type.kind === "interface") return `${type.info.cName} *`;
  if (type.kind === "enum") return type.info.cName;
  if (type.kind === "array") {
    const suffix = arrayElementSuffix(type.element);
    return type.size === null ? `kix_dyn_${suffix}` : `kix_arr_${suffix}_${type.size}`;
  }
  if (type.kind === "null") return "void *";
  return PRIMITIVE_DEFS[type.name].cType;
}

export function primitiveDefault(type: PrimitiveType): string | null {
  return PRIMITIVE_DEFS[type.name].defaultValue;
}

export function isConditionType(type: KixType): boolean {
  return type.kind === "primitive" && PRIMITIVE_DEFS[type.name].condition;
}

export function canWiden(source: PrimitiveName, target: PrimitiveName): boolean {
  const seen = new Set<PrimitiveName>();
  let current: PrimitiveName | undefined = source;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const definition = PRIMITIVE_DEFS[current] as {
      widensTo?: PrimitiveName;
    };
    if (definition.widensTo === target) return true;
    current = definition.widensTo;
  }
  return false;
}

export function typeToString(type: KixType): string {
  if (type.kind === "primitive") return type.name;
  if (type.kind === "null") return "null";
  if (type.kind === "array") {
    return `${typeToString(type.element)}[${type.size ?? ""}]`;
  }
  return type.info.fullName;
}

export function sameType(a: KixType, b: KixType): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "null" && b.kind === "null") return true;
  if (a.kind === "primitive" && b.kind === "primitive") {
    return a.name === b.name;
  }
  if (a.kind === "class" && b.kind === "class") {
    return a.info.fullName === b.info.fullName;
  }
  if (a.kind === "interface" && b.kind === "interface") {
    return a.info.fullName === b.info.fullName;
  }
  if (a.kind === "enum" && b.kind === "enum") {
    return a.info.fullName === b.info.fullName;
  }
  if (a.kind === "array" && b.kind === "array") {
    return sameType(a.element, b.element) && a.size === b.size;
  }
  return false;
}

export function isAssignable(source: KixType, target: KixType): boolean {
  if (sameType(source, target)) return true;
  if (
    source.kind === "null" &&
    ((target.kind === "class" && !target.info.isStruct) ||
      target.kind === "interface")
  ) {
    return true;
  }
  if (source.kind === "class" && target.kind === "class") {
    let parent = source.info.parent;
    while (parent) {
      if (parent.fullName === target.info.fullName) return true;
      parent = parent.parent;
    }
  }
  if (source.kind === "class" && target.kind === "interface") {
    return source.info.implements.some(
      (implemented) => implemented.fullName === target.info.fullName,
    );
  }
  if (source.kind === "primitive" && target.kind === "primitive") {
    return canWiden(source.name, target.name);
  }
  return false;
}
