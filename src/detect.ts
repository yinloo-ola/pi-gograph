import { execSync } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the given directory is a Go project.
 * Primary signal: go.mod at root.
 * Fallback: any .go file up to 3 levels deep.
 */
export async function isGoRepo(cwd: string): Promise<boolean> {
  // Fast check: go.mod exists
  if (await fileExists(join(cwd, "go.mod"))) return true;

  // Fallback: search for .go files up to 3 levels deep
  try {
    return await hasGoFilesRecursive(cwd, 0, 3);
  } catch {
    return false;
  }
}

async function hasGoFilesRecursive(
  dir: string,
  currentDepth: number,
  maxDepth: number,
): Promise<boolean> {
  if (currentDepth > maxDepth) return false;

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".go")) return true;
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      entry.name !== "vendor" &&
      entry.name !== "node_modules"
    ) {
      const found = await hasGoFilesRecursive(
        join(dir, entry.name),
        currentDepth + 1,
        maxDepth,
      );
      if (found) return true;
    }
  }

  return false;
}

const GOGRAPH_NOT_INSTALLED_MSG =
  "gograph is not installed. Run `/gograph-setup` or install manually:\n" +
  "  brew install ozgurcd/tap/gograph\n" +
  "  go install github.com/ozgurcd/gograph/cmd/gograph@latest";

/**
 * Check if gograph is installed (synchronous — uses execSync).
 * For sync contexts like tool buildArgs callbacks.
 */
export function isGographInstalledSync(): boolean {
  try {
    execSync("gograph --version", { timeout: 3000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gograph is installed and available in PATH (async).
 */
export async function isGographInstalled(): Promise<boolean> {
  return isGographInstalledSync();
}

/**
 * Get the installed gograph version string.
 * Returns null if gograph is not installed or version cannot be determined.
 */
export function getGographVersion(): string | null {
  try {
    const output = execSync("gograph --version", { timeout: 3000 }).toString().trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}
/** Parse the leading `major.minor.patch` from a version string. Returns null if none. */
function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Whether the installed gograph `actual` (e.g. "gograph version v1.4.77") is at
 * least `minimum` (e.g. "1.4.81"). Returns false if either is null/unparseable
 * — failing closed so a tool is never advertised against an unknown binary.
 */
export function versionMeets(actual: string | null, minimum: string): boolean {
  if (!actual) return false;
  const a = parseSemver(actual);
  const min = parseSemver(minimum);
  if (!a || !min) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > min[i]) return true;
    if (a[i] < min[i]) return false;
  }
  return true;
}

/**
 * Shared "not installed" error for consistent messaging.
 */
export function gographNotInstalledError(): Error {
  return new Error(GOGRAPH_NOT_INSTALLED_MSG);
}

/**
 * Check if a gograph index exists in the project.
 */
export async function hasIndex(cwd: string): Promise<boolean> {
  return fileExists(join(cwd, ".gograph", "graph.json"));
}
