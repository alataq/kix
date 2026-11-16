# Collections

## `kix.vector`

`Vector<T>` is the original growable typed array.

- `new Vector<T>()`
- `length(): int`
- `capacity(): int`
- `isEmpty(): bool`
- `storage(): T[]`
- `reserve(needed: int): void`
- `push(value: T): void`
- `pop(): T`
- `at(index: int): T`
- `set(index: int, value: T): void`
- `clear(): void`

## `kix.collections`

Namespace: `collections`

### `List<T>`

- `new List<T>()`
- `length(): int`, `capacity(): int`, `isEmpty(): bool`
- `add(value: T): void`
- `get(index: int): T`
- `set(index: int, value: T): void`
- `removeAt(index: int): T`
- `clear(): void`
- `toVector(): Vector<T>`

### `StringMap<V>`

Linear-probing-free linear key table; suitable for v1 workloads.

- `new StringMap<V>()`
- `put(key: String, value: V): void`
- `contains(key: String): bool`
- `get(key: String): V throws Exception`
- `getOr(key: String, fallback: V): V`
- `remove(key: String): bool`
- `length(): int`, `isEmpty(): bool`
- `keys(): Vector<String>`
- `values(): Vector<V>`
- `clear(): void`

### `IntMap<V>`

Same API as `StringMap<V>` with `int` keys.

### `StringSet`

- `add(value: String): void`
- `contains(value: String): bool`
- `remove(value: String): bool`
- `length(): int`, `isEmpty(): bool`
- `values(): Vector<String>`

### `IntSet`

- `add(value: int): void`
- `contains(value: int): bool`
- `remove(value: int): bool`
- `length(): int`, `isEmpty(): bool`
- `values(): Vector<int>`

### `IntHeap`

Min-heap of `int`.

- `push(value: int): void`
- `peek(): int throws Exception`
- `pop(): int throws Exception`
- `length(): int`, `isEmpty(): bool`

Generic `Map<K,V>`/`Set<T>` are deferred until generic constraints land; v1 exposes
specialized string/int maps and sets.
