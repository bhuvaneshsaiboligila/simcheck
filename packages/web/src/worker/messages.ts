// Message protocol between the main thread and the mesh-checking Web Worker
// (PLAN.md §7 "UI and release" step 1, §6 architecture diagram). Pure
// plumbing types: the worker computes nothing itself beyond calling into
// @simcheck/core, and this file never carries any physics or threshold.

import type { InputError, MetricResult } from "@simcheck/core";

export interface MeshCheckResult {
  cellCount: number;
  volume: MetricResult;
  aspectRatio: MetricResult;
  nonOrthogonality: MetricResult;
  skewness: MetricResult;
}

/** Sent from the main thread to the worker: the raw .msh file bytes. */
export interface WorkerRequest {
  type: "check";
  bytes: ArrayBuffer;
}

/**
 * Progress weighting (main-thread-authored, not from @simcheck/core):
 * parse 20%, adjacency 40% (adjacency is ~2.5x parse cost per the core
 * benchmarks), then the 4 metrics split the remaining 60% evenly at 15%
 * each, since each metric function runs well under 1s even on a 1M-tet
 * mesh and is cheap relative to parsing and adjacency.
 */
export interface WorkerProgress {
  type: "progress";
  stage: string;
  pct: number;
}

/** Sent when parseGmsh or buildAdjacency returns ok: false. */
export interface WorkerError {
  type: "error";
  error: InputError;
}

export interface WorkerDone {
  type: "done";
  result: MeshCheckResult;
}

export type WorkerResponse = WorkerProgress | WorkerError | WorkerDone;
