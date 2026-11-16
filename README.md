# Kix / kixt

Kix is a Linux-first systems and backend language that transpiles to a single
C11 translation unit.

The `kixt` compiler is distributed as a standalone executable. Published
binaries do **not** require Bun at runtime.

- [Language reference](docs/language.md)
- [Standard library](docs/stdlib.md)
- [CLI reference](docs/cli.md)
- [Targets](docs/targets.md)

## Install

### From a packaged release

```bash
tar xf kix-<version>-linux-x86_64.tar.gz
cd kix-<version>-linux-x86_64
sudo make install
kixt version
```

### Requirements

To compile Kix programs you need:

- Linux on x86_64, aarch64, or riscv64
- a C11 compiler: `cc`, `gcc`, or `clang`

Optional library dependencies:

- `gzip` and `openssl` for `kix.compress`
- `openssl` for `kix.net.tls`

Building the compiler itself requires Bun. Installation from a packaged
distribution only needs `make`.

### Install from source

```bash
bun install
bun run pack
cd dist
sudo make install
kixt version
```

Default install locations:

```text
/usr/local/bin/kixt
/usr/local/lib/kix/modules
/usr/local/share/doc/kix
/usr/local/share/licenses/kix/LICENSE
```

Use a different prefix or staging directory:

```bash
make install PREFIX=/opt/kix
make install DESTDIR=/tmp/stage
```

Uninstall:

```bash
sudo make uninstall
```

## Quick start

```bash
kixt new hello
cd hello
kixt run
```

Output:

```text
Hello from Kix!
```

### HTTP server template

```bash
kixt new server --template http-server
cd server
kixt run
```

`kixt new` also supports:

- `--template minimal`
- `--template cli`
- `--template http-server`

## CLI

```text
kixt build [dir] [options]
kixt run [dir] [options] [-- args...]
kixt check [dir]
kixt new <name> [--template minimal|cli|http-server]
kixt init [dir]
kixt clean [dir] [--all]
kixt doctor [dir]
kixt info [dir]
kixt targets
kixt version
kixt help [command]
```

Common options:

- `--target linux-x86_64|linux-aarch64|linux-riscv64`
- `--cc <path>`
- `--c-file <path>`
- `--debug`
- `--quiet`, `-q`
- `--verbose`
- `--json`
- `--no-color`

See [docs/cli.md](docs/cli.md) for details.

## Project configuration

A project directory contains `kix.json`:

```json
{
  "name": "my-app",
  "entry": "src/main.kix",
  "output": "bin/app",
  "target": "linux-x86_64"
}
```

`target` and `cc` are optional.

## Language overview

Kix currently includes:

- classes, structs, interfaces, single inheritance
- abstract classes and methods
- `protected` members
- checked exceptions with typed `throws`
- custom throwable subclasses
- tasks (`&name`, `&Nname`) with the task system
- GC, destructors, `delete`
- fixed and dynamic arrays with bounds checks
- switch statements
- bitwise and shift operators
- casts (`as`) and type tests (`is`)
- immutable `let`/`const` bindings
- nested namespaces
- multi-level imports
- explicit `await`

Full syntax and semantics: [docs/language.md](docs/language.md).

## Module lookup

Imports are resolved in this order:

1. the importing file's directory
2. `<project>/modules`
3. executable-relative installed modules:
   - `<exe-dir>/modules`
   - `<exe-dir>/../lib/kix/modules`
4. global modules:
   - `/usr/local/lib/kix/modules`
   - `/usr/lib/kix/modules`
   - `/opt/kix/modules`

Overrides:

```bash
KIX_MODULES_DIR=/path/to/modules kixt build .
KIX_GLOBAL_MODULES=/path/to/modules kixt build .
```

`kixt new` creates a `modules/kix` symlink to the active bundled modules
directory.

## Targets

```bash
kixt targets
kixt build . --target linux-aarch64 --cc aarch64-linux-gnu-gcc
```

See [docs/targets.md](docs/targets.md).

## Documentation

- [Language reference](docs/language.md)
- [Standard library index](docs/stdlib.md)
  - [I/O, files, and streams](docs/stdlib/io-fs.md)
  - [Collections](docs/stdlib/collections.md)
  - [Utilities](docs/stdlib/util.md)
  - [Data and serialization](docs/stdlib/data.md)
  - [Security](docs/stdlib/security.md)
  - [Archives](docs/stdlib/archive.md)
  - [Networking and HTTP](docs/stdlib/net.md)
  - [System](docs/stdlib/system.md)
  - [Tooling](docs/stdlib/tooling.md)
  - [Syscalls](docs/stdlib/syscalls.md)
- [CLI](docs/cli.md)
- [Targets](docs/targets.md)
- [Runtime primitives](docs/runtime-primitives.md)

## Development

Development requires Bun.

```bash
bun install
bun run kixt build examples/hello
bun test
bun run typecheck
bun run pack
```

Project layout:

```text
kix/
├── src/compiler/       # lexer, parser, checker, codegen
├── src/runtime/        # C runtime prelude
├── src/cli/            # compiler CLI
├── scripts/pack.ts     # standalone packaging
├── modules/kix/        # official modules
├── examples/           # runnable examples
├── docs/               # language, stdlib, CLI, target docs
├── test/               # compiler, CLI, runtime, library tests
├── Makefile            # installer template copied into dist
├── scripts/pack.ts     # packaging
├── scripts/install.sh  # installer
└── LICENSE             # GPLv3
```

## Packaging

```bash
bun run pack
```

Creates:

```text
dist/
├── kixt
├── modules/
├── docs/
├── scripts/install.sh
├── Makefile
├── LICENSE
└── README.md
```

`dist/` is gitignored. The packaged binary finds modules relative to its own
location, so installation works without Bun. The copied `Makefile` is
self-contained: running `make install` inside `dist/` installs the packaged
files directly and does not require Bun or the source tree.

## License

Kix is released under the GNU General Public License version 3 only. See
[LICENSE](LICENSE).
