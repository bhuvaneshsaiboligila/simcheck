// Parser benchmark (PLAN.md §4 milestone 4 gate: "1M tets parse < 3 s",
// §8 v0.2 definition of done "1M tets parse in under 3 s (Node benchmark)",
// and v0.2 step "Parser" point 6: "Benchmark script: time and peak memory
// (RSS) on 100k and 1M tets").
//
// Measures wall-clock parse time and peak RSS for parseGmsh() on two real
// Gmsh-meshed test meshes (meshes/bench-cube.geo, meshed by gmsh at two
// characteristic lengths — see meshes/README.md). Not synthetic data.
//
// Peak RSS is measured by re-running the parse in a child process wrapped
// with `/usr/bin/time -v`, which reports the OS's "Maximum resident set
// size" for that process — the true peak, not a value sampled from inside
// the running process. If `/usr/bin/time` is unavailable, falls back to
// process.memoryUsage().rss sampled immediately after the parse call
// returns, which is NOT a true peak (it can miss a higher intermediate
// peak during parsing, e.g. transient arrays freed before the sample) —
// this fallback is clearly labelled as such in the printed report.
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Child mode: parse exactly one file and print machine-readable results on
// stdout. Invoked by the parent (optionally wrapped by `/usr/bin/time -v`)
// so parse time and RSS are measured for a process that does only the
// parse, not the orchestration/reporting logic too.
// ---------------------------------------------------------------------------

function runChild(filePath: string): void {
  const bytes = readFileSync(filePath);

  const t0 = process.hrtime.bigint();
  const result = parseGmsh(bytes);
  const t1 = process.hrtime.bigint();

  if (!result.ok) {
    console.error(`PARSE_ERROR:${result.error.field}:${result.error.message}`);
    process.exit(1);
  }

  const parseMs = Number(t1 - t0) / 1e6;
  const rssKb = process.memoryUsage().rss / 1024;

  console.log(`PARSE_MS:${parseMs}`);
  console.log(`CELLS:${result.value.tags.length}`);
  console.log(`NODES:${result.value.coords.length / 3}`);
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
  parseMs: number;
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
  const cellsMatch = /CELLS:(\d+)/.exec(stdout);
  const nodesMatch = /NODES:(\d+)/.exec(stdout);
  const rssKbMatch = /RSS_KB:([0-9.eE+-]+)/.exec(stdout);
  if (!parseMsMatch || !cellsMatch || !nodesMatch || !rssKbMatch) {
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
    parseMs: Number(parseMsMatch[1]),
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

  const targets: { label: string; file: string; gateMs: number | null }[] = [
    { label: "~100k tets", file: path.join(meshDir, "bench-100k.msh"), gateMs: null },
    { label: "~1M tets", file: path.join(meshDir, "bench-1m.msh"), gateMs: 3000 },
  ];

  console.log("Parser benchmark (parseGmsh)");
  console.log(
    useTimeV
      ? "RSS measurement: /usr/bin/time -v, child process, true OS peak RSS"
      : "RSS measurement: process.memoryUsage().rss sampled right after parse() returns " +
          "-- NOT a true peak (no /usr/bin/time found); informational only",
  );
  console.log("");

  let anyMissing = false;
  for (const t of targets) {
    if (!existsSync(t.file)) {
      anyMissing = true;
      console.log(`SKIP ${t.label}: ${t.file} not found.`);
      console.log("  Generate it from meshes/bench-cube.geo with gmsh -- see meshes/README.md.");
      console.log("");
      continue;
    }

    const r = benchFile(t.file, useTimeV);
    console.log(`${t.label} -- ${path.basename(r.file)}`);
    console.log(`  tets (cells):     ${r.cells.toLocaleString()}`);
    console.log(`  nodes:            ${r.nodes.toLocaleString()}`);
    console.log(`  parse time:       ${r.parseMs.toFixed(1)} ms`);
    console.log(
      `  peak RSS:         ${r.peakRssMb !== null ? r.peakRssMb.toFixed(1) + " MB (true peak)" : "n/a"}`,
    );
    console.log(`  sampled RSS:      ${r.sampledRssMb.toFixed(1)} MB (process.memoryUsage after parse)`);
    if (t.gateMs !== null) {
      const pass = r.parseMs < t.gateMs;
      console.log(
        `  gate (< ${t.gateMs} ms): ${pass ? "PASS" : "FAIL"} (${r.parseMs.toFixed(1)} ms)`,
      );
    }
    console.log("");
  }

  if (anyMissing) {
    console.log("One or more benchmark meshes were missing; see messages above.");
    process.exitCode = 1;
  }
}

main();
