# pi-gograph

[![npm version](https://img.shields.io/npm/v/pi-gograph.svg)](https://www.npmjs.com/package/pi-gograph)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![pi-gograph preview](image.jpg)

[Gograph](https://github.com/ozgurcd/gograph) integration for [pi](https://github.com/earendil-works/pi-mono) — AST-aware Go code navigation as native LLM tools.

## What it does

Gograph builds a compact graph of your Go project's packages, symbols, calls, routes, and tests. This extension exposes gograph's capabilities as native pi tools, so the LLM can navigate your Go codebase with fewer raw file reads and better accuracy.

**Key benefits:**
- `gograph_context` replaces 4-5 grep/cat calls in one shot
- `gograph_implementers` reliably finds interface implementations
- `gograph_impact` shows blast radius before you change a function
- `gograph_endpoint` traces HTTP handlers from route to SQL

## Prerequisites

- [pi](https://github.com/earendil-works/pi-mono) installed
- [gograph](https://github.com/ozgurcd/gograph) installed (the extension can auto-install it via `/gograph-setup`)

## Installation

```bash
pi install npm:pi-gograph
```

> **Note:** Use `pi install`, not `npm install`. The `pi install` command registers the extension in pi's settings so it auto-activates in Go projects.

Or install manually by copying to your extensions directory:

```bash
git clone https://github.com/yinloo-ola/pi-gograph.git
cp -r pi-gograph ~/.pi/agent/extensions/
```

## Usage

The extension activates automatically in Go projects (detected by `go.mod` or `*.go` files).

### First time setup

If gograph is not installed:

```
/gograph-setup
```

This will:
1. Install gograph (via Homebrew or `go install`)
2. Build the initial index

### Rebuild index

After significant code changes:

```
/gograph-build
```

Or with precise mode (type-checked, slower):

```
/gograph-build --precise
```

### Check status

```
/gograph-status
```

## Tools

| Tool | Purpose |
|------|---------|
| `gograph_build` | Build/rebuild the AST index |
| `gograph_query` | Search for symbols by name |
| `gograph_context` | Full context bundle (source + callers + callees + tests) |
| `gograph_implementers` | Find structs implementing an interface |
| `gograph_impact` | Blast radius analysis |
| `gograph_source` | Extract source of one symbol |
| `gograph_callers` | Find callers of a function |
| `gograph_callees` | Find callees of a function |
| `gograph_endpoint` | HTTP handler → SQL vertical slice |
| `gograph_check` | Verify uncommitted changes |
| `gograph_focus` | Targeted context for a package |
| `gograph_fields` | All fields of a struct |
| `gograph_path` | Shortest call chain between two symbols |

## Development

```bash
git clone https://github.com/yinloo-ola/pi-gograph.git
cd pi-gograph
npm install
npm test
```

## License

MIT
