// Parse + adjacency benchmark (PLAN.md §4 milestone 4 gate: "1M tets parse
// < 3 s"; milestone 5 gate: "1M tets [adjacency builds] < 2 s"; §8 v0.2
// definition of done: "1M tets parse in under 3 s and adjacency builds in
// under 2 s (Node benchmark)"; v0.2 step "Parser" point 6: "Benchmark
// script: time and peak memory (RSS) on 100k and 1M tets"; v0.2 step
// "Adjacency" + "Face adjacency + benchmark" milestone).
//
// Measures wall-clock parse time (parseGmsh) and adjacency-build time
// (buildAdjacency), separately, plus combined peak RSS, on two real
// Gmsh-meshed test meshes (meshes/bench-cube.geo, meshed by gmsh at two
// characteristic lengths -- see meshes/README.md). Not synthetic data.
//
// Peak RSS is measured by re-running parse+adjacency in a child process
// wrapped with `/usr/bin/time -v`, which reports the OS's "Maximum
// resident set size" for that process -- the true peak, not a value
// sampled from inside the running process. If `/usr/bin/time` is
// unavailable, falls back to process.memoryUsage().rss sampled immediately
// after buildAdjacency() returns, which is NOT a true peak (it can miss a
// higher intermediate peak during either stage) -- this fallback is
// clearly labelled as such in the printed report.
//
// This file is compiled by its own tsconfig (tsconfig.bench.json) into
// bench-dist/ and run with plain `node`, kept separate from the package's
// published build (tsconfig.json only includes src/). See "bench" script
// in package.json.
//
// Usage:
//   pnpm --filter core bench
//
// Requires meshes/bench-100k.msh and meshes/bench-1m.msh to already exist
// locally (generated from meshes/bench-cube.geo with gmsh; see
// meshes/README.md). These files are gitignored, not committed.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseGmsh } from "../src/parsers/gmsh.js";
import { buildAdjacency } from "../src/geometry/adjacency.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Child mode: parse + build adjacency for exactly one file and print
// machine-readable results on stdout. Invoked by the parent (optionally
// wrapped by `/usr/bin/time -v`) so timings and RSS are measured for a
// process that does only parse+adjacency, not the orchestration/reporting
// logic too.
// ---------------------------------------------------------------------------

function runChild(filePath: string): void {
  const bytes = readFileSync(filePath);

  const t0 = process.hrtime.bigint();
  const parsed = parseGmsh(bytes);
  const t1 = process.hrtime.bigint();

  if (!parsed.ok) {
    console.error(`PARSE_ERROR:${parsed.error.field}:${parsed.error.message}`);
    process.exit(1);
  }

  const t2 = process.hrtime.bigint();
  const adjacency = buildAdjacency(parsed.value);
  const t3 = process.hrtime.bigint();

  if (!adjacency.ok) {
    console.error(`ADJACENCY_ERROR:${adjacency.error.field}:${adjacency.error.message}`);
    process.exit(1);
  }

  const parseMs = Number(t1 - t0) / 1e6;
  const adjacencyMs = Number(t3 - t2) / 1e6;
  const rssKb = process.memoryUsage().rss / 1024;

  console.log(`PARSE_MS:${parseMs}`);
  console.log(`ADJACENCY_MS:${adjacencyMs}`);
  console.log(`CELLS:${parsed.value.tags.length}`);
  console.log(`NODES:${parsed.value.coords.length / 3}`);
  console.log(`FACE_COUNT:${adjacency.value.faceCount}`);
  console.log(`INTERNAL_COUNT:${adjacency.value.internalCount}`);
  console.log(`BOUNDARY_COUNT:${adjacency.value.boundaryCount}`);
  console.log(`RSS_KB:${rssKb}`);
}

// ---------------------------------------------------------------------------
// Parent mode: find repo root, locate the two benchmark meshes, spawn a
// child process per mesh, parse its stdout/stderr, print a report.
// ---------------------------------------------------------------------------

interface BenchResult {
  file: string;
  cells: number;
  nodes: number;
  faceCount: number;
  internalCount: number;
  boundaryCount: number;
  parseMs: number;
  adjacencyMs: number;
  peakRssMb: number | null;
  sampledRssMb: number;
}

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("could not find repo root (no pnpm-workspace.yaml found above " + startDir + ")");
    }
    dir = parent;
  }
}

function hasUsrBinTime(): boolean {
  return existsSync("/usr/bin/time");
}

