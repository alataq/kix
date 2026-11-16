import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("network libraries", () => {
  test("serves and consumes a local HTTP request", () => {
    const project = createProject("libs-net", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.net;
        import kix.net.http;
        import kix.syscalls;
        import kix.error.exceptions;

        public &serve(listener: net::TcpListener): void throws Exception {
            net::TcpConnection connection = listener.accept();
            Request request = http::readRequest(connection);
            Response response = new Response(200, "hello ".concat(request.target));
            response.headers.set("Content-Type", "text/plain");
            http::send(connection, response);
            connection.close();
        }

        public main(): int throws Exception {
            int port = 20000 + (syscalls::getpid() % 20000);
            net::TcpListener listener = new net::TcpListener();
            listener.bind("127.0.0.1", port);
            serve(listener);
            Response response = http::get("127.0.0.1", port, "/hello");
            io::printf("status=%lld body=%s\\n", response.status, response.body);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("status=200 body=hello /hello\n");
  }, 30000);
});
