# pi-gograph Extension Design

## Overview

A pi extension that exposes [gograph](https://github.com/ozgurcd/gograph) as native tools for LLMs working in Go codebases. Gograph builds a compact AST graph of packages, symbols, calls, routes, and tests so agents can navigate Go repos with fewer raw file reads.

**Goal:** Polish the existing prototype into an open-source pi package that gracefully handles missing gograph and only activates in Go repos.

## Architecture

Three layers:

```
┌─────────────────────────────────────────────────┐
│  Detection Layer                                │
│  - session_start: isGoRepo? isInstalled?        │
│  - Decides what to register                     │
├─────────────────────────────────────────────────┤
│  Registration Layer                             │
│  - Tools (gograph_context, gograph_build, etc.) │
│  - Commands (/gograph-setup, /gograph-status)   │
│  - System prompt injection                      │
├─────────────────────────────────────────────────┤
│  Execution Layer                                │
│  - runGograph() wrapper                         │
│  - Error handling + friendly messages           │
│  - Output truncation                            │
└─────────────────────────────────────────────────┘
```

Tools register once on `session_start`, not lazily. The extension is invisible in non-Go projects.

## File Structure

```
pi-gograph/
├── index.ts              # Entry point, detection, registration
├── tools.ts              # All tool definitions
├── commands.ts           # /gograph-setup, /gograph-status, /gograph-build
├── detect.ts             # isGoRepo(), isGographInstalled(), hasIndex()
├── runner.ts             # runGograph(), formatOutput()
├── __tests__/
│   ├── detect.test.ts
│   ├── runner.test.ts
│   └── tools.test.ts
├── package.json
├── README.md
└── LICENSE
```

## Go Repo Detection

On `session_start`, check if the working directory is a Go project:

1. Check for `go.mod` at `cwd` (primary signal)
2. Fallback: search up to 3 levels deep for `*.go` files (handles monorepos)

If neither found → extension is completely invisible (no tools, no commands, no status).

## Gograph Installation Handling

Three states, each with different behavior:

### State 1: Not installed

| What | Behavior |
|------|----------|
| Tools | Registered, `execute()` throws friendly error with install instructions |
| Commands | `/gograph-setup` registered — walks through installation |
| Status | Widget: "📦 Go project detected. Run /gograph-setup to enable gograph navigation." |
| System prompt | No injection |

`/gograph-setup` flow:
1. Check if brew is available → offer Homebrew install
2. Fallback to `go install`
3. Verify installation via `gograph --version`
4. Auto-build index via `gograph build .`
5. Show summary: "gograph ready. Indexed N symbols."

### State 2: Installed, no index

| What | Behavior |
|------|----------|
| Tools | Registered, `execute()` throws "Run `gograph build .` first" |
| Status | Widget: "gograph installed. Run /gograph-build to index." |
| System prompt | No injection |

### State 3: Installed, index exists

| What | Behavior |
|------|----------|
| Tools | Fully functional |
| Status | Widget: "gograph: ready ✓ (N symbols, built X ago)" |
| System prompt | Injected with tool guidance |

## Tools (12 total)

| Tool | CLI command | Purpose |
|------|-------------|---------|
| `gograph_build` | `gograph build .` | Build/rebuild index after code changes |
| `gograph_query` | `gograph query "X"` | Discover symbols by name |
| `gograph_context` | `gograph context "X"` | Full bundle: source + callers + callees + tests |
| `gograph_implementers` | `gograph implementers "I"` | Find structs implementing an interface |
| `gograph_impact` | `gograph impact "X"` | Blast radius before changing a function |
| `gograph_source` | `gograph source "X"` | Extract source of one symbol |
| `gograph_callers` | `gograph callers "X"` | Who calls this function? |
| `gograph_callees` | `gograph callees "X"` | What does this function call? |
| `gograph_endpoint` | `gograph endpoint "X"` | HTTP handler → SQL vertical slice |
| `gograph_check` | `gograph check` | Verify uncommitted changes |
| `gograph_focus` | `gograph focus "pkg"` | Targeted context for one package |
| `gograph_fields` | `gograph fields "S"` | All fields of a struct |
| `gograph_path` | `gograph path "A" "B"` | Shortest call chain between two symbols |

Every tool's `execute()` starts with guards:
```typescript
if (!(await isGographInstalled())) {
  throw new Error("gograph is not installed. Run `/gograph-setup` or: brew install ozgurcd/tap/gograph");
}
if (!(await hasIndex(ctx.cwd))) {
  throw new Error("No gograph index found. Run `gograph build .` or use the gograph_build tool.");
}
```

## Commands

| Command | Purpose |
|---------|---------|
| `/gograph-setup` | Install gograph + build index (wizard) |
| `/gograph-status` | Show index age, symbol count, installation status |
| `/gograph-build` | Rebuild the index (with optional `--precise` flag) |

## Error Handling

| Error | User sees |
|-------|-----------|
| gograph not installed | "Run `/gograph-setup` or: `brew install ozgurcd/tap/gograph`" |
| No index | "Run `gograph build .` or use the `gograph_build` tool." |
| Command fails | "gograph error: {stderr}" |
| Timeout (>30s) | "gograph timed out. The index may be stale — try `gograph build .`." |

Output truncated at 2000 lines / 50KB using pi's built-in `truncateHead()`.

## Testing

| Area | Method |
|------|--------|
| `isGoRepo()` | Unit test with temp dirs |
| `isGographInstalled()` | Mock `exec()` |
| `hasIndex()` | Unit test with temp dirs |
| `formatOutput()` | Unit test — verify truncation |
| Tool registration | Integration test — mock pi API |

Test runner: Vitest.

## UX Scenarios

### Non-Go project
Extension invisible. Zero overhead.

### Go project, no gograph
Widget: "📦 Go project detected. Run /gograph-setup"
Tools registered but error gracefully if called.
LLM falls back to grep/cat.

### Go project, gograph installed, no index
Widget: "gograph installed. Run /gograph-build to index."

### Go project, gograph + index ready
Widget: "gograph: ready ✓ (847 symbols, built 2h ago)"
All tools functional. System prompt injected.

## Changes from Current Prototype

| Current | New |
|---------|-----|
| Single file | 5 focused files |
| Throws on missing gograph | Graceful errors + `/gograph-setup` wizard |
| Registers everywhere | Only registers in Go repos |
| No status feedback | Widget shows status |
| No tests | Unit tests for detection + formatting |
| Not distributable | Installable pi package with README |
