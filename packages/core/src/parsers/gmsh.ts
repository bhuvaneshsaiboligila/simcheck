// Gmsh .msh parser (ASCII, v2.2 and v4.1). PLAN.md §3/§4 "v0.2: mesh checker",
// §6 (Mesh type), §7 risk "messy real Gmsh files".
//
// Hard rules (CLAUDE.md, decisions.md #11): byte scanner over Uint8Array
// chunks, flat typed arrays, no TextDecoder-the-whole-file-then-split, no
// per-node/per-cell objects, no Map for node-tag -> dense-index translation.
//
// Entry point for callers (including the benchmark harness):
//
//   parseGmsh(bytes: Uint8Array | Uint8Array[]): Result<Mesh>
//
// Pass a single Uint8Array when the whole file is already in memory, or an
// array of chunks to simulate chunked/streamed reading (e.g. chunks read in
// turn from File.stream() in the browser, collected into an array by the
// caller before calling this synchronous entry point). The scanner below
// walks chunk boundaries byte-by-byte, so a token split across two chunks
// (any chunk size, including pathologically small ones) parses identically
// to the same bytes handed over as one chunk.

import { err, ok, type Result } from "../types.js";
import type { Mesh } from "../types.js";

// ---------------------------------------------------------------------------
// Byte classes
// ---------------------------------------------------------------------------

const TAB = 9;
const LF = 10;
const CR = 13;
const SPACE = 32;
const DOLLAR = 36;
const PLUS = 43;
const MINUS = 45;
const DOT = 46;
const ZERO = 48;
const NINE = 57;
const UPPER_E = 69;
const LOWER_E = 101;

function isDigit(b: number): boolean {
  return b >= ZERO && b <= NINE;
}

function isWhitespace(b: number): boolean {
  return b === SPACE || b === TAB || b === CR || b === LF;
}

// ---------------------------------------------------------------------------
// Element type table: Gmsh element type code -> [dimension, node count].
// Small, constant metadata (not mesh-scale data), covers the linear and
// common higher-order element types so non-tet elements can be identified
// and either filtered out (lower dimension) or rejected with a clear
// message (same dimension, wrong type), without ever guessing a node count.
// Source: refs/gmsh/doc/texinfo/gmsh.texi "MSH file format" element type list.
// ---------------------------------------------------------------------------

const ELEMENT_DIM: Readonly<Record<number, number>> = {
  1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3, 7: 3, 8: 1, 9: 2, 10: 2,
  11: 3, 12: 3, 13: 3, 14: 3, 15: 0, 16: 2, 17: 3, 18: 3, 19: 3, 20: 2,
  21: 2, 22: 2, 23: 2, 24: 2, 25: 2, 26: 1, 27: 1, 28: 1, 29: 3, 30: 3,
  31: 3, 92: 3, 93: 3,
};

const ELEMENT_NODE_COUNT: Readonly<Record<number, number>> = {
  1: 2, 2: 3, 3: 4, 4: 4, 5: 8, 6: 6, 7: 5, 8: 3, 9: 6, 10: 9,
  11: 10, 12: 27, 13: 18, 14: 14, 15: 1, 16: 8, 17: 20, 18: 15, 19: 13, 20: 9,
  21: 10, 22: 12, 23: 15, 24: 15, 25: 21, 26: 4, 27: 5, 28: 6, 29: 20, 30: 35,
  31: 56, 92: 64, 93: 125,
};

// Tetrahedra of every order Gmsh defines (refs/gmsh/doc/texinfo/gmsh.texi
// "MSH file format" element type list): 4 = linear (order 1, 4 nodes),
// 11 = order 2 (10 nodes), 29/30/31 = orders 3/4/5 (20/35/56 nodes). v0.2
// accepts a tet of any of these orders (decisions.md #9 revised) -- other
// dimension-3 types (prism/hex/pyramid, of any order) are still rejected.
//
// Gmsh's node-ordering convention (refs/gmsh/doc/texinfo/gmsh.texi "Node
// ordering", both the low-order diagrams and the general "High-order
// elements" section: "The nodes of an element of order p are ordered with
// respect to its corners... 1. the corners; 2. the nodes inside the
// edges...") puts the 4 corner nodes first for every one of these types,
// regardless of order -- so the first 4 entries of any tet element's node
// list are always its corners, and everything after that (mid-edge,
// mid-face, interior nodes) can simply be read past and discarded for a
// pure-corner (straight-sided) Mesh.
const TET_TYPES: ReadonlySet<number> = new Set([4, 11, 29, 30, 31]);

