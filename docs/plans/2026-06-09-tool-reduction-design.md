# Tool Reduction & Agent Intelligence Design

**Date:** 2026-06-09
**Status:** approved

## Problem

The LLM ignores aggregation tools (`gograph_plan`, `gograph_review`, `gograph_explain`) and defaults to `gograph_context` + `gograph_callers` + `grep/cat`. Root cause: 23 tools create choice paralysis — the LLM defaults to familiar patterns from training data.

## Solution

4 changes: reduce tool count, rewrite system prompt, restructure code, add build lock.

## Architecture

### 1. Tool Set Reduction (23 → 8 primary + 1 generic)

**8 primary tools:**

| Tool | Purpose |
|------|---------|
| `gograph_plan` | Pre-edit safety: callers, tests, blast radius, SQL/env exposure |
| `gograph_review` | Post-edit review: test coverage, complexity, broken interfaces |
| `gograph_explain` | Architectural narrative for any symbol |
| `gograph_context` | Source + callers + callees + tests for one symbol |
| `gograph_query` | Search symbols by name |
| `gograph_implementers` | Find structs implementing an interface |
| `gograph_endpoint` | HTTP handler → SQL vertical slice |
| `gograph_build` | Index management |

**15 tools move to generic `gograph` dispatcher:**
`callers`, `callees`, `source`, `fields`, `impact`, `path`, `returnusage`, `errorflow`, `changes`, `check`, `focus`, `stats`, `dependents`, `usages`, `literals`

**Generic tool schema:**

```typescript
const GographParams = Type.Object({
  subcommand: Type.Union([
    Type.Literal("callers"),
    Type.Literal("callees"),
    Type.Literal("source"),
    Type.Literal("fields"),
    Type.Literal("impact"),
    Type.Literal("path"),
    Type.Literal("returnusage"),
    Type.Literal("errorflow"),
    Type.Literal("changes"),
    Type.Literal("check"),
    Type.Literal("focus"),
    Type.Literal("stats"),
    Type.Literal("dependents"),
    Type.Literal("usages"),
    Type.Literal("literals"),
  ], { description: "Gograph subcommand" }),
  target: Type.String({ description: "Primary argument — symbol name, package path, or error term depending on subcommand" }),
  from: Type.Optional(Type.String({ description: "Second symbol (for 'path' subcommand: call chain from→to)" })),
  depth: Type.Optional(Type.Number({ description: "BFS depth 1–10 (callers, callees, path)", minimum: 1, maximum: 10 })),
  filesOnly: Type.Optional(Type.Boolean({ description: "Return only file paths" })),
  uncommitted: Type.Optional(Type.Boolean({ description: "Uncommitted changes only" })),
  flags: Type.Optional(Type.String({ description: "Rare flags: --git <ref>, --since <ref>, --test-only, --no-tests, --precise" })),
});
```

Example LLM calls:
```
gograph(subcommand="callers", target="HandleUser", depth=3)
gograph(subcommand="path", target="HandleUser", from="DB.Save")
gograph(subcommand="fields", target="UserConfig")
gograph(subcommand="stats", target="")
```

### 2. System Prompt

```
## Go Code Navigation (gograph)
This Go project has a gograph AST index. Use gograph tools instead of grep/cat for ALL structural Go queries.

### Default workflow
- Before editing → `gograph_plan` (one call, replaces 4-5 separate queries)
- After editing → `gograph_review` (one call, replaces 3-4 separate queries)
- To understand a symbol → `gograph_explain` (one call, replaces 6-8 separate queries)

### All tools
- `gograph_plan` — pre-edit safety: callers, tests, blast radius, SQL/env exposure
- `gograph_review` — post-edit review: test coverage, complexity, broken interfaces
- `gograph_explain` — architectural narrative for any symbol
- `gograph_context` — source + callers + callees + tests for one symbol
- `gograph_query` — search symbols by name
- `gograph_implementers` — find structs implementing an interface
- `gograph_endpoint` — HTTP handler → SQL vertical slice
- `gograph` — generic tool for callers, callees, source, fields, impact, path, etc.

### Rules
- NEVER use grep/cat/read for Go symbols, types, functions, or struct fields — use gograph instead. grep is fine for string literals, comments, and non-Go files.
- NEVER chain gograph_context + gograph_callers + gograph_impact separately — use gograph_plan or gograph_explain instead
- Use `gograph` subcommands only when a primary tool doesn't cover the need
```

### 3. Code Restructuring

**File structure:**
```
src/
  index.ts          — extension entry point, updated system prompt
  detect.ts         — unchanged
  runner.ts         — unchanged, adds build lock
  refresh.ts        — unchanged
  commands.ts       — unchanged
  tools.ts          — 8 primary tools via registerSimpleTool helper (~350 lines)
  generic-tool.ts   — gograph generic dispatcher (~200 lines)
```

**`registerSimpleTool` helper** — handles execute/render boilerplate. Each primary tool specifies only its unique parts:
```typescript
registerSimpleTool(pi, {
  name: "gograph_explain",
  label: "Gograph Explain",
  description: "Get an LLM-ready architectural narrative for a Go symbol...",
  promptSnippet: "Get architectural narrative for a Go symbol",
  promptGuidelines: [
    "Use gograph_explain when you need comprehensive understanding of a Go symbol...",
  ],
  parameters: ExplainParams,
  buildArgs: (p) => ["explain", p.symbol, "--json"],
  renderCallArgs: (a, t) => t.fg("accent", `"${a.symbol}"`),
});
```

The helper handles: `ensureReady`, `runGograph`, `formatOutput`, render prefix/loading/done states.

**Generic tool dispatcher** in `generic-tool.ts`:
- Validates subcommand-specific requirements (e.g. `path` requires `from`)
- Only appends relevant flags per subcommand (e.g. `depth` only for callers/callees/path)
- Parses string `flags` for rare CLI args
- Delegates to existing `runGograph` + `formatOutput`

### 4. Build Lock

Add in-memory lock in `runner.ts` to prevent concurrent `gograph build` processes (triggered by LLM tool call + background refresh simultaneously):

```typescript
let buildInProgress = false;

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

Used by `gograph_build` tool, `/gograph-build` command, and background refresh.

## Features

| # | Feature | Status | Observable Behavior |
|---|---------|--------|---------------------|
| 1 | Generic `gograph` tool with 15 subcommands | ✅ done | LLM can call `gograph(subcommand="callers", target="...")` instead of individual tool |
| 2 | 8 primary tools unchanged | ✅ done | gograph_plan, review, explain, context, query, implementers, endpoint, build work as before |
| 3 | New system prompt with anti-pattern rules | ✅ done | LLM uses plan/review/explain instead of chaining context+callers+grep |
| 4 | registerSimpleTool helper | ✅ done | tools.ts ~350 lines, each tool ~15 lines of unique code |
| 5 | Build lock prevents concurrent builds | ✅ done | No two `gograph build` processes run simultaneously |
| 6 | Generic tool validates subcommand-specific requirements | ✅ done | `gograph(subcommand="path", target="X")` without `from` returns clear error |
| 7 | Generic tool filters irrelevant flags per subcommand | ✅ done | `gograph(subcommand="stats", depth=3)` does not pass `--depth` to CLI |

No production-risk review needed — no database schema changes, authentication, external APIs, or concurrency beyond the build lock.
