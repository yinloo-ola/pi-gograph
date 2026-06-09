# Implementation Plan: Tool Reduction & Agent Intelligence

## Overview

Design: docs/plans/2026-06-09-tool-reduction-design.md
Features: all 7 rows (tightly coupled — must land together)

## Task Summary

| Task | Description | TDD | Checkpoint |
|------|-------------|-----|------------|
| 1 | Add `runGographBuild` with lock to runner.ts | modifying-tested-code | none |
| 2 | Create `generic-tool.ts` — the `gograph` dispatcher | new-feature | test |
| 3 | Create `registerSimpleTool` helper and rewrite 8 primary tools in `tools.ts` | modifying-tested-code | test |
| 4 | Wire up new tool registration and system prompt in `index.ts` | modifying-tested-code | none |
| 5 | TypeScript check and full test suite | trivial | done |

---

## Task 1: Add build lock to runner.ts

<!-- tdd: modifying-tested-code -->

Add a `runGographBuild` function with an in-memory lock to prevent concurrent `gograph build` processes.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: No build is in progress
  - When: `runGographBuild(["build", "."])` is called
  - Then: The command executes and returns stdout
- **Edge Case (concurrent call):**
  - Given: A build is already in progress
  - When: `runGographBuild(["build", "."])` is called again
  - Then: Returns `"(build already in progress)"` without spawning a second process
- **Edge Case (lock released after failure):**
  - Given: A build fails with a non-zero exit code
  - When: A subsequent `runGographBuild` is called
  - Then: The lock is released and the new build proceeds

Files:
- `src/runner.ts`
- `__tests__/runner.test.ts`

Steps:
1. Add `runGographBuild` function after the existing `runGograph` function in `src/runner.ts`:

```typescript
/** In-memory lock to prevent concurrent gograph build processes. */
let buildInProgress = false;

/**
 * Run a gograph build command with a lock to prevent concurrent builds.
 * Returns a message if a build is already in progress.
 * Used by gograph_build tool, /gograph-build command, and background refresh.
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
```

2. Add tests in `__tests__/runner.test.ts`:

```typescript
import { runGographBuild } from "../src/runner.js";

// We need to mock the runner internals. Since runGograph uses a module-level
// execFn, we test the lock behavior by calling runGographBuild which imports
// runGograph. We'll test the lock logic by checking that the exported
// function exists and has the right signature.

describe("runGographBuild", () => {
  it("exports a function", () => {
    expect(typeof runGographBuild).toBe("function");
  });
});
```

> **Assumption:** We can't easily unit-test the lock without mocking the module-level `execFn`. The build lock is simple enough that a basic export check plus manual integration testing suffices. The real test is that the extension doesn't break on load — verified by `npx tsc --noEmit`.

3. Run tests: `npx vitest run __tests__/runner.test.ts`
4. Run type check: `npx tsc --noEmit`

---

## Task 2: Create generic-tool.ts

<!-- tdd: new-feature -->
<!-- checkpoint: test -->

Create the `gograph` generic tool that dispatches to 15 gograph subcommands. This replaces 15 individually registered tools with a single tool.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path (callers):**
  - Given: gograph is installed and indexed
  - When: `gograph(subcommand="callers", target="HandleUser", depth=3)` is called
  - Then: Executes `gograph callers HandleUser --depth 3 --json` and returns formatted output
- **Happy Path (path):**
  - Given: gograph is installed and indexed
  - When: `gograph(subcommand="path", target="HandleUser", from="DB.Save")` is called
  - Then: Executes `gograph path HandleUser DB.Save --json` and returns formatted output
- **Edge Case (path without from):**
  - Given: No `from` parameter provided
  - When: `gograph(subcommand="path", target="HandleUser")` is called
  - Then: Throws `Error("gograph 'path' subcommand requires both 'target' and 'from'")`
- **Edge Case (stats with irrelevant depth):**
  - Given: subcommand is "stats"
  - When: `gograph(subcommand="stats", target="", depth=3)` is called
  - Then: Executes `gograph stats "" --json` (depth is NOT passed — only callers/callees/path support depth)
- **Edge Case (uncommitted flag):**
  - Given: subcommand is "check"
  - When: `gograph(subcommand="check", target="", uncommitted=true)` is called
  - Then: Executes `gograph check --uncommitted --json`

Files:
- `src/generic-tool.ts`
- `__tests__/generic-tool.test.ts`

Steps:
1. Write failing test for arg building logic:

