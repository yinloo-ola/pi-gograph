import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isGoRepo, isGographInstalled, hasIndex } from "./detect.js";
import { initRunner } from "./runner.js";
import { registerTools } from "./tools.js";
import { registerGenericTool } from "./generic-tool.js";
import { registerCommands } from "./commands.js";
import { getBackgroundStatus, scheduleBackgroundRefresh } from "./refresh.js";
import { discoverCapabilities, setCachedCapabilities } from "./capabilities.js";

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

      // Discover available subcommands once per session; the generic tool reads
      // the cache synchronously at registration. Degrades to defaults on failure.
      setCachedCapabilities(await discoverCapabilities());

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
              "- Session start → `gograph_summary` (codebase briefing in one call)\n" +
              "- Before editing → `gograph_plan`, then `gograph_risk` for a SAFE/REVIEW/DANGER verdict\n" +
              "- After editing → `gograph_review`\n" +
              "- To understand a symbol → `gograph_explain`\n\n" +
              "### Tools\n" +
              "- `gograph_summary` — one-call codebase briefing: hotspots, coupling, orphans, complexity, god objects\n" +
              "- `gograph_risk` — change risk score (0–100) + SAFE/REVIEW/DANGER verdict: blast radius, complexity, coverage, API, SQL/env\n" +
              "- `gograph_plan` — pre-edit change plan: callers, tests, blast radius, SQL/env/route exposure\n" +
              "- `gograph_review` — post-edit verification: complexity drift, test coverage, risk evaluation\n" +
              "- `gograph_explain` — architectural narrative: purpose, complexity, SQL, routes, role classification\n" +
              "- `gograph_context` — source + callers + callees + tests + role for one symbol\n" +
              "- `gograph_query` — case-insensitive symbol search\n" +
              "- `gograph_implementers` — structs satisfying an interface (duck-typing)\n" +
              "- `gograph_endpoint` — HTTP endpoint vertical slice: handler → callees → SQL → env\n" +
              "- `gograph` — subcommands: callers, callees, source, fields, impact, path, returnusage, errorflow, etc.\n\n" +
              "### Rules\n" +
              "- NEVER use grep/cat/read for Go symbols, types, functions, or struct fields — use gograph instead. grep is fine for string literals, comments, and non-Go files.\n" +
              "- Prefer gograph_summary / gograph_plan / gograph_risk / gograph_explain over chaining multiple queries — they aggregate results in one call.\n" +
              "- Use `gograph` subcommands only when no primary tool covers the need.\n"
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