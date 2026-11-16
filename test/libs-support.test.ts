import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("support libraries", () => {
  test("stream, bufio, url, mime, log, test, and cli work", () => {
    const project = createProject("libs-support", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.vector;
        import kix.stream;
        import kix.bufio;
        import kix.net.url;
        import kix.collections;
        import kix.net.mime;
        import kix.tooling.log;
        import kix.tooling.test;
        import kix.tooling.cli;
        import kix.error.exceptions;

        public main(): int throws Exception {
            StringReader reader = new StringReader("one\\ntwo\\n");
            BufferedReader buffered = new BufferedReader(reader);
            String first = buffered.readLine();
            String second = buffered.readLine();
            String rest = buffered.readAll();
            io::printf("lines=%s,%s,%s\\n", first, second, rest);

            StringWriter writer = new StringWriter();
            BufferedWriter bufferedWriter = new BufferedWriter(writer);
            bufferedWriter.write("hello ");
            bufferedWriter.write("world");
            bufferedWriter.close();
            io::println(writer.toString());

            Url parsed = url::parse("https://example.com:8080/a/b?x=1&y=two#frag");
            io::printf("url=%s %s %lld %s\\n",
                parsed.scheme, parsed.host, parsed.port, parsed.requestTarget());
            StringMap<String> query = url::parseQuery(parsed.query);
            io::printf("query=%s %s\\n", query.get("x"), query.get("y"));
            io::printf("encode=%s decode=%s\\n",
                url::encodeComponent("a b/c"),
                url::decodeComponent("a%20b%2Fc"));

            MediaType media = mime::parse("text/html; charset=utf-8");
            io::printf("mime=%s/%s text=%lld ext=%s\\n",
                media.type,
                media.subtype,
                media.isText() ? 1 : 0,
                mime::extensionFor("application/json"));

            Logger logger = new Logger("demo", Level.Info);
            logger.info("hello");

            test::assertInt(2 + 2, 4, "math");
            test::assertString("a", "a", "string");

            Vector<String> raw = new Vector<String>();
            raw.push("--name=Ada");
            raw.push("-v");
            raw.push("file.txt");
            Args args = cli::parse(raw);
            io::printf("cli=%s %lld %s\\n",
                args.option("name"),
                args.hasFlag("v") ? 1 : 0,
                args.positionalAt(0));
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const output = run(project.output);
    expect(output).toContain("lines=one,two,");
    expect(output).toContain("hello world");
    expect(output).toContain("url=https example.com 8080 /a/b?x=1&y=two");
    expect(output).toContain("query=1 two");
    expect(output).toContain("encode=a%20b%2Fc decode=a b/c");
    expect(output).toContain("mime=text/html text=1 ext=json");
    expect(output).toContain("INFO demo hello");
    expect(output).toContain("cli=Ada 1 file.txt");
  }, 30000);
});
