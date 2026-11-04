// Aspect ratio findings (PLAN.md §6, milestone 8). checkMesh's own tier
// structure mirrored exactly, per decisions.md #29: 1 Finding only (fail if
// any cell exceeds the 1000 threshold, else pass). Histogram: 20 log-spaced
// bins (decisions.md #17).

import type { Adjacency } from "../../geometry/adjacency.js";
import { aspectRatioMetric } from "../../metrics/aspectRatio.js";
import { cellCentroids } from "../../metrics/geometry.js";
import type { Finding, MetricResult, Mesh } from "../../types.js";
import { basicStats, buildWorst, logBinned, pctOfTotal } from "./shared.js";

const THRESHOLD = 1000;
const REFERENCE =
  "OpenFOAM v2512 primitiveMeshCheck.C:40, primitiveMeshTools::cellClosedness() (docs/thresholds.md 'Aspect ratio')";

export function aspectRatioFindings(mesh: Mesh, adjacency: Adjacency): MetricResult {
  const ar = aspectRatioMetric(mesh, adjacency);
  const total = ar.length;
  const { min, max, mean } = basicStats(ar);
  const centroids = cellCentroids(mesh);
  const { histogram, binEdges } = logBinned(ar);

  const badIndices: number[] = [];
  for (let t = 0; t < total; t++) {
    if (ar[t]! > THRESHOLD) badIndices.push(t);
  }
  // Descending: worst (highest) first.
  badIndices.sort((a, b) => ar[b]! - ar[a]!);

  const worst = buildWorst(mesh, ar, centroids, badIndices);
  const count = badIndices.length;

  const findings: Finding[] = [];
  if (count > 0) {
    const worstTag = mesh.tags[badIndices[0]!]!;
    const worstValue = ar[badIndices[0]!]!;
    findings.push({
      severity: "fail",
      title: "High aspect ratio cells",
      message: `${count} of ${total} cells (${pctOfTotal(count, total)}%) have aspect ratio over checkMesh's 1000 threshold. Worst: ${worstValue.toPrecision(4)} (tag ${worstTag}).`,
      why: "checkMesh hard-fails a mesh at this threshold: cells this elongated or flattened make gradient reconstruction and pressure-velocity coupling unreliable, and solvers commonly warn or diverge near them.",
      fix: "Refine or re-smooth the mesh where these cells are (see the worst-cell table) — this is usually a sign cell size changes too fast between regions.",
      reference: REFERENCE,
    });
  } else {
    findings.push({
      severity: "pass",
      title: "Cell aspect ratio",
      message: `All ${total} cells have aspect ratio below checkMesh's 1000 threshold (max ${max.toPrecision(4)}).`,
      why: "Aspect ratios this far below the threshold mean gradient reconstruction and pressure-velocity coupling across these cells should stay reliable.",
      reference: REFERENCE,
    });
  }

  return { histogram, binEdges, min, max, mean, worst, findings };
}
