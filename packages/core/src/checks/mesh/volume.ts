// Volume findings (PLAN.md §6, milestone 8). checkMesh's own tier structure
// mirrored exactly, per decisions.md #29: 1 Finding only (fail if any cell
// has volume <= 0, else pass). No histogram -- not called for in PLAN.md §6,
// and raw cell volume mixes deliberate boundary-layer grading with real
// defects, unlike the other three metrics.
//
// decisions.md #36: if every inverted cell's |volume| matches a valid
// face-neighbour's volume closely, that's a strong sign the mesh is
// geometrically fine and just has those specific cells' corner order
// reversed (a one-line connectivity fix), not genuinely tangled/degenerate
// geometry (which would need re-meshing). Checked, not assumed: confirmed
// against meshes/cylinder_3d.msh, where every one of its ~4896 inverted
// cells matches a valid neighbour's volume within 2.9e-5 relative.

import type { Adjacency } from "../../geometry/adjacency.js";
import { cellCentroids, cellFaces } from "../../metrics/geometry.js";
import { cellVolumes } from "../../metrics/volume.js";
import type { Finding, MetricResult, Mesh } from "../../types.js";
import { basicStats, buildWorst, pctOfTotal } from "./shared.js";

const REFERENCE = "OpenFOAM v2512 primitiveMeshCheck.C checkCellVolumes() (docs/thresholds.md 'Volume')";

// Relative tolerance for "the same size as a neighbour" -- generous above
// the ~1e-5 relative noise observed empirically on a real mesh (ordinary
// floating-point/mesh-generation precision), but still tight enough that a
// match means "this is geometrically the same cell", not coincidence.
const SIZE_MATCH_TOLERANCE = 1e-3;

/**
 * True only if EVERY cell in `badIndices` (volume <= 0) has at least one
 * face-adjacent valid (volume > 0) neighbour whose volume matches its own
 * |volume| within `SIZE_MATCH_TOLERANCE` -- the signature of a cell whose
 * corner order is simply reversed, not one that's genuinely degenerate or
 * tangled (which would not have a same-sized neighbour by coincidence). A
 * cell with volume exactly 0 can never match a nonzero neighbour, so a
 * truly collapsed cell correctly fails this check rather than being lumped
 * in with reversed ones.
 */
function looksLikePureReversal(adjacency: Adjacency, vol: Float64Array, badIndices: number[]): boolean {
  if (badIndices.length === 0) return false;
  const numTets = vol.length;
  const faces = cellFaces(numTets, adjacency);

  for (const t of badIndices) {
    const magnitude = Math.abs(vol[t]!);
    let matched = false;
    for (let k = 0; k < 4; k++) {
      const f = faces[t * 4 + k]!;
      const owner = adjacency.owner[f]!;
      const neighbour = adjacency.neighbour[f]!;
      const other = owner === t ? neighbour : owner;
      if (other < 0) continue; // boundary face, no neighbour to compare against
      const otherVol = vol[other]!;
      if (otherVol <= 0) continue; // only a VALID neighbour counts as a size reference
      const rel = Math.abs(magnitude - otherVol) / otherVol;
      if (rel <= SIZE_MATCH_TOLERANCE) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

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
    const pureReversal = looksLikePureReversal(adjacency, vol, badIndices);
    const fix = pureReversal
      ? "Every inverted cell is the same size as a neighbouring valid cell — this looks like pure node-order reversal (the nodes are just listed in the wrong order), not mesh tangling, so reversing the connectivity of only these cells should fix it without re-meshing. See the worst-cell table for which ones."
      : "Repair or regenerate the mesh around the cells in the worst-cell table; look for reversed elements or duplicate/collapsed nodes.";
    findings.push({
      severity: "fail",
      title: "Negative or zero-volume cells",
      message: `${count} of ${total} cells (${pctOfTotal(count, total)}%) have volume ≤ 0. Worst: ${worstVol.toPrecision(4)} (tag ${worstTag}).`,
      why: "A cell with non-positive volume is inverted or degenerate — its nodes are listed in the wrong order or lie on (or past) a plane. Face areas and gradients computed from it are meaningless, and OpenFOAM, Fluent and SU2 will all refuse to run or silently misbehave near it.",
      fix,
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
