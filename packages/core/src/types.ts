// Core shared types. See PLAN.md §6 for Finding/Severity/SolverType,
// and docs/flow-spec.md §3.0 for InputError/Result.

// "info" (decisions.md #35) is for disclosures that aren't a verdict on
// quality at all -- a note about what was excluded and why, or about a
// mesh feature (higher-order cells) that changes how a check works, not
// whether it passed. Using "pass" for these (as decisions.md #24/#32/#34
// originally did, to avoid widening this type for one disclosure note)
// reads as a green checkmark for something that isn't actually a clean
// result; "info" gets a neutral grey badge instead.
export type Severity = "pass" | "warn" | "fail" | "info";

export type SolverType = "cell-centred" | "vertex-based";

export interface Finding {
  severity: Severity;
  title: string;
  message: string; // what was found, with numbers
  why: string; // why it matters
  fix?: string; // what the user should change
  reference?: string; // source of the formula or threshold
}

/**
 * Describes invalid input that should never reach the physics (e.g. U = 0,
 * negative density). Distinct from Finding, which describes something found
 * about an otherwise-valid computation.
 */
export interface InputError {
  kind: "input-error";
  field: string; // e.g. "velocityMS", "temperatureK"
  message: string; // human-readable, says what to change
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: InputError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(field: string, message: string): Result<T> {
  return { ok: false, error: { kind: "input-error", field, message } };
}

/**
 * Pure-tet volume mesh, v0.2 (PLAN.md §6). Produced by parsers/gmsh.ts.
 * Flat typed arrays only: one entry per node in `coords`, one group of 4
 * node indices per tet in `conn`, one entry per tet in `tags`/`physical`.
 *
 * `conn` always holds exactly 4 corner node indices per tet, even for a
 * higher-order (curved) tet (decisions.md #9 revised): Gmsh orders a tet's
 * nodes corners-first for every order it defines, so `conn` is always the
 * straight-sided cell a finite-volume solver actually sees. `cellNodeCount`
 * records each cell's original node count (4/10/20/35/56) so a mesh with
 * any higher-order tets can be told apart from a purely-linear one.
 */
export interface Mesh {
  coords: Float64Array; // x,y,z per node
  conn: Int32Array; // 4 corner node indices per tet (0-based, dense)
  tags: Int32Array; // Gmsh element tag per cell
  physical: Int32Array; // physical group tag per cell (0 if none)
  cellNodeCount: Int32Array; // original per-cell node count (4 for linear tets)
}

/**
 * One entry in a MetricResult's worst-cell table (PLAN.md §6, up to 50
 * entries). `physical` is the raw `mesh.physical[cell]` tag; turning it
 * into a display name ("group N" / "no physical group") is a UI concern
 * (decisions.md #18), not this type's job.
 */
export interface WorstCell {
  tag: number;
  centroid: [number, number, number];
  physical: number;
  value: number;
}

/**
 * Summary result for one mesh metric (PLAN.md §6, milestone 8). `histogram`
 * and `binEdges` are optional because the volume metric has no histogram
 * (decisions.md #29: not called for in PLAN.md §6, and raw cell volume
 * mixes deliberate boundary-layer grading with real defects, unlike the
 * other three metrics) -- the other three metrics always populate both.
 */
export interface MetricResult {
  histogram?: Uint32Array; // 20 bins (log bins for aspect ratio)
  binEdges?: Float64Array;
  min: number;
  max: number;
  mean: number;
  worst: WorstCell[]; // up to 50, filtered to offending cells only
  findings: Finding[];
}
