import type {
  BlockStmt,
  ClassDecl,
  EnumDecl,
  Expr,
  InterfaceDecl,
  FieldDecl,
  FunctionDecl,
  Stmt,
  StructDecl,
  TypeRef,
} from "./ast";
import type { ModuleRecord } from "./loader";
import { KixError } from "./errors";
import type { SourceLocation } from "./errors";

import { primitiveType, sameType, typeToString } from "./core-types";
import type { KixType } from "./core-types";
import {
  createBuiltinFunctionTable,
} from "./builtins";
import type { BuiltinFunction } from "./builtins";

export {
  BOOL,
  CHAR,
  FLOAT,
  INT,
  PRIMITIVES,
  PRIMITIVE_DEFS,
  PRIMITIVE_NAMES,
  PRIMITIVE_TYPE_NAMES,
  VOID,
  cType,
  isAssignable,
  sameType,
  typeToString,
} from "./core-types";
export type {
  KixType,
  ClassType,
  EnumType,
  PrimitiveName,
  PrimitiveType,
} from "./core-types";
export type { BuiltinFunction } from "./builtins";
export type { ArrayType } from "./core-types";

import {
  cIdent,
  cVarIdent,
  fullSymbolName,
  functionKey,
  mangleClass,
  mangleEnum,
  mangleFunction,
  modulePrefix,
} from "./names";

export {
  cIdent,
  cVarIdent,
  fullSymbolName,
  functionKey,
  mangleClass,
  mangleEnum,
  mangleFunction,
  mangleNamespace,
  modulePrefix,
} from "./names";

function typeRefKey(ref: TypeRef): string {
  const typeArgs =
    ref.typeArgs && ref.typeArgs.length > 0
      ? `<${ref.typeArgs.map(typeRefKey).join(",")}>`
      : "";
  const array = ref.dynamicArray
    ? "[]"
    : ref.arraySize !== undefined
      ? `[${ref.arraySize}]`
      : "";
  return `${ref.name}${typeArgs}${array}`;
}

function functionSignatureKey(decl: FunctionDecl): string {
  const params = decl.params.map((param) => typeRefKey(param.type)).join(",");
  return `${decl.variadic ? "..." : ""}(${params})`;
}

export interface TaskInfo {
  /** Stable id used for generated C symbols. */
  id: number;
  /** Zero means the shared general worker pool. */
  workers: number;
  poolCName: string;
  payloadCName: string;
  runCName: string;
}

export interface FunctionInfo {
  decl: FunctionDecl;
  key: string;
  namespace: string;
  cName: string;
  module: ModuleRecord;
  visibility: FunctionDecl["visibility"];
  /** Implemented by the C runtime instead of being emitted. */
  external: boolean;
  task?: TaskInfo;
}

export interface MethodInfo {
  decl: FunctionDecl;
  classInfo: ClassInfo;
  cName: string;
  visibility: FunctionDecl["visibility"];
  /** For constructors, the C helper that allocates and initializes a value. */
  wrapperCName?: string;
  task?: TaskInfo;
}

export interface FieldInfo {
  decl: FieldDecl;
  classInfo: ClassInfo;
}

export interface InterfaceMethodInfo {
  decl: FunctionDecl;
  index: number;
  interfaceInfo: InterfaceInfo;
}

export interface InterfaceInfo {
  decl: InterfaceDecl;
  namespace: string;
  fullName: string;
  cName: string;
  module: ModuleRecord;
  visibility: InterfaceDecl["visibility"];
  methods: Map<string, InterfaceMethodInfo>;
}

export interface ClassInfo {
  decl: ClassDecl;
  namespace: string;
  fullName: string;
  cName: string;
  module: ModuleRecord;
  visibility: ClassDecl["visibility"];
  abstract: boolean;
  isStruct: boolean;
  parent?: ClassInfo;
  implements: InterfaceInfo[];
  vtableSlots: Map<string, number>;
  vtableMethods: (MethodInfo | undefined)[];
  fields: Map<string, FieldInfo>;
  methods: Map<string, MethodInfo[]>;
  /** Type parameter names from the declaration (empty for concrete classes). */
  typeParamNames: string[];
  /** Concrete type arguments for an instantiated generic class. */
  typeArgs: KixType[];
  /** Methods whose name matches the class, invoked by `new`. */
  ctors: MethodInfo[];
  /** Optional `~ClassName` destructor. */
  destructor?: MethodInfo;
}

export interface EnumVariantInfo {
  name: string;
  value: number;
  cName: string;
  enumInfo: EnumInfo;
}

export interface EnumInfo {
  decl: EnumDecl;
  namespace: string;
  fullName: string;
  cName: string;
  module: ModuleRecord;
  visibility: EnumDecl["visibility"];
  variants: Map<string, EnumVariantInfo>;
}

export interface GenericClassInfo {
  decl: ClassDecl;
  namespace: string;
  fullName: string;
  module: ModuleRecord;
  visibility: ClassDecl["visibility"];
  typeParamNames: string[];
}

export interface ResolveContext {
  module: ModuleRecord;
  namespace: string;
  classInfo?: ClassInfo;
  /** Substitutions for generic type parameters in the current class. */
  typeSubstitution?: Map<string, KixType>;
}

export class ProgramTable {
  readonly modules: ModuleRecord[];
  readonly entry: ModuleRecord;
  /** Default number of general workers (in addition to the main thread). */
  readonly workerCount: number;
  readonly functions = new Map<string, FunctionInfo[]>();
  readonly classes = new Map<string, ClassInfo>();
  readonly interfaces = new Map<string, InterfaceInfo>();
  readonly enums = new Map<string, EnumInfo>();
  readonly genericClasses = new Map<string, GenericClassInfo>();
  readonly namespaces = new Set<string>();
  readonly builtins = new Map<string, BuiltinFunction>();
  private readonly moduleByPath = new Map<string, ModuleRecord>();
  private readonly cSymbolLocations = new Map<string, { symbol: string; location: SourceLocation }>();
  private taskCounter = 0;

  constructor(modules: ModuleRecord[], entry: ModuleRecord) {
    this.modules = modules;
    this.entry = entry;
    this.workerCount = this.resolveSettings();

    for (const module of modules) this.moduleByPath.set(module.path, module);
    this.installBuiltins();
    for (const module of modules) this.collectModule(module);
    this.validateEntry();
    this.resolveClassParents();
    this.buildClassVtables();
    this.validateClassInterfaces();
    this.indexAllTypes();
    this.buildClassVtables();
    this.validateClassInterfaces();
  }

  private resolveSettings(): number {
    let workerCount = 1;
    const seen = new Set<string>();

    for (const setting of this.entry.ast.settings) {
      if (seen.has(setting.name)) {
        throw new KixError(
          `duplicate setting '$${setting.name}'`,
          setting.location,
        );
      }
      seen.add(setting.name);

      if (setting.name !== "wkc") {
        throw new KixError(
          `unknown setting '$${setting.name}'`,
          setting.location,
          "the only supported setting is $wkc (general worker count)",
        );
      }

      if (!Number.isInteger(setting.value) || setting.value < 1) {
        throw new KixError(
          "$wkc must be an integer of at least 1",
          setting.location,
        );
      }
      workerCount = setting.value;
    }

    return workerCount;
  }

