# Decisions: Keeping pi-gograph in sync with upstream gograph

## Problem

pi-gograph v0.3.1 deliberately reduced its tool surface from 23 → 9 (8 curated
primary tools + 1 generic `gograph` dispatcher with 15 hard-coded subcommands)
to push the LLM toward aggregation tools and avoid overwhelming it.

Upstream gograph now ships fast: **5 new analytical commands in ~2 weeks**
(v1.4.78–1.4.87). Hand-maintaining the `SUBCOMMANDS` literal union in
`generic-tool.ts` for every release is perpetual churn and always lags behind
upstream — the extension advertises a stale command set the moment a new
gograph release lands.

Two of those new commands are genuine aggregators that match the extension's
"one call replaces many" philosophy and deserve curated primary-tool status:

- **`risk`** (v1.4.81) — normalized 0–100 change-risk score + SAFE/REVIEW/DANGER
  verdict, fusing blast radius + complexity + coverage + API + SQL/env. The
  natural sibling of `plan` (before) and `review` (after); decision-driving.
- **`summary`** (v1.4.78) — single-call codebase briefing aggregating
  hotspots + coupling + orphans + complexity + godobj. Replaces 5 calls → 1;
  the missing session-start anchor the system prompt's "Default workflow" needs.

The other new commands (`untested`, `doc`, `httpcalls`) are useful but narrower
query/inspection commands that belong in the generic dispatcher's long tail —
and should become available *without* a code change per release.

## Approaches considered

- **Option A — Selective curation (status quo).** Manually promote aggregators
  to primary tools; hand-add the rest to the `SUBCOMMANDS` literal each release.
  Pro: stays fully curated. Con: every release = a manual diff; the advertised
  command set drifts behind upstream the moment a release ships.

- **Option B — Fully dynamic passthrough.** Generic `gograph` tool discovers the
  full command set from `gograph capabilities` and passes through arbitrary
  subcommands + raw flags with no curation. Pro: zero maintenance. Con: loses
  typed flag validation and the per-subcommand flag filtering; the LLM learns
  flag usage from upstream docs instead of a typed schema.

- **Option C — Hybrid (curated primaries + dynamically discovered long tail).**
  Keep the hand-tuned primary tools (best prompt routing + typed params).
  Replace the hard-coded subcommand list with live discovery via
  `gograph capabilities`. Manually promote a new command to a primary tool only
  when it's a clear aggregator win.

**Chosen: Option C.** It answers "how do we keep up" directly — the long tail
auto-syncs, so new query commands flow through with no code change, while the
high-value aggregators keep their curated prompt routing. The cost is one
discovery + cache step in the generic tool, paid once.

## Decisions

### Hybrid tool surface — curated primaries + dynamically discovered long tail

The extension will not hand-maintain the full gograph subcommand list. Primary
tools remain hand-curated (typed params, prompt routing, aggregation-focused);
the generic dispatcher discovers its subcommand set live from `gograph
capabilities` at session start. New upstream query commands become available
with zero code change; only genuine aggregators are manually promoted to
primary tools. This was chosen over fully-dynamic (Option B) to preserve typed
flag validation and prompt routing where they matter most, and over pure
curation (Option A) to stop the perpetual lag behind upstream.

### Promote `risk` and `summary` to primary tools

`gograph_risk` and `gograph_summary` are added as primary tools (not
subcommands) because they are action-deciding aggregators — `summary` replaces
5 session-start calls, `risk` fuses 5 analyses into one verdict. This follows
the 0.3.0 precedent of promoting one-call-replaces-many commands to primary
status with dedicated prompt routing. Narrower new commands (`untested`,
`doc`, `httpcalls`) stay in the discovered long tail.

### `summary` becomes the session-start anchor in the default workflow

The system prompt's "Default workflow" gains `summary` as the first step
(session orientation in one call), with `risk` positioned as a decision gate
alongside `plan` (before edit) and `review` (after edit). This is reversible
prompt tuning, but recording it so the workflow ordering is intentional.

## Module outline

- `src/capabilities.ts` *(new)* — discovery layer: query `gograph capabilities`
  at session start, normalize the live subcommand list, cache the result for
  the generic tool to consume. Graceful fallback to a safe default set if
  discovery fails or `gograph capabilities` output is unparseable.
- `src/tools.ts` *(changed)* — add `registerRiskTool` and `registerSummaryTool`
  via the existing `registerSimpleTool` helper (typed params, prompt routing).
- `src/generic-tool.ts` *(changed)* — replace the hard-coded `SUBCOMMANDS`
  literal union with the discovered set from `capabilities.ts`; keep the typed
  flag-filter maps (depth/filesOnly/uncommitted) tolerant of subcommands that
  aren't present; tolerate graph-free subcommands (e.g. `doc`).
- `src/index.ts` *(changed)* — run discovery before registering the generic
  tool; add `risk` + `summary` to the system prompt tool list and default
  workflow (`summary` = session start, `risk` = decision gate).
- `src/runner.ts` *(possibly changed)* — expose a capability-query path (or
  reuse the existing `runGograph`), decided at scaffold.

### Open consideration for scaffold

`doc` (and any future graph-free subcommand) does not need an AST index. The
generic tool currently always calls `ensureReady`. Discovery must not force a
graph build for subcommands that don't need one — scaffold to decide the
mechanism (a small graph-free exclusion set sourced from the same
`capabilities` data, vs. a lenient `ensureReady`). Flagging because it
interacts with the discovery work; resolving it is scaffold's call, not a
hard-to-reverse decision worth an ADR here.