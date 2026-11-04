// Face adjacency for pure-tet meshes. PLAN.md §4 "v0.2 steps" / Adjacency,
// §6 (geometry/ "adjacency (radix sort)"), decisions.md #12.
//
// Each tet has 4 triangular faces. A face is internal if exactly two tets
// share it (same 3 node indices, any order), boundary if exactly one tet
// has it. Two faces match iff their node indices, sorted ascending, are
// identical.
//
// decisions.md #12: adjacency is built with a radix/counting sort over the
// face key's three Int32 parts, not a comparator-based Array.prototype.sort
// and not a single combined numeric key. A combined key would need to pack
// 3 node indices (up to ~32 bits each) into one number; at mesh scale node
// indices routinely need more than 18 bits each, so 3 of them together
// exceed the 53-bit safe-integer range of a double and could collide or
// lose precision. A comparator-based sort is O(n log n) *function calls*,
// which dominates at millions of faces; a counting sort is O(n + k) with
// no per-element comparator call, using direct array indexing instead.
//
// This module builds the sort from three stable counting-sort passes (one
// per Int32 part, least-significant first), which is equivalent to a
// 3-digit radix sort where each "digit" is a full node index rather than a
// byte/nibble -- the node-index range at mesh scale (hundreds of thousands
// to low millions) makes one bucket per node index practical in both time
// and memory, and avoids an extra multi-pass byte-wise radix on top.

import { err, ok, type Result } from "../types.js";
import type { Mesh } from "../types.js";

/**
 * Face adjacency for a pure-tet Mesh. Faces are de-duplicated: an internal
 * face (shared by two tets) appears once, with both `owner` and
 * `neighbour` set; a boundary face appears once, with `neighbour` set to
 * -1. Internal faces are stored first (indices [0, internalCount)),
 * followed by boundary faces (indices [internalCount, faceCount)), so
 * later per-type face statistics (PLAN.md §5: non-orthogonality and
 * skewness are face metrics, computed separately for internal vs.
 * boundary) can slice the flat arrays directly instead of re-scanning.
 *
 * `faceNodes` keeps the face's 3 node indices in the *unsorted* order they
 * appear on the owner tet's face (not the sorted key used for matching),
 * since later milestones (face normals, non-orthogonality, skewness) need
 * the actual winding, not just face membership.
 */
export interface Adjacency {
  /** Number of distinct faces (internalCount + boundaryCount). */
  faceCount: number;
  /** Faces shared by exactly two tets. */
  internalCount: number;
  /** Faces belonging to exactly one tet. */
  boundaryCount: number;
  /** Owning tet index per face, length faceCount. For internal faces, the lower of the two tet indices. */
  owner: Int32Array;
  /** Neighbour tet index per face, length faceCount. -1 for boundary faces. */
  neighbour: Int32Array;
  /** 3 node indices per face (owner's winding order), length faceCount * 3. */
  faceNodes: Int32Array;
}

/**
 * The 4 triangular faces of a tet, each named by the vertex it is opposite
 * (standard tet face enumeration). Given tet nodes [n0, n1, n2, n3]:
 *   face opposite n0: [n1, n2, n3]
 *   face opposite n1: [n0, n2, n3]
 *   face opposite n2: [n0, n1, n3]
 *   face opposite n3: [n0, n1, n2]
 * Orientation/outward-normal sign is not relevant here (that is a later
 * milestone's concern, PLAN.md §5 volume sign) -- only face membership
 * (which 3 of the 4 nodes) matters for adjacency.
 */
const FACE_VERTEX_OFFSETS: readonly [number, number, number][] = [
  [1, 2, 3],
  [0, 2, 3],
  [0, 1, 3],
  [0, 1, 2],
];

/** Sorts 3 numbers ascending, returned as a fixed-size tuple. */
function sort3(a: number, b: number, c: number): [number, number, number] {
  let x = a;
  let y = b;
  let z = c;
  if (x > y) {
    const t = x;
    x = y;
    y = t;
  }
  if (y > z) {
    const t = y;
    y = z;
    z = t;
  }
  if (x > y) {
    const t = x;
    x = y;
    y = t;
  }
  return [x, y, z];
}

/**
 * Stable counting sort of `order` (a permutation of face indices) by
 * `keys[order[i] * 3 + component]`, where `keys` packs 3 interleaved Int32
 * key parts per face (see `buildAdjacency`) and each part ranges over
 * [0, numBuckets). Writes the sorted permutation into `result` (caller-
 * supplied, so the 3 passes in `buildAdjacency` can ping-pong between 2
 * pre-allocated buffers instead of allocating a fresh `Int32Array(n)` per
 * pass); does not mutate `order`. `counts` is likewise caller-supplied and
 * reused across passes (zeroed internally) to avoid 3 fresh
 * `Uint32Array(numBuckets + 1)` allocations.
 */
