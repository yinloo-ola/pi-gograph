import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isGographInstalled } from "./detect.js";
import { runGograph } from "./runner.js";
import {
  clearBackgroundStatus,
  getBackgroundStatus,
  getCurrentIndexState,
  scheduleBackgroundRefresh,
  writeIndexState,
} from "./refresh.js";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
  _ctx: ExtensionContext,
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

      let useBrew = false;
      try {
        const { code } = await pi.exec("brew", ["--version"], { timeout: 5000 });
        useBrew = code === 0;
      } catch {
        // brew not available
      }

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
        let installOk = false;

        if (useBrew) {
          const brewResult = await pi.exec("brew", ["install", "ozgurcd/tap/gograph"], {
            timeout: 120_000,
          });
          installOk = brewResult.code === 0;
        }

        if (!installOk) {
          commandCtx.ui.notify("Falling back to go install...", "info");
          const goResult = await pi.exec(
            "go",
            ["install", "github.com/ozgurcd/gograph/cmd/gograph@latest"],
            { timeout: 120_000 },
          );
          installOk = goResult.code === 0;
        }

        if (!installOk) throw new Error("Installation failed");

        const verifyResult = await pi.exec("gograph", ["--version"], { timeout: 5000 });
        if (verifyResult.code !== 0) throw new Error("Installation verification failed");
      } catch (err: unknown) {
        commandCtx.ui.notify(`Installation failed: ${getErrorMessage(err)}`, "error");
        commandCtx.ui.setStatus("gograph", "installation failed");
        return;
      }

      commandCtx.ui.notify("gograph installed successfully!", "info");

      clearBackgroundStatus();
      commandCtx.ui.setStatus("gograph", "building index...");
      commandCtx.ui.notify("Building index...", "info");

      try {
        const currentState = await getCurrentIndexState(pi, commandCtx.cwd);
        await runGograph(["build", "."], undefined, 60_000);
        if (currentState) {
          await writeIndexState(commandCtx.cwd, currentState);
        }

        commandCtx.ui.notify("Index built successfully!", "info");
        commandCtx.ui.setStatus("gograph", "gograph ✓");
      } catch (err: unknown) {
        commandCtx.ui.notify(`Index build failed: ${getErrorMessage(err)}`, "error");
        commandCtx.ui.setStatus("gograph", "build failed");
      }
    },
  });
}

function registerStatusCommand(
  pi: ExtensionAPI,
  _ctx: ExtensionContext,
  options: CommandOptions,
): void {
  pi.registerCommand("gograph-status", {
    description: "Show gograph installation and index status",
    handler: async (_args, commandCtx) => {
      scheduleBackgroundRefresh(pi, commandCtx.cwd, commandCtx.ui);

      const { installed, hasIdx } = options;

      if (!installed) {
        commandCtx.ui.notify("gograph: not installed", "info");
        return;
      }

      if (!hasIdx) {
        commandCtx.ui.notify("gograph: installed, no index", "info");
        return;
      }

      const background = getBackgroundStatus();
      if (background) {
        commandCtx.ui.notify(background, "info");
        return;
      }

      commandCtx.ui.notify("gograph: ready ✓", "info");
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

      clearBackgroundStatus();
      commandCtx.ui.setStatus("gograph", "building index...");
      commandCtx.ui.notify(
        `Building gograph index${precise ? " (precise mode)" : ""}...`,
        "info",
      );

      try {
        const currentState = await getCurrentIndexState(pi, commandCtx.cwd);
        await runGograph(cmdArgs, undefined, 60_000);
        if (currentState) {
          await writeIndexState(commandCtx.cwd, currentState);
        }

        commandCtx.ui.notify("gograph index built successfully!", "info");
        commandCtx.ui.setStatus("gograph", "gograph ✓");
      } catch (err: unknown) {
        commandCtx.ui.notify(`Build failed: ${getErrorMessage(err)}`, "error");
        commandCtx.ui.setStatus("gograph", "build failed");
      }
    },
  });
}
