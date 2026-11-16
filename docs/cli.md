# `kixt` CLI

```bash
kixt <command> [options]
kixt help <command>
kixt <command> --help
```

## Commands

### `kixt new`

```bash
kixt new <name> [--template minimal|cli|http-server] [--force]
```

Creates a project directory with:

- `kix.json`
- `src/main.kix`
- `modules/kix` symlink
- `.gitignore`
- `README.md`

Templates:

- `minimal` — hello world
- `cli` — argument parsing with `kix.tooling.cli`
- `http-server` — basic `kix.net.http` server

### `kixt init`

```bash
kixt init [dir] [--name <name>] [--template minimal|cli|http-server] [--force]
```

Initializes the current or specified directory. Refuses to overwrite an
existing `kix.json` unless `--force` is passed.

### `kixt build`

```bash
kixt build [dir] [options]
```

Options:

- `--target <name>` — `linux-x86_64`, `linux-aarch64`, `linux-riscv64`
- `--cc <path>` — C compiler
- `--c-file <path>` — intermediate C file path
- `--debug` — `-O0 -g`
- `--release` — `-O2` (default)
- `--run` — run after building
- `--quiet`, `-q`
- `--verbose`
- `--json`
- `--no-color`

### `kixt run`

```bash
kixt run [dir] [options] [-- program-args...]
```

Builds and runs a project. Program arguments after `--` are forwarded. The
child exit code is returned.

### `kixt check`

```bash
kixt check [dir] [options]
```

Loads, type-checks, and generates C without invoking the C compiler.

### `kixt clean`

```bash
kixt clean [dir] [--all]
```

Removes `.kix-build`. `--all` also removes the configured output binary.

### `kixt doctor`

```bash
kixt doctor [dir]
```

Checks Bun, the C compiler, bundled modules, host target, optional `gzip` and
`openssl`, and the project config if present.

### `kixt info`

```bash
kixt info [dir]
```

Shows resolved project root, config, entry, output, target, compiler, and module
search paths.

### `kixt targets`

```bash
kixt targets
```

Lists supported targets, marks the host target, and reports detected compilers.

### `kixt version`

```bash
kixt version
```

## Packaging and installation

```bash
bun run pack
cd dist
sudo make install
```

`bun run pack` creates a standalone `dist/kixt` for the current architecture and
copies `modules/`, `docs/`, `LICENSE`, and `README.md` into `dist/`.

`make install` installs:

```text
/usr/local/bin/kixt
/usr/local/lib/kix/modules
/usr/local/share/doc/kix
/usr/local/share/licenses/kix/LICENSE
```

Use `PREFIX` or `DESTDIR` to relocate:

```bash
cd dist
make install PREFIX=/opt/kix
make install DESTDIR=/tmp/stage
```

The packaged `dist/` directory includes its own `Makefile` and
`scripts/install.sh`, so it can be installed without the compiler source tree or
Bun:

```bash
cd dist
sudo make install
```

`make uninstall` removes installed files. `dist/` is gitignored.

## Module lookup

Installed binaries search, in order:

1. `KIX_MODULES_DIR`
2. `KIX_GLOBAL_MODULES`
3. source checkout `<repo>/modules` during development
4. `<exe-dir>/modules`
5. `<exe-dir>/../lib/kix/modules`
6. `/usr/local/lib/kix/modules`
7. `/usr/lib/kix/modules`
8. `/opt/kix/modules`

## Global options

- `--quiet`, `-q` — suppress normal output
- `--verbose` — extra output
- `--json` — machine-readable output
- `--no-color` — disable color output

## Exit codes

- `0` success
- `1` build, runtime, project, or environment error
- `2` invalid command-line usage

## Environment

- `KIX_TARGET` — default target (planned)
- `KIX_CC` — default C compiler (planned)
- `KIX_WKC` — general task worker count
- `KIX_GC_STRESS`, `KIX_GC_LOG` — GC diagnostics
