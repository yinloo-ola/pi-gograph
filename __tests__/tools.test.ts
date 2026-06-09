import { describe, it, expect } from "vitest";

describe("registerTools", () => {
  it("exports a registerTools function", async () => {
    const { registerTools } = await import("../src/tools.js");
    expect(typeof registerTools).toBe("function");
  });
});