function countingSortPass(
  order: Int32Array,
  keys: Int32Array,
  component: 0 | 1 | 2,
  numBuckets: number,
  counts: Uint32Array,
  result: Int32Array,
): void {
  const n = order.length;
  counts.fill(0, 0, numBuckets + 1);
  for (let i = 0; i < n; i++) {
    counts[keys[order[i]! * 3 + component]! + 1]!++;
  }
  for (let b = 0; b < numBuckets; b++) {
    counts[b + 1]! += counts[b]!;
  }
  for (let i = 0; i < n; i++) {
    const faceIdx = order[i]!;
    const bucket = keys[faceIdx * 3 + component]!;
    const dest = counts[bucket]!;
    result[dest] = faceIdx;
    counts[bucket] = dest + 1;
  }
}

/**
 * Builds face adjacency for a pure-tet Mesh (PLAN.md §4 Adjacency step 1-3,
 * decisions.md #12). Never throws: a non-manifold mesh (a face shared by
 * more than 2 tets) is rejected with an InputError, per CLAUDE.md "reject
 * clearly, never skip cells silently".
 */
export function buildAdjacency(mesh: Mesh): Result<Adjacency> {
  const numTets = mesh.conn.length / 4;
  const numNodes = mesh.coords.length / 3;

  if (numTets === 0) {
    return ok({
      faceCount: 0,
      internalCount: 0,
      boundaryCount: 0,
      owner: new Int32Array(0),
      neighbour: new Int32Array(0),
      faceNodes: new Int32Array(0),
    });
  }

  const rawFaceCount = numTets * 4;

  // Sorted node indices per raw face: the matching key. The 3 parts of
  // each face's key are interleaved in one array (`keys[faceIdx * 3 + 0]`
  // = smallest node index, `+ 1` = middle, `+ 2` = largest) rather than
  // kept in 3 separate parallel arrays. Interleaving means that once the
  // sort passes below scatter-index into this array via `order`, each
  // access pulls all 3 key parts for a face from one cache line instead of
  // 3 separate cache lines in 3 different arrays -- the run-grouping walk
  // after the sort (which compares all 3 parts per face) benefits the
  // most, going from 3 scattered cache misses per face to roughly 1.
  //
  // The unsorted (winding-preserving) node indices are *not* kept in
  // parallel arrays -- they are cheap to recompute from `mesh.conn` on
  // demand (a raw face index `f0` determines its owning cell `f0 >> 2` and
  // which of the 4 faces `f0 & 3` directly), and recomputing them only for
  // the faces that actually end up written (at most 2 per run, once each)
  // is both less memory and fewer full-array passes than carrying
  // rawA/B/C through the whole sort just to read them back later.
  const keys = new Int32Array(rawFaceCount * 3);

  for (let t = 0; t < numTets; t++) {
    const base = t * 4;
    const n0 = mesh.conn[base + 0]!;
    const n1 = mesh.conn[base + 1]!;
    const n2 = mesh.conn[base + 2]!;
    const n3 = mesh.conn[base + 3]!;
    const tetNodes = [n0, n1, n2, n3];

    for (let f = 0; f < 4; f++) {
      const faceIdx = base + f;
      const offsets = FACE_VERTEX_OFFSETS[f]!;
      const a = tetNodes[offsets[0]]!;
      const b = tetNodes[offsets[1]]!;
      const c = tetNodes[offsets[2]]!;

      const [sa, sb, sc] = sort3(a, b, c);
      keys[faceIdx * 3 + 0] = sa;
      keys[faceIdx * 3 + 1] = sb;
      keys[faceIdx * 3 + 2] = sc;
    }
  }

  /**
   * Recomputes the unsorted (winding-preserving) 3 node indices of raw
   * face `faceIdx` directly from `mesh.conn`, mirroring the loop above.
   */
  function rawFaceNodes(faceIdx: number): [number, number, number] {
    const cell = faceIdx >> 2;
    const f = faceIdx & 3;
    const base = cell * 4;
    const offsets = FACE_VERTEX_OFFSETS[f]!;
    return [
      mesh.conn[base + offsets[0]]!,
      mesh.conn[base + offsets[1]]!,
      mesh.conn[base + offsets[2]]!,
    ];
  }

  // Radix/counting sort over the 3 Int32 key parts, least significant
  // first, so the final order is sorted lexicographically by (keyA, keyB,
  // keyC) -- equivalent to a multi-key radix sort without ever combining
  // the 3 parts into one unsafe numeric key (decisions.md #12).
  let order = new Int32Array(rawFaceCount);
  for (let i = 0; i < rawFaceCount; i++) order[i] = i;
  let scratch = new Int32Array(rawFaceCount);
  const counts = new Uint32Array(numNodes + 1);
  countingSortPass(order, keys, 2, numNodes, counts, scratch);
  {
    const tmp = order;
    order = scratch;
    scratch = tmp;
  }
  countingSortPass(order, keys, 1, numNodes, counts, scratch);
  {
    const tmp = order;
    order = scratch;
    scratch = tmp;
  }
  countingSortPass(order, keys, 0, numNodes, counts, scratch);
  {
    const tmp = order;
    order = scratch;
    scratch = tmp;
  }

  // Single pass: walk the sorted order, grouping runs of identical
  // (keyA, keyB, keyC). For each run, reject non-manifold meshes (run
  // length >= 3) and otherwise write the face directly into bounded
  // "staging" arrays -- internal faces into one pair of arrays, boundary
  // faces into another -- rather than first counting in one pass and then
  // writing in a second pass. Both passes would otherwise re-walk the
  // sorted order and re-read keyA/B/C[order[j]] (scattered, since `order`
  // is a permutation) for every element; merging them halves that
  // scattered-access cost. The exact split between internal/boundary is
  // not known until the whole pass completes, so the staging arrays are
  // sized to the (statically known) worst case -- at most rawFaceCount / 2
  // internal faces (each consumes exactly 2 raw faces) and at most
  // rawFaceCount boundary faces -- and copied down into exactly-sized
  // final arrays afterwards with a handful of cheap sequential `.set()`
  // copies.
  const maxInternal = rawFaceCount >> 1;

  const stagingInternalOwner = new Int32Array(maxInternal);
  const stagingInternalNeighbour = new Int32Array(maxInternal);
  const stagingInternalNodes = new Int32Array(maxInternal * 3);

  const stagingBoundaryOwner = new Int32Array(rawFaceCount);
  const stagingBoundaryNeighbour = new Int32Array(rawFaceCount);
  const stagingBoundaryNodes = new Int32Array(rawFaceCount * 3);

  let internalCount = 0;
  let boundaryCount = 0;

  let i = 0;
  while (i < rawFaceCount) {
    const f0 = order[i]!;
    const f0a = keys[f0 * 3 + 0]!;
    const f0b = keys[f0 * 3 + 1]!;
    const f0c = keys[f0 * 3 + 2]!;
    let j = i + 1;
    while (j < rawFaceCount) {
      const fj = order[j]!;
      if (keys[fj * 3 + 0] !== f0a || keys[fj * 3 + 1] !== f0b || keys[fj * 3 + 2] !== f0c) break;
      j++;
    }
    const runLength = j - i;

    if (runLength === 1) {
      const cell = f0 >> 2;
      const [a, b, c] = rawFaceNodes(f0);
      const slot = boundaryCount;
      stagingBoundaryOwner[slot] = cell;
      stagingBoundaryNeighbour[slot] = -1;
      stagingBoundaryNodes[slot * 3 + 0] = a;
      stagingBoundaryNodes[slot * 3 + 1] = b;
      stagingBoundaryNodes[slot * 3 + 2] = c;
      boundaryCount++;
    } else if (runLength === 2) {
      const f1 = order[i + 1]!;
      const cell0 = f0 >> 2;
      const cell1 = f1 >> 2;
      const ownerFace = cell0 <= cell1 ? f0 : f1;
      const ownerCell = cell0 <= cell1 ? cell0 : cell1;
      const neighbourCell = cell0 <= cell1 ? cell1 : cell0;
      const [a, b, c] = rawFaceNodes(ownerFace);

      const slot = internalCount;
      stagingInternalOwner[slot] = ownerCell;
      stagingInternalNeighbour[slot] = neighbourCell;
      stagingInternalNodes[slot * 3 + 0] = a;
      stagingInternalNodes[slot * 3 + 1] = b;
      stagingInternalNodes[slot * 3 + 2] = c;
      internalCount++;
    } else {
      const nodes = sort3(f0a, f0b, f0c);
      return err(
        "mesh",
        `Non-manifold mesh: face with node indices (${nodes[0]}, ${nodes[1]}, ${nodes[2]}) ` +
          `is shared by ${runLength} cells; a valid tet mesh allows at most 2.`,
      );
    }

    i = j;
  }

  const finalOwner = new Int32Array(internalCount + boundaryCount);
  const finalNeighbour = new Int32Array(internalCount + boundaryCount);
  const finalNodes = new Int32Array((internalCount + boundaryCount) * 3);

  finalOwner.set(stagingInternalOwner.subarray(0, internalCount), 0);
  finalOwner.set(stagingBoundaryOwner.subarray(0, boundaryCount), internalCount);
  finalNeighbour.set(stagingInternalNeighbour.subarray(0, internalCount), 0);
  finalNeighbour.set(stagingBoundaryNeighbour.subarray(0, boundaryCount), internalCount);
  finalNodes.set(stagingInternalNodes.subarray(0, internalCount * 3), 0);
  finalNodes.set(stagingBoundaryNodes.subarray(0, boundaryCount * 3), internalCount * 3);

  return ok({
    faceCount: internalCount + boundaryCount,
    internalCount,
    boundaryCount,
    owner: finalOwner,
    neighbour: finalNeighbour,
    faceNodes: finalNodes,
  });
}
