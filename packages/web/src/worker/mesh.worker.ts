// Mesh-checking Web Worker (PLAN.md §6 architecture diagram, §7 "UI and
// release" step 1; CLAUDE.md "heavy work in a Web Worker so the page never
// freezes"). Pure plumbing: parses the file, builds face adjacency, runs
// the 4 metric functions, and reports progress between stages. Every
// formula and threshold lives in @simcheck/core -- nothing numeric happens
// in this file.
//
// Loaded via Vite's native worker import (`new Worker(new URL(...), {type:
// "module"})`) from the main thread, so this file is a normal ES module;
// it never imports anything DOM-only, and relies only on `self.postMessage`
// / `self.addEventListener("message", ...)`, which are typed through the
// DOM lib already included in tsconfig (no separate "webworker" lib or
// tsconfig needed).

import {
  parseGmsh,
  buildAdjacency,
  volumeFindings,
  aspectRatioFindings,
  nonOrthogonalityFindings,
  skewnessFindings,
} from "@simcheck/core";
import type { MeshCheckResult, WorkerRequest, WorkerResponse } from "./messages.js";

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

function progress(stage: string, pct: number): void {
  post({ type: "progress", stage, pct });
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type !== "check") return;

  // Guards against an unexpected runtime exception anywhere below (a real
  // bug, an edge case the test suite missed) leaving the main thread stuck
  // on the progress bar forever with no error ever posted -- CLAUDE.md
  // "reject clearly, never skip silently" applies here too, not just to
  // the two already-handled Result failures.
  try {
    const fileBytes = new Uint8Array(request.bytes);

    const meshResult = parseGmsh(fileBytes);
    if (!meshResult.ok) {
      post({ type: "error", error: meshResult.error });
      return;
    }
    const mesh = meshResult.value;
    progress("Parsed mesh", 20);

    const adjacencyResult = buildAdjacency(mesh);
    if (!adjacencyResult.ok) {
      post({ type: "error", error: adjacencyResult.error });
      return;
    }
    const adjacency = adjacencyResult.value;
    progress("Built face adjacency", 40);

    const volume = volumeFindings(mesh, adjacency);
    progress("Computed volume", 55);

    const aspectRatio = aspectRatioFindings(mesh, adjacency);
    progress("Computed aspect ratio", 70);

    const nonOrthogonality = nonOrthogonalityFindings(mesh, adjacency);
    progress("Computed non-orthogonality", 85);

    const skewness = skewnessFindings(mesh, adjacency);
    progress("Computed skewness", 100);

    const result: MeshCheckResult = {
      cellCount: mesh.conn.length / 4,
      volume,
      aspectRatio,
      nonOrthogonality,
      skewness,
    };

    post({ type: "done", result });
  } catch (e) {
    post({
      type: "error",
      error: {
        kind: "input-error",
        field: "file",
        message: e instanceof Error ? e.message : String(e),
      },
    });
  }
});
