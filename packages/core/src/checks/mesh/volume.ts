// Volume findings (PLAN.md §6, milestone 8). checkMesh's own tier structure
// mirrored exactly, per decisions.md #29: 1 Finding only (fail if any cell
// has volume <= 0, else pass). No histogram -- not called for in PLAN.md §6,
// and raw cell volume mixes deliberate boundary-layer grading with real
// defects, unlike the other three metrics.

import type { Adjacency } from "../../geometry/adjacency.js";
import { cellCentroids } from "../../metrics/geometry.js";
import { cellVolumes } from "../../metrics/volume.js";
import type { Finding, MetricResult, Mesh } from "../../types.js";
import { basicStats, buildWorst, pctOfTotal } from "./shared.js";

const REFERENCE = "OpenFOAM v2512 primitiveMeshCheck.C checkCellVolumes() (docs/thresholds.md 'Volume')";

export function volumeFindings(mesh: Mesh, adjacency: Adjacency): MetricResult {
  const vol = cellVolumes(mesh, adjacency);
  const total = vol.length;
  const { min, max, mean } = basicStats(vol);
  const centroids = cellCentroids(mesh);

  const badIndices: number[] = [];
  for (let t = 0; t < total; t++) {
    if (vol[t]! <= 0) badIndices.push(t);
  }
  // Ascending: most negative (worst) first.
  badIndices.sort((a, b) => vol[a]! - vol[b]!);

  const worst = buildWorst(mesh, vol, centroids, badIndices);
  const count = badIndices.length;

  const findings: Finding[] = [];
  if (count > 0) {
    const worstTag = mesh.tags[badIndices[0]!]!;
    const worstVol = vol[badIndices[0]!]!;
    findings.push({
      severity: "fail",
      title: "Negative or zero-volume cells",
      message: `${count} of ${total} cells (${pctOfTotal(count, total)}%) have volume ≤ 0. Worst: ${worstVol.toPrecision(4)} (tag ${worstTag}).`,
      why: "A cell with non-positive volume is inverted or degenerate — its nodes are listed in the wrong order or lie on (or past) a plane. Face areas and gradients computed from it are meaningless, and OpenFOAM, Fluent and SU2 will all refuse to run or silently misbehave near it.",
      fix: "Repair or regenerate the mesh around the cells in the worst-cell table; look for reversed elements or duplicate/collapsed nodes.",
      reference: REFERENCE,
    });
  } else {
    findings.push({
      severity: "pass",
      title: "Cell volumes",
      message: `All ${total} cells have positive volume (min ${min.toPrecision(4)}).`,
      why: "Every cell's nodes are ordered consistently, so face areas and gradients computed from this mesh are well-defined.",
      reference: REFERENCE,
    });
  }

  return { min, max, mean, worst, findings };
}
