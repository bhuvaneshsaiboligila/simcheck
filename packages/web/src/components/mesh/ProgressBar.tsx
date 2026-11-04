interface ProgressBarProps {
  stage: string;
  pct: number;
}

export function ProgressBar({ stage, pct }: ProgressBarProps) {
  return (
    <div
      className="progress-container"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-label">
        {stage || "Processing"}… {pct}%
      </p>
    </div>
  );
}
