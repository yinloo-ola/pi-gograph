import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isGographInstalled } from "./detect.js";
import { runGograph } from "./runner.js";

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

        // Try brew first, fall back to go install
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
      } catch (err: unknown) {
        commandCtx.ui.notify(`Installation failed: ${getErrorMessage(err)}`, "error");
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
      } catch (err: unknown) {
        commandCtx.ui.notify(`Build failed: ${getErrorMessage(err)}`, "error");
        commandCtx.ui.setStatus("gograph", "build failed");
      }
    },
  });
}
