import type {
  AssignmentOperator,
  BinaryOperator,
  BlockStmt,
  ClassDecl,
  Decl,
  EnumDecl,
  Expr,
  FieldDecl,
  FunctionDecl,
  IfStmt,
  InterfaceDecl,
  ImportDecl,
  NamespaceDecl,
  ParamDecl,
  ParsedFile,
  Stmt,
  StructDecl,
  SwitchStmt,
  TryStmt,
  TypeRef,
  UnaryOperator,
  VarDeclStmt,
  Visibility,
  WhileStmt,
  ForStmt,
} from "./ast";
import { KixError } from "./errors";
import type { SourceLocation } from "./errors";
import { Lexer } from "./lexer";
import type { Token } from "./token";
import { isTypeKeyword } from "./token";

const ASSIGNMENT_OPERATORS = new Set<string>([
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
]);

export class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseFile(): ParsedFile {
    const settings: ParsedFile["settings"] = [];
    const imports: ImportDecl[] = [];
    const declarations: Decl[] = [];

    while (!this.checkKind("eof")) {
      if (this.check("$")) {
        settings.push(this.parseSetting());
      } else if (this.check("import")) {
        imports.push(this.parseImport());
      } else {
        declarations.push(this.parseDeclaration(""));
      }
    }

    return { settings, imports, declarations };
  }

  private parseSetting(): ParsedFile["settings"][number] {
    const start = this.expect("$");
    const name = this.expectIdentifier("setting name");
    this.match("=");

    const valueToken = this.current();
    if (valueToken.kind !== "int") {
      throw new KixError(
        `setting '${name.lexeme}' requires an integer value`,
        valueToken.location,
      );
    }
    this.advance();
    this.expect(";");

    return {
      kind: "Setting",
      name: name.lexeme,
      value: Number(valueToken.value ?? valueToken.lexeme),
      location: start.location,
    };
  }

  private parseImport(): ImportDecl {
    const start = this.expect("import");
    const path = this.parseDottedName("module name");
    let alias: string | undefined;

    if (this.match("as")) {
      alias = this.expectIdentifier("import alias").lexeme;
    }

    this.expect(";");
    return alias === undefined
      ? { kind: "Import", path, location: start.location }
      : { kind: "Import", path, alias, location: start.location };
  }

  private parseDeclaration(namespace: string): Decl {
    if (this.check("namespace")) return this.parseNamespace(namespace);
    const visibility = this.parseVisibility();
    if (visibility === "protected") {
      throw new KixError(
        "protected is only allowed on class members",
        this.current().location,
      );
    }
    if (this.check("abstract")) {
      if (this.peek(1).lexeme !== "class") {
        throw new KixError(
          "abstract is only supported on classes and methods",
          this.current().location,
        );
      }
      this.advance();
      return this.parseClass(namespace, visibility ?? "public", true);
    }
    if (this.check("class")) {
      return this.parseClass(namespace, visibility ?? "public", false);
    }
    if (this.check("interface")) {
      return this.parseInterface(namespace, visibility ?? "public");
    }
    if (this.check("struct")) {
      return this.parseStruct(namespace, visibility ?? "public");
    }
    if (this.check("enum")) {
      return this.parseEnum(namespace, visibility ?? "public");
    }
    if (!visibility && !this.check("&")) {
      throw new KixError(
        "functions must declare public or private visibility",
        this.current().location,
      );
    }
    return this.parseFunction(namespace, visibility ?? "public");
  }

  private parseNamespace(parentNamespace: string): NamespaceDecl {
    const start = this.expect("namespace");
    const localName = this.parseDottedName("namespace name");
    const name = parentNamespace
      ? `${parentNamespace}.${localName}`
      : localName;

    this.expect("{");
    const body: Decl[] = [];
    while (!this.check("}") && !this.checkKind("eof")) {
      body.push(this.parseDeclaration(name));
    }
    this.expect("}");

    return {
      kind: "Namespace",
      name,
      body,
      location: start.location,
    };
  }

  private parseClass(
    namespace: string,
    visibility: Visibility,
    isAbstract: boolean,
  ): ClassDecl {
    const start = this.expect("class");
    const name = this.expectIdentifier("class name").lexeme;
    const typeParams = this.parseTypeParams();
    const extendsType = this.match("extends") ? this.parseTypeRef() : undefined;
    const implementsList = this.parseImplements();
    this.expect("{");

    const fields: FieldDecl[] = [];
    const methods: FunctionDecl[] = [];

    while (!this.check("}") && !this.checkKind("eof")) {
      const memberVisibility = this.parseVisibility();
      const task = this.parseTaskModifier();
      const isAbstract = this.match("abstract");

      if (this.match("~")) {
        if (isAbstract) {
          throw new KixError(
            "destructors cannot be abstract",
            this.current().location,
          );
        }
        if (task) {
          throw new KixError(
            "destructors cannot be tasks",
            this.current().location,
          );
        }
        const destructorName = this.expectIdentifier("destructor name");
        if (destructorName.lexeme !== name) {
          throw new KixError(
            `destructor '~${destructorName.lexeme}' must match class '${name}'`,
            destructorName.location,
          );
        }
        const { params, variadic } = this.parseParamList();
        if (params.length > 0 || variadic) {
          throw new KixError(
            "destructors cannot take parameters",
            destructorName.location,
          );
        }
        if (this.match(":")) {
          throw new KixError(
            "destructors must not declare a return type",
            destructorName.location,
          );
        }
        if (this.check("throws")) {
          throw new KixError(
            "destructors cannot declare throws",
            this.current().location,
          );
        }
        const body = this.parseFunctionBody();
        methods.push({
          kind: "Function",
          name: `~${name}`,
          params: [],
          returnType: this.voidType(destructorName.location),
          body,
          visibility: memberVisibility ?? "public",
          namespace,
          className: name,
          variadic: false,
          isDestructor: true,
          location: destructorName.location,
        });
        continue;
      }

      const memberName = this.expectIdentifier("class member name");

      if (this.match(":")) {
        if (isAbstract) {
          throw new KixError(
            "fields cannot be abstract",
            memberName.location,
          );
        }
        if (task) {
          throw new KixError(
            "fields cannot be tasks; declare a method with '(' instead",
            memberName.location,
          );
        }
        const type = this.parseTypeRef();
        this.expect(";");
        fields.push({
          kind: "Field",
          name: memberName.lexeme,
          type,
          visibility: memberVisibility ?? "public",
          location: memberName.location,
        });
        continue;
      }

      if (this.check("(")) {
        const visibility = memberVisibility ?? (task ? "public" : undefined);
        if (!visibility) {
          throw new KixError(
            "methods must declare public or private visibility",
            memberName.location,
          );
        }
        const { params, variadic } = this.parseParamList();
        const returnType = this.match(":")
          ? this.parseTypeRef()
          : this.voidType(memberName.location);
        const throwsType = this.parseThrowsType();
        const body = this.parseFunctionBody();
        if (isAbstract && body !== null) {
          throw new KixError(
            `abstract method '${memberName.lexeme}' must not have a body`,
            memberName.location,
          );
        }

        methods.push({
          kind: "Function",
          name: memberName.lexeme,
          params,
          returnType,
          body,
          visibility,
          namespace,
          className: name,
          variadic,
          ...(throwsType ? { throwsType } : {}),
          ...(isAbstract ? { abstract: true } : {}),
          ...(task ? { task } : {}),
          location: memberName.location,
        });
        continue;
      }

      throw new KixError(
        "expected ':' for a field or '(' for a method",
        this.current().location,
      );
    }

    this.expect("}");

    return typeParams === undefined
      ? {
          kind: "Class",
          name,
          ...(isAbstract ? { abstract: true } : {}),
          ...(extendsType !== undefined ? { extends: extendsType } : {}),
          ...(implementsList ? { implements: implementsList } : {}),
          fields,
          methods,
          visibility,
          namespace,
          location: start.location,
        }
      : {
          kind: "Class",
          name,
          typeParams,
          ...(isAbstract ? { abstract: true } : {}),
          ...(extendsType !== undefined ? { extends: extendsType } : {}),
          ...(implementsList ? { implements: implementsList } : {}),
          fields,
          methods,
          visibility,
          namespace,
          location: start.location,
        };
  }

  private parseImplements(): TypeRef[] | undefined {
    if (!this.match("implements")) return undefined;
    const interfaces: TypeRef[] = [];
    for (;;) {
      interfaces.push(this.parseTypeRef());
      if (this.match(",")) continue;
      break;
    }
    return interfaces;
  }

  private parseStruct(namespace: string, visibility: Visibility): StructDecl {
    const start = this.expect("struct");
    const name = this.expectIdentifier("struct name").lexeme;
    const implementsList = this.parseImplements();
    this.expect("{");

    const fields: FieldDecl[] = [];
    const methods: FunctionDecl[] = [];
    while (!this.check("}") && !this.checkKind("eof")) {
      const memberVisibility = this.parseVisibility();
      if (this.check("abstract")) {
        throw new KixError(
          "structs cannot be abstract",
          this.current().location,
        );
      }
      const task = this.parseTaskModifier();
      if (task) {
        throw new KixError(
          "struct methods cannot be tasks",
          this.current().location,
        );
      }
      if (this.check("~")) {
        throw new KixError(
          "structs cannot declare destructors",
          this.current().location,
        );
      }
      const memberName = this.expectIdentifier("struct member name");
      if (this.match(":")) {
        const type = this.parseTypeRef();
        this.expect(";");
        fields.push({
          kind: "Field",
          name: memberName.lexeme,
          type,
          visibility: memberVisibility ?? "public",
          location: memberName.location,
        });
        continue;
      }
      if (this.check("(")) {
        const methodVisibility =
          memberVisibility ?? "public";
        const { params, variadic } = this.parseParamList();
        const returnType = this.match(":")
          ? this.parseTypeRef()
          : this.voidType(memberName.location);
        const throwsType = this.parseThrowsType();
        const body = this.parseFunctionBody();
        if (memberName.lexeme === name) {
          throw new KixError(
            "structs do not have constructors; use a struct literal",
            memberName.location,
          );
        }
        methods.push({
          kind: "Function",
          name: memberName.lexeme,
          params,
          returnType,
          body,
          visibility: methodVisibility,
          namespace,
          className: name,
          variadic,
          ...(throwsType ? { throwsType } : {}),
          location: memberName.location,
        });
        continue;
      }
      throw new KixError(
        "expected ':' for a field or '(' for a method",
        this.current().location,
      );
    }
    this.expect("}");

    return {
      kind: "Struct",
      name,
      ...(implementsList ? { implements: implementsList } : {}),
      fields,
      methods,
      visibility,
      namespace,
      location: start.location,
    };
  }

  private parseInterface(namespace: string, visibility: Visibility): InterfaceDecl {
    const start = this.expect("interface");
    const name = this.expectIdentifier("interface name").lexeme;
    this.expect("{");

    const methods: FunctionDecl[] = [];
    while (!this.check("}") && !this.checkKind("eof")) {
      const methodVisibility = this.parseVisibility();
      if (methodVisibility && methodVisibility !== "public") {
        throw new KixError(
          "interface methods are implicitly public",
          this.current().location,
        );
      }
      const methodName = this.expectIdentifier("interface method name");
      const { params, variadic } = this.parseParamList();
      const returnType = this.match(":")
        ? this.parseTypeRef()
        : this.voidType(methodName.location);
      const throwsType = this.parseThrowsType();
      this.expect(";");
      methods.push({
        kind: "Function",
        name: methodName.lexeme,
        params,
        returnType,
        body: null,
        visibility: "public",
        namespace,
        variadic,
        ...(throwsType ? { throwsType } : {}),
        location: methodName.location,
      });
    }
    this.expect("}");

    return {
      kind: "Interface",
      name,
      methods,
      visibility,
      namespace,
      location: start.location,
    };
  }

  private parseEnum(namespace: string, visibility: Visibility): EnumDecl {
    const start = this.expect("enum");
    const name = this.expectIdentifier("enum name");
    this.expect("{");

    const variants: EnumDecl["variants"] = [];
    while (!this.check("}") && !this.checkKind("eof")) {
      const variant = this.expectIdentifier("enum variant name");
      if (variants.some((existing) => existing.name === variant.lexeme)) {
        throw new KixError(
          `duplicate enum variant '${variant.lexeme}'`,
          variant.location,
        );
      }
      variants.push({
        kind: "EnumVariant",
        name: variant.lexeme,
        location: variant.location,
      });
      if (!this.match(",")) break;
    }

    this.expect("}");

    return {
      kind: "Enum",
      name: name.lexeme,
      variants,
      visibility,
      namespace,
      location: start.location,
    };
  }

  private parseTypeParams(): string[] | undefined {
    if (!this.match("<")) return undefined;
    const params: string[] = [];
    if (!this.match(">")) {
      for (;;) {
        const token = this.expectIdentifier("type parameter name");
        if (params.includes(token.lexeme)) {
          throw new KixError(
            `duplicate type parameter '${token.lexeme}'`,
            token.location,
          );
        }
        params.push(token.lexeme);
        if (this.match(",")) continue;
        this.expect(">");
        break;
      }
    }
    return params;
  }

  private parseFunction(
    namespace: string,
    visibility: Visibility,
  ): FunctionDecl {
    const task = this.parseTaskModifier();
    const name = this.expectIdentifier("function name");
    const { params, variadic } = this.parseParamList();
    const returnType = this.match(":")
      ? this.parseTypeRef()
      : this.voidType(name.location);
    const throwsType = this.parseThrowsType();
    const body = this.parseFunctionBody();

    return {
      kind: "Function",
      name: name.lexeme,
      params,
      returnType,
      body,
      visibility,
      namespace,
      variadic,
      ...(throwsType ? { throwsType } : {}),
      ...(task ? { task } : {}),
      location: name.location,
    };
  }

  /**
   * Parse the `&` task marker. `&worker` uses the shared general pool, while
   * `&4worker` reserves four dedicated workers for that task.
   */
  private parseTaskModifier(): FunctionDecl["task"] | undefined {
    if (!this.match("&")) return undefined;

    if (this.current().kind === "int") {
      const count = this.advance();
      const workers = Number(count.value ?? count.lexeme);
      return { workers };
    }

    return {};
  }

  private parseThrowsType(): TypeRef | undefined {
    if (!this.match("throws")) return undefined;
    return this.parseTypeRef();
  }

  private parseFunctionBody(): BlockStmt | null {
    if (this.match(";")) return null;
    if (!this.check("{")) {
      throw new KixError(
        "expected a function body or ';'",
        this.current().location,
      );
    }
    return this.parseBlock();
  }

  private parseParamList(): { params: ParamDecl[]; variadic: boolean } {
    this.expect("(");
    const params: ParamDecl[] = [];
    let variadic = false;

    if (this.match(")")) return { params, variadic };

    for (;;) {
      if (this.match("...")) {
        variadic = true;
        this.expect(")");
        break;
      }

      // Canonical form: name: type. The C-style `type name` form is also
      // accepted because it is useful when porting C headers by hand.
      let paramName: string;
      let paramLocation: SourceLocation;
      let type: TypeRef;

      if (
        this.current().kind === "identifier" &&
        this.peek(1).lexeme === ":"
      ) {
        const name = this.advance();
        this.expect(":");
        type = this.parseTypeRef();
        paramName = name.lexeme;
        paramLocation = name.location;
      } else {
        type = this.parseTypeRef();
        const name = this.expectIdentifier("parameter name");
        paramName = name.lexeme;
        paramLocation = name.location;
      }

      if (params.some((p) => p.name === paramName)) {
        throw new KixError(
          `duplicate parameter name '${paramName}'`,
          paramLocation,
        );
      }
      params.push({ name: paramName, type, location: paramLocation });

      if (this.match(",")) {
        if (this.match(")")) break;
        continue;
      }

      this.expect(")");
      break;
    }

    return { params, variadic };
  }

  private expectTypeClose(): void {
    if (this.match(">")) return;
    if (this.check(">>")) {
      const token = this.current();
      this.advance();
      this.tokens.splice(this.index, 0, {
        kind: "symbol",
        lexeme: ">",
        location: token.location,
      });
      return;
    }
    this.expect(">");
  }

  private parseTypeRef(): TypeRef {
    const first = this.current();
    if (!isTypeKeyword(first) && first.kind !== "identifier") {
      throw new KixError("expected a type", first.location);
    }
    this.advance();

    let name = first.lexeme;
    while (this.check("::") || this.check(".")) {
      this.advance();
      const segment = this.expectIdentifier("type name segment");
      name += `.${segment.lexeme}`;
    }

    let typeArgs: TypeRef[] | undefined;
    if (this.match("<")) {
      const args: TypeRef[] = [];
      if (!this.match(">")) {
        for (;;) {
          args.push(this.parseTypeRef());
          if (this.match(",")) continue;
          this.expectTypeClose();
          break;
        }
      }
      typeArgs = args;
    }

    let arraySize: number | undefined;
    let dynamicArray = false;
    if (this.match("[")) {
      if (this.match("]")) {
        dynamicArray = true;
      } else {
        const sizeToken = this.current();
        if (sizeToken.kind !== "int") {
          throw new KixError(
            "array size must be a positive integer literal",
            sizeToken.location,
          );
        }
        this.advance();
        const size = Number(sizeToken.value ?? sizeToken.lexeme);
        if (!Number.isInteger(size) || size <= 0) {
          throw new KixError(
            "array size must be a positive integer",
            sizeToken.location,
          );
        }
        this.expect("]");
        arraySize = size;
      }
    }

    const base: TypeRef = { name, location: first.location };
    if (typeArgs !== undefined) base.typeArgs = typeArgs;
    if (arraySize !== undefined) base.arraySize = arraySize;
    if (dynamicArray) base.dynamicArray = true;
    return base;
  }

  private parseBlock(): BlockStmt {
    const start = this.expect("{");
    const statements: Stmt[] = [];

    while (!this.check("}") && !this.checkKind("eof")) {
      statements.push(this.parseStatement());
    }

    this.expect("}");
    return { kind: "Block", statements, location: start.location };
  }

  private parseStatement(): Stmt {
    if (this.check("{")) return this.parseBlock();
    if (this.check(";")) {
      const token = this.advance();
      return { kind: "Empty", location: token.location };
    }
    if (this.check("return")) return this.parseReturn();
    if (this.check("if")) return this.parseIf();
    if (this.check("while")) return this.parseWhile();
    if (this.check("for")) return this.parseFor();
    if (this.check("break")) {
      const start = this.advance();
      this.expect(";");
      return { kind: "Break", location: start.location };
    }
    if (this.check("continue")) {
      const start = this.advance();
      this.expect(";");
      return { kind: "Continue", location: start.location };
    }
    if (this.check("delete")) {
      const start = this.advance();
      const expression = this.parseExpression();
      this.expect(";");
      return { kind: "Delete", expression, location: start.location };
    }
    if (this.check("throw")) {
      const start = this.advance();
      const expression = this.parseExpression();
      this.expect(";");
      return { kind: "Throw", expression, location: start.location };
    }
    if (this.check("try")) return this.parseTry();
    if (this.check("switch")) return this.parseSwitch();
    if (this.check("defer")) {
      const start = this.advance();
      const body = this.parseStatement();
      return { kind: "Defer", body, location: start.location };
    }
    if (this.check("let") || this.check("var") || this.check("const")) {
      return this.parseKeywordVarDecl();
    }
    if (this.looksLikeTypedVarDecl()) {
      return this.parseTypedVarDecl();
    }

    const expression = this.parseExpression();
    const start = expression.location;
    this.expect(";");
    return { kind: "ExprStmt", expression, location: start };
  }

  private parseKeywordVarDecl(): VarDeclStmt {
    const start = this.advance();
    const mutable = start.lexeme === "var";
    const name = this.expectIdentifier("variable name");
    this.expect(":");
    const type = this.parseTypeRef();
    const initializer = this.match("=") ? this.parseExpression() : undefined;
    this.expect(";");

    return initializer === undefined
      ? {
          kind: "VarDecl",
          name: name.lexeme,
          type,
          mutable,
          location: start.location,
        }
      : {
          kind: "VarDecl",
          name: name.lexeme,
          type,
          mutable,
          initializer,
          location: start.location,
        };
  }

  private parseTypedVarDecl(): VarDeclStmt {
    const start = this.current();
    const type = this.parseTypeRef();
    const name = this.expectIdentifier("variable name");
    const initializer = this.match("=") ? this.parseExpression() : undefined;
    this.expect(";");

    return initializer === undefined
      ? {
          kind: "VarDecl",
          name: name.lexeme,
          type,
          mutable: true,
          location: start.location,
        }
      : {
          kind: "VarDecl",
          name: name.lexeme,
          type,
          mutable: true,
          initializer,
          location: start.location,
        };
  }

  private parseReturn(): Stmt {
    const start = this.expect("return");
    if (this.match(";")) {
      return { kind: "Return", location: start.location };
    }
    const expression = this.parseExpression();
    this.expect(";");
    return { kind: "Return", expression, location: start.location };
  }

  private parseIf(): IfStmt {
    const start = this.expect("if");
    this.expect("(");
    const condition = this.parseExpression();
    this.expect(")");
    const thenBranch = this.parseStatement();

    if (!this.match("else")) {
      return {
        kind: "If",
        condition,
        thenBranch,
        location: start.location,
      };
    }

    const elseBranch = this.parseStatement();
    return {
      kind: "If",
      condition,
      thenBranch,
      elseBranch,
      location: start.location,
    };
  }

  private parseWhile(): WhileStmt {
    const start = this.expect("while");
    this.expect("(");
    const condition = this.parseExpression();
    this.expect(")");
    const body = this.parseStatement();
    return { kind: "While", condition, body, location: start.location };
  }

  private parseFor(): ForStmt {
    const start = this.expect("for");
    this.expect("(");

    let initializer: Stmt | undefined;
    if (!this.check(";")) {
      if (this.check("let") || this.check("var") || this.check("const")) {
        initializer = this.parseKeywordVarDecl();
      } else if (this.looksLikeTypedVarDecl()) {
        initializer = this.parseTypedVarDecl();
      } else {
        const expression = this.parseExpression();
        this.expect(";");
        initializer = {
          kind: "ExprStmt",
          expression,
          location: expression.location,
        };
      }
    } else {
      this.expect(";");
    }

    const condition = this.check(";") ? undefined : this.parseExpression();
    this.expect(";");

    const update = this.check(")") ? undefined : this.parseExpression();
    this.expect(")");
    const body = this.parseStatement();

    const statement: ForStmt = {
      kind: "For",
      body,
      location: start.location,
    };
    if (initializer) statement.initializer = initializer;
    if (condition) statement.condition = condition;
    if (update) statement.update = update;
    return statement;
  }

  private parseTry(): TryStmt {
    const start = this.expect("try");
    const tryBlock = this.parseBlock();

    let catchName: string | undefined;
    let catchType: TypeRef | undefined;
    let catchBlock: BlockStmt | undefined;
    let finallyBlock: BlockStmt | undefined;

    if (this.match("catch")) {
      this.expect("(");
      catchName = this.expectIdentifier("catch variable").lexeme;
      this.expect(":");
      catchType = this.parseTypeRef();
      this.expect(")");
      catchBlock = this.parseBlock();
    }

    if (this.match("finally")) {
      finallyBlock = this.parseBlock();
    }

    if (!catchBlock && !finallyBlock) {
      throw new KixError(
        "try requires catch, finally, or both",
        start.location,
      );
    }

    return {
      kind: "Try",
      tryBlock,
      ...(catchName !== undefined ? { catchName } : {}),
      ...(catchType !== undefined ? { catchType } : {}),
      ...(catchBlock !== undefined ? { catchBlock } : {}),
      ...(finallyBlock !== undefined ? { finallyBlock } : {}),
      location: start.location,
    };
  }

  private parseSwitch(): SwitchStmt {
    const start = this.expect("switch");
    this.expect("(");
    const expression = this.parseExpression();
    this.expect(")");
    this.expect("{");

    const cases: SwitchStmt["cases"] = [];
    let sawDefault = false;
    while (!this.check("}") && !this.checkKind("eof")) {
      let value: Expr | undefined;
      const caseStart = this.current();
      if (this.match("case")) {
        value = this.parseExpression();
        this.expect(":");
      } else if (this.match("default")) {
        if (sawDefault) {
          throw new KixError("duplicate default label", caseStart.location);
        }
        sawDefault = true;
        this.expect(":");
      } else {
        throw new KixError(
          "expected case or default in switch",
          caseStart.location,
        );
      }

      const statements: Stmt[] = [];
      while (
        !this.check("case") &&
        !this.check("default") &&
        !this.check("}") &&
        !this.checkKind("eof")
      ) {
        statements.push(this.parseStatement());
      }
      const entry: SwitchStmt["cases"][number] = {
        statements,
        location: caseStart.location,
      };
      if (value) entry.value = value;
      cases.push(entry);
    }
    this.expect("}");

    return {
      kind: "Switch",
      expression,
      cases,
      location: start.location,
    };
  }

  private parseExpression(): Expr {
    return this.parseAssignment();
  }

  private parseAssignment(): Expr {
    const left = this.parseConditional();

    const operator = this.current();
    if (
      operator.kind !== "symbol" ||
      !ASSIGNMENT_OPERATORS.has(operator.lexeme)
    ) {
      return left;
    }
    this.advance();

    const right = this.parseAssignment();
    return {
      kind: "Assign",
      operator: operator.lexeme as AssignmentOperator,
      target: left,
      value: right,
      location: left.location,
    };
  }

  private parseConditional(): Expr {
    const condition = this.parseLogicalOr();
    if (!this.match("?")) return condition;

    const thenExpr = this.parseAssignment();
    this.expect(":");
    const elseExpr = this.parseAssignment();

    return {
      kind: "Conditional",
      condition,
      thenExpr,
      elseExpr,
      location: condition.location,
    };
  }

  private parseLogicalOr(): Expr {
    return this.parseBinary(() => this.parseLogicalAnd(), ["||"]);
  }

  private parseLogicalAnd(): Expr {
    return this.parseBinary(() => this.parseBitwiseOr(), ["&&"]);
  }

  private parseBitwiseOr(): Expr {
    return this.parseBinary(() => this.parseBitwiseXor(), ["|"]);
  }

  private parseBitwiseXor(): Expr {
    return this.parseBinary(() => this.parseBitwiseAnd(), ["^"]);
  }

  private parseBitwiseAnd(): Expr {
    return this.parseBinary(() => this.parseEquality(), ["&"]);
  }

  private parseEquality(): Expr {
    return this.parseBinary(() => this.parseComparison(), ["==", "!="]);
  }

  private parseComparison(): Expr {
    return this.parseBinary(() => this.parseShift(), ["<", "<=", ">", ">="]);
  }

  private parseShift(): Expr {
    return this.parseBinary(() => this.parseAdditive(), ["<<", ">>"]);
  }

  private parseAdditive(): Expr {
    return this.parseBinary(() => this.parseMultiplicative(), ["+", "-"]);
  }

  private parseMultiplicative(): Expr {
    return this.parseBinary(() => this.parseUnary(), ["*", "/", "%"]);
  }

  private parseBinary(
    next: () => Expr,
    operators: readonly string[],
  ): Expr {
    let left = next();

    while (operators.includes(this.current().lexeme)) {
      const operator = this.advance();
      const right = next();
      left = {
        kind: "Binary",
        operator: operator.lexeme as BinaryOperator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private parseUnary(): Expr {
    if (this.match("await")) {
      return {
        kind: "Await",
        expression: this.parseUnary(),
        location: this.current().location,
      };
    }
    if (this.check("!")) {
      const operator = this.advance();
      return {
        kind: "Unary",
        operator: operator.lexeme as UnaryOperator,
        operand: this.parseUnary(),
        location: operator.location,
      };
    }
    if (this.check("-") || this.check("+") || this.check("~")) {
      const operator = this.advance();
      return {
        kind: "Unary",
        operator: operator.lexeme as UnaryOperator,
        operand: this.parseUnary(),
        location: operator.location,
      };
    }
    if (this.check("&")) {
      const operator = this.advance();
      return {
        kind: "TaskDone",
        operand: this.parseUnary(),
        location: operator.location,
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expression = this.parsePrimary();

    for (;;) {
      if (this.match("(")) {
        const args: Expr[] = [];
        if (!this.match(")")) {
          for (;;) {
            args.push(this.parseAssignment());
            if (this.match(",")) {
              if (this.match(")")) break;
              continue;
            }
            this.expect(")");
            break;
          }
        }

        expression = {
          kind: "Call",
          callee: expression,
          args,
          location: expression.location,
        };
        continue;
      }

      if (this.match("[")) {
        const index = this.parseExpression();
        this.expect("]");
        expression = {
          kind: "Index",
          object: expression,
          index,
          location: expression.location,
        };
        continue;
      }

      if (this.match("as")) {
        expression = {
          kind: "Cast",
          expression,
          type: this.parseTypeRef(),
          location: expression.location,
        };
        continue;
      }

      if (this.match("is")) {
        expression = {
          kind: "Is",
          expression,
          type: this.parseTypeRef(),
          location: expression.location,
        };
        continue;
      }

      if (this.check("::")) {
        const parts = this.memberChain(expression);
        if (parts) {
          this.advance();
          const name = this.expectIdentifier("qualified name");
          expression = {
            kind: "QualifiedName",
            parts: [...parts, name.lexeme],
            location: expression.location,
          };
          continue;
        }
      }

      if (this.match(".")) {
        const property = this.expectIdentifier("member name");
        expression = {
          kind: "Member",
          object: expression,
          property: property.lexeme,
          location: expression.location,
        };
        continue;
      }

      break;
    }

    return expression;
  }

  private memberChain(expression: Expr): string[] | undefined {
    if (expression.kind === "Identifier") return [expression.name];
    if (expression.kind === "Member") {
      const prefix = this.memberChain(expression.object);
      if (!prefix) return undefined;
      return [...prefix, expression.property];
    }
    return undefined;
  }

  private parsePrimary(): Expr {
    const token = this.current();

    if (this.match("(")) {
      const expression = this.parseExpression();
      this.expect(")");
      return expression;
    }

    if (this.match("new")) {
      const type = this.parseTypeRef();
      const args: Expr[] = [];
      if (this.match("(")) {
        if (!this.match(")")) {
          for (;;) {
            args.push(this.parseAssignment());
            if (this.match(",")) {
              if (this.match(")")) break;
              continue;
            }
            this.expect(")");
            break;
          }
        }
      }
      return {
        kind: "New",
        type,
        args,
        location: token.location,
      };
    }

    if (token.kind === "int" || token.kind === "float") {
      this.advance();
      return {
        kind: "Literal",
        literalKind: token.kind,
        value: token.value ?? 0,
        raw: token.lexeme,
        location: token.location,
      };
    }

    if (token.kind === "string") {
      this.advance();
      return {
        kind: "Literal",
        literalKind: "str",
        value: String(token.value ?? ""),
        raw: token.lexeme,
        location: token.location,
      };
    }

    if (token.kind === "char") {
      this.advance();
      return {
        kind: "Literal",
        literalKind: "char",
        value: String(token.value ?? ""),
        raw: token.lexeme,
        location: token.location,
      };
    }

    if (this.match("true") || this.match("false")) {
      return {
        kind: "Literal",
        literalKind: "bool",
        value: token.lexeme === "true",
        raw: token.lexeme,
        location: token.location,
      };
    }

    if (this.match("null")) {
      return {
        kind: "Literal",
        literalKind: "null",
        value: null,
        raw: "null",
        location: token.location,
      };
    }

    if (this.match("self")) {
      return {
        kind: "Identifier",
        name: "self",
        location: token.location,
      };
    }

    if (this.match("super")) {
      return {
        kind: "Identifier",
        name: "super",
        location: token.location,
      };
    }

    if (token.kind === "identifier" && this.peek(1).lexeme === "{") {
      const type = this.parseTypeRef();
      this.expect("{");
      const fields: { name: string; value: Expr; location: SourceLocation }[] = [];
      while (!this.check("}") && !this.checkKind("eof")) {
        const name = this.expectIdentifier("struct field name");
        this.expect(":");
        const value = this.parseExpression();
        fields.push({ name: name.lexeme, value, location: name.location });
        if (this.match(",")) continue;
        break;
      }
      this.expect("}");
      return {
        kind: "StructLiteral",
        type,
        fields,
        location: token.location,
      };
    }

    if (token.kind === "identifier") {
      return this.parseIdentifierOrQualifiedName();
    }

    // `int[cap]` is an array allocation expression. Return the primitive name
    // as an identifier and let the postfix parser attach the `[...]` size.
    if (isTypeKeyword(token) && this.peek(1).lexeme === "[") {
      this.advance();
      return {
        kind: "Identifier",
        name: token.lexeme,
        location: token.location,
      };
    }

    // `str::length` starts with a type keyword, but here it is a namespace
    // alias rather than a type. Allow type keywords in qualified calls.
    if (isTypeKeyword(token) && this.peek(1).lexeme === "::") {
      return this.parseIdentifierOrQualifiedName();
    }

    throw new KixError("expected an expression", token.location);
  }

  private parseIdentifierOrQualifiedName(): Expr {
    const first = this.advance();
    const parts = [first.lexeme];

    while (this.match("::")) {
      parts.push(this.expectIdentifier("qualified name").lexeme);
    }

    if (parts.length === 1) {
      return {
        kind: "Identifier",
        name: first.lexeme,
        location: first.location,
      };
    }

    return {
      kind: "QualifiedName",
      parts,
      location: first.location,
    };
  }

  private looksLikeTypedVarDecl(): boolean {
    let offset = 0;
    const first = this.peek(offset);
    if (!isTypeKeyword(first) && first.kind !== "identifier") return false;
    offset += 1;

    while (this.peek(offset).lexeme === "::" || this.peek(offset).lexeme === ".") {
      if (this.peek(offset + 1).kind !== "identifier") return false;
      offset += 2;
    }

    if (this.peek(offset).lexeme === "<") {
      let depth = 0;
      for (;;) {
        const token = this.peek(offset);
        if (token.kind === "eof") return false;
        if (token.lexeme === "<") depth += 1;
        if (token.lexeme === ">") {
          depth -= 1;
          if (depth === 0) {
            offset += 1;
            break;
          }
        } else if (token.lexeme === ">>") {
          depth -= 2;
          if (depth <= 0) {
            offset += 1;
            break;
          }
        }
        offset += 1;
      }
    }

    if (this.peek(offset).lexeme === "[") {
      if (this.peek(offset + 1).lexeme === "]") {
        offset += 2;
      } else {
        if (this.peek(offset + 1).kind !== "int") return false;
        if (this.peek(offset + 2).lexeme !== "]") return false;
        offset += 3;
      }
    }

    const name = this.peek(offset);
    if (name.kind !== "identifier") return false;

    const after = this.peek(offset + 1);
    return after.lexeme === "=" || after.lexeme === ";";
  }

  private parseVisibility(): Visibility | undefined {
    if (this.match("public")) return "public";
    if (this.match("private")) return "private";
    if (this.match("protected")) return "protected";
    return undefined;
  }

  private parseDottedName(what: string): string {
    const first = this.expectName(what);
    let name = first.lexeme;

    while (this.check(".") || this.check("::")) {
      this.advance();
      name += `.${this.expectName(what).lexeme}`;
    }

    return name;
  }

  /**
   * Module and namespace segments may be primitive type keywords.
   */
  private expectName(what: string): Token {
    const token = this.current();
    if (token.kind === "identifier" || isTypeKeyword(token)) {
      return this.advance();
    }
    throw new KixError(
      `expected ${what}, found '${this.describe(token)}'`,
      token.location,
    );
  }

  private voidType(location: SourceLocation): TypeRef {
    return { name: "void", location };
  }

  private current(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private peek(offset: number): Token {
    return (
      this.tokens[this.index + offset] ??
      this.tokens[this.tokens.length - 1]!
    );
  }

  private advance(): Token {
    const token = this.current();
    if (token.kind !== "eof") this.index += 1;
    return token;
  }

  private check(lexeme: string): boolean {
    const token = this.current();
    // Literal tokens carry their decoded value in `lexeme`; never let a
    // string such as "!" masquerade as an operator or keyword.
    if (
      token.kind === "string" ||
      token.kind === "char" ||
      token.kind === "int" ||
      token.kind === "float" ||
      token.kind === "eof"
    ) {
      return false;
    }
    return token.lexeme === lexeme;
  }

  private checkKind(kind: Token["kind"]): boolean {
    return this.current().kind === kind;
  }

  private match(lexeme: string): boolean {
    if (this.check(lexeme)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(lexeme: string): Token {
    if (!this.check(lexeme)) {
      throw new KixError(
        `expected '${lexeme}', found '${this.describe(this.current())}'`,
        this.current().location,
      );
    }
    return this.advance();
  }

  private expectIdentifier(what: string): Token {
    if (this.current().kind !== "identifier") {
      throw new KixError(
        `expected ${what}, found '${this.describe(this.current())}'`,
        this.current().location,
      );
    }
    return this.advance();
  }

  private describe(token: Token): string {
    return token.kind === "eof" ? "end of file" : token.lexeme;
  }
}

export function parse(source: string, file = "<input>"): ParsedFile {
  const tokens = new Lexer(source, file).tokenize();
  return new Parser(tokens).parseFile();
}
