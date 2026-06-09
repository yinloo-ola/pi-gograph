# Implementation Plan: Verification Fix

## Overview

Remediation of 4 findings from `docs/plans/2026-06-09-tool-reduction-verification-report.md`.

## Task Summary

| Task | Description | TDD | Checkpoint |
|------|-------------|-----|------------|
| 1 | Extract shared `ensureReady` to runner.ts | modifying-tested-code | none |
| 2 | Fix `gograph_build` missing "not installed" error | modifying-tested-code | none |
| 3 | Fix background refresh treating "already in progress" as success | modifying-tested-code | none |
| 4 | Remove useless `runGographBuild` stub test | trivial | none |
| 5 | TypeScript check and full test suite | trivial | done |

---

## Task 1: Extract shared `ensureReady` to runner.ts

<!-- tdd: modifying-tested-code -->

Move the duplicated `ensureReady` function from `tools.ts` and `generic-tool.ts` into `runner.ts`, where the CLI execution functions it guards already live.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: `ensureReady` is exported from `runner.js`
  - When: Both `tools.ts` and `generic-tool.ts` import from `runner.js`
  - Then: Both files call the same function, no duplication
- **Edge Case:**
  - Given: `ensureReady` is called when gograph is not installed
  - When: The check runs
  - Then: Throws "gograph is not installed. Run `/gograph-setup`..." error

Files:
- `src/runner.ts`
- `src/tools.ts`
- `src/generic-tool.ts`

Steps:
1. Move `ensureReady` function from `src/generic-tool.ts` to `src/runner.ts`. It needs the same imports (`isGographInstalled`, `hasIndex` from `detect.js`, `scheduleBackgroundRefresh` from `refresh.js`). Add those imports to `runner.ts` and export the function:

```typescript
// Add to runner.ts imports
import { isGographInstalled, hasIndex } from "./detect.js";
import { scheduleBackgroundRefresh } from "./refresh.js";

// Export the guard function
export async function ensureReady(
  pi: { exec: ExecFn },
  ctx: { cwd: string; ui: { setStatus: (key: string, value: string | undefined) => void } },
): Promise<void> {
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
```

> **Assumption:** Using a structural type for the `pi`/`ctx` params instead of importing `ExtensionAPI`/`ExtensionContext` to avoid adding more pi type imports to runner.ts. The `ExecFn` type is already defined there.

2. In `src/tools.ts`, remove the local `ensureReady` function and its imports of `isGographInstalled`, `hasIndex`, `scheduleBackgroundRefresh`. Add import: `import { runGograph, runGographBuild, formatOutput, ensureReady } from "./runner.js";`

3. In `src/generic-tool.ts`, remove the local `ensureReady` function and its imports of `isGographInstalled`, `hasIndex`, `scheduleBackgroundRefresh`. Add import: `import { runGograph, formatOutput, ensureReady } from "./runner.js";`

4. Run type check: `npx tsc --noEmit`
5. Run all tests: `npx vitest run`

---

## Task 2: Fix `gograph_build` missing "not installed" error

<!-- tdd: modifying-tested-code -->

Add an `isGographInstalled()` check before the build tool executes, restoring the helpful error message.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: gograph is installed
  - When: `gograph_build` is called
  - Then: Build proceeds normally
- **Edge Case (not installed):**
  - Given: gograph is not installed
  - When: `gograph_build` is called
  - Then: Throws "gograph is not installed. Run `/gograph-setup`..." (not a raw CLI error)

Files:
- `src/tools.ts`

Steps:
1. In `registerBuildTool`, add a `beforeExecute`-style check. Since `registerSimpleTool` doesn't support callbacks, the simplest approach is to check in `buildArgs` — it runs before `runGographBuild`:

```typescript
registerSimpleTool(pi, {
  name: "gograph_build",
  // ... existing config ...
  buildArgs: () => {
    // Check before building — provide helpful error if gograph not installed
    // (needsReady: false skips the ensureReady guard, so we check here)
    if (!execSync) throw new Error("gograph is not installed. Run `/gograph-setup` or: brew install ozgurcd/tap/gograph");
    const args = ["build", "."];
    // ...
  },
```

> **Assumption:** `buildArgs` is called synchronously before `runGographBuild`. `isGographInstalled()` uses `execSync` which is acceptable here per the existing lesson rule ("execSync is only acceptable for quick availability checks").