  function(namespace: string, name: string): FunctionInfo[] | undefined {
    return this.functions.get(functionKey(namespace, name));
  }

  classByFullName(name: string): ClassInfo | undefined {
    return this.classes.get(name);
  }

  enumByFullName(name: string): EnumInfo | undefined {
    return this.enums.get(name);
  }

  resolveType(ref: TypeRef, context: ResolveContext): KixType {
    const substituted = this.substitutionFor(ref.name, context);
    if (
      substituted &&
      ref.arraySize === undefined &&
      !ref.dynamicArray &&
      (ref.typeArgs === undefined || ref.typeArgs.length === 0)
    ) {
      return substituted;
    }

    if (ref.dynamicArray) {
      if (ref.typeArgs && ref.typeArgs.length > 0) {
        throw new KixError(
          "generic dynamic array element types are not supported yet",
          ref.location,
        );
      }

      let element = this.substitutionFor(ref.name, context);
      if (!element) {
        const primitive = primitiveType(ref.name);
        if (primitive) {
          element = primitive;
        } else {
          const enumInfo = this.resolveEnum(ref, context);
          if (enumInfo) {
            element = { kind: "enum", info: enumInfo };
          } else {
            const interfaceInfo = this.resolveInterfaceOptional(ref, context);
            element = interfaceInfo
              ? { kind: "interface", info: interfaceInfo }
              : { kind: "class", info: this.resolveClass(ref, context) };
          }
        }
      }
      if (element.kind === "primitive" && element.name === "void") {
        throw new KixError("a dynamic array cannot have element type void", ref.location);
      }
      return { kind: "array", element, size: null };
    }

    if (ref.arraySize !== undefined) {
      let element: KixType | undefined = primitiveType(ref.name);
      if (!element) {
        const sub = this.substitutionFor(ref.name, context);
        if (
          sub &&
          (sub.kind === "primitive" || sub.kind === "enum")
        ) {
          element = sub;
        }
      }
      if (!element) {
        const enumInfo = this.resolveEnum(ref, context);
        if (enumInfo) element = { kind: "enum", info: enumInfo };
      }
      if (!element) {
        throw new KixError(
          `fixed-size arrays are currently supported for primitive and enum types, found '${ref.name}'`,
          ref.location,
        );
      }
      if (ref.typeArgs && ref.typeArgs.length > 0) {
        throw new KixError(
          "generic array element types are not supported yet",
          ref.location,
        );
      }
      return {
        kind: "array",
        element,
        size: ref.arraySize,
      };
    }

    if (ref.typeArgs && ref.typeArgs.length > 0) {
      const template = this.resolveGenericTemplate(ref, context);
      const typeArgs = ref.typeArgs.map((arg) => this.resolveType(arg, context));
      return {
        kind: "class",
        info: this.instantiateClass(template, typeArgs, ref.location),
      };
    }

    const primitive = primitiveType(ref.name);
    if (primitive) return primitive;

    const enumInfo = this.resolveEnum(ref, context);
    if (enumInfo) return { kind: "enum", info: enumInfo };

    const interfaceInfo = this.resolveInterfaceOptional(ref, context);
    if (interfaceInfo) return { kind: "interface", info: interfaceInfo };

    if (this.genericCandidates(ref.name, context).size > 0) {
      throw new KixError(
        `generic class '${ref.name}' requires type arguments`,
        ref.location,
        `write ${ref.name}<...> instead`,
      );
    }

    return { kind: "class", info: this.resolveClass(ref, context) };
  }

  resolveReturnType(fn: FunctionInfo | MethodInfo, context: ResolveContext): KixType {
    return this.resolveType(fn.decl.returnType, context);
  }

  resolveClass(ref: TypeRef, context: ResolveContext): ClassInfo {
    const name = ref.name;
    const primitive = primitiveType(name);
    if (primitive) {
      throw new KixError(`'${name}' is not a class type`, ref.location);
    }

    const parts = name.split(/\.|::/).filter(Boolean);
    if (parts.length > 1) {
      const className = parts[parts.length - 1]!;
      const alias = parts[0]!;
      const binding = context.module.bindings.get(alias);
      const qualifier = parts.slice(0, -1).join(".");
      let namespace: string | undefined;

      if (binding && parts.length === 2) {
        namespace = binding.namespace;
      } else if (qualifier === context.namespace) {
        namespace = qualifier;
      }

      if (!namespace) {
        throw new KixError(
          `unknown namespace qualifier '${alias}' for class '${className}'`,
          ref.location,
        );
      }

      const info = this.classes.get(fullSymbolName(namespace, className));
      if (!info) {
        throw new KixError(
          `unknown class '${namespace}.${className}'`,
          ref.location,
        );
      }
      this.assertClassAccessible(info, context, ref.location);
      return info;
    }

    const local = this.classes.get(fullSymbolName(context.namespace, name));
    if (local) {
      this.assertClassAccessible(local, context, ref.location);
      return local;
    }

    const imported = new Map<string, ClassInfo>();
    for (const binding of context.module.bindings.values()) {
      const candidate = this.classes.get(
        fullSymbolName(binding.namespace, name),
      );
      if (candidate) imported.set(candidate.fullName, candidate);
    }
    if (imported.size > 1) {
      throw new KixError(
        `ambiguous class '${name}': ${[...imported.keys()].join(", ")}`,
        ref.location,
        "qualify the class with its module alias, for example `io::File`",
      );
    }
    if (imported.size === 1) {
      const info = [...imported.values()][0]!;
      this.assertClassAccessible(info, context, ref.location);
      return info;
    }

    const global = this.classes.get(name);
    if (global) {
      this.assertClassAccessible(global, context, ref.location);
      return global;
    }

    throw new KixError(`unknown type '${name}'`, ref.location);
  }

  resolveEnum(ref: TypeRef, context: ResolveContext): EnumInfo | undefined {
    const name = ref.name;
    if (primitiveType(name)) return undefined;

    const parts = name.split(/\.|::/).filter(Boolean);
    if (parts.length > 1) {
      const enumName = parts[parts.length - 1]!;
      const alias = parts[0]!;
      const binding = context.module.bindings.get(alias);
      const qualifier = parts.slice(0, -1).join(".");
      let namespace: string | undefined;

      if (binding && parts.length === 2) {
        namespace = binding.namespace;
      } else if (qualifier === context.namespace) {
        namespace = qualifier;
      } else {
        const localName = context.namespace.split(".").pop();
        if (context.namespace && localName === alias) {
          namespace = context.namespace;
        }
      }

      if (!namespace) return undefined;

      const info = this.enums.get(fullSymbolName(namespace, enumName));
      if (!info) return undefined;
      this.assertEnumAccessible(info, context, ref.location);
      return info;
    }

    const local = this.enums.get(fullSymbolName(context.namespace, name));
    if (local) {
      this.assertEnumAccessible(local, context, ref.location);
      return local;
    }

    const imported = new Map<string, EnumInfo>();
    for (const binding of context.module.bindings.values()) {
      const candidate = this.enums.get(
        fullSymbolName(binding.namespace, name),
      );
      if (candidate) imported.set(candidate.fullName, candidate);
    }
    if (imported.size > 1) {
      throw new KixError(
        `ambiguous enum '${name}': ${[...imported.keys()].join(", ")}`,
        ref.location,
        "qualify the enum with its module alias",
      );
    }
    if (imported.size === 1) {
      const info = [...imported.values()][0]!;
      this.assertEnumAccessible(info, context, ref.location);
      return info;
    }

    const global = this.enums.get(name);
    if (global) {
      this.assertEnumAccessible(global, context, ref.location);
      return global;
    }

    return undefined;
  }

