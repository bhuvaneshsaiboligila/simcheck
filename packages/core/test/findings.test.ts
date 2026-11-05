import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aspectRatioFindings } from "../src/checks/mesh/aspectRatio.js";
import { elementOrderFindings } from "../src/checks/mesh/elementOrder.js";
import { nonOrthogonalityFindings } from "../src/checks/mesh/nonOrthogonality.js";
import { skewnessFindings } from "../src/checks/mesh/skewness.js";
import { volumeFindings } from "../src/checks/mesh/volume.js";
import { buildAdjacency, cellVolumes, parseGmsh } from "../src/index.js";
import type { Adjacency, Mesh } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "..", "..", "tests", "fixtures");
const MESHES_DIR = join(__dirname, "..", "..", "..", "meshes");

function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function expectMesh(result: ReturnType<typeof parseGmsh>): Mesh {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok result: " + JSON.stringify(result));
  return result.value;
}

function expectAdjacency(result: ReturnType<typeof buildAdjacency>): Adjacency {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok result: " + JSON.stringify(result));
  return result.value;
}

function loadFixture(name: string): { mesh: Mesh; adjacency: Adjacency } {
  const mesh = expectMesh(parseGmsh(readBytes(join(FIXTURES_DIR, name))));
  const adjacency = expectAdjacency(buildAdjacency(mesh));
  return { mesh, adjacency };
}

// ---------------------------------------------------------------------------
// Clean fixtures: single-tet and two-tets-orthogonal have no cell failing
// any of the 4 metrics (confirmed from tests/fixtures/README.md and
// tests/reference/*.json's perCellFields: aspect ratio max 2.08 << 1000,
// skewness max 0.25 << 4, non-ortho max 0° << 70°, volume all positive).
// ---------------------------------------------------------------------------

