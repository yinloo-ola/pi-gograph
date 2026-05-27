# Wave 1: gograph v1.4.59 Parity — Implementation Plan

Design doc: `docs/plans/2026-05-27-wave1-parity-design.md`

## Summary

10 new tools + 6 flag upgrades. Every change is mechanical — copy the existing tool registration pattern, swap CLI command and params. No architectural decisions. Each task is a vertical slice that adds one or more tools and verifies compilation.

The existing test suite (`__tests__/`) tests shared utilities (detect, runner, refresh), not individual tool registrations. New tools are thin wrappers over `runGograph` + `formatOutput` — tested indirectly through those utilities. Each task verifies via `npx tsc --noEmit` per lessons.md.

---

## Task 1: Add `gograph_plan` tool

<!-- tdd: trivial -->

Acceptance Criteria (QA Engineer Hat):
- **Happy Path**:
  - Given: `gograph_plan` is called with `symbol: "HandleUsers"`
  - When: The tool executes
  - Then: It calls `runGograph(["plan", "HandleUsers", "--json"])` and returns formatted output
- **Edge Case (uncommitted)**:
  - Given: `gograph_plan` is called with `uncommitted: true`
  - When: The tool executes
  - Then: It calls `runGograph(["plan", "--uncommitted", "--json"])`
- **Edge Case (with context)**:
  - Given: `gograph_plan` is called with `symbol: "HandleUsers", withContext: true`
  - When: The tool executes
  - Then: It calls `runGograph(["plan", "HandleUsers", "--with-context", "--json"])`
- **Edge Case (no args)**:
  - Given: `gograph_plan` is called with no symbol and uncommitted=false
  - When: The tool executes
  - Then: It throws "Provide either a symbol name or set uncommitted=true."

Files:
- `src/tools.ts`

Steps:

1. Add the `PlanParams` schema after the existing `PathParams` schema:

```ts
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
```

2. Add `registerPlanTool(pi)` call in `registerTools()` after `registerPathTool(pi)`.

3. Add the registration function after `registerPathTool`:

```ts
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
```

4. Run `npx tsc --noEmit` — must pass with no errors.

---

## Task 2: Add `gograph_explain`, `gograph_review`, `gograph_returnusage` tools

<!-- tdd: trivial -->

Acceptance Criteria (QA Engineer Hat):
- **Happy Path (explain)**:
  - Given: `gograph_explain` is called with `symbol: "HandleUsers"`
  - When: The tool executes
  - Then: It calls `runGograph(["explain", "HandleUsers", "--json"])` and returns formatted output
- **Happy Path (review with symbol)**:
  - Given: `gograph_review` is called with `symbol: "HandleUsers"`
  - When: The tool executes
  - Then: It calls `runGograph(["review", "HandleUsers", "--json"])`
- **Happy Path (review uncommitted)**:
  - Given: `gograph_review` is called with `uncommitted: true`
  - When: The tool executes
  - Then: It calls `runGograph(["review", "--uncommitted", "--json"])`
- **Edge Case (review no args)**:
  - Given: `gograph_review` is called with no symbol and uncommitted=false
  - When: The tool executes
  - Then: It throws "Provide either a symbol name or set uncommitted=true."
- **Happy Path (returnusage)**:
  - Given: `gograph_returnusage` is called with `symbol: "GetUser"`
  - When: The tool executes
  - Then: It calls `runGograph(["returnusage", "GetUser", "--json"])` and returns formatted output

Files:
- `src/tools.ts`

Steps:

1. Add the three parameter schemas after `PlanParams`:

```ts
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
```

2. Add `registerExplainTool(pi)`, `registerReviewTool(pi)`, `registerReturnUsageTool(pi)` calls in `registerTools()`.

3. Add the three registration functions:

```ts
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
```

4. Run `npx tsc --noEmit` — must pass with no errors.

---

## Task 3: Add `gograph_errorflow`, `gograph_changes`, `gograph_stats` tools

<!-- tdd: trivial -->

Acceptance Criteria (QA Engineer Hat):
- **Happy Path (errorflow)**:
  - Given: `gograph_errorflow` is called with `term: "not found"`
  - When: The tool executes
  - Then: It calls `runGograph(["errorflow", "not found", "--json"])` and returns formatted output
- **Edge Case (errorflow no-tests)**:
  - Given: `gograph_errorflow` is called with `term: "not found", noTests: true`
  - When: The tool executes
  - Then: It calls `runGograph(["errorflow", "not found", "--no-tests", "--json"])`
- **Happy Path (changes default)**:
  - Given: `gograph_changes` is called with no params
  - When: The tool executes
  - Then: It calls `runGograph(["changes", "--json"])` and returns formatted output
