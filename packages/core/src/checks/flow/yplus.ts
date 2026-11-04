import { err, ok, type Result } from "../../types.js";
import type { SolverType } from "../../types.js";
import { reynoldsX } from "./reynolds.js";

export type { SolverType };

// White, Fluid Mechanics, 1/7-power-law flat plate (decisions.md #4/#22);
// exact edition/equation number verify, see docs/flow-spec.md §0.
export const CF_COEFFICIENT = 0.027;

export interface WallDistanceInputs {
  densityKgM3: number;
  dynamicViscosityPaS: number;
  velocityMS: number;
  xM: number;
  targetYPlus: number;
  solver: SolverType;
}

export interface WallDistanceResult {
  reynoldsX: number;
  cf: number;
  wallShearPa: number;
  frictionVelocityMS: number;
  wallDistanceM: number; // y - distance from wall to first cell centre (CC) or node (vertex-based)
  firstCellHeightM: number; // solver === "cell-centred" ? 2*y : y   (decision #6)
}

export function wallDistanceForYPlus(
  inputs: WallDistanceInputs,
): Result<WallDistanceResult> {
  const { densityKgM3, dynamicViscosityPaS, velocityMS, xM, targetYPlus, solver } =
    inputs;

  if (targetYPlus <= 0) {
    return err("targetYPlus", "target y+ must be greater than 0");
  }

  const reResult = reynoldsX({
    densityKgM3,
    dynamicViscosityPaS,
    velocityMS,
    lengthM: xM,
  });
  if (!reResult.ok) {
    return reResult;
  }
  const reX = reResult.value;

  const cf = CF_COEFFICIENT * Math.pow(reX, -1 / 7);
  const wallShearPa = 0.5 * cf * densityKgM3 * velocityMS * velocityMS;
  const frictionVelocityMS = Math.sqrt(wallShearPa / densityKgM3);
  const wallDistanceM =
    (targetYPlus * dynamicViscosityPaS) / (densityKgM3 * frictionVelocityMS);
  const firstCellHeightM =
    solver === "cell-centred" ? 2 * wallDistanceM : wallDistanceM;

  return ok({
    reynoldsX: reX,
    cf,
    wallShearPa,
    frictionVelocityMS,
    wallDistanceM,
    firstCellHeightM,
  });
}