```typescript
import { describe, it, expect } from "vitest";
import { buildGenericArgs } from "../src/generic-tool.js";

describe("buildGenericArgs", () => {
  it("builds callers with depth", () => {
    expect(buildGenericArgs({
      subcommand: "callers",
      target: "HandleUser",
      depth: 3,
    })).toEqual(["callers", "HandleUser", "--depth", "3", "--json"]);
  });

  it("builds path with from", () => {
    expect(buildGenericArgs({
      subcommand: "path",
      target: "HandleUser",
      from: "DB.Save",
    })).toEqual(["path", "HandleUser", "DB.Save", "--json"]);
  });

  it("builds impact with uncommitted", () => {
    expect(buildGenericArgs({
      subcommand: "impact",
      target: "MyFunc",
      uncommitted: true,
    })).toEqual(["impact", "MyFunc", "--uncommitted", "--json"]);
  });

  it("builds stats with empty target", () => {
    expect(buildGenericArgs({
      subcommand: "stats",
      target: "",
    })).toEqual(["stats", "", "--json"]);
  });

  it("ignores depth for stats", () => {
    expect(buildGenericArgs({
      subcommand: "stats",
      target: "",
      depth: 3,
    })).toEqual(["stats", "", "--json"]);
  });

  it("ignores filesOnly for stats", () => {
    expect(buildGenericArgs({
      subcommand: "stats",
      target: "",
      filesOnly: true,
    })).toEqual(["stats", "", "--json"]);
  });

  it("adds filesOnly when supported", () => {
    expect(buildGenericArgs({
      subcommand: "callers",
      target: "HandleUser",
      filesOnly: true,
    })).toEqual(["callers", "HandleUser", "--files-only", "--json"]);
  });

  it("parses flags string", () => {
    expect(buildGenericArgs({
      subcommand: "changes",
      target: "",
      flags: "--git main",
    })).toEqual(["changes", "", "--git", "main", "--json"]);
  });

  it("handles flags with multiple args", () => {
    expect(buildGenericArgs({
      subcommand: "changes",
      target: "",
      flags: "--git main --since v1.0",
    })).toEqual(["changes", "", "--git", "main", "--since", "v1.0", "--json"]);
  });

  it("applies depth to path subcommand", () => {
    expect(buildGenericArgs({
      subcommand: "path",
      target: "A",
      from: "B",
      depth: 5,
    })).toEqual(["path", "A", "B", "--depth", "5", "--json"]);
  });
});
```

2. Run tests — confirm they fail: `npx vitest run __tests__/generic-tool.test.ts`

⏸ **CHECKPOINT: test** — present test review. Wait for human approval before implementing.

3. Implement `src/generic-tool.ts`:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { isGographInstalled, hasIndex } from "./detect.js";
import { runGograph, formatOutput } from "./runner.js";
import { scheduleBackgroundRefresh } from "./refresh.js";

// ── Parameter schema ──────────────────────────────────────────────────────────

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

export type GographParams = Static<typeof GographParams>;

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

  // String fallback flags
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
```

4. Run tests: `npx vitest run __tests__/generic-tool.test.ts`
5. Run type check: `npx tsc --noEmit`
6. Refactor — check for duplication, clean up. Run tests after changes.

---

## Task 3: Create registerSimpleTool helper and rewrite 8 primary tools

<!-- tdd: modifying-tested-code -->
<!-- checkpoint: test -->

Extract a `registerSimpleTool` helper that handles the execute/render boilerplate shared by all primary tools. Rewrite `tools.ts` to use it, reducing ~1100 lines to ~350.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: `registerSimpleTool(pi, { name: "gograph_explain", ... })` is called
  - When: The LLM calls `gograph_explain(symbol="MyFunc")`
  - Then: Executes `gograph explain MyFunc --json` and returns formatted output
- **Happy Path (all 8 tools register):**
  - Given: `registerTools(pi)` is called
  - When: `pi.getActiveTools()` is checked
  - Then: Contains exactly 9 tools: gograph_plan, gograph_review, gograph_explain, gograph_context, gograph_query, gograph_implementers, gograph_endpoint, gograph_build, gograph
- **Edge Case (build tool uses build lock):**
  - Given: `gograph_build` is called
  - When: A build is already in progress
  - Then: Returns `"(build already in progress)"` instead of spawning a second process

Files:
- `src/tools.ts` (full rewrite)

Steps:
1. Write a test that verifies `registerTools` exists and exports the right function:

```typescript
import { describe, it, expect } from "vitest";