- **Edge Case (changes with git ref)**:
  - Given: `gograph_changes` is called with `git: "main"`
  - When: The tool executes
  - Then: It calls `runGograph(["changes", "--git", "main", "--json"])`
- **Edge Case (changes with filesOnly)**:
  - Given: `gograph_changes` is called with `filesOnly: true`
  - When: The tool executes
  - Then: It calls `runGograph(["changes", "--json", "--files-only"])`
- **Happy Path (stats)**:
  - Given: `gograph_stats` is called with no params
  - When: The tool executes
  - Then: It calls `runGograph(["stats", "--json"])` and returns formatted output

Files:
- `src/tools.ts`

Steps:

1. Add three parameter schemas:

```ts
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
```

2. Add `registerErrorFlowTool(pi)`, `registerChangesTool(pi)`, `registerStatsTool(pi)` calls in `registerTools()`.

3. Add the three registration functions:

```ts
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
```

4. Run `npx tsc --noEmit` — must pass with no errors.

---

## Task 4: Add `gograph_dependents`, `gograph_usages`, `gograph_literals` tools

<!-- tdd: trivial -->

Acceptance Criteria (QA Engineer Hat):
- **Happy Path (dependents)**:
  - Given: `gograph_dependents` is called with `package: "internal/auth"`
  - When: The tool executes
  - Then: It calls `runGograph(["dependents", "internal/auth", "--json"])` and returns formatted output
- **Edge Case (dependents filesOnly)**:
  - Given: `gograph_dependents` is called with `package: "internal/auth", filesOnly: true`
  - When: The tool executes
  - Then: It calls `runGograph(["dependents", "internal/auth", "--json", "--files-only"])`
- **Happy Path (usages)**:
  - Given: `gograph_usages` is called with `type: "User"`
  - When: The tool executes
  - Then: It calls `runGograph(["usages", "User", "--json"])` and returns formatted output
- **Happy Path (literals)**:
  - Given: `gograph_literals` is called with `struct: "Config"`
  - When: The tool executes
  - Then: It calls `runGograph(["literals", "Config", "--json"])` and returns formatted output

Files:
- `src/tools.ts`

Steps:

1. Add three parameter schemas:

```ts
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
```

2. Add `registerDependentsTool(pi)`, `registerUsagesTool(pi)`, `registerLiteralsTool(pi)` calls in `registerTools()`.

3. Add the three registration functions:

```ts
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
```

4. Run `npx tsc --noEmit` — must pass with no errors.

---

## Task 5: Add `--depth N`, `--files-only` to callers/callees, `--files-only` to query/impact

<!-- tdd: trivial -->

Acceptance Criteria (QA Engineer Hat):
- **Happy Path (callers with depth)**:
  - Given: `gograph_callers` is called with `symbol: "HandleUsers", depth: 3`
  - When: The tool executes
  - Then: It calls `runGograph(["callers", "HandleUsers", "--depth", "3", "--json"])`
- **Edge Case (depth 1 — default, no flag)**:
  - Given: `gograph_callers` is called with `symbol: "HandleUsers"` (no depth)
  - When: The tool executes
  - Then: It calls `runGograph(["callers", "HandleUsers", "--json"])` — no `--depth` flag
- **Happy Path (callees with depth + filesOnly)**:
  - Given: `gograph_callees` is called with `symbol: "HandleUsers", depth: 2, filesOnly: true`
  - When: The tool executes
  - Then: It calls `runGograph(["callees", "HandleUsers", "--depth", "2", "--json", "--files-only"])`
- **Happy Path (query with filesOnly)**:
  - Given: `gograph_query` is called with `query: "User", filesOnly: true`
  - When: The tool executes
  - Then: It calls `runGograph(["query", "User", "--json", "--files-only"])`
- **Happy Path (impact with filesOnly)**:
  - Given: `gograph_impact` is called with `symbol: "HandleUsers", filesOnly: true`
  - When: The tool executes
  - Then: It calls `runGograph(["impact", "HandleUsers", "--files-only"])`

Files:
- `src/tools.ts`

Steps:

1. Update `CallersParams`:

```ts
const CallersParams = Type.Object({
  symbol: Type.String({ description: "Function or method name" }),
  depth: Type.Optional(
    Type.Number({ description: "BFS depth (1–10). Default: 1 (direct callers only).", minimum: 1, maximum: 10 }),
  ),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});
```

2. Update `CalleesParams`:

```ts
const CalleesParams = Type.Object({
  symbol: Type.String({ description: "Function or method name" }),
  depth: Type.Optional(
    Type.Number({ description: "BFS depth (1–10). Default: 1 (direct callees only).", minimum: 1, maximum: 10 }),
  ),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});
```

