// Per-cell signed volume for pure-tet meshes. PLAN.md §5 "Mesh metrics",
// §7 "Metrics" step 1 ("Volume (fail if ≤ 0)"). This module only computes
// the numeric per-cell array -- the fail/OK decision is a later (UI)
// milestone's concern, per the task this was written from.
//
// V = (1/6) * dot(cross(p1 - p0, p2 - p0), p3 - p0), which comes out
// POSITIVE for a correctly-oriented tet and NEGATIVE for an inverted one
// (verified against tests/fixtures/single-tet.msh -> +1/6 and
// tests/fixtures/inverted-tet.msh -> -1/6).

import type { Adjacency } from "../geometry/adjacency.js";
import type { Mesh } from "../types.js";

/**
 * Signed per-cell volume, length numTets. `adjacency` is accepted for a
 * uniform metric-function signature across this module (all four metrics
 * take `(mesh, adjacency)`) but is not needed for volume, which is purely
 * a function of `mesh.conn`/`mesh.coords`.
 */
export function cellVolumes(mesh: Mesh, _adjacency: Adjacency): Float64Array {
  const numTets = mesh.conn.length / 4;
  const coords = mesh.coords;
  const conn = mesh.conn;
  const vol = new Float64Array(numTets);

  for (let t = 0; t < numTets; t++) {
    const base = t * 4;
    const n0 = conn[base + 0]!;
    const n1 = conn[base + 1]!;
    const n2 = conn[base + 2]!;
    const n3 = conn[base + 3]!;

    const x0 = coords[n0 * 3 + 0]!;
    const y0 = coords[n0 * 3 + 1]!;
    const z0 = coords[n0 * 3 + 2]!;

    const ax = coords[n1 * 3 + 0]! - x0;
    const ay = coords[n1 * 3 + 1]! - y0;
    const az = coords[n1 * 3 + 2]! - z0;

    const bx = coords[n2 * 3 + 0]! - x0;
    const by = coords[n2 * 3 + 1]! - y0;
    const bz = coords[n2 * 3 + 2]! - z0;

    const cx = coords[n3 * 3 + 0]! - x0;
    const cy = coords[n3 * 3 + 1]! - y0;
    const cz = coords[n3 * 3 + 2]! - z0;

    // cross(a, b)
    const crossX = ay * bz - az * by;
    const crossY = az * bx - ax * bz;
    const crossZ = ax * by - ay * bx;

    const dot = crossX * cx + crossY * cy + crossZ * cz;
    vol[t] = dot / 6;
  }

  return vol;
}
