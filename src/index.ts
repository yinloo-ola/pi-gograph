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
      pi.on("before_agent_start", async (_event, _agentCtx) => {
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
