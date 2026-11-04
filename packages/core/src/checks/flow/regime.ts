import type { Finding } from "../../types.js";

const FLAT_PLATE_REFERENCE =
  "White, Fluid Mechanics, turbulent flat-plate / 1/7-power-law section (docs/decisions.md #4)";

/**
 * Findings about a valid Re_x value (not an input error). Thresholds and
 * exact boundary semantics per docs/decisions.md #7 and PLAN.md §5:
 * - Re_x < 5e5           -> laminar warning (strict <)
 * - 5e5 <= Re_x < 3e6    -> transitional warning
 * - always               -> flat-plate disclosure note
 */
export function regimeFindings(reynoldsX: number): Finding[] {
  const findings: Finding[] = [];

  if (reynoldsX < 5e5) {
    findings.push({
      severity: "warn",
      title: "Laminar flow regime",
      message: `Re_x = ${reynoldsX.toExponential(5)} is below 5e5.`,
      why: "The turbulent flat-plate correlation used here does not apply to laminar flow.",
      reference: "docs/decisions.md #7",
    });
  } else if (reynoldsX < 3e6) {
    findings.push({
      severity: "warn",
      title: "Transitional flow regime",
      message: `Re_x = ${reynoldsX.toExponential(5)} is between 5e5 and 3e6.`,
      why: "The turbulent correlation's estimate is uncertain in the transitional range.",
      reference: "docs/decisions.md #7",
    });
  }

  findings.push({
    severity: "pass",
    title: "Flat-plate estimate",
    message: "This result uses a turbulent flat-plate estimate.",
    why: "For internal or bluff-body flows, check y+ after the first run; the correlation is not exact for your geometry.",
    reference: FLAT_PLATE_REFERENCE,
  });

  return findings;
}
