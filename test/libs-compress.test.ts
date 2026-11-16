import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("compression library", () => {
  test("gzip and zlib stored blocks round-trip", () => {
    const project = createProject("libs-compress", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.compress;
        import kix.error.exceptions;

        public main(): int throws Exception {
            String input = "hello hello hello";
            String gz = compress::gzipCompress(input);
            String zl = compress::zlibCompress(input);
            io::printf("gz=%s zl=%s\\n",
                compress::gzipDecompress(gz),
                compress::zlibDecompress(zl));
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("gz=hello hello hello zl=hello hello hello\n");
  }, 30000);
});
