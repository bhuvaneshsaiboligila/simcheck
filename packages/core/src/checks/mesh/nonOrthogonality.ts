// Non-orthogonality findings (PLAN.md §6, milestone 8). checkMesh's own
// two-tier structure mirrored exactly, per decisions.md #29: warn tier
// (70°-90°) and fail tier (>=90°), each on the per-cell `maxFaceToCell`-
// reduced angle computed by metrics/nonOrthogonality.ts. A cell counts in
// at most one tier: fail is checked first, so a cell at >=90° is never also
// counted in the warn tier. Emits 1 Finding per populated tier, or 1 pass
// Finding if neither tier is populated. Histogram: 20 linear bins from 0 to
// the data's own max.
//
// decisions.md #34: a face's area vector `S` is taken from its owner's
// winding (metrics/geometry.ts's `faceAreaVectors`). If the owner -- or,
// for an internal face, the neighbour -- is inverted (volume <= 0), that
// cell's corner order is flipped relative to its true orientation, so the
// face's reported angle is close to the WRONG (complementary) value, not
// just imprecise -- unlike aspect ratio (decisions.md #32), this isn't a
// bounded-but-sentinel value, it's a plausible-looking but incorrect one,
// which is worse to leave in silently. So this findings layer excludes any
// face touching an inverted cell (not just inverted cells themselves) from
// the per-cell max-reduction, the tier counts, the histogram, min/max/mean,
// and the worst-cell list -- a cell with at least one clean face is still
// assessed using only that subset; a cell with none is excluded entirely.
// `nonOrthoAngleMetric` itself stays untouched (still matches checkMesh's
// own contaminated value exactly, since checkMesh reads the same raw tet
// orientation with no correction -- confirmed in decisions.md #31).

import type { Adjacency } from "../../geometry/adjacency.js";
import { cellCentroids, cellFaces } from "../../metrics/geometry.js";
import { faceOrthoAngles } from "../../metrics/nonOrthogonality.js";
import { cellVolumes } from "../../metrics/volume.js";
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
  const numTets = mesh.conn.length / 4;
  const vol = cellVolumes(mesh, adjacency);
  const faceAngleDeg = faceOrthoAngles(mesh, adjacency);
  const faces = cellFaces(numTets, adjacency);
  const centroids = cellCentroids(mesh);

  // A face is clean only if every cell it touches has positive volume.
  let excludedFaceCount = 0;
  const faceClean = new Uint8Array(adjacency.faceCount);
  for (let f = 0; f < adjacency.faceCount; f++) {
    const owner = adjacency.owner[f]!;
    const neighbour = adjacency.neighbour[f]!;
    const clean = vol[owner]! > 0 && (neighbour < 0 || vol[neighbour]! > 0);
    faceClean[f] = clean ? 1 : 0;
    if (!clean) excludedFaceCount++;
  }

  // Per-cell max over CLEAN faces only; a cell with zero clean faces has
  // nothing assessable and is excluded entirely (not even counted as pass).
  const angle = new Float64Array(numTets);
  const assessable = new Uint8Array(numTets);
  for (let t = 0; t < numTets; t++) {
    let maxAngle = -1;
    for (let k = 0; k < 4; k++) {
      const f = faces[t * 4 + k]!;
      if (!faceClean[f]!) continue;
      const a = faceAngleDeg[f]!;
      if (a > maxAngle) maxAngle = a;
    }
    if (maxAngle >= 0) {
      angle[t] = maxAngle;
      assessable[t] = 1;
    }
  }

  let assessableCount = 0;
  for (let t = 0; t < numTets; t++) if (assessable[t]!) assessableCount++;

  const findings: Finding[] = [];

  if (assessableCount === 0) {
    findings.push({
      severity: "info",
      title: "Face non-orthogonality",
      message: "Non-orthogonality can't be assessed until inverted cells are fixed.",
      why: "Every remaining face touches an inverted cell, whose flipped corner order makes its face normal point the wrong way — any angle computed from it would be close to the complementary (wrong) value, not just imprecise. See Volume for the inverted cells themselves.",
      reference: REFERENCE,
    });
    return {
      histogram: new Uint32Array(20),
      binEdges: new Float64Array(21),
      min: 0,
      max: 0,
      mean: 0,
      worst: [],
      findings,
    };
  }

  const validValues = new Float64Array(assessableCount);
  {
    let w = 0;
    for (let t = 0; t < numTets; t++) {
      if (assessable[t]!) validValues[w++] = angle[t]!;
    }
  }
  const { min, max, mean } = basicStats(validValues);
  const { histogram, binEdges } = linearBinnedFromZero(validValues);

  const warnIndices: number[] = [];
  const failIndices: number[] = [];
  for (let t = 0; t < numTets; t++) {
    if (!assessable[t]!) continue;
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

  if (warnIndices.length > 0) {
    const count = warnIndices.length;
    const worstTag = mesh.tags[warnIndices[0]!]!;
    const worstValue = angle[warnIndices[0]!]!;
    findings.push({
      severity: "warn",
      title: "Severely non-orthogonal cells",
      message: `${count} of ${assessableCount} cells (${pctOfTotal(count, assessableCount)}%) have a face-to-cell non-orthogonality angle of more than 70° (but below 90°) — checkMesh's own warning band. Worst: ${worstValue.toFixed(2)}° (tag ${worstTag}).`,
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
      message: `${count} of ${assessableCount} cells (${pctOfTotal(count, assessableCount)}%) have a face-to-cell non-orthogonality angle of 90° or more. Worst: ${worstValue.toFixed(2)}° (tag ${worstTag}).`,
      why: "checkMesh hard-fails here: the line between neighbouring cell centres no longer has a positive component along the shared face's normal, so flux reconstruction across that face breaks down.",
      fix: "Repair or regenerate the mesh in this region — this needs fixing, not just correcting around.",
      reference: REFERENCE,
    });
  }

  if (warnIndices.length === 0 && failIndices.length === 0) {
    findings.push({
      severity: "pass",
      title: "Face non-orthogonality",
      message: `All ${assessableCount} cells are below checkMesh's 70° non-orthogonality warning threshold (max ${max.toFixed(2)}°).`,
      why: "Non-orthogonality this far below the warning threshold means flux reconstruction across these faces should stay reliable without extra correction.",
      reference: REFERENCE,
    });
  }

  if (excludedFaceCount > 0) {
    findings.push({
      severity: "info",
      title: "Faces next to inverted cells excluded",
      message: `${excludedFaceCount} faces next to inverted cells excluded — see Volume.`,
      why: "A face touching an inverted cell has a flipped face normal, so its angle is close to the wrong (complementary) value, not a real measurement — Volume already reports the inverted cells themselves.",
      reference: REFERENCE,
    });
  }

  return { histogram, binEdges, min, max, mean, worst, findings };
}
