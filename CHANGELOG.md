# Changelog

## 0.1.0

Initial release.

### Features

- Auto-detect Go projects via `go.mod` or `*.go` files
- 13 gograph tools: build, query, context, implementers, impact, source, callers, callees, endpoint, check, focus, fields, path
- Commands: `/gograph-setup`, `/gograph-status`, `/gograph-build`
- Graceful error handling when gograph is not installed
- Custom TUI rendering for tool calls and results