  resolveEnumVariant(
    parts: string[],
    context: ResolveContext,
    location: SourceLocation,
  ): EnumVariantInfo | undefined {
    if (parts.length !== 2 && parts.length !== 3) return undefined;

    const enumParts = parts.length === 2 ? [parts[0]!] : [parts[0]!, parts[1]!];
    const enumInfo = this.resolveEnum(
      { name: enumParts.join("."), location },
      context,
    );
    if (!enumInfo) return undefined;

    const variantName = parts[parts.length - 1]!;
    const variant = enumInfo.variants.get(variantName);
    if (!variant) {
      throw new KixError(
        `enum '${enumInfo.fullName}' has no variant '${variantName}'`,
        location,
      );
    }
    return variant;
  }

  resolveFunctionCall(
    calleeNamespaceParts: string[],
    context: ResolveContext,
    location: SourceLocation,
  ): FunctionInfo[] {
    let candidates: FunctionInfo[] | undefined;
    let displayName = "";

    if (calleeNamespaceParts.length === 1) {
      const name = calleeNamespaceParts[0]!;
      displayName = name;
      candidates =
        (context.namespace
          ? this.function(context.namespace, name)
          : undefined) ?? this.function("", name);
      if (!candidates) {
        throw new KixError(`unknown function '${name}'`, location);
      }
    } else {
      const name = calleeNamespaceParts[calleeNamespaceParts.length - 1]!;
      const namespaceParts = calleeNamespaceParts.slice(0, -1);
      const first = namespaceParts[0]!;
      const nested = namespaceParts.slice(1).join(".");
      const binding = context.module.bindings.get(first);
      const candidatesNamespaces: string[] = [];

      if (binding) {
        candidatesNamespaces.push(
          nested ? `${binding.namespace}.${nested}` : binding.namespace,
        );
      }

      const fullNamespace = namespaceParts.join(".");
      candidatesNamespaces.push(fullNamespace);

      if (context.namespace) {
        candidatesNamespaces.push(`${context.namespace}.${fullNamespace}`);
        const localName = context.namespace.split(".").pop();
        if (localName === first && !nested) {
          candidatesNamespaces.push(context.namespace);
        }
      }

      displayName = calleeNamespaceParts.join("::");
      for (const namespace of candidatesNamespaces) {
        candidates = this.function(namespace, name);
        if (candidates) break;
      }

      if (!candidates) {
        const message = binding
          ? `module '${first}' has no function '${displayName}'`
          : `unknown namespace '${namespaceParts.join(".")}' (did you forget an import?)`;
        throw new KixError(message, location);
      }
    }

    const accessible = candidates.filter(
      (fn) =>
        fn.visibility === "public" || fn.module.path === context.module.path,
    );
    if (accessible.length === 0) {
      throw new KixError(`function '${displayName}' is private`, location);
    }
    return accessible;
  }

  resolveMethod(
    classInfo: ClassInfo,
    name: string,
    context: ResolveContext,
    location: SourceLocation,
  ): MethodInfo[] {
    const methods: MethodInfo[] = [];
    const seen = new Set<string>();
    let current: ClassInfo | undefined = classInfo;
    while (current) {
      for (const method of current.methods.get(name) ?? []) {
        const key = this.methodSlotKey(method);
        if (seen.has(key)) continue;
        seen.add(key);
        methods.push(method);
      }
      current = current.parent;
    }

    if (methods.length === 0) {
      if (classInfo.ctors.some((ctor) => ctor.decl.name === name)) {
        throw new KixError(
          `constructor '${classInfo.fullName}' must be invoked with new`,
          location,
        );
      }
      throw new KixError(
        `class '${classInfo.fullName}' has no method '${name}'`,
        location,
      );
    }

    const accessible = methods.filter((method) => {
      if (method.visibility === "public") return true;
      const contextClass = context.classInfo;
      if (!contextClass) return false;
      if (method.visibility === "private") {
        return contextClass.fullName === method.classInfo.fullName;
      }
      return this.isSubclass(contextClass, method.classInfo);
    });
    if (accessible.length === 0) {
      throw new KixError(
        `method '${classInfo.fullName}.${name}' is private`,
        location,
      );
    }

    return accessible;
  }

  resolveField(
    classInfo: ClassInfo,
    name: string,
    context: ResolveContext,
    location: SourceLocation,
  ): FieldInfo {
    let current: ClassInfo | undefined = classInfo;
    while (current) {
      const field = current.fields.get(name);
      if (field) {
        if (field.decl.visibility === "private") {
          if (context.classInfo?.fullName !== field.classInfo.fullName) {
            throw new KixError(
              `field '${field.classInfo.fullName}.${name}' is private`,
              location,
            );
          }
        } else if (field.decl.visibility === "protected") {
          const contextClass = context.classInfo;
          if (!contextClass || !this.isSubclass(contextClass, field.classInfo)) {
            throw new KixError(
              `field '${field.classInfo.fullName}.${name}' is protected`,
              location,
            );
          }
        }
        return field;
      }
      current = current.parent;
    }
    throw new KixError(
      `class '${classInfo.fullName}' has no field '${name}'`,
      location,
    );
  }

  isSubclass(info: ClassInfo, ancestor: ClassInfo): boolean {
    let current: ClassInfo | undefined = info;
    while (current) {
      if (current.fullName === ancestor.fullName) return true;
      current = current.parent;
    }
    return false;
  }

  contextForClass(info: ClassInfo): ResolveContext {
    const substitution = new Map<string, KixType>();
    for (let index = 0; index < info.typeParamNames.length; index += 1) {
      substitution.set(info.typeParamNames[index]!, info.typeArgs[index]!);
    }
    return substitution.size === 0
      ? {
          module: info.module,
          namespace: info.namespace,
          classInfo: info,
        }
      : {
          module: info.module,
          namespace: info.namespace,
          classInfo: info,
          typeSubstitution: substitution,
        };
  }

  moduleForFile(file: string): ModuleRecord {
    const module = this.moduleByPath.get(file);
    if (!module) {
      throw new KixError(`internal error: no module for '${file}'`);
    }
    return module;
  }

  private substitutionFor(
    name: string,
    context: ResolveContext,
  ): KixType | undefined {
    return context.typeSubstitution?.get(name);
  }

