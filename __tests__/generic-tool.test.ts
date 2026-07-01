import { describe, it, expect } from "vitest";
import { buildGenericArgs } from "../src/generic-tool.js";

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
describe("dynamic discovery & graph-free gating (scaffold placeholders)", () => {
  it.todo("registerGenericTool advertises exactly the cached capabilities' subcommands");
  it.todo("execute skips ensureReady for graph-free subcommands (e.g. doc)");
  it.todo("execute calls ensureReady for graph-dependent subcommands (e.g. callers)");
  it.todo("description lists curated one-line docs for known subcommands and name-only for unknown ones");
  it.todo("falls back to DEFAULT_CAPABILITIES subcommands when the cache is empty");
});
