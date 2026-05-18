import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readIndexState,
  writeIndexState,
  needsBackgroundRefresh,
} from "../src/refresh.js";

describe("needsBackgroundRefresh", () => {
  it("returns true when there is no stored state", () => {
    expect(
      needsBackgroundRefresh(
        { head: "abc", branch: "main", builtAt: "2026-01-01T00:00:00.000Z" },
        null,
      ),
    ).toBe(true);
  });

  it("returns false when the heads match", () => {
    expect(
      needsBackgroundRefresh(
        { head: "abc", branch: "main", builtAt: "2026-01-01T00:00:00.000Z" },
        { head: "abc", branch: "feature", builtAt: "2026-01-01T00:00:00.000Z" },
      ),
    ).toBe(false);
  });

  it("returns true when the head changes", () => {
    expect(
      needsBackgroundRefresh(
        { head: "abc", branch: "main", builtAt: "2026-01-01T00:00:00.000Z" },
        { head: "def", branch: "main", builtAt: "2026-01-01T00:00:00.000Z" },
      ),
    ).toBe(true);
  });
});

describe("index state read/write", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-gograph-refresh-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("round-trips the index state file", async () => {
    const state = {
      head: "abc123",
      branch: "feature/foo",
      builtAt: "2026-01-01T00:00:00.000Z",
    };

    await writeIndexState(tempDir, state);
    await expect(readIndexState(tempDir)).resolves.toEqual(state);
  });

  it("returns null when the state file is malformed", async () => {
    await mkdir(join(tempDir, ".gograph"), { recursive: true });
    await writeFile(join(tempDir, ".gograph", "pi-gograph-state.json"), "{not json}");
    await expect(readIndexState(tempDir)).resolves.toBeNull();
  });
});
