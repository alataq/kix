# Kix language reference

This is the complete reference for Kix syntax and semantics. For the standard library, see [stdlib.md](stdlib.md).

## Contents

- [Files, modules, and imports](#files-modules-and-imports)
- [Settings](#settings)
- [Namespaces](#namespaces)
- [Visibility](#visibility)
- [Primitive types](#primitive-types)
- [Classes](#classes)
- [Enums](#enums)
- [Generic classes](#generic-classes)
- [Functions, methods, and overloads](#functions-methods-and-overloads)
- [Entry point](#entry-point)
- [Variables and scope](#variables-and-scope)
- [Literals](#literals)
- [Operators](#operators)
- [Statements](#statements)
- [Expressions and calls](#expressions-and-calls)
- [Arrays](#arrays)
- [Tasks](#tasks)
- [`syscall`](#syscall)
- [Comments](#comments)
- [Structs](#structs)
- [Interfaces](#interfaces)
- [Inheritance and abstract classes](#inheritance-and-abstract-classes)
- [Switch statements](#switch-statements)
- [Bitwise and shift operators](#bitwise-and-shift-operators)
- [Casts and type tests](#casts-and-type-tests)
- [Immutable bindings](#immutable-bindings)
- [Multi-level imports and packages](#multi-level-imports-and-package-indexes)
- [Exceptions vs errors](#exceptions-vs-errors)
- [Memory model](#memory-model-kix-v1)
- [Error handling](#error-handling-kix-v1)
- [Module resolution details](#module-resolution-details)
- [C naming and interop](#c-naming-and-interop)
- [Extending the compiler](#extending-the-compiler)
- [Tests](#tests)

## Language reference

### Files, modules, and imports

Every `.kix` file is a module. A module contains optional settings, imports,
and declarations.

```kix
$wkc 4;

import kix.io;
import kix.string as str;
import util.math;

namespace app.core {
    public answer(): int {
        return 42;
    }
}
```

- Imports use a dotted path: `import kix.io;` loads `kix/io.kix`.
- `as` introduces a local alias: `import kix.io as out;` makes calls such as
  `out::println("hi")` and types such as `out::File` available.
- A module's canonical namespace is its first `namespace` declaration. Imports
  bind aliases to that namespace, not necessarily to the import path.
- Importing the same target twice under the same alias is harmless; binding one
  alias to two different targets is an error.
- Cyclic imports are rejected.

Module resolution checks, in order:

1. the importing file's directory
2. `<project>/modules/…`
3. the compiler's bundled `modules/` directory

Official modules are ordinary `.kix` files compiled by the same frontend as
user code.

### Settings

A setting is a top-level `$name value;` declaration. Kix v1 supports:

```kix
$wkc 4;
```

`$wkc` sets the number of general task workers. It must be an integer of at
least 1. Only settings in the entry file are used, and duplicate or unknown
settings are rejected. At run time, `KIX_WKC` overrides the compiled default.

### Namespaces

Namespaces nest and use dot notation:

```kix
namespace app.http.routes {
    public ping(): int { return 0; }
}

public main(): int {
    return app.http.routes::ping();
}
```

Unqualified function names resolve in the current namespace, then in the global
namespace. Classes, enums, interfaces, and generic classes additionally consider
imported namespaces with this precedence:

1. current namespace
2. imported namespaces
3. global namespace

A name from the current namespace shadows imports and global declarations. Two
imported namespaces exposing the same class/enum name are ambiguous and must be
qualified with an import alias, for example `one::Item` or `string::String`.
Qualify cross-module calls with an import alias, for example
`io::println(...)`.

### Visibility

- Functions and methods declare `public`, `private`, or `protected`.
- `protected` is only valid on class members.
- Classes, enums, and fields default to `public`.
- Task functions and task methods may omit visibility; they default to public.
- Private declarations are accessible only inside their own module.
- Private fields and methods are accessible inside their declaring class.
- Protected fields and methods are accessible in the declaring class and its
  subclasses.
- Top-level `protected` declarations are rejected.

### Primitive types

| Type | C type | Notes |
| --- | --- | --- |
| `int` | `int64_t` | signed 64-bit |
| `float` | `double` | 64-bit IEEE floating point |
| `bool` | `bool` | `true` / `false` |
| `char` | `char` | one byte |
| `void` | `void` | no value; functions only |

Implicit widening is limited to:

- `char` → `int` → `float`
- `int` → `float`

There is no implicit narrowing. Use `as` for explicit casts.

### Classes

```kix
class Point {
    private x: int;
    private y: int;

    public Point(x: int, y: int) {
        self.x = x;
        self.y = y;
    }

    public lengthSquared(): int {
        return self.x * self.x + self.y * self.y;
    }
}
```

- Fields are declared as `name: Type;` inside a class.
- Methods are declared like functions.
- `self` refers to the receiver inside methods.
- Constructors are methods whose name equals the class name. They may be
  overloaded by parameter types and are invoked with `new`.
- If a class declares no constructor, `new ClassName()` allocates a zeroed
  object.
- Classes are GC-managed reference types. Assignment copies the reference.
- Class locals must be initialized. Class fields may start as null.
- `null` is a valid class reference and can be compared with `==` and `!=`.
- Method calls and field access on null panic at run time.
- A class may declare one destructor named `~ClassName`.
- `delete reference;` runs the destructor once and marks the object finalized.
- GC finalizes unreachable objects with destructors at collection time.
- A field and a method with the same name in one class are rejected.
- Classes support single inheritance, interfaces, and abstract declarations.
- Static members are not implemented.

### Enums

```kix
public enum TokenKind {
    Identifier,
    Number,
    Plus,
}

public main(): int {
    TokenKind kind = TokenKind.Number;
    if (kind == TokenKind.Number) {
        return 0;
    }
    return 1;
}
```

- Enums are payload-free and ordered; values start at 0 and increase by one.
- Variants use dot access: `TokenKind.Number`.
- `TokenKind::Number` is not valid.
- An enum must declare at least one variant.
- Enums can be used as fixed-size and dynamic array elements.
- Uninitialized enum values default to the first variant (`0`).

### Generic classes

```kix
class Box<T> {
    public value: T;

    public Box(value: T) {
        self.value = value;
    }

    public get(): T {
        return self.value;
    }
}

public main(): int {
    Box<int> number = new Box<int>(7);
    return number.get();
}
```

- Generic classes require explicit type arguments.
- Type arguments may be primitives, enums, or classes.
- Type arguments may not be `void` or array types.
- Generics are monomorphized: one concrete C struct is emitted per distinct
  instantiation.
- Generic functions, generic interfaces, and generic enums are not supported.
- Inside a generic class, fixed-size arrays of `T` are only supported when the
  instantiation provides a primitive or enum for `T`.

### Functions, methods, and overloads

```kix
public add(a: int, b: int): int {
    return a + b;
}

public add(a: float, b: float): float {
    return a + b;
}
```

- Functions and methods may be overloaded by parameter types.
- Exact matches are preferred over widening conversions.
- Overloads cannot differ only by return type.
- Duplicate parameter signatures in the same namespace are rejected.
- Parameter names must be unique.
- The canonical parameter form is `name: Type`; the C-style `Type name` form
  is also accepted.
- A variadic function ends its parameter list with `...`. It must have at least
  one fixed parameter.
- A function that may throw must declare `throws Type` after its return type.
- Calls to throwing declarations must be caught with `try`, or the caller must
  declare a compatible `throws Type`.
- Declarations may end with `;` instead of a body. The compiler only maps
  `io::printf` to the runtime bridge; other bodyless functions are unresolved
  at link time.

### Entry point

The entry module must declare exactly one `public main` returning `int`. It may
take:

```kix
public main(): int
public main(argc: int): int
public main(argv: String[]): int
public main(argc: int, argv: String[]): int
```

`argv` requires `import kix.vector;`. `main` cannot be a task, cannot be
overloaded, and must have a body. Its return value becomes the process exit
status. `main` may declare `throws Exception`; uncaught exceptions abort with a nonzero
status.

### Variables and scope

```kix
int x = 1;
let y: int = 2;
var z: int;
const limit: int = 10;
```

- Both `let/var/const name: Type` and `Type name` declare locals.
- Type inference is not supported; every declaration names its type.
- `let`, `var`, and `const` currently have identical semantics; `const` is not
  enforced in Kix v1.
- An uninitialized local receives its type's default: `0`, `0.0`, `false`,
  `'\0'`, zeroed fixed array, or zeroed enum.
- Class locals must be initialized, for example `String text = new String();`
  or `Box box = null;`.
- `defer statement;` registers cleanup for normal scope exit, `return`,
  `break`, and `continue`.
- Blocks introduce scopes. Shadowing is not allowed: a name may not be
  redeclared in the same or an enclosing scope.
- There are no global variables.

### Literals

Integer literals:

```kix
0
42
0xFF
```

- Decimal and hexadecimal forms are supported.
- There are no binary or octal literals and no digit separators.
- A leading `-` is a unary operator, not part of the literal.

Float literals:

```kix
0.0
1.5
1e9
2.5e-3
```

String literals:

```kix
"hello"
"tab\tnewline\n"
"\x41"
```

- Strings must fit on one source line.
- Supported escapes: `\n`, `\r`, `\t`, `\0`, `\\`, `\'`, `\"`, and `\xNN`.
- Strings are UTF-8 encoded into bytes.
- String literals require `import kix.string;` and `import kix.vector;`.

Character literals:

```kix
'A'
'\n'
'\x7f'
```

- A character literal must encode exactly one byte at compile time.

Booleans and null:

```kix
true
false
null
```

`null` is assignable to class reference types and can be compared with `==`
and `!=`.

### Operators

Precedence, from highest to lowest:

1. unary `!`, unary `-`, unary `+`, task-done `&`
2. `*`, `/`, `%`
3. `+`, `-`
4. `<`, `<=`, `>`, `>=`
5. `==`, `!=`
6. `&&`
7. `||`
8. `?:`
9. `=`, `+=`, `-=`, `*=`, `/=`, `%=`

Notes:

- Arithmetic is defined for `int`, `float`, and `char`. `char` widens to
  `int`. If either operand is `float`, the result is `float`.
- Comparison and logical operators produce `bool`.
- Class references support `==` and `!=`, including comparisons with `null`.
- Comparisons, `&&`, and `||` are not defined for arrays.
- `&&` and `||` use C short-circuit evaluation.
- Assignment is right-associative and allows widening.
- Compound assignment is intended for numeric targets.
- Indexed assignment supports only `=`, not `+=` and friends.
- Arrays cannot be used with binary operators.
- Casts use `as`; type tests use `is`.
- Bitwise and shift operators are supported for integers.
- There are no `sizeof`, pointer operators, or `++`/`--` expressions.
- `&variable` checks whether a task-result variable has completed; see Tasks.

### Statements

Supported statements:

```kix
{
    int x = 1;
}

if (condition) {
    ...
} else if (other) {
    ...
} else {
    ...
}

while (condition) {
    ...
}

for (int i = 0; i < 10; i = i + 1) {
    ...
}

for (;;) {
    break;
}

defer io::println("leaving scope");

delete object;

throw new Exception(ExceptionKind.Io, -5, "read failed");

try {
    ...
} catch (error: Exception) {
    ...
} finally {
    ...
}

return value;
```

- `if`, `else`, `while`, `for`, blocks, and empty statements (`;`) are
  supported.
- A `for` loop may omit its initializer, condition, and update.
- The `for` update is an expression.
- `break` is valid inside loops and switch statements. `continue` is valid inside loops.
- Conditions must be `int` or `bool`.
- `defer` runs on normal scope exit, `return`, `break`, and `continue`. It does
  not run during exception unwinding; use `finally` for that.
- `delete` requires a class reference and runs its destructor once.
- `try` must have `catch`, `finally`, or both.
- Catch variables must be typed `Exception` from `kix.error.exceptions`.
- `finally` may not throw.
- `return`, `break`, and `continue` are allowed inside `try` and `catch`;
  `finally` runs on those transfers.
- Transfers out of `finally` are rejected.
- `switch` supports `case` and `default`.
- There is no `do`/`while` or `goto`.
- `static` is a reserved keyword but has no Kix v1 implementation.

### Expressions and calls

```kix
int value = add(1, 2);
io::println("hello");
file.close();
Point p = new Point(1, 2);
int first = values[0];
```

- `namespace::function(...)` calls module-level functions.
- `object.method(...)` calls instance methods.
- `new ClassName(...)` constructs a class value.
- `array[index]` reads or assigns an array element.
- `Enum.Variant` selects an enum variant.
- `condition ? thenExpr : elseExpr` requires compatible branches. Both
  branches may be `int`/`float`; other branch types must match exactly.
- A method receiver must be a variable or field. Chained calls on
  temporary results, such as `a.concat(b).concat(c)`, are rejected; assign the
  intermediate result to a variable first.
- Functions are not values; there are no function pointers, closures, or
  lambdas.
- Qualified names must be called; a bare `io::println` is not an expression.

### Arrays

```kix
int[4] fixed;
int[] dynamic = int[8];
String[] names = String[10];

fixed[0] = 7;
dynamic[3] = 9;
names[0] = "Ada";
```

- `T[size]` declares a fixed-size array. The size must be a positive integer
  literal.
- `T[]` declares a dynamically sized array.
- `T[capacity]` allocates a fresh zeroed dynamic array at run time. The
  capacity expression must be `int`.
- Fixed-size arrays support primitive and enum elements only.
- Dynamic arrays support primitive, enum, and class elements. `void` elements
  are rejected.
- Dynamic arrays have no language-level length member; `kix.vector.Vector<T>`
  tracks length and capacity.
- Array indices must be `int`.
- Array indexing is bounds-checked at run time.
- Arrays are not values that can be compared or combined with operators.
- Array indexing is bounds-checked.

### Tasks

Task declarations use `&`:

```kix
$wkc 3;

public &sumTo(limit: int): int {
    int total = 0;
    int i = 1;
    while (i <= limit) {
        total = total + i;
        i = i + 1;
    }
    return total;
}

public &2slowSquare(value: int): int {
    ...
}

public main(): int {
    int sum = sumTo(100);
    int square = slowSquare(12);

    while (!&sum) {
    }

    io::printf("%lld %lld\n", sum, square);
    return 0;
}
```

- `public &name(...)` submits calls to the shared general worker pool.
- `public &Nname(...)` creates a dedicated pool with exactly `N` workers for
  that task declaration.
- The general pool has `$wkc` workers (default 1); `KIX_WKC` overrides the
  default at run time.
- A task call starts immediately and does not block.
- `await expr` is accepted and forces the same task-result wait semantics as reading a task variable.
- When a task call initializes a variable, the variable stores a future. The
  first read of that variable waits for the task and yields its result.
- `&variable` reports whether a task result is done, without waiting.
- A task call used as a statement is fire-and-forget. The runtime waits for all
  pending tasks before the process exits, but does not join worker threads.
- Task calls used as subexpressions wait immediately.
- Task methods are supported; the receiver is copied into the task payload.
- Parameters, receiver values, and results are copied by value. Class values
  are shallow copies.
- Task declarations cannot be variadic, and `main` and constructors cannot be
  tasks.
- A task cannot assign to its own result variable; task-result variables are
  read-only.
- Dedicated worker counts must be at least 1.

### `syscall`

The only built-in function is:

```kix
syscall(number: int, ...): int
```

- It performs a real Linux x86_64 syscall.
- It accepts at most six arguments after the syscall number.
- The compiler pads unused argument slots with zero.
- Array arguments pass a pointer to their data buffer.
- `float` arguments are truncated to `int`.
- Class values cannot be passed directly.
- Syscall numbers live in `modules/kix/syscalls.kix`.

### Comments

```kix
// line comment

/* block comment */
```

Block comments cannot nest. An unterminated block comment is an error.


## Structs

Structs are value types with fields and methods.

```kix
public struct Point implements Named {
    public x: int;
    public y: int;

    public sum(): int {
        return self.x + self.y;
    }
}

Point point = Point { x: 3, y: 4 };
```

- Structs copy by value.
- Struct literals use named fields; omitted fields are zero-initialized.
- Structs may have methods and implement interfaces.
- Structs may contain managed references; copies are shallow for managed fields.
- Structs cannot be abstract, extend another type, or declare destructors.
- Converting a struct to an interface boxes a copy.

## Interfaces

```kix
public interface Named {
    name(): String;
}

public class Person implements Named {
    public name(): String { return "person"; }
}
```

- Interfaces contain method signatures only.
- Classes and structs can implement multiple interfaces.
- Interface values are GC-managed wrappers around an object and a vtable.
- Class-to-interface conversion does not copy the class object.
- Struct-to-interface conversion boxes a copy.
- Interface methods dispatch dynamically.
- Interface values are nullable; method calls on null panic.

## Inheritance and abstract classes

```kix
public abstract class Base {
    protected label: String;

    public Base(label: String) {
        self.label = label;
    }

    public abstract kind(): String;
}

public class Child extends Base {
    public Child(label: String) {
        super(label);
    }

    public kind(): String { return "child"; }
}
```

- Single inheritance only.
- Inheritance chains can be multiple levels deep.
- `protected` members are accessible in subclasses.
- Abstract classes cannot be instantiated.
- Abstract methods have no body and must be implemented by concrete subclasses.
- Instance methods are virtual and dispatch through class vtables.
- Constructors call a parent constructor with `super(...)`.
- Fields from parent classes are embedded at offset zero in child objects.
- Overrides cannot reduce visibility or change the return type.
- Destructors are inherited; child destructors run before parent destructors.

## Switch statements

```kix
switch (value) {
    case 1:
        io::println("one");
        break;
    case 2:
        io::println("two");
        break;
    default:
        io::println("other");
}
```

- Supports `int`, `char`, `bool`, and enum switch values.
- `case` and `default` are supported.
- `break` exits the switch.
- `continue` inside a switch inside a loop targets the loop.
- Cases currently use C-style fallthrough when `break` is omitted.

## Bitwise and shift operators

Supported: `&`, `|`, `^`, `~`, `<<`, `>>`.

They operate on integer/char values and produce `int`.

## Casts and type tests

```kix
int i = 65;
char c = i as char;
float f = i as float;

if (value is Child) {
    Child child = value as Child;
}
```

- Primitive casts use `as`.
- Class and interface downcasts use `as` and panic on failure.
- `is` reports whether a class/interface value has a target type.
- Struct casts are restricted to identical struct types.

## Immutable bindings

```kix
let a: int = 1;      // immutable
const b: int = 2;    // immutable
var c: int = 3;      // mutable
int d = 4;           // mutable
```

- `let` and `const` bindings cannot be reassigned.
- Assigning through a field or index of an immutable binding is rejected.
- Immutable bindings must be initialized.

## Multi-level imports and packages

```kix
import kix.error.exceptions;
import app.models.user;
import app.util;
```

Resolution supports nested files:

```text
kix.error.exceptions -> kix/error/exceptions.kix
app.util              -> app/util.kix
```

Packages use a top-level `<package>.kix` entry file and may place public or
internal submodules in `<package>/`. There is no `index.kix` convention.

## Exceptions vs errors

`Error` is the throwable base class. `Exception` extends `Error` and is the
standard recoverable exception. User classes may extend either type.

```kix
public class ValidationException extends Exception {
    public ValidationException(message: String) {
        super(ExceptionKind.InvalidArgument, -22, message);
    }
}

public parse(value: int): int throws ValidationException {
    if (value < 0) {
        throw new ValidationException("negative");
    }
    return value * 2;
}
```

- `throws Exception` means the declaration may throw `Exception` or any subclass.
- `throws ValidationException` restricts it to that subtype and its subclasses.
- `catch (e: Exception)` catches subclasses.
- `catch (e: ValidationException)` catches only matching subtypes; other exceptions propagate.
- Fatal runtime failures use `panic`/`assert` from `kix.error.fatal` and are not catchable.

## Memory model (Kix v1)

- Primitive, enum, and fixed-array values are stored inline and copied by
  value.
- Classes, `String`, `Vector<T>`, and dynamic arrays are GC-managed reference
  types. Assignment copies the reference.
- Dynamic arrays are represented as `{ data, managed }`. Managed buffers carry
  a GC header with a generated type descriptor.
- The collector is a non-moving mark-sweep collector. It uses precise roots for
  parameters, locals, temporaries that survive safepoints, and the active
  thrown exception.
- Collection happens at statement boundaries and loop back edges. Expressions
  that contain managed temporaries pause collection until the statement
  completes.
- Class destructors are invoked by `delete` or by the finalizer queue for
  unreachable objects. Finalized objects are reclaimed on a later cycle.
- Shutdown waits for tasks, processes unreachable finalizers, and returns.
- `KIX_GC_STRESS=1` collects at every safepoint. `KIX_GC_LOG=1` prints live
  bytes after each collection. `KIX_GC_THRESHOLD` sets the collection
  threshold.
- Collection pauses while tasks are pending. Task results and unobserved task
  exceptions are GC-rooted through the task list.
- Task payloads are copied and their managed references are not scanned, but
  collection cannot run while tasks are active.
- Array indexing is bounds-checked; out-of-bounds access aborts.

## Error handling (Kix v1)

- Compile-time errors are reported as `file:line:column` diagnostics by
  `kixt`, with optional hints.
- Exceptions are checked. A declaration that may throw ends with `throws Type`.
- `Error` is the throwable base class; `Exception` extends `Error`.
- `throw` requires a subtype of `kix.error.exceptions.Error`.
- `try/catch/finally` catches throwable values.
- `finally` cannot throw and must not contain `return`, `break`, or `continue`.
- `return`, `break`, and `continue` are allowed inside `try` and `catch`.
  Finally runs on those transfers. Transfers inside `finally` are rejected.
- Defers run on normal scope exit and `return`, but not during exception
  unwinding.
- An exception thrown inside a `catch` block currently skips that try's
  `finally` block.
- Exceptions unwinding through a called function do not run that function's
  defers; only `finally` blocks in the catching path run.
- A throwing `catch` body still skips its own `finally`.
- `kix.fs` high-level functions throw; low-level `File`/`Dir` methods still use
  boolean/int results with `error()`.
- `kix.io::readLine` throws, but the console print functions still ignore write errors.
- The task runtime and worker-pool allocation paths call `exit(1)` on fatal
  failures.

## Module resolution details

For `import kix.io;`, the loader checks:

1. `<importing-file-dir>/kix/io.kix`
2. `<project>/modules/kix/io.kix`
3. `<compiler>/modules/kix/io.kix`

The first existing file wins. This lets a project vendor or override official
modules without changing the compiler.

## C naming and interop

Generated C names are deterministic:

- Official modules use a `mod_<module-path>` prefix, for example
  `mod_kix_io_println`.
- User modules use a `u_<filename>` prefix.
- Namespaces and class names are included in mangled symbols.
- Identifiers that collide with C keywords or reserved runtime names are
  escaped.
- Distinct Kix symbols that would produce the same C identifier are rejected.

Kix v1 has no general FFI. The only runtime bridge is `io::printf`; everything
else is either ordinary Kix or the fixed `syscall` intrinsic.

## Extending the compiler

- **Add a primitive:** add one entry to `PRIMITIVE_DEFS` in
  `src/compiler/core-types.ts`, plus its C typedef in
  `src/runtime/prelude.ts`. The lexer keyword set, type parser, C type mapping,
  defaults, and widening rules derive from that table.
- **Add an ordinary builtin:** add one entry to `BUILTIN_FUNCTIONS` in
  `src/compiler/builtins.ts`, plus its C implementation/declaration in
  `src/runtime/prelude.ts`. No symbol-table or parser changes are needed.
- **Add a special lowering:** set `intrinsic` on the builtin and handle that
  tag in `codegen.ts` (as `syscall` does).
- **Add a standard module:** create `modules/kix/<name>.kix`; it is then
  available with `import kix.<name>;`. A project can override it with
  `<project>/modules/kix/<name>.kix`.

See [docs/runtime-primitives.md](docs/runtime-primitives.md) for the current
runtime bridge surface.

## Tests

```bash
bun test
bun run typecheck
```

The integration tests build and execute real binaries. They cover module
resolution, classes, constructors, overloads, enums, generics, fixed and
dynamic arrays, `kix.fs` files, directories, metadata, symlinks, `readLine`,
task pools, task methods, fire-and-forget tasks, GC stress, destructors, and
checked exceptions.
