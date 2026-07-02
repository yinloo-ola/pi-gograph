import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, TSchema } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { isGographInstalledSync, gographNotInstalledError } from "./detect.js";
import { runGograph, runGographBuild, formatOutput, ensureReady } from "./runner.js";

// ── Parameter schemas ────────────────────────────────────────────────────────

const BuildParams = Type.Object({
  precise: Type.Optional(
    Type.Boolean({
      description:
        "Use type-checked Class Hierarchy Analysis (CHA) to resolve interface dispatch exactly. Slower, requires compilable code. Default: false.",
    }),
  ),
});

const QueryParams = Type.Object({
  query: Type.String({ description: "Symbol, file, or package name to search for" }),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});

const ContextParams = Type.Object({
  symbol: Type.Optional(
    Type.String({
      description:
        "Symbol name (function, method, struct, interface). Required unless uncommitted=true.",
    }),
  ),
  uncommitted: Type.Optional(
    Type.Boolean({
      description: "Bundle context for all uncommitted modified symbols. Default: false.",
    }),
  ),
});

const ImplementersParams = Type.Object({
  interface: Type.String({ description: "Interface name to find implementations for" }),
  testOnly: Type.Optional(
    Type.Boolean({ description: "Filter to test/mock implementations only. Default: false." }),
  ),
});

const EndpointParams = Type.Object({
  target: Type.String({
    description:
      'Handler symbol name (preferred), route path fragment (e.g. /users), or route pattern (e.g. POST /api/users). Composes: route definition → handler → callee chain (BFS depth 5) → SQL → env reads.',
  }),
});

const PlanParams = Type.Object({
  symbol: Type.Optional(
    Type.String({ description: "Symbol to plan changes for. Required unless uncommitted=true." }),
  ),
  uncommitted: Type.Optional(
    Type.Boolean({ description: "Plan for all uncommitted changes. Default: false." }),
  ),
  withContext: Type.Optional(
    Type.Boolean({
      description:
        "Inline full source/callers/callees for every symbol in the plan. Default: false.",
    }),
  ),
});

const ExplainParams = Type.Object({
  symbol: Type.String({ description: "Symbol name to get an architectural narrative for." }),
});

const ReviewParams = Type.Object({
  symbol: Type.Optional(
    Type.String({ description: "Symbol to review. Required unless uncommitted=true." }),
  ),
  uncommitted: Type.Optional(
    Type.Boolean({ description: "Review all uncommitted changes. Default: false." }),
  ),
  /** Skip the implicit index rebuild. Use only if you've already built recently. Default: false. */
  skipRebuild: Type.Optional(
    Type.Boolean({ description: "Skip the automatic index rebuild before reviewing. Default: false." }),
  ),
});

// ── registerSimpleTool helper ───────────────────────────────────────────────

interface SimpleToolConfig {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: TSchema;
  /** Build CLI args from typed params. */
  buildArgs: (params: any) => string[];
  /** Whether this tool needs ensureReady guard (default: true) */
  needsReady?: boolean;
  /** Whether this tool uses build lock (default: false) */
  useBuildLock?: boolean;
  /** Custom timeout (default: 30_000) */
  timeout?: number;
  /**
   * Optional hook run BEFORE the main command (after ensureReady).
   * Use to chain dependent CLI calls — e.g. rebuild the index
   * before reviewing. Return a short status string for the
   * result header, or null to skip.
   */
  preExecute?: (
    params: any,
    signal: AbortSignal | undefined,
  ) => Promise<string | null>;
  /** Render the args portion of the tool call line (after the tool name) */
  renderCallArgs: (args: any, theme: any) => any;
  /** Render expanded result preview (optional) */
  renderExpanded?: (result: any, theme: any) => any;
}

function registerSimpleTool(pi: ExtensionAPI, config: SimpleToolConfig): void {
  const needsReady = config.needsReady ?? true;
  const useBuildLock = config.useBuildLock ?? false;
  const timeout = config.timeout ?? 30_000;

  pi.registerTool({
    name: config.name,
    label: config.label,
    description: config.description,
    promptSnippet: config.promptSnippet,
    promptGuidelines: config.promptGuidelines,
    parameters: config.parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (needsReady) await ensureReady(pi, ctx);

      const preStatus = config.preExecute
        ? await config.preExecute(params, signal)
        : null;

      const args = config.buildArgs(params);
      const output = useBuildLock
        ? await runGographBuild(args, signal, timeout)
        : await runGograph(args, signal, timeout);
      const { text, truncated, totalLines } = formatOutput(output);

      const details: { truncated?: boolean; totalLines: number; preStatus?: string } = {
        truncated,
        totalLines,
      };
      if (preStatus) details.preStatus = preStatus;

      return {
        content: [{ type: "text", text }],
        details,
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold(config.name + " "));
      text += config.renderCallArgs(args, theme);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Querying..."), 0, 0);
      const details = result.details as { truncated?: boolean; preStatus?: string } | undefined;
      let text = theme.fg("success", "✓ Done");
      if (details?.preStatus) text += theme.fg("dim", ` (${details.preStatus})`);
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text" && config.renderExpanded) {
        text += "\n" + config.renderExpanded(result, theme);
      }
      return new Text(text, 0, 0);
    },
  });
}

