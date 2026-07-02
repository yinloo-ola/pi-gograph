import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isGoRepo, isGographInstalled, hasIndex, getGographVersion, versionMeets } from "./detect.js";
import { initRunner } from "./runner.js";
import { registerTools, RISK_MIN_VERSION, SUMMARY_MIN_VERSION } from "./tools.js";
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
      // Installed gograph version, or null if not installed / undetectable.
      // Drives version-gating of the risk/summary primary tools (T-001).
      const version = installed ? getGographVersion() : null;

      registerTools(pi, version);
      registerGenericTool(pi);
      registerCommands(pi);

      if (installed && indexed) {
        pi.on("before_agent_start", async (_event, _agentCtx) => {
          const hasSummary = versionMeets(version, SUMMARY_MIN_VERSION);
          const hasRisk = versionMeets(version, RISK_MIN_VERSION);

          const workflowLines: string[] = [];
          if (hasSummary) {
            workflowLines.push("- Session start → `gograph_summary` (codebase briefing in one call)");
          }
          workflowLines.push(
            hasRisk
              ? "- Before editing → `gograph_plan`, then `gograph_risk` for a SAFE/REVIEW/DANGER verdict"
              : "- Before editing → `gograph_plan`",
          );
          workflowLines.push("- After editing → `gograph_review`");
          workflowLines.push("- To understand a symbol → `gograph_explain`");

          const toolLines: string[] = [];
          if (hasSummary) {
            toolLines.push(
              "- `gograph_summary` — one-call codebase briefing: hotspots, coupling, orphans, complexity, god objects",
            );
          }
          if (hasRisk) {
            toolLines.push(
              "- `gograph_risk` — change risk score (0–100) + SAFE/REVIEW/DANGER verdict: blast radius, complexity, coverage, API, SQL/env",
            );
          }
          toolLines.push("- `gograph_plan` — pre-edit change plan: callers, tests, blast radius, SQL/env/route exposure");
          toolLines.push("- `gograph_review` — post-edit verification: complexity drift, test coverage, risk evaluation");
          toolLines.push("- `gograph_explain` — architectural narrative: purpose, complexity, SQL, routes, role classification");
          toolLines.push("- `gograph_context` — source + callers + callees + tests + role for one symbol");
          toolLines.push("- `gograph_query` — case-insensitive symbol search");
          toolLines.push("- `gograph_implementers` — structs satisfying an interface (duck-typing)");
          toolLines.push("- `gograph_endpoint` — HTTP endpoint vertical slice: handler → callees → SQL → env");
          toolLines.push("- `gograph` — subcommands: callers, callees, source, fields, impact, path, returnusage, errorflow, etc.");

          const aggregators = [
            "gograph_plan",
            "gograph_explain",
            ...(hasSummary ? ["gograph_summary"] : []),
            ...(hasRisk ? ["gograph_risk"] : []),
          ];

          return {
            systemPrompt:
              "\n\n## Go Code Navigation (gograph)\n" +
              "This Go project has a gograph AST index. Use gograph tools instead of grep/cat for ALL structural Go queries.\n\n" +
              "### Default workflow\n" +
              workflowLines.join("\n") + "\n\n" +
              "### Tools\n" +
              toolLines.join("\n") + "\n\n" +
              "### Rules\n" +
              "- NEVER use grep/cat/read for Go symbols, types, functions, or struct fields — use gograph instead. grep is fine for string literals, comments, and non-Go files.\n" +
              "- Prefer " +
              aggregators.map((a) => "`" + a + "`").join(" / ") +
              " over chaining multiple queries — they aggregate results in one call.\n" +
              "- Use `gograph` subcommands only when no primary tool covers the need.\n",
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