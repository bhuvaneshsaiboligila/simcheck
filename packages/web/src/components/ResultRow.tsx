import { formatNumber } from "../lib/format";

interface ResultRowProps {
  label: string;
  value: number;
  unit?: string;
  formula?: string;
  reference?: string;
  note?: string;
}

export function ResultRow({ label, value, unit, formula, reference, note }: ResultRowProps) {
  return (
    <div className="result-row">
      <div className="result-row-main">
        <span className="result-label">{label}</span>
        <span className="result-value">
          {formatNumber(value)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      {formula && <p className="result-formula">{formula}</p>}
      {reference && <p className="result-reference">source: {reference}</p>}
      {note && <p className="result-note">{note}</p>}
    </div>
  );
}
