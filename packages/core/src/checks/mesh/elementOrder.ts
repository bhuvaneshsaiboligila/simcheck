// Higher-order tet disclosure (PLAN.md §6, milestone 8; decisions.md #31).
// Not a quality metric like volume/aspectRatio/nonOrthogonality/skewness --
// just an always-informative note when the mesh has any tet of order > 1,
// so a user isn't surprised that curved cells are checked on their straight
// corner-node approximation. Severity is "pass" (green badge), not a new
// Severity value -- same choice as decisions.md #24's flat-plate disclosure,
// to avoid widening Finding.severity for one disclosure note.

import type { Finding, Mesh } from "../../types.js";

const REFERENCE = "refs/gmsh/doc/texinfo/gmsh.texi 'Node ordering' (docs/decisions.md #31)";

/**
 * Returns a single disclosure Finding if `mesh` has any tet with more than
 * 4 nodes (order > 1), or an empty array for a purely-linear mesh (no
 * finding needed -- there is nothing to disclose).
 */
export function elementOrderFindings(mesh: Mesh): Finding[] {
  const counts = mesh.cellNodeCount;
  const distinctHigherOrder = new Set<number>();
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i]!;
    if (n > 4) distinctHigherOrder.add(n);
  }

  if (distinctHigherOrder.size === 0) return [];

  const sorted = Array.from(distinctHigherOrder).sort((a, b) => a - b);
  const label = sorted.length === 1 ? `${sorted[0]} nodes` : `${sorted.join(", ")} nodes each`;

  return [
    {
      severity: "pass",
      title: "Higher-order tets",
      message: `Higher-order tets (${label}): metrics use the 4 corner nodes, i.e. the straight-sided cell a finite-volume solver sees; curvature is not checked.`,
      why: "OpenFOAM, Fluent and SU2 all run on straight-sided (linear) cells internally, so this is the geometry that actually matters for mesh quality — but it means a curved cell that looks fine in Gmsh's higher-order view can still fail a quality check once linearised, and SimCheck can't warn about curvature itself.",
      reference: REFERENCE,
    },
  ];
}
