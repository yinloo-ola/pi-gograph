import { describe, it, expect } from "vitest";

describe("registerTools", () => {
  it("exports a registerTools function", async () => {
    const { registerTools } = await import("../src/tools.js");
    expect(typeof registerTools).toBe("function");
  });
});
describe("registerRiskTool / registerSummaryTool (scaffold placeholders)", () => {
  it.todo("risk buildArgs: emits [\"risk\", symbol, \"--json\"] for a symbol");
  it.todo("risk buildArgs: emits [\"risk\", \"--uncommitted\", \"--json\"] when uncommitted=true");
  it.todo("risk buildArgs: throws when neither symbol nor uncommitted is given");
  it.todo("summary buildArgs: emits [\"summary\", \"--json\"] with no parameters");
  it.todo("registerTools registers both risk and summary tools via a mock ExtensionAPI");
});
