# Lessons Learned

<!--
Agent: read this at the start of each task during ptk-execute.
Follow every rule. Add new rules when you catch yourself during repeat mistakes.
Retire rules that no longer apply during finalizing.
-->

## Rules

- pi's internal packages (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`) must be added as devDependencies for local TypeScript compilation and testing
- Always run `npx tsc --noEmit` after adding new imports to catch missing type declarations early

## Dependencies & Execution

- Use `pi.exec()` (not `execSync`) for actual CLI calls in the runner — `execSync` is only acceptable for quick availability checks (e.g., `which gograph`, `gograph --version`)
- Provide sync and async wrappers when a check function is needed in both sync callbacks (e.g., `buildArgs`) and async contexts — the async wrapper should delegate to the sync one to avoid duplication

## Testing

- When verifying extension changes work in a real project, ensure the local extension path is the **only** source — a global `npm:<package>` in `~/.pi/agent/settings.json` will shadow the local path and load the published version instead
- When vitest shows `PASS (0) FAIL (0)`, the test file likely has import errors — check if dependencies are installed locally

## Prompting

- Aggregation tools (plan, review, explain) need explicit routing in both the system prompt AND promptGuidelines — a passive tool list is not enough to prevent the agent from falling back to calling individual tools separately
- In promptGuidelines, always name the tool explicitly ("Use gograph_plan when..."), never use "this tool" — the LLM cannot tell which tool "this" refers to

## Code Review

- When calling async functions from synchronous contexts, verify the return type — `!Promise<boolean>` is always `false` because Promises are truthy. TypeScript won't catch this if the sync callback's return type doesn't use `await`.
- Error messages used in multiple places should be extracted to a shared constant or factory — duplicated messages diverge over time and one location gets missed during updates
- When adding a guard pattern (e.g., checking return values) in one file, grep for the same pattern in all files — partial fixes are easy to miss
## External Tool Integration

- Before building an auto-discovery / auto-sync layer around an external CLI's introspection (e.g. `gograph capabilities`, `--help`), run it once and confirm the output is actually machine-readable. A command named `capabilities` can emit curated human prose, and a custom `--help` can be a fragile non-standard format. When introspection isn't clean, prefer deliberate curation over fragile parsing — and check whether the upstream tool already ships its own full-surface path (e.g. an MCP server) before duplicating it.
- Extract pure helpers (e.g. `buildArgs`, `needsGraph`) from tool-registration configs so they can be unit-tested directly, instead of reaching for module mocking or a mock-`ExtensionAPI` to test inline closures.
