import { describe, expect, it } from "vitest";
import { reynoldsX } from "../src/index.js";
import { expectClose } from "./testUtils.js";

describe("reynoldsX", () => {
  it("matches hand-calc Case A", () => {
    const result = reynoldsX({
      densityKgM3: 1.20412,
      dynamicViscosityPaS: 1.81332e-5,
      velocityMS: 10,
      lengthM: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value, 6.6404e5);
    }
  });

  it("rejects velocity = 0 with InputError, not NaN", () => {
    const result = reynoldsX({
      densityKgM3: 1,
      dynamicViscosityPaS: 1,
      velocityMS: 0,
      lengthM: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("velocityMS");
    }
  });

  it("rejects negative velocity with InputError, not NaN", () => {
    const result = reynoldsX({
      densityKgM3: 1,
      dynamicViscosityPaS: 1,
      velocityMS: -5,
      lengthM: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("velocityMS");
    }
  });

  it("rejects non-positive length", () => {
    const result = reynoldsX({
      densityKgM3: 1,
      dynamicViscosityPaS: 1,
      velocityMS: 1,
      lengthM: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("lengthM");
    }
  });

  it("rejects non-positive density", () => {
    const result = reynoldsX({
      densityKgM3: -1,
      dynamicViscosityPaS: 1,
      velocityMS: 1,
      lengthM: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("densityKgM3");
    }
  });

  it("rejects non-positive viscosity", () => {
    const result = reynoldsX({
      densityKgM3: 1,
      dynamicViscosityPaS: 0,
      velocityMS: 1,
      lengthM: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("dynamicViscosityPaS");
    }
  });
});
