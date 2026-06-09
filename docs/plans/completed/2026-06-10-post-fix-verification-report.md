# Verification Report: Tool Reduction (Post-Fix)

**Date:** 2026-06-10
**Scope:** 14 files changed (+2065/-982) across 12 commits on `tool-reduction` branch, including the 5-task verification fix
**Reviewer:** AI verify skill (security + optimization + traceability)

## Summary

| Pass | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| Security | — | — | — | — |
| Optimization | — | — | — | 2 |
| Traceability | — | 1 | 1 | — |
| **Total** | **0** | **1** | **1** | **2** |

## 🔴 Security Findings

No findings. All `pi.exec` calls use args arrays (no shell injection surface). `execSync` is only used for hardcoded `"gograph --version"` checks. No secrets, no auth surface, no network endpoints. The `flags` string parameter in the generic tool is split and passed as individual CLI args — safe because the execution model is args-array, not shell string.

## 🟡 Optimization Findings

### [O-001] P2 — Dead type exports from generic-tool.ts

**Location:** `src/generic-tool.ts:17` and `src/generic-tool.ts:73`

**Issue:** `Subcommand` type and `GenericInput` interface are exported but never imported by any other file. The test file imports `buildGenericArgs` directly (not the types). These exports add noise to the module's public API.

**Fix:** Remove the `export` keyword from both. `GenericInput` can stay as a local interface since `buildGenericArgs` uses it as a parameter type.

### [O-002] P2 — "Not installed" error message duplicated in 3 places with inconsistent wording

**Location:** `src/runner.ts:91`, `src/tools.ts:176`, `src/commands.ts:167`

**Issue:** Three different "gograph is not installed" messages:
- runner.ts/ensureReady: `"gograph is not installed. Run \`/gograph-setup\` or install manually:\n  brew install ozgurcd/tap/gograph\n  go install github.com/ozgurcd/gograph/cmd/gograph@latest"`
- tools.ts/buildArgs: identical to runner.ts (copy-paste)
- commands.ts/build handler: `"gograph is not installed. Run /gograph-setup first."` (shorter, different backtick style)

If the install instructions change, three places must be updated.

**Fix:** Extract the full message to a shared constant (e.g. in `detect.ts` alongside `isGographInstalled`). All three locations reference the same string.

## 🔵 Traceability Findings

### [T-001] High — `isGographInstalled()` called without `await` in gograph_build — check is dead code

**Entry point:** `src/tools.ts:174` (registerBuildTool → buildArgs)
**Call chain:** LLM calls `gograph_build` → `registerSimpleTool.execute` → `config.buildArgs(params)` → `isGographInstalled()`
**Broken at:** `tools.ts:174` — `isGographInstalled()` is called without `await`

**Issue:** `isGographInstalled()` is declared `async` in `detect.ts:63` and returns `Promise<boolean>`. In `tools.ts:174`, it's called inside `buildArgs` which is synchronous (`(params: any) => string[]`). Without `await`, `!isGographInstalled()` evaluates `!Promise<boolean>`. Since Promises are truthy, this is always `false`. The error throw on line 175–179 is **unreachable dead code**.

When gograph is not installed, the tool silently proceeds to `runGographBuild`, which calls `runGograph("gograph", ["build", "."])`, which throws a raw `gograph error` (likely "command not found") instead of the helpful "Run `/gograph-setup`" message. **The verification fix from Task 2 introduced a bug.**

All other callers of `isGographInstalled()` correctly use `await`: runner.ts:89, refresh.ts:108, index.ts:41, commands.ts:35/129/165.

**Fix:** The `buildArgs` callback is synchronous (returns `string[]`, not `Promise<string[]>`), so `await` cannot be added. Options:
1. **Simplest:** Add a sync wrapper to `detect.ts` — `export function isGographInstalledSync(): boolean { try { execSync("gograph --version", { timeout: 3000, stdio: "ignore" }); return true; } catch { return false; } }` and use it in `buildArgs`.
2. **Alternative:** Add a `beforeExecute?: (params: any) => Promise<void>` callback to `registerSimpleTool` and move the check there (async context).
3. **Alternative:** Change `buildArgs` in `SimpleToolConfig` to `(params: any) => string[] | Promise<string[]>` and add `await` — but this changes the interface for all 8 tools.

Option 1 is the smallest change and aligns with the existing lesson: "execSync is only acceptable for quick availability checks like isGographInstalled()".

### [T-002] Medium — commands.ts doesn't check `runGographBuild` return value (same class as fixed T-002 in refresh.ts)

**Entry point:** `src/commands.ts:110` (gograph-setup handler) and `src/commands.ts:185` (gograph-build handler)
**Call chain:** User runs `/gograph-setup` or `/gograph-build` → `runGographBuild(...)` → `saveIndexState(...)`
**Broken at:** Both locations unconditionally call `saveIndexState` after `runGographBuild`

**Issue:** The refresh.ts fix (commit `a8fc4bb`) correctly checks `if (buildResult === "(build already in progress)") return;` before writing state. But commands.ts has the same pattern in two places without the check:
- `commands.ts:110`: `await runGographBuild(...)` → `await saveIndexState(...)` → shows "✓"
- `commands.ts:185`: `await runGographBuild(...)` → `await saveIndexState(...)` → shows "✓"

If a build is already in progress when these commands run, the return value `"(build already in progress)"` is ignored, a stale index state is written, and the status shows "gograph ✓" despite no build completing.

**Practical impact is low** — `/gograph-setup` runs during initial setup (no concurrent builds expected) and `/gograph-build` is user-initiated (unlikely to race). But the inconsistency with refresh.ts means the fix is incomplete.

**Fix:** Apply the same `if (buildResult === "(build already in progress)")` guard before `saveIndexState` in both locations. Optionally also apply it to the `registerSimpleTool` execute path (when `useBuildLock: true` and the build is skipped, the tool currently returns the string "(build already in progress)" as successful output, which is misleading).

## Remediation Task List

| ID | Priority | Finding | Estimated Effort |
|----|----------|---------|-----------------|
| T-001 | High | `isGographInstalled()` without await in buildArgs — dead code, "not installed" error never fires | Small |
| T-002 | Medium | commands.ts doesn't check `runGographBuild` return — same class as fixed refresh.ts bug | Small |
| O-001 | P2 | Dead type exports from generic-tool.ts | Trivial |
| O-002 | P2 | "Not installed" error message duplicated in 3 places | Trivial |
