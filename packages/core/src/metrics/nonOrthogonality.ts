// Per-cell non-orthogonality angle (degrees) for pure-tet meshes, matching
// checkMesh's per-cell `nonOrthoAngle` field (`maxFaceToCell()` reduction
// in writeFields.C). PLAN.md §5 "Mesh metrics" / §7 "Metrics" step 2.
//
// Per internal face f: d = cellCentroid[neighbour] - cellCentroid[owner];
// faceOrtho = dot(d, S) / (mag(d) * mag(S) + ROOTVSMALL), clamped to
// [-1, 1] before acos. Per boundary face: faceOrtho = 1 (angle 0).
// Per-cell value: max over the cell's 4 faces (internal and boundary) of
// that face's angle.

import type { Adjacency } from "../geometry/adjacency.js";
import type { Mesh } from "../types.js";
import { cellCentroids, cellFaces, faceAreaVectors } from "./geometry.js";

const ROOTVSMALL = 1e-150;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function nonOrthoAngleMetric(mesh: Mesh, adjacency: Adjacency): Float64Array {
  const numTets = mesh.conn.length / 4;
  const S = faceAreaVectors(mesh, adjacency);
  const cc = cellCentroids(mesh);
  const faces = cellFaces(numTets, adjacency);

  const faceAngleDeg = new Float64Array(adjacency.faceCount);

  for (let f = 0; f < adjacency.internalCount; f++) {
    const owner = adjacency.owner[f]!;
    const neighbour = adjacency.neighbour[f]!;

    const dx = cc[neighbour * 3 + 0]! - cc[owner * 3 + 0]!;
    const dy = cc[neighbour * 3 + 1]! - cc[owner * 3 + 1]!;
    const dz = cc[neighbour * 3 + 2]! - cc[owner * 3 + 2]!;

    const sx = S[f * 3 + 0]!;
    const sy = S[f * 3 + 1]!;
    const sz = S[f * 3 + 2]!;

    const dot = dx * sx + dy * sy + dz * sz;
    const magD = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const magS = Math.sqrt(sx * sx + sy * sy + sz * sz);

    const faceOrtho = dot / (magD * magS + ROOTVSMALL);
    faceAngleDeg[f] = Math.acos(clamp(faceOrtho, -1, 1)) * RAD_TO_DEG;
  }

  for (let f = adjacency.internalCount; f < adjacency.faceCount; f++) {
    // Boundary face: faceOrtho = 1 -> angle 0.
    faceAngleDeg[f] = Math.acos(clamp(1, -1, 1)) * RAD_TO_DEG;
  }

  const result = new Float64Array(numTets);
  for (let t = 0; t < numTets; t++) {
    let maxAngle = 0;
    for (let k = 0; k < 4; k++) {
      const f = faces[t * 4 + k]!;
      const angle = faceAngleDeg[f]!;
      if (angle > maxAngle) maxAngle = angle;
    }
    result[t] = maxAngle;
  }

  return result;
}
