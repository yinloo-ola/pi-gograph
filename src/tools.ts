import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { isGographInstalled, hasIndex } from "./detect.js";
import { runGograph, formatOutput } from "./runner.js";
import {
  clearBackgroundStatus,
  getCurrentIndexState,
  scheduleBackgroundRefresh,
  writeIndexState,
} from "./refresh.js";

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

const ImpactParams = Type.Object({
  symbol: Type.Optional(
    Type.String({ description: "Symbol name to check blast radius for" }),
  ),
  uncommitted: Type.Optional(
    Type.Boolean({
      description: "Calculate blast radius of all uncommitted code changes. Default: false.",
    }),
  ),
  since: Type.Optional(
    Type.String({ description: "Git ref — blast radius of all symbols changed since that ref (e.g. 'main', 'v1.0')." }),
  ),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});

const SourceParams = Type.Object({
  symbol: Type.String({ description: "Symbol name to extract source code for" }),
});

const CallersParams = Type.Object({
  symbol: Type.String({ description: "Function or method name" }),
  depth: Type.Optional(
    Type.Number({ description: "BFS depth (1–10). Default: 1 (direct callers only).", minimum: 1, maximum: 10 }),
  ),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});

const CalleesParams = Type.Object({
  symbol: Type.String({ description: "Function or method name" }),
  depth: Type.Optional(
    Type.Number({ description: "BFS depth (1–10). Default: 1 (direct callees only).", minimum: 1, maximum: 10 }),
  ),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});

const EndpointParams = Type.Object({
  target: Type.String({
    description:
      'Handler name (preferred) or route pattern like "POST /api/users". Returns full vertical slice: handler → call chain → SQL → env reads.',
  }),
});

const CheckParams = Type.Object({
  uncommitted: Type.Optional(
    Type.Boolean({
      description: "Check uncommitted changes only. Default: true.",
    }),
  ),
});

const FocusParams = Type.Object({
  package: Type.String({ description: "Package path to focus on (e.g. internal/auth)" }),
});

const FieldsParams = Type.Object({
  struct: Type.String({ description: "Struct name to extract fields for" }),
});