3. Update `QueryParams`:

```ts
const QueryParams = Type.Object({
  query: Type.String({ description: "Symbol, file, or package name to search for" }),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});
```

4. Update `ImpactParams`:

```ts
const ImpactParams = Type.Object({
  symbol: Type.Optional(
    Type.String({ description: "Symbol name to check blast radius for" }),
  ),
  uncommitted: Type.Optional(
    Type.Boolean({
      description: "Calculate blast radius of all uncommitted code changes. Default: false.",
    }),
  ),
  filesOnly: Type.Optional(
    Type.Boolean({ description: "Return only file paths. Default: false." }),
  ),
});
```

5. Update `registerCallersTool` execute function — add after `--json` push:

```ts
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
```

6. Update `registerCallersTool` renderCall:

```ts
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_callers "));
      text += theme.fg("accent", `"${args.symbol}"`);
      if (args.depth && args.depth > 1) text += theme.fg("accent", ` --depth ${args.depth}`);
      return new Text(text, 0, 0);
    },
```

7. Update `registerCalleesTool` execute function — same pattern as callers:

```ts
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
```

8. Update `registerCalleesTool` renderCall:

```ts
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_callees "));
      text += theme.fg("accent", `"${args.symbol}"`);
      if (args.depth && args.depth > 1) text += theme.fg("accent", ` --depth ${args.depth}`);
      return new Text(text, 0, 0);
    },
```

9. Update `registerQueryTool` execute — add filesOnly after --json:

```ts
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
```

10. Update `registerImpactTool` execute — add filesOnly:

In the execute function, after building the `args` array and before running gograph, add:

```ts
      if (params.filesOnly) args.push("--files-only");
```

11. Run `npx tsc --noEmit` — must pass with no errors.

---

## Task 6: Add `--uncommitted` to context, `--since <ref>` to impact, `--test-only` to implementers

<!-- tdd: trivial -->

Acceptance Criteria (QA Engineer Hat):
- **Happy Path (context uncommitted)**:
  - Given: `gograph_context` is called with `uncommitted: true`
  - When: The tool executes
  - Then: It calls `runGograph(["context", "--uncommitted", "--json"])`
- **Edge Case (context no args)**:
  - Given: `gograph_context` is called with no symbol and uncommitted=false
  - When: The tool executes
  - Then: It throws "Provide either a symbol name or set uncommitted=true."
- **Happy Path (impact since)**:
  - Given: `gograph_impact` is called with `since: "main"`
  - When: The tool executes
  - Then: It calls `runGograph(["impact", "--since", "main"])`
- **Happy Path (implementers test-only)**:
  - Given: `gograph_implementers` is called with `interface: "Store", testOnly: true`
  - When: The tool executes
  - Then: It calls `runGograph(["implementers", "Store", "--test-only", "--json"])`

Files:
- `src/tools.ts`

Steps:

1. Update `ContextParams`:

```ts
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
```

2. Update `ImpactParams` — add `since`:

```ts
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
```

3. Update `ImplementersParams`:

```ts
const ImplementersParams = Type.Object({
  interface: Type.String({ description: "Interface name to find implementations for" }),
  testOnly: Type.Optional(
    Type.Boolean({ description: "Filter to test/mock implementations only. Default: false." }),
  ),
});
```

4. Update `registerContextTool` execute:

```ts
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
```

5. Update `registerContextTool` renderCall:

```ts
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_context "));
      if (args.uncommitted) {
        text += theme.fg("accent", "--uncommitted");
      } else {
        text += theme.fg("accent", `"${args.symbol}"`);
      }
      return new Text(text, 0, 0);
    },
```

6. Update `registerContextTool` renderResult — add uncommitted to details type:

In the renderResult, update the details cast:

```ts
      const details = result.details as { symbol?: string; uncommitted?: boolean; truncated?: boolean } | undefined;
```

7. Update `registerImpactTool` execute — add `since` handling. After the existing `if/else if/else` block for symbol/uncommitted and before the `filesOnly` push:

```ts
      if (params.since) {
        args.push("--since", params.since);
      }
```

Also update the throw to include `since`:

```ts
      } else if (params.since) {
        args.push("--since", params.since);
      } else {
        throw new Error("Provide either a symbol name, uncommitted=true, or since=<git ref>.");
      }
```

The full execute becomes:

```ts
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
```

8. Update `registerImpactTool` renderCall to show `--since`:

```ts
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
```

9. Update `registerImplementersTool` execute — add testOnly:

```ts
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
```

10. Update `registerImplementersTool` renderCall:

```ts
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_implementers "));
      text += theme.fg("accent", `"${args.interface}"`);
      if (args.testOnly) text += theme.fg("accent", " --test-only");
      return new Text(text, 0, 0);
    },
```

