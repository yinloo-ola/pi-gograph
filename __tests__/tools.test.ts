import { describe, it, expect } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  registerTools,
  riskBuildArgs,
  summaryBuildArgs,
  contextBuildArgs,
  planBuildArgs,
  reviewBuildArgs,
} from "../src/tools.js";

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
describe("contextBuildArgs", () => {
  it("emits [context, --uncommitted, --json] when uncommitted=true", () => {
    expect(contextBuildArgs({ uncommitted: true })).toEqual([
      "context",
      "--uncommitted",
      "--json",
    ]);
  });

  it("emits [context, symbol, --json] for a symbol", () => {
    expect(contextBuildArgs({ symbol: "ValidateToken" })).toEqual([
      "context",
      "ValidateToken",
      "--json",
    ]);
  });

  it("throws when neither symbol nor uncommitted is given", () => {
    expect(() => contextBuildArgs({})).toThrow(
      "Provide either a symbol name or set uncommitted=true.",
    );
  });
});

describe("planBuildArgs", () => {
  it("emits [plan, symbol, --json] for a symbol", () => {
    expect(planBuildArgs({ symbol: "ValidateToken" })).toEqual([
      "plan",
      "ValidateToken",
      "--json",
    ]);
  });

  it("emits [plan, --uncommitted, --json] when uncommitted=true", () => {
    expect(planBuildArgs({ uncommitted: true })).toEqual([
      "plan",
      "--uncommitted",
      "--json",
    ]);
  });

  it("appends --with-context when withContext=true", () => {
    expect(planBuildArgs({ symbol: "X", withContext: true })).toEqual([
      "plan",
      "X",
      "--with-context",
      "--json",
    ]);
  });

  it("throws when neither symbol nor uncommitted is given", () => {
    expect(() => planBuildArgs({})).toThrow(
      "Provide either a symbol name or set uncommitted=true.",
    );
  });
});

describe("reviewBuildArgs", () => {
  it("emits [review, symbol, --json] for a symbol", () => {
    expect(reviewBuildArgs({ symbol: "ValidateToken" })).toEqual([
      "review",
      "ValidateToken",
      "--json",
    ]);
  });

  it("emits [review, --uncommitted, --json] when uncommitted=true", () => {
    expect(reviewBuildArgs({ uncommitted: true })).toEqual([
      "review",
      "--uncommitted",
      "--json",
    ]);
  });

  it("throws when neither symbol nor uncommitted is given", () => {
    expect(() => reviewBuildArgs({})).toThrow(
      "Provide either a symbol name or set uncommitted=true.",
    );
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
it("always registers the version-independent core tools", () => {
    const names: string[] = [];
    const pi = {
      registerTool: (t: { name: string }) => {
        names.push(t.name);
      },
    } as unknown as ExtensionAPI;
    registerTools(pi);
    for (const n of [
      "gograph_build",
      "gograph_query",
      "gograph_context",
      "gograph_implementers",
      "gograph_endpoint",
      "gograph_plan",
      "gograph_explain",
      "gograph_review",
    ]) {
      expect(names).toContain(n);
    }
  });
});