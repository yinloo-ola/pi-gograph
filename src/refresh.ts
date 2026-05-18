import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hasIndex, isGographInstalled } from "./detect.js";
import { runGograph } from "./runner.js";

export interface IndexState {
  head: string;
  branch: string;
  builtAt: string;
}

type ExecApi = Pick<ExtensionAPI, "exec">;
type StatusUi = {
  setStatus: (key: string, value: string | undefined) => void;
};

const STATE_FILE = join(".gograph", "pi-gograph-state.json");

let refreshPromise: Promise<void> | null = null;
let backgroundStatus: string | null = null;
let lastBackgroundHead: string | null = null;
let lastBackgroundFailed = false;

async function execGit(pi: ExecApi, cwd: string, args: string[]): Promise<string | null> {
  try {
    const result = await pi.exec("git", ["-C", cwd, ...args], { timeout: 5000 });
    if (result.code !== 0) return null;

    const value = result.stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function getCurrentIndexState(
  pi: ExecApi,
  cwd: string,
): Promise<IndexState | null> {
  const [head, branch] = await Promise.all([
    execGit(pi, cwd, ["rev-parse", "HEAD"]),
    execGit(pi, cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);

  if (!head) return null;

  return {
    head,
    branch: branch ?? "HEAD",
    builtAt: new Date().toISOString(),
  };
}

export async function readIndexState(cwd: string): Promise<IndexState | null> {
  try {
    const raw = await readFile(join(cwd, STATE_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<IndexState>;

    if (
      typeof parsed.head !== "string" ||
      typeof parsed.branch !== "string" ||
      typeof parsed.builtAt !== "string"
    ) {
      return null;
    }

    return {
      head: parsed.head,
      branch: parsed.branch,
      builtAt: parsed.builtAt,
    };
  } catch {
    return null;
  }
}

export async function writeIndexState(cwd: string, state: IndexState): Promise<void> {
  const dir = join(cwd, ".gograph");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "pi-gograph-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function needsBackgroundRefresh(
  current: IndexState | null,
  stored: IndexState | null,
): boolean {
  if (!current) return false;
  if (!stored) return true;
  return current.head !== stored.head;
}

export function getBackgroundStatus(): string | null {
  return backgroundStatus;
}

export function clearBackgroundStatus(): void {
  backgroundStatus = null;
}

export function scheduleBackgroundRefresh(pi: ExecApi, cwd: string, ui: StatusUi): void {
  if (refreshPromise) return;

  refreshPromise = (async () => {
    let current: IndexState | null = null;

    try {
      if (!(await isGographInstalled())) return;
      if (!(await hasIndex(cwd))) return;

      current = await getCurrentIndexState(pi, cwd);
      if (!current) return;

      const stored = await readIndexState(cwd);
      if (!needsBackgroundRefresh(current, stored)) return;

      if (lastBackgroundFailed && lastBackgroundHead === current.head) return;

      backgroundStatus = "gograph: rebuilding index in background...";
      ui.setStatus("gograph", backgroundStatus);

      await runGograph(["build", "."], undefined, 60_000);
      await writeIndexState(cwd, current);

      lastBackgroundHead = current.head;
      lastBackgroundFailed = false;
      backgroundStatus = null;
      ui.setStatus("gograph", "gograph ✓");
    } catch {
      if (current) {
        lastBackgroundHead = current.head;
        lastBackgroundFailed = true;
      }
      backgroundStatus = "gograph: rebuild failed";
      ui.setStatus("gograph", backgroundStatus);
    } finally {
      refreshPromise = null;
    }
  })();
}
