# Kix standard library

Language reference: [language.md](language.md).

## Module conventions

- Libraries live under `modules/kix/`.
- A package entry is `modules/kix/<package>.kix`.
- Nested modules live under `modules/kix/<package>/<module>.kix`.
- There is no `index.kix` convention.
- Import paths mirror the file paths: `import kix.net.http;`, `import kix.util.text;`.
- Namespaces match the package/module path without the `kix.` prefix.
- Import aliases default to the last path component.
- `internal/` modules are implementation details and are not stable API.

## Library index

- [I/O, files, and streams](stdlib/io-fs.md) — `kix.io`, `kix.fs`, `kix.stream`, `kix.bufio`
- [Collections](stdlib/collections.md) — `kix.vector`, `kix.collections`
- [Utilities](stdlib/util.md) — path, text, bytes, encoding, unicode, math, random, time, uuid, tmp
- [Data and serialization](stdlib/data.md) — serde, JSON, CSV, TOML, XML, YAML, config
- [Security](stdlib/security.md) — CRC32/FNV/SHA-256/HMAC, secure random
- [Archives](stdlib/archive.md) — USTAR tar, tar.gz, ZIP
- [Networking and HTTP](stdlib/net.md) — TCP, UDP, DNS, epoll, URL, MIME, HTTP, TLS client
- [System](stdlib/system.md) — os, process, sync, compress
- [Tooling](stdlib/tooling.md) — CLI, logging, testing, terminal, glob
- [Syscalls](stdlib/syscalls.md) — raw Linux x86_64 wrappers

## Error conventions

High-level libraries throw `kix.error.exceptions.Exception`.

- `throws Exception` means the declaration may throw the base exception or a subclass.
- `throws SpecificException` restricts the declared exception type.
- `catch (e: Exception)` catches subclasses.
- `panic`/`assert` from `kix.error.fatal` are fatal and not catchable.

## Stability

Stable API is documented in the pages above. Undocumented functions, private
members, and `internal/` modules may change between minor releases.

Current platform target: Linux
