import { describe, it, expect } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildGenericArgs, needsGraph, registerGenericTool } from "../src/generic-tool.js";

describe("buildGenericArgs", () => {
  it("builds callers with depth", () => {
    expect(buildGenericArgs({
      subcommand: "callers",
      target: "HandleUser",
      depth: 3,
    })).toEqual(["callers", "HandleUser", "--depth", "3", "--json"]);
  });

  it("builds path with from", () => {
    expect(buildGenericArgs({
      subcommand: "path",
      target: "HandleUser",
      from: "DB.Save",
    })).toEqual(["path", "HandleUser", "DB.Save", "--json"]);
  });

  it("builds impact with uncommitted", () => {
    expect(buildGenericArgs({
      subcommand: "impact",
      target: "MyFunc",
      uncommitted: true,
    })).toEqual(["impact", "MyFunc", "--uncommitted", "--json"]);
  });

  it("builds stats with empty target", () => {
    expect(buildGenericArgs({
      subcommand: "stats",
      target: "",
    })).toEqual(["stats", "--json"]);
  });

  it("ignores depth for stats", () => {
    expect(buildGenericArgs({
      subcommand: "stats",
      target: "",
      depth: 3,
    })).toEqual(["stats", "--json"]);
  });

  it("ignores filesOnly for stats", () => {
    expect(buildGenericArgs({
      subcommand: "stats",
      target: "",
      filesOnly: true,
    })).toEqual(["stats", "--json"]);
  });

  it("adds filesOnly when supported", () => {
    expect(buildGenericArgs({
      subcommand: "callers",
      target: "HandleUser",
      filesOnly: true,
    })).toEqual(["callers", "HandleUser", "--files-only", "--json"]);
  });

  it("parses flags string", () => {
    expect(buildGenericArgs({
      subcommand: "changes",
      target: "",
      flags: "--git main",
    })).toEqual(["changes", "--git", "main", "--json"]);
  });

  it("handles flags with multiple args", () => {
    expect(buildGenericArgs({
      subcommand: "changes",
      target: "",
      flags: "--git main --since v1.0",
    })).toEqual(["changes", "--git", "main", "--since", "v1.0", "--json"]);
  });

  it("applies depth to path subcommand", () => {
    expect(buildGenericArgs({
      subcommand: "path",
      target: "A",
      from: "B",
      depth: 5,
    })).toEqual(["path", "A", "B", "--depth", "5", "--json"]);
  });

  it("throws when path is missing from", () => {
    expect(() => buildGenericArgs({
      subcommand: "path",
      target: "HandleUser",
    })).toThrow("gograph 'path' subcommand requires both 'target' and 'from'");
  });

  it("builds source with just target", () => {
    expect(buildGenericArgs({
      subcommand: "source",
      target: "MyFunc",
    })).toEqual(["source", "MyFunc", "--json"]);
  });

  it("builds check with uncommitted", () => {
    expect(buildGenericArgs({
      subcommand: "check",
      target: "",
      uncommitted: true,
    })).toEqual(["check", "--uncommitted", "--json"]);
  });

  it("ignores uncommitted for non-supporting subcommand", () => {
    expect(buildGenericArgs({
      subcommand: "source",
      target: "MyFunc",
      uncommitted: true,
    })).toEqual(["source", "MyFunc", "--json"]);
  });
});
describe("needsGraph", () => {
  it("returns false for graph-free subcommands (doc)", () => {
    expect(needsGraph("doc")).toBe(false);
  });

  it("returns true for graph-dependent subcommands", () => {
    expect(needsGraph("callers")).toBe(true);
    expect(needsGraph("stats")).toBe(true);
  });
});

describe("registerGenericTool", () => {
  it("registers a 'gograph' tool advertising curated subcommands in its description", () => {
    const registered: { name: string; description: string }[] = [];
    const pi = {
      registerTool: (t: { name: string; description: string }) => {
        registered.push({ name: t.name, description: t.description });
      },
    } as unknown as ExtensionAPI;
    registerGenericTool(pi);
    const g = registered.find((t) => t.name === "gograph");
    expect(g).toBeDefined();
    expect(g!.description).toContain("callers");
    expect(g!.description).toContain("doc");
  });
});
