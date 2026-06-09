import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isGoRepo, isGographInstalled, hasIndex } from "./detect.js";
import { initRunner } from "./runner.js";
import { registerTools } from "./tools.js";
import { registerGenericTool } from "./generic-tool.js";
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
      registerGenericTool(pi);
      registerCommands(pi);

      if (installed && indexed) {
        pi.on("before_agent_start", async (_event, _agentCtx) => {
          return {
            systemPrompt:
              "\n\n## Go Code Navigation (gograph)\n" +
              "This Go project has a gograph AST index. Use gograph tools instead of grep/cat for ALL structural Go queries.\n\n" +
              "### Default workflow\n" +
              "- Before editing → `gograph_plan` (one call, replaces 4-5 separate queries)\n" +
              "- After editing → `gograph_review` (one call, replaces 3-4 separate queries)\n" +
              "- To understand a symbol → `gograph_explain` (one call, replaces 6-8 separate queries)\n\n" +
              "### All tools\n" +
              "- `gograph_plan` — pre-edit safety: callers, tests, blast radius, SQL/env exposure\n" +
              "- `gograph_review` — post-edit review: test coverage, complexity, broken interfaces\n" +
              "- `gograph_explain` — architectural narrative for any symbol\n" +
              "- `gograph_context` — source + callers + callees + tests for one symbol\n" +
              "- `gograph_query` — search symbols by name\n" +
              "- `gograph_implementers` — find structs implementing an interface\n" +
              "- `gograph_endpoint` — HTTP handler → SQL vertical slice\n" +
              "- `gograph` — generic tool for callers, callees, source, fields, impact, path, etc.\n\n" +
              "### Rules\n" +
              "- NEVER use grep/cat/read for Go symbols, types, functions, or struct fields — use gograph instead. grep is fine for string literals, comments, and non-Go files.\n" +
              "- NEVER chain gograph_context + gograph_callers + gograph_impact separately — use gograph_plan or gograph_explain instead\n" +
              "- Use `gograph` subcommands only when a primary tool doesn't cover the need\n",
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
