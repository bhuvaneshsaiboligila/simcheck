// Per-cell skewness for pure-tet meshes, matching checkMesh's
// `faceSkewness()` (internal) / `boundaryFaceSkewness()` (boundary) via
// the same per-cell `maxFaceToCell()` reduction used for non-orthogonality.
// PLAN.md §5 "Mesh metrics" / §7 "Metrics" step 2.

import type { Adjacency } from "../geometry/adjacency.js";
import type { Mesh } from "../types.js";
import { cellCentroids, cellFaces, faceAreaVectors, faceCentroids } from "./geometry.js";

const ROOTVSMALL = 1e-150;

function mag(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function skewnessMetric(mesh: Mesh, adjacency: Adjacency): Float64Array {
  const numTets = mesh.conn.length / 4;
  const S = faceAreaVectors(mesh, adjacency);
  const fc = faceCentroids(mesh, adjacency);
  const cc = cellCentroids(mesh);
  const faces = cellFaces(numTets, adjacency);
  const coords = mesh.coords;
  const faceNodes = adjacency.faceNodes;

  const faceSkew = new Float64Array(adjacency.faceCount);

  // Internal faces.
  for (let f = 0; f < adjacency.internalCount; f++) {
    const owner = adjacency.owner[f]!;
    const neighbour = adjacency.neighbour[f]!;

    const ownCcX = cc[owner * 3 + 0]!;
    const ownCcY = cc[owner * 3 + 1]!;
    const ownCcZ = cc[owner * 3 + 2]!;

    const neiCcX = cc[neighbour * 3 + 0]!;
    const neiCcY = cc[neighbour * 3 + 1]!;
    const neiCcZ = cc[neighbour * 3 + 2]!;

    const fcX = fc[f * 3 + 0]!;
    const fcY = fc[f * 3 + 1]!;
    const fcZ = fc[f * 3 + 2]!;

    const sx = S[f * 3 + 0]!;
    const sy = S[f * 3 + 1]!;
    const sz = S[f * 3 + 2]!;

    const cpfX = fcX - ownCcX;
    const cpfY = fcY - ownCcY;
    const cpfZ = fcZ - ownCcZ;

    const dX = neiCcX - ownCcX;
    const dY = neiCcY - ownCcY;
    const dZ = neiCcZ - ownCcZ;

    const dotSCpf = sx * cpfX + sy * cpfY + sz * cpfZ;
    const dotSD = sx * dX + sy * dY + sz * dZ;
    const scale = dotSCpf / (dotSD + ROOTVSMALL);

    const svX = cpfX - scale * dX;
    const svY = cpfY - scale * dY;
    const svZ = cpfZ - scale * dZ;

    const magSv = mag(svX, svY, svZ);
    const svHatX = svX / (magSv + ROOTVSMALL);
    const svHatY = svY / (magSv + ROOTVSMALL);
    const svHatZ = svZ / (magSv + ROOTVSMALL);

    const magD = mag(dX, dY, dZ);
    let maxVertexProj = 0;
    for (let v = 0; v < 3; v++) {
      const node = faceNodes[f * 3 + v]!;
      const rx = coords[node * 3 + 0]! - fcX;
      const ry = coords[node * 3 + 1]! - fcY;
      const rz = coords[node * 3 + 2]! - fcZ;
      const proj = Math.abs(svHatX * rx + svHatY * ry + svHatZ * rz);
      if (proj > maxVertexProj) maxVertexProj = proj;
    }

    const fd = Math.max(0.2 * magD + ROOTVSMALL, maxVertexProj);
    faceSkew[f] = magSv / fd;
  }

  // Boundary faces.
  for (let f = adjacency.internalCount; f < adjacency.faceCount; f++) {
    const owner = adjacency.owner[f]!;

    const ownCcX = cc[owner * 3 + 0]!;
    const ownCcY = cc[owner * 3 + 1]!;
    const ownCcZ = cc[owner * 3 + 2]!;

    const fcX = fc[f * 3 + 0]!;
    const fcY = fc[f * 3 + 1]!;
    const fcZ = fc[f * 3 + 2]!;

    const sx = S[f * 3 + 0]!;
    const sy = S[f * 3 + 1]!;
    const sz = S[f * 3 + 2]!;
    const magS = mag(sx, sy, sz);

    const normalX = sx / magS;
    const normalY = sy / magS;
    const normalZ = sz / magS;

    const cpfX = fcX - ownCcX;
    const cpfY = fcY - ownCcY;
    const cpfZ = fcZ - ownCcZ;

    const dotNormalCpf = normalX * cpfX + normalY * cpfY + normalZ * cpfZ;
    const dX = normalX * dotNormalCpf;
    const dY = normalY * dotNormalCpf;
    const dZ = normalZ * dotNormalCpf;

    const dotSCpf = sx * cpfX + sy * cpfY + sz * cpfZ;
    const dotSD = sx * dX + sy * dY + sz * dZ;
    const scale = dotSCpf / (dotSD + ROOTVSMALL);

    const svX = cpfX - scale * dX;
    const svY = cpfY - scale * dY;
    const svZ = cpfZ - scale * dZ;

    const magSv = mag(svX, svY, svZ);
    const svHatX = svX / (magSv + ROOTVSMALL);
    const svHatY = svY / (magSv + ROOTVSMALL);
    const svHatZ = svZ / (magSv + ROOTVSMALL);

    const magD = mag(dX, dY, dZ);
    let maxVertexProj = 0;
    for (let v = 0; v < 3; v++) {
      const node = faceNodes[f * 3 + v]!;
      const rx = coords[node * 3 + 0]! - fcX;
      const ry = coords[node * 3 + 1]! - fcY;
      const rz = coords[node * 3 + 2]! - fcZ;
      const proj = Math.abs(svHatX * rx + svHatY * ry + svHatZ * rz);
      if (proj > maxVertexProj) maxVertexProj = proj;
    }

    const fd = Math.max(0.4 * magD + ROOTVSMALL, maxVertexProj);
    faceSkew[f] = magSv / fd;
  }

  const numTets2 = numTets;
  const result = new Float64Array(numTets2);
  for (let t = 0; t < numTets2; t++) {
    let maxSkew = 0;
    for (let k = 0; k < 4; k++) {
      const f = faces[t * 4 + k]!;
      const s = faceSkew[f]!;
      if (s > maxSkew) maxSkew = s;
    }
    result[t] = maxSkew;
  }

  return result;
}
