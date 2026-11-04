import { describe, expect, it } from "vitest";
import { boundaryLayerThickness, solveLayers } from "../src/index.js";
import { expectClose } from "./testUtils.js";

describe("boundaryLayerThickness — hand-calc cases", () => {
  it("Case A", () => {
    expectClose(boundaryLayerThickness(1, 6.6404e5), 0.023571);
  });
  it("Case B", () => {
    expectClose(boundaryLayerThickness(0.5, 1.6601e6), 0.0103395);
  });
  it("Case C", () => {
    expectClose(boundaryLayerThickness(0.2, 2.73853e4), 7.43394e-3);
  });
  it("Case D", () => {
    expectClose(boundaryLayerThickness(2, 5.31232e6), 0.0350264);
  });
  it("Case E", () => {
    expectClose(boundaryLayerThickness(0.5, 9.96208e5), 0.011122);
  });
});

const CASE_A_H = 6.75367e-5; // cell-centred first height, Case A
const CASE_A_DELTA = 0.023571;

describe("solveLayers — n-given-r", () => {
  it("Case A: r=1.2, covers delta -> N=24", () => {
    const result = solveLayers({
      mode: "n-given-r",
      firstHeightM: CASE_A_H,
      growthRatio: 1.2,
      targetThicknessM: CASE_A_DELTA,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.numLayers).toBe(24);
      expectClose(result.value.totalThicknessM, 0.0265071);
    }
  });

  it("rejects growthRatio === 1 with a message pointing to r-equals-one mode", () => {
    const result = solveLayers({
      mode: "n-given-r",
      firstHeightM: CASE_A_H,
      growthRatio: 1,
      targetThicknessM: CASE_A_DELTA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("growthRatio");
    }
  });

  it("rejects growthRatio <= 0", () => {
    const result = solveLayers({
      mode: "n-given-r",
      firstHeightM: CASE_A_H,
      growthRatio: -1,
      targetThicknessM: CASE_A_DELTA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("growthRatio");
    }
  });
});

describe("solveLayers — r-given-n (bisection)", () => {
  it("Case A: N=20, T=delta -> r=1.25144", () => {
    const result = solveLayers({
      mode: "r-given-n",
      firstHeightM: CASE_A_H,
      numLayers: 20,
      targetThicknessM: CASE_A_DELTA,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value.growthRatio ?? NaN, 1.25144);
    }
  });

  it("converges to 1e-6 relative width", () => {
    const result = solveLayers({
      mode: "r-given-n",
      firstHeightM: 1e-5,
      numLayers: 15,
      targetThicknessM: 0.01,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.growthRatio !== undefined) {
      const r = result.value.growthRatio;
      const n = 15;
      const h = 1e-5;
      const t = (h * (Math.pow(r, n) - 1)) / (r - 1);
      expectClose(t, 0.01, 1e-5);
    }
  });

  it("returns r=1 directly when target equals N*h (no bisection needed)", () => {
    const result = solveLayers({
      mode: "r-given-n",
      firstHeightM: CASE_A_H,
      numLayers: 10,
      targetThicknessM: 10 * CASE_A_H,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.growthRatio).toBe(1);
      expectClose(result.value.totalThicknessM, 10 * CASE_A_H);
    }
  });

  it("rejects target smaller than N layers at the first height", () => {
    const result = solveLayers({
      mode: "r-given-n",
      firstHeightM: CASE_A_H,
      numLayers: 10,
      targetThicknessM: 5 * CASE_A_H,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("targetThicknessM");
    }
  });

  it("max-iteration safeguard: an unreachable target returns InputError, not a wrong number", () => {
    // For N = 1, T(r) = h for every r != 1 (removable singularity), so a
    // target thickness != h is unreachable no matter what growth ratio is
    // tried. This exercises the hi-expansion loop's non-convergence path.
    const result = solveLayers({
      mode: "r-given-n",
      firstHeightM: 1e-5,
      numLayers: 1,
      targetThicknessM: 2e-5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("targetThicknessM");
    }
  });

  it("rejects non-positive-integer numLayers", () => {
    const result = solveLayers({
      mode: "r-given-n",
      firstHeightM: CASE_A_H,
      numLayers: 12.5,
      targetThicknessM: CASE_A_DELTA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("numLayers");
    }
  });
});

describe("solveLayers — r-equals-one", () => {
  it("Case A: r=1, N=10 -> T = 6.75367e-4 m", () => {
    const result = solveLayers({
      mode: "r-equals-one",
      firstHeightM: CASE_A_H,
      numLayers: 10,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.growthRatio).toBe(1);
      expect(result.value.numLayers).toBe(10);
      expectClose(result.value.totalThicknessM, 6.75367e-4);
    }
  });

  it("no division by zero: large N still computes a finite thickness", () => {
    const result = solveLayers({
      mode: "r-equals-one",
      firstHeightM: 1e-5,
      numLayers: 1000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isFinite(result.value.totalThicknessM)).toBe(true);
      expectClose(result.value.totalThicknessM, 1e-2);
    }
  });

  it("rejects non-positive-integer numLayers", () => {
    const result = solveLayers({
      mode: "r-equals-one",
      firstHeightM: CASE_A_H,
      numLayers: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("numLayers");
    }
  });

  it("rejects non-positive firstHeightM", () => {
    const result = solveLayers({
      mode: "r-equals-one",
      firstHeightM: 0,
      numLayers: 10,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("firstHeightM");
    }
  });
});
