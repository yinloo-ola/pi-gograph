# Changelog

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
