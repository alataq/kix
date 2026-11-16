import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Locate the bundled Kix modules directory.
 *
 * Search order:
 * 1. KIX_MODULES_DIR
 * 2. KIX_GLOBAL_MODULES
 * 3. source checkout: <repo>/modules
 * 4. packaged executable: <exe-dir>/modules
 * 5. installed prefix: <exe-dir>/../lib/kix/modules
 * 6. /usr/local/lib/kix/modules
 * 7. /usr/lib/kix/modules
 * 8. /opt/kix/modules
 */
export function bundledModulesDir(): string {
  const override = process.env.KIX_MODULES_DIR;
  if (override && override.trim() !== "") {
    return resolve(override);
  }

  const globalOverride = process.env.KIX_GLOBAL_MODULES;
  const executableDir = dirname(process.execPath);
  const candidates = [
    ...(globalOverride && globalOverride.trim() !== ""
      ? [resolve(globalOverride)]
      : []),
    resolve(import.meta.dir, "..", "modules"),
    resolve(executableDir, "modules"),
    resolve(executableDir, "..", "lib", "kix", "modules"),
    "/usr/local/lib/kix/modules",
    "/usr/lib/kix/modules",
    "/opt/kix/modules",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0]!;
}
