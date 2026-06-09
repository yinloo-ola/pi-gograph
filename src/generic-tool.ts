import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { isGographInstalled, hasIndex } from "./detect.js";
import { runGograph, formatOutput } from "./runner.js";
import { scheduleBackgroundRefresh } from "./refresh.js";

// ── Subcommand definitions ────────────────────────────────────────────────────

const SUBCOMMANDS = [
  "callers", "callees", "source", "fields", "impact", "path",
  "returnusage", "errorflow", "changes", "check", "focus", "stats",
  "dependents", "usages", "literals",
] as const;

export type Subcommand = (typeof SUBCOMMANDS)[number];

const SubcommandLiteral = SUBCOMMANDS.map((s) => Type.Literal(s));

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

// ── Parameter schema ──────────────────────────────────────────────────────────

const GographParams = Type.Object({
  subcommand: Type.Union(SubcommandLiteral, {
    description: "Gograph subcommand",
  }),
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

// ── Arg builder (exported for testing) ──────────────────────────────────────

export interface GenericInput {
  subcommand: Subcommand;
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

// ── Guard helper ────────────────────────────────────────────────────────────

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

export function registerGenericTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph",
    label: "Gograph",
    description:
      "Generic gograph tool for advanced Go code queries. Use when primary tools (plan, review, explain, context, query, implementers, endpoint) don't cover the need.\n\n" +
      "Subcommands: callers, callees, source, fields, impact, path, returnusage, errorflow, changes, check, focus, stats, dependents, usages, literals.\n\n" +
      "Examples:\n" +
      '- callers: `gograph(subcommand="callers", target="HandleUser", depth=3)`\n' +
      '- path: `gograph(subcommand="path", target="HandleUser", from="DB.Save")`\n' +
      '- fields: `gograph(subcommand="fields", target="UserConfig")`\n' +
      '- stats: `gograph(subcommand="stats", target="")`',
    promptSnippet: "Advanced Go code query (callers, callees, source, fields, impact, etc.)",
    promptGuidelines: [
      "Use the `gograph` generic tool for callers, callees, source, fields, impact, path, returnusage, errorflow, changes, check, focus, stats, dependents, usages, and literals.",
      "Prefer primary tools (gograph_plan, gograph_review, gograph_explain) when they cover your need — the generic tool is for cases they don't.",
      'For "path" subcommand, always provide both "target" and "from".',
    ],
    parameters: GographParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(pi, ctx);
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
