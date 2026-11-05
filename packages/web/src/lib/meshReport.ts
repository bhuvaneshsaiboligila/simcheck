// Mesh-check report export (PLAN.md §7 "UI and release"). Client-side
// only: builds a plain, JSON-serializable object and a CSV string from the
// worker's result, then triggers a browser download via a Blob object URL
// -- no server, no network request, consistent with decisions.md #1.

import { OPENFOAM_REFERENCE_VERSION, VERSION, type Finding, type MetricResult } from "@simcheck/core";
import type { MeshCheckResult } from "../worker/messages";

export interface MeshReport {
  fileName: string;
  simcheckVersion: string;
  openfoamReferenceVersion: string;
  generatedAt: string; // ISO 8601
  cellCount: number;
  notes: Finding[];
  metrics: {
    volume: SerializedMetricResult;
    aspectRatio: SerializedMetricResult;
    nonOrthogonality: SerializedMetricResult;
    skewness: SerializedMetricResult;
  };
}

// MetricResult's histogram/binEdges are typed arrays (Uint32Array/
// Float64Array), which JSON.stringify does NOT serialize as plain arrays
// (Array.isArray is false for them, so they'd stringify as {"0":1,"1":2,...}
// objects instead) -- converted to real arrays here so the exported JSON is
// actually an array, not that object-with-numeric-keys shape.
interface SerializedMetricResult {
  histogram: number[] | null;
  binEdges: number[] | null;
  min: number;
  max: number;
  mean: number;
  worst: MetricResult["worst"];
  findings: Finding[];
}

function serializeMetric(metric: MetricResult): SerializedMetricResult {
  return {
    histogram: metric.histogram ? Array.from(metric.histogram) : null,
    binEdges: metric.binEdges ? Array.from(metric.binEdges) : null,
    min: metric.min,
    max: metric.max,
    mean: metric.mean,
    worst: metric.worst,
    findings: metric.findings,
  };
}

export function buildMeshReport(fileName: string, result: MeshCheckResult): MeshReport {
  return {
    fileName,
    simcheckVersion: VERSION,
    openfoamReferenceVersion: OPENFOAM_REFERENCE_VERSION,
    generatedAt: new Date().toISOString(),
    cellCount: result.cellCount,
    notes: result.notes,
    metrics: {
      volume: serializeMetric(result.volume),
      aspectRatio: serializeMetric(result.aspectRatio),
      nonOrthogonality: serializeMetric(result.nonOrthogonality),
      skewness: serializeMetric(result.skewness),
    },
  };
}

const CSV_COLUMNS = ["metric", "tag", "x", "y", "z", "physical", "value"] as const;

function csvField(value: string | number): string {
  const s = String(value);
  // Minimal RFC 4180 quoting: only when the field actually needs it.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One combined CSV of every metric's worst-cell table, with a `metric`
 * column distinguishing them (decisions.md #29: each metric's `worst` list
 * is already capped at 50 and pre-filtered to offending cells only). */
export function buildWorstCellsCsv(result: MeshCheckResult): string {
  const rows: string[] = [CSV_COLUMNS.join(",")];
  const metrics: [string, MetricResult][] = [
    ["volume", result.volume],
    ["aspectRatio", result.aspectRatio],
    ["nonOrthogonality", result.nonOrthogonality],
    ["skewness", result.skewness],
  ];
  for (const [name, metric] of metrics) {
    for (const cell of metric.worst) {
      rows.push(
        [name, cell.tag, cell.centroid[0], cell.centroid[1], cell.centroid[2], cell.physical, cell.value]
          .map(csvField)
          .join(","),
      );
    }
  }
  return rows.join("\r\n") + "\r\n";
}

/** Triggers a browser download of `content` as `filename`, entirely
 * client-side: a Blob object URL and a synthetic click on a hidden `<a>`,
 * revoked immediately after. */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Strips a trailing `.msh` (or any extension) and unsafe filename
 * characters, for building `<name>-report.json` / `<name>-worst-cells.csv`. */
export function reportBaseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./\\]+$/, "");
  return withoutExt.replace(/[^a-zA-Z0-9_-]/g, "_") || "mesh";
}
