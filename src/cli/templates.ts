export type ProjectTemplate = "minimal" | "cli" | "http-server";

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  "minimal",
  "cli",
  "http-server",
];

export interface ProjectFiles {
  files: Record<string, string>;
  nextSteps: string[];
}

const minimalMain = `import kix.io;

public main(): int {
    io::println("Hello from Kix!");
    return 0;
}
`;

const cliMain = `import kix.io;
import kix.string;
import kix.vector;
import kix.tooling.cli;
import kix.error.exceptions;

public main(argc: int, argv: String[]): int throws Exception {
    Vector<String> raw = new Vector<String>();
    int i = 1;
    while (i < argc) {
        raw.push(argv[i]);
        i = i + 1;
    }
    Args args = cli::parse(raw);
    io::printf("positional=%lld options=%lld flags=%lld\\n",
        args.positionalLength(),
        args.hasOption("name") ? 1 : 0,
        args.hasFlag("verbose") ? 1 : 0);
    return 0;
}
`;

const httpMain = `import kix.io;
import kix.net.http;
import kix.error.exceptions;

public main(): int throws Exception {
    Router router = new Router();
    Server server = new Server(router);
    server.bind("127.0.0.1", 8080);
    io::println("listening on http://127.0.0.1:8080");
    server.serve();
    return 0;
}
`;

export function projectFiles(
  name: string,
  template: ProjectTemplate,
): ProjectFiles {
  const main =
    template === "cli"
      ? cliMain
      : template === "http-server"
        ? httpMain
        : minimalMain;

  const files: Record<string, string> = {
    "kix.json": `${JSON.stringify(
      {
        name,
        entry: "src/main.kix",
        output: "bin/app",
      },
      null,
      2,
    )}\n`,
    "src/main.kix": main,
    ".gitignore": ".kix-build/\nbin/\n",
    "README.md": `# ${name}\n\nA Kix project.\n\n\`\`\`bash\nkixt build .\n./bin/app\n\`\`\`\n`,
  };

  const nextSteps =
    template === "http-server"
      ? ["kixt build .", "./bin/app"]
      : template === "cli"
        ? ["kixt build .", "./bin/app --name demo --verbose"]
        : ["kixt build .", "./bin/app"];

  return { files, nextSteps };
}
