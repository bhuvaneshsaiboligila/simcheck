import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGmsh } from "../src/index.js";
import type { Mesh } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "..", "..", "tests", "fixtures");

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

/** Splits bytes into chunks of at most `size` bytes, to exercise chunk-boundary handling. */
function chunk(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.subarray(i, i + size));
  }
  return chunks;
}

function expectMesh(result: ReturnType<typeof parseGmsh>): Mesh {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok result");
  return result.value;
}

describe("parseGmsh - single-tet", () => {
  const expectedCoords = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  it("v2.2: 4 nodes, 1 tet, conn translated to dense 0-based indices", () => {
    const mesh = expectMesh(parseGmsh(readFixture("single-tet.msh")));
    expect(mesh.coords.length).toBe(12);
    for (let i = 0; i < 4; i++) {
      expect(Array.from(mesh.coords.slice(i * 3, i * 3 + 3))).toEqual(expectedCoords[i]);
    }
    expect(Array.from(mesh.conn)).toEqual([0, 1, 2, 3]);
    expect(Array.from(mesh.tags)).toEqual([1]);
    expect(Array.from(mesh.physical)).toEqual([1]);
  });

  it("v4.1 gives an identical mesh to v2.2", () => {
    const v22 = expectMesh(parseGmsh(readFixture("single-tet.msh")));
    const v41 = expectMesh(parseGmsh(readFixture("single-tet-v41.msh")));
    expect(Array.from(v41.coords)).toEqual(Array.from(v22.coords));
    expect(Array.from(v41.conn)).toEqual(Array.from(v22.conn));
    expect(Array.from(v41.physical)).toEqual(Array.from(v22.physical));
  });
});

describe("parseGmsh - fixture round trips (v2.2 vs v4.1)", () => {
  const pairs: [string, string][] = [
    ["two-tets-orthogonal.msh", "two-tets-orthogonal-v41.msh"],
    ["two-tets-skewed.msh", "two-tets-skewed-v41.msh"],
    ["inverted-tet.msh", "inverted-tet-v41.msh"],
  ];

  for (const [v22name, v41name] of pairs) {
    it(`${v22name} and ${v41name} parse to the same coords/conn/physical`, () => {
      const v22 = expectMesh(parseGmsh(readFixture(v22name)));
      const v41 = expectMesh(parseGmsh(readFixture(v41name)));
      expect(Array.from(v41.coords)).toEqual(Array.from(v22.coords));
      expect(Array.from(v41.conn)).toEqual(Array.from(v22.conn));
      expect(Array.from(v41.physical)).toEqual(Array.from(v22.physical));
    });
  }
});

describe("parseGmsh - two-tets-orthogonal", () => {
  it("2 cells with the expected node coordinates", () => {
    const mesh = expectMesh(parseGmsh(readFixture("two-tets-orthogonal.msh")));
    expect(mesh.coords.length).toBe(15); // 5 nodes
    expect(mesh.conn.length).toBe(8); // 2 tets
    expect(Array.from(mesh.conn)).toEqual([0, 1, 2, 3, 1, 4, 2, 3]);
  });
});

describe("parseGmsh - inverted-tet", () => {
  it("parses successfully (volume sign is checked in a later milestone)", () => {
    const mesh = expectMesh(parseGmsh(readFixture("inverted-tet.msh")));
    expect(mesh.conn.length).toBe(4);
    // Node order in the fixture is 2 1 3 4 (first two swapped vs.
    // single-tet.msh), which is what makes the tet's signed volume negative.
    expect(Array.from(mesh.conn)).toEqual([1, 0, 2, 3]);
  });
});

