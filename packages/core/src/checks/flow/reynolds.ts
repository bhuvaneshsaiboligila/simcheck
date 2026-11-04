import { err, ok, type Result } from "../../types.js";

export interface ReynoldsInputs {
  densityKgM3: number;
  dynamicViscosityPaS: number;
  velocityMS: number;
  lengthM: number; // x, distance from leading edge
}

/**
 * Re_x = rho * U * x / mu.
 *
 * This is the canonical place U = 0/negative is caught for the flow checks;
 * every downstream caller (yplus.ts, etc.) must go through this function and
 * propagate its error rather than recomputing Re_x itself.
 */
export function reynoldsX(inputs: ReynoldsInputs): Result<number> {
  const { densityKgM3, dynamicViscosityPaS, velocityMS, lengthM } = inputs;

  if (densityKgM3 <= 0) {
    return err("densityKgM3", "density must be greater than 0 kg/m³");
  }
  if (dynamicViscosityPaS <= 0) {
    return err(
      "dynamicViscosityPaS",
      "dynamic viscosity must be greater than 0 Pa·s",
    );
  }
  if (velocityMS <= 0) {
    return err("velocityMS", "velocity must be greater than 0 m/s");
  }
  if (lengthM <= 0) {
    return err("lengthM", "length must be greater than 0 m");
  }

  return ok((densityKgM3 * velocityMS * lengthM) / dynamicViscosityPaS);
}
