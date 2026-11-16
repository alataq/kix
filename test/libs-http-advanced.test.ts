import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("advanced HTTP", () => {
  test("chunked encoding, decoding, and multipart parsing", () => {
    const project = createProject("libs-http-advanced", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.vector;
        import kix.net.http;
        import kix.error.exceptions;

        public main(): int throws Exception {
            String encoded = http::chunkedEncode("hello world");
            io::printf("decoded=%s\\n", http::chunkedDecode(encoded));
            Response response = http::parseResponse(
                "HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n5\\r\\nhello\\r\\n0\\r\\n\\r\\n"
            );
            io::printf("response=%s\\n", response.body);

            String body = "--abc\\r\\nContent-Disposition: form-data; name=\\"field\\"\\r\\n\\r\\nvalue\\r\\n--abc--\\r\\n";
            Vector<Part> parts = http::parseMultipart(body, "abc");
            io::printf("part=%s %s\\n", parts.at(0).name, parts.at(0).data);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("decoded=hello world\nresponse=hello\npart=field value\n");
  }, 30000);
});
