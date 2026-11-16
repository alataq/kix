import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("data libraries", () => {
  test("hash, json, csv, unicode, uuid, and tmp work", () => {
    const project = createProject("libs-data", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.vector;
        import kix.security.hash;
        import kix.data.serde;
        import kix.data.json;
        import kix.data.csv;
        import kix.util.unicode;
        import kix.util.uuid;
        import kix.util.tmp;
        import kix.fs;
        import kix.error.exceptions;

        public main(): int throws Exception {
            io::printf("crc=%lld\\n", hash::crc32("123456789"));
            io::println(hash::sha256("abc"));

            Value value = json::parse("{\\"name\\":\\"Ada\\",\\"items\\":[1,2,3]}");
            String encoded = json::stringify(value);
            io::println(encoded);
            io::printf("items=%lld\\n", value.objectValue.get("items").arrayValue.length());

            Vector<Vector<String>> rows = csv::parse("a,b\\n\\"x,y\\",z\\n");
            Vector<String> secondRow = rows.at(1);
            io::printf("csv=%lld %s %s\\n", rows.length(), secondRow.at(0), secondRow.at(1));

            io::printf("unicode=%lld valid=%lld\\n",
                unicode::codepointAt("é", 0),
                unicode::isValid("é") ? 1 : 0);

            String id = uuid::v4();
            io::printf("uuid=%lld\\n", id.length());

            String temp = tmp::file("kix-test-");
            fs::writeFile(temp, "temp data");
            io::println(fs::readFile(temp));
            fs::remove(temp);
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const output = run(project.output);
    expect(output).toContain("crc=3421780262");
    expect(output).toContain("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(output).toContain('{"name":"Ada","items":[1,2,3]}');
    expect(output).toContain("items=3");
    expect(output).toContain("csv=2 x,y z");
    expect(output).toContain("unicode=233 valid=1");
    expect(output).toContain("uuid=36");
    expect(output).toContain("temp data");
  }, 30000);
});
