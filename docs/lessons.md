# Lessons Learned

<!--
Agent: read this at the start of each task during executing-tasks.
Follow every rule. Add new rules when you catch yourself making repeat mistakes.
Retire rules that no longer apply during finalizing.
-->

## Rules

- pi's internal packages (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`) must be added as devDependencies for local TypeScript compilation and testing
- Use `pi.exec()` (not `execSync`) for actual gograph CLI calls in the runner — `execSync` is only acceptable for quick availability checks like `isGographInstalled()`
- Always run `npx tsc --noEmit` after adding new imports to catch missing type declarations early
- When vitest shows `PASS (0) FAIL (0)`, the test file likely has import errors — check if dependencies are installed locally
