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
        "Use type-checked analysis for exact interface satisfaction and call edges (slower, requires compilable code). Default: false.",
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
      'Handler name (preferred) or route pattern like "POST /api/users". Returns full vertical slice: handler → call chain → SQL → env reads.',
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
        "Bundle full context (source, callers, callees, role, tests) for every inspect_first symbol. Default: false.",
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

      const args = config.buildArgs(params);
      const output = useBuildLock
        ? await runGographBuild(args, signal, timeout)
        : await runGograph(args, signal, timeout);
      const { text, truncated, totalLines } = formatOutput(output);

      return {
        content: [{ type: "text", text }],
        details: { truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold(config.name + " "));
      text += config.renderCallArgs(args, theme);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Querying..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Done");
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
}

function registerBuildTool(pi: ExtensionAPI): void {
  registerSimpleTool(pi, {
    name: "gograph_build",
    label: "Gograph Build",
    description:
      "Build or rebuild the gograph graph index for this Go project. Run this after major code changes.",
    promptSnippet: "Build/rebuild the gograph AST index",
    promptGuidelines: [
      "Use gograph_build to rebuild the index after making significant code changes before querying gograph again.",
      "Use gograph_build with precise=true when you need exact type-checked interface satisfaction and call edges.",
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
      "Search for Go symbols, files, or packages by name. Use this as a first step to discover symbols.",
    promptSnippet: "Search for Go symbols by name",
    promptGuidelines: [
      "Use gograph_query to discover symbol names when you are unsure of the exact name before using gograph_context.",
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
      "Get a full context bundle for a Go symbol in ONE call: source, callers, callees, and tests. Replaces 4-5 grep/cat reads.",
    promptSnippet: "Get source + callers + callees + tests for a Go symbol",
    promptGuidelines: [
      "Use gograph_context (not grep/cat) to understand any Go symbol — it returns source, callers, callees, and tests in one call.",
      "Use gograph_context before modifying a function to understand its relationships and downstream effects.",
    ],
    parameters: ContextParams,
    buildArgs: (p) => {
      if (p.uncommitted) return ["context", "--uncommitted", "--json"];
      if (p.symbol) return ["context", p.symbol, "--json"];
      throw new Error("Provide either a symbol name or set uncommitted=true.");
    },
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
      "Find all structs that implement a given Go interface.",
    promptSnippet: "Find all structs implementing a Go interface",
    promptGuidelines: [
      "Use gograph_implementers (not grep) to find which structs implement a Go interface.",
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
      "Get a full vertical slice for an HTTP endpoint: handler → call chain → SQL → env reads.",
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
      "Pre-edit change plan. Aggregates callers, tests, blast radius, SQL/env/route exposure into a single checklist. ONE call replaces gograph_context + gograph_impact + gograph_source + gograph_fields + gograph_callers.",
    promptSnippet: "Plan changes for a Go symbol before editing",
    promptGuidelines: [
      "Use gograph_plan BEFORE editing a Go symbol. This ONE call replaces gograph_context + gograph_impact + gograph_source + gograph_fields + gograph_callers called separately.",
      "Use gograph_plan with uncommitted=true to plan for all uncommitted changes at once.",
      "Use gograph_plan with withContext=true to get full context for all inspect_first symbols without follow-up calls.",
      'When the user says "plan", "prepare", "before editing", or "what will be affected" → use gograph_plan, not a sequence of other gograph tools.',
    ],
    parameters: PlanParams,
    buildArgs: (p) => {
      const args: string[] = ["plan"];
      if (p.uncommitted) args.push("--uncommitted");
      else if (p.symbol) args.push(p.symbol);
      else throw new Error("Provide either a symbol name or set uncommitted=true.");
      if (p.withContext) args.push("--with-context");
      args.push("--json");
      return args;
    },
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
      "Get an LLM-ready architectural narrative for a Go symbol in ONE call. Synthesizes callers, callees, complexity, SQL, routes, tests, and role classification. Collapses 6-8 separate tool calls into one.",
    promptSnippet: "Get architectural narrative for a Go symbol",
    promptGuidelines: [
      "Use gograph_explain when you need a comprehensive understanding of a Go symbol's role and relationships. This ONE call replaces gograph_context + gograph_callers + gograph_callees + gograph_fields called separately.",
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
      "Post-edit review. Checks: are all callers tested, did complexity increase, were new SQL or env reads introduced, were any interfaces broken. ONE call replaces gograph_impact + gograph_context + gograph_callers.",
    promptSnippet: "Review Go code changes for issues",
    promptGuidelines: [
      "Use gograph_review AFTER editing Go code to verify nothing is broken. This ONE call replaces gograph_impact + gograph_context + gograph_callers called separately.",
      "Use gograph_review with uncommitted=true to review all uncommitted changes at once.",
      'When the user says "review", "verify", "check my changes", or "did I break anything" → use gograph_review, not a sequence of other gograph tools.',
    ],
    parameters: ReviewParams,
    buildArgs: (p) => {
      const args: string[] = ["review"];
      if (p.uncommitted) args.push("--uncommitted");
      else if (p.symbol) args.push(p.symbol);
      else throw new Error("Provide either a symbol name or set uncommitted=true.");
      args.push("--json");
      return args;
    },
    renderCallArgs: (a, t) =>
      a.uncommitted
        ? t.fg("accent", "--uncommitted")
        : t.fg("accent", `"${a.symbol}"`),
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 3000) ?? ""),
  });
}
