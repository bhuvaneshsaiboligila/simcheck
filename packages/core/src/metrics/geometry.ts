// Shared geometry helpers for mesh metrics (PLAN.md §5 "Mesh metrics",
// §7 "Metrics" milestone). Not part of the public API (not re-exported
// from index.ts) -- each of volume.ts / aspectRatio.ts /
// nonOrthogonality.ts / skewness.ts needs some subset of cell centroids,
// face area vectors and face centroids, so they are computed once here in
// flat typed arrays (decisions.md #11: no arrays of objects, no Map) and
// shared rather than duplicated per metric file.

import type { Adjacency } from "../geometry/adjacency.js";
import type { Mesh } from "../types.js";

/**
 * Cell centroid per tet, length numTets * 3 (x,y,z interleaved). For a
 * tetrahedron the arithmetic mean of its 4 vertices is exact -- the same
 * point checkMesh's general pyramid-decomposition centroid algorithm
 * produces for a tet specifically (see the task note this module was
 * written from: this is a mathematical identity, not an approximation).
 */
export function cellCentroids(mesh: Mesh): Float64Array {
  const numTets = mesh.conn.length / 4;
  const coords = mesh.coords;
  const centroids = new Float64Array(numTets * 3);
  for (let t = 0; t < numTets; t++) {
    const base = t * 4;
    const n0 = mesh.conn[base + 0]!;
    const n1 = mesh.conn[base + 1]!;
    const n2 = mesh.conn[base + 2]!;
    const n3 = mesh.conn[base + 3]!;
    const cx = (coords[n0 * 3 + 0]! + coords[n1 * 3 + 0]! + coords[n2 * 3 + 0]! + coords[n3 * 3 + 0]!) / 4;
    const cy = (coords[n0 * 3 + 1]! + coords[n1 * 3 + 1]! + coords[n2 * 3 + 1]! + coords[n3 * 3 + 1]!) / 4;
    const cz = (coords[n0 * 3 + 2]! + coords[n1 * 3 + 2]! + coords[n2 * 3 + 2]! + coords[n3 * 3 + 2]!) / 4;
    centroids[t * 3 + 0] = cx;
    centroids[t * 3 + 1] = cy;
    centroids[t * 3 + 2] = cz;
  }
  return centroids;
}

/**
 * Face area vector S per face, length adjacency.faceCount * 3. Uses
 * `adjacency.faceNodes` in the stored (owner-winding) order: for nodes
 * q0, q1, q2, `S = 0.5 * cross(q1 - q0, q2 - q0)`, which points outward
 * from the face's owner cell (`adjacency.owner[faceIdx]`).
 */
export function faceAreaVectors(mesh: Mesh, adjacency: Adjacency): Float64Array {
  const coords = mesh.coords;
  const faceNodes = adjacency.faceNodes;
  const faceCount = adjacency.faceCount;
  const S = new Float64Array(faceCount * 3);
  for (let f = 0; f < faceCount; f++) {
    const q0 = faceNodes[f * 3 + 0]!;
    const q1 = faceNodes[f * 3 + 1]!;
    const q2 = faceNodes[f * 3 + 2]!;

    const ax = coords[q1 * 3 + 0]! - coords[q0 * 3 + 0]!;
    const ay = coords[q1 * 3 + 1]! - coords[q0 * 3 + 1]!;
    const az = coords[q1 * 3 + 2]! - coords[q0 * 3 + 2]!;

    const bx = coords[q2 * 3 + 0]! - coords[q0 * 3 + 0]!;
    const by = coords[q2 * 3 + 1]! - coords[q0 * 3 + 1]!;
    const bz = coords[q2 * 3 + 2]! - coords[q0 * 3 + 2]!;

    S[f * 3 + 0] = 0.5 * (ay * bz - az * by);
    S[f * 3 + 1] = 0.5 * (az * bx - ax * bz);
    S[f * 3 + 2] = 0.5 * (ax * by - ay * bx);
  }
  return S;
}

/** Face centroid per face (mean of its 3 node coordinates, exact for a
 * planar triangle), length adjacency.faceCount * 3. */
export function faceCentroids(mesh: Mesh, adjacency: Adjacency): Float64Array {
  const coords = mesh.coords;
  const faceNodes = adjacency.faceNodes;
  const faceCount = adjacency.faceCount;
  const fc = new Float64Array(faceCount * 3);
  for (let f = 0; f < faceCount; f++) {
    const q0 = faceNodes[f * 3 + 0]!;
    const q1 = faceNodes[f * 3 + 1]!;
    const q2 = faceNodes[f * 3 + 2]!;
    fc[f * 3 + 0] = (coords[q0 * 3 + 0]! + coords[q1 * 3 + 0]! + coords[q2 * 3 + 0]!) / 3;
    fc[f * 3 + 1] = (coords[q0 * 3 + 1]! + coords[q1 * 3 + 1]! + coords[q2 * 3 + 1]!) / 3;
    fc[f * 3 + 2] = (coords[q0 * 3 + 2]! + coords[q1 * 3 + 2]! + coords[q2 * 3 + 2]!) / 3;
  }
  return fc;
}

/**
 * Builds, for every cell, the indices of its 4 faces in `adjacency`'s flat
 * face arrays (owner side for faces it owns, neighbour side for internal
 * faces where it is the neighbour). Returned as a flat Int32Array of
 * length numTets * 4 (decisions.md #11: no arrays of objects / Map).
 * Every tet has exactly 4 faces total between `owner` and `neighbour`, so
 * a single counting pass fills a fixed-width 4-per-cell table.
 */
export function cellFaces(numTets: number, adjacency: Adjacency): Int32Array {
  const table = new Int32Array(numTets * 4);
  const slot = new Int32Array(numTets); // next free slot per cell, 0..3
  const faceCount = adjacency.faceCount;
  const owner = adjacency.owner;
  const neighbour = adjacency.neighbour;
  for (let f = 0; f < faceCount; f++) {
    const o = owner[f]!;
    table[o * 4 + slot[o]!] = f;
    slot[o] = slot[o]! + 1;
    const n = neighbour[f]!;
    if (n >= 0) {
      table[n * 4 + slot[n]!] = f;
      slot[n] = slot[n]! + 1;
    }
  }
  return table;
}
