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

/**
 * Check if gograph is installed and available in PATH.
 */
export async function isGographInstalled(): Promise<boolean> {
  try {
    execSync("gograph --version", { timeout: 3000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a gograph index exists in the project.
 */
export async function hasIndex(cwd: string): Promise<boolean> {
  return fileExists(join(cwd, ".gograph", "graph.json"));
}
