# Security and hashing

## `kix.security.hash`

- `crc32(data: String): int`
- `fnv1a(data: String): int`
- `sha256Bytes(data: String): String`
- `sha256(data: String): String`

`sha256Bytes` returns the raw 32-byte digest. `sha256` returns lowercase hex.

## `kix.security.crypto`

- `secureRandom(count: int): String throws Exception`
- `constantTimeEquals(left: String, right: String): bool`
- `hmacSha256(key: String, data: String): String throws Exception`

`hmacSha256` returns lowercase hex.
