# Targets and portability

## Current targets

Kix currently emits C for:

- `linux-x86_64`
- `linux-aarch64`
- `linux-riscv64`

The default target is the host architecture when supported.

## Selecting a target

CLI:

```bash
kixt build . --target linux-aarch64
kixt build . --target linux-riscv64
```

`kix.json`:

```json
{
  "name": "server",
  "entry": "src/main.kix",
  "output": "bin/server",
  "target": "linux-aarch64"
}
```

`--target` overrides `kix.json`.

## Target-specific modules

`import kix.syscalls;` resolves to:

```text
modules/kix/syscalls/linux_x86_64.kix
modules/kix/syscalls/linux_aarch64.kix
modules/kix/syscalls/linux_riscv64.kix
```

The generic `modules/kix/syscalls.kix` remains as a fallback/compatibility file.

## Syscall ABI

The runtime prelude contains architecture-specific `kix_syscall` entries:

- x86_64: `rax` + `syscall`, arguments in `rdi`, `rsi`, `rdx`, `r10`, `r8`, `r9`
- aarch64: `x8` + `svc 0`, arguments in `x0`..`x5`
- riscv64: `a7` + `ecall`, arguments in `a0`..`a5`

Syscall numbers live in the target-specific modules. The aarch64/riscv64
backends use the Linux asm-generic syscall table, including `openat`,
`mkdirat`, `renameat`, `unlinkat`, `readlinkat`, and related variants.

## Installed module lookup

Installed `kixt` binaries locate modules relative to the executable, then fall
back to global module directories such as `/usr/local/lib/kix/modules`.
`KIX_MODULES_DIR` and `KIX_GLOBAL_MODULES` override the search.

## Cross compilation

For non-host targets, pass a cross C compiler:

```bash
kixt build . --target linux-aarch64 --cc aarch64-linux-gnu-gcc
```

The compiler emits target-correct C and selects target-correct Kix modules, but
linking requires a toolchain for the destination architecture.

## Unix portability plan

Linux Unix domain sockets are available through `kix.net.unix`.

The current syscall backends are Linux-specific. Portable Unix support will add:

- a `kix.os.unix` layer for POSIX behavior
- platform backends for Darwin, FreeBSD, and other Unix systems
- libc-backed wrappers where raw syscalls are not stable ABI
- platform-specific socket, stat, signal, process, and terminal layouts
- CI coverage on Linux x86_64/aarch64/riscv64 and Unix hosts

Windows is not part of the current target plan.
