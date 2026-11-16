import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("Unix domain sockets", () => {
  test("connect and accept over a Unix socket", () => {
    const project = createProject("libs-unix-socket", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.net;
        import kix.net.unix;
        import kix.syscalls;
        import kix.util.text;
        import kix.fs;
        import kix.error.exceptions;

        public &serve(listener: Listener): void throws Exception {
            net::TcpConnection connection = listener.accept();
            String request = connection.read(5);
            connection.write("world");
            connection.close();
        }

        public main(): int throws Exception {
            String path = "/tmp/kix-unix-socket-".concat(text::intToString(syscalls::getpid()));
            fs::removeAll(path);
            Listener listener = new Listener();
            listener.bind(path);
            serve(listener);
            net::TcpConnection connection = net::unix::connect(path);
            connection.write("hello");
            String response = connection.read(5);
            connection.close();
            listener.close();
            fs::removeAll(path);
            io::printf("unix=%s\\n", response);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("unix=world\n");
  }, 30000);
});
