export const VERSION = "0.1.0";

export type { Severity, SolverType, Finding, InputError, Result, Mesh } from "./types.js";

export {
  SUTHERLAND_MU0,
  SUTHERLAND_T0,
  SUTHERLAND_S,
  IDEAL_GAS_R_AIR,
  DEFAULT_PRESSURE_PA,
  airProperties,
  waterProperties,
  customFluid,
  resolveFluid,
} from "./fluids.js";
export type { FluidProperties, FluidInput } from "./fluids.js";

export { reynoldsX } from "./checks/flow/reynolds.js";
export type { ReynoldsInputs } from "./checks/flow/reynolds.js";

export { CF_COEFFICIENT, wallDistanceForYPlus } from "./checks/flow/yplus.js";
export type { WallDistanceInputs, WallDistanceResult } from "./checks/flow/yplus.js";

export { boundaryLayerThickness, solveLayers } from "./checks/flow/blayer.js";
export type {
  LayerInputs,
  LayerInputsNGivenR,
  LayerInputsRGivenN,
  LayerInputsFixedR1,
  LayerResult,
} from "./checks/flow/blayer.js";

export { maxTimestep } from "./checks/flow/cfl.js";
export type { CflInputs } from "./checks/flow/cfl.js";

export { regimeFindings } from "./checks/flow/regime.js";

export { parseGmsh } from "./parsers/gmsh.js";

export { buildAdjacency } from "./geometry/adjacency.js";
export type { Adjacency } from "./geometry/adjacency.js";
