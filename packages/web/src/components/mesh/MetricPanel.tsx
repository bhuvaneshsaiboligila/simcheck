import type { MetricResult } from "@simcheck/core";
import { FindingsList } from "../FindingsList";
import { MetricHistogram } from "./MetricHistogram";
import { WorstCellTable } from "./WorstCellTable";

interface MetricPanelProps {
  title: string;
  metric: MetricResult;
  hasHistogram: boolean;
  unit?: string;
}

export function MetricPanel({ title, metric, hasHistogram, unit }: MetricPanelProps) {
  const suffix = unit ?? "";
  return (
    <div className="metric-panel">
      <h3>{title}</h3>
      <p className="metric-stats">
        min {metric.min.toPrecision(4)}
        {suffix} · max {metric.max.toPrecision(4)}
        {suffix} · mean {metric.mean.toPrecision(4)}
        {suffix}
      </p>
      {hasHistogram && metric.histogram && metric.binEdges && (
        <MetricHistogram histogram={metric.histogram} binEdges={metric.binEdges} />
      )}
      <FindingsList findings={metric.findings} />
      <WorstCellTable worst={metric.worst} valueLabel={title} />
    </div>
  );
}
