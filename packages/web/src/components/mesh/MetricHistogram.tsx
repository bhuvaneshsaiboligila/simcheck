interface MetricHistogramProps {
  histogram: Uint32Array;
  binEdges: Float64Array;
}

export function MetricHistogram({ histogram, binEdges }: MetricHistogramProps) {
  let max = 0;
  for (const count of histogram) {
    if (count > max) max = count;
  }

  return (
    <div className="histogram">
      {Array.from(histogram).map((count, i) => {
        const lo = binEdges[i]!;
        const hi = binEdges[i + 1]!;
        const heightPct = max > 0 ? (count / max) * 100 : 0;
        return (
          <div
            className="histogram-bar-wrap"
            key={i}
            title={`${lo.toPrecision(4)} – ${hi.toPrecision(4)}: ${count} cells`}
          >
            <div className="histogram-bar" style={{ height: `${heightPct}%` }} />
          </div>
        );
      })}
    </div>
  );
}
