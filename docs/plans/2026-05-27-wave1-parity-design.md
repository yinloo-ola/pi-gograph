# Wave 1: gograph v1.4.59 Parity — Design Doc

## Scope

Add 10 new tools and 6 flag upgrades to pi-gograph, covering the highest-value agent-facing commands from gograph v1.4.35–v1.4.59.

Simple change — no design review needed. Every addition follows the existing registration pattern in `src/tools.ts`.

---

## 1. New Tools

All tools follow the existing pattern: schema → `ensureReady` → `runGograph` → `formatOutput` → return content. Registered in `registerTools()`. Listed in the README tools table.

### 1.1 `gograph_plan`

**Purpose:** Pre-edit change plan — aggregates callers, tests, blast radius, SQL/env/route exposure into a checklist before modifying a symbol.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | conditional | Symbol to plan changes for. Required unless `uncommitted=true`. |
| `uncommitted` | boolean | no | Plan for all uncommitted changes. Default: false. |
| `withContext` | boolean | no | Bundle full context for every inspect_first symbol (eliminates N follow-up context calls). Default: false. |

**CLI mapping:**
- `plan <symbol> [--uncommitted] [--with-context] --json`

**Execute logic:**
- Build args: `["plan"]`
- If `uncommitted`: push `--uncommitted`
- Else if `symbol`: push `symbol`
- Else: throw "Provide either a symbol name or set uncommitted=true."
- If `withContext`: push `--with-context`
- Push `--json`
- Run with 30s timeout

**Render:** `gograph_plan "symbol"` or `gograph_plan --uncommitted [--with-context]`

---

### 1.2 `gograph_explain`

**Purpose:** LLM-ready architectural narrative for any symbol — synthesizes callers, callees, complexity, SQL, routes, tests, role classification into a single prose block. Collapses 6-8 tool calls into one.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | yes | Symbol name to explain. |

**CLI mapping:** `explain <symbol> --json`

**Render:** `gograph_explain "symbol"`

---

### 1.3 `gograph_review`

**Purpose:** Post-edit review — checks callers tested, complexity increase, new SQL/env reads, broken interfaces. Run after editing, before committing.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | conditional | Symbol to review. Required unless `uncommitted=true`. |
| `uncommitted` | boolean | no | Review all uncommitted changes. Default: false. |

**CLI mapping:**
- `review <symbol> --json` or `review --uncommitted --json`

**Execute logic:**
- Build args: `["review"]`
- If `uncommitted`: push `--uncommitted`
- Else if `symbol`: push `symbol`
- Else: throw "Provide either a symbol name or set uncommitted=true."
- Push `--json`

**Render:** `gograph_review "symbol"` or `gograph_review --uncommitted`

---

### 1.4 `gograph_returnusage`

**Purpose:** Shows how each caller consumes a function's return value (discarded, assigned, returned, etc.). Critical before changing a return signature.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | yes | Function name to check return usage for. |

**CLI mapping:** `returnusage <symbol> --json`

**Render:** `gograph_returnusage "symbol"`

---

### 1.5 `gograph_errorflow`

**Purpose:** Trace an error string from its definition up through the call chain to HTTP handlers. Uses AST heuristics.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `term` | string | yes | Error string or search term to trace. |
| `noTests` | boolean | no | Skip collecting related tests. Default: false. |

**CLI mapping:** `errorflow <term> [--no-tests] --json`

**Execute logic:**
- Build args: `["errorflow", term]`
- If `noTests`: push `--no-tests`
- Push `--json`

**Render:** `gograph_errorflow "term"`

---

### 1.6 `gograph_changes`

**Purpose:** Find symbols in changed files — either by mtime or by git ref. Useful for scoping work to a PR branch.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `git` | string | no | Git ref to compare against (e.g. `main`, `HEAD~5`, `v1.0`). Returns symbols in files changed since that ref. |
| `filesOnly` | boolean | no | Return only file paths, not symbols. Default: false. |

**CLI mapping:**
- Default: `changes --json`
- With git ref: `changes --git <ref> --json`
- With files-only: append `--files-only`

**Execute logic:**
- Build args: `["changes"]`
- If `git`: push `--git`, push `git` value
- If `filesOnly`: push `--files-only`
- Push `--json`

**Render:** `gograph_changes` or `gograph_changes --git "ref"`

---

### 1.7 `gograph_stats`

**Purpose:** Index health summary — schema version, timestamp, counts. Zero-parse sanity check at start of session.

**Params:** None.

**CLI mapping:** `stats --json`

**Note:** No `ensureReady` guard — this is useful even with a stale or empty index. Just call `runGograph(["stats", "--json"])`.

**Render:** `gograph_stats`

---

### 1.8 `gograph_dependents`

**Purpose:** Find all packages that import a given package — inverse of `deps`.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `package` | string | yes | Package name, path suffix, or full import path. |
| `filesOnly` | boolean | no | Return only file paths. Default: false. |

**CLI mapping:** `dependents <package> --json [--files-only]`

**Render:** `gograph_dependents "package"`

---

### 1.9 `gograph_usages`

**Purpose:** Find every place a named type is referenced in function signatures, struct fields, and interface methods. True blast radius of a type change.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | Type name to search usages for. |
| `filesOnly` | boolean | no | Return only file paths. Default: false. |

