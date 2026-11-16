import { afterEach, describe, expect, test } from "bun:test";
import { buildProject } from "../src/build";
import {
  cleanupTemporaryDirectories,
  createProject,
  run,
} from "./support";

afterEach(cleanupTemporaryDirectories);

describe("foundation libraries", () => {
  test("path, text, bytes, encoding, math, time, and collections work together", () => {
    const project = createProject("libs-foundation", {
      "src/main.kix": `
        import kix.io;
        import kix.string;
        import kix.vector;
        import kix.util.path;
        import kix.util.text;
        import kix.util.bytes;
        import kix.util.encoding;
        import kix.util.math;
        import kix.util.random;
        import kix.util.time;
        import kix.collections;
        import kix.error.exceptions;

        public main(): int throws Exception {
            io::printf("path=%s base=%s norm=%s\\n",
                path::join("a", "b"),
                path::basename("/x/y.txt"),
                path::normalize("a/./b/../c"));

            io::printf("int=%s parsed=%lld trim=%s\\n",
                text::intToString(123),
                text::parseInt("42"),
                text::trim("  hi  "));

            Bytes buffer = new Bytes();
            int i = 0;
            while (i < 4) { buffer.appendByte(0); i = i + 1; }
            buffer.writeU16LE(0, 258);
            buffer.writeU16LE(2, 4660);
            io::printf("bytes=%lld %lld\\n", buffer.readU16LE(0), buffer.readU16LE(2));

            String encoded = encoding::hexEncode("Hi");
            String decoded = encoding::hexDecode(encoded);
            io::printf("hex=%s decoded=%s b64=%s\\n",
                encoded,
                decoded,
                encoding::base64Encode("Kix"));

            io::printf("math=%lld %lld %lld\\n",
                math::abs(-5),
                math::gcd(18, 24),
                math::powInt(2, 8));

            List<int> list = new List<int>();
            list.add(3); list.add(1); list.add(2);
            io::printf("list=%lld first=%lld\\n", list.length(), list.get(0));

            StringMap<int> map = new StringMap<int>();
            map.put("a", 1);
            map.put("b", 2);
            map.put("a", 5);
            io::printf("map=%lld a=%lld\\n", map.length(), map.get("a"));

            IntHeap heap = new IntHeap();
            heap.push(5); heap.push(1); heap.push(3);
            io::printf("heap=%lld\\n", heap.pop());

            Rng rng = new Rng(7);
            io::printf("rng=%lld\\n", rng.nextBelow(100));
            io::printf("time=%s\\n", time::formatUnix(0));
            return 0;
        }
      `,
    });

    buildProject({ projectDir: project.dir });
    expect(run(project.output)).toBe(
      [
        "path=a/b base=y.txt norm=a/c",
        "int=123 parsed=42 trim=hi",
        "bytes=258 4660",
        "hex=4869 decoded=Hi b64=S2l4",
        "math=5 6 256",
        "list=3 first=3",
        "map=2 a=5",
        "heap=1",
        "rng=16",
        "time=1970-01-01T00:00:00Z",
        "",
      ].join("\n"),
    );
  });
});
