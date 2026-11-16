import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("system libraries", () => {
  test("sync, process, and os helpers work", () => {
    const project = createProject("libs-system", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.sync;
        import kix.process;
        import kix.os;
        import kix.error.exceptions;

        public main(): int throws Exception {
            Mutex mutex = new Mutex();
            mutex.lock();
            mutex.unlock();
            mutex.close();
            io::println("mutex ok");
            int status = process::run("printf 'external\\n'");
            io::printf("status=%lld\\n", status);
            io::printf("platform=%s\\n", os::platform());
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const output = run(project.output);
    expect(output).toContain("mutex ok");
    expect(output).toContain("external");
    expect(output).toContain("status=0");
    expect(output).toContain("platform=Linux");
  }, 30000);
});
