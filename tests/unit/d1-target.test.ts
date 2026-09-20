import { describe, expect, it } from "vitest";
import { d1TargetArguments, selectD1Target } from "../../scripts/d1-target";

describe("D1 CLI target selection", () => {
  it("defaults to local and selects remote only when explicitly requested", () => {
    expect(selectD1Target([])).toBe("--local");
    expect(selectD1Target(["--local"])).toBe("--local");
    expect(selectD1Target(["--remote"])).toBe("--remote");
  });

  it("refuses ambiguous local and remote targets", () => {
    expect(() => selectD1Target(["--local", "--remote"])).toThrow(/choose only one/i);
  });

  it("forwards an explicit Wrangler environment", () => {
    expect(d1TargetArguments(["--remote", "--env", "production"])).toEqual(["--remote", "--env", "production"]);
    expect(() => d1TargetArguments(["--remote", "--env"])).toThrow(/--env requires/i);
  });
});
