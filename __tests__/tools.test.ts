import { describe, it, expect } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTools, riskBuildArgs, summaryBuildArgs } from "../src/tools.js";

describe("registerTools", () => {
  it("exports a registerTools function", () => {
    expect(typeof registerTools).toBe("function");
  });
});

describe("riskBuildArgs", () => {
  it("emits [risk, symbol, --json] for a symbol", () => {
    expect(riskBuildArgs({ symbol: "ValidateToken" })).toEqual([
      "risk",
      "ValidateToken",
      "--json",
    ]);
  });

  it("emits [risk, --uncommitted, --json] when uncommitted=true", () => {
    expect(riskBuildArgs({ uncommitted: true })).toEqual([
      "risk",
      "--uncommitted",
      "--json",
    ]);
  });

  it("throws when neither symbol nor uncommitted is given", () => {
    expect(() => riskBuildArgs({})).toThrow(
      "Provide either a symbol name or set uncommitted=true.",
    );
  });
});

describe("summaryBuildArgs", () => {
  it("emits [summary, --json] with no parameters", () => {
    expect(summaryBuildArgs()).toEqual(["summary", "--json"]);
  });
});

describe("registration", () => {
  it("registerTools registers both risk and summary tools", () => {
    const names: string[] = [];
    const pi = {
      registerTool: (t: { name: string }) => {
        names.push(t.name);
      },
    } as unknown as ExtensionAPI;
    registerTools(pi);
    expect(names).toContain("gograph_risk");
    expect(names).toContain("gograph_summary");
  });
});