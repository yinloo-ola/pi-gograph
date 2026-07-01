import { stub } from "./_ptk/stub.js";
import { runGograph } from "./runner.js";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * The set of gograph query subcommands available in the INSTALLED gograph,
 * as discovered at session start. This is the "live list" — the generic
 * dispatcher advertises exactly these. Per-command metadata (which flags a
 * subcommand supports, whether it needs the graph) stays curated in
 * generic-tool.ts; this module only answers "what's installed?".
 */
export interface Capabilities {
  /** Live list of query subcommand names available in the installed gograph. */
  subcommands: string[];
}

// ── Fallback ────────────────────────────────────────────────────────────────

/**
 * Safe fallback used when discovery fails or `gograph capabilities` output is
 * unparseable. Static by design — it is a floor, not the source of truth.
 * Kept in sync with the known-good set; new upstream commands appear via
 * discovery, not by editing this list.
 */
export const DEFAULT_CAPABILITIES: Capabilities = {
  subcommands: [
    "callers", "callees", "source", "fields", "impact", "path",
    "returnusage", "errorflow", "changes", "check", "focus", "stats",
    "dependents", "usages", "literals",
    // Aggregators promoted to primary tools are intentionally absent here —
    // they have dedicated tools (plan, review, explain, risk, summary) and
    // should not also clutter the generic dispatcher's long tail.
  ],
};

// ── Cache ───────────────────────────────────────────────────────────────────

/** Module-level cache, populated once per session by discoverCapabilities(). */
let cache: Capabilities | null = null;

/**
 * Return the cached capabilities, or DEFAULT_CAPABILITIES if discovery has not
 * run (or failed). Always returns a non-null Capabilities so the generic tool
 * can build its schema synchronously at registration time.
 */
export function getCachedCapabilities(): Capabilities {
  return cache ?? DEFAULT_CAPABILITIES;
}

/**
 * Cache discovered capabilities for the generic tool to read synchronously.
 * Called from index.ts session_start after discoverCapabilities() resolves.
 */
export function setCachedCapabilities(caps: Capabilities): void {
  cache = caps;
}

/** Test-only: reset the cache between tests. */
export function resetCapabilitiesCacheForTest(): void {
  cache = null;
}

// ── Discovery ───────────────────────────────────────────────────────────────

/**
 * Discover the available query subcommands from the installed gograph.
 *
 * Shells out to `gograph capabilities`, parses the output via
 * parseCapabilitiesOutput(), and caches the result. NEVER throws — on any
 * failure (gograph missing, non-zero exit, unparseable output) it returns
 * DEFAULT_CAPABILITIES so the extension degrades gracefully to the known-good
 * set instead of breaking tool registration.
 *
 * @param signal optional abort signal forwarded to the gograph process
 * @returns the discovered Capabilities (or DEFAULT_CAPABILITIES on failure)
 */
// HAZARD: graceful degradation — must never throw; all failure paths return
// DEFAULT_CAPABILITIES. A throw here would abort tool registration in
// session_start. See Socratic "Silent Error".
export async function discoverCapabilities(signal?: AbortSignal): Promise<Capabilities> {
  return stub("capabilities.discoverCapabilities");
}

/**
 * Parse raw `gograph capabilities` output into a Capabilities object.
 *
 * Pure function (no I/O) so it can be unit-tested in isolation. Extracts the
 * query subcommand names, ignoring primary-tool commands that already have
 * dedicated tools (build, query, context, plan, review, explain, risk, summary,
 * implementers, endpoint) and session/CLI-only commands. Returns
 * DEFAULT_CAPABILITIES if the output is empty or cannot be parsed.
 *
 * @param raw stdout from `gograph capabilities`
 * @returns parsed Capabilities
 */
export function parseCapabilitiesOutput(raw: string): Capabilities {
  return stub("capabilities.parseCapabilitiesOutput");
}