// Triangles of every order Gmsh defines (same source as above), used only
// to word the "this is a 2D mesh" rejection message precisely ("N
// triangles" rather than a vaguer "N 2D elements") when a file's only
// elements are higher-order surface triangles, not just linear ones.
const TRIANGLE_TYPES: ReadonlySet<number> = new Set([2, 9, 20, 21, 22, 23, 24, 25]);

// ---------------------------------------------------------------------------
// Parse errors: thrown internally, caught once at the top of parseGmsh() and
// turned into a Result so callers never see an exception for bad input.
// ---------------------------------------------------------------------------

class GmshParseError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

function fail(field: string, message: string): never {
  throw new GmshParseError(field, message);
}

// ---------------------------------------------------------------------------
// Byte scanner. Walks an array of Uint8Array chunks one byte at a time;
// chunk boundaries are invisible to callers, so numbers/lines split across
// chunk borders read correctly regardless of chunk size.
// ---------------------------------------------------------------------------

class ByteReader {
  private readonly chunks: Uint8Array[];
  private chunkIndex = 0;
  private pos = 0;

  constructor(chunks: Uint8Array[]) {
    this.chunks = chunks.filter((c) => c.length > 0);
  }

  private normalize(): void {
    while (
      this.chunkIndex < this.chunks.length &&
      this.pos >= this.chunks[this.chunkIndex]!.length
    ) {
      this.chunkIndex++;
      this.pos = 0;
    }
  }

  peek(): number {
    this.normalize();
    if (this.chunkIndex >= this.chunks.length) return -1;
    return this.chunks[this.chunkIndex]![this.pos]!;
  }

  next(): number {
    this.normalize();
    if (this.chunkIndex >= this.chunks.length) return -1;
    const b = this.chunks[this.chunkIndex]![this.pos]!;
    this.pos++;
    return b;
  }

  atEnd(): boolean {
    return this.peek() === -1;
  }

  skipWhitespace(): void {
    while (isWhitespace(this.peek())) this.next();
  }

  /** Reads a single whitespace-delimited token, decoded as ASCII text. */
  readToken(): string {
    this.skipWhitespace();
    let s = "";
    let b = this.peek();
    while (b !== -1 && !isWhitespace(b)) {
      s += String.fromCharCode(b);
      this.next();
      b = this.peek();
    }
    if (s.length === 0) fail("file", "unexpected end of file");
    return s;
  }

  /** Reads the rest of the current line (excluding the newline), trimming a trailing CR. */
  readLine(): string {
    let s = "";
    let b = this.peek();
    while (b !== -1 && b !== LF) {
      s += String.fromCharCode(b);
      this.next();
      b = this.peek();
    }
    if (b === LF) this.next();
    if (s.endsWith("\r")) s = s.slice(0, -1);
    return s;
  }

  /** Reads an optionally-signed decimal integer, built from digit byte values. */
  readInt(): number {
    this.skipWhitespace();
    let sign = 1;
    let b = this.peek();
    if (b === PLUS || b === MINUS) {
      if (b === MINUS) sign = -1;
      this.next();
      b = this.peek();
    }
    let value = 0;
    let digits = 0;
    while (isDigit(b)) {
      value = value * 10 + (b - ZERO);
      digits++;
      this.next();
      b = this.peek();
    }
    if (digits === 0) fail("file", "expected an integer");
    return sign * value;
  }