  private genericCandidates(
    name: string,
    context: ResolveContext,
  ): Map<string, GenericClassInfo> {
    const candidates = new Map<string, GenericClassInfo>();
    const parts = name.split(/\.|::/).filter(Boolean);

    if (parts.length > 1) {
      const className = parts[parts.length - 1]!;
      const alias = parts[0]!;
      const binding = context.module.bindings.get(alias);
      const qualifier = parts.slice(0, -1).join(".");
      let namespace: string | undefined;

      if (binding && parts.length === 2) {
        namespace = binding.namespace;
      } else if (qualifier === context.namespace) {
        namespace = qualifier;
      }

      if (namespace) {
        const info = this.genericClasses.get(
          fullSymbolName(namespace, className),
        );
        if (info) candidates.set(info.fullName, info);
      }
      return candidates;
    }

    const local = this.genericClasses.get(
      fullSymbolName(context.namespace, name),
    );
    if (local) {
      candidates.set(local.fullName, local);
      return candidates;
    }

    for (const binding of context.module.bindings.values()) {
      const imported = this.genericClasses.get(
        fullSymbolName(binding.namespace, name),
      );
      if (imported) candidates.set(imported.fullName, imported);
    }
    if (candidates.size > 0) return candidates;

    const global = this.genericClasses.get(name);
    if (global) candidates.set(global.fullName, global);

    return candidates;
  }

  private resolveGenericTemplate(
    ref: TypeRef,
    context: ResolveContext,
  ): GenericClassInfo {
    const candidates = this.genericCandidates(ref.name, context);

    if (candidates.size === 0) {
      const parts = ref.name.split(/\.|::/).filter(Boolean);
      if (parts.length > 1) {
        const className = parts[parts.length - 1]!;
        const alias = parts[0]!;
        if (!context.module.bindings.has(alias) && alias !== context.namespace) {
          throw new KixError(
            `unknown namespace qualifier '${alias}' for class '${className}'`,
            ref.location,
          );
        }
        throw new KixError(
          `unknown generic class '${ref.name}'`,
          ref.location,
        );
      }
      throw new KixError(`unknown generic class '${ref.name}'`, ref.location);
    }

    if (candidates.size > 1) {
      throw new KixError(
        `ambiguous generic class '${ref.name}': ${[...candidates.keys()].join(", ")}`,
        ref.location,
      );
    }

    const template = [...candidates.values()][0]!;
    this.assertGenericAccessible(template, context, ref.location);
    return template;
  }

  private typeArgSuffix(type: KixType): string {
    if (type.kind === "primitive") return type.name;
    if (type.kind === "array") {
      return type.size === null
        ? "dynamic_array"
        : `${type.element.kind}_${type.size}`;
    }
    if (type.kind === "null") return "null";
    return type.info.cName;
  }

  private instantiateClass(
    template: GenericClassInfo,
    typeArgs: KixType[],
    location: SourceLocation,
  ): ClassInfo {
    if (typeArgs.length !== template.typeParamNames.length) {
      throw new KixError(
        `generic class '${template.fullName}' expects ${template.typeParamNames.length} type argument${template.typeParamNames.length === 1 ? "" : "s"}, got ${typeArgs.length}`,
        location,
      );
    }

    for (const arg of typeArgs) {
      if (arg.kind === "primitive" && arg.name === "void") {
        throw new KixError(
          `generic class '${template.fullName}' cannot be instantiated with void`,
          location,
        );
      }
      if (arg.kind === "array") {
        throw new KixError(
          `generic class '${template.fullName}' cannot be instantiated with an array type yet`,
          location,
        );
      }
    }

    const key = `${template.fullName}<${typeArgs.map((arg) => typeToString(arg)).join(",")}>`;
    const existing = this.classes.get(key);
    if (existing) return existing;

    const suffix = typeArgs.map((arg) => this.typeArgSuffix(arg)).join("_");
    const cName = `${mangleClass(template.module.path, template.namespace, template.decl.name)}_${suffix}`;
    return this.createClassInfo(
      template.decl,
      template.module,
      key,
      cName,
      template.typeParamNames,
      typeArgs,
    );
  }

  private installBuiltins(): void {
    for (const [name, builtin] of createBuiltinFunctionTable()) {
      this.builtins.set(name, builtin);
    }
  }

  private collectModule(module: ModuleRecord): void {
    this.collectDeclarations(module.ast.declarations, module);
  }

  private collectDeclarations(
    declarations: ModuleRecord["ast"]["declarations"],
    module: ModuleRecord,
  ): void {
    for (const declaration of declarations) {
      if (declaration.kind === "Namespace") {
        this.namespaces.add(declaration.name);
        this.collectDeclarations(declaration.body, module);
        continue;
      }

      if (declaration.kind === "Class") {
        this.registerClass(declaration, module);
        continue;
      }

      if (declaration.kind === "Interface") {
        this.registerInterface(declaration, module);
        continue;
      }

      if (declaration.kind === "Enum") {
        this.registerEnum(declaration, module);
        continue;
      }

      if (declaration.kind === "Struct") {
        this.registerStruct(declaration, module);
        continue;
      }

      this.registerFunction(declaration, module);
    }
  }

  private claimCSymbol(cName: string, symbolName: string, location: SourceLocation): void {
    const existing = this.cSymbolLocations.get(cName);
    if (existing) {
      throw new KixError(
        `symbol '${symbolName}' produces C identifier '${cName}', which collides with '${existing.symbol}' (${existing.location.file}:${existing.location.line}:${existing.location.column})`,
        location,
      );
    }
    this.cSymbolLocations.set(cName, { symbol: symbolName, location });
  }

  private validateTask(decl: FunctionDecl): void {
    if (!decl.task) return;
    if (decl.variadic) {
      throw new KixError(
        "task functions cannot be variadic",
        decl.location,
      );
    }
    if (decl.task.workers !== undefined && decl.task.workers < 1) {
      throw new KixError(
        "a task's dedicated worker count must be at least 1",
        decl.location,
      );
    }
  }

  private taskInfoFor(decl: FunctionDecl): TaskInfo | undefined {
    if (!decl.task) return undefined;
    const workers = decl.task.workers ?? 0;
    const id = this.taskCounter;
    this.taskCounter += 1;
    return {
      id,
      workers,
      poolCName:
        workers > 0 ? `kix_task_pool_${id}` : "kix_general_pool",
      payloadCName: `kix_task_payload_${id}`,
      runCName: `kix_task_run_${id}`,
    };
  }

  private registerStruct(decl: StructDecl, module: ModuleRecord): void {
    const fullName = fullSymbolName(decl.namespace, decl.name);
    if (
      this.classes.has(fullName) ||
      this.interfaces.has(fullName) ||
      this.genericClasses.has(fullName) ||
      this.enums.has(fullName)
    ) {
      throw new KixError(`duplicate struct '${fullName}'`, decl.location);
    }
    const cName = mangleClass(module.path, decl.namespace, decl.name);
    const info = this.createClassInfo(
      decl as unknown as ClassDecl,
      module,
      fullName,
      cName,
      [],
      [],
    );
    info.isStruct = true;
    this.classes.set(fullName, info);
  }

