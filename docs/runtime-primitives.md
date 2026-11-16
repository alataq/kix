# Runtime surface

The Kix standard library is ordinary Kix under `modules/kix/`. The compiler
does not expose any double-underscore intrinsic names.

## Language features used by the standard library

| Feature | Purpose |
| --- | --- |
| `T[]` / `T[capacity]` | declare and allocate managed dynamic backing arrays |
| class references | GC-managed objects with null checks |
| destructors / `delete` | deterministic and GC-driven finalization |
| `throws Exception` / `try` / `catch` / `finally` | checked exception propagation |
| `syscall(number, ...)` | perform a real Linux x86_64 syscall |
| overloads | functions, methods, and constructors resolve by argument type |
| class constructors | initialize values; invoked with `new` |
| `main(argc, argv)` | optional program arguments exposed as `String[]` |
| generic classes | define reusable typed containers such as `Vector<T>` |

`Vector<T>` is implemented directly in Kix: it allocates a fresh `T[next]`
managed array, copies old elements, and assigns it to `data: T[]`. `String`
wraps `Vector<char>`. Constructor overloads are resolved by argument count and
assignability, preferring exact type matches over widening conversions.

## Container storage

`String`, `Vector<T>`, class instances, and dynamic arrays are GC-managed.
Dynamic array structs are `{ data, managed, length }`; managed buffers carry a GC
header with a generated type descriptor. The collector is a non-moving
mark-sweep collector with precise roots for parameters, locals, and
safepoint-live temporaries.

`String` literals use immutable static byte storage and are copied into managed
memory by the `String(char[])` constructor.

Class objects may declare `public ~ClassName()`. `delete` runs the destructor
once; the GC finalizer queue runs destructors for unreachable finalizable
objects. `KIX_GC_STRESS`, `KIX_GC_LOG`, and `KIX_GC_THRESHOLD` control collector
diagnostics. Array indexing is bounds-checked through `kix_bounds_check`.

`kix.compress` and `kix.net.tls` use external CLI tools (`gzip`, `openssl`)
rather than C bridge libraries.

Exceptions use a thread-local `KixTryFrame` with `setjmp`/`longjmp`, a precise
root-stack snapshot, and a thread-local `Exception` root. `finally` blocks cannot
throw. Defers run on normal scope exits and `return`; they do not run during
exception unwinding.

Task results and unobserved task exceptions are GC-rooted through the task
list. A worker catches task exceptions and the awaiting thread rethrows them
from `kix_task_wait`. Fire-and-forget task failures make the generated main
wrapper return nonzero.

High-level `kix.fs` functions throw `kix.error.exceptions.Exception`. Low-level `File` and
`Dir` methods still return booleans/ints and expose `error()`; both types have
destructors that close their handles.

## Syscall

Kix v1 targets Linux x86_64 only; the prelude rejects other targets with
`#error`.

`kix.io` calls `syscalls::read` / `syscalls::write`, which wrap the language's
`syscall(number, ...)` intrinsic with Linux x86_64 numbers. `kix.fs` implements
`File`, `Dir`, and `Stat` directly in Kix on top of `syscalls::open`,
`syscalls::read`, `syscalls::write`, `syscalls::close`, `syscalls::lseek`,
`syscalls::statx`, and `syscalls::getdents64`, eliminating the need for any C
`FILE*` bridge functions. Directory entries are parsed from raw
`linux_dirent64` records in a `String` buffer.