  /**
   * Reads a decimal float built directly from digit byte values (sign,
   * integer part, fractional part, exponent) rather than decoding the whole
   * file to text and calling parseFloat per token. Handles "1.e-05",
   * "-0.0", "1.23456789012345e+10", etc.
   */
  readFloat(): number {
    this.skipWhitespace();
    let sign = 1;
    let b = this.peek();
    if (b === PLUS || b === MINUS) {
      if (b === MINUS) sign = -1;
      this.next();
      b = this.peek();
    }

    let intValue = 0;
    let intDigits = 0;
    while (isDigit(b)) {
      intValue = intValue * 10 + (b - ZERO);
      intDigits++;
      this.next();
      b = this.peek();
    }

    let fracValue = 0;
    let fracDigits = 0;
    if (b === DOT) {
      this.next();
      b = this.peek();
      while (isDigit(b)) {
        fracValue = fracValue * 10 + (b - ZERO);
        fracDigits++;
        this.next();
        b = this.peek();
      }
    }

    if (intDigits === 0 && fracDigits === 0) fail("file", "expected a number");

    let mantissa = intValue;
    if (fracDigits > 0) mantissa += fracValue / Math.pow(10, fracDigits);

    let exponent = 0;
    if (b === LOWER_E || b === UPPER_E) {
      this.next();
      b = this.peek();
      let expSign = 1;
      if (b === PLUS || b === MINUS) {
        if (b === MINUS) expSign = -1;
        this.next();
        b = this.peek();
      }
      let expValue = 0;
      let expDigits = 0;
      while (isDigit(b)) {
        expValue = expValue * 10 + (b - ZERO);
        expDigits++;
        this.next();
        b = this.peek();
      }
      if (expDigits === 0) fail("file", "expected exponent digits");
      exponent = expSign * expValue;
    }

    return sign * mantissa * Math.pow(10, exponent);
  }
}

// ---------------------------------------------------------------------------
// Section skipping (unknown and explicitly-ignored sections)
// ---------------------------------------------------------------------------

function skipSection(reader: ByteReader, name: string): void {
  const endMarker = "$End" + name;
  for (;;) {
    reader.skipWhitespace();
    if (reader.atEnd()) {
      fail("file", `unexpected end of file inside $${name} (missing ${endMarker})`);
    }
    const line = reader.readLine();
    if (line === endMarker) return;
  }
}

function expectEndSection(reader: ByteReader, name: string): void {
  reader.skipWhitespace();
  const line = reader.readLine();
  if (line !== "$End" + name) {
    fail("file", `expected $End${name}, found "${line}"`);
  }
}

// ---------------------------------------------------------------------------
// $MeshFormat
// ---------------------------------------------------------------------------

type GmshVersion = "2.2" | "4.1";

function parseMeshFormat(reader: ByteReader): GmshVersion {
  reader.skipWhitespace();
  const versionToken = reader.readToken();
  const fileType = reader.readInt();
  reader.readInt(); // data-size, unused for ASCII
  expectEndSection(reader, "MeshFormat");

  if (fileType !== 0) {
    fail(
      "file",
      "Binary .msh files are not supported. Re-export as ASCII (file-type 0).",
    );
  }
  if (versionToken !== "2.2" && versionToken !== "4.1") {
    fail(
      "file",
      `Unsupported Gmsh version "${versionToken}". Only ASCII 2.2 and 4.1 are supported.`,
    );
  }
  return versionToken;
}

// ---------------------------------------------------------------------------
// $Entities (v4.1 only): builds entityTag -> physical tag per dimension, so
// $Elements (which in v4.1 carries entityDim/entityTag but no physical tag
// directly) can look up the physical group of each element's entity.
// ---------------------------------------------------------------------------

function parseEntities(reader: ByteReader): Map<number, number>[] {
  const counts = [reader.readInt(), reader.readInt(), reader.readInt(), reader.readInt()];
  const maps: Map<number, number>[] = [new Map(), new Map(), new Map(), new Map()];

  for (let dim = 0; dim < 4; dim++) {
    const count = counts[dim]!;
    const map = maps[dim]!;
    for (let i = 0; i < count; i++) {
      const tag = reader.readInt();
      const bboxValues = dim === 0 ? 3 : 6;
      for (let k = 0; k < bboxValues; k++) reader.readFloat();

      const numPhysical = reader.readInt();
      let physicalTag = 0;
      for (let k = 0; k < numPhysical; k++) {
        const p = reader.readInt();
        if (k === 0) physicalTag = p;
      }
      map.set(tag, physicalTag);

      if (dim > 0) {
        const numBounding = reader.readInt();
        for (let k = 0; k < numBounding; k++) reader.readInt();
      }
    }
  }

  expectEndSection(reader, "Entities");
  return maps;
}

// ---------------------------------------------------------------------------
// $Nodes: builds coords (dense, file order) plus a dense tag -> index map
// sized from the node tag span (never a Map).
// ---------------------------------------------------------------------------

interface ParsedNodes {
  coords: Float64Array; // length = numNodes * 3
  tagToIndex: Int32Array; // length = maxTag - minTag + 1, -1 where unused
  minTag: number;
}

function emptyTagToIndex(): Int32Array {
  return new Int32Array(0);
}

