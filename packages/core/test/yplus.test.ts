import { describe, expect, it } from "vitest";
import { wallDistanceForYPlus } from "../src/index.js";
import { expectClose } from "./testUtils.js";

describe("wallDistanceForYPlus — hand-calc cases", () => {
  it("Case A: air, 20 degC, 10 m/s, x=1m, y+=1", () => {
    const result = wallDistanceForYPlus({
      densityKgM3: 1.20412,
      dynamicViscosityPaS: 1.81332e-5,
      velocityMS: 10,
      xM: 1,
      targetYPlus: 1,
      solver: "cell-centred",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.reynoldsX, 6.6404e5);
      expectClose(result.value.cf, 3.97761e-3);
      expectClose(result.value.wallShearPa, 0.239475);
      expectClose(result.value.frictionVelocityMS, 0.44596);
      expectClose(result.value.wallDistanceM, 3.37684e-5);
      expectClose(result.value.firstCellHeightM, 6.75367e-5);
    }
  });

  it("Case A vertex-based: first cell height equals y, not 2y", () => {
    const result = wallDistanceForYPlus({
      densityKgM3: 1.20412,
      dynamicViscosityPaS: 1.81332e-5,
      velocityMS: 10,
      xM: 1,
      targetYPlus: 1,
      solver: "vertex-based",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.wallDistanceM, 3.37684e-5);
      expectClose(result.value.firstCellHeightM, 3.37684e-5);
    }
  });

  it("Case B: air, 20 degC, 50 m/s, x=0.5m, y+=30", () => {
    const result = wallDistanceForYPlus({
      densityKgM3: 1.20412,
      dynamicViscosityPaS: 1.81332e-5,
      velocityMS: 50,
      xM: 0.5,
      targetYPlus: 30,
      solver: "cell-centred",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.reynoldsX, 1.6601e6);
      expectClose(result.value.cf, 3.48958e-3);
      expectClose(result.value.wallShearPa, 5.25233);
      expectClose(result.value.frictionVelocityMS, 2.08853);
      expectClose(result.value.wallDistanceM, 2.16314e-4);
      expectClose(result.value.firstCellHeightM, 4.32629e-4);
    }
  });

  it("Case C: air, 15 degC, 2 m/s, x=0.2m, y+=1 (laminar)", () => {
    const result = wallDistanceForYPlus({
      densityKgM3: 1.22501,
      dynamicViscosityPaS: 1.7893e-5,
      velocityMS: 2,
      xM: 0.2,
      targetYPlus: 1,
      solver: "vertex-based",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.reynoldsX, 2.73853e4);
      expectClose(result.value.cf, 6.27238e-3);
      expectClose(result.value.wallDistanceM, 1.3041e-4);
    }
  });

  it("Case D: air, 20 degC, 40 m/s, x=2m, y+=1 (fully turbulent)", () => {
    const result = wallDistanceForYPlus({
      densityKgM3: 1.20412,
      dynamicViscosityPaS: 1.81332e-5,
      velocityMS: 40,
      xM: 2,
      targetYPlus: 1,
      solver: "vertex-based",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.reynoldsX, 5.31232e6);
      expectClose(result.value.cf, 2.95535e-3);
      expectClose(result.value.frictionVelocityMS, 1.53762);
      expectClose(result.value.wallDistanceM, 9.79392e-6);
    }
  });

  it("Case E: water, 20 degC, 2 m/s, x=0.5m, y+=1", () => {
    const result = wallDistanceForYPlus({
      densityKgM3: 998.2,
      dynamicViscosityPaS: 1.002e-3,
      velocityMS: 2,
      xM: 0.5,
      targetYPlus: 1,
      solver: "cell-centred",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.reynoldsX, 9.96208e5);
      expectClose(result.value.cf, 3.75368e-3);
      expectClose(result.value.wallShearPa, 7.49384);
      expectClose(result.value.frictionVelocityMS, 0.086645);
      expectClose(result.value.wallDistanceM, 1.15853e-5);
      expectClose(result.value.firstCellHeightM, 2.31706e-5);
    }
  });
});

describe("wallDistanceForYPlus — validation", () => {
  it("rejects targetYPlus <= 0", () => {
    const result = wallDistanceForYPlus({
      densityKgM3: 1,
      dynamicViscosityPaS: 1,
      velocityMS: 1,
      xM: 1,
      targetYPlus: 0,
      solver: "cell-centred",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("targetYPlus");
    }
  });

  it("propagates reynoldsX's velocity error unchanged", () => {
    const result = wallDistanceForYPlus({
      densityKgM3: 1,
      dynamicViscosityPaS: 1,
      velocityMS: 0,
      xM: 1,
      targetYPlus: 1,
      solver: "cell-centred",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("velocityMS");
    }
  });
});
