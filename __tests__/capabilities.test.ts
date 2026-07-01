import { describe, it, beforeEach } from "vitest";
import {
  discoverCapabilities,
  parseCapabilitiesOutput,
  getCachedCapabilities,
  setCachedCapabilities,
  resetCapabilitiesCacheForTest,
} from "../src/capabilities.js";

describe("capabilities.parseCapabilitiesOutput", () => {
  it.todo("parses a subcommand list from well-formed capabilities output");
  it.todo("excludes primary-tool commands that have dedicated tools (plan, review, explain, risk, summary, etc.)");
  it.todo("excludes session/CLI-only commands");
  it.todo("returns DEFAULT_CAPABILITIES when output is empty");
  it.todo("returns DEFAULT_CAPABILITIES when output cannot be parsed");
});

describe("capabilities.discoverCapabilities", () => {
  beforeEach(() => {
    resetCapabilitiesCacheForTest();
  });

  it.todo("returns discovered capabilities and caches them on success");
  it.todo("returns DEFAULT_CAPABILITIES when gograph is not installed (never throws)");
  it.todo("returns DEFAULT_CAPABILITIES when `gograph capabilities` exits non-zero (never throws)");
  it.todo("returns DEFAULT_CAPABILITIES when output is unparseable (never throws)");
  it.todo("forwards the abort signal to the gograph process");
});

describe("capabilities cache", () => {
  beforeEach(() => {
    resetCapabilitiesCacheForTest();
  });

  it.todo("getCachedCapabilities returns DEFAULT_CAPABILITIES before discovery runs");
  it.todo("getCachedCapabilities returns the cached value after setCachedCapabilities");
  it.todo("resetCapabilitiesCacheForTest clears the cache back to defaults");
});