import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAdjacency, parseGmsh } from "../src/index.js";
import type { Adjacency, Mesh } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "..", "..", "tests", "fixtures");

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

function expectMesh(result: ReturnType<typeof parseGmsh>): Mesh {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok result");
  return result.value;
}

function expectAdjacency(result: ReturnType<typeof buildAdjacency>): Adjacency {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok result: " + JSON.stringify(result));
  return result.value;
}

/** Sorted triple of node indices for a face stored at `idx` in `adj.faceNodes`. */
function faceKey(adj: Adjacency, idx: number): [number, number, number] {
  const a = adj.faceNodes[idx * 3 + 0]!;
  const b = adj.faceNodes[idx * 3 + 1]!;
  const c = adj.faceNodes[idx * 3 + 2]!;
  return [a, b, c].sort((x, y) => x - y) as [number, number, number];
}

describe("buildAdjacency - single-tet", () => {
  it("4 faces, 0 internal, 4 boundary", () => {
    const mesh = expectMesh(parseGmsh(readFixture("single-tet.msh")));
    const adj = expectAdjacency(buildAdjacency(mesh));
    expect(adj.faceCount).toBe(4);
    expect(adj.internalCount).toBe(0);
    expect(adj.boundaryCount).toBe(4);
    for (let i = 0; i < adj.faceCount; i++) {
      expect(adj.owner[i]).toBe(0);
      expect(adj.neighbour[i]).toBe(-1);
    }
  });
});

describe("buildAdjacency - two-tets-orthogonal", () => {
  it("7 faces, 1 internal, 6 boundary", () => {
    const mesh = expectMesh(parseGmsh(readFixture("two-tets-orthogonal.msh")));
    const adj = expectAdjacency(buildAdjacency(mesh));
    expect(adj.faceCount).toBe(7);
    expect(adj.internalCount).toBe(1);
    expect(adj.boundaryCount).toBe(6);
  });

  it("the internal face is owned by tet 0 and neighboured by tet 1, with node indices {1,2,3}", () => {
    // conn = [0,1,2,3, 1,4,2,3] (see gmsh-parser.test.ts). Shared face is
    // the one both tets have: indices {1,2,3}, i.e. coords (1,0,0),
    // (0,1,0), (0,0,1).
    const mesh = expectMesh(parseGmsh(readFixture("two-tets-orthogonal.msh")));
    const adj = expectAdjacency(buildAdjacency(mesh));

    expect(adj.owner[0]).toBe(0);
    expect(adj.neighbour[0]).toBe(1);
    expect(faceKey(adj, 0)).toEqual([1, 2, 3]);
  });
});

describe("buildAdjacency - two-tets-skewed", () => {
  it("7 faces, 1 internal, 6 boundary", () => {
    const mesh = expectMesh(parseGmsh(readFixture("two-tets-skewed.msh")));
    const adj = expectAdjacency(buildAdjacency(mesh));
    expect(adj.faceCount).toBe(7);
    expect(adj.internalCount).toBe(1);
    expect(adj.boundaryCount).toBe(6);
    expect(adj.owner[0]).toBe(0);
    expect(adj.neighbour[0]).toBe(1);
  });
});

describe("buildAdjacency - inverted-tet", () => {
  it("builds fine regardless of volume sign: 4 faces, 0 internal, 4 boundary", () => {
    const mesh = expectMesh(parseGmsh(readFixture("inverted-tet.msh")));
    const adj = expectAdjacency(buildAdjacency(mesh));
    expect(adj.faceCount).toBe(4);
    expect(adj.internalCount).toBe(0);
    expect(adj.boundaryCount).toBe(4);
  });
});

/**
 * Hand-built mesh: two tets glued on face {1,2,3} and a third tet glued on
 * face {0,1,2} of the first tet, giving 2 internal faces among the total.
 * Nodes (0-based):
 *   0: (0,0,0) 1: (1,0,0) 2: (0,1,0) 3: (0,0,1) 4: (1,1,1) 5: (0,0,-1)
 * Tet A: 0,1,2,3   faces: {1,2,3} {0,2,3} {0,1,3} {0,1,2}
 * Tet B: 1,4,2,3   faces: {4,2,3} {1,2,3} {1,4,3} {1,4,2}   -- shares {1,2,3} with A
 * Tet C: 0,1,2,5   faces: {1,2,5} {0,2,5} {0,1,5} {0,1,2}   -- shares {0,1,2} with A
 * Total raw faces = 12, matched pairs = 2 -> internal = 2, boundary = 12 - 4 = 8.
 */
