import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";

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