  private registerInterface(decl: InterfaceDecl, module: ModuleRecord): void {
    const fullName = fullSymbolName(decl.namespace, decl.name);
    if (
      this.classes.has(fullName) ||
      this.interfaces.has(fullName) ||
      this.genericClasses.has(fullName) ||
      this.enums.has(fullName)
    ) {
      throw new KixError(`duplicate interface '${fullName}'`, decl.location);
    }

    const cName = mangleClass(module.path, decl.namespace, decl.name);
    this.claimCSymbol(cName, `interface ${fullName}`, decl.location);

    const info: InterfaceInfo = {
      decl,
      namespace: decl.namespace,
      fullName,
      cName,
      module,
      visibility: decl.visibility,
      methods: new Map(),
    };

    for (const [index, method] of decl.methods.entries()) {
      if (method.task) {
        throw new KixError(
          `interface method '${method.name}' cannot be a task`,
          method.location,
        );
      }
      if (method.variadic) {
        throw new KixError(
          `interface method '${method.name}' cannot be variadic`,
          method.location,
        );
      }
      if (info.methods.has(method.name)) {
        throw new KixError(
          `duplicate interface method '${fullName}.${method.name}'`,
          method.location,
        );
      }
      info.methods.set(method.name, {
        decl: method,
        index,
        interfaceInfo: info,
      });
    }

    this.interfaces.set(fullName, info);
  }

  private resolveInterface(ref: TypeRef, context: ResolveContext): InterfaceInfo {
    const name = ref.name;
    const parts = name.split(/\.|::/).filter(Boolean);
    if (parts.length > 1) {
      const interfaceName = parts[parts.length - 1]!;
      const alias = parts[0]!;
      const binding = context.module.bindings.get(alias);
      const qualifier = parts.slice(0, -1).join(".");
      let namespace: string | undefined;

      if (binding && parts.length === 2) {
        namespace = binding.namespace;
      } else if (qualifier === context.namespace) {
        namespace = qualifier;
      }

      if (!namespace) {
        throw new KixError(
          `unknown namespace qualifier '${alias}' for interface '${interfaceName}'`,
          ref.location,
        );
      }
      const info = this.interfaces.get(fullSymbolName(namespace, interfaceName));
      if (!info) {
        throw new KixError(
          `unknown interface '${namespace}.${interfaceName}'`,
          ref.location,
        );
      }
      this.assertInterfaceAccessible(info, context, ref.location);
      return info;
    }

    const local = this.interfaces.get(fullSymbolName(context.namespace, name));
    if (local) {
      this.assertInterfaceAccessible(local, context, ref.location);
      return local;
    }

    const imported = new Map<string, InterfaceInfo>();
    for (const binding of context.module.bindings.values()) {
      const candidate = this.interfaces.get(
        fullSymbolName(binding.namespace, name),
      );
      if (candidate) imported.set(candidate.fullName, candidate);
    }
    if (imported.size > 1) {
      throw new KixError(
        `ambiguous interface '${name}': ${[...imported.keys()].join(", ")}`,
        ref.location,
        "qualify the interface with its module alias",
      );
    }
    if (imported.size === 1) {
      const info = [...imported.values()][0]!;
      this.assertInterfaceAccessible(info, context, ref.location);
      return info;
    }

    const global = this.interfaces.get(name);
    if (global) {
      this.assertInterfaceAccessible(global, context, ref.location);
      return global;
    }

    throw new KixError(`unknown interface '${name}'`, ref.location);
  }

  private resolveInterfaceOptional(
    ref: TypeRef,
    context: ResolveContext,
  ): InterfaceInfo | undefined {
    const name = ref.name;
    const parts = name.split(/\.|::/).filter(Boolean);
    if (parts.length > 1) {
      const interfaceName = parts[parts.length - 1]!;
      const alias = parts[0]!;
      const binding = context.module.bindings.get(alias);
      const qualifier = parts.slice(0, -1).join(".");
      let namespace: string | undefined;

      if (binding && parts.length === 2) {
        namespace = binding.namespace;
      } else if (qualifier === context.namespace) {
        namespace = qualifier;
      }
      if (!namespace) return undefined;
      const info = this.interfaces.get(fullSymbolName(namespace, interfaceName));
      if (!info) return undefined;
      this.assertInterfaceAccessible(info, context, ref.location);
      return info;
    }

    const local = this.interfaces.get(fullSymbolName(context.namespace, name));
    if (local) {
      this.assertInterfaceAccessible(local, context, ref.location);
      return local;
    }

    const imported = new Map<string, InterfaceInfo>();
    for (const binding of context.module.bindings.values()) {
      const candidate = this.interfaces.get(
        fullSymbolName(binding.namespace, name),
      );
      if (candidate) imported.set(candidate.fullName, candidate);
    }
    if (imported.size > 1) {
      throw new KixError(
        `ambiguous interface '${name}': ${[...imported.keys()].join(", ")}`,
        ref.location,
        "qualify the interface with its module alias",
      );
    }
    if (imported.size === 1) {
      const info = [...imported.values()][0]!;
      this.assertInterfaceAccessible(info, context, ref.location);
      return info;
    }

    const global = this.interfaces.get(name);
    if (global) {
      this.assertInterfaceAccessible(global, context, ref.location);
      return global;
    }

    return undefined;
  }

  private assertInterfaceAccessible(
    info: InterfaceInfo,
    context: ResolveContext,
    location: SourceLocation,
  ): void {
    if (info.visibility === "private" && info.module.path !== context.module.path) {
      throw new KixError(`interface '${info.fullName}' is private`, location);
    }
  }

  resolveInterfaceMethod(
    info: InterfaceInfo,
    name: string,
    location: SourceLocation,
  ): InterfaceMethodInfo {
    const method = info.methods.get(name);
    if (!method) {
      throw new KixError(
        `interface '${info.fullName}' has no method '${name}'`,
        location,
      );
    }
    return method;
  }

