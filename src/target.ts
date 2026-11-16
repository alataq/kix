import { KixError } from "./compiler/errors";

export type TargetOs = "linux";
export type TargetArch = "x86_64" | "aarch64" | "riscv64";

export interface KixTarget {
  os: TargetOs;
  arch: TargetArch;
  /** Canonical name used on the CLI and in kix.json. */
  name: string;
  /** Filename stem for target-specific modules. */
  moduleStem: string;
}

function hostArch(): TargetArch {
  if (process.arch === "x64") return "x86_64";
  if (process.arch === "arm64") return "aarch64";
  if (process.arch === "riscv64") return "riscv64";
  throw new KixError(
    `unsupported host architecture '${process.arch}'`,
    undefined,
    "Kix currently supports Linux x86_64, aarch64, and riscv64",
  );
}

export const SUPPORTED_TARGETS = [
  "linux-x86_64",
  "linux-aarch64",
  "linux-riscv64",
] as const;

export function hostTargetName(): string {
  return `linux-${hostArch()}`;
}

export function parseTarget(value?: string): KixTarget {
  const name = (value ?? hostTargetName()).trim().toLowerCase();
  const [osPart, archPart, ...rest] = name.split("-");
  if (rest.length > 0 || !osPart || !archPart) {
    throw new KixError(
      `invalid target '${name}'`,
      undefined,
      "use linux-x86_64, linux-aarch64, or linux-riscv64",
    );
  }
  if (osPart !== "linux") {
    throw new KixError(
      `unsupported operating system target '${osPart}'`,
      undefined,
      "Stage 1 currently targets Linux; Unix backends are planned next",
    );
  }
  if (archPart !== "x86_64" && archPart !== "aarch64" && archPart !== "riscv64") {
    throw new KixError(
      `unsupported architecture target '${archPart}'`,
      undefined,
      "supported architectures: x86_64, aarch64, riscv64",
    );
  }
  return {
    os: "linux",
    arch: archPart,
    name: `linux-${archPart}`,
    moduleStem: `linux_${archPart}`,
  };
}
