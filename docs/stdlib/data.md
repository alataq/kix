# Data and serialization

## `kix.data.serde`

Shared value model used by JSON/TOML/YAML/config.

`Kind`: `Null`, `Bool`, `Int`, `Float`, `String`, `Array`, `Object`.

`Value` constructors:

- `new Value(Kind)`
- `new Value(bool)`
- `new Value(int)`
- `new Value(float)`
- `new Value(String)`
- `new Value(Vector<Value>)`
- `new Value(StringMap<Value>)`

Fields:

- `kind: Kind`
- `boolValue: bool`
- `intValue: int`
- `floatValue: float`
- `stringValue: String`
- `arrayValue: Vector<Value>`
- `objectValue: StringMap<Value>`

Predicates: `isNull`, `isBool`, `isInt`, `isFloat`, `isString`, `isArray`, `isObject`.

Factory functions: `nullValue`, `boolValue`, `intValue`, `floatValue`,
`stringValue`, `arrayValue`, `objectValue`.

## `kix.data.json`

- `parse(source: String): Value throws Exception`
- `stringify(value: Value): String throws Exception`
- `Parser` class for incremental use: `new Parser(source)`, `parse()`

Supports null, bool, int, float, string escapes, arrays, objects.

## `kix.data.csv`

- `parse(text: String): Vector<Vector<String>> throws Exception`
- `stringify(rows: Vector<Vector<String>>): String`

Handles quoted fields, escaped quotes, commas, CRLF/LF.

## `kix.data.toml`

- `parse(source: String): Value throws Exception`
- `stringify(value: Value): String throws Exception`

Supports basic key/value pairs, tables, quoted strings, booleans, ints, floats,
and scalar arrays.

## `kix.data.xml`

- `parse(source: String): Node throws Exception`
- `stringify(node: Node): String`

`Node`:

- public fields: `name`, `text`, `attributes: StringMap<String>`, `children: Vector<Node>`
- `attribute(name): String throws Exception`

Supports elements, attributes, text, nesting, and common entities.

## `kix.data.yaml`

- `parse(source: String): Value throws Exception`
- `stringify(value: Value): String throws Exception`

Supports nested mappings and scalar values.

## `kix.data.config`

- `fromJson(text: String): Config throws Exception`
- `load(path: String): Config throws Exception`

`Config`:

- `get(path): Value throws Exception`
- `string(path): String throws Exception`
- `integer(path): int throws Exception`
- `decimal(path): float throws Exception`
- `boolean(path): bool throws Exception`
- `stringOr(path, fallback): String`
- `intOr(path, fallback): int`

Paths use dotted object keys, for example `server.host`.
