# System libraries

## `kix.os`

- `platform(): String throws Exception`
- `hostname(): String throws Exception`
- `kernelRelease(): String throws Exception`
- `machine(): String throws Exception`
- `currentDirectory(): String throws Exception`

Unix `uname` data is parsed from a 390-byte utsname buffer.

## `kix.process`

- `pid(): int`
- `parentPid(): int`
- `exit(status: int): void`
- `abort(): void`
- `kill(pid: int, signal: int): int`
- `run(command: String): int`
- `sleepMillis(milliseconds: int): void throws Exception`

`run` executes a shell command and returns the process status. It inherits
stdio.

## `kix.sync`

### `Mutex`

- `new Mutex()`
- `lock(): void`
- `unlock(): void`
- `raw(): int`
- `close(): void`
- Destructor closes the native mutex.

### `Condvar`

- `new Condvar()`
- `wait(mutex: Mutex): void`
- `signal(): void`
- `broadcast(): void`
- `close(): void`
- Destructor closes the native condition variable.

## `kix.compress`

Gzip/zlib compression via external CLI tools.

- `gzipCompress(data: String): String throws Exception`
- `gzipDecompress(data: String): String throws Exception`
- `zlibCompress(data: String): String throws Exception`
- `zlibDecompress(data: String): String throws Exception`

Requires `gzip` and `openssl` on `PATH`. Data is passed through temporary files.
