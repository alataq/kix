import type { SourceLocation } from "./errors";

export type Visibility = "public" | "private" | "protected";

export interface ParsedFile {
  settings: SettingDecl[];
  imports: ImportDecl[];
  declarations: Decl[];
}

/**
 * A `$name value;` declaration at the top of a file. These are environment
 * settings: the compiler embeds the value as a default, and the generated
 * program lets the matching `KIX_<NAME>` environment variable override it.
 */
export interface SettingDecl {
  kind: "Setting";
  name: string;
  value: number;
  location: SourceLocation;
}

export interface ImportDecl {
  kind: "Import";
  path: string;
  alias?: string;
  location: SourceLocation;
}

export type Decl =
  | NamespaceDecl
  | ClassDecl
  | StructDecl
  | InterfaceDecl
  | EnumDecl
  | FunctionDecl;

export interface NamespaceDecl {
  kind: "Namespace";
  name: string;
  body: Decl[];
  location: SourceLocation;
}

export interface ClassDecl {
  kind: "Class";
  name: string;
  /** Generic type parameters, e.g. the T in `class Vector<T>`. */
  typeParams?: string[];
  abstract?: boolean;
  extends?: TypeRef;
  /** Interfaces named after `implements`. */
  implements?: TypeRef[];
  fields: FieldDecl[];
  methods: FunctionDecl[];
  visibility: Visibility;
  namespace: string;
  location: SourceLocation;
}

export interface StructDecl {
  kind: "Struct";
  name: string;
  fields: FieldDecl[];
  methods: FunctionDecl[];
  implements?: TypeRef[];
  visibility: Visibility;
  namespace: string;
  location: SourceLocation;
}

export interface InterfaceDecl {
  kind: "Interface";
  name: string;
  methods: FunctionDecl[];
  visibility: Visibility;
  namespace: string;
  location: SourceLocation;
}

export interface EnumDecl {
  kind: "Enum";
  name: string;
  variants: EnumVariantDecl[];
  visibility: Visibility;
  namespace: string;
  location: SourceLocation;
}

export interface EnumVariantDecl {
  kind: "EnumVariant";
  name: string;
  location: SourceLocation;
}

export interface FieldDecl {
  kind: "Field";
  name: string;
  type: TypeRef;
  visibility: Visibility;
  location: SourceLocation;
}

export interface FunctionDecl {
  kind: "Function";
  name: string;
  params: ParamDecl[];
  returnType: TypeRef;
  body: BlockStmt | null;
  visibility: Visibility;
  namespace: string;
  /** Set when this function is a class method. */
  className?: string;
  variadic: boolean;
  /** Type of exception the declaration may throw. */
  throwsType?: TypeRef;
  /** Set when the declaration is prefixed with `&` (or `&N` for dedicated workers). */
  task?: TaskDecl;
  /** Set for a `~ClassName` destructor declaration. */
  isDestructor?: boolean;
  /** Set for a method with no body that subclasses must implement. */
  abstract?: boolean;
  location: SourceLocation;
}

export interface TaskDecl {
  /**
   * Number of dedicated workers for this task. When omitted the task runs on
   * the shared general worker pool.
   */
  workers?: number;
}

export interface ParamDecl {
  name: string;
  type: TypeRef;
  location: SourceLocation;
}

export interface TypeRef {
  /** A primitive name or a possibly namespace-qualified class name. */
  name: string;
  /** Generic type arguments, e.g. the `int` in `Vector<int>`. */
  typeArgs?: TypeRef[];
  /** Size for fixed-size primitive arrays, e.g. int[16]. */
  arraySize?: number;
  /** A dynamically sized array type, e.g. T[]. */
  dynamicArray?: boolean;
  location: SourceLocation;
}

export type Stmt =
  | BlockStmt
  | EmptyStmt
  | VarDeclStmt
  | ExprStmt
  | ReturnStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | BreakStmt
  | ContinueStmt
  | DeleteStmt
  | ThrowStmt
  | TryStmt
  | DeferStmt
  | SwitchStmt;

export interface BlockStmt {
  kind: "Block";
  statements: Stmt[];
  location: SourceLocation;
}

export interface EmptyStmt {
  kind: "Empty";
  location: SourceLocation;
}

export interface VarDeclStmt {
  kind: "VarDecl";
  name: string;
  type: TypeRef;
  mutable: boolean;
  initializer?: Expr;
  location: SourceLocation;
}

export interface ExprStmt {
  kind: "ExprStmt";
  expression: Expr;
  location: SourceLocation;
}

export interface ReturnStmt {
  kind: "Return";
  expression?: Expr;
  location: SourceLocation;
}