function parseNodesV22(reader: ByteReader): ParsedNodes {
  const count = reader.readInt();
  const coords = new Float64Array(count * 3);
  const tagsSeen = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    const tag = reader.readInt();
    tagsSeen[i] = tag;
    coords[i * 3 + 0] = reader.readFloat();
    coords[i * 3 + 1] = reader.readFloat();
    coords[i * 3 + 2] = reader.readFloat();
  }
  expectEndSection(reader, "Nodes");

  if (count === 0) {
    return { coords, tagToIndex: emptyTagToIndex(), minTag: 0 };
  }

  let minTag = Infinity;
  let maxTag = -Infinity;
  for (let i = 0; i < count; i++) {
    const t = tagsSeen[i]!;
    if (t < minTag) minTag = t;
    if (t > maxTag) maxTag = t;
  }

  const tagToIndex = new Int32Array(maxTag - minTag + 1).fill(-1);
  for (let i = 0; i < count; i++) {
    tagToIndex[tagsSeen[i]! - minTag] = i;
  }

  return { coords, tagToIndex, minTag };
}

function parseNodesV41(reader: ByteReader): ParsedNodes {
  const numEntityBlocks = reader.readInt();
  const numNodes = reader.readInt();
  const minNodeTag = reader.readInt();
  const maxNodeTag = reader.readInt();

  const coords = new Float64Array(numNodes * 3);
  const tagToIndex =
    numNodes === 0
      ? emptyTagToIndex()
      : new Int32Array(maxNodeTag - minNodeTag + 1).fill(-1);

  let idx = 0;
  for (let block = 0; block < numEntityBlocks; block++) {
    const entityDim = reader.readInt();
    reader.readInt(); // entityTag, unused here
    const parametric = reader.readInt();
    const numNodesInBlock = reader.readInt();

    const blockTags = new Float64Array(numNodesInBlock);
    for (let i = 0; i < numNodesInBlock; i++) {
      blockTags[i] = reader.readInt();
    }

    const extraParams = parametric === 0 ? 0 : entityDim;
    for (let i = 0; i < numNodesInBlock; i++) {
      const base = (idx + i) * 3;
      coords[base + 0] = reader.readFloat();
      coords[base + 1] = reader.readFloat();
      coords[base + 2] = reader.readFloat();
      for (let k = 0; k < extraParams; k++) reader.readFloat(); // skip u[,v[,w]]
      tagToIndex[blockTags[i]! - minNodeTag] = idx + i;
    }
    idx += numNodesInBlock;
  }

  expectEndSection(reader, "Nodes");
  return { coords, tagToIndex, minTag: minNodeTag };
}

// ---------------------------------------------------------------------------
// $Elements: both formats declare the exact total element count upfront
// (v2.2: the count on the first line of $Elements, which is also the loop
// bound; v4.1: the second header field, summed exactly across entity
// blocks for a well-formed file). That upfront count sizes flat typed-array
// scratch buffers once, with no push()-driven growth or arrays of numbers
// during the scan (CLAUDE.md / decisions.md #11).
//
// Only dimension-3 linear-tet elements (Gmsh type 4) are ever kept: v0.2 is
// pure-tet only, so a dimension-3 element of any other type makes the whole
// file invalid regardless of what else it contains (PLAN.md §3), and lower-
// dimension elements (surface/edge/point, typically the majority of
// elements in a real boundary-layer mesh) are never part of the output
// Mesh. Both cases are therefore handled during the scan itself: a bad
// dim-3 type fails immediately with the same message buildMesh would have
// produced after a full scan, and non-dim-3 elements have their node
// indices read (to stay positioned correctly in the byte stream) and
// discarded, never written to a scratch array. This keeps the node-index
// scratch buffer sized at exactly `headerCount * 4` (one linear tet's worth
// per element), not a generic per-type node-count bound.
// ---------------------------------------------------------------------------

interface ParsedElements {
  count: number; // number of kept (dimension-3, tet-of-any-order) elements
  elementTags: Int32Array; // length = count
  physicals: Int32Array; // length = count
  nodesFlat: Int32Array; // raw Gmsh node tags, 4 corner nodes per kept element
  cellNodeCount: Int32Array; // original per-element node count (4/10/20/35/56), length = count
  // Counts of discarded lower-dimension elements, O(1) extra state (not
  // per-element storage, decisions.md #11 unaffected) kept only so a file
  // with no dimension-3 elements at all can be told apart from one with no
  // elements of any kind -- "no volume cells, did you add a physical
  // group" is the right message for the latter, but misleading for a 2D
  // (surface-only) mesh, which needs a different, more specific message.
  dim0Count: number;
  dim1Count: number;
  dim2Count: number;
  dim2TriangleCount: number; // subset of dim2Count that is a type in TRIANGLE_TYPES
}