  private resolveClassParents(): void {
    for (const info of this.classes.values()) {
      const ref = info.decl.extends;
      if (!ref) continue;
      const context: ResolveContext = {
        module: info.module,
        namespace: info.namespace,
      };
      const resolved = this.resolveType(ref, context);
      if (resolved.kind !== "class") {
        throw new KixError(
          `class '${info.fullName}' can only extend a class`,
          ref.location,
        );
      }
      info.parent = resolved.info;
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (info: ClassInfo): void => {
      if (visited.has(info.fullName)) return;
      if (visiting.has(info.fullName)) {
        throw new KixError(
          `class inheritance cycle involving '${info.fullName}'`,
          info.decl.location,
        );
      }
      visiting.add(info.fullName);
      if (info.parent) visit(info.parent);
      visiting.delete(info.fullName);
      visited.add(info.fullName);
    };
    for (const info of this.classes.values()) visit(info);
  }

  private methodSlotKey(method: MethodInfo): string {
    const context = this.contextForClass(method.classInfo);
    const params = method.decl.params
      .map((param) => typeToString(this.resolveType(param.type, context)))
      .join(",");
    return `${method.decl.name}(${params})`;
  }

  vtableSlotFor(classInfo: ClassInfo, method: MethodInfo): number | undefined {
    return classInfo.vtableSlots.get(this.methodSlotKey(method));
  }

  private buildClassVtables(): void {
    const built = new Set<string>();
    const build = (info: ClassInfo): void => {
      if (built.has(info.fullName)) return;
      if (info.isStruct) {
        info.vtableSlots = new Map();
        info.vtableMethods = [];
        built.add(info.fullName);
        return;
      }
      if (info.parent) build(info.parent);

      const slots = new Map<string, number>(info.parent?.vtableSlots ?? []);
      const methods: (MethodInfo | undefined)[] = [
        ...(info.parent?.vtableMethods ?? []),
      ];

      for (const overloads of info.methods.values()) {
        for (const method of overloads) {
          if (method.decl.abstract && method.decl.task) {
            throw new KixError(
              `abstract method '${info.fullName}.${method.decl.name}' cannot be a task`,
              method.decl.location,
            );
          }
          const key = this.methodSlotKey(method);
          const existing = slots.get(key);
          if (existing !== undefined) {
            const previous = methods[existing];
            if (previous) {
              if (
                (previous.visibility === "public" &&
                  method.visibility !== "public") ||
                (previous.visibility === "protected" &&
                  method.visibility === "private")
              ) {
                throw new KixError(
                  `override '${info.fullName}.${method.decl.name}' reduces visibility`,
                  method.decl.location,
                );
              }
              const previousContext = this.contextForClass(previous.classInfo);
              const nextContext = this.contextForClass(method.classInfo);
              const previousReturn = previous.decl.returnType;
              const nextReturn = method.decl.returnType;
              if (
                typeToString(this.resolveType(previousReturn, previousContext)) !==
                typeToString(this.resolveType(nextReturn, nextContext))
              ) {
                throw new KixError(
                  `override '${info.fullName}.${method.decl.name}' changes the return type`,
                  method.decl.location,
                );
              }
            }
            methods[existing] = method;
          } else {
            slots.set(key, methods.length);
            methods.push(method);
          }
        }
      }

      info.vtableSlots = slots;
      info.vtableMethods = methods;
      built.add(info.fullName);

      if (!info.abstract) {
        for (const method of methods) {
          if (method && method.decl.abstract) {
            throw new KixError(
              `concrete class '${info.fullName}' does not implement abstract method '${method.classInfo.fullName}.${method.decl.name}'`,
              info.decl.location,
            );
          }
        }
      }
    };

    for (const info of this.classes.values()) build(info);
  }

  private validateClassInterfaces(): void {
    for (const info of this.classes.values()) {
      info.implements = info.parent ? [...info.parent.implements] : [];
      const refs = info.decl.implements ?? [];
      const context: ResolveContext = {
        module: info.module,
        namespace: info.namespace,
      };
      const seen = new Set<string>();
      for (const ref of refs) {
        const iface = this.resolveInterface(ref, context);
        if (seen.has(iface.fullName)) {
          throw new KixError(
            `class '${info.fullName}' implements '${iface.fullName}' more than once`,
            ref.location,
          );
        }
        seen.add(iface.fullName);
        info.implements.push(iface);

        const classContext = this.contextForClass(info);
        const ifaceContext: ResolveContext = {
          module: iface.module,
          namespace: iface.namespace,
        };
        for (const method of iface.methods.values()) {
          const candidates: MethodInfo[] = [];
          let current: ClassInfo | undefined = info;
          while (current) {
            candidates.push(...(current.methods.get(method.decl.name) ?? []));
            current = current.parent;
          }
          const expectedParams = method.decl.params.map((param) =>
            this.resolveType(param.type, ifaceContext),
          );
          const expectedReturn = this.resolveType(
            method.decl.returnType,
            ifaceContext,
          );
          const matched = candidates.some((candidate) => {
            if (candidate.visibility !== "public") return false;
            if (candidate.decl.params.length !== expectedParams.length) return false;
            const params = candidate.decl.params.map((param) =>
              this.resolveType(param.type, classContext),
            );
            if (!params.every((param, index) => sameType(param, expectedParams[index]!))) {
              return false;
            }
            const returned = this.resolveType(candidate.decl.returnType, classContext);
            return sameType(returned, expectedReturn);
          });
          if (!matched) {
            throw new KixError(
              `class '${info.fullName}' does not implement '${iface.fullName}.${method.decl.name}'`,
              info.decl.location,
              `declare a public method with a matching signature`,
            );
          }
        }
      }
    }
  }

  private registerFunction(decl: FunctionDecl, module: ModuleRecord): void {
    this.validateTask(decl);
    const key = functionKey(decl.namespace, decl.name);
    const existing = this.functions.get(key) ?? [];
    const signature = functionSignatureKey(decl);
    if (existing.some((fn) => functionSignatureKey(fn.decl) === signature)) {
      throw new KixError(
        `duplicate function '${decl.namespace ? `${decl.namespace}::` : ""}${decl.name}' with the same parameter types`,
        decl.location,
      );
    }

    const fullName = fullSymbolName(decl.namespace, decl.name);
    if (
      this.classes.has(fullName) ||
      this.genericClasses.has(fullName) ||
      this.enums.has(fullName)
    ) {
      throw new KixError(
        `duplicate symbol '${fullName}': cannot declare both a function and a class with the same name`,
        decl.location,
      );
    }

    if (decl.namespace === "" && this.builtins.has(decl.name)) {
      throw new KixError(
        `function name '${decl.name}' conflicts with builtin function`,
        decl.location,
      );
    }

    const external = decl.namespace === "io" && decl.name === "printf";
    const baseCName = external
      ? "kix_print_format"
      : mangleFunction(module.path, decl.namespace, decl.name);
    const cName = external
      ? baseCName
      : existing.length === 0
        ? baseCName
        : `${baseCName}_overload_${existing.length}`;

    if (!external) {
      this.claimCSymbol(cName, `function ${fullName}`, decl.location);
    }

    const task = this.taskInfoFor(decl);
    existing.push({
      decl,
      key,
      namespace: decl.namespace,
      cName,
      module,
      visibility: decl.visibility,
      external,
      ...(task ? { task } : {}),
    });
    this.functions.set(key, existing);
  }

  private registerClass(decl: ClassDecl, module: ModuleRecord): void {
    const fullName = fullSymbolName(decl.namespace, decl.name);
    if (
      this.classes.has(fullName) ||
      this.genericClasses.has(fullName) ||
      this.enums.has(fullName)
    ) {
      throw new KixError(`duplicate class '${fullName}'`, decl.location);
    }

    const fnKey = functionKey(decl.namespace, decl.name);
    if (this.functions.has(fnKey)) {
      throw new KixError(
        `duplicate symbol '${fullName}': cannot declare both a class and a function with the same name`,
        decl.location,
      );
    }

    if (decl.namespace === "" && this.builtins.has(decl.name)) {
      throw new KixError(
        `class name '${decl.name}' conflicts with builtin function`,
        decl.location,
      );
    }

    if (decl.typeParams && decl.typeParams.length > 0) {
      this.genericClasses.set(fullName, {
        decl,
        namespace: decl.namespace,
        fullName,
        module,
        visibility: decl.visibility,
        typeParamNames: decl.typeParams,
      });
      return;
    }

    const classCName = mangleClass(module.path, decl.namespace, decl.name);
    this.createClassInfo(decl, module, fullName, classCName, [], []);
  }

  private registerEnum(decl: EnumDecl, module: ModuleRecord): void {
    const fullName = fullSymbolName(decl.namespace, decl.name);
    if (
      this.classes.has(fullName) ||
      this.genericClasses.has(fullName) ||
      this.enums.has(fullName)
    ) {
      throw new KixError(`duplicate enum '${fullName}'`, decl.location);
    }

    const fnKey = functionKey(decl.namespace, decl.name);
    if (this.functions.has(fnKey)) {
      throw new KixError(
        `duplicate symbol '${fullName}': cannot declare both an enum and a function with the same name`,
        decl.location,
      );
    }

    if (decl.namespace === "" && this.builtins.has(decl.name)) {
      throw new KixError(
        `enum name '${decl.name}' conflicts with builtin function`,
        decl.location,
      );
    }

    if (decl.variants.length === 0) {
      throw new KixError(
        `enum '${fullName}' must declare at least one variant`,
        decl.location,
      );
    }

    const enumCName = mangleEnum(module.path, decl.namespace, decl.name);
    this.claimCSymbol(enumCName, `enum ${fullName}`, decl.location);

    const enumInfo: EnumInfo = {
      decl,
      namespace: decl.namespace,
      fullName,
      cName: enumCName,
      module,
      visibility: decl.visibility,
      variants: new Map(),
    };

    for (const [index, variant] of decl.variants.entries()) {
      const cName = `${enumCName}_${cIdent(variant.name)}`;
      this.claimCSymbol(
        cName,
        `enum variant ${fullName}::${variant.name}`,
        variant.location,
      );
      enumInfo.variants.set(variant.name, {
        name: variant.name,
        value: index,
        cName,
        enumInfo,
      });
    }

    this.enums.set(fullName, enumInfo);
  }

  private createClassInfo(
    decl: ClassDecl,
    module: ModuleRecord,
    fullName: string,
    classCName: string,
    typeParamNames: string[],
    typeArgs: KixType[],
  ): ClassInfo {
    this.claimCSymbol(classCName, `class ${fullName}`, decl.location);

    const classInfo: ClassInfo = {
      decl,
      namespace: decl.namespace,
      fullName,
      cName: classCName,
      module,
      visibility: decl.visibility,
      fields: new Map(),
      methods: new Map(),
      abstract: Boolean(decl.abstract),
      isStruct: false,
      implements: [],
      vtableSlots: new Map(),
      vtableMethods: [],
      ctors: [],
      typeParamNames,
      typeArgs,
    };

    for (const field of decl.fields) {
      if (classInfo.fields.has(field.name)) {
        throw new KixError(
          `duplicate field '${field.name}' in class '${fullName}'`,
          field.location,
        );
      }
      classInfo.fields.set(field.name, { decl: field, classInfo });
    }

    let ctorIndex = 0;
    for (const method of decl.methods) {
      this.validateTask(method);

      if (method.isDestructor) {
        if (method.task) {
          throw new KixError(
            `destructor '${fullName}.${method.name}' cannot be a task`,
            method.location,
          );
        }
        if (method.visibility !== "public") {
          throw new KixError(
            `destructor '${fullName}.${method.name}' must be public`,
            method.location,
          );
        }
        if (method.params.length > 0 || method.variadic) {
          throw new KixError(
            `destructor '${fullName}.${method.name}' cannot take parameters`,
            method.location,
          );
        }
        if (classInfo.destructor) {
          throw new KixError(
            `class '${fullName}' already declares a destructor`,
            method.location,
          );
        }
        const destructorCName = `${classInfo.cName}_destroy`;
        this.claimCSymbol(
          destructorCName,
          `destructor ${fullName}`,
          method.location,
        );
        classInfo.destructor = {
          decl: method,
          classInfo,
          cName: destructorCName,
          visibility: method.visibility,
        };
        continue;
      }

      if (classInfo.fields.has(method.name)) {
        throw new KixError(
          `duplicate member '${method.name}' in class '${fullName}': cannot be both a field and a method`,
          method.location,
        );
      }

      if (method.name === decl.name) {
        if (method.task) {
          throw new KixError(
            `constructor '${fullName}.${method.name}' cannot be a task`,
            method.location,
          );
        }
        const returnRef = method.returnType;
        const returnsVoid =
          returnRef.name === "void" &&
          returnRef.arraySize === undefined &&
          (returnRef.typeArgs === undefined || returnRef.typeArgs.length === 0);
        if (!returnsVoid) {
          throw new KixError(
            `constructor '${fullName}.${method.name}' must not declare a return type`,
            method.location,
          );
        }
        if (method.variadic) {
          throw new KixError(
            `constructor '${fullName}.${method.name}' cannot be variadic`,
            method.location,
          );
        }
        const signature = functionSignatureKey(method);
        if (
          classInfo.ctors.some(
            (ctor) => functionSignatureKey(ctor.decl) === signature,
          )
        ) {
          throw new KixError(
            `duplicate constructor '${fullName}.${method.name}' with the same parameter types`,
            method.location,
          );
        }

        const rawCName = `${classInfo.cName}_ctor_${ctorIndex}`;
        const wrapperCName =
          ctorIndex === 0
            ? `${classInfo.cName}_new`
            : `${classInfo.cName}_new_${ctorIndex}`;
        this.claimCSymbol(
          rawCName,
          `constructor ${fullName}`,
          method.location,
        );
        this.claimCSymbol(
          wrapperCName,
          `constructor ${fullName}`,
          method.location,
        );
        classInfo.ctors.push({
          decl: method,
          classInfo,
          cName: rawCName,
          wrapperCName,
          visibility: method.visibility,
        });
        ctorIndex += 1;
        continue;
      }

      const existing = classInfo.methods.get(method.name) ?? [];
      const signature = functionSignatureKey(method);
      if (existing.some((info) => functionSignatureKey(info.decl) === signature)) {
        throw new KixError(
          `duplicate method '${method.name}' in class '${fullName}' with the same parameter types`,
          method.location,
        );
      }

      const baseCName = `${classInfo.cName}_${cIdent(method.name)}`;
      const methodCName =
        existing.length === 0 ? baseCName : `${baseCName}_overload_${existing.length}`;
      this.claimCSymbol(methodCName, `method ${fullName}.${method.name}`, method.location);
      const task = this.taskInfoFor(method);
      existing.push({
        decl: method,
        classInfo,
        cName: methodCName,
        visibility: method.visibility,
        ...(task ? { task } : {}),
      });
      classInfo.methods.set(method.name, existing);
    }

    this.classes.set(fullName, classInfo);
    return classInfo;
  }

  private indexAllTypes(): void {
    for (const overloads of this.functions.values()) {
      for (const fn of overloads) this.indexFunctionTypes(fn);
    }

    const processed = new Set<string>();
    let pending = [...this.classes.values()];
    while (pending.length > 0) {
      const info = pending.pop()!;
      if (processed.has(info.fullName)) continue;
      processed.add(info.fullName);
      this.indexClassTypes(info);
      for (const candidate of this.classes.values()) {
        if (!processed.has(candidate.fullName)) pending.push(candidate);
      }
    }
  }

  private indexFunctionTypes(fn: FunctionInfo): void {
    const context: ResolveContext = { module: fn.module, namespace: fn.namespace };
    this.indexTypeRef(fn.decl.returnType, context);
    for (const param of fn.decl.params) this.indexTypeRef(param.type, context);
    if (fn.decl.body) this.indexBlockTypes(fn.decl.body, context);
  }

  private indexClassTypes(info: ClassInfo): void {
    const context = this.contextForClass(info);
    for (const field of info.decl.fields) {
      this.indexTypeRef(field.type, context);
    }
    for (const method of info.decl.methods) {
      this.indexTypeRef(method.returnType, context);
      for (const param of method.params) this.indexTypeRef(param.type, context);
      if (method.body) this.indexBlockTypes(method.body, context);
    }
  }

  private indexTypeRef(ref: TypeRef, context: ResolveContext): void {
    this.resolveType(ref, context);
  }

  private indexBlockTypes(block: BlockStmt, context: ResolveContext): void {
    for (const statement of block.statements) {
      this.indexStatementTypes(statement, context);
    }
  }

  private indexStatementTypes(statement: Stmt, context: ResolveContext): void {
    switch (statement.kind) {
      case "Block":
        this.indexBlockTypes(statement, context);
        return;
      case "VarDecl":
        this.indexTypeRef(statement.type, context);
        if (statement.initializer) this.indexExprTypes(statement.initializer, context);
        return;
      case "ExprStmt":
        this.indexExprTypes(statement.expression, context);
        return;
      case "Return":
        if (statement.expression) this.indexExprTypes(statement.expression, context);
        return;
      case "If":
        this.indexExprTypes(statement.condition, context);
        this.indexStatementTypes(statement.thenBranch, context);
        if (statement.elseBranch) this.indexStatementTypes(statement.elseBranch, context);
        return;
      case "While":
        this.indexExprTypes(statement.condition, context);
        this.indexStatementTypes(statement.body, context);
        return;
      case "For":
        if (statement.initializer) this.indexStatementTypes(statement.initializer, context);
        if (statement.condition) this.indexExprTypes(statement.condition, context);
        if (statement.update) this.indexExprTypes(statement.update, context);
        this.indexStatementTypes(statement.body, context);
        return;
      case "Empty":
      case "Break":
      case "Continue":
        return;
    }
  }

  private indexExprTypes(expression: Expr, context: ResolveContext): void {
    switch (expression.kind) {
      case "Literal":
      case "Identifier":
      case "QualifiedName":
        return;
      case "Member":
        this.indexExprTypes(expression.object, context);
        return;
      case "Index":
        this.indexExprTypes(expression.object, context);
        this.indexExprTypes(expression.index, context);
        return;
      case "Call":
        this.indexExprTypes(expression.callee, context);
        for (const arg of expression.args) this.indexExprTypes(arg, context);
        return;
      case "New":
        this.indexTypeRef(expression.type, context);
        for (const arg of expression.args) this.indexExprTypes(arg, context);
        return;
      case "Unary":
        this.indexExprTypes(expression.operand, context);
        return;
      case "TaskDone":
        this.indexExprTypes(expression.operand, context);
        return;
      case "Binary":
        this.indexExprTypes(expression.left, context);
        this.indexExprTypes(expression.right, context);
        return;
      case "Assign":
        this.indexExprTypes(expression.target, context);
        this.indexExprTypes(expression.value, context);
        return;
      case "Conditional":
        this.indexExprTypes(expression.condition, context);
        this.indexExprTypes(expression.thenExpr, context);
        this.indexExprTypes(expression.elseExpr, context);
        return;
    }
  }

  private validateEntry(): void {
    const mains = this.function("", "main");
    if (!mains) {
      throw new KixError(
        "missing entry point: declare `public main(): int { ... }`",
        { file: this.entry.path, line: 1, column: 1 },
      );
    }
    if (mains.length > 1) {
      throw new KixError(
        "entry point 'main' must not be overloaded",
        mains[1]!.decl.location,
      );
    }
    const main = mains[0]!;
    if (main.decl.task) {
      throw new KixError(
        "entry point 'main' cannot be a task",
        main.decl.location,
      );
    }
    if (main.decl.visibility !== "public") {
      throw new KixError("entry point 'main' must be public", main.decl.location);
    }
    if (main.decl.variadic || main.decl.params.length > 2) {
      throw new KixError(
        "entry point 'main' may only take optional argc and argv parameters",
        main.decl.location,
      );
    }
    const context: ResolveContext = {
      module: main.module,
      namespace: main.decl.namespace,
    };
    const isStringArray = (type: KixType): boolean =>
      type.kind === "array" &&
      type.size === null &&
      type.element.kind === "class" &&
      type.element.info.fullName === "string.String";
    if (main.decl.params.length >= 1) {
      const first = this.resolveType(main.decl.params[0]!.type, context);
      const isArgc = first.kind === "primitive" && first.name === "int";
      if (!isArgc && !(main.decl.params.length === 1 && isStringArray(first))) {
        throw new KixError(
          "main's first parameter must be argc: int",
          main.decl.params[0]!.location,
        );
      }
    }
    if (main.decl.params.length === 2) {
      const argv = this.resolveType(main.decl.params[1]!.type, context);
      if (!isStringArray(argv)) {
        throw new KixError(
          "main's second parameter must be argv: String[]",
          main.decl.params[1]!.location,
        );
      }
    }
    if (main.decl.returnType.name !== "int") {
      throw new KixError("entry point 'main' must return int", main.decl.location);
    }
    if (!main.decl.body) {
      throw new KixError("entry point 'main' must have a body", main.decl.location);
    }
  }

  private assertEnumAccessible(
    info: EnumInfo,
    context: ResolveContext,
    location: SourceLocation,
  ): void {
    if (
      info.visibility === "private" &&
      info.module.path !== context.module.path
    ) {
      throw new KixError(`enum '${info.fullName}' is private`, location);
    }
  }

  private assertClassAccessible(
    info: ClassInfo,
    context: ResolveContext,
    location: SourceLocation,
  ): void {
    if (info.visibility === "private" && info.module.path !== context.module.path) {
      throw new KixError(`class '${info.fullName}' is private`, location);
    }
  }

  private assertGenericAccessible(
    info: GenericClassInfo,
    context: ResolveContext,
    location: SourceLocation,
  ): void {
    if (info.visibility === "private" && info.module.path !== context.module.path) {
      throw new KixError(`class '${info.fullName}' is private`, location);
    }
  }
}
