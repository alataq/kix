# Tooling libraries

## `kix.tooling.cli`

`Args`:

- `positional(): Vector<String>`
- `positionalAt(index): String`
- `positionalLength(): int`
- `hasFlag(name): bool`
- `hasOption(name): bool`
- `option(name): String throws Exception`
- `optionOr(name, fallback): String`
- `flag(name): void`
- `optionValue(name, value): void`

Functions:

- `parse(args: Vector<String>): Args`

Supported forms: `--key=value`, `--key value`, `--flag`, `-abc`, `--`, and
positional values.

## `kix.tooling.log`

`Level`: `Debug`, `Info`, `Warn`, `Error`.

`Logger`:

- `new Logger(name: String, minimum: Level)`
- `debug(message)`, `info(message)`, `warn(message)`, `error(message)`
- Logging methods throw `Exception` because timestamps can fail.

## `kix.tooling.test`

- `fail(message): void throws Exception`
- `assert(condition, message): void throws Exception`
- `assertTrue(condition, message)`
- `assertFalse(condition, message)`
- `assertInt(actual, expected, message)`
- `assertString(actual, expected, message)`
- `assertBool(actual, expected, message)`

## `kix.tooling.terminal`

ANSI helpers:

- `reset`, `bold`, `dim`
- `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`
- `colorize(text, color): String`
- `printColor(text, color): void`

## `kix.tooling.glob`

- `match(value: String, pattern: String): bool`
- `glob(pattern: String): Vector<String> throws Exception`

Supports `*` and `?` path-segment wildcards.
