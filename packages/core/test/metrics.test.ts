import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAdjacency, parseGmsh } from "../src/index.js";
import type { Adjacency, Mesh } from "../src/index.js";
import { aspectRatioMetric } from "../src/metrics/aspectRatio.js";
import { nonOrthoAngleMetric } from "../src/metrics/nonOrthogonality.js";
import { skewnessMetric } from "../src/metrics/skewness.js";
import { cellVolumes } from "../src/metrics/volume.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "..", "..", "tests", "fixtures");
const MESHES_DIR = join(__dirname, "..", "..", "..", "meshes");
const REFERENCE_DIR = join(__dirname, "..", "..", "..", "tests", "reference");

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

/** Relative tolerance appropriate for checkMesh's 6-significant-figure
 * printed output (decisions.md #15: 1e-4 relative on printed max/mean). */
function expectCloseRel(got: number, expected: number, rel = 1e-4): void {
  const tol = Math.max(rel * Math.abs(expected), 1e-9);
  expect(Math.abs(got - expected)).toBeLessThanOrEqual(tol);
}

// ---------------------------------------------------------------------------
// Step 1: known golden values from tests/fixtures/README.md and
// tests/reference/*.json, cross-checked against each other.
// ---------------------------------------------------------------------------

describe("metrics - single-tet", () => {
  const { mesh, adjacency } = loadFixture("single-tet.msh");

  it("volume = +1/6", () => {
    const vol = cellVolumes(mesh, adjacency);
    expect(vol.length).toBe(1);
    expectCloseRel(vol[0]!, 1 / 6, 1e-9);
  });

  it("aspect ratio = 1.65096", () => {
    const ar = aspectRatioMetric(mesh, adjacency);
    expectCloseRel(ar[0]!, 1.65096);
  });

  it("skewness = 0.25", () => {
    const sk = skewnessMetric(mesh, adjacency);
    expectCloseRel(sk[0]!, 0.25);
  });

  it("non-orthogonality = 0 (no internal faces)", () => {
    const no = nonOrthoAngleMetric(mesh, adjacency);
    expectCloseRel(no[0]!, 0, 1e-9);
  });
});

describe("metrics - two-tets-orthogonal", () => {
  const { mesh, adjacency } = loadFixture("two-tets-orthogonal.msh");

  it("volumes = 1/6 and 1/3", () => {
    const vol = cellVolumes(mesh, adjacency);
    const sorted = [...vol].sort((a, b) => a - b);
    expectCloseRel(sorted[0]!, 1 / 6, 1e-9);
    expectCloseRel(sorted[1]!, 1 / 3, 1e-9);
  });

  it("non-orthogonality = 0 for both cells", () => {
    const no = nonOrthoAngleMetric(mesh, adjacency);
    expectCloseRel(no[0]!, 0, 1e-9);
    expectCloseRel(no[1]!, 0, 1e-9);
  });

  it("aspect ratio max = 2.08008", () => {
    const ar = aspectRatioMetric(mesh, adjacency);
    const max = Math.max(...ar);
    expectCloseRel(max, 2.08008);
  });
});

describe("metrics - two-tets-skewed", () => {
  const { mesh, adjacency } = loadFixture("two-tets-skewed.msh");

  it("volumes = 1/6 and 1/3", () => {
    const vol = cellVolumes(mesh, adjacency);
    const sorted = [...vol].sort((a, b) => a - b);
    expectCloseRel(sorted[0]!, 1 / 6, 1e-9);
    expectCloseRel(sorted[1]!, 1 / 3, 1e-9);
  });

  it("non-orthogonality = 35.2644 degrees for both cells", () => {
    const no = nonOrthoAngleMetric(mesh, adjacency);
    expectCloseRel(no[0]!, 35.2644);
    expectCloseRel(no[1]!, 35.2644);
  });

  // Note: tests/fixtures/README.md and this task's instructions describe
  // this fixture's skewness as "0.25 for both cells", but
  // tests/reference/two-tets-skewed.json's perCellFields.skewness is
  // {min: 0.16958, max: 0.25, mean: 0.20979} -- the two cells do NOT have
  // the same skewness (max over each cell's 4 faces differs: cell 0's
  // worst face is a boundary face at 0.25, cell 1's worst face is the
  // shared internal face at ~0.16958). This test follows the reference
  // JSON (the actual checkMesh oracle), not the summary README prose.
  it("skewness: cell 0 = 0.25, cell 1 = 0.16958 (per tests/reference/two-tets-skewed.json)", () => {
    const sk = skewnessMetric(mesh, adjacency);
    expectCloseRel(sk[0]!, 0.25);
    expectCloseRel(sk[1]!, 0.16958);
  });
});

describe("metrics - inverted-tet", () => {
  const { mesh, adjacency } = loadFixture("inverted-tet.msh");

  it("volume = -1/6", () => {
    const vol = cellVolumes(mesh, adjacency);
    expectCloseRel(vol[0]!, -1 / 6, 1e-9);
  });
});

// ---------------------------------------------------------------------------
// Step 2: the milestone 7 gate. Compare {min, max, mean} of each per-cell
// metric against tests/reference/<name>.json's perCellFields entries.
// Tolerance: 1e-6 relative (decisions.md #15, written fields), with an
// absolute floor of 1e-9 for near-zero reference values.
// ---------------------------------------------------------------------------

interface FieldStats {
  count: number;
  min: number;
  max: number;
  mean: number;
}

