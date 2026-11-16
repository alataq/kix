# Syscalls

`kix.syscalls` contains raw Linux syscall wrappers. They return the kernel result
directly: non-negative values on success and negative errno values on failure.

Target-specific files:

```text
modules/kix/syscalls/linux_x86_64.kix
modules/kix/syscalls/linux_aarch64.kix
modules/kix/syscalls/linux_riscv64.kix
```

`import kix.syscalls;` selects the correct file for the build target.

## ABI notes

- x86_64: `rax` syscall number, arguments in `rdi`, `rsi`, `rdx`, `r10`, `r8`, `r9`
- aarch64: `x8` syscall number, arguments in `x0`..`x5`, `svc 0`
- riscv64: `a7` syscall number, arguments in `a0`..`a5`, `ecall`
- Buffers are passed as `String`; the wrapper passes the backing buffer address.
- Raw struct-writing calls (`statx`, `fstat`, `uname`, `getdents64`) expect a
  sufficiently large buffer. Use `Bytes` or the higher-level `kix.fs`, `kix.os`,
  or `kix.net` APIs.
- aarch64/riscv64 use the Linux asm-generic table and translate path-based calls
  to `openat`, `mkdirat`, `renameat`, `unlinkat`, `readlinkat`, `fchmodat`,
  `fchownat`, and related variants.

## File descriptors and files

| Function | Signature |
| --- | --- |
| `read` | `read(fd: int, buffer: String, count: int): int` |
| `write` | `write(fd: int, buffer: String, count: int): int` |
| `open` | `open(path: String, flags: int, mode: int): int` |
| `close` | `close(fd: int): int` |
| `fstat` | `fstat(fd: int, buffer: String): int` |
| `lseek` | `lseek(fd: int, offset: int, whence: int): int` |
| `access` | `access(path: String, mode: int): int` |
| `dup` | `dup(fd: int): int` |
| `dup2` | `dup2(oldFd: int, newFd: int): int` |
| `fcntl` | `fcntl(fd: int, command: int, argument: int): int` |
| `fsync` | `fsync(fd: int): int` |
| `fdatasync` | `fdatasync(fd: int): int` |
| `truncate` | `truncate(path: String, length: int): int` |
| `ftruncate` | `ftruncate(fd: int, length: int): int` |
| `getdents64` | `getdents64(fd: int, buffer: String, count: int): int` |
| `statx` | `statx(fd: int, path: String, flags: int, mask: int, buffer: String): int` |
| `memfdCreate` | `memfdCreate(name: String, flags: int): int` |

## Process and identity

| Function | Signature |
| --- | --- |
| `getpid` | `getpid(): int` |
| `getppid` | `getppid(): int` |
| `fork` | `fork(): int` |
| `exit` | `exit(status: int): void` |
| `exitGroup` | `exitGroup(status: int): void` |
| `kill` | `kill(pid: int, signal: int): int` |
| `uname` | `uname(buffer: String): int` |
| `getuid` | `getuid(): int` |
| `getgid` | `getgid(): int` |
| `geteuid` | `geteuid(): int` |
| `getegid` | `getegid(): int` |
| `setuid` | `setuid(uid: int): int` |
| `setgid` | `setgid(gid: int): int` |
| `setsid` | `setsid(): int` |

## Directories and links

| Function | Signature |
| --- | --- |
| `getcwd` | `getcwd(buffer: String, size: int): int` |
| `chdir` | `chdir(path: String): int` |
| `rename` | `rename(oldPath: String, newPath: String): int` |
| `mkdir` | `mkdir(path: String, mode: int): int` |
| `rmdir` | `rmdir(path: String): int` |
| `creat` | `creat(path: String, mode: int): int` |
| `link` | `link(oldPath: String, newPath: String): int` |
| `unlink` | `unlink(path: String): int` |
| `symlink` | `symlink(target: String, linkPath: String): int` |
| `readlink` | `readlink(path: String, buffer: String, size: int): int` |
| `chmod` | `chmod(path: String, mode: int): int` |
| `fchmod` | `fchmod(fd: int, mode: int): int` |
| `chown` | `chown(path: String, owner: int, group: int): int` |
| `fchown` | `fchown(fd: int, owner: int, group: int): int` |
| `lchown` | `lchown(path: String, owner: int, group: int): int` |
| `umask` | `umask(mask: int): int` |

## Sockets

| Function | Signature |
| --- | --- |
| `socket` | `socket(domain: int, kind: int, protocol: int): int` |
| `connect` | `connect(fd: int, address: String, length: int): int` |
| `accept` | `accept(fd: int, address: String, length: String): int` |
| `bind` | `bind(fd: int, address: String, length: int): int` |
| `listen` | `listen(fd: int, backlog: int): int` |
| `getsockname` | `getsockname(fd: int, address: String, length: String): int` |
| `getpeername` | `getpeername(fd: int, address: String, length: String): int` |
| `setsockopt` | `setsockopt(fd: int, level: int, name: int, value: String, length: int): int` |
| `getsockopt` | `getsockopt(fd: int, level: int, name: int, value: String, length: String): int` |
| `shutdown` | `shutdown(fd: int, how: int): int` |
| `sendto` | `sendto(fd: int, buffer: String, count: int, flags: int, address: String, length: int): int` |
| `recvfrom` | `recvfrom(fd: int, buffer: String, count: int, flags: int, address: String, length: String): int` |

## Polling and time

| Function | Signature |
| --- | --- |
| `epollCreate1` | `epollCreate1(flags: int): int` |
| `epollCtl` | `epollCtl(epfd: int, op: int, fd: int, event: String): int` |
| `epollWait` | `epollWait(epfd: int, events: String, maxEvents: int, timeout: int): int` |
| `nanosleep` | `nanosleep(request: String, remaining: String): int` |
| `gettimeofday` | `gettimeofday(time: String, timezone: String): int` |

## Randomness

| Function | Signature |
| --- | --- |
| `getrandom` | `getrandom(buffer: String, length: int, flags: int): int` |

For portable use, prefer:

- `kix.fs` for files and directories
- `kix.util.time` for clocks and sleeping
- `kix.util.random` for random bytes
- `kix.net` for sockets
- `kix.net.poll` for epoll
- `kix.os` for platform information
