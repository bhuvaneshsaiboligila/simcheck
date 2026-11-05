// Aspect ratio findings (PLAN.md §6, milestone 8). checkMesh's own tier
// structure mirrored exactly, per decisions.md #29: 1 Finding only (fail if
// any cell exceeds the 1000 threshold, else pass). Histogram: 20 log-spaced
// bins (decisions.md #17).
//
// decisions.md #32: aspectRatioMetric() itself is left untouched (still
// matches checkMesh exactly, sentinel values included -- see
// metrics/aspectRatio.ts's own comment on `v = max(ROOTVSMALL, vol)`), but
// an inverted (vol <= 0) cell's aspect ratio is a checkMesh-matching
// SENTINEL, not a real measurement (surfacePart's denominator collapses to
// ROOTVSMALL, giving ~1e+98-scale values for an ordinary unit-scale mesh).
// That defect is already Volume's job to report; counting the same cell a
// second time here (and letting its sentinel value dominate the histogram
// and min/max/mean) would be noise, not a second real defect. So this
// findings layer excludes inverted cells from the THRESHOLD count, the
// worst-cell list, the histogram, and the min/max/mean stats -- but keeps
// a note disclosing exactly how many cells were excluded and why, so the
// exclusion is visible, not silent.
//
// Checked (not just assumed) whether non-orthogonality and skewness need
// the same treatment: neither does. nonOrthoAngle is `acos(clamp(x,-1,1))`,
// mathematically bounded to [0°,180°] regardless of orientation -- no
// division by volume, no sentinel mechanism. skewness's formula has no
// volume term either (confirmed against metrics/skewness.ts and
// docs/thresholds.md's quoted source); both were also checked empirically
// against meshes/cylinder_3d.msh (thousands of genuinely inverted cells)
// and stayed in ordinary ranges (nonOrtho 2-177°, skewness 0.02-1.1), no
// sentinel-scale values appeared.

import type { Adjacency } from "../../geometry/adjacency.js";
import { aspectRatioMetric } from "../../metrics/aspectRatio.js";
import { cellCentroids } from "../../metrics/geometry.js";
import { cellVolumes } from "../../metrics/volume.js";
import type { Finding, MetricResult, Mesh } from "../../types.js";
import { basicStats, buildWorst, logBinned, pctOfTotal } from "./shared.js";

const THRESHOLD = 1000;
const REFERENCE =
  "OpenFOAM v2512 primitiveMeshCheck.C:40, primitiveMeshTools::cellClosedness() (docs/thresholds.md 'Aspect ratio')";

export function aspectRatioFindings(mesh: Mesh, adjacency: Adjacency): MetricResult {
  const ar = aspectRatioMetric(mesh, adjacency);
  const vol = cellVolumes(mesh, adjacency);
  const total = ar.length;
  const centroids = cellCentroids(mesh);

  let invertedCount = 0;
  for (let t = 0; t < total; t++) {
    if (vol[t]! <= 0) invertedCount++;
  }
  const validCount = total - invertedCount;

  const validValues = new Float64Array(validCount);
  {
    let w = 0;
    for (let t = 0; t < total; t++) {
      if (vol[t]! > 0) validValues[w++] = ar[t]!;
    }
  }

  const badIndices: number[] = [];
  for (let t = 0; t < total; t++) {
    if (vol[t]! > 0 && ar[t]! > THRESHOLD) badIndices.push(t);
  }
  // Descending: worst (highest) first.
  badIndices.sort((a, b) => ar[b]! - ar[a]!);

  const worst = buildWorst(mesh, ar, centroids, badIndices);
  const count = badIndices.length;

  const findings: Finding[] = [];

  if (validCount === 0) {
    // Every cell is inverted -- nothing left to measure an aspect ratio
    // against. Volume's own finding already reports all of them.
    findings.push({
      severity: "info",
      title: "Cell aspect ratio",
      message: `No cells to check: all ${total} cells are inverted — see Volume.`,
      why: "Aspect ratio is only meaningful for a cell with positive volume.",
      reference: REFERENCE,
    });
  } else if (count > 0) {
    const worstTag = mesh.tags[badIndices[0]!]!;
    const worstValue = ar[badIndices[0]!]!;
    findings.push({
      severity: "fail",
      title: "High aspect ratio cells",
      message: `${count} of ${validCount} cells (${pctOfTotal(count, validCount)}%) have aspect ratio over checkMesh's 1000 threshold. Worst: ${worstValue.toPrecision(4)} (tag ${worstTag}).`,
      why: "checkMesh hard-fails a mesh at this threshold: cells this elongated or flattened make gradient reconstruction and pressure-velocity coupling unreliable, and solvers commonly warn or diverge near them.",
      fix: "Refine or re-smooth the mesh where these cells are (see the worst-cell table) — this is usually a sign cell size changes too fast between regions.",
      reference: REFERENCE,
    });
  } else {
    const { max } = basicStats(validValues);
    findings.push({
      severity: "pass",
      title: "Cell aspect ratio",
      message: `All ${validCount} cells have aspect ratio below checkMesh's 1000 threshold (max ${max.toPrecision(4)}).`,
      why: "Aspect ratios this far below the threshold mean gradient reconstruction and pressure-velocity coupling across these cells should stay reliable.",
      reference: REFERENCE,
    });
  }

  if (invertedCount > 0) {
    findings.push({
      severity: "info",
      title: "Inverted cells excluded",
      message: `${invertedCount} inverted cells excluded — see Volume.`,
      why: "An inverted cell's aspect ratio is checkMesh's own sentinel value (its formula divides by volume, so a non-positive volume gives a huge, physically meaningless number), not a second real defect — Volume already reports these cells.",
      reference: REFERENCE,
    });
  }

  const { min, max, mean } = validCount > 0 ? basicStats(validValues) : { min: 0, max: 0, mean: 0 };
  const { histogram, binEdges } =
    validCount > 0 ? logBinned(validValues) : { histogram: new Uint32Array(20), binEdges: new Float64Array(21) };

  return { histogram, binEdges, min, max, mean, worst, findings };
}
