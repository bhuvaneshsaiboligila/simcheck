import { describe, expect, it } from "vitest";
import { maxTimestep } from "../src/index.js";
import { expectClose } from "./testUtils.js";

describe("maxTimestep", () => {
  it("matches hand-calc Case A: CFL=1, dx=1e-3 m -> dt=1.0e-4 s", () => {
    const result = maxTimestep({ cfl: 1, cellSizeM: 1e-3, velocityMS: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value, 1.0e-4);
    }
  });

  it("rejects velocityMS === 0 with InputError", () => {
    const result = maxTimestep({ cfl: 1, cellSizeM: 1e-3, velocityMS: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("velocityMS");
    }
  });

  it("accepts negative velocityMS (uses |U|), unlike reynoldsX", () => {
    const result = maxTimestep({ cfl: 1, cellSizeM: 1e-3, velocityMS: -10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectClose(result.value, 1.0e-4);
    }
  });

  it("rejects cfl <= 0", () => {
    const result = maxTimestep({ cfl: 0, cellSizeM: 1e-3, velocityMS: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("cfl");
    }
  });

  it("rejects cellSizeM <= 0", () => {
    const result = maxTimestep({ cfl: 1, cellSizeM: 0, velocityMS: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("cellSizeM");
    }
  });
});
