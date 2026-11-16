import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import { cleanupTemporaryDirectories, createProject } from "./support";

afterEach(cleanupTemporaryDirectories);

describe("type namespace resolution", () => {
  test("current/global namespace shadows imported types", () => {
    const project = createProject("type-shadow", {
      "src/main.kix": `
        import kix.string;

        class String {
            public String() {}
        }

        public main(): int {
            String local = new String();
            string::String imported = new string::String("ok");
            return 0;
        }
      `,
    });
    expect(() => buildProject({ projectDir: project.dir })).not.toThrow();
  });

  test("imported type collisions remain ambiguous until qualified", () => {
    const files = {
      "src/main.kix": `
        import one;
        import two;

        public main(): int {
            Item value = null;
            return 0;
        }
      `,
      "src/one.kix": `
        namespace one {
            public class Item {
                public Item() {}
            }
        }
      `,
      "src/two.kix": `
        namespace two {
            public class Item {
                public Item() {}
            }
        }
      `,
    };
    const ambiguous = createProject("type-ambiguous", files);
    expect(() => buildProject({ projectDir: ambiguous.dir })).toThrow(
      "ambiguous class 'Item': one.Item, two.Item",
    );

    const qualified = createProject("type-qualified", {
      ...files,
      "src/main.kix": `
        import one;
        import two;

        public main(): int {
            one::Item first = null;
            two::Item second = null;
            return 0;
        }
      `,
    });
    expect(() => buildProject({ projectDir: qualified.dir })).not.toThrow();
  });
});
