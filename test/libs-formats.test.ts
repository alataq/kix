import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("format libraries", () => {
  test("toml, xml, yaml, config, glob, and crypto work", () => {
    const project = createProject("libs-formats", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.data.serde;
        import kix.data.toml;
        import kix.data.xml;
        import kix.data.yaml;
        import kix.data.config;
        import kix.tooling.glob;
        import kix.security.crypto;
        import kix.error.exceptions;

        public main(): int throws Exception {
            Value tomlValue = toml::parse("title = \\"Kix\\"\\n[server]\\nhost = \\"127.0.0.1\\"\\nport = 8080\\n");
            io::printf("toml=%s %lld\\n",
                tomlValue.objectValue.get("title").stringValue,
                tomlValue.objectValue.get("server").objectValue.get("port").intValue);

            Node node = xml::parse("<root id=\\"1\\"><child>hello</child></root>");
            io::printf("xml=%s %s\\n", node.name, node.children.at(0).text);

            Value yamlValue = yaml::parse("name: Ada\\nserver:\\n  host: localhost\\n  port: 8080\\n");
            io::printf("yaml=%s %lld\\n",
                yamlValue.objectValue.get("name").stringValue,
                yamlValue.objectValue.get("server").objectValue.get("port").intValue);

            Config config = config::fromJson("{\\"host\\":\\"127.0.0.1\\",\\"port\\":9000}");
            io::printf("config=%s %lld\\n", config.string("host"), config.integer("port"));
            io::printf("glob=%lld\\n", glob::match("main.kix", "*.kix") ? 1 : 0);
            io::println(crypto::hmacSha256("key", "data"));
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    const output = run(project.output);
    expect(output).toContain("toml=Kix 8080");
    expect(output).toContain("xml=root hello");
    expect(output).toContain("yaml=Ada 8080");
    expect(output).toContain("config=127.0.0.1 9000");
    expect(output).toContain("glob=1");
    expect(output).toContain("5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0");
  }, 30000);
});
