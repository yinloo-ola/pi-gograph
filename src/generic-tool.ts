import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { runGograph, formatOutput, ensureReady } from "./runner.js";
/** Curated long-tail query subcommands exposed via the generic dispatcher.
 *  Grown deliberately when a new gograph command earns a place — NOT auto-discovered
 *  (see docs/plans/2026-07-01-upstream-sync-decisions.md). */
const SUBCOMMANDS = [
  "callers", "callees", "source", "fields", "impact", "path",
  "returnusage", "errorflow", "changes", "check", "focus", "stats",
  "dependents", "usages", "literals", "doc",
];

// ── Curated per-subcommand metadata ─────────────────────────────────────────
//
// The exposed subcommands live in the SUBCOMMANDS list above (hand-curated,
// grown deliberately — NOT auto-discovered; see
// docs/plans/2026-07-01-upstream-sync-decisions.md). These maps hold the
// per-command metadata: which flags a subcommand supports, whether it needs
// the graph, and a one-line doc for the LLM. They are intentionally tolerant
// — a subcommand not listed here simply gets no typed flags and a name-only
// description, and still works via the `flags` passthrough. Add a subcommand
// to these maps only when typed flag support or a richer doc is worth it.

/** Commands that accept --depth flag */
const DEPTH_COMMANDS = new Set<string>(["callers", "callees", "path"]);

/** Commands that accept --files-only flag */
const FILES_ONLY_COMMANDS = new Set<string>([
  "callers", "callees", "impact", "changes", "dependents", "usages", "literals",
]);

/** Commands that accept --uncommitted flag */
const UNCOMMITTED_COMMANDS = new Set<string>(["impact", "check"]);

/** Commands that need no target argument */
const NO_TARGET_COMMANDS = new Set<string>(["stats", "changes", "check"]);

/**
 * Commands that do NOT require a built AST index (work without .gograph/graph.json).
 * `doc` is a thin `go doc` wrapper; future graph-free commands belong here.
 * These skip the ensureReady guard so they work even before the first build.
 */
const GRAPH_FREE_COMMANDS = new Set<string>(["doc"]);

/** Curated one-line docs for known subcommands. Unknown ones get name-only. */
const SUBCOMMAND_DOCS: Record<string, string> = {
  callers: "find all callers of a function. Supports --depth N for transitive callers.",
  callees: "find all functions called from within a target function. Supports --depth N.",
  source: "extract exact source code for a symbol from the AST index.",
  fields: "list all fields of a struct.",
  impact: "calculate transitive downstream blast radius of a symbol. Supports --uncommitted.",
  path: "find shortest call chain (BFS) between two symbols. Requires both target and from.",
  returnusage: "trace how callers consume a function's return values (discarded, assigned, passed, etc.).",
  errorflow: "trace an error string from declaration through return/wrapping up to HTTP entry points.",
  changes: 'find symbols in changed files. Use flags: "--git main".',
  check: "run static policy checks against package boundaries and test requirements. Supports --uncommitted.",
  focus: "get all files, symbols, internal calls, and dependencies for a package.",
  stats: "index health summary: package count, symbol count, call count, etc.",
  dependents: "find all packages that import a given package.",
  usages: "find all places a type appears in signatures and struct fields.",
  literals: "find all struct literal initialization sites.",
  doc: "surface Go documentation for any stdlib or third-party symbol (no graph needed).",
  untested: "sweep for production functions with callers but zero test edges, risk-sorted.",
  httpcalls: "statically extract all outbound net/http client calls; filter by method or URL.",
  diagram: "generate a Mermaid architecture diagram of package dependencies.",
};

// ── Arg builder (exported for testing) ──────────────────────────────────────

interface GenericInput {
  subcommand: string;
  target: string;
  from?: string;
  depth?: number;
  filesOnly?: boolean;
  uncommitted?: boolean;
  flags?: string;
}

/**
 * Build CLI args from typed generic tool params.
 * Validates subcommand-specific requirements.
 * Filters irrelevant flags per subcommand.
 */
