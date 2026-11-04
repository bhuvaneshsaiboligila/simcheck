// Per-cell aspect ratio for pure-tet meshes, matching checkMesh's
// `cellClosedness()` (primitiveMeshTools.C, confirmed source -- see the
// task this module was written from, and docs/thresholds.md). PLAN.md §5
// "Mesh metrics" / §7 "Metrics" step 2.
//
// For each cell, accumulate the component-wise absolute face area vector
// over its 4 faces (sign doesn't matter: cmptMag is taken immediately), then:
//   maxCmpt = max(sumX, sumY, sumZ)
//   minCmpt = max(ROOTVSMALL, min(sumX, sumY, sumZ))
//   componentPart = maxCmpt / minCmpt
//   v = max(ROOTVSMALL, vol[cell])   -- NOT abs(vol[cell]): checkMesh's own
//     source (primitiveMeshTools.C: "scalar v = max(ROOTVSMALL, vols[celli]);")
//     clamps the raw signed volume, so a non-positive cell collapses v to
//     ROOTVSMALL and blows surfacePart up to checkMesh's own degenerate-cell
//     sentinel magnitude (~5e+99 for a unit-scale inverted tet) rather than
//     giving a normal finite aspect ratio -- confirmed against
//     tests/reference/inverted-tet.json's perCellFields.aspectRatio.
//   surfacePart = (1/6) * (sumX + sumY + sumZ) / v^(2/3)
//   aspectRatio[cell] = max(componentPart, surfacePart)
//
// ROOTVSMALL ~= 1e-150, used only to avoid division by zero.

import type { Adjacency } from "../geometry/adjacency.js";
import type { Mesh } from "../types.js";
import { cellFaces, faceAreaVectors } from "./geometry.js";
import { cellVolumes } from "./volume.js";

const ROOTVSMALL = 1e-150;

export function aspectRatioMetric(mesh: Mesh, adjacency: Adjacency): Float64Array {
  const numTets = mesh.conn.length / 4;
  const S = faceAreaVectors(mesh, adjacency);
  const faces = cellFaces(numTets, adjacency);
  const vol = cellVolumes(mesh, adjacency);

  const result = new Float64Array(numTets);

  for (let t = 0; t < numTets; t++) {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (let k = 0; k < 4; k++) {
      const f = faces[t * 4 + k]!;
      sumX += Math.abs(S[f * 3 + 0]!);
      sumY += Math.abs(S[f * 3 + 1]!);
      sumZ += Math.abs(S[f * 3 + 2]!);
    }

    const maxCmpt = Math.max(sumX, sumY, sumZ);
    const minCmpt = Math.max(ROOTVSMALL, Math.min(sumX, sumY, sumZ));
    const componentPart = maxCmpt / minCmpt;

    const v = Math.max(ROOTVSMALL, vol[t]!);
    const surfacePart = ((sumX + sumY + sumZ) / 6) / Math.pow(v, 2 / 3);

    result[t] = Math.max(componentPart, surfacePart);
  }

  return result;
}
