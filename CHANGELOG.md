# Changelog

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