// ── Tool registration ────────────────────────────────────────────────────────

export function registerTools(pi: ExtensionAPI): void {
  registerBuildTool(pi);
  registerQueryTool(pi);
  registerContextTool(pi);
  registerImplementersTool(pi);
  registerEndpointTool(pi);
  registerPlanTool(pi);
  registerExplainTool(pi);
  registerReviewTool(pi);
  registerRiskTool(pi);
  registerSummaryTool(pi);
}

function registerBuildTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_build",
    label: "Gograph Build",
    description:
      "Build or rebuild the gograph AST index. Parses the Go repository and generates the structured call graph."
      + " Run after significant code changes so subsequent queries reflect the current code."
      + " With precise=true, enables type-checked Class Hierarchy Analysis (CHA) to resolve interface dispatch exactly — slower but exact.",
    promptSnippet: "Rebuild the gograph AST index",
    promptGuidelines: [
      "Run gograph_build after significant code changes (new functions, renamed symbols, moved packages) so queries stay accurate.",
      "Use precise=true when you need exact interface dispatch resolution — it requires the code to compile.",
    ],
    parameters: BuildParams,
    buildArgs: (p) => {
      if (!isGographInstalledSync()) {
        throw gographNotInstalledError();
      }
      const args = ["build", "."];
      if (p.precise) args.push("--precise");
      return args;
    },
    needsReady: false,
    useBuildLock: true,
    timeout: 60_000,
    renderCallArgs: (a, t) => a.precise ? t.fg("accent", "--precise") : t.fg("dim", "(standard)"),
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 2000) ?? ""),
  });
}

function registerQueryTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_query",
    label: "Gograph Query",
    description:
      "Case-insensitive substring search across symbol names, file paths, package names, and call sites."
      + " Multiple terms are OR-matched. Use this to discover exact symbol names before querying with other tools.",
    promptSnippet: "Search for Go symbols by name",
    promptGuidelines: [
      "Use gograph_query when you know a partial name but need the exact symbol name for other gograph tools.",
    ],
    parameters: QueryParams,
    buildArgs: (p) => {
      const args: string[] = ["query", p.query];
      if (p.filesOnly) args.push("--files-only");
      args.push("--json");
      return args;
    },
    renderCallArgs: (a, t) => t.fg("accent", `"${a.query}"`),
  });
}

function registerContextTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_context",
    label: "Gograph Context",
    description:
      "Gather all structural details for a symbol in one call: AST metadata, exact source code, caller list, callee list, test list, and architectural role classification."
      + " With uncommitted=true, bundles context for all uncommitted modified symbols.",
    promptSnippet: "Get full structural context for a Go symbol",
    promptGuidelines: [
      "Use gograph_context to understand a symbol before modifying it — it returns source, callers, callees, tests, and role in one call.",
      "Use gograph_context with uncommitted=true to get context for everything you've changed but not yet committed.",
    ],
    parameters: ContextParams,
    buildArgs: contextBuildArgs,
    renderCallArgs: (a, t) =>
      a.uncommitted ? t.fg("accent", "--uncommitted") : t.fg("accent", `"${a.symbol}"`),
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 3000) ?? ""),
  });
}

function registerImplementersTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_implementers",
    label: "Gograph Implementers",
    description:
      "Find all structs that satisfy a given Go interface via duck-typing."
      + " With testOnly=true, restricts results to structs defined in test or mock files.",
    promptSnippet: "Find structs implementing a Go interface",
    promptGuidelines: [
      "Use gograph_implementers to find concrete types satisfying an interface before adding or changing interface methods.",
      "Use testOnly=true when you need to find existing test doubles for an interface.",
    ],
    parameters: ImplementersParams,
    buildArgs: (p) => {
      const args: string[] = ["implementers", p.interface];
      if (p.testOnly) args.push("--test-only");
      args.push("--json");
      return args;
    },
    renderCallArgs: (a, t) => {
      let text = t.fg("accent", `"${a.interface}"`);
      if (a.testOnly) text += t.fg("accent", " --test-only");
      return text;
    },
  });
}

function registerEndpointTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_endpoint",
    label: "Gograph Endpoint",
    description:
      "Generate a complete vertical slice report for an HTTP endpoint."
      + " Composes: route definition + handler function + full downstream callee chain (BFS, default depth 5) + SQL queries + env vars read."
      + " Accepts handler symbol name, route path fragment (e.g. /users), or route pattern (e.g. POST /api/users).",
    promptSnippet: "Get full vertical slice for an HTTP endpoint",
    promptGuidelines: [
      "Use gograph_endpoint to understand the full call chain of an HTTP handler from entry to database.",
    ],
    parameters: EndpointParams,
    buildArgs: (p) => ["endpoint", p.target, "--json"],
    renderCallArgs: (a, t) => t.fg("accent", `"${a.target}"`),
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 3000) ?? ""),
  });
}

function registerPlanTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_plan",
    label: "Gograph Plan",
    description:
      "Generate a pre-edit change-impact plan. Returns: affected callers, tests to run, blast radius, SQL writes, env reads, and route exposure."
      + " With uncommitted=true, generates a joint plan for all uncommitted modified symbols."
      + " With withContext=true, inlines full source/callers/callees for every symbol in the plan.",
    promptSnippet: "Plan changes for a Go symbol before editing",
    promptGuidelines: [
      "Use gograph_plan BEFORE editing a Go symbol to understand the blast radius — callers, tests, SQL writes, env reads, and route exposure in one call.",
      "Use gograph_plan with uncommitted=true to plan for all uncommitted changes at once.",
      "Use gograph_plan with withContext=true to get full context for all inspect_first symbols without follow-up calls.",
      'When the user says "plan", "prepare", "before editing", or "what will be affected" → use gograph_plan, not a sequence of other gograph tools.',
    ],
    parameters: PlanParams,
    buildArgs: planBuildArgs,
    renderCallArgs: (a, t) => {
      let text = a.uncommitted
        ? t.fg("accent", "--uncommitted")
        : t.fg("accent", `"${a.symbol}"`);
      if (a.withContext) text += t.fg("accent", " --with-context");
      return text;
    },
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 3000) ?? ""),
  });
}

function registerExplainTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_explain",
    label: "Gograph Explain",
    description:
      "Synthesize AST data into a rich architectural narrative for any Go symbol."
      + " Returns: symbol purpose, prod vs test split, McCabe cyclomatic complexity, SQL queries, env vars, matching HTTP routes, interface satisfaction, and role classification (e.g. HTTP handler, orchestrator, utility).",
    promptSnippet: "Get architectural narrative for a Go symbol",
    promptGuidelines: [
      "Use gograph_explain when you need a comprehensive understanding of a Go symbol — purpose, complexity, callers, callees, SQL, routes, and role classification in one call.",
      'When the user says "explain", "understand", "what does X do", or "tell me about" → use gograph_explain, not a sequence of other gograph tools.',
    ],
    parameters: ExplainParams,
    buildArgs: (p) => ["explain", p.symbol, "--json"],
    renderCallArgs: (a, t) => t.fg("accent", `"${a.symbol}"`),
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 3000) ?? ""),
  });
}

function registerReviewTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_review",
    label: "Gograph Review",
    description:
      "Post-edit verification. Returns: code changes, complexity drift, test coverage status, and risk evaluation."
      + " With uncommitted=true, reviews all uncommitted changes."
      + " Automatically rebuilds the AST index first so the review reflects your latest edits. Use skipRebuild=true to skip.",
    promptSnippet: "Review Go code changes for issues",
    promptGuidelines: [
      "Use gograph_review AFTER editing Go code to verify nothing is broken — checks complexity drift, test coverage, and risk.",
      "Use gograph_review with uncommitted=true to review all uncommitted changes at once.",
      'When the user says "review", "verify", "check my changes", or "did I break anything" → use gograph_review, not a sequence of other gograph tools.',
    ],
    parameters: ReviewParams,
    buildArgs: reviewBuildArgs,
    preExecute: async (p, signal) => {
      if (p.skipRebuild) return null;
      try {
        await runGographBuild(["build", "."], signal, 60_000);
        return "index rebuilt";
      } catch (err) {
        return `rebuild failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    useBuildLock: true,
    timeout: 60_000,
    renderCallArgs: (a, t) =>
      a.uncommitted
        ? t.fg("accent", "--uncommitted")
        : t.fg("accent", `"${a.symbol}"`),
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 3000) ?? ""),
  });
}
// ── buildArgs helpers (extracted for testability) ────────────────────────────

/** Build `gograph context` CLI args. Throws if neither symbol nor uncommitted is set. */
export function contextBuildArgs(p: { symbol?: string; uncommitted?: boolean }): string[] {
  if (p.uncommitted) return ["context", "--uncommitted", "--json"];
  if (p.symbol) return ["context", p.symbol, "--json"];
  throw new Error("Provide either a symbol name or set uncommitted=true.");
}

/** Build `gograph plan` CLI args. Throws if neither symbol nor uncommitted is set. */
export function planBuildArgs(p: { symbol?: string; uncommitted?: boolean; withContext?: boolean }): string[] {
  const args: string[] = ["plan"];
  if (p.uncommitted) args.push("--uncommitted");
  else if (p.symbol) args.push(p.symbol);
  else throw new Error("Provide either a symbol name or set uncommitted=true.");
  if (p.withContext) args.push("--with-context");
  args.push("--json");
  return args;
}

/** Build `gograph review` CLI args. Throws if neither symbol nor uncommitted is set. */
export function reviewBuildArgs(p: { symbol?: string; uncommitted?: boolean }): string[] {
  const args: string[] = ["review"];
  if (p.uncommitted) args.push("--uncommitted");
  else if (p.symbol) args.push(p.symbol);
  else throw new Error("Provide either a symbol name or set uncommitted=true.");
  args.push("--json");
  return args;
}
// ── Upstream-sync tools (risk, summary) ─────────────────────────────────────
//
// These wrap gograph's aggregator commands promoted to primary-tool status
// (see docs/plans/2026-07-01-upstream-sync-decisions.md). Each is a thin
// registerSimpleTool config: typed params + buildArgs + prompt routing. The
// behavior comes from the gograph CLI; our code only routes args. buildArgs is
// extracted as an exported pure function so it can be unit-tested directly.

const RiskParams = Type.Object({
  symbol: Type.Optional(
    Type.String({ description: "Symbol to score. Required unless uncommitted=true." }),
  ),
  uncommitted: Type.Optional(
    Type.Boolean({ description: "Score all uncommitted changes. Default: false." }),
  ),
});

const SummaryParams = Type.Object({});

/** Build `gograph risk` CLI args. Throws if neither symbol nor uncommitted is set. */
export function riskBuildArgs(p: { symbol?: string; uncommitted?: boolean }): string[] {
  const args: string[] = ["risk"];
  if (p.uncommitted) {
    args.push("--uncommitted");
  } else if (p.symbol) {
    args.push(p.symbol);
  } else {
    throw new Error("Provide either a symbol name or set uncommitted=true.");
  }
  args.push("--json");
  return args;
}

/** Build `gograph summary` CLI args. */
export function summaryBuildArgs(): string[] {
  return ["summary", "--json"];
}

/** Register `gograph_risk` — a 0–100 change-risk score with a SAFE/REVIEW/DANGER verdict. */
export function registerRiskTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_risk",
    label: "Gograph Risk",
    description:
      "Normalized 0–100 change-risk score with a SAFE / REVIEW / DANGER verdict, fusing blast radius,"
      + " cyclomatic complexity, test coverage, exported-API surface, and downstream SQL/env dependencies."
      + " With uncommitted=true, scores all uncommitted changes.",
    promptSnippet: "Change risk score for a Go symbol (SAFE/REVIEW/DANGER)",
    promptGuidelines: [
      "Use gograph_risk to get a SAFE/REVIEW/DANGER verdict before committing a change — it fuses blast radius, complexity, coverage, API, and SQL/env in one call.",
      "Use gograph_risk with uncommitted=true to score all uncommitted changes at once.",
      'When the user says "how risky", "is this safe", "should I worry", or "impact" → use gograph_risk, not a sequence of other gograph tools.',
    ],
    parameters: RiskParams,
    buildArgs: riskBuildArgs,
    renderCallArgs: (a, t) =>
      a.uncommitted ? t.fg("accent", "--uncommitted") : t.fg("accent", `"${a.symbol}"`),
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 3000) ?? ""),
  });
}

/** Register `gograph_summary` — a single-call codebase briefing (session-start anchor). */
export function registerSummaryTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_summary",
    label: "Gograph Summary",
    description:
      "Single-call codebase briefing: top hotspots, worst package instability, highest cyclomatic complexity,"
      + " orphan count, and god-object count. The session-start anchor that replaces 5 separate orientation calls.",
    promptSnippet: "One-call codebase briefing (hotspots, coupling, complexity, orphans)",
    promptGuidelines: [
      "Use gograph_summary at the start of a session to orient on a Go codebase in one call — hotspots, worst instability, top complexity, orphans, god objects.",
      'When the user says "give me an overview", "orient me", "what does this codebase look like", or "where are the hotspots" → use gograph_summary, not a sequence of other gograph tools.',
    ],
    parameters: SummaryParams,
    buildArgs: summaryBuildArgs,
    renderCallArgs: () => "",
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 3000) ?? ""),
  });
}