**CLI mapping:** `usages <type> --json [--files-only]`

**Render:** `gograph_usages "type"`

---

### 1.10 `gograph_literals`

**Purpose:** Find every composite-literal initialization site for a struct (`Foo{Field: val}`). Finds places constructors miss.

**Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| `struct` | string | yes | Struct name to find literal initializations for. |
| `filesOnly` | boolean | no | Return only file paths. Default: false. |

**CLI mapping:** `literals <struct> --json [--files-only]`

**Render:** `gograph_literals "struct"`

---

## 2. Flag Upgrades to Existing Tools

### 2.1 `--depth N` on `gograph_callers` and `gograph_callees`

Add optional `depth` param (integer, default 1, max 10).

**Schema change:**
```ts
const CallersParams = Type.Object({
  symbol: Type.String({ description: "..." }),
  depth: Type.Optional(Type.Number({ description: "BFS depth (1–10). Default: 1.", minimum: 1, maximum: 10 })),
  filesOnly: Type.Optional(Type.Boolean({ description: "Return only file paths. Default: false." })),
});
// Same for CalleesParams
```

**Execute change:** If `depth` provided and > 1, append `--depth ${depth}` to args.
If `filesOnly`, append `--files-only`.

**Render change:** Show depth if set: `gograph_callers "symbol" --depth 3`

---

### 2.2 `--uncommitted` on `gograph_context`

Make `symbol` optional. Add `uncommitted` boolean param.

**Schema change:**
```ts
const ContextParams = Type.Object({
  symbol: Type.Optional(Type.String({ description: "Symbol name. Required unless uncommitted=true." })),
  uncommitted: Type.Optional(Type.Boolean({ description: "Bundle context for all uncommitted modified symbols. Default: false." })),
});
```

**Execute change:**
- If `uncommitted`: args = `["context", "--uncommitted", "--json"]`
- Else if `symbol`: args = `["context", symbol, "--json"]`
- Else: throw "Provide either a symbol name or set uncommitted=true."

**Render change:** `gograph_context --uncommitted` when uncommitted mode.

---

### 2.3 `--since <ref>` on `gograph_impact`

Add `since` optional string param.

**Schema change:**
```ts
const ImpactParams = Type.Object({
  symbol: Type.Optional(Type.String({ description: "..." })),
  uncommitted: Type.Optional(Type.Boolean({ description: "..." })),
  since: Type.Optional(Type.String({ description: "Git ref — blast radius of all symbols changed since that ref (e.g. 'main', 'v1.0')." })),
});
```

**Execute change:** If `since` provided, push `--since`, push `since` value. Otherwise same logic.

---

### 2.4 `--test-only` on `gograph_implementers`

Add `testOnly` optional boolean param.

**Schema change:**
```ts
const ImplementersParams = Type.Object({
  interface: Type.String({ description: "..." }),
  testOnly: Type.Optional(Type.Boolean({ description: "Filter to test/mock implementations only. Default: false." })),
});
```

**Execute change:** If `testOnly`, append `--test-only`.

---

### 2.5 `--files-only` universal

Add `filesOnly` optional boolean to all tools that support it: `query`, `callers`, `callees`, `impact`, `changes`, `dependents`, `usages`, `literals`. When set, append `--files-only` to args.

Already covered in each tool spec above.

---

## 3. System Prompt Update

Update the `before_agent_start` system prompt in `src/index.ts` to mention the new high-value tools:

```
"- `gograph_plan` — pre-edit safety check: callers, tests, blast radius, SQL/env exposure (run BEFORE editing)\n"
"- `gograph_review` — post-edit review: test coverage, complexity, broken interfaces (run AFTER editing)\n"
"- `gograph_explain` — architectural narrative for any symbol in one call\n"
"- `gograph_context --uncommitted` — context for all uncommitted changes in one call\n"
```

---

## 4. README Update

Add all 10 new tools to the tools table in `README.md`.

---

## 5. Implementation Order

Grouped as end-to-end slices — each slice is testable independently:

| Slice | What | Files touched |
|---|---|---|
| S1 | `gograph_plan` (new tool) | `tools.ts`, `index.ts`, `README.md` |
| S2 | `gograph_explain` (new tool) | `tools.ts`, `index.ts`, `README.md` |
| S3 | `gograph_review` (new tool) | `tools.ts` |
| S4 | `gograph_returnusage` (new tool) | `tools.ts` |
| S5 | `gograph_errorflow` (new tool) | `tools.ts` |
| S6 | `gograph_changes` (new tool) | `tools.ts` |
| S7 | `gograph_stats` (new tool) | `tools.ts` |
| S8 | `gograph_dependents` (new tool) | `tools.ts` |
| S9 | `gograph_usages` (new tool) | `tools.ts` |
| S10 | `gograph_literals` (new tool) | `tools.ts` |
| S11 | `--depth N` on callers/callees (flag upgrade) | `tools.ts` |
| S12 | `--uncommitted` on context (flag upgrade) | `tools.ts` |
| S13 | `--since <ref>` on impact (flag upgrade) | `tools.ts` |
| S14 | `--test-only` on implementers (flag upgrade) | `tools.ts` |
| S15 | `--files-only` on all applicable tools (flag upgrade) | `tools.ts` |
| S16 | System prompt update | `index.ts` |
| S17 | README tools table update | `README.md` |
