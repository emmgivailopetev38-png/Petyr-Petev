import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/playbooks/templating";

describe("renderTemplate", () => {
  it("substitutes {input}", () => {
    expect(renderTemplate("Hi {input}", "world", [])).toBe("Hi world");
  });

  it("substitutes {step_N_output}", () => {
    expect(
      renderTemplate("First: {step_1_output}, second: {step_2_output}", "x", ["A", "B"]),
    ).toBe("First: A, second: B");
  });

  it("handles missing step outputs as empty", () => {
    expect(renderTemplate("Got: {step_5_output}", "x", ["A"])).toBe("Got: ");
  });

  it("substitutes multiple {input} occurrences", () => {
    expect(renderTemplate("{input} and {input}", "x", [])).toBe("x and x");
  });
});
