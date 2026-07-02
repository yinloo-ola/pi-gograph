# Re-Verification Report: upstream-sync (post-modify)

**Date:** 2026-07-02
**Scope:** re-verify after the `/skill:ptk-modify` fixes for O-001, T-001,
O-002, O-003, T-002 (commits `971557c`..`9de7226`). No sentinel remains
(removed in cleanup), so scope is the recent behavior changes — primarily the
T-001 version-gating and the O-001 buildArgs dedup.
**Tree:** tsc clean · 64 pass / 0 fail / 0 todo.

## Summary

| Pass | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| Security | 0 | 0 | 0 | 0 |
| Optimization | 0 | 0 | 0 | 0 |
| Traceability | 0 | 0 | 0 | 0 |
| Documentation | — | — | — | 1 |
| **Total** | **0** | **0** | **0** | **1** |

**All prior code-level findings are resolved with no regressions and no new
code-level issues.** The only open item is documentation drift, which is
finalize's job.

## Resolution of prior findings

| Prior ID | Status | Evidence |
|---|---|---|
| O-001 (4× buildArgs duplication) | ✅ resolved | `symbolOrUncommittedArgs` + `SYMBOL_OR_UNCOMMITTED_ERROR` now the single source (`tools.ts:392-401`); all 4 buildArgs route through it; error literal appears once; 16 characterization tests green. |
| O-002 (dead `SUBCOMMAND_DOCS` entries) | ✅ resolved | `untested`/`httpcalls`/`diagram` removed; grep confirms none remain in `generic-tool.ts`. |
| O-003 (scaffold artifacts) | ✅ resolved | `src/_ptk/stub.ts` + `src/.ptk-scaffold` removed; `src/_ptk/` dir gone; no imports of `_ptk/stub` remain. |
| T-001 (risk/summary version-gate seam) | ✅ resolved | See traceability check below. |
| T-002 (`--precise` query-flag hint) | ✅ resolved | Removed from both the flags param description and the description-builder string in `generic-tool.ts`; remaining `--precise` refs are legitimate `build`-tool usage. |
| S-001 (flags passthrough) | accepted | Pre-existing, no action (per user). |

## Traceability check (T-001 — the seam that mattered)

The T-001 risk was the prompt advertising tools the binary couldn't run.
Verified the gating is now consistent end-to-end:

- **`registerTools(pi, version)`** (`tools.ts:179`) gates: `versionMeets(version, SUMMARY_MIN_VERSION)` → `registerSummaryTool`; `versionMeets(version, RISK_MIN_VERSION)` → `registerRiskTool`.
- **System prompt** (`index.ts:53-54`) uses the *identical* conditions (`versionMeets(version, SUMMARY_MIN_VERSION)` / `RISK_MIN_VERSION`) to conditionally include the summary/risk workflow lines, tool-list lines, and aggregator rule.
- Both consume the same `version` captured once at `index.ts:45` (`getGographVersion()`).
- → **Registered tool set always equals advertised tool set.** The seam is closed.
- `registerTools` has exactly one production caller (`index.ts:47`, always passes `version`), so the `= null` default can't silently drop the gated tools in production.
- `versionMeets` fails closed on null/unparseable (verified against `getGographVersion()`'s real output `"gograph version v1.4.77"` → correctly `false` for both thresholds locally).

`versionMeets` edge cases all correct: equal → true, greater (any index) → true, less → false, null → false, unparseable → false, prerelease/4-part (`1.4.81-rc1`, `1.4.81.0`) → regex extracts `1.4.81` (rc treated as meeting — reasonable, the feature is present).

## 📄 Documentation Findings

### [D-001] Low — README + CHANGELOG drift (risk/summary/doc not documented)
**Location:** `README.md:95-102` (primary-tools table), `README.md:108-124` (generic subcommand list), `CHANGELOG.md` (stops at 0.3.1)
**Issue:** The README primary-tools table lists 8 tools but not the new
`gograph_risk` / `gograph_summary`; the generic-subcommand list omits `doc`
(added to `SUBCOMMANDS` during this feature); and `CHANGELOG.md` has no entry
for the 0.4.0 work (risk/summary, version-gating, dropped discovery). The
status-bar example also still reads `gograph 0.3.1`. These are pure docs — the
code and system prompt are correct; only the human-facing docs lag.
**Fix:** Fold into `/skill:ptk-finalizing` — add the two primary tools + `doc`
to the README tables, write the 0.4.0 CHANGELOG entry, bump `package.json`
version, update the status-bar example string.

## Remediation Task List

| ID | Priority | Finding | Effort | Route to |
|----|----------|---------|--------|----------|
| D-001 | Low | README/CHANGELOG drift (risk/summary/doc + version) | small | `/skill:ptk-finalizing` |

**Recommendation:** code is shippable. Run `/skill:ptk-finalizing` to absorb
D-001 (docs + version bump + PR).