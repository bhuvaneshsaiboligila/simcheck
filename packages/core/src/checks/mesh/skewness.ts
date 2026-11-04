// Skewness findings (PLAN.md §6, milestone 8). checkMesh's own tier
// structure mirrored exactly, per decisions.md #29: 1 Finding only (fail if
// any cell exceeds the 4 threshold, else pass). Histogram: 20 linear bins
// from 0 to the data's own max.

import type { Adjacency } from "../../geometry/adjacency.js";
import { cellCentroids } from "../../metrics/geometry.js";
import { skewnessMetric } from "../../metrics/skewness.js";
import type { Finding, MetricResult, Mesh } from "../../types.js";
import { basicStats, buildWorst, linearBinnedFromZero, pctOfTotal } from "./shared.js";

const THRESHOLD = 4;
const REFERENCE =
  "OpenFOAM v2512 primitiveMeshTools::faceSkewness()/boundaryFaceSkewness() (docs/thresholds.md 'Skewness')";

export function skewnessFindings(mesh: Mesh, adjacency: Adjacency): MetricResult {
  const sk = skewnessMetric(mesh, adjacency);
  const total = sk.length;
  const { min, max, mean } = basicStats(sk);
  const centroids = cellCentroids(mesh);
  const { histogram, binEdges } = linearBinnedFromZero(sk);

  const badIndices: number[] = [];
  for (let t = 0; t < total; t++) {
    if (sk[t]! > THRESHOLD) badIndices.push(t);
  }
  // Descending: worst (highest) first.
  badIndices.sort((a, b) => sk[b]! - sk[a]!);

  const worst = buildWorst(mesh, sk, centroids, badIndices);
  const count = badIndices.length;

  const findings: Finding[] = [];
  if (count > 0) {
    const worstTag = mesh.tags[badIndices[0]!]!;
    const worstValue = sk[badIndices[0]!]!;
    findings.push({
      severity: "fail",
      title: "Highly skewed faces",
      message: `${count} of ${total} cells (${pctOfTotal(count, total)}%) have a face skewness of more than 4 (checkMesh's own threshold). Worst: ${worstValue.toPrecision(4)} (tag ${worstTag}).`,
      why: "checkMesh hard-fails at this threshold: the line between cell centres misses the shared face badly enough that interpolated face values and gradients become unreliable.",
      fix: "Refine or re-smooth the mesh near these cells (see the worst-cell table).",
      reference: REFERENCE,
    });
  } else {
    findings.push({
      severity: "pass",
      title: "Face skewness",
      message: `All ${total} cells have skewness below checkMesh's 4 threshold (max ${max.toPrecision(4)}).`,
      why: "Skewness this far below the threshold means interpolated face values and gradients across these faces should stay reliable.",
      reference: REFERENCE,
    });
  }

  return { histogram, binEdges, min, max, mean, worst, findings };
}
