// Shared helpers for the 4 mesh-metric findings modules (volume.ts,
// aspectRatio.ts, nonOrthogonality.ts, skewness.ts). Not part of the public
// API (not re-exported from index.ts). Decisions.md #11/#29: flat typed
// arrays throughout, 20-bin histograms, data-driven bin edges with
// epsilon-expansion for degenerate (min === max) ranges.

import type { Mesh, WorstCell } from "../../types.js";

const BINS = 20;

/** min/max/mean of a flat Float64Array; mean is 0 for an empty array. */
export function basicStats(values: Float64Array): { min: number; max: number; mean: number } {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: values.length > 0 ? sum / values.length : 0 };
}

/**
 * 20 log-spaced bins over `values`' own [min, max] range (decisions.md #17:
 * aspect ratio uses log bins). Degenerate range (dataMin === dataMax, e.g. a
 * 1-cell mesh) is expanded multiplicatively by 1e-9 on each side before
 * computing edges, per decisions.md #29.
 */
export function logBinned(values: Float64Array): { histogram: Uint32Array; binEdges: Float64Array } {
  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < dataMin) dataMin = v;
    if (v > dataMax) dataMax = v;
  }

  let lo = dataMin;
  let hi = dataMax;
  if (lo === hi) {
    lo = lo * (1 - 1e-9);
    hi = hi * (1 + 1e-9);
  }

  const histogram = new Uint32Array(BINS);
  const binEdges = new Float64Array(BINS + 1);
  const ratio = hi / lo;
  const logRatio = Math.log(ratio);
  for (let i = 0; i <= BINS; i++) {
    binEdges[i] = lo * Math.pow(ratio, i / BINS);
  }

  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    let idx = Math.floor((Math.log(v / lo) / logRatio) * BINS);
    if (idx < 0) idx = 0;
    if (idx >= BINS) idx = BINS - 1;
    histogram[idx]!++;
  }

  return { histogram, binEdges };
}

/**
 * 20 linear bins from 0 to `values`' own max (data-driven upper edge, not a
 * fixed universal one). Degenerate dataMax === 0 (e.g. a mesh with no
 * non-orthogonality at all) is floored to 1e-9, per decisions.md #29, so
 * `binEdges` stays strictly monotonic and no division by zero occurs.
 */
export function linearBinnedFromZero(values: Float64Array): { histogram: Uint32Array; binEdges: Float64Array } {
  let dataMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v > dataMax) dataMax = v;
  }

  const hi = Math.max(dataMax, 1e-9);

  const histogram = new Uint32Array(BINS);
  const binEdges = new Float64Array(BINS + 1);
  for (let i = 0; i <= BINS; i++) {
    binEdges[i] = (hi * i) / BINS;
  }

  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    let idx = Math.floor((v / hi) * BINS);
    if (idx < 0) idx = 0;
    if (idx >= BINS) idx = BINS - 1;
    histogram[idx]!++;
  }

  return { histogram, binEdges };
}

/** Builds the up-to-50 worst-cell table for a list of already-sorted,
 * already-filtered cell indices (decisions.md #29: capped 50, offending
 * cells only). */
export function buildWorst(
  mesh: Mesh,
  values: Float64Array,
  centroids: Float64Array,
  sortedIndices: number[],
): WorstCell[] {
  const cap = Math.min(50, sortedIndices.length);
  const worst: WorstCell[] = [];
  for (let i = 0; i < cap; i++) {
    const t = sortedIndices[i]!;
    worst.push({
      tag: mesh.tags[t]!,
      centroid: [centroids[t * 3 + 0]!, centroids[t * 3 + 1]!, centroids[t * 3 + 2]!],
      physical: mesh.physical[t]!,
      value: values[t]!,
    });
  }
  return worst;
}

/** `(count/total*100).toFixed(1)`, per every message template in this task's spec. */
export function pctOfTotal(count: number, total: number): string {
  return ((count / total) * 100).toFixed(1);
}