function nodeCountForType(type: number): number {
  const n = ELEMENT_NODE_COUNT[type];
  if (n === undefined) {
    fail("elements", `Unsupported Gmsh element type ${type}.`);
  }
  return n;
}

function dimForType(type: number): number {
  const d = ELEMENT_DIM[type];
  if (d === undefined) {
    fail("elements", `Unsupported Gmsh element type ${type}.`);
  }
  return d;
}

function parseElementsV22(reader: ByteReader): ParsedElements {
  const headerCount = reader.readInt();
  const elementTags = new Int32Array(headerCount);
  const physicals = new Int32Array(headerCount);
  const nodesFlat = new Int32Array(headerCount * 4);
  const cellNodeCount = new Int32Array(headerCount);
  let kept = 0;
  let dim0Count = 0;
  let dim1Count = 0;
  let dim2Count = 0;
  let dim2TriangleCount = 0;

  for (let i = 0; i < headerCount; i++) {
    const id = reader.readInt();
    const type = reader.readInt();
    const numTags = reader.readInt();

    let physical = 0;
    for (let t = 0; t < numTags; t++) {
      const v = reader.readInt();
      if (t === 0) physical = v;
    }

    const nodeCount = nodeCountForType(type);
    const dim = dimForType(type);

    if (dim !== 3) {
      // Not part of the output Mesh (surface/edge/point element): consume
      // its node indices to stay correctly positioned, discard them.
      for (let n = 0; n < nodeCount; n++) reader.readInt();
      if (dim === 0) dim0Count++;
      else if (dim === 1) dim1Count++;
      else if (dim === 2) {
        dim2Count++;
        if (TRIANGLE_TYPES.has(type)) dim2TriangleCount++;
      }
      continue;
    }
    if (!TET_TYPES.has(type)) {
      fail("elements", "Only tetrahedral meshes are supported in v0.2.");
    }

    // Corners first (see TET_TYPES's comment), so only the first 4 of
    // `nodeCount` node indices are kept; the rest (mid-edge/face/interior
    // nodes for a higher-order tet) are read to stay correctly positioned
    // in the byte stream and discarded.
    for (let n = 0; n < 4; n++) {
      nodesFlat[kept * 4 + n] = reader.readInt();
    }
    for (let n = 4; n < nodeCount; n++) reader.readInt();
    elementTags[kept] = id;
    physicals[kept] = physical;
    cellNodeCount[kept] = nodeCount;
    kept++;
  }

  expectEndSection(reader, "Elements");
  return {
    count: kept,
    elementTags: elementTags.slice(0, kept),
    physicals: physicals.slice(0, kept),
    nodesFlat: nodesFlat.slice(0, kept * 4),
    cellNodeCount: cellNodeCount.slice(0, kept),
    dim0Count,
    dim1Count,
    dim2Count,
    dim2TriangleCount,
  };
}