describe("parseGmsh - rejections", () => {
  it("mixed-prism.msh is rejected: pure tets only", () => {
    const result = parseGmsh(readFixture("mixed-prism.msh"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "Only pure tetrahedral meshes are supported in v0.2.",
      );
    }
  });

  it("mixed-prism-v41.msh is rejected the same way", () => {
    const result = parseGmsh(readFixture("mixed-prism-v41.msh"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "Only pure tetrahedral meshes are supported in v0.2.",
      );
    }
  });

  it("surface-only.msh is rejected: no volume cells", () => {
    const result = parseGmsh(readFixture("surface-only.msh"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "No volume cells found. Did you add a volume physical group in Gmsh?",
      );
    }
  });

  it("surface-only-v41.msh is rejected the same way", () => {
    const result = parseGmsh(readFixture("surface-only-v41.msh"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "No volume cells found. Did you add a volume physical group in Gmsh?",
      );
    }
  });

  it("rejects a bad $MeshFormat version with a clear InputError", () => {
    const bad = new TextEncoder().encode(
      "$MeshFormat\n3.0 0 8\n$EndMeshFormat\n$Nodes\n0\n$EndNodes\n$Elements\n0\n$EndElements\n",
    );
    const result = parseGmsh(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Unsupported Gmsh version");
    }
  });

  it("rejects a binary file-type flag with a clear InputError", () => {
    const bad = new TextEncoder().encode(
      "$MeshFormat\n4.1 1 8\n$EndMeshFormat\n",
    );
    const result = parseGmsh(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Binary .msh files are not supported");
    }
  });

  it("does not throw on malformed input; returns InputError", () => {
    const bad = new TextEncoder().encode("not a gmsh file at all");
    expect(() => parseGmsh(bad)).not.toThrow();
    const result = parseGmsh(bad);
    expect(result.ok).toBe(false);
  });
});

describe("parseGmsh - CRLF line endings", () => {
  it("parses identically when line endings are CRLF", () => {
    const lf = readFixture("single-tet.msh");
    const text = new TextDecoder().decode(lf);
    const crlfText = text.replace(/\n/g, "\r\n");
    const crlf = new TextEncoder().encode(crlfText);

    const meshLf = expectMesh(parseGmsh(lf));
    const meshCrlf = expectMesh(parseGmsh(crlf));

    expect(Array.from(meshCrlf.coords)).toEqual(Array.from(meshLf.coords));
    expect(Array.from(meshCrlf.conn)).toEqual(Array.from(meshLf.conn));
    expect(Array.from(meshCrlf.physical)).toEqual(Array.from(meshLf.physical));
  });
});

describe("parseGmsh - chunk-boundary robustness", () => {
  const files = [
    "single-tet.msh",
    "single-tet-v41.msh",
    "two-tets-orthogonal.msh",
    "two-tets-skewed-v41.msh",
    "mixed-prism-v41.msh",
  ];

  for (const name of files) {
    it(`${name}: 7-byte chunks give identical output to one chunk`, () => {
      const bytes = readFixture(name);
      const whole = parseGmsh(bytes);
      const chunked = parseGmsh(chunk(bytes, 7));

      expect(chunked.ok).toBe(whole.ok);
      if (whole.ok && chunked.ok) {
        expect(Array.from(chunked.value.coords)).toEqual(Array.from(whole.value.coords));
        expect(Array.from(chunked.value.conn)).toEqual(Array.from(whole.value.conn));
        expect(Array.from(chunked.value.physical)).toEqual(Array.from(whole.value.physical));
      } else if (!whole.ok && !chunked.ok) {
        expect(chunked.error.message).toBe(whole.error.message);
      }
    });
  }

  it("1-byte chunks on single-tet.msh still parse correctly", () => {
    const bytes = readFixture("single-tet.msh");
    const mesh = expectMesh(parseGmsh(chunk(bytes, 1)));
    expect(Array.from(mesh.conn)).toEqual([0, 1, 2, 3]);
  });
});

describe("float parsing precision", () => {
  // Builds a minimal single-node $Nodes section embedding the tricky value
  // as the node's x-coordinate, then checks it against parseFloat on the
  // same text within 1e-12 relative.
  function parseOneFloat(text: string): number {
    const file =
      `$MeshFormat\n2.2 0 8\n$EndMeshFormat\n` +
      `$Nodes\n4\n1 ${text} 0 0\n2 1 0 0\n3 0 1 0\n4 0 0 1\n$EndNodes\n` +
      `$Elements\n1\n1 4 2 1 1 1 2 3 4\n$EndElements\n`;
    const result = parseGmsh(new TextEncoder().encode(file));
    if (!result.ok) throw new Error(result.error.message);
    return result.value.coords[0]!;
  }

  const cases = ["1.e-05", "-0.0", "1.23456789012345e+10", "0", "3.14159", "-2.5e3", "1E6"];

  for (const text of cases) {
    it(`"${text}" matches parseFloat within 1e-12 relative`, () => {
      const got = parseOneFloat(text);
      const want = parseFloat(text);
      if (want === 0) {
        expect(Math.abs(got)).toBe(0);
      } else {
        const relErr = Math.abs(got - want) / Math.abs(want);
        expect(relErr).toBeLessThanOrEqual(1e-12);
      }
    });
  }
});