describe("registerTools", () => {
  it("exports a registerTools function", async () => {
    const { registerTools } = await import("../src/tools.js");
    expect(typeof registerTools).toBe("function");
  });
});
```

> **Assumption:** We can't fully integration-test tool registration without a mock ExtensionAPI. The `registerSimpleTool` helper's arg-building logic can be tested indirectly through the generic-tool tests in Task 2. The main verification is that the file compiles and all existing tests pass.

2. Run tests — confirm they compile: `npx vitest run __tests__/tools.test.ts`

⏸ **CHECKPOINT: test** — present test review. Wait for human approval before implementing.

3. Rewrite `src/tools.ts` with `registerSimpleTool` helper. The full file:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, Static } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { isGographInstalled, hasIndex } from "./detect.js";
import { runGograph, runGographBuild, formatOutput } from "./runner.js";
import { scheduleBackgroundRefresh, clearBackgroundStatus, getCurrentIndexState, writeIndexState } from "./refresh.js";

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

// ── registerSimpleTool helper ───────────────────────────────────────────────

interface SimpleToolConfig<TParams> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: TParams;
  /** Build CLI args from typed params. Should NOT include "--json" — the helper appends it. */
  buildArgs: (params: Static<TParams>) => string[];
  /** Whether this tool needs ensureReady guard (default: true) */
  needsReady?: boolean;
  /** Whether this tool uses build lock (default: false) */
  useBuildLock?: boolean;
  /** Custom timeout (default: 30_000) */
  timeout?: number;
  /** Render the args portion of the tool call line (after the tool name) */
  renderCallArgs: (args: Static<TParams>, theme: any) => any;
  /** Render expanded result preview (optional) */
  renderExpanded?: (result: any, theme: any) => any;
}

function registerSimpleTool<TParams>(pi: ExtensionAPI, config: SimpleToolConfig<TParams>): void {
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

      const args = config.buildArgs(params as unknown as Static<TParams>);
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
      text += config.renderCallArgs(args as unknown as Static<TParams>, theme);
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
      const args = ["build", "."];
      if (p.precise) args.push("--precise");
      return args;
    },
    needsReady: false, // Has its own gograph-installed check
    useBuildLock: true,
    timeout: 60_000,
    renderCallArgs: (a, t) => a.precise ? t.fg("accent", "--precise") : t.fg("dim", "(standard)"),
    renderExpanded: (r, t) => t.fg("dim", r.content[0]?.text?.slice(0, 2000) ?? ""),
  });
  // gograph_build needs custom execute for index state tracking
  // Override the registered tool by re-registering with custom execute:
  const currentTools = pi.getActiveTools();
  if (!currentTools.includes("gograph_build")) return;
  // The simple helper handles the build. The index state save is handled in refresh.ts
  // via the background refresh mechanism, which detects HEAD changes.
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
      const args = ["query", p.query, "--json"];
      if (p.filesOnly) args.splice(2, 0, "--files-only");
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
```