function threeTetMesh(order: number[]): Mesh {
  const coords = new Float64Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, -1,
  ]);
  const tets: [number, number, number, number][] = [
    [0, 1, 2, 3],
    [1, 4, 2, 3],
    [0, 1, 2, 5],
  ];
  const conn = new Int32Array(order.length * 4);
  for (let i = 0; i < order.length; i++) {
    const tet = tets[order[i]!]!;
    conn[i * 4 + 0] = tet[0];
    conn[i * 4 + 1] = tet[1];
    conn[i * 4 + 2] = tet[2];
    conn[i * 4 + 3] = tet[3];
  }
  return {
    coords,
    conn,
    tags: Int32Array.from(order, (_, i) => i + 1),
    physical: Int32Array.from(order, () => 1),
  };
}

describe("buildAdjacency - hand-built 3-tet mesh", () => {
  it("12 raw faces -> 2 internal, 8 boundary, 10 total", () => {
    const mesh = threeTetMesh([0, 1, 2]);
    const adj = expectAdjacency(buildAdjacency(mesh));
    expect(adj.internalCount).toBe(2);
    expect(adj.boundaryCount).toBe(8);
    expect(adj.faceCount).toBe(10);
  });

  it("is independent of input tet order (shuffled conn gives identical counts and pairings)", () => {
    const base = expectAdjacency(buildAdjacency(threeTetMesh([0, 1, 2])));

    const orders: number[][] = [
      [2, 1, 0],
      [1, 0, 2],
      [2, 0, 1],
    ];

    for (const order of orders) {
      const mesh = threeTetMesh(order);
      const adj = expectAdjacency(buildAdjacency(mesh));
      expect(adj.internalCount).toBe(base.internalCount);
      expect(adj.boundaryCount).toBe(base.boundaryCount);
      expect(adj.faceCount).toBe(base.faceCount);

      // Compare the set of internal-face node-key -> {owner nodes set,
      // neighbour nodes set} pairings, independent of array order and of
      // which physical tet index ended up at which position after the
      // shuffle (re-derive the shuffled tet's *node sets* instead of
      // comparing raw cell indices, which do change under reordering).
      const tetsForOrder = order.map((origIdx) => {
        const tets: number[][] = [
          [0, 1, 2, 3],
          [1, 4, 2, 3],
          [0, 1, 2, 5],
        ];
        return new Set(tets[origIdx]);
      });

      function internalKeys(a: Adjacency): Set<string> {
        const keys = new Set<string>();
        for (let i = 0; i < a.internalCount; i++) {
          keys.add(faceKey(a, i).join(","));
        }
        return keys;
      }

      // The internal faces' node-index triples themselves are mesh
      // geometry, not cell-index-dependent, so they must match exactly
      // regardless of shuffle.
      expect(internalKeys(adj)).toEqual(internalKeys(base));

      // And every internal face's owner/neighbour tet (identified by
      // node set, not index) must be the two tets that actually share it.
      for (let i = 0; i < adj.internalCount; i++) {
        const key = faceKey(adj, i);
        const ownerNodes = tetsForOrder[adj.owner[i]!]!;
        const neighbourNodes = tetsForOrder[adj.neighbour[i]!]!;
        for (const n of key) {
          expect(ownerNodes.has(n)).toBe(true);
          expect(neighbourNodes.has(n)).toBe(true);
        }
      }
    }
  });
});

describe("buildAdjacency - non-manifold rejection", () => {
  it("rejects a face shared by 3 tets with a clear InputError", () => {
    // Three tets all sharing face {0,1,2}: A=(0,1,2,3), B=(0,1,2,4), C=(0,1,2,5).
    const coords = new Float64Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 2,
    ]);
    const conn = new Int32Array([0, 1, 2, 3, 0, 1, 2, 4, 0, 1, 2, 5]);
    const mesh: Mesh = {
      coords,
      conn,
      tags: new Int32Array([1, 2, 3]),
      physical: new Int32Array([1, 1, 1]),
    };

    const result = buildAdjacency(mesh);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Non-manifold mesh");
      expect(result.error.message).toContain("shared by 3 cells");
    }
  });
});
