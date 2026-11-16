import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildProject } from "../src/build";
import { compileProject } from "../src/compiler";
import { KixError } from "../src/compiler/errors";
import {
  cleanupTemporaryDirectories,
  compile,
  createProject,
  modulesDir,
  run,
  runWithEnv,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("compiler pipeline", () => {
  test("File supports write and readAll via syscalls", () => {
    const project = createProject("file", {
      "src/main.kix": "",
    });
    const dataPath = join(project.dir, "data.txt");

    writeFileSync(
      project.entry,
      `
        import kix.io;
        import kix.string;
        import kix.fs;

        public main(): int {
            File writer = new File();
            if (!writer.open("${dataPath}", "w")) {
                io::printlnErr("open failed");
                return 1;
            }
            writer.write("file contents\\n");
            writer.close();

            File reader = new File();
            if (!reader.open("${dataPath}", "r")) {
                return 2;
            }
            String data = reader.readAll();
            reader.close();
            io::print(data);
            io::printf("bytes=%lld\\n", data.length());
            return 0;
        }
      `,
      "utf8",
    );

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("file contents\nbytes=14\n");
  });

  test("kix.fs provides directories, metadata, copy, and symlinks", () => {
    const project = createProject("fs", {
      "src/main.kix": "",
    });
    const treePath = join(project.dir, "tree");

    writeFileSync(
      project.entry,
      `
        import kix.error.exceptions;
        import kix.io;
        import kix.string;
        import kix.fs;
        import kix.vector;

        public main(): int throws Exception {
            String root = "${treePath}";
            fs::removeAll(root);
            fs::mkdirAll(root.concat("/docs/notes"), 511);
            if (!fs::isDirectory(root.concat("/docs/notes"))) {
                return 2;
            }
            fs::writeFile(root.concat("/docs/notes/a.txt"), "alpha");
            fs::appendFile(root.concat("/docs/notes/a.txt"), "-beta");

            String content = fs::readFile(root.concat("/docs/notes/a.txt"));
            io::printf("content=%s\\n", content);

            Stat info = fs::stat(root.concat("/docs/notes/a.txt"));
            io::printf("size=%lld file=%lld\\n", info.size(), info.isFile() ? 1 : 0);

            Vector<String> names = fs::list(root.concat("/docs/notes"));
            io::printf("entries=%lld\\n", names.length());
            io::printf("entry=%s\\n", names.at(0));

            fs::rename(root.concat("/docs/notes/a.txt"), root.concat("/docs/notes/b.txt"));
            fs::copyFile(root.concat("/docs/notes/b.txt"), root.concat("/copy.txt"));
            io::printf("copy=%s\\n", fs::readFile(root.concat("/copy.txt")));

            fs::createSymlink(root.concat("/copy.txt"), root.concat("/link.txt"));
            if (!fs::isSymlink(root.concat("/link.txt"))) {
                return 8;
            }
            io::printf("link=%s\\n", fs::readSymlink(root.concat("/link.txt")));

            fs::removeAll(root);
            io::printf("exists=%lld\\n", fs::exists(root) ? 1 : 0);
            return 0;
        }
      `,
      "utf8",
    );

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe(
      [
        "content=alpha-beta",
        "size=10 file=1",
        "entries=1",
        "entry=a.txt",
        `copy=alpha-beta`,
        `link=${treePath}/copy.txt`,
        "exists=0",
        "",
      ].join("\n"),
    );
  });

  test("kix.fs directory iteration refills its kernel buffer", () => {
    const project = createProject("fs-many", {
      "src/main.kix": "",
    });
    const treePath = join(project.dir, "many");

    writeFileSync(
      project.entry,
      `
        import kix.error.exceptions;
        import kix.io;
        import kix.string;
        import kix.fs;
        import kix.vector;

        public intText(value: int): String {
            String digits = "0123456789";
            if (value == 0) {
                return "0";
            }
            String reversed = new String();
            int v = value;
            while (v > 0) {
                reversed.appendByte(digits.byteAt(v % 10));
                v = v / 10;
            }
            String result = new String();
            int i = reversed.length() - 1;
            while (i >= 0) {
                result.appendByte(reversed.byteAt(i));
                i = i - 1;
            }
            return result;
        }

        public main(): int throws Exception {
            String root = "${treePath}";
            fs::removeAll(root);
            fs::mkdir(root);
            int i = 0;
            while (i < 250) {
                String base = root.concat("/f");
                String name = base.concat(intText(i));
                name.append(".txt");
                fs::writeFile(name, "x");
                i = i + 1;
            }

            Vector<String> names = fs::list(root);
            io::printf("count=%lld\\n", names.length());
            fs::removeAll(root);
            return 0;
        }
      `,
      "utf8",
    );

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("count=250\n");
  });

  test("kix.fs high-level functions throw typed errors", () => {
    const project = createProject("fs-errors", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.fs;
        import kix.error.exceptions;

        public main(): int {
            try {
                String data = fs::readFile("/definitely/not/a/real/path");
                io::println(data);
            } catch (error: Exception) {
                io::printf("code=%lld kind=%lld\\n", error.code(), error.kind() == ExceptionKind.NotFound ? 1 : 0);
            }
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe("code=-2 kind=1\n");
  });

  test("kix.fs path helpers and error text", () => {
    const project = createProject("fs-paths", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.fs;

        public main(): int {
            io::printf("join=%s\\n", fs::join("/tmp", "x"));
            io::printf("base=%s\\n", fs::basename("/a/b/"));
            io::printf("dir=%s\\n", fs::dirname("/a/b"));
            io::printf("abs=%lld rel=%lld\\n", fs::isAbsolute("/x") ? 1 : 0, fs::isRelative("x") ? 1 : 0);
            io::println(fs::errorText(-2));
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe(
      "join=/tmp/x\nbase=b\ndir=/a\nabs=1 rel=1\nno such file or directory\n",
    );
  });
});
