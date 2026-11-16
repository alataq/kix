const C_KEYWORDS = new Set([
  "auto",
  "break",
  "case",
  "char",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extern",
  "float",
  "for",
  "goto",
  "if",
  "inline",
  "int",
  "long",
  "register",
  "restrict",
  "return",
  "short",
  "signed",
  "sizeof",
  "static",
  "struct",
  "switch",
  "typedef",
  "union",
  "unsigned",
  "void",
  "volatile",
  "while",
  "_Alignas",
  "_Alignof",
  "_Atomic",
  "_Bool",
  "_Complex",
  "_Generic",
  "_Imaginary",
  "_Noreturn",
  "_Static_assert",
  "_Thread_local",
  // Common C macros and standard library symbols that collide if used as identifiers:
  "stdin",
  "stdout",
  "stderr",
  "errno",
  "environ",
  "NULL",
  "EOF",
  "BUFSIZ",
  // Kix prelude identifiers:
  "kix_int",
  "kix_float",
  "kix_bool",
  "kix_char",
  "kix_str",
  "kix_panic_oom",
  "kix_str_new",
  "kix_str_at",
  "kix_str_set",
  "kix_print_format",
  "kix_syscall",
]);

/** Escape a Kix identifier that collides with a C keyword or reserved identifier. */
export function cIdent(name: string): string {
  return C_KEYWORDS.has(name) ? `kix_kw_${name}` : name;
}

/** Prefix a local variable or parameter in generated C to isolate it from functions/macros. */
export function cVarIdent(name: string): string {
  if (name === "self") return "self";
  return `_v_${cIdent(name)}`;
}

export function modulePrefix(modulePath: string): string {
  const normalized = modulePath.replace(/\\/g, "/");
  const modulesMatch = normalized.match(/(?:^|\/)modules\/(.+)$/);
  if (modulesMatch) {
    const rel = modulesMatch[1]!;
    let withoutExt = rel.replace(/\.kix$/, "");
    if (
      withoutExt.startsWith("kix/syscalls/linux_") ||
      withoutExt.startsWith("kix/syscalls\\linux_")
    ) {
      withoutExt = "kix/syscalls";
    }
    const clean = withoutExt.replace(/[^A-Za-z0-9_]/g, "_");
    return `mod_${clean}`;
  }

  // User module: u_<filename>
  const filename = normalized.split("/").pop() ?? "app";
  const stem = filename.replace(/\.kix$/, "").replace(/[^A-Za-z0-9_]/g, "_");
  return `u_${stem}`;
}

export function mangleNamespace(namespace: string): string {
  return namespace
    .split(".")
    .filter(Boolean)
    .map(cIdent)
    .join("_");
}

export function mangleFunction(
  modulePath: string,
  namespace: string,
  name: string,
): string {
  if (!namespace && name === "main") {
    return "main";
  }

  const prefix = modulePrefix(modulePath);
  const mangledNs = mangleNamespace(namespace);

  if (!mangledNs) {
    return `${prefix}_${cIdent(name)}`;
  }

  if (prefix.endsWith(`_${mangledNs}`) || prefix === mangledNs) {
    return `${prefix}_${cIdent(name)}`;
  }

  return `${prefix}_${mangledNs}_${cIdent(name)}`;
}

export function mangleClass(
  modulePath: string,
  namespace: string,
  name: string,
): string {
  const prefix = modulePrefix(modulePath);
  const mangledNs = mangleNamespace(namespace);

  if (!mangledNs) {
    return `${prefix}_${cIdent(name)}`;
  }

  if (prefix.endsWith(`_${mangledNs}`) || prefix === mangledNs) {
    return `${prefix}_${cIdent(name)}`;
  }

  return `${prefix}_${mangledNs}_${cIdent(name)}`;
}

export function mangleEnum(
  modulePath: string,
  namespace: string,
  name: string,
): string {
  return mangleClass(modulePath, namespace, name);
}

export function fullSymbolName(namespace: string, name: string): string {
  return namespace ? `${namespace}.${name}` : name;
}

export function functionKey(namespace: string, name: string): string {
  return `${namespace}::${name}`;
}