function parseElementsV41(
  reader: ByteReader,
  entityPhysical: Map<number, number>[],
): ParsedElements {
  const numEntityBlocks = reader.readInt();
  const totalHint = reader.readInt(); // sizes scratch buffers up front
  reader.readInt(); // minElementTag, unused
  reader.readInt(); // maxElementTag, unused

  let capacity = totalHint > 0 ? totalHint : 0;
  let elementTags = new Int32Array(capacity);
  let physicals = new Int32Array(capacity);
  let nodesFlat = new Int32Array(capacity * 4);
  let cellNodeCount = new Int32Array(capacity);
  let kept = 0;
  let dim0Count = 0;
  let dim1Count = 0;
  let dim2Count = 0;
  let dim2TriangleCount = 0;

  // The v4.1 header's total-element-count hint is exact for well-formed
  // files (it is the sum of every block's declared size), so this never
  // runs in practice. It exists only so a malformed file (hint smaller
  // than the blocks' actual total) grows the scratch buffers instead of
  // silently losing data past the end of a fixed-size typed array.
  function ensureCapacity(need: number): void {
    if (need <= capacity) return;
    let newCapacity = capacity > 0 ? capacity : need;
    while (newCapacity < need) newCapacity *= 2;
    const newTags = new Int32Array(newCapacity);
    newTags.set(elementTags.subarray(0, kept));
    const newPhysicals = new Int32Array(newCapacity);
    newPhysicals.set(physicals.subarray(0, kept));
    const newNodesFlat = new Int32Array(newCapacity * 4);
    newNodesFlat.set(nodesFlat.subarray(0, kept * 4));
    const newCellNodeCount = new Int32Array(newCapacity);
    newCellNodeCount.set(cellNodeCount.subarray(0, kept));
    elementTags = newTags;
    physicals = newPhysicals;
    nodesFlat = newNodesFlat;
    cellNodeCount = newCellNodeCount;
    capacity = newCapacity;
  }

  for (let block = 0; block < numEntityBlocks; block++) {
    const entityDim = reader.readInt();
    const entityTag = reader.readInt();
    const elementType = reader.readInt();
    const numInBlock = reader.readInt();

    const nodeCount = nodeCountForType(elementType);
    const physical = entityPhysical[entityDim]?.get(entityTag) ?? 0;

    if (entityDim !== 3) {
      for (let e = 0; e < numInBlock; e++) {
        reader.readInt(); // tag
        for (let n = 0; n < nodeCount; n++) reader.readInt();
      }
      if (entityDim === 0) dim0Count += numInBlock;
      else if (entityDim === 1) dim1Count += numInBlock;
      else if (entityDim === 2) {
        dim2Count += numInBlock;
        if (TRIANGLE_TYPES.has(elementType)) dim2TriangleCount += numInBlock;
      }
      continue;
    }

    if (!TET_TYPES.has(elementType)) {
      fail("elements", "Only tetrahedral meshes are supported in v0.2.");
    }

    ensureCapacity(kept + numInBlock);
    for (let e = 0; e < numInBlock; e++) {
      const tag = reader.readInt();
      // Corners first (see TET_TYPES's comment): keep only the first 4 of
      // `nodeCount` node indices, read-and-discard the rest.
      for (let n = 0; n < 4; n++) {
        nodesFlat[kept * 4 + n] = reader.readInt();
      }
      for (let n = 4; n < nodeCount; n++) reader.readInt();
      elementTags[kept] = tag;
      physicals[kept] = physical;
      cellNodeCount[kept] = nodeCount;
      kept++;
    }
  }

  expectEndSection(reader, "Elements");
  return {
    count: kept,
    elementTags: elementTags.slice(0, kept),
    physicals: physicals.slice(0, kept),
    nodesFlat: nodesFlat.slice(0, kept * 4),
    cellNodeCount: cellNodeCount.slice(0, kept),
    dim0Count,
    dim1Count,
    dim2Count,
    dim2TriangleCount,
  };
}

// ---------------------------------------------------------------------------
// Top-level driver
// ---------------------------------------------------------------------------

/**
 * Builds the "no 3D cells" error message, distinguishing a genuinely empty
 * $Elements section (or a missing one entirely, `dims` undefined) from a
 * file that has elements but none of them are volume (dimension-3) cells --
 * most commonly a 2D (surface-only) mesh. The physical-group hint is only
 * useful for the former case; showing it for a 2D mesh is misleading, since
 * adding a volume physical group to a file with no volume to tag does
 * nothing.
 */
function noVolumeCellsMessage(
  dims:
    | { dim0Count: number; dim1Count: number; dim2Count: number; dim2TriangleCount: number }
    | undefined,
): string {
  const nonVolumeCount = dims ? dims.dim0Count + dims.dim1Count + dims.dim2Count : 0;
  if (!dims || nonVolumeCount === 0) {
    return "No volume cells found. Did you add a volume physical group in Gmsh?";
  }
  if (dims.dim2Count > 0) {
    const label =
      dims.dim2TriangleCount === dims.dim2Count ? `${dims.dim2Count} triangles` : `${dims.dim2Count} 2D elements`;
    return (
      `This is a 2D mesh (${label}). SimCheck checks 3D tetrahedral meshes — ` +
      "mesh a volume in Gmsh (Mesh → 3D)."
    );
  }
  // Only 0D (points) and/or 1D (lines) elements, no surfaces or volumes.
  return (
    "This mesh has no 3D (tetrahedral) cells. SimCheck checks 3D tetrahedral meshes — " +
    "mesh a volume in Gmsh (Mesh → 3D)."
  );
}

