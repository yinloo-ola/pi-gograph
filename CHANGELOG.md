# Changelog
## 0.4.0

### Added
- `gograph_summary` primary tool — session-start orientation in one call (registers when gograph ≥1.4.78)
- `gograph_risk` primary tool — pre-commit blast radius + complexity + coverage + API + SQL in a single 0-100 verdict (registers when gograph ≥1.4.81)
- `doc` to the generic tool's curated subcommand list (graph-free, no index needed)
- `versionMeets` for cross-version compatibility; tools version-gated so the LLM never sees tools the installed binary can't run
- Prompt now conditionally adapts workflow and tool list based on installed gograph version
- `needsGraph` helper for clean graph-free subcommand gating
- `symbolOrUncommittedArgs` shared helper to deduplicate buildArgs across context, plan, review, risk

### Changed
- System prompt: `gograph_summary` becomes the session-start anchor; `gograph_risk` joins `gograph_plan` as a pre-edit decision gate
- Generic tool now curates 16 subcommands (was 15)

### Fixed
- `--precise` removed from the generic tool's flags hint (it is a build-time flag, not a query flag)
- Removed dead `SUBCOMMAND_DOCS` entries for `untested`, `httpcalls`, `diagram`

### Removed
- Scaffold artifacts (`src/_ptk/stub.ts`, `src/.ptk-scaffold`) and discovery module (`src/capabilities.ts`)

## 0.3.1

### Fixed
- `gograph_review` no longer reports stale data after edits. It now rebuilds the gograph AST index automatically before running the review, so the post-edit verification reflects the latest changes. Use the new `skipRebuild` parameter to opt out.

### Changed
- All tool descriptions and prompt guidelines rewritten to match the actual gograph CLI behavior. Removed references to non-existent tool names (`gograph_source`, `gograph_callers`, `gograph_callees`, `gograph_fields`, `gograph_impact`) that were causing the LLM to hallucinate tool invocations.
- The `gograph` generic tool's description now lists all 13 supported subcommands with brief usage notes and example invocations.

### Added
- `SimpleToolConfig.preExecute` hook in `src/tools.ts` — a generic way to run a CLI command before the main tool command. Currently used by `gograph_review` for the implicit rebuild.
- `gograph_review` accepts a new `skipRebuild` parameter (default: `false`) to skip the implicit index rebuild.

## 0.3.0

### Changed

- **Tool reduction: 23 tools → 9 tools.** 8 primary tools (build, query, context, implementers, endpoint, plan, explain, review) + 1 generic `gograph` dispatcher for 15 subcommands (callers, callees, source, fields, impact, path, returnusage, errorflow, changes, check, focus, stats, dependents, usages, literals)
- `gograph` generic tool supports typed parameters (`depth`, `filesOnly`, `uncommitted`) and a `flags` string fallback for rare flags (`--git`, `--since`, `--test-only`, etc.)
- System prompt now includes explicit "NEVER" anti-patterns to prevent the LLM from chaining low-level tools when aggregation tools (plan, review, explain) would suffice
- `gograph_build` now uses an in-memory lock to prevent concurrent builds
- Background refresh no longer overwrites status when a build is already in progress

### Fixed

- `gograph_build` now correctly shows "not installed" error when gograph is missing (previously fell through to a raw CLI error)
- Background refresh and slash commands now check for concurrent builds before writing index state
- Error message for "gograph not installed" is now consistent across all entry points

### Removed

- 14 individual tool registrations removed (callers, callees, source, fields, impact, path, returnusage, errorflow, changes, check, focus, stats, dependents, usages, literals) — available via the generic `gograph` tool instead

## 0.2.0

### Added

- **10 new tools:** `gograph_plan`, `gograph_explain`, `gograph_review`, `gograph_returnusage`, `gograph_errorflow`, `gograph_changes`, `gograph_stats`, `gograph_dependents`, `gograph_usages`, `gograph_literals`
- **`gograph_callers`** and **`gograph_callees`** now support `--depth N` for multi-hop traversal
- **`gograph_context`** now supports `--uncommitted` for all modified symbols
- **`gograph_impact`** now supports `--since <ref>` and `--files-only`
- **`gograph_implementers`** now supports `--test-only` for mock/test implementations
- **`gograph_query`** now supports `--files-only`
- System prompt strengthened with explicit routing rules for plan/review/explain

## 0.1.8

### Changed

- `/gograph-setup` now offers to upgrade gograph when it is already installed (instead of exiting)
- `/gograph-status` now shows the installed gograph version (e.g. `gograph: ready ✓ (gograph 0.3.1)`)

## 0.1.7

### Added

- Automatic background index refresh when the git HEAD changes (including branch switches)
- Persistent per-repo index state file at `.gograph/pi-gograph-state.json`

### Fixed

- `/gograph-setup` and `/gograph-build` now record index state for freshness checks
- `gograph_build` tool now records index state after successful builds

## 0.1.4

### Fixed

- `/gograph-setup` now falls back to `go install` when `brew install` fails

## 0.1.3

### Fixed

- Status bar labels now show `gograph ✓` instead of ambiguous `ready ✓`
- Added error handling around `session_start` handler to surface errors instead of failing silently

## 0.1.1

### Changed

- Updated README with npm install instructions, badges, and preview image
- Added `peerDependencies` for pi core packages
- Added `.npmignore` to exclude tests and docs from published package
- Added `.gitignore`, `CHANGELOG.md`, GitHub Actions CI

## 0.1.0

Initial release.

### Features

- Auto-detect Go projects via `go.mod` or `*.go` files
- 13 gograph tools: build, query, context, implementers, impact, source, callers, callees, endpoint, check, focus, fields, path
- Commands: `/gograph-setup`, `/gograph-status`, `/gograph-build`
- Graceful error handling when gograph is not installed
- Custom TUI rendering for tool calls and results
