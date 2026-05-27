import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isGoRepo, isGographInstalled, hasIndex } from "./detect.js";
import { initRunner } from "./runner.js";
import { registerTools } from "./tools.js";
import { registerCommands } from "./commands.js";
import { getBackgroundStatus, scheduleBackgroundRefresh } from "./refresh.js";

function showStatus(
  ctx: { ui: { setStatus: (key: string, value: string | undefined) => void } },
  installed: boolean,
  indexed: boolean,
): void {
  if (!installed) {
    ctx.ui.setStatus("gograph", "📦 gograph: run /gograph-setup");
    return;
  }

  if (!indexed) {
    ctx.ui.setStatus("gograph", "gograph: run /gograph-build");
    return;
  }

  const background = getBackgroundStatus();
  if (background) {
    ctx.ui.setStatus("gograph", background);
    return;
  }

  ctx.ui.setStatus("gograph", "gograph ✓");
}

export default function gographExtension(pi: ExtensionAPI) {
  initRunner(pi.exec.bind(pi));

  pi.on("session_start", async (_event, ctx) => {
    try {
      const goRepo = await isGoRepo(ctx.cwd);
      if (!goRepo) return;

      const installed = await isGographInstalled();
      const indexed = installed ? await hasIndex(ctx.cwd) : false;

      registerTools(pi);
      registerCommands(pi);

      if (installed && indexed) {
        pi.on("before_agent_start", async (_event, _agentCtx) => {
          return {
            systemPrompt:
              "\n\n## Go Code Navigation (gograph)\n" +
              "This Go project is indexed with gograph. Prefer gograph tools over grep/cat for structural Go queries.\n" +
              "- `gograph_plan` — pre-edit safety check: callers, tests, blast radius, SQL/env exposure (run BEFORE editing)\n" +
              "- `gograph_review` — post-edit review: test coverage, complexity, broken interfaces (run AFTER editing)\n" +
              "- `gograph_context` — get source + callers + callees + tests in ONE call (replaces 4-5 grep/cat calls). Supports `--uncommitted` for all modified symbols.\n" +
              "- `gograph_explain` — architectural narrative for any symbol in one call\n" +
              "- `gograph_implementers` — find which structs implement an interface\n" +
              "- `gograph_impact` — check blast radius before modifying a function\n" +
              "- `gograph_source` — extract just the source of a symbol without reading the whole file\n" +
              "- `gograph_endpoint` — full vertical slice from HTTP handler to SQL\n" +
              "- `gograph_returnusage` — check how callers consume a function's return value\n" +
              "- `gograph_errorflow` — trace an error string up the call chain\n" +
              "- Use `grep` ONLY for string literals, config files, or non-Go files.\n",
          };
        });
      }

      scheduleBackgroundRefresh(pi, ctx.cwd, ctx.ui);
      showStatus(ctx, installed, indexed);
    } catch (err) {
      ctx.ui.notify(
        `pi-gograph error: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
  });
}