function buildMesh(nodes: ParsedNodes, elements: ParsedElements): Mesh {
  const cellCount = elements.count;

  // parseElementsV22/V41 already filtered to dimension-3 tets (of any
  // order, and failed fast on any other dimension-3 type), so an empty
  // kept set here means the file had no dimension-3 elements at all.
  if (cellCount === 0) {
    fail("elements", noVolumeCellsMessage(elements));
  }

  const conn = new Int32Array(cellCount * 4);
  const { tagToIndex, minTag } = nodes;

  for (let i = 0; i < cellCount; i++) {
    for (let k = 0; k < 4; k++) {
      const gmshTag = elements.nodesFlat[i * 4 + k]!;
      const localIndex = gmshTag - minTag;
      const nodeIndex =
        localIndex >= 0 && localIndex < tagToIndex.length ? tagToIndex[localIndex]! : -1;
      if (nodeIndex === -1) {
        fail(
          "elements",
          `element ${elements.elementTags[i]} references node tag ${gmshTag}, which was not found in $Nodes.`,
        );
      }
      conn[i * 4 + k] = nodeIndex;
    }
  }

  return {
    coords: nodes.coords,
    conn,
    tags: elements.elementTags,
    physical: elements.physicals,
    cellNodeCount: elements.cellNodeCount,
  };
}

function parseGmshInner(chunks: Uint8Array[]): Mesh {
  const reader = new ByteReader(chunks);

  let version: GmshVersion | undefined;
  let entityPhysical: Map<number, number>[] = [new Map(), new Map(), new Map(), new Map()];
  let nodes: ParsedNodes | undefined;
  let elements: ParsedElements | undefined;

  for (;;) {
    reader.skipWhitespace();
    if (reader.atEnd()) break;

    const line = reader.readLine();
    if (!line.startsWith("$")) {
      fail("file", `expected a section header, found "${line}"`);
    }
    const name = line.slice(1);

    switch (name) {
      case "MeshFormat":
        version = parseMeshFormat(reader);
        break;
      case "Entities":
        entityPhysical = parseEntities(reader);
        break;
      case "Nodes":
        if (version === undefined) fail("file", "$Nodes found before $MeshFormat");
        nodes = version === "2.2" ? parseNodesV22(reader) : parseNodesV41(reader);
        break;
      case "Elements":
        if (version === undefined) fail("file", "$Elements found before $MeshFormat");
        if (nodes === undefined) fail("file", "$Elements found before $Nodes");
        elements =
          version === "2.2"
            ? parseElementsV22(reader)
            : parseElementsV41(reader, entityPhysical);
        break;
      // Explicitly ignored: periodicity and partitioning carry no
      // information the pure-tet volume checks in v0.2 need.
      case "Periodic":
      case "PartitionedEntities":
        skipSection(reader, name);
        break;
      default:
        // Any other section (e.g. $PhysicalNames, $Polytopes, $Edges,
        // $Faces, $GhostElements, $Parametrizations, $NodeData,
        // $ElementData, $Comments, ...) is skipped, matching Gmsh's own
        // "unrecognized sections are ignored" rule.
        skipSection(reader, name);
        break;
    }
  }

  if (version === undefined) fail("file", "missing $MeshFormat section");
  if (nodes === undefined) fail("file", "missing $Nodes section");
  if (elements === undefined) {
    fail("elements", noVolumeCellsMessage(undefined));
  }

  return buildMesh(nodes, elements);
}

/**
 * Parses an ASCII Gmsh .msh file (v2.2 or v4.1) into a pure-tet Mesh.
 *
 * Accepts either the whole file as one Uint8Array, or an array of chunks
 * (to simulate chunked/streamed reading, e.g. from File.stream() in the
 * browser once the caller has collected the chunks). A token split across
 * an arbitrary chunk boundary parses identically either way.
 *
 * Returns InputError (never throws) for: non-ASCII/binary files, versions
 * other than 2.2/4.1, meshes with no volume (3D) elements, and meshes whose
 * highest-dimension elements are not all linear tetrahedra (Gmsh type 4).
 */
export function parseGmsh(input: Uint8Array | Uint8Array[]): Result<Mesh> {
  const chunks = Array.isArray(input) ? input : [input];
  try {
    return ok(parseGmshInner(chunks));
  } catch (e) {
    if (e instanceof GmshParseError) {
      return err(e.field, e.message);
    }
    return err("file", e instanceof Error ? e.message : String(e));
  }
}
