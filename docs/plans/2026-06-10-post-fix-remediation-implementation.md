# Implementation Plan: Post-Fix Verification Remediation

## Overview

Fix 4 findings from `docs/plans/2026-06-10-post-fix-verification-report.md`.

## Task Summary

| Task | Description | TDD | Checkpoint |
|------|-------------|-----|------------|
| 1 | Fix T-001 + O-002: add `isGographInstalledSync`, extract shared error, fix dead-code check | modifying-tested-code | none |
| 2 | Fix T-002: commands.ts check `runGographBuild` return value | modifying-tested-code | none |
| 3 | Fix O-001: remove dead type exports from generic-tool.ts | trivial | none |
| 4 | TypeScript check and full test suite | trivial | none |

---

## Task 1: Fix T-001 + O-002 — sync install check + shared error message

<!-- tdd: modifying-tested-code -->

**T-001:** `isGographInstalled()` is async but called without `await` in `tools.ts:174` (sync `buildArgs` context). Promise is always truthy → check is dead code.
**O-002:** "Not installed" error message duplicated in 3 places with inconsistent wording.

Fix both by adding a sync wrapper and shared error constant in `detect.ts`, then updating all callers.

Acceptance Criteria (QA Engineer Hat):
- **Happy Path (T-001):**
  - Given: gograph is not installed
  - When: `gograph_build` tool's `buildArgs` runs
  - Then: `isGographInstalledSync()` returns `false`, the error is thrown with the shared message
- **Edge Case (O-002):**
  - Given: The error message needs to change
  - When: It's updated in one place
  - Then: All three callers use the same message

Files:
- `src/detect.ts`
- `src/tools.ts`
- `src/runner.ts`
- `src/commands.ts`
- `__tests__/detect.test.ts`

Steps:
1. In `src/detect.ts`, add shared constant, sync wrapper, and error factory:

```typescript
const GOGRAPH_NOT_INSTALLED_MSG =
  "gograph is not installed. Run `/gograph-setup` or install manually:\n" +
  "  brew install ozgurcd/tap/gograph\n" +
  "  go install github.com/ozgurcd/gograph/cmd/gograph@latest";

/**
 * Check if gograph is installed (synchronous — uses execSync).
 * For sync contexts like tool buildArgs callbacks.
 */
export function isGographInstalledSync(): boolean {
  try {
    execSync("gograph --version", { timeout: 3000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gograph is installed (async wrapper around sync check).
 */
export async function isGographInstalled(): Promise<boolean> {
  return isGographInstalledSync();
}

/** Shared "not installed" error for consistent messaging. */
export function gographNotInstalledError(): Error {
  return new Error(GOGRAPH_NOT_INSTALLED_MSG);
}
```

2. In `src/tools.ts`, replace the `isGographInstalled` import and the inline error:
```typescript
import { isGographInstalledSync, gographNotInstalledError } from "./detect.js";
// ...
buildArgs: (p) => {
  if (!isGographInstalledSync()) {
    throw gographNotInstalledError();
  }
  // ...
},
```

3. In `src/runner.ts`, replace the inline error with the shared one:
```typescript
import { isGographInstalledSync, hasIndex, gographNotInstalledError } from "./detect.js";
// ...
if (!isGographInstalledSync()) {
  throw gographNotInstalledError();
}
// ...
```

4. In `src/commands.ts`, replace the short message:
```typescript
import { hasIndex as hasGographIndex, isGographInstalled, gographNotInstalledError } from "./detect.js";
// Line 167: replace inline string with throw gographNotInstalledError()
```

5. Add test for `isGographInstalledSync` in `__tests__/detect.test.ts`:
```typescript
import { isGoRepo, hasIndex, getGographVersion, isGographInstalledSync, gographNotInstalledError } from "../src/detect.js";

describe("isGographInstalledSync", () => {
  it("returns boolean (not Promise)", () => {
    const result = isGographInstalledSync();
    expect(typeof result).toBe("boolean");
  });
});

describe("gographNotInstalledError", () => {
  it("returns an Error with setup instructions", () => {
    const err = gographNotInstalledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("/gograph-setup");
    expect(err.message).toContain("brew install");
  });
});
```

6. Run `npx tsc --noEmit` and `npx vitest run`

---

## Task 2: Fix T-002 — commands.ts check `runGographBuild` return value

<!-- tdd: modifying-tested-code -->

Apply the same guard pattern used in `refresh.ts` to both `runGographBuild` call sites in `commands.ts`.

Acceptance Criteria (QA Engineer Hat):
- **Edge Case (already in progress — setup command):**
  - Given: A build is already running when `/gograph-setup` reaches the build step
  - When: `runGographBuild` returns `"(build already in progress)"`
  - Then: No index state is written, status shows a message about the in-progress build
- **Edge Case (already in progress — build command):**
  - Given: A build is already running when `/gograph-build` runs
  - When: `runGographBuild` returns `"(build already in progress)"`
  - Then: No index state is written, status shows a message about the in-progress build

Files:
- `src/commands.ts`

Steps:
1. In `registerSetupCommand`, line ~110:
```typescript
// Before:
await runGographBuild(["build", "."], undefined, 60_000);
await saveIndexState(pi, commandCtx.cwd);

// After:
const buildResult = await runGographBuild(["build", "."], undefined, 60_000);
if (buildResult === "(build already in progress)") {
  commandCtx.ui.notify("Build already in progress — skipping.", "warning");
  return;
}
await saveIndexState(pi, commandCtx.cwd);
```

2. In `registerBuildCommand`, line ~185:
```typescript
// Before:
await runGographBuild(cmdArgs, undefined, 60_000);
await saveIndexState(pi, commandCtx.cwd);

// After:
const buildResult = await runGographBuild(cmdArgs, undefined, 60_000);
if (buildResult === "(build already in progress)") {
  commandCtx.ui.notify("Build already in progress — skipping.", "warning");
  return;
}
await saveIndexState(pi, commandCtx.cwd);
```

3. Run `npx tsc --noEmit` and `npx vitest run`

---

## Task 3: Fix O-001 — remove dead type exports from generic-tool.ts

<!-- tdd: trivial -->

Remove `export` from `Subcommand` type and `GenericInput` interface since they're never imported outside `generic-tool.ts`.

Files:
- `src/generic-tool.ts`

Steps:
1. Change `export type Subcommand` to `type Subcommand` (line ~17)
2. Change `export interface GenericInput` to `interface GenericInput` (line ~73)
3. Run `npx tsc --noEmit` and `npx vitest run`

---

## Task 4: TypeScript check and full test suite

<!-- tdd: trivial -->

Files: all (verification only)

Steps:
1. `npx tsc --noEmit`
2. `npx vitest run`
