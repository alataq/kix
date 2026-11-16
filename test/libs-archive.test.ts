import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("archive library", () => {
  test("creates, parses, extracts, and gzips tar archives", () => {
    const archiveRoot = "/tmp/kix-archive-test";
    const project = createProject("libs-archive", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.vector;
        import kix.archive.tar;
        import kix.archive.zip;
        import kix.fs;
        import kix.error.exceptions;

        public main(): int throws Exception {
            Vector<tar::Entry> entries = new Vector<tar::Entry>();
            entries.push(tar::file("hello.txt", "hello"));
            entries.push(tar::directory("docs/"));
            entries.push(tar::file("docs/readme.txt", "readme"));

            String archive = tar::create(entries);
            Vector<tar::Entry> parsed = tar::parse(archive);
            io::printf("entries=%lld first=%s data=%s\\n",
                parsed.length(),
                parsed.at(0).name,
                parsed.at(2).data);

            fs::removeAll("${archiveRoot}/out");
            tar::extract(parsed, "${archiveRoot}/out");
            io::println(fs::readFile("${archiveRoot}/out/hello.txt"));

            String gz = tar::createGzip(entries);
            Vector<tar::Entry> gzEntries = tar::parseGzip(gz);
            io::printf("gzip=%lld\\n", gzEntries.length());

            Vector<zip::Entry> zipEntries = new Vector<zip::Entry>();
            zipEntries.push(zip::file("hello.txt", "hello"));
            zipEntries.push(zip::directory("docs"));
            zipEntries.push(zip::file("docs/readme.txt", "readme"));
            String zipData = zip::create(zipEntries);
            Vector<zip::Entry> zipParsed = zip::parse(zipData);
            io::printf("zip=%lld %s\\n", zipParsed.length(), zipParsed.at(2).data);
            fs::removeAll("${archiveRoot}/out");
            zip::extract(zipParsed, "${archiveRoot}/out");
            io::println(fs::readFile("${archiveRoot}/out/docs/readme.txt"));
            fs::removeAll("${archiveRoot}/out");
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe(
      "entries=3 first=hello.txt data=readme\nhello\ngzip=3\nzip=3 readme\nreadme\n",
    );
  }, 30000);
});
