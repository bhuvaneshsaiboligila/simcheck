import { describe, expect, it } from "vitest";
import {
  airProperties,
  customFluid,
  resolveFluid,
  waterProperties,
} from "../src/index.js";
import { expectClose } from "./testUtils.js";

describe("airProperties", () => {
  it("matches hand-calc Case A (20 degC)", () => {
    const result = airProperties(293.15);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.densityKgM3, 1.20412);
      expectClose(result.value.dynamicViscosityPaS, 1.81332e-5);
    }
  });

  it("matches hand-calc Case C (15 degC)", () => {
    const result = airProperties(288.15);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.densityKgM3, 1.22501);
      expectClose(result.value.dynamicViscosityPaS, 1.78930e-5);
    }
  });

  it("rejects temperature <= 0 K", () => {
    const result = airProperties(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("temperatureK");
    }
  });

  it("rejects pressure <= 0 Pa", () => {
    const result = airProperties(293.15, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("pressurePa");
    }
  });
});

describe("waterProperties", () => {
  it("matches hand-calc Case E (20 degC, exact table point)", () => {
    const result = waterProperties(293.15);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.densityKgM3, 998.2);
      expectClose(result.value.dynamicViscosityPaS, 1.002e-3);
    }
  });

  it("rejects temperature below 0 degC", () => {
    const result = waterProperties(273.15 - 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("temperatureK");
    }
  });

  it("rejects temperature above 80 degC", () => {
    const result = waterProperties(353.15 + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("temperatureK");
    }
  });

  it("accepts the table boundaries exactly", () => {
    expect(waterProperties(273.15).ok).toBe(true);
    expect(waterProperties(353.15).ok).toBe(true);
  });

  it("interpolates density linearly and viscosity log-linearly between table points", () => {
    // Midpoint between 20 degC (998.2, 1.002e-3) and 25 degC (997.0, 8.90e-4).
    const result = waterProperties(295.65);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.densityKgM3, (998.2 + 997.0) / 2, 1e-6);
      const expectedMu = Math.exp(
        (Math.log(1.002e-3) + Math.log(8.9e-4)) / 2,
      );
      expectClose(result.value.dynamicViscosityPaS, expectedMu, 1e-6);
    }
  });
});

describe("customFluid", () => {
  it("accepts positive density and viscosity", () => {
    const result = customFluid(1000, 1e-3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.densityKgM3).toBe(1000);
      expect(result.value.dynamicViscosityPaS).toBe(1e-3);
      expectClose(result.value.kinematicViscosityM2S, 1e-6);
    }
  });

  it("rejects non-positive density", () => {
    const result = customFluid(0, 1e-3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("densityKgM3");
    }
  });

  it("rejects non-positive viscosity", () => {
    const result = customFluid(1000, -1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("dynamicViscosityPaS");
    }
  });
});

describe("resolveFluid", () => {
  it("dispatches to air", () => {
    const result = resolveFluid({ kind: "air", temperatureK: 293.15 });
    expect(result.ok).toBe(true);
  });

  it("dispatches to water", () => {
    const result = resolveFluid({ kind: "water", temperatureK: 293.15 });
    expect(result.ok).toBe(true);
  });

  it("dispatches to custom", () => {
    const result = resolveFluid({
      kind: "custom",
      densityKgM3: 1000,
      dynamicViscosityPaS: 1e-3,
    });
    expect(result.ok).toBe(true);
  });
});
