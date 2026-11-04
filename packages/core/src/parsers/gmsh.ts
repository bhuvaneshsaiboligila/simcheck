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

const LINEAR_TET_TYPE = 4;

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
// $Elements: collected into parallel arrays (one entry per element), kept
// generic over every element dimension/type present so the highest-dimension
// filter and the pure-tet check can be applied afterwards.
// ---------------------------------------------------------------------------

interface ParsedElements {
  dims: number[];
  types: number[];
  elementTags: number[];
  physicals: number[];
  nodeOffsets: number[]; // length = elements + 1
  nodesFlat: number[]; // raw Gmsh node tags, concatenated per element
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
  const count = reader.readInt();
  const dims: number[] = [];
  const types: number[] = [];
  const elementTags: number[] = [];
  const physicals: number[] = [];
  const nodeOffsets: number[] = [0];
  const nodesFlat: number[] = [];

  for (let i = 0; i < count; i++) {
    const id = reader.readInt();
    const type = reader.readInt();
    const numTags = reader.readInt();

    let physical = 0;
    for (let t = 0; t < numTags; t++) {
      const v = reader.readInt();
      if (t === 0) physical = v;
    }

    const nodeCount = nodeCountForType(type);
    for (let n = 0; n < nodeCount; n++) nodesFlat.push(reader.readInt());

    dims.push(dimForType(type));
    types.push(type);
    elementTags.push(id);
    physicals.push(physical);
    nodeOffsets.push(nodesFlat.length);
  }

  expectEndSection(reader, "Elements");
  return { dims, types, elementTags, physicals, nodeOffsets, nodesFlat };
}

function parseElementsV41(
  reader: ByteReader,
  entityPhysical: Map<number, number>[],
): ParsedElements {
  const numEntityBlocks = reader.readInt();
  reader.readInt(); // total element count, unused (we grow arrays as we go)
  reader.readInt(); // minElementTag, unused
  reader.readInt(); // maxElementTag, unused

  const dims: number[] = [];
  const types: number[] = [];
  const elementTags: number[] = [];
  const physicals: number[] = [];
  const nodeOffsets: number[] = [0];
  const nodesFlat: number[] = [];

  for (let block = 0; block < numEntityBlocks; block++) {
    const entityDim = reader.readInt();
    const entityTag = reader.readInt();
    const elementType = reader.readInt();
    const numInBlock = reader.readInt();

    const nodeCount = nodeCountForType(elementType);
    const physical = entityPhysical[entityDim]?.get(entityTag) ?? 0;

    for (let e = 0; e < numInBlock; e++) {
      const tag = reader.readInt();
      for (let n = 0; n < nodeCount; n++) nodesFlat.push(reader.readInt());

      dims.push(entityDim);
      types.push(elementType);
      elementTags.push(tag);
      physicals.push(physical);
      nodeOffsets.push(nodesFlat.length);
    }
  }

  expectEndSection(reader, "Elements");
  return { dims, types, elementTags, physicals, nodeOffsets, nodesFlat };
}

// ---------------------------------------------------------------------------
// Top-level driver
// ---------------------------------------------------------------------------

function buildMesh(nodes: ParsedNodes, elements: ParsedElements): Mesh {
  const elementCount = elements.dims.length;

  let maxDim = -1;
  for (let i = 0; i < elementCount; i++) {
    const d = elements.dims[i]!;
    if (d > maxDim) maxDim = d;
  }

  if (maxDim !== 3) {
    fail(
      "elements",
      "No volume cells found. Did you add a volume physical group in Gmsh?",
    );
  }

  let cellCount = 0;
  for (let i = 0; i < elementCount; i++) {
    if (elements.dims[i] === maxDim) cellCount++;
  }

  for (let i = 0; i < elementCount; i++) {
    if (elements.dims[i] === maxDim && elements.types[i] !== LINEAR_TET_TYPE) {
      fail("elements", "Only pure tetrahedral meshes are supported in v0.2.");
    }
  }

  const conn = new Int32Array(cellCount * 4);
  const tags = new Int32Array(cellCount);
  const physical = new Int32Array(cellCount);

  const { tagToIndex, minTag } = nodes;
  let cursor = 0;
  for (let i = 0; i < elementCount; i++) {
    if (elements.dims[i] !== maxDim) continue;

    const start = elements.nodeOffsets[i]!;
    const end = elements.nodeOffsets[i + 1]!;
    for (let k = start; k < end; k++) {
      const gmshTag = elements.nodesFlat[k]!;
      const localIndex = gmshTag - minTag;
      const nodeIndex =
        localIndex >= 0 && localIndex < tagToIndex.length ? tagToIndex[localIndex]! : -1;
      if (nodeIndex === -1) {
        fail(
          "elements",
          `element ${elements.elementTags[i]} references node tag ${gmshTag}, which was not found in $Nodes.`,
        );
      }
      conn[cursor * 4 + (k - start)] = nodeIndex;
    }
    tags[cursor] = elements.elementTags[i]!;
    physical[cursor] = elements.physicals[i]!;
    cursor++;
  }

  return { coords: nodes.coords, conn, tags, physical };
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
    fail(
      "elements",
      "No volume cells found. Did you add a volume physical group in Gmsh?",
    );
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
