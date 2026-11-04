import { err, ok, type Result } from "../../types.js";

export interface CflInputs {
  cfl: number;
  cellSizeM: number;
  velocityMS: number;
}

/**
 * delta_t_max = cfl * cellSizeM / |velocityMS|.
 *
 * Unlike reynoldsX, a negative velocity is physically meaningful here (flow
 * direction) since CFL uses |U|; only velocityMS === 0 is rejected.
 */
export function maxTimestep(inputs: CflInputs): Result<number> {
  const { cfl, cellSizeM, velocityMS } = inputs;

  if (cfl <= 0) {
    return err("cfl", "CFL number must be greater than 0");
  }
  if (cellSizeM <= 0) {
    return err("cellSizeM", "cell size must be greater than 0 m");
  }
  if (velocityMS === 0) {
    return err("velocityMS", "velocity must not be 0 m/s");
  }

  return ok((cfl * cellSizeM) / Math.abs(velocityMS));
}
