export const VERSION = "0.2.0";

/** ESI/OpenCFD OpenFOAM version pinned for the mesh-checker reference
 * pipeline (decisions.md #25) — the checkMesh version all mesh metrics
 * are verified against. */
export const OPENFOAM_REFERENCE_VERSION = "v2512";

export type {
  Severity,
  SolverType,
  Finding,
  InputError,
  Result,
  Mesh,
  MetricResult,
  WorstCell,
} from "./types.js";

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

export { cellVolumes } from "./metrics/volume.js";
export { aspectRatioMetric } from "./metrics/aspectRatio.js";
export { nonOrthoAngleMetric } from "./metrics/nonOrthogonality.js";
export { skewnessMetric } from "./metrics/skewness.js";

export { volumeFindings } from "./checks/mesh/volume.js";
export { aspectRatioFindings } from "./checks/mesh/aspectRatio.js";
export { nonOrthogonalityFindings } from "./checks/mesh/nonOrthogonality.js";
export { skewnessFindings } from "./checks/mesh/skewness.js";
export { elementOrderFindings } from "./checks/mesh/elementOrder.js";