11. Run `npx tsc --noEmit` — must pass with no errors.

---

## Task 7: Update system prompt and README

<!-- tdd: trivial -->

Acceptance Criteria (QA Engineer Hat):
- **Happy Path**:
  - Given: The updated system prompt in `index.ts`
  - When: Read
  - Then: It includes `gograph_plan`, `gograph_review`, `gograph_explain`, and `gograph_context --uncommitted`
- **Happy Path**:
  - Given: The updated README tools table
  - When: Read
  - Then: It lists all 23 tools (13 existing + 10 new) with descriptions

Files:
- `src/index.ts`
- `README.md`

Steps:

1. Update the `before_agent_start` system prompt in `src/index.ts`:

```ts
        pi.on("before_agent_start", async (_event, _agentCtx) => {
          return {
            systemPrompt:
              "\n\n## Go Code Navigation (gograph)\n" +
              "This Go project is indexed with gograph. Prefer gograph tools over grep/cat for structural Go queries.\n" +
              "- `gograph_plan` — pre-edit safety check: callers, tests, blast radius, SQL/env exposure (run BEFORE editing)\n" +
              "- `gograph_review` — post-edit review: test coverage, complexity, broken interfaces (run AFTER editing)\n" +
              "- `gograph_context` — get source + callers + callees + tests in ONE call (replaces 4-5 grep/cat calls)\n" +
              "- `gograph_explain` — architectural narrative for any symbol in one call\n" +
              "- `gograph_implementers` — find which structs implement an interface\n" +
              "- `gograph_impact` — check blast radius before modifying a function\n" +
              "- `gograph_source` — extract just the source of a symbol without reading the whole file\n" +
              "- `gograph_endpoint` — full vertical slice from HTTP handler to SQL\n" +
              "- `gograph_returnusage` — check how callers consume a function's return value\n" +
              "- `gograph_errorflow` — trace an error string up the call chain\n" +
              "- Use `grep` ONLY for string literals, config files, or non-Go files.\n",
          };
        });
```

2. Update the README tools table to include all 23 tools:

```markdown
## Tools

| Tool | Purpose |
|------|---------|
| `gograph_build` | Build/rebuild the AST index |
| `gograph_query` | Search for symbols by name |
| `gograph_context` | Full context bundle (source + callers + callees + tests). Supports `--uncommitted` for all modified symbols. |
| `gograph_implementers` | Find structs implementing an interface. Supports `--test-only` for mock/test implementations. |
| `gograph_impact` | Blast radius analysis. Supports `--uncommitted`, `--since <ref>`. |
| `gograph_source` | Extract source of one symbol |
| `gograph_callers` | Find callers of a function. Supports `--depth N` for multi-hop traversal. |
| `gograph_callees` | Find callees of a function. Supports `--depth N` for multi-hop traversal. |
| `gograph_endpoint` | HTTP handler → SQL vertical slice |
| `gograph_check` | Verify uncommitted changes |
| `gograph_focus` | Targeted context for a package |
| `gograph_fields` | All fields of a struct |
| `gograph_path` | Shortest call chain between two symbols |
| `gograph_plan` | Pre-edit change plan: callers, tests, blast radius, SQL/env exposure. Supports `--uncommitted` and `--with-context`. |
| `gograph_review` | Post-edit review: test coverage, complexity, broken interfaces |
| `gograph_explain` | Architectural narrative for any symbol in one call |
| `gograph_returnusage` | How callers consume a function's return value |
| `gograph_errorflow` | Trace error string from definition to handlers |
| `gograph_changes` | Find symbols in changed files. Supports `--git <ref>`. |
| `gograph_stats` | Index health summary: version, timestamp, counts |
| `gograph_dependents` | Find packages that import a given package |
| `gograph_usages` | Find all references to a type in signatures and fields |
| `gograph_literals` | Find all struct literal initialization sites |
```

3. Run `npx tsc --noEmit` — must pass with no errors.

---

## Task 8: Full test suite and type check

<!-- tdd: trivial -->

Acceptance Criteria (QA Engineer Hat):
- **Happy Path**:
  - Given: All changes from tasks 1–7
  - When: `npm test` is run
  - Then: All existing tests pass (no regressions)
- **Happy Path**:
  - Given: All changes from tasks 1–7
  - When: `npx tsc --noEmit` is run
  - Then: No type errors

Files: none (verification only)

Steps:

1. Run `npx tsc --noEmit` — must pass with no errors.
2. Run `npm test` — all existing tests must pass.
3. Verify `registerTools` in `src/tools.ts` lists all 23 `register*Tool` calls in order.
