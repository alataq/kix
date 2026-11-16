# Archives

## `kix.archive.tar`

Namespace: `archive.tar`

### `Entry`

- public fields: `name`, `typeflag`, `data`, `linkname`, `mode`, `mtime`
- `new Entry(name, typeflag, data)`
- `setLink(target)`, `setMode(mode)`, `setMtime(value)`

Helpers:

- `file(name, data): Entry`
- `directory(name): Entry`
- `symlink(name, target): Entry`

Functions:

- `create(entries: Vector<Entry>): String throws Exception`
- `parse(data: String): Vector<Entry> throws Exception`
- `extract(entries: Vector<Entry>, targetRoot: String): void throws Exception`
- `createGzip(entries: Vector<Entry>): String throws Exception`
- `parseGzip(data: String): Vector<Entry> throws Exception`
- `extractGzip(data: String, targetRoot: String): void throws Exception`
- `createFromDirectory(rootName: String, physical: String): Vector<Entry> throws Exception`

USTAR paths are split into name/prefix; unsafe extraction paths are rejected.

## `kix.archive.zip`

Namespace: `archive.zip`

### `Entry`

- public fields: `name`, `data`, `mode`
- `new Entry(name, data)`
- `setMode(mode)`

Helpers:

- `file(name, data): Entry`
- `directory(name): Entry`

Functions:

- `create(entries: Vector<Entry>): String throws Exception`
- `parse(data: String): Vector<Entry> throws Exception`
- `extract(entries: Vector<Entry>, targetRoot: String): void throws Exception`

ZIP currently uses stored entries only.