export interface IfStmt {
  kind: "If";
  condition: Expr;
  thenBranch: Stmt;
  elseBranch?: Stmt;
  location: SourceLocation;
}

export interface WhileStmt {
  kind: "While";
  condition: Expr;
  body: Stmt;
  location: SourceLocation;
}

export interface ForStmt {
  kind: "For";
  initializer?: Stmt;
  condition?: Expr;
  update?: Expr;
  body: Stmt;
  location: SourceLocation;
}

export interface BreakStmt {
  kind: "Break";
  location: SourceLocation;
}

export interface ContinueStmt {
  kind: "Continue";
  location: SourceLocation;
}

export interface DeleteStmt {
  kind: "Delete";
  expression: Expr;
  location: SourceLocation;
}

export interface ThrowStmt {
  kind: "Throw";
  expression: Expr;
  location: SourceLocation;
}

export interface TryStmt {
  kind: "Try";
  tryBlock: BlockStmt;
  catchName?: string;
  catchType?: TypeRef;
  catchBlock?: BlockStmt;
  finallyBlock?: BlockStmt;
  location: SourceLocation;
}

export interface DeferStmt {
  kind: "Defer";
  body: Stmt;
  location: SourceLocation;
}

export interface SwitchCase {
  value?: Expr;
  statements: Stmt[];
  location: SourceLocation;
}

export interface SwitchStmt {
  kind: "Switch";
  expression: Expr;
  cases: SwitchCase[];
  location: SourceLocation;
}

export type Expr =
  | LiteralExpr
  | IdentifierExpr
  | QualifiedNameExpr
  | MemberExpr
  | IndexExpr
  | CallExpr
  | NewExpr
  | UnaryExpr
  | TaskDoneExpr
  | BinaryExpr
  | AssignExpr
  | ConditionalExpr
  | StructLiteralExpr
  | CastExpr
  | TypeTestExpr
  | AwaitExpr;

export type LiteralKind = "int" | "float" | "str" | "char" | "bool" | "null";

export interface LiteralExpr {
  kind: "Literal";
  literalKind: LiteralKind;
  value: string | number | boolean | null;
  raw: string;
  location: SourceLocation;
}

export interface IdentifierExpr {
  kind: "Identifier";
  name: string;
  location: SourceLocation;
}

/** A static namespace/member path such as `io::println`. */
export interface QualifiedNameExpr {
  kind: "QualifiedName";
  parts: string[];
  location: SourceLocation;
}

export interface MemberExpr {
  kind: "Member";
  object: Expr;
  property: string;
  location: SourceLocation;
}

export interface IndexExpr {
  kind: "Index";
  object: Expr;
  index: Expr;
  location: SourceLocation;
}

export interface CallExpr {
  kind: "Call";
  callee: Expr;
  args: Expr[];
  location: SourceLocation;
}

export interface NewExpr {
  kind: "New";
  type: TypeRef;
  args: Expr[];
  location: SourceLocation;
}

export type UnaryOperator = "!" | "-" | "+" | "~";

export interface UnaryExpr {
  kind: "Unary";
  operator: UnaryOperator;
  operand: Expr;
  location: SourceLocation;
}

/** `&name` reports whether the task result stored in `name` has completed. */
export interface TaskDoneExpr {
  kind: "TaskDone";
  operand: Expr;
  location: SourceLocation;
}

export type BinaryOperator =
  | "||"
  | "&&"
  | "|"
  | "^"
  | "&"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%";

export interface BinaryExpr {
  kind: "Binary";
  operator: BinaryOperator;
  left: Expr;
  right: Expr;
  location: SourceLocation;
}

export type AssignmentOperator = "=" | "+=" | "-=" | "*=" | "/=" | "%=";

export interface AssignExpr {
  kind: "Assign";
  operator: AssignmentOperator;
  target: Expr;
  value: Expr;
  location: SourceLocation;
}

export interface ConditionalExpr {
  kind: "Conditional";
  condition: Expr;
  thenExpr: Expr;
  elseExpr: Expr;
  location: SourceLocation;
}

export interface StructLiteralField {
  name: string;
  value: Expr;
  location: SourceLocation;
}

export interface StructLiteralExpr {
  kind: "StructLiteral";
  type: TypeRef;
  fields: StructLiteralField[];
  location: SourceLocation;
}

export interface CastExpr {
  kind: "Cast";
  expression: Expr;
  type: TypeRef;
  location: SourceLocation;
}

export interface TypeTestExpr {
  kind: "Is";
  expression: Expr;
  type: TypeRef;
  location: SourceLocation;
}

export interface AwaitExpr {
  kind: "Await";
  expression: Expr;
  location: SourceLocation;
}