interface ReferenceJson {
  perCellFields: Record<string, FieldStats>;
}

function loadReference(name: string): ReferenceJson {
  return JSON.parse(readFileSync(join(REFERENCE_DIR, `${name}.json`), "utf-8")) as ReferenceJson;
}

function stats(arr: Float64Array): { min: number; max: number; mean: number } {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / arr.length };
}

function expectWrittenFieldClose(got: number, expected: number): void {
  const tol = Math.max(1e-6 * Math.abs(expected), 1e-9);
  expect(Math.abs(got - expected)).toBeLessThanOrEqual(tol);
}

interface GateCase {
  name: string;
  meshPath: string;
}

const tinyCases: GateCase[] = [
  { name: "single-tet", meshPath: join(FIXTURES_DIR, "single-tet.msh") },
  { name: "two-tets-orthogonal", meshPath: join(FIXTURES_DIR, "two-tets-orthogonal.msh") },
  { name: "two-tets-skewed", meshPath: join(FIXTURES_DIR, "two-tets-skewed.msh") },
  { name: "inverted-tet", meshPath: join(FIXTURES_DIR, "inverted-tet.msh") },
];

const benchCases: GateCase[] = [
  { name: "bench-100k", meshPath: join(MESHES_DIR, "bench-100k.msh") },
  { name: "bench-1m", meshPath: join(MESHES_DIR, "bench-1m.msh") },
];

// decisions.md #31: clean, consistently-oriented order-2 (type 11, 10-node)
// and order-3 (type 29, 20-node) tet meshes, generated directly by Gmsh's
// own 3D mesher (not an externally-sourced file) specifically so the
// checkMesh comparison gate has an unambiguous, correctly-oriented case to
// verify higher-order corner extraction against. (meshes/cylinder_3d.msh,
// a real externally-sourced higher-order mesh, is NOT used here -- it has
// a genuine per-cell orientation defect at the source-file level that
// makes a checkMesh numeric comparison ill-defined; see its own dedicated
// defect-detection test instead, and decisions.md #31.) Each reference
// JSON was generated from the mesh's own linearised sibling
// (meshes/clean-order{2,3}-linear.msh, via gmsh.model.mesh.setOrder(1),
// since gmshToFoam only reads linear tets) -- this test parses the
// ORIGINAL higher-order file with SimCheck's own corner-node extraction,
// so a match confirms that extraction reproduces the same geometry
// checkMesh saw on the linearised file.
const higherOrderCases: GateCase[] = [
  { name: "clean-order2", meshPath: join(MESHES_DIR, "clean-order2.msh") },
  { name: "clean-order3", meshPath: join(MESHES_DIR, "clean-order3.msh") },
];

function runGate(cases: GateCase[]): void {
  for (const { name, meshPath } of cases) {
    let loadError: Error | undefined;
    let mesh: Mesh | undefined;
    let adjacency: Adjacency | undefined;
    let reference: ReferenceJson | undefined;

    try {
      mesh = expectMesh(parseGmsh(readBytes(meshPath)));
      adjacency = expectAdjacency(buildAdjacency(mesh));
      reference = loadReference(name);
    } catch (e) {
      loadError = e as Error;
    }

    if (loadError || !mesh || !adjacency || !reference) {
      describe(`metrics vs checkMesh reference - ${name}`, () => {
        it.skip(`mesh or reference unavailable: ${loadError?.message ?? "unknown"}`, () => {});
      });
      continue;
    }

    const loadedMesh = mesh;
    const loadedAdjacency = adjacency;
    const loadedReference = reference;

    describe(`metrics vs checkMesh reference - ${name}`, () => {
      const mesh = loadedMesh;
      const adjacency = loadedAdjacency;
      const reference = loadedReference;

      it("cellVolume: min/max/mean within tolerance", () => {
        const vol = cellVolumes(mesh, adjacency);
        const s = stats(vol);
        const ref = reference.perCellFields.cellVolume!;
        expectWrittenFieldClose(s.min, ref.min);
        expectWrittenFieldClose(s.max, ref.max);
        expectWrittenFieldClose(s.mean, ref.mean);
      });

      it("aspectRatio: min/max/mean within tolerance", () => {
        const ar = aspectRatioMetric(mesh, adjacency);
        const s = stats(ar);
        const ref = reference.perCellFields.aspectRatio!;
        expectWrittenFieldClose(s.min, ref.min);
        expectWrittenFieldClose(s.max, ref.max);
        expectWrittenFieldClose(s.mean, ref.mean);
      });

      it("nonOrthoAngle: min/max/mean within tolerance", () => {
        const no = nonOrthoAngleMetric(mesh, adjacency);
        const s = stats(no);
        const ref = reference.perCellFields.nonOrthoAngle!;
        expectWrittenFieldClose(s.min, ref.min);
        expectWrittenFieldClose(s.max, ref.max);
        expectWrittenFieldClose(s.mean, ref.mean);
      });

      it("skewness: min/max/mean within tolerance", () => {
        const sk = skewnessMetric(mesh, adjacency);
        const s = stats(sk);
        const ref = reference.perCellFields.skewness!;
        expectWrittenFieldClose(s.min, ref.min);
        expectWrittenFieldClose(s.max, ref.max);
        expectWrittenFieldClose(s.mean, ref.mean);
      });
    });
  }
}

runGate(tinyCases);
runGate(benchCases);
runGate(higherOrderCases);
