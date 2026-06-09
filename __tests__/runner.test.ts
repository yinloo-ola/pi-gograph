import { describe, it, expect } from "vitest";
import { formatOutput } from "../src/runner.js";

describe("formatOutput", () => {
  it("returns (no results) for empty string", () => {
    const result = formatOutput("");
    expect(result.text).toBe("(no results)");
    expect(result.truncated).toBe(false);
    expect(result.totalLines).toBe(0);
  });

  it("returns (no results) for whitespace-only string", () => {
    const result = formatOutput("   \n  \n  ");
    expect(result.text).toBe("(no results)");
    expect(result.truncated).toBe(false);
    expect(result.totalLines).toBe(0);
  });

  it("returns content unchanged when under limits", () => {
    const input = '{"symbol":"MyFunc","type":"function"}';
    const result = formatOutput(input);
    expect(result.text).toBe(input);
    expect(result.truncated).toBe(false);
    expect(result.totalLines).toBe(1);
  });

  it("truncates output exceeding line limit", () => {
    const lines = Array.from({ length: 2500 }, (_, i) => `line ${i}`);
    const input = lines.join("\n");
    const result = formatOutput(input);
    expect(result.truncated).toBe(true);
    expect(result.totalLines).toBe(2500);
    expect(result.text).toContain("[Output truncated:");
    expect(result.text).toContain("2000 of 2500 lines");
  });

  it("preserves truncation notice format", () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
    const input = lines.join("\n");
    const result = formatOutput(input);
    expect(result.text).toMatch(/\[Output truncated: showing \d+ of 3000 lines/);
    expect(result.text).toContain("Narrow your query.");
  });
});
