# Decisions: Keeping pi-gograph in sync with upstream gograph

## Problem

Upstream gograph ships fast — **5 new analytical commands in ~2 weeks**
(v1.4.78–1.4.87). pi-gograph deliberately reduced its tool surface from
23 → 9 in v0.3.0 (8 curated primary tools + 1 generic dispatcher) to push the
LLM toward aggregators, so the question is how to keep that curated surface
in sync with upstream without re-bloating it or falling behind.

The original plan (committed in the first revision of this doc) was **auto-
discovery** of available subcommands from `gograph capabilities`. Empirical
investigation during implementation invalidated that assumption and reshaped
the approach:

1. **`gograph capabilities` is curated prose, not a machine-readable registry.**
   `--json` is ignored; it is a human cheat-sheet. There is no structured
   command list to parse.
2. **`gograph --help` *is* parseable** (each command leads an indented line),
   but it is gograph's *custom* help format (not stock cobra) and yields
   **~50 query commands** — a 3× surface bloat over the curated 15.
3. **gograph ships its own MCP server** (`gograph mcp`) exposing ~60 tools —
   the canonical full-exposure path for Claude Desktop / Cursor / Antigravity.
4. **gograph's own `coding-agent-usage.md` designates a small "PRIMARY TOKEN
   SAVERS" tier** (`context`, `explain`, `plan`, `risk`, `summary`, `review`,
   …) and tells agents to prefer those over chaining raw queries.

Conclusion: the pi extension's reason to exist is **not** "expose gograph"
(the MCP server already does that and would auto-inherit new commands). Its
value is **curation into a pi-native experience** — status bar, slash commands,
background refresh, build-locking, custom TUI rendering, and a tight system
prompt that routes the LLM to aggregators. That curation *is* the product, and
v0.3.0's 23→9 reduction is its differentiation. Auto-discovery that exposes all
~50 commands contradicts both the extension's thesis and gograph's own guidance.

So "keeping up with upstream" is answered by **deliberately promoting new
aggregators when gograph ships them** (risk, summary now; `untested`, `doc`
later) — a small, intentional maintenance task — not by auto-discovery.

## Approaches considered

- **Option A — Curated surface, deliberate promotion (chosen).** Keep a
  hand-curated primary-tool set mirroring gograph's "primary token savers"
  tier, plus a generic dispatcher with a curated long-tail list. Promote a new
  command to a primary tool only when it is a clear aggregator win; add niche
  query commands to the long tail deliberately. Pro: tight, token-efficient
  surface aligned with gograph's own hierarchy; robust (no fragile parsing);
  preserves the extension's differentiation. Con: a small manual review on each
  gograph release — acceptable and intentional.

- **Option B — Auto-discovery via `gograph --help` (rejected).** Discover the
  live command set by parsing `--help`, advertise it in the generic tool.
  Rejected on three grounds: `capabilities` is prose (the documented source
  does not exist as advertised); `--help` is a fragile custom format; and the
  yield (~50 commands) re-bloats the surface v0.3.0 deliberately shed, while
  gograph's own MCP server already serves anyone who wants the full firehose.

- **Option C — MCP proxy (rejected for now).** Bridge `gograph mcp` into pi
  tools to auto-inherit the full suite. Best raw "keep up" answer, but
  sacrifices curation, custom rendering, and tight prompt routing — everything
  that justifies a pi extension over running the MCP server directly. Worth
  revisiting only if pi grows a first-class "MCP-as-tools" bridge.

**Chosen: Option A.** The curation thesis is validated by gograph's own
"primary token savers" guidance; discovery adds fragility and surface bloat
for no net benefit given the MCP server exists.

## Decisions

### Curated surface — no auto-discovery (reverses the earlier Option C plan)

The extension will NOT auto-discover subcommands. The generic dispatcher owns
a hand-curated long-tail list; primary tools are hand-curated aggregators.
New upstream commands are added deliberately when worth it. This reverses the
first revision of this doc (which chose `gograph capabilities` discovery) after
empirical investigation showed `capabilities` is prose and the curation thesis
is the extension's core value. Chosen over discovery (Option B) for robustness
and surface discipline, and over MCP proxy (Option C) to preserve the
pi-native curation that justifies the extension.

### Promote `risk` and `summary` to primary tools

`gograph_risk` and `gograph_summary` are added as primary tools (not
subcommands) because they are action-deciding aggregators — gograph's own
named "primary token savers". `summary` replaces 5 session-start calls; `risk`
fuses blast radius + complexity + coverage + API + SQL/env into one 0–100
verdict. This follows the v0.3.0 precedent of promoting one-call-replaces-many
commands to primary status with dedicated prompt routing.

### `summary` becomes the session-start anchor; `risk` the pre-commit gate

The system prompt's "Default workflow" gains `summary` as the first step
(session orientation in one call, mirroring gograph's recommended session
start), with `risk` positioned as the decision gate alongside `plan` (before
edit) and `review` (after edit). This tracks gograph's endorsed workflow in
`docs/coding-agent-usage.md`.

### Graph-free subcommands skip the index check

`doc` (a thin `go doc` wrapper) and any future graph-free command bypass the
`ensureReady` guard so they work before the first `gograph build`. The
generic dispatcher maintains a small `GRAPH_FREE_COMMANDS` set for this.

## Module outline

- `src/tools.ts` *(changed)* — add `registerRiskTool` and `registerSummaryTool`
  via the existing `registerSimpleTool` helper (typed params, prompt routing).
- `src/generic-tool.ts` *(changed)* — owns the curated long-tail `SUBCOMMANDS`
  list (no external discovery); keeps the curated flag-filter maps and the
  `SUBCOMMAND_DOCS` map (rich docs for known commands, name-only fallback);
  adds `GRAPH_FREE_COMMANDS` so `doc` skips `ensureReady`.
- `src/index.ts` *(changed)* — add `risk` + `summary` to the system prompt tool
  list and default workflow (`summary` = session start, `risk` = decision gate).
  No discovery wiring.

No `capabilities.ts` / discovery module — dropped after the empirical finding.
The long tail grows by deliberate edits to `SUBCOMMANDS` when a new command
earns a place, not by runtime discovery.