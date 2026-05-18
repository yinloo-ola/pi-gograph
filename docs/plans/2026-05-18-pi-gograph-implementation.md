# pi-gograph Implementation Plan

Based on: [2026-05-18-pi-gograph-design.md](./2026-05-18-pi-gograph-design.md)

## Task 1: Create project structure and package.json

<!-- tdd: trivial -->

Files:
- `package.json`
- `tsconfig.json`
- `src/detect.ts` (empty)
- `src/runner.ts` (empty)
- `src/tools.ts` (empty)
- `src/commands.ts` (empty)
- `src/index.ts` (empty)

Steps:

1. Create `package.json`:

```json
{
  "name": "pi-gograph",
  "version": "0.1.0",
  "description": "Gograph integration for pi — AST-aware Go code navigation",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

2. Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

3. Create empty source files:

```bash
mkdir -p src __tests__
touch src/detect.ts src/runner.ts src/tools.ts src/commands.ts src/index.ts
```

4. Run `npm install` to set up dependencies.

5. Verify structure:

```bash
ls -la src/
# Should show: detect.ts runner.ts tools.ts commands.ts index.ts
```

---

## Task 2: Implement detect.ts — Go repo and gograph detection

<!-- tdd: new-feature -->
<!-- checkpoint: test -->

Files:
- `src/detect.ts`
- `__tests__/detect.test.ts`

Steps:

1. Write failing tests in `__tests__/detect.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isGoRepo, hasIndex } from "../src/detect.js";

describe("isGoRepo", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-gograph-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when go.mod exists at root", async () => {
    await writeFile(join(tempDir, "go.mod"), "module example.com/test");
    expect(await isGoRepo(tempDir)).toBe(true);
  });

  it("returns true when .go files exist at root", async () => {
    await writeFile(join(tempDir, "main.go"), "package main");
    expect(await isGoRepo(tempDir)).toBe(true);
  });

  it("returns true when .go files exist 2 levels deep", async () => {
    const subDir = join(tempDir, "cmd", "server");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "main.go"), "package main");
    expect(await isGoRepo(tempDir)).toBe(true);
  });

  it("returns false for empty directory", async () => {
    expect(await isGoRepo(tempDir)).toBe(false);
  });

  it("returns false when only non-Go files exist", async () => {
    await writeFile(join(tempDir, "index.ts"), "console.log('hi')");
    await writeFile(join(tempDir, "package.json"), "{}");
    expect(await isGoRepo(tempDir)).toBe(false);
  });
});

describe("hasIndex", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-gograph-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when .gograph/graph.json exists", async () => {
    await mkdir(join(tempDir, ".gograph"));
    await writeFile(join(tempDir, ".gograph", "graph.json"), "{}");
    expect(await hasIndex(tempDir)).toBe(true);
  });

  it("returns false when .gograph directory does not exist", async () => {
    expect(await hasIndex(tempDir)).toBe(false);
  });

  it("returns false when .gograph exists but graph.json does not", async () => {
    await mkdir(join(tempDir, ".gograph"));
    expect(await hasIndex(tempDir)).toBe(false);
  });
});
```

2. Run tests — confirm they fail (module not found):

```bash
npx vitest run __tests__/detect.test.ts
```

3. Implement `src/detect.ts`:

```typescript
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the given directory is a Go project.
 * Primary signal: go.mod at root.
 * Fallback: any .go file up to 3 levels deep.
 */
export async function isGoRepo(cwd: string): Promise<boolean> {
  // Fast check: go.mod exists
  if (await fileExists(join(cwd, "go.mod"))) return true;

  // Fallback: search for .go files up to 3 levels deep
  try {
    return await hasGoFilesRecursive(cwd, 0, 3);
  } catch {
    return false;
  }
}

async function hasGoFilesRecursive(
  dir: string,
  currentDepth: number,
  maxDepth: number,
): Promise<boolean> {
  if (currentDepth > maxDepth) return false;

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".go")) return true;
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      entry.name !== "vendor" &&
      entry.name !== "node_modules"
    ) {
      const found = await hasGoFilesRecursive(
        join(dir, entry.name),
        currentDepth + 1,
        maxDepth,
      );
      if (found) return true;
    }
  }

  return false;
}

