export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/**
 * A user-facing compiler error. All compiler stages throw this type so the CLI
 * can render a consistent diagnostic without leaking internal stack traces.
 */
export class KixError extends Error {
  readonly location: SourceLocation | undefined;
  readonly hint: string | undefined;

  constructor(message: string, location?: SourceLocation, hint?: string) {
    super(message);
    this.name = "KixError";
    this.location = location;
    this.hint = hint;
  }

  format(): string {
    const where = this.location
      ? `${this.location.file}:${this.location.line}:${this.location.column}: `
      : "";
    const hint = this.hint ? `\n  hint: ${this.hint}` : "";
    return `${where}error: ${this.message}${hint}`;
  }
}

export function fail(
  message: string,
  location?: SourceLocation,
  hint?: string,
): never {
  throw new KixError(message, location, hint);
}

export function asKixError(error: unknown): KixError {
  if (error instanceof KixError) return error;
  if (error instanceof Error) return new KixError(error.message);
  return new KixError(String(error));
}
