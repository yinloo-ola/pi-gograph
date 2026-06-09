import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { isGographInstalled, hasIndex } from "./detect.js";
import { scheduleBackgroundRefresh } from "./refresh.js";

/** ExtensionAPI exec function type */
type ExecFn = (
  command: string,
  args: string[],
  options?: { signal?: AbortSignal; timeout?: number },
) => Promise<{ stdout: string; stderr: string; code: number }>;

/** ExtensionAPI reference — set by index.ts on init. */
let execFn: ExecFn | undefined;

/**
 * Initialize the runner with pi's exec function.
 * Called once from index.ts during extension setup.
 */
export function initRunner(exec: ExecFn): void {
  execFn = exec;
}

/**
 * Run a gograph CLI command and return stdout.
 * Throws on non-zero exit.
 */
export async function runGograph(
  args: string[],
  signal?: AbortSignal,
  timeout = 30_000,
): Promise<string> {
  if (!execFn) {
    throw new Error("Runner not initialized. Call initRunner() first.");
  }

  const result = await execFn("gograph", args, {
    signal,
    timeout,
  });

  if (result.code !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(
      `gograph error${stderr ? `: ${stderr}` : ` (exit code ${result.code})`}`,
    );
  }

  return result.stdout;
}

/** In-memory lock to prevent concurrent gograph build processes. */
let buildInProgress = false;

/**
 * Run a gograph build command with a lock to prevent concurrent builds.
 * Returns a message if a build is already in progress.
 */
export async function runGographBuild(
  args: string[],
  signal?: AbortSignal,
  timeout = 60_000,
): Promise<string> {
  if (buildInProgress) return "(build already in progress)";
  buildInProgress = true;
  try {
    return await runGograph(args, signal, timeout);
  } finally {
    buildInProgress = false;
  }
}

/**
 * Check that gograph is installed and the project has an index.
 * Schedules a background refresh as a side effect.
 * Throws a helpful error message if prerequisites are not met.
 */
export async function ensureReady(
  pi: { exec: ExecFn },
  ctx: { cwd: string; ui: { setStatus: (key: string, value: string | undefined) => void } },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scheduleBackgroundRefresh(pi as any, ctx.cwd, ctx.ui);

  if (!(await isGographInstalled())) {
    throw new Error(
      "gograph is not installed. Run `/gograph-setup` or install manually:\n" +
      "  brew install ozgurcd/tap/gograph\n" +
      "  go install github.com/ozgurcd/gograph/cmd/gograph@latest",
    );
  }
  if (!(await hasIndex(ctx.cwd))) {
    throw new Error(
      "No gograph index found. Run `gograph build .` or use the gograph_build tool.",
    );
  }
}

/**
 * Format gograph CLI output for the LLM.
 * Applies truncation and returns metadata.
 */
export function formatOutput(raw: string): {
  text: string;
  truncated: boolean;
  totalLines: number;
} {
  if (!raw.trim()) {
    return { text: "(no results)", truncated: false, totalLines: 0 };
  }

  const truncation = truncateHead(raw, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let text = truncation.content;

  if (truncation.truncated) {
    const omittedLines = truncation.totalLines - truncation.outputLines;
    text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines` +
      ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).` +
      ` ${omittedLines} lines omitted. Narrow your query.]`;
  }

  return {
    text,
    truncated: truncation.truncated,
    totalLines: truncation.totalLines,
  };
}
