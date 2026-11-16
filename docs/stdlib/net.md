# Networking and HTTP

## `kix.net`

Namespace: `net`

### `Address`

- `new Address(host: String, port: int) throws Exception`
- public fields: `host`, `port`
- `sockaddr(): String throws Exception`
- `toString(): String`

IPv4 only.

### `TcpConnection`

- `new TcpConnection(fd: int)`
- `descriptor(): int`
- `read(count: int): String throws Exception`
- `write(data: String): void throws Exception`
- `readAll(): String throws Exception`
- `close(): void`
- Destructor closes the socket.

### `TcpListener`

- `new TcpListener()`
- `bind(host: String, port: int): void throws Exception`
- `accept(): TcpConnection throws Exception`
- `close(): void`

### Functions

- `connect(host: String, port: int): TcpConnection throws Exception`

## `kix.net.unix`

Unix domain sockets (Linux):

- `connect(path: String): net.TcpConnection throws Exception`
- `Listener`
  - `new Listener()`
  - `bind(path: String): void throws Exception`
  - `accept(): net.TcpConnection throws Exception`
  - `close(): void`

Connections are represented by `net.TcpConnection`.

## `kix.net.udp`

- `new Socket()`
- `descriptor(): int`
- `bind(host, port): void throws Exception`
- `send(data, host, port): void throws Exception`
- `receive(count): Datagram throws Exception`
- `close(): void`

`Datagram` fields: `data: String`, `address: net.Address`.

## `kix.net.dns`

- `isIPv4(value): bool`
- `lookup(host): String throws Exception` — numeric and `/etc/hosts`
- `resolve(host): String throws Exception` — lookup plus UDP DNS A-record fallback

## `kix.net.poll`

`Poller` wraps Linux epoll.

- `new Poller() throws Exception`
- `add(fd, events): void throws Exception`
- `modify(fd, events): void throws Exception`
- `remove(fd): void throws Exception`
- `wait(maxEvents, timeoutMillis): Vector<Event> throws Exception`
- `close(): void`

`Event` fields: `fd`, `events`.

## `kix.net.url`

`Url` public fields: `scheme`, `host`, `port`, `path`, `query`, `fragment`.

- `new Url()`
- `hasPort(): bool`
- `hostPort(): String`
- `requestTarget(): String`
- `toString(): String`

Functions:

- `encodeComponent(value): String`
- `decodeComponent(value): String throws Exception`
- `parseQuery(query): StringMap<String> throws Exception`
- `parse(value): Url throws Exception`
- `join(base: Url, relative: String): Url throws Exception`

## `kix.net.mime`

`MediaType` public fields: `type`, `subtype`, `parameters: StringMap<String>`.

- `new MediaType(type, subtype)`
- `isText(): bool`
- `toString(): String`

Functions:

- `parse(value): MediaType throws Exception`
- `contentTypeForExtension(extension): String`
- `extensionFor(contentType): String`

## `kix.net.http`

### `Headers`

- `set(name, value)`
- `get(name): String throws Exception`
- `getOr(name, fallback): String`
- `has(name): bool`
- `keys(): Vector<String>`

### `Request`

Public fields: `method`, `target`, `version`, `headers`, `body`.

### `Response`

- `new Response(status: int)`
- `new Response(status: int, body: String)`
- Public fields: `status`, `reason`, `headers`, `body`

### Parsing/serialization

- `parseRequest(value): Request throws Exception`
- `parseResponse(value): Response throws Exception`
- `serializeRequest(request): String throws Exception`
- `serializeResponse(response): String throws Exception`
- `chunkedEncode(value): String throws Exception`
- `chunkedDecode(value): String throws Exception`
- `parseMultipart(body, boundary): Vector<Part> throws Exception`
- `boundaryFrom(contentType): String throws Exception`
- `cookies(headers): StringMap<String> throws Exception`

`Part` fields: `name`, `filename`, `contentType`, `data`.

### Client

- `get(host: String, port: int, target: String): Response throws Exception`

### Server

- `Handler` interface — `handle(request: Request): Response throws Exception`
- `Router implements Handler`
  - `new Router()`
  - `set(path, handler): void`
  - `handle(request): Response throws Exception`
- `StaticHandler implements Handler`
  - `new StaticHandler(root: String)`
  - `setIndex(name: String)`
  - `handle(request): Response throws Exception`
- `handleConnection(connection, handler): void throws Exception` (task)
- `Server`
  - `new Server(handler: Handler)`
  - `bind(host, port): void throws Exception`
  - `serveOnce()`, `serve()`
  - `serveConcurrent()` / `serveOnceConcurrent()` — use the task system
  - `serveKeepAlive()`
  - `close(): void`

## `kix.net.tls`

Client-only TLS via the external `openssl s_client` command.

- `get(host: String, port: int, target: String): http::Response throws Exception`
- `get(host: String, target: String): http::Response throws Exception`
- `post(host, port, target, contentType, body): http::Response throws Exception`

Requires `openssl` on `PATH`. HTTPS server support is not implemented.
