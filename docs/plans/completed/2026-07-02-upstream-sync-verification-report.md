# Verification Report: upstream-sync (risk, summary, curated surface)

**Date:** 2026-07-02
**Scope:** `feat/upstream-sync` (commits `71aa3e7`..`1c7b4ef`) — `gograph_risk` +
`gograph_summary` primary tools, generic-dispatcher curated-list refactor,
system-prompt workflow update, dropped discovery layer.
**Frontier:** empty (0 `stub()` call sites). Sentinel `src/.ptk-scaffold` present
(removed by finalize).

## Summary

| Pass | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| Security | 0 | 0 | 0 | 1 |
| Optimization | 0 | 1 (P1) | — | 2 (P2) |
| Traceability | 0 | 0 | 1 | 1 |
| **Total** | **0** | **1** | **1** | **4** |

No critical or high-severity issues. The feature is functionally correct and
green (45 pass / 0 fail). Findings are maintainability and one real
prompt↔binary capability seam.

---

## 🔴 Security Findings

### [S-001] Low — `flags` passthrough is pre-existing and accepted (informational)
**Location:** `src/generic-tool.ts:177` (flags param) → `buildGenericArgs` `src/generic-tool.ts:107`
**Issue:** The generic tool's `flags` string is `split(" ")` and passed verbatim
as argv to `gograph`. Splitting on spaces breaks quoted values (e.g.
`--msg "a b"` → `["--msg", "\"a", "b\""]`). This is **pre-existing** (not
introduced by this feature) and **accepted**: `pi.exec` uses an argv array (no
shell injection), and gograph is local-only / non-executing / reads only `.go`
files per its own safety contract.
**Fix:** No action required. Documented for completeness only.

---

## 🟡 Optimization Findings

### [O-001] P1 — `symbol-or-uncommitted-or-throw` logic + error message duplicated 4×
**Location:** `src/tools.ts:256` (context), `:330` (plan), `:384` (review), `:433` (risk)
**Issue:** Four tools implement the identical pattern — `if (uncommitted) push
--uncommitted; else if (symbol) push symbol; else throw "Provide either a symbol
name or set uncommitted=true."` — with the **same literal error string in all
four places**. `riskBuildArgs` (433) and review's buildArgs (384) are identical
except the command name. This directly violates the project's own
`docs/lessons.md` rule: *"Error messages used in multiple places should be
extracted to a shared constant or factory — duplicated messages diverge over
time."* AI fills done one-at-a-time are exactly how this drift happens.
**Fix:** Extract a shared helper, e.g.
`symbolOrUncommittedArgs(cmd: string, p: {symbol?: string; uncommitted?: boolean}): string[]`
plus a `SYMBOL_OR_UNCOMMITTED_ERROR` constant. Have context/plan/review/risk all
call it (plan adds `--with-context` afterward). Removes 4 copies → 1.

### [O-002] P2 — dead entries in `SUBCOMMAND_DOCS`
**Location:** `src/generic-tool.ts:69-71` (`untested`, `httpcalls`, `diagram`)
**Issue:** `SUBCOMMAND_DOCS` has entries for `untested`, `httpcalls`, and
`diagram`, but none are in the curated `SUBCOMMANDS` list (lines 6-13).
`buildGenericDescription` only iterates `SUBCOMMANDS`, so these three entries
are never read — dead data left over from the dropped discovery design (they
were candidate long-tail commands).
**Fix:** Either delete the three entries, or add the commands to `SUBCOMMANDS`
if they've earned a place. Deleting is the YAGNI choice until promotion.

### [O-003] P2 — scaffold artifacts still on disk (finalize handles)
**Location:** `src/_ptk/stub.ts`, `src/.ptk-scaffold`
**Issue:** `stub()` has zero call sites now (frontier empty) and nothing imports
`src/_ptk/stub.ts` (the `tools.ts` import was removed; `capabilities.ts` was
deleted). These are scaffold scaffolding, not real dead code.
**Fix:** None — `/skill:ptk-finalizing` removes both by design. Listed so it
isn't mistaken for a code defect.

---

## 🔵 Traceability Findings

### [T-001] Medium — `risk`/`summary` advertised without a gograph version gate
**Entry point:** `src/index.ts:49-51` (`registerTools` → `registerRiskTool`/`registerSummaryTool`)
and `src/index.ts:60,65-66` (system-prompt workflow + tool list)
**Call chain:** session_start → `registerTools(pi)` → registers `gograph_risk` +
`gograph_summary` unconditionally; `before_agent_start` → injects a system prompt
that tells the LLM to use them — both **regardless of installed gograph version**.
**Broken at:** the prompt↔binary capability seam.
**Issue:** `gograph_summary` requires gograph ≥ v1.4.78 and `gograph_risk`
requires ≥ v1.4.81 (per upstream RELEASE_NOTES). The extension registers both
and steers the LLM to them whenever an index exists, but never checks the
binary supports them. On an older gograph — **including the locally installed
v1.4.77** — the LLM is told to use `gograph_summary`/`gograph_risk`, invokes
them, and gets a gograph "unknown command" error. `getGographVersion()` already
exists (`src/detect.ts:89`) and is used for the status display, but not for
capability gating.
**Fix:** Version-gate registration and the prompt entries. Parse the semver from
`getGographVersion()`; only register `gograph_summary` if ≥1.4.78 and
`gograph_risk` if ≥1.4.81, and only include the corresponding prompt lines when
registered. (Graceful: on older gograph the tools simply aren't offered, so the
LLM falls back to `plan`/`review`/`explain` which exist on all versions.)

### [T-002] Low — `flags` description lists `--precise`, a build flag, not a query flag
**Location:** `src/generic-tool.ts:177`
**Issue:** The `flags` param description offers `--precise` as an example, but
`--precise` is a `gograph build` flag, not accepted by any query subcommand the
generic dispatcher exposes. An LLM following the hint would pass a no-op flag.
**Fix:** Drop `--precise` from the description (keep `--git`, `--since`,
`--test-only`, `--no-tests`).

---

## Remediation Task List

| ID | Priority | Finding | Effort | Route to |
|----|----------|---------|--------|----------|
| O-001 | P1 | Duplicated symbol-or-uncommitted logic + message (4×) | small | `/skill:ptk-modify` |
| T-001 | Medium | risk/summary advertised without version gate | medium | `/skill:ptk-modify` |
| O-002 | P2 | Dead `SUBCOMMAND_DOCS` entries (untested/httpcalls/diagram) | small | `/skill:ptk-modify` (or finalize) |
| T-002 | Low | `flags` description lists non-query `--precise` | trivial | `/skill:ptk-finalizing` |
| O-003 | P2 | Scaffold artifacts (`_ptk/stub.ts`, sentinel) | — | `/skill:ptk-finalizing` (by design) |
| S-001 | Low | `flags` passthrough (pre-existing, accepted) | — | no action |

**Recommended order:** O-001 (highest value — kills 4-way duplication and
honors the project's own lesson) → T-001 (real user-facing seam, and the only
Medium) → then finalize absorbs O-002/O-003/T-002.