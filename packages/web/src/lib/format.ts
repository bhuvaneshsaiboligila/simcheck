// Formatting helpers for displaying physics results. Pure presentation code,
// no physics here — see @simcheck/core for all formulas.

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) {
    return value.toExponential(5);
  }
  return Number(value.toPrecision(6)).toString();
}

export function parseRequiredNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