describe("findings - clean fixtures", () => {
  for (const name of ["single-tet.msh", "two-tets-orthogonal.msh"]) {
    describe(name, () => {
      const { mesh, adjacency } = loadFixture(name);

      it("volume: exactly 1 pass finding, empty worst list", () => {
        const r = volumeFindings(mesh, adjacency);
        expect(r.findings).toHaveLength(1);
        expect(r.findings[0]!.severity).toBe("pass");
        expect(r.worst).toHaveLength(0);
        expect(r.histogram).toBeUndefined();
        expect(r.binEdges).toBeUndefined();
      });

      it("aspect ratio: exactly 1 pass finding, empty worst list", () => {
        const r = aspectRatioFindings(mesh, adjacency);
        expect(r.findings).toHaveLength(1);
        expect(r.findings[0]!.severity).toBe("pass");
        expect(r.worst).toHaveLength(0);
      });

      it("skewness: exactly 1 pass finding, empty worst list", () => {
        const r = skewnessFindings(mesh, adjacency);
        expect(r.findings).toHaveLength(1);
        expect(r.findings[0]!.severity).toBe("pass");
        expect(r.worst).toHaveLength(0);
      });

      it("non-orthogonality: exactly 1 pass finding, empty worst list", () => {
        const r = nonOrthogonalityFindings(mesh, adjacency);
        expect(r.findings).toHaveLength(1);
        expect(r.findings[0]!.severity).toBe("pass");
        expect(r.worst).toHaveLength(0);
      });
    });
  }

  it("two-tets-skewed: non-orthogonality (35.2644°) is still below the 70° warn band -> 1 pass finding", () => {
    const { mesh, adjacency } = loadFixture("two-tets-skewed.msh");
    const r = nonOrthogonalityFindings(mesh, adjacency);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// inverted-tet.msh: the one cell has volume -1/6, triggering the volume
// fail finding.
// ---------------------------------------------------------------------------

describe("findings - inverted-tet", () => {
  const { mesh, adjacency } = loadFixture("inverted-tet.msh");

  it("volume: 1 fail finding, worst cell is the inverted cell's own tag", () => {
    const r = volumeFindings(mesh, adjacency);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe("fail");
    expect(r.findings[0]!.message).toContain("1 of 1 cells (100.0%)");
    expect(r.worst).toHaveLength(1);
    expect(r.worst[0]!.tag).toBe(mesh.tags[0]);
    expect(r.worst[0]!.value).toBeCloseTo(-1 / 6, 9);
  });
});

// ---------------------------------------------------------------------------
// Hand-built 3-tet mesh for the non-orthogonality warn/fail tier split.
// Tet A: nodes 0,1,2,3 = (0,0,0),(1,0,0),(0,1,0),(0,0,1), centroid (.25,.25,.25).
// Tet B shares face {1,2,3} with A, apex node 4 = (1,1,-1.9): the shared
// face's outward normal (from A) is along (1,1,1); the owner->neighbour
// centroid vector works out to (x/4,y/4,z/4) for apex (x,y,z) (algebraic
// identity -- see derivation in findings.test.ts history), giving an angle
// of ~88.6° between (1,1,-1.9) and (1,1,1): inside the 70-90 warn band.
// Tet C shares face {0,1,2} with A, apex node 5 = (3,0,2): that face's
// outward normal (from A) is along (0,0,-1), giving an angle of ~108.4°
// between the owner->neighbour vector and the face normal: past the 90°
// fail threshold.
// Tet A's own per-cell value is the max over its two internal faces
// (~88.6°, ~108.4°), so it lands in the fail tier too, alongside tet C;
// tet B alone lands in the warn tier -- this is the "a cell counts in at
// most one tier" case from decisions.md #29, exercised across 3 cells.
// ---------------------------------------------------------------------------

function warnFailMesh(): Mesh {
  const coords = new Float64Array([
    0, 0, 0, // 0
    1, 0, 0, // 1
    0, 1, 0, // 2
    0, 0, 1, // 3
    1, 1, -1.9, // 4 (tet B apex -> warn-tier angle on face {1,2,3})
    3, 0, 2, // 5 (tet C apex -> fail-tier angle on face {0,1,2})
  ]);
  const conn = new Int32Array([
    0, 1, 2, 3, // tet A (tag 1)
    1, 4, 2, 3, // tet B (tag 2)
    0, 1, 2, 5, // tet C (tag 3)
  ]);
  return {
    coords,
    conn,
    tags: new Int32Array([1, 2, 3]),
    physical: new Int32Array([1, 1, 1]),
    cellNodeCount: new Int32Array([4, 4, 4]),
  };
}

describe("findings - non-orthogonality warn/fail tier split", () => {
  const mesh = warnFailMesh();
  const adjacency = expectAdjacency(buildAdjacency(mesh));

  it("builds the expected adjacency (2 internal faces, 10 total)", () => {
    expect(adjacency.internalCount).toBe(2);
    expect(adjacency.faceCount).toBe(10);
  });

  it("tet B's angle is in the 70-90 warn band; tets A and C are >= 90", () => {
    const r = nonOrthogonalityFindings(mesh, adjacency);
    // 2 findings: warn tier (tet B only) and fail tier (tets A and C).
    expect(r.findings).toHaveLength(2);
    expect(r.findings[0]!.severity).toBe("warn");
    expect(r.findings[0]!.message).toContain("1 of 3 cells");
    expect(r.findings[1]!.severity).toBe("fail");
    expect(r.findings[1]!.message).toContain("2 of 3 cells");
  });

  it("worst-cell list: only the 3 offending cells, sorted descending by angle", () => {
    const r = nonOrthogonalityFindings(mesh, adjacency);
    expect(r.worst).toHaveLength(3);
    for (let i = 1; i < r.worst.length; i++) {
      expect(r.worst[i - 1]!.value).toBeGreaterThanOrEqual(r.worst[i]!.value);
    }
    // The last (smallest) entry is tet B, in the warn band.
    const smallest = r.worst[r.worst.length - 1]!;
    expect(smallest.tag).toBe(2);
    expect(smallest.value).toBeGreaterThan(70);
    expect(smallest.value).toBeLessThan(90);
    // The other two (tet A and tet C) are both >= 90, tied at the same angle.
    expect(r.worst[0]!.value).toBeGreaterThanOrEqual(90);
    expect(r.worst[1]!.value).toBeGreaterThanOrEqual(90);
    expect(new Set([r.worst[0]!.tag, r.worst[1]!.tag])).toEqual(new Set([1, 3]));
  });
});

// ---------------------------------------------------------------------------
// Degenerate histogram ranges: single-tet.msh has exactly 1 cell, so every
// metric's min === max. Confirm the aspect ratio (log, multiplicative
// epsilon) and non-orthogonality (linear, additive epsilon; this fixture's
// non-ortho max is 0, the degenerate case decisions.md #29 anticipates)
// histograms stay strictly monotonic with no NaN/Infinity.
// ---------------------------------------------------------------------------

describe("findings - degenerate histogram ranges (single-tet)", () => {
  const { mesh, adjacency } = loadFixture("single-tet.msh");

  it("aspect ratio: 21 strictly increasing, finite bin edges", () => {
    const r = aspectRatioFindings(mesh, adjacency);
    expect(r.binEdges).toBeDefined();
    const edges = r.binEdges!;
    expect(edges).toHaveLength(21);
    for (const e of edges) {
      expect(Number.isFinite(e)).toBe(true);
    }
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]!).toBeGreaterThan(edges[i - 1]!);
    }
    expect(r.histogram).toBeDefined();
    expect(r.histogram!.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("non-orthogonality: degenerate max=0 is floored to 1e-9, finite monotonic edges", () => {
    const r = nonOrthogonalityFindings(mesh, adjacency);
    expect(r.max).toBe(0);
    const edges = r.binEdges!;
    expect(edges).toHaveLength(21);
    for (const e of edges) {
      expect(Number.isFinite(e)).toBe(true);
      expect(Number.isNaN(e)).toBe(false);
    }
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]!).toBeGreaterThan(edges[i - 1]!);
    }
    expect(edges[0]).toBe(0);
    expect(edges[20]).toBeCloseTo(1e-9, 15);
    expect(r.histogram!.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("findings - higher-order tet disclosure", () => {
  it("a purely linear mesh gets no finding", () => {
    const mesh = expectMesh(parseGmsh(readBytes(join(FIXTURES_DIR, "single-tet.msh"))));
    expect(elementOrderFindings(mesh)).toEqual([]);
  });

  it("a mesh with order-3 (20-node) tets gets exactly one pass-severity disclosure", () => {
    const mesh = expectMesh(parseGmsh(readBytes(join(FIXTURES_DIR, "higher-order-tet20.msh"))));
    const findings = elementOrderFindings(mesh);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("pass");
    expect(findings[0]!.message).toBe(
      "Higher-order tets (20 nodes): metrics use the 4 corner nodes, i.e. the straight-sided cell a finite-volume solver sees; curvature is not checked.",
    );
  });

  it("a mesh with order-2 (10-node) tets reports 10 nodes", () => {
    const mesh = expectMesh(parseGmsh(readBytes(join(FIXTURES_DIR, "higher-order-tet10.msh"))));
    const findings = elementOrderFindings(mesh);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("10 nodes");
  });

  it("mixed orders report each distinct node count", () => {
    const mesh: Mesh = {
      coords: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      conn: new Int32Array([0, 1, 2, 3]),
      tags: new Int32Array([1]),
      physical: new Int32Array([1]),
      cellNodeCount: new Int32Array([10]),
    };
    expect(elementOrderFindings(mesh)[0]!.message).toContain("10 nodes");

    const mixed: Mesh = {
      ...mesh,
      cellNodeCount: new Int32Array([10, 20]),
    };
    expect(elementOrderFindings(mixed)[0]!.message).toContain("10, 20 nodes each");
  });
});

describe("findings - cylinder_3d.msh defect detection (decisions.md #31)", () => {
  // meshes/cylinder_3d.msh is a real, externally-sourced higher-order
  // (type 29) tet mesh with a genuine per-cell orientation defect baked
  // into the source file itself (every even-indexed element has negative
  // signed corner volume, every odd-indexed element positive -- confirmed
  // by hand against the raw file, not a parsing or metric bug). checkMesh
  // and SimCheck resolve this orientation ambiguity differently (gmshToFoam
  // reads tets with no orientation correction, but OpenFOAM's own
  // downstream face/cell construction evidently disagrees with Gmsh's
  // convention for a different subset of cells), so this mesh is used ONLY
  // as a defect-detection smoke test -- NOT compared against checkMesh
  // numerically (see decisions.md #31 and the higher-order checkMesh gate
  // in metrics.test.ts, which uses clean-order2/3.msh instead).
  //
  // Gitignored (meshes/**/*.msh), so this test skips gracefully if absent,
  // same pattern as the bench-100k/1m benchmark meshes.
  const meshPath = join(MESHES_DIR, "cylinder_3d.msh");
  const available = existsSync(meshPath);

  (available ? it : it.skip)(
    "flags exactly the 4896 even-indexed cells as negative-volume, in a perfect alternating pattern",
    () => {
      const mesh = expectMesh(parseGmsh(readBytes(meshPath)));
      const adjacency = expectAdjacency(buildAdjacency(mesh));
      const vol = cellVolumes(mesh, adjacency);

      expect(vol.length).toBe(9792);

      let negCount = 0;
      let sumAbs = 0;
      for (let i = 0; i < vol.length; i++) {
        const v = vol[i]!;
        sumAbs += Math.abs(v);
        const isNeg = v < 0;
        // Perfect alternating pattern by element index parity.
        expect(isNeg).toBe(i % 2 === 0);
        if (isNeg) negCount++;
      }

      expect(negCount).toBe(4896);
      expect(sumAbs).toBeCloseTo(0.41615, 4);

      const result = volumeFindings(mesh, adjacency);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.severity).toBe("fail");
      expect(result.findings[0]!.message).toContain("4896 of 9792 cells");
    },
  );
});
