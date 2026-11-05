import { describe, expect, it } from "vitest";
import { regimeFindings } from "../src/index.js";

describe("regimeFindings", () => {
  it("warns laminar for Re_x < 5e5 (Case C, Re = 2.73853e4)", () => {
    const findings = regimeFindings(2.73853e4);
    const laminar = findings.find((f) => f.title === "Laminar flow regime");
    expect(laminar).toBeDefined();
    expect(laminar?.severity).toBe("warn");
    expect(findings.some((f) => f.title === "Transitional flow regime")).toBe(
      false,
    );
  });

  it("warns transitional for 5e5 <= Re_x < 3e6 (Case A, Re = 6.6404e5)", () => {
    const findings = regimeFindings(6.6404e5);
    const transitional = findings.find(
      (f) => f.title === "Transitional flow regime",
    );
    expect(transitional).toBeDefined();
    expect(transitional?.severity).toBe("warn");
    expect(findings.some((f) => f.title === "Laminar flow regime")).toBe(
      false,
    );
  });

  it("Re_x === 5e5 exactly falls into transitional, not laminar", () => {
    const findings = regimeFindings(5e5);
    expect(findings.some((f) => f.title === "Laminar flow regime")).toBe(
      false,
    );
    expect(
      findings.some((f) => f.title === "Transitional flow regime"),
    ).toBe(true);
  });

  it("Re_x === 3e6 exactly falls into neither laminar nor transitional", () => {
    const findings = regimeFindings(3e6);
    expect(findings.some((f) => f.title === "Laminar flow regime")).toBe(
      false,
    );
    expect(
      findings.some((f) => f.title === "Transitional flow regime"),
    ).toBe(false);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe("Flat-plate estimate");
  });

  it("Case D (Re = 5.31232e6): only the always-on flat-plate note, no warnings", () => {
    const findings = regimeFindings(5.31232e6);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
    expect(findings[0]?.title).toBe("Flat-plate estimate");
  });

  it("always includes the info-severity flat-plate disclosure note", () => {
    for (const re of [1e3, 6e5, 1e7]) {
      const findings = regimeFindings(re);
      const note = findings.find((f) => f.title === "Flat-plate estimate");
      expect(note).toBeDefined();
      expect(note?.severity).toBe("info");
    }
  });
});