/**
 * Check if a gograph index exists in the project.
 */
export async function hasIndex(cwd: string): Promise<boolean> {
  return fileExists(join(cwd, ".gograph", "graph.json"));
}
```

4. Run tests — confirm they pass:

```bash
npx vitest run __tests__/detect.test.ts
```

5. Refactor — check for shallow modules, duplication, seam discipline. Run tests after changes.

6. Lessons — caught a mistake that applies to future tasks? Add rule to `docs/lessons.md`.

⏸ **CHECKPOINT: test** — present test review. Wait for human approval before implementing.

---

## Task 3: Implement runner.ts — gograph CLI wrapper

<!-- tdd: new-feature -->

Files:
- `src/runner.ts`
- `__tests__/runner.test.ts`

Steps:

1. Write tests in `__tests__/runner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatOutput } from "../src/runner.js";

describe("formatOutput", () => {
  it("returns (no results) for empty string", () => {
    const result = formatOutput("");
    expect(result.text).toBe("(no results)");
    expect(result.truncated).toBe(false);
    expect(result.totalLines).toBe(0);
  });

  it("returns (no results) for whitespace-only string", () => {
    const result = formatOutput("   \n  \n  ");
    expect(result.text).toBe("(no results)");
    expect(result.truncated).toBe(false);
    expect(result.totalLines).toBe(0);
  });

  it("returns content unchanged when under limits", () => {
    const input = '{"symbol":"MyFunc","type":"function"}';
    const result = formatOutput(input);
    expect(result.text).toBe(input);
    expect(result.truncated).toBe(false);
    expect(result.totalLines).toBe(1);
  });

  it("truncates output exceeding line limit", () => {
    const lines = Array.from({ length: 2500 }, (_, i) => `line ${i}`);
    const input = lines.join("\n");
    const result = formatOutput(input);
    expect(result.truncated).toBe(true);
    expect(result.totalLines).toBe(2500);
    expect(result.text).toContain("[Output truncated:");
    expect(result.text).toContain("2000 of 2500 lines");
  });

  it("preserves truncation notice format", () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
    const input = lines.join("\n");
    const result = formatOutput(input);
    expect(result.text).toMatch(/\[Output truncated: showing \d+ of 3000 lines/);
    expect(result.text).toContain("Narrow your query.");
  });
});
```

2. Run tests — confirm they fail:

```bash
npx vitest run __tests__/runner.test.ts
```

3. Implement `src/runner.ts`:

```typescript
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";

/** ExtensionAPI reference — set by index.ts on init. */
let execFn: (
  command: string,
  args: string[],
  options?: { signal?: AbortSignal; timeout?: number },
) => Promise<{ stdout: string; stderr: string; code: number }>;

/**
 * Initialize the runner with pi's exec function.
 * Called once from index.ts during extension setup.
 */
export function initRunner(
  exec: typeof execFn,
): void {
  execFn = exec;
}

/**
 * Run a gograph CLI command and return stdout.
 * Throws on non-zero exit.
 */
export async function runGograph(
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  if (!execFn) {
    throw new Error("Runner not initialized. Call initRunner() first.");
  }

  const result = await execFn("gograph", args, {
    signal,
    timeout: 30_000,
  });

  if (result.code !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(
      `gograph error${stderr ? `: ${stderr}` : ` (exit code ${result.code})`}`,
    );
  }

  return result.stdout;
}

/**
 * Format gograph CLI output for the LLM.
 * Applies truncation and returns metadata.
 */
