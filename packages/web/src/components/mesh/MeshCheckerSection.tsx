import { useCallback, useEffect, useRef, useState } from "react";
import type { InputError } from "@simcheck/core";
import type { MeshCheckResult, WorkerRequest, WorkerResponse } from "../../worker/messages";
import { buildMeshReport, buildWorstCellsCsv, downloadFile, reportBaseName } from "../../lib/meshReport";
import { ErrorNotice } from "../ErrorNotice";
import { FindingsList } from "../FindingsList";
import { DropZone } from "./DropZone";
import { ProgressBar } from "./ProgressBar";
import { MetricPanel } from "./MetricPanel";

type Status = "idle" | "processing" | "done" | "error";

export function MeshCheckerSection() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<{ stage: string; pct: number }>({ stage: "", pct: 0 });
  const [error, setError] = useState<InputError | null>(null);
  const [result, setResult] = useState<MeshCheckResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("../../worker/mesh.worker.ts", import.meta.url), {
        type: "module",
      });
    }
    return workerRef.current;
  }, []);

  // Terminate the worker when the mesh checker unmounts (e.g. switching back
  // to the flow calculator tab), so a half-finished check on a huge mesh
  // doesn't keep running in the background.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setStatus("processing");
      setError(null);
      setResult(null);
      setFileName(file.name);
      setProgress({ stage: "Reading file", pct: 0 });

      const worker = getWorker();

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.type === "progress") {
          setProgress({ stage: message.stage, pct: message.pct });
        } else if (message.type === "error") {
          setError(message.error);
          setStatus("error");
        } else {
          setResult(message.result);
          setStatus("done");
        }
      };

      void file.arrayBuffer().then((buffer) => {
        const request: WorkerRequest = { type: "check", bytes: buffer };
        worker.postMessage(request, [buffer]);
      });
    },
    [getWorker],
  );

  const handleDownloadJson = useCallback(() => {
    if (!result || !fileName) return;
    const report = buildMeshReport(fileName, result);
    downloadFile(`${reportBaseName(fileName)}-report.json`, JSON.stringify(report, null, 2), "application/json");
  }, [result, fileName]);

  const handleDownloadCsv = useCallback(() => {
    if (!result || !fileName) return;
    downloadFile(`${reportBaseName(fileName)}-worst-cells.csv`, buildWorstCellsCsv(result), "text/csv");
  }, [result, fileName]);

  return (
    <section className="panel mesh-panel">
      <h2>Mesh checker</h2>
      <p className="field-hint">
        Drop a pure-tet Gmsh <code>.msh</code> file (v2.2 or v4.1, ASCII) to check volume, aspect
        ratio, non-orthogonality and skewness against OpenFOAM checkMesh's definitions.
      </p>

      <DropZone onFile={handleFile} fileName={fileName} disabled={status === "processing"} />

      {status === "processing" && <ProgressBar stage={progress.stage} pct={progress.pct} />}

      {status === "error" && error && <ErrorNotice error={error} />}

      {status === "done" && result && (
        <div className="mesh-results">
          <div className="mesh-summary-row">
            <p className="mesh-summary">
              <strong>{result.cellCount.toLocaleString()}</strong> tetrahedral cells checked.
            </p>
            <div className="mesh-download-buttons">
              <button type="button" className="fill-button" onClick={handleDownloadJson}>
                Download report (JSON)
              </button>
              <button type="button" className="fill-button" onClick={handleDownloadCsv}>
                Download worst cells (CSV)
              </button>
            </div>
          </div>
          <FindingsList findings={result.notes} />
          <MetricPanel title="Volume" metric={result.volume} hasHistogram={false} />
          <MetricPanel title="Aspect ratio" metric={result.aspectRatio} hasHistogram />
          <MetricPanel
            title="Non-orthogonality"
            metric={result.nonOrthogonality}
            hasHistogram
            unit="°"
          />
          <MetricPanel title="Skewness" metric={result.skewness} hasHistogram />
        </div>
      )}
    </section>
  );
}
