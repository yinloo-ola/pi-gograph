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
              "This Go project is indexed with gograph. ALWAYS use gograph tools over grep/cat for structural Go queries.\n\n" +
              "### Critical: use gograph_plan and gograph_review as your default workflow\n" +
              "When the user asks to plan, prepare, or check before editing → use `gograph_plan` (ONE call, replaces gograph_context + gograph_impact + gograph_source + gograph_fields separately).\n" +
              "When the user asks to review, verify, or check after editing → use `gograph_review` (ONE call, replaces manual impact + context + source calls).\n" +
              "When the user asks to explain or understand a symbol → use `gograph_explain` (ONE call, replaces 6-8 separate gograph calls).\n\n" +
              "### All available tools\n" +
              "- `gograph_plan` — pre-edit safety check: callers, tests, blast radius, SQL/env exposure. Supports `--uncommitted` and `--with-context`.\n" +
              "- `gograph_review` — post-edit review: test coverage, complexity, broken interfaces. Supports `--uncommitted`.\n" +
              "- `gograph_explain` — architectural narrative for any symbol in one call\n" +
              "- `gograph_context` — source + callers + callees + tests in one call. Supports `--uncommitted`.\n" +
              "- `gograph_implementers` — find structs implementing an interface. Supports `--test-only`.\n" +
              "- `gograph_impact` — blast radius analysis. Supports `--uncommitted`, `--since <ref>`.\n" +
              "- `gograph_source` — extract source of one symbol\n" +
              "- `gograph_callers` — find callers of a function. Supports `--depth N`.\n" +
              "- `gograph_callees` — find callees of a function. Supports `--depth N`.\n" +
              "- `gograph_endpoint` — HTTP handler → SQL vertical slice\n" +
              "- `gograph_returnusage` — how callers consume a function's return value\n" +
              "- `gograph_errorflow` — trace an error string up the call chain\n" +
              "- `gograph_changes` — find symbols in changed files. Supports `--git <ref>`.\n" +
              "- `gograph_stats` — index health summary\n" +
              "- `gograph_dependents` — find packages that import a given package\n" +
              "- `gograph_usages` — find all references to a type\n" +
              "- `gograph_literals` — find all struct literal initialization sites\n" +
              "- `gograph_fields` — all fields of a struct\n" +
              "- `gograph_path` — shortest call chain between two symbols\n" +
              "- `gograph_query` — search for symbols by name\n" +
              "- `gograph_focus` — targeted context for a package\n" +
              "- `gograph_check` — verify uncommitted changes\n" +
              "- `gograph_build` — build/rebuild the AST index\n" +
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
