import type { Finding } from "@simcheck/core";

export function FindingsList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return null;
  }
  return (
    <div className="findings">
      {findings.map((f) => (
        <div key={f.title} className={`finding finding-${f.severity}`}>
          <p className="finding-title">
            <span className={`severity-badge severity-${f.severity}`}>{f.severity}</span>
            {f.title}
          </p>
          <p className="finding-message">{f.message}</p>
          <p className="finding-why">{f.why}</p>
          {f.fix && <p className="finding-fix">Fix: {f.fix}</p>}
          {f.reference && <p className="finding-reference">source: {f.reference}</p>}
        </div>
      ))}
    </div>
  );
}