Actually, cleaner approach — import `isGographInstalled` directly in tools.ts for this one check:

```typescript
import { isGographInstalled } from "./detect.js";

// In registerBuildTool:
buildArgs: () => {
  if (!isGographInstalled()) {
    throw new Error(
      "gograph is not installed. Run `/gograph-setup` or install manually:\n" +
      "  brew install ozgurcd/tap/gograph\n" +
      "  go install github.com/ozgurcd/gograph/cmd/gograph@latest",
    );
  }
  const args = ["build", "."];
  if (false) args.push("--precise"); // placeholder
  return args;
},
```

Wait — `buildArgs` receives validated params. The `precise` check needs the actual param. Let me reconsider:

```typescript
buildArgs: (p) => {
  if (!isGographInstalled()) {
    throw new Error(
      "gograph is not installed. Run `/gograph-setup` or install manually:\n" +
      "  brew install ozgurcd/tap/gograph\n" +
      "  go install github.com/ozgurcd/gograph/cmd/gograph@latest",
    );
  }
  const args = ["build", "."];
  if (p.precise) args.push("--precise");
  return args;
},
```

2. Run type check: `npx tsc --noEmit`
3. Run all tests: `npx vitest run`

---

## Task 3: Fix background refresh treating "already in progress" as success

<!-- tdd: modifying-tested-code -->

Check the return value of `runGographBuild` in `refresh.ts`. If it returns `"(build already in progress)"`, skip the index state write and status update — leave the in-progress status intact.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: Background refresh triggers and no build is in progress
  - When: The build completes
  - Then: Status updates to "gograph ✓" and index state is written
- **Edge Case (already in progress):**
  - Given: A tool-triggered build is running
  - When: Background refresh fires
  - Then: Status remains "gograph: rebuilding index in background..." (set by the tool build), no index state is written, no error is logged
- **Edge Case (build fails):**
  - Given: The build fails
  - When: Background refresh catches the error
  - Then: Status shows "gograph: rebuild failed" (existing behavior, unchanged)

Files:
- `src/refresh.ts`

Steps:
1. In `scheduleBackgroundRefresh` in `src/refresh.ts`, capture the return value of `runGographBuild` and check for the skip message:

```typescript
// Before (line ~122):
await runGographBuild(["build", "."], undefined, 60_000);
await writeIndexState(cwd, current);

// After:
const buildResult = await runGographBuild(["build", "."], undefined, 60_000);
if (buildResult === "(build already in progress)") {
  // Another build is already running — don't overwrite its status
  return;
}
await writeIndexState(cwd, current);
```

2. Run type check: `npx tsc --noEmit`
3. Run all tests: `npx vitest run`

---

## Task 4: Remove useless `runGographBuild` stub test

<!-- tdd: trivial -->

Remove the `runGographBuild` test that only checks `typeof` — it adds no verification value.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: The stub test is removed
  - When: `npx vitest run __tests__/runner.test.ts` is run
  - Then: 5 tests pass (all formatOutput tests), 0 failures

Files:
- `__tests__/runner.test.ts`

Steps:
1. Remove the `runGographBuild` describe block and its import:

```typescript
// Remove this:
import { formatOutput, runGographBuild } from "../src/runner.js";
// ...
describe("runGographBuild", () => {
  it("exports a function", () => {
    expect(typeof runGographBuild).toBe("function");
  });
});
```

Change import back to:
```typescript
import { formatOutput } from "../src/runner.js";
```

2. Run tests: `npx vitest run __tests__/runner.test.ts`

---

## Task 5: TypeScript check and full test suite

<!-- tdd: trivial -->
<!-- checkpoint: done -->

Final verification.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path:**
  - Given: All tasks complete
  - When: `npx tsc --noEmit` is run
  - Then: Zero type errors
- **Happy Path:**
  - Given: All tasks complete
  - When: `npx vitest run` is run
  - Then: All tests pass

Files:
- All source files (verification only)

Steps:
1. Run `npx tsc --noEmit`
2. Run `npx vitest run`

⏸ **CHECKPOINT: done** — present implementation review. Wait for human approval before committing.

## Architectural Review

**Status**: Skipped — trivial fixes. No high-risk operations detected.
