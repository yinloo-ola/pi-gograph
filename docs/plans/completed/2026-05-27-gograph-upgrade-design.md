# gograph upgrade support

Simple change — no design review needed.

## Problem

`/gograph-setup` exits early when gograph is already installed ("already installed, use /gograph-build"). Users have no in-pi path to upgrade gograph when a new version is released upstream.

## Design

Two small changes, no new files.

### 1. `/gograph-setup` handles upgrades

When gograph is already installed, instead of exiting, offer to upgrade:

```
confirm("Upgrade gograph?", "gograph v0.3.1 is installed. Reinstall/upgrade to latest?")
```

- Yes → run the same install logic (brew upgrade or `go install @latest`), then rebuild index
- No → exit quietly (no warning toast)

This reuses the existing install flow — no new code paths, just changes the "already installed" branch from early-return to confirm-then-upgrade.

### 2. `/gograph-status` shows installed version

Currently shows one of: "not installed", "installed, no index", "ready ✓".

Add version string when installed:

```
gograph: ready ✓ (v0.3.1)
```

Implementation: `detect.ts` gets a `getGographVersion()` helper that runs `gograph --version` and returns the trimmed stdout (or null). Used by `/gograph-status` only.

## Files changed

| File | Change |
|------|--------|
| `src/detect.ts` | Add `getGographVersion(): Promise<string \| null>` |
| `src/commands.ts` | Rework "already installed" branch in setup to offer upgrade; add version to status output |
