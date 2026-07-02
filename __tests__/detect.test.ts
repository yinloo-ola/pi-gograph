import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isGoRepo,
  hasIndex,
  getGographVersion,
  isGographInstalledSync,
  gographNotInstalledError,
  versionMeets,
} from "../src/detect.js";

describe("isGoRepo", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-gograph-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when go.mod exists at root", async () => {
    await writeFile(join(tempDir, "go.mod"), "module example.com/test");
    expect(await isGoRepo(tempDir)).toBe(true);
  });

  it("returns true when .go files exist at root", async () => {
    await writeFile(join(tempDir, "main.go"), "package main");
    expect(await isGoRepo(tempDir)).toBe(true);
  });

  it("returns true when .go files exist 2 levels deep", async () => {
    const subDir = join(tempDir, "cmd", "server");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "main.go"), "package main");
    expect(await isGoRepo(tempDir)).toBe(true);
  });

  it("returns false for empty directory", async () => {
    expect(await isGoRepo(tempDir)).toBe(false);
  });

  it("returns false when only non-Go files exist", async () => {
    await writeFile(join(tempDir, "index.ts"), "console.log('hi')");
    await writeFile(join(tempDir, "package.json"), "{}");
    expect(await isGoRepo(tempDir)).toBe(false);
  });
});

describe("hasIndex", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-gograph-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when .gograph/graph.json exists", async () => {
    await mkdir(join(tempDir, ".gograph"));
    await writeFile(join(tempDir, ".gograph", "graph.json"), "{}");
    expect(await hasIndex(tempDir)).toBe(true);
  });

  it("returns false when .gograph directory does not exist", async () => {
    expect(await hasIndex(tempDir)).toBe(false);
  });

  it("returns false when .gograph exists but graph.json does not", async () => {
    await mkdir(join(tempDir, ".gograph"));
    expect(await hasIndex(tempDir)).toBe(false);
  });
});

describe("getGographVersion", () => {
  it("returns string when gograph is installed, null otherwise", () => {
    const result = getGographVersion();
    expect(result === null || typeof result === "string").toBe(true);
    if (result !== null) {
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

describe("isGographInstalledSync", () => {
  it("returns boolean (not Promise)", () => {
    const result = isGographInstalledSync();
    expect(typeof result).toBe("boolean");
  });

  it("matches isGographInstalled result", async () => {
    const { isGographInstalled } = await import("../src/detect.js");
    expect(isGographInstalledSync()).toBe(await isGographInstalled());
  });
});

describe("gographNotInstalledError", () => {
  it("returns an Error with setup instructions", () => {
    const err = gographNotInstalledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("/gograph-setup");
    expect(err.message).toContain("brew install");
  });
});
describe("versionMeets", () => {
  it("returns true when actual equals minimum", () => {
    expect(versionMeets("gograph version v1.4.81", "1.4.81")).toBe(true);
  });

  it("returns true when actual is greater", () => {
    expect(versionMeets("gograph version v1.4.82", "1.4.81")).toBe(true);
    expect(versionMeets("gograph version v1.5.0", "1.4.81")).toBe(true);
    expect(versionMeets("gograph version v2.0.0", "1.4.81")).toBe(true);
  });

  it("returns false when actual is less", () => {
    expect(versionMeets("gograph version v1.4.77", "1.4.81")).toBe(false);
    expect(versionMeets("gograph version v1.4.80", "1.4.81")).toBe(false);
  });

  it("returns false when actual is null", () => {
    expect(versionMeets(null, "1.4.81")).toBe(false);
  });

  it("returns false when actual is unparseable", () => {
    expect(versionMeets("gograph is broken", "1.4.81")).toBe(false);
  });
});