export function buildGenericArgs(params: GenericInput): string[] {
  const args: string[] = [params.subcommand];

  // path requires both target and from
  if (params.subcommand === "path") {
    if (!params.from) {
      throw new Error("gograph 'path' subcommand requires both 'target' and 'from'");
    }
    args.push(params.target, params.from);
  } else if (!NO_TARGET_COMMANDS.has(params.subcommand)) {
    args.push(params.target);
  }

  // Typed flags — only for subcommands that support them
  if (params.depth && DEPTH_COMMANDS.has(params.subcommand)) {
    args.push("--depth", String(params.depth));
  }

  if (params.filesOnly && FILES_ONLY_COMMANDS.has(params.subcommand)) {
    args.push("--files-only");
  }

  if (params.uncommitted && UNCOMMITTED_COMMANDS.has(params.subcommand)) {
    args.push("--uncommitted");
  }

  // String fallback flags (go before --json)
  if (params.flags) {
    args.push(...params.flags.split(" ").filter(Boolean));
  }

  args.push("--json");
  return args;
}

/** Build the LLM-facing description listing discovered subcommands dynamically. */
function buildGenericDescription(subcommands: string[]): string {
  const lines = subcommands.map((name) => {
    const doc = SUBCOMMAND_DOCS[name];
    return doc ? `${name} — ${doc}` : name;
  });
  return (
    "Run gograph CLI subcommands for Go code queries not covered by primary tools.\n\n"
    + "Available subcommands (discovered from your installed gograph):\n"
    + lines.map((l) => `- ${l}`).join("\n")
    + "\n\nUse the `flags` parameter for rare flags (--git, --since, --test-only, --no-tests, --precise).\n\n"
    + "Examples:\n"
    + '- callers: gograph(subcommand="callers", target="HandleUser", depth=3)\n'
    + '- path: gograph(subcommand="path", target="HandleUser", from="DB.Save")\n'
    + '- stats: gograph(subcommand="stats", target="")'
  );
}

// ── Tool registration ────────────────────────────────────────────────────────

export function registerGenericTool(pi: ExtensionAPI): void {
  const subcommands = SUBCOMMANDS;

  const GographParams = Type.Object({
    subcommand: Type.Union(
      subcommands.map((name) => Type.Literal(name)),
      { description: "Gograph subcommand" },
    ),
    target: Type.String({
      description: "Primary argument — symbol name, package path, or error term depending on subcommand. Use empty string for stats/changes/check.",
    }),
    from: Type.Optional(
      Type.String({
        description: "Second symbol (for 'path' subcommand: call chain from target → from).",
      }),
    ),
    depth: Type.Optional(
      Type.Number({
        description: "BFS depth 1–10 (callers, callees, path only)",
        minimum: 1,
        maximum: 10,
      }),
    ),
    filesOnly: Type.Optional(
      Type.Boolean({ description: "Return only file paths" }),
    ),
    uncommitted: Type.Optional(
      Type.Boolean({ description: "Check uncommitted changes only" }),
    ),
    flags: Type.Optional(
      Type.String({
        description: "Rare flags: --git <ref>, --since <ref>, --test-only, --no-tests, --precise",
      }),
    ),
  });

  pi.registerTool({
    name: "gograph",
    label: "Gograph",
    description: buildGenericDescription(subcommands),
    promptSnippet: "Go code queries: callers, callees, source, fields, impact, path, returnusage, errorflow, etc.",
    promptGuidelines: [
      "Prefer primary tools (gograph_summary, gograph_plan, gograph_review, gograph_risk, gograph_explain, gograph_context) when they cover your need — they aggregate multiple subcommands in one call.",
      "Use this generic tool only when no primary tool covers the query.",
      'For the "path" subcommand, always provide both "target" and "from".',
      '"doc" works without a built index — use it for stdlib/third-party symbol signatures.',
    ],
    parameters: GographParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      // Graph-free subcommands (e.g. doc) skip the index check.
      if (!GRAPH_FREE_COMMANDS.has(params.subcommand)) {
        await ensureReady(pi, ctx);
      }
      const args = buildGenericArgs(params as unknown as GenericInput);
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { subcommand: params.subcommand, target: params.target, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph "));
      text += theme.fg("accent", args.subcommand);
      if (args.target) text += theme.fg("dim", ` ${args.target}`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Querying..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Done");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      return new Text(text, 0, 0);
    },
  });
}