function benchFile(filePath: string, useTimeV: boolean): BenchResult {
  const childArgs = ["--child", filePath];
  const spawnCmd = useTimeV ? "/usr/bin/time" : process.execPath;
  const spawnArgs = useTimeV
    ? ["-v", process.execPath, __filename, ...childArgs]
    : [__filename, ...childArgs];

  const res = spawnSync(spawnCmd, spawnArgs, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(
      `benchmark child process failed for ${filePath} (exit ${res.status}):\n${res.stdout}\n${res.stderr}`,
    );
  }

  const stdout = res.stdout;
  const stderr = res.stderr;

  const parseMsMatch = /PARSE_MS:([0-9.eE+-]+)/.exec(stdout);
  const adjacencyMsMatch = /ADJACENCY_MS:([0-9.eE+-]+)/.exec(stdout);
  const cellsMatch = /CELLS:(\d+)/.exec(stdout);
  const nodesMatch = /NODES:(\d+)/.exec(stdout);
  const faceCountMatch = /FACE_COUNT:(\d+)/.exec(stdout);
  const internalCountMatch = /INTERNAL_COUNT:(\d+)/.exec(stdout);
  const boundaryCountMatch = /BOUNDARY_COUNT:(\d+)/.exec(stdout);
  const rssKbMatch = /RSS_KB:([0-9.eE+-]+)/.exec(stdout);
  if (
    !parseMsMatch ||
    !adjacencyMsMatch ||
    !cellsMatch ||
    !nodesMatch ||
    !faceCountMatch ||
    !internalCountMatch ||
    !boundaryCountMatch ||
    !rssKbMatch
  ) {
    throw new Error(`could not parse child output for ${filePath}:\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }

  let peakRssMb: number | null = null;
  if (useTimeV) {
    const m = /Maximum resident set size \(kbytes\):\s*(\d+)/.exec(stderr);
    if (m) peakRssMb = Number(m[1]) / 1024;
  }

  return {
    file: filePath,
    cells: Number(cellsMatch[1]),
    nodes: Number(nodesMatch[1]),
    faceCount: Number(faceCountMatch[1]),
    internalCount: Number(internalCountMatch[1]),
    boundaryCount: Number(boundaryCountMatch[1]),
    parseMs: Number(parseMsMatch[1]),
    adjacencyMs: Number(adjacencyMsMatch[1]),
    peakRssMb,
    sampledRssMb: Number(rssKbMatch[1]) / 1024,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv[0] === "--child") {
    runChild(argv[1]!);
    return;
  }

  const repoRoot = findRepoRoot(__dirname);
  const meshDir = path.join(repoRoot, "meshes");
  const useTimeV = hasUsrBinTime();

  const targets: { label: string; file: string; parseGateMs: number | null; adjacencyGateMs: number | null }[] = [
    { label: "~100k tets", file: path.join(meshDir, "bench-100k.msh"), parseGateMs: null, adjacencyGateMs: null },
    { label: "~1M tets", file: path.join(meshDir, "bench-1m.msh"), parseGateMs: 3000, adjacencyGateMs: 2000 },
  ];

  console.log("Parse + adjacency benchmark (parseGmsh + buildAdjacency)");
  console.log(
    useTimeV
      ? "RSS measurement: /usr/bin/time -v, child process, true OS peak RSS (combined parse+adjacency)"
      : "RSS measurement: process.memoryUsage().rss sampled right after buildAdjacency() returns " +
          "-- NOT a true peak (no /usr/bin/time found); informational only",
  );
  console.log("");

  let anyMissing = false;
  let anyGateFailed = false;
  for (const t of targets) {
    if (!existsSync(t.file)) {
      anyMissing = true;
      console.log(`SKIP ${t.label}: ${t.file} not found.`);
      console.log("  Generate it from meshes/bench-cube.geo with gmsh -- see meshes/README.md.");
      console.log("");
      continue;
    }

    const r = benchFile(t.file, useTimeV);
    const totalMs = r.parseMs + r.adjacencyMs;
    console.log(`${t.label} -- ${path.basename(r.file)}`);
    console.log(`  tets (cells):     ${r.cells.toLocaleString()}`);
    console.log(`  nodes:            ${r.nodes.toLocaleString()}`);
    console.log(
      `  faces:            ${r.faceCount.toLocaleString()} (internal ${r.internalCount.toLocaleString()}, boundary ${r.boundaryCount.toLocaleString()})`,
    );
    console.log(`  parse time:       ${r.parseMs.toFixed(1)} ms`);
    console.log(`  adjacency time:   ${r.adjacencyMs.toFixed(1)} ms`);
    console.log(`  total time:       ${totalMs.toFixed(1)} ms`);
    console.log(
      `  peak RSS:         ${r.peakRssMb !== null ? r.peakRssMb.toFixed(1) + " MB (true peak)" : "n/a"}`,
    );
    console.log(`  sampled RSS:      ${r.sampledRssMb.toFixed(1)} MB (process.memoryUsage after buildAdjacency)`);
    if (t.parseGateMs !== null) {
      const pass = r.parseMs < t.parseGateMs;
      if (!pass) anyGateFailed = true;
      console.log(
        `  parse gate (< ${t.parseGateMs} ms):     ${pass ? "PASS" : "FAIL"} (${r.parseMs.toFixed(1)} ms, margin ${(t.parseGateMs - r.parseMs).toFixed(1)} ms)`,
      );
    }
    if (t.adjacencyGateMs !== null) {
      const pass = r.adjacencyMs < t.adjacencyGateMs;
      if (!pass) anyGateFailed = true;
      console.log(
        `  adjacency gate (< ${t.adjacencyGateMs} ms): ${pass ? "PASS" : "FAIL"} (${r.adjacencyMs.toFixed(1)} ms, margin ${(t.adjacencyGateMs - r.adjacencyMs).toFixed(1)} ms)`,
      );
    }
    console.log("");
  }

  if (anyMissing || anyGateFailed) {
    if (anyMissing) console.log("One or more benchmark meshes were missing; see messages above.");
    if (anyGateFailed) console.log("One or more gates failed; see messages above.");
    process.exitCode = 1;
  }
}

main();