const PathParams = Type.Object({
  from: Type.String({ description: "Starting symbol name" }),
  to: Type.String({ description: "Target symbol name" }),
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
        "Bundle full context (source, callers, callees, role, tests) for every inspect_first symbol. Eliminates N follow-up context calls. Default: false.",
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

const ReturnUsageParams = Type.Object({
  symbol: Type.String({ description: "Function name to check how callers consume its return value." }),
});

const ErrorFlowParams = Type.Object({
  term: Type.String({ description: "Error string or search term to trace through the call chain." }),
  noTests: Type.Optional(
    Type.Boolean({ description: "Skip collecting related tests. Default: false." }),
  ),
});

const ChangesParams = Type.Object({
  git: Type.Optional(
    Type.String({ description: "Git ref to compare against (e.g. 'main', 'HEAD~5', 'v1.0'). Returns symbols in files changed since that ref." }),
  ),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths, not symbols. Default: false." }),
  ),
});

const StatsParams = Type.Object({});

const DependentsParams = Type.Object({
  package: Type.String({ description: "Package name, path suffix, or full import path." }),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});

const UsagesParams = Type.Object({
  type: Type.String({ description: "Type name to search usages for." }),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});

const LiteralsParams = Type.Object({
  struct: Type.String({ description: "Struct name to find composite-literal initialization sites for." }),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});

// ── Guard helper ─────────────────────────────────────────────────────────────

async function ensureReady(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  scheduleBackgroundRefresh(pi, ctx.cwd, ctx.ui);

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

// ── Tool registration ────────────────────────────────────────────────────────

export function registerTools(pi: ExtensionAPI): void {
  registerBuildTool(pi);
  registerQueryTool(pi);
  registerContextTool(pi);
  registerImplementersTool(pi);
  registerImpactTool(pi);
  registerSourceTool(pi);
  registerCallersTool(pi);
  registerCalleesTool(pi);
  registerEndpointTool(pi);
  registerCheckTool(pi);
  registerFocusTool(pi);
  registerFieldsTool(pi);
  registerPathTool(pi);
  registerPlanTool(pi);
  registerExplainTool(pi);
  registerReviewTool(pi);
  registerReturnUsageTool(pi);
  registerErrorFlowTool(pi);
  registerChangesTool(pi);
  registerStatsTool(pi);
  registerDependentsTool(pi);
  registerUsagesTool(pi);
  registerLiteralsTool(pi);
}

function registerBuildTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_build",
    label: "Gograph Build",
    description:
      "Build or rebuild the gograph graph index for this Go project. Run this after major code changes. " +
      "Generates .gograph/graph.json used by all other gograph tools.",
    promptSnippet: "Build/rebuild the gograph AST index for Go code navigation",
    promptGuidelines: [
      "Use gograph_build to rebuild the index after making significant code changes before querying gograph again.",
      "Use gograph_build with precise=true when you need exact type-checked interface satisfaction and call edges.",
    ],
    parameters: BuildParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!(await isGographInstalled())) {
        throw new Error(
          "gograph is not installed. Run `/gograph-setup` or: brew install ozgurcd/tap/gograph",
        );
      }

      clearBackgroundStatus();

      const currentState = await getCurrentIndexState(pi, ctx.cwd);

      const args = ["build", "."];
      if (params.precise) args.push("--precise");
      const output = await runGograph(args, signal, 60_000);
      if (currentState) {
        await writeIndexState(ctx.cwd, currentState);
      }
      const { text } = formatOutput(output);
      return {
        content: [{ type: "text", text: text || "Index built successfully." }],
        details: { precise: params.precise ?? false },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_build "));
      if (args.precise) text += theme.fg("accent", "--precise");
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Building index..."), 0, 0);
      return new Text(theme.fg("success", "✓ Index built"), 0, 0);
    },
  });
}

function registerQueryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_query",
    label: "Gograph Query",
    description:
      "Search for Go symbols, files, or packages by name. Returns matching symbols with their types, locations, and signatures. " +
      "Use this as a first step to discover symbols before using gograph_context or gograph_source.",
    promptSnippet: "Search for Go symbols, files, or packages by name",
    promptGuidelines: [
      "Use gograph_query to discover symbol names when you are unsure of the exact name before using gograph_context.",
    ],
    parameters: QueryParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["query", params.query, "--json"];
      if (params.filesOnly) args.push("--files-only");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { query: params.query, filesOnly: params.filesOnly ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_query "));
      text += theme.fg("accent", `"${args.query}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
      const details = result.details as { query: string; truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Results found");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 2000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerContextTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_context",
    label: "Gograph Context",
    description:
      "Get a full context bundle for a Go symbol in ONE call: node info, source code, callers, callees, and related tests. " +
      "This replaces 4-5 separate grep/cat reads and saves thousands of tokens.",
    promptSnippet: "Get source + callers + callees + tests for a Go symbol in one call",
    promptGuidelines: [
      "Use gograph_context (not grep/cat) to understand any Go symbol — it returns source, callers, callees, and tests in one call.",
      "Use gograph_context before modifying a function to understand its relationships and downstream effects.",
    ],
    parameters: ContextParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      let args: string[];
      if (params.uncommitted) {
        args = ["context", "--uncommitted", "--json"];
      } else if (params.symbol) {
        args = ["context", params.symbol, "--json"];
      } else {
        throw new Error("Provide either a symbol name or set uncommitted=true.");
      }
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, uncommitted: params.uncommitted ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_context "));
      if (args.uncommitted) {
        text += theme.fg("accent", "--uncommitted");
      } else {
        text += theme.fg("accent", `"${args.symbol}"`);
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Analyzing..."), 0, 0);
      const details = result.details as { symbol?: string; uncommitted?: boolean; truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Context retrieved");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerImplementersTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_implementers",
    label: "Gograph Implementers",
    description:
      "Find all structs that implement a given Go interface. Returns exact struct names and file paths.",
    promptSnippet: "Find all structs implementing a Go interface",
    promptGuidelines: [
      "Use gograph_implementers (not grep) to find which structs implement a Go interface.",
    ],
    parameters: ImplementersParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["implementers", params.interface];
      if (params.testOnly) args.push("--test-only");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { interface: params.interface, testOnly: params.testOnly ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_implementers "));
      text += theme.fg("accent", `"${args.interface}"`);
      if (args.testOnly) text += theme.fg("accent", " --test-only");
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching implementations..."), 0, 0);
      return new Text(theme.fg("success", "✓ Implementations found"), 0, 0);
    },
  });
}

function registerImpactTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_impact",
    label: "Gograph Impact",
    description:
      "Calculate the blast radius of a Go symbol or uncommitted changes. Shows all downstream callers affected by a change.",
    promptSnippet: "Check blast radius before modifying a Go function",
    promptGuidelines: [
      "Use gograph_impact before changing a Go function to see all downstream callers that would be affected.",
      "Use gograph_impact with uncommitted=true to check blast radius of all uncommitted changes.",
    ],
    parameters: ImpactParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["impact"];
      if (params.uncommitted) {
        args.push("--uncommitted");
      } else if (params.symbol) {
        args.push(params.symbol);
      } else if (params.since) {
        args.push("--since", params.since);
      } else {
        throw new Error("Provide either a symbol name, uncommitted=true, or since=<git ref>.");
      }
      if (params.filesOnly) args.push("--files-only");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, uncommitted: params.uncommitted ?? false, since: params.since, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_impact "));
      if (args.uncommitted) {
        text += theme.fg("accent", "--uncommitted");
      } else if (args.since) {
        text += theme.fg("accent", `--since "${args.since}"`);
      } else {
        text += theme.fg("accent", `"${args.symbol}"`);
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Calculating impact..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Impact analyzed");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerSourceTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_source",
    label: "Gograph Source",
    description:
      "Extract the source code of a Go symbol (function, struct, interface, method) without reading the entire file.",
    promptSnippet: "Extract source code of a Go symbol without reading the whole file",
    promptGuidelines: [
      "Use gograph_source to read a specific Go function/struct/interface — it extracts only that symbol's source, not the whole file.",
    ],
    parameters: SourceParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const output = await runGograph(["source", params.symbol, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_source "));
      text += theme.fg("accent", `"${args.symbol}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Extracting..."), 0, 0);
      if (expanded && result.content[0]?.type === "text") {
        return new Text(theme.fg("dim", result.content[0].text), 0, 0);
      }
      return new Text(theme.fg("success", "✓ Source extracted"), 0, 0);
    },
  });
}

function registerCallersTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_callers",
    label: "Gograph Callers",
    description: "Find all functions that call a given Go function or method.",
    promptSnippet: "Find all callers of a Go function",
    promptGuidelines: [
      "Use gograph_callers to find what functions call a given Go function.",
    ],
    parameters: CallersParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["callers", params.symbol];
      if (params.depth && params.depth > 1) args.push("--depth", String(params.depth));
      if (params.filesOnly) args.push("--files-only");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, depth: params.depth ?? 1, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_callers "));
      text += theme.fg("accent", `"${args.symbol}"`);
      if (args.depth && args.depth > 1) text += theme.fg("accent", ` --depth ${args.depth}`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching callers..."), 0, 0);
      return new Text(theme.fg("success", "✓ Callers found"), 0, 0);
    },
  });
}

function registerCalleesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_callees",
    label: "Gograph Callees",
    description: "Find all functions called by a given Go function or method.",
    promptSnippet: "Find all callees of a Go function",
    promptGuidelines: [
      "Use gograph_callees to find what functions a given Go function calls.",
    ],
    parameters: CalleesParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["callees", params.symbol];
      if (params.depth && params.depth > 1) args.push("--depth", String(params.depth));
      if (params.filesOnly) args.push("--files-only");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, depth: params.depth ?? 1, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_callees "));
      text += theme.fg("accent", `"${args.symbol}"`);
      if (args.depth && args.depth > 1) text += theme.fg("accent", ` --depth ${args.depth}`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching callees..."), 0, 0);
      return new Text(theme.fg("success", "✓ Callees found"), 0, 0);
    },
  });
}

function registerEndpointTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_endpoint",
    label: "Gograph Endpoint",
    description:
      'Get a full vertical slice for an HTTP endpoint: handler → call chain → SQL → env reads.',
    promptSnippet: "Get full vertical slice for an HTTP endpoint",
    promptGuidelines: [
      "Use gograph_endpoint to understand the full call chain of an HTTP handler from entry to database.",
    ],
    parameters: EndpointParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const output = await runGograph(["endpoint", params.target, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { target: params.target, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_endpoint "));
      text += theme.fg("accent", `"${args.target}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Tracing endpoint..."), 0, 0);
      if (expanded && result.content[0]?.type === "text") {
        return new Text(theme.fg("dim", result.content[0].text.slice(0, 3000)), 0, 0);
      }
      return new Text(theme.fg("success", "✓ Endpoint traced"), 0, 0);
    },
  });
}

function registerCheckTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_check",
    label: "Gograph Check",
    description:
      "Check uncommitted code changes for architectural boundary violations, test requirements, or excessive complexity.",
    promptSnippet: "Check uncommitted changes for architectural issues",
    promptGuidelines: [
      "Use gograph_check after making code changes to verify they don't violate architectural boundaries.",
    ],
    parameters: CheckParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args = ["check"];
      if (params.uncommitted !== false) args.push("--uncommitted");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { uncommitted: params.uncommitted ?? true, truncated, totalLines },
      };
    },
    renderCall(_args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_check "));
      text += theme.fg("accent", "--uncommitted");
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Checking..."), 0, 0);
      return new Text(theme.fg("success", "✓ Check complete"), 0, 0);
    },
  });
}

function registerFocusTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_focus",
    label: "Gograph Focus",
    description:
      "Generate a highly targeted context summary for a specific Go package.",
    promptSnippet: "Get targeted context summary for a Go package",
    promptGuidelines: [
      "Use gograph_focus to understand a Go package's structure without reading every file in it.",
    ],
    parameters: FocusParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const output = await runGograph(["focus", params.package, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { package: params.package, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_focus "));
      text += theme.fg("accent", `"${args.package}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Focusing..."), 0, 0);
      return new Text(theme.fg("success", "✓ Package context ready"), 0, 0);
    },
  });
}

function registerFieldsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_fields",
    label: "Gograph Fields",
    description: "Extract all fields and their types from a Go struct.",
    promptSnippet: "Extract all fields and types from a Go struct",
    promptGuidelines: [
      "Use gograph_fields to see all fields of a Go struct without reading the full file.",
    ],
    parameters: FieldsParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const output = await runGograph(["fields", params.struct, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { struct: params.struct, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_fields "));
      text += theme.fg("accent", `"${args.struct}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Extracting fields..."), 0, 0);
      return new Text(theme.fg("success", "✓ Fields extracted"), 0, 0);
    },
  });
}

function registerPathTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_path",
    label: "Gograph Path",
    description: "Find the shortest call chain between two Go symbols via BFS.",
    promptSnippet: "Find shortest call chain between two Go symbols",
    promptGuidelines: [
      "Use gograph_path to discover how two Go symbols are connected through the call graph.",
    ],
    parameters: PathParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const output = await runGograph(["path", params.from, params.to, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { from: params.from, to: params.to, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_path "));
      text += theme.fg("accent", `"${args.from}" → "${args.to}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Finding path..."), 0, 0);
      return new Text(theme.fg("success", "✓ Path found"), 0, 0);
    },
  });
}

function registerPlanTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_plan",
    label: "Gograph Plan",
    description:
      "Pre-edit change plan for a Go symbol. Aggregates callers, tests, blast radius, SQL/env/route exposure into a single checklist before modifying code. " +
      "Use with withContext=true to bundle full context for every inspect_first symbol in one call.",
    promptSnippet: "Plan changes for a Go symbol before editing",
    promptGuidelines: [
      "Use gograph_plan BEFORE editing a Go symbol to understand what will be affected.",
      "Use gograph_plan with uncommitted=true to plan for all uncommitted changes at once.",
      "Use gograph_plan with withContext=true to get full context for all inspect_first symbols without follow-up calls.",
    ],
    parameters: PlanParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["plan"];
      if (params.uncommitted) {
        args.push("--uncommitted");
      } else if (params.symbol) {
        args.push(params.symbol);
      } else {
        throw new Error("Provide either a symbol name or set uncommitted=true.");
      }
      if (params.withContext) args.push("--with-context");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, uncommitted: params.uncommitted ?? false, withContext: params.withContext ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_plan "));
      if (args.uncommitted) {
        text += theme.fg("accent", "--uncommitted");
      } else {
        text += theme.fg("accent", `"${args.symbol}"`);
      }
      if (args.withContext) text += theme.fg("accent", " --with-context");
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Planning..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Plan ready");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerExplainTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_explain",
    label: "Gograph Explain",
    description:
      "Get an LLM-ready architectural narrative for a Go symbol in ONE call. Synthesizes callers, callees, complexity, SQL, routes, tests, and role classification. Collapses 6-8 separate tool calls into one.",
    promptSnippet: "Get architectural narrative for a Go symbol",
    promptGuidelines: [
      "Use gograph_explain when you need a comprehensive understanding of a Go symbol's role and relationships.",
    ],
    parameters: ExplainParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const output = await runGograph(["explain", params.symbol, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_explain "));
      text += theme.fg("accent", `"${args.symbol}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Explaining..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Explanation ready");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerReviewTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_review",
    label: "Gograph Review",
    description:
      "Post-edit review for a Go symbol or uncommitted changes. Checks: are all callers tested, did complexity increase, were new SQL or env reads introduced, were any interfaces broken. Run after editing, before committing.",
    promptSnippet: "Review Go code changes for issues",
    promptGuidelines: [
      "Use gograph_review AFTER editing Go code to verify nothing is broken before committing.",
      "Use gograph_review with uncommitted=true to review all uncommitted changes at once.",
    ],
    parameters: ReviewParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["review"];
      if (params.uncommitted) {
        args.push("--uncommitted");
      } else if (params.symbol) {
        args.push(params.symbol);
      } else {
        throw new Error("Provide either a symbol name or set uncommitted=true.");
      }
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, uncommitted: params.uncommitted ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_review "));
      if (args.uncommitted) {
        text += theme.fg("accent", "--uncommitted");
      } else {
        text += theme.fg("accent", `"${args.symbol}"`);
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Reviewing..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Review complete");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerReturnUsageTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_returnusage",
    label: "Gograph Return Usage",
    description:
      "Shows how each caller consumes a function's return value (discarded, assigned, returned, goroutine, deferred, passed). Critical before changing a return signature.",
    promptSnippet: "Check how callers consume a Go function's return value",
    promptGuidelines: [
      "Use gograph_returnusage before changing a Go function's return signature to see which callers silently discard the return.",
    ],
    parameters: ReturnUsageParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const output = await runGograph(["returnusage", params.symbol, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_returnusage "));
      text += theme.fg("accent", `"${args.symbol}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Analyzing return usage..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Return usage found");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerErrorFlowTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_errorflow",
    label: "Gograph Error Flow",
    description:
      "Trace an error string from its definition up through the call chain to HTTP handlers. Uses AST heuristics — no SSA required.",
    promptSnippet: "Trace a Go error string through the call chain",
    promptGuidelines: [
      "Use gograph_errorflow to understand where an error originates and how it propagates to handlers.",
    ],
    parameters: ErrorFlowParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["errorflow", params.term];
      if (params.noTests) args.push("--no-tests");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { term: params.term, noTests: params.noTests ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_errorflow "));
      text += theme.fg("accent", `"${args.term}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Tracing error flow..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Error flow traced");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerChangesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_changes",
    label: "Gograph Changes",
    description:
      "Find symbols in changed files. Default mode uses file modification times. Use git ref to scope changes to a branch or release.",
    promptSnippet: "Find changed Go symbols",
    promptGuidelines: [
      "Use gograph_changes to find what symbols have changed before running impact analysis.",
      "Use gograph_changes with a git ref to scope changes to a PR branch.",
    ],
    parameters: ChangesParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["changes"];
      if (params.git) {
        args.push("--git", params.git);
      }
      if (params.filesOnly) args.push("--files-only");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { git: params.git, filesOnly: params.filesOnly ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_changes "));
      if (args.git) {
        text += theme.fg("accent", `--git "${args.git}"`);
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Finding changes..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Changes found");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerStatsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_stats",
    label: "Gograph Stats",
    description:
      "Index health summary — schema version, timestamp, symbol/package/call counts. Zero-parse sanity check.",
    promptSnippet: "Check gograph index health and stats",
    promptGuidelines: [
      "Use gograph_stats at the start of a session to confirm the index is populated and current.",
    ],
    parameters: StatsParams,
    async execute(_toolCallId, _params, signal, _onUpdate, _ctx) {
      // No ensureReady — stats is useful even with a stale or empty index
      const output = await runGograph(["stats", "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { truncated, totalLines },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("gograph_stats")), 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Fetching stats..."), 0, 0);
      if (expanded && result.content[0]?.type === "text") {
        return new Text(theme.fg("dim", result.content[0].text.slice(0, 3000)), 0, 0);
      }
      return new Text(theme.fg("success", "✓ Stats retrieved"), 0, 0);
    },
  });
}

function registerDependentsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_dependents",
    label: "Gograph Dependents",
    description:
      "Find all packages that import a given package — the inverse of deps. Accepts short name, path suffix, or full import path.",
    promptSnippet: "Find packages that import a Go package",
    promptGuidelines: [
      "Use gograph_dependents to understand the blast radius of changing a Go package's API.",
    ],
    parameters: DependentsParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["dependents", params.package];
      if (params.filesOnly) args.push("--files-only");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { package: params.package, filesOnly: params.filesOnly ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_dependents "));
      text += theme.fg("accent", `"${args.package}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching dependents..."), 0, 0);
      return new Text(theme.fg("success", "✓ Dependents found"), 0, 0);
    },
  });
}

function registerUsagesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_usages",
    label: "Gograph Usages",
    description:
      "Find every place a named type is referenced in function signatures, struct fields, and interface methods. Shows the true blast radius of a type change.",
    promptSnippet: "Find all usages of a Go type",
    promptGuidelines: [
      "Use gograph_usages before changing a Go type to see all references across the codebase.",
    ],
    parameters: UsagesParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["usages", params.type];
      if (params.filesOnly) args.push("--files-only");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { type: params.type, filesOnly: params.filesOnly ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_usages "));
      text += theme.fg("accent", `"${args.type}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching usages..."), 0, 0);
      return new Text(theme.fg("success", "✓ Usages found"), 0, 0);
    },
  });
}

function registerLiteralsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_literals",
    label: "Gograph Literals",
    description:
      "Find every composite-literal initialization site for a struct (Foo{Field: val}). Catches initialization sites that constructors miss.",
    promptSnippet: "Find all struct literal initialization sites",
    promptGuidelines: [
      "Use gograph_literals before adding a required field to a struct to find all initialization sites.",
    ],
    parameters: LiteralsParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
      const args: string[] = ["literals", params.struct];
      if (params.filesOnly) args.push("--files-only");
      args.push("--json");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { struct: params.struct, filesOnly: params.filesOnly ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_literals "));
      text += theme.fg("accent", `"${args.struct}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching literals..."), 0, 0);
      return new Text(theme.fg("success", "✓ Literals found"), 0, 0);
    },
  });
}
