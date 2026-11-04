// Non-orthogonality findings (PLAN.md §6, milestone 8). checkMesh's own
// two-tier structure mirrored exactly, per decisions.md #29: warn tier
// (70°-90°) and fail tier (>=90°), each on the per-cell `maxFaceToCell`-
// reduced angle computed by metrics/nonOrthogonality.ts. A cell counts in
// at most one tier: fail is checked first, so a cell at >=90° is never also
// counted in the warn tier. Emits 1 Finding per populated tier, or 1 pass
// Finding if neither tier is populated. Histogram: 20 linear bins from 0 to
// the data's own max.

import type { Adjacency } from "../../geometry/adjacency.js";
import { cellCentroids } from "../../metrics/geometry.js";
import { nonOrthoAngleMetric } from "../../metrics/nonOrthogonality.js";
import type { Finding, MetricResult, Mesh } from "../../types.js";
import { basicStats, buildWorst, linearBinnedFromZero, pctOfTotal } from "./shared.js";

const WARN_THRESHOLD = 70;
// checkMesh's literal test is `ortho <= SMALL` (SMALL = 1e-15), i.e.
// angle >= acos(SMALL) ~= 90 - 5.7e-14 degrees. `angle >= 90` is numerically
// indistinguishable from that in IEEE double precision for any real mesh
// (the gap is ~15 orders of magnitude below anything a real face angle can
// resolve to), so this constant should not be "corrected" to something more
// exotic later -- it already is the exact implementation constant.
const FAIL_THRESHOLD = 90;

const REFERENCE =
  "OpenFOAM v2512 primitiveMeshCheck.C:41, primitiveMeshTools::faceOrthogonality() (docs/thresholds.md 'Non-orthogonality')";

export function nonOrthogonalityFindings(mesh: Mesh, adjacency: Adjacency): MetricResult {
  const angle = nonOrthoAngleMetric(mesh, adjacency);
  const total = angle.length;
  const { min, max, mean } = basicStats(angle);
  const centroids = cellCentroids(mesh);
  const { histogram, binEdges } = linearBinnedFromZero(angle);

  const warnIndices: number[] = [];
  const failIndices: number[] = [];
  for (let t = 0; t < total; t++) {
    const a = angle[t]!;
    if (a >= FAIL_THRESHOLD) {
      failIndices.push(t);
    } else if (a > WARN_THRESHOLD) {
      warnIndices.push(t);
    }
  }
  warnIndices.sort((a, b) => angle[b]! - angle[a]!);
  failIndices.sort((a, b) => angle[b]! - angle[a]!);

  // Worst-cell table: everything over the warn threshold (either tier),
  // sorted descending together, capped 50.
  const badIndices = [...warnIndices, ...failIndices].sort((a, b) => angle[b]! - angle[a]!);
  const worst = buildWorst(mesh, angle, centroids, badIndices);

  const findings: Finding[] = [];

  if (warnIndices.length > 0) {
    const count = warnIndices.length;
    const worstTag = mesh.tags[warnIndices[0]!]!;
    const worstValue = angle[warnIndices[0]!]!;
    findings.push({
      severity: "warn",
      title: "Severely non-orthogonal cells",
      message: `${count} of ${total} cells (${pctOfTotal(count, total)}%) have a face-to-cell non-orthogonality angle of more than 70° (but below 90°) — checkMesh's own warning band. Worst: ${worstValue.toFixed(2)}° (tag ${worstTag}).`,
      why: "checkMesh calls this 'severely non-orthogonal'. The mesh still runs, but needs enough non-orthogonal correction; without it, these cells slow convergence or add visible error nearby.",
      fix: "Smooth the mesh in this region, or increase the solver's non-orthogonal corrector loops.",
      reference: REFERENCE,
    });
  }

  if (failIndices.length > 0) {
    const count = failIndices.length;
    const worstTag = mesh.tags[failIndices[0]!]!;
    const worstValue = angle[failIndices[0]!]!;
    findings.push({
      severity: "fail",
      title: "Non-orthogonality errors",
      message: `${count} of ${total} cells (${pctOfTotal(count, total)}%) have a face-to-cell non-orthogonality angle of 90° or more. Worst: ${worstValue.toFixed(2)}° (tag ${worstTag}).`,
      why: "checkMesh hard-fails here: the line between neighbouring cell centres no longer has a positive component along the shared face's normal, so flux reconstruction across that face breaks down.",
      fix: "Repair or regenerate the mesh in this region — this needs fixing, not just correcting around.",
      reference: REFERENCE,
    });
  }

  if (warnIndices.length === 0 && failIndices.length === 0) {
    findings.push({
      severity: "pass",
      title: "Face non-orthogonality",
      message: `All cells are below checkMesh's 70° non-orthogonality warning threshold (max ${max.toFixed(2)}°).`,
      why: "Non-orthogonality this far below the warning threshold means flux reconstruction across these faces should stay reliable without extra correction.",
      reference: REFERENCE,
    });
  }

  return { histogram, binEdges, min, max, mean, worst, findings };
}
