# Verification Report: Tool Reduction & Agent Intelligence

**Date:** 2026-06-09
**Scope:** 12 files changed (1690 insertions, 971 deletions) — tool reduction from 23 → 8 primary + 1 generic, new system prompt, build lock, registerSimpleTool helper
**Reviewer:** AI verify skill (security + optimization + traceability)

## Summary

| Pass | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| Security | — | — | — | 1 |
| Optimization | — | — | 2 | 2 |
| Traceability | — | — | 2 | — |
| **Total** | **0** | **0** | **4** | **3** |

## 🔴 Security Findings

### [S-001] Low — `flags` string passes LLM-controlled tokens to CLI args

**Location:** `src/generic-tool.ts:113`

**Issue:** The `flags` string parameter is split on spaces and pushed directly into CLI args. A malformed LLM output like `--output; rm -rf /` would be split into `["--output;", "rm", "-rf", "/"]` and passed to `execFn`. However, `execFn` spawns a subprocess via `pi.exec()` which takes an args array (not a shell string), so semicolons and shell operators have no special meaning. The worst case is gograph receiving an unknown flag and rejecting it.

**Fix:** No fix needed — the args-array execution model prevents shell injection. Document this as an intentional design choice.

## 🟡 Optimization Findings

### [O-001] P1 — Duplicated `ensureReady` function

**Location:** `src/tools.ts:81-97` and `src/generic-tool.ts:119-136`

**Issue:** Both `tools.ts` and `generic-tool.ts` define identical `ensureReady` functions — same logic, same error messages, same `scheduleBackgroundRefresh` call. If one is updated, the other won't be.

**Fix:** Extract `ensureReady` to a shared module (e.g. `src/guards.ts`) and import from both files. Or move it to `runner.ts` alongside the CLI execution functions it guards.

### [O-002] P1 — `SimpleToolConfig` uses `any` types throughout

**Location:** `src/tools.ts:103-112`

**Issue:** The `registerSimpleTool` helper's config interface uses `any` for `buildArgs`, `renderCallArgs`, and `renderExpanded`. This sacrifices type safety for simplicity — callers get no compile-time checking that their `buildArgs` function returns the right shape or that `renderCallArgs` uses the right theme API.

**Fix:** Acceptable tradeoff for an internal helper. The real type safety comes from pi's `registerTool` validating the tool definition. If stricter typing is desired later, the generic can be restored with `TSchema` constraint and explicit `Static<>` casts at each call site.

### [O-003] P2 — Unused import `ExtensionContext` in generic-tool.ts

**Location:** `src/generic-tool.ts:1`

**Issue:** `ExtensionContext` is imported but the `ensureReady` function in generic-tool.ts uses `ExtensionContext` implicitly through the `ctx` parameter type from `registerTool`. The import is used for the `ensureReady` parameter type annotation.

**Fix:** No fix needed — `ExtensionContext` is used in the `ensureReady` signature.

### [O-004] P2 — `runGographBuild` test is a stub

**Location:** `__tests__/runner.test.ts:31-34`

**Issue:** The `runGographBuild` test only checks `typeof` — it doesn't verify the lock behavior (concurrent rejection, release on failure). The plan acknowledged this but the test adds no value beyond confirming the export exists.

**Fix:** Either remove the test (it documents nothing) or add a note explaining why it's intentionally minimal.

## 🔵 Traceability Findings

### [T-001] Medium — `gograph_build` tool skips `ensureReady` but doesn't validate gograph is installed

**Location:** `src/tools.ts:136` (registerBuildTool) and `src/tools.ts:117` (registerSimpleTool execute)

**Issue:** `gograph_build` has `needsReady: false` to skip the guard. The original `tools.ts` had its own `isGographInstalled()` check inside the build tool's execute function. Now `registerSimpleTool` just calls `runGographBuild` directly. If gograph isn't installed, `runGograph` will throw `"Runner not initialized"` or `gograph error` — not the helpful "gograph is not installed. Run /gograph-setup" message.

**Fix:** Add an `isGographInstalled()` check in the `gograph_build` tool's `buildArgs` function (which can throw before the build runs), or add an optional `beforeExecute` callback to `registerSimpleTool` that the build tool can use for pre-exec validation.

### [T-002] Medium — `refresh.ts` uses `runGographBuild` but background refresh is not coordinated with tool-triggered builds

**Location:** `src/refresh.ts:122` and `src/runner.ts:54`

**Issue:** The build lock works: if `runGographBuild` is called while a build is in progress, it returns `"(build already in progress)"`. However, the *caller* in `refresh.ts` treats this as a success — the output `"(build already in progress)"` passes through `writeIndexState` and `backgroundStatus = null; ui.setStatus("gograph", "gograph ✓")` even though no build actually happened. The status bar would show "gograph ✓" when the index is stale.

**Fix:** In `refresh.ts`, check the return value of `runGographBuild`. If it returns `"(build already in progress)"`, don't write index state or clear the status — leave the in-progress status intact and retry next time.

## Remediation Task List

| ID | Priority | Finding | Estimated Effort |
|----|----------|---------|-----------------|
| T-001 | Medium | gograph_build loses helpful "not installed" error message | Small |
| T-002 | Medium | Background refresh treats "already in progress" as success, clears status incorrectly | Small |
| O-001 | P1 | Duplicated ensureReady across tools.ts and generic-tool.ts | Small |
| O-004 | P2 | runGographBuild test is a stub that adds no value | Trivial |
| S-001 | Low | Document intentional design choice for flags string | Trivial |
| O-002 | P1 | SimpleToolConfig uses any types (acceptable tradeoff) | — |
