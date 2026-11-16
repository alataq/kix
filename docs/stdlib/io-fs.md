# I/O, files, and streams

## `kix.io`

Namespace: `io`

- `print(message: String): void`
- `println(message: String): void`
- `printErr(message: String): void`
- `printlnErr(message: String): void`
- `printf(format: String, ...): int`
- `readLine(): String throws Exception`

`printf` maps to C `printf`. Kix `int` is 64-bit; use `%lld`. Strings use `%s`.

```kix
import kix.io;

io::printf("value=%lld\n", 42);
```

## `kix.fs`

Namespace: `fs`

High-level functions throw `Exception` on failure. Low-level `File` and `Dir`
methods return booleans/ints and expose `error()`.

### `FileKind`

`Unknown`, `Fifo`, `Character`, `Directory`, `Block`, `File`, `Symlink`, `Socket`.

### `Stat`

- `new Stat()`
- `new Stat(path: String)`
- `new Stat(path: String, flags: int)`
- `error(): int`, `errorText(): String`
- `kind(): FileKind`
- `isFile()`, `isDirectory()`, `isSymlink()`, `isFifo()`, `isSocket()`,
  `isBlockDevice()`, `isCharacterDevice(): bool`
- `permissions(): int`
- `size(): int`
- `uid(): int`, `gid(): int`, `links(): int`, `ino(): int`
- `modified(): int`, `modifiedNsec(): int`

### `File`

- `new File()`, `new File(path: String, mode: String)`
- `open(path: String, mode: String): bool`
- Modes: `r`, `w`, `a`, `r+`, `w+`, `a+`, `wx`
- `read(count: int): String`
- `readAll(): String`
- `write(data: String): int`
- `writeAll(data: String): bool`
- `seek(offset: int, whence: int): int`
- `tell(): int`, `size(): int`
- `truncate(length: int): int`
- `sync(): int`
- `close(): void`, `isOpen(): bool`
- `error(): int`, `errorText(): String`, `path(): String`
- Destructor closes the descriptor.

### `Dir`

- `new Dir()`, `new Dir(path: String)`
- `open(path: String): bool`
- `next(): String`
- `entries(): Vector<String>`
- `close(): void`, `isOpen(): bool`
- `error(): int`, `errorText(): String`, `path(): String`
- Destructor closes the directory handle.

### Module functions

- `exists(path): bool`
- `kind(path): FileKind`
- `isFile(path)`, `isDirectory(path)`, `isSymlink(path): bool`
- `stat(path): Stat throws Exception`
- `lstat(path): Stat throws Exception`
- `fileSize(path): int throws Exception`
- `list(path): Vector<String> throws Exception`
- `readFile(path): String throws Exception`
- `writeFile(path, data): void throws Exception`
- `appendFile(path, data): void throws Exception`
- `mkdir(path)`, `mkdir(path, permissions): void throws Exception`
- `mkdirAll(path)`, `mkdirAll(path, permissions): void throws Exception`
- `remove(path)`, `removeDir(path)`, `removeAll(path): void throws Exception`
- `rename(oldPath, newPath): void throws Exception`
- `copyFile(sourcePath, targetPath): void throws Exception`
- `createSymlink(target, linkPath): void throws Exception`
- `readSymlink(path): String throws Exception`
- `createLink(oldPath, newPath): void throws Exception`
- `chmod(path, permissions): void throws Exception`
- `chown(path, owner, group): void throws Exception`
- `truncate(path, length): void throws Exception`
- `currentDir(): String throws Exception`
- `changeDir(path): void throws Exception`
- `tempDir(): String`
- `join(base, child): String`
- `isAbsolute(path)`, `isRelative(path): bool`
- `basename(path)`, `dirname(path): String`

## `kix.stream`

Interfaces:

- `Reader` — `read(count: int): String`
- `Writer` — `write(data: String): void`
- `Closer` — `close(): void`

## `kix.bufio`

- `StringReader implements Reader`
  - `new StringReader(data: String)`
  - `read(count: int): String`
  - `eof(): bool`
- `StringWriter implements Writer`
  - `new StringWriter()`
  - `write(data: String): void`
  - `toString(): String`
  - `length(): int`
- `BufferedReader`
  - `new BufferedReader(source: Reader)`
  - `read(count: int): String`
  - `readLine(): String`
  - `readAll(): String`
  - `eof(): bool`
- `BufferedWriter`
  - `new BufferedWriter(target: Writer)`
  - `write(data: String): void`
  - `flush(): void`
  - `close(): void`