export function formatOutput(raw: string): {
  text: string;
  truncated: boolean;
  totalLines: number;
} {
  if (!raw.trim()) {
    return { text: "(no results)", truncated: false, totalLines: 0 };
  }

  const truncation = truncateHead(raw, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let text = truncation.content;

  if (truncation.truncated) {
    const omittedLines = truncation.totalLines - truncation.outputLines;
    text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
    text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    text += ` ${omittedLines} lines omitted. Narrow your query.]`;
  }

  return {
    text,
    truncated: truncation.truncated,
    totalLines: truncation.totalLines,
  };
}
```

4. Run tests — confirm they pass:

```bash
npx vitest run __tests__/runner.test.ts
```

5. Refactor — check for shallow modules, duplication, seam discipline. Run tests after changes.

6. Lessons — caught a mistake that applies to future tasks? Add rule to `docs/lessons.md`.

---

## Task 4: Implement commands.ts — /gograph-setup, /gograph-status, /gograph-build

<!-- tdd: new-feature -->

Files:
- `src/commands.ts`

Steps:

1. Implement `src/commands.ts`:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isGographInstalled } from "./detect.js";
import { initRunner, runGograph } from "./runner.js";

interface CommandOptions {
  installed: boolean;
  hasIdx: boolean;
}

export function registerCommands(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  options: CommandOptions,
): void {
  registerSetupCommand(pi, ctx, options.installed);
  registerStatusCommand(pi, ctx, options);
  registerBuildCommand(pi, options.installed);
}

function registerSetupCommand(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  installed: boolean,
): void {
  pi.registerCommand("gograph-setup", {
    description: "Install gograph and build the initial index",
    handler: async (_args, commandCtx) => {
      if (installed) {
        commandCtx.ui.notify(
          "gograph is already installed. Use /gograph-build to rebuild the index.",
          "info",
        );
        return;
      }

      // Check for brew
      let useBrew = false;
      try {
        const { code } = await pi.exec("brew", ["--version"], { timeout: 5000 });
        useBrew = code === 0;
      } catch {
        // brew not available
      }

      const method = useBrew ? "homebrew" : "go";
      const confirmed = await commandCtx.ui.confirm(
        "Install gograph",
        `Install gograph using ${useBrew ? "Homebrew" : "go install"}?`,
      );

      if (!confirmed) {
        commandCtx.ui.notify("Installation cancelled.", "warning");
        return;
      }

      commandCtx.ui.setStatus("gograph", "installing...");
      commandCtx.ui.notify("Installing gograph...", "info");

      try {
        if (useBrew) {
          await pi.exec("brew", ["install", "ozgurcd/tap/gograph"], {
            timeout: 120_000,
          });
        } else {
          await pi.exec(
            "go",
            ["install", "github.com/ozgurcd/gograph/cmd/gograph@latest"],
            { timeout: 120_000 },
          );
        }

        // Verify installation
        const { code } = await pi.exec("gograph", ["--version"], { timeout: 5000 });
        if (code !== 0) throw new Error("Installation verification failed");

        commandCtx.ui.notify("gograph installed successfully!", "info");

        // Auto-build index
        commandCtx.ui.setStatus("gograph", "building index...");
        commandCtx.ui.notify("Building index...", "info");

        const buildOutput = await pi.exec("gograph", ["build", "."], {
          timeout: 60_000,
        });

        if (buildOutput.code === 0) {
          commandCtx.ui.notify("Index built successfully!", "info");
          commandCtx.ui.setStatus("gograph", "ready ✓");
        } else {
          commandCtx.ui.notify(
            `Index build had issues: ${buildOutput.stderr}`,
            "warning",
          );
          commandCtx.ui.setStatus("gograph", "installed (build had issues)");
        }
      } catch (err: any) {
        commandCtx.ui.notify(`Installation failed: ${err.message}`, "error");
        commandCtx.ui.setStatus("gograph", "installation failed");
      }
    },
  });
}

function registerStatusCommand(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  options: CommandOptions,
): void {
  pi.registerCommand("gograph-status", {
    description: "Show gograph installation and index status",
    handler: async (_args, commandCtx) => {
      const { installed, hasIdx } = options;

      if (!installed) {
        commandCtx.ui.notify("gograph: not installed", "info");
        return;
      }

      if (!hasIdx) {
        commandCtx.ui.notify("gograph: installed, no index", "info");
        return;
      }

      // Try to get index stats
      try {
        const output = await pi.exec("gograph", ["query", "."], { timeout: 10000 });
        const lines = output.stdout.split("\n").filter((l) => l.trim());
        commandCtx.ui.notify(
          `gograph: ready ✓ (${lines.length} symbols indexed)`,
          "info",
        );
      } catch {
        commandCtx.ui.notify("gograph: installed, index status unknown", "info");
      }
    },
  });
}

function registerBuildCommand(
  pi: ExtensionAPI,
  installed: boolean,
): void {
  pi.registerCommand("gograph-build", {
    description: "Build or rebuild the gograph index",
    getArgumentCompletions: (prefix: string) => {
      if ("--precise".startsWith(prefix)) {
        return [{ value: "--precise", label: "--precise", description: "Type-checked analysis" }];
      }
      return null;
    },
    handler: async (args, commandCtx) => {
      if (!installed) {
        commandCtx.ui.notify(
          "gograph is not installed. Run /gograph-setup first.",
          "error",
        );
        return;
      }

      const precise = args.includes("--precise");
      const cmdArgs = ["build", "."];
      if (precise) cmdArgs.push("--precise");

      commandCtx.ui.setStatus("gograph", "building index...");
      commandCtx.ui.notify(
        `Building gograph index${precise ? " (precise mode)" : ""}...`,
        "info",
      );

      try {
        const output = await pi.exec("gograph", cmdArgs, { timeout: 60_000 });

        if (output.code === 0) {
          commandCtx.ui.notify("gograph index built successfully!", "info");
          commandCtx.ui.setStatus("gograph", "ready ✓");
        } else {
          commandCtx.ui.notify(`Build failed: ${output.stderr}`, "error");
          commandCtx.ui.setStatus("gograph", "build failed");
        }
      } catch (err: any) {
        commandCtx.ui.notify(`Build failed: ${err.message}`, "error");
        commandCtx.ui.setStatus("gograph", "build failed");
      }
    },
  });
}
```

2. Verify it compiles:

```bash
npx tsc --noEmit src/commands.ts
```

---

## Task 5: Implement tools.ts — all 12 gograph tools

<!-- tdd: new-feature -->

Files:
- `src/tools.ts`

Steps:

1. Implement `src/tools.ts`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { isGographInstalled, hasIndex } from "./detect.js";
import { runGograph, formatOutput } from "./runner.js";

// ── Parameter schemas ────────────────────────────────────────────────────────

const BuildParams = Type.Object({
  precise: Type.Optional(
    Type.Boolean({
      description:
        "Use type-checked analysis for exact interface satisfaction and call edges (slower, requires compilable code). Default: false.",
    }),
  ),
});

const QueryParams = Type.Object({
  query: Type.String({ description: "Symbol, file, or package name to search for" }),
});

const ContextParams = Type.Object({
  symbol: Type.String({
    description:
      "Symbol name (function, method, struct, interface). Returns node info, source, callers, callees, and tests in one call.",
  }),
});

const ImplementersParams = Type.Object({
  interface: Type.String({ description: "Interface name to find implementations for" }),
});

const ImpactParams = Type.Object({
  symbol: Type.Optional(
    Type.String({ description: "Symbol name to check blast radius for" }),
  ),
  uncommitted: Type.Optional(
    Type.Boolean({
      description: "Calculate blast radius of all uncommitted code changes. Default: false.",
    }),
  ),
});

const SourceParams = Type.Object({
  symbol: Type.String({ description: "Symbol name to extract source code for" }),
});

const CallersParams = Type.Object({
  symbol: Type.String({ description: "Function or method name" }),
});

const CalleesParams = Type.Object({
  symbol: Type.String({ description: "Function or method name" }),
});

const EndpointParams = Type.Object({
  target: Type.String({
    description:
      'Handler name (preferred) or route pattern like "POST /api/users". Returns full vertical slice: handler → call chain → SQL → env reads.',
  }),
});

const CheckParams = Type.Object({
  uncommitted: Type.Optional(
    Type.Boolean({
      description: "Check uncommitted changes only. Default: true.",
    }),
  ),
});

const FocusParams = Type.Object({
  package: Type.String({ description: "Package path to focus on (e.g. internal/auth)" }),
});

const FieldsParams = Type.Object({
  struct: Type.String({ description: "Struct name to extract fields for" }),
});

const PathParams = Type.Object({
  from: Type.String({ description: "Starting symbol name" }),
  to: Type.String({ description: "Target symbol name" }),
});

// ── Guard helper ─────────────────────────────────────────────────────────────

async function ensureReady(cwd: string): Promise<void> {
  if (!(await isGographInstalled())) {
    throw new Error(
      "gograph is not installed. Run `/gograph-setup` or install manually:\n" +
      "  brew install ozgurcd/tap/gograph\n" +
      "  go install github.com/ozgurcd/gograph/cmd/gograph@latest",
    );
  }
  if (!(await hasIndex(cwd))) {
    throw new Error(
      "No gograph index found. Run `gograph build .` or use the gograph_build tool.",
    );
  }
}

// ── Tool registration ────────────────────────────────────────────────────────

export function registerTools(pi: ExtensionAPI): void {
  registerBuildTool(pi);
  registerQueryTool(pi);
  registerContextTool(pi);
  registerImplementersTool(pi);
  registerImpactTool(pi);
  registerSourceTool(pi);
  registerCallersTool(pi);
  registerCalleesTool(pi);
  registerEndpointTool(pi);
  registerCheckTool(pi);
  registerFocusTool(pi);
  registerFieldsTool(pi);
  registerPathTool(pi);
}

function registerBuildTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_build",
    label: "Gograph Build",
    description:
      "Build or rebuild the gograph graph index for this Go project. Run this after major code changes. " +
      "Generates .gograph/graph.json used by all other gograph tools.",
    promptSnippet: "Build/rebuild the gograph AST index for Go code navigation",
    promptGuidelines: [
      "Use gograph_build to rebuild the index after making significant code changes before querying gograph again.",
      "Use gograph_build with precise=true when you need exact type-checked interface satisfaction and call edges.",
    ],
    parameters: BuildParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!(await isGographInstalled())) {
        throw new Error(
          "gograph is not installed. Run `/gograph-setup` or: brew install ozgurcd/tap/gograph",
        );
      }
      const args = ["build", "."];
      if (params.precise) args.push("--precise");
      const output = await runGograph(args, signal);
      const { text } = formatOutput(output);
      return {
        content: [{ type: "text", text: text || "Index built successfully." }],
        details: { precise: params.precise ?? false },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_build "));
      if (args.precise) text += theme.fg("accent", "--precise");
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Building index..."), 0, 0);
      return new Text(theme.fg("success", "✓ Index built"), 0, 0);
    },
  });
}

function registerQueryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_query",
    label: "Gograph Query",
    description:
      "Search for Go symbols, files, or packages by name. Returns matching symbols with their types, locations, and signatures. " +
      "Use this as a first step to discover symbols before using gograph_context or gograph_source.",
    promptSnippet: "Search for Go symbols, files, or packages by name",
    promptGuidelines: [
      "Use gograph_query to discover symbol names when you are unsure of the exact name before using gograph_context.",
    ],
    parameters: QueryParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["query", params.query, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { query: params.query, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_query "));
      text += theme.fg("accent", `"${args.query}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
      const details = result.details as { query: string; truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Results found");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 2000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerContextTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_context",
    label: "Gograph Context",
    description:
      "Get a full context bundle for a Go symbol in ONE call: node info, source code, callers, callees, and related tests. " +
      "This replaces 4-5 separate grep/cat reads and saves thousands of tokens.",
    promptSnippet: "Get source + callers + callees + tests for a Go symbol in one call",
    promptGuidelines: [
      "Use gograph_context (not grep/cat) to understand any Go symbol — it returns source, callers, callees, and tests in one call.",
      "Use gograph_context before modifying a function to understand its relationships and downstream effects.",
    ],
    parameters: ContextParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["context", params.symbol, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_context "));
      text += theme.fg("accent", `"${args.symbol}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Analyzing..."), 0, 0);
      const details = result.details as { symbol: string; truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Context retrieved");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerImplementersTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_implementers",
    label: "Gograph Implementers",
    description:
      "Find all structs that implement a given Go interface. Returns exact struct names and file paths.",
    promptSnippet: "Find all structs implementing a Go interface",
    promptGuidelines: [
      "Use gograph_implementers (not grep) to find which structs implement a Go interface.",
    ],
    parameters: ImplementersParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["implementers", params.interface, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { interface: params.interface, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_implementers "));
      text += theme.fg("accent", `"${args.interface}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching implementations..."), 0, 0);
      return new Text(theme.fg("success", "✓ Implementations found"), 0, 0);
    },
  });
}

function registerImpactTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_impact",
    label: "Gograph Impact",
    description:
      "Calculate the blast radius of a Go symbol or uncommitted changes. Shows all downstream callers affected by a change.",
    promptSnippet: "Check blast radius before modifying a Go function",
    promptGuidelines: [
      "Use gograph_impact before changing a Go function to see all downstream callers that would be affected.",
      "Use gograph_impact with uncommitted=true to check blast radius of all uncommitted changes.",
    ],
    parameters: ImpactParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const args: string[] = ["impact"];
      if (params.uncommitted) {
        args.push("--uncommitted");
      } else if (params.symbol) {
        args.push(params.symbol);
      } else {
        throw new Error("Provide either a symbol name or set uncommitted=true.");
      }
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, uncommitted: params.uncommitted ?? false, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_impact "));
      if (args.uncommitted) {
        text += theme.fg("accent", "--uncommitted");
      } else {
        text += theme.fg("accent", `"${args.symbol}"`);
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Calculating impact..."), 0, 0);
      const details = result.details as { truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Impact analyzed");
      if (details?.truncated) text += theme.fg("warning", " (truncated)");
      if (expanded && result.content[0]?.type === "text") {
        text += "\n" + theme.fg("dim", result.content[0].text.slice(0, 3000));
      }
      return new Text(text, 0, 0);
    },
  });
}

function registerSourceTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_source",
    label: "Gograph Source",
    description:
      "Extract the source code of a Go symbol (function, struct, interface, method) without reading the entire file.",
    promptSnippet: "Extract source code of a Go symbol without reading the whole file",
    promptGuidelines: [
      "Use gograph_source to read a specific Go function/struct/interface — it extracts only that symbol's source, not the whole file.",
    ],
    parameters: SourceParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["source", params.symbol, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_source "));
      text += theme.fg("accent", `"${args.symbol}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Extracting..."), 0, 0);
      if (expanded && result.content[0]?.type === "text") {
        return new Text(theme.fg("dim", result.content[0].text), 0, 0);
      }
      return new Text(theme.fg("success", "✓ Source extracted"), 0, 0);
    },
  });
}

function registerCallersTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_callers",
    label: "Gograph Callers",
    description: "Find all functions that call a given Go function or method.",
    promptSnippet: "Find all callers of a Go function",
    promptGuidelines: [
      "Use gograph_callers to find what functions call a given Go function.",
    ],
    parameters: CallersParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["callers", params.symbol, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_callers "));
      text += theme.fg("accent", `"${args.symbol}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching callers..."), 0, 0);
      return new Text(theme.fg("success", "✓ Callers found"), 0, 0);
    },
  });
}

function registerCalleesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_callees",
    label: "Gograph Callees",
    description: "Find all functions called by a given Go function or method.",
    promptSnippet: "Find all callees of a Go function",
    promptGuidelines: [
      "Use gograph_callees to find what functions a given Go function calls.",
    ],
    parameters: CalleesParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["callees", params.symbol, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { symbol: params.symbol, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_callees "));
      text += theme.fg("accent", `"${args.symbol}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching callees..."), 0, 0);
      return new Text(theme.fg("success", "✓ Callees found"), 0, 0);
    },
  });
}

function registerEndpointTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_endpoint",
    label: "Gograph Endpoint",
    description:
      'Get a full vertical slice for an HTTP endpoint: handler → call chain → SQL → env reads.',
    promptSnippet: "Get full vertical slice for an HTTP endpoint",
    promptGuidelines: [
      "Use gograph_endpoint to understand the full call chain of an HTTP handler from entry to database.",
    ],
    parameters: EndpointParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["endpoint", params.target, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { target: params.target, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_endpoint "));
      text += theme.fg("accent", `"${args.target}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Tracing endpoint..."), 0, 0);
      if (expanded && result.content[0]?.type === "text") {
        return new Text(theme.fg("dim", result.content[0].text.slice(0, 3000)), 0, 0);
      }
      return new Text(theme.fg("success", "✓ Endpoint traced"), 0, 0);
    },
  });
}

function registerCheckTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_check",
    label: "Gograph Check",
    description:
      "Check uncommitted code changes for architectural boundary violations, test requirements, or excessive complexity.",
    promptSnippet: "Check uncommitted changes for architectural issues",
    promptGuidelines: [
      "Use gograph_check after making code changes to verify they don't violate architectural boundaries.",
    ],
    parameters: CheckParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const args = ["check"];
      if (params.uncommitted !== false) args.push("--uncommitted");
      const output = await runGograph(args, signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { uncommitted: params.uncommitted ?? true, truncated, totalLines },
      };
    },
    renderCall(_args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_check "));
      text += theme.fg("accent", "--uncommitted");
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Checking..."), 0, 0);
      return new Text(theme.fg("success", "✓ Check complete"), 0, 0);
    },
  });
}

function registerFocusTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_focus",
    label: "Gograph Focus",
    description:
      "Generate a highly targeted context summary for a specific Go package.",
    promptSnippet: "Get targeted context summary for a Go package",
    promptGuidelines: [
      "Use gograph_focus to understand a Go package's structure without reading every file in it.",
    ],
    parameters: FocusParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["focus", params.package, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { package: params.package, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_focus "));
      text += theme.fg("accent", `"${args.package}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Focusing..."), 0, 0);
      return new Text(theme.fg("success", "✓ Package context ready"), 0, 0);
    },
  });
}

function registerFieldsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_fields",
    label: "Gograph Fields",
    description: "Extract all fields and their types from a Go struct.",
    promptSnippet: "Extract all fields and types from a Go struct",
    promptGuidelines: [
      "Use gograph_fields to see all fields of a Go struct without reading the full file.",
    ],
    parameters: FieldsParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["fields", params.struct, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { struct: params.struct, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_fields "));
      text += theme.fg("accent", `"${args.struct}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Extracting fields..."), 0, 0);
      return new Text(theme.fg("success", "✓ Fields extracted"), 0, 0);
    },
  });
}

function registerPathTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gograph_path",
    label: "Gograph Path",
    description: "Find the shortest call chain between two Go symbols via BFS.",
    promptSnippet: "Find shortest call chain between two Go symbols",
    promptGuidelines: [
      "Use gograph_path to discover how two Go symbols are connected through the call graph.",
    ],
    parameters: PathParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureReady(ctx.cwd);
      const output = await runGograph(["path", params.from, params.to, "--json"], signal);
      const { text, truncated, totalLines } = formatOutput(output);
      return {
        content: [{ type: "text", text }],
        details: { from: params.from, to: params.to, truncated, totalLines },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("gograph_path "));
      text += theme.fg("accent", `"${args.from}" → "${args.to}"`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Finding path..."), 0, 0);
      return new Text(theme.fg("success", "✓ Path found"), 0, 0);
    },
  });
}
```

2. Verify it compiles:

```bash
npx tsc --noEmit src/tools.ts
```

---

## Task 6: Implement index.ts — entry point and orchestration

<!-- tdd: new-feature -->

Files:
- `src/index.ts`

Steps:

1. Implement `src/index.ts`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isGoRepo, isGographInstalled, hasIndex } from "./detect.js";
import { initRunner } from "./runner.js";
import { registerTools } from "./tools.js";
import { registerCommands } from "./commands.js";

interface StatusOptions {
  installed: boolean;
  hasIdx: boolean;
}

function showStatus(
  ctx: { ui: { setStatus: (key: string, value: string | undefined) => void } },
  options: StatusOptions,
): void {
  const { installed, hasIdx } = options;

  if (!installed) {
    ctx.ui.setStatus("gograph", "📦 run /gograph-setup");
    return;
  }

  if (!hasIdx) {
    ctx.ui.setStatus("gograph", "run /gograph-build to index");
    return;
  }

  ctx.ui.setStatus("gograph", "ready ✓");
}

export default function gographExtension(pi: ExtensionAPI) {
  // Initialize runner with pi's exec function
  initRunner(pi.exec.bind(pi));

  // Detect and register on session start
  pi.on("session_start", async (_event, ctx) => {
    const goRepo = await isGoRepo(ctx.cwd);
    if (!goRepo) return; // Extension invisible in non-Go projects

    const installed = await isGographInstalled();
    const hasIdx = installed ? await hasIndex(ctx.cwd) : false;

    // Always register tools (execute() handles missing gograph gracefully)
    registerTools(pi);

    // Always register commands
    registerCommands(pi, ctx, { installed, hasIdx });

    // Inject system prompt only when everything is ready
    if (installed && hasIdx) {
      pi.on("before_agent_start", async (_event, agentCtx) => {
        return {
          systemPrompt:
            "\n\n## Go Code Navigation (gograph)\n" +
            "This Go project is indexed with gograph. Prefer gograph tools over grep/cat for structural Go queries.\n" +
            "- `gograph_context` — get source + callers + callees + tests in ONE call (replaces 4-5 grep/cat calls)\n" +
            "- `gograph_implementers` — find which structs implement an interface\n" +
            "- `gograph_impact` — check blast radius before modifying a function\n" +
            "- `gograph_source` — extract just the source of a symbol without reading the whole file\n" +
            "- `gograph_endpoint` — full vertical slice from HTTP handler to SQL\n" +
            "- Use `grep` ONLY for string literals, config files, or non-Go files.\n",
        };
      });
    }

    // Show appropriate status
    showStatus(ctx, { installed, hasIdx });
  });
}
```

2. Verify it compiles:

```bash
npx tsc --noEmit src/index.ts
```

3. Run all tests:

```bash
npx vitest run
```

---

## Task 7: Write README.md and LICENSE

<!-- tdd: trivial -->

Files:
- `README.md`
- `LICENSE`

Steps:

1. Create `README.md`:

```markdown
# pi-gograph

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
- [gograph](https://github.com/ozgurcd/gograph) installed (`brew install ozgurcd/tap/gograph`)

## Installation

Copy this directory to `~/.pi/agent/extensions/pi-gograph/`:

```bash
cp -r pi-gograph ~/.pi/agent/extensions/
```

Or install via pi's package system (if published):

```bash
pi install pi-gograph
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
npm install
npm test
```

## License

MIT
```

2. Create `LICENSE`:

```
MIT License

Copyright (c) 2026 pi-gograph contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Task 8: Final verification — run all tests and type check

<!-- tdd: trivial -->

Steps:

1. Run all tests:

```bash
npx vitest run
```

Expected: All tests pass.

2. Type check all source files:

```bash
npx tsc --noEmit
```

Expected: No type errors.

3. Verify file structure:

```bash
find . -name '*.ts' -not -path '*/node_modules/*' | sort
```

Expected:
```
./__tests__/detect.test.ts
./__tests__/runner.test.ts
./src/commands.ts
./src/detect.ts
./src/index.ts
./src/runner.ts
./src/tools.ts
```

4. Clean up old prototype if it exists:

```bash
rm -f ~/.pi/agent/extensions/pi-gograph/index.ts
```

5. Copy new extension to pi extensions directory:

```bash
cp -r . ~/.pi/agent/extensions/pi-gograph/
```