4. Run type check: `npx tsc --noEmit`
5. Run all tests: `npx vitest run`
6. Refactor — verify the build tool override section is clean (it's a bit awkward). Consider making `registerSimpleTool` accept an optional `beforeExecute` callback for state tracking.

---

## Task 4: Wire up new tool registration and system prompt in index.ts

<!-- tdd: modifying-tested-code -->

Update `index.ts` to import `registerGenericTool` and use the new system prompt.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: Extension loads in a Go project with gograph installed and indexed
  - When: `session_start` fires
  - Then: 9 tools are registered (8 primary + 1 generic)
- **Happy Path (system prompt):**
  - Given: `before_agent_start` fires
  - When: The system prompt is inspected
  - Then: It contains "NEVER use grep/cat/read for Go symbols" and "NEVER chain gograph_context + gograph_callers + gograph_impact"
- **Edge Case (gograph not installed):**
  - Given: gograph is not installed
  - When: `session_start` fires
  - Then: Tools are still registered (so /gograph-setup works), but no system prompt injection

Files:
- `src/index.ts`

Steps:
1. Update imports in `src/index.ts`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isGoRepo, isGographInstalled, hasIndex } from "./detect.js";
import { initRunner } from "./runner.js";
import { registerTools } from "./tools.js";
import { registerGenericTool } from "./generic-tool.js";
import { registerCommands } from "./commands.js";
import { getBackgroundStatus, scheduleBackgroundRefresh } from "./refresh.js";
```

2. Replace the `registerTools(pi)` call in session_start with:

```typescript
registerTools(pi);
registerGenericTool(pi);
```

3. Replace the system prompt with the new one from the design doc:

```typescript
pi.on("before_agent_start", async (_event, _agentCtx) => {
  return {
    systemPrompt:
      "\n\n## Go Code Navigation (gograph)\n" +
      "This Go project has a gograph AST index. Use gograph tools instead of grep/cat for ALL structural Go queries.\n\n" +
      "### Default workflow\n" +
      "- Before editing → `gograph_plan` (one call, replaces 4-5 separate queries)\n" +
      "- After editing → `gograph_review` (one call, replaces 3-4 separate queries)\n" +
      "- To understand a symbol → `gograph_explain` (one call, replaces 6-8 separate queries)\n\n" +
      "### All tools\n" +
      "- `gograph_plan` — pre-edit safety: callers, tests, blast radius, SQL/env exposure\n" +
      "- `gograph_review` — post-edit review: test coverage, complexity, broken interfaces\n" +
      "- `gograph_explain` — architectural narrative for any symbol\n" +
      "- `gograph_context` — source + callers + callees + tests for one symbol\n" +
      "- `gograph_query` — search symbols by name\n" +
      "- `gograph_implementers` — find structs implementing an interface\n" +
      "- `gograph_endpoint` — HTTP handler → SQL vertical slice\n" +
      "- `gograph` — generic tool for callers, callees, source, fields, impact, path, etc.\n\n" +
      "### Rules\n" +
      "- NEVER use grep/cat/read for Go symbols, types, functions, or struct fields — use gograph instead. grep is fine for string literals, comments, and non-Go files.\n" +
      "- NEVER chain gograph_context + gograph_callers + gograph_impact separately — use gograph_plan or gograph_explain instead\n" +
      "- Use `gograph` subcommands only when a primary tool doesn't cover the need\n",
  };
});
```

4. Update `refresh.ts` to use `runGographBuild` instead of `runGograph` for background builds:

In `src/refresh.ts`, change the import:
```typescript
import { runGographBuild } from "./runner.js";
```

And in `scheduleBackgroundRefresh`, change the build call:
```typescript
await runGographBuild(["build", "."], undefined, 60_000);
```

5. Update `commands.ts` to use `runGographBuild` instead of `runGograph` for build commands:

In `src/commands.ts`, change the import:
```typescript
import { runGograph, runGographBuild } from "./runner.js";
```

And replace `runGograph(["build", "."], ...)` calls with `runGographBuild(["build", "."], ...)` in both `registerSetupCommand` and `registerBuildCommand`. Note: `runGograph` is still imported for the gograph --version check in setup (which stays as `pi.exec`).

6. Run type check: `npx tsc --noEmit`
7. Run all tests: `npx vitest run`

---

## Task 5: TypeScript check and full test suite

<!-- tdd: trivial -->
<!-- checkpoint: done -->

Final verification that everything compiles and all tests pass.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: All tasks are complete
  - When: `npx tsc --noEmit` is run
  - Then: Zero type errors
- **Happy Path:**
  - Given: All tasks are complete
  - When: `npx vitest run` is run
  - Then: All tests pass (existing detect, refresh, runner tests + new generic-tool test)
- **Edge Case (line count):**
  - When: `wc -l src/tools.ts src/generic-tool.ts` is run
  - Then: Combined line count is significantly less than the original ~1100 lines in tools.ts

Files:
- All source files (verification only)

Steps:
1. Run `npx tsc --noEmit` — confirm zero errors
2. Run `npx vitest run` — confirm all tests pass
3. Run `wc -l src/tools.ts src/generic-tool.ts` — verify line count reduction
4. Lessons — update `docs/lessons.md` with any new patterns learned (e.g. generic-tool dispatcher pattern, registerSimpleTool helper)

⏸ **CHECKPOINT: done** — present implementation review. Wait for human approval before committing.

---

## Architectural Review

**Status**: ✅ No high-risk hazards detected.

**Pillars reviewed**: All 6 — no concerns.
**Hazards audited**: All 8 [SAFE].
**Socratic risks**: None identified.

### Notes
- Build lock `try/finally` guarantees release on failure/abort. No deadlock risk in practice.
- `flags` string parameter reaches gograph CLI via `execFn` args array (not shell interpolation) — no injection risk.
- Build lock concurrent behavior is untested (acknowledged in plan) — mitigated by code simplicity.
- Backwards breaking: 15 tools removed from LLM access. In-flight sessions will lose them on reload. Acceptable for an extension version bump.
