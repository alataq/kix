# Utilities

## `kix.util.path`

- `isAbsolute(path: String): bool`
- `isRelative(path: String): bool`
- `join(base: String, child: String): String`
- `basename(path: String): String`
- `dirname(path: String): String`
- `extension(path: String): String`
- `withoutExtension(path: String): String`
- `normalize(path: String): String`

## `kix.util.text`

- `trim`, `trimStart`, `trimEnd`
- `startsWith`, `endsWith`, `contains`
- `indexOf`, `indexOfFrom`
- `replace`
- `split(value, separator): Vector<String>`
- `join(parts, separator): String`
- `repeat(value, count): String`
- `intToString(value): String`
- `parseInt(value): int throws Exception`
- `parseFloat(value): float throws Exception`
- `parseIntOr(value, fallback): int`
- `floatToString(value, precision): String`
- `padLeft(value, width, fill): String`
- `StringBuilder`
  - `append`, `appendByte`, `appendInt`, `clear`, `length`, `toString`

## `kix.util.bytes`

`Bytes` is a mutable binary byte buffer backed by `String`.

- `new Bytes()`, `new Bytes(value: String)`
- `raw(): String`, `length(): int`, `capacity(): int`, `isEmpty(): bool`
- `reserve`, `clear`, `byteAt`, `setByte`, `appendByte`, `appendString`, `appendBytes`
- `slice(start, length)`, `copy`, `equals`
- Little/big-endian reads: `readU16LE/BE`, `readU32LE/BE`, `readU64LE`
- Little/big-endian writes: `writeU16LE/BE`, `writeU32LE/BE`, `writeU64LE`

## `kix.util.encoding`

- `hexEncode(data: String): String`
- `hexDecode(value: String): String throws Exception`
- `base64Encode(data: String): String`
- `base64Decode(value: String): String throws Exception`

## `kix.util.unicode`

- `fromCodepoint(value: int): String throws Exception`
- `codepointAt(value: String, index: int): int throws Exception`
- `isValid(value: String): bool`
- `asciiUpper(value: String): String`
- `asciiLower(value: String): String`

## `kix.util.math`

- `abs(int)`, `abs(float)`
- `min(int,int)`, `max(int,int)`, `min(float,float)`, `max(float,float)`
- `clamp(value, low, high): int`
- `sign(value): int`
- `isEven(value)`, `isOdd(value): bool`
- `gcd(a,b)`, `lcm(a,b): int`
- `powInt(base, exponent): int`

## `kix.util.random`

- `bytes(count: int): String throws Exception`
- `intBelow(limit: int): int throws Exception`
- `intRange(low, high): int throws Exception`
- `boolean(): bool throws Exception`
- `Rng(seed: int)`
  - `next(): int`
  - `nextBelow(limit: int): int`
  - `nextFloat(): float`
  - `nextBool(): bool`

## `kix.util.time`

- `nowSeconds(): int throws Exception`
- `nowMillis(): int throws Exception`
- `nowMicros(): int throws Exception`
- `sleepMillis(milliseconds: int): void throws Exception`
- `formatUnix(seconds: int): String`
- `formatNow(): String throws Exception`

## `kix.util.uuid`

- `nil(): String`
- `v4(): String throws Exception`

## `kix.util.tmp`

- `directory(): String`
- `name(prefix: String): String throws Exception`
- `file(prefix: String): String throws Exception`
- `dir(prefix: String): String throws Exception